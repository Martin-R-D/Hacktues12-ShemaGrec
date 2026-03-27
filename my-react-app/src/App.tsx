import { useCallback, useEffect, useRef, useState } from "react";
import rankingsData from "../detection/rankings.json";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Severity = "high" | "medium" | "low";

type IncidentEvent = { lat: number; lng: number; weight: number };

type Incident = IncidentEvent & {
  id: number;
  severity: Severity;
  location: string;
  count: number;
  camera: string;
};

type RouteInfo = {
  distance: string;
  duration: string;
  avoided: number;
  rank: number;
};

type TravelMode = "drive" | "pedestrian";

type RoutePolyline = {
  positions: [number, number][];
  color: string;
  weight: number;
  opacity: number;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SOFIA_CENTER: [number, number] = [42.6977, 23.3219];

const INCIDENTS: IncidentEvent[] = rankingsData.map((r) => ({
  lat: r.cord_y,
  lng: r.cord_x,
  weight: r.score,
}));

const HOTSPOT_RADIUS_M = 350;

const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  high: { color: "#E24B4A", label: "High" },
  medium: { color: "#EF9F27", label: "Medium" },
  low: { color: "#639922", label: "Low" },
};

const ROUTE_CONFIGS = [
  {
    color: "#4CAF50",
    label: "Safest",
    textColor: "#4CAF50",
    bg: "rgba(76,175,80,0.08)",
    border: "rgba(76,175,80,0.3)",
  },
  {
    color: "#EF9F27",
    label: "2nd Safest",
    textColor: "#EF9F27",
    bg: "rgba(239,159,39,0.08)",
    border: "rgba(239,159,39,0.3)",
  },
  {
    color: "#1E88E5",
    label: "3rd Safest",
    textColor: "#1E88E5",
    bg: "rgba(30,136,229,0.08)",
    border: "rgba(30,136,229,0.3)",
  },
];

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

