import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from config import Config
from models import TrackState, NearCrashEvent
from rules import (
    evaluate_vehicle_pair, evaluate_path_deviation,
    evaluate_nonvehicle_proximity, active_factors,
)
from geometry import center_distance, path_deviation, set_homography, Homography
from publisher import EventPublisher


class NearCrashDetector:
    def __init__(
        self,
        source     : str,
        camera_id  : str   = "CAM_00",
        lat        : float = 0.0,
        lon        : float = 0.0,
        log_file   : Optional[str] = None,
        save_output: bool  = False,
        show       : bool  = True,
    ):
        self.source      = source
        self.show        = show
        self.save_output = save_output

        print(f"[INFO] Loading {Config.MODEL_WEIGHTS}...")
        self.model = YOLO(Config.MODEL_WEIGHTS)

        self.tracks         : Dict[int, TrackState]     = {}
        self.events         : List[NearCrashEvent]      = []
        self.alert_cooldowns: Dict[Tuple[int, int], int] = {}

        self.publisher = EventPublisher(log_file, camera_id, lat, lon)

        self.cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open source: {source}")

        self.fps    = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.width  = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.frame_idx = 0

        self.writer: Optional[cv2.VideoWriter] = None
        if save_output:
            stem = Path(source).stem if not source.isdigit() else "output"
            out_path = f"{stem}_near_crash.mp4"
            self.writer = cv2.VideoWriter(
                out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                self.fps, (self.width, self.height),
            )
            print(f"[INFO] Saving output -> {out_path}")

        self.total_vehicles_seen: set = set()

        if Config.CALIBRATION_POINTS:
            set_homography(Homography(
                Config.CALIBRATION_POINTS["pixel"],
                Config.CALIBRATION_POINTS["world"],
            ))
            print("[INFO] Bird's-eye calibration active — distances in metres.")

    # ── Main loop ─────────────────────────────────────────────────────────

    def run(self):
        print(f"[INFO] Camera: {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print(f"[INFO] Active factors: {', '.join(active_factors()) or 'none'}")
        print("[INFO] Running ... press 'q' to quit.")
        t0 = time.time()

        while True:
            ret, frame = self.cap.read()
            if not ret:
                break
            self.frame_idx += 1
            annotated = self._process_frame(frame)
            if self.writer:
                self.writer.write(annotated)
            if self.show:
                cv2.imshow("Near-Crash Detector", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

        elapsed = time.time() - t0
        print(f"\n[INFO] {self.frame_idx} frames in {elapsed:.1f}s "
              f"({self.frame_idx / max(elapsed, 0.001):.1f} FPS avg)")
        self._print_summary()
        self._cleanup()

    # ── Per-frame logic ───────────────────────────────────────────────────

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        all_class_ids = list(Config.VEHICLE_CLASS_IDS | Config.NON_VEHICLE_CLASS_IDS)

        results = self.model.track(
            frame,
            persist = True,
            tracker = Config.TRACKER,
            conf    = Config.CONFIDENCE_THRESHOLD,
            iou     = Config.IOU_NMS_THRESHOLD,
            classes = all_class_ids,
            device  = Config.DEVICE,
            verbose = False,
        )

        active_ids: set = set()
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            ids   = results[0].boxes.id.cpu().numpy().astype(int)
            clses = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, cls in zip(boxes, ids, clses):
                active_ids.add(tid)
                is_veh = int(cls) in Config.VEHICLE_CLASS_IDS
                if tid not in self.tracks:
                    self.tracks[tid] = TrackState(track_id=tid, class_id=int(cls), is_vehicle=is_veh)
                self.tracks[tid].update(tuple(box))
                if is_veh:
                    self.total_vehicles_seen.add(tid)

        frame_events: List[NearCrashEvent] = []

        active_veh = [
            tid for tid in active_ids
            if tid in self.tracks
            and self.tracks[tid].is_vehicle
            and self.tracks[tid].frame_count >= Config.MIN_FRAMES_TRACKED
        ]
        active_nonveh = [
            tid for tid in active_ids
            if tid in self.tracks
            and not self.tracks[tid].is_vehicle
            and self.tracks[tid].frame_count >= Config.MIN_FRAMES_TRACKED
        ]

        # ── Rules 1-3  (vehicle pairs) ─────────────────────────────────
        for i in range(len(active_veh)):
            for j in range(i + 1, len(active_veh)):
                id_a, id_b = active_veh[i], active_veh[j]
                pair_key   = (min(id_a, id_b), max(id_a, id_b))

                if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                    continue

                t_a, t_b = self.tracks[id_a], self.tracks[id_b]
                triggered, iou, prox, ttc = evaluate_vehicle_pair(t_a, t_b, self.fps)

                if triggered:
                    evt = self._make_event([id_a, id_b], triggered, iou, prox, ttc)
                    frame_events.append(evt)
                    self.events.append(evt)
                    self.alert_cooldowns[pair_key] = self.frame_idx
                    self.publisher.publish(evt)

        # ── Rule 4  (path deviation, per vehicle) ─────────────────────
        if Config.ENABLE_PATH_DEVIATION:
            for tid in active_veh:
                t = self.tracks[tid]
                path_triggers = evaluate_path_deviation(t)
                if path_triggers:
                    pair_key = (tid, -1)
                    if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                        continue
                    evt = self._make_event([tid], path_triggers, 0.0, 0.0, None)
                    frame_events.append(evt)
                    self.events.append(evt)
                    self.alert_cooldowns[pair_key] = self.frame_idx
                    self.publisher.publish(evt)

        # ── Rule 5  (non-vehicle -> car proximity) ────────────────────
        if Config.ENABLE_NONVEH_PROXIMITY:
            for nv_id in active_nonveh:
                nv = self.tracks[nv_id]
                for veh_id in active_veh:
                    veh      = self.tracks[veh_id]
                    pair_key = (min(nv_id, veh_id), max(nv_id, veh_id))
                    if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                        continue
                    nv_triggers = evaluate_nonvehicle_proximity(nv, veh)
                    if nv_triggers:
                        dist = center_distance(nv, veh)
                        prox = dist / ((nv.diagonal + veh.diagonal) / 2 + 1e-6)
                        evt  = self._make_event([nv_id, veh_id], nv_triggers, 0.0, prox, None)
                        frame_events.append(evt)
                        self.events.append(evt)
                        self.alert_cooldowns[pair_key] = self.frame_idx
                        self.publisher.publish(evt)

        return self._annotate(frame, active_ids, frame_events)

    # ── Event factory ─────────────────────────────────────────────────────

    def _make_event(
        self,
        track_ids: List[int],
        triggered: List[str],
        iou      : float,
        prox     : float,
        ttc      : Optional[float],
    ) -> NearCrashEvent:
        severity = "CRITICAL" if len(triggered) >= 2 else "WARNING"
        return NearCrashEvent(
            frame_idx          = self.frame_idx,
            timestamp_utc      = datetime.now(timezone.utc).isoformat(),
            camera_id          = self.publisher.camera_id,
            camera_lat         = self.publisher.lat,
            camera_lon         = self.publisher.lon,
            involved_track_ids = track_ids,
            triggered_rules    = triggered,
            severity           = severity,
            iou                = iou,
            proximity_ratio    = prox,
            ttc_seconds        = ttc,
        )

    # ── Annotation ────────────────────────────────────────────────────────

    def _annotate(
        self,
        frame     : np.ndarray,
        active_ids: set,
        events    : List[NearCrashEvent],
    ) -> np.ndarray:
        out       = frame.copy()
        alert_ids = {tid for e in events for tid in e.involved_track_ids}

        for tid in active_ids:
            if tid not in self.tracks:
                continue
            t = self.tracks[tid]
            if not t.current_box:
                continue

            x1, y1, x2, y2 = (int(v) for v in t.current_box)
            is_alert   = tid in alert_ids
            is_vehicle = t.is_vehicle

            if is_alert:
                color = (0, 0, 255)
            elif is_vehicle:
                color = (0, 210, 60)
            else:
                color = (255, 165, 0)

            thick = 3 if is_alert else 2
            cv2.rectangle(out, (x1, y1), (x2, y2), color, thick)

            label = f"#{tid}"
            if Config.SHOW_VELOCITIES and is_vehicle:
                label += f" {t.speed:.1f}px/f"
            cv2.putText(out, label, (x1, y1 - 7), Config.FONT, 0.52, color, thick)

            if Config.SHOW_TRACKS and len(t.centers) > 1:
                pts = np.array(list(t.centers), dtype=np.int32)
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    c = tuple(int(v * alpha) for v in color)
                    cv2.line(out, tuple(pts[k-1]), tuple(pts[k]), c, 1)

            dev = path_deviation(t) if Config.ENABLE_PATH_DEVIATION else None
            if dev is not None and dev > Config.PATH_DEVIATION_THRESHOLD * 0.7:
                n_fit = len(t.centers)
                if n_fit >= Config.PATH_FIT_MIN_FRAMES:
                    pts_arr   = np.array(list(t.centers))
                    mean      = pts_arr[:-3].mean(axis=0)
                    centered  = pts_arr[:-3] - mean
                    _, _, vt  = np.linalg.svd(centered)
                    direction = vt[0]
                    p1 = (mean - direction * 60).astype(int)
                    p2 = (mean + direction * 60).astype(int)
                    cv2.line(out, tuple(p1), tuple(p2), (0, 200, 255), 1, cv2.LINE_AA)
                    cv2.putText(out, f"dev {dev:.0f}px", (x1, y2 + 14),
                                Config.FONT, 0.45, (0, 200, 255), 1)

        for idx, evt in enumerate(events):
            for tid in evt.involved_track_ids:
                if tid not in self.tracks or not self.tracks[tid].current_box:
                    continue
                x1, y1, x2, y2 = (int(v) for v in self.tracks[tid].current_box)
                if evt.severity == "CRITICAL":
                    cv2.rectangle(out, (x1-4, y1-4), (x2+4, y2+4), (0, 0, 255), 4)

            banner_color = (0, 0, 200) if evt.severity == "CRITICAL" else (30, 80, 220)
            tracks_str   = "+".join(f"#{t}" for t in evt.involved_track_ids)
            rules_str    = evt.triggered_rules[0] if evt.triggered_rules else ""
            banner       = f"{evt.severity}  {tracks_str}  {rules_str}"
            cv2.putText(out, banner, (10, 30 + 26 * idx),
                        Config.FONT, 0.7, banner_color, 2)

        cv2.putText(out, f"Frame {self.frame_idx} | Events: {len(self.events)}",
                    (self.width - 260, self.height - 12),
                    Config.FONT, 0.5, (180, 180, 180), 1)
        return out

    # ── Summary + cleanup ─────────────────────────────────────────────────

    def _print_summary(self):
        total_weight = sum(e.risk_weight for e in self.events)
        print("\n" + "=" * 65)
        print(f"SUMMARY  {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print(f"  Frames processed : {self.frame_idx}")
        print(f"  Unique vehicles  : {len(self.total_vehicles_seen)}")
        print(f"  Total events     : {len(self.events)}")
        crit = sum(1 for e in self.events if e.severity == "CRITICAL")
        warn = sum(1 for e in self.events if e.severity == "WARNING")
        print(f"    CRITICAL       : {crit}")
        print(f"    WARNING        : {warn}")
        print(f"  Total risk_weight: {total_weight}")
        print("=" * 65)

    def _cleanup(self):
        self.cap.release()
        if self.writer:
            self.writer.release()
        cv2.destroyAllWindows()
        self.publisher.close()
