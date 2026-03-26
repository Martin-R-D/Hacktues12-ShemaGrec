"""
Near-Crash Detection System  v2.0
===================================
Rules:
  1. Bounding-box overlap  +  center-to-center proximity ratio
  2. Sudden deceleration / velocity drop
  3. Rapid trajectory convergence angle
  4. Path-deviation  — predicted lane vs actual position
  5. Non-vehicle objects (pedestrians, cyclists) rapidly closing on cars

On trigger → publishes a structured JSON event (timestamp, location, cause, severity)
to both stdout and an NDJSON log file so get_rankings.py can consume it.

Requirements:
    pip install ultralytics opencv-python numpy

Usage:
    python near_crash_detector.py --source path/to/video.mp4 --location "CAM_01|51.5074,-0.1278"
    python near_crash_detector.py --source 0 --location "CAM_02|48.8566,2.3522" --save
    python near_crash_detector.py --source video.mp4 --no-show --log-file events.ndjson
"""

import argparse
import collections
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

class Config:
    # Model
    MODEL_WEIGHTS         = "yolov8n.pt"
    CONFIDENCE_THRESHOLD  = 0.40
    IOU_NMS_THRESHOLD     = 0.50
    DEVICE                = "cpu"          # "cuda" | "mps" | "cpu"
    TRACKER               = "bytetrack.yaml"

    # COCO class ids
    VEHICLE_CLASS_IDS     = {2, 3, 5, 7}   # car, motorcycle, bus, truck
    NON_VEHICLE_CLASS_IDS = {0, 1}          # person, bicycle

    # History
    TRACK_HISTORY_FRAMES  = 40

    # ── Rule 1: Overlap + proximity ──────────────────────────────────────
    IOU_ALERT_THRESHOLD         = 0.10
    PROXIMITY_RATIO_THRESHOLD   = 0.60

    # ── Rule 2: Deceleration ─────────────────────────────────────────────
    DECEL_THRESHOLD             = 8.0      # px / frame²  (negative accel)

    # ── Rule 3: Trajectory convergence ───────────────────────────────────
    CONVERGENCE_ANGLE_THRESHOLD = 25.0     # degrees
    MIN_CLOSING_SPEED_PX        = 1.0      # px/frame  (must also be closing)

    # ── Rule 4: Path deviation ────────────────────────────────────────────
    PATH_FIT_MIN_FRAMES         = 12       # need at least N frames to fit a line
    PATH_DEVIATION_THRESHOLD    = 55.0     # px — how far off predicted line counts

    # ── Rule 5: Non-vehicle proximity to cars ─────────────────────────────
    NON_VEH_DISTANCE_DROP_RATIO = 0.40     # distance drops >40 % in N frames
    NON_VEH_WINDOW_FRAMES       = 10       # look-back window for ratio test
    NON_VEH_MAX_DIST_ABS        = 220.0    # only care if within 220 px of a car

    # Alert suppression
    ALERT_COOLDOWN_FRAMES = 15
    MIN_FRAMES_TRACKED    = 5

    # Display
    SHOW_TRACKS     = True
    SHOW_VELOCITIES = True
    FONT            = cv2.FONT_HERSHEY_SIMPLEX


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TrackState:
    track_id : int
    class_id : int = 2
    is_vehicle: bool = True

    centers    : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    boxes      : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    velocities : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))

    # per-track deviation history (for rule 4 smoothing)
    recent_deviations: collections.deque = field(default_factory=lambda: collections.deque(maxlen=5))

    def update(self, box: Tuple):
        x1, y1, x2, y2 = box
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        if self.centers:
            prev = self.centers[-1]
            self.velocities.append((cx - prev[0], cy - prev[1]))
        else:
            self.velocities.append((0.0, 0.0))
        self.centers.append((cx, cy))
        self.boxes.append(box)

    # ── Properties ──────────────────────────────────────────────────────

    @property
    def current_center(self) -> Optional[Tuple]:
        return self.centers[-1] if self.centers else None

    @property
    def current_box(self) -> Optional[Tuple]:
        return self.boxes[-1] if self.boxes else None

    @property
    def current_velocity(self) -> Tuple:
        return self.velocities[-1] if self.velocities else (0.0, 0.0)

    @property
    def speed(self) -> float:
        return float(np.hypot(*self.current_velocity))

    @property
    def acceleration(self) -> float:
        if len(self.velocities) < 2:
            return 0.0
        return float(np.hypot(*self.velocities[-1]) - np.hypot(*self.velocities[-2]))

    @property
    def heading(self) -> Optional[float]:
        if len(self.velocities) < 3:
            return None
        recent = list(self.velocities)[-5:]
        avg_vx = float(np.mean([v[0] for v in recent]))
        avg_vy = float(np.mean([v[1] for v in recent]))
        return float(np.degrees(np.arctan2(avg_vy, avg_vx))) if np.hypot(avg_vx, avg_vy) > 0.5 else None

    @property
    def diagonal(self) -> float:
        if not self.current_box:
            return 1.0
        x1, y1, x2, y2 = self.current_box
        return float(np.hypot(x2 - x1, y2 - y1))

    @property
    def frame_count(self) -> int:
        return len(self.centers)


