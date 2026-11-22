
export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      { ok: false, error: "Invalid identity number" },
      { status: 400 }
    );
  }

  try {
    const person = await env.DB.prepare(`
      SELECT
        s."الهوية",
        s."الاسم",
        s."الاب",
        s."الجد",
        s."العائلة",
        s."اسم الام",
        s."تاريخ الميلاد",
        s."الحي",
        m."اسم المحافظة"
      FROM sgaza AS s
      LEFT JOIN "المحافظات" AS m
        ON s."رمز المحافظة" = m."رقم المحافظة"
      WHERE s."الهوية" = ?
      LIMIT 1
    `).bind(id).first();

    return Response.json(
      { ok: true, person: person || null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { ok: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
