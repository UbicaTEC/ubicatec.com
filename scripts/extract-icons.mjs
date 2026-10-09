/** Extract lucide icon <svg> blocks (class + path d) from an HTML dump. */
import { readFile } from "node:fs/promises";

const html = await readFile(process.argv[2], "utf8");
const blocks = [...html.matchAll(/<svg[^>]*class="lucide[^>]*>[\s\S]*?<\/svg>/g)].map(
  (m) => m[0],
);
const seen = new Set();
for (const b of blocks) {
  const cls = (b.match(/class="([^"]*)"/) ?? [])[1];
  const ds = [...b.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);
  const key = cls + "|" + ds.join("");
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(JSON.stringify({ cls, paths: ds }, null, 0));
}
