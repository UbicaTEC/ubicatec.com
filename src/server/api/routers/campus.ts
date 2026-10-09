import type { Prisma } from "../../../../generated/prisma";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

type Json = string;

export type OsmContext = {
  attribution?: string;
  contextBuildings: { id?: string; name?: string; points: Pt[] }[];
  greens: Pt[][];
  pitches: Pt[][];
  concrete: Pt[][];
  construction: Pt[][];
  water: Pt[][];
  roads: { kind: string; points: Pt[] }[];
} | null;

function parseJson<T>(value: Json | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type WalkGraphAsset = {
  version?: number;
  paths: { id: string; points: Pt[] }[];
  blockedJunctions: Pt[];
  blockedPathPairs: { first: string; second: string }[];
};

export type Pt = { x: number; z: number };

export type BuildingDto = {
  id: string;
  name: string;
  mapLabel: string | null;
  code: string | null;
  category: string;
  levels: number;
  area: number;
  isDirectory: boolean;
  osmId: string | null;
  aliases: string[];
  description: string | null;
  pos: Pt;
  footprint: Pt[];
  holes: Pt[][] | null;
  parts: { footprint: Pt[] }[] | null;
  pinOffset: Pt | null;
  labelOffset: Pt | null;
  profile: {
    slug: string;
    subtitle: string | null;
    description: string | null;
    hours: string | null;
    rooms: number | null;
    elevators: number | null;
    accessible: boolean | null;
    amenities: string[] | null;
    levels: { label: string; name: string }[] | null;
    layoutNote: string | null;
  } | null;
};

export type EntranceDto = {
  id: string;
  buildingId: string;
  x: number;
  z: number;
};

export type EventDto = {
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  durationMin: number;
  organizer: string | null;
  place: string | null;
  tags: string[];
  buildingSlug: string | null;
  buildingId: string | null;
};

export type PostDto = {
  slug: string;
  type: string;
  title: string;
  summary: string;
  author: string;
  publishedAt: string;
  ago: string | null;
  tags: string[];
  buildingSlug: string | null;
  coverUrl: string | null;
  body: unknown;
};

type BuildingRow = Prisma.BuildingGetPayload<{
  include: { profile: true };
}>;

function toBuildingDto(row: BuildingRow): BuildingDto {
  return {
    id: row.id,
    name: row.name,
    mapLabel: row.mapLabel,
    code: row.code,
    category: row.category,
    levels: row.levels,
    area: row.area,
    isDirectory: row.isDirectory,
    osmId: row.osmId,
    aliases: parseJson<string[]>(row.aliases, []),
    description: row.description,
    pos: { x: row.posX, z: row.posZ },
    footprint: parseJson<Pt[]>(row.footprint, []),
    holes: row.holes ? parseJson<Pt[][]>(row.holes, []) : null,
    parts: row.parts ? parseJson<{ footprint: Pt[] }[]>(row.parts, []) : null,
    pinOffset:
      row.pinX != null && row.pinZ != null
        ? { x: row.pinX, z: row.pinZ }
        : null,
    labelOffset:
      row.labelX != null && row.labelZ != null
        ? { x: row.labelX, z: row.labelZ }
        : null,
    profile: row.profile
      ? {
          slug: row.profile.slug,
          subtitle: row.profile.subtitle,
          description: row.profile.description,
          hours: row.profile.hours,
          rooms: row.profile.rooms,
          elevators: row.profile.elevators,
          accessible: row.profile.accessible,
          amenities: row.profile.amenities
            ? parseJson<string[]>(row.profile.amenities, [])
            : null,
          levels: row.profile.levels
            ? parseJson<{ label: string; name: string }[]>(
                row.profile.levels,
                [],
              )
            : null,
          layoutNote: row.profile.layoutNote,
        }
      : null,
  };
}

export const campusRouter = createTRPCRouter({
  /** Everything the SPA needs, in one round trip (mirrors the source bundle). */
  bootstrap: publicProcedure.query(async ({ ctx }) => {
    const asset = async <T,>(key: string, fallback: T): Promise<T> => {
      const row = await ctx.db.campusAsset.findUnique({ where: { key } });
      return row ? parseJson<T>(row.value, fallback) : fallback;
    };

    const [
      bounds,
      origin,
      parks,
      pitches,
      roads,
      greenAreas,
      walkGraph,
      osmContext,
      osmObstacles,
    ] = await Promise.all([
      asset("bounds", { width: 1184, depth: 1135 }),
      asset("origin", { lat: 25.6515, lon: -100.2895 }),
      asset("parks", [] as { polygon: Pt[] }[]),
      asset("pitches", [] as { polygon: Pt[] }[]),
      asset(
        "roads",
        [] as { kind: string; width: number; points: Pt[] }[],
      ),
      asset(
        "greenAreas",
        [] as { id: string; name: string; points: Pt[] }[],
      ),
      asset(
        "walkGraph",
        null as WalkGraphAsset | null,
      ),
      asset<OsmContext>("osmContext", null),
      asset("osmObstacles", [] as Pt[][]),
    ]);

    const [categoryMeta, filters, featureLabels, buildingCodes, days] =
      await Promise.all([
        asset<Record<string, { label: string }>>("categoryMeta", {}),
        asset<{ id: string; label: string }[]>("filters", []),
        asset<Record<string, string>>("featureLabels", {}),
        asset<Record<string, string>>("buildingCodes", {}),
        asset<{ id: string; label: string; shortLabel: string }[]>(
          "days",
          [],
        ),
      ]);

    const [buildings, entrances, events, posts, foodZones, foodPlaces, chill] =
      await Promise.all([
        ctx.db.building.findMany({
          include: { profile: true },
          orderBy: { order: "asc" },
        }),
        ctx.db.entrance.findMany(),
        ctx.db.event.findMany({ orderBy: { startsAt: "asc" } }),
        ctx.db.post.findMany({ orderBy: { publishedAt: "desc" } }),
        ctx.db.foodZone.findMany({ orderBy: { order: "asc" } }),
        ctx.db.foodPlace.findMany(),
        ctx.db.chillPlace.findMany(),
      ]);

    return {
      geometry: {
        bounds,
        origin,
        parks,
        pitches,
        roads,
        greenAreas,
        walkGraph,
        obstacles: osmObstacles,
        context: osmContext,
      },
      categoryMeta,
      filters,
      featureLabels,
      buildingCodes,
      days,
      buildings: buildings.map(toBuildingDto),
      entrances: entrances.map<EntranceDto>((e) => ({
        id: e.id,
        buildingId: e.buildingId,
        x: e.x,
        z: e.z,
      })),
      events: events.map<EventDto>((e) => ({
        slug: e.slug,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        durationMin: e.durationMin,
        organizer: e.organizer,
        place: e.place,
        tags: parseJson<string[]>(e.tags, []),
        buildingSlug: e.buildingSlug,
        buildingId: e.buildingId,
      })),
      posts: posts.map<PostDto>((p) => ({
        slug: p.slug,
        type: p.type,
        title: p.title,
        summary: p.summary,
        author: p.author,
        publishedAt: p.publishedAt,
        ago: p.ago,
        tags: parseJson<string[]>(p.tags, []),
        buildingSlug: p.buildingSlug,
        coverUrl: p.coverUrl,
        body: p.body ? (JSON.parse(p.body) as unknown) : null,
      })),
      food: {
        zones: foodZones.map((z) => ({
          id: z.id,
          name: z.name,
          detail: z.detail,
          tone: z.tone,
          rowTone: z.rowTone,
          icon: z.icon,
          order: z.order,
        })),
        places: foodPlaces.map((p) => ({
          key: p.key,
          buildingQuery: p.buildingQuery,
          label: p.label,
          name: p.name,
          location: p.location,
          playlist: p.playlist,
          description: p.description,
          features: parseJson<string[]>(p.features, []),
          logo: p.logo,
        })),
        panel: await asset("foodPanel", {
          name: "UbicaTec Food",
          intro: "",
        }),
      },
      chill: {
        panel: await asset("chillPanel", {
          name: "UbicaTec Chill",
          intro: "",
        }),
        places: chill.map((c) => ({
          id: c.id,
          label: c.label,
          description: c.description,
          features: parseJson<string[]>(c.features, []),
          buildingQuery: c.buildingQuery,
        })),
      },
    };
  }),
});
