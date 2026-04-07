import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  type ValhallaResponse,
  valhallaToDirections,
} from "./services/valhallaToDirections";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Polyline,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import SignInPage from "./SignInPage";
import SignUpPage from "./SignUpPage";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Severity = "high" | "medium" | "low";

type IncidentType = "actual" | "near";

type IncidentEvent = { lat: number; lng: number; weight: number; type: IncidentType; dbImageBase64?: string };

type Incident = IncidentEvent & {
  id: number;
  severity: Severity;
  location: string;
  count: number;
  camera: string;
  imageUrl?: string;
};

type RouteInfo = {
  distance: string;
  duration: string;
  rank: number;
  avoided: number;
  turns: number;
  difficulty: RouteDifficulty;
};

type RouteDifficulty = "easy" | "moderate" | "hard";

type TravelMode = "drive" | "pedestrian";

type RoutePolyline = {
  positions: [number, number][];
  color: string;
  weight: number;
  opacity: number;
  rank: number;
};

type OpenMeteoCurrentWeather = {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  time: string;
};

type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  current_weather?: OpenMeteoCurrentWeather;
};

type RouteWeatherPoint = {
  lat: number;
  lng: number;
  checkpointLabel: string;
  temperature: number | null;
  winddirection: number | null;
  weathercode: number | null;
  time: string | null;
};

type HotspotApiRow = {
  rank: number;
  cord_x: number;
  cord_y: number;
  score: number;
  type?: string;
  image_base64?: string;
};

type HotspotApiResponse = {
  computedAt: string | null;
  hotspots: HotspotApiRow[];
};

type UserPlace = {
  id: number;
  name: string;
  lan: number;
  lon: number;
};

type MapPickMode = "origin" | "destination" | "myPlace" | null;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BULGARIA_CENTER: [number, number] = [42.7339, 25.4858]; // Center of Bulgaria

const DETECTION_API_URL =
  import.meta.env.VITE_DETECTION_API_URL ?? "http://localhost:8005";
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8004";
const AUTH_TOKEN_KEY = "saferoute_auth_token";
const AUTH_USERNAME_KEY = "saferoute_auth_username";
const HOTSPOT_POLL_MS = 60_000;

const HOTSPOT_RADIUS_M = 20;
const WEATHER_SAMPLE_DISTANCE_M = 5_000;
const WEATHER_MAX_POINTS_PER_ROUTE = 6;


const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  high: { color: "#E24B4A", label: "High" },
  medium: { color: "#EF9F27", label: "Medium" },
  low: { color: "#639922", label: "Low" },
};

const ROUTE_CONFIGS = [
  {
    color: "#4CAF50",
    label: "Best",
    textColor: "#4CAF50",
    bg: "rgba(76,175,80,0.08)",
    border: "rgba(76,175,80,0.3)",
  },
  {
    color: "#EF9F27",
    label: "2nd Best",
    textColor: "#EF9F27",
    bg: "rgba(239,159,39,0.08)",
    border: "rgba(239,159,39,0.3)",
  },
  {
    color: "#1E88E5",
    label: "3rd Best",
    textColor: "#1E88E5",
    bg: "rgba(30,136,229,0.08)",
    border: "rgba(30,136,229,0.3)",
  },
];

const TURN_WEIGHTS: Record<number, number> = {
  7: 0.5, // slight right
  8: 1,   // right
  9: 1.5, // sharp right
  10: 2,  // u-turn right
  11: 2,  // u-turn left
  12: 1.5, // sharp left
  13: 1,   // left
  14: 0.5, // slight left
};



const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e8e4dc",
  fontSize: 13,
  outline: "none",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseLatLngInput(value: string): { lat: number; lng: number } | null {
  const match = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function severityFromWeight(w: number): Severity {
  if (w >= 7) return "high";
  if (w >= 4) return "medium";
  return "low";
}

function makeDivIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;">${label}</div>`,
  });
}

function makePlaceIcon(name: string) {
  return L.divIcon({
    className: "",
    iconSize: [140, 30],
    iconAnchor: [12, 30],
    html: `<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:50%;background:#8EC6FF;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div><div style="padding:3px 8px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(142,198,255,0.6);color:#d7ecff;font-size:11px;font-weight:700;max-width:108px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div></div>`,
  });
}

function weatherCodeToEmoji(code: number | null): string {
  if (code === null) return "?";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 61 || code === 63 || code === 65 || code === 80) return "🌧️";
  if (code === 71 || code === 73 || code === 75) return "❄️";
  if (code === 95) return "⛈️";
  return "🌡️";
}

function sampleRoutePointsForWeather(
  positions: [number, number][],
  minDistanceMeters = WEATHER_SAMPLE_DISTANCE_M,
  maxPoints = WEATHER_MAX_POINTS_PER_ROUTE,
): [number, number][] {
  if (positions.length === 0) return [];

  const sampled: [number, number][] = [positions[0]];
  let last = positions[0];

  for (let i = 1; i < positions.length; i += 1) {
    const curr = positions[i];
    const dist = haversineMeters(last[0], last[1], curr[0], curr[1]);
    if (dist >= minDistanceMeters) {
      sampled.push(curr);
      last = curr;
    }
  }

  const end = positions[positions.length - 1];
  const sampledEnd = sampled[sampled.length - 1];
  if (sampledEnd[0] !== end[0] || sampledEnd[1] !== end[1]) {
    sampled.push(end);
  }

  if (sampled.length <= maxPoints) return sampled;

  const reduced: [number, number][] = [];
  const step = (sampled.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    reduced.push(sampled[Math.round(i * step)]);
  }
  return reduced;
}