const test = [
  [
    [27.46837, 42.4976994933525],
    [27.4686284546352, 42.49762056057704],
    [27.46873551005036, 42.49743],
    [27.4686284546352, 42.49723943942296],
    [27.46837, 42.497160506647504],
    [27.4681115453648, 42.49723943942296],
    [27.46800448994964, 42.49743],
    [27.4681115453648, 42.49762056057704],
  ],
  [
    [27.4533, 42.5236194933525],
    [27.453558561835827, 42.52354056057704],
    [27.45366566165494, 42.52335],
    [27.453558561835827, 42.52315943942296],
    [27.4533, 42.5230805066475],
    [27.45304143816417, 42.52315943942296],
    [27.452934338345056, 42.52335],
    [27.45304143816417, 42.52354056057704],
  ],
  [
    [27.75207, 42.2669894933525],
    [27.752327506677172, 42.26691056057704],
    [27.75243416943526, 42.26672],
    [27.752327506677172, 42.26652943942296],
    [27.75207, 42.2664505066475],
    [27.751812493322827, 42.26652943942296],
    [27.751705830564738, 42.26672],
    [27.751812493322827, 42.26691056057704],
  ],
  [
    [26.97803, 42.6511094933525],
    [26.978289091182386, 42.65103056057704],
    [26.978396410264022, 42.65084],
    [26.978289091182386, 42.65064943942296],
    [26.97803, 42.650570506647504],
    [26.977770908817615, 42.65064943942296],
    [26.97766358973598, 42.65084],
    [26.977770908817615, 42.65103056057704],
  ],
  [
    [27.24817, 42.7001094933525],
    [27.248429295552494, 42.70003056057704],
    [27.248536699287, 42.69984],
    [27.248429295552494, 42.69964943942296],
    [27.24817, 42.699570506647504],
    [27.247910704447502, 42.69964943942296],
    [27.247803300712995, 42.69984],
    [27.247910704447502, 42.70003056057704],
  ],
  [
    [27.46454, 42.5134194933525],
    [27.464798519633472, 42.51334056057704],
    [27.464905601971797, 42.51315],
    [27.464798519633472, 42.512959439422964],
    [27.46454, 42.512880506647505],
    [27.464281480366527, 42.512959439422964],
    [27.464174398028202, 42.51315],
    [27.464281480366527, 42.51334056057704],
  ],
  [
    [27.47163, 42.5024494933525],
    [27.471888474269768, 42.50237056057704],
    [27.471995537817833, 42.50218],
    [27.471888474269768, 42.501989439422964],
    [27.47163, 42.501910506647505],
    [27.471371525730234, 42.501989439422964],
    [27.47126446218217, 42.50218],
    [27.471371525730234, 42.50237056057704],
  ],
  [
    [27.34598, 42.6254294933525],
    [27.346238984279978, 42.62535056057704],
    [27.346346259081187, 42.62516],
    [27.346238984279978, 42.62496943942296],
    [27.34598, 42.6248905066475],
    [27.345721015720024, 42.62496943942296],
    [27.345613740918814, 42.62516],
    [27.345721015720024, 42.62535056057704],
  ],
  [
    [27.41349, 42.572429493352494],
    [27.413748764090975, 42.572350560577036],
    [27.413855947686912, 42.57216],
    [27.413748764090975, 42.57196943942296],
    [27.41349, 42.5718905066475],
    [27.413231235909024, 42.57196943942296],
    [27.413124052313087, 42.57216],
    [27.413231235909024, 42.572350560577036],
  ],
  [
    [27.45812, 42.5276794933525],
    [27.458378578640136, 42.52760056057704],
    [27.458485685419824, 42.52741],
    [27.458378578640136, 42.527219439422964],
    [27.45812, 42.527140506647505],
    [27.457861421359866, 42.527219439422964],
    [27.45775431458018, 42.52741],
    [27.457861421359866, 42.52760056057704],
  ],
  [
    [27.47621, 42.5509994933525],
    [27.476468675228908, 42.55092056057704],
    [27.476575822016972, 42.55073],
    [27.476468675228908, 42.55053943942296],
    [27.47621, 42.550460506647504],
    [27.47595132477109, 42.55053943942296],
    [27.475844177983024, 42.55073],
    [27.47595132477109, 42.55092056057704],
  ],
  [
    [27.47386, 42.4913194933525],
    [27.47411842827037, 42.49124056057704],
    [27.474225472764854, 42.49105],
    [27.47411842827037, 42.49085943942296],
    [27.47386, 42.4907805066475],
    [27.473601571729628, 42.49085943942296],
    [27.473494527235143, 42.49105],
    [27.473601571729628, 42.49124056057704],
  ],
  [
    [27.75601, 42.2694094933525],
    [27.756267516562914, 42.26933056057704],
    [27.756374183415808, 42.26914],
    [27.756267516562914, 42.26894943942296],
    [27.75601, 42.2688705066475],
    [27.755752483437085, 42.26894943942296],
    [27.75564581658419, 42.26914],
    [27.755752483437085, 42.26933056057704],
  ],
  [
    [27.22174, 42.587919493352494],
    [27.22199882838269, 42.587840560577035],
    [27.22210603860913, 42.58765],
    [27.22199882838269, 42.58745943942296],
    [27.22174, 42.5873805066475],
    [27.22148117161731, 42.58745943942296],
    [27.22137396139087, 42.58765],
    [27.22148117161731, 42.587840560577035],
  ],
  [
    [27.47565, 42.4416894933525],
    [27.475908223471205, 42.44161056057704],
    [27.4760151831351, 42.44142],
    [27.475908223471205, 42.44122943942296],
    [27.47565, 42.4411505066475],
    [27.4753917765288, 42.44122943942296],
    [27.475284816864903, 42.44142],
    [27.4753917765288, 42.44161056057704],
  ],
  [
    [26.96911, 42.6501594933525],
    [26.969369087225164, 42.65008056057704],
    [26.969476404667663, 42.64989],
    [26.969369087225164, 42.64969943942296],
    [26.96911, 42.6496205066475],
    [26.968850912774837, 42.64969943942296],
    [26.968743595332338, 42.64989],
    [26.968850912774837, 42.65008056057704],
  ],
  [
    [27.52045, 42.428429493352496],
    [27.520708168841267, 42.42835056057704],
    [27.520815105876704, 42.42816],
    [27.520708168841267, 42.42796943942296],
    [27.52045, 42.4278905066475],
    [27.520191831158733, 42.42796943942296],
    [27.520084894123297, 42.42816],
    [27.520191831158733, 42.42835056057704],
  ],
  [
    [27.25484, 42.704329493352496],
    [27.255099313177308, 42.70425056057704],
    [27.255206724212247, 42.70406],
    [27.255099313177308, 42.70386943942296],
    [27.25484, 42.7037905066475],
    [27.254580686822695, 42.70386943942296],
    [27.254473275787756, 42.70406],
    [27.254580686822695, 42.70425056057704],
  ],
  [
    [26.95027, 42.862409493352494],
    [26.950529976145592, 42.862330560577035],
    [26.95063766179099, 42.86214],
    [26.950529976145592, 42.86194943942296],
    [26.95027, 42.8618705066475],
    [26.950010023854407, 42.86194943942296],
    [26.94990233820901, 42.86214],
    [26.950010023854407, 42.862330560577035],
  ],
].reduce((prev, next) => prev.concat(next), []);

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

/* ------------------------------------------------------------------ */
/*  Derived data (static — computed once)                              */
/* ------------------------------------------------------------------ */

