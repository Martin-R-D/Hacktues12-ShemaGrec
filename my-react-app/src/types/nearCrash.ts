export type NearCrashSeverity = 'WARNING' | 'CRITICAL'

export type NearCrashEvent = {
  event_id: string
  schema_version: '1.0' | string
  timestamp_utc: string
  frame_idx: number
  camera_id: string
  camera_lat: number
  camera_lon: number
  severity: NearCrashSeverity
  triggered_rules: string[]
  involved_tracks: number[]
  metrics: {
    iou: number
    proximity_ratio: number
    ttc_seconds: number | null
    closing_speed_px: number | null
  }
}

export type UiSeverity = 'high' | 'medium' | 'low'

export type HotspotIncident = {
  id: number
  lat: number
  lng: number
  weight: number
  severity: UiSeverity
  location: string
  count: number
  camera: string
  lastSeenAt: string
}
