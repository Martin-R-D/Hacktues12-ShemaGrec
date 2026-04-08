import dotenv from "dotenv";
dotenv.config();

/*
Navigation endpoints
Requirements: PLEASE setup an .env file with following format:
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASS=""
*/

import express from "express";
import { Pool } from "pg";
import * as z from "zod";
import path from "path";

const app = express();
const PORT = Number(process.env.DETECTION_PORT ?? 8005);
const CLIPS_DIR = process.env.CLIPS_DIR ?? "./clips";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5440),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS near_crash_events (
      id                BIGSERIAL PRIMARY KEY,
      event_id          TEXT UNIQUE NOT NULL,
      camera_id         TEXT NOT NULL,
      event_time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cord_x            DOUBLE PRECISION NOT NULL,
      cord_y            DOUBLE PRECISION NOT NULL,
      risk_weight       DOUBLE PRECISION NOT NULL,
      source_type       TEXT NOT NULL DEFAULT 'near',
      image_base64      TEXT,
      video_clip_path   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Backfill schema changes for existing databases created before image support.
  await pool.query(
    "ALTER TABLE near_crash_events ADD COLUMN IF NOT EXISTS image_base64 TEXT",
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotspot_rankings (
      id                BIGSERIAL PRIMARY KEY,
      rank              INTEGER NOT NULL,
      cord_x            DOUBLE PRECISION NOT NULL,
      cord_y            DOUBLE PRECISION NOT NULL,
      score             DOUBLE PRECISION NOT NULL,
      source_type       TEXT NOT NULL DEFAULT 'near',
      image_base64      TEXT,
      video_clip_path   TEXT,
      computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cord_x, cord_y, source_type)
    )
  `);

  // Backfill schema changes for existing databases created before image support.
  await pool.query(
    "ALTER TABLE hotspot_rankings ADD COLUMN IF NOT EXISTS image_base64 TEXT",
  );

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_hotspot_rankings_rank ON hotspot_rankings (rank ASC)",
  );
}

const optionalImageSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const eventSchema = z
  .object({
    eventId: z.string().min(1),
    cameraId: z.string().min(1),
    eventTime: z.string().datetime({ offset: true, local: true }).optional(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    riskWeight: z.coerce.number().positive(),
    sourceType: z.enum(["near", "actual"]).default("near"),
    imageBase64: optionalImageSchema.optional(),
    image_base64: optionalImageSchema.optional(),
  })
  .transform((data) => ({
    ...data,
    imageBase64: data.imageBase64 ?? data.image_base64,
  }));

const hotspotQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(5000).optional(),
});

const plateEventsParamsSchema = z.object({
  plateNumber: z.string().trim().min(1).max(32),
});

const plateEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const rankingSnapshotItemSchema = z.object({
  rank: z.number().int().positive(),
  cord_x: z.number(),
  cord_y: z.number(),
  score: z.number().nonnegative(),
  type: z.enum(["near", "actual"]).optional(),
  imageBase64: z.string().optional(),
});

const rankingSnapshotSchema = z.object({
  hotspots: z.array(rankingSnapshotItemSchema),
});

app.use(express.json({ limit: "1mb" }));

// Serve video clips as static files
app.use("/clips", express.static(CLIPS_DIR));

app.use((_, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "detection" });
  } catch (err) {
    console.error("[detection] Healthcheck failed:", err);
    res.status(500).json({ ok: false, service: "detection" });
  }
});

app.get("/api/hotspots", async (req, res) => {
  const parsed = hotspotQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const limit = parsed.data.limit ?? 100;
  try {
    const { rows } = await pool.query<{
      rank: number;
      cord_x: number;
      cord_y: number;
      score: number;
      type: "near" | "actual";
      image_base64: string | null;
      video_clip_path: string | null;
      computed_at: string;
    }>(
      `SELECT
         rank,
         cord_x,
         cord_y,
         score,
         source_type AS type,
         image_base64,
         video_clip_path,
         computed_at
       FROM hotspot_rankings
       ORDER BY rank ASC
       LIMIT $1`,
      [limit],
    );

    res.json({
      computedAt: rows[0]?.computed_at ?? null,
      hotspots: rows.map((row) => ({
        ...row,
        video_url: row.video_clip_path ? `/clips/${row.video_clip_path}` : undefined,
      })),
    });
  } catch (err) {
    console.error("[detection] Failed to fetch hotspots:", err);
    res.status(500).json({ error: "Failed to fetch hotspots" });
  }
});

app.get("/api/events", async (req, res) => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const limit = parsed.data.limit ?? 2000;
  try {
    const { rows } = await pool.query<{
      cord_x: number;
      cord_y: number;
      risk_weight: number;
      event_count: number;
      image_base64: string | null;
    }>(
      `WITH grouped AS (
         SELECT
           cord_x,
           cord_y,
           SUM(risk_weight) AS risk_weight,
           COUNT(*)::int AS event_count
         FROM near_crash_events
         GROUP BY cord_x, cord_y
       ),
       latest_images AS (
         SELECT DISTINCT ON (cord_x, cord_y)
           cord_x, cord_y, image_base64
         FROM near_crash_events
         WHERE image_base64 IS NOT NULL
         ORDER BY cord_x, cord_y, event_time DESC
       )
       SELECT
         g.cord_x,
         g.cord_y,
         g.risk_weight,
         g.event_count,
         i.image_base64
       FROM grouped g
       LEFT JOIN latest_images i ON g.cord_x = i.cord_x AND g.cord_y = i.cord_y
       ORDER BY g.risk_weight DESC
       LIMIT $1`,
      [limit],
    );

    res.json({
      events: rows,
    });
  } catch (err) {
    console.error("[detection] Failed to fetch events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.get("/api/plates", async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      id: number;
      plate_number: string;
      first_seen: string;
      last_seen: string;
      warnings: number;
      criticals: number;
      risk_score: number;
    }>(
      `SELECT
         id,
         plate_number,
         first_seen,
         last_seen,
         warnings,
         criticals,
         risk_score
       FROM plates
       ORDER BY risk_score DESC NULLS LAST, last_seen DESC NULLS LAST`,
    );

    res.json({
      plates: rows.map((row) => ({
        id: row.id,
        plateNumber: row.plate_number,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        warnings: row.warnings,
        criticals: row.criticals,
        riskScore: row.risk_score,
      })),
    });
  } catch (err) {
    console.error("[detection] Failed to fetch plates:", err);
    res.status(500).json({ error: "Failed to fetch plates" });
  }
});

app.get("/api/plates/:plateNumber/events", async (req, res) => {
  const paramsParsed = plateEventsParamsSchema.safeParse(req.params);
  const queryParsed = plateEventsQuerySchema.safeParse(req.query);

  if (!paramsParsed.success || !queryParsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { plateNumber } = paramsParsed.data;
  const limit = queryParsed.data.limit ?? 10;

  try {
    const { rows } = await pool.query<{
      time: string;
      plate_number: string;
      event_type: string | null;
      camera_id: string | null;
      risk_score: number;
    }>(
      `SELECT
         time,
         plate_number,
         event_type,
         camera_id,
         risk_score
       FROM plate_events
       WHERE plate_number = $1
       ORDER BY time DESC
       LIMIT $2`,
      [plateNumber, limit],
    );

    res.json({
      plateNumber,
      events: rows.map((row) => ({
        time: row.time,
        plateNumber: row.plate_number,
        eventType: row.event_type,
        cameraId: row.camera_id,
        riskScore: row.risk_score,
      })),
    });
  } catch (err) {
    console.error(`[detection] Failed to fetch events for plate ${plateNumber}:`, err);
    res.status(500).json({ error: "Failed to fetch plate events" });
  }
});

// try to replace old snapshot with new snapshot, where
// snapshot - collection of hotspot rankings worth displaying on the frontend
app.post("/api/hotspots/snapshot", async (req, res) => {
  const parsed = rankingSnapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid snapshot payload" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM hotspot_rankings");

    for (const h of parsed.data.hotspots) {
      await client.query(
        `INSERT INTO hotspot_rankings (
          rank,
          cord_x,
          cord_y,
          score,
          source_type,
          image_base64,
          video_clip_path,
          computed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [h.rank, h.cord_x, h.cord_y, h.score, h.type ?? "near", h.imageBase64 ?? null, h.videoClipPath ?? null],
      );
    }

    await client.query("COMMIT");
    res.status(202).json({ accepted: true, count: parsed.data.hotspots.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[detection] Failed to replace ranking snapshot:", err);
    res.status(500).json({ error: "Failed to replace ranking snapshot" });
  } finally {
    client.release();
  }
});

