// Migrate hotspots from JSON/NDJSON to the database table

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
  imageBase64: z.string().optional(),
});

const rankingPayloadSchema = z.array(rankingRowSchema);

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5440),
  database: process.env.DB_NAME ?? "plates",
  user: process.env.DB_USER ?? "admin",
  password: process.env.DB_PASS ?? "admin",
});

async function ensureHotspotTable() {
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
}

async function main() {
  const jsonPath = resolve(process.cwd(), "detection", "rankings.json");
  const raw = await readFile(jsonPath, "utf-8");
  const parsedJson = JSON.parse(raw);
  const parsed = rankingPayloadSchema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error("Invalid rankings.json payload", parsed.error.flatten());
    process.exit(1);
  }

  await ensureHotspotTable();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM hotspot_rankings");

    for (const row of parsed.data) {
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

    await client.query("COMMIT");
    console.log(`Imported ${parsed.data.length} hotspot ranking rows.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error("Failed to import rankings:", err);
  process.exit(1);
});
