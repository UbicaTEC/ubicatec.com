"use client";

/**
 * Building detail modal — port of the source bundle component `ed`.
 *
 * Props (source call site: `jsx)(ed, { building, categoryLabel, activeLevel,
 * onLevelChange, onDirections, onClose })`):
 *   - building      : building DTO (its `profile` already replaces the source's
 *                     module-level profile map `I`, keyed by id/"cetec").
 *   - categoryLabel : resolved `w.CATEGORY_META[id].label` for the building.
 *   - activeLevel   : 1-based level currently highlighted (source `i`).
 *   - onLevelChange : called with the 1-based level number (source `s`).
 *   - onDirections  : "Direcciones" button handler (source `r`).
 *   - onClose       : closes the modal (source `l`).
 *
 * Added optional props: none. `ed` renders only building/profile data, so no
 * events, food or chill data (source `ec`/`ep`, defined below `ed`) is needed.
 *
 * Note: the small stats tile used inside the `<dl>` (source `ex`, defined just
 * below `ed` in the bundle) is rendered by the local, non-exported `Stat`
 * component below so the modal output stays byte-identical.
 */

import type { JSX } from "react";

import Image from "next/image";
import { Navigation } from "lucide-react";

import { codeOf } from "~/lib/campus";
import { BUILDING_CODES } from "~/lib/literals";
import type { BuildingDto } from "~/server/api/routers/campus";

type Profile = NonNullable<BuildingDto["profile"]>;

type StatProps = {
  label: string;
  value: string;
  unit?: string;
  last?: boolean;
};

