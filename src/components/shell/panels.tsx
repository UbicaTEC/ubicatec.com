"use client";

/**
 * Shell panels ported from the beautified production bundle
 * (docs/research/ubicatec/pretty/0itzd-8bhii9..js.txt).
 *
 * Source → port mapping:
 *   `eu` → RailButton · `em` → MobileNav · `ey` → EventList
 *   `ev` → FoodChillList · `eC` → MobileSheet · `eM` → MapLoading
 *   private: `eb` (rail icon) · `eg` (feature icon) · `ez` (place logo)
 *            `ek` (mobile food panel) · `ej` (desktop food sections)
 *            `ew` (mobile agenda list, rendered by `eC`)
 *
 * OPTIONAL PROPS (data the source read from module scope, so it is not part of
 * the required public contract — both are forwarded by `MobileSheet`, which does
 * receive them as required props):
 *   - `FoodChillList.buildings`    → source `es` / `resolveBuildingRef(buildings, ref)`.
 *     Food/chill rows whose building cannot be resolved are skipped (as in the
 *     source), so without this prop the lists render empty. Defaults to `[]`.
 *   - `FoodChillList.categoryMeta` → source `w.CATEGORY_META`, the category label of
 *     a building shown on each chill row. Defaults to `{}`.
 *
 * Not ported because nothing here references them: `ex` (stat cell, used by the
 * building modal `ed`), `ep` (replaced by the `featureLabels` prop), `eN`
 * (ScheduleEditor). Source `ei` → `EI`, `er` → `codeOf`, `T` → `formatClock`,
 * `N.CAMPUS_BUILDINGS_TRACED` → `buildings`, `eo` → `totalBuildings`.
 */

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Coffee,
  GraduationCap,
  HeartPulse,
  MapPin,
  UsersRound,
  Utensils,
  X,
} from "lucide-react";

import { codeOf, formatClock, resolveBuildingRef } from "~/lib/campus";
import { BUILDING_CODES, EI } from "~/lib/literals";
import type { BuildingDto, EventDto } from "~/server/api/routers/campus";

/* ------------------------------------------------------------------ */
/* Data shapes (see src/server/api/routers/campus.ts)                  */
/* ------------------------------------------------------------------ */

export type FoodData = {
  zones: {
    id: string;
    name: string;
    detail: string;
    tone: string;
    rowTone: string;
    icon: string;
    order: number;
  }[];
  places: {
    key: string;
    buildingQuery: string;
    label: string;
    name: string;
    location: string | null;
    playlist: string | null;
    description: string | null;
    features: string[];
    logo: string | null;
  }[];
  panel: { name: string; intro: string };
};

export type ChillData = {
  panel: { name: string; intro: string };
  places: {
    id: string;
    label: string;
    description: string | null;
    features: string[];
    buildingQuery: string;
  }[];
};

export type SelectFn = (
  buildingRef: string,
  options?: { eventPreview?: boolean },
) => void;

type FoodZone = FoodData["zones"][number];
type FoodPlace = FoodData["places"][number];
type ChillPlace = ChillData["places"][number];
type CategoryMeta = Record<string, { label: string }>;

/* ------------------------------------------------------------------ */
/* Icons (source `eb` / `eg`)                                          */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, LucideIcon> = {
  // semantic keys used by the rail / bottom navigation / feature chips
  places: MapPin,
  food: Utensils,
  chill: HeartPulse,
  agenda: CalendarDays,
  coffee: Coffee,
  study: GraduationCap,
  collaborate: UsersRound,
  wellness: HeartPulse,
  // icon identifiers stored in `foodZones.icon` (source `eh` uses `k.Utensils`,
  // `l`, `u.MapPin`, `x.HeartPulse` …) and the source's single-letter aliases
  "k.Utensils": Utensils,
  "u.MapPin": MapPin,
  "x.HeartPulse": HeartPulse,
  l: Coffee,
  s: CalendarDays,
  d: GraduationCap,
  z: UsersRound,
  // bare component names
  MapPin,
  Utensils,
  HeartPulse,
  CalendarDays,
  Coffee,
  GraduationCap,
  UsersRound,
};

