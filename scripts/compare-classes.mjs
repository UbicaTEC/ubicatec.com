/** Multiset diff of class attribute values between two HTML dumps. */
import { readFile } from "node:fs/promises";

const [aPath, bPath] = process.argv.slice(2);

function classes(html) {
  const counts = new Map();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return counts;
}

const [a, b] = await Promise.all([readFile(aPath, "utf8"), readFile(bPath, "utf8")]);
const ca = classes(a);
const cb = classes(b);

const keys = [...new Set([...ca.keys(), ...cb.keys()])];
const diffs = [];
for (const k of keys) {
  const x = ca.get(k) ?? 0;
  const y = cb.get(k) ?? 0;
  if (x !== y) diffs.push({ class: k, source: x, clone: y });
}
diffs.sort((p, q) => Math.abs(q.clone - q.source) - Math.abs(p.clone - p.source));
console.log(`distinct class strings: ${keys.length}, differing: ${diffs.length}`);
console.log(JSON.stringify(diffs.slice(0, 40), null, 2));
