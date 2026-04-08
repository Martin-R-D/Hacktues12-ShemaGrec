"""
db.py — PostgreSQL/TimescaleDB helper for plate detection.

Usage in detectcarplates.py:
    from db import PlateDB
    db = PlateDB()
    db.record("CA1234BG", event_type="SEEN", camera_id="CAM_01")
    db.close()
"""

from __future__ import annotations
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

try:
    import psycopg2
    from psycopg2.extras import execute_values
    _PG_OK = True
except ImportError:
    _PG_OK = False

# ── Connection settings (override with env vars) ──────────────────────────

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")

if not DB_HOST:
    print(f"[WARN] DB env vars not loaded. Looked for .env at {Path(__file__).parent / '.env'}")


class PlateDB:
    def __init__(self):
        if not _PG_OK:
            raise ImportError("psycopg2 not installed. Run: pip install psycopg2-binary")

        self.conn = psycopg2.connect(
            host     = DB_HOST,
            port     = DB_PORT,
            dbname   = DB_NAME,
            user     = DB_USER,
            password = DB_PASS,
        )
        self.conn.autocommit = True
        print(f"[DB] Connected to {DB_NAME}@{DB_HOST}:{DB_PORT}")

    # ── Public API ────────────────────────────────────────────────────────

    def record(
        self,
        plate_number : str,
        event_type   : str  = "SEEN",   # "SEEN" | "WARNING" | "CRITICAL"
        camera_id    : str  = "CAM_00",
        risk_score   : float = 0.0,
    ) -> None:
        """Insert an event and upsert the plate summary row."""
        plate_number = plate_number.strip().upper()
        if not plate_number:
            return

        now = datetime.now(timezone.utc)

        with self.conn.cursor() as cur:
            # Insert time-series event
            cur.execute(
                """
                INSERT INTO plate_events (time, plate_number, event_type, camera_id, risk_score)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (now, plate_number, event_type, camera_id, risk_score),
            )

            # Upsert summary row
            cur.execute(
                """
                INSERT INTO plates (plate_number, first_seen, last_seen, warnings, criticals, risk_score)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (plate_number) DO UPDATE SET
                    last_seen  = EXCLUDED.last_seen,
                    warnings   = plates.warnings  + EXCLUDED.warnings,
                    criticals  = plates.criticals + EXCLUDED.criticals,
                    risk_score = plates.risk_score + EXCLUDED.risk_score
                """,
                (
                    plate_number,
                    now, now,
                    1 if event_type == "WARNING"  else 0,
                    1 if event_type == "CRITICAL" else 0,
                    risk_score,
                ),
            )
        print(f"[DB] Recorded plate: {plate_number} | Event: {event_type} | Camera: {camera_id} | Risk: {risk_score}")

    def get_plate(self, plate_number: str) -> dict | None:
        """Return the summary row for a plate, or None if not found."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT plate_number, first_seen, last_seen, warnings, criticals, risk_score "
                "FROM plates WHERE plate_number = %s",
                (plate_number.strip().upper(),),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "plate_number": row[0],
            "first_seen":   row[1],
            "last_seen":    row[2],
            "warnings":     row[3],
            "criticals":    row[4],
            "risk_score":   row[5],
        }

    def top_risk(self, limit: int = 10) -> list[dict]:
        """Return the highest risk-score plates."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT plate_number, warnings, criticals, risk_score "
                "FROM plates ORDER BY risk_score DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
        return [
            {"plate_number": r[0], "warnings": r[1], "criticals": r[2], "risk_score": r[3]}
            for r in rows
        ]

    def close(self) -> None:
        self.conn.close()
        print("[DB] Connection closed.")
