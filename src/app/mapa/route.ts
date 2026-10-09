import type { NextRequest } from "next/server";

/** Source behaviour: `/mapa` (and `/mapa?b=…`) 307-redirects to the SPA root. */
export function GET(request: NextRequest) {
  const url = new URL("/", request.url);
  url.search = request.nextUrl.search;
  return Response.redirect(url, 307);
}
