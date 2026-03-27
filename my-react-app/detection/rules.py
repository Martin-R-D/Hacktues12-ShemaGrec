from typing import List, Optional, Tuple

import numpy as np

from config import Config
from models import TrackState
from geometry import (
    compute_iou, proximity_ratio, compute_ttc,
    closing_speed, center_distance, path_deviation,
    is_calibrated,
)


# ---------------------------------------------------------------------------
# Factor toggles
# ---------------------------------------------------------------------------

FACTOR_TO_ATTR = {
    "overlap":   "ENABLE_OVERLAP_FACTOR",
    "proximity": "ENABLE_PROXIMITY_FACTOR",
    "decel":     "ENABLE_DECEL_FACTOR",
    "converge":  "ENABLE_CONVERGENCE_FACTOR",
    "path":      "ENABLE_PATH_DEVIATION",
    "nonveh":    "ENABLE_NONVEH_PROXIMITY",
}


def _parse_factor_csv(value: str) -> List[str]:
    if not value:
        return []
    return [item.strip().lower() for item in value.split(",") if item.strip()]


def apply_factor_toggles(disable_csv: str, enable_csv: str):
    disable_names = _parse_factor_csv(disable_csv)
    enable_names  = _parse_factor_csv(enable_csv)

    def _validate(names: List[str], flag_name: str):
        unknown = sorted(n for n in names if n not in FACTOR_TO_ATTR and n != "all")
        if unknown:
            raise ValueError(
                f"Unknown factor(s) in {flag_name}: {', '.join(unknown)}. "
                f"Supported: {', '.join(sorted(FACTOR_TO_ATTR.keys()))}, all"
            )

    _validate(disable_names, "--disable-factors")
    _validate(enable_names,  "--enable-factors")

    if "all" in disable_names:
        for attr in FACTOR_TO_ATTR.values():
            setattr(Config, attr, False)
    else:
        for name in disable_names:
            setattr(Config, FACTOR_TO_ATTR[name], False)

    if "all" in enable_names:
        for attr in FACTOR_TO_ATTR.values():
            setattr(Config, attr, True)
    else:
        for name in enable_names:
            setattr(Config, FACTOR_TO_ATTR[name], True)


def active_factors() -> List[str]:
    return [name for name, attr in FACTOR_TO_ATTR.items() if getattr(Config, attr)]


# ---------------------------------------------------------------------------
# Evaluate functions
# ---------------------------------------------------------------------------

def evaluate_vehicle_pair(
    t_a: TrackState,
    t_b: TrackState,
    fps: float,
) -> Tuple[List[str], float, float, Optional[float]]:
    triggered: List[str] = []

    iou  = compute_iou(t_a.current_box, t_b.current_box)
    prox = proximity_ratio(t_a, t_b)
    ttc  = compute_ttc(t_a, t_b, fps)

    if Config.ENABLE_OVERLAP_FACTOR and iou >= Config.IOU_ALERT_THRESHOLD:
        triggered.append(f"OVERLAP(IoU={iou:.2f})")

    if Config.ENABLE_PROXIMITY_FACTOR and prox < Config.PROXIMITY_RATIO_THRESHOLD:
        triggered.append(f"PROXIMITY(ratio={prox:.2f})")

    if Config.ENABLE_DECEL_FACTOR:
        for t, label in [(t_a, "A"), (t_b, "B")]:
            if t.sustained_decel:
                triggered.append(f"BRAKE_{label}(decel={t.acceleration:.1f}px/f2)")

    if Config.ENABLE_CONVERGENCE_FACTOR:
        ha, hb = t_a.heading, t_b.heading
        dist = center_distance(t_a, t_b)
        if ha is not None and hb is not None and dist <= Config.px(Config.CONVERGENCE_MAX_DIST_RATIO):
            angle_diff = abs((ha - hb + 180) % 360 - 180)
            cspd = closing_speed(t_a, t_b)
            min_cspd = Config.MIN_CLOSING_SPEED_MS if is_calibrated() else Config.px(Config.MIN_CLOSING_SPEED_RATIO)
            if angle_diff > Config.CONVERGENCE_ANGLE_THRESHOLD and cspd > min_cspd:
                triggered.append(f"CONVERGE(angle={angle_diff:.0f}deg,cspd={cspd:.1f},d={dist:.0f}px)")

    return triggered, iou, prox, ttc


def evaluate_path_deviation(track: TrackState) -> List[str]:
    if not Config.ENABLE_PATH_DEVIATION:
        return []
    dev = path_deviation(track)
    if dev is None:
        return []
    track.recent_deviations.append(dev)
    if (len(track.recent_deviations) >= 3
            and sum(1 for d in track.recent_deviations if d > Config.px(Config.PATH_DEVIATION_RATIO)) >= 3):
        return [f"PATH_DEV(dev={dev:.0f}px)"]
    return []


def evaluate_nonvehicle_proximity(
    nonveh: TrackState,
    car: TrackState,
) -> List[str]:
    if not Config.ENABLE_NONVEH_PROXIMITY:
        return []

    n = min(len(nonveh.centers), len(car.centers), Config.NON_VEH_WINDOW_FRAMES)
    if n < 4:
        return []

    dist_now = center_distance(nonveh, car)
    if dist_now < Config.px(Config.NON_VEH_MIN_ALERT_DIST_RATIO):
        return []
    if dist_now > Config.px(Config.NON_VEH_MAX_DIST_RATIO):
        return []

    cn_old   = list(nonveh.centers)[-n]
    cc_old   = list(car.centers)[-n]
    dist_old = float(np.hypot(cn_old[0] - cc_old[0], cn_old[1] - cc_old[1]))
    if dist_old < 1.0:
        return []

    closed_ratio = (dist_old - dist_now) / dist_old
    if closed_ratio <= Config.NON_VEH_DISTANCE_DROP_RATIO:
        return []

    label = "PERSON" if nonveh.class_id == 0 else "CYCLIST"
    return [f"NONVEH_{label}_CLOSE(drop={closed_ratio*100:.0f}%,d={dist_now:.0f}px)"]