/** Resolve a source icon key (e.g. "agenda", "k.Utensils", "l") to a lucide icon. */
function resolveIcon(key: string | null | undefined): LucideIcon {
  if (!key) return Utensils;
  const bare = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
  return ICONS[bare] ?? ICONS[key] ?? Utensils;
}

/** Source `eb`. */
function RailIcon({ icon }: { icon?: string }): JSX.Element {
  const Icon = resolveIcon(icon ?? "places");
  return <Icon aria-hidden className="size-5" strokeWidth={2} />;
}

/** Source `eg`. */
function FeatureIcon({ feature }: { feature: string | undefined }): JSX.Element {
  const Icon = resolveIcon(feature);
  return <Icon aria-hidden className="size-5" strokeWidth={2} />;
}

/* ------------------------------------------------------------------ */
/* Source `eu`                                                         */
/* ------------------------------------------------------------------ */

export function RailButton({
  label,
  active,
  onClick,
  tone,
  icon,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  tone?: string;
  icon?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex aspect-square w-full items-center justify-center border transition-colors ${
        active
          ? `border-transparent ${
              tone === "food"
                ? "bg-[#e85d2a] text-white"
                : tone === "chill"
                  ? "bg-[#087e6b] text-white"
                  : tone === "agenda"
                    ? "bg-[#805dba] text-white"
                    : "bg-tinta text-base"
            }`
          : "border-transparent text-tinta hover:border-foreground hover:bg-foreground/5"
      }`}
    >
      <RailIcon icon={icon} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Source `em`                                                         */
/* ------------------------------------------------------------------ */

const NAV_TABS: { tab: string; label: string; icon: string; tone: string }[] = [
  { tab: "lugares", label: "Lugares", icon: "places", tone: "neutral" },
  { tab: "food", label: "Food", icon: "food", tone: "food" },
  { tab: "chill", label: "Chill", icon: "chill", tone: "chill" },
  { tab: "events", label: "Eventos", icon: "agenda", tone: "agenda" },
];

export function MobileNav({
  activeTab,
  sheetOpen,
  eventCount,
  onSelect,
}: {
  activeTab: string;
  sheetOpen: boolean;
  eventCount: number;
  onSelect: (tab: string) => void;
}): JSX.Element {
  return (
    <nav
      aria-label="Navegación principal del mapa"
      className="border-tinta bg-background absolute inset-x-0 bottom-0 z-20 grid h-[calc(68px+env(safe-area-inset-bottom))] grid-cols-4 border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_TABS.map((item) => {
        const current = sheetOpen && activeTab === item.tab;
        return (
          <button
            key={item.tab}
            type="button"
            onClick={() => onSelect(item.tab)}
            aria-current={current ? "page" : undefined}
            aria-pressed={current}
            className={`uppercase-señal relative flex min-w-0 flex-col items-center justify-center gap-1 border-x border-transparent font-mono text-[9px] font-extrabold tracking-[0.06em] transition-colors ${
              current
                ? item.tone === "food"
                  ? "bg-[#e85d2a] text-white"
                  : item.tone === "chill"
                    ? "bg-[#087e6b] text-white"
                    : item.tone === "agenda"
                      ? "bg-[#805dba] text-white"
                      : "bg-tinta text-base"
                : "text-tinta/65 hover:bg-tinta/5 hover:text-tinta"
            }`}
          >
            <span className="relative grid size-5 place-items-center">
              <RailIcon icon={item.icon} />
              {item.tab === "events" && eventCount > 0 && !current && (
                <span className="bg-[#805dba] absolute -right-2 -top-1 grid min-w-3 h-3 place-items-center rounded-full px-0.5 text-[7px] leading-none text-white">
                  {eventCount}
                </span>
              )}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ez` — place logo (the source looked the file up in `ef`)     */
/* ------------------------------------------------------------------ */

function PlaceLogo({
  place,
  className = "",
}: {
  place: { name?: string | null; label?: string; logo?: string | null };
  className?: string;
}): JSX.Element {
  const name = place.name ?? place.label;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-transparent ${className}`}
    >
      {place.logo ? (
        <Image
          src={place.logo}
          alt={`Logotipo de ${name}`}
          fill
          sizes="(max-width: 1023px) 45vw, 288px"
          className="object-contain mix-blend-multiply"
        />
      ) : (
        <Utensils
          aria-hidden
          className="size-6 text-tinta/45"
          strokeWidth={1.8}
        />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ek` — mobile food panel                                     */
/* ------------------------------------------------------------------ */

function MobileFoodPanel({
  places,
  zones,
  buildings,
  onSelect,
}: {
  places: FoodPlace[];
  zones: FoodZone[];
  buildings: BuildingDto[];
  onSelect: SelectFn;
}): JSX.Element {
  const [zoneId, setZoneId] = useState("centrales");
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0]!;
  const ZoneIcon = resolveIcon(zone.icon);
  const zonePlaces = places.filter((place) => place.playlist === zone.id);

  return (
    <div className="lg:hidden">
      <div
        aria-label="Elegir zona de comida"
        className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
      >
        {zones.map((item) => {
          const ItemIcon = resolveIcon(item.icon);
          const selected = item.id === zone.id;
          const count = places.filter((place) => place.playlist === item.id)
            .length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setZoneId(item.id)}
              aria-pressed={selected}
              className={`flex h-12 shrink-0 items-center gap-2 border px-3 text-left transition-colors ${
                selected
                  ? item.tone
                  : "border-tinta/20 bg-white text-tinta"
              }`}
            >
              <ItemIcon aria-hidden className="size-4" strokeWidth={2.2} />
              <span className="uppercase-señal max-w-28 truncate text-[10px] font-extrabold tracking-[0.05em]">
                {item.name}
              </span>
              <span className="font-mono text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <section className="border border-tinta bg-white">
        <header
          className={`flex items-center gap-3 border-b px-3 py-2.5 ${zone.tone}`}
        >
          <span className="grid size-8 place-items-center border border-white/45 bg-black/10">
            <ZoneIcon aria-hidden className="size-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="uppercase-señal text-[13px] font-extrabold tracking-[0.05em]">
              {zone.name}
            </h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/75">
              {zone.detail}
            </p>
          </div>
        </header>
        <ul className="grid grid-cols-2 gap-px bg-tinta/15">
          {zonePlaces.map((place) => {
            const building = resolveBuildingRef(buildings, place.buildingQuery);
            if (!building) return null;
            const name = place.name ?? building.name;
            return (
              <li key={`${place.buildingQuery}-${name}`}>
                <button
                  type="button"
                  onClick={() => onSelect(place.buildingQuery)}
                  aria-label={`Ubicar ${name} en ${place.description}`}
                  title={`Ubicar ${name}`}
                  className="relative block aspect-[5/4] w-full bg-white p-2.5 text-left transition-colors hover:bg-[#fff0e8]"
                >
                  <PlaceLogo place={place} className="h-12 w-full border-0" />
                  {place.location && (
                    <span className="absolute bottom-2 right-2 border border-tinta/25 bg-white px-1.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-tinta/65">
                      {place.location === "Planta baja" ? "PB" : "P5"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ej` — desktop food sections (+ mobile panel)                */
/* ------------------------------------------------------------------ */

function FoodSections({
  places,
  zones,
  buildings,
  onSelect,
}: {
  places: FoodPlace[];
  zones: FoodZone[];
  buildings: BuildingDto[];
  onSelect: SelectFn;
}): JSX.Element {
  return (
    <>
      <MobileFoodPanel
        places={places}
        zones={zones}
        buildings={buildings}
        onSelect={onSelect}
      />
      <div className="hidden space-y-3 lg:block">
        {zones.map((zone) => {
          const zonePlaces = places.filter(
            (place) => place.playlist === zone.id,
          );
          if (zonePlaces.length === 0) return null;
          const ZoneIcon = resolveIcon(zone.icon);
          return (
            <section key={zone.id} className="border border-tinta bg-white">
              <header
                className={`flex items-center gap-3 border-b px-3 py-2 ${zone.tone}`}
              >
                <span className="grid size-8 place-items-center border border-white/45 bg-black/10">
                  <ZoneIcon aria-hidden className="size-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="uppercase-señal text-[13px] font-extrabold tracking-[0.05em]">
                    {zone.name}
                  </h3>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/75">
                    {zone.detail}
                  </p>
                </div>
                <span className="font-mono text-[11px] font-bold">
                  {zonePlaces.length}
                </span>
              </header>
              <ol>
                {zonePlaces.map((place) => {
                  const building = resolveBuildingRef(
                    buildings,
                    place.buildingQuery,
                  );
                  if (!building) return null;
                  const name = place.name ?? building.name;
                  return (
                    <li
                      key={`${place.buildingQuery}-${name}`}
                      className="border-tinta/15 border-b last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(place.buildingQuery)}
                        aria-label={`Ubicar ${name} en ${place.description}`}
                        title={`Ubicar ${name}`}
                        className={`relative flex min-h-[4.5rem] w-full items-center justify-center px-4 py-3 transition-colors ${zone.rowTone}`}
                      >
                        <PlaceLogo
                          place={place}
                          className="h-12 w-full max-w-72 border-0"
                        />
                        {place.location && (
                          <span className="absolute right-3 border border-current/20 bg-white/80 px-1.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-tinta/65">
                            {place.location === "Planta baja" ? "PB" : "P5"}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ev`                                                         */
/* ------------------------------------------------------------------ */

export function FoodChillList({
  mode,
  onSelect,
  food,
  chill,
  featureLabels,
  buildings = [],
  categoryMeta = {},
}: {
  mode: "food" | "chill";
  onSelect: SelectFn;
  food: FoodData;
  chill: ChillData;
  featureLabels: Record<string, string>;
  /** Optional: source `es` — resolves food/chill places to buildings. */
  buildings?: BuildingDto[];
  /** Optional: source `w.CATEGORY_META` — category labels on chill rows. */
  categoryMeta?: CategoryMeta;
}): JSX.Element {
  const isFood = mode === "food";
  const intro = isFood ? food.panel.intro : chill.panel.intro;

  return (
    <div
      className={`flex-1 overflow-y-auto p-3 ${
        isFood ? "bg-[#fff8f4]" : "bg-[#f2fbf8]"
      }`}
    >
      <p
        className={`uppercase-señal px-1 pb-3 font-mono text-[10px] font-bold tracking-[0.08em] ${
          isFood ? "text-[#a93b19]" : "text-[#075d50]"
        }`}
      >
        {intro}
      </p>
      {isFood ? (
        <FoodSections
          places={food.places}
          zones={food.zones}
          buildings={buildings}
          onSelect={onSelect}
        />
      ) : (
        <ul className="space-y-2">
          {chill.places.map((place: ChillPlace) => {
            const building = resolveBuildingRef(
              buildings,
              place.buildingQuery,
            );
            if (!building) return null;
            return (
              <li key={`${place.buildingQuery}-${building.name}`}>
                <button
                  type="button"
                  onClick={() => onSelect(place.buildingQuery)}
                  className={`block w-full border p-3 text-left transition-colors ${
                    isFood
                      ? "border-[#efb49e] bg-white hover:border-[#e85d2a] hover:bg-[#fff0e8]"
                      : "border-[#9ed8ca] bg-white hover:border-[#087e6b] hover:bg-[#e0f5ee]"
                  }`}
                >
                  <figure
                    aria-label={`Espacio para imagen de ${building.name}`}
                    className={`relative -mx-3 -mt-3 mb-3 aspect-[16/7] overflow-hidden border-b ${
                      isFood
                        ? "border-[#efb49e] bg-[#f7b69e]"
                        : "border-[#9ed8ca] bg-[#a9dfcf]"
                    }`}
                  >
                    <span className="absolute bottom-0 left-0 top-0 w-1/3 bg-white/20" />
                    <span className="absolute bottom-0 right-0 top-0 w-1/4 bg-black/10" />
                    <span
                      className={`absolute bottom-3 left-3 grid size-11 place-items-center border bg-white/90 ${
                        isFood
                          ? "border-[#e85d2a] text-[#d84c1f]"
                          : "border-[#087e6b] text-[#087e6b]"
                      }`}
                    >
                      <FeatureIcon feature={place.features[0]} />
                    </span>
                    <span className="absolute right-3 top-3 bg-white/90 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-tinta">
                      {codeOf(building, BUILDING_CODES)}
                    </span>
                  </figure>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`uppercase-señal px-2 py-1 font-mono text-[9px] font-bold tracking-[0.08em] text-white ${
                        isFood ? "bg-[#e85d2a]" : "bg-[#087e6b]"
                      }`}
                    >
                      {place.label}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        isFood ? "text-[#d84c1f]" : "text-[#087e6b]"
                      }`}
                      aria-hidden
                    >
                      ↗
                    </span>
                  </div>
                  <h3 className="mt-3 text-[16px] font-extrabold uppercase leading-none tracking-[0.02em]">
                    {building.name}
                  </h3>
                  <p className="text-tinta/60 mt-2 text-[12px] font-medium leading-snug">
                    {place.description}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5">
                    {place.features.map((feature) => (
                      <span
                        key={feature}
                        title={featureLabels[feature]}
                        aria-label={featureLabels[feature]}
                        className={`grid size-7 place-items-center border ${
                          isFood
                            ? "border-[#efb49e] bg-[#fff4ef] text-[#d84c1f]"
                            : "border-[#9ed8ca] bg-[#effaf6] text-[#087e6b]"
                        }`}
                      >
                        <FeatureIcon feature={feature} />
                      </span>
                    ))}
                    <span
                      className={`ml-1 font-mono text-[10px] uppercase tracking-[0.07em] ${
                        isFood ? "text-[#b9431f]/70" : "text-[#075d50]/70"
                      }`}
                    >
                      {categoryMeta[building.category]?.label}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ey`                                                         */
/* ------------------------------------------------------------------ */

export function EventList({
  events,
  onSelect,
}: {
  events: EventDto[];
  onSelect: SelectFn;
}): JSX.Element {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  return (
    <ul className="flex-1 overflow-y-auto">
      {sorted.map((event) => {
        const date = new Date(event.startsAt);
        return (
          <li key={event.slug}>
            <button
              type="button"
              onClick={() => event.buildingId && onSelect(event.buildingId)}
              className="border-foreground/15 hover:bg-foreground/5 flex w-full items-stretch gap-3 border-b text-left transition-colors"
            >
              <div className="bg-tinta text-base flex w-16 shrink-0 flex-col items-center justify-center px-1.5 py-2 text-center">
                <span className="font-display text-[11px] font-black uppercase leading-none tracking-[0.04em]">
                  {date.toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="text-azul-senal mt-1 font-mono text-[9px] tracking-[0.06em]">
                  {formatClock(event.startsAt)}
                </span>
              </div>
              <div className="min-w-0 flex-1 py-3 pr-4">
                <p className="font-display text-balance text-[13px] font-extrabold uppercase leading-tight tracking-[0.02em]">
                  {event.title}
                </p>
                <p className="text-foreground/55 mt-1 truncate font-mono text-[10px] uppercase tracking-[0.06em]">
                  {"↳ "}
                  {event.place}
                  {" · "}
                  {event.durationMin}
                  {"m"}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Source `ew` — event list used inside the mobile sheet               */
/* ------------------------------------------------------------------ */

function MobileAgendaList({
  events,
  onSelectBuilding,
}: {
  events: EventDto[];
  onSelectBuilding: SelectFn;
}): JSX.Element {
  return (
    <ul>
      {events.map((event) => {
        const date = new Date(event.startsAt);
        return (
          <li key={event.slug}>
            <button
              type="button"
              onClick={() =>
                event.buildingId && onSelectBuilding(event.buildingId)
              }
              className="border-tinta/15 hover:bg-tinta/5 flex w-full items-stretch gap-3 border-b text-left"
            >
              <div className="bg-tinta text-base flex w-16 shrink-0 flex-col items-center justify-center px-1.5 py-2 text-center">
                <span className="font-display text-[11px] font-black uppercase leading-none tracking-[0.04em]">
                  {date.toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="text-azul-senal mt-1 font-mono text-[9px] tracking-[0.06em]">
                  {formatClock(event.startsAt)}
                </span>
              </div>
              <div className="min-w-0 flex-1 py-2.5 pr-3">
                <p className="font-display text-balance text-[13px] font-extrabold uppercase leading-tight tracking-[0.02em]">
                  {event.title}
                </p>
                <p className="text-tinta/55 mt-1 truncate font-mono text-[10px] uppercase tracking-[0.06em]">
                  {"↳ "}
                  {event.place}
                  {" · "}
                  {event.durationMin}
                  {"m"}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Source `eC`                                                         */
/* ------------------------------------------------------------------ */

export function MobileSheet({
  tab,
  buildings,
  focusedId,
  onSelectBuilding,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  events,
  totalBuildings,
  onClose,
  food,
  chill,
  featureLabels,
  categoryMeta,
}: {
  tab: string;
  buildings: BuildingDto[];
  focusedId: string | null;
  onSelectBuilding: SelectFn;
  query: string;
  onQueryChange: (v: string) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  events: EventDto[];
  totalBuildings: number;
  onClose: () => void;
  food: FoodData;
  chill: ChillData;
  featureLabels: Record<string, string>;
  categoryMeta: Record<string, { label: string }>;
}): JSX.Element {
  const [height, setHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const clamp = useCallback(
    (value: number) =>
      Math.round(
        Math.min(
          Math.max(148, window.innerHeight - 176),
          Math.max(148, value),
        ),
      ),
    [],
  );
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const parent = event.currentTarget.parentElement;
      if (parent) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          y: event.clientY,
          height: parent.getBoundingClientRect().height,
        };
        setDragging(true);
      }
    },
    [],
  );
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag) setHeight(clamp(drag.height + drag.y - event.clientY));
    },
    [clamp],
  );
  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag) setHeight(clamp(drag.height + drag.y - event.clientY));
      dragRef.current = null;
      setDragging(false);
    },
    [clamp],
  );
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    [events],
  );
  const title =
    tab === "lugares"
      ? "Lugares"
      : tab === "food"
        ? "UbicaTec Food"
        : tab === "chill"
          ? "UbicaTec Chill"
          : "Eventos";
  const countLabel =
    tab === "lugares"
      ? `${buildings.length} lugares`
      : tab === "events"
        ? `${events.length} hoy`
        : `${tab === "chill" ? chill.places.length : food.places.length} opciones`;

  return (
    <div
      className={`border-tinta bg-base sn-anim-slide-up absolute inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 flex flex-col border-t lg:hidden ${
        dragging ? "" : "transition-[height] duration-200 ease-out"
      }`}
      style={{
        height: height ? `${height}px` : "clamp(148px, 26dvh, 220px)",
      }}
    >
      <div
        role="separator"
        aria-label="Ajustar altura del panel"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHeight(
              clamp(
                (event.currentTarget.parentElement?.getBoundingClientRect()
                  .height ?? 148) + 48,
              ),
            );
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setHeight(
              clamp(
                (event.currentTarget.parentElement?.getBoundingClientRect()
                  .height ?? 148) - 48,
              ),
            );
          } else if (event.key === "Home") {
            event.preventDefault();
            setHeight(148);
          } else if (event.key === "End") {
            event.preventDefault();
            setHeight(clamp(window.innerHeight));
          }
        }}
        className="flex h-8 shrink-0 cursor-ns-resize touch-none items-center justify-center outline-none focus-visible:bg-azul-senal/10"
      >
        <span aria-hidden className="bg-tinta block h-1 w-10" />
      </div>
      <div className="border-tinta/15 flex shrink-0 items-center justify-between border-b px-4 pb-2">
        <p className="uppercase-señal text-[11px] font-extrabold tracking-[0.08em]">
          {title}
        </p>
        <div className="flex items-center gap-2">
          <span className="uppercase-señal text-tinta/50 font-mono text-[9px] font-bold tracking-[0.08em]">
            {countLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            title="Cerrar panel"
            className="border-tinta bg-base hover:bg-tinta hover:text-base grid size-7 place-items-center border"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <div className="sn-anim-fade-in flex-1 overflow-y-auto" key={tab}>
        {tab === "lugares" && (
          <>
            <div className="border-tinta/15 border-b p-3">
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="BUSCAR NOMBRE O CLAVE (CTEC, A1)"
                className="border-tinta bg-base placeholder:text-tinta/40 w-full border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.04em] outline-none"
              />
            </div>
            <div className="border-tinta/15 grid grid-cols-3 gap-1.5 border-b px-3 py-2">
              {EI.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onFilterChange(chip.id)}
                  aria-pressed={filter === chip.id}
                  className={`uppercase-señal flex h-8 items-center justify-center border px-1 font-mono text-[9px] font-bold tracking-[0.06em] ${
                    filter === chip.id
                      ? "border-tinta bg-tinta text-base"
                      : "border-tinta bg-base text-tinta/60"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <ul>
              {buildings.map((building) => {
                const active = building.id === focusedId;
                return (
                  <li key={building.id}>
                    <button
                      type="button"
                      onClick={() => onSelectBuilding(building.id)}
                      className={`border-tinta/15 flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors ${
                        active ? "bg-azul-senal text-base" : "hover:bg-tinta/5"
                      }`}
                    >
                      <span
                        className={`uppercase-señal flex size-7 shrink-0 items-center justify-center text-[10px] font-extrabold tracking-[0.04em] ${
                          active
                            ? "bg-base text-azul-senal"
                            : "bg-tinta text-base"
                        }`}
                      >
                        {codeOf(building, BUILDING_CODES)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-[13px] font-extrabold uppercase tracking-tight">
                          {building.name}
                        </span>
                        <span
                          className={`block truncate font-mono text-[9px] uppercase tracking-[0.06em] ${
                            active ? "text-base/70" : "text-tinta/55"
                          }`}
                        >
                          {categoryMeta[building.category]?.label}
                          {" · "}
                          {building.levels}
                          {" niv"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-tinta/45 px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.08em]">
              {"↳ "}
              {buildings.length}
              {" / "}
              {totalBuildings}
              {" edificios"}
            </p>
          </>
        )}
        {(tab === "food" || tab === "chill") && (
          <FoodChillList
            mode={tab}
            onSelect={onSelectBuilding}
            food={food}
            chill={chill}
            featureLabels={featureLabels}
            buildings={buildings}
            categoryMeta={categoryMeta}
          />
        )}
        {tab === "events" && (
          <>
            <MobileAgendaList
              events={sortedEvents}
              onSelectBuilding={onSelectBuilding}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source `eM`                                                         */
/* ------------------------------------------------------------------ */

export function MapLoading(): JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#ebe5d4]">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0 40px, rgba(0,0,0,0.05) 40px 41px), repeating-linear-gradient(0deg, transparent 0 40px, rgba(0,0,0,0.05) 40px 41px)",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect x="260" y="180" width="120" height="90" fill="#d8d2c0">
          <animate
            attributeName="opacity"
            from="0.4"
            to="0.8"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </rect>
        <rect x="450" y="160" width="90" height="120" fill="#d8d2c0">
          <animate
            attributeName="opacity"
            from="0.8"
            to="0.4"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </rect>
        <rect x="540" y="340" width="160" height="100" fill="#d8d2c0">
          <animate
            attributeName="opacity"
            from="0.4"
            to="0.8"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </rect>
        <rect x="100" y="180" width="110" height="70" fill="#d8d2c0">
          <animate
            attributeName="opacity"
            from="0.8"
            to="0.4"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
      <div className="text-tinta absolute inset-0 flex items-center justify-center">
        <div className="bg-base border-tinta border px-4 py-3 shadow-[3px_3px_0_var(--tinta)]">
          <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
            {"↳ Cargando mapa"}
          </p>
          <p className="font-display mt-1 text-base font-black uppercase tracking-tight">
            Trazando edificios…
          </p>
        </div>
      </div>
    </div>
  );
}
