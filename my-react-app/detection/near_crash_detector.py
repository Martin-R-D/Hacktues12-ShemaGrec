"""
Near-Crash Detection System  v2.1
===================================
Rules:
  1. Bounding-box overlap  +  center-to-center proximity ratio
  2. Sudden deceleration / velocity drop
  3. Rapid trajectory convergence angle
  4. Path-deviation  — predicted lane vs actual position
  5. Non-vehicle objects (pedestrians, cyclists) rapidly closing on cars

On completion → writes a JSON array of aggregated hotspots:
    [ { "risk_weight": 12, "cord_x": 23.32, "cord_y": 42.69 }, ... ]

If the output file already contains data, new results are merged in
(existing locations within 50 m get their weight summed).

Requirements:
    pip install ultralytics opencv-python numpy
    pip uninstall torch torchvision
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121


Usage:
    python near_crash_detector.py --source path/to/video.mp4 --location "CAM_01|42.6977,23.3219"
    python near_crash_detector.py --source 0 --location "CAM_02|42.6934,23.3189" --save
    python near_crash_detector.py --source video.mp4 --no-show --log-file events.ndjson
    python near_crash_detector.py --source video.mp4 --disable-factors overlap,converge

Modules:
    config.py    — Config class and constants
    models.py    — TrackState, NearCrashEvent dataclasses
    geometry.py  — IoU, distance, TTC, path-deviation helpers
    rules.py     — evaluate functions + factor toggles
    hotspots.py  — JSON I/O and hotspot merging
    publisher.py — EventPublisher
    detector.py  — NearCrashDetector (main processing loop)
"""

import argparse

from rules import apply_factor_toggles
from detector import NearCrashDetector


def parse_args():
    p = argparse.ArgumentParser(description="Near-Crash Detector v2.1")
    p.add_argument("--source",    required=True,
                   help="Video file, image dir, or '0' for webcam")
    p.add_argument("--location",  default="CAM_00|0.0,0.0",
                   help="Camera label and GPS: 'CAM_01|42.6977,23.3219'")
    p.add_argument("--log-file",  default="events.ndjson",
                   help="Path to output JSON file (merged on each run)")
    p.add_argument("--save",      action="store_true",
                   help="Save annotated output video")
    p.add_argument("--no-show",   action="store_true",
                   help="Disable live window (headless)")
    p.add_argument("--disable-factors", default="",
                   help=("Comma-separated factors to disable: "
                         "overlap,proximity,decel,converge,path,nonveh,all"))
    p.add_argument("--enable-factors", default="",
                   help=("Comma-separated factors to enable (applied after disables): "
                         "overlap,proximity,decel,converge,path,nonveh,all"))
    return p.parse_args()


if __name__ == "__main__":
    args   = parse_args()
    cam_id, coords = args.location.split("|")
    lat_s,  lon_s  = coords.split(",")
    apply_factor_toggles(args.disable_factors, args.enable_factors)

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
