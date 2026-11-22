
export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Database binding missing" },
      { status: 503 }
    );
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sgaza) AS population,
        (SELECT COUNT(*) FROM "المحافظات") AS governorates,
        (SELECT COUNT(*) FROM "المناطق") AS regions
    `).first();

    return Response.json(
      { ok: true, counts: result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: "Database query failed" },
      { status: 500 }
    );
  }
}
