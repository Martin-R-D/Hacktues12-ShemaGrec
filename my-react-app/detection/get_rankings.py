"""
get_rankings.py
===============
Usage:
python get_rankings.py --real-crashes output.json --events-url http://localhost:8005 --post-url http://localhost:8005 --interval-seconds 120

Returns a sorted list of the riskiest hotspots by combining:

    - output.json    — real confirmed crashes (high weight)
    - /api/events    — aggregated near-crashes from Detection Service API (lower weight,
                                         scaled by a statistical confidence factor that grows
                                         with sample size so sparse data is penalised)

Output:
        [ { "rank": 1, "cord_x": ..., "cord_y": ..., "score": ... }, ... ]
"""

import json
import math
import os
import time
from pathlib import Path
from typing import List, Optional

import requests

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


def _load_detected_from_api(api_url: str, limit: int = 2000) -> List[dict]:
    response = requests.get(
        f"{api_url.rstrip('/')}/api/events",
        params={"limit": limit},
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("events", [])
    return [
        {
            "cord_x": float(row.get("cord_x", 0.0)),
            "cord_y": float(row.get("cord_y", 0.0)),
            "risk_weight": float(row.get("risk_weight", 0.0)),
        }
        for row in rows
    ]


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
    detected_file    : str = "",
    events_url       : str = "http://localhost:8005",
    top              : Optional[int] = None,
) -> List[dict]:
    """
    Returns a list of hotspots sorted by descending risk score.

    Parameters
    ----------
    real_crashes_file : path to confirmed-crash hotspots (output.json)
    detected_file     : optional fallback path to detected near-crash hotspots JSON
    events_url        : Detection Service base URL used when detected_file is not provided
    top               : if set, return only the top-N results
    """
    real_crashes = _load(real_crashes_file)
    if detected_file:
        detected = _load(detected_file)
    else:
        detected = _load_detected_from_api(events_url)

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


def post_rankings(
    rankings: List[dict],
    api_url: str,
    timeout_seconds: int = 10,
) -> None:
    payload = {"hotspots": rankings}
    response = requests.post(
        f"{api_url.rstrip('/')}/api/hotspots/snapshot",
        json=payload,
        timeout=timeout_seconds,
    )
    response.raise_for_status()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Hotspot risk ranking")
    p.add_argument("--real-crashes", default="output.json")
    p.add_argument("--detected",     default="",
                   help="Optional detected hotspots JSON fallback. If omitted, reads from Detection Service /api/events.")
    p.add_argument("--events-url", default=os.getenv("DETECTION_API_URL", "http://localhost:8005"))
    p.add_argument("--top",          type=int, default=None)
    p.add_argument("--output-path", default="rankings.json")
    p.add_argument("--post-url",    default="")
    p.add_argument("--interval-seconds", type=int, default=0)
    args = p.parse_args()

    def run_once() -> None:
        rankings = get_rankings(
            real_crashes_file=args.real_crashes,
            detected_file=args.detected,
            events_url=args.events_url,
            top=args.top,
        )
        print(json.dumps(rankings, indent=2))

        Path(args.output_path).write_text(
            json.dumps(rankings, indent=2) + "\n",
            encoding="utf-8",
        )

        if args.post_url:
            post_rankings(rankings, args.post_url)
            print(f"[INFO] Posted {len(rankings)} hotspots to {args.post_url}")

    if args.interval_seconds > 0:
        print(f"[INFO] Running scheduled rankings job every {args.interval_seconds}s")
        while True:
            try:
                run_once()
            except Exception as exc:
                print(f"[ERROR] Scheduled rankings run failed: {exc}")
            time.sleep(args.interval_seconds)
    else:
        run_once()
