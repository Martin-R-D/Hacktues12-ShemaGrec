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


Usage (single source):
    python near_crash_detector.py --source 0 --location "CAM_01|42.6977,23.3219"
    python near_crash_detector.py --source demo.mp4 --location "CAM_02|42.6934,23.3189" --save

Usage (multiple sources - each runs concurrently):
    python near_crash_detector.py \
      --source 0 --location "CAM_01|42.6977,23.3219" \
      --source rtsp://example.com/stream --location "CAM_02|42.6934,23.3189" \
      --no-show

    python near_crash_detector.py \
      --source video1.mp4 --location "CAM_RPi_01|42.69,23.32" \
      --source video2.mp4 --location "CAM_RPi_02|42.70,23.33" \
      --source rtsp://public-cam.com/feed --location "CAM_Public_01|42.71,23.34" \
      --no-show

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
import threading
from concurrent.futures import ThreadPoolExecutor

from rules import apply_factor_toggles
from detector import NearCrashDetector


def parse_args():
    p = argparse.ArgumentParser(description="Near-Crash Detector v2.1")
    # Sample URLs:  
    # https://s31.ipcamlive.com/streams/1f9owgjb5d471pdyu/stream.m3u8
    # https://manifest.googlevideo.com/api/manifest/hls_playlist/expire/1775254465/ei/YefPabC-Fdy9hcIPyYjLwQY/ip/213.130.77.61/id/U4L-omkVIBQ.1/itag/95/source/yt_live_broadcast/requiressl/yes/ratebypass/yes/live/1/sgoap/gir%3Dyes%3Bitag%3D140/sgovp/gir%3Dyes%3Bitag%3D136/rqh/1/hls_chunk_host/rr2---sn-8p85jvh-nv4d.googlevideo.com/xpc/EgVo2aDSNQ%3D%3D/bui/AUUZDGIWBkP8RqxXN7yNRuaLRHKFbKOurmMgYnicGDCixd1Ua-2FICYHDXB2-2Q3llj4m6Ph8zT2N5BN/spc/jlWavVTJ_lCEYuIbpHF4BPhploAqCa0kmxye7uSq8N4x2c383Q/vprv/1/reg/0/playlist_type/DVR/initcwndbps/2937500/met/1775232865,/mh/sJ/mm/44/mn/sn-8p85jvh-nv4d/ms/lva/mv/m/mvi/2/pl/24/rms/lva,lva/dover/11/pacing/0/keepalive/yes/fexp/51565115,51565682/mt/1775232521/sparams/expire,ei,ip,id,itag,source,requiressl,ratebypass,live,sgoap,sgovp,rqh,xpc,bui,spc,vprv,reg,playlist_type/sig/AHEqNM4wRgIhALpcKa9tec2c2SCZ4naTqQd4vg8XFLkE13taxz87c1kWAiEAyli3oT7ppqlXHNta0hddtUDcHGjZtdZ5vsWbFIBBerY%3D/lsparams/hls_chunk_host,initcwndbps,met,mh,mm,mn,ms,mv,mvi,pl,rms/lsig/APaTxxMwRQIgewYRqFZy0gSGpe-LHHOE-GwdbJ2akrlc9xlHkWYV34QCIQDlwoBZGpLVah0SZF8_5AECL3gaRR96mU8k0kEv10awPA%3D%3D/playlist/index.m3u8
    p.add_argument("--source",    action="append", required=True,
                   help="Video file, image dir, stream URL (rtsp://...), or '0' for webcam. Specify multiple times for multiple sources.")
    p.add_argument("--location",  action="append", default=[],
                   help="Camera label and GPS: 'CAM_01|42.6977,23.3219'. Specify once per --source.")
    p.add_argument("--log-file",  default="events.ndjson",
                   help="Path to output JSON file (merged on each run)")
    p.add_argument("--save",      action="store_true",
                   help="Save annotated output video")
    p.add_argument("--no-show",   action="store_true",
                   help="Disable live window (headless)")
    p.add_argument("--no-path-dev",    action="store_true",
                   help="Disable path-deviation detection (shorthand for --disable-factors path)")
    p.add_argument("--dry-run",  action="store_true",
                   help="Log events to console only, do not upload to API (testing mode)")
    p.add_argument("--disable-factors", default="",
                   help=("Comma-separated factors to disable: "
                         "overlap,proximity,decel,converge,path,nonveh,all"))
    p.add_argument("--enable-factors", default="",
                   help=("Comma-separated factors to enable (applied after disables): "
                         "overlap,proximity,decel,converge,path,nonveh,all"))
    return p.parse_args()


if __name__ == "__main__":
    args   = parse_args()
    disable = args.disable_factors
    if args.no_path_dev:
        disable = f"{disable},path" if disable else "path"
    apply_factor_toggles(disable, args.enable_factors)

    # Validate source/location pairing
    sources = args.source
    locations = args.location or []
    if not locations:
        locations = ["CAM_00|0.0,0.0"] * len(sources)
    elif len(locations) != len(sources):
        print(f"[ERROR] Mismatch: {len(sources)} sources but {len(locations)} locations")
        print(f"[ERROR] Provide one --location per --source")
        exit(1)

    # Run multiple detectors in parallel
    def run_detector_for_source(source: str, location: str):
        cam_id, coords = location.split("|")
        lat_s, lon_s = coords.split(",")
        try:
            detector = NearCrashDetector(
                source       = source,
                camera_id    = cam_id.strip(),
                lat          = float(lat_s),
                lon          = float(lon_s),
                log_file     = args.log_file,
                dry_run      = args.dry_run,
                save_output  = args.save,
                show         = not args.no_show,
            )
            detector.run()
        except Exception as e:
            print(f"[ERROR] Detector for {location} failed: {e}")

    if len(sources) == 1:
        # Single source - run inline
        run_detector_for_source(sources[0], locations[0])
    else:
        # Multiple sources - run in parallel threads
        print(f"[INFO] Starting {len(sources)} detector(s) in parallel...")
        with ThreadPoolExecutor(max_workers=len(sources)) as executor:
            futures = [
                executor.submit(run_detector_for_source, src, loc)
                for src, loc in zip(sources, locations)
            ]
            for future in futures:
                future.result()