const ENRICHED_INCIDENTS: Incident[] = INCIDENTS.map((e, i) => ({
  ...e,
  id: i + 1,
  severity: severityFromWeight(e.weight),
  location: `Hotspot ${i + 1}`,
  count: Math.max(1, Math.round(e.weight / 2)),
  camera: `CAM-${String(i + 1).padStart(2, "0")}`,
}));

const SORTED_INCIDENTS = [...ENRICHED_INCIDENTS].sort(
  (a, b) => b.weight - a.weight,
);

const HIGH_RISK_INCIDENTS = ENRICHED_INCIDENTS.filter(
  (i) => i.severity === "high",
);

const SEVERITY_COUNTS: Record<Severity, number> = {
  high: ENRICHED_INCIDENTS.filter((i) => i.severity === "high").length,
  medium: ENRICHED_INCIDENTS.filter((i) => i.severity === "medium").length,
  low: ENRICHED_INCIDENTS.filter((i) => i.severity === "low").length,
};

/* ------------------------------------------------------------------ */
/*  Map interaction component                                          */
/* ------------------------------------------------------------------ */

function MapClickHandler({
  pickMode,
  onPick,
}: {
  pickMode: "origin" | "destination" | null;
  onPick: (
    latlng: { lat: number; lng: number },
    mode: "origin" | "destination",
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

export default function App() {
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
  const [mapPickMode, setMapPickMode] = useState<
    "origin" | "destination" | null
  >(null);
  const [tab, setTab] = useState<"heatmap" | "route">("heatmap");
  const [routePolylines, setRoutePolylines] = useState<RoutePolyline[]>([]);
  const [panTarget, setPanTarget] = useState<[number, number] | null>(null);
  const [panSeq, setPanSeq] = useState(0);

  const handleMapPick = useCallback(
    (latlng: { lat: number; lng: number }, mode: "origin" | "destination") => {
      const picked = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      if (mode === "origin") {
        setOrigin(picked);
        setMapPickMode("destination");
      } else {
        setDestination(picked);
        setMapPickMode(null);
      }
      setTab("route");
    },
    [],
  );

  /* ---- route calculation ---- */
  const calcRoute = useCallback(async () => {
    if (!origin || !destination) return;

    setRouteLoading(true);
    setRouteError("");
    setRouteInfos([]);
    setRoutePolylines([]);

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
                  ENRICHED_INCIDENTS.map((incident) => ({
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
        });

        const leg = route.legs[0];
        if (leg?.distance?.text && leg?.duration?.text) {
          const routePoints = positions.map(([lat, lng]) => ({ lat, lng }));
          const touchedCount = ENRICHED_INCIDENTS.filter((hs) =>
            routePoints.some(
              (p) =>
                haversineMeters(p.lat, p.lng, hs.lat, hs.lng) <=
                HOTSPOT_RADIUS_M,
            ),
          ).length;

          infos.push({
            distance: leg.distance.text,
            duration: leg.duration.text,
            avoided: HIGH_RISK_INCIDENTS.length - touchedCount,
            rank: idx,
          });
        }
      });

      setRoutePolylines(polylines);
      setRouteInfos(infos);
      if (!parsedResult.withExclusion) {
        setRouteError(
          "Could not find a route avoiding hotspots. Showing the safest possible route.",
        );
      }
    } catch (e) {
      console.error(e);
      setRoutePolylines([]);
      setRouteError("Could not find a route. Please check both addresses.");
    } finally {
      setRouteLoading(false);
    }
  }, [avoidDanger, destination, origin, travelMode]);

  const clearRoute = useCallback(() => {
    setRoutePolylines([]);
    setRouteInfos([]);
    setRouteError("");
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

  // Consume panTarget after one render

  /* ---- render ---- */
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0f1114",
        color: "#e8e4dc",
      }}
    >
      {/* ================ SIDEBAR ================ */}
      <aside
        style={{
          width: 320,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "#141618",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* -- header -- */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
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
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "#E24B4A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              S
            </div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>SafeRoute</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 10,
                background: "rgba(226,75,74,0.15)",
                color: "#E24B4A",
              }}
            >
              LIVE
            </span>
          </div>
          <p
            style={{ fontSize: 11, color: "rgba(232,228,220,0.45)", margin: 0 }}
          >
            {`Sofia | ${INCIDENTS.length} incidents | last 30 days`}
          </p>
        </div>

        {/* -- severity counts -- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: "rgba(255,255,255,0.04)",
          }}
        >
          {(["high", "medium", "low"] as const).map((sev) => (
            <div
              key={sev}
              style={{
                padding: "12px 0",
                textAlign: "center",
                background: "#141618",
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: SEVERITY_META[sev].color,
                }}
              >
                {SEVERITY_COUNTS[sev]}
              </div>
              <div style={{ fontSize: 10, color: "rgba(232,228,220,0.4)" }}>
                {SEVERITY_META[sev].label}
              </div>
            </div>
          ))}
        </div>

        {/* -- tabs -- */}
        <div
          style={{
            display: "flex",
            borderBlock: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {(["heatmap", "route"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              style={{
                flex: 1,
                padding: "11px 0",
                border: "none",
                background: "none",
                color: tab === value ? "#e8e4dc" : "rgba(232,228,220,0.35)",
                borderBottom: `2px solid ${tab === value ? "#E24B4A" : "transparent"}`,
                cursor: "pointer",
              }}
            >
              {value === "heatmap" ? "Hotspots" : "Route"}
            </button>
          ))}
        </div>

        {/* -- tab content -- */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {tab === "heatmap" ? (
            <HeatmapPanel
              incidents={SORTED_INCIDENTS}
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
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 10,
            color: "rgba(232,228,220,0.25)",
          }}
        >
          VenTech | SafeRoute | HackTUES 2026
        </div>
      </aside>

      {/* ================ MAP ================ */}
      <main style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
        <MapContainer
          center={SOFIA_CENTER}
          zoom={14}
          zoomControl={true}
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler pickMode={mapPickMode} onPick={handleMapPick} />
          <MapPanTo center={panTarget} seq={panSeq} />

          {/* Hotspot radius circles */}
          {ENRICHED_INCIDENTS.map((inc) => (
            <Circle
              key={`circle-${inc.id}`}
              center={[inc.lat, inc.lng]}
              radius={HOTSPOT_RADIUS_M}
              pathOptions={{
                color: "#FFD600",
                weight: 1,
                opacity: 0.7,
                fillColor: "#FFD600",
                fillOpacity: 0.12,
              }}
            />
          ))}

          {/* Incident markers */}
          {showMarkers &&
            ENRICHED_INCIDENTS.map((inc) => (
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

          {showMarkers &&
            test.map((point, idx) => {
              return (
                <CircleMarker
                  key={`polygon-${idx}`}
                  center={[point[1], point[0]]}
                  radius={9}
                  pathOptions={{
                    fillColor: "#E24B4A",
                    fillOpacity: 0.95,
                    color: "#fff",
                    weight: 2,
                  }}
                />
              );
            })}

          {/* Route polylines */}
          {[...routePolylines].reverse().map((route, idx) => (
            <Polyline
              key={`route-${idx}`}
              positions={route.positions}
              pathOptions={{
                color: route.color,
                weight: route.weight,
                opacity: route.opacity,
              }}
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
              <strong style={{ fontSize: 12 }}>
                {selectedIncident.location}
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
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span>{selectedIncident.count} incidents</span>
              <span>{SEVERITY_META[selectedIncident.severity].label}</span>
              <span>{selectedIncident.camera}</span>
              <span>{`${selectedIncident.lat.toFixed(4)}, ${selectedIncident.lng.toFixed(4)}`}</span>
            </div>
          </div>
        )}
      </main>
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
      style={{
        width: 34,
        height: 20,
        border: "none",
        borderRadius: 10,
        padding: 0,
        background: on ? color : "rgba(255,255,255,0.1)",
        cursor: "pointer",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: "#fff",
        }}
      />
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
  onOriginChange,
  onDestinationChange,
  onTravelModeChange,
  onToggleAvoidDanger,
  onPickMode,
  onCalcRoute,
  onClearRoute,
}: {
  origin: string;
  destination: string;
  travelMode: TravelMode;
  avoidDanger: boolean;
  mapPickMode: "origin" | "destination" | null;
  routeInfos: RouteInfo[];
  routeError: string;
  routeLoading: boolean;
  highRiskCount: number;
  canCalc: boolean;
  btnBg: string;
  btnColor: string;
  onOriginChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onTravelModeChange: (v: TravelMode) => void;
  onToggleAvoidDanger: () => void;
  onPickMode: (mode: "origin" | "destination" | null) => void;
  onCalcRoute: () => void;
  onClearRoute: () => void;
}) {
  return (
    <>
      <label
        htmlFor="origin"
        style={{
          display: "block",
          marginBottom: 6,
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
            return (
              <div
                key={info.rank}
                style={{
                  marginBottom: 8,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
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
                  }}
                >
                  <span>{info.distance}</span>
                  <span>{info.duration}</span>
                  {avoidDanger && (
                    <span
                      style={{
                        color:
                          info.avoided > 0
                            ? "#639922"
                            : "rgba(232,228,220,0.4)",
                      }}
                    >
                      {info.avoided} avoided
                    </span>
                  )}
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
