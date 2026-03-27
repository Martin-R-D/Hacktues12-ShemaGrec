import cv2

SMALL_BOX_RATIO_HARD_CUTOFF = 0.20
SMALL_BOX_RATIO_SOFT_CUTOFF = 0.45

MERGE_RADIUS_M = 50.0


class Config:
    # Model
    MODEL_WEIGHTS         = "yolov8m.pt"
    CONFIDENCE_THRESHOLD  = 0.15
    IOU_NMS_THRESHOLD     = 0.30
    DEVICE                = "cuda" if __import__("torch").cuda.is_available() else "cpu"
    TRACKER               = "botsort.yaml"

    # COCO class ids
    VEHICLE_CLASS_IDS     = {2, 3, 5, 7}   # car, motorcycle, bus, truck
    NON_VEHICLE_CLASS_IDS = {0, 1}          # person, bicycle

    # History
    TRACK_HISTORY_FRAMES  = 40

    # ── Rule 1: Overlap + proximity ──────────────────────────────────────
    IOU_ALERT_THRESHOLD         = 0.10
    PROXIMITY_RATIO_THRESHOLD   = 0.60
    ENABLE_OVERLAP_FACTOR       = False
    ENABLE_PROXIMITY_FACTOR     = True

    # ── Rule 2: Deceleration ─────────────────────────────────────────────
    DECEL_THRESHOLD             = 32.0
    ENABLE_DECEL_FACTOR         = True

    # ── Rule 3: Trajectory convergence ───────────────────────────────────
    CONVERGENCE_ANGLE_THRESHOLD = 30.0
    MIN_CLOSING_SPEED_PX        = 5.0    # px/frame  — used when no calibration
    MIN_CLOSING_SPEED_MS        = 0.05   # m/frame ≈ 1.5 m/s — used when calibrated
    ENABLE_CONVERGENCE_FACTOR   = True

    # ── Rule 4: Path deviation ────────────────────────────────────────────
    PATH_FIT_MIN_FRAMES         = 12
    PATH_DEVIATION_THRESHOLD    = 55.0
    ENABLE_PATH_DEVIATION       = False

    # ── Rule 5: Non-vehicle proximity to cars ─────────────────────────────
    NON_VEH_DISTANCE_DROP_RATIO = 0.40
    NON_VEH_WINDOW_FRAMES       = 10
    NON_VEH_MIN_ALERT_DIST_ABS  = 35.0
    NON_VEH_MAX_DIST_ABS        = 220.0
    ENABLE_NONVEH_PROXIMITY     = False

    # Alert suppression
    ALERT_COOLDOWN_FRAMES = 15
    MIN_FRAMES_TRACKED    = 5

    # Alert suppression
    ALERT_COOLDOWN_FRAMES = 15
    MIN_FRAMES_TRACKED    = 5

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
