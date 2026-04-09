import type { CSSProperties } from "react";
import type { Severity } from "./types";

export const BULGARIA_CENTER: [number, number] = [42.7339, 25.4858];

export const DETECTION_API_URL =
  import.meta.env.VITE_DETECTION_API_URL ?? "http://localhost:8005";
export const AUTH_API_URL =
  import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8004";
export const AUTH_TOKEN_KEY = "saferoute_auth_token";
export const AUTH_USERNAME_KEY = "saferoute_auth_username";
export const HOTSPOT_POLL_MS = 60_000;

export const HOTSPOT_RADIUS_M = 20;
export const WEATHER_SAMPLE_DISTANCE_M = 5_000;
export const WEATHER_MAX_POINTS_PER_ROUTE = 6;

export const SEVERITY_META: Record<Severity, { color: string; label: string }> = {
  high: { color: "#E24B4A", label: "High" },
  medium: { color: "#EF9F27", label: "Medium" },
  low: { color: "#639922", label: "Low" },
};

export const ROUTE_CONFIGS = [
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

export const TURN_WEIGHTS: Record<number, number> = {
  7: 0.5,
  8: 1,
  9: 1.5,
  10: 2,
  11: 2,
  12: 1.5,
  13: 1,
  14: 0.5,
};

export const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e8e4dc",
  fontSize: 13,
  outline: "none",
};
