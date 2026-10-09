// Seeds the UbicaTec SQLite database from the researched source data.
// Run with: node prisma/seed.mjs  (after `npm run db:push`)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(
  root,
  "docs/research/ubicatec/extracted-app-data.json",
);
const literalsPath = path.join(
  root,
  "docs/research/ubicatec/extracted-shell-literals.json",
);
const contextPath = path.join(
  root,
  "docs/research/ubicatec/osm-distritotec-context.json",
);

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const lit = JSON.parse(readFileSync(literalsPath, "utf8"));
const osmContext = JSON.parse(readFileSync(contextPath, "utf8"));

const traced = data["47673.CAMPUS_BUILDINGS_TRACED"];
const groups = data["92899.groups"];
const entrances = data["52833.entrances"];
const events = data["72047.EVENTS"];
const posts = data["72047.POSTS"];
const categoryMeta = data["76797.CATEGORY_META"];

const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Same resolution the source does with `es()`: id or alias match. */
function resolveBuilding(query, buildings) {
  const n = norm(query);
  if (!n) return undefined;
  return (
    buildings.find((b) => b.id === query) ??
    buildings.find((b) => (b.aliases ?? []).some((a) => norm(a) === n)) ??
    buildings.find((b) => norm(b.name) === n)
  );
}

/** Extra slug → building-name matches for the few profile keys whose source
 *  slug does not appear in the building's alias list. */
const PROFILE_FALLBACK = {
  "centro-congresos": "Centro de Congresos",
  "centro-biotecnologia": "Centro de Biotecnología FEMSA",
};

const prisma = new PrismaClient();