app.post("/api/events", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid event payload",
      details: parsed.error.flatten(),
    });
    return;
  }

  const event = parsed.data;
  const eventTime = event.eventTime ? new Date(event.eventTime) : new Date();

  try {
    const insertResult = await pool.query<{ id: number }>(
      `INSERT INTO near_crash_events (
        event_id,
        camera_id,
        event_time,
        cord_x,
        cord_y,
        risk_weight,
        source_type,
        image_base64,
        video_clip_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id`,
      [
        event.eventId,
        event.cameraId,
        eventTime.toISOString(),
        event.lng,
        event.lat,
        event.riskWeight,
        event.sourceType,
        event.imageBase64 ?? null,
        event.clipPath ?? null,
      ],
    );

    const inserted = (insertResult.rowCount ?? 0) > 0;

    // Ranking tables are intentionally not updated during ingestion.
    // Frontend-visible hotspots are updated only via /api/hotspots/snapshot
    // after get_rankings.py finishes statistical processing.
    res.status(202).json({ accepted: true, deduplicated: !inserted });
  } catch (err) {
    console.error("[detection] Failed to ingest event:", err);
    res.status(500).json({ error: "Failed to ingest event" });
  }
});

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`[detection] Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[detection] Failed to initialize schema:", err);
    process.exit(1);
  }
}

void start();
