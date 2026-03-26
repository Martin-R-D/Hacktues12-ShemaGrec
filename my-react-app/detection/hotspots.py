import json
import math
from pathlib import Path
from typing import List

import numpy as np

from config import MERGE_RADIUS_M


class _NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R      = 6_371_000
    to_rad = math.radians
    dLat   = to_rad(lat2 - lat1)
    dLon   = to_rad(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2
         + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dLon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def load_existing_hotspots(path: str) -> List[dict]:
    try:
        text = Path(path).read_text(encoding="utf-8").strip()
        if not text:
            return []
        if text.startswith("["):
            depth = 0
            end   = 0
            for i, ch in enumerate(text):
                if ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end > 0:
                return json.loads(text[:end])
        return []
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return []


def merge_hotspot(existing: List[dict], lat: float, lon: float, weight: int) -> List[dict]:
    for entry in existing:
        e_lat = entry.get("cord_y", 0.0)
        e_lon = entry.get("cord_x", 0.0)
        if _haversine_m(lat, lon, e_lat, e_lon) <= MERGE_RADIUS_M:
            entry["risk_weight"] = entry.get("risk_weight", 0) + weight
            return existing

    existing.append({
        "risk_weight": weight,
        "cord_x": round(lon, 7),
        "cord_y": round(lat, 7),
    })
    return existing


def write_hotspots(path: str, hotspots: List[dict]):
    hotspots.sort(key=lambda h: h.get("risk_weight", 0), reverse=True)
    Path(path).write_text(
        json.dumps(hotspots, indent=2, cls=_NumpyEncoder) + "\n",
        encoding="utf-8",
    )
