import express from "express";
import { Pool } from "pg";
import * as z from "zod";

const app = express();
const PORT = Number(process.env.DETECTION_PORT ?? 8005);

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5440),
  database: process.env.DB_NAME ?? "plates",
  user: process.env.DB_USER ?? "admin",
  password: process.env.DB_PASS ?? "admin",
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS near_crash_events (
      id           BIGSERIAL PRIMARY KEY,
      event_id     TEXT UNIQUE NOT NULL,
      camera_id    TEXT NOT NULL,
      event_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cord_x       DOUBLE PRECISION NOT NULL,
      cord_y       DOUBLE PRECISION NOT NULL,
      risk_weight  DOUBLE PRECISION NOT NULL,
      source_type  TEXT NOT NULL DEFAULT 'near',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotspot_rankings (
      id           BIGSERIAL PRIMARY KEY,
      rank         INTEGER NOT NULL,
      cord_x       DOUBLE PRECISION NOT NULL,
      cord_y       DOUBLE PRECISION NOT NULL,
      score        DOUBLE PRECISION NOT NULL,
      source_type  TEXT NOT NULL DEFAULT 'near',
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cord_x, cord_y, source_type)
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_hotspot_rankings_rank ON hotspot_rankings (rank ASC)",
  );
}

const eventSchema = z.object({
  eventId: z.string().min(1),
  cameraId: z.string().min(1),
  eventTime: z.string().datetime().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  riskWeight: z.number().positive(),
  sourceType: z.enum(["near", "actual"]).default("near"),
});

const hotspotQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

app.use(express.json({ limit: "1mb" }));

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
      computed_at: string;
    }>(
      `SELECT
         rank,
         cord_x,
         cord_y,
         score,
         source_type AS type,
         computed_at
       FROM hotspot_rankings
       ORDER BY rank ASC
       LIMIT $1`,
      [limit],
    );

    res.json({
      computedAt: rows[0]?.computed_at ?? null,
      hotspots: rows,
    });
  } catch (err) {
    console.error("[detection] Failed to fetch hotspots:", err);
    res.status(500).json({ error: "Failed to fetch hotspots" });
  }
});

app.post("/api/events", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event payload" });
    return;
  }

  const event = parsed.data;
  const eventTime = event.eventTime ? new Date(event.eventTime) : new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO near_crash_events (
        event_id,
        camera_id,
        event_time,
        cord_x,
        cord_y,
        risk_weight,
        source_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      ],
    );

    const inserted = (insertResult.rowCount ?? 0) > 0;

    if (inserted) {
      await client.query(
        `INSERT INTO hotspot_rankings (
          rank,
          cord_x,
          cord_y,
          score,
          source_type,
          computed_at
        ) VALUES (
          0,
          $1,
          $2,
          $3,
          $4,
          NOW()
        )
        ON CONFLICT (cord_x, cord_y, source_type)
        DO UPDATE SET
          score = hotspot_rankings.score + EXCLUDED.score,
          computed_at = NOW()`,
        [event.lng, event.lat, event.riskWeight, event.sourceType],
      );

      await client.query(
        `WITH ranked AS (
           SELECT
             id,
             ROW_NUMBER() OVER (ORDER BY score DESC) AS new_rank
           FROM hotspot_rankings
         )
         UPDATE hotspot_rankings h
         SET rank = r.new_rank
         FROM ranked r
         WHERE h.id = r.id`,
      );
    }

    await client.query("COMMIT");
    res.status(202).json({ accepted: true, deduplicated: !inserted });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[detection] Failed to ingest event:", err);
    res.status(500).json({ error: "Failed to ingest event" });
  } finally {
    client.release();
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
