import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import * as z from "zod";

const rankingRowSchema = z.object({
  rank: z.number().int().positive(),
  cord_x: z.number(),
  cord_y: z.number(),
  score: z.number(),
  type: z.enum(["near", "actual"]).optional(),
  imageBase64: z.string().nullable().optional(),
});

const rankingPayloadSchema = z.array(rankingRowSchema);

const plateSchema = z.object({
  plate_number: z.string().trim().min(1),
  first_seen: z.string().datetime({ offset: true, local: true }),
  last_seen: z.string().datetime({ offset: true, local: true }),
  warnings: z.number().int().nonnegative(),
  criticals: z.number().int().nonnegative(),
  risk_score: z.number().nonnegative(),
});

const platePayloadSchema = z.array(plateSchema);

const plateEventSchema = z.object({
  time: z.string().datetime({ offset: true, local: true }),
  plate_number: z.string().trim().min(1),
  event_type: z.enum(["SEEN", "WARNING", "CRITICAL"]).nullable().optional(),
  camera_id: z.string().trim().min(1).nullable().optional(),
  risk_score: z.number().nonnegative(),
});

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5440),
  database: process.env.DB_NAME ?? "plates",
  user: process.env.DB_USER ?? "admin",
  password: process.env.DB_PASS ?? "admin",
});

async function ensureTables() {
  await pool.query(`
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
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_hotspot_rankings_rank ON hotspot_rankings (rank ASC)",
  );

  await pool.query(
    "ALTER TABLE hotspot_rankings ADD COLUMN IF NOT EXISTS image_base64 TEXT",
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plates (
      id           SERIAL PRIMARY KEY,
      plate_number TEXT UNIQUE NOT NULL,
      first_seen   TIMESTAMPTZ DEFAULT NOW(),
      last_seen    TIMESTAMPTZ DEFAULT NOW(),
      warnings     INTEGER     DEFAULT 0,
      criticals    INTEGER     DEFAULT 0,
      risk_score   REAL        DEFAULT 0.0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plate_events (
      time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      plate_number TEXT        NOT NULL,
      event_type   TEXT,
      camera_id    TEXT,
      risk_score   REAL        DEFAULT 0.0
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_plate_events_plate ON plate_events (plate_number, time DESC)",
  );
}

async function readRankings() {
  const jsonPath = resolve(process.cwd(), "detection", "rankings.json");
  const raw = await readFile(jsonPath, "utf-8");
  const parsed = rankingPayloadSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    console.error("Invalid rankings.json payload", parsed.error.flatten());
    process.exit(1);
  }

  return parsed.data;
}

async function readDemoPlates() {
  const jsonPath = resolve(process.cwd(), "detection", "demo-plates.json");
  const raw = await readFile(jsonPath, "utf-8");
  const parsed = platePayloadSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    console.error("Invalid demo-plates.json payload", parsed.error.flatten());
    process.exit(1);
  }

  return parsed.data;
}

async function readDemoPlateEvents() {
  const ndjsonPath = resolve(process.cwd(), "detection", "demo-plate-events.ndjson");
  const raw = await readFile(ndjsonPath, "utf-8");

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsedRows = lines.map((line) => {
    const payload = plateEventSchema.safeParse(JSON.parse(line));
    if (!payload.success) {
      console.error("Invalid demo-plate-events.ndjson row", payload.error.flatten());
      process.exit(1);
    }
    return payload.data;
  });

  return parsedRows;
}

async function main() {
  await ensureTables();

  const rankings = await readRankings();
  const demoPlates = await readDemoPlates();
  const demoPlateEvents = await readDemoPlateEvents();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM hotspot_rankings");
    await client.query("DELETE FROM plate_events");
    await client.query("DELETE FROM plates");

    for (const row of rankings) {
      await client.query(
        `INSERT INTO hotspot_rankings (rank, cord_x, cord_y, score, source_type, image_base64, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (cord_x, cord_y, source_type)
         DO UPDATE SET
           rank = EXCLUDED.rank,
           score = EXCLUDED.score,
           image_base64 = EXCLUDED.image_base64,
           computed_at = NOW()`,
        [
          row.rank,
          row.cord_x,
          row.cord_y,
          row.score,
          row.type ?? "near",
          row.imageBase64 ?? null,
        ],
      );
    }

    for (const plate of demoPlates) {
      await client.query(
        `INSERT INTO plates (plate_number, first_seen, last_seen, warnings, criticals, risk_score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          plate.plate_number,
          plate.first_seen,
          plate.last_seen,
          plate.warnings,
          plate.criticals,
          plate.risk_score,
        ],
      );
    }

    for (const event of demoPlateEvents) {
      await client.query(
        `INSERT INTO plate_events (time, plate_number, event_type, camera_id, risk_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          event.time,
          event.plate_number,
          event.event_type ?? null,
          event.camera_id ?? null,
          event.risk_score,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(`Imported demo data:`);
    console.log(`- hotspots (rankings.json): ${rankings.length}`);
    console.log(`- plates (demo-plates.json): ${demoPlates.length}`);
    console.log(`- plate_events (demo-plate-events.ndjson): ${demoPlateEvents.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error("Failed to import demo data:", err);
  process.exit(1);
});
