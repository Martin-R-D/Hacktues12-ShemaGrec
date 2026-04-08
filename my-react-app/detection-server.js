"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
/*
Navigation endpoints
Requirements: PLEASE setup an .env file with following format:
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASS=""
*/
var express_1 = require("express");
var pg_1 = require("pg");
var z = require("zod");
var app = (0, express_1.default)();
var PORT = Number((_a = process.env.DETECTION_PORT) !== null && _a !== void 0 ? _a : 8005);
var CLIPS_DIR = (_b = process.env.CLIPS_DIR) !== null && _b !== void 0 ? _b : "./clips";
var pool = new pg_1.Pool({
    host: process.env.DB_HOST,
    port: Number((_c = process.env.DB_PORT) !== null && _c !== void 0 ? _c : 5440),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
});
function ensureSchema() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pool.query("\n    CREATE TABLE IF NOT EXISTS near_crash_events (\n      id                BIGSERIAL PRIMARY KEY,\n      event_id          TEXT UNIQUE NOT NULL,\n      camera_id         TEXT NOT NULL,\n      event_time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      cord_x            DOUBLE PRECISION NOT NULL,\n      cord_y            DOUBLE PRECISION NOT NULL,\n      risk_weight       DOUBLE PRECISION NOT NULL,\n      source_type       TEXT NOT NULL DEFAULT 'near',\n      image_base64      TEXT,\n      video_clip_path   TEXT,\n      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    )\n  ")];
                case 1:
                    _a.sent();
                    // Backfill schema changes for existing databases created before image support.
                    return [4 /*yield*/, pool.query("ALTER TABLE near_crash_events ADD COLUMN IF NOT EXISTS image_base64 TEXT")];
                case 2:
                    // Backfill schema changes for existing databases created before image support.
                    _a.sent();
                    return [4 /*yield*/, pool.query("\n    CREATE TABLE IF NOT EXISTS hotspot_rankings (\n      id                BIGSERIAL PRIMARY KEY,\n      rank              INTEGER NOT NULL,\n      cord_x            DOUBLE PRECISION NOT NULL,\n      cord_y            DOUBLE PRECISION NOT NULL,\n      score             DOUBLE PRECISION NOT NULL,\n      source_type       TEXT NOT NULL DEFAULT 'near',\n      image_base64      TEXT,\n      video_clip_path   TEXT,\n      computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      UNIQUE (cord_x, cord_y, source_type)\n    )\n  ")];
                case 3:
                    _a.sent();
                    // Backfill schema changes for existing databases created before image support.
                    return [4 /*yield*/, pool.query("ALTER TABLE hotspot_rankings ADD COLUMN IF NOT EXISTS image_base64 TEXT")];
                case 4:
                    // Backfill schema changes for existing databases created before image support.
                    _a.sent();
                    return [4 /*yield*/, pool.query("CREATE INDEX IF NOT EXISTS idx_hotspot_rankings_rank ON hotspot_rankings (rank ASC)")];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
