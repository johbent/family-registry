const EXCLUDED_GOVERNORATES = [71, 72, 73, 74, 75, 76, 77, 78, 88];

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url)
    .searchParams.get("id")?.trim();

  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      {
        ok: false,
        error: "Invalid identity number"
      },
      { status: 400 }
    );
  }

  if (!env.DB) {
    return Response.json(
      {
        ok: false,
        error: "Database unavailable"
      },
      { status: 503 }
    );
  }

  try {
    const parent = await env.DB.prepare(`
      SELECT
        "الاسم",
        "الاب",
        "العائلة"
      FROM sgaza
      WHERE "الهوية" = ?
        AND COALESCE("رمز المحافظة", -1) NOT IN (${EXCLUDED_GOVERNORATES.join(",")})
    `).bind(id).first();

    if (!parent) {
      return Response.json(
        {
          ok: true,
          children: []
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
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
        AND "الهوية" <> ?
        AND COALESCE("رمز المحافظة", -1) NOT IN (${EXCLUDED_GOVERNORATES.join(",")})
      LIMIT 100
    `).bind(
      parent["الاسم"],
      parent["الاب"],
      parent["العائلة"],
      id
    ).all();

    return Response.json(
      {
        ok: true,
        children: result.results ?? []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Children lookup failed", error);

    return Response.json(
      {
        ok: false,
        error: "Search failed"
      },
      { status: 500 }
    );
  }
}
