import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type Severity = 'high' | 'medium' | 'low'

type IncidentEvent = {
  lat: number
  lng: number
  weight: number
}

type Incident = IncidentEvent & {
  id: number
  severity: Severity
  location: string
  count: number
  camera: string
}

type RouteInfo = {
  distance: string
  duration: string
  avoided: number
}

type TravelMode = 'DRIVING' | 'WALKING'

type LatLngLike = {
  lat(): number
  lng(): number
}

type MapMouseEventLike = {
  latLng: LatLngLike | null
}

type MapsEventListenerLike = {
  remove(): void
}

type GoogleMapLike = {
  panTo(coords: { lat: number; lng: number }): void
  setZoom(level: number): void
  addListener(eventName: string, handler: (event: MapMouseEventLike) => void): MapsEventListenerLike
}

type MarkerLike = {
  addListener(eventName: string, handler: () => void): void
  setMap(map: GoogleMapLike | null): void
  setVisible(visible: boolean): void
}

type HeatmapLike = {
  setMap(map: GoogleMapLike | null): void
}

type DirectionsResultLike = {
  routes: Array<{
    overview_path?: LatLngLike[]
    legs: Array<{
      distance?: { text?: string; value?: number }
      duration?: { text?: string; value?: number }
    }>
  }>
}

type DirectionsRendererLike = {
  setMap(map: GoogleMapLike | null): void
  setDirections(result: DirectionsResultLike): void
  setRouteIndex(routeIndex: number): void
}

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLDivElement, options: object) => GoogleMapLike
    Marker: new (options: object) => MarkerLike
    LatLng: new (lat: number, lng: number) => object
    SymbolPath: { CIRCLE: object }
    TravelMode: { DRIVING: string; WALKING: string }
    DirectionsService: new () => {
      route(options: object): Promise<DirectionsResultLike>
    }
    DirectionsRenderer: new (options: object) => DirectionsRendererLike
    visualization: {
      HeatmapLayer: new (options: object) => HeatmapLike
    }
  }
}

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCLgzXOx7SL0WDyTvSEzC3ui33lz3rlqy4'

const INCIDENTS: IncidentEvent[] = [
  { lat: 42.6977, lng: 23.3219, weight: 10 },
  { lat: 42.6934, lng: 23.3189, weight: 8 },
  { lat: 42.7008, lng: 23.3301, weight: 5 },
  { lat: 42.6951, lng: 23.3105, weight: 4 },
  { lat: 42.7055, lng: 23.3268, weight: 3 },
  { lat: 42.6899, lng: 23.335, weight: 7 },
  { lat: 42.708, lng: 23.315, weight: 3 },
  { lat: 42.692, lng: 23.342, weight: 6 },
]

const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  high: { color: '#E24B4A', label: 'High' },
  medium: { color: '#EF9F27', label: 'Medium' },
  low: { color: '#639922', label: 'Low' },
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e8e4dc',
  fontSize: 13,
  outline: 'none',
} satisfies CSSProperties

function getGoogle() {
  return (window as Window & { google?: GoogleMapsApi }).google
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6371000
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h))
}

function getRoutePoints(route: DirectionsResultLike['routes'][number]) {
  return route.overview_path ?? []
}

function parseLatLngInput(value: string) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null

  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { lat, lng }
}

function severityFromWeight(weight: number): Severity {
  if (weight >= 7) return 'high'
  if (weight >= 4) return 'medium'
  return 'low'
}

