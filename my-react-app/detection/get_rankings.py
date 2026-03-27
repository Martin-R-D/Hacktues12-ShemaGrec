"""
get_rankings.py
===============
Returns a sorted list of the riskiest hotspots by combining:

  - output.json   — real confirmed crashes (high weight)
  - events.ndjson — near-crashes detected by the detector (lower weight,
                    scaled by a statistical confidence factor that grows
                    with sample size so sparse data is penalised)

Both files share the same format:
    [ { "risk_weight": <int>, "cord_x": <lon>, "cord_y": <lat> }, ... ]

Output:
    [ { "rank": 1, "cord_x": ..., "cord_y": ..., "score": ... }, ... ]
"""

import json
import math
from pathlib import Path
from typing import List, Optional

# ---------------------------------------------------------------------------
# Weights & tuning
# ---------------------------------------------------------------------------

REAL_CRASH_WEIGHT = 3.0   # multiplier for confirmed-crash entries
DETECTED_WEIGHT   = 1.0   # base multiplier for detected near-crash entries
CONFIDENCE_K      = 0.05  # confidence growth rate: conf = 1 - exp(-k * Σ detected_weights)
                           # at Σ=20 → conf≈0.63, at Σ=60 → conf≈0.95
MERGE_RADIUS_M    = 50.0  # hotspots within this distance (metres) are merged


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R      = 6_371_000
    to_rad = math.radians
    dLat   = to_rad(lat2 - lat1)
    dLon   = to_rad(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2
         + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dLon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def _load(path: str) -> List[dict]:
    try:
        text = Path(path).read_text(encoding="utf-8").strip()
        return json.loads(text) if text else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _merge(hotspots: List[dict], lat: float, lon: float, score: float) -> None:
    for h in hotspots:
        if _haversine_m(lat, lon, h["cord_y"], h["cord_x"]) <= MERGE_RADIUS_M:
            h["score"] += score
            return
    hotspots.append({"cord_x": round(lon, 7), "cord_y": round(lat, 7), "score": score})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_rankings(
    real_crashes_file: str = "output.json",
    detected_file    : str = "events.ndjson",
    top              : Optional[int] = None,
) -> List[dict]:
    """
    Returns a list of hotspots sorted by descending risk score.

    Parameters
    ----------
    real_crashes_file : path to confirmed-crash hotspots (output.json)
    detected_file     : path to detected near-crash hotspots (events.ndjson)
    top               : if set, return only the top-N results
    """
    real_crashes = _load(real_crashes_file)
    detected     = _load(detected_file)

    # Confidence in detected events grows with total accumulated weight.
    total_detected = sum(h.get("risk_weight", 0) for h in detected)
    confidence     = 1.0 - math.exp(-CONFIDENCE_K * total_detected)

    hotspots: List[dict] = []

    for h in real_crashes:
        score = h.get("risk_weight", 0) * REAL_CRASH_WEIGHT
        _merge(hotspots, h["cord_y"], h["cord_x"], score)

    for h in detected:
        score = h.get("risk_weight", 0) * DETECTED_WEIGHT * confidence
        _merge(hotspots, h["cord_y"], h["cord_x"], score)

    hotspots.sort(key=lambda h: h["score"], reverse=True)

    result = [
        {
            "rank"  : i + 1,
            "cord_x": h["cord_x"],
            "cord_y": h["cord_y"],
            "score" : round(h["score"], 3),
        }
        for i, h in enumerate(hotspots)
    ]

    return result[:top] if top else result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Hotspot risk ranking")
    p.add_argument("--real-crashes", default="output.json")
    p.add_argument("--detected",     default="events.ndjson")
    p.add_argument("--top",          type=int, default=None)
    p.add_argument("--output-path", default="rankings.json")
    args = p.parse_args()

    rankings = get_rankings(args.real_crashes, args.detected, args.top)
    print(json.dumps(rankings, indent=2))

    Path(args.output_path).write_text(
        json.dumps(rankings, indent=2) + "\n",
        encoding="utf-8",
    )
