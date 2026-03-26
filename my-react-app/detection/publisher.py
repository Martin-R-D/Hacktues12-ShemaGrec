from typing import List, Optional

from models import NearCrashEvent
from hotspots import load_existing_hotspots, merge_hotspot, write_hotspots


class EventPublisher:
    def __init__(self, log_path: Optional[str], camera_id: str, lat: float, lon: float):
        self.camera_id = camera_id
        self.lat       = lat
        self.lon       = lon
        self.log_path  = log_path
        self.events: List[NearCrashEvent] = []

    def publish(self, evt: NearCrashEvent):
        print(f"  EVENT  {evt}")
        self.events.append(evt)

    def close(self):
        if not self.log_path:
            return

        total_weight = sum(e.risk_weight for e in self.events)
        if total_weight == 0:
            return

        hotspots = load_existing_hotspots(self.log_path)
        merge_hotspot(hotspots, self.lat, self.lon, total_weight)
        write_hotspots(self.log_path, hotspots)
        print(f"[INFO] Wrote {len(hotspots)} hotspot(s) to {self.log_path}")
