import type { NearCrashEvent, NearCrashSeverity } from '../types/nearCrash'

type StreamCallback = (event: NearCrashEvent) => void

const CAMERAS = [
  { id: 'CAM_01', lat: 42.6977, lon: 23.3219 },
  { id: 'CAM_02', lat: 42.6934, lon: 23.3189 },
  { id: 'CAM_03', lat: 42.7008, lon: 23.3301 },
  { id: 'CAM_04', lat: 42.6951, lon: 23.3105 },
  { id: 'CAM_05', lat: 42.6899, lon: 23.335 },
]

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function buildTriggeredRules(severity: NearCrashSeverity, ttcSeconds: number | null, iou: number) {
  const rules = [`OVERLAP(IoU=${iou.toFixed(2)})`]
  if (ttcSeconds !== null && ttcSeconds < 1.5) rules.push(`TTC(${ttcSeconds.toFixed(2)}s)`)
  if (severity === 'CRITICAL' && Math.random() > 0.55) rules.push(`PROXIMITY(ratio=${(0.3 + Math.random() * 0.4).toFixed(2)})`)
  return rules
}

function createMockEvent(frameIdx: number): NearCrashEvent {
  const camera = randomFrom(CAMERAS)
  const severity: NearCrashSeverity = Math.random() > 0.65 ? 'CRITICAL' : 'WARNING'
  const iou = Number((0.05 + Math.random() * 0.25).toFixed(4))
  const ttcSeconds = Math.random() > 0.2 ? Number((0.7 + Math.random() * 2.1).toFixed(2)) : null

  return {
    event_id: crypto.randomUUID(),
    schema_version: '1.0',
    timestamp_utc: new Date().toISOString(),
    frame_idx: frameIdx,
    camera_id: camera.id,
    camera_lat: camera.lat,
    camera_lon: camera.lon,
    severity,
    triggered_rules: buildTriggeredRules(severity, ttcSeconds, iou),
    involved_tracks: [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20) + 20],
    metrics: {
      iou,
      proximity_ratio: Number((0.2 + Math.random() * 0.6).toFixed(2)),
      ttc_seconds: ttcSeconds,
      closing_speed_px: Number((1.2 + Math.random() * 8.5).toFixed(2)),
    },
  }
}

export function startMockNearCrashStream(onEvent: StreamCallback, intervalMs = 3000) {
  let frameIdx = 1000
  const timer = window.setInterval(() => {
    frameIdx += Math.floor(20 + Math.random() * 60)
    onEvent(createMockEvent(frameIdx))
  }, intervalMs)

  return () => window.clearInterval(timer)
}
