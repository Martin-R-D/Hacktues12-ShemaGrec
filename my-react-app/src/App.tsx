import { useCallback, useEffect, useRef, useState } from 'react'
import rankingsData from '../detection/rankings.json'
import type { CSSProperties } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Severity = 'high' | 'medium' | 'low'

type IncidentEvent = { lat: number; lng: number; weight: number }

type Incident = IncidentEvent & {
  id: number
  severity: Severity
  location: string
  count: number
  camera: string
}

type RouteInfo = { distance: string; duration: string; avoided: number; rank: number }

type TravelMode = 'DRIVING' | 'WALKING'

type LatLngLike = { lat(): number; lng(): number }

type MapMouseEventLike = { latLng: LatLngLike | null }

type MapsEventListenerLike = { remove(): void }

type GoogleMapLike = {
  panTo(coords: { lat: number; lng: number }): void
  setZoom(level: number): void
  setOptions(options: object): void
  addListener(
    eventName: string,
    handler: (event: MapMouseEventLike) => void,
  ): MapsEventListenerLike
}

type MarkerLike = {
  addListener(eventName: string, handler: () => void): void
  setMap(map: GoogleMapLike | null): void
  setVisible(visible: boolean): void
}

type HeatmapLike = { setMap(map: GoogleMapLike | null): void }

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

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

type Theme = {
  // sidebar
  appBg: string
  sidebarBg: string
  sidebarBorder: string
  headerBorder: string
  subText: string
  text: string
  textMuted: string
  textFaint: string
  severityBg: string
  tabActiveBorder: string
  tabBorder: string
  itemBg: string
  itemBorder: string
  itemBgSelected: string
  itemBorderSelected: string
  toggleRowBg: string
  inputBg: string
  inputBorder: string
  inputColor: string
  avoidBgOn: string
  avoidBorderOn: string
  avoidBgOff: string
  avoidBorderOff: string
  avoidHintText: string
  avoidBodyText: string
  pickOriginBg: string
  pickOriginBorder: string
  pickDestBg: string
  pickDestBorder: string
  pickText: string
  clearBorder: string
  clearText: string
  footerText: string
  // popup card on map
  popupBg: string
  popupBorder: string
  popupText: string
  popupMuted: string
  popupCloseBtnColor: string
  // map loading overlay
  mapLoadingBg: string
  mapLoadingText: string
}

const DARK: Theme = {
  appBg: '#0f1114',
  sidebarBg: '#141618',
  sidebarBorder: 'rgba(255,255,255,0.06)',
  headerBorder: 'rgba(255,255,255,0.06)',
  subText: 'rgba(232,228,220,0.45)',
  text: '#e8e4dc',
  textMuted: 'rgba(232,228,220,0.6)',
  textFaint: 'rgba(232,228,220,0.4)',
  severityBg: 'rgba(255,255,255,0.04)',
  tabActiveBorder: '#E24B4A',
  tabBorder: 'rgba(255,255,255,0.06)',
  itemBg: 'rgba(255,255,255,0.03)',
  itemBorder: 'rgba(255,255,255,0.06)',
  itemBgSelected: 'rgba(226,75,74,0.1)',
  itemBorderSelected: 'rgba(226,75,74,0.4)',
  toggleRowBg: 'rgba(255,255,255,0.04)',
  inputBg: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.1)',
  inputColor: '#e8e4dc',
  avoidBgOn: 'rgba(99,153,34,0.08)',
  avoidBorderOn: 'rgba(99,153,34,0.25)',
  avoidBgOff: 'rgba(255,255,255,0.04)',
  avoidBorderOff: 'rgba(255,255,255,0.06)',
  avoidHintText: 'rgba(232,228,220,0.45)',
  avoidBodyText: 'rgba(232,228,220,0.72)',
  pickOriginBg: 'rgba(59,109,17,0.2)',
  pickOriginBorder: 'rgba(59,109,17,0.55)',
  pickDestBg: 'rgba(226,75,74,0.2)',
  pickDestBorder: 'rgba(226,75,74,0.55)',
  pickText: '#e8e4dc',
  clearBorder: 'rgba(255,255,255,0.1)',
  clearText: 'rgba(232,228,220,0.6)',
  footerText: 'rgba(232,228,220,0.25)',
  popupBg: '#141618',
  popupBorder: 'rgba(255,255,255,0.08)',
  popupText: '#e8e4dc',
  popupMuted: 'rgba(232,228,220,0.6)',
  popupCloseBtnColor: 'rgba(232,228,220,0.6)',
  mapLoadingBg: '#1a1d20',
  mapLoadingText: 'rgba(232,228,220,0.6)',
}

