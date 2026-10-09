# UbicaTec — Mapa del Tec de Monterrey (T3 + Prisma remake)

A rebuild of [UbicaTec](https://ubicatec-mapa.holoswitch2.workers.dev), the
Spanish (es‑MX) interactive campus map + news/events hub for the Tecnológico de
Monterrey Monterrey campus.

The source is a single Next.js App Router page (`/`) with a large client-side
map shell (sidebar, panels, detail modal, mobile sheet). This repo reproduces it
with the [T3 stack](https://create.t3.gg/) and stores every piece of content in
**Prisma (SQLite)**, served to the client through **one tRPC query** —
`campus.bootstrap` — instead of the source's inlined constants.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **tRPC 11** (React Query + superjson) — `src/server/api/routers/campus.ts`
- **Prisma ORM** on **SQLite** — `prisma/schema.prisma`
- **Tailwind CSS v4** — `src/styles/globals.css` (design tokens copied from the source)
- **lucide-react** for the icon glyphs the source used

## Getting started

```bash
npm install          # also runs `prisma generate`
npm run db:push      # create/patch prisma/db.sqlite
npm run db:seed      # load the extracted source data (idempotent, safe to re-run)
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm run start        # or: npx next start -p 3000
```

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | dev server (Turbopack) |
| `npm run build` / `npm run start` | production build / server |
| `npm run check` | `next lint` + `tsc --noEmit` |
| `npm run db:push` | sync `prisma/schema.prisma` → SQLite |
| `npm run db:seed` | seed from `docs/research/ubicatec/extracted-*.json` |
| `npm run db:studio` | Prisma Studio |

## Project structure

```
prisma/
  schema.prisma        Building, BuildingProfile, Entrance, Event, Post,
                       FoodZone, FoodPlace, ChillPlace, CampusAsset
  seed.mjs             idempotent seeder built from the extracted source data
src/
  app/
    page.tsx           RSC: prefetch campus.bootstrap → HydrateClient → MapApp
    layout.tsx         lang/metadata/preload, matches the source <head>
    mapa/route.ts      307 → / preserving ?b=<building>
    [...slug]/route.ts plain-text 404 "No encontrado." (source behaviour)
  app/_components/
    map-app.tsx        the shell: state, handlers, geolocation, routing, layout
  components/
    map/CampusMap.tsx  SVG map (pan/zoom/pinch, labels, beacons, route line)
    shell/panels.tsx   rail, mobile nav, food/chill/event panels, mobile sheet
    shell/detail.tsx   building detail modal
    ui/                Input + Mark (logo) ports
  lib/
    campus.ts          normalization, codes, projections, event helpers
    routing.ts         walk-graph build + snap + Dijkstra
    navigation.ts      building destinations / route-to-building
    literals.ts        generated statics (DAYS, EI, feature labels, codes)
  server/api/routers/campus.ts
scripts/               HTTP + rendered-HTML comparison tooling (see below)
docs/research/ubicatec/  source brief, downloaded bundles, extracted data
```

## Data

Everything the page renders comes from `campus.bootstrap`:

- **geometry** — bounds, projection origin, parks, pitches, roads, green areas,
  the 84-path walking graph (plus blocked junctions/pairs) and the absolute OSM
  footprints used as routing obstacles.
- **content** — 42 buildings (+14 linked profiles), 75 entrances, 7 events,
  6 posts, 6 food zones / 22 places, 3 chill places, 16 campus assets.
- **statics** — category meta, filters, feature labels, building codes, day labels.

The walk graph is built **client-side** (`src/lib/routing.ts`) exactly as the
source did; `prisma/seed.mjs` deletes-and-recreates on every run, so re-seeding
after a schema change is safe.

## Verification

Because no browser automation was available here, parity was checked with HTTP
requests, the SSR HTML diffed against the captured source page, and a production
build:

- ordered visible text: **287 vs 287 nodes, 0 mismatches**
- element histogram identical (`span 358, button 111, li 84, …`)
- building directory list identical in content **and order**
- 94 of 98 distinct `class` strings byte-identical; all lucide path data identical
- 14/14 referenced assets return 200; routes redirect/404 exactly like the source
- `npm run build` and `npm run check` both pass

Full record, tooling and the four known non-visual differences:
[`docs/research/ubicatec/verification.md`](docs/research/ubicatec/verification.md).

## Source research

See [`docs/research/ubicatec/brief.md`](docs/research/ubicatec/brief.md) for the
captured page brief (routes, layout, panels, tokens), the downloaded bundles and
the `extracted-*.json` files the seeder reads.
