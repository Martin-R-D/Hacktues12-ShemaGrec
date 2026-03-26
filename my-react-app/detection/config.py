import cv2

SMALL_BOX_RATIO_HARD_CUTOFF = 0.20
SMALL_BOX_RATIO_SOFT_CUTOFF = 0.45

MERGE_RADIUS_M = 50.0


class Config:
    # Model
    MODEL_WEIGHTS         = "yolov8m.pt"
    CONFIDENCE_THRESHOLD  = 0.15
    IOU_NMS_THRESHOLD     = 0.30
    DEVICE                = "cpu"
    TRACKER               = "bytetrack.yaml"

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
    MIN_CLOSING_SPEED_PX        = 5.0
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

    # Display
    SHOW_TRACKS     = True
    SHOW_VELOCITIES = True
    FONT            = cv2.FONT_HERSHEY_SIMPLEX
