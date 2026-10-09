/** Show the raw HTML context around every occurrence of a needle in a dump. */
import { readFile } from "node:fs/promises";

const [file, needle = "niv"] = process.argv.slice(2);
const radius = Number(process.argv[4] ?? 160);
const html = await readFile(file, "utf8");
let from = 0;
let n = 0;
for (;;) {
  const i = html.indexOf(needle, from);
  if (i < 0 || n >= 6) break;
  console.log(`--- @${i} ---`);
  console.log(JSON.stringify(html.slice(Math.max(0, i - radius), i + radius)));
  from = i + needle.length;
  n++;
}
console.log(`total: ${(html.match(new RegExp(needle, "g")) ?? []).length}`);
