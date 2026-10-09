/**
 * Extract the ordered building directory list (code, name, meta) from a dump
 * of the sidebar so we can compare sort order against the source page.
 */
import { readFile, writeFile } from "node:fs/promises";

const html = await readFile(process.argv[2], "utf8");
const items = [];
for (const m of html.matchAll(
  /<li><button type="button"[^>]*>([\s\S]*?)<\/button><\/li>/g,
)) {
  const inner = m[1].replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "\u0000");
  const parts = inner.split("\u0000").map((s) => s.trim()).filter(Boolean);
  items.push(parts);
}
console.log(JSON.stringify(items, null, 0));
if (process.argv[3]) {
  await writeFile(process.argv[3], JSON.stringify(items, null, 0), "utf8");
}
