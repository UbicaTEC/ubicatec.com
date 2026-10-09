"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  JSX,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* Public contract                                                     */
/* ------------------------------------------------------------------ */

export type Pt = { x: number; z: number };

export type MapBuilding = {
  id: string;
  name: string;
  mapLabel?: string | null;
  code?: string | null;
  category: string;
  levels: number;
  area: number;
  isDirectory: boolean;
  aliases: string[];
  description?: string | null;
  pos: Pt;
  footprint: Pt[];
  holes?: Pt[][] | null;
  parts?: { footprint: Pt[] }[] | null;
  pinOffset?: Pt | null;
  labelOffset?: Pt | null;
};

export type MapEntrance = { id: string; buildingId: string; x: number; z: number };

export type MapEventBuilding = { id: string; count: number; live: boolean };

export type MapRoute = {
  points: Pt[];
  distanceMeters: number;
  walkingSeconds: number;
};

export type MapUserLocation = {
  campus: Pt;
  lat: number;
  lon: number;
  accuracy?: number;
  heading?: number | null;
};

export type MapGeometry = {
  bounds: { width: number; depth: number };
  origin: { lat: number; lon: number };
  parks: { polygon: Pt[] }[];
  pitches: { polygon: Pt[] }[];
  roads: { kind: string; width: number; points: Pt[] }[];
  greenAreas: { id: string; name: string; points: Pt[] }[];
  context: {
    contextBuildings: { id?: string; name?: string; points: Pt[] }[];
    greens: Pt[][];
    pitches: Pt[][];
    concrete: Pt[][];
    construction: Pt[][];
    water: Pt[][];
    roads: { kind: string; points: Pt[] }[];
  } | null;
};

export type CampusMapProps = {
  focusedId?: string | null;
  buildings?: MapBuilding[];
  onSelect?: (id: string) => void;
  entrances?: MapEntrance[];
  labels?: boolean;
  userLocation?: MapUserLocation | null;
  locationAdjustmentMode?: boolean;
  onLocationAdjust?: (p: Pt) => void;
  panZoomToId?: string | null;
  panZoomToLocation?: Pt | null;
  panZoomToLocationSignal?: number;
  resetSignal?: number;
  routeFocusSignal?: number;
  eventBuildings?: MapEventBuilding[];
  onMarkerSelect?: (id: string) => void;
  route?: MapRoute | null;
  navigationMode?: boolean;
  mobileAttributionBelowCard?: boolean;
  className?: string;
  geometry: MapGeometry;
};

/* ------------------------------------------------------------------ */
/* Palette / static data                                               */
/* ------------------------------------------------------------------ */

const GREEN_FILL = "#cce0c5";
const BUILDING_STROKE = "#c0b9a6";
const FOCUS_FILL = "#1c4e89";
const FOCUS_STROKE = "#0e2f5c";

const PIN_COLORS: Record<string, string> = {
  academic: "#8a5a3a",
  library: "#b65555",
  sports: "#4a8a5b",
  dining: "#d97a35",
  services: "#6a7a8a",
};

const HIGHLIGHT_BUILDING_IDS = new Set(["cdb1", "cdb2"]);

const ZERO_OFFSET: Pt = { x: 0, z: 0 };

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** Buildings flagged for multi-select in the source (the prop is not exposed here). */
const SELECTED_IDS = new Set<string>();

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** `M x z L x z … Z` path for a polygon translated by `offset`. */
function polygonPath(points: Pt[], offset: Pt): string {
  if (points.length === 0) return "";
  const body = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(offset.x + p.x).toFixed(1)} ${(
          offset.z + p.z
        ).toFixed(1)}`,
    )
    .join(" ");
  return `${body} Z`;
}

/** `x,z x,z …` point list for `<polygon points>` attributes. */
function polygonPoints(points: Pt[]): string {
  return points
    .map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    .join(" ");
}

/** `M x z L x z …` polyline path. */
function linePath(points: Pt[]): string {
  return points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.z.toFixed(1)}`,
    )
    .join(" ");
}

function contextRoadWidth(kind: string): number {
  if (kind === "primary" || kind === "secondary" || kind === "trunk") return 8;
  if (kind === "tertiary" || kind === "residential") return 5;
  if (kind === "service" || kind === "unclassified") return 3.5;
  return 2;
}

/* ------------------------------------------------------------------ */
/* Inline lucide-style icons (no lucide-react dependency)              */
/* ------------------------------------------------------------------ */

type LucideIconProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

type LucideComponent = (props: LucideIconProps) => ReactElement;

function LucideSvg({
  name,
  children,
  x,
  y,
  width,
  height,
  color = "currentColor",
  strokeWidth = 2,
  className,
  "aria-hidden": ariaHidden = true,
}: LucideIconProps & { name: string; children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      x={x}
      y={y}
      width={width ?? 24}
      height={height ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["lucide", `lucide-${name}`, className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={ariaHidden}
    >
      {children}
    </svg>
  );
}

function GraduationCapIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="graduation-cap" {...props}>
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </LucideSvg>
  );
}

function BookOpenIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="book-open" {...props}>
      <path d="M12 5v16" />
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
    </LucideSvg>
  );
}

function HeartPulseIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="heart-pulse" {...props}>
      <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
      <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </LucideSvg>
  );
}

function UtensilsIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="utensils" {...props}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </LucideSvg>
  );
}

function MapPinIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="map-pin" {...props}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </LucideSvg>
  );
}

function MinusIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="minus" {...props}>
      <path d="M5 12h14" />
    </LucideSvg>
  );
}

function PlusIcon(props: LucideIconProps) {
  return (
    <LucideSvg name="plus" {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </LucideSvg>
  );
}

const CATEGORY_ICONS: Record<string, LucideComponent> = {
  academic: GraduationCapIcon,
  library: BookOpenIcon,
  sports: HeartPulseIcon,
  dining: UtensilsIcon,
  services: MapPinIcon,
};

/* ------------------------------------------------------------------ */
/* Label level-of-detail stylesheet (verbatim from the source bundle)  */
/* ------------------------------------------------------------------ */

const LABEL_CSS = `
            .labels .lbl .dot { opacity: 1; transition: opacity 240ms ease; }
            .labels .lbl .full {
              opacity: 0;
              transform: scale(0.4);
              transform-box: fill-box;
              transform-origin: center;
              transition: opacity 240ms ease, transform 240ms ease;
            }
            .labels .lbl .name { opacity: 0; transition: opacity 240ms ease; }
            /* Usa una rasterización más ligera durante el gesto sin quitar
               etiquetas, caminos ni ningún elemento visible del mapa. */
            svg[data-panning="true"] {
              shape-rendering: optimizeSpeed;
            }

            /* Mostrar full + name cuando data-tier del svg padre >= rank.
               Cobertura completa de combinaciones tier × rank: */
            svg[data-tier="1"] .lbl[data-rank="0"] .full,
            svg[data-tier="1"] .lbl[data-rank="1"] .full,
            svg[data-tier="2"] .lbl[data-rank="0"] .full,
            svg[data-tier="2"] .lbl[data-rank="1"] .full,
            svg[data-tier="2"] .lbl[data-rank="2"] .full,
            svg[data-tier="3"] .lbl[data-rank="0"] .full,
            svg[data-tier="3"] .lbl[data-rank="1"] .full,
            svg[data-tier="3"] .lbl[data-rank="2"] .full,
            svg[data-tier="3"] .lbl[data-rank="3"] .full,
            svg[data-tier="3"] .lbl[data-rank="4"] .full,
            .lbl[data-focused="true"] .full {
              opacity: 1;
              transform: scale(1);
            }
            svg[data-tier="1"] .lbl[data-rank="0"] .name,
            svg[data-tier="1"] .lbl[data-rank="1"] .name,
            svg[data-tier="2"] .lbl[data-rank="0"] .name,
            svg[data-tier="2"] .lbl[data-rank="1"] .name,
            svg[data-tier="2"] .lbl[data-rank="2"] .name,
            svg[data-tier="3"] .lbl[data-rank="0"] .name,
            svg[data-tier="3"] .lbl[data-rank="1"] .name,
            svg[data-tier="3"] .lbl[data-rank="2"] .name,
            svg[data-tier="3"] .lbl[data-rank="3"] .name,
            svg[data-tier="3"] .lbl[data-rank="4"] .name,
            .lbl[data-focused="true"] .name {
              opacity: 1;
            }
            /* Ocultar dot cuando se muestra el full */
            svg[data-tier="1"] .lbl[data-rank="0"] .dot,
            svg[data-tier="1"] .lbl[data-rank="1"] .dot,
            svg[data-tier="2"] .lbl[data-rank="0"] .dot,
            svg[data-tier="2"] .lbl[data-rank="1"] .dot,
            svg[data-tier="2"] .lbl[data-rank="2"] .dot,
            svg[data-tier="3"] .lbl[data-rank="0"] .dot,
            svg[data-tier="3"] .lbl[data-rank="1"] .dot,
            svg[data-tier="3"] .lbl[data-rank="2"] .dot,
            svg[data-tier="3"] .lbl[data-rank="3"] .dot,
            svg[data-tier="3"] .lbl[data-rank="4"] .dot,
            .lbl[data-focused="true"] .dot {
              opacity: 0;
            }

            /* En navegación, el rumbo y la ruta importan más que el directorio. */
            svg[data-navigation="true"] .labels .lbl:not([data-focused="true"]) .dot,
            svg[data-navigation="true"] .labels .lbl:not([data-focused="true"]) .full,
            svg[data-navigation="true"] .labels .lbl:not([data-focused="true"]) .name {
              opacity: 0;
            }
          `;

/* ------------------------------------------------------------------ */
/* Internal shapes                                                     */
/* ------------------------------------------------------------------ */

type DragState = {
  startCx: number;
  startCy: number;
  worldPerPixel: number;
  sx: number;
  sy: number;
  pointerId: number;
  moved: boolean;
  captured: boolean;
};

type PinchState = {
  firstId: number;
  secondId: number;
  initialDistance: number;
  initialScale: number;
  anchor: Pt;
  rect: DOMRect;
};

type RoadLayer = {
  d: string;
  w: number;
  isPath: boolean;
  isMajor: boolean;
};

type BuildingPaths = {
  id: string;
  d: string;
  holes: string[];
  parts: { d: string; levels?: number; height?: number }[];
};

/** Building parts carry only `footprint` in the DTO; `levels`/`height` are optional extras. */
type BuildingPartSource = { footprint: Pt[]; levels?: number; height?: number };

/** OSM context buildings may carry `part`/`levels` for fill selection. */
type ContextBuildingSource = {
  id?: string;
  name?: string;
  points: Pt[];
  part?: boolean;
  levels?: number;
};

type ContextLayers = {
  contextBuildings: { d: string; part?: boolean; levels?: number }[];
  greens: string[];
  pitches: string[];
  concrete: string[];
  construction: string[];
  water: string[];
  roads: RoadLayer[];
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CampusMapFlat({
  focusedId,
  buildings = [],
  onSelect,
  entrances = [],
  labels = true,
  userLocation,
  locationAdjustmentMode = false,
  onLocationAdjust,
  panZoomToId,
  panZoomToLocation,
  panZoomToLocationSignal,
  resetSignal,
  eventBuildings,
  onMarkerSelect,
  route,
  routeFocusSignal,
  navigationMode = false,
  mobileAttributionBelowCard = false,
  className,
  geometry,
}: CampusMapProps): JSX.Element {
  const worldWidth = geometry.bounds.width + 200;
  const worldHeight = geometry.bounds.depth + 200;

  const view = useMemo(
    () => ({
      x: -worldWidth / 2,
      y: -worldHeight / 2,
      w: worldWidth,
      h: worldHeight,
    }),
    [worldWidth, worldHeight],
  );

  const panX = useRef(0);
  const panY = useRef(0);
  const zoom = useRef(2.2);
  const tier = useRef(1);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const touchPointsRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const pinchRef = useRef<PinchState | null>(null);
  const pinchActiveRef = useRef(false);
  const viewFrameRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastLocationSignalRef = useRef<number | null>(null);
  const lastRouteSignalRef = useRef<number | null>(null);

  const selectedIds = useMemo(() => SELECTED_IDS, []);

  const navHeading = useMemo(() => {
    if (!navigationMode || !route || route.points.length < 2) return null;
    const origin = route.points[0];
    if (!origin) return null;
    const second =
      route.points.find((p) => distance(p, origin) > 3) ?? route.points[1];
    if (!second) return null;
    const heading =
      (180 * Math.atan2(second.z - origin.z, second.x - origin.x)) / Math.PI;
    return { origin, heading, rotation: -90 - heading };
  }, [navigationMode, route]);

  const initialViewBox = useMemo(() => {
    const w = view.w / 2.2;
    const h = view.h / 2.2;
    return `${-w / 2} ${-h / 2} ${w} ${h}`;
  }, [view.w, view.h]);

  const clampPan = useCallback(() => {
    const viewW = view.w / zoom.current;
    const viewH = view.h / zoom.current;
    const limitX = 0.55 * view.w - viewW / 2;
    const limitY = 0.55 * view.h - viewH / 2;
    if (limitX <= 0) panX.current = 0;
    else panX.current = Math.max(-limitX, Math.min(limitX, panX.current));
    if (limitY <= 0) panY.current = 0;
    else panY.current = Math.max(-limitY, Math.min(limitY, panY.current));
  }, [view.w, view.h]);

  const applyView = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    clampPan();
    const nextZoom = zoom.current;
    const w = view.w / nextZoom;
    const h = view.h / nextZoom;
    const x = panX.current - w / 2;
    const y = panY.current - h / 2;
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    const nextTier = nextZoom >= 5 ? 3 : nextZoom >= 3.5 ? 2 : Number(nextZoom >= 2);
    if (nextTier !== tier.current) {
      tier.current = nextTier;
      svg.setAttribute("data-tier", String(nextTier));
    }
  }, [clampPan, view.w, view.h]);

  const scheduleApply = useCallback(() => {
    viewFrameRef.current ??= requestAnimationFrame(() => {
      viewFrameRef.current = null;
      applyView();
    });
  }, [applyView]);

  const cancelAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const animateTo = useCallback(
    (targetX: number, targetY: number, targetZoom: number, duration = 260) => {
      cancelAnimation();
      const fromX = panX.current;
      const fromY = panY.current;
      const fromZoom = zoom.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) ** 3;
        panX.current = fromX + (targetX - fromX) * eased;
        panY.current = fromY + (targetY - fromY) * eased;
        zoom.current = fromZoom + (targetZoom - fromZoom) * eased;
        applyView();
        if (t < 1) animFrameRef.current = requestAnimationFrame(step);
        else animFrameRef.current = null;
      };
      animFrameRef.current = requestAnimationFrame(step);
    },
    [applyView, cancelAnimation],
  );

  useEffect(
    () => () => {
      if (viewFrameRef.current !== null) {
        cancelAnimationFrame(viewFrameRef.current);
      }
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    },
    [],
  );

  const clientToMapPoint = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const mapped = point.matrixTransform(ctm.inverse());
      return { x: mapped.x, z: mapped.y };
    },
    [],
  );

  const roundedMapPoint = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const point = clientToMapPoint(clientX, clientY);
      if (!point) return null;
      return { x: Number(point.x.toFixed(1)), z: Number(point.z.toFixed(1)) };
    },
    [clientToMapPoint],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.pointerType === "touch") {
        const pinch = pinchRef.current;
        touchPointsRef.current.delete(event.pointerId);
        if (
          pinch &&
          (event.pointerId === pinch.firstId ||
            event.pointerId === pinch.secondId)
        ) {
          pinchRef.current = null;
          dragRef.current = null;
          event.currentTarget.removeAttribute("data-panning");
          event.currentTarget.style.cursor = "grab";
          window.setTimeout(() => {
            pinchActiveRef.current = false;
          }, 0);
          return;
        }
      }
      const drag = dragRef.current;
      dragRef.current = null;
      event.currentTarget.removeAttribute("data-panning");
      event.currentTarget.style.cursor = "grab";
      if (drag?.captured) {
        event.currentTarget.releasePointerCapture(drag.pointerId);
      }
      if (locationAdjustmentMode && !drag?.moved) {
        const point = roundedMapPoint(event.clientX, event.clientY);
        if (point) onLocationAdjust?.(point);
      }
    },
    [locationAdjustmentMode, onLocationAdjust, roundedMapPoint],
  );

  const wasDragged = useCallback(
    () => dragRef.current?.moved === true,
    [],
  );

  useEffect(() => {
    if (navigationMode) return;
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimation();
      const rect = svg.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      const viewW = view.w / zoom.current;
      const viewH = view.h / zoom.current;
      const startX = panX.current - viewW / 2;
      const startY = panY.current - viewH / 2;
      const sensitivity = event.ctrlKey ? 0.008 : 0.0025;
      const factor = Math.exp(
        Math.max(-0.12, Math.min(0.12, -event.deltaY * sensitivity)),
      );
      const nextZoom = Math.min(10, Math.max(0.4, zoom.current * factor));
      const nextW = view.w / nextZoom;
      const nextH = view.h / nextZoom;
      zoom.current = nextZoom;
      panX.current = startX + fx * viewW - (fx - 0.5) * nextW;
      panY.current = startY + fy * viewH - (fy - 0.5) * nextH;
      scheduleApply();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [view.w, view.h, cancelAnimation, navigationMode, scheduleApply]);

  const resetToOverview = useCallback(() => {
    animateTo(0, 0, 2.2, 220);
  }, [animateTo]);

  const zoomBy = useCallback(
    (factor: number) => {
      cancelAnimation();
      const nextZoom = Math.min(10, Math.max(0.4, zoom.current * factor));
      animateTo(panX.current, panY.current, nextZoom, 160);
    },
    [animateTo, cancelAnimation],
  );

  useEffect(() => {
    if (resetSignal !== undefined) resetToOverview();
  }, [resetToOverview, resetSignal]);

  useEffect(() => {
    if (!panZoomToId) return;
    const building = buildings.find((b) => b.id === panZoomToId);
    if (!building) return;
    const frame = requestAnimationFrame(() => {
      animateTo(building.pos.x, building.pos.z, 6, 280);
    });
    return () => cancelAnimationFrame(frame);
  }, [panZoomToId, animateTo, buildings]);

  useEffect(() => {
    if (
      !panZoomToLocation ||
      panZoomToLocationSignal == null ||
      lastLocationSignalRef.current === panZoomToLocationSignal
    )
      return;
    lastLocationSignalRef.current = panZoomToLocationSignal;
    const frame = requestAnimationFrame(() => {
      animateTo(panZoomToLocation.x, panZoomToLocation.z, 6, 280);
    });
    return () => cancelAnimationFrame(frame);
  }, [panZoomToLocation, panZoomToLocationSignal, animateTo]);

  useEffect(() => {
    if (
      !route ||
      routeFocusSignal == null ||
      route.points.length < 2 ||
      lastRouteSignalRef.current === routeFocusSignal
    )
      return;
    lastRouteSignalRef.current = routeFocusSignal;

    if (navHeading) {
      let length = 0;
      for (let i = 1; i < route.points.length; i += 1) {
        const prev = route.points[i - 1];
        const curr = route.points[i];
        if (prev && curr) length += distance(prev, curr);
      }
      const targetHeight = Math.max(80, Math.min(155, 0.42 * length));
      const targetZoom = Math.max(4.6, Math.min(8.6, view.h / targetHeight));
      const visibleHeight = view.h / targetZoom;
      const frame = requestAnimationFrame(() => {
        animateTo(
          navHeading.origin.x,
          navHeading.origin.z - 0.27 * visibleHeight,
          targetZoom,
          620,
        );
      });
      return () => cancelAnimationFrame(frame);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of route.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const targetZoom = Math.max(
      1.1,
      Math.min(3.2, view.w / (maxX - minX + 150), view.h / (maxZ - minZ + 150)),
    );
    const frame = requestAnimationFrame(() => {
      animateTo(
        (minX + maxX) / 2,
        (minZ + maxZ) / 2,
        targetZoom,
        520,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [route, routeFocusSignal, animateTo, view.h, view.w, navHeading]);

  const pinOffsets = useMemo(() => {
    const map = new Map<string, Pt>();
    for (const b of buildings) {
      if (b.pinOffset) map.set(b.id, b.pinOffset);
    }
    return map;
  }, [buildings]);

  const pinOffsetFor = useCallback(
    (id: string): Pt => pinOffsets.get(id) ?? ZERO_OFFSET,
    [pinOffsets],
  );

  const parkPolygons = useMemo(
    () => geometry.parks.map((park) => polygonPoints(park.polygon)),
    [geometry.parks],
  );

  const pitchPolygons = useMemo(
    () => geometry.pitches.map((pitch) => polygonPoints(pitch.polygon)),
    [geometry.pitches],
  );

  const campusRoads = useMemo<RoadLayer[]>(
    () =>
      geometry.roads.map((road) => ({
        d: linePath(road.points),
        w: Math.max(road.width, 3),
        isPath:
          road.kind === "footway" ||
          road.kind === "path" ||
          road.kind === "pedestrian",
        isMajor: false,
      })),
    [geometry.roads],
  );

  const routePath = useMemo(
    () => (route ? linePath(route.points) : ""),
    [route],
  );

  const contextLayers = useMemo<ContextLayers | null>(() => {
    const ctx = geometry.context;
    if (!ctx) return null;
    return {
      contextBuildings: (
        ctx.contextBuildings as ContextBuildingSource[]
      ).map((building) => ({ ...building, d: polygonPoints(building.points) })),
      greens: ctx.greens.map(polygonPoints),
      pitches: ctx.pitches.map(polygonPoints),
      concrete: ctx.concrete.map(polygonPoints),
      construction: ctx.construction.map(polygonPoints),
      water: ctx.water.map(polygonPoints),
      roads: ctx.roads.map((road) => ({
        d: linePath(road.points),
        w: contextRoadWidth(road.kind),
        isPath: ["footway", "path", "pedestrian", "cycleway"].includes(
          road.kind,
        ),
        isMajor: ["primary", "secondary", "trunk"].includes(road.kind),
      })),
    };
  }, [geometry.context]);

  const greenPolygons = useMemo(
    () =>
      geometry.greenAreas.map((area) => ({
        id: area.id,
        polygon: polygonPoints(area.points),
      })),
    [geometry.greenAreas],
  );

  const buildingPaths = useMemo<BuildingPaths[]>(
    () =>
      buildings.map((building) => {
        const pos = building.pos;
        const parts = (building.parts ?? []) as BuildingPartSource[];
        return {
          id: building.id,
          d: polygonPath(building.footprint, pos),
          holes: (building.holes ?? []).map((hole) => polygonPath(hole, pos)),
          parts: parts.map((part) => ({
            d: polygonPath(part.footprint, pos),
            levels: part.levels,
            height: part.height,
          })),
        };
      }),
    [buildings],
  );

  const buildingPathsById = useMemo(() => {
    const map = new Map<string, BuildingPaths>();
    for (const entry of buildingPaths) map.set(entry.id, entry);
    return map;
  }, [buildingPaths]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    cancelAnimation();
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchPointsRef.current.size === 2) {
        const entries = Array.from(touchPointsRef.current.entries());
        const first = entries[0];
        const second = entries[1];
        if (first && second) {
          const [firstId, firstPoint] = first;
          const [secondId, secondPoint] = second;
          const mid = midpoint(firstPoint, secondPoint);
          const anchor = clientToMapPoint(mid.x, mid.y);
          if (anchor) {
            pinchRef.current = {
              firstId,
              secondId,
              initialDistance: Math.hypot(
                secondPoint.x - firstPoint.x,
                secondPoint.y - firstPoint.y,
              ),
              initialScale: zoom.current,
              anchor,
              rect: event.currentTarget.getBoundingClientRect(),
            };
            dragRef.current = null;
            pinchActiveRef.current = true;
            event.currentTarget.setAttribute("data-panning", "true");
            event.currentTarget.setPointerCapture(firstId);
            event.currentTarget.setPointerCapture(secondId);
            event.preventDefault();
            return;
          }
        }
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const viewW = view.w / zoom.current;
    const viewH = view.h / zoom.current;
    dragRef.current = {
      startCx: panX.current,
      startCy: panY.current,
      worldPerPixel: Math.max(viewW / rect.width, viewH / rect.height),
      sx: event.clientX,
      sy: event.clientY,
      pointerId: event.pointerId,
      moved: false,
      captured: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const pinch = pinchRef.current;
      if (
        pinch &&
        (event.pointerId === pinch.firstId ||
          event.pointerId === pinch.secondId)
      ) {
        const first = touchPointsRef.current.get(pinch.firstId);
        const second = touchPointsRef.current.get(pinch.secondId);
        if (first && second && pinch.initialDistance > 0) {
          const ratio =
            Math.hypot(second.x - first.x, second.y - first.y) /
            pinch.initialDistance;
          const nextZoom = Math.min(
            10,
            Math.max(0.4, pinch.initialScale * ratio),
          );
          const rect = pinch.rect;
          const mid = midpoint(first, second);
          const fx = Math.max(0, Math.min(1, (mid.x - rect.left) / rect.width));
          const fy = Math.max(0, Math.min(1, (mid.y - rect.top) / rect.height));
          zoom.current = nextZoom;
          const viewW = view.w / nextZoom;
          const viewH = view.h / nextZoom;
          panX.current = pinch.anchor.x - (fx - 0.5) * viewW;
          panY.current = pinch.anchor.z - (fy - 0.5) * viewH;
          event.preventDefault();
          scheduleApply();
          return;
        }
      }
    }
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 3) {
      drag.moved = true;
      event.currentTarget.setAttribute("data-panning", "true");
      event.currentTarget.style.cursor = "grabbing";
      if (!drag.captured) {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.captured = true;
      }
    }
    if (!drag.moved) return;
    event.preventDefault();
    panX.current = drag.startCx - dx * drag.worldPerPixel;
    panY.current = drag.startCy - dy * drag.worldPerPixel;
    scheduleApply();
  };

  const groundRoads = contextLayers?.roads ?? campusRoads;

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <svg
        ref={svgRef}
        viewBox={initialViewBox}
        data-tier={1}
        data-navigation={navigationMode ? "true" : undefined}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          navigationMode
            ? "Vista de navegación del Campus Monterrey"
            : "Vista plana del Campus Monterrey"
        }
        onPointerDown={navigationMode ? undefined : handlePointerDown}
        onPointerMove={navigationMode ? undefined : handlePointerMove}
        onPointerUp={navigationMode ? undefined : handlePointerUp}
        onPointerCancel={navigationMode ? undefined : handlePointerUp}
        onDoubleClick={navigationMode ? undefined : resetToOverview}
        style={{
          width: "100%",
          height: "100%",
          touchAction: navigationMode ? "auto" : "none",
          cursor: navigationMode ? "default" : "grab",
        }}
      >
        <defs>
          <pattern
            id="osm-green-detail"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="0.8" fill="#6f9d68" opacity="0.45" />
          </pattern>
          <pattern
            id="osm-concrete-detail"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="0.5" fill="#9d9789" opacity="0.36" />
            <circle cx="8" cy="4" r="0.4" fill="#9d9789" opacity="0.3" />
            <circle cx="5" cy="10" r="0.45" fill="#9d9789" opacity="0.32" />
          </pattern>
          <pattern
            id="osm-construction-detail"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M-2 2 2-2M0 10 10 0M8 12 12 8"
              stroke="#8d7349"
              strokeWidth="0.6"
              opacity="0.62"
            />
            <path
              d="M-2 8 8-2M0 10 10 0M8 12 12 8"
              transform="scale(-1 1) translate(-10 0)"
              stroke="#8d7349"
              strokeWidth="0.6"
              opacity="0.52"
            />
          </pattern>
        </defs>
        <g
          transform={
            navHeading
              ? `rotate(${navHeading.rotation} ${navHeading.origin.x} ${navHeading.origin.z})`
              : undefined
          }
        >
          {navHeading && (
            <animateTransform
              key={`${navHeading.origin.x}:${navHeading.origin.z}:${navHeading.rotation}`}
              attributeName="transform"
              type="rotate"
              from={`0 ${navHeading.origin.x} ${navHeading.origin.z}`}
              to={`${navHeading.rotation} ${navHeading.origin.x} ${navHeading.origin.z}`}
              dur="520ms"
              fill="freeze"
            />
          )}
          <rect
            x={-(4 * view.w)}
            y={-(4 * view.h)}
            width={9 * view.w}
            height={9 * view.h}
            fill="#ebe5d4"
          />
          <g>
            {contextLayers?.concrete.map((points, index) => (
              <polygon
                key={`concrete-${index}`}
                points={points}
                fill="#d8d4c8"
                stroke="#bdb6a7"
                strokeWidth={0.45}
              />
            ))}
            {contextLayers?.construction.map((points, index) => (
              <polygon
                key={`construction-${index}`}
                points={points}
                fill="#ddd3bd"
                stroke="#96794e"
                strokeWidth={0.65}
              />
            ))}
            {(contextLayers?.greens ?? parkPolygons).map((points, index) => (
              <polygon
                key={`park-${index}`}
                points={points}
                fill={GREEN_FILL}
                stroke="none"
              />
            ))}
            {greenPolygons.map((area) => (
              <polygon
                key={`manual-green-${area.id}`}
                points={area.polygon}
                fill={GREEN_FILL}
                stroke="none"
                pointerEvents="none"
              />
            ))}
            <g className="map-texture" pointerEvents="none">
              {contextLayers?.concrete.map((points, index) => (
                <polygon
                  key={`concrete-detail-${index}`}
                  points={points}
                  fill="url(#osm-concrete-detail)"
                  stroke="none"
                />
              ))}
              {contextLayers?.construction.map((points, index) => (
                <polygon
                  key={`construction-detail-${index}`}
                  points={points}
                  fill="url(#osm-construction-detail)"
                  stroke="none"
                />
              ))}
              {contextLayers?.greens.map((points, index) => (
                <polygon
                  key={`park-detail-${index}`}
                  points={points}
                  fill="url(#osm-green-detail)"
                  stroke="none"
                />
              ))}
              {greenPolygons.map((area) => (
                <polygon
                  key={`manual-green-detail-${area.id}`}
                  points={area.polygon}
                  fill="url(#osm-green-detail)"
                  stroke="none"
                />
              ))}
            </g>
            {(contextLayers?.pitches ?? pitchPolygons).map(
              (points, index) => (
                <polygon
                  key={`pitch-${index}`}
                  points={points}
                  fill="#9fcf98"
                  stroke="#76aa72"
                  strokeWidth={0.45}
                />
              ),
            )}
            {contextLayers?.water.map((points, index) => (
              <polygon
                key={`water-${index}`}
                points={points}
                fill="#9fd0df"
                stroke="#6caabd"
                strokeWidth={0.5}
              />
            ))}
          </g>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {groundRoads.map((road, index) => (
              <path
                key={`road-bg-${index}`}
                className={road.isPath ? "map-path-detail" : undefined}
                d={road.d}
                stroke={
                  road.isPath
                    ? "#c6bca8"
                    : road.isMajor
                      ? "#c7bdab"
                      : "#dcd5c2"
                }
                strokeWidth={road.w + (road.isMajor ? 2 : 1.2)}
                opacity={road.isPath ? 0.85 : 1}
                strokeDasharray={road.isPath ? "2.2 1.7" : undefined}
              />
            ))}
            {groundRoads.map((road, index) =>
              road.isPath ? null : (
                <path
                  key={`road-fg-${index}`}
                  d={road.d}
                  stroke={road.isMajor ? "#fffdf8" : "#fff"}
                  strokeWidth={road.w}
                />
              ),
            )}
          </g>
          {contextLayers && (
            <g className="map-context-detail" pointerEvents="none">
              {contextLayers.contextBuildings.map((building, index) => (
                <path
                  key={`district-${index}`}
                  d={`M${building.d.replaceAll(" ", " L")} Z`}
                  fill={
                    building.part
                      ? "#ddd5c3"
                      : building.levels && building.levels >= 4
                        ? "#e1dac8"
                        : "#eee9dc"
                  }
                  stroke={building.part ? "#bfb49f" : "#d4cbbb"}
                  strokeWidth={building.part ? 0.65 : 0.45}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )}
          <g>
            {buildings.map((building) => {
              const focused = building.id === focusedId;
              const selected = selectedIds.has(building.id);
              const highlight = HIGHLIGHT_BUILDING_IDS.has(building.id);
              const paths = buildingPathsById.get(building.id);
              const select = () => {
                if (
                  locationAdjustmentMode ||
                  pinchActiveRef.current ||
                  wasDragged()
                )
                  return;
                onSelect?.(building.id);
              };
              return (
                <g
                  key={building.id}
                  style={{
                    cursor: onSelect ? "pointer" : undefined,
                    touchAction: "none",
                  }}
                >
                  <path
                    data-building-id={building.id}
                    d={paths?.d ?? ""}
                    fill={
                      highlight
                        ? "#b8d4b0"
                        : focused
                          ? FOCUS_FILL
                          : selected
                            ? "#f0a629"
                            : "#e6e0cf"
                    }
                    stroke={
                      focused
                        ? FOCUS_STROKE
                        : selected
                          ? "#8a4e00"
                          : BUILDING_STROKE
                    }
                    strokeWidth={focused || selected ? 1.4 : 0.6}
                    vectorEffect="non-scaling-stroke"
                    onClick={select}
                  />
                  {paths?.parts.map((part, index) => (
                    <path
                      key={`${building.id}-part-${index}`}
                      data-building-id={building.id}
                      d={part.d}
                      fill={
                        focused
                          ? "#3778bb"
                          : selected
                            ? "#f6bc50"
                            : part.levels && part.levels >= building.levels
                              ? "#d6cdb9"
                              : "#eee7d8"
                      }
                      stroke={
                        focused
                          ? FOCUS_STROKE
                          : selected
                            ? "#8a4e00"
                            : "#b7ad99"
                      }
                      strokeWidth={0.75}
                      vectorEffect="non-scaling-stroke"
                      onClick={select}
                    />
                  ))}
                </g>
              );
            })}
          </g>
          <g pointerEvents="none">
            {buildingPaths.flatMap((entry) =>
              entry.holes.map((hole, index) => (
                <path
                  key={`hole-${entry.id}-${index}`}
                  d={hole}
                  fill="#f5f1e8"
                  stroke={BUILDING_STROKE}
                  strokeWidth={0.6}
                />
              )),
            )}
          </g>
          {routePath && route && (
            <g
              pointerEvents="none"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d={routePath}
                stroke="rgba(22,86,176,0.28)"
                strokeWidth={8}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={routePath}
                stroke="rgba(255,255,255,0.96)"
                strokeWidth={5.4}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={routePath}
                stroke="#2878e8"
                strokeWidth={3.2}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={route.points[0]?.x}
                cy={route.points[0]?.z}
                r={3.3}
                fill="#087e6b"
                stroke="#fff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={route.points.at(-1)?.x}
                cy={route.points.at(-1)?.z}
                r={3.3}
                fill="#2878e8"
                stroke="#fff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          {entrances.length > 0 && (
            <g pointerEvents="none" aria-label="Entradas peatonales">
              {entrances.map((entrance) => (
                <g
                  key={entrance.id}
                  transform={`translate(${entrance.x} ${entrance.z})`}
                >
                  <circle
                    r={3.4}
                    fill="#1c4e89"
                    stroke="#fff"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M-1.2 0H1.2M0-1.2V1.2"
                    stroke="#fff"
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
            </g>
          )}
          {labels && (
            <g pointerEvents="none" className="labels">
              <style>{LABEL_CSS}</style>
              {buildings.map((building) => {
                const focused = building.id === focusedId;
                if (!building.isDirectory && !focused) return null;
                const area = building.area || 0;
                const offset = pinOffsetFor(building.id);
                const x = building.pos.x + offset.x;
                const z = building.pos.z + offset.z;
                const dotRadius = focused
                  ? navigationMode
                    ? 4.1
                    : 6
                  : 4.5;
                const fontSize = focused
                  ? navigationMode
                    ? 3.8
                    : 6.5
                  : 5.5;
                const iconSize = focused
                  ? navigationMode
                    ? 4.8
                    : 6.8
                  : 5.4;
                const color = focused ? FOCUS_FILL : PIN_COLORS[building.category];
                const CategoryIcon =
                  CATEGORY_ICONS[building.category] ?? MapPinIcon;
                return (
                  <g
                    key={`l-${building.id}`}
                    className="lbl"
                    data-rank={
                      area >= 3000
                        ? 0
                        : area >= 1500
                          ? 1
                          : area >= 700
                            ? 2
                            : area >= 250
                              ? 3
                              : 4
                    }
                    data-focused={focused ? "true" : "false"}
                    transform={`translate(${x} ${z})`}
                  >
                    <circle
                      className="dot"
                      cx={0}
                      cy={0}
                      r={1.8}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                    <g className="full">
                      <circle
                        cx={0}
                        cy={0}
                        r={dotRadius}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={navigationMode ? 0.7 : 1.1}
                        vectorEffect="non-scaling-stroke"
                      />
                      <CategoryIcon
                        x={-iconSize / 2}
                        y={-iconSize / 2}
                        width={iconSize}
                        height={iconSize}
                        color="#fff"
                        strokeWidth={2.4}
                        aria-hidden="true"
                      />
                    </g>
                    <text
                      className="name"
                      x={0}
                      y={dotRadius + 1.5}
                      textAnchor="middle"
                      dominantBaseline="hanging"
                      fontSize={fontSize}
                      fontWeight={focused ? 700 : 500}
                      fill="#2a2722"
                      fontFamily="-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif"
                      style={{
                        paintOrder: "stroke fill",
                        stroke: "rgba(245,241,232,0.92)",
                        strokeWidth: navigationMode ? 0.7 : 1.4,
                        strokeLinejoin: "round",
                      }}
                    >
                      {building.mapLabel ?? building.name}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {eventBuildings && eventBuildings.length > 0 && (
            <g className="event-markers">
              {eventBuildings.map((marker) => {
                const building = buildings.find((b) => b.id === marker.id);
                if (!building) return null;
                const offset = pinOffsetFor(building.id);
                const x = building.pos.x + offset.x;
                const y = building.pos.z + offset.z - 12;
                return (
                  <g
                    key={`ev-${marker.id}`}
                    transform={`translate(${x} ${y})`}
                    onClick={(event) => {
                      event.stopPropagation();
                      (onMarkerSelect ?? onSelect)?.(marker.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={-10}
                      y={-10}
                      width={20}
                      height={20}
                      fill="transparent"
                      pointerEvents="all"
                    />
                    {marker.live && (
                      <rect
                        x={-7}
                        y={-7}
                        width={14}
                        height={14}
                        fill="none"
                        stroke={FOCUS_FILL}
                        strokeWidth={0.6}
                        vectorEffect="non-scaling-stroke"
                      >
                        <animate
                          attributeName="opacity"
                          from="1"
                          to="0"
                          dur="1.6s"
                          repeatCount="indefinite"
                        />
                        <animateTransform
                          attributeName="transform"
                          type="scale"
                          from="1"
                          to="2.2"
                          dur="1.6s"
                          repeatCount="indefinite"
                          additive="sum"
                        />
                      </rect>
                    )}
                    <rect
                      x={-5}
                      y={-5}
                      width={10}
                      height={10}
                      fill={FOCUS_FILL}
                      stroke="#fff"
                      strokeWidth={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect x={-1.2} y={-1.2} width={2.4} height={2.4} fill="#fff" />
                    {marker.count > 1 && (
                      <g transform="translate(6 -6)">
                        <rect x={-1} y={-3} width={6} height={4} fill="#111" />
                        <text
                          x={2}
                          y={-0.3}
                          textAnchor="middle"
                          fontSize={3}
                          fontWeight={700}
                          fill="#fff"
                          fontFamily="'JetBrains Mono', monospace"
                        >
                          {marker.count}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {userLocation && (
            <g pointerEvents="none">
              <circle
                cx={userLocation.campus.x}
                cy={userLocation.campus.z}
                r={Math.min(userLocation.accuracy ?? 0, 200)}
                fill="rgba(28,78,137,0.15)"
                stroke="rgba(28,78,137,0.35)"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={userLocation.campus.x}
                cy={userLocation.campus.z}
                r={8}
                fill="rgba(28,78,137,0.25)"
              >
                <animate
                  attributeName="r"
                  from="6"
                  to="14"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.5"
                  to="0"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle
                cx={userLocation.campus.x}
                cy={userLocation.campus.z}
                r={5}
                fill="#1c4e89"
                stroke="#fff"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
              />
              {navHeading && (
                <g
                  transform={`translate(${userLocation.campus.x} ${userLocation.campus.z}) rotate(${navHeading.heading + 90})`}
                >
                  <path
                    d="M0 -8 5 6 0 3 -5 6 Z"
                    fill="#2878e8"
                    stroke="#fff"
                    strokeWidth="1.4"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
            </g>
          )}
        </g>
      </svg>
      {!navigationMode && (
        <div className="absolute right-3 top-[160px] z-10 flex flex-col border border-tinta bg-base shadow-[3px_3px_0_var(--tinta)] lg:hidden">
          <button
            type="button"
            onClick={() => zoomBy(1.35)}
            aria-label="Acercar mapa"
            title="Acercar"
            className="grid size-10 place-items-center border-b border-tinta text-tinta hover:bg-tinta hover:text-base"
          >
            <PlusIcon aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.35)}
            aria-label="Alejar mapa"
            title="Alejar"
            className="grid size-10 place-items-center text-tinta hover:bg-tinta hover:text-base"
          >
            <MinusIcon aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
      {contextLayers && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className={`absolute left-3 z-[1] bg-white/85 px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.04em] text-[#4f4a41] transition-[top] duration-200 lg:bottom-2 lg:left-auto lg:right-2 lg:top-auto ${mobileAttributionBelowCard ? "top-[156px]" : "top-[104px]"}`}
        >
          {OSM_ATTRIBUTION}
        </a>
      )}
    </div>
  );
}
