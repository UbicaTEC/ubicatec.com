/**
 * HTTP smoke check for the local clone (no browser automation available):
 * fetches the routes, records status/redirects/lengths and saves the rendered
 * HTML next to the source dump for offline comparison.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("docs/research/ubicatec/rendered");

const ROUTES = [
  "/",
  "/mapa?b=cetec",
  "/noticias",
  "/no-existe-xyz",
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const results = [];

  for (const route of ROUTES) {
    const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
    const body = await res.text();
    const name =
      route === "/"
        ? "index.html"
        : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + ".html";
    await writeFile(path.join(OUT, name), body, "utf8");
    results.push({
      route,
      status: res.status,
      location: res.headers.get("location"),
      type: res.headers.get("content-type"),
      bytes: Buffer.byteLength(body, "utf8"),
      hasRootDiv: body.includes('id="__next"') || body.includes("<main"),
      hasDeHydrated: body.includes("self.__next_f.push") || body.includes("_next/static"),
      title: (body.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? null,
      file: name,
    });
  }

  console.log(JSON.stringify(results, null, 2));

  // Second pass: every asset the page references must resolve (200).
  const home = await (await fetch(`${BASE}/`)).text();
  const refs = new Set();
  for (const m of home.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|ttf|svg|ico|png|jpg|webp))"/g)) {
    refs.add(m[1]);
  }
  // Anything the stylesheets reference (fonts, images) too.
  for (const ref of [...refs].filter((r) => r.endsWith(".css"))) {
    const css = await (await fetch(`${BASE}${ref}`)).text();
    for (const m of css.matchAll(/url\((\/[^)"']+\.(?:ttf|woff2?|svg|png|jpg|webp))\)/g)) {
      refs.add(m[1]);
    }
  }
  const assets = [];
  for (const ref of [...refs].sort()) {
    const res = await fetch(`${BASE}${ref}`);
    assets.push({ ref, status: res.status, bytes: Number(res.headers.get("content-length") ?? 0) });
    await res.arrayBuffer();
  }
  const bad = assets.filter((a) => a.status !== 200);
  console.log(`\nassets checked: ${assets.length}, failing: ${bad.length}`);
  if (bad.length) console.log(JSON.stringify(bad, null, 2));
}

await main();
