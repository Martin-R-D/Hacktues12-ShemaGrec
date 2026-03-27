from typing import Optional, Tuple

import numpy as np

from config import Config, SMALL_BOX_RATIO_HARD_CUTOFF, SMALL_BOX_RATIO_SOFT_CUTOFF
from models import TrackState


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
    return float(np.hypot(ca[0] - cb[0], ca[1] - cb[1]))


def closing_speed(a: TrackState, b: TrackState) -> float:
    n = min(len(a.centers), len(b.centers))
    if n < 3:
        return 0.0
    ca = list(a.centers)[-n:]
    cb = list(b.centers)[-n:]
    dists = [np.hypot(ca[i][0] - cb[i][0], ca[i][1] - cb[i][1]) for i in range(n)]
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
