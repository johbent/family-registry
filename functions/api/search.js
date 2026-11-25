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
  const numericQuery = /^\d+$/.test(q);
  const normalizedId = numericQuery
    ? q.replace(/^0+(?=\d)/, "")
    : q;
  const paddedId = numericQuery
    ? q.padStart(9, "0")
    : q;
  const nameParts = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const nameFields = ["الاسم", "الاب", "الجد", "العائلة"];
  const fullNameClause = nameParts.length > 1
    ? nameParts
        .map((_, index) => `"${nameFields[index]}" LIKE ?`)
        .join(" AND ")
    : "0";
  try {
    const result = await env.DB.prepare(`
      SELECT
        "الهوية", "الاسم", "الاب", "الجد", "العائلة",
        "اسم الام", "تاريخ الميلاد", "الحي"
      FROM sgaza
      WHERE COALESCE("رمز المحافظة", -1) NOT IN (${EXCLUDED_GOVERNORATES.join(",")})
        AND (
          "الهوية" IN (?, ?, ?) OR
          "الاسم" LIKE ? OR
          "الاب" LIKE ? OR
          "الجد" LIKE ? OR
          "العائلة" LIKE ? OR
          (${fullNameClause})
        )
      ORDER BY "الاسم", "الهوية"
      LIMIT 75
    `).bind(
      q, normalizedId, paddedId,
      like, like, like, like,
      ...nameParts.map(part => `${part}%`)
    ).all();

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