function useGoogleMaps(apiKey: string) {
  const [loaded, setLoaded] = useState(() => Boolean(getGoogle()?.maps))

  useEffect(() => {
    if (getGoogle()?.maps) {
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="true"]')
    if (existing) {
      existing.addEventListener('load', () => setLoaded(true), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization`
    script.async = true
    script.defer = true
    script.dataset.googleMapsLoader = 'true'
    script.onload = () => setLoaded(true)
    document.head.appendChild(script)
  }, [apiKey])

  return loaded
}

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<GoogleMapLike | null>(null)
  const mapClickListenerRef = useRef<MapsEventListenerLike | null>(null)
  const originMarkerRef = useRef<MarkerLike | null>(null)
  const destinationMarkerRef = useRef<MarkerLike | null>(null)
  const markersRef = useRef<MarkerLike[]>([])
  const heatmapRef = useRef<HeatmapLike | null>(null)
  const directionsRendererRef = useRef<DirectionsRendererLike | null>(null)

  const mapsLoaded = useGoogleMaps(GOOGLE_MAPS_API_KEY)

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING')
  const [avoidDanger, setAvoidDanger] = useState(true)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [routeError, setRouteError] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [showMarkers, setShowMarkers] = useState(true)
  const [mapPickMode, setMapPickMode] = useState<'origin' | 'destination' | null>(null)
  const [tab, setTab] = useState<'heatmap' | 'route'>('heatmap')

  const incidents = useMemo<Incident[]>(
    () =>
      INCIDENTS.map((event, index) => ({
        ...event,
        id: index + 1,
        severity: severityFromWeight(event.weight),
        location: `Hotspot ${index + 1}`,
        count: Math.max(1, Math.round(event.weight / 2)),
        camera: `CAM-${String(index + 1).padStart(2, '0')}`,
      })),
    [],
  )

  const sortedIncidents = useMemo(() => [...incidents].sort((a, b) => b.weight - a.weight), [incidents])
  const highRiskCount = useMemo(() => incidents.filter((item) => item.severity === 'high').length, [incidents])

  const addMarkers = useCallback((map: GoogleMapLike) => {
    const google = getGoogle()
    if (!google?.maps) return

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    incidents.forEach((incident) => {
      const marker = new google.maps.Marker({
        position: { lat: incident.lat, lng: incident.lng },
        map,
        title: incident.location,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: SEVERITY_META[incident.severity].color,
          fillOpacity: 0.95,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      })

      marker.addListener('click', () => setSelectedIncident(incident))
      markersRef.current.push(marker)
    })
  }, [incidents])

  const placeRoutePointMarker = useCallback((kind: 'origin' | 'destination', coords: { lat: number; lng: number }) => {
    const google = getGoogle()
    const map = mapInstanceRef.current
    if (!google?.maps || !map) return

    const markerRef = kind === 'origin' ? originMarkerRef : destinationMarkerRef
    markerRef.current?.setMap(null)

    markerRef.current = new google.maps.Marker({
      position: coords,
      map,
      title: kind === 'origin' ? 'Route origin' : 'Route destination',
      label: kind === 'origin' ? 'A' : 'B',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: kind === 'origin' ? '#3B6D11' : '#1E88E5',
        fillOpacity: 0.95,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    })
  }, [])

  useEffect(() => {
    const google = getGoogle()
    if (!mapsLoaded || !mapRef.current || !google?.maps) return

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 42.6977, lng: 23.3219 },
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8e4dc' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
      ],
    })

    mapInstanceRef.current = map
    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: INCIDENTS.map((incident) => ({
        location: new google.maps.LatLng(incident.lat, incident.lng),
        weight: incident.weight,
      })),
      map,
      radius: 50,
      opacity: 0.75,
    })

    directionsRendererRef.current = new google.maps.DirectionsRenderer({
      polylineOptions: { strokeColor: '#3B6D11', strokeWeight: 5, strokeOpacity: 0.85 },
    })

    addMarkers(map)

    return () => {
      mapClickListenerRef.current?.remove()
      mapClickListenerRef.current = null
      originMarkerRef.current?.setMap(null)
      destinationMarkerRef.current?.setMap(null)
      originMarkerRef.current = null
      destinationMarkerRef.current = null
      markersRef.current.forEach((marker) => marker.setMap(null))
      directionsRendererRef.current?.setMap(null)
      heatmapRef.current?.setMap(null)
    }
  }, [addMarkers, mapsLoaded])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    mapClickListenerRef.current?.remove()
    mapClickListenerRef.current = map.addListener('click', (event) => {
      if (!event.latLng || !mapPickMode) return

      const picked = `${event.latLng.lat().toFixed(6)}, ${event.latLng.lng().toFixed(6)}`

      if (mapPickMode === 'origin') {
        setOrigin(picked)
        setMapPickMode('destination')
      } else {
        setDestination(picked)
        setMapPickMode(null)
      }
      setTab('route')
    })

    return () => {
      mapClickListenerRef.current?.remove()
      mapClickListenerRef.current = null
    }
  }, [mapPickMode, mapsLoaded])

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.setVisible(showMarkers))
  }, [showMarkers])

  useEffect(() => {
    const coords = parseLatLngInput(origin)
    if (!coords) {
      originMarkerRef.current?.setMap(null)
      originMarkerRef.current = null
      return
    }

    placeRoutePointMarker('origin', coords)
  }, [origin, placeRoutePointMarker])

  useEffect(() => {
    const coords = parseLatLngInput(destination)
    if (!coords) {
      destinationMarkerRef.current?.setMap(null)
      destinationMarkerRef.current = null
      return
    }

    placeRoutePointMarker('destination', coords)
  }, [destination, placeRoutePointMarker])

  const calcRoute = useCallback(async () => {
    const google = getGoogle()
    if (!google?.maps || !origin || !destination || !mapInstanceRef.current) return

    setRouteLoading(true)
    setRouteError('')
    setRouteInfo(null)

    const highRisk = incidents.filter((item) => item.severity === 'high')
    const service = new google.maps.DirectionsService()
    const hotspotRadiusMeters = 50

    try {
      const result = await service.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode[travelMode],
        provideRouteAlternatives: avoidDanger,
      })

      let selectedRouteIndex = 0

      if (avoidDanger && result.routes.length > 1) {
        const routeMetrics = result.routes.map((route, index) => {
          const points = getRoutePoints(route)

          const touchedHotspots = new Set<number>()
          let riskScore = 0

          points.forEach((point) => {
            const pointLat = point.lat()
            const pointLng = point.lng()

            highRisk.forEach((hotspot) => {
              const distance = haversineMeters(pointLat, pointLng, hotspot.lat, hotspot.lng)
              if (distance <= hotspotRadiusMeters) {
                touchedHotspots.add(hotspot.id)
                riskScore += ((hotspotRadiusMeters - distance) / hotspotRadiusMeters) * hotspot.weight
              }
            })
          })

          const firstLeg = route.legs[0]
          const durationSeconds = firstLeg?.duration?.value ?? Number.POSITIVE_INFINITY
          return { index, riskScore, durationSeconds, touchedHotspotsCount: touchedHotspots.size }
        })

        const validMetrics = routeMetrics.filter((metric) => Number.isFinite(metric.durationSeconds))
        if (validMetrics.length > 0) {
          const safeRoutes = validMetrics.filter((metric) => metric.touchedHotspotsCount === 0)
          const candidateRoutes = safeRoutes.length > 0 ? safeRoutes : validMetrics

          if (safeRoutes.length === 0) {
            setRouteError('No fully safe route found. Showing the safest available route.')
          }

          let bestTouched = Number.POSITIVE_INFINITY
          let bestRisk = Number.POSITIVE_INFINITY
          let bestDuration = Number.POSITIVE_INFINITY

          candidateRoutes.forEach((metric) => {
            const isBetter =
              metric.touchedHotspotsCount < bestTouched ||
              (metric.touchedHotspotsCount === bestTouched && metric.riskScore < bestRisk) ||
              (metric.touchedHotspotsCount === bestTouched &&
                metric.riskScore === bestRisk &&
                metric.durationSeconds < bestDuration)

            if (isBetter) {
              selectedRouteIndex = metric.index
              bestTouched = metric.touchedHotspotsCount
              bestRisk = metric.riskScore
              bestDuration = metric.durationSeconds
            }
          })
        }
      }

      if (!avoidDanger && result.routes.length > 1) {
        let minDuration = Number.POSITIVE_INFINITY

        result.routes.forEach((route, index) => {
          const seconds = route.legs[0]?.duration?.value ?? Number.POSITIVE_INFINITY
          if (seconds < minDuration) {
            minDuration = seconds
            selectedRouteIndex = index
          }
        })
      }

      directionsRendererRef.current?.setMap(mapInstanceRef.current)
      directionsRendererRef.current?.setDirections(result)
      directionsRendererRef.current?.setRouteIndex(selectedRouteIndex)

      const selectedRoute = result.routes[selectedRouteIndex]
      const leg = selectedRoute?.legs[0]
      if (!leg?.distance?.text || !leg?.duration?.text) throw new Error('Missing leg')

      const selectedPoints = getRoutePoints(selectedRoute)
      const touchedInSelectedRoute = highRisk.filter((hotspot) =>
        selectedPoints.some((point) => {
          const distance = haversineMeters(point.lat(), point.lng(), hotspot.lat, hotspot.lng)
          return distance <= hotspotRadiusMeters
        }),
      )

      setRouteInfo({
        distance: leg.distance.text,
        duration: leg.duration.text,
        avoided: avoidDanger ? highRisk.length - touchedInSelectedRoute.length : 0,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Missing leg') {
        directionsRendererRef.current?.setMap(null)
        setRouteError('Could not find a route. Please check both addresses.')
      } else {
        setRouteError('Could not find a route. Please check both addresses.')
      }
    } finally {
      setRouteLoading(false)
    }
  }, [avoidDanger, destination, incidents, origin, travelMode])

  const clearRoute = useCallback(() => {
    directionsRendererRef.current?.setMap(null)
    originMarkerRef.current?.setMap(null)
    destinationMarkerRef.current?.setMap(null)
    originMarkerRef.current = null
    destinationMarkerRef.current = null
    setRouteInfo(null)
    setRouteError('')
    setMapPickMode(null)
    setOrigin('')
    setDestination('')
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1114', color: '#e8e4dc' }}>
      <aside
        style={{
          width: 320,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#141618',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#E24B4A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              S
            </div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>SafeRoute</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 10,
                background: 'rgba(226,75,74,0.15)',
                color: '#E24B4A',
              }}
            >
              LIVE
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(232,228,220,0.45)', margin: 0 }}>
            {`Sofia | ${INCIDENTS.length} incidents | last 30 days`}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
          {(['high', 'medium', 'low'] as const).map((severity) => {
            const value = incidents.filter((item) => item.severity === severity).length
            return (
              <div key={severity} style={{ padding: '12px 0', textAlign: 'center', background: '#141618' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: SEVERITY_META[severity].color }}>{value}</div>
                <div style={{ fontSize: 10, color: 'rgba(232,228,220,0.4)' }}>{SEVERITY_META[severity].label}</div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', borderBlock: '1px solid rgba(255,255,255,0.06)' }}>
          {(['heatmap', 'route'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              style={{
                flex: 1,
                padding: '11px 0',
                border: 'none',
                background: 'none',
                color: tab === value ? '#e8e4dc' : 'rgba(232,228,220,0.35)',
                borderBottom: `2px solid ${tab === value ? '#E24B4A' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              {value === 'heatmap' ? 'Hotspots' : 'Route'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {tab === 'heatmap' ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 12, color: 'rgba(232,228,220,0.6)' }}>Markers</span>
                <button
                  aria-label="Toggle markers"
                  onClick={() => setShowMarkers((visible) => !visible)}
                  style={{
                    width: 34,
                    height: 20,
                    border: 'none',
                    borderRadius: 10,
                    padding: 0,
                    background: showMarkers ? '#E24B4A' : 'rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: showMarkers ? 16 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: '#fff',
                    }}
                  />
                </button>
              </div>

              {sortedIncidents.map((incident) => {
                const selected = selectedIncident?.id === incident.id
                return (
                  <button
                    key={incident.id}
                    onClick={() => {
                      setSelectedIncident(selected ? null : incident)
                      mapInstanceRef.current?.panTo({ lat: incident.lat, lng: incident.lng })
                      mapInstanceRef.current?.setZoom(16)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: '#e8e4dc',
                      background: selected ? 'rgba(226,75,74,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selected ? 'rgba(226,75,74,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: SEVERITY_META[incident.severity].color,
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>{incident.location}</span>
                      <span style={{ fontSize: 10, color: SEVERITY_META[incident.severity].color }}>
                        {SEVERITY_META[incident.severity].label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, paddingLeft: 16, fontSize: 10, color: 'rgba(232,228,220,0.4)' }}>
                      <span>{incident.count} incidents</span>
                      <span>{incident.camera}</span>
                    </div>
                  </button>
                )
              })}
            </>
          ) : (
            <>
              <label htmlFor="origin" style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'rgba(232,228,220,0.45)' }}>
                FROM
              </label>
              <input
                id="origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="e.g. Studentski grad, Sofia"
                style={inputStyle}
              />
              <label htmlFor="destination" style={{ display: 'block', margin: '12px 0 6px', fontSize: 11, color: 'rgba(232,228,220,0.45)' }}>
                TO
              </label>
              <input
                id="destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="e.g. NDK, Sofia"
                style={inputStyle}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setMapPickMode((current) => (current === 'origin' ? null : 'origin'))}
                  style={{
                    padding: '8px 0',
                    borderRadius: 8,
                    border: `1px solid ${mapPickMode === 'origin' ? 'rgba(59,109,17,0.55)' : 'rgba(255,255,255,0.1)'}`,
                    background: mapPickMode === 'origin' ? 'rgba(59,109,17,0.2)' : 'rgba(255,255,255,0.04)',
                    color: '#e8e4dc',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Pick FROM on map
                </button>
                <button
                  onClick={() => setMapPickMode((current) => (current === 'destination' ? null : 'destination'))}
                  style={{
                    padding: '8px 0',
                    borderRadius: 8,
                    border: `1px solid ${mapPickMode === 'destination' ? 'rgba(226,75,74,0.55)' : 'rgba(255,255,255,0.1)'}`,
                    background: mapPickMode === 'destination' ? 'rgba(226,75,74,0.2)' : 'rgba(255,255,255,0.04)',
                    color: '#e8e4dc',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Pick TO on map
                </button>
              </div>
              {mapPickMode ? (
                <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(232,228,220,0.55)' }}>
                  Click the map to set {mapPickMode === 'origin' ? 'FROM' : 'TO'}.
                </div>
              ) : null}
              <label htmlFor="travel-mode" style={{ display: 'block', margin: '12px 0 6px', fontSize: 11, color: 'rgba(232,228,220,0.45)' }}>
                TRAVEL MODE
              </label>
              <select
                id="travel-mode"
                value={travelMode}
                onChange={(event) => setTravelMode(event.target.value as TravelMode)}
                style={inputStyle}
              >
                <option value="DRIVING" style={{ color: '#111' }}>Car</option>
                <option value="WALKING" style={{ color: '#111' }}>Walking</option>
              </select>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  marginTop: 12,
                  marginBottom: 12,
                  borderRadius: 8,
                  background: avoidDanger ? 'rgba(99,153,34,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${avoidDanger ? 'rgba(99,153,34,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>Avoid dangerous intersections</div>
                  <div style={{ fontSize: 10, color: 'rgba(232,228,220,0.45)' }}>
                    {`May add 2 to 5 min | skips ${highRiskCount} high-risk areas`}
                  </div>
                </div>
                <button
                  aria-label="Toggle safe routing"
                  onClick={() => setAvoidDanger((value) => !value)}
                  style={{
                    width: 34,
                    height: 20,
                    border: 'none',
                    borderRadius: 10,
                    padding: 0,
                    background: avoidDanger ? '#639922' : 'rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: avoidDanger ? 16 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: '#fff',
                    }}
                  />
                </button>
              </div>
              {avoidDanger ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ color: 'rgba(232,228,220,0.72)', fontSize: 11, lineHeight: 1.5 }}>
                    Hotspots are treated as a 50m no-go zone when Safe Route is on.
                  </div>
                </div>
              ) : null}
              <button
                onClick={() => void calcRoute()}
                disabled={!origin || !destination || routeLoading}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  border: 'none',
                  borderRadius: 8,
                  background: !origin || !destination ? 'rgba(255,255,255,0.08)' : '#E24B4A',
                  color: !origin || !destination ? 'rgba(232,228,220,0.3)' : '#fff',
                  cursor: !origin || !destination ? 'default' : 'pointer',
                }}
              >
                {routeLoading ? 'Calculating...' : 'Find route'}
              </button>
              {routeInfo ? (
                <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 8, background: 'rgba(99,153,34,0.08)', border: '1px solid rgba(99,153,34,0.25)' }}>
                  <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#639922' }}>Safer route found</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span>{routeInfo.distance}</span>
                    <span>{routeInfo.duration}</span>
                    <span>{routeInfo.avoided} zones avoided</span>
                  </div>
                </div>
              ) : null}
              {routeError ? (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(226,75,74,0.1)', color: '#E24B4A', fontSize: 12 }}>
                  {routeError}
                </div>
              ) : null}
              {(routeInfo || routeError) ? (
                <button
                  onClick={clearRoute}
                  style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'rgba(232,228,220,0.6)', cursor: 'pointer' }}
                >
                  Clear route
                </button>
              ) : null}
            </>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(232,228,220,0.25)' }}>
          VenTech | SafeRoute | HackTUES 2026
        </div>
      </aside>

      <main style={{ flex: 1, position: 'relative', minHeight: '100vh' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapsLoaded ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1a1d20',
              color: 'rgba(232,228,220,0.6)',
            }}
          >
            Loading map...
          </div>
        ) : null}
        {selectedIncident ? (
          <div
            style={{
              position: 'absolute',
              right: 24,
              bottom: 24,
              minWidth: 240,
              padding: '14px 16px',
              borderRadius: 12,
              background: '#141618',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>{selectedIncident.location}</strong>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{ border: 'none', background: 'none', color: 'rgba(232,228,220,0.6)', cursor: 'pointer' }}
              >
                x
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <span>{selectedIncident.count} incidents</span>
              <span>{SEVERITY_META[selectedIncident.severity].label}</span>
              <span>{selectedIncident.camera}</span>
              <span>{`${selectedIncident.lat.toFixed(4)}, ${selectedIncident.lng.toFixed(4)}`}</span>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
