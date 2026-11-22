
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url)
    .searchParams.get("id")?.trim();

  // Only allow test identities during development
  const testIds = [
    "000000001",
    "000000002",
    "000000003"
  ];

  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      {
        ok: false,
        error: "Invalid identity number"
      },
      { status: 400 }
    );
  }

  if (!testIds.includes(id)) {
    return Response.json(
      {
        ok: false,
        error: "Access denied"
      },
      { status: 403 }
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
        AND "الهوية" IN (?, ?, ?)
      LIMIT 100
    `).bind(
      parent["الاسم"],
      parent["الاب"],
      parent["العائلة"],
      id,
      ...testIds
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
