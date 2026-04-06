import express from "express";
import { Actor } from "@valhallajs/valhallajs";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import * as z from "zod";
import { Sequelize, DataTypes, Model } from "sequelize";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-safe-route-secret";

type AuthTokenPayload = {
  sub: string;
};

const DB_HOST = process.env.DB_HOST ?? "db";
const DB_PORT = Number(process.env.DB_PORT ?? "5432");
const DB_NAME = process.env.DB_NAME ?? "plates";
const DB_USER = process.env.DB_USER ?? "admin";
const DB_PASS = process.env.DB_PASS ?? "admin";

// Initialize Sequelize with PostgreSQL
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgres',
  logging: false,
});

// Define the User model
class User extends Model {
  declare id: number;
  declare username: string;
  declare passwordHash: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

class UserPoint extends Model {
  declare id: number;
  declare name: string;
  declare lan: number;
  declare lon: number;
  declare userId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER, 
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal('NOW()'),
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
  },
);

UserPoint.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lan: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    lon: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    sequelize,
    modelName: "UserPoint",
    tableName: "usersPoint",
  },
);

// Sync the database
sequelize.sync({ alter: true })
  .then(() => console.log("Database synced and auth/place models ready."))
  .catch((err) => console.error("Failed to sync database:", err));

const signUpSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(4).max(200),
});

const signInSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const userPointSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lan: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

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
const AVOIDANCE_MATCH_RADIUS_METERS = 20;

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

function decodePolyline6(encoded: string): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

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

    lon += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }

  return points;
}

function toLocalMeters(lat: number, lon: number, latOrigin: number) {
  const x = lon * METERS_PER_DEGREE * Math.cos((latOrigin * Math.PI) / 180);
  const y = lat * METERS_PER_DEGREE;
  return { x, y };
}

function pointToSegmentDistanceMeters(
  point: { lat: number; lon: number },
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
) {
  const latOrigin = point.lat;
  const p = toLocalMeters(point.lat, point.lon, latOrigin);
  const a = toLocalMeters(start.lat, start.lon, latOrigin);
  const b = toLocalMeters(end.lat, end.lon, latOrigin);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return Math.hypot(dx, dy);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closestX = a.x + t * abx;
  const closestY = a.y + t * aby;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

const app = express();
app.listen(8004, () => {
  console.log("Server is running on port 8004");
});

app.use(express.json());


function getBearerToken(value: string | undefined) {
  if (!value || !value.startsWith("Bearer ")) return null;
  return value.slice(7);
}

function getAuthenticatedUserId(req: express.Request): number | null {
  const token = getBearerToken(req.header("Authorization"));
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const userId = Number(payload.sub);
    return Number.isInteger(userId) ? userId : null;
  } catch {
    return null;
  }
}

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.post("/auth/signUp", async (req, res) => {
  try {
    const { username, password } = signUpSchema.parse(req.body);
    const passwordHash = createHash("sha256").update(password).digest("hex");

    const newUser = await User.create({ username, passwordHash });
    const token = jwt.sign({ sub: String(newUser.id) }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.status(201).json({ token, username: newUser.username });
  } catch (error: any) {
    // Handle duplicate username error
    if (error.name === "SequelizeUniqueConstraintError" || (error.parent && error.parent.code === '23505')) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/auth/signIn", async (req, res) => {
  try {
    const { username, password } = signInSchema.parse(req.body);
    const passwordHash = createHash("sha256").update(password).digest("hex");

    const user = await User.findOne({ where: { username } });
    if (!user || user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ sub: String(user.id) }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, username: user.username });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/auth/me", async (req, res) => {
  const token = getBearerToken(req.header("Authorization"));
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    res.json({ username: user.username });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/user-points", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const points = await UserPoint.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "name", "lan", "lon"],
    });
    res.json(points);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/user-points", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const payload = userPointSchema.parse(req.body);
    const created = await UserPoint.create({ ...payload, userId });
    res.status(201).json({
      id: created.id,
      name: created.name,
      lan: created.lan,
      lon: created.lon,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
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
  type RouteWithAvoided = RouteResult & { avoided: number };

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

  const countIncludedAvoidancePoints = (
    route: RouteResult,
    avoidancePoints: { lat: number; lon: number }[],
  ) => {
    const routePoints = route.trip.legs.flatMap((leg) => decodePolyline6(leg.shape));
    if (routePoints.length === 0 || avoidancePoints.length === 0) return 0;
    if (routePoints.length === 1) {
      return avoidancePoints.filter(
        (point) =>
          pointToSegmentDistanceMeters(point, routePoints[0], routePoints[0]) <=
          AVOIDANCE_MATCH_RADIUS_METERS,
      ).length;
    }

    return avoidancePoints.filter((point) => {
      for (let i = 0; i < routePoints.length - 1; i++) {
        const d = pointToSegmentDistanceMeters(point, routePoints[i], routePoints[i + 1]);
        if (d <= AVOIDANCE_MATCH_RADIUS_METERS) return true;
      }
      return false;
    }).length;
  };

  // Calculate a route with 3 iterations:
  // 1: exclude_locations only (point exclusion)
  // 2: exclude_polygons with small radius
  // 3: exclude_polygons with larger radius
  const radii = [30, 60];
  const res: RouteResult[] = [];
  const seenSignatures = new Set<string>();
  const hasAvoidancePoints = (data.exclusion?.length ?? 0) > 0;

  let baselineIncludedCount = 0;
  let baselineRoute: RouteResult | undefined;
  if (hasAvoidancePoints) {
    baselineRoute = await compute();
    if (baselineRoute && data.exclusion) {
      baselineIncludedCount = countIncludedAvoidancePoints(
        baselineRoute,
        data.exclusion,
      );
    }
  }

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

  const mapWithAvoided = (routes: RouteResult[]): RouteWithAvoided[] => {
    if (!hasAvoidancePoints || !data.exclusion) {
      return routes.map((route) => ({ ...route, avoided: 0 }));
    }

    const withSafetyScore = routes.map((route, index) => {
      const included = countIncludedAvoidancePoints(route, data.exclusion!);
      console.log(`Included avoidance points (route ${index + 1}):`, included);
      return {
        ...route,
        avoided: Math.max(0, baselineIncludedCount - included),
      };
    });

    // Highest avoided count means safest route.
    return withSafetyScore.sort((a, b) => b.avoided - a.avoided);
  };

  if (res.length === 0) {
    const fallback = baselineRoute ?? (await compute());
    return {
      route: fallback ? mapWithAvoided([fallback]) : [],
      withExclusion: false,
    };
  }

  return { route: mapWithAvoided(res), withExclusion: true };
}
