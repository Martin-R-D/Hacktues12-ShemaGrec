import math
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
        self.display_events : List[Tuple[int, NearCrashEvent]] = []  # (frame_detected, event)

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
                cv2.imshow("Alert Monitor", self._render_alert_panel())
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

        # Register new events for sustained display
        for evt in frame_events:
            self.display_events.append((self.frame_idx, evt))

        # Expire old display events
        self.display_events = [
            (f, e) for f, e in self.display_events
            if self.frame_idx - f < Config.ALERT_DISPLAY_FRAMES
        ]

        return self._annotate(frame, active_ids, [e for _, e in self.display_events])

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

    # ── Drawing helpers ───────────────────────────────────────────────────

    @staticmethod
    def _draw_corners(img, x1, y1, x2, y2, color, thickness=2, ratio=0.28):
        """Corner-bracket HUD-style box instead of a full rectangle."""
        lx = max(8, int((x2 - x1) * ratio))
        ly = max(8, int((y2 - y1) * ratio))
        for p0, corner, p1 in [
            ((x1, y1 + ly), (x1, y1),  (x1 + lx, y1)),
            ((x2 - lx, y1), (x2, y1),  (x2, y1 + ly)),
            ((x1, y2 - ly), (x1, y2),  (x1 + lx, y2)),
            ((x2 - lx, y2), (x2, y2),  (x2, y2 - ly)),
        ]:
            cv2.line(img, p0, corner, color, thickness, cv2.LINE_AA)
            cv2.line(img, corner, p1,  color, thickness, cv2.LINE_AA)

    @staticmethod
    def _draw_label_chip(img, text, x, y, color, scale=0.50, thickness=1):
        """Text label on a semi-transparent dark pill with a colored underline."""
        (tw, th), bl = cv2.getTextSize(text, Config.FONT, scale, thickness)
        pad = 3
        overlay = img.copy()
        cv2.rectangle(overlay, (x - pad, y - th - pad), (x + tw + pad, y + bl), (8, 8, 20), -1)
        cv2.addWeighted(overlay, 0.72, img, 0.28, 0, img)
        cv2.line(img, (x - pad, y + bl), (x + tw + pad, y + bl), color, 1, cv2.LINE_AA)
        cv2.putText(img, text, (x, y), Config.FONT, scale, color, thickness, cv2.LINE_AA)

    # ── Annotation ────────────────────────────────────────────────────────

    def _annotate(
        self,
        frame     : np.ndarray,
        active_ids: set,
        events    : List[NearCrashEvent],
    ) -> np.ndarray:
        out       = frame.copy()
        alert_ids = {tid for e in events for tid in e.involved_track_ids}
        pulse     = 0.5 + 0.5 * math.sin(self.frame_idx * 0.15)

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
                color = (0, 0, int(200 + 55 * pulse))
            elif is_vehicle:
                color = (0, 230, 80)
            else:
                color = (255, 140, 0)

            # Fading track trail
            if Config.SHOW_TRACKS and len(t.centers) > 1:
                pts = np.array(list(t.centers), dtype=np.int32)
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    c = tuple(int(v * alpha) for v in color)
                    cv2.line(out, tuple(pts[k - 1]), tuple(pts[k]), c, 1, cv2.LINE_AA)

            # Glow layer for alert boxes (blurred bright outline added to frame)
            if is_alert:
                glow_layer = np.zeros_like(out)
                self._draw_corners(glow_layer, x1, y1, x2, y2, color, 4)
                glow_layer = cv2.GaussianBlur(glow_layer, (21, 21), 0)
                out = cv2.add(out, glow_layer)
                # Pulsing semi-transparent fill
                overlay = out.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                fill_alpha = 0.04 + 0.04 * pulse
                cv2.addWeighted(overlay, fill_alpha, out, 1.0 - fill_alpha, 0, out)

            # Corner-bracket box
            self._draw_corners(out, x1, y1, x2, y2, color, 2)

            # Label chip
            label = f"ID:{tid}"
            if Config.SHOW_VELOCITIES and is_vehicle:
                label += f"  {t.speed:.1f}px/f"
            self._draw_label_chip(out, label, x1, y1 - 8, color)

            # Path deviation indicator
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
                    cv2.line(out, tuple(p1), tuple(p2), (0, 220, 255), 1, cv2.LINE_AA)
                    self._draw_label_chip(out, f"dev {dev:.0f}px", x1, y2 + 18,
                                          (0, 220, 255), scale=0.42)

        # Frame / event HUD chip (bottom-right)
        hud = f"FRAME {self.frame_idx:05d}  |  EVT {len(self.events):03d}"
        (hw, hh), _ = cv2.getTextSize(hud, Config.FONT, 0.44, 1)
        hx = self.width - hw - 10
        hy = self.height - 10
        overlay = out.copy()
        cv2.rectangle(overlay, (hx - 6, hy - hh - 4), (self.width - 4, hy + 4), (5, 5, 18), -1)
        cv2.addWeighted(overlay, 0.72, out, 0.28, 0, out)
        cv2.putText(out, hud, (hx, hy), Config.FONT, 0.44, (100, 200, 255), 1, cv2.LINE_AA)

        return out

    # ── Alert panel (separate window) ────────────────────────────────────

    def _render_alert_panel(self) -> np.ndarray:
        panel_w  = 500
        row_h    = 32
        header_h = 44
        footer_h = 30

        seen_pairs: dict = {}
        for _, evt in reversed(self.display_events):
            key = tuple(sorted(evt.involved_track_ids))
            if key not in seen_pairs:
                seen_pairs[key] = evt
        unique_events = list(reversed(list(seen_pairs.values())))

        n       = max(1, len(unique_events))
        panel_h = header_h + n * row_h + footer_h + 8

        panel = np.full((panel_h, panel_w, 3), (10, 10, 25), dtype=np.uint8)
        pulse = 0.5 + 0.5 * math.sin(self.frame_idx * 0.15)

        # Header
        cv2.rectangle(panel, (0, 0), (panel_w, header_h), (15, 15, 40), -1)
        cv2.line(panel, (0, header_h), (panel_w, header_h), (40, 40, 100), 1)
        cv2.putText(panel, "NEAR-CRASH ALERT MONITOR", (12, 28),
                    Config.FONT, 0.65, (100, 200, 255), 1, cv2.LINE_AA)

        if not unique_events:
            cv2.putText(panel, "No active alerts", (12, header_h + 22),
                        Config.FONT, 0.55, (50, 120, 50), 1, cv2.LINE_AA)
        else:
            for idx, evt in enumerate(unique_events):
                y      = header_h + 4 + idx * row_h
                is_crit = evt.severity == "CRITICAL"
                accent  = (0, 0, 220) if is_crit else (30, 80, 220)
                row_bg  = (25, 5, 5)  if is_crit else (5, 10, 28)
                cv2.rectangle(panel, (0, y), (panel_w, y + row_h - 2), row_bg, -1)
                cv2.rectangle(panel, (0, y + 2), (4, y + row_h - 4), accent, -1)
                tracks_str = "+".join(f"#{t}" for t in evt.involved_track_ids)
                rules_str  = evt.triggered_rules[0] if evt.triggered_rules else ""
                banner     = f"{evt.severity}  {tracks_str}  {rules_str}"
                r_val      = int(155 + 100 * pulse) if is_crit else 210
                text_color = (70, 70, r_val) if is_crit else (70, 120, 210)
                cv2.putText(panel, banner, (12, y + 22),
                            Config.FONT, 0.60, text_color, 1, cv2.LINE_AA)

        # Footer
        footer_y = panel_h - footer_h
        cv2.line(panel, (0, footer_y), (panel_w, footer_y), (40, 40, 100), 1)
        cv2.putText(panel, f"FRAME {self.frame_idx:05d}  |  TOTAL EVENTS {len(self.events):03d}",
                    (12, panel_h - 10), Config.FONT, 0.44, (80, 140, 200), 1, cv2.LINE_AA)

        return panel

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
