import L from "leaflet";
import {
  TURN_WEIGHTS,
  WEATHER_MAX_POINTS_PER_ROUTE,
  WEATHER_SAMPLE_DISTANCE_M,
} from "./constants";
import type {
  OpenMeteoResponse,
  RouteDifficulty,
  RouteWeatherPoint,
  Severity,
} from "./types";

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseLatLngInput(
  value: string,
): { lat: number; lng: number } | null {
  const match = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function severityFromWeight(w: number): Severity {
  if (w >= 7) return "high";
  if (w >= 4) return "medium";
  return "low";
}

export function makeDivIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;">${label}</div>`,
  });
}

export function makePlaceIcon(name: string) {
  return L.divIcon({
    className: "",
    iconSize: [140, 30],
    iconAnchor: [12, 30],
    html: `<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:50%;background:#8EC6FF;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div><div style="padding:3px 8px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(142,198,255,0.6);color:#d7ecff;font-size:11px;font-weight:700;max-width:108px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div></div>`,
  });
}

export function weatherCodeToEmoji(code: number | null): string {
  if (code === null) return "?";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 61 || code === 63 || code === 65 || code === 80) return "🌧️";
  if (code === 71 || code === 73 || code === 75) return "❄️";
  if (code === 95) return "⛈️";
  return "🌡️";
}

export function weatherCodeToSymbol(code: number | null): string {
  if (code === null) return "?";
  if (code === 0) return "C";
  if (code === 1) return "PC";
  if (code === 2) return "C2";
  if (code === 3) return "OV";
  if (code === 45 || code === 48) return "FG";
  if (code === 51 || code === 53 || code === 55) return "DZ";
  if (code === 61 || code === 63 || code === 65 || code === 80) return "RN";
  if (code === 71 || code === 73 || code === 75) return "SN";
  if (code === 95) return "TS";
  return "WX";
}

export function sampleRoutePointsForWeather(
  positions: [number, number][],
  minDistanceMeters = WEATHER_SAMPLE_DISTANCE_M,
  maxPoints = WEATHER_MAX_POINTS_PER_ROUTE,
): [number, number][] {
  if (positions.length === 0) return [];

  const sampled: [number, number][] = [positions[0]];
  let last = positions[0];

  for (let i = 1; i < positions.length; i += 1) {
    const curr = positions[i];
    const dist = haversineMeters(last[0], last[1], curr[0], curr[1]);
    if (dist >= minDistanceMeters) {
      sampled.push(curr);
      last = curr;
    }
  }

  const end = positions[positions.length - 1];
  const sampledEnd = sampled[sampled.length - 1];
  if (sampledEnd[0] !== end[0] || sampledEnd[1] !== end[1]) {
    sampled.push(end);
  }

  if (sampled.length <= maxPoints) return sampled;

  const reduced: [number, number][] = [];
  const step = (sampled.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    reduced.push(sampled[Math.round(i * step)]);
  }
  return reduced;
}

export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<OpenMeteoResponse> {
  const url = `https://api.open-meteo.com/v1/forecast
    ?latitude=${lat}
    &longitude=${lon}
    &current_weather=true`
    .replace(/\s+/g, "");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  return (await res.json()) as OpenMeteoResponse;
}

export function makeWeatherPointIcon(point: RouteWeatherPoint): L.DivIcon {
  const tempText =
    point.temperature === null ? "N/A" : `${point.temperature.toFixed(0)}C`;
  const codeText = point.weathercode === null ? "-" : String(point.weathercode);
  const emoji = weatherCodeToEmoji(point.weathercode);

  return L.divIcon({
    className: "",
    iconSize: [76, 28],
    iconAnchor: [38, 34],
    html: `<div style="display:flex;align-items:center;gap:6px;padding:3px 7px;border-radius:999px;background:rgba(12,14,16,0.9);border:1px solid rgba(255,255,255,0.22);box-shadow:0 3px 10px rgba(0,0,0,0.25);color:#f8f7f4;font-size:11px;font-weight:700;line-height:1;white-space:nowrap;"><span style="font-size:13px;line-height:1;">${emoji}</span><span>${tempText}</span><span style="padding:1px 5px;border-radius:999px;border:1px solid rgba(142,198,255,0.6);background:rgba(30,136,229,0.2);color:#8EC6FF;">${codeText}</span></div>`,
  });
}

export function countRouteTurnsFromManeuvers(
  legs: { maneuvers: Array<{ type: number }> }[],
): number {
  return legs.reduce((total, leg) => {
    const weightedTurnsInLeg = leg.maneuvers.reduce((count, maneuver) => {
      return count + (TURN_WEIGHTS[maneuver.type] || 0);
    }, 0);
    return total + weightedTurnsInLeg;
  }, 0);
}

export function difficultyFromTurns(turns: number): RouteDifficulty {
  if (turns <= 4) return "easy";
  if (turns <= 9) return "moderate";
  return "hard";
}
