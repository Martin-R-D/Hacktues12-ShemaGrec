import type { HotspotIncident, NearCrashEvent, UiSeverity } from '../types/nearCrash'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function severityToUiSeverity(severity: NearCrashEvent['severity']): UiSeverity {
  return severity === 'CRITICAL' ? 'high' : 'medium'
}

function riskWeightFromEvent(event: NearCrashEvent) {
  const severityBase = event.severity === 'CRITICAL' ? 7 : 4
  const ttcPenalty = event.metrics.ttc_seconds !== null && event.metrics.ttc_seconds < 1.5 ? 2 : 0
  const overlapBoost = Math.min(2, Math.max(0, event.metrics.iou * 4))
  return Math.max(2, Math.min(12, severityBase + ttcPenalty + overlapBoost))
}

function cameraIdToNumericId(cameraId: string) {
  let hash = 0
  for (let i = 0; i < cameraId.length; i += 1) {
    hash = (hash * 31 + cameraId.charCodeAt(i)) % 100000
  }
  return hash
}

function mostSevere(a: UiSeverity, b: UiSeverity): UiSeverity {
  const rank: Record<UiSeverity, number> = { low: 1, medium: 2, high: 3 }
  return rank[a] >= rank[b] ? a : b
}

export function parseNearCrashEvent(input: unknown): NearCrashEvent | null {
  if (!isRecord(input) || !isRecord(input.metrics)) return null

  const eventId = typeof input.event_id === 'string' ? input.event_id : null
  const timestampUtc = typeof input.timestamp_utc === 'string' ? input.timestamp_utc : null
  const frameIdx = asNumber(input.frame_idx)
  const cameraId = typeof input.camera_id === 'string' ? input.camera_id : null
  const cameraLat = asNumber(input.camera_lat)
  const cameraLon = asNumber(input.camera_lon)
  const severity = input.severity === 'WARNING' || input.severity === 'CRITICAL' ? input.severity : null

  const triggeredRules = Array.isArray(input.triggered_rules)
    ? input.triggered_rules.filter((item): item is string => typeof item === 'string')
    : null
  const involvedTracks = Array.isArray(input.involved_tracks)
    ? input.involved_tracks.filter((item): item is number => typeof item === 'number')
    : null

  const iou = asNumber(input.metrics.iou)
  const proximityRatio = asNumber(input.metrics.proximity_ratio)
  const ttcSeconds = input.metrics.ttc_seconds === null ? null : asNumber(input.metrics.ttc_seconds)
  const closingSpeedPx = input.metrics.closing_speed_px === null ? null : asNumber(input.metrics.closing_speed_px)

  if (
    !eventId ||
    !timestampUtc ||
    frameIdx === null ||
    !cameraId ||
    cameraLat === null ||
    cameraLon === null ||
    !severity ||
    !triggeredRules ||
    !involvedTracks ||
    iou === null ||
    proximityRatio === null ||
    ttcSeconds === undefined ||
    closingSpeedPx === undefined
  ) {
    return null
  }

  return {
    event_id: eventId,
    schema_version: typeof input.schema_version === 'string' ? input.schema_version : '1.0',
    timestamp_utc: timestampUtc,
    frame_idx: Math.trunc(frameIdx),
    camera_id: cameraId,
    camera_lat: cameraLat,
    camera_lon: cameraLon,
    severity,
    triggered_rules: triggeredRules,
    involved_tracks: involvedTracks,
    metrics: {
      iou,
      proximity_ratio: proximityRatio,
      ttc_seconds: ttcSeconds,
      closing_speed_px: closingSpeedPx,
    },
  }
}

export function parseNdjsonLine(line: string): NearCrashEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    return parseNearCrashEvent(JSON.parse(trimmed))
  } catch {
    return null
  }
}

export function upsertIncidentFromEvent(previous: HotspotIncident[], event: NearCrashEvent): HotspotIncident[] {
  const existingIndex = previous.findIndex((incident) => incident.camera === event.camera_id)
  const newSeverity = severityToUiSeverity(event.severity)
  const newWeight = riskWeightFromEvent(event)

  if (existingIndex === -1) {
    return [
      {
        id: cameraIdToNumericId(event.camera_id),
        lat: event.camera_lat,
        lng: event.camera_lon,
        weight: newWeight,
        severity: newSeverity,
        location: `Camera hotspot ${event.camera_id}`,
        count: 1,
        camera: event.camera_id,
        lastSeenAt: event.timestamp_utc,
      },
      ...previous,
    ]
  }

  return previous.map((incident, index) => {
    if (index !== existingIndex) return incident

    return {
      ...incident,
      lat: event.camera_lat,
      lng: event.camera_lon,
      weight: Math.min(12, incident.weight * 0.75 + newWeight * 0.25),
      severity: mostSevere(incident.severity, newSeverity),
      count: incident.count + 1,
      lastSeenAt: event.timestamp_utc,
    }
  })
}
