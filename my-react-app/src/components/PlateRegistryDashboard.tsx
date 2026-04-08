import { useEffect, useMemo, useState } from "react";
import "./PlateRegistryDashboard.css";

type PlateSortKey = "lastSeen" | "riskScore" | "warnings" | "criticals";
type SortDirection = "asc" | "desc";
type PlateRiskLevel = "high" | "medium" | "low";

type PlateRecord = {
  id: number;
  plateNumber: string;
  firstSeen: string;
  lastSeen: string;
  warnings: number;
  criticals: number;
  riskScore: number;
};

type PlateEvent = {
  time: string;
  plateNumber: string;
  eventType: string | null;
  cameraId: string | null;
  riskScore: number;
};

type PlatesResponse = {
  plates: PlateRecord[];
};

type PlateEventsResponse = {
  plateNumber: string;
  events: PlateEvent[];
};

type PlateEventsState = {
  loading: boolean;
  error: string;
  events: PlateEvent[] | null;
};

const DETECTION_API_URL =
  import.meta.env.VITE_DETECTION_API_URL ?? "http://localhost:8005";

function getRiskLevel(score: number): PlateRiskLevel {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function normalizePlate(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function getSortValue(plate: PlateRecord, sortKey: PlateSortKey): number {
  switch (sortKey) {
    case "lastSeen":
      return new Date(plate.lastSeen).getTime();
    case "warnings":
      return plate.warnings;
    case "criticals":
      return plate.criticals;
    case "riskScore":
    default:
      return plate.riskScore;
  }
}

export default function PlateRegistryDashboard() {
  const [plates, setPlates] = useState<PlateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<PlateSortKey>("riskScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedPlateNumber, setSelectedPlateNumber] = useState<string | null>(
    null,
  );
  const [eventsByPlate, setEventsByPlate] = useState<
    Record<string, PlateEventsState>
  >({});

  useEffect(() => {
    let cancelled = false;

    const loadPlates = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${DETECTION_API_URL}/api/plates`);
        if (!response.ok) {
          throw new Error(`Failed to load plates (${response.status})`);
        }

        const payload = (await response.json()) as PlatesResponse;
        if (cancelled) return;
        setPlates(payload.plates);
      } catch (fetchError) {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load registration numbers",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPlates();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPlates = useMemo(() => {
    const normalizedSearch = normalizePlate(searchTerm.trim());
    const matchingPlates = normalizedSearch
      ? plates.filter((plate) =>
          normalizePlate(plate.plateNumber).includes(normalizedSearch),
        )
      : plates;
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...matchingPlates].sort((left, right) => {
      const primary =
        (getSortValue(left, sortKey) - getSortValue(right, sortKey)) * direction;
      if (primary !== 0) return primary;

      const riskFallback = right.riskScore - left.riskScore;
      if (riskFallback !== 0) return riskFallback;

      return (
        new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime()
      );
    });
  }, [plates, searchTerm, sortDirection, sortKey]);

  useEffect(() => {
    if (
      selectedPlateNumber &&
      !filteredPlates.some((plate) => plate.plateNumber === selectedPlateNumber)
    ) {
      setSelectedPlateNumber(null);
    }
  }, [filteredPlates, selectedPlateNumber]);

  const selectedPlate = selectedPlateNumber
    ? plates.find((plate) => plate.plateNumber === selectedPlateNumber) ?? null
    : null;
  const selectedPlateEvents = selectedPlateNumber
    ? eventsByPlate[selectedPlateNumber]
    : undefined;
  const highRiskCount = filteredPlates.filter(
    (plate) => getRiskLevel(plate.riskScore) === "high",
  ).length;

  const handleToggleEvents = async (plateNumber: string) => {
    if (selectedPlateNumber === plateNumber) {
      setSelectedPlateNumber(null);
      return;
    }

    setSelectedPlateNumber(plateNumber);

    const cachedState = eventsByPlate[plateNumber];
    if (cachedState?.loading || cachedState?.events) {
      return;
    }

    setEventsByPlate((current) => ({
      ...current,
      [plateNumber]: {
        loading: true,
        error: "",
        events: null,
      },
    }));

    try {
      const response = await fetch(
        `${DETECTION_API_URL}/api/plates/${encodeURIComponent(plateNumber)}/events?limit=12`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load events (${response.status})`);
      }

      const payload = (await response.json()) as PlateEventsResponse;
      setEventsByPlate((current) => ({
        ...current,
        [plateNumber]: {
          loading: false,
          error: "",
          events: payload.events,
        },
      }));
    } catch (fetchError) {
      setEventsByPlate((current) => ({
        ...current,
        [plateNumber]: {
          loading: false,
          error:
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load plate events",
          events: null,
        },
      }));
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="plate-dashboard__state">
          Loading registration numbers...
        </div>
      );
    }

    if (error) {
      return (
        <div className="plate-dashboard__state plate-dashboard__state--error">
          {error}
        </div>
      );
    }

    if (plates.length === 0) {
      return (
        <div className="plate-dashboard__state">
          No rows were found in the `plates` table yet.
        </div>
      );
    }

    if (filteredPlates.length === 0) {
      return (
        <div className="plate-dashboard__state">
          No registration numbers match the current filter.
        </div>
      );
    }

    return (
      <>
        <div className="plate-dashboard__table-wrap">
          <table className="plate-dashboard__table">
            <thead>
              <tr>
                <th>Plate Number</th>
                <th>First Seen</th>
                <th>Last Seen</th>
                <th>Warnings</th>
                <th>Criticals</th>
                <th>Risk Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlates.map((plate) => {
                const riskLevel = getRiskLevel(plate.riskScore);
                const isSelected = selectedPlateNumber === plate.plateNumber;

                return (
                  <tr
                    key={plate.id}
                    className={`plate-dashboard__row plate-dashboard__row--${riskLevel}${isSelected ? " plate-dashboard__row--selected" : ""}`}
                  >
                    <td>
                      <div className="plate-dashboard__plate-cell">
                        <span className="plate-dashboard__plate-number">
                          {plate.plateNumber}
                        </span>
                        <span
                          className={`plate-dashboard__risk-accent plate-dashboard__risk-accent--${riskLevel}`}
                        >
                          {riskLevel}
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(plate.firstSeen)}</td>
                    <td>{formatDateTime(plate.lastSeen)}</td>
                    <td>
                      <span
                        className={`plate-dashboard__metric${plate.warnings > 0 ? " plate-dashboard__metric--warn" : ""}`}
                      >
                        {plate.warnings}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`plate-dashboard__metric${plate.criticals > 0 ? " plate-dashboard__metric--critical" : ""}`}
                      >
                        {plate.criticals}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`plate-dashboard__score-badge plate-dashboard__score-badge--${riskLevel}`}
                      >
                        {plate.riskScore.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="plate-dashboard__events-button"
                        onClick={() => void handleToggleEvents(plate.plateNumber)}
                      >
                        {isSelected ? "Hide events" : "View events"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedPlate && (
          <section className="plate-dashboard__events-panel">
            <div className="plate-dashboard__events-header">
              <div>
                <div className="plate-dashboard__events-eyebrow">
                  Recent activity
                </div>
                <h4 className="plate-dashboard__events-title">
                  {selectedPlate.plateNumber}
                </h4>
              </div>
              <span
                className={`plate-dashboard__score-badge plate-dashboard__score-badge--${getRiskLevel(selectedPlate.riskScore)}`}
              >
                {selectedPlate.riskScore.toFixed(2)}
              </span>
            </div>

            {selectedPlateEvents?.loading ? (
              <div className="plate-dashboard__state plate-dashboard__state--compact">
                Loading recent events...
              </div>
            ) : selectedPlateEvents?.error ? (
              <div className="plate-dashboard__state plate-dashboard__state--error plate-dashboard__state--compact">
                {selectedPlateEvents.error}
              </div>
            ) : selectedPlateEvents?.events?.length ? (
              <div className="plate-dashboard__events-list">
                {selectedPlateEvents.events.map((event, index) => (
                  <article
                    key={`${event.plateNumber}-${event.time}-${index}`}
                    className="plate-dashboard__event-item"
                  >
                    <div className="plate-dashboard__event-topline">
                      <strong>{formatDateTime(event.time)}</strong>
                      <span
                        className={`plate-dashboard__score-badge plate-dashboard__score-badge--${getRiskLevel(event.riskScore)}`}
                      >
                        {event.riskScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="plate-dashboard__event-meta">
                      <span>{event.eventType ?? "Unknown event"}</span>
                      <span>{event.cameraId ?? "No camera id"}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="plate-dashboard__state plate-dashboard__state--compact">
                No recent events were found for this plate.
              </div>
            )}
          </section>
        )}
      </>
    );
  };

  return (
    <section className="plate-dashboard">
      <div className="plate-dashboard__header">
        <div>
          <div className="plate-dashboard__eyebrow">Registration Numbers</div>
          <h3 className="plate-dashboard__title">Plate Registry</h3>
        </div>
        <span className="plate-dashboard__summary-pill">
          {plates.length} total
        </span>
      </div>

      <div className="plate-dashboard__toolbar">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="plate-dashboard__search"
          placeholder="Search by plate number"
        />

        <div className="plate-dashboard__toolbar-row">
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as PlateSortKey)}
            className="plate-dashboard__select"
          >
            <option value="lastSeen">Sort: Last Seen</option>
            <option value="riskScore">Sort: Risk Score</option>
            <option value="warnings">Sort: Warnings</option>
            <option value="criticals">Sort: Criticals</option>
          </select>

          <button
            type="button"
            className="plate-dashboard__direction-button"
            onClick={() =>
              setSortDirection((current) =>
                current === "desc" ? "asc" : "desc",
              )
            }
          >
            {sortDirection === "desc" ? "Desc" : "Asc"}
          </button>
        </div>
      </div>

      <div className="plate-dashboard__stats">
        <div className="plate-dashboard__stat-card">
          <span>Visible</span>
          <strong>{filteredPlates.length}</strong>
        </div>
        <div className="plate-dashboard__stat-card">
          <span>High risk</span>
          <strong>{highRiskCount}</strong>
        </div>
        <div className="plate-dashboard__stat-card">
          <span>Selected</span>
          <strong>{selectedPlateNumber ?? "-"}</strong>
        </div>
      </div>

      {renderContent()}
    </section>
  );
}
