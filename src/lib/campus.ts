import type { BuildingDto, EventDto } from "~/server/api/routers/campus";

type Building = BuildingDto;

/** Normalize a search string: lowercase, strip accents/punctuation, collapse spaces. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Short building code from the building's `code` field (e.g. "CB1 3013"). */
export function buildingCode(building: {
  code?: string | null;
  name?: string | null;
}): string | null {
  const code = building.code?.trim();
  if (!code) return null;
  const token = code.split(/\s+/)[0] ?? "";
  return token.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null;
}

/** Does the building match a free-text query? */
export function matchesBuildingQuery(
  building: {
    name?: string | null;
    code?: string | null;
    aliases?: string[];
    tags?: string[];
  },
  query: string,
): boolean {
  const q = normalize(query);
  if (!q) return true;
  const haystack = [
    building.name ?? "",
    building.code ?? "",
    ...(building.aliases ?? []),
    ...(building.tags ?? []),
  ]
    .map(normalize)
    .join(" ");
  return q.split(" ").every((token) => haystack.includes(token));
}

/** Resolve a query (building id/alias/code/name) to a building (source `es`). */
export function resolveBuildingByQuery(
  buildings: Building[],
  query: string | null | undefined,
): Building | null {
  if (!query) return null;
  const q = normalize(query);
  if (!q) return null;
  const exact = buildings.find((b) => {
    const names = [
      b.id,
      b.name,
      b.code ?? "",
      ...(b.aliases ?? []),
    ].map(normalize);
    return names.includes(q);
  });
  if (exact) return exact;
  return buildings.find((b) => matchesBuildingQuery(b, query)) ?? null;
}

/** Alias-only resolution: match a building by id or exact alias (source `es`). */
export function resolveBuildingRef<T extends { id: string; aliases?: string[] }>(
  buildings: T[],
  ref: string | null | undefined,
): T | undefined {
  if (!ref) return undefined;
  return buildings.find((b) => b.id === ref || b.aliases?.includes(ref));
}

/** Display code for a building (source `er`). */
export function codeOf(
  building: {
    code?: string | null;
    id: string;
    name?: string | null;
    aliases?: string[];
  },
  codes: Record<string, string> = {},
): string | null {
  if (building.code) {
    const token = building.code.trim().split(/\s+/)[0] ?? "";
    const cleaned = token.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleaned) return cleaned;
  }
  for (const key of [
    building.id,
    building.name ?? "",
    ...(building.aliases ?? []),
  ]) {
    const code = codes[key];
    if (code) return code;
  }
  return null;
}

/**
 * Project lat/lon into campus-local meters using the source's local tangent
 * plane around CAMPUS_ORIGIN (same numbers as the original bundle).
 */
export function makeProjection(origin: { lat: number; lon: number }) {
  const lat0 = (origin.lat * Math.PI) / 180;
  const mPerLat = 111_320;
  const mPerLon = 111_320 * Math.cos(lat0);
  return (lat: number, lon: number): { x: number; z: number } => ({
    x: (lon - origin.lon) * mPerLon,
    z: (origin.lat - lat) * mPerLat,
  });
}

/** Format a timestamp as "HH:MM" (es-MX, 24 h) — source `T`. */
export function formatClock(value: string | number | Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/** Walking minutes, rounded up (source `el`). */
export function minutesCeil(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** Walking minutes for a route length in meters. */
export function minutesFromSeconds(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** Format a day-of-month + month as "5 oct". */
export function formatDateShort(day: number, monthIndex: number): string {
  const date = new Date(2024, monthIndex, day);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(/\./g, "");
}

/** Resolve an event's building slug to a building id (source `e6`). */
export function resolveEventBuildingId(
  event: Pick<EventDto, "buildingSlug" | "buildingId">,
  buildings: Building[],
): string | null {
  if (event.buildingId) return event.buildingId;
  if (!event.buildingSlug) return null;
  const slug = normalize(event.buildingSlug);
  const found = buildings.find((b) =>
    (b.aliases ?? []).some((alias) => normalize(alias) === slug),
  );
  return found?.id ?? null;
}

export type EventBuildingGroup = {
  buildingId: string;
  building: Building | null;
  events: EventDto[];
  live: boolean;
};

/** Group events by resolved building (source `eventBuildings`). */
export function eventBuildings(
  events: EventDto[],
  buildings: Building[],
): EventBuildingGroup[] {
  const groups = new Map<string, EventBuildingGroup>();
  const now = Date.now();
  for (const event of events) {
    const buildingId = resolveEventBuildingId(event, buildings);
    if (!buildingId) continue;
    let group = groups.get(buildingId);
    if (!group) {
      group = {
        buildingId,
        building: buildings.find((b) => b.id === buildingId) ?? null,
        events: [],
        live: false,
      };
      groups.set(buildingId, group);
    }
    group.events.push(event);
    if (isEventLive(event, now)) group.live = true;
  }
  return [...groups.values()];
}

/** Is the event currently live? */
export function isEventLive(event: EventDto, now = Date.now()): boolean {
  const start = event.startsAt ? Date.parse(event.startsAt) : NaN;
  const end = event.endsAt ? Date.parse(event.endsAt) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return false;
  const from = Number.isNaN(start) ? end : start;
  const to = Number.isNaN(end) ? start : end;
  return now >= from && now <= to;
}

/** Post excerpt from its body. */
export function excerpt(body: string, max = 140): string {
  const plain = body.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export type EntryPoint = {
  lat: number;
  lon: number;
  kind: string;
  index: number;
};

/** Pick the entrance nearest to a point (source `nearestEntrance`). */
export function nearestEntrance<T extends { x: number; z: number }>(
  point: T,
  entrances: T[],
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const entrance of entrances) {
    const dx = entrance.x - point.x;
    const dz = entrance.z - point.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = entrance;
    }
  }
  return best;
}

export type UiTab = "search" | "events" | "food" | "chill" | "news";

export type Marker =
  | { type: "building"; id: string }
  | { type: "event"; id: string }
  | { type: "entrance"; buildingId: string; index: number };

/** Format a route distance in meters (e.g. "320 m", "1.2 km"). */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