async function main() {
  console.log("clearing tables…");
  const tables = [
    "FoodPlace",
    "FoodZone",
    "ChillPlace",
    "Event",
    "Post",
    "BuildingProfile",
    "Entrance",
    "Building",
    "CampusAsset",
  ];
  for (const t of tables) {
    await prisma[t].deleteMany({});
  }

  // ---------------------------------------------------------------- buildings
  console.log(`upserting ${traced.length} buildings…`);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  for (const [order, b] of traced.entries()) {
    const label = groupById.get(b.id)?.labelOffset ?? b.pinOffset ?? null;
    await prisma.building.create({
      data: {
        id: b.id,
        order,
        name: b.name,
        mapLabel: b.mapLabel ?? null,
        code: b.code ?? null,
        category: b.category,
        levels: b.levels ?? 1,
        area: b.area ?? 0,
        isDirectory: !!b.isDirectoryEntry,
        osmId: b.osmId ?? null,
        aliases: JSON.stringify(b.aliases ?? []),
        description: b.description ?? null,
        posX: b.pos.x,
        posZ: b.pos.z,
        footprint: JSON.stringify(b.footprint ?? []),
        holes: b.holes ? JSON.stringify(b.holes) : null,
        parts: b.parts ? JSON.stringify(b.parts) : null,
        pinX: b.pinOffset?.x ?? null,
        pinZ: b.pinOffset?.z ?? null,
        labelX: label?.x ?? null,
        labelZ: label?.z ?? null,
      },
    });
  }

  // -------------------------------------------------------------- entrances
  console.log(`upserting ${entrances.length} entrances…`);
  for (const e of entrances) {
    const b = resolveBuilding(e.buildingId, traced);
    if (!b) {
      console.warn(`  ! entrance ${e.id} has no building ${e.buildingId}`);
      continue;
    }
    await prisma.entrance.create({
      data: { id: e.id, buildingId: b.id, x: e.x, z: e.z },
    });
  }

  // --------------------------------------------------------------- profiles
  const profileEntries = Object.entries(lit.I);
  let profileHits = 0;
  console.log(`upserting ${profileEntries.length} building profiles…`);
  for (const [slug, p] of profileEntries) {
    const b = resolveBuilding(PROFILE_FALLBACK[slug] ?? slug, traced);
    if (!b) {
      console.warn(`  ! profile "${slug}" did not resolve to a building`);
      continue;
    }
    profileHits++;
    await prisma.buildingProfile.create({
      data: {
        buildingId: b.id,
        slug,
        subtitle: p.subtitle ?? null,
        description: p.description ?? null,
        hours: p.hours ?? null,
        rooms: p.rooms ?? null,
        elevators: p.elevators ?? null,
        accessible: p.accessible ?? null,
        amenities: p.amenities ? JSON.stringify(p.amenities) : null,
        levels: p.levels ? JSON.stringify(p.levels) : null,
        layoutNote: p.layoutNote ?? null,
      },
    });
  }
  console.log(`  ${profileHits}/${profileEntries.length} profiles linked`);

  // ----------------------------------------------------------------- events
  console.log(`upserting ${events.length} events…`);
  for (const e of events) {
    const b = e.buildingSlug ? resolveBuilding(e.buildingSlug, traced) : null;
    await prisma.event.create({
      data: {
        slug: e.slug,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt,
        endsAt: e.endsAt ?? null,
        durationMin: e.durationMin,
        organizer: e.organizer ?? null,
        place: e.place ?? null,
        tags: JSON.stringify(e.tags ?? []),
        buildingSlug: e.buildingSlug ?? null,
        buildingId: b?.id ?? null,
      },
    });
  }

  // ------------------------------------------------------------------ posts
  console.log(`upserting ${posts.length} posts…`);
  for (const p of posts) {
    const b = p.buildingSlug ? resolveBuilding(p.buildingSlug, traced) : null;
    await prisma.post.create({
      data: {
        slug: p.slug,
        type: p.type,
        title: p.title,
        summary: p.summary,
        author: p.author,
        publishedAt: p.publishedAt,
        ago: p.ago ?? null,
        tags: JSON.stringify(p.tags ?? []),
        buildingSlug: p.buildingSlug ?? null,
        buildingId: b?.id ?? null,
        coverUrl: p.coverUrl ?? null,
        body: p.body ? JSON.stringify(p.body) : null,
      },
    });
  }

  // -------------------------------------------------------------- food data
  console.log(`upserting ${lit.eh.length} food zones…`);
  for (let i = 0; i < lit.eh.length; i++) {
    const z = lit.eh[i];
    await prisma.foodZone.create({
      data: {
        id: z.id,
        name: z.name,
        detail: z.detail,
        tone: z.tone,
        rowTone: z.rowTone,
        icon: z.icon,
        order: i,
      },
    });
  }
  const foodPlaces = lit.ec.food.places;
  console.log(`upserting ${foodPlaces.length} food places…`);
  for (const p of foodPlaces) {
    await prisma.foodPlace.create({
      data: {
        key: `${p.id}::${p.name}`,
        buildingQuery: p.id,
        label: p.label,
        name: p.name,
        location: p.location ?? null,
        playlist: p.playlist,
        description: p.description,
        features: JSON.stringify(p.features ?? []),
        logo: lit.ef[p.name] ?? null,
      },
    });
  }

  console.log(`upserting ${lit.ec.chill.places.length} chill places…`);
  for (const p of lit.ec.chill.places) {
    await prisma.chillPlace.create({
      data: {
        id: p.id,
        label: p.label,
        description: p.description,
        features: JSON.stringify(p.features ?? []),
        buildingQuery: p.id,
      },
    });
  }

  // ----------------------------------------------------------- campus assets
  const assets = {
    bounds: data["76797.CAMPUS_BOUNDS"],
    origin: data["76797.CAMPUS_ORIGIN"],
    categoryMeta,
    parks: data["76797.CAMPUS_PARKS"],
    pitches: data["76797.CAMPUS_PITCHES"],
    roads: data["76797.CAMPUS_ROADS"],
    greenAreas: data["87874.areas"],
    walkGraph: {
      version: data["84749.version"],
      paths: data["84749.paths"],
      blockedJunctions: data["84749.blockedJunctions"],
      blockedPathPairs: data["84749.blockedPathPairs"],
    },
    osmContext,
    // Absolute-canvas building footprints used as routing obstacles
    // (source: M.OSM_BUILDINGS_RAW → footprint/parts translated by pos).
    osmObstacles: data["4464.OSM_BUILDINGS_RAW"].flatMap((b) =>
      [b.footprint, ...(b.parts ?? []).map((p) => p.footprint)].map((footprint) =>
        footprint.map((p) => ({
          x: p.x + b.pos.x,
          z: p.z + b.pos.z,
        })),
      ),
    ),
    filters: lit.ei,
    featureLabels: lit.ep,
    buildingCodes: lit.buildingCodes,
    days: lit.Q,
    foodPanel: {
      name: lit.ec.food.name,
      intro: lit.ec.food.intro,
    },
    chillPanel: {
      name: lit.ec.chill.name,
      intro: lit.ec.chill.intro,
    },
  };
  console.log(`upserting ${Object.keys(assets).length} campus assets…`);
  for (const [key, value] of Object.entries(assets)) {
    await prisma.campusAsset.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) },
    });
  }

  const counts = {
    buildings: await prisma.building.count(),
    entrances: await prisma.entrance.count(),
    profiles: await prisma.buildingProfile.count(),
    events: await prisma.event.count(),
    posts: await prisma.post.count(),
    foodZones: await prisma.foodZone.count(),
    foodPlaces: await prisma.foodPlace.count(),
    chillPlaces: await prisma.chillPlace.count(),
    assets: await prisma.campusAsset.count(),
  };
  console.log("seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
