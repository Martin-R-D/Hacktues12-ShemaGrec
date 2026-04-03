from typing import List, Optional
import requests
import uuid
from datetime import datetime, timezone

from models import NearCrashEvent


class EventPublisher:
    def __init__(
        self,
        log_path: Optional[str],
        camera_id: str,
        lat: float,
        lon: float,
        dry_run: bool = False,
        api_url: str = "http://localhost:8005",
        max_retries: int = 3,
    ):
        self.camera_id = camera_id
        self.lat = lat
        self.lon = lon
        self.log_path = log_path  # deprecated but kept for backward compat
        self.dry_run = dry_run
        self.api_url = api_url
        self.max_retries = max_retries
        self.events: List[NearCrashEvent] = []

    def publish(self, evt: NearCrashEvent):
        """Publish event to Detection Service API."""
        print(f"  EVENT  {evt}")
        self.events.append(evt)

        if self.dry_run:
            print(f"    [DRY RUN] Event logged only, no API upload")
            return

        # Post to API immediately
        payload = {
            "eventId": str(uuid.uuid4()),  # Unique dedup key
            "cameraId": self.camera_id,
            "eventTime": datetime.now(timezone.utc).isoformat(),
            "lat": self.lat,
            "lng": self.lon,
            "riskWeight": evt.risk_weight,
            "sourceType": "near" if evt.is_near_crash else "actual",
        }

        success = False
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = requests.post(
                    f"{self.api_url}/api/events",
                    json=payload,
                    timeout=5,
                )
                if resp.status_code in (200, 202):
                    print(f"    → Posted to {self.api_url}: {resp.status_code}")
                    success = True
                    break
                else:
                    print(f"    ✗ API error {resp.status_code}: {resp.text[:100]}")
            except requests.exceptions.RequestException as e:
                print(f"    ✗ Attempt {attempt}/{self.max_retries} failed: {e}")
                if attempt < self.max_retries:
                    print(f"    → Retrying in 2s...")
                    import time
                    time.sleep(2)

        if not success:
            print(f"    ⚠ Failed to post event after {self.max_retries} attempts")
            if self.log_path:
                print(f"    → Falling back to local log: {self.log_path}")
                # Fallback: write to local file if API unreachable
                self._write_to_file(payload)

    def _write_to_file(self, payload: dict):
        """Fallback: write event to local JSON log."""
        import json
        if not self.log_path:
            return
        try:
            with open(self.log_path, "a") as f:
                f.write(json.dumps(payload) + "\n")
        except Exception as e:
            print(f"    ✗ Fallback write failed: {e}")

    def close(self):
        """Finalize publisher (cleanup, final flush)."""
        total_weight = sum(e.risk_weight for e in self.events)
        print(
            f"[INFO] Publisher closed. "
            f"Events: {len(self.events)}, Total weight: {total_weight}"
        )