@dataclass
class NearCrashEvent:
    frame_idx        : int
    timestamp_utc    : str
    camera_id        : str
    camera_lat       : float
    camera_lon       : float
    involved_track_ids: List[int]
    triggered_rules  : List[str]
    severity         : str          # "WARNING" | "CRITICAL"
    iou              : float
    proximity_ratio  : float
    ttc_seconds      : Optional[float]

    def to_dict(self) -> dict:
        return {
            "frame"            : int(self.frame_idx),
            "timestamp_utc"    : self.timestamp_utc,
            "camera_id"        : self.camera_id,
            "camera_lat"       : float(self.camera_lat),
            "camera_lon"       : float(self.camera_lon),
            "involved_tracks"  : [int(t) for t in self.involved_track_ids],
            "triggered_rules"  : self.triggered_rules,
            "severity"         : self.severity,
            "iou"              : round(float(self.iou), 4),
            "proximity_ratio"  : round(float(self.proximity_ratio), 4),
            "ttc_seconds"      : round(float(self.ttc_seconds), 3) if self.ttc_seconds is not None else None,
        }

    def __str__(self):
        rules  = ", ".join(self.triggered_rules)
        ttc_s  = f"{self.ttc_seconds:.2f}s" if self.ttc_seconds is not None else "N/A"
        tracks = "+".join(f"#{t}" for t in self.involved_track_ids)
        return (
            f"[{self.timestamp_utc}] [{self.camera_id}] {self.severity} "
            f"— Tracks {tracks} | Rules: {rules} | "
            f"IoU={self.iou:.3f} Prox={self.proximity_ratio:.2f} TTC={ttc_s}"
        )


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def compute_iou(box_a: Tuple, box_b: Tuple) -> float:
    xa1, ya1, xa2, ya2 = box_a
    xb1, yb1, xb2, yb2 = box_b
    ix1, iy1 = max(xa1, xb1), max(ya1, yb1)
    ix2, iy2 = min(xa2, xb2), min(ya2, yb2)
    inter    = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a   = (xa2 - xa1) * (ya2 - ya1)
    area_b   = (xb2 - xb1) * (yb2 - yb1)
    return inter / (area_a + area_b - inter + 1e-6)


def center_distance(a: TrackState, b: TrackState) -> float:
    ca, cb = a.current_center, b.current_center
    if ca is None or cb is None:
        return float("inf")
    return float(np.hypot(ca[0] - cb[0], ca[1] - cb[1]))


def closing_speed(a: TrackState, b: TrackState) -> float:
    """Positive = approaching each other (px / frame)."""
    n = min(len(a.centers), len(b.centers))
    if n < 3:
        return 0.0
    ca = list(a.centers)[-n:]
    cb = list(b.centers)[-n:]
    dists = [np.hypot(ca[i][0] - cb[i][0], ca[i][1] - cb[i][1]) for i in range(n)]
    slope = float(np.polyfit(range(n), dists, 1)[0])
    return -slope   # negative slope = closing


def compute_ttc(a: TrackState, b: TrackState, fps: float) -> Optional[float]:
    dist  = center_distance(a, b)
    cspd  = closing_speed(a, b)
    if cspd <= 0.5:
        return None
    return (dist / cspd) / fps