const LIGHT: Theme = {
  appBg: '#f0ede8',
  sidebarBg: '#ffffff',
  sidebarBorder: 'rgba(0,0,0,0.08)',
  headerBorder: 'rgba(0,0,0,0.07)',
  subText: 'rgba(40,35,28,0.5)',
  text: '#1a1714',
  textMuted: 'rgba(40,35,28,0.65)',
  textFaint: 'rgba(40,35,28,0.4)',
  severityBg: 'rgba(0,0,0,0.03)',
  tabActiveBorder: '#E24B4A',
  tabBorder: 'rgba(0,0,0,0.07)',
  itemBg: 'rgba(0,0,0,0.025)',
  itemBorder: 'rgba(0,0,0,0.07)',
  itemBgSelected: 'rgba(226,75,74,0.07)',
  itemBorderSelected: 'rgba(226,75,74,0.35)',
  toggleRowBg: 'rgba(0,0,0,0.03)',
  inputBg: 'rgba(0,0,0,0.04)',
  inputBorder: 'rgba(0,0,0,0.12)',
  inputColor: '#1a1714',
  avoidBgOn: 'rgba(99,153,34,0.07)',
  avoidBorderOn: 'rgba(99,153,34,0.3)',
  avoidBgOff: 'rgba(0,0,0,0.03)',
  avoidBorderOff: 'rgba(0,0,0,0.07)',
  avoidHintText: 'rgba(40,35,28,0.5)',
  avoidBodyText: 'rgba(40,35,28,0.7)',
  pickOriginBg: 'rgba(59,109,17,0.08)',
  pickOriginBorder: 'rgba(59,109,17,0.4)',
  pickDestBg: 'rgba(226,75,74,0.08)',
  pickDestBorder: 'rgba(226,75,74,0.4)',
  pickText: '#1a1714',
  clearBorder: 'rgba(0,0,0,0.12)',
  clearText: 'rgba(40,35,28,0.55)',
  footerText: 'rgba(40,35,28,0.3)',
  popupBg: '#ffffff',
  popupBorder: 'rgba(0,0,0,0.1)',
  popupText: '#1a1714',
  popupMuted: 'rgba(40,35,28,0.6)',
  popupCloseBtnColor: 'rgba(40,35,28,0.5)',
  mapLoadingBg: '#e8e4dc',
  mapLoadingText: 'rgba(40,35,28,0.55)',
}

/* ------------------------------------------------------------------ */
/*  Map styles                                                         */
/* ------------------------------------------------------------------ */

const MAP_STYLES_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1a1d20' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1d20' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2f33' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#38393e' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3f45' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b6b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d4349' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#212428' }] },
]

const MAP_STYLES_LIGHT = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8e4dc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
]

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const SOFIA_CENTER = { lat: 42.6977, lng: 23.3219 }

const INCIDENTS: IncidentEvent[] = rankingsData.map(r => ({
  lat: r.cord_y,
  lng: r.cord_x,
  weight: r.score,
}))

const HOTSPOT_RADIUS_M = 200
const MAX_AVOIDANCE_RETRIES = 2

const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  high: { color: '#E24B4A', label: 'High' },
  medium: { color: '#EF9F27', label: 'Medium' },
  low: { color: '#639922', label: 'Low' },
}

