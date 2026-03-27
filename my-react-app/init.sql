CREATE EXTENSION IF NOT EXISTS timescaledb;

-- One row per unique plate — aggregated stats
CREATE TABLE IF NOT EXISTS plates (
    id           SERIAL PRIMARY KEY,
    plate_number TEXT UNIQUE NOT NULL,
    first_seen   TIMESTAMPTZ DEFAULT NOW(),
    last_seen    TIMESTAMPTZ DEFAULT NOW(),
    warnings     INTEGER     DEFAULT 0,
    criticals    INTEGER     DEFAULT 0,
    risk_score   REAL        DEFAULT 0.0
);

-- One row per detection event — time-series
CREATE TABLE IF NOT EXISTS plate_events (
    time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plate_number TEXT        NOT NULL,
    event_type   TEXT,           -- 'SEEN' | 'WARNING' | 'CRITICAL'
    camera_id    TEXT,
    risk_score   REAL        DEFAULT 0.0
);

-- Turn plate_events into a TimescaleDB hypertable
SELECT create_hypertable('plate_events', 'time', if_not_exists => TRUE);

-- Index for fast per-plate lookups
CREATE INDEX IF NOT EXISTS idx_plate_events_plate ON plate_events (plate_number, time DESC);