var optionalImageSchema = z.preprocess(function (value) {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value !== "string")
        return value;
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());
var eventSchema = z
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
    .transform(function (data) {
    var _a;
    return (__assign(__assign({}, data), { imageBase64: (_a = data.imageBase64) !== null && _a !== void 0 ? _a : data.image_base64 }));
});
var hotspotQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
});
var eventsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(5000).optional(),
});
var plateEventsParamsSchema = z.object({
    plateNumber: z.string().trim().min(1).max(32),
});
var plateEventsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
});
var rankingSnapshotItemSchema = z.object({
    rank: z.number().int().positive(),
    cord_x: z.number(),
    cord_y: z.number(),
    score: z.number().nonnegative(),
    type: z.enum(["near", "actual"]).optional(),
    imageBase64: z.string().optional(),
});
var rankingSnapshotSchema = z.object({
    hotspots: z.array(rankingSnapshotItemSchema),
});
app.use(express_1.default.json({ limit: "1mb" }));
// Serve video clips as static files
app.use("/clips", express_1.default.static(CLIPS_DIR));
app.use(function (_, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    next();
});
app.get("/health", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, pool.query("SELECT 1")];
            case 1:
                _a.sent();
                res.json({ ok: true, service: "detection" });
                return [3 /*break*/, 3];
            case 2:
                err_1 = _a.sent();
                console.error("[detection] Healthcheck failed:", err_1);
                res.status(500).json({ ok: false, service: "detection" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.get("/api/hotspots", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, limit, rows, err_2;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                parsed = hotspotQuerySchema.safeParse(req.query);
                if (!parsed.success) {
                    res.status(400).json({ error: "Invalid query parameters" });
                    return [2 /*return*/];
                }
                limit = (_a = parsed.data.limit) !== null && _a !== void 0 ? _a : 100;
                _d.label = 1;
            case 1:
                _d.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pool.query("SELECT\n         rank,\n         cord_x,\n         cord_y,\n         score,\n         source_type AS type,\n         image_base64,\n         video_clip_path,\n         computed_at\n       FROM hotspot_rankings\n       ORDER BY rank ASC\n       LIMIT $1", [limit])];
            case 2:
                rows = (_d.sent()).rows;
                res.json({
                    computedAt: (_c = (_b = rows[0]) === null || _b === void 0 ? void 0 : _b.computed_at) !== null && _c !== void 0 ? _c : null,
                    hotspots: rows.map(function (row) { return (__assign(__assign({}, row), { video_url: row.video_clip_path ? "/clips/".concat(row.video_clip_path) : undefined })); }),
                });
                return [3 /*break*/, 4];
            case 3:
                err_2 = _d.sent();
                console.error("[detection] Failed to fetch hotspots:", err_2);
                res.status(500).json({ error: "Failed to fetch hotspots" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.get("/api/events", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, limit, rows, err_3;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                parsed = eventsQuerySchema.safeParse(req.query);
                if (!parsed.success) {
                    res.status(400).json({ error: "Invalid query parameters" });
                    return [2 /*return*/];
                }
                limit = (_a = parsed.data.limit) !== null && _a !== void 0 ? _a : 2000;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pool.query("WITH grouped AS (\n         SELECT\n           cord_x,\n           cord_y,\n           SUM(risk_weight) AS risk_weight,\n           COUNT(*)::int AS event_count\n         FROM near_crash_events\n         GROUP BY cord_x, cord_y\n       ),\n       latest_images AS (\n         SELECT DISTINCT ON (cord_x, cord_y)\n           cord_x, cord_y, image_base64\n         FROM near_crash_events\n         WHERE image_base64 IS NOT NULL\n         ORDER BY cord_x, cord_y, event_time DESC\n       )\n       SELECT\n         g.cord_x,\n         g.cord_y,\n         g.risk_weight,\n         g.event_count,\n         i.image_base64\n       FROM grouped g\n       LEFT JOIN latest_images i ON g.cord_x = i.cord_x AND g.cord_y = i.cord_y\n       ORDER BY g.risk_weight DESC\n       LIMIT $1", [limit])];
            case 2:
                rows = (_b.sent()).rows;
                res.json({
                    events: rows,
                });
                return [3 /*break*/, 4];
            case 3:
                err_3 = _b.sent();
                console.error("[detection] Failed to fetch events:", err_3);
                res.status(500).json({ error: "Failed to fetch events" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.get("/api/plates", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var rows, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, pool.query("SELECT\n         id,\n         plate_number,\n         first_seen,\n         last_seen,\n         warnings,\n         criticals,\n         risk_score\n       FROM plates\n       ORDER BY risk_score DESC NULLS LAST, last_seen DESC NULLS LAST")];
            case 1:
                rows = (_a.sent()).rows;
                res.json({
                    plates: rows.map(function (row) { return ({
                        id: row.id,
                        plateNumber: row.plate_number,
                        firstSeen: row.first_seen,
                        lastSeen: row.last_seen,
                        warnings: row.warnings,
                        criticals: row.criticals,
                        riskScore: row.risk_score,
                    }); }),
                });
                return [3 /*break*/, 3];
            case 2:
                err_4 = _a.sent();
                console.error("[detection] Failed to fetch plates:", err_4);
                res.status(500).json({ error: "Failed to fetch plates" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.get("/api/plates/:plateNumber/events", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var paramsParsed, queryParsed, plateNumber, limit, rows, err_5;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                paramsParsed = plateEventsParamsSchema.safeParse(req.params);
                queryParsed = plateEventsQuerySchema.safeParse(req.query);
                if (!paramsParsed.success || !queryParsed.success) {
                    res.status(400).json({ error: "Invalid query parameters" });
                    return [2 /*return*/];
                }
                plateNumber = paramsParsed.data.plateNumber;
                limit = (_a = queryParsed.data.limit) !== null && _a !== void 0 ? _a : 10;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pool.query("SELECT\n         time,\n         plate_number,\n         event_type,\n         camera_id,\n         risk_score\n       FROM plate_events\n       WHERE plate_number = $1\n       ORDER BY time DESC\n       LIMIT $2", [plateNumber, limit])];
            case 2:
                rows = (_b.sent()).rows;
                res.json({
                    plateNumber: plateNumber,
                    events: rows.map(function (row) { return ({
                        time: row.time,
                        plateNumber: row.plate_number,
                        eventType: row.event_type,
                        cameraId: row.camera_id,
                        riskScore: row.risk_score,
                    }); }),
                });
                return [3 /*break*/, 4];
            case 3:
                err_5 = _b.sent();
                console.error("[detection] Failed to fetch events for plate ".concat(plateNumber, ":"), err_5);
                res.status(500).json({ error: "Failed to fetch plate events" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// try to replace old snapshot with new snapshot, where
// snapshot - collection of hotspot rankings worth displaying on the frontend
app.post("/api/hotspots/snapshot", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, client, _i, _a, h, err_6;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                parsed = rankingSnapshotSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({ error: "Invalid snapshot payload" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, pool.connect()];
            case 1:
                client = _e.sent();
                _e.label = 2;
            case 2:
                _e.trys.push([2, 10, 12, 13]);
                return [4 /*yield*/, client.query("BEGIN")];
            case 3:
                _e.sent();
                return [4 /*yield*/, client.query("DELETE FROM hotspot_rankings")];
            case 4:
                _e.sent();
                _i = 0, _a = parsed.data.hotspots;
                _e.label = 5;
            case 5:
                if (!(_i < _a.length)) return [3 /*break*/, 8];
                h = _a[_i];
                return [4 /*yield*/, client.query("INSERT INTO hotspot_rankings (\n          rank,\n          cord_x,\n          cord_y,\n          score,\n          source_type,\n          image_base64,\n          video_clip_path,\n          computed_at\n        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())", [h.rank, h.cord_x, h.cord_y, h.score, (_b = h.type) !== null && _b !== void 0 ? _b : "near", (_c = h.imageBase64) !== null && _c !== void 0 ? _c : null, (_d = h.videoClipPath) !== null && _d !== void 0 ? _d : null])];
            case 6:
                _e.sent();
                _e.label = 7;
            case 7:
                _i++;
                return [3 /*break*/, 5];
            case 8: return [4 /*yield*/, client.query("COMMIT")];
            case 9:
                _e.sent();
                res.status(202).json({ accepted: true, count: parsed.data.hotspots.length });
                return [3 /*break*/, 13];
            case 10:
                err_6 = _e.sent();
                return [4 /*yield*/, client.query("ROLLBACK")];
            case 11:
                _e.sent();
                console.error("[detection] Failed to replace ranking snapshot:", err_6);
                res.status(500).json({ error: "Failed to replace ranking snapshot" });
                return [3 /*break*/, 13];
            case 12:
                client.release();
                return [7 /*endfinally*/];
            case 13: return [2 /*return*/];
        }
    });
}); });
app.post("/api/events", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, event, eventTime, insertResult, inserted, err_7;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                parsed = eventSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        error: "Invalid event payload",
                        details: parsed.error.flatten(),
                    });
                    return [2 /*return*/];
                }
                event = parsed.data;
                eventTime = event.eventTime ? new Date(event.eventTime) : new Date();
                _d.label = 1;
            case 1:
                _d.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pool.query("INSERT INTO near_crash_events (\n        event_id,\n        camera_id,\n        event_time,\n        cord_x,\n        cord_y,\n        risk_weight,\n        source_type,\n        image_base64,\n        video_clip_path\n      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)\n      ON CONFLICT (event_id) DO NOTHING\n      RETURNING id", [
                        event.eventId,
                        event.cameraId,
                        eventTime.toISOString(),
                        event.lng,
                        event.lat,
                        event.riskWeight,
                        event.sourceType,
                        (_a = event.imageBase64) !== null && _a !== void 0 ? _a : null,
                        (_b = event.clipPath) !== null && _b !== void 0 ? _b : null,
                    ])];
            case 2:
                insertResult = _d.sent();
                inserted = ((_c = insertResult.rowCount) !== null && _c !== void 0 ? _c : 0) > 0;
                // Ranking tables are intentionally not updated during ingestion.
                // Frontend-visible hotspots are updated only via /api/hotspots/snapshot
                // after get_rankings.py finishes statistical processing.
                res.status(202).json({ accepted: true, deduplicated: !inserted });
                return [3 /*break*/, 4];
            case 3:
                err_7 = _d.sent();
                console.error("[detection] Failed to ingest event:", err_7);
                res.status(500).json({ error: "Failed to ingest event" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var err_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, ensureSchema()];
                case 1:
                    _a.sent();
                    app.listen(PORT, function () {
                        console.log("[detection] Service running on port ".concat(PORT));
                    });
                    return [3 /*break*/, 3];
                case 2:
                    err_8 = _a.sent();
                    console.error("[detection] Failed to initialize schema:", err_8);
                    process.exit(1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
void start();
