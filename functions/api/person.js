
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      { ok: false, error: "Invalid identity number" },
      { status: 400 }
    );
  }

  // السماح فقط بالسجلات التجريبية خلال التطوير
  const testIds = new Set([
    "000000001",
    "000000002",
    "000000003"
  ]);

  if (!testIds.has(id)) {
    return Response.json(
      { ok: false, error: "Access denied" },
      { status: 403 }
    );
  }

  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  try {
    const person = await env.DB.prepare(`
      SELECT
        "الهوية",
        "الاسم",
        "الاب",
        "الجد",
        "العائلة",
        "اسم الام",
        "تاريخ الميلاد",
        "الحي"
      FROM sgaza
      WHERE "الهوية" = ?
    `).bind(id).first();

    return Response.json(
      { ok: true, person: person ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );

  } catch (error) {
    console.error("Person lookup failed", error);

    return Response.json(
      { ok: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
