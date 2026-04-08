"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.valhallaToDirections = valhallaToDirections;
function decodePolyline6(encoded) {
    var points = [];
    var index = 0;
    var lat = 0;
    var lng = 0;
    while (index < encoded.length) {
        var shift = 0;
        var result = 0;
        var byte = void 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += result & 1 ? ~(result >> 1) : result >> 1;
        shift = 0;
        result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += result & 1 ? ~(result >> 1) : result >> 1;
        points.push({ lat: lat / 1e6, lng: lng / 1e6 });
    }
    return points;
}
function formatDistance(km, units) {
    if (units === "miles") {
        var miles = km * 0.621371;
        return miles < 0.1
            ? "".concat(Math.round(miles * 5280), " ft")
            : "".concat(miles.toFixed(1), " mi");
    }
    return km < 1 ? "".concat(Math.round(km * 1000), " m") : "".concat(km.toFixed(1), " km");
}
function formatDuration(seconds) {
    if (seconds < 60)
        return "".concat(Math.round(seconds), " secs");
    if (seconds < 3600)
        return "".concat(Math.round(seconds / 60), " mins");
    var hours = Math.floor(seconds / 3600);
    var mins = Math.round((seconds % 3600) / 60);
    return mins > 0
        ? "".concat(hours, " hour").concat(hours > 1 ? "s" : "", " ").concat(mins, " mins")
        : "".concat(hours, " hour").concat(hours > 1 ? "s" : "");
}
function valhallaToDirections(response) {
    var routes = response.route.map(function (routeEntry) {
        var _a;
        var trip = routeEntry.trip;
        var units = (_a = trip.units) !== null && _a !== void 0 ? _a : "kilometers";
        var allPoints = [];
        var legs = trip.legs.map(function (leg) {
            var decoded = decodePolyline6(leg.shape);
            allPoints.push.apply(allPoints, decoded);
            var distanceKm = leg.summary.length;
            var distanceMeters = units === "miles" ? distanceKm * 1609.34 : distanceKm * 1000;
            return {
                distance: {
                    text: formatDistance(distanceKm, units),
                    value: Math.round(distanceMeters),
                },
                duration: {
                    text: formatDuration(leg.summary.time),
                    value: Math.round(leg.summary.time),
                },
            };
        });
        return {
            overview_path: allPoints,
            legs: legs,
        };
    });
    return { routes: routes };
}
