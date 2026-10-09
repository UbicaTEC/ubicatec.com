/**
 * Strip tags/scripts from two rendered HTML dumps and diff the visible text so
 * we can compare the clone against the captured source page without a browser.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const aPath = process.argv[2];
const bPath = process.argv[3];

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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const [a, b] = await Promise.all([readFile(aPath, "utf8"), readFile(bPath, "utf8")]);
const av = visible(a);
const bv = visible(b);

console.log(`A (${path.basename(aPath)}): ${av.length} text nodes`);
console.log(`B (${path.basename(bPath)}): ${bv.length} text nodes`);

const aset = new Set(av);
const bset = new Set(bv);
const onlyA = [...new Set(av)].filter((t) => !bset.has(t));
const onlyB = [...new Set(bv)].filter((t) => !aset.has(t));

console.log(`\n== only in A (${onlyA.length}) ==`);
console.log(onlyA.slice(0, 60).join("\n"));
console.log(`\n== only in B (${onlyB.length}) ==`);
console.log(onlyB.slice(0, 60).join("\n"));