async function fetchWeather(lat: number, lon: number): Promise<OpenMeteoResponse> {
  const url = `https://api.open-meteo.com/v1/forecast
    ?latitude=${lat}
    &longitude=${lon}
    &current_weather=true`
    .replace(/\s+/g, "");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  return (await res.json()) as OpenMeteoResponse;
}

function makeWeatherPointIcon(point: RouteWeatherPoint): L.DivIcon {
  const tempText = point.temperature === null ? "N/A" : `${point.temperature.toFixed(0)}C`;
  const codeText = point.weathercode === null ? "-" : String(point.weathercode);
  const emoji = weatherCodeToEmoji(point.weathercode);

  return L.divIcon({
    className: "",
    iconSize: [76, 28],
    iconAnchor: [38, 34], // Increased the y-offset to move the icon higher
    html: `<div style="display:flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(255,255,255,0.22);box-shadow:0 3px 10px rgba(0,0,0,0.25);color:#f8f7f4;font-size:11px;font-weight:700;line-height:1;white-space:nowrap;"><span style="font-size:13px;line-height:1;">${emoji}</span><span>${tempText}</span><span style="padding:1px 5px;border-radius:999px;border:1px solid rgba(142,198,255,0.6);background:rgba(30,136,229,0.2);color:#8EC6FF;">${codeText}</span></div>`,
  });
}

function countRouteTurnsFromManeuvers(legs: { maneuvers: Array<{ type: number }> }[]): number {
  return legs.reduce((total, leg) => {
    const weightedTurnsInLeg = leg.maneuvers.reduce((count, maneuver) => {
      return count + (TURN_WEIGHTS[maneuver.type] || 0);
    }, 0);
    return total + weightedTurnsInLeg;
  }, 0);
}

function difficultyFromTurns(turns: number): RouteDifficulty {
  if (turns <= 4) return "easy";
  if (turns <= 9) return "moderate";
  return "hard";
}

/* ------------------------------------------------------------------ */
/*  Map interaction component                                          */
/* ------------------------------------------------------------------ */

function MapClickHandler({
  pickMode,
  onPick,
}: {
  pickMode: MapPickMode;
  onPick: (
    latlng: { lat: number; lng: number },
    mode: Exclude<MapPickMode, null>,
  ) => void;
}) {
  useMapEvents({
    click(e) {
      if (!pickMode) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng }, pickMode);
    },
  });
  return null;
}

