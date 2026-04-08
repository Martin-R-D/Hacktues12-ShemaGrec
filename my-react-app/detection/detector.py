import collections
import math
import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from config import Config
from models import TrackState, NearCrashEvent
from rules import (
    evaluate_vehicle_pair, evaluate_path_deviation,
    evaluate_nonvehicle_proximity, active_factors,
)
from geometry import center_distance, path_deviation, set_homography, Homography
from publisher import EventPublisher


class ClipWriterThread(threading.Thread):
    """Background thread to write video clips without blocking detection."""
    
    def __init__(
        self,
        frame_buffer: collections.deque,
        current_frame: np.ndarray,
        frame_idx: int,
        fps: float,
        width: int,
        height: int,
        filename: str,
        clips_dir: str = "clips",
        post_event_frames: int = 90,  # ~3s at 30fps
    ):
        super().__init__(daemon=True)
        self.frame_buffer = collections.deque(frame_buffer)  # Copy buffer snapshot
        self.current_frame = current_frame.copy()
        self.frame_idx = frame_idx
        self.fps = fps
        self.width = width
        self.height = height
        self.filename = filename
        self.clips_dir = clips_dir
        self.post_event_frames = post_event_frames
        
    def run(self):
        """Write clip in background. Never raise exceptions."""
        try:
            os.makedirs(self.clips_dir, exist_ok=True)
            
            filepath = os.path.join(self.clips_dir, self.filename)
            
            # Create video writer (H.264 as fallback codec)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(
                filepath,
                fourcc,
                self.fps,
                (self.width, self.height)
            )
            
            if not writer.isOpened():
                print(f"[WARN] Failed to open VideoWriter for {filepath}, retrying with H264...")
                fourcc = cv2.VideoWriter_fourcc(*"H264")
                writer = cv2.VideoWriter(
                    filepath,
                    fourcc,
                    self.fps,
                    (self.width, self.height)
                )
            
            if not writer.isOpened():
                print(f"[WARN] Failed to open VideoWriter for clip {self.filename}")
                return
            
            # Write buffered frames (pre-event, ~5s)
            for frame in self.frame_buffer:
                writer.write(frame)
            
            # Write current frame + post-event frames
            writer.write(self.current_frame)
            for _ in range(self.post_event_frames - 1):
                writer.write(self.current_frame)
            
            writer.release()
            print(f"[INFO] Video clip saved: {filepath}")
            
        except Exception as e:
            print(f"[WARN] Exception in ClipWriterThread: {e}")


