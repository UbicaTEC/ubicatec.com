/** Route matrix: status, redirect target and body prefix for a set of URLs. */
const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const ROUTES = [
  "/",
  "/mapa",
  "/mapa/",
  "/mapa?b=cetec",
  "/noticias",
  "/eventos",
  "/contacto",
  "/no-existe-xyz",
  "/favicon.ico",
  "/fonts/BigShoulders.ttf",
];

for (const route of ROUTES) {
  const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
  const buf = await res.arrayBuffer();
  const text = res.headers.get("content-type")?.startsWith("text")
    ? new TextDecoder().decode(buf.slice(0, 40)).replace(/\s+/g, " ")
    : "";
  console.log(
    [
      String(res.status).padEnd(4),
      (res.headers.get("location") ?? "-").padEnd(46),
      String(buf.byteLength).padEnd(9),
      route,
      text,
    ].join(" "),
  );
}
