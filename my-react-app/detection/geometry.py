from typing import Optional, Tuple

import cv2
import numpy as np

from config import Config, SMALL_BOX_RATIO_HARD_CUTOFF, SMALL_BOX_RATIO_SOFT_CUTOFF
from models import TrackState


# ---------------------------------------------------------------------------
# Bird's-eye homography (optional — pixel-space fallback when not set)
# ---------------------------------------------------------------------------

class Homography:
    def __init__(self, pixel_pts, world_pts):
        src = np.float32(pixel_pts)
        dst = np.float32(world_pts)
        self.M = cv2.getPerspectiveTransform(src, dst)

    def transform(self, x: float, y: float) -> Tuple[float, float]:
        pt = np.array([[[x, y]]], dtype=np.float32)
        out = cv2.perspectiveTransform(pt, self.M)
        return float(out[0, 0, 0]), float(out[0, 0, 1])


_H: Optional[Homography] = None


def set_homography(h: Optional[Homography]) -> None:
    global _H
    _H = h


def is_calibrated() -> bool:
    return _H is not None


def _to_world(x: float, y: float) -> Tuple[float, float]:
    """Transform pixel coords to world coords (metres), or return as-is."""
    return _H.transform(x, y) if _H else (x, y)


def compute_iou(box_a: Tuple, box_b: Tuple) -> float:
    xa1, ya1, xa2, ya2 = box_a
    xb1, yb1, xb2, yb2 = box_b

    area_a = max(0.0, (xa2 - xa1) * (ya2 - ya1))
    area_b = max(0.0, (xb2 - xb1) * (yb2 - yb1))
    if area_a <= 1e-6 or area_b <= 1e-6:
        return 0.0

    ix1, iy1 = max(xa1, xb1), max(ya1, yb1)
    ix2, iy2 = min(xa2, xb2), min(ya2, yb2)
    inter    = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    raw_iou  = inter / (area_a + area_b - inter + 1e-6)

    size_ratio = min(area_a, area_b) / max(area_a, area_b)
    if size_ratio <= SMALL_BOX_RATIO_HARD_CUTOFF:
        return 0.0
    if size_ratio < SMALL_BOX_RATIO_SOFT_CUTOFF:
        t = ((size_ratio - SMALL_BOX_RATIO_HARD_CUTOFF)
             / (SMALL_BOX_RATIO_SOFT_CUTOFF - SMALL_BOX_RATIO_HARD_CUTOFF))
        return raw_iou * max(0.0, min(1.0, t))
    return raw_iou


def center_distance(a: TrackState, b: TrackState) -> float:
    ca, cb = a.current_center, b.current_center
    if ca is None or cb is None:
        return float("inf")
    wa, wb = _to_world(*ca), _to_world(*cb)
    return float(np.hypot(wa[0] - wb[0], wa[1] - wb[1]))


def closing_speed(a: TrackState, b: TrackState) -> float:
    n = min(len(a.centers), len(b.centers))
    if n < 3:
        return 0.0
    ca = list(a.centers)[-n:]
    cb = list(b.centers)[-n:]
    dists = [
        np.hypot(*( np.array(_to_world(*ca[i])) - np.array(_to_world(*cb[i])) ))
        for i in range(n)
    ]
    slope = float(np.polyfit(range(n), dists, 1)[0])
    return -slope


def compute_ttc(a: TrackState, b: TrackState, fps: float) -> Optional[float]:
    dist = center_distance(a, b)
    cspd = closing_speed(a, b)
    if cspd <= 0.5:
        return None
    return (dist / cspd) / fps


def proximity_ratio(a: TrackState, b: TrackState) -> float:
    dist     = center_distance(a, b)
    avg_diag = (a.diagonal + b.diagonal) / 2
    return dist / (avg_diag + 1e-6)


def path_deviation(track: TrackState) -> Optional[float]:
    n = len(track.centers)
    if n < Config.PATH_FIT_MIN_FRAMES:
        return None
    pts = np.array(list(track.centers))
    fit_pts = pts[:-3]
    test_pt = pts[-1]
    if len(fit_pts) < 2:
        return None
    mean = fit_pts.mean(axis=0)
    centered = fit_pts - mean
    _, _, vt = np.linalg.svd(centered)
    direction = vt[0]
    normal = np.array([-direction[1], direction[0]])
    return float(abs(np.dot(test_pt - mean, normal)))
