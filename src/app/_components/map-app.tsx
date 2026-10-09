"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CalendarDays,
  Check,
  Flag,
  Footprints,
  LocateFixed,
  MapPin,
  MousePointer2,
  Navigation,
  Route,
  X,
} from "lucide-react";

import {
  EventList,
  FoodChillList,
  MapLoading,
  MobileNav,
  MobileSheet,
  RailButton,
} from "~/components/shell/panels";
import { DetailModal } from "~/components/shell/detail";
import { Input } from "~/components/ui/input";
import { Mark } from "~/components/ui/mark";
import { EI } from "~/lib/literals";
import {
  codeOf,
  formatClock,
  isEventLive,
  matchesBuildingQuery,
  makeProjection,
  minutesCeil,
  resolveBuildingRef,
} from "~/lib/campus";
import { buildGraph, type Graph, type Pt } from "~/lib/routing";
import { routeToBuilding } from "~/lib/navigation";
import { api } from "~/trpc/react";
import type { BuildingDto, EventDto } from "~/server/api/routers/campus";

const CampusMapFlat = dynamic(
  () => import("~/components/map/CampusMap"),
  { ssr: false, loading: () => <MapLoading /> },
);

const WALKABLE_KINDS = new Set(["footway", "pedestrian", "path", "steps"]);

type Location = {
  campus: Pt;
  accuracy: number;
  lat: number;
  lon: number;
  timestamp: number;
};

type Smoothed = { campus: Pt; timestamp: number };

function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const s = polygon[i]!;
    const r = polygon[j]!;
    if (
      s.z > point.z !== r.z > point.z &&
      point.x < ((r.x - s.x) * (point.z - s.z)) / (r.z - s.z) + s.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Project a point onto a segment. */
function projectOnto(point: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return { x: a.x, z: a.z };
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2),
  );
  return { x: a.x + dx * t, z: a.z + dz * t };
}

/**
 * Snap a GPS fix onto the campus walkable network (source: the helper used by
 * the location effect — inside building → its entrance, else nearest
 * entrance/path within a tolerance derived from the GPS accuracy).
 */
function snapCampusPoint(
  point: Pt,
  accuracy: number,
  buildings: BuildingDto[],
  entrances: { buildingId: string; x: number; z: number }[],
  walkPaths: { kind?: string; points: Pt[] }[],
): { point: Pt; kind: "inside-building" | "entrance" | "path" | "raw" } {
  const containing = buildings.find((building) =>
    [building.footprint, ...(building.parts ?? []).map((p) => p.footprint)].some(
      (footprint) =>
        footprint.length >= 3 &&
        pointInPolygon(
          point,
          footprint.map((p) => ({
            x: building.pos.x + p.x,
            z: building.pos.z + p.z,
          })),
        ),
    ),
  );
  if (containing) {
    const own = entrances.filter((e) => e.buildingId === containing.id);
    if (own.length > 0) {
      const nearest = own.reduce((best, entrance) =>
        Math.hypot(point.x - entrance.x, point.z - entrance.z) <
        Math.hypot(point.x - best.x, point.z - best.z)
          ? entrance
          : best,
      );
      return {
        point: { x: nearest.x, z: nearest.z },
        kind: "inside-building",
      };
    }
  }

  const candidates: { point: Pt; distance: number; kind: "entrance" | "path" }[] =
    [];
  for (const entrance of entrances) {
    candidates.push({
      point: { x: entrance.x, z: entrance.z },
      distance: Math.hypot(point.x - entrance.x, point.z - entrance.z),
      kind: "entrance",
    });
  }
  for (const path of walkPaths) {
    if (!path.kind || !WALKABLE_KINDS.has(path.kind)) continue;
    for (let i = 1; i < path.points.length; i++) {
      const projected = projectOnto(point, path.points[i - 1]!, path.points[i]!);
      candidates.push({
        point: projected,
        distance: Math.hypot(point.x - projected.x, point.z - projected.z),
        kind: "path",
      });
    }
  }
  const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
  const tolerance = Math.min(20, Math.max(8, 0.5 * accuracy));
  if (!nearest || nearest.distance > tolerance) {
    return { point, kind: "raw" };
  }
  return { point: nearest.point, kind: nearest.kind };
}

function useGeolocation() {
  const [status, setStatus] = useState<
    "idle" | "prompting" | "tracking" | "denied" | "unavailable" | "error"
  >("idle");
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<Location | null>(null);
  const watchRef = useRef<number | null>(null);
  const project = useMemo(
    () => makeProjection({ lat: 25.6515, lon: -100.2895 }),
    [],
  );

  const stop = useCallback(() => {
    if (watchRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setLocation(null);
    lastRef.current = null;
    setError(null);
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("El navegador no soporta geolocalización.");
      return;
    }
    if (watchRef.current !== null) return;
    setStatus("prompting");
    setError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const next: Location = {
          campus: project(latitude, longitude),
          accuracy: accuracy ?? 30,
          lat: latitude,
          lon: longitude,
          timestamp: position.timestamp,
        };
        lastRef.current = next;
        setLocation(next);
        setStatus("tracking");
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocation(null);
          lastRef.current = null;
          setStatus("denied");
          setError("Permiso de ubicación denegado.");
          if (watchRef.current !== null) {
            navigator.geolocation.clearWatch(watchRef.current);
            watchRef.current = null;
          }
          return;
        }
        if (lastRef.current) {
          setLocation(lastRef.current);
          setStatus("tracking");
          setError(
            geoError.code === geoError.TIMEOUT
              ? "GPS temporalmente sin actualizar."
              : "GPS temporalmente sin señal.",
          );
          return;
        }
        if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setStatus("unavailable");
          setError("No se pudo obtener la ubicación (sin GPS o fuera de cobertura).");
        } else if (geoError.code === geoError.TIMEOUT) {
          setStatus("error");
          setError("Tiempo agotado esperando la ubicación.");
        } else {
          setStatus("error");
          setError(geoError.message || "Error desconocido.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 30_000,
      },
    );
  }, [project]);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  return { status, location, error, start, stop };
}

