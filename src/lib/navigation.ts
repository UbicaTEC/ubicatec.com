import type { BuildingDto, EntranceDto } from "~/server/api/routers/campus";
import { distance, route, type Graph, type Pt, type Route } from "./routing";

/** Destination candidates for a building: its entrances, or sampled footprint points. */
export function buildingDestinationPoints(
  building: BuildingDto,
  entrances: EntranceDto[],
): { points: Pt[]; hasEntrances: boolean } {
  const own = entrances.filter((e) => e.buildingId === building.id);
  if (own.length > 0) {
    return {
      points: own.map((e) => ({ x: e.x, z: e.z })),
      hasEntrances: true,
    };
  }

  const polygons = [
    building.footprint,
    ...(building.parts ?? []).map((part) => part.footprint),
  ];
  const points: Pt[] = [];
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        points.push({
          x: building.pos.x + a.x + (b.x - a.x) * t,
          z: building.pos.z + a.z + (b.z - a.z) * t,
        });
      }
    }
  }
  return { points, hasEntrances: false };
}

/** Source `tx`: route from a location to a building (with the source's fallback). */
export function routeToBuilding(
  graph: Graph | null,
  origin: Pt | null,
  building: BuildingDto | null,
  entrances: EntranceDto[],
): Route | null {
  if (!graph || !origin || !building) return null;
  const { points, hasEntrances } = buildingDestinationPoints(building, entrances);

  const attempt = route(graph, origin, points, {
    allowDestinationBuildingAccess: hasEntrances,
  });
  if (attempt) return attempt;

  const nearEntrance = entrances.some(
    (e) => distance({ x: e.x, z: e.z }, origin) <= 90,
  );
  if (!nearEntrance) return null;

  return route(graph, origin, points, {
    allowOriginBuildingExit: true,
    allowDestinationBuildingAccess: hasEntrances,
  });
}