function MapPanTo({
  center,
  seq,
}: {
  center: [number, number] | null;
  seq: number;
}) {
  const map = useMap();
  const lastSeqRef = useRef(-1);
  useEffect(() => {
    if (center && seq !== lastSeqRef.current) {
      lastSeqRef.current = seq;
      map.panTo(center);
      map.setZoom(16);
    }
  }, [center, seq, map]);
  return null;
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

function SafetyMapApp({ authToken }: { authToken: string }) {
  /* ---- state ---- */
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    null,
  );
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode>("drive");
  const [avoidDanger, setAvoidDanger] = useState(true);
  const [routeInfos, setRouteInfos] = useState<RouteInfo[]>([]);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [mapPickMode, setMapPickMode] = useState<MapPickMode>(null);
  const [tab, setTab] = useState<"heatmap" | "route" | "myPlaces">("heatmap");
  const [routePolylines, setRoutePolylines] = useState<RoutePolyline[]>([]);
  const [panTarget, setPanTarget] = useState<[number, number] | null>(null);
  const [panSeq, setPanSeq] = useState(0);
  const [selectedRouteRank, setSelectedRouteRank] = useState<number>(0);
  const [incidents, setIncidents] = useState<IncidentEvent[]>([]);
  const [routeWeatherByRank, setRouteWeatherByRank] = useState<
    Record<number, RouteWeatherPoint[]>
  >({});
  const [hotspotsLastComputedAt, setHotspotsLastComputedAt] = useState<
    string | null
  >(null);
  const [userPlaces, setUserPlaces] = useState<UserPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [placeNameInput, setPlaceNameInput] = useState("");
  const [placePick, setPlacePick] = useState<{ lat: number; lng: number } | null>(null);
  const [savingPlace, setSavingPlace] = useState(false);
  const weatherRequestSeq = useRef(0);

  const loadUserPlaces = useCallback(async () => {
    setPlacesLoading(true);
    setPlacesError("");
    try {
      const response = await fetch(`${AUTH_API_URL}/user-points`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load your places");
      }
      const points = (await response.json()) as UserPlace[];
      setUserPlaces(points);
    } catch (error) {
      setPlacesError(error instanceof Error ? error.message : "Failed to load your places");
    } finally {
      setPlacesLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    let cancelled = false;

    const loadHotspots = async () => {
      try {
        const result = await fetch(`${DETECTION_API_URL}/api/hotspots?limit=200`);
        if (!result.ok) {
          throw new Error("Failed to load hotspots");
        }
        const payload = (await result.json()) as HotspotApiResponse;
        if (cancelled) return;

        const nextIncidents = payload.hotspots.map((r) => ({
          lat: r.cord_y,
          lng: r.cord_x,
          weight: r.score,
          type: r.type === "near" ? ("near" as const) : ("actual" as const),
          dbImageBase64: r.image_base64,
        }));

        setIncidents(nextIncidents);
        setHotspotsLastComputedAt(payload.computedAt);
      } catch (error) {
        console.warn("Detection API unreachable (", error, "). Loading fallback mock incidents for UI testing.");
        if (cancelled) return;
        setIncidents([
          { lat: 42.6644, lng: 23.3740, weight: 9, type: "actual" as const },
          { lat: 42.6680, lng: 23.3650, weight: 5, type: "near" as const },
          { lat: 42.6700, lng: 23.3800, weight: 2, type: "near" as const },
          { lat: 42.6600, lng: 23.3700, weight: 8, type: "actual" as const },
        ]);
        setHotspotsLastComputedAt(new Date().toISOString());
      }
    };

    void loadHotspots();
    const timer = window.setInterval(() => {
      void loadHotspots();
    }, HOTSPOT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void loadUserPlaces();
  }, [loadUserPlaces]);

  const enrichedIncidents = useMemo<Incident[]>(
    () =>
      incidents.map((e, i) => {
        const images = ["/snapshots/cam1.png", "/snapshots/cam2.png"];
        const imageUrl = e.dbImageBase64 ? `data:image/jpeg;base64,${e.dbImageBase64}` : images[i % images.length];

        return {
          ...e,
          id: i + 1,
          severity: severityFromWeight(e.weight),
          location: `Hotspot ${i + 1}`,
          count: Math.max(1, Math.round(e.weight / 2)),
          camera: `CAM-${String(i + 1).padStart(2, "0")}`,
          imageUrl,
        };
      }),
    [incidents],
  );

  const sortedIncidents = useMemo(
    () => [...enrichedIncidents].sort((a, b) => b.weight - a.weight),
    [enrichedIncidents],
  );

  const highRiskIncidents = useMemo(
    () => enrichedIncidents.filter((i) => i.severity === "high"),
    [enrichedIncidents],
  );

  const severityCounts = useMemo<Record<Severity, number>>(
    () => ({
      high: enrichedIncidents.filter((i) => i.severity === "high").length,
      medium: enrichedIncidents.filter((i) => i.severity === "medium").length,
      low: enrichedIncidents.filter((i) => i.severity === "low").length,
    }),
    [enrichedIncidents],
  );

  const handleMapPick = useCallback(
    (latlng: { lat: number; lng: number }, mode: Exclude<MapPickMode, null>) => {
      const picked = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      if (mode === "origin") {
        setOrigin(picked);
        setMapPickMode("destination");
        setTab("route");
        return;
      }

      if (mode === "destination") {
        setDestination(picked);
        setMapPickMode(null);
        setTab("route");
        return;
      }

      setPlacePick({ lat: latlng.lat, lng: latlng.lng });
      setMapPickMode(null);
      setTab("myPlaces");
    },
    [],
  );

  const savePlace = useCallback(async () => {
    const trimmedName = placeNameInput.trim();
    if (!trimmedName || !placePick) return;

    setSavingPlace(true);
    setPlacesError("");
    try {
      const response = await fetch(`${AUTH_API_URL}/user-points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          lan: placePick.lat,
          lon: placePick.lng,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorPayload?.error ?? "Failed to save place");
      }

      const created = (await response.json()) as UserPlace;
      setUserPlaces((prev) => [created, ...prev]);
      setPlaceNameInput("");
      setPlacePick(null);
    } catch (error) {
      setPlacesError(error instanceof Error ? error.message : "Failed to save place");
    } finally {
      setSavingPlace(false);
    }
  }, [authToken, placeNameInput, placePick]);

  const selectPlaceAsOrigin = useCallback(
    (placeId: string) => {
      if (!placeId) return;
      const place = userPlaces.find((p) => p.id === Number(placeId));
      if (!place) return;
      setOrigin(`${place.lan.toFixed(6)}, ${place.lon.toFixed(6)}`);
    },
    [userPlaces],
  );

  const selectPlaceAsDestination = useCallback(
    (placeId: string) => {
      if (!placeId) return;
      const place = userPlaces.find((p) => p.id === Number(placeId));
      if (!place) return;
      setDestination(`${place.lan.toFixed(6)}, ${place.lon.toFixed(6)}`);
    },
    [userPlaces],
  );

  /* ---- route calculation ---- */
  const calcRoute = useCallback(async () => {
    if (!origin || !destination) return;

    setRouteLoading(true);
    setRouteError("");
    setRouteInfos([]);
    setRoutePolylines([]);
    setSelectedRouteRank(0);
    setRouteWeatherByRank({});

    try {
      const oCoords = parseLatLngInput(origin);
      const dCoords = parseLatLngInput(destination);

      if (!oCoords || !dCoords) {
        setRouteError("Invalid coordinates. Please enter in format: lat, lng");
        setRouteLoading(false);
        return;
      }

      const result = await fetch(
        "http://localhost:8004/get_route?" +
        new URLSearchParams({
          lngA: oCoords.lng.toString(),
          latA: oCoords.lat.toString(),
          lngB: dCoords.lng.toString(),
          latB: dCoords.lat.toString(),
          exclusion: avoidDanger
            ? JSON.stringify(
              enrichedIncidents.map((incident) => ({
                lat: incident.lat,
                lon: incident.lng,
              })),
            )
            : "",
          travelMode,
        }),
      );
      if (result.status !== 200) {
        setRouteError("Error calculating route. Please try again.");
        setRouteLoading(false);
        return;
      }
      const parsedResult = (await result.json()) as ValhallaResponse;
      const directions = valhallaToDirections(parsedResult);
      console.debug("Directions result:", parsedResult);

      const polylines: RoutePolyline[] = [];
      const infos: RouteInfo[] = [];

      directions.routes.forEach((route, idx) => {
        const cfg = ROUTE_CONFIGS[idx];
        if (!cfg) return;

        const positions: [number, number][] = route.overview_path.map((p) => [
          p.lat,
          p.lng,
        ]);

        polylines.push({
          positions,
          color: cfg.color,
          weight: idx === 0 ? 6 : 4,
          opacity: idx === 0 ? 0.9 : 0.55,
          rank: idx,
        });

        const leg = route.legs[0];
        const routeEntry = parsedResult.route[idx];
        const turns = routeEntry ? countRouteTurnsFromManeuvers(routeEntry.trip.legs) : 0;
        if (leg?.distance?.text && leg?.duration?.text) {
          infos.push({
            distance: leg.distance.text,
            duration: leg.duration.text,
            rank: idx,
            avoided: parsedResult.route[idx]?.avoided ?? 0,
            turns,
            difficulty: difficultyFromTurns(turns),
          });
        }
      });

      setRoutePolylines(polylines);
      setRouteInfos(infos);
      setSelectedRouteRank(0);

      const requestSeq = weatherRequestSeq.current + 1;
      weatherRequestSeq.current = requestSeq;

      void Promise.all(
        polylines.map(async (route) => {
          const sampledPoints = sampleRoutePointsForWeather(route.positions);
          try {
            const weatherPoints = await Promise.all(
              sampledPoints.map(async ([lat, lng], pointIdx) => {
                const payload = await fetchWeather(lat, lng);
                const weather = payload.current_weather;
                return {
                  lat,
                  lng,
                  checkpointLabel: `Point ${pointIdx + 1}`,
                  temperature: weather?.temperature ?? null,
                  winddirection: weather?.winddirection ?? null,
                  weathercode: weather?.weathercode ?? null,
                  time: weather?.time ?? null,
                } satisfies RouteWeatherPoint;
              }),
            );

            if (weatherRequestSeq.current !== requestSeq) return;

            setRouteWeatherByRank((prev) => ({
              ...prev,
              [route.rank]: weatherPoints,
            }));
          } catch (error) {
            console.error("Failed to fetch weather for route", route.rank, error);
          }
        }),
      );
    } catch (e) {
      console.error(e);
      setRoutePolylines([]);
      setRouteError("Could not find a route. Please check both addresses.");
    } finally {
      setRouteLoading(false);
    }
  }, [avoidDanger, destination, enrichedIncidents, highRiskIncidents.length, origin, travelMode]);

  const clearRoute = useCallback(() => {
    weatherRequestSeq.current += 1;
    setRoutePolylines([]);
    setRouteInfos([]);
    setRouteError("");
    setRouteWeatherByRank({});
    setMapPickMode(null);
    setOrigin("");
    setDestination("");
  }, []);

  /* ---- derived values ---- */
  const canCalc = origin.length > 0 && destination.length > 0 && !routeLoading;
  const btnBg = canCalc ? "#E24B4A" : "rgba(255,255,255,0.08)";
  const btnColor = canCalc ? "#fff" : "rgba(232,228,220,0.3)";

  const originCoords = parseLatLngInput(origin);
  const destCoords = parseLatLngInput(destination);
  const selectedRouteWeather = routeWeatherByRank[selectedRouteRank] ?? [];

  // Consume panTarget after one render

  /* ---- render ---- */
  return (
    <div className="app-root">
      {/* ================ SIDEBAR ================ */}
      <aside className="sidebar">
        {/* -- header -- */}
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <div className="sidebar-logo">S</div>
            <span className="sidebar-title">SafeRoute</span>
            <span className="sidebar-live">LIVE</span>
          </div>
          <p className="sidebar-subtitle">
            {`Sofia | ${incidents.length} incidents | last 30 days${hotspotsLastComputedAt ? ` | updated ${new Date(hotspotsLastComputedAt).toLocaleTimeString()}` : ""}`}
          </p>
        </div>

        {/* -- severity counts -- */}
        <div className="severity-counts">
          {(["high", "medium", "low"] as const).map((sev) => (
            <div key={sev} className="severity-cell">
              <div className="severity-count" style={{ color: SEVERITY_META[sev].color }}>{severityCounts[sev]}</div>
              <div className="severity-label">{SEVERITY_META[sev].label}</div>
            </div>
          ))}
        </div>

        {/* -- tabs -- */}
        <div className="tab-row">
          {(["heatmap", "route", "myPlaces"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`tab-btn${tab === value ? " tab-btn-active" : ""}`}
            >
              {value === "heatmap"
                ? "Hotspots"
                : value === "route"
                  ? "Route"
                  : "My places"}
            </button>
          ))}
        </div>

        {/* -- tab content -- */}
        <div className="tab-content">
          {tab === "heatmap" ? (
            <HeatmapPanel
              incidents={sortedIncidents}
              selectedId={selectedIncident?.id ?? null}
              showMarkers={showMarkers}
              onToggleMarkers={() => setShowMarkers((v) => !v)}
              onSelectIncident={(inc) => {
                setSelectedIncident((prev) =>
                  prev?.id === inc.id ? null : inc,
                );
                setPanTarget([inc.lat, inc.lng]);
                setPanSeq((s) => s + 1);
              }}
            />
          ) : tab === "route" ? (
            <RoutePanel
              origin={origin}
              destination={destination}
              userPlaces={userPlaces}
              travelMode={travelMode}
              avoidDanger={avoidDanger}
              mapPickMode={mapPickMode}
              routeInfos={routeInfos}
              routeError={routeError}
              routeLoading={routeLoading}
              highRiskCount={highRiskIncidents.length}
              canCalc={canCalc}
              btnBg={btnBg}
              btnColor={btnColor}
              selectedRouteRank={selectedRouteRank}
              onSelectRoute={setSelectedRouteRank}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              onOriginFromPlace={selectPlaceAsOrigin}
              onDestinationFromPlace={selectPlaceAsDestination}
              onTravelModeChange={setTravelMode}
              onToggleAvoidDanger={() => setAvoidDanger((v) => !v)}
              onPickMode={setMapPickMode}
              onCalcRoute={() => void calcRoute()}
              onClearRoute={clearRoute}
            />
          ) : (
            <MyPlacesPanel
              places={userPlaces}
              loading={placesLoading}
              error={placesError}
              placeNameInput={placeNameInput}
              placePick={placePick}
              mapPickMode={mapPickMode}
              savingPlace={savingPlace}
              onPlaceNameChange={setPlaceNameInput}
              onStartPick={() => setMapPickMode(mapPickMode === "myPlace" ? null : "myPlace")}
              onSavePlace={() => void savePlace()}
            />
          )}
        </div>

        {/* -- footer -- */}
        <div className="sidebar-footer">
          VenTech | SafeRoute | HackTUES 2026
        </div>
      </aside>

      {/* ================ MAP ================ */}
      <main className="map-main">
        <MapContainer
          center={BULGARIA_CENTER}
          zoom={8}
          zoomControl={true}
          className="map-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler pickMode={mapPickMode} onPick={handleMapPick} />
          <MapPanTo center={panTarget} seq={panSeq} />

          {/* Hotspot radius circles */}
          {enrichedIncidents.map((inc) => {
            const circleColor = inc.type === "actual" ? "#E24B4A" : "#FFD600";
            return (
              <Circle
                key={`circle-${inc.id}`}
                center={[inc.lat, inc.lng]}
                radius={HOTSPOT_RADIUS_M}
                pathOptions={{
                  color: circleColor,
                  weight: 1,
                  opacity: 0.7,
                  fillColor: circleColor,
                  fillOpacity: 0.12,
                }}
              />
            );
          })}

          {/* Incident markers */}
          {showMarkers &&
            enrichedIncidents.map((inc) => (
              <CircleMarker
                key={`marker-${inc.id}`}
                center={[inc.lat, inc.lng]}
                radius={9}
                pathOptions={{
                  fillColor: SEVERITY_META[inc.severity].color,
                  fillOpacity: 0.95,
                  color: "#fff",
                  weight: 2,
                }}
                eventHandlers={{
                  click: () => setSelectedIncident(inc),
                }}
              />
            ))}

          {userPlaces.map((place) => (
            <Marker
              key={`user-place-${place.id}`}
              position={[place.lan, place.lon]}
              icon={makePlaceIcon(place.name)}
            />
          ))}


          {/* Route polylines */}
          {[...routePolylines]
            .sort((a, b) =>
              a.rank === selectedRouteRank
                ? 1
                : b.rank === selectedRouteRank
                  ? -1
                  : a.rank - b.rank
            )
            .map((route) => {
              const isSelected = route.rank === selectedRouteRank;
              return (
                <Polyline
                  key={`route-${route.rank}`}
                  positions={route.positions}
                  pathOptions={{
                    color: route.color,
                    weight: isSelected ? 8 : 4,
                    opacity: isSelected ? 1.0 : 0.4,
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelectedRouteRank(route.rank);
                      setTab("route");
                    },
                  }}
                />
              );
            })}

          {/* Weather markers for selected route */}
          {selectedRouteWeather.map((point, idx) => (
            <Marker
              key={`weather-${selectedRouteRank}-${idx}-${point.lat}-${point.lng}`}
              position={[point.lat, point.lng]}
              icon={makeWeatherPointIcon(point)}
            />
          ))}

          {/* Origin marker */}
          {originCoords && (
            <Marker
              position={[originCoords.lat, originCoords.lng]}
              icon={makeDivIcon("#3B6D11", "A")}
            />
          )}

          {/* Destination marker */}
          {destCoords && (
            <Marker
              position={[destCoords.lat, destCoords.lng]}
              icon={makeDivIcon("#1E88E5", "B")}
            />
          )}
        </MapContainer>

        {selectedIncident && (
          <div
            style={{
              position: "absolute",
              right: 24,
              bottom: 24,
              minWidth: 240,
              padding: "14px 16px",
              borderRadius: 12,
              background: "#141618",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, backgroundColor: "#ff3b3b", borderRadius: "50%", animation: "blink 1.2s infinite" }} />
                <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }`}</style>
                LIVE • {selectedIncident.location}
              </strong>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{
                  border: "none",
                  background: "none",
                  color: "rgba(232,228,220,0.6)",
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </div>
            {selectedIncident.imageUrl && (
              <div style={{ position: "relative", marginTop: 12, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                <img
                  src={selectedIncident.imageUrl}
                  alt="Live Camera Feed"
                  style={{ width: "100%", height: "auto", display: "block", aspectRatio: "16/9", objectFit: "cover" }}
                />
                <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 8px", fontSize: 10, borderRadius: 4, fontFamily: "monospace", letterSpacing: "1px" }}>
                  {selectedIncident.camera} • REC
                </div>
              </div>
            )}
            <div
              style={{
                marginTop: 0,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span>{selectedIncident.count} incidents</span>
              <span>{SEVERITY_META[selectedIncident.severity].label}</span>
              <span>{`${selectedIncident.lat.toFixed(4)}, ${selectedIncident.lng.toFixed(4)}`}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

type AuthMode = "signIn" | "signUp";

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [authToken, setAuthToken] = useState<string | null>(() =>
    window.localStorage.getItem(AUTH_TOKEN_KEY),
  );
  const [authUsername, setAuthUsername] = useState<string | null>(() =>
    window.localStorage.getItem(AUTH_USERNAME_KEY),
  );

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setAuthUsername(null);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USERNAME_KEY);
    setAuthMode("signIn");
  }, []);

  if (!authToken) {
    if (authMode === "signUp") {
      return (
        <SignUpPage
          onAuthenticated={(username) => {
            setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
            setAuthUsername(username);
          }}
          onSwitchToSignIn={() => {
            setAuthMode("signIn");
          }}
        />
      );
    }

    return (
      <SignInPage
        onAuthenticated={(username) => {
          setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
          setAuthUsername(username);
        }}
        onSwitchToSignUp={() => {
          setAuthMode("signUp");
        }}
      />
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleLogout}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 2000,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(20,22,24,0.8)",
          color: "rgba(232,228,220,0.9)",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {authUsername ? `Log out (${authUsername})` : "Log out"}
      </button>
      <SafetyMapApp authToken={authToken} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Toggle({
  on,
  onToggle,
  color,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onToggle}
      className={`toggle-btn${on ? " toggle-on" : ""}`}
      style={{ background: on ? color : undefined }}
    >
      <span className="toggle-knob" style={{ left: on ? 16 : 2 }} />
    </button>
  );
}

function HeatmapPanel({
  incidents,
  selectedId,
  showMarkers,
  onToggleMarkers,
  onSelectIncident,
}: {
  incidents: Incident[];
  selectedId: number | null;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  onSelectIncident: (incident: Incident) => void;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          padding: "8px 12px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "rgba(232,228,220,0.6)" }}>
          Markers
        </span>
        <Toggle
          on={showMarkers}
          onToggle={onToggleMarkers}
          color="#E24B4A"
          label="Toggle markers"
        />
      </div>

      {incidents.map((incident) => {
        const selected = selectedId === incident.id;
        return (
          <button
            key={incident.id}
            onClick={() => onSelectIncident(incident)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              marginBottom: 6,
              borderRadius: 8,
              cursor: "pointer",
              color: "#e8e4dc",
              background: selected
                ? "rgba(226,75,74,0.1)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${selected ? "rgba(226,75,74,0.4)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: SEVERITY_META[incident.severity].color,
                  display: "inline-block",
                }}
              />
              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>
                {incident.location}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: SEVERITY_META[incident.severity].color,
                }}
              >
                {SEVERITY_META[incident.severity].label}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                paddingLeft: 16,
                fontSize: 10,
                color: "rgba(232,228,220,0.4)",
              }}
            >
              <span>{incident.count} incidents</span>
              <span>{incident.camera}</span>
            </div>
          </button>
        );
      })}
    </>
  );
}

function RoutePanel({
  origin,
  destination,
  userPlaces,
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
  selectedRouteRank,
  onSelectRoute,
  onOriginChange,
  onDestinationChange,
  onOriginFromPlace,
  onDestinationFromPlace,
  onTravelModeChange,
  onToggleAvoidDanger,
  onPickMode,
  onCalcRoute,
  onClearRoute,
}: {
  origin: string;
  destination: string;
  userPlaces: UserPlace[];
  travelMode: TravelMode;
  avoidDanger: boolean;
  mapPickMode: MapPickMode;
  routeInfos: RouteInfo[];
  routeError: string;
  routeLoading: boolean;
  highRiskCount: number;
  canCalc: boolean;
  btnBg: string;
  btnColor: string;
  selectedRouteRank: number;
  onSelectRoute: (rank: number) => void;
  onOriginChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onOriginFromPlace: (id: string) => void;
  onDestinationFromPlace: (id: string) => void;
  onTravelModeChange: (v: TravelMode) => void;
  onToggleAvoidDanger: () => void;
  onPickMode: (mode: MapPickMode) => void;
  onCalcRoute: () => void;
  onClearRoute: () => void;
}) {
  return (
    <>
      <label
        htmlFor="origin-place"
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        FROM MY PLACES
      </label>
      <select
        id="origin-place"
        defaultValue=""
        onChange={(e) => onOriginFromPlace(e.target.value)}
        style={INPUT_STYLE}
      >
        <option value="" style={{ color: "#111" }}>
          Select saved point
        </option>
        {userPlaces.map((place) => (
          <option key={`origin-${place.id}`} value={place.id} style={{ color: "#111" }}>
            {place.name}
          </option>
        ))}
      </select>

      <label
        htmlFor="origin"
        style={{
          display: "block",
          margin: "12px 0 6px",
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        FROM
      </label>
      <input
        id="origin"
        value={origin}
        onChange={(e) => onOriginChange(e.target.value)}
        placeholder="e.g. Studentski grad, Sofia"
        style={INPUT_STYLE}
      />

      <label
        htmlFor="destination-place"
        style={{
          display: "block",
          margin: "12px 0 6px",
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        TO MY PLACES
      </label>
      <select
        id="destination-place"
        defaultValue=""
        onChange={(e) => onDestinationFromPlace(e.target.value)}
        style={INPUT_STYLE}
      >
        <option value="" style={{ color: "#111" }}>
          Select saved point
        </option>
        {userPlaces.map((place) => (
          <option key={`destination-${place.id}`} value={place.id} style={{ color: "#111" }}>
            {place.name}
          </option>
        ))}
      </select>

      <label
        htmlFor="destination"
        style={{
          display: "block",
          margin: "12px 0 6px",
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        TO
      </label>
      <input
        id="destination"
        value={destination}
        onChange={(e) => onDestinationChange(e.target.value)}
        placeholder="e.g. NDK, Sofia"
        style={INPUT_STYLE}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          onClick={() => onPickMode(mapPickMode === "origin" ? null : "origin")}
          style={{
            padding: "8px 0",
            borderRadius: 8,
            border: `1px solid ${mapPickMode === "origin" ? "rgba(59,109,17,0.55)" : "rgba(255,255,255,0.1)"}`,
            background:
              mapPickMode === "origin"
                ? "rgba(59,109,17,0.2)"
                : "rgba(255,255,255,0.04)",
            color: "#e8e4dc",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Pick FROM on map
        </button>
        <button
          onClick={() =>
            onPickMode(mapPickMode === "destination" ? null : "destination")
          }
          style={{
            padding: "8px 0",
            borderRadius: 8,
            border: `1px solid ${mapPickMode === "destination" ? "rgba(226,75,74,0.55)" : "rgba(255,255,255,0.1)"}`,
            background:
              mapPickMode === "destination"
                ? "rgba(226,75,74,0.2)"
                : "rgba(255,255,255,0.04)",
            color: "#e8e4dc",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Pick TO on map
        </button>
      </div>

      {mapPickMode && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "rgba(232,228,220,0.55)",
          }}
        >
          Click the map to set {mapPickMode === "origin" ? "FROM" : "TO"}.
        </div>
      )}

      <label
        htmlFor="travel-mode"
        style={{
          display: "block",
          margin: "12px 0 6px",
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        TRAVEL MODE
      </label>
      <select
        id="travel-mode"
        value={travelMode}
        onChange={(e) => onTravelModeChange(e.target.value as TravelMode)}
        style={INPUT_STYLE}
      >
        <option value="drive" style={{ color: "#111" }}>
          Car
        </option>
        <option value="pedestrian" style={{ color: "#111" }}>
          Walking
        </option>
      </select>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          marginTop: 12,
          marginBottom: 12,
          borderRadius: 8,
          background: avoidDanger
            ? "rgba(99,153,34,0.08)"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${avoidDanger ? "rgba(99,153,34,0.25)" : "rgba(255,255,255,0.06)"}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            Avoid dangerous intersections
          </div>
          <div style={{ fontSize: 10, color: "rgba(232,228,220,0.45)" }}>
            {`May add 2 to 5 min | skips ${highRiskCount} high-risk areas`}
          </div>
        </div>
        <Toggle
          on={avoidDanger}
          onToggle={onToggleAvoidDanger}
          color="#639922"
          label="Toggle safe routing"
        />
      </div>

      {avoidDanger && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              color: "rgba(232,228,220,0.72)",
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            Hotspots are treated as a 50m no-go zone when Safe Route is on.
          </div>
        </div>
      )}

      <button
        onClick={onCalcRoute}
        disabled={!canCalc}
        style={{
          width: "100%",
          padding: "11px 0",
          border: "none",
          borderRadius: 8,
          background: btnBg,
          color: btnColor,
          cursor: canCalc ? "pointer" : "default",
        }}
      >
        {routeLoading ? "Calculating..." : "Find routes"}
      </button>

      {/* Route legend — shown when we have results */}
      {routeInfos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: "rgba(232,228,220,0.45)",
              marginBottom: 8,
            }}
          >
            ROUTES FOUND
          </div>
          {routeInfos.map((info) => {
            const cfg = ROUTE_CONFIGS[info.rank];
            const isSelected = info.rank === selectedRouteRank;
            return (
              <div
                key={info.rank}
                onClick={() => onSelectRoute(info.rank)}
                style={{
                  marginBottom: 8,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isSelected ? cfg.border : cfg.bg,
                  border: `1px solid ${isSelected ? cfg.color : cfg.border}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                  boxShadow: isSelected ? `0 4px 12px ${cfg.bg}` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  {/* Color swatch */}
                  <span
                    style={{
                      display: "inline-block",
                      width: 28,
                      height: 4,
                      borderRadius: 2,
                      background: cfg.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: cfg.textColor,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    fontSize: 11,
                    color: "rgba(232,228,220,0.65)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{info.distance}</span>
                  <span>{info.duration}</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(99,153,34,0.16)",
                      border: "1px solid rgba(99,153,34,0.45)",
                      color: "#8BC34A",
                      fontWeight: 600,
                    }}
                  >
                    Dangerous zones avoided: {info.avoided}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        info.difficulty === "easy"
                          ? "rgba(99,153,34,0.16)"
                          : info.difficulty === "moderate"
                          ? "rgba(239,159,39,0.16)"
                          : "rgba(226,75,74,0.16)",
                      border:
                        info.difficulty === "easy"
                          ? "1px solid rgba(99,153,34,0.45)"
                          : info.difficulty === "moderate"
                          ? "1px solid rgba(239,159,39,0.45)"
                          : "1px solid rgba(226,75,74,0.45)",
                      color:
                        info.difficulty === "easy"
                          ? "#8BC34A"
                          : info.difficulty === "moderate"
                          ? "#EF9F27"
                          : "#E24B4A",
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    Route difficulty (based on turns): {info.difficulty}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {routeError && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(226,75,74,0.1)",
            color: "#E24B4A",
            fontSize: 12,
          }}
        >
          {routeError}
        </div>
      )}

      {(routeInfos.length > 0 || routeError) && (
        <button
          onClick={onClearRoute}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "9px 0",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "none",
            color: "rgba(232,228,220,0.6)",
            cursor: "pointer",
          }}
        >
          Clear routes
        </button>
      )}
    </>
  );
}

function MyPlacesPanel({
  places,
  loading,
  error,
  placeNameInput,
  placePick,
  mapPickMode,
  savingPlace,
  onPlaceNameChange,
  onStartPick,
  onSavePlace,
}: {
  places: UserPlace[];
  loading: boolean;
  error: string;
  placeNameInput: string;
  placePick: { lat: number; lng: number } | null;
  mapPickMode: MapPickMode;
  savingPlace: boolean;
  onPlaceNameChange: (value: string) => void;
  onStartPick: () => void;
  onSavePlace: () => void;
}) {
  const canSave = placeNameInput.trim().length > 0 && placePick !== null && !savingPlace;

  return (
    <>
      <button
        onClick={onStartPick}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 8,
          border: `1px solid ${mapPickMode === "myPlace" ? "rgba(142,198,255,0.7)" : "rgba(255,255,255,0.1)"}`,
          background: mapPickMode === "myPlace" ? "rgba(142,198,255,0.16)" : "rgba(255,255,255,0.04)",
          color: "#e8e4dc",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {mapPickMode === "myPlace" ? "Click map to choose place" : "Pick place on map"}
      </button>

      {placePick && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "rgba(232,228,220,0.7)",
          }}
        >
          {`Selected point: ${placePick.lat.toFixed(6)}, ${placePick.lng.toFixed(6)}`}
        </div>
      )}

      <label
        htmlFor="place-name"
        style={{
          display: "block",
          margin: "12px 0 6px",
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        PLACE NAME
      </label>
      <input
        id="place-name"
        value={placeNameInput}
        onChange={(e) => onPlaceNameChange(e.target.value)}
        placeholder="e.g. Home"
        style={INPUT_STYLE}
      />

      <button
        onClick={onSavePlace}
        disabled={!canSave}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "10px 0",
          borderRadius: 8,
          border: "none",
          background: canSave ? "#1E88E5" : "rgba(255,255,255,0.08)",
          color: canSave ? "#fff" : "rgba(232,228,220,0.35)",
          cursor: canSave ? "pointer" : "default",
          fontWeight: 700,
        }}
      >
        {savingPlace ? "Saving..." : "Save place"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(226,75,74,0.1)",
            color: "#E24B4A",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          marginBottom: 8,
          fontSize: 11,
          color: "rgba(232,228,220,0.45)",
        }}
      >
        SAVED PLACES
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: "rgba(232,228,220,0.7)" }}>Loading places...</div>
      ) : places.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(232,228,220,0.5)" }}>No saved places yet.</div>
      ) : (
        places.map((place) => (
          <div
            key={place.id}
            style={{
              padding: "9px 10px",
              marginBottom: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#d7ecff" }}>{place.name}</div>
            <div style={{ fontSize: 10, color: "rgba(232,228,220,0.6)", marginTop: 2 }}>
              {`${place.lan.toFixed(6)}, ${place.lon.toFixed(6)}`}
            </div>
          </div>
        ))
      )}
    </>
  );
}
