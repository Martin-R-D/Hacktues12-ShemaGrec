export type Severity = "high" | "medium" | "low";

export type IncidentType = "actual" | "near";

export type IncidentEvent = {
  lat: number;
  lng: number;
  weight: number;
  type: IncidentType;
  dbImageBase64?: string;
};

export type Incident = IncidentEvent & {
  id: number;
  severity: Severity;
  location: string;
  count: number;
  camera: string;
  imageUrl?: string;
};

export type RouteDifficulty = "easy" | "moderate" | "hard";

export type RouteInfo = {
  distance: string;
  duration: string;
  rank: number;
  avoided: number;
  turns: number;
  difficulty: RouteDifficulty;
};

export type TravelMode = "drive" | "pedestrian";

export type RoutePolyline = {
  positions: [number, number][];
  color: string;
  weight: number;
  opacity: number;
  rank: number;
};

export type OpenMeteoCurrentWeather = {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  time: string;
};

export type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  current_weather?: OpenMeteoCurrentWeather;
};

export type RouteWeatherPoint = {
  lat: number;
  lng: number;
  checkpointLabel: string;
  temperature: number | null;
  winddirection: number | null;
  weathercode: number | null;
  time: string | null;
};

export type HotspotApiRow = {
  rank: number;
  cord_x: number;
  cord_y: number;
  score: number;
  type?: string;
  image_base64?: string;
};

export type HotspotApiResponse = {
  computedAt: string | null;
  hotspots: HotspotApiRow[];
};

export type UserPlace = {
  id: number;
  name: string;
  lan: number;
  lon: number;
};

export type MapPickMode = "origin" | "destination" | "myPlace" | null;