// Three route colors: safest (green), second (amber), third (blue)
const ROUTE_CONFIGS = [
  { color: '#4CAF50', label: 'Safest', textColor: '#4CAF50', bg: 'rgba(76,175,80,0.08)', border: 'rgba(76,175,80,0.3)' },
  { color: '#EF9F27', label: '2nd Safest', textColor: '#EF9F27', bg: 'rgba(239,159,39,0.08)', border: 'rgba(239,159,39,0.3)' },
  { color: '#1E88E5', label: '3rd Safest', textColor: '#1E88E5', bg: 'rgba(30,136,229,0.08)', border: 'rgba(30,136,229,0.3)' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getGoogle(): GoogleMapsApi | undefined {
  return (window as Window & { google?: GoogleMapsApi }).google
}

function googleReady(): boolean {
  return Boolean(getGoogle()?.maps)
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function parseLatLngInput(value: string): { lat: number; lng: number } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function severityFromWeight(w: number): Severity {
  if (w >= 7) return 'high'
  if (w >= 4) return 'medium'
  return 'low'
}

/* ------------------------------------------------------------------ */
/*  Hook: load Google Maps script                                      */
/* ------------------------------------------------------------------ */

function useGoogleMaps(apiKey: string) {
  const alreadyLoaded = googleReady()
  const [loaded, setLoaded] = useState(alreadyLoaded)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (alreadyLoaded) return

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-loader="true"]',
    )

    if (existing) {
      const onLoad = () => setLoaded(true)
      const onError = () => setError(true)
      existing.addEventListener('load', onLoad, { once: true })
      existing.addEventListener('error', onError, { once: true })
      return () => {
        existing.removeEventListener('load', onLoad)
        existing.removeEventListener('error', onError)
      }
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization`
    script.async = true
    script.defer = true
    script.dataset.googleMapsLoader = 'true'
    script.onload = () => setLoaded(true)
    script.onerror = () => setError(true)
    document.head.appendChild(script)
  }, [apiKey, alreadyLoaded])

  return { loaded, error }
}

/* ------------------------------------------------------------------ */
/*  Derived data (static — computed once)                              */
/* ------------------------------------------------------------------ */

const ENRICHED_INCIDENTS: Incident[] = INCIDENTS.map((e, i) => ({
  ...e,
  id: i + 1,
  severity: severityFromWeight(e.weight),
  location: `Hotspot ${i + 1}`,
  count: Math.max(1, Math.round(e.weight / 2)),
  camera: `CAM-${String(i + 1).padStart(2, '0')}`,
}))

const SORTED_INCIDENTS = [...ENRICHED_INCIDENTS].sort((a, b) => b.weight - a.weight)

const HIGH_RISK_INCIDENTS = ENRICHED_INCIDENTS.filter((i) => i.severity === 'high')

const SEVERITY_COUNTS: Record<Severity, number> = {
  high: ENRICHED_INCIDENTS.filter((i) => i.severity === 'high').length,
  medium: ENRICHED_INCIDENTS.filter((i) => i.severity === 'medium').length,
  low: ENRICHED_INCIDENTS.filter((i) => i.severity === 'low').length,
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  /* ---- refs ---- */
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMapLike | null>(null)
  const clickListenerRef = useRef<MapsEventListenerLike | null>(null)
  const originMarkerRef = useRef<MarkerLike | null>(null)
  const destMarkerRef = useRef<MarkerLike | null>(null)
  const incidentMarkersRef = useRef<MarkerLike[]>([])
  const heatmapRef = useRef<HeatmapLike | null>(null)
  const renderersRef = useRef<DirectionsRendererLike[]>([])

  /* ---- state ---- */
  const [darkMode, setDarkMode] = useState(true)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING')
  const [avoidDanger, setAvoidDanger] = useState(true)
  const [routeInfos, setRouteInfos] = useState<RouteInfo[]>([])
  const [routeError, setRouteError] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [showMarkers, setShowMarkers] = useState(true)
  const [mapPickMode, setMapPickMode] = useState<'origin' | 'destination' | null>(null)
  const [tab, setTab] = useState<'heatmap' | 'route'>('heatmap')
  const [mapReady, setMapReady] = useState(false)

  const T = darkMode ? DARK : LIGHT

  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps(GOOGLE_MAPS_API_KEY)

  const pickModeRef = useRef(mapPickMode)
  pickModeRef.current = mapPickMode

  const setOriginRef = useRef(setOrigin)
  setOriginRef.current = setOrigin
  const setDestinationRef = useRef(setDestination)
  setDestinationRef.current = setDestination
  const setMapPickModeRef = useRef(setMapPickMode)
  setMapPickModeRef.current = setMapPickMode
  const setTabRef = useRef(setTab)
  setTabRef.current = setTab
  const setSelectedIncidentRef = useRef(setSelectedIncident)
  setSelectedIncidentRef.current = setSelectedIncident

  /* ---- update map styles when darkMode toggles ---- */
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setOptions({ styles: darkMode ? MAP_STYLES_DARK : MAP_STYLES_LIGHT })
  }, [darkMode])

  /* ---- map initialisation ---- */
  useEffect(() => {
    const google = getGoogle()
    if (!mapsLoaded || !google?.maps || !mapElRef.current) return
    if (mapRef.current) return

    const map = new google.maps.Map(mapElRef.current, {
      center: SOFIA_CENTER,
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      styles: MAP_STYLES_DARK,
    })

    mapRef.current = map

    // Heatmap
    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: INCIDENTS.map((inc) => ({
        location: new google.maps.LatLng(inc.lat, inc.lng),
        weight: inc.weight,
      })),
      map,
      radius: 50,
      opacity: 0.75,
    })

    // Create 3 renderers with different colors
    renderersRef.current.forEach((r) => r.setMap(null))
    renderersRef.current = ROUTE_CONFIGS.map((cfg, i) =>
      new google.maps.DirectionsRenderer({
        polylineOptions: {
          strokeColor: cfg.color,
          strokeWeight: i === 0 ? 6 : 4,
          strokeOpacity: i === 0 ? 0.9 : 0.55,
        },
        suppressMarkers: true,
      })
    )

    // Incident markers
    incidentMarkersRef.current.forEach((m) => m.setMap(null))
    incidentMarkersRef.current = ENRICHED_INCIDENTS.map((inc) => {
      const marker = new google.maps.Marker({
        position: { lat: inc.lat, lng: inc.lng },
        map,
        title: inc.location,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: SEVERITY_META[inc.severity].color,
          fillOpacity: 0.95,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      })
      marker.addListener('click', () => setSelectedIncidentRef.current(inc))
      return marker
    })

    clickListenerRef.current = map.addListener('click', (event) => {
      const mode = pickModeRef.current
      if (!mode || !event.latLng) return

      const picked = `${event.latLng.lat().toFixed(6)}, ${event.latLng.lng().toFixed(6)}`

      if (mode === 'origin') {
        setOriginRef.current(picked)
        setMapPickModeRef.current('destination')
      } else {
        setDestinationRef.current(picked)
        setMapPickModeRef.current(null)
      }
      setTabRef.current('route')
    })

    setMapReady(true)

    return () => {
      clickListenerRef.current?.remove()
      clickListenerRef.current = null
      originMarkerRef.current?.setMap(null)
      destMarkerRef.current?.setMap(null)
      originMarkerRef.current = null
      destMarkerRef.current = null
      incidentMarkersRef.current.forEach((m) => m.setMap(null))
      incidentMarkersRef.current = []
      renderersRef.current.forEach((r) => r.setMap(null))
      renderersRef.current = []
      heatmapRef.current?.setMap(null)
      mapRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsLoaded])

  /* ---- marker visibility ---- */
  useEffect(() => {
    incidentMarkersRef.current.forEach((m) => m.setVisible(showMarkers))
  }, [showMarkers])

  /* ---- origin / destination pin markers ---- */
  const placePin = useCallback(
    (kind: 'origin' | 'destination', coords: { lat: number; lng: number } | null) => {
      const google = getGoogle()
      const map = mapRef.current
      const ref = kind === 'origin' ? originMarkerRef : destMarkerRef

      ref.current?.setMap(null)
      ref.current = null

      if (!coords || !google?.maps || !map) return

      ref.current = new google.maps.Marker({
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
    },
    [],
  )

  useEffect(() => {
    if (!mapReady) return
    placePin('origin', parseLatLngInput(origin))
  }, [origin, mapReady, placePin])

  useEffect(() => {
    if (!mapReady) return
    placePin('destination', parseLatLngInput(destination))
  }, [destination, mapReady, placePin])

  /* ---- route calculation ---- */
  const calcRoute = useCallback(async () => {
    const google = getGoogle()
    const map = mapRef.current
    const renderers = renderersRef.current
    if (!google?.maps || !map || !renderers.length || !origin || !destination) return

    setRouteLoading(true)
    setRouteError('')
    setRouteInfos([])

    renderers.forEach((r) => r.setMap(null))

    try {
      const service = new google.maps.DirectionsService()

      if (!avoidDanger) {
        const result = await service.route({
          origin,
          destination,
          travelMode: google.maps.TravelMode[travelMode],
          provideRouteAlternatives: true,
        })

        if (!result.routes.length) {
          setRouteError('No routes returned. Please check both addresses.')
          return
        }

        const ranked = rankRoutesByDuration(result.routes)
        const top3 = ranked.slice(0, 3)

        const infos: RouteInfo[] = []
        top3.forEach(({ idx }, rank) => {
          const renderer = renderers[rank]
          if (!renderer) return
          renderer.setMap(map)
          renderer.setDirections(result)
          renderer.setRouteIndex(idx)
          const leg = result.routes[idx]?.legs[0]
          if (leg?.distance?.text && leg?.duration?.text) {
            infos.push({ distance: leg.distance.text, duration: leg.duration.text, avoided: 0, rank })
          }
        })

        setRouteInfos(infos)
        return
      }

      let waypoints: Array<{ location: { lat: number; lng: number }; stopover: false }> = []
      let bestResult: DirectionsResultLike | null = null
      let touchedByBest: Incident[] = []

      for (let attempt = 0; attempt <= MAX_AVOIDANCE_RETRIES; attempt++) {
        const result = await service.route({
          origin,
          destination,
          travelMode: google.maps.TravelMode[travelMode],
          provideRouteAlternatives: true,
          ...(waypoints.length > 0 ? { waypoints } : {}),
        })

        if (!result.routes.length) {
          setRouteError('No routes returned. Please check both addresses.')
          return
        }

        const idx = result.routes.length > 1 ? pickSafestRoute(result.routes) : 0
        const route = result.routes[idx]
        const touched = findTouchedHotspots(route)

        bestResult = result
        touchedByBest = touched

        if (touched.length === 0) break
        if (attempt === MAX_AVOIDANCE_RETRIES) break

        const newWaypoints = computeAvoidanceWaypoints(route, touched)
        if (newWaypoints.length === 0) break

        waypoints = [
          ...waypoints,
          ...newWaypoints.map((wp) => ({ location: wp, stopover: false as const })),
        ]
      }

      if (!bestResult) {
        setRouteError('Could not find a route. Please check both addresses.')
        return
      }

      const ranked = rankRoutesBySafety(bestResult.routes)
      const top3 = ranked.slice(0, 3)

      if (touchedByBest.length > 0) {
        setRouteError('No fully safe route found. Showing the safest available routes.')
      }

      const infos: RouteInfo[] = []
      top3.forEach(({ idx, touchedCount }, rank) => {
        const renderer = renderers[rank]
        if (!renderer) return
        renderer.setMap(map)
        renderer.setDirections(bestResult!)
        renderer.setRouteIndex(idx)
        const leg = bestResult!.routes[idx]?.legs[0]
        if (leg?.distance?.text && leg?.duration?.text) {
          infos.push({
            distance: leg.distance.text,
            duration: leg.duration.text,
            avoided: HIGH_RISK_INCIDENTS.length - touchedCount,
            rank,
          })
        }
      })

      setRouteInfos(infos)
    } catch {
      renderers.forEach((r) => r.setMap(null))
      setRouteError('Could not find a route. Please check both addresses.')
    } finally {
      setRouteLoading(false)
    }
  }, [avoidDanger, destination, origin, travelMode])

  const clearRoute = useCallback(() => {
    renderersRef.current.forEach((r) => r.setMap(null))
    originMarkerRef.current?.setMap(null)
    destMarkerRef.current?.setMap(null)
    originMarkerRef.current = null
    destMarkerRef.current = null
    setRouteInfos([])
    setRouteError('')
    setMapPickMode(null)
    setOrigin('')
    setDestination('')
  }, [])

  /* ---- derived values ---- */
  const canCalc = origin.length > 0 && destination.length > 0 && !routeLoading
  const btnBg = canCalc ? '#E24B4A' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)')
  const btnColor = canCalc ? '#fff' : (darkMode ? 'rgba(232,228,220,0.3)' : 'rgba(40,35,28,0.3)')

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    background: T.inputBg,
    border: `1px solid ${T.inputBorder}`,
    color: T.inputColor,
    fontSize: 13,
    outline: 'none',
  }

  /* ---- render ---- */
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.appBg, color: T.text, transition: 'background 0.3s ease, color 0.3s ease' }}>
      {/* ================ SIDEBAR ================ */}
      <aside
        style={{
          width: 320,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: T.sidebarBg,
          borderRight: `1px solid ${T.sidebarBorder}`,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}
      >
        {/* -- header -- */}
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.headerBorder}` }}>
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
            <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>SafeRoute</span>
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
          <p style={{ fontSize: 11, color: T.subText, margin: 0 }}>
            {`Sofia | ${INCIDENTS.length} incidents | last 30 days`}
          </p>
        </div>

        {/* -- severity counts -- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: T.severityBg }}>
          {(['high', 'medium', 'low'] as const).map((sev) => (
            <div key={sev} className="severity-cell" style={{ padding: '12px 0', textAlign: 'center', background: T.sidebarBg }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: SEVERITY_META[sev].color }}>
                {SEVERITY_COUNTS[sev]}
              </div>
              <div style={{ fontSize: 10, color: T.textFaint }}>
                {SEVERITY_META[sev].label}
              </div>
            </div>
          ))}
        </div>

        {/* -- tabs -- */}
        <div style={{ display: 'flex', borderBlock: `1px solid ${T.tabBorder}` }}>
          {(['heatmap', 'route'] as const).map((value) => (
            <button
              key={value}
              className="tab-btn"
              onClick={() => setTab(value)}
              style={{
                flex: 1,
                padding: '11px 0',
                border: 'none',
                background: 'none',
                color: tab === value ? T.text : T.textFaint,
                borderBottom: `2px solid ${tab === value ? T.tabActiveBorder : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              {value === 'heatmap' ? 'Hotspots' : 'Route'}
            </button>
          ))}
        </div>

        {/* -- tab content -- */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {tab === 'heatmap' ? (
            <HeatmapPanel
              incidents={SORTED_INCIDENTS}
              selectedId={selectedIncident?.id ?? null}
              showMarkers={showMarkers}
              T={T}
              onToggleMarkers={() => setShowMarkers((v) => !v)}
              onSelectIncident={(inc) => {
                setSelectedIncident((prev) => (prev?.id === inc.id ? null : inc))
                mapRef.current?.panTo({ lat: inc.lat, lng: inc.lng })
                mapRef.current?.setZoom(16)
              }}
            />
          ) : (
            <RoutePanel
              origin={origin}
              destination={destination}
              travelMode={travelMode}
              avoidDanger={avoidDanger}
              mapPickMode={mapPickMode}
              routeInfos={routeInfos}
              routeError={routeError}
              routeLoading={routeLoading}
              highRiskCount={HIGH_RISK_INCIDENTS.length}
              canCalc={canCalc}
              btnBg={btnBg}
              btnColor={btnColor}
              T={T}
              inputStyle={inputStyle}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              onTravelModeChange={setTravelMode}
              onToggleAvoidDanger={() => setAvoidDanger((v) => !v)}
              onPickMode={setMapPickMode}
              onCalcRoute={() => void calcRoute()}
              onClearRoute={clearRoute}
            />
          )}
        </div>

        {/* -- footer -- */}
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.headerBorder}`, fontSize: 10, color: T.footerText }}>
          VenTech | SafeRoute | HackTUES 2026
        </div>
      </aside>

      {/* ================ MAP ================ */}
      <main style={{ flex: 1, position: 'relative', minHeight: '100vh' }}>
        <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />

        {/* ---- theme toggle button top-right ---- */}
        <button
          onClick={() => setDarkMode((v) => !v)}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 10,
            border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
            background: darkMode ? 'rgba(20,22,24,0.85)' : 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(6px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'background 0.25s ease, border-color 0.25s ease, transform 0.1s ease',
            boxShadow: darkMode ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1.08)')}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>

        {mapsError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: T.mapLoadingBg,
              color: '#E24B4A',
            }}
          >
            Failed to load Google Maps. Please check the API key and try again.
          </div>
        )}

        {!mapsLoaded && !mapsError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: T.mapLoadingBg,
              color: T.mapLoadingText,
            }}
          >
            Loading map...
          </div>
        )}

        {selectedIncident && (
          <div
            style={{
              position: 'absolute',
              right: 24,
              bottom: 24,
              minWidth: 240,
              padding: '14px 16px',
              borderRadius: 12,
              background: T.popupBg,
              border: `1px solid ${T.popupBorder}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              transition: 'background 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12, color: T.popupText }}>{selectedIncident.location}</strong>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{ border: 'none', background: 'none', color: T.popupCloseBtnColor, cursor: 'pointer' }}
              >
                x
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: T.popupMuted }}>
              <span>{selectedIncident.count} incidents</span>
              <span>{SEVERITY_META[selectedIncident.severity].label}</span>
              <span>{selectedIncident.camera}</span>
              <span>{`${selectedIncident.lat.toFixed(4)}, ${selectedIncident.lng.toFixed(4)}`}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Route scoring helpers                                              */
/* ------------------------------------------------------------------ */

type RouteType = DirectionsResultLike['routes'][number]

function densifyPath(path: LatLngLike[]): Array<{ lat: number; lng: number }> {
  const MAX_GAP_M = 30
  const out: Array<{ lat: number; lng: number }> = []

  for (let i = 0; i < path.length; i++) {
    const lat = path[i].lat()
    const lng = path[i].lng()
    out.push({ lat, lng })

    if (i + 1 < path.length) {
      const nextLat = path[i + 1].lat()
      const nextLng = path[i + 1].lng()
      const segLen = haversineMeters(lat, lng, nextLat, nextLng)
      const steps = Math.ceil(segLen / MAX_GAP_M)

      for (let s = 1; s < steps; s++) {
        const t = s / steps
        out.push({ lat: lat + (nextLat - lat) * t, lng: lng + (nextLng - lng) * t })
      }
    }
  }

  return out
}

function findTouchedHotspots(route: RouteType): Incident[] {
  const points = densifyPath(route.overview_path ?? [])
  return HIGH_RISK_INCIDENTS.filter((hs) =>
    points.some((p) => haversineMeters(p.lat, p.lng, hs.lat, hs.lng) <= HOTSPOT_RADIUS_M),
  )
}

function computeAvoidanceWaypoints(
  route: RouteType,
  touched: Incident[],
): Array<{ lat: number; lng: number }> {
  const OFFSET_M = 300
  const DEG_PER_M_LAT = 1 / 111_320
  const path = densifyPath(route.overview_path ?? [])
  if (path.length < 2) return []

  const waypoints: Array<{ lat: number; lng: number }> = []

  for (const hs of touched) {
    let minDist = Infinity
    let closestIdx = 0

    for (let i = 0; i < path.length; i++) {
      const d = haversineMeters(path[i].lat, path[i].lng, hs.lat, hs.lng)
      if (d < minDist) {
        minDist = d
        closestIdx = i
      }
    }

    const prev = path[Math.max(0, closestIdx - 1)]
    const next = path[Math.min(path.length - 1, closestIdx + 1)]
    const dLat = next.lat - prev.lat
    const dLng = next.lng - prev.lng

    const perpLat = -dLng
    const perpLng = dLat
    const perpLen = Math.sqrt(perpLat * perpLat + perpLng * perpLng)

    if (perpLen < 1e-12) continue

    const normLat = perpLat / perpLen
    const normLng = perpLng / perpLen

    const degPerMLng = DEG_PER_M_LAT / Math.cos((hs.lat * Math.PI) / 180)
    const offsetLat = normLat * OFFSET_M * DEG_PER_M_LAT
    const offsetLng = normLng * OFFSET_M * degPerMLng

    const candidateA = { lat: hs.lat + offsetLat, lng: hs.lng + offsetLng }
    const candidateB = { lat: hs.lat - offsetLat, lng: hs.lng - offsetLng }
    const routePt = path[closestIdx]
    const dA = haversineMeters(candidateA.lat, candidateA.lng, routePt.lat, routePt.lng)
    const dB = haversineMeters(candidateB.lat, candidateB.lng, routePt.lat, routePt.lng)

    waypoints.push(dA >= dB ? candidateA : candidateB)
  }

  return waypoints
}

function rankRoutesBySafety(routes: DirectionsResultLike['routes']): Array<{ idx: number; touchedCount: number; risk: number; duration: number }> {
  const scored = routes.map((route, idx) => {
    const points = densifyPath(route.overview_path ?? [])
    const touched = new Set<number>()
    let risk = 0

    points.forEach((p) => {
      HIGH_RISK_INCIDENTS.forEach((hs) => {
        const d = haversineMeters(p.lat, p.lng, hs.lat, hs.lng)
        if (d <= HOTSPOT_RADIUS_M) {
          touched.add(hs.id)
          risk += ((HOTSPOT_RADIUS_M - d) / HOTSPOT_RADIUS_M) * hs.weight
        }
      })
    })

    const duration = route.legs[0]?.duration?.value ?? Infinity
    return { idx, touchedCount: touched.size, risk, duration }
  }).filter((r) => Number.isFinite(r.duration))

  return scored.sort((a, b) =>
    a.touchedCount !== b.touchedCount
      ? a.touchedCount - b.touchedCount
      : a.risk !== b.risk
      ? a.risk - b.risk
      : a.duration - b.duration,
  )
}

function rankRoutesByDuration(routes: DirectionsResultLike['routes']): Array<{ idx: number }> {
  return routes
    .map((route, idx) => ({ idx, duration: route.legs[0]?.duration?.value ?? Infinity }))
    .filter((r) => Number.isFinite(r.duration))
    .sort((a, b) => a.duration - b.duration)
}

function pickSafestRoute(routes: DirectionsResultLike['routes']): number {
  return rankRoutesBySafety(routes)[0]?.idx ?? 0
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Toggle({ on, onToggle, color, label }: { on: boolean; onToggle: () => void; color: string; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onToggle}
      style={{
        width: 34,
        height: 20,
        border: 'none',
        borderRadius: 10,
        padding: 0,
        background: on ? color : 'rgba(128,128,128,0.25)',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#fff',
        }}
      />
    </button>
  )
}

function HeatmapPanel({
  incidents,
  selectedId,
  showMarkers,
  T,
  onToggleMarkers,
  onSelectIncident,
}: {
  incidents: Incident[]
  selectedId: number | null
  showMarkers: boolean
  T: Theme
  onToggleMarkers: () => void
  onSelectIncident: (incident: Incident) => void
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          padding: '8px 12px',
          background: T.toggleRowBg,
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 12, color: T.textMuted }}>Markers</span>
        <Toggle on={showMarkers} onToggle={onToggleMarkers} color="#E24B4A" label="Toggle markers" />
      </div>

      {incidents.map((incident) => {
        const selected = selectedId === incident.id
        return (
          <button
            key={incident.id}
            className="incident-btn"
            onClick={() => onSelectIncident(incident)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              marginBottom: 6,
              borderRadius: 8,
              cursor: 'pointer',
              color: T.text,
              background: selected ? T.itemBgSelected : T.itemBg,
              border: `1px solid ${selected ? T.itemBorderSelected : T.itemBorder}`,
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
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>{incident.location}</span>
              <span style={{ fontSize: 10, color: SEVERITY_META[incident.severity].color }}>
                {SEVERITY_META[incident.severity].label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingLeft: 16, fontSize: 10, color: T.textFaint }}>
              <span>{incident.count} incidents</span>
              <span>{incident.camera}</span>
            </div>
          </button>
        )
      })}
    </>
  )
}

function RoutePanel({
  origin,
  destination,
  travelMode,
  avoidDanger,
  mapPickMode,
  routeInfos,
  routeError,
  routeLoading,
  highRiskCount,
  canCalc,
  btnBg,
  btnColor,
  T,
  inputStyle,
  onOriginChange,
  onDestinationChange,
  onTravelModeChange,
  onToggleAvoidDanger,
  onPickMode,
  onCalcRoute,
  onClearRoute,
}: {
  origin: string
  destination: string
  travelMode: TravelMode
  avoidDanger: boolean
  mapPickMode: 'origin' | 'destination' | null
  routeInfos: RouteInfo[]
  routeError: string
  routeLoading: boolean
  highRiskCount: number
  canCalc: boolean
  btnBg: string
  btnColor: string
  T: Theme
  inputStyle: CSSProperties
  onOriginChange: (v: string) => void
  onDestinationChange: (v: string) => void
  onTravelModeChange: (v: TravelMode) => void
  onToggleAvoidDanger: () => void
  onPickMode: (mode: 'origin' | 'destination' | null) => void
  onCalcRoute: () => void
  onClearRoute: () => void
}) {
  return (
    <>
      <label htmlFor="origin" style={{ display: 'block', marginBottom: 6, fontSize: 11, color: T.subText }}>
        FROM
      </label>
      <input
        id="origin"
        value={origin}
        onChange={(e) => onOriginChange(e.target.value)}
        placeholder="e.g. Studentski grad, Sofia"
        style={inputStyle}
      />

      <label htmlFor="destination" style={{ display: 'block', margin: '12px 0 6px', fontSize: 11, color: T.subText }}>
        TO
      </label>
      <input
        id="destination"
        value={destination}
        onChange={(e) => onDestinationChange(e.target.value)}
        placeholder="e.g. NDK, Sofia"
        style={inputStyle}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <button
          className={mapPickMode === 'origin' ? 'pick-origin-active' : ''}
          onClick={() => onPickMode(mapPickMode === 'origin' ? null : 'origin')}
          style={{
            padding: '8px 0',
            borderRadius: 8,
            border: `1px solid ${mapPickMode === 'origin' ? T.pickOriginBorder : T.inputBorder}`,
            background: mapPickMode === 'origin' ? T.pickOriginBg : T.itemBg,
            color: T.pickText,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Pick FROM on map
        </button>
        <button
          className={mapPickMode === 'destination' ? 'pick-dest-active' : ''}
          onClick={() => onPickMode(mapPickMode === 'destination' ? null : 'destination')}
          style={{
            padding: '8px 0',
            borderRadius: 8,
            border: `1px solid ${mapPickMode === 'destination' ? T.pickDestBorder : T.inputBorder}`,
            background: mapPickMode === 'destination' ? T.pickDestBg : T.itemBg,
            color: T.pickText,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Pick TO on map
        </button>
      </div>

      {mapPickMode && (
        <div style={{ marginTop: 8, fontSize: 10, color: T.subText }}>
          Click the map to set {mapPickMode === 'origin' ? 'FROM' : 'TO'}.
        </div>
      )}

      <label htmlFor="travel-mode" style={{ display: 'block', margin: '12px 0 6px', fontSize: 11, color: T.subText }}>
        TRAVEL MODE
      </label>
      <select
        id="travel-mode"
        value={travelMode}
        onChange={(e) => onTravelModeChange(e.target.value as TravelMode)}
        style={inputStyle}
      >
        <option value="DRIVING">Car</option>
        <option value="WALKING">Walking</option>
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
          background: avoidDanger ? T.avoidBgOn : T.avoidBgOff,
          border: `1px solid ${avoidDanger ? T.avoidBorderOn : T.avoidBorderOff}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>Avoid dangerous intersections</div>
          <div style={{ fontSize: 10, color: T.avoidHintText }}>
            {`May add 2 to 5 min | skips ${highRiskCount} high-risk areas`}
          </div>
        </div>
        <Toggle on={avoidDanger} onToggle={onToggleAvoidDanger} color="#639922" label="Toggle safe routing" />
      </div>

      {avoidDanger && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: T.itemBg,
            border: `1px solid ${T.itemBorder}`,
          }}
        >
          <div style={{ color: T.avoidBodyText, fontSize: 11, lineHeight: 1.5 }}>
            Hotspots are treated as a 50m no-go zone when Safe Route is on.
          </div>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={onCalcRoute}
        disabled={!canCalc}
        style={{
          width: '100%',
          padding: '11px 0',
          border: 'none',
          borderRadius: 8,
          background: btnBg,
          color: btnColor,
          cursor: canCalc ? 'pointer' : 'default',
        }}
      >
        {routeLoading ? 'Calculating...' : 'Find routes'}
      </button>

      {routeInfos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: T.subText, marginBottom: 8 }}>
            ROUTES FOUND
          </div>
          {routeInfos.map((info) => {
            const cfg = ROUTE_CONFIGS[info.rank]
            return (
              <div
                key={info.rank}
                className="route-card"
                style={{
                  marginBottom: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 28,
                      height: 4,
                      borderRadius: 2,
                      background: cfg.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: cfg.textColor }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.textMuted }}>
                  <span>{info.distance}</span>
                  <span>{info.duration}</span>
                  {avoidDanger && (
                    <span style={{ color: info.avoided > 0 ? '#639922' : T.textFaint }}>
                      {info.avoided} avoided
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {routeError && (
        <div
          className="route-error"
          style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(226,75,74,0.1)', color: '#E24B4A', fontSize: 12 }}
        >
          {routeError}
        </div>
      )}

      {(routeInfos.length > 0 || routeError) && (
        <button
          onClick={onClearRoute}
          style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.clearBorder}`, background: 'none', color: T.clearText, cursor: 'pointer' }}
        >
          Clear routes
        </button>
      )}
    </>
  )
}