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

-- One row per ingested near-crash/real-crash event from detection service
CREATE TABLE IF NOT EXISTS near_crash_events (
    id           BIGSERIAL PRIMARY KEY,
    event_id     TEXT UNIQUE NOT NULL,
    camera_id    TEXT NOT NULL,
    event_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cord_x       DOUBLE PRECISION NOT NULL,
    cord_y       DOUBLE PRECISION NOT NULL,
    risk_weight  DOUBLE PRECISION NOT NULL,
    source_type  TEXT NOT NULL DEFAULT 'near',
    image_base64 TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('near_crash_events', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_near_crash_events_time ON near_crash_events (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_near_crash_events_camera ON near_crash_events (camera_id, event_time DESC);

-- Materialized hotspot ranking snapshot consumed by frontend and navigation services
CREATE TABLE IF NOT EXISTS hotspot_rankings (
    id           BIGSERIAL PRIMARY KEY,
    rank         INTEGER NOT NULL,
    cord_x       DOUBLE PRECISION NOT NULL,
    cord_y       DOUBLE PRECISION NOT NULL,
    score        DOUBLE PRECISION NOT NULL,
    source_type  TEXT NOT NULL DEFAULT 'near',
    image_base64 TEXT,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cord_x, cord_y, source_type)
);

CREATE INDEX IF NOT EXISTS idx_hotspot_rankings_rank ON hotspot_rankings (rank ASC);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved user locations for route shortcuts
CREATE TABLE IF NOT EXISTS "usersPoint" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    lan DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_point_user_id ON "usersPoint" ("userId", created_at DESC);
