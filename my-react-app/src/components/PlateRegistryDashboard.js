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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PlateRegistryDashboard;
var react_1 = require("react");
require("./PlateRegistryDashboard.css");
var DETECTION_API_URL = (_a = import.meta.env.VITE_DETECTION_API_URL) !== null && _a !== void 0 ? _a : "http://localhost:8005";
function getRiskLevel(score) {
    if (score >= 7)
        return "high";
    if (score >= 4)
        return "medium";
    return "low";
}
function formatDateTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "N/A";
    return date.toLocaleString();
}
function normalizePlate(value) {
    return value.toLowerCase().replace(/\s+/g, "");
}
function getSortValue(plate, sortKey) {
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
function PlateRegistryDashboard() {
    var _this = this;
    var _a;
    var _b = (0, react_1.useState)([]), plates = _b[0], setPlates = _b[1];
    var _c = (0, react_1.useState)(true), loading = _c[0], setLoading = _c[1];
    var _d = (0, react_1.useState)(""), error = _d[0], setError = _d[1];
    var _e = (0, react_1.useState)(""), searchTerm = _e[0], setSearchTerm = _e[1];
    var _f = (0, react_1.useState)("riskScore"), sortKey = _f[0], setSortKey = _f[1];
    var _g = (0, react_1.useState)("desc"), sortDirection = _g[0], setSortDirection = _g[1];
    var _h = (0, react_1.useState)(null), selectedPlateNumber = _h[0], setSelectedPlateNumber = _h[1];
    var _j = (0, react_1.useState)({}), eventsByPlate = _j[0], setEventsByPlate = _j[1];
    (0, react_1.useEffect)(function () {
        var cancelled = false;
        var loadPlates = function () { return __awaiter(_this, void 0, void 0, function () {
            var response, payload, fetchError_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        setLoading(true);
                        setError("");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, fetch("".concat(DETECTION_API_URL, "/api/plates"))];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to load plates (".concat(response.status, ")"));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        payload = (_a.sent());
                        if (cancelled)
                            return [2 /*return*/];
                        setPlates(payload.plates);
                        return [3 /*break*/, 6];
                    case 4:
                        fetchError_1 = _a.sent();
                        if (cancelled)
                            return [2 /*return*/];
                        setError(fetchError_1 instanceof Error
                            ? fetchError_1.message
                            : "Failed to load registration numbers");
                        return [3 /*break*/, 6];
                    case 5:
                        if (!cancelled) {
                            setLoading(false);
                        }
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        }); };
        void loadPlates();
        return function () {
            cancelled = true;
        };
    }, []);
    var filteredPlates = (0, react_1.useMemo)(function () {
        var normalizedSearch = normalizePlate(searchTerm.trim());
        var matchingPlates = normalizedSearch
            ? plates.filter(function (plate) {
                return normalizePlate(plate.plateNumber).includes(normalizedSearch);
            })
            : plates;
        var direction = sortDirection === "asc" ? 1 : -1;
        return __spreadArray([], matchingPlates, true).sort(function (left, right) {
            var primary = (getSortValue(left, sortKey) - getSortValue(right, sortKey)) * direction;
            if (primary !== 0)
                return primary;
            var riskFallback = right.riskScore - left.riskScore;
            if (riskFallback !== 0)
                return riskFallback;
            return (new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime());
        });
    }, [plates, searchTerm, sortDirection, sortKey]);
    (0, react_1.useEffect)(function () {
        if (selectedPlateNumber &&
            !filteredPlates.some(function (plate) { return plate.plateNumber === selectedPlateNumber; })) {
            setSelectedPlateNumber(null);
        }
    }, [filteredPlates, selectedPlateNumber]);
    var selectedPlate = selectedPlateNumber
        ? (_a = plates.find(function (plate) { return plate.plateNumber === selectedPlateNumber; })) !== null && _a !== void 0 ? _a : null
        : null;
    var selectedPlateEvents = selectedPlateNumber
        ? eventsByPlate[selectedPlateNumber]
        : undefined;
    var highRiskCount = filteredPlates.filter(function (plate) { return getRiskLevel(plate.riskScore) === "high"; }).length;
    var handleToggleEvents = function (plateNumber) { return __awaiter(_this, void 0, void 0, function () {
        var cachedState, response, payload_1, fetchError_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (selectedPlateNumber === plateNumber) {
                        setSelectedPlateNumber(null);
                        return [2 /*return*/];
                    }
                    setSelectedPlateNumber(plateNumber);
                    cachedState = eventsByPlate[plateNumber];
                    if ((cachedState === null || cachedState === void 0 ? void 0 : cachedState.loading) || (cachedState === null || cachedState === void 0 ? void 0 : cachedState.events)) {
                        return [2 /*return*/];
                    }
                    setEventsByPlate(function (current) {
                        var _a;
                        return (__assign(__assign({}, current), (_a = {}, _a[plateNumber] = {
                            loading: true,
                            error: "",
                            events: null,
                        }, _a)));
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(DETECTION_API_URL, "/api/plates/").concat(encodeURIComponent(plateNumber), "/events?limit=12"))];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Failed to load events (".concat(response.status, ")"));
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    payload_1 = (_a.sent());
                    setEventsByPlate(function (current) {
                        var _a;
                        return (__assign(__assign({}, current), (_a = {}, _a[plateNumber] = {
                            loading: false,
                            error: "",
                            events: payload_1.events,
                        }, _a)));
                    });
                    return [3 /*break*/, 5];
                case 4:
                    fetchError_2 = _a.sent();
                    setEventsByPlate(function (current) {
                        var _a;
                        return (__assign(__assign({}, current), (_a = {}, _a[plateNumber] = {
                            loading: false,
                            error: fetchError_2 instanceof Error
                                ? fetchError_2.message
                                : "Failed to load plate events",
                            events: null,
                        }, _a)));
                    });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var renderContent = function () {
        var _a;
        if (loading) {
            return (<div className="plate-dashboard__state">
          Зареждаме регистрационните номера...
        </div>);
        }
        if (error) {
            return (<div className="plate-dashboard__state plate-dashboard__state--error">
          {error}
        </div>);
        }
        if (plates.length === 0) {
            return (<div className="plate-dashboard__state">
          Все още няма записи в `plates`.
        </div>);
        }
        if (filteredPlates.length === 0) {
            return (<div className="plate-dashboard__state">
          Няма номера, които да съвпадат с текущия филтър.
        </div>);
        }
        return (<>
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
              {filteredPlates.map(function (plate) {
                var riskLevel = getRiskLevel(plate.riskScore);
                var isSelected = selectedPlateNumber === plate.plateNumber;
                return (<tr key={plate.id} className={"plate-dashboard__row plate-dashboard__row--".concat(riskLevel).concat(isSelected ? " plate-dashboard__row--selected" : "")}>
                    <td>
                      <div className="plate-dashboard__plate-cell">
                        <span className="plate-dashboard__plate-number">
                          {plate.plateNumber}
                        </span>
                        <span className={"plate-dashboard__risk-accent plate-dashboard__risk-accent--".concat(riskLevel)}>
                          {riskLevel}
                        </span>
                      </div>
                    </td>
                    <td>{formatDateTime(plate.firstSeen)}</td>
                    <td>{formatDateTime(plate.lastSeen)}</td>
                    <td>
                      <span className={"plate-dashboard__metric".concat(plate.warnings > 0 ? " plate-dashboard__metric--warn" : "")}>
                        {plate.warnings}
                      </span>
                    </td>
                    <td>
                      <span className={"plate-dashboard__metric".concat(plate.criticals > 0 ? " plate-dashboard__metric--critical" : "")}>
                        {plate.criticals}
                      </span>
                    </td>
                    <td>
                      <span className={"plate-dashboard__score-badge plate-dashboard__score-badge--".concat(riskLevel)}>
                        {plate.riskScore.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="plate-dashboard__events-button" onClick={function () { return void handleToggleEvents(plate.plateNumber); }}>
                        {isSelected ? "Hide events" : "View events"}
                      </button>
                    </td>
                  </tr>);
            })}
            </tbody>
          </table>
        </div>

        {selectedPlate && (<section className="plate-dashboard__events-panel">
            <div className="plate-dashboard__events-header">
              <div>
                <div className="plate-dashboard__events-eyebrow">
                  Recent activity
                </div>
                <h4 className="plate-dashboard__events-title">
                  {selectedPlate.plateNumber}
                </h4>
              </div>
              <span className={"plate-dashboard__score-badge plate-dashboard__score-badge--".concat(getRiskLevel(selectedPlate.riskScore))}>
                {selectedPlate.riskScore.toFixed(2)}
              </span>
            </div>

            {(selectedPlateEvents === null || selectedPlateEvents === void 0 ? void 0 : selectedPlateEvents.loading) ? (<div className="plate-dashboard__state plate-dashboard__state--compact">
                Зареждаме последните събития...
              </div>) : (selectedPlateEvents === null || selectedPlateEvents === void 0 ? void 0 : selectedPlateEvents.error) ? (<div className="plate-dashboard__state plate-dashboard__state--error plate-dashboard__state--compact">
                {selectedPlateEvents.error}
              </div>) : ((_a = selectedPlateEvents === null || selectedPlateEvents === void 0 ? void 0 : selectedPlateEvents.events) === null || _a === void 0 ? void 0 : _a.length) ? (<div className="plate-dashboard__events-list">
                {selectedPlateEvents.events.map(function (event, index) {
                        var _a, _b;
                        return (<article key={"".concat(event.plateNumber, "-").concat(event.time, "-").concat(index)} className="plate-dashboard__event-item">
                    <div className="plate-dashboard__event-topline">
                      <strong>{formatDateTime(event.time)}</strong>
                      <span className={"plate-dashboard__score-badge plate-dashboard__score-badge--".concat(getRiskLevel(event.riskScore))}>
                        {event.riskScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="plate-dashboard__event-meta">
                      <span>{(_a = event.eventType) !== null && _a !== void 0 ? _a : "Unknown event"}</span>
                      <span>{(_b = event.cameraId) !== null && _b !== void 0 ? _b : "No camera id"}</span>
                    </div>
                  </article>);
                    })}
              </div>) : (<div className="plate-dashboard__state plate-dashboard__state--compact">
                Няма последни събития за този номер.
              </div>)}
          </section>)}
      </>);
    };
    return (<section className="plate-dashboard">
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
        <input type="search" value={searchTerm} onChange={function (event) { return setSearchTerm(event.target.value); }} className="plate-dashboard__search" placeholder="Search by plate number"/>

        <div className="plate-dashboard__toolbar-row">
          <select value={sortKey} onChange={function (event) { return setSortKey(event.target.value); }} className="plate-dashboard__select">
            <option value="lastSeen">Sort: Last Seen</option>
            <option value="riskScore">Sort: Risk Score</option>
            <option value="warnings">Sort: Warnings</option>
            <option value="criticals">Sort: Criticals</option>
          </select>

          <button type="button" className="plate-dashboard__direction-button" onClick={function () {
            return setSortDirection(function (current) {
                return current === "desc" ? "asc" : "desc";
            });
        }}>
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
          <strong>{selectedPlateNumber !== null && selectedPlateNumber !== void 0 ? selectedPlateNumber : "-"}</strong>
        </div>
      </div>

      {renderContent()}
    </section>);
}
