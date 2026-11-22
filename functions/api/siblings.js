
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url)
    .searchParams.get("id")?.trim();

  // السماح بالهويات التجريبية فقط
  const testIds = [
    "000000001",
    "000000002",
    "000000003"
  ];

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

  // منع البحث خارج السجلات التجريبية
  if (!testIds.includes(id)) {
    return Response.json(
      {
        ok: false,
        error: "Access denied"
      },
      { status: 403 }
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
        AND "الهوية" IN (?, ?, ?)
      ORDER BY "تاريخ الميلاد"
      LIMIT 100
    `).bind(
      person["الاب"],
      person["الجد"],
      person["العائلة"],
      id,
      ...testIds
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
