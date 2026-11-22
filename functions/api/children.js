
export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      { ok: false, error: "Invalid identity number" },
      { status: 400 }
    );
  }

  try {
    const parent = await env.DB.prepare(`
      SELECT
        "الاسم",
        "الاب",
        "الجد",
        "العائلة"
      FROM sgaza
      WHERE "الهوية" = ?
    `).bind(id).first();

    if (!parent) {
      return Response.json(
        { ok: true, children: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await env.DB.prepare(`
      SELECT
        "الهوية",
        "الاسم",
        "الاب",
        "الجد",
        "العائلة",
        "اسم الام",
        "تاريخ الميلاد"
      FROM sgaza
      WHERE "الاب" = ?
        AND "الجد" = ?
        AND "العائلة" = ?
        AND "العائلة" = ?
      LIMIT 100
    `).bind(
      parent["الاسم"],
      parent["الاب"],
      parent["الجد"],
      parent["العائلة"]
    ).all();

    return Response.json(
      { ok: true, children: result.results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { ok: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
