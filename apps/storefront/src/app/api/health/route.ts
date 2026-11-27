export const dynamic = "force-dynamic"

/**
 * GET /api/health: the container health check (#253). It answers from the
 * running server without rendering a page or calling the backend, so a check
 * every 15 seconds costs no page render and no backend request. The deploy's
 * smoke check still proves that a page renders.
 */
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
