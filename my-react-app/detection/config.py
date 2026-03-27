import cv2

SMALL_BOX_AREA_HARD_CUTOFF_PX      = 2500   # boxes smaller than this (px²) → IoU forced to 0
SMALL_BOX_AREA_SOFT_CUTOFF_PX      = 6000   # boxes between hard and soft get IoU scaled down
IOU_FALSE_POSITIVE_THRESHOLD       = 0.90
PROXIMITY_FALSE_POSITIVE_THRESHOLD = 0.10

MERGE_RADIUS_M = 50.0


class Config:
    # Model
    MODEL_WEIGHTS         = "yolov8m.pt"  # export once: cd detection && python -c "from ultralytics import YOLO; YOLO('yolov8m.pt').export(format='onnx')"
    CONFIDENCE_THRESHOLD  = 0.15
    IOU_NMS_THRESHOLD     = 0.30
    DEVICE                = "cuda" if __import__("torch").cuda.is_available() else "cpu"
    TRACKER               = "botsort.yaml"

    # COCO class ids
    VEHICLE_CLASS_IDS     = {2, 3, 5, 7}   # car, motorcycle, bus, truck
    NON_VEHICLE_CLASS_IDS = {0, 1}          # person, bicycle

    # History
    TRACK_HISTORY_FRAMES  = 40

    # Frame diagonal in pixels — set automatically at startup by the detector.
    # All thresholds below marked "× diag" are ratios of this value, so they
    # scale to any resolution automatically.
    FRAME_DIAG            = 2203.0  # default for 1920×1080; overwritten at runtime

    # ── Rule 1: Overlap + proximity ──────────────────────────────────────
    IOU_ALERT_THRESHOLD         = 0.10
    PROXIMITY_RATIO_THRESHOLD   = 0.10
    ENABLE_OVERLAP_FACTOR       = True
    ENABLE_PROXIMITY_FACTOR     = True

    # ── Rule 2: Deceleration ─────────────────────────────────────────────
    DECEL_THRESHOLD_RATIO       = 0.015   # × diag per frame² (was 32px at 1080p)
    DECEL_CONFIRM_FRAMES        = 3       # consecutive frames that must show hard braking
    ENABLE_DECEL_FACTOR         = True

    # ── Rule 3: Trajectory convergence ───────────────────────────────────
    CONVERGENCE_ANGLE_THRESHOLD = 30.0
    CONVERGENCE_MAX_DIST_RATIO  = 0.07    # × diag — max distance between vehicles (was 300px)
    MIN_CLOSING_SPEED_RATIO     = 0.0023  # × diag per frame (was 5px)
    MIN_CLOSING_SPEED_MS        = 0.05    # m/frame ≈ 1.5 m/s — used when calibrated
    ENABLE_CONVERGENCE_FACTOR   = True

    # ── Rule 4: Path deviation ────────────────────────────────────────────
    PATH_FIT_MIN_FRAMES         = 12
    PATH_DEVIATION_RATIO        = 0.025   # × diag (was 55px)
    ENABLE_PATH_DEVIATION       = True

    # ── Rule 5: Non-vehicle proximity to cars ─────────────────────────────
    NON_VEH_DISTANCE_DROP_RATIO = 0.40
    NON_VEH_WINDOW_FRAMES       = 10
    NON_VEH_MIN_ALERT_DIST_RATIO = 0.016  # × diag (was 35px)
    NON_VEH_MAX_DIST_RATIO       = 0.10   # × diag (was 220px)
    ENABLE_NONVEH_PROXIMITY      = True

    # ── Convenience: threshold in actual pixels ──────────────────────────
    @classmethod
    def px(cls, ratio: float) -> float:
        """Convert a diagonal-ratio threshold to pixels."""
        return ratio * cls.FRAME_DIAG

    # Alert suppression
    ALERT_COOLDOWN_FRAMES = 15
    MIN_FRAMES_TRACKED    = 5

    # How many frames to keep alert banners visible after detection
    ALERT_DISPLAY_FRAMES  = 90

    # ── Bird's-eye calibration ────────────────────────────────────────────
    # 4 pixel points mapped to 4 real-world ground points (metres).
    # Set to None to run in pixel-space (all rules still work, just unitless).
    #
    # How to calibrate:
    #   Pick 4 road points whose real-world positions you know (e.g. lane
    #   markings, road edges).  Measure or estimate their distances in metres.
    #   List pixel coords in the same order as world coords.
    #
    # Example — single lane, camera roughly overhead:
    #   pixel: top-left, top-right, bottom-right, bottom-left of a known rectangle
    #   world: corresponding metres from an arbitrary origin
    CALIBRATION_POINTS = None
    # CALIBRATION_POINTS = {
    #     "pixel": [(152, 430), (528, 430), (528, 250), (152, 250)],
    #     "world": [(0.0, 0.0), (3.5, 0.0), (3.5, 12.0), (0.0, 12.0)],
    # }

    # Display
    SHOW_TRACKS     = True
    SHOW_VELOCITIES = True
    FONT            = cv2.FONT_HERSHEY_SIMPLEX