def proximity_ratio(a: TrackState, b: TrackState) -> float:
    dist     = center_distance(a, b)
    avg_diag = (a.diagonal + b.diagonal) / 2
    return dist / (avg_diag + 1e-6)


def path_deviation(track: TrackState) -> Optional[float]:
    """
    Fit a line through the N-2 oldest centers, measure how far the
    most recent center lies from that line.  Returns px deviation or None.
    """
    n = len(track.centers)
    if n < Config.PATH_FIT_MIN_FRAMES:
        return None
    pts = np.array(list(track.centers))
    # Fit on all but the last 3 points, measure deviation of the last 3
    fit_pts = pts[:-3]
    test_pt = pts[-1]
    if len(fit_pts) < 2:
        return None
    # Parametric line via PCA (handles vertical lines)
    mean = fit_pts.mean(axis=0)
    centered = fit_pts - mean
    _, _, vt = np.linalg.svd(centered)
    direction = vt[0]          # principal direction
    normal = np.array([-direction[1], direction[0]])
    deviation = float(abs(np.dot(test_pt - mean, normal)))
    return deviation


# ---------------------------------------------------------------------------
# Rule engine
# ---------------------------------------------------------------------------

def evaluate_vehicle_pair(
    t_a: TrackState,
    t_b: TrackState,
    fps: float,
) -> Tuple[List[str], float, float, Optional[float]]:
    """Rules 1, 2, 3 for a vehicle–vehicle pair."""
    triggered: List[str] = []

    iou   = compute_iou(t_a.current_box, t_b.current_box)
    prox  = proximity_ratio(t_a, t_b)
    ttc   = compute_ttc(t_a, t_b, fps)

    # Rule 1a — Box overlap
    if iou >= Config.IOU_ALERT_THRESHOLD:
        triggered.append(f"OVERLAP(IoU={iou:.2f})")

    # Rule 1b — Proximity ratio
    if prox < Config.PROXIMITY_RATIO_THRESHOLD:
        triggered.append(f"PROXIMITY(ratio={prox:.2f})")

    # Rule 2 — Sudden deceleration (either vehicle)
    for t, label in [(t_a, "A"), (t_b, "B")]:
        if t.acceleration < -Config.DECEL_THRESHOLD:
            triggered.append(f"BRAKE_{label}(Δ={t.acceleration:.1f}px/f²)")

    # Rule 3 — Trajectory convergence
    ha, hb = t_a.heading, t_b.heading
    if ha is not None and hb is not None:
        angle_diff = abs((ha - hb + 180) % 360 - 180)
        cspd = closing_speed(t_a, t_b)
        if angle_diff < Config.CONVERGENCE_ANGLE_THRESHOLD and cspd > Config.MIN_CLOSING_SPEED_PX:
            triggered.append(f"CONVERGE(Δangle={angle_diff:.0f}°,cspd={cspd:.1f})")

    return triggered, iou, prox, ttc


def evaluate_path_deviation(track: TrackState) -> List[str]:
    """Rule 4 — single-vehicle path deviation."""
    dev = path_deviation(track)
    if dev is None:
        return []
    track.recent_deviations.append(dev)
    # Require 3 consecutive high-deviation frames to reduce noise
    if (len(track.recent_deviations) >= 3
            and sum(1 for d in track.recent_deviations if d > Config.PATH_DEVIATION_THRESHOLD) >= 3):
        return [f"PATH_DEV(dev={dev:.0f}px)"]
    return []


def evaluate_nonvehicle_proximity(
    nonveh: TrackState,
    car: TrackState,
) -> List[str]:
    """Rule 5 — pedestrian / cyclist closing on a car rapidly."""
    triggered: List[str] = []
    n = min(len(nonveh.centers), len(car.centers), Config.NON_VEH_WINDOW_FRAMES)
    if n < 4:
        return triggered

    dist_now = center_distance(nonveh, car)
    if dist_now > Config.NON_VEH_MAX_DIST_ABS:
        return triggered

    # Distance N frames ago
    cn_old = list(nonveh.centers)[-n]
    cc_old = list(car.centers)[-n]
    dist_old = float(np.hypot(cn_old[0] - cc_old[0], cn_old[1] - cc_old[1]))

    if dist_old < 1.0:
        return triggered

    ratio = (dist_old - dist_now) / dist_old   # positive = closed in
    if ratio > Config.NON_VEH_DISTANCE_DROP_RATIO:
        label = "PERSON" if nonveh.class_id == 0 else "CYCLIST"
        triggered.append(f"NONVEH_{label}_CLOSE(Δ={ratio*100:.0f}%,d={dist_now:.0f}px)")

    return triggered


# ---------------------------------------------------------------------------
# Numpy-safe JSON encoder  (int64 / float32 etc. from YOLO are not serialisable
# by the stdlib encoder; this subclass handles them transparently)
# ---------------------------------------------------------------------------

class _NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


# ---------------------------------------------------------------------------
# Event publisher
# ---------------------------------------------------------------------------

class EventPublisher:
    def __init__(self, log_path: Optional[str], camera_id: str, lat: float, lon: float):
        self.camera_id = camera_id
        self.lat       = lat
        self.lon       = lon
        self._fp       = open(log_path, "a", encoding="utf-8") if log_path else None

    def publish(self, evt: NearCrashEvent):
        print(f"  🚨 EVENT  {evt}")
        if self._fp:
            self._fp.write(json.dumps(evt.to_dict(), cls=_NumpyEncoder) + "\n")
            self._fp.flush()

    def close(self):
        if self._fp:
            self._fp.close()


# ---------------------------------------------------------------------------
# Main detector
# ---------------------------------------------------------------------------

class NearCrashDetector:

    def __init__(
        self,
        source     : str,
        camera_id  : str  = "CAM_00",
        lat        : float = 0.0,
        lon        : float = 0.0,
        log_file   : Optional[str] = None,
        save_output: bool = False,
        show       : bool = True,
    ):
        self.source      = source
        self.show        = show
        self.save_output = save_output

        print(f"[INFO] Loading {Config.MODEL_WEIGHTS}…")
        self.model = YOLO(Config.MODEL_WEIGHTS)

        self.tracks         : Dict[int, TrackState]       = {}
        self.events         : List[NearCrashEvent]        = []
        self.alert_cooldowns: Dict[Tuple[int,int], int]   = {}

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
                self.fps, (self.width, self.height)
            )
            print(f"[INFO] Saving output → {out_path}")

        # Running stats for get_rankings consumer
        self.total_vehicles_seen: set = set()   # track IDs (unique vehicles)

    # ── Main loop ─────────────────────────────────────────────────────────

    def run(self):
        print(f"[INFO] Camera: {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print("[INFO] Running … press 'q' to quit.")
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
              f"({self.frame_idx/elapsed:.1f} FPS avg)")
        self._print_summary()
        self._cleanup()

    # ── Per-frame logic ───────────────────────────────────────────────────

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        all_class_ids = list(Config.VEHICLE_CLASS_IDS | Config.NON_VEHICLE_CLASS_IDS)

        results = self.model.track(
            frame,
            persist   = True,
            tracker   = Config.TRACKER,
            conf      = Config.CONFIDENCE_THRESHOLD,
            iou       = Config.IOU_NMS_THRESHOLD,
            classes   = all_class_ids,
            device    = Config.DEVICE,
            verbose   = False,
        )

        # Update tracks
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

        # Filter by minimum frames
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
                pair_key = (min(id_a, id_b), max(id_a, id_b))

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
        for tid in active_veh:
            t = self.tracks[tid]
            path_triggers = evaluate_path_deviation(t)
            if path_triggers:
                pair_key = (tid, -1)
                if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                    continue
                evt = self._make_event([tid], path_triggers, 0.0,
                                       proximity_ratio(t, t) if False else 0.0, None)
                frame_events.append(evt)
                self.events.append(evt)
                self.alert_cooldowns[pair_key] = self.frame_idx
                self.publisher.publish(evt)

        # ── Rule 5  (non-vehicle → car proximity) ─────────────────────
        for nv_id in active_nonveh:
            nv = self.tracks[nv_id]
            for veh_id in active_veh:
                veh = self.tracks[veh_id]
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
        track_ids : List[int],
        triggered : List[str],
        iou       : float,
        prox      : float,
        ttc       : Optional[float],
    ) -> NearCrashEvent:
        severity = "CRITICAL" if len(triggered) >= 2 else "WARNING"
        return NearCrashEvent(
            frame_idx         = self.frame_idx,
            timestamp_utc     = datetime.now(timezone.utc).isoformat(),
            camera_id         = self.publisher.camera_id,
            camera_lat        = self.publisher.lat,
            camera_lon        = self.publisher.lon,
            involved_track_ids= track_ids,
            triggered_rules   = triggered,
            severity          = severity,
            iou               = iou,
            proximity_ratio   = prox,
            ttc_seconds       = ttc,
        )

    # ── Annotation ────────────────────────────────────────────────────────

    def _annotate(
        self,
        frame      : np.ndarray,
        active_ids : set,
        events     : List[NearCrashEvent],
    ) -> np.ndarray:
        out = frame.copy()
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
                color = (255, 165, 0)     # orange for pedestrians/cyclists

            thick = 3 if is_alert else 2
            cv2.rectangle(out, (x1, y1), (x2, y2), color, thick)

            label = f"#{tid}"
            if Config.SHOW_VELOCITIES and is_vehicle:
                label += f" {t.speed:.1f}px/f"
            cv2.putText(out, label, (x1, y1 - 7), Config.FONT, 0.52, color, thick)

            # Trajectory tail
            if Config.SHOW_TRACKS and len(t.centers) > 1:
                pts = np.array(list(t.centers), dtype=np.int32)
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    c = tuple(int(v * alpha) for v in color)
                    cv2.line(out, tuple(pts[k-1]), tuple(pts[k]), c, 1)

            # Path deviation: draw predicted line extension
            dev = path_deviation(t)
            if dev is not None and dev > Config.PATH_DEVIATION_THRESHOLD * 0.7:
                n_fit = len(t.centers)
                if n_fit >= Config.PATH_FIT_MIN_FRAMES:
                    pts_arr = np.array(list(t.centers))
                    mean    = pts_arr[:-3].mean(axis=0)
                    centered = pts_arr[:-3] - mean
                    _, _, vt = np.linalg.svd(centered)
                    direction = vt[0]
                    p1 = (mean - direction * 60).astype(int)
                    p2 = (mean + direction * 60).astype(int)
                    cv2.line(out, tuple(p1), tuple(p2), (0, 200, 255), 1, cv2.LINE_AA)
                    cv2.putText(out, f"dev {dev:.0f}px", (x1, y2 + 14),
                                Config.FONT, 0.45, (0, 200, 255), 1)

        # Event banners
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
        print("\n" + "=" * 65)
        print(f"SUMMARY — {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print(f"  Frames processed : {self.frame_idx}")
        print(f"  Unique vehicles  : {len(self.total_vehicles_seen)}")
        print(f"  Total events     : {len(self.events)}")
        crit = sum(1 for e in self.events if e.severity == "CRITICAL")
        warn = sum(1 for e in self.events if e.severity == "WARNING")
        print(f"    CRITICAL       : {crit}")
        print(f"    WARNING        : {warn}")
        print("=" * 65)

    def _cleanup(self):
        self.cap.release()
        if self.writer:
            self.writer.release()
        cv2.destroyAllWindows()
        self.publisher.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Near-Crash Detector v2.0")
    p.add_argument("--source",    required=True,
                   help="Video file, image dir, or '0' for webcam")
    p.add_argument("--location",  default="CAM_00|0.0,0.0",
                   help="Camera label and GPS: 'CAM_01|51.5074,-0.1278'")
    p.add_argument("--log-file",  default="events.ndjson",
                   help="Path to NDJSON event log (appended to)")
    p.add_argument("--save",      action="store_true",
                   help="Save annotated output video")
    p.add_argument("--no-show",   action="store_true",
                   help="Disable live window (headless)")
    return p.parse_args()


if __name__ == "__main__":
    args   = parse_args()
    cam_id, coords = args.location.split("|")
    lat_s,  lon_s  = coords.split(",")

    detector = NearCrashDetector(
        source      = args.source,
        camera_id   = cam_id.strip(),
        lat         = float(lat_s),
        lon         = float(lon_s),
        log_file    = args.log_file,
        save_output = args.save,
        show        = not args.no_show,
    )
    detector.run()