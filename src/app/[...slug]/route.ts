/** Source behaviour: unknown routes return a plain-text 404. */
export function GET() {
  return new Response("No encontrado.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function POST() {
  return GET();
}
