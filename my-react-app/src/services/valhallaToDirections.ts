type ValhallaManeuver = {
  type: number;
  instruction: string;
  time: number;
  length: number;
  begin_shape_index: number;
  end_shape_index: number;
};

type ValhallaLeg = {
  maneuvers: ValhallaManeuver[];
  summary: {
    time: number;
    length: number;
  };
  shape: string;
};

type ValhallaTrip = {
  legs: ValhallaLeg[];
  summary: {
    time: number;
    length: number;
  };
  units: string;
  status: number;
};

export type ValhallaResponse = {
  route: Array<{
    trip: ValhallaTrip;
  }>;
  withExclusion: boolean;
};

function decodePolyline6(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

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

function formatDistance(km: number, units: string) {
  if (units === "miles") {
    const miles = km * 0.621371;
    return miles < 0.1
      ? `${Math.round(miles * 5280)} ft`
      : `${miles.toFixed(1)} mi`;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} secs`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} mins`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0
    ? `${hours} hour${hours > 1 ? "s" : ""} ${mins} mins`
    : `${hours} hour${hours > 1 ? "s" : ""}`;
}

export function valhallaToDirections(response: ValhallaResponse) {
  const routes = response.route.map((routeEntry) => {
    const trip = routeEntry.trip;
    const units = trip.units ?? "kilometers";

    const allPoints: Array<{ lat: number; lng: number }> = [];

    const legs = trip.legs.map((leg) => {
      const decoded = decodePolyline6(leg.shape);
      allPoints.push(...decoded);

      const distanceKm = leg.summary.length;
      const distanceMeters =
        units === "miles" ? distanceKm * 1609.34 : distanceKm * 1000;

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
      legs,
    };
  });

  return { routes };
}