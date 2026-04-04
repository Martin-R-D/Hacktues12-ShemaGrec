import express from "express";
import { Actor } from "@valhallajs/valhallajs";
import * as z from "zod";

const routeSchema = z.object({
  lngA: z.coerce.number(),
  latA: z.coerce.number(),
  lngB: z.coerce.number(),
  latB: z.coerce.number(),
  travelMode: z.enum(["drive", "pedestrian"]),
  exclusion: z.string().optional(),
});

const exclusionSchema = z.array(
  z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
  }),
);

const METERS_PER_DEGREE = 111320;

function pointToCircle(lat: number, lon: number, radiusMeters: number) {
  const points = 8;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const dLat = (radiusMeters / METERS_PER_DEGREE) * Math.cos(angle);
    const dLon =
      (radiusMeters / (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180))) *
      Math.sin(angle);
    coords.push([lon + dLon, lat + dLat]);
  }
  return coords;
}

const app = express();
app.listen(8004, () => {
  console.log("Server is running on port 8004");
});

app.use(function (_req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  next();
});

app.get("/get_route", async (req, res) => {
  console.log(req.query);
  const parseQuery = routeSchema.safeParse(req.query);
  if (parseQuery.success) {
    const exclusionParsed = parseQuery.data.exclusion
      ? exclusionSchema.safeParse(JSON.parse(parseQuery.data.exclusion))
      : undefined;
    res.json(
      await calculateRoute({
        ...parseQuery.data,
        exclusion: exclusionParsed?.success ? exclusionParsed.data : undefined,
      }),
    );
  } else {
    res.status(400).json({ error: "Invalid query parameters" });
  }
});

async function calculateRoute(
  data: Omit<z.infer<typeof routeSchema>, "exclusion"> & {
    exclusion?: z.infer<typeof exclusionSchema>;
  },
) {
  // Create an actor with config generated on previous step
  const actor = await Actor.fromConfigFile("config.json");
  type RouteResult = {
    trip: {
      legs: Array<{ shape: string }>;
    };
  };

  const compute = async (
    exclusionPoints?: { lat: number; lon: number }[],
    mode: "locations" | "polygons" = "locations",
    radius: number = 30,
  ) => {
    try {
      const exclude_polygons =
        mode === "polygons" && exclusionPoints
          ? exclusionPoints.map((point) =>
            pointToCircle(point.lat, point.lon, radius),
          )
          : undefined;
      const exclude_locations =
        mode === "locations" && exclusionPoints ? exclusionPoints : undefined;
      console.debug("Exclusion polygons:", exclude_polygons);
      console.debug("Exclusion locations:", exclude_locations);
      const result = (await actor.route({
        locations: [
          { lat: data.latA, lon: data.lngA },
          { lat: data.latB, lon: data.lngB },
        ],
        costing: data.travelMode === "drive" ? "auto" : "pedestrian",
        exclude_polygons,
        exclude_locations,
      })) as RouteResult;
      return result;
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message);
      }
    }
  };

  const routeSignature = (route: RouteResult) => {
    // Use encoded leg shapes as a stable geometry fingerprint.
    return route.trip.legs.map((leg) => leg.shape).join("|");
  };

  // Calculate a route with 3 iterations:
  // 1: exclude_locations only (point exclusion)
  // 2: exclude_polygons with small radius
  // 3: exclude_polygons with larger radius
  const radii = [30, 60];
  const res: RouteResult[] = [];
  const seenSignatures = new Set<string>();
  for (let i = 0; i < 3; i++) {
    let withExclude;
    if (i === 0) {
      withExclude = await compute(data.exclusion, "locations");
    } else {
      withExclude = await compute(data.exclusion, "polygons", radii[i - 1]);
    }
    if (withExclude) {
      const signature = routeSignature(withExclude);
      if (!seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        res.push(withExclude);
      }
    }
  }
  // if (res.length === 0) {
  //   return { route: [await compute()], withExclusion: false };
  // } else {
  //   return { route: res, withExclusion: true };
  //}
  if (res.length === 0) {
    const fallback = await compute();
    return { route: fallback ? [fallback] : [], withExclusion: false };
  }

  return { route: res.reverse(), withExclusion: true };
}