/**
 * Campus walking router — a faithful port of the source bundle's graph builder
 * (`buildGraph`), edge snapping (`F`), and Dijkstra route search (`H`).
 *
 * Source reference: docs/research/ubicatec/pretty/0itzd-8bhii9..js.txt
 */

export type Pt = { x: number; z: number };

export type WalkPath = { id: string; kind?: string; points: Pt[] };
export type Barrier = { kind: string; points: Pt[] };
export type BlockedPathPair = { first: string; second: string };

export type GraphInput = {
  paths: WalkPath[];
  barriers: Barrier[];
  blockedSurfaces: Pt[][];
  obstacles: Pt[][];
  blockedJunctions: Pt[];
  blockedPathPairs: BlockedPathPair[];
};

export type GraphEdge = { to: number; distance: number };

export type Graph = {
  nodes: Pt[];
  edges: GraphEdge[][];
  mainComponent: Set<number>;
  obstacles: Polygon;
  blockedSurfaces: Polygon;
  barriers: Barrier[];
};

type Polygon = { points: Pt[]; minX: number; maxX: number; minZ: number; maxZ: number }[];

const WALKABLE_KINDS = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
]);
const MAJOR_KINDS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
]);

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nodeKey(p: Pt): string {
  return `${Math.round(10 * p.x)}:${Math.round(10 * p.z)}`;
}

function cross(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointOnSegment(p: Pt, a: Pt, b: Pt): boolean {
  return (
    Math.abs(cross(a, b, p)) <= 0.001 &&
    p.x >= Math.min(a.x, b.x) - 0.001 &&
    p.x <= Math.max(a.x, b.x) + 0.001 &&
    p.z >= Math.min(a.z, b.z) - 0.001 &&
    p.z <= Math.max(a.z, b.z) + 0.001
  );
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const a = cross(p1, p2, p3);
  const b = cross(p1, p2, p4);
  const c = cross(p3, p4, p1);
  const d = cross(p3, p4, p2);
  return (
    (a > 0) !== (b > 0) &&
      (c > 0) !== (d > 0) ||
    Math.abs(a) <= 0.001 && pointOnSegment(p3, p1, p2) ||
    Math.abs(b) <= 0.001 && pointOnSegment(p4, p1, p2) ||
    Math.abs(c) <= 0.001 && pointOnSegment(p1, p3, p4) ||
    Math.abs(d) <= 0.001 && pointOnSegment(p2, p3, p4)
  );
}

function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const s = polygon[i]!;
    const r = polygon[j]!;
    if (
      s.z > p.z !== r.z > p.z &&
      p.x < ((r.x - s.x) * (p.z - s.z)) / (r.z - s.z) + s.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Source `O`: does segment a→b cross a filled polygon? */
function segmentHitsPolygon(
  a: Pt,
  b: Pt,
  polygon: Pt[],
  endpointOnEdgeAllowed = false,
): boolean {
  if (polygon.length < 3) return false;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  if (pointInPolygon(mid, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const s = polygon[i]!;
    const r = polygon[(i + 1) % polygon.length]!;
    if (
      segmentsIntersect(a, b, s, r) &&
      !(endpointOnEdgeAllowed && pointOnSegment(b, s, r))
    ) {
      return true;
    }
  }
  return false;
}

/** Source `G`: does the segment cross a major road? */
function crossesBarrier(a: Pt, b: Pt, barriers: Barrier[]): boolean {
  return barriers.some(
    (barrier) =>
      MAJOR_KINDS.has(barrier.kind) &&
      barrier.points.some(
        (p, i) => i > 0 && segmentsIntersect(a, b, barrier.points[i - 1]!, p),
      ),
  );
}

function buildPolygons(surfaces: Pt[][]): Polygon {
  return surfaces.map((points) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return { points, minX, maxX, minZ, maxZ };
  });
}

function bboxNear(
  a: Pt,
  b: Pt,
  poly: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  const loX = Math.min(a.x, b.x);
  const hiX = Math.max(a.x, b.x);
  const loZ = Math.min(a.z, b.z);
  const hiZ = Math.max(a.z, b.z);
  return !(hiX < poly.minX || loX > poly.maxX || hiZ < poly.minZ || loZ > poly.maxZ);
}

/** Source `buildGraph`: walk paths → node/edge graph + largest component. */
export function buildGraph(input: GraphInput): Graph {
  const { paths, barriers, blockedSurfaces, obstacles } = input;

  const nodes: Pt[] = [];
  const keyToIndex = new Map<string, number>();
  const adjacency = new Map<number, Map<number, number>>();
  const keyRoads = new Map<string, Set<string>>();

  for (const [index, path] of paths.entries()) {
    if (!WALKABLE_KINDS.has(path.kind ?? "footway") || path.points.length < 2) {
      continue;
    }
    const id = path.id ?? `road-${index}`;
    for (const p of path.points) {
      const key = nodeKey(p);
      const set = keyRoads.get(key) ?? new Set<string>();
      set.add(id);
      keyRoads.set(key, set);
    }
  }

  const blockedPairKeys = new Set<string>();
  for (const pair of input.blockedPathPairs) {
    for (const [key, roads] of keyRoads) {
      if (roads.has(pair.first) && roads.has(pair.second)) {
        blockedPairKeys.add(`${key}:${pair.first}`);
        blockedPairKeys.add(`${key}:${pair.second}`);
      }
    }
  }

  const nodeIndex = (p: Pt, roadId?: string, segment?: string): number => {
    const nearBlocked =
      input.blockedJunctions.find((j) => distance(p, j) <= 0.15) ?? null;
    const base = nodeKey(p);
    const k =
      nearBlocked && roadId && segment
        ? `${base}:${roadId}:${segment}`
        : roadId && blockedPairKeys.has(`${base}:${roadId}`)
          ? `${base}:${roadId}`
          : base;
    const existing = keyToIndex.get(k);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    keyToIndex.set(k, index);
    nodes.push({ x: p.x, z: p.z });
    adjacency.set(index, new Map<number, number>());
    return index;
  };

  const link = (a: number, b: number, d: number): void => {
    if (a === b || d < 0.25) return;
    const left = adjacency.get(a)!;
    const right = adjacency.get(b)!;
    const existing = left.get(b);
    if (existing === undefined || d < existing) {
      left.set(b, d);
      right.set(a, d);
    }
  };

  for (const [index, path] of paths.entries()) {
    if (!WALKABLE_KINDS.has(path.kind ?? "footway") || path.points.length < 2) {
      continue;
    }
    const id = path.id ?? `road-${index}`;
    const last = path.points.length - 1;
    nodeIndex(path.points[0]!, id, "segment-0");
    nodeIndex(path.points[last]!, id, `segment-${Math.max(0, last - 1)}`);
    for (let i = 1; i < path.points.length; i++) {
      const from = path.points[i - 1]!;
      const to = path.points[i]!;
      const segment = `segment-${i - 1}`;
      link(nodeIndex(from, id, segment), nodeIndex(to, id, segment), distance(from, to));
    }
  }

  const edges: GraphEdge[][] = nodes.map((_node, i) =>
    [...(adjacency.get(i) ?? new Map<number, number>())].map(([to, d]) => ({
      to,
      distance: d,
    })),
  );

  // Largest connected component.
  const seen = new Set<number>();
  let mainComponent = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    if (seen.has(i)) continue;
    const component = new Set<number>([i]);
    const queue = [i];
    seen.add(i);
    for (const index of queue) {
      for (const edge of edges[index]!) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          component.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    if (component.size > mainComponent.size) mainComponent = component;
  }

  void barriers;

  return {
    nodes,
    edges,
    mainComponent,
    obstacles: buildPolygons(obstacles),
    blockedSurfaces: buildPolygons(blockedSurfaces),
    barriers,
  };
}

/** Project a point onto a segment (source `F`'s inner helper). */
function projectOnSegment(p: Pt, a: Pt, b: Pt): { point: Pt; ratio: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return { point: { ...a }, ratio: 0 };
  const ratio = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return { point: { x: a.x + dx * ratio, z: a.z + dz * ratio }, ratio };
}

export type SnapResult = { id: number; distance: number };

/** Source `F`: nearest graph nodes reachable from a point. */
export function snapToGraph(
  graph: Graph,
  point: Pt,
  allowBuildingExit = false,
): SnapResult[] {
  const candidates: {
    from: number;
    to: number;
    length: number;
    ratio: number;
    accessDistance: number;
  }[] = [];
  let best = Infinity;

  for (const from of graph.mainComponent) {
    for (const edge of graph.edges[from]!) {
      if (from >= edge.to || !graph.mainComponent.has(edge.to)) continue;
      const nodeA = graph.nodes[from]!;
      const nodeB = graph.nodes[edge.to]!;
      const projection = projectOnSegment(point, nodeA, nodeB);
      const access = distance(point, projection.point);
      if (access > 2.5) continue;
      if (crossesBarrier(point, projection.point, graph.barriers)) continue;
      if (
        graph.blockedSurfaces.some(
          (poly) => bboxNear(point, projection.point, poly) &&
            segmentHitsPolygon(point, projection.point, poly.points),
        )
      ) {
        continue;
      }
      if (
        !allowBuildingExit &&
        graph.obstacles.some(
          (poly) => bboxNear(point, projection.point, poly) &&
            segmentHitsPolygon(point, projection.point, poly.points, true),
        )
      ) {
        continue;
      }
      if (access + 0.05 < best) {
        best = access;
        candidates.length = 0;
      }
      if (access <= best + 0.05) {
        candidates.push({
          from,
          to: edge.to,
          length: edge.distance,
          ratio: projection.ratio,
          accessDistance: access,
        });
      }
    }
  }

  const access = new Map<number, number>();
  for (const candidate of candidates) {
    const toStart = candidate.accessDistance + candidate.length * candidate.ratio;
    const toEnd = candidate.accessDistance + candidate.length * (1 - candidate.ratio);
    const prevStart = access.get(candidate.from) ?? Infinity;
    const prevEnd = access.get(candidate.to) ?? Infinity;
    access.set(candidate.from, Math.min(prevStart, toStart));
    access.set(candidate.to, Math.min(prevEnd, toEnd));
  }
  return [...access].map(([id, d]) => ({ id, distance: d }));
}

function dijkstra(graph: Graph, sources: SnapResult[]) {
  const costs = new Array<number>(graph.nodes.length).fill(Infinity);
  const previous = new Array<number>(graph.nodes.length).fill(-1);
  const originAccess = new Array<number>(graph.nodes.length).fill(Infinity);
  const unsettled = new Set<number>();

  for (const source of sources) {
    if (source.distance >= (costs[source.id] ?? Infinity)) continue;
    costs[source.id] = source.distance;
    originAccess[source.id] = source.distance;
    unsettled.add(source.id);
  }

  while (unsettled.size > 0) {
    let current = -1;
    let currentCost = Infinity;
    for (const id of unsettled) {
      if (costs[id]! < currentCost) {
        currentCost = costs[id]!;
        current = id;
      }
    }
    unsettled.delete(current);
    for (const edge of graph.edges[current]!) {
      const next = costs[current]! + edge.distance;
      if (next >= (costs[edge.to] ?? Infinity)) continue;
      costs[edge.to] = next;
      previous[edge.to] = current;
      originAccess[edge.to] = originAccess[current]!;
      unsettled.add(edge.to);
    }
  }

  return { costs, previous, originAccess };
}

function pushPoint(list: Pt[], point: Pt): void {
  const last = list.at(-1);
  if (!last || distance(last, point) > 0.25) list.push(point);
}

export type RouteOptions = {
  allowOriginBuildingExit?: boolean;
  allowDestinationBuildingAccess?: boolean;
};

export type Route = {
  points: Pt[];
  distanceMeters: number;
  walkingSeconds: number;
  originAccessMeters: number;
  destinationAccessMeters: number;
};

/** Source `H`: route from an origin point to the best destination point. */
export function route(
  graph: Graph,
  origin: Pt,
  destinationPoints: Pt[],
  options: RouteOptions = {},
): Route | null {
  const sources = snapToGraph(
    graph,
    origin,
    options.allowOriginBuildingExit,
  );
  if (!sources.length) return null;

  const search = dijkstra(graph, sources);

  const candidates: { id: number; distance: number; point: Pt }[] = [];
  for (const point of destinationPoints) {
    for (const snap of snapToGraph(
      graph,
      point,
      options.allowDestinationBuildingAccess,
    )) {
      candidates.push({ id: snap.id, distance: snap.distance, point });
    }
  }
  if (!candidates.length) return null;

  let chosen: (typeof candidates)[number] & {
    routeDistance: number;
    originAccess: number;
  } | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const cost = search.costs[candidate.id]!;
    if (!Number.isFinite(cost)) continue;
    const total = cost + 1.2 * candidate.distance;
    if (total < bestCost) {
      bestCost = total;
      chosen = {
        ...candidate,
        routeDistance: cost,
        originAccess: search.originAccess[candidate.id]!,
      };
    }
  }
  if (!chosen) return null;

  const path: number[] = [];
  for (let n = chosen.id; n !== -1; n = search.previous[n]!) path.push(n);
  path.reverse();

  const points: Pt[] = [];
  pushPoint(points, origin);
  for (const n of path) pushPoint(points, graph.nodes[n]!);
  pushPoint(points, chosen.point);

  const distanceMeters = chosen.routeDistance + chosen.distance;
  return {
    points,
    distanceMeters,
    walkingSeconds: Math.max(1, Math.round(distanceMeters / 1.25)),
    originAccessMeters: chosen.originAccess,
    destinationAccessMeters: chosen.distance,
  };
}
