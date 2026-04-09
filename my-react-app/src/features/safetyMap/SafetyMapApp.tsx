import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
} from "react-leaflet";
import type { ValhallaResponse } from "../../services/valhallaToDirections";
import { valhallaToDirections } from "../../services/valhallaToDirections";
import PlateRegistryDashboard from "../../components/PlateRegistryDashboard";
import {
  AUTH_API_URL,
  BULGARIA_CENTER,
  DETECTION_API_URL,
  HOTSPOT_POLL_MS,
  HOTSPOT_RADIUS_M,
  ROUTE_CONFIGS,
  SEVERITY_META,
} from "./constants";
import { MapClickHandler, MapPanTo } from "./mapInteraction";
import { HeatmapPanel, MyPlacesPanel, RoutePanel } from "./panels";
import {
  countRouteTurnsFromManeuvers,
  difficultyFromTurns,
  fetchWeather,
  makeDivIcon,
  makePlaceIcon,
  makeWeatherPointIcon,
  parseLatLngInput,
  sampleRoutePointsForWeather,
  severityFromWeight,
} from "./utils";
import type {
  HotspotApiResponse,
  Incident,
  IncidentEvent,
  MapPickMode,
  RouteInfo,
  RoutePolyline,
  RouteWeatherPoint,
  TravelMode,
  UserPlace,
} from "./types";

export default function SafetyMapApp({ authToken }: { authToken: string }) {
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
  const [tab, setTab] = useState<"heatmap" | "route" | "myPlaces" | "plates">(
    "heatmap",
  );
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
  const [placePick, setPlacePick] = useState<{ lat: number; lng: number } | null>(
    null,
  );
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
      setPlacesError(
        error instanceof Error ? error.message : "Failed to load your places",
      );
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
        console.warn(
          "Detection API unreachable (",
          error,
          "). Loading fallback mock incidents for UI testing.",
        );
        if (cancelled) return;
        setIncidents([
          { lat: 42.6644, lng: 23.374, weight: 9, type: "actual" as const },
          { lat: 42.668, lng: 23.365, weight: 5, type: "near" as const },
          { lat: 42.67, lng: 23.38, weight: 2, type: "near" as const },
          { lat: 42.66, lng: 23.37, weight: 8, type: "actual" as const },
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
        const imageUrl = e.dbImageBase64
          ? `data:image/jpeg;base64,${e.dbImageBase64}`
          : images[i % images.length];

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

  const severityCounts = useMemo(
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
        const turns = routeEntry
          ? countRouteTurnsFromManeuvers(routeEntry.trip.legs)
          : 0;
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
  }, [avoidDanger, destination, enrichedIncidents, origin, travelMode]);

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

  const canCalc = origin.length > 0 && destination.length > 0 && !routeLoading;
  const btnBg = canCalc ? "#E24B4A" : "rgba(255,255,255,0.08)";
  const btnColor = canCalc ? "#fff" : "rgba(232,228,220,0.3)";

  const originCoords = parseLatLngInput(origin);
  const destCoords = parseLatLngInput(destination);
  const selectedRouteWeather = routeWeatherByRank[selectedRouteRank] ?? [];

  return (
    <div className="app-root">
      <aside className="sidebar">
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

        <div className="severity-counts">
          {(["high", "medium", "low"] as const).map((sev) => (
            <div key={sev} className="severity-cell">
              <div className="severity-count" style={{ color: SEVERITY_META[sev].color }}>
                {severityCounts[sev]}
              </div>
              <div className="severity-label">{SEVERITY_META[sev].label}</div>
            </div>
          ))}
        </div>

        <div className="tab-row">
          {(["heatmap", "route", "myPlaces", "plates"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`tab-btn${tab === value ? " tab-btn-active" : ""}`}
            >
              {value === "heatmap"
                ? "Hotspots"
                : value === "route"
                  ? "Route"
                  : value === "myPlaces"
                    ? "My places"
                    : "Plates"}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {tab === "heatmap" ? (
            <HeatmapPanel
              incidents={sortedIncidents}
              selectedId={selectedIncident?.id ?? null}
              showMarkers={showMarkers}
              onToggleMarkers={() => setShowMarkers((v) => !v)}
              onSelectIncident={(inc) => {
                setSelectedIncident((prev) => (prev?.id === inc.id ? null : inc));
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
          ) : tab === "myPlaces" ? (
            <MyPlacesPanel
              places={userPlaces}
              loading={placesLoading}
              error={placesError}
              placeNameInput={placeNameInput}
              placePick={placePick}
              mapPickMode={mapPickMode}
              savingPlace={savingPlace}
              onPlaceNameChange={setPlaceNameInput}
              onStartPick={() =>
                setMapPickMode(mapPickMode === "myPlace" ? null : "myPlace")
              }
              onSavePlace={() => void savePlace()}
            />
          ) : (
            <PlateRegistryDashboard />
          )}
        </div>

        <div className="sidebar-footer">VenTech | SafeRoute | HackTUES 2026</div>
      </aside>

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

          {[...routePolylines]
            .sort((a, b) =>
              a.rank === selectedRouteRank
                ? 1
                : b.rank === selectedRouteRank
                  ? -1
                  : a.rank - b.rank,
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
                    opacity: isSelected ? 1 : 0.4,
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

          {selectedRouteWeather.map((point, idx) => (
            <Marker
              key={`weather-${selectedRouteRank}-${idx}-${point.lat}-${point.lng}`}
              position={[point.lat, point.lng]}
              icon={makeWeatherPointIcon(point)}
            />
          ))}

          {originCoords && (
            <Marker
              position={[originCoords.lat, originCoords.lng]}
              icon={makeDivIcon("#3B6D11", "A")}
            />
          )}

          {destCoords && (
            <Marker
              position={[destCoords.lat, destCoords.lng]}
              icon={makeDivIcon("#1E88E5", "B")}
            />
          )}
        </MapContainer>

        {selectedIncident && (
          <div className="incident-live-card">
            <div className="incident-live-header">
              <strong className="incident-live-title">
                <div className="live-dot" />
                LIVE | {selectedIncident.location}
              </strong>
              <button onClick={() => setSelectedIncident(null)} className="live-close-btn">
                x
              </button>
            </div>
            {selectedIncident.imageUrl && (
              <div className="live-image-wrap">
                <img
                  src={selectedIncident.imageUrl}
                  alt="Live Camera Feed"
                  className="live-image"
                />
                <div className="live-rec-badge">
                  {selectedIncident.camera} | REC
                </div>
              </div>
            )}
            <div className="incident-live-grid">
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