/** Source `ex` — one cell of the stats row. */
function Stat({ label, value, unit, last }: StatProps): JSX.Element {
  return (
    <div className={`px-3 py-2.5 ${last ? "" : "border-foreground border-r"}`}>
      <p className="uppercase-señal text-azul-senal text-[9px] font-extrabold tracking-[0.12em]">
        {label}
      </p>
      <p className="font-display mt-0.5 truncate text-[22px] font-black uppercase leading-none tracking-[-0.01em]">
        {value}
        {unit && (
          <span className="text-foreground/55 ml-1 text-[12px] font-medium tracking-normal">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export function DetailModal(props: {
  building: BuildingDto;
  categoryLabel: string;
  activeLevel: number;
  onLevelChange: (level: number) => void;
  onDirections: () => void;
  onClose: () => void;
}): JSX.Element {
  const {
    building,
    categoryLabel,
    activeLevel,
    onLevelChange,
    onDirections,
    onClose,
  } = props;

  const isCetec =
    building.aliases?.some((alias) => alias.toLowerCase() === "cetec") ??
    false;
  const profile: Partial<Profile> = building.profile ?? {};
  const category = isCetec ? "Edificio" : categoryLabel;
  const title = isCetec ? "CETEC" : building.name;
  const levels = profile.levels?.length
    ? profile.levels
    : Array.from({ length: Math.max(1, building.levels) }, (_, index) => ({
        label: `N${index + 1}`,
        name: `Nivel ${index + 1}`,
      }));

  // The source profile map omits absent keys (`void 0 !== c.rooms`), while the
  // DB stores them as `null` — treat null as "absent" to keep the same output.
  const rooms = profile.rooms ?? undefined;
  const elevators = profile.elevators ?? undefined;

  const metaParts = [
    category,
    `${levels.length} ${levels.length === 1 ? "NIVEL" : "NIVELES"}`,
  ];
  if (profile.rooms) {
    metaParts.push(`${profile.rooms} SALONES`);
  } else {
    metaParts.push(`${Math.round(building.area).toLocaleString("es-MX")} M²`);
  }
  const meta = metaParts.join(" · ").toUpperCase();

  const description = profile.description ?? building.description;

  const handleShare = () => {
    const url = `${window.location.origin}/mapa?b=${building.id}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({ title: building.name, url })
        .catch(() => {
          // user dismissed the share sheet
        });
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {
        // clipboard write rejected (permissions)
      });
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="sn-anim-fade-in absolute inset-0 bg-black/40"
      />
      <article className="border-tinta bg-background sn-anim-slide-up relative flex max-h-[85vh] w-full max-w-[920px] flex-col overflow-hidden border shadow-[10px_10px_0_var(--tinta)] sm:sn-anim-scale-in sm:max-h-[560px] sm:flex-row">
        <div className="border-tinta relative h-[200px] shrink-0 border-b sm:h-auto sm:w-[400px] sm:border-b-0 sm:border-r">
          {isCetec ? (
            <Image
              src="/images/buildings/cetec.webp"
              alt="Edificio CETEC en el Campus Monterrey"
              fill
              sizes="(max-width: 639px) 100vw, 400px"
              className="object-cover object-[center_62%]"
            />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center font-mono text-[12px] uppercase tracking-[0.1em] text-[#888]"
              style={{
                background:
                  "repeating-linear-gradient(60deg, transparent 0 2px, rgba(0,0,0,0.08) 2px 12px), #f5f1e8",
              }}
            >
              {`Foto · ${building.name}`}
            </div>
          )}
          <span className="bg-tinta absolute bottom-3 left-3 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-base">
            {isCetec ? "1 / 1" : "1 / 4"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="border-tinta bg-background hover:bg-foreground/10 absolute right-3 top-3 inline-flex size-8 items-center justify-center border sm:hidden"
          >
            ×
          </button>
        </div>
        <div
          className={`relative flex flex-1 flex-col overflow-y-auto p-6 ${isCetec ? "sm:p-6" : "sm:p-10"}`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="border-tinta bg-background hover:bg-foreground/5 absolute right-4 top-4 hidden size-9 items-center justify-center border sm:inline-flex"
          >
            ×
          </button>
          <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
            {`↳ ${meta}`}
          </p>
          <h2
            className={`font-display text-balance mt-2 font-black uppercase leading-[0.9] tracking-[-0.01em] ${isCetec ? "text-[clamp(2.5rem,5vw,4rem)]" : "text-[clamp(2.5rem,6vw,5rem)]"}`}
          >
            {title}
          </h2>
          <p className="uppercase-señal text-foreground/55 mt-2 text-[13px] font-medium tracking-[0.04em]">
            {profile.subtitle ??
              `${codeOf(building, BUILDING_CODES)} · ${category}`}
          </p>
          {description && (
            <p
              className={`uppercase-señal text-foreground/85 max-w-md text-[14px] font-medium leading-[1.4] tracking-[0.02em] ${isCetec ? "mt-3" : "mt-5"}`}
            >
              {description}
            </p>
          )}
          {profile.amenities?.length ? (
            <div
              className={`border-foreground/20 border-y ${isCetec ? "mt-3 py-2" : "mt-5 py-3"}`}
            >
              <p className="uppercase-señal text-azul-senal text-[10px] font-extrabold tracking-[0.12em]">
                Espacios principales
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {profile.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="border-foreground/30 bg-foreground/5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
                  >
                    {amenity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {profile.layoutNote ? (
            <p className="border-foreground/20 mt-3 border-l-2 pl-3 font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.05em] text-tinta/70">
              {`↳ ${profile.layoutNote}`}
            </p>
          ) : null}
          <div className={isCetec ? "mt-3" : "mt-5"}>
            <p className="uppercase-señal text-azul-senal mb-1.5 text-[10px] font-extrabold tracking-[0.12em]">
              Niveles
            </p>
            <div
              className={`grid gap-1 ${isCetec ? "grid-cols-5 sm:grid-cols-10" : ""}`}
              style={{
                gridTemplateColumns: isCetec
                  ? undefined
                  : `repeat(${levels.length}, minmax(0, 1fr))`,
              }}
            >
              {levels.map((level, index) => {
                const levelNumber = index + 1;
                const isActive = levelNumber === activeLevel;
                return (
                  <button
                    key={level.label}
                    type="button"
                    onClick={() => onLevelChange(levelNumber)}
                    aria-pressed={isActive}
                    aria-label={level.name}
                    title={level.name}
                    className={`border-foreground font-display border py-2 text-center text-[12px] font-black uppercase tracking-[0.02em] transition-colors ${isActive ? "bg-foreground text-background" : "bg-background hover:bg-foreground/5"}`}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>
          <dl
            className={`border-foreground grid grid-cols-3 border ${isCetec ? "mt-3" : "mt-5"}`}
          >
            {rooms !== undefined ? (
              <Stat label="Salones" value={`${rooms}`} />
            ) : (
              <Stat
                label="Área"
                value={`${Math.round(building.area).toLocaleString("es-MX")}`}
                unit="m²"
              />
            )}
            <Stat
              label={elevators !== undefined ? "Elevadores" : "Niveles"}
              value={`${elevators ?? levels.length}`}
            />
            <Stat label="Abierto" value={profile.hours ?? "—"} last={true} />
          </dl>
          <div className="grow" />
          <div
            className={`flex flex-wrap items-center gap-2.5 ${isCetec ? "mt-4" : "mt-6"}`}
          >
            <button
              type="button"
              onClick={onDirections}
              className="uppercase-señal bg-azul-senal inline-flex items-center gap-2 px-4 py-3 text-[13px] font-extrabold tracking-[0.04em] text-base hover:opacity-90"
            >
              <Navigation aria-hidden className="size-4" strokeWidth={2.2} />
              Direcciones
            </button>
            <div className="grow" />
            <button
              type="button"
              onClick={handleShare}
              className="uppercase-señal border-foreground bg-background hover:bg-foreground/5 hidden border px-4 py-3 text-[13px] font-extrabold tracking-[0.04em] sm:inline-flex"
            >
              Compartir
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
