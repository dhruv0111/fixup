export const runtime = "nodejs";
export function GET() {
  return Response.json(
    { status: "ok", service: "fixup" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
