import { INPUT_STYLE, ROUTE_CONFIGS, SEVERITY_META } from "./constants";
import type {
  Incident,
  MapPickMode,
  RouteInfo,
  TravelMode,
  UserPlace,
} from "./types";

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

export function HeatmapPanel({
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
      <div className="panel-card panel-card-row">
        <span className="panel-muted">Markers</span>
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
            className="incident-btn"
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
            <div className="incident-row-head">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: SEVERITY_META[incident.severity].color,
                  display: "inline-block",
                }}
              />
              <span className="incident-name">{incident.location}</span>
              <span
                style={{
                  fontSize: 10,
                  color: SEVERITY_META[incident.severity].color,
                }}
              >
                {SEVERITY_META[incident.severity].label}
              </span>
            </div>
            <div className="incident-row-meta">
              <span>{incident.count} incidents</span>
              <span>{incident.camera}</span>
            </div>
          </button>
        );
      })}
    </>
  );
}

export function RoutePanel({
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
      <label htmlFor="origin-place" className="form-label">
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

      <label htmlFor="origin" className="form-label form-label-gap">
        FROM
      </label>
      <input
        id="origin"
        value={origin}
        onChange={(e) => onOriginChange(e.target.value)}
        placeholder="e.g. Studentski grad, Sofia"
        style={INPUT_STYLE}
      />

      <label htmlFor="destination-place" className="form-label form-label-gap">
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
          <option
            key={`destination-${place.id}`}
            value={place.id}
            style={{ color: "#111" }}
          >
            {place.name}
          </option>
        ))}
      </select>

      <label htmlFor="destination" className="form-label form-label-gap">
        TO
      </label>
      <input
        id="destination"
        value={destination}
        onChange={(e) => onDestinationChange(e.target.value)}
        placeholder="e.g. NDK, Sofia"
        style={INPUT_STYLE}
      />

      <div className="pick-grid">
        <button
          onClick={() => onPickMode(mapPickMode === "origin" ? null : "origin")}
          className={`btn-ghost ${mapPickMode === "origin" ? "pick-origin-active" : ""}`}
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
          className={`btn-ghost ${mapPickMode === "destination" ? "pick-dest-active" : ""}`}
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
        <div className="map-pick-hint">
          Click the map to set {mapPickMode === "origin" ? "FROM" : "TO"}.
        </div>
      )}

      <label htmlFor="travel-mode" className="form-label form-label-gap">
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
          <div className="panel-muted-small">
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
        <div className="panel-card">
          <div className="avoid-note">
            Hotspots are treated as a 50m no-go zone when Safe Route is on.
          </div>
        </div>
      )}

      <button
        onClick={onCalcRoute}
        disabled={!canCalc}
        className="btn-primary"
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

      {routeInfos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            ROUTES FOUND
          </div>
          {routeInfos.map((info) => {
            const cfg = ROUTE_CONFIGS[info.rank];
            const isSelected = info.rank === selectedRouteRank;
            return (
              <div
                key={info.rank}
                onClick={() => onSelectRoute(info.rank)}
                className="route-card"
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
                <div className="route-card-header">
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
                <div className="route-card-stats">
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

      {routeError && <div className="route-error-box route-error">{routeError}</div>}

      {(routeInfos.length > 0 || routeError) && (
        <button
          onClick={onClearRoute}
          className="btn-ghost"
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

export function MyPlacesPanel({
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
  const canSave =
    placeNameInput.trim().length > 0 && placePick !== null && !savingPlace;

  return (
    <>
      <button
        onClick={onStartPick}
        className="btn-ghost"
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 8,
          border: `1px solid ${mapPickMode === "myPlace" ? "rgba(142,198,255,0.7)" : "rgba(255,255,255,0.1)"}`,
          background:
            mapPickMode === "myPlace"
              ? "rgba(142,198,255,0.16)"
              : "rgba(255,255,255,0.04)",
          color: "#e8e4dc",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {mapPickMode === "myPlace"
          ? "Click map to choose place"
          : "Pick place on map"}
      </button>

      {placePick && (
        <div className="place-picked-text">
          {`Selected point: ${placePick.lat.toFixed(6)}, ${placePick.lng.toFixed(6)}`}
        </div>
      )}

      <label htmlFor="place-name" className="form-label form-label-gap">
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
        className="btn-primary"
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

      {error && <div className="route-error-box">{error}</div>}

      <div className="saved-places-title">SAVED PLACES</div>

      {loading ? (
        <div className="loading-text">Loading places...</div>
      ) : places.length === 0 ? (
        <div className="empty-text">No saved places yet.</div>
      ) : (
        places.map((place) => (
          <div key={place.id} className="place-card">
            <div className="place-card-name">{place.name}</div>
            <div className="place-card-coords">
              {`${place.lan.toFixed(6)}, ${place.lon.toFixed(6)}`}
            </div>
          </div>
        ))
      )}
    </>
  );
}