export default function MapApp() {
  const [data] = api.campus.bootstrap.useSuspenseQuery();

  const buildings = data.buildings;
  const entrances = data.entrances;
  const categoryMeta = data.categoryMeta;
  const geometry = data.geometry;

  // ---------------------------------------------------------------- state
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [panZoomToId, setPanZoomToId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState(1);

  const [filter, setFilter] = useState("todos");
  const [panelMode, setPanelMode] = useState<"places" | "food" | "chill">(
    "places",
  );
  const [eventsOpen, setEventsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("lugares");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [showEventsOnMap, setShowEventsOnMap] = useState(false);
  const [eventPreviewId, setEventPreviewId] = useState<string | null>(null);

  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
  const [navigationTargetId, setNavigationTargetId] = useState<string | null>(
    null,
  );
  const [routeConfirmSignal, setRouteConfirmSignal] = useState(0);
  const [routeFocusSignal, setRouteFocusSignal] = useState(0);
  const [locationSignal, setLocationSignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  const [manualLocation, setManualLocation] = useState<Smoothed | null>(null);
  const [adjustMode, setAdjustMode] = useState(false);
  const [smoothed, setSmoothed] = useState<Smoothed | null>(null);

  const routeConfirmRef = useRef(0);
  const routeTargetRef = useRef<string | null>(null);
  const wantsLocationRef = useRef(false);

  const { status, location: rawLocation, error: locationError, start, stop } =
    useGeolocation();

  const mountedAt = useMemo(() => Date.now(), []);

  // ------------------------------------------------------------ URL `?b=`
  useEffect(() => {
    const run = () => {
      const param = new URLSearchParams(window.location.search).get("b");
      const building = param ? resolveBuildingRef(buildings, param) : undefined;
      if (building) {
        setFocusedId(building.id);
        setPanZoomToId(building.id);
      }
    };
    void queueMicrotask(run);
  }, [buildings]);

  useEffect(() => {
    void queueMicrotask(() => setActiveLevel(1));
  }, [focusedId]);

  // ------------------------------------------------------------- location
  /** Raw fix, but only when it is within 1.5 km of the campus origin. */
  const location = useMemo<Location | null>(() => {
    if (!rawLocation) return null;
    const point = makeProjection(geometry.origin)(
      rawLocation.lat,
      rawLocation.lon,
    );
    return Math.hypot(point.x, point.z) <= 1500 ? rawLocation : null;
  }, [rawLocation, geometry.origin]);

  const walkPaths = useMemo(
    () =>
      (geometry.walkGraph?.paths ?? []).map((path) => ({
        ...path,
        kind: "footway",
      })),
    [geometry.walkGraph],
  );

  // Smooth (and snap) the GPS fix onto the walkable network.
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    const snapped = snapCampusPoint(
      location.campus,
      location.accuracy,
      buildings,
      entrances,
      walkPaths,
    );
    const fix: Smoothed = { campus: snapped.point, timestamp: location.timestamp };
    void queueMicrotask(() => {
      if (cancelled) return;
      setSmoothed((previous) => {
        if (!previous || snapped.kind === "inside-building") return fix;
        const seconds = Math.max(
          1,
          (location.timestamp - previous.timestamp) / 1000,
        );
        const jump = Math.hypot(
          fix.campus.x - previous.campus.x,
          fix.campus.z - previous.campus.z,
        );
        if (jump > Math.max(15, 1.5 * location.accuracy, 2.8 * seconds)) {
          return previous;
        }
        const factor =
          location.accuracy <= 10
            ? 0.68
            : location.accuracy <= 25
              ? 0.45
              : 0.28;
        return {
          campus: {
            x: previous.campus.x + (fix.campus.x - previous.campus.x) * factor,
            z: previous.campus.z + (fix.campus.z - previous.campus.z) * factor,
          },
          timestamp: location.timestamp,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [location, buildings, entrances, walkPaths]);

  /** The location everything else consumes: manual pin wins over GPS. */
  const effectiveLocation = useMemo<Location | null>(() => {
    if (manualLocation) {
      const origin = geometry.origin;
      const E = 111320 * Math.cos((origin.lat * Math.PI) / 180);
      const lat = origin.lat - manualLocation.campus.z / 111320;
      const lon = origin.lon + manualLocation.campus.x / E;
      return {
        ...(rawLocation ?? { lat, lon, timestamp: manualLocation.timestamp }),
        campus: manualLocation.campus,
        accuracy: 3,
      };
    }
    if (!rawLocation) return null;
    return smoothed ? { ...rawLocation, campus: smoothed.campus } : rawLocation;
  }, [manualLocation, rawLocation, smoothed, geometry.origin]);

  const outsideCampus =
    status === "tracking" && !!rawLocation && !location && !manualLocation;

  const locationNotice: {
    title: string;
    body: string;
    tone: "info" | "warning" | "error";
  } | null =
    effectiveLocation || adjustMode
      ? null
      : status === "prompting"
        ? {
            title: "Buscando GPS",
            body: "Acepta el permiso del navegador para mostrar tu punto en el mapa.",
            tone: "info",
          }
        : outsideCampus
          ? {
              title: "Fuera del campus",
              body: "Tu ubicación está activa, pero queda fuera del rango útil del mapa.",
              tone: "warning",
            }
          : status === "denied" ||
              status === "unavailable" ||
              status === "error"
            ? {
                title: "GPS no disponible",
                body: locationError ?? "No se pudo leer tu ubicación.",
                tone: "error",
              }
            : null;

  // ------------------------------------------------------------- routing
  const obstacles = useMemo(() => geometry.obstacles ?? [], [geometry.obstacles]);

  const graph = useMemo<Graph | null>(() => {
    const context = geometry.context;
    if (!context || !Array.isArray(context.roads)) return null;
    return buildGraph({
      paths: walkPaths,
      barriers: context.roads,
      blockedSurfaces: [
        ...(context.greens ?? []),
        ...(context.water ?? []),
        ...(context.construction ?? []),
      ],
      obstacles,
      blockedJunctions: geometry.walkGraph?.blockedJunctions ?? [],
      blockedPathPairs: geometry.walkGraph?.blockedPathPairs ?? [],
    });
  }, [geometry.context, geometry.walkGraph, walkPaths, obstacles]);

  const routeTarget = routeTargetId
    ? (buildings.find((b) => b.id === routeTargetId) ?? null)
    : null;
  const navigationTarget = navigationTargetId
    ? (buildings.find((b) => b.id === navigationTargetId) ?? null)
    : null;
  const destination = navigationTarget ?? routeTarget;

  const route = useMemo(
    () =>
      routeToBuilding(
        graph,
        effectiveLocation ? effectiveLocation.campus : null,
        destination,
        entrances,
      ),
    [graph, effectiveLocation, destination, entrances],
  );

  const activeRoute = navigationTarget ? route : null;

  // Recenter the route once it is confirmed / the target changes.
  useEffect(() => {
    if (activeRoute && routeConfirmRef.current !== routeConfirmSignal) {
      routeConfirmRef.current = routeConfirmSignal;
      void queueMicrotask(() => setRouteFocusSignal((s) => s + 1));
    }
  }, [routeConfirmSignal, activeRoute]);

  useEffect(() => {
    if (!routeTarget || !route) {
      routeTargetRef.current = null;
      return;
    }
    if (routeTargetRef.current !== routeTarget.id) {
      routeTargetRef.current = routeTarget.id;
      void queueMicrotask(() => setRouteFocusSignal((s) => s + 1));
    }
  }, [route, routeTarget]);

  // ---------------------------------------------------------- derived data
  const resolvedEvents = useMemo<EventDto[]>(
    () => data.events.filter((event) => !!event.buildingId),
    [data.events],
  );

  const focusedBuilding = focusedId
    ? (buildings.find((b) => b.id === focusedId) ?? null)
    : null;
  const categoryLabel = focusedBuilding
    ? (categoryMeta[focusedBuilding.category]?.label ?? "")
    : "";

  const filteredBuildings = useMemo(() => {
    const search = query.trim().toLowerCase();
    return buildings.filter(
      (building) =>
        building.isDirectory &&
        (filter === "todos" || building.category === filter) &&
        (!search || matchesBuildingQuery(building, search)),
    );
  }, [buildings, filter, query]);

  const eventMarkers = useMemo(() => {
    if (!showEventsOnMap) return [];
    const groups = new Map<string, { id: string; count: number; live: boolean }>();
    for (const event of resolvedEvents) {
      const id = event.buildingId!;
      const group = groups.get(id) ?? { id, count: 0, live: false };
      group.count += 1;
      group.live = group.live || isEventLive(event, mountedAt);
      groups.set(id, group);
    }
    return [...groups.values()];
  }, [showEventsOnMap, resolvedEvents, mountedAt]);

  const totalDirectoryBuildings = useMemo(
    () => buildings.filter((b) => b.isDirectory).length,
    [buildings],
  );

  // ------------------------------------------------------------- handlers
  const selectBuilding = useCallback(
    (buildingRef: string, options?: { eventPreview?: boolean }) => {
      const building = resolveBuildingRef(buildings, buildingRef);
      const id = building?.id ?? buildingRef;
      if (id !== focusedId) {
        routeConfirmRef.current = 0;
        routeTargetRef.current = null;
        setRouteTargetId(null);
        setNavigationTargetId(null);
      }
      setFocusedId(id);
      setEventPreviewId(options?.eventPreview ? id : null);
      setPanZoomToId(null);
      window.requestAnimationFrame(() => setPanZoomToId(id));
    },
    [buildings, focusedId],
  );

  const openPanel = useCallback(
    (
      mode: "places" | "food" | "chill",
      events: boolean,
    ) => {
      setEventsOpen(events);
      setPanelMode(mode);
      setPanelOpen(true);
    },
    [],
  );

  const handleDirections = useCallback(() => {
    if (!focusedBuilding) return;
    setModalOpen(false);
    setEventPreviewId(null);
    setNavigationTargetId(null);
    setRouteTargetId(focusedBuilding.id);
    if (!effectiveLocation) start();
  }, [focusedBuilding, effectiveLocation, start]);

  const handleConfirmRoute = useCallback(() => {
    if (!routeTarget || !route) return;
    setNavigationTargetId(routeTarget.id);
    setRouteTargetId(null);
    setRouteConfirmSignal((value) => value + 1);
  }, [route, routeTarget]);

  const handleCancelRoute = useCallback(() => {
    routeConfirmRef.current = 0;
    routeTargetRef.current = null;
    setModalOpen(false);
    setNavigationTargetId(null);
    setRouteTargetId(null);
  }, []);

  const handleRecentreRoute = useCallback(() => {
    if (activeRoute) setRouteFocusSignal((value) => value + 1);
  }, [activeRoute]);

  const handleReport = useCallback(() => {
    const target = focusedBuilding ?? destination;
    const subject = target
      ? `Corrección del mapa: ${target.name}`
      : "Corrección del mapa de UbicaTec";
    const body = [
      "Hola, quiero reportar una corrección del mapa.\n",
      target
        ? `Lugar relacionado: ${target.name} (${codeOf(target)})`
        : "Lugar relacionado: no seleccionado",
      "\nTipo de corrección: ruta / edificio / pin / información / otro\nDetalle:",
    ].join("\n");
    window.location.href = `mailto:contacto@ubicatec.mx?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }, [destination, focusedBuilding]);

  const handleLocationToggle = useCallback(() => {
    setFocusedId(null);
    setEventPreviewId(null);
    setPanZoomToId(null);
    if (status === "tracking" && effectiveLocation) {
      setLocationSignal((value) => value + 1);
      return;
    }
    if (status !== "tracking" || effectiveLocation) {
      wantsLocationRef.current = true;
      start();
      return;
    }
    stop();
  }, [effectiveLocation, start, status, stop]);

  const handleLocationAdjust = useCallback((point: Pt) => {
    setManualLocation({ campus: point, timestamp: Date.now() });
    setAdjustMode(false);
    setLocationSignal((value) => value + 1);
  }, []);

  const handleAdjustToggle = useCallback(() => {
    if (manualLocation) {
      setManualLocation(null);
      setAdjustMode(false);
      return;
    }
    setAdjustMode((value) => !value);
  }, [manualLocation]);

  // Reset the selection once a freshly started GPS fix arrives.
  useEffect(() => {
    if (wantsLocationRef.current) {
      if (status === "tracking" && effectiveLocation) {
        wantsLocationRef.current = false;
        void queueMicrotask(() => {
          setFocusedId(null);
          setEventPreviewId(null);
          setPanZoomToId(null);
          setLocationSignal((value) => value + 1);
        });
        return;
      }
      if (outsideCampus || status === "denied" || status === "unavailable" || status === "error") {
        wantsLocationRef.current = false;
      }
    }
  }, [effectiveLocation, outsideCampus, status]);

  const previewBuilding = eventPreviewId
    ? (buildings.find((b) => b.id === eventPreviewId) ?? null)
    : null;
  const previewEvents = useMemo(
    () =>
      resolvedEvents
        .filter((event) => event.buildingId === eventPreviewId)
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
    [eventPreviewId, resolvedEvents],
  );
  const previewEvent = previewEvents[0] ?? null;

  const panelTitle = eventsOpen
    ? "Eventos"
    : panelMode === "places"
      ? "Lugares"
      : panelMode === "food"
        ? data.food.panel.name
        : data.chill.panel.name;

  const showLocationNotice = locationNotice;
  const showDirectionsCard = routeTarget && !navigationTarget;
  const showNavigationCard = navigationTarget && !showLocationNotice;

  return (
    <main className="bg-base text-tinta relative flex h-dvh flex-col overflow-hidden lg:flex-row">
      {/* ------------------------------------------------ desktop sidebar */}
      <aside className="relative z-20 hidden h-dvh shrink-0 lg:flex">
        <nav
          aria-label="Navegación del mapa"
          className="bg-background border-foreground flex w-16 shrink-0 flex-col items-center border-r py-3"
        >
          <div
            className="mb-2 flex h-14 items-center justify-center"
            title="UbicaTec"
          >
            <Mark withText={false} size="md" />
          </div>
          <div className="flex w-full flex-col gap-2 px-2">
            <RailButton
              label="Abrir lugares"
              active={panelOpen && !eventsOpen && panelMode === "places"}
              onClick={() => openPanel("places", false)}
              tone="neutral"
              icon="places"
            />
            <RailButton
              label="Abrir UbicaTec Food"
              active={panelOpen && !eventsOpen && panelMode === "food"}
              onClick={() => openPanel("food", false)}
              tone="food"
              icon="food"
            />
            <RailButton
              label="Abrir UbicaTec Chill"
              active={panelOpen && !eventsOpen && panelMode === "chill"}
              onClick={() => openPanel("chill", false)}
              tone="chill"
              icon="chill"
            />
            <RailButton
              label="Abrir eventos"
              active={panelOpen && eventsOpen}
              onClick={() => openPanel(panelMode, true)}
              tone="agenda"
              icon="agenda"
            />
          </div>
        </nav>

        <div
          className={
            "bg-background overflow-hidden transition-[width,border-color,box-shadow] duration-200 ease-out " +
            (panelOpen
              ? "border-foreground w-80 border-r shadow-[8px_0_0_rgba(28,78,137,0.12)]"
              : "w-0 border-r-transparent")
          }
        >
          <div className="flex h-full w-80 flex-col overflow-hidden">
            <header className="border-foreground flex h-16 shrink-0 items-center justify-between border-b px-4">
              <div className="min-w-0">
                <p className="uppercase-señal text-foreground/55 font-mono text-[9px] font-bold tracking-[0.12em]">
                  {eventsOpen ? "Mapa del campus" : "Explorar"}
                </p>
                <h1 className="uppercase-señal truncate text-[15px] font-extrabold tracking-[0.04em]">
                  {panelTitle}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Cerrar navegación"
                title="Cerrar navegación"
                className="hover:bg-foreground/5 inline-flex size-9 items-center justify-center text-lg"
              >
                ×
              </button>
            </header>

            {!eventsOpen && (
              <div className="border-foreground space-y-3 border-b p-4">
                <Input
                  type="search"
                  placeholder="Buscar por nombre o clave (CTEC, A1)"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  inputSize="md"
                />
                {panelMode === "places" && (
                  <div className="flex flex-wrap gap-1.5">
                    {EI.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setFilter(chip.id)}
                        aria-pressed={filter === chip.id}
                        className={
                          "uppercase-señal border px-2.5 py-1 text-[10px] font-extrabold tracking-[0.04em] transition-colors " +
                          (filter === chip.id
                            ? "border-azul-senal bg-azul-senal text-base"
                            : "border-foreground bg-background hover:bg-foreground/5")
                        }
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <header className="border-foreground bg-foreground/5 shrink-0 border-b px-5 py-3">
              <p
                className={
                  "uppercase-señal text-[10px] font-extrabold tracking-[0.12em] " +
                  (eventsOpen
                    ? "text-azul-senal"
                    : panelMode === "food"
                      ? "text-[#b9431f]"
                      : panelMode === "chill"
                        ? "text-[#087e6b]"
                        : "text-azul-senal")
                }
              >
                {"↳ "}
                {eventsOpen
                  ? `${data.events.length} eventos próximos`
                  : panelMode === "places"
                    ? `${filteredBuildings.length} / ${totalDirectoryBuildings} edificios`
                    : panelMode === "food"
                      ? data.food.panel.name
                      : data.chill.panel.name}
              </p>
            </header>

            {eventsOpen ? (
              <EventList events={resolvedEvents} onSelect={selectBuilding} />
            ) : panelMode === "places" ? (
              <ul className="flex-1 overflow-y-auto">
                {filteredBuildings.map((building) => {
                  const isActive = building.id === focusedId;
                  const code = codeOf(building, data.buildingCodes);
                  return (
                    <li key={building.id}>
                      <button
                        type="button"
                        onClick={() => selectBuilding(building.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={
                          "border-foreground/15 flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors " +
                          (isActive
                            ? "bg-azul-senal text-base"
                            : "bg-background text-foreground hover:bg-foreground/5")
                        }
                      >
                        <span
                          className={
                            "uppercase-señal flex size-8 shrink-0 items-center justify-center text-[10px] font-extrabold tracking-[0.04em] " +
                            (isActive
                              ? "bg-foreground text-background"
                              : "bg-foreground/10 text-foreground")
                          }
                        >
                          {code}
                        </span>
                        <span className="flex-1">
                          <span className="uppercase-señal block text-[14px] font-extrabold tracking-tight">
                            {building.name}
                          </span>
                          <span
                            className={
                              "uppercase-señal mt-0.5 block font-mono text-[10px] tracking-[0.06em] " +
                              (isActive ? "text-base/70" : "text-foreground/55")
                            }
                          >
                            {categoryMeta[building.category]?.label} ·{" "}
                            {building.levels} niv
                          </span>
                        </span>
                        {isActive && (
                          <span aria-hidden>↳</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <FoodChillList
                mode={panelMode}
                onSelect={selectBuilding}
                food={data.food}
                chill={data.chill}
                featureLabels={data.featureLabels}
                buildings={buildings}
                categoryMeta={categoryMeta}
              />
            )}
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------- map */}
      <section className="relative flex-1 overflow-hidden">
        <header className="border-tinta bg-base absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-3 border-b px-3 lg:hidden">
          <Mark size="sm" />
          <span className="uppercase-señal bg-azul-senal px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-base">
            Mapa
          </span>
          <span className="grow" />
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-tinta/55">
            Beta · etapa temprana
          </span>
        </header>

        <p className="border-tinta/25 bg-base/90 pointer-events-none absolute bottom-8 right-2 z-10 hidden border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-tinta/60 lg:block">
          Beta · mapa en etapa temprana
        </p>

        <div className="absolute left-3 right-3 top-14 z-20 flex items-start justify-between gap-2 lg:left-auto lg:right-6 lg:top-6 lg:w-auto lg:justify-end">
          <button
            type="button"
            onClick={() => setShowEventsOnMap((value) => !value)}
            aria-pressed={showEventsOnMap}
            aria-label={`${showEventsOnMap ? "Ocultar" : "Mostrar"} ${resolvedEvents.length} eventos`}
            style={
              showEventsOnMap
                ? {
                    backgroundColor: "var(--azul-senal)",
                    borderColor: "var(--azul-senal)",
                    color: "var(--base)",
                  }
                : undefined
            }
            className={
              "uppercase-señal border-tinta inline-flex h-11 shrink-0 items-center gap-1.5 border px-2.5 font-mono text-[10px] font-extrabold tracking-[0.08em] transition-colors sm:px-3 " +
              (resolvedEvents.length > 0 ? "sn-map-event-beacon " : "") +
              (showEventsOnMap ? "text-base" : "bg-base/95 text-tinta")
            }
          >
            <span
              aria-hidden
              className="relative grid size-4 place-items-center"
            >
              <CalendarDays className="size-4" strokeWidth={2} />
              {resolvedEvents.length > 0 && (
                <span className="sn-map-event-beacon-dot absolute -right-1 -top-1 size-1.5 bg-current" />
              )}
            </span>
            <span className="hidden sm:inline">Eventos</span>
            {resolvedEvents.length}
          </button>

          <div className="flex min-w-0 shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleLocationToggle}
              aria-pressed={status === "tracking" && !!effectiveLocation}
              aria-label={
                status === "tracking" && effectiveLocation
                  ? "Centrar en mi ubicación"
                  : status === "tracking"
                    ? "Apagar ubicación"
                    : "Activar mi ubicación"
              }
              title={
                status === "tracking" && effectiveLocation
                  ? "Centrar en mi ubicación"
                  : status === "tracking"
                    ? "Apagar ubicación"
                    : "Activar mi ubicación"
              }
              className={
                "border-tinta bg-base/95 hover:bg-tinta hover:text-base relative inline-flex size-11 shrink-0 items-center justify-center border transition-colors " +
                (status === "tracking" && effectiveLocation
                  ? "bg-azul-senal text-base"
                  : status === "denied" ||
                      status === "unavailable" ||
                      status === "error" ||
                      outsideCampus
                    ? "border-[#c0392b] text-[#c0392b]"
                    : "text-tinta")
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 2v3" />
                <path d="M12 19v3" />
                <path d="M2 12h3" />
                <path d="M19 12h3" />
                <circle cx="12" cy="12" r="6" />
                <circle
                  cx="12"
                  cy="12"
                  r="2"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              {status === "prompting" && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 size-2 animate-pulse bg-azul-senal"
                />
              )}
            </button>

            <button
              type="button"
              onClick={handleAdjustToggle}
              aria-pressed={adjustMode || !!manualLocation}
              aria-label={
                manualLocation
                  ? "Volver a la ubicación automática"
                  : adjustMode
                    ? "Cancelar ajuste de ubicación"
                    : "Ajustar mi ubicación en el mapa"
              }
              title={
                manualLocation
                  ? "Volver a GPS automático"
                  : adjustMode
                    ? "Cancelar ajuste"
                    : "Ajustar mi ubicación"
              }
              className={
                "border-tinta bg-base/95 hover:bg-tinta hover:text-base inline-flex size-11 shrink-0 items-center justify-center border transition-colors " +
                (adjustMode
                  ? "border-[#e36a2e] bg-[#e36a2e] text-white hover:bg-[#e36a2e] hover:text-white"
                  : manualLocation
                    ? "bg-[#087e6b] text-base"
                    : "")
              }
            >
              <MousePointer2
                aria-hidden
                className="size-[18px]"
                strokeWidth={2.2}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                setFocusedId(null);
                setEventPreviewId(null);
                setPanZoomToId(null);
                setResetSignal((value) => value + 1);
              }}
              aria-label="Centrar mapa"
              title="Centrar mapa"
              className="border-tinta bg-base/95 hover:bg-tinta hover:text-base inline-flex size-11 shrink-0 items-center justify-center border transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 12h4" />
                <path d="M17 12h4" />
                <path d="M12 3v4" />
                <path d="M12 17v4" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleReport}
              aria-label="Reportar una corrección del mapa"
              title="Reportar una corrección del mapa"
              className="border-tinta bg-base/95 hover:bg-tinta hover:text-base inline-flex size-11 shrink-0 items-center justify-center border transition-colors"
            >
              <Flag aria-hidden className="size-[18px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {showLocationNotice && (
          <div
            role="status"
            aria-live="polite"
            className={
              "border-tinta bg-base/95 absolute left-3 right-3 top-[104px] z-20 max-w-md border p-3 shadow-[4px_4px_0_var(--tinta)] lg:left-auto lg:right-6 lg:top-20 lg:w-[320px] " +
              (showLocationNotice.tone === "error"
                ? "text-[#c0392b]"
                : "text-tinta")
            }
          >
            <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
              {"↳ "}
              {showLocationNotice.title}
            </p>
            <p className="uppercase-señal mt-1 text-[12px] font-semibold leading-snug tracking-[0.03em]">
              {showLocationNotice.body}
            </p>
            {status === "tracking" && (
              <button
                type="button"
                onClick={stop}
                className="uppercase-señal border-tinta mt-2 inline-flex h-8 items-center border px-3 text-[11px] font-extrabold tracking-[0.06em] text-tinta"
              >
                Detener GPS
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdjustMode(true)}
              className="uppercase-señal border-tinta mt-2 inline-flex h-8 items-center gap-2 border px-3 text-[11px] font-extrabold tracking-[0.06em] text-tinta"
            >
              <MousePointer2
                aria-hidden
                className="size-3.5"
                strokeWidth={2.4}
              />
              Ubicar manualmente
            </button>
          </div>
        )}

        {adjustMode && (
          <div className="border-tinta bg-base absolute left-3 top-[104px] z-20 inline-flex h-10 items-center gap-2 border px-3 shadow-[3px_3px_0_var(--tinta)] lg:left-auto lg:right-6 lg:top-20">
            <MousePointer2 aria-hidden className="size-4 text-[#e36a2e]" strokeWidth={2.4} />
            <span className="uppercase-señal text-[10px] font-extrabold tracking-[0.06em]">
              Toca tu posición real
            </span>
            <button
              type="button"
              onClick={() => setAdjustMode(false)}
              aria-label="Cancelar ajuste de ubicación"
              title="Cancelar ajuste"
              className="-mr-1 inline-flex size-6 items-center justify-center hover:bg-foreground/10"
            >
              <X aria-hidden className="size-4" strokeWidth={2.4} />
            </button>
          </div>
        )}

        {focusedBuilding &&
          !navigationTarget &&
          !routeTarget &&
          !showLocationNotice && (
            <button
              type="button"
              onClick={handleDirections}
              className="uppercase-señal border-tinta bg-base/95 absolute right-3 top-[104px] z-20 inline-flex h-10 items-center gap-2 border px-3 text-[11px] font-extrabold tracking-[0.06em] shadow-[3px_3px_0_var(--tinta)] lg:hidden"
            >
              <Navigation aria-hidden className="size-4" strokeWidth={2.2} />
              Direcciones
            </button>
          )}

        {focusedBuilding &&
          !modalOpen &&
          !navigationTarget &&
          !routeTarget &&
          !showLocationNotice &&
          !adjustMode && (
            <article className="border-tinta bg-base/95 sn-anim-slide-up absolute left-3 right-[156px] top-[104px] z-20 flex h-10 min-w-0 items-center gap-2 border px-2 shadow-[3px_3px_0_var(--tinta)] lg:hidden">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label={`Ver detalles de ${focusedBuilding.name}`}
              >
                <span className="uppercase-señal bg-azul-senal grid size-6 shrink-0 place-items-center text-[8px] font-extrabold tracking-[0.03em] text-base">
                  {codeOf(focusedBuilding, data.buildingCodes)}
                </span>
                <span className="uppercase-señal truncate text-[10px] font-extrabold tracking-[0.04em]">
                  {focusedBuilding.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFocusedId(null)}
                aria-label={`Quitar selección de ${focusedBuilding.name}`}
                title="Quitar selección"
                className="hover:bg-tinta/10 grid size-6 shrink-0 place-items-center"
              >
                <X aria-hidden className="size-3.5" strokeWidth={2.4} />
              </button>
            </article>
          )}

        {showDirectionsCard && (
          <aside
            aria-live="polite"
            className="border-tinta bg-base/90 absolute inset-x-0 bottom-0 z-20 border-t p-4 backdrop-blur-md lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[26rem] lg:border lg:shadow-[4px_4px_0_var(--tinta)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
                  Direcciones a pie
                </p>
                <p className="uppercase-señal mt-1 truncate text-[15px] font-extrabold tracking-[0.04em]">
                  {routeTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelRoute}
                aria-label="Cerrar direcciones"
                title="Cancelar"
                className="border-tinta bg-base hover:bg-tinta hover:text-base inline-flex size-8 shrink-0 items-center justify-center border"
              >
                <X aria-hidden className="size-4" strokeWidth={2.4} />
              </button>
            </div>

            <div className="border-tinta/20 mt-4 flex items-center gap-3 border-y py-3">
              <span className="bg-[#087e6b] grid size-9 shrink-0 place-items-center text-base">
                <LocateFixed aria-hidden className="size-4" strokeWidth={2.5} />
              </span>
              <Route aria-hidden className="size-4 shrink-0 text-tinta/50" strokeWidth={2.1} />
              <span className="bg-[#d84c1f] grid size-9 shrink-0 place-items-center text-base">
                <MapPin aria-hidden className="size-4" strokeWidth={2.5} />
              </span>
              <span className="uppercase-señal min-w-0 flex-1 truncate font-mono text-[10px] font-bold tracking-[0.06em]">
                Tu ubicación · {codeOf(routeTarget, data.buildingCodes)}
              </span>
            </div>

            {route ? (
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-[34px] font-black leading-none tracking-[0.02em]">
                    {minutesCeil(route.walkingSeconds)} min
                  </p>
                  <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-tinta/60">
                    A pie · {Math.round(route.distanceMeters)} m
                  </p>
                </div>
                <Footprints
                  aria-hidden
                  className="mb-1 size-7 text-[#087e6b]"
                  strokeWidth={1.9}
                />
              </div>
            ) : effectiveLocation && graph ? (
              <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[#b9431f]">
                No hay un sendero conectado hacia este destino.
              </p>
            ) : (
              <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-tinta/65">
                Preparando tu ubicación…
              </p>
            )}

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={handleConfirmRoute}
                disabled={!route}
                className="uppercase-señal bg-azul-senal disabled:bg-tinta/20 inline-flex h-11 items-center justify-center gap-2 px-4 text-[12px] font-extrabold tracking-[0.07em] text-base disabled:cursor-not-allowed"
              >
                <Check aria-hidden className="size-4" strokeWidth={2.5} />
                Confirmar ruta
              </button>
              <button
                type="button"
                onClick={handleCancelRoute}
                className="border-tinta bg-base hover:bg-tinta hover:text-base inline-flex h-11 items-center justify-center border px-3"
                aria-label="Cancelar ruta"
                title="Cancelar ruta"
              >
                <X aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          </aside>
        )}

        {showNavigationCard && (
          <aside
            aria-live="polite"
            className="border-tinta bg-base/90 absolute inset-x-0 bottom-0 z-20 border-t p-4 backdrop-blur-md lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[26rem] lg:border lg:shadow-[4px_4px_0_var(--tinta)]"
          >
            <div className="flex items-center gap-3">
              <span className="bg-[#087e6b] grid size-10 shrink-0 place-items-center text-base">
                <Navigation aria-hidden className="size-5" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="uppercase-señal text-[#087e6b] text-[10px] font-extrabold tracking-[0.12em]">
                  Navegación activa
                </p>
                <p className="uppercase-señal mt-1 truncate text-[14px] font-extrabold tracking-[0.04em]">
                  A {navigationTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelRoute}
                aria-label="Cerrar direcciones"
                title="Finalizar navegación"
                className="border-tinta bg-base hover:bg-tinta hover:text-base inline-flex size-8 shrink-0 items-center justify-center border"
              >
                <X aria-hidden className="size-4" strokeWidth={2.4} />
              </button>
            </div>

            {activeRoute ? (
              <div className="border-tinta/20 mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[27px] font-black leading-none">
                    {minutesCeil(activeRoute.walkingSeconds)} min
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-tinta/60">
                    {Math.round(activeRoute.distanceMeters)} m a pie
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRecentreRoute}
                  aria-label="Recentrar ruta"
                  title="Recentrar ruta"
                  className="border-tinta bg-base hover:bg-tinta hover:text-base inline-flex size-9 shrink-0 items-center justify-center border"
                >
                  <LocateFixed aria-hidden className="size-4" strokeWidth={2.3} />
                </button>
              </div>
            ) : (
              <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-tinta/65">
                Actualizando recorrido…
              </p>
            )}
          </aside>
        )}

        <CampusMapFlat
          geometry={geometry}
          buildings={buildings}
          entrances={entrances}
          focusedId={focusedId}
          onSelect={selectBuilding}
          onMarkerSelect={(id: string) =>
            selectBuilding(id, { eventPreview: true })
          }
          panZoomToId={panZoomToId}
          panZoomToLocation={effectiveLocation?.campus ?? null}
          panZoomToLocationSignal={locationSignal}
          resetSignal={resetSignal}
          userLocation={effectiveLocation}
          locationAdjustmentMode={adjustMode}
          onLocationAdjust={handleLocationAdjust}
          eventBuildings={eventMarkers}
          route={route}
          routeFocusSignal={routeFocusSignal}
          navigationMode={!!(navigationTarget && activeRoute)}
          mobileAttributionBelowCard={
            !!(
              focusedBuilding &&
              !modalOpen &&
              !navigationTarget &&
              !routeTarget &&
              !showLocationNotice &&
              !adjustMode
            )
          }
          className="absolute inset-0"
        />

        {focusedBuilding && !modalOpen && !navigationTarget && !routeTarget && (
          <article className="border-tinta bg-base sn-anim-slide-up absolute bottom-6 left-6 z-10 hidden max-w-md border p-5 shadow-[5px_5px_0_var(--tinta)] lg:block">
            <button
              type="button"
              onClick={() => setFocusedId(null)}
              aria-label="Cerrar"
              className="hover:bg-foreground/10 absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center font-mono text-sm font-bold"
            >
              ×
            </button>
            <div className="flex items-center gap-3 pr-7">
              <span className="uppercase-señal bg-azul-senal flex size-12 items-center justify-center text-base font-black tracking-[0.04em] sm:size-14">
                {codeOf(focusedBuilding, data.buildingCodes)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="uppercase-señal text-tinta/65 text-[10px] font-extrabold tracking-[0.12em]">
                  ↳ Edificio enfocado
                </p>
                <h2 className="mt-1 truncate text-balance text-xl font-black uppercase leading-none tracking-[-0.01em] sm:text-3xl">
                  {focusedBuilding.name}
                </h2>
              </div>
              <span className="uppercase-señal text-tinta/55 shrink-0 font-mono text-[10px] tracking-[0.06em]">
                {focusedBuilding.levels} niv
              </span>
            </div>
            <p className="uppercase-señal text-tinta/55 mt-3 font-mono text-[10px] tracking-[0.06em]">
              {categoryLabel} · {Math.round(focusedBuilding.area)} m²
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="uppercase-señal bg-azul-senal inline-flex h-10 items-center gap-2 px-4 text-base text-sm font-extrabold tracking-[0.04em] hover:opacity-90"
              >
                Más detalles <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={handleDirections}
                className="uppercase-señal border-tinta bg-base text-tinta hover:bg-tinta hover:text-base inline-flex h-10 items-center gap-2 border px-4 text-sm font-extrabold tracking-[0.04em]"
              >
                <Navigation aria-hidden className="size-4" strokeWidth={2.2} />
                Direcciones
              </button>
            </div>
          </article>
        )}

        {focusedBuilding && modalOpen && (
          <DetailModal
            building={focusedBuilding}
            categoryLabel={categoryLabel}
            activeLevel={activeLevel}
            onLevelChange={setActiveLevel}
            onDirections={handleDirections}
            onClose={() => setModalOpen(false)}
          />
        )}

        {!focusedBuilding && !navigationTarget && !routeTarget && (
          <p className="text-tinta/55 pointer-events-none absolute bottom-12 left-6 right-6 z-10 hidden text-center font-mono text-[10px] tracking-[0.06em] lg:block">
            {showEventsOnMap
              ? "pin azul: evento · arrastra para mover · scroll para zoom"
              : "arrastra para mover · scroll para zoom · click en edificio"}
          </p>
        )}

        {previewBuilding &&
          previewEvent &&
          (() => {
            const count = previewEvents.length;
            return (
              <div className="border-tinta bg-background sn-anim-slide-up absolute inset-x-0 bottom-0 z-20 border-t p-4 lg:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
                      {"↳ "}
                      {codeOf(previewBuilding, data.buildingCodes)} · {count}{" "}
                      eventos hoy
                    </p>
                    <h3 className="font-display mt-1 text-balance text-[22px] font-black uppercase leading-tight tracking-[-0.01em]">
                      {previewEvent.title}
                    </h3>
                    <p className="text-foreground/65 mt-2 font-mono text-[10px] uppercase tracking-[0.06em] leading-relaxed">
                      Hoy {formatClock(previewEvent.startsAt)} ·{" "}
                      {previewEvent.durationMin}m
                      <br />
                      {previewEvent.organizer} · {previewEvent.place}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEventPreviewId(null)}
                    aria-label="Cerrar"
                    className="border-tinta bg-base hover:bg-tinta/5 inline-flex size-8 shrink-0 items-center justify-center border font-mono text-sm font-bold"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="uppercase-señal bg-azul-senal flex-1 px-3 py-3 text-[13px] text-base font-extrabold tracking-[0.06em]"
                  >
                    Ver detalle del edificio →
                  </button>
                </div>
                {count > 1 && (
                  <div className="text-foreground/55 mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.06em]">
                    <span>
                      +{count - 1} más en {previewBuilding.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEventPreviewId(null);
                        setMobileTab("events");
                      }}
                      className="text-azul-senal font-extrabold"
                    >
                      Ver todos →
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

        {!eventPreviewId && !routeTarget && !navigationTarget && (
          <>
            {sheetOpen && (
              <MobileSheet
                tab={mobileTab}
                buildings={filteredBuildings}
                focusedId={focusedId}
                onSelectBuilding={selectBuilding}
                query={query}
                onQueryChange={setQuery}
                filter={filter}
                onFilterChange={setFilter}
                events={resolvedEvents}
                totalBuildings={totalDirectoryBuildings}
                onClose={() => setSheetOpen(false)}
                food={data.food}
                chill={data.chill}
                featureLabels={data.featureLabels}
                categoryMeta={categoryMeta}
              />
            )}
            <MobileNav
              activeTab={mobileTab}
              sheetOpen={sheetOpen}
              eventCount={resolvedEvents.length}
              onSelect={(tab) => {
                setEventPreviewId(null);
                if (sheetOpen && tab === mobileTab) {
                  setSheetOpen(false);
                } else {
                  setMobileTab(tab);
                  setSheetOpen(true);
                }
              }}
            />
          </>
        )}
      </section>
    </main>
  );
}
