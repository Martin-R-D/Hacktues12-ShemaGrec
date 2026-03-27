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

app.use(function (req, res, next) {
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

  const compute = async (exclusionPoints?: { lat: number; lon: number}[], radius: number = 30) => {
    try {
      const exclude_polygons = exclusionPoints?.map((point) =>
        pointToCircle(point.lat, point.lon, radius ),
      );
      console.debug("Exclusion polygons:", exclude_polygons);
      const result = await actor.route({
        locations: [
          { lat: data.latA, lon: data.lngA },
          { lat: data.latB, lon: data.lngB },
        ],
        costing: data.travelMode === "drive" ? "auto" : "pedestrian",
        // exclude_polygons,
        exclude_locations: exclusionPoints,
      });
      return result;
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message); // 171
      }
    }
  };

  // Calculate a route
  const withExclude = await compute(data.exclusion, 30);
  if (!withExclude) {
    return { route: await compute(), withExclusion: false };
  } else {
    return { route: withExclude, withExclusion: true };
  }
}
