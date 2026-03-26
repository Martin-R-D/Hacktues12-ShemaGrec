"""
Near-Crash Detection System
============================
Uses YOLOv8 (with ByteTrack) + OpenCV to analyze vehicle footage
and flag near-crash events using hardcoded rule-based logic.

Requirements:
    pip install ultralytics opencv-python numpy

Usage:
    python near_crash_detector.py --source path/to/video.mp4
    python near_crash_detector.py --source 0          # webcam
    python near_crash_detector.py --source video.mp4 --save  # save annotated output
"""

import argparse
import collections
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO


# ---------------------------------------------------------------------------
# Configuration — tweak these thresholds to tune sensitivity
# ---------------------------------------------------------------------------

class Config:
    # --- Model ---
    MODEL_WEIGHTS = "yolov8n.pt"          # yolov8n/s/m/l/x — tradeoff speed vs accuracy
    CONFIDENCE_THRESHOLD = 0.4
    IOU_NMS_THRESHOLD = 0.5
    DEVICE = "cpu"                         # "cpu" | "cuda" | "mps"

    # --- Tracker ---
    TRACKER = "bytetrack.yaml"             # built-in Ultralytics tracker config

    # --- Vehicle classes (COCO dataset IDs) ---
    VEHICLE_CLASS_IDS = {2, 3, 5, 7}       # car, motorcycle, bus, truck

    # --- History ---
    TRACK_HISTORY_FRAMES = 30              # how many past frames to keep per track

    # --- Near-crash rules (ALL conditions evaluated independently) ---

    # Rule 1: Bounding box overlap
    IOU_ALERT_THRESHOLD = 0.10             # boxes overlap by ≥10% → alert

    # Rule 2: Center-to-center proximity ratio
    # distance(centers) / avg(diagonal) < threshold → vehicles are dangerously close
    PROXIMITY_RATIO_THRESHOLD = 0.60

    # Rule 3: Time-to-Collision (seconds)
    # TTC = current_distance / closing_speed  →  TTC < threshold → imminent collision
    TTC_ALERT_THRESHOLD = 1.5              # seconds

    # Rule 4: Sudden deceleration of a tracked vehicle (pixels/frame² change)
    DECEL_THRESHOLD = 8.0                  # px/frame² — abrupt braking

    # Rule 5: Rapid trajectory convergence angle (degrees)
    CONVERGENCE_ANGLE_THRESHOLD = 25.0    # heading difference below this + closing = alert

    # --- Alert suppression ---
    ALERT_COOLDOWN_FRAMES = 15            # min frames between repeated alerts for same pair
    MIN_FRAMES_TRACKED = 5               # ignore tracks with fewer frames (spurious detections)

    # --- Display ---
    SHOW_TRACKS = True
    SHOW_VELOCITIES = True
    FONT = cv2.FONT_HERSHEY_SIMPLEX


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TrackState:
    """Rolling state for one tracked vehicle."""
    track_id: int
    centers: collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    boxes: collections.deque   = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    velocities: collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    class_id: int = 2

    def update(self, box: Tuple[float, float, float, float]):
        """box = (x1, y1, x2, y2)"""
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        center = (cx, cy)

        if self.centers:
            prev = self.centers[-1]
            vx = cx - prev[0]
            vy = cy - prev[1]
            self.velocities.append((vx, vy))
        else:
            self.velocities.append((0.0, 0.0))

        self.centers.append(center)
        self.boxes.append(box)

    @property
    def current_center(self) -> Optional[Tuple[float, float]]:
        return self.centers[-1] if self.centers else None

    @property
    def current_box(self) -> Optional[Tuple[float, float, float, float]]:
        return self.boxes[-1] if self.boxes else None

    @property
    def current_velocity(self) -> Tuple[float, float]:
        return self.velocities[-1] if self.velocities else (0.0, 0.0)

    @property
    def speed(self) -> float:
        vx, vy = self.current_velocity
        return np.hypot(vx, vy)

    @property
    def acceleration(self) -> float:
        """Signed magnitude change in speed over last two frames (px/frame²)."""
        if len(self.velocities) < 2:
            return 0.0
        spd_now  = np.hypot(*self.velocities[-1])
        spd_prev = np.hypot(*self.velocities[-2])
        return spd_now - spd_prev

    @property
    def heading(self) -> Optional[float]:
        """Direction of travel in degrees (0° = right, 90° = down)."""
        if len(self.velocities) < 2:
            return None
        # Average last few velocities for stability
        recent = list(self.velocities)[-5:]
        avg_vx = np.mean([v[0] for v in recent])
        avg_vy = np.mean([v[1] for v in recent])
        if np.hypot(avg_vx, avg_vy) < 0.5:
            return None
        return float(np.degrees(np.arctan2(avg_vy, avg_vx)))

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
    frame_idx: int
    track_id_a: int
    track_id_b: int
    triggered_rules: List[str]
    severity: str          # "WARNING" | "CRITICAL"
    iou: float
    proximity_ratio: float
    ttc: Optional[float]

    def __str__(self):
        rules = ", ".join(self.triggered_rules)
        ttc_str = f"{self.ttc:.2f}s" if self.ttc is not None else "N/A"
        return (
            f"[Frame {self.frame_idx}] {self.severity} — "
            f"Tracks ({self.track_id_a}, {self.track_id_b}) | "
            f"Rules: {rules} | IoU={self.iou:.3f} "
            f"Prox={self.proximity_ratio:.2f} TTC={ttc_str}"
        )


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def compute_iou(box_a: Tuple, box_b: Tuple) -> float:
    """Compute IoU between two boxes (x1,y1,x2,y2)."""
    xa1, ya1, xa2, ya2 = box_a
    xb1, yb1, xb2, yb2 = box_b

    inter_x1 = max(xa1, xb1)
    inter_y1 = max(ya1, yb1)
    inter_x2 = min(xa2, xb2)
    inter_y2 = min(ya2, yb2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = (xa2 - xa1) * (ya2 - ya1)
    area_b = (xb2 - xb1) * (yb2 - yb1)
    union_area = area_a + area_b - inter_area

    return inter_area / (union_area + 1e-6)


def center_distance(t_a: TrackState, t_b: TrackState) -> float:
    ca, cb = t_a.current_center, t_b.current_center
    if ca is None or cb is None:
        return float("inf")
    return float(np.hypot(ca[0] - cb[0], ca[1] - cb[1]))


def closing_speed(t_a: TrackState, t_b: TrackState) -> float:
    """
    Positive = vehicles moving toward each other (px/frame).
    Computed as the rate of change of their distance over the last N frames.
    """
    min_len = min(len(t_a.centers), len(t_b.centers))
    if min_len < 3:
        return 0.0

    centers_a = list(t_a.centers)[-min_len:]
    centers_b = list(t_b.centers)[-min_len:]

    distances = [
        np.hypot(centers_a[i][0] - centers_b[i][0],
                 centers_a[i][1] - centers_b[i][1])
        for i in range(min_len)
    ]
    # Negative slope = closing in; return positive for closing
    dists_arr = np.array(distances)
    slope = np.polyfit(range(min_len), dists_arr, 1)[0]
    return float(-slope)   # positive = approaching


def compute_ttc(t_a: TrackState, t_b: TrackState) -> Optional[float]:
    """Time-to-Collision in frames (divide by FPS for seconds)."""
    dist = center_distance(t_a, t_b)
    cspeed = closing_speed(t_a, t_b)
    if cspeed <= 0.5:          # not converging
        return None
    return dist / cspeed


def proximity_ratio(t_a: TrackState, t_b: TrackState) -> float:
    """center distance / average diagonal — scale-invariant closeness."""
    dist = center_distance(t_a, t_b)
    avg_diag = (t_a.diagonal + t_b.diagonal) / 2
    return dist / (avg_diag + 1e-6)


# ---------------------------------------------------------------------------
# Rule engine
# ---------------------------------------------------------------------------

def evaluate_rules(
    t_a: TrackState,
    t_b: TrackState,
    fps: float = 30.0
) -> Tuple[List[str], float, float, Optional[float]]:
    """
    Evaluate all near-crash rules for a pair of tracks.

    Returns:
        triggered_rules: list of rule names that fired
        iou: computed IoU
        prox: proximity ratio
        ttc_seconds: TTC in seconds (or None)
    """
    triggered = []

    iou  = compute_iou(t_a.current_box, t_b.current_box)
    prox = proximity_ratio(t_a, t_b)
    ttc_frames = compute_ttc(t_a, t_b)
    ttc_seconds = (ttc_frames / fps) if ttc_frames is not None else None

    # Rule 1 — Bounding box overlap
    if iou >= Config.IOU_ALERT_THRESHOLD:
        triggered.append(f"OVERLAP(IoU={iou:.2f})")

    # Rule 2 — Proximity ratio
    if prox < Config.PROXIMITY_RATIO_THRESHOLD:
        triggered.append(f"PROXIMITY(ratio={prox:.2f})")

    # Rule 3 — TTC
    if ttc_seconds is not None and ttc_seconds < Config.TTC_ALERT_THRESHOLD:
        triggered.append(f"TTC({ttc_seconds:.2f}s)")

    # Rule 4 — Sudden deceleration (either vehicle)
    for t, label in [(t_a, "A"), (t_b, "B")]:
        accel = t.acceleration
        if accel < -Config.DECEL_THRESHOLD:
            triggered.append(f"BRAKE_{label}(Δspd={accel:.1f}px/f²)")

    # Rule 5 — Trajectory convergence
    ha, hb = t_a.heading, t_b.heading
    if ha is not None and hb is not None:
        angle_diff = abs((ha - hb + 180) % 360 - 180)
        cspd = closing_speed(t_a, t_b)
        if angle_diff < Config.CONVERGENCE_ANGLE_THRESHOLD and cspd > 1.0:
            triggered.append(f"CONVERGE(Δangle={angle_diff:.0f}°)")

    return triggered, iou, prox, ttc_seconds


# ---------------------------------------------------------------------------
# Main detector class
# ---------------------------------------------------------------------------

class NearCrashDetector:

    def __init__(self, source: str, save_output: bool = False, show: bool = True):
        self.source = source
        self.save_output = save_output
        self.show = show

        print(f"[INFO] Loading model: {Config.MODEL_WEIGHTS}")
        self.model = YOLO(Config.MODEL_WEIGHTS)

        self.tracks: Dict[int, TrackState] = {}
        self.events: List[NearCrashEvent] = []
        self.alert_cooldowns: Dict[Tuple[int, int], int] = {}   # pair → last alert frame

        self.cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open source: {source}")

        self.fps   = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.width  = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.frame_idx = 0

        self.writer: Optional[cv2.VideoWriter] = None
        if save_output:
            out_path = str(Path(source).stem) + "_near_crash.mp4" if not source.isdigit() else "output_near_crash.mp4"
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self.writer = cv2.VideoWriter(out_path, fourcc, self.fps, (self.width, self.height))
            print(f"[INFO] Saving annotated output to: {out_path}")

    # ------------------------------------------------------------------
    # Core loop
    # ------------------------------------------------------------------

    def run(self):
        print("[INFO] Starting detection loop. Press 'q' to quit.")
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
        print(f"\n[INFO] Processed {self.frame_idx} frames in {elapsed:.1f}s "
              f"({self.frame_idx / elapsed:.1f} FPS)")
        self._print_summary()
        self._cleanup()

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        # 1. Run YOLOv8 with ByteTrack
        results = self.model.track(
            frame,
            persist=True,
            tracker=Config.TRACKER,
            conf=Config.CONFIDENCE_THRESHOLD,
            iou=Config.IOU_NMS_THRESHOLD,
            classes=list(Config.VEHICLE_CLASS_IDS),
            device=Config.DEVICE,
            verbose=False,
        )

        # 2. Update track states
        active_ids = set()
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes  = results[0].boxes.xyxy.cpu().numpy()
            ids    = results[0].boxes.id.cpu().numpy().astype(int)
            clses  = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, cls in zip(boxes, ids, clses):
                active_ids.add(tid)
                if tid not in self.tracks:
                    self.tracks[tid] = TrackState(track_id=tid, class_id=cls)
                self.tracks[tid].update(tuple(box))

        # 3. Evaluate rules for every pair of active, sufficiently-tracked vehicles
        frame_events: List[NearCrashEvent] = []
        active_ids_list = [
            tid for tid in active_ids
            if self.tracks[tid].frame_count >= Config.MIN_FRAMES_TRACKED
        ]

        for i in range(len(active_ids_list)):
            for j in range(i + 1, len(active_ids_list)):
                id_a, id_b = active_ids_list[i], active_ids_list[j]
                pair_key = (min(id_a, id_b), max(id_a, id_b))

                # cooldown check
                last_alert = self.alert_cooldowns.get(pair_key, -999)
                if self.frame_idx - last_alert < Config.ALERT_COOLDOWN_FRAMES:
                    continue

                t_a, t_b = self.tracks[id_a], self.tracks[id_b]
                triggered, iou, prox, ttc = evaluate_rules(t_a, t_b, self.fps)

                if triggered:
                    severity = "CRITICAL" if len(triggered) >= 2 else "WARNING"
                    evt = NearCrashEvent(
                        frame_idx=self.frame_idx,
                        track_id_a=id_a,
                        track_id_b=id_b,
                        triggered_rules=triggered,
                        severity=severity,
                        iou=iou,
                        proximity_ratio=prox,
                        ttc=ttc,
                    )
                    frame_events.append(evt)
                    self.events.append(evt)
                    self.alert_cooldowns[pair_key] = self.frame_idx
                    print(evt)

        # 4. Draw annotations
        return self._annotate(frame, active_ids, frame_events)

    # ------------------------------------------------------------------
    # Visualization
    # ------------------------------------------------------------------

    def _annotate(
        self,
        frame: np.ndarray,
        active_ids: set,
        events: List[NearCrashEvent],
    ) -> np.ndarray:
        out = frame.copy()

        # Collect alert pair IDs for color highlighting
        alert_ids: set = set()
        for evt in events:
            alert_ids.update([evt.track_id_a, evt.track_id_b])

        # Draw each tracked vehicle
        for tid in active_ids:
            if tid not in self.tracks:
                continue
            t = self.tracks[tid]
            if not t.current_box:
                continue

            x1, y1, x2, y2 = [int(v) for v in t.current_box]
            is_alert = tid in alert_ids
            color = (0, 0, 255) if is_alert else (0, 220, 60)
            thickness = 3 if is_alert else 2

            cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)

            label = f"#{tid}"
            if Config.SHOW_VELOCITIES:
                label += f" v={t.speed:.1f}px/f"
            cv2.putText(out, label, (x1, y1 - 8), Config.FONT, 0.55, color, thickness)

            # Draw trajectory tail
            if Config.SHOW_TRACKS and len(t.centers) > 1:
                pts = np.array(t.centers, dtype=np.int32)
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    c = tuple(int(v * alpha) for v in color)
                    cv2.line(out, tuple(pts[k - 1]), tuple(pts[k]), c, 1)

        # Draw alert overlays
        for evt in events:
            for pair_id in [evt.track_id_a, evt.track_id_b]:
                if pair_id not in self.tracks:
                    continue
                t = self.tracks[pair_id]
                if not t.current_box:
                    continue
                x1, y1, x2, y2 = [int(v) for v in t.current_box]
                if evt.severity == "CRITICAL":
                    cv2.rectangle(out, (x1 - 4, y1 - 4), (x2 + 4, y2 + 4), (0, 0, 255), 4)

            # Banner
            banner = f"{'⚠ ' if evt.severity == 'WARNING' else '🚨 '}{evt.severity}: #{evt.track_id_a} & #{evt.track_id_b}"
            cv2.putText(out, banner, (10, 30 + 28 * events.index(evt)),
                        Config.FONT, 0.75, (0, 0, 255), 2)

        # Frame counter
        cv2.putText(out, f"Frame {self.frame_idx}", (self.width - 160, self.height - 12),
                    Config.FONT, 0.5, (200, 200, 200), 1)

        return out

    # ------------------------------------------------------------------
    # Cleanup & summary
    # ------------------------------------------------------------------

    def _print_summary(self):
        print("\n" + "=" * 60)
        print(f"SUMMARY: {len(self.events)} near-crash event(s) detected")
        print("=" * 60)
        critical = [e for e in self.events if e.severity == "CRITICAL"]
        warnings  = [e for e in self.events if e.severity == "WARNING"]
        print(f"  CRITICAL : {len(critical)}")
        print(f"  WARNING  : {len(warnings)}")
        if self.events:
            print("\nAll events:")
            for evt in self.events:
                print(f"  {evt}")

    def _cleanup(self):
        self.cap.release()
        if self.writer:
            self.writer.release()
        cv2.destroyAllWindows()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Near-Crash Detector using YOLOv8 + OpenCV")
    p.add_argument("--source", required=True,
                   help="Video file path, image path, or '0' for webcam")
    p.add_argument("--save", action="store_true",
                   help="Save annotated output video")
    p.add_argument("--no-show", action="store_true",
                   help="Disable live display (useful for headless servers)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    detector = NearCrashDetector(
        source=args.source,
        save_output=args.save,
        show=not args.no_show,
    )
    detector.run()