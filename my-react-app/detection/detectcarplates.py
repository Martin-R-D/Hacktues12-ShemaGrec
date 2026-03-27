"""
detectcarplates.py — License plate detection + OCR.

Pipeline:
  1. YOLOv8  — detect & track vehicles (reuses existing model)
  2. OpenCV  — find the plate rectangle inside each vehicle crop
  3. EasyOCR — read the plate text

Install extra dep:
  pip install easyocr

Usage:
  python detectcarplates.py --source 0
  python detectcarplates.py --source video.mp4
  python detectcarplates.py --source "rtsp://admin:admin@192.168.1.X:554/live/ch0"
"""

import argparse

import cv2
import numpy as np
from ultralytics import YOLO

from config import Config

try:
    from db import PlateDB
    _DB_OK = True
except Exception as e:
    _DB_OK = False
    print(f"[WARN] Could not import PlateDB: {e}")

try:
    import easyocr
    _EASYOCR_OK = True
except ImportError:
    _EASYOCR_OK = False
    print("[WARN] easyocr not installed — OCR disabled.  Run: pip install easyocr")


# ── Plate localisation (morphological ANPR approach) ─────────────────────

def find_plate_region(
    vehicle_crop: np.ndarray,
) -> tuple[int, int, int, int] | None:
    """
    Use morphological blackhat + gradient to find dense text regions
    (license plates) inside the lower 65 % of a vehicle crop.
    Much more robust than Canny contours for moving cars.

    Returns (x1, y1, x2, y2) relative to the FULL crop, or None.
    """
    h, w = vehicle_crop.shape[:2]
    y_off = int(h * 0.35)
    roi   = vehicle_crop[y_off:, :]

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # Blackhat morphology: reveals dark text on light background
    rect_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat  = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rect_kern)

    # Amplify bright regions (light plate background)
    light_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 3))
    light = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, light_kern)
    _, light = cv2.threshold(light, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    # Gradient of blackhat to find character edges
    sq_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    gradX = cv2.morphologyEx(blackhat, cv2.MORPH_GRADIENT, sq_kern)
    gradX = cv2.convertScaleAbs(gradX)

    _, thresh = cv2.threshold(gradX, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, rect_kern)
    thresh = cv2.erode(thresh, None, iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    best = None
    best_score = 0

    for cnt in contours:
        bx, by, bw, bh = cv2.boundingRect(cnt)
        aspect = bw / max(bh, 1)
        area   = bw * bh
        # Plate aspect ratio 2–6, minimum size, not too tall
        if not (2.0 <= aspect <= 6.5 and area > 800 and bh > 12):
            continue
        # Prefer candidates with larger area * aspect-ratio fitness
        fitness = area * min(aspect / 4.0, 1.0)
        if fitness > best_score:
            best_score = fitness
            best = (bx, by + y_off, bx + bw, by + y_off + bh)

    return best


def _preprocess_for_ocr(plate_crop: np.ndarray) -> list[np.ndarray]:
    """Return several preprocessed versions of the plate to try OCR on."""
    # Upscale to a fixed height for consistent OCR
    target_h = 64
    scale = max(1.0, target_h / max(plate_crop.shape[0], 1))
    resized = cv2.resize(plate_crop, None, fx=scale, fy=scale,
                         interpolation=cv2.INTER_CUBIC)

    gray    = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    # Version 1: simple threshold
    _, th1  = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    # Version 2: adaptive threshold (handles uneven lighting)
    th2     = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY, 11, 2)
    # Version 3: sharpened grayscale
    kernel  = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharp   = cv2.filter2D(gray, -1, kernel)

    return [resized, th1, th2, sharp]


def read_plate_text(plate_crop: np.ndarray, reader) -> str:
    """Try multiple preprocessed versions; return the most confident result."""
    if reader is None or plate_crop.size == 0:
        return ""

    best_text  = ""
    best_conf  = 0.0

    for variant in _preprocess_for_ocr(plate_crop):
        results = reader.readtext(
            variant,
            allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            detail=1,
            paragraph=False,
        )
        for (_, text, conf) in results:
            text = text.strip().upper()
            # Plates are typically 4–9 characters
            if conf > best_conf and 3 <= len(text) <= 10:
                best_conf = conf
                best_text = text

    return best_text if best_conf > 0.15 else ""


# ── Main detector class ───────────────────────────────────────────────────

class PlateDetector:
    # Re-run OCR on a track only once every N frames (saves CPU)
    OCR_INTERVAL = 15

    def __init__(self, source: str, show: bool = True):
        self.source = source
        self.show   = show

        print(f"[INFO] Loading {Config.MODEL_WEIGHTS} ...")
        self.model = YOLO(Config.MODEL_WEIGHTS)

        self.reader = None
        if _EASYOCR_OK:
            print("[INFO] Loading EasyOCR (first run downloads ~100 MB) ...")
            self.reader = easyocr.Reader(["en"], gpu=Config.DEVICE == "cuda")
        else:
            print("[WARN] Running without OCR — only plate rectangles will be shown.")

        self.cap = cv2.VideoCapture(
            int(source) if source.isdigit() else source
        )
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open source: {source}")

        self.frame_idx    = 0
        self.plate_cache  : dict[int, str] = {}   # tid → last plate text
        self.ocr_cooldown : dict[int, int] = {}   # tid → frame of last OCR

        self.db: PlateDB | None = None
        if _DB_OK:
            try:
                self.db = PlateDB()
            except Exception as e:
                print(f"[WARN] DB unavailable — running without database. ({e})")

    # ── Loop ──────────────────────────────────────────────────────────────

    def run(self):
        print("[INFO] Running ... press 'q' to quit.")
        if self.show:
            cv2.namedWindow("Plate Detector", cv2.WINDOW_NORMAL)
            w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w >= 1280 and h >= 720:
                cv2.resizeWindow("Plate Detector", 1280, 720)
            else:
                cv2.resizeWindow("Plate Detector", w, h)
        try:
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    break
                self.frame_idx += 1
                annotated = self._process_frame(frame)
                if self.show:
                    cv2.imshow("Plate Detector", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
        finally:
            self.cap.release()
            cv2.destroyAllWindows()
            if self.db:
                self.db.close()

    # ── Per-frame ─────────────────────────────────────────────────────────

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        results = self.model.track(
            frame,
            persist  = True,
            tracker  = Config.TRACKER,
            conf     = Config.CONFIDENCE_THRESHOLD,
            iou      = Config.IOU_NMS_THRESHOLD,
            classes  = list(Config.VEHICLE_CLASS_IDS),
            device   = Config.DEVICE,
            verbose  = False,
        )

        out = frame.copy()

        if results[0].boxes is None or results[0].boxes.id is None:
            return out

        boxes = results[0].boxes.xyxy.cpu().numpy()
        ids   = results[0].boxes.id.cpu().numpy().astype(int)

        for box, tid in zip(boxes, ids):
            x1, y1, x2, y2 = (int(v) for v in box)
            color = (0, 220, 80)

            self._draw_corners(out, x1, y1, x2, y2, color)

            last_ocr = self.ocr_cooldown.get(tid, -self.OCR_INTERVAL)
            if self.frame_idx - last_ocr >= self.OCR_INTERVAL:
                self.ocr_cooldown[tid] = self.frame_idx
                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    region = find_plate_region(crop)
                    if region is not None:
                        px1, py1, px2, py2 = region
                        plate_crop = crop[py1:py2, px1:px2]
                        text = read_plate_text(plate_crop, self.reader)
                        if text:
                            self.plate_cache[tid] = text
                            if self.db:
                                self.db.record(text, event_type="SEEN")
                        cv2.rectangle(
                            out,
                            (x1 + px1, y1 + py1),
                            (x1 + px2, y1 + py2),
                            (0, 230, 230), 2,
                        )

            plate_text = self.plate_cache.get(tid, "")
            label = f"#{tid}" + (f"  {plate_text}" if plate_text else "")
            self._draw_label_chip(out, label, x1, y1 - 8, color)

        cv2.putText(
            out, f"FRAME {self.frame_idx:05d}",
            (10, 28), Config.FONT, 0.55, (120, 200, 255), 1, cv2.LINE_AA,
        )
        return out

    # ── Drawing helpers ───────────────────────────────────────────────────

    @staticmethod
    def _draw_corners(img, x1, y1, x2, y2, color, thickness=2, ratio=0.28):
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
    def _draw_label_chip(img, text, x, y, color, scale=0.52, thickness=1):
        (tw, th), bl = cv2.getTextSize(text, Config.FONT, scale, thickness)
        pad = 3
        overlay = img.copy()
        cv2.rectangle(overlay, (x - pad, y - th - pad), (x + tw + pad, y + bl), (8, 8, 20), -1)
        cv2.addWeighted(overlay, 0.72, img, 0.28, 0, img)
        cv2.line(img, (x - pad, y + bl), (x + tw + pad, y + bl), color, 1, cv2.LINE_AA)
        cv2.putText(img, text, (x, y), Config.FONT, scale, color, thickness, cv2.LINE_AA)


# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="License plate detector")
    p.add_argument("--source", required=True,
                   help="Camera index (0, 1…), video file, or RTSP URL")
    p.add_argument("--no-show", action="store_true", help="Disable display window")
    args = p.parse_args()

    PlateDetector(source=args.source, show=not args.no_show).run()