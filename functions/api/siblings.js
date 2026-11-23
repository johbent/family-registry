const EXCLUDED_GOVERNORATES = [71, 72, 73, 74, 75, 76, 77, 78, 88];

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url)
    .searchParams.get("id")?.trim();

  // التحقق من رقم الهوية
  if (!id || !/^\d{9}$/.test(id)) {
    return Response.json(
      {
        ok: false,
        error: "Invalid identity number"
      },
      { status: 400 }
    );
  }

  // التحقق من اتصال قاعدة البيانات
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
    // جلب بيانات الشخص
    const person = await env.DB.prepare(`
      SELECT
        "الهوية",
        "الاب",
        "الجد",
        "العائلة"
      FROM sgaza
      WHERE "الهوية" = ?
        AND COALESCE("رمز المحافظة", -1) NOT IN (${EXCLUDED_GOVERNORATES.join(",")})
    `).bind(id).first();

    if (!person) {
      return Response.json(
        {
          ok: true,
          siblings: []
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // البحث عن الإخوة واستبعاد الشخص نفسه
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
      ORDER BY "تاريخ الميلاد"
      LIMIT 100
    `).bind(
      person["الاب"],
      person["الجد"],
      person["العائلة"],
      id
    ).all();

    return Response.json(
      {
        ok: true,
        siblings: result.results ?? []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Siblings lookup failed", error);

    return Response.json(
      {
        ok: false,
        error: "Search failed"
      },
      { status: 500 }
    );
  }
}
