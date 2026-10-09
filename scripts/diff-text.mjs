/** Ordered text-node diff: report the first positions where two dumps diverge. */
import { readFile } from "node:fs/promises";

function visible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const [a, b] = await Promise.all([
  readFile(process.argv[2], "utf8"),
  readFile(process.argv[3], "utf8"),
]);
const av = visible(a);
const bv = visible(b);
console.log(`nodes: source=${av.length} clone=${bv.length}`);

let mismatches = 0;
for (let i = 0; i < Math.max(av.length, bv.length); i++) {
  if (av[i] !== bv[i]) {
    if (mismatches < 20) {
      console.log(`#${i}\n  source: ${JSON.stringify(av[i])}\n  clone : ${JSON.stringify(bv[i])}`);
    }
    mismatches++;
  }
}
console.log(`positional mismatches: ${mismatches}`);
