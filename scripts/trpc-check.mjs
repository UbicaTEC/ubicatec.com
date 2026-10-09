/** Exercise the tRPC HTTP endpoint directly (independent of the RSC prefetch). */
const BASE = process.env.BASE_URL ?? "http://localhost:3002";

const res = await fetch(`${BASE}/api/trpc/campus.bootstrap`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ json: null }),
});
const text = await res.text();
console.log("status:", res.status, "type:", res.headers.get("content-type"));
console.log("bytes:", Buffer.byteLength(text, "utf8"));
try {
  const parsed = JSON.parse(text);
  const result = parsed.result?.data?.json ?? parsed.result?.data ?? parsed;
  console.log("top-level keys:", Object.keys(result).join(", "));
  console.log(
    JSON.stringify({
      buildings: result.buildings?.length,
      entrances: result.entrances?.length,
      events: result.events?.length,
      posts: result.posts?.length,
      roads: result.geometry?.roads?.length,
      walkPaths: result.geometry?.walkGraph?.paths?.length,
      obstacles: result.geometry?.obstacles?.length,
      firstBuilding: result.buildings?.[0]?.name,
      firstBuildingCode: result.buildings?.[0]?.code,
    }),
  );
} catch (err) {
  console.log("body head:", text.slice(0, 300));
}
