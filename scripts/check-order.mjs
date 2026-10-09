/** Compare the source HTML directory order against candidate orderings. */
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile("docs/research/ubicatec/extracted-app-data.json", "utf8"));
const sourceList = JSON.parse(await readFile(process.argv[2], "utf8")).map((p) => p[1]);

const keys = Object.keys(data);
console.log("top-level keys:", keys.join(", "));
const pick = (suffix) => {
  const k = keys.find((key) => key.endsWith(suffix));
  return k ? data[k] : undefined;
};
const buildings = pick("CAMPUS_BUILDINGS_TRACED") ?? pick("buildings") ?? [];
console.log("traced buildings:", buildings.length);
console.log("first traced:", JSON.stringify(buildings[0]).slice(0, 300));

// Only the first of the two duplicated blocks is compared.
const half = sourceList.length / 2;
const head = sourceList.slice(0, half);
const tracedNames = buildings.map((b) => b.name ?? b.mapLabel ?? b.id);
console.log("\norder == traced order ?", JSON.stringify(head) === JSON.stringify(tracedNames));
console.log("head[0..4]:", head.slice(0, 5));
console.log("traced[0..4]:", tracedNames.slice(0, 5));

const byName = [...head].sort((a, b) => a.localeCompare(b, "es"));
console.log("head == alphabetical ?", JSON.stringify(head) === JSON.stringify(byName));

const props = buildings[0] ? Object.keys(buildings[0]) : [];
console.log("\nbuilding props:", props.join(", "));

// Try every scalar numeric/string prop as a sort key.
for (const p of props) {
  const vals = buildings.map((b) => b[p]);
  if (vals.every((v) => typeof v === "number" || typeof v === "string" || v == null)) {
    const asc = [...buildings].sort((a, b) => (a[p] > b[p] ? 1 : a[p] < b[p] ? -1 : 0));
    const desc = [...buildings].sort((a, b) => (a[p] < b[p] ? 1 : a[p] > b[p] ? -1 : 0));
    const names = (arr) => arr.map((b) => b.name ?? b.mapLabel ?? b.id);
    if (JSON.stringify(names(asc)) === JSON.stringify(head)) console.log(`SORT MATCH asc  by ${p}`);
    if (JSON.stringify(names(desc)) === JSON.stringify(head)) console.log(`SORT MATCH desc by ${p}`);
  }
}
