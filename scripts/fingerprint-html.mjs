/**
 * Structural fingerprint of an SSR HTML dump: tag histogram plus counts of the
 * key UI landmarks we expect from the source page (rail, panels, map svg…).
 */
import { readFile } from "node:fs/promises";

const file = process.argv[2];
const html = await readFile(file, "utf8");

const tags = {};
for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b/g)) {
  tags[m[1].toLowerCase()] = (tags[m[1].toLowerCase()] ?? 0) + 1;
}
console.log(
  Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
);

const probes = {
  railButtons: (html.match(/aria-label="Ir a /g) ?? []).length,
  svgGroups: (html.match(/<g /g) ?? []).length,
  svgPaths: (html.match(/<path /g) ?? []).length,
  buildingTspans: (html.match(/data-building-id/g) ?? []).length,
  mapLabel: (html.match(/class="[^"]*sn-map-label/g) ?? []).length,
  lucideIcons: (html.match(/class="[^"]*lucide/g) ?? []).length,
  eventCards: (html.match(/sn-map-event-beacon/g) ?? []).length,
  uppercaseSenal: (html.match(/uppercase-señal/g) ?? []).length,
  shadowBrutal: (html.match(/shadow-\[4px_4px_0_var\(--tinta\)\]/g) ?? []).length,
  searchInput: (html.match(/<input[^>]*placeholder="([^"]*)"/g) ?? []),
  images: (html.match(/<img[^>]*src="([^"]*)"/g) ?? []).map((s) =>
    s.match(/src="([^"]*)"/)[1],
  ),
  dataAttrs: [...new Set((html.match(/data-[a-z-]+=/g) ?? []))].sort(),
};

console.log("\n== probes ==");
console.log(
  JSON.stringify(
    { ...probes, images: probes.images.length, imageList: probes.images },
    null,
    2,
  ),
);