class NearCrashDetector:
    def __init__(
        self,
        source     : str,
        camera_id  : str   = "CAM_00",
        lat        : float = 0.0,
        lon        : float = 0.0,
        log_file   : Optional[str] = None,
        dry_run    : bool  = False,
        save_output: bool  = False,
        show       : bool  = True,
    ):
        self.source      = source
        self.show        = show
        self.save_output = save_output
        self.restream_proc: Optional[subprocess.Popen] = None

        print(f"[INFO] Loading {Config.MODEL_WEIGHTS}...")
        self.model = YOLO(Config.MODEL_WEIGHTS)

        self.tracks         : Dict[int, TrackState]     = {}
        self.events         : List[NearCrashEvent]      = []
        self.alert_cooldowns: Dict[Tuple[int, int], int] = {}
        self.display_events : List[Tuple[int, NearCrashEvent]] = []  # (frame_detected, event)
        self.last_image_publish_time = 0.0
        
        # Frame buffer for video clip capture (~5 seconds of frames)
        buffer_size = max(1, int(self.fps * 5))  # 5 seconds at current FPS
        self.frame_buffer: collections.deque = collections.deque(maxlen=buffer_size)
        self.clips_dir = os.environ.get("CLIPS_DIR", "./clips")
        self.active_clip_thread: Optional[ClipWriterThread] = None
        self.next_image_publish_time = 0.0

        self.publisher = EventPublisher(log_file, camera_id, lat, lon, dry_run=dry_run)

        self.cap = self._open_capture(source, camera_id)
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open source: {source}")

        self.fps    = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.width  = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        Config.FRAME_DIAG = float(np.hypot(self.width, self.height))
        # UI scale factor: 1.0 at 1080p, smaller for low-res, larger for 4K
        self.ui_scale = max(0.4, min(2.0, Config.FRAME_DIAG / 2203.0))
        print(f"[INFO] Resolution {self.width}×{self.height}  diag={Config.FRAME_DIAG:.0f}px  ui_scale={self.ui_scale:.2f}")
        self.frame_idx = 0

        self.writer: Optional[cv2.VideoWriter] = None
        if save_output:
            stem = Path(source).stem if not source.isdigit() else "output"
            out_path = f"{stem}_near_crash.mp4"
            self.writer = cv2.VideoWriter(
                out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                self.fps, (self.width, self.height),
            )
            print(f"[INFO] Saving output -> {out_path}")

        self.total_vehicles_seen: set = set()

        if Config.CALIBRATION_POINTS:
            set_homography(Homography(
                Config.CALIBRATION_POINTS["pixel"],
                Config.CALIBRATION_POINTS["world"],
            ))
            print("[INFO] Bird's-eye calibration active — distances in metres.")

    def _open_capture(self, source: str, camera_id: str) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
        if cap.isOpened():
            return cap

        if self._is_url_source(source):
            print(f"[WARN] OpenCV could not open URL directly: {source}")
            rtsp_url = f"rtsp://127.0.0.1:8554/{camera_id.strip().lower()}"
            if self._start_restream(source, rtsp_url):
                print(f"[INFO] Retrying via local RTSP restream: {rtsp_url}")
                cap = cv2.VideoCapture(rtsp_url)

        return cap

    @staticmethod
    def _is_url_source(source: str) -> bool:
        src = source.lower()
        return src.startswith("http://") or src.startswith("https://") or src.startswith("rtsp://")

    def _start_restream(self, source_url: str, rtsp_url: str) -> bool:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-fflags",
            "nobuffer",
            "-i",
            source_url,
            "-an",
            "-c:v",
            "copy",
            "-f",
            "rtsp",
            "-rtsp_transport",
            "tcp",
            "-rtsp_flags",
            "listen",
            rtsp_url,
        ]

        try:
            self.restream_proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(1.5)
            return self.restream_proc.poll() is None
        except FileNotFoundError:
            print("[ERROR] ffmpeg is not installed or not in PATH")
            return False
        except Exception as exc:
            print(f"[ERROR] Failed to start ffmpeg restream: {exc}")
            return False

    # ── Main loop ─────────────────────────────────────────────────────────

    def run(self):
        print(f"[INFO] Camera: {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print(f"[INFO] Active factors: {', '.join(active_factors()) or 'none'}")
        print("[INFO] Running ... press 'q' to quit.")
        if self.show:
            cv2.namedWindow("Near-Crash Detector", cv2.WINDOW_NORMAL)
            # Don't stretch low-res videos — only resize if source is at least 720p
            if self.width >= 1280 and self.height >= 720:
                cv2.resizeWindow("Near-Crash Detector", 1280, 720)
            else:
                cv2.resizeWindow("Near-Crash Detector", self.width, self.height)
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
                cv2.imshow("Alert Monitor", self._render_alert_panel())
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

        elapsed = time.time() - t0
        print(f"\n[INFO] {self.frame_idx} frames in {elapsed:.1f}s "
              f"({self.frame_idx / max(elapsed, 0.001):.1f} FPS avg)")
        self._print_summary()
        self._cleanup()

    # ── Per-frame logic ───────────────────────────────────────────────────

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        # Update frame buffer for video clip capture
        self.frame_buffer.append(frame.copy())
        
        all_class_ids = list(Config.VEHICLE_CLASS_IDS | Config.NON_VEHICLE_CLASS_IDS)

        results = self.model.track(
            frame,
            persist = True,
            tracker = Config.TRACKER,
            conf    = Config.CONFIDENCE_THRESHOLD,
            iou     = Config.IOU_NMS_THRESHOLD,
            classes = all_class_ids,
            device  = Config.DEVICE,
            verbose = False,
        )

        active_ids: set = set()
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            ids   = results[0].boxes.id.cpu().numpy().astype(int)
            clses = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, cls in zip(boxes, ids, clses):
                active_ids.add(tid)
                is_veh = int(cls) in Config.VEHICLE_CLASS_IDS
                if tid not in self.tracks:
                    self.tracks[tid] = TrackState(track_id=tid, class_id=int(cls), is_vehicle=is_veh)
                self.tracks[tid].update(tuple(box))
                if is_veh:
                    self.total_vehicles_seen.add(tid)

        frame_events: List[NearCrashEvent] = []

        active_veh = [
            tid for tid in active_ids
            if tid in self.tracks
            and self.tracks[tid].is_vehicle
            and self.tracks[tid].frame_count >= Config.MIN_FRAMES_TRACKED
        ]
        active_nonveh = [
            tid for tid in active_ids
            if tid in self.tracks
            and not self.tracks[tid].is_vehicle
            and self.tracks[tid].frame_count >= Config.MIN_FRAMES_TRACKED
        ]

        # ── Rules 1-3  (vehicle pairs) ─────────────────────────────────
        for i in range(len(active_veh)):
            for j in range(i + 1, len(active_veh)):
                id_a, id_b = active_veh[i], active_veh[j]
                pair_key   = (min(id_a, id_b), max(id_a, id_b))

                if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                    continue

                t_a, t_b = self.tracks[id_a], self.tracks[id_b]
                triggered, iou, prox, ttc = evaluate_vehicle_pair(t_a, t_b, self.fps)

                if triggered:
                    evt = self._make_event([id_a, id_b], triggered, iou, prox, ttc)
                    frame_events.append(evt)
                    self.events.append(evt)
                    self.alert_cooldowns[pair_key] = self.frame_idx

        # ── Rule 4  (path deviation, per vehicle) ─────────────────────
        if Config.ENABLE_PATH_DEVIATION:
            for tid in active_veh:
                t = self.tracks[tid]
                path_triggers = evaluate_path_deviation(t)
                if path_triggers:
                    pair_key = (tid, -1)
                    if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                        continue
                    evt = self._make_event([tid], path_triggers, 0.0, 0.0, None)
                    frame_events.append(evt)
                    self.events.append(evt)
                    self.alert_cooldowns[pair_key] = self.frame_idx

        # ── Rule 5  (non-vehicle -> car proximity) ────────────────────
        if Config.ENABLE_NONVEH_PROXIMITY:
            for nv_id in active_nonveh:
                nv = self.tracks[nv_id]
                for veh_id in active_veh:
                    veh      = self.tracks[veh_id]
                    pair_key = (min(nv_id, veh_id), max(nv_id, veh_id))
                    if self.frame_idx - self.alert_cooldowns.get(pair_key, -999) < Config.ALERT_COOLDOWN_FRAMES:
                        continue
                    nv_triggers = evaluate_nonvehicle_proximity(nv, veh)
                    if nv_triggers:
                        dist = center_distance(nv, veh)
                        prox = dist / ((nv.diagonal + veh.diagonal) / 2 + 1e-6)
                        evt  = self._make_event([nv_id, veh_id], nv_triggers, 0.0, prox, None)
                        frame_events.append(evt)
                        self.events.append(evt)
                        self.alert_cooldowns[pair_key] = self.frame_idx

        # Register new events for sustained display
        for evt in frame_events:
            self.display_events.append((self.frame_idx, evt))

        # Expire old display events
        self.display_events = [
            (f, e) for f, e in self.display_events
            if self.frame_idx - f < Config.ALERT_DISPLAY_FRAMES
        ]

        annotated = self._annotate(frame, active_ids, [e for _, e in self.display_events])

        # Publish the first event in each 60s window with a frame image attached.
        image_payload: Optional[str] = None
        now = time.time()
        if frame_events and now >= self.next_image_publish_time:
            import base64

            success, buffer = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
            if success:
                image_payload = base64.b64encode(buffer).decode('utf-8')
                self.next_image_publish_time = now + 60.0

        if image_payload:
            for evt in frame_events:
                evt.image_base64 = image_payload

        for evt in frame_events:
            # Attach still image if rate limit allows
            if time.time() - self.last_image_publish_time >= 60.0:
                import base64
                _, buffer = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
                evt.image_base64 = base64.b64encode(buffer).decode('utf-8')
                self.last_image_publish_time = time.time()
            
            # Spawn background thread to write video clip (no rate limit, always write)
            if len(self.frame_buffer) > 0:
                # Generate filename in main thread before spawning background thread
                ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                clip_filename = f"clip_{ts}_{str(uuid.uuid4())[:8]}.mp4"
                
                clip_thread = ClipWriterThread(
                    frame_buffer=self.frame_buffer,
                    current_frame=annotated,
                    frame_idx=self.frame_idx,
                    fps=self.fps,
                    width=self.width,
                    height=self.height,
                    filename=clip_filename,
                    clips_dir=self.clips_dir,
                    post_event_frames=int(self.fps * 3),  # ~3 seconds
                )
                clip_thread.start()
                self.active_clip_thread = clip_thread
                
                # Set clip path on event to the pre-generated filename
                evt.clip_path = clip_filename
            
            self.publisher.publish(evt)

        return annotated

    # ── Event factory ─────────────────────────────────────────────────────

    def _make_event(
        self,
        track_ids: List[int],
        triggered: List[str],
        iou      : float,
        prox     : float,
        ttc      : Optional[float],
    ) -> NearCrashEvent:
        severity = "CRITICAL" if len(triggered) >= 2 else "WARNING"
        return NearCrashEvent(
            frame_idx          = self.frame_idx,
            timestamp_utc      = datetime.now(timezone.utc).isoformat(),
            camera_id          = self.publisher.camera_id,
            camera_lat         = self.publisher.lat,
            camera_lon         = self.publisher.lon,
            involved_track_ids = track_ids,
            triggered_rules    = triggered,
            severity           = severity,
            iou                = iou,
            proximity_ratio    = prox,
            ttc_seconds        = ttc,
        )

    # ── Drawing helpers ───────────────────────────────────────────────────

    @staticmethod
    def _draw_corners(img, x1, y1, x2, y2, color, thickness=2, ratio=0.28):
        """Corner-bracket HUD-style box instead of a full rectangle."""
        lx = max(8, int((x2 - x1) * ratio))
        ly = max(8, int((y2 - y1) * ratio))
        for p0, corner, p1 in [
            ((x1, y1 + ly), (x1, y1),  (x1 + lx, y1)),
            ((x2 - lx, y1), (x2, y1),  (x2, y1 + ly)),
            ((x1, y2 - ly), (x1, y2),  (x1 + lx, y2)),
            ((x2 - lx, y2), (x2, y2),  (x2, y2 - ly)),
        ]:
            cv2.line(img, p0, corner, color, thickness, cv2.LINE_AA)
            cv2.line(img, corner, p1,  color, thickness, cv2.LINE_AA)

    @staticmethod
    def _draw_label_chip(img, text, x, y, color, scale=0.50, thickness=1):
        """Text label on a semi-transparent dark pill with a colored underline."""
        (tw, th), bl = cv2.getTextSize(text, Config.FONT, scale, thickness)
        pad = max(2, int(3 * scale / 0.50))
        overlay = img.copy()
        cv2.rectangle(overlay, (x - pad, y - th - pad), (x + tw + pad, y + bl), (8, 8, 20), -1)
        cv2.addWeighted(overlay, 0.72, img, 0.28, 0, img)
        cv2.line(img, (x - pad, y + bl), (x + tw + pad, y + bl), color, thickness, cv2.LINE_AA)
        cv2.putText(img, text, (x, y), Config.FONT, scale, color, thickness, cv2.LINE_AA)

    # ── Annotation ────────────────────────────────────────────────────────

    def _annotate(
        self,
        frame     : np.ndarray,
        active_ids: set,
        events    : List[NearCrashEvent],
    ) -> np.ndarray:
        out       = frame.copy()
        s         = self.ui_scale
        alert_ids = {tid for e in events for tid in e.involved_track_ids}
        pulse     = 0.5 + 0.5 * math.sin(self.frame_idx * 0.15)

        for tid in active_ids:
            if tid not in self.tracks:
                continue
            t = self.tracks[tid]
            if not t.current_box:
                continue

            x1, y1, x2, y2 = (int(v) for v in t.current_box)
            is_alert   = tid in alert_ids
            is_vehicle = t.is_vehicle

            if is_alert:
                color = (0, 0, int(200 + 55 * pulse))
            elif is_vehicle:
                color = (0, 230, 80)
            else:
                color = (255, 140, 0)

            # Fading track trail
            if Config.SHOW_TRACKS and len(t.centers) > 1:
                pts = np.array(list(t.centers), dtype=np.int32)
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    c = tuple(int(v * alpha) for v in color)
                    cv2.line(out, tuple(pts[k - 1]), tuple(pts[k]), c, 1, cv2.LINE_AA)

            # Glow layer for alert boxes (blurred bright outline added to frame)
            if is_alert:
                glow_layer = np.zeros_like(out)
                self._draw_corners(glow_layer, x1, y1, x2, y2, color, max(1, int(4 * s)))
                blur_k = max(3, int(21 * s)) | 1  # must be odd
                glow_layer = cv2.GaussianBlur(glow_layer, (blur_k, blur_k), 0)
                out = cv2.add(out, glow_layer)
                # Pulsing semi-transparent fill
                overlay = out.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                fill_alpha = 0.04 + 0.04 * pulse
                cv2.addWeighted(overlay, fill_alpha, out, 1.0 - fill_alpha, 0, out)

            # Corner-bracket box
            self._draw_corners(out, x1, y1, x2, y2, color, max(1, int(2 * s)))

            # Label chip
            label = f"ID:{tid}"
            if Config.SHOW_VELOCITIES and is_vehicle:
                label += f"  {t.speed:.1f}px/f"
            self._draw_label_chip(out, label, x1, y1 - int(8 * s), color,
                                  scale=0.50 * s, thickness=max(1, int(s)))

            # Path deviation indicator
            dev = path_deviation(t) if Config.ENABLE_PATH_DEVIATION else None
            if dev is not None and dev > Config.px(Config.PATH_DEVIATION_RATIO) * 0.7:
                n_fit = len(t.centers)
                if n_fit >= Config.PATH_FIT_MIN_FRAMES:
                    pts_arr   = np.array(list(t.centers))
                    mean      = pts_arr[:-3].mean(axis=0)
                    centered  = pts_arr[:-3] - mean
                    _, _, vt  = np.linalg.svd(centered)
                    direction = vt[0]
                    line_len  = 60 * s
                    p1 = (mean - direction * line_len).astype(int)
                    p2 = (mean + direction * line_len).astype(int)
                    cv2.line(out, tuple(p1), tuple(p2), (0, 220, 255), max(1, int(s)), cv2.LINE_AA)
                    self._draw_label_chip(out, f"dev {dev:.0f}px", x1, y2 + int(18 * s),
                                          (0, 220, 255), scale=0.42 * s, thickness=max(1, int(s)))

        # Frame / event HUD chip (bottom-right)
        hud_scale = 0.44 * s
        hud_thick = max(1, int(s))
        hud = f"FRAME {self.frame_idx:05d}  |  EVT {len(self.events):03d}"
        (hw, hh), _ = cv2.getTextSize(hud, Config.FONT, hud_scale, hud_thick)
        hx = self.width - hw - int(10 * s)
        hy = self.height - int(10 * s)
        overlay = out.copy()
        cv2.rectangle(overlay, (hx - int(6 * s), hy - hh - int(4 * s)),
                       (self.width - int(4 * s), hy + int(4 * s)), (5, 5, 18), -1)
        cv2.addWeighted(overlay, 0.72, out, 0.28, 0, out)
        cv2.putText(out, hud, (hx, hy), Config.FONT, hud_scale, (100, 200, 255), hud_thick, cv2.LINE_AA)

        return out

    # ── Alert panel (separate window) ────────────────────────────────────

    def _render_alert_panel(self) -> np.ndarray:
        panel_w  = 500
        row_h    = 32
        header_h = 44
        footer_h = 30

        seen_pairs: dict = {}
        for _, evt in reversed(self.display_events):
            key = tuple(sorted(evt.involved_track_ids))
            if key not in seen_pairs:
                seen_pairs[key] = evt
        unique_events = list(reversed(list(seen_pairs.values())))

        n       = max(1, len(unique_events))
        panel_h = header_h + n * row_h + footer_h + 8

        panel = np.full((panel_h, panel_w, 3), (10, 10, 25), dtype=np.uint8)
        pulse = 0.5 + 0.5 * math.sin(self.frame_idx * 0.15)

        # Header
        cv2.rectangle(panel, (0, 0), (panel_w, header_h), (15, 15, 40), -1)
        cv2.line(panel, (0, header_h), (panel_w, header_h), (40, 40, 100), 1)
        cv2.putText(panel, "NEAR-CRASH ALERT MONITOR", (12, 28),
                    Config.FONT, 0.65, (100, 200, 255), 1, cv2.LINE_AA)

        if not unique_events:
            cv2.putText(panel, "No active alerts", (12, header_h + 22),
                        Config.FONT, 0.55, (50, 120, 50), 1, cv2.LINE_AA)
        else:
            for idx, evt in enumerate(unique_events):
                y      = header_h + 4 + idx * row_h
                is_crit = evt.severity == "CRITICAL"
                accent  = (0, 0, 220) if is_crit else (30, 80, 220)
                row_bg  = (25, 5, 5)  if is_crit else (5, 10, 28)
                cv2.rectangle(panel, (0, y), (panel_w, y + row_h - 2), row_bg, -1)
                cv2.rectangle(panel, (0, y + 2), (4, y + row_h - 4), accent, -1)
                tracks_str = "+".join(f"#{t}" for t in evt.involved_track_ids)
                rules_str  = evt.triggered_rules[0] if evt.triggered_rules else ""
                banner     = f"{evt.severity}  {tracks_str}  {rules_str}"
                r_val      = int(155 + 100 * pulse) if is_crit else 210
                text_color = (70, 70, r_val) if is_crit else (70, 120, 210)
                cv2.putText(panel, banner, (12, y + 22),
                            Config.FONT, 0.60, text_color, 1, cv2.LINE_AA)

        # Footer
        footer_y = panel_h - footer_h
        cv2.line(panel, (0, footer_y), (panel_w, footer_y), (40, 40, 100), 1)
        cv2.putText(panel, f"FRAME {self.frame_idx:05d}  |  TOTAL EVENTS {len(self.events):03d}",
                    (12, panel_h - 10), Config.FONT, 0.44, (80, 140, 200), 1, cv2.LINE_AA)

        return panel

    # ── Summary + cleanup ─────────────────────────────────────────────────

    def _print_summary(self):
        total_weight = sum(e.risk_weight for e in self.events)
        print("\n" + "=" * 65)
        print(f"SUMMARY  {self.publisher.camera_id}  "
              f"({self.publisher.lat},{self.publisher.lon})")
        print(f"  Frames processed : {self.frame_idx}")
        print(f"  Unique vehicles  : {len(self.total_vehicles_seen)}")
        print(f"  Total events     : {len(self.events)}")
        crit = sum(1 for e in self.events if e.severity == "CRITICAL")
        warn = sum(1 for e in self.events if e.severity == "WARNING")
        print(f"    CRITICAL       : {crit}")
        print(f"    WARNING        : {warn}")
        print(f"  Total risk_weight: {total_weight}")
        print("=" * 65)

    def _cleanup(self):
        # Wait for active clip thread to finish
        if self.active_clip_thread:
            self.active_clip_thread.join(timeout=10)
        
        self.cap.release()
        if self.restream_proc and self.restream_proc.poll() is None:
            self.restream_proc.terminate()
            try:
                self.restream_proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.restream_proc.kill()
        if self.writer:
            self.writer.release()
        cv2.destroyAllWindows()
        self.publisher.close()
