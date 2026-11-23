const EXCLUDED_GOVERNORATES = [71, 72, 73, 74, 75, 76, 77, 78, 88];

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return Response.json(
      { ok: false, error: "Enter at least two characters" },
      { status: 400 }
    );
  }
  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  const like = `${q}%`;
  try {
    const result = await env.DB.prepare(`
      SELECT
        "الهوية", "الاسم", "الاب", "الجد", "العائلة",
        "اسم الام", "تاريخ الميلاد", "الحي"
      FROM sgaza
      WHERE COALESCE("رمز المحافظة", -1) NOT IN (${EXCLUDED_GOVERNORATES.join(",")})
        AND (
          "الهوية" = ? OR
          "الاسم" LIKE ? OR
          "الاب" LIKE ? OR
          "الجد" LIKE ? OR
          "العائلة" LIKE ?
        )
      ORDER BY "الاسم", "الهوية"
      LIMIT 75
    `).bind(q, like, like, like, like).all();

    return Response.json(
      { ok: true, people: result.results ?? [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Search failed", error);
    return Response.json(
      { ok: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
