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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
var react_1 = require("react");
var valhallaToDirections_1 = require("./services/valhallaToDirections");
var react_leaflet_1 = require("react-leaflet");
var leaflet_1 = require("leaflet");
require("leaflet/dist/leaflet.css");
require("./App.css");
var PlateRegistryDashboard_1 = require("./components/PlateRegistryDashboard");
var SignInPage_1 = require("./SignInPage");
var SignUpPage_1 = require("./SignUpPage");
/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
var BULGARIA_CENTER = [42.7339, 25.4858]; // Center of Bulgaria
var DETECTION_API_URL = (_a = import.meta.env.VITE_DETECTION_API_URL) !== null && _a !== void 0 ? _a : "http://localhost:8005";
var AUTH_API_URL = (_b = import.meta.env.VITE_AUTH_API_URL) !== null && _b !== void 0 ? _b : "http://localhost:8004";
var AUTH_TOKEN_KEY = "saferoute_auth_token";
var AUTH_USERNAME_KEY = "saferoute_auth_username";
var HOTSPOT_POLL_MS = 60000;
var HOTSPOT_RADIUS_M = 20;
var WEATHER_SAMPLE_DISTANCE_M = 5000;
var WEATHER_MAX_POINTS_PER_ROUTE = 6;
var SEVERITY_META = {
    high: { color: "#E24B4A", label: "High" },
    medium: { color: "#EF9F27", label: "Medium" },
    low: { color: "#639922", label: "Low" },
};
var ROUTE_CONFIGS = [
    {
        color: "#4CAF50",
        label: "Best",
        textColor: "#4CAF50",
        bg: "rgba(76,175,80,0.08)",
        border: "rgba(76,175,80,0.3)",
    },
    {
        color: "#EF9F27",
        label: "2nd Best",
        textColor: "#EF9F27",
        bg: "rgba(239,159,39,0.08)",
        border: "rgba(239,159,39,0.3)",
    },
    {
        color: "#1E88E5",
        label: "3rd Best",
        textColor: "#1E88E5",
        bg: "rgba(30,136,229,0.08)",
        border: "rgba(30,136,229,0.3)",
    },
];
var TURN_WEIGHTS = {
    7: 0.5, // slight right
    8: 1, // right
    9: 1.5, // sharp right
    10: 2, // u-turn right
    11: 2, // u-turn left
    12: 1.5, // sharp left
    13: 1, // left
    14: 0.5, // slight left
};
var INPUT_STYLE = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#e8e4dc",
    fontSize: 13,
    outline: "none",
};
/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function haversineMeters(aLat, aLng, bLat, bLng) {
    var toRad = function (d) { return (d * Math.PI) / 180; };
    var R = 6371000;
    var dLat = toRad(bLat - aLat);
    var dLng = toRad(bLng - aLng);
    var lat1 = toRad(aLat);
    var lat2 = toRad(bLat);
    var sinLat = Math.sin(dLat / 2);
    var sinLng = Math.sin(dLng / 2);
    var h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 2 * R * Math.asin(Math.sqrt(h));
}
function parseLatLngInput(value) {
    var match = value
        .trim()
        .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match)
        return null;
    var lat = Number(match[1]);
    var lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return null;
    return { lat: lat, lng: lng };
}
function severityFromWeight(w) {
    if (w >= 7)
        return "high";
    if (w >= 4)
        return "medium";
    return "low";
}
function makeDivIcon(color, label) {
    return leaflet_1.default.divIcon({
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: "<div style=\"width:24px;height:24px;border-radius:50%;background:".concat(color, ";border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;\">").concat(label, "</div>"),
    });
}
function makePlaceIcon(name) {
    return leaflet_1.default.divIcon({
        className: "",
        iconSize: [140, 30],
        iconAnchor: [12, 30],
        html: "<div style=\"display:flex;align-items:center;gap:8px;\"><div style=\"width:12px;height:12px;border-radius:50%;background:#8EC6FF;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)\"></div><div style=\"padding:3px 8px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(142,198,255,0.6);color:#d7ecff;font-size:11px;font-weight:700;max-width:108px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">".concat(name, "</div></div>"),
    });
}
function weatherCodeToEmoji(code) {
    if (code === null)
        return "?";
    if (code === 0)
        return "☀️";
    if (code === 1)
        return "🌤️";
    if (code === 2)
        return "⛅";
    if (code === 3)
        return "☁️";
    if (code === 45 || code === 48)
        return "🌫️";
    if (code === 51 || code === 53 || code === 55)
        return "🌦️";
    if (code === 61 || code === 63 || code === 65 || code === 80)
        return "🌧️";
    if (code === 71 || code === 73 || code === 75)
        return "❄️";
    if (code === 95)
        return "⛈️";
    return "🌡️";
}
function sampleRoutePointsForWeather(positions, minDistanceMeters, maxPoints) {
    if (minDistanceMeters === void 0) { minDistanceMeters = WEATHER_SAMPLE_DISTANCE_M; }
    if (maxPoints === void 0) { maxPoints = WEATHER_MAX_POINTS_PER_ROUTE; }
    if (positions.length === 0)
        return [];
    var sampled = [positions[0]];
    var last = positions[0];
    for (var i = 1; i < positions.length; i += 1) {
        var curr = positions[i];
        var dist = haversineMeters(last[0], last[1], curr[0], curr[1]);
        if (dist >= minDistanceMeters) {
            sampled.push(curr);
            last = curr;
        }
    }
    var end = positions[positions.length - 1];
    var sampledEnd = sampled[sampled.length - 1];
    if (sampledEnd[0] !== end[0] || sampledEnd[1] !== end[1]) {
        sampled.push(end);
    }
    if (sampled.length <= maxPoints)
        return sampled;
    var reduced = [];
    var step = (sampled.length - 1) / (maxPoints - 1);
    for (var i = 0; i < maxPoints; i += 1) {
        reduced.push(sampled[Math.round(i * step)]);
    }
    return reduced;
}
function fetchWeather(lat, lon) {
    return __awaiter(this, void 0, void 0, function () {
        var url, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://api.open-meteo.com/v1/forecast\n    ?latitude=".concat(lat, "\n    &longitude=").concat(lon, "\n    &current_weather=true")
                        .replace(/\s+/g, "");
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    res = _a.sent();
                    if (!res.ok) {
                        throw new Error("Open-Meteo request failed: ".concat(res.status));
                    }
                    return [4 /*yield*/, res.json()];
                case 2: return [2 /*return*/, (_a.sent())];
            }
        });
    });
}
function makeWeatherPointIcon(point) {
    var tempText = point.temperature === null ? "N/A" : "".concat(point.temperature.toFixed(0), "C");
    var codeText = point.weathercode === null ? "-" : String(point.weathercode);
    var emoji = weatherCodeToEmoji(point.weathercode);
    return leaflet_1.default.divIcon({
        className: "",
        iconSize: [76, 28],
        iconAnchor: [38, 34], // Increased the y-offset to move the icon higher
        html: "<div style=\"display:flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(255,255,255,0.22);box-shadow:0 3px 10px rgba(0,0,0,0.25);color:#f8f7f4;font-size:11px;font-weight:700;line-height:1;white-space:nowrap;\"><span style=\"font-size:13px;line-height:1;\">".concat(emoji, "</span><span>").concat(tempText, "</span><span style=\"padding:1px 5px;border-radius:999px;border:1px solid rgba(142,198,255,0.6);background:rgba(30,136,229,0.2);color:#8EC6FF;\">").concat(codeText, "</span></div>"),
    });
}
function countRouteTurnsFromManeuvers(legs) {
    return legs.reduce(function (total, leg) {
        var weightedTurnsInLeg = leg.maneuvers.reduce(function (count, maneuver) {
            return count + (TURN_WEIGHTS[maneuver.type] || 0);
        }, 0);
        return total + weightedTurnsInLeg;
    }, 0);
}
function difficultyFromTurns(turns) {
    if (turns <= 4)
        return "easy";
    if (turns <= 9)
        return "moderate";
    return "hard";
}
/* ------------------------------------------------------------------ */
/*  Map interaction component                                          */
/* ------------------------------------------------------------------ */
function MapClickHandler(_a) {
    var pickMode = _a.pickMode, onPick = _a.onPick;
    (0, react_leaflet_1.useMapEvents)({
        click: function (e) {
            if (!pickMode)
                return;
            onPick({ lat: e.latlng.lat, lng: e.latlng.lng }, pickMode);
        },
    });
    return null;
}
function MapPanTo(_a) {
    var center = _a.center, seq = _a.seq;
    var map = (0, react_leaflet_1.useMap)();
    var lastSeqRef = (0, react_1.useRef)(-1);
    (0, react_1.useEffect)(function () {
        if (center && seq !== lastSeqRef.current) {
            lastSeqRef.current = seq;
            map.panTo(center);
            map.setZoom(16);
        }
    }, [center, seq, map]);
    return null;
}
/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */
function SafetyMapApp(_a) {
    var _this = this;
    var _b, _c;
    var authToken = _a.authToken;
    /* ---- state ---- */
    var _d = (0, react_1.useState)(null), selectedIncident = _d[0], setSelectedIncident = _d[1];
    var _e = (0, react_1.useState)(""), origin = _e[0], setOrigin = _e[1];
    var _f = (0, react_1.useState)(""), destination = _f[0], setDestination = _f[1];
    var _g = (0, react_1.useState)("drive"), travelMode = _g[0], setTravelMode = _g[1];
    var _h = (0, react_1.useState)(true), avoidDanger = _h[0], setAvoidDanger = _h[1];
    var _j = (0, react_1.useState)([]), routeInfos = _j[0], setRouteInfos = _j[1];
    var _k = (0, react_1.useState)(""), routeError = _k[0], setRouteError = _k[1];
    var _l = (0, react_1.useState)(false), routeLoading = _l[0], setRouteLoading = _l[1];
    var _m = (0, react_1.useState)(true), showMarkers = _m[0], setShowMarkers = _m[1];
    var _o = (0, react_1.useState)(null), mapPickMode = _o[0], setMapPickMode = _o[1];
    var _p = (0, react_1.useState)("heatmap"), tab = _p[0], setTab = _p[1];
    var _q = (0, react_1.useState)([]), routePolylines = _q[0], setRoutePolylines = _q[1];
    var _r = (0, react_1.useState)(null), panTarget = _r[0], setPanTarget = _r[1];
    var _s = (0, react_1.useState)(0), panSeq = _s[0], setPanSeq = _s[1];
    var _t = (0, react_1.useState)(0), selectedRouteRank = _t[0], setSelectedRouteRank = _t[1];
    var _u = (0, react_1.useState)([]), incidents = _u[0], setIncidents = _u[1];
    var _v = (0, react_1.useState)({}), routeWeatherByRank = _v[0], setRouteWeatherByRank = _v[1];
    var _w = (0, react_1.useState)(null), hotspotsLastComputedAt = _w[0], setHotspotsLastComputedAt = _w[1];
    var _x = (0, react_1.useState)([]), userPlaces = _x[0], setUserPlaces = _x[1];
    var _y = (0, react_1.useState)(false), placesLoading = _y[0], setPlacesLoading = _y[1];
    var _z = (0, react_1.useState)(""), placesError = _z[0], setPlacesError = _z[1];
    var _0 = (0, react_1.useState)(""), placeNameInput = _0[0], setPlaceNameInput = _0[1];
    var _1 = (0, react_1.useState)(null), placePick = _1[0], setPlacePick = _1[1];
    var _2 = (0, react_1.useState)(false), savingPlace = _2[0], setSavingPlace = _2[1];
    var weatherRequestSeq = (0, react_1.useRef)(0);
    var loadUserPlaces = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var response, points, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setPlacesLoading(true);
                    setPlacesError("");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch("".concat(AUTH_API_URL, "/user-points"), {
                            headers: {
                                Authorization: "Bearer ".concat(authToken),
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Failed to load your places");
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    points = (_a.sent());
                    setUserPlaces(points);
                    return [3 /*break*/, 6];
                case 4:
                    error_1 = _a.sent();
                    setPlacesError(error_1 instanceof Error ? error_1.message : "Failed to load your places");
                    return [3 /*break*/, 6];
                case 5:
                    setPlacesLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); }, [authToken]);
    (0, react_1.useEffect)(function () {
        var cancelled = false;
        var loadHotspots = function () { return __awaiter(_this, void 0, void 0, function () {
            var result, payload, nextIncidents, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(DETECTION_API_URL, "/api/hotspots?limit=200"))];
                    case 1:
                        result = _a.sent();
                        if (!result.ok) {
                            throw new Error("Failed to load hotspots");
                        }
                        return [4 /*yield*/, result.json()];
                    case 2:
                        payload = (_a.sent());
                        if (cancelled)
                            return [2 /*return*/];
                        nextIncidents = payload.hotspots.map(function (r) { return ({
                            lat: r.cord_y,
                            lng: r.cord_x,
                            weight: r.score,
                            type: r.type === "near" ? "near" : "actual",
                            dbImageBase64: r.image_base64,
                            dbVideoUrl: r.video_url,
                        }); });
                        setIncidents(nextIncidents);
                        setHotspotsLastComputedAt(payload.computedAt);
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        console.warn("Detection API unreachable (", error_2, "). Loading fallback mock incidents for UI testing.");
                        if (cancelled)
                            return [2 /*return*/];
                        setIncidents([
                            { lat: 42.6644, lng: 23.3740, weight: 9, type: "actual" },
                            { lat: 42.6680, lng: 23.3650, weight: 5, type: "near" },
                            { lat: 42.6700, lng: 23.3800, weight: 2, type: "near" },
                            { lat: 42.6600, lng: 23.3700, weight: 8, type: "actual" },
                        ]);
                        setHotspotsLastComputedAt(new Date().toISOString());
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        void loadHotspots();
        var timer = window.setInterval(function () {
            void loadHotspots();
        }, HOTSPOT_POLL_MS);
        return function () {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);
    (0, react_1.useEffect)(function () {
        void loadUserPlaces();
    }, [loadUserPlaces]);
    var enrichedIncidents = (0, react_1.useMemo)(function () {
        return incidents.map(function (e, i) {
            var images = ["/snapshots/cam1.png", "/snapshots/cam2.png"];
            var imageUrl = e.dbImageBase64 ? "data:image/jpeg;base64,".concat(e.dbImageBase64) : images[i % images.length];
            var videoUrl = e.dbVideoUrl;
            return __assign(__assign({}, e), { id: i + 1, severity: severityFromWeight(e.weight), location: "Hotspot ".concat(i + 1), count: Math.max(1, Math.round(e.weight / 2)), camera: "CAM-".concat(String(i + 1).padStart(2, "0")), imageUrl: imageUrl, videoUrl: videoUrl });
        });
    }, [incidents]);
    var sortedIncidents = (0, react_1.useMemo)(function () { return __spreadArray([], enrichedIncidents, true).sort(function (a, b) { return b.weight - a.weight; }); }, [enrichedIncidents]);
    var highRiskIncidents = (0, react_1.useMemo)(function () { return enrichedIncidents.filter(function (i) { return i.severity === "high"; }); }, [enrichedIncidents]);
    var severityCounts = (0, react_1.useMemo)(function () { return ({
        high: enrichedIncidents.filter(function (i) { return i.severity === "high"; }).length,
        medium: enrichedIncidents.filter(function (i) { return i.severity === "medium"; }).length,
        low: enrichedIncidents.filter(function (i) { return i.severity === "low"; }).length,
    }); }, [enrichedIncidents]);
    var handleMapPick = (0, react_1.useCallback)(function (latlng, mode) {
        var picked = "".concat(latlng.lat.toFixed(6), ", ").concat(latlng.lng.toFixed(6));
        if (mode === "origin") {
            setOrigin(picked);
            setMapPickMode("destination");
            setTab("route");
            return;
        }
        if (mode === "destination") {
            setDestination(picked);
            setMapPickMode(null);
            setTab("route");
            return;
        }
        setPlacePick({ lat: latlng.lat, lng: latlng.lng });
        setMapPickMode(null);
        setTab("myPlaces");
    }, []);
    var savePlace = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var trimmedName, response, errorPayload, created_1, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    trimmedName = placeNameInput.trim();
                    if (!trimmedName || !placePick)
                        return [2 /*return*/];
                    setSavingPlace(true);
                    setPlacesError("");
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, 7, 8]);
                    return [4 /*yield*/, fetch("".concat(AUTH_API_URL, "/user-points"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: "Bearer ".concat(authToken),
                            },
                            body: JSON.stringify({
                                name: trimmedName,
                                lan: placePick.lat,
                                lon: placePick.lng,
                            }),
                        })];
                case 2:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 3:
                    errorPayload = (_b.sent());
                    throw new Error((_a = errorPayload === null || errorPayload === void 0 ? void 0 : errorPayload.error) !== null && _a !== void 0 ? _a : "Failed to save place");
                case 4: return [4 /*yield*/, response.json()];
                case 5:
                    created_1 = (_b.sent());
                    setUserPlaces(function (prev) { return __spreadArray([created_1], prev, true); });
                    setPlaceNameInput("");
                    setPlacePick(null);
                    return [3 /*break*/, 8];
                case 6:
                    error_3 = _b.sent();
                    setPlacesError(error_3 instanceof Error ? error_3.message : "Failed to save place");
                    return [3 /*break*/, 8];
                case 7:
                    setSavingPlace(false);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); }, [authToken, placeNameInput, placePick]);
    var selectPlaceAsOrigin = (0, react_1.useCallback)(function (placeId) {
        if (!placeId)
            return;
        var place = userPlaces.find(function (p) { return p.id === Number(placeId); });
        if (!place)
            return;
        setOrigin("".concat(place.lan.toFixed(6), ", ").concat(place.lon.toFixed(6)));
    }, [userPlaces]);
    var selectPlaceAsDestination = (0, react_1.useCallback)(function (placeId) {
        if (!placeId)
            return;
        var place = userPlaces.find(function (p) { return p.id === Number(placeId); });
        if (!place)
            return;
        setDestination("".concat(place.lan.toFixed(6), ", ").concat(place.lon.toFixed(6)));
    }, [userPlaces]);
    /* ---- route calculation ---- */
    var calcRoute = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var oCoords, dCoords, result, parsedResult_1, directions, polylines_1, infos_1, requestSeq_1, e_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!origin || !destination)
                        return [2 /*return*/];
                    setRouteLoading(true);
                    setRouteError("");
                    setRouteInfos([]);
                    setRoutePolylines([]);
                    setSelectedRouteRank(0);
                    setRouteWeatherByRank({});
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    oCoords = parseLatLngInput(origin);
                    dCoords = parseLatLngInput(destination);
                    if (!oCoords || !dCoords) {
                        setRouteError("Invalid coordinates. Please enter in format: lat, lng");
                        setRouteLoading(false);
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fetch("http://localhost:8004/get_route?" +
                            new URLSearchParams({
                                lngA: oCoords.lng.toString(),
                                latA: oCoords.lat.toString(),
                                lngB: dCoords.lng.toString(),
                                latB: dCoords.lat.toString(),
                                exclusion: avoidDanger
                                    ? JSON.stringify(enrichedIncidents.map(function (incident) { return ({
                                        lat: incident.lat,
                                        lon: incident.lng,
                                    }); }))
                                    : "",
                                travelMode: travelMode,
                            }))];
                case 2:
                    result = _a.sent();
                    if (result.status !== 200) {
                        setRouteError("Error calculating route. Please try again.");
                        setRouteLoading(false);
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, result.json()];
                case 3:
                    parsedResult_1 = (_a.sent());
                    directions = (0, valhallaToDirections_1.valhallaToDirections)(parsedResult_1);
                    console.debug("Directions result:", parsedResult_1);
                    polylines_1 = [];
                    infos_1 = [];
                    directions.routes.forEach(function (route, idx) {
                        var _a, _b, _c, _d;
                        var cfg = ROUTE_CONFIGS[idx];
                        if (!cfg)
                            return;
                        var positions = route.overview_path.map(function (p) { return [
                            p.lat,
                            p.lng,
                        ]; });
                        polylines_1.push({
                            positions: positions,
                            color: cfg.color,
                            weight: idx === 0 ? 6 : 4,
                            opacity: idx === 0 ? 0.9 : 0.55,
                            rank: idx,
                        });
                        var leg = route.legs[0];
                        var routeEntry = parsedResult_1.route[idx];
                        var turns = routeEntry ? countRouteTurnsFromManeuvers(routeEntry.trip.legs) : 0;
                        if (((_a = leg === null || leg === void 0 ? void 0 : leg.distance) === null || _a === void 0 ? void 0 : _a.text) && ((_b = leg === null || leg === void 0 ? void 0 : leg.duration) === null || _b === void 0 ? void 0 : _b.text)) {
                            infos_1.push({
                                distance: leg.distance.text,
                                duration: leg.duration.text,
                                rank: idx,
                                avoided: (_d = (_c = parsedResult_1.route[idx]) === null || _c === void 0 ? void 0 : _c.avoided) !== null && _d !== void 0 ? _d : 0,
                                turns: turns,
                                difficulty: difficultyFromTurns(turns),
                            });
                        }
                    });
                    setRoutePolylines(polylines_1);
                    setRouteInfos(infos_1);
                    setSelectedRouteRank(0);
                    requestSeq_1 = weatherRequestSeq.current + 1;
                    weatherRequestSeq.current = requestSeq_1;
                    void Promise.all(polylines_1.map(function (route) { return __awaiter(_this, void 0, void 0, function () {
                        var sampledPoints, weatherPoints_1, error_4;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    sampledPoints = sampleRoutePointsForWeather(route.positions);
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, Promise.all(sampledPoints.map(function (_a, pointIdx_1) { return __awaiter(_this, [_a, pointIdx_1], void 0, function (_b, pointIdx) {
                                            var payload, weather;
                                            var _c, _d, _e, _f;
                                            var lat = _b[0], lng = _b[1];
                                            return __generator(this, function (_g) {
                                                switch (_g.label) {
                                                    case 0: return [4 /*yield*/, fetchWeather(lat, lng)];
                                                    case 1:
                                                        payload = _g.sent();
                                                        weather = payload.current_weather;
                                                        return [2 /*return*/, {
                                                                lat: lat,
                                                                lng: lng,
                                                                checkpointLabel: "Point ".concat(pointIdx + 1),
                                                                temperature: (_c = weather === null || weather === void 0 ? void 0 : weather.temperature) !== null && _c !== void 0 ? _c : null,
                                                                winddirection: (_d = weather === null || weather === void 0 ? void 0 : weather.winddirection) !== null && _d !== void 0 ? _d : null,
                                                                weathercode: (_e = weather === null || weather === void 0 ? void 0 : weather.weathercode) !== null && _e !== void 0 ? _e : null,
                                                                time: (_f = weather === null || weather === void 0 ? void 0 : weather.time) !== null && _f !== void 0 ? _f : null,
                                                            }];
                                                }
                                            });
                                        }); }))];
                                case 2:
                                    weatherPoints_1 = _a.sent();
                                    if (weatherRequestSeq.current !== requestSeq_1)
                                        return [2 /*return*/];
                                    setRouteWeatherByRank(function (prev) {
                                        var _a;
                                        return (__assign(__assign({}, prev), (_a = {}, _a[route.rank] = weatherPoints_1, _a)));
                                    });
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_4 = _a.sent();
                                    console.error("Failed to fetch weather for route", route.rank, error_4);
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }));
                    return [3 /*break*/, 6];
                case 4:
                    e_1 = _a.sent();
                    console.error(e_1);
                    setRoutePolylines([]);
                    setRouteError("Could not find a route. Please check both addresses.");
                    return [3 /*break*/, 6];
                case 5:
                    setRouteLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); }, [avoidDanger, destination, enrichedIncidents, highRiskIncidents.length, origin, travelMode]);
    var clearRoute = (0, react_1.useCallback)(function () {
        weatherRequestSeq.current += 1;
        setRoutePolylines([]);
        setRouteInfos([]);
        setRouteError("");
        setRouteWeatherByRank({});
        setMapPickMode(null);
        setOrigin("");
        setDestination("");
    }, []);
    /* ---- derived values ---- */
    var canCalc = origin.length > 0 && destination.length > 0 && !routeLoading;
    var btnBg = canCalc ? "#E24B4A" : "rgba(255,255,255,0.08)";
    var btnColor = canCalc ? "#fff" : "rgba(232,228,220,0.3)";
    var originCoords = parseLatLngInput(origin);
    var destCoords = parseLatLngInput(destination);
    var selectedRouteWeather = (_b = routeWeatherByRank[selectedRouteRank]) !== null && _b !== void 0 ? _b : [];
    // Consume panTarget after one render
    /* ---- render ---- */
    return (<div className="app-root">
      {/* ================ SIDEBAR ================ */}
      <aside className="sidebar">
        {/* -- header -- */}
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <div className="sidebar-logo">S</div>
            <span className="sidebar-title">SafeRoute</span>
            <span className="sidebar-live">LIVE</span>
          </div>
          <p className="sidebar-subtitle">
            {"Sofia | ".concat(incidents.length, " incidents | last 30 days").concat(hotspotsLastComputedAt ? " | updated ".concat(new Date(hotspotsLastComputedAt).toLocaleTimeString()) : "")}
          </p>
        </div>

        {/* -- severity counts -- */}
        <div className="severity-counts">
          {["high", "medium", "low"].map(function (sev) { return (<div key={sev} className="severity-cell">
              <div className="severity-count" style={{ color: SEVERITY_META[sev].color }}>{severityCounts[sev]}</div>
              <div className="severity-label">{SEVERITY_META[sev].label}</div>
            </div>); })}
        </div>

        {/* -- tabs -- */}
        <div className="tab-row">
          {["heatmap", "route", "myPlaces", "plates"].map(function (value) { return (<button key={value} onClick={function () { return setTab(value); }} className={"tab-btn".concat(tab === value ? " tab-btn-active" : "")}>
              {value === "heatmap"
                ? "Hotspots"
                : value === "route"
                    ? "Route"
                    : value === "myPlaces"
                        ? "My places"
                        : "Plates"}
            </button>); })}
        </div>

        {/* -- tab content -- */}
        <div className="tab-content">
          {tab === "heatmap" ? (<HeatmapPanel incidents={sortedIncidents} selectedId={(_c = selectedIncident === null || selectedIncident === void 0 ? void 0 : selectedIncident.id) !== null && _c !== void 0 ? _c : null} showMarkers={showMarkers} onToggleMarkers={function () { return setShowMarkers(function (v) { return !v; }); }} onSelectIncident={function (inc) {
                setSelectedIncident(function (prev) {
                    return (prev === null || prev === void 0 ? void 0 : prev.id) === inc.id ? null : inc;
                });
                setPanTarget([inc.lat, inc.lng]);
                setPanSeq(function (s) { return s + 1; });
            }}/>) : tab === "route" ? (<RoutePanel origin={origin} destination={destination} userPlaces={userPlaces} travelMode={travelMode} avoidDanger={avoidDanger} mapPickMode={mapPickMode} routeInfos={routeInfos} routeError={routeError} routeLoading={routeLoading} highRiskCount={highRiskIncidents.length} canCalc={canCalc} btnBg={btnBg} btnColor={btnColor} selectedRouteRank={selectedRouteRank} onSelectRoute={setSelectedRouteRank} onOriginChange={setOrigin} onDestinationChange={setDestination} onOriginFromPlace={selectPlaceAsOrigin} onDestinationFromPlace={selectPlaceAsDestination} onTravelModeChange={setTravelMode} onToggleAvoidDanger={function () { return setAvoidDanger(function (v) { return !v; }); }} onPickMode={setMapPickMode} onCalcRoute={function () { return void calcRoute(); }} onClearRoute={clearRoute}/>) : tab === "myPlaces" ? (<MyPlacesPanel places={userPlaces} loading={placesLoading} error={placesError} placeNameInput={placeNameInput} placePick={placePick} mapPickMode={mapPickMode} savingPlace={savingPlace} onPlaceNameChange={setPlaceNameInput} onStartPick={function () { return setMapPickMode(mapPickMode === "myPlace" ? null : "myPlace"); }} onSavePlace={function () { return void savePlace(); }}/>) : (<PlateRegistryDashboard_1.default />)}
        </div>

        {/* -- footer -- */}
        <div className="sidebar-footer">
          VenTech | SafeRoute | HackTUES 2026
        </div>
      </aside>

      {/* ================ MAP ================ */}
      <main className="map-main">
        <react_leaflet_1.MapContainer center={BULGARIA_CENTER} zoom={8} zoomControl={true} className="map-container">
          <react_leaflet_1.TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>

          <MapClickHandler pickMode={mapPickMode} onPick={handleMapPick}/>
          <MapPanTo center={panTarget} seq={panSeq}/>

          {/* Hotspot radius circles */}
          {enrichedIncidents.map(function (inc) {
            var circleColor = inc.type === "actual" ? "#E24B4A" : "#FFD600";
            return (<react_leaflet_1.Circle key={"circle-".concat(inc.id)} center={[inc.lat, inc.lng]} radius={HOTSPOT_RADIUS_M} pathOptions={{
                    color: circleColor,
                    weight: 1,
                    opacity: 0.7,
                    fillColor: circleColor,
                    fillOpacity: 0.12,
                }}/>);
        })}

          {/* Incident markers */}
          {showMarkers &&
            enrichedIncidents.map(function (inc) { return (<react_leaflet_1.CircleMarker key={"marker-".concat(inc.id)} center={[inc.lat, inc.lng]} radius={9} pathOptions={{
                    fillColor: SEVERITY_META[inc.severity].color,
                    fillOpacity: 0.95,
                    color: "#fff",
                    weight: 2,
                }} eventHandlers={{
                    click: function () { return setSelectedIncident(inc); },
                }}/>); })}

          {userPlaces.map(function (place) { return (<react_leaflet_1.Marker key={"user-place-".concat(place.id)} position={[place.lan, place.lon]} icon={makePlaceIcon(place.name)}/>); })}


          {/* Route polylines */}
          {__spreadArray([], routePolylines, true).sort(function (a, b) {
            return a.rank === selectedRouteRank
                ? 1
                : b.rank === selectedRouteRank
                    ? -1
                    : a.rank - b.rank;
        })
            .map(function (route) {
            var isSelected = route.rank === selectedRouteRank;
            return (<react_leaflet_1.Polyline key={"route-".concat(route.rank)} positions={route.positions} pathOptions={{
                    color: route.color,
                    weight: isSelected ? 8 : 4,
                    opacity: isSelected ? 1.0 : 0.4,
                }} eventHandlers={{
                    click: function () {
                        setSelectedRouteRank(route.rank);
                        setTab("route");
                    },
                }}/>);
        })}

          {/* Weather markers for selected route */}
          {selectedRouteWeather.map(function (point, idx) { return (<react_leaflet_1.Marker key={"weather-".concat(selectedRouteRank, "-").concat(idx, "-").concat(point.lat, "-").concat(point.lng)} position={[point.lat, point.lng]} icon={makeWeatherPointIcon(point)}/>); })}

          {/* Origin marker */}
          {originCoords && (<react_leaflet_1.Marker position={[originCoords.lat, originCoords.lng]} icon={makeDivIcon("#3B6D11", "A")}/>)}

          {/* Destination marker */}
          {destCoords && (<react_leaflet_1.Marker position={[destCoords.lat, destCoords.lng]} icon={makeDivIcon("#1E88E5", "B")}/>)}
        </react_leaflet_1.MapContainer>

        {selectedIncident && (<div style={{
                position: "absolute",
                right: 24,
                bottom: 24,
                minWidth: 240,
                padding: "14px 16px",
                borderRadius: 12,
                background: "#141618",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                zIndex: 1000,
            }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
            }}>
              <strong style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, backgroundColor: "#ff3b3b", borderRadius: "50%", animation: "blink 1.2s infinite" }}/>
                <style>{"@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }"}</style>
                LIVE • {selectedIncident.location}
              </strong>
              <button onClick={function () { return setSelectedIncident(null); }} style={{
                border: "none",
                background: "none",
                color: "rgba(232,228,220,0.6)",
                cursor: "pointer",
            }}>
                x
              </button>
            </div>
            {selectedIncident.videoUrl ? (<div style={{ position: "relative", marginTop: 12, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                <video autoPlay muted loop playsInline src={selectedIncident.videoUrl} style={{ width: "100%", height: "auto", display: "block", aspectRatio: "16/9", objectFit: "cover", backgroundColor: "#000" }}/>
                <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 8px", fontSize: 10, borderRadius: 4, fontFamily: "monospace", letterSpacing: "1px" }}>
                  {selectedIncident.camera} • VIDEO
                </div>
              </div>) : selectedIncident.imageUrl ? (<div style={{ position: "relative", marginTop: 12, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                <img src={selectedIncident.imageUrl} alt="Live Camera Feed" style={{ width: "100%", height: "auto", display: "block", aspectRatio: "16/9", objectFit: "cover" }}/>
                <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 8px", fontSize: 10, borderRadius: 4, fontFamily: "monospace", letterSpacing: "1px" }}>
                  {selectedIncident.camera} • REC
                </div>
              </div>) : null}
            <div style={{
                marginTop: 0,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 12,
            }}>
              <span>{selectedIncident.count} incidents</span>
              <span>{SEVERITY_META[selectedIncident.severity].label}</span>
              <span>{"".concat(selectedIncident.lat.toFixed(4), ", ").concat(selectedIncident.lng.toFixed(4))}</span>
            </div>
          </div>)}
      </main>
    </div>);
}
function App() {
    var _a = (0, react_1.useState)("signIn"), authMode = _a[0], setAuthMode = _a[1];
    var _b = (0, react_1.useState)(function () {
        return window.localStorage.getItem(AUTH_TOKEN_KEY);
    }), authToken = _b[0], setAuthToken = _b[1];
    var _c = (0, react_1.useState)(function () {
        return window.localStorage.getItem(AUTH_USERNAME_KEY);
    }), authUsername = _c[0], setAuthUsername = _c[1];
    var handleLogout = (0, react_1.useCallback)(function () {
        setAuthToken(null);
        setAuthUsername(null);
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        window.localStorage.removeItem(AUTH_USERNAME_KEY);
        setAuthMode("signIn");
    }, []);
    if (!authToken) {
        if (authMode === "signUp") {
            return (<SignUpPage_1.default onAuthenticated={function (username) {
                    setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
                    setAuthUsername(username);
                }} onSwitchToSignIn={function () {
                    setAuthMode("signIn");
                }}/>);
        }
        return (<SignInPage_1.default onAuthenticated={function (username) {
                setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
                setAuthUsername(username);
            }} onSwitchToSignUp={function () {
                setAuthMode("signUp");
            }}/>);
    }
    return (<div style={{ position: "relative" }}>
      <button onClick={handleLogout} style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 2000,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(20,22,24,0.8)",
            color: "rgba(232,228,220,0.9)",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
        }}>
        {authUsername ? "Log out (".concat(authUsername, ")") : "Log out"}
      </button>
      <SafetyMapApp authToken={authToken}/>
    </div>);
}
/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */
function Toggle(_a) {
    var on = _a.on, onToggle = _a.onToggle, color = _a.color, label = _a.label;
    return (<button aria-label={label} onClick={onToggle} className={"toggle-btn".concat(on ? " toggle-on" : "")} style={{ background: on ? color : undefined }}>
      <span className="toggle-knob" style={{ left: on ? 16 : 2 }}/>
    </button>);
}
function HeatmapPanel(_a) {
    var incidents = _a.incidents, selectedId = _a.selectedId, showMarkers = _a.showMarkers, onToggleMarkers = _a.onToggleMarkers, onSelectIncident = _a.onSelectIncident;
    return (<>
      <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 8,
        }}>
        <span style={{ fontSize: 12, color: "rgba(232,228,220,0.6)" }}>
          Markers
        </span>
        <Toggle on={showMarkers} onToggle={onToggleMarkers} color="#E24B4A" label="Toggle markers"/>
      </div>

      {incidents.map(function (incident) {
            var selected = selectedId === incident.id;
            return (<button key={incident.id} onClick={function () { return onSelectIncident(incident); }} style={{
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
                    border: "1px solid ".concat(selected ? "rgba(226,75,74,0.4)" : "rgba(255,255,255,0.06)"),
                }}>
            <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                }}>
              <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: SEVERITY_META[incident.severity].color,
                    display: "inline-block",
                }}/>
              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>
                {incident.location}
              </span>
              <span style={{
                    fontSize: 10,
                    color: SEVERITY_META[incident.severity].color,
                }}>
                {SEVERITY_META[incident.severity].label}
              </span>
            </div>
            <div style={{
                    display: "flex",
                    gap: 10,
                    paddingLeft: 16,
                    fontSize: 10,
                    color: "rgba(232,228,220,0.4)",
                }}>
              <span>{incident.count} incidents</span>
              <span>{incident.camera}</span>
            </div>
          </button>);
        })}
    </>);
}
function RoutePanel(_a) {
    var origin = _a.origin, destination = _a.destination, userPlaces = _a.userPlaces, travelMode = _a.travelMode, avoidDanger = _a.avoidDanger, mapPickMode = _a.mapPickMode, routeInfos = _a.routeInfos, routeError = _a.routeError, routeLoading = _a.routeLoading, highRiskCount = _a.highRiskCount, canCalc = _a.canCalc, btnBg = _a.btnBg, btnColor = _a.btnColor, selectedRouteRank = _a.selectedRouteRank, onSelectRoute = _a.onSelectRoute, onOriginChange = _a.onOriginChange, onDestinationChange = _a.onDestinationChange, onOriginFromPlace = _a.onOriginFromPlace, onDestinationFromPlace = _a.onDestinationFromPlace, onTravelModeChange = _a.onTravelModeChange, onToggleAvoidDanger = _a.onToggleAvoidDanger, onPickMode = _a.onPickMode, onCalcRoute = _a.onCalcRoute, onClearRoute = _a.onClearRoute;
    return (<>
      <label htmlFor="origin-place" style={{
            display: "block",
            marginBottom: 6,
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        FROM MY PLACES
      </label>
      <select id="origin-place" defaultValue="" onChange={function (e) { return onOriginFromPlace(e.target.value); }} style={INPUT_STYLE}>
        <option value="" style={{ color: "#111" }}>
          Select saved point
        </option>
        {userPlaces.map(function (place) { return (<option key={"origin-".concat(place.id)} value={place.id} style={{ color: "#111" }}>
            {place.name}
          </option>); })}
      </select>

      <label htmlFor="origin" style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        FROM
      </label>
      <input id="origin" value={origin} onChange={function (e) { return onOriginChange(e.target.value); }} placeholder="e.g. Studentski grad, Sofia" style={INPUT_STYLE}/>

      <label htmlFor="destination-place" style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        TO MY PLACES
      </label>
      <select id="destination-place" defaultValue="" onChange={function (e) { return onDestinationFromPlace(e.target.value); }} style={INPUT_STYLE}>
        <option value="" style={{ color: "#111" }}>
          Select saved point
        </option>
        {userPlaces.map(function (place) { return (<option key={"destination-".concat(place.id)} value={place.id} style={{ color: "#111" }}>
            {place.name}
          </option>); })}
      </select>

      <label htmlFor="destination" style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        TO
      </label>
      <input id="destination" value={destination} onChange={function (e) { return onDestinationChange(e.target.value); }} placeholder="e.g. NDK, Sofia" style={INPUT_STYLE}/>

      <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 8,
        }}>
        <button onClick={function () { return onPickMode(mapPickMode === "origin" ? null : "origin"); }} style={{
            padding: "8px 0",
            borderRadius: 8,
            border: "1px solid ".concat(mapPickMode === "origin" ? "rgba(59,109,17,0.55)" : "rgba(255,255,255,0.1)"),
            background: mapPickMode === "origin"
                ? "rgba(59,109,17,0.2)"
                : "rgba(255,255,255,0.04)",
            color: "#e8e4dc",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
        }}>
          Pick FROM on map
        </button>
        <button onClick={function () {
            return onPickMode(mapPickMode === "destination" ? null : "destination");
        }} style={{
            padding: "8px 0",
            borderRadius: 8,
            border: "1px solid ".concat(mapPickMode === "destination" ? "rgba(226,75,74,0.55)" : "rgba(255,255,255,0.1)"),
            background: mapPickMode === "destination"
                ? "rgba(226,75,74,0.2)"
                : "rgba(255,255,255,0.04)",
            color: "#e8e4dc",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
        }}>
          Pick TO on map
        </button>
      </div>

      {mapPickMode && (<div style={{
                marginTop: 8,
                fontSize: 10,
                color: "rgba(232,228,220,0.55)",
            }}>
          Click the map to set {mapPickMode === "origin" ? "FROM" : "TO"}.
        </div>)}

      <label htmlFor="travel-mode" style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        TRAVEL MODE
      </label>
      <select id="travel-mode" value={travelMode} onChange={function (e) { return onTravelModeChange(e.target.value); }} style={INPUT_STYLE}>
        <option value="drive" style={{ color: "#111" }}>
          Car
        </option>
        <option value="pedestrian" style={{ color: "#111" }}>
          Walking
        </option>
      </select>

      <div style={{
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
            border: "1px solid ".concat(avoidDanger ? "rgba(99,153,34,0.25)" : "rgba(255,255,255,0.06)"),
        }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            Avoid dangerous intersections
          </div>
          <div style={{ fontSize: 10, color: "rgba(232,228,220,0.45)" }}>
            {"May add 2 to 5 min | skips ".concat(highRiskCount, " high-risk areas")}
          </div>
        </div>
        <Toggle on={avoidDanger} onToggle={onToggleAvoidDanger} color="#639922" label="Toggle safe routing"/>
      </div>

      {avoidDanger && (<div style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
            }}>
          <div style={{
                color: "rgba(232,228,220,0.72)",
                fontSize: 11,
                lineHeight: 1.5,
            }}>
            Hotspots are treated as a 50m no-go zone when Safe Route is on.
          </div>
        </div>)}

      <button onClick={onCalcRoute} disabled={!canCalc} style={{
            width: "100%",
            padding: "11px 0",
            border: "none",
            borderRadius: 8,
            background: btnBg,
            color: btnColor,
            cursor: canCalc ? "pointer" : "default",
        }}>
        {routeLoading ? "Calculating..." : "Find routes"}
      </button>

      {/* Route legend — shown when we have results */}
      {routeInfos.length > 0 && (<div style={{ marginTop: 12 }}>
          <div style={{
                fontSize: 11,
                color: "rgba(232,228,220,0.45)",
                marginBottom: 8,
            }}>
            ROUTES FOUND
          </div>
          {routeInfos.map(function (info) {
                var cfg = ROUTE_CONFIGS[info.rank];
                var isSelected = info.rank === selectedRouteRank;
                return (<div key={info.rank} onClick={function () { return onSelectRoute(info.rank); }} style={{
                        marginBottom: 8,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isSelected ? cfg.border : cfg.bg,
                        border: "1px solid ".concat(isSelected ? cfg.color : cfg.border),
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        transform: isSelected ? "scale(1.02)" : "scale(1)",
                        boxShadow: isSelected ? "0 4px 12px ".concat(cfg.bg) : "none",
                    }}>
                <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                    }}>
                  {/* Color swatch */}
                  <span style={{
                        display: "inline-block",
                        width: 28,
                        height: 4,
                        borderRadius: 2,
                        background: cfg.color,
                        flexShrink: 0,
                    }}/>
                  <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: cfg.textColor,
                    }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{
                        display: "flex",
                        gap: 14,
                        fontSize: 11,
                        color: "rgba(232,228,220,0.65)",
                        flexWrap: "wrap",
                    }}>
                  <span>{info.distance}</span>
                  <span>{info.duration}</span>
                  <span style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(99,153,34,0.16)",
                        border: "1px solid rgba(99,153,34,0.45)",
                        color: "#8BC34A",
                        fontWeight: 600,
                    }}>
                    Dangerous zones avoided: {info.avoided}
                  </span>
                  <span style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: info.difficulty === "easy"
                            ? "rgba(99,153,34,0.16)"
                            : info.difficulty === "moderate"
                                ? "rgba(239,159,39,0.16)"
                                : "rgba(226,75,74,0.16)",
                        border: info.difficulty === "easy"
                            ? "1px solid rgba(99,153,34,0.45)"
                            : info.difficulty === "moderate"
                                ? "1px solid rgba(239,159,39,0.45)"
                                : "1px solid rgba(226,75,74,0.45)",
                        color: info.difficulty === "easy"
                            ? "#8BC34A"
                            : info.difficulty === "moderate"
                                ? "#EF9F27"
                                : "#E24B4A",
                        fontWeight: 600,
                        textTransform: "capitalize",
                    }}>
                    Route difficulty (based on turns): {info.difficulty}
                  </span>
                </div>
              </div>);
            })}
        </div>)}

      {routeError && (<div style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(226,75,74,0.1)",
                color: "#E24B4A",
                fontSize: 12,
            }}>
          {routeError}
        </div>)}

      {(routeInfos.length > 0 || routeError) && (<button onClick={onClearRoute} style={{
                width: "100%",
                marginTop: 10,
                padding: "9px 0",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "none",
                color: "rgba(232,228,220,0.6)",
                cursor: "pointer",
            }}>
          Clear routes
        </button>)}
    </>);
}
function MyPlacesPanel(_a) {
    var places = _a.places, loading = _a.loading, error = _a.error, placeNameInput = _a.placeNameInput, placePick = _a.placePick, mapPickMode = _a.mapPickMode, savingPlace = _a.savingPlace, onPlaceNameChange = _a.onPlaceNameChange, onStartPick = _a.onStartPick, onSavePlace = _a.onSavePlace;
    var canSave = placeNameInput.trim().length > 0 && placePick !== null && !savingPlace;
    return (<>
      <button onClick={onStartPick} style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: "1px solid ".concat(mapPickMode === "myPlace" ? "rgba(142,198,255,0.7)" : "rgba(255,255,255,0.1)"),
            background: mapPickMode === "myPlace" ? "rgba(142,198,255,0.16)" : "rgba(255,255,255,0.04)",
            color: "#e8e4dc",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
        }}>
        {mapPickMode === "myPlace" ? "Click map to choose place" : "Pick place on map"}
      </button>

      {placePick && (<div style={{
                marginTop: 10,
                fontSize: 11,
                color: "rgba(232,228,220,0.7)",
            }}>
          {"Selected point: ".concat(placePick.lat.toFixed(6), ", ").concat(placePick.lng.toFixed(6))}
        </div>)}

      <label htmlFor="place-name" style={{
            display: "block",
            margin: "12px 0 6px",
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        PLACE NAME
      </label>
      <input id="place-name" value={placeNameInput} onChange={function (e) { return onPlaceNameChange(e.target.value); }} placeholder="e.g. Home" style={INPUT_STYLE}/>

      <button onClick={onSavePlace} disabled={!canSave} style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: canSave ? "#1E88E5" : "rgba(255,255,255,0.08)",
            color: canSave ? "#fff" : "rgba(232,228,220,0.35)",
            cursor: canSave ? "pointer" : "default",
            fontWeight: 700,
        }}>
        {savingPlace ? "Saving..." : "Save place"}
      </button>

      {error && (<div style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(226,75,74,0.1)",
                color: "#E24B4A",
                fontSize: 12,
            }}>
          {error}
        </div>)}

      <div style={{
            marginTop: 14,
            marginBottom: 8,
            fontSize: 11,
            color: "rgba(232,228,220,0.45)",
        }}>
        SAVED PLACES
      </div>

      {loading ? (<div style={{ fontSize: 12, color: "rgba(232,228,220,0.7)" }}>Loading places...</div>) : places.length === 0 ? (<div style={{ fontSize: 12, color: "rgba(232,228,220,0.5)" }}>No saved places yet.</div>) : (places.map(function (place) { return (<div key={place.id} style={{
                padding: "9px 10px",
                marginBottom: 6,
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
            }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#d7ecff" }}>{place.name}</div>
            <div style={{ fontSize: 10, color: "rgba(232,228,220,0.6)", marginTop: 2 }}>
              {"".concat(place.lan.toFixed(6), ", ").concat(place.lon.toFixed(6))}
            </div>
          </div>); }))}
    </>);
}
