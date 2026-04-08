import collections
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

from config import Config


@dataclass
class TrackState:
    track_id  : int
    class_id  : int  = 2
    is_vehicle: bool = True

    centers              : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    boxes                : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    velocities           : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.TRACK_HISTORY_FRAMES))
    recent_deviations    : collections.deque = field(default_factory=lambda: collections.deque(maxlen=5))
    recent_accelerations : collections.deque = field(default_factory=lambda: collections.deque(maxlen=Config.DECEL_CONFIRM_FRAMES))

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
        # Track per-frame acceleration for sustained-braking check
        if len(self.velocities) >= 2:
            self.recent_accelerations.append(
                float(np.hypot(*self.velocities[-1]) - np.hypot(*self.velocities[-2]))
            )

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
    def sustained_decel(self) -> bool:
        """True only if hard braking persisted for DECEL_CONFIRM_FRAMES consecutive frames."""
        if len(self.recent_accelerations) < Config.DECEL_CONFIRM_FRAMES:
            return False
        return all(a < -Config.px(Config.DECEL_THRESHOLD_RATIO) for a in self.recent_accelerations)

    @property
    def heading(self) -> Optional[float]:
        if len(self.velocities) < 3:
            return None
        recent = list(self.velocities)[-5:]
        avg_vx = float(np.mean([v[0] for v in recent]))
        avg_vy = float(np.mean([v[1] for v in recent]))
        if np.hypot(avg_vx, avg_vy) <= 0.5:
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
    frame_idx         : int
    timestamp_utc     : str
    camera_id         : str
    camera_lat        : float
    camera_lon        : float
    involved_track_ids: List[int]
    triggered_rules   : List[str]
    severity          : str          # "WARNING" | "CRITICAL"
    iou               : float
    proximity_ratio   : float
    ttc_seconds       : Optional[float]
    image_base64      : Optional[str] = None

    @property
    def risk_weight(self) -> int:
        w = 0
        rules_text = " ".join(self.triggered_rules).upper()

        if "NONVEH" in rules_text:
            w += 4
        elif "CONVERGE" in rules_text:
            w += 5 if self.severity == "CRITICAL" else 2
        elif "BRAKE" in rules_text:
            w += 3
        elif "PATH_DEV" in rules_text:
            w += 2
        elif "OVERLAP" in rules_text or "PROXIMITY" in rules_text:
            w += 2

        if self.severity == "CRITICAL":
            w += 3

        if self.ttc_seconds is not None and self.ttc_seconds < 1.0:
            w += 2
        elif self.ttc_seconds is not None and self.ttc_seconds < 2.0:
            w += 1

        return max(1, w)

    def __str__(self):
        rules  = ", ".join(self.triggered_rules)
        ttc_s  = f"{self.ttc_seconds:.2f}s" if self.ttc_seconds is not None else "N/A"
        tracks = "+".join(f"#{t}" for t in self.involved_track_ids)
        return (
            f"[{self.timestamp_utc}] [{self.camera_id}] {self.severity} "
            f"— Tracks {tracks} | Rules: {rules} | "
            f"IoU={self.iou:.3f} Prox={self.proximity_ratio:.2f} TTC={ttc_s}"
        )
