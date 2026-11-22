
"use strict";

const fields = [
  "الهوية",
  "الاسم",
  "الاب",
  "الجد",
  "العائلة",
  "اسم الام",
  "تاريخ الميلاد"
];

const personFields = [
  ...fields,
  "الحي",
  "اسم المحافظة"
];

function displayValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return String(value);
}

function renderPerson(person) {
  const container = document.getElementById("personInfo");

  container.replaceChildren();

  for (const field of personFields) {
    const item = document.createElement("div");
    item.className = "info-item";

    const label = document.createElement("strong");
    label.textContent = field;

    const value = document.createElement("span");
    value.textContent = displayValue(person[field]);

    item.append(label, value);
    container.appendChild(item);
  }
}

function renderTable(elementId, records, excludeId = null) {
  const container = document.getElementById(elementId);

  container.replaceChildren();

  const rows = Array.isArray(records)
    ? records.filter(
        row => row["الهوية"] !== excludeId
      )
    : [];

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "لا توجد سجلات مطابقة";

    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headingRow = document.createElement("tr");

  for (const field of fields) {
    const th = document.createElement("th");
    th.textContent = field;
    headingRow.appendChild(th);
  }

  thead.appendChild(headingRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const record of rows) {
    const tr = document.createElement("tr");

    for (const field of fields) {
      const td = document.createElement("td");
      td.textContent = displayValue(record[field]);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);

  container.appendChild(wrapper);
}

async function getJson(path) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      "فشل الاتصال بالخادم: " + response.status
    );
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error("لم تكتمل عملية البحث");
  }

  return data;
}

async function searchPerson(event) {
  event.preventDefault();

  const id = document
    .getElementById("identity")
    .value
    .trim();

  const status = document.getElementById("status");
  const results = document.getElementById("results");
  const button = document.getElementById("searchBtn");

  results.classList.add("hidden");

  if (!/^[0-9]{9}$/.test(id)) {
    status.textContent =
      "أدخل رقم هوية مكونًا من 9 أرقام";
    return;
  }

  button.disabled = true;
  status.textContent = "جارٍ البحث...";

  try {
    const query = "?id=" + encodeURIComponent(id);

    const personData = await getJson(
      "/api/person" + query
    );

    if (!personData.person) {
      status.textContent = "لم يتم العثور على الشخص";
      return;
    }

    renderPerson(personData.person);
    results.classList.remove("hidden");

    const [childrenResult, siblingsResult] =
      await Promise.allSettled([
        getJson("/api/children" + query),
        getJson("/api/siblings" + query)
      ]);

    if (childrenResult.status === "fulfilled") {
      renderTable(
        "children",
        childrenResult.value.children
      );
    } else {
      document.getElementById("children").textContent =
        "تعذر تحميل بيانات الأبناء";
    }

    if (siblingsResult.status === "fulfilled") {
      renderTable(
        "siblings",
        siblingsResult.value.siblings,
        id
      );
    } else {
      document.getElementById("siblings").textContent =
        "تعذر تحميل بيانات الإخوة";
    }

    status.textContent = "تم العثور على الشخص";

  } catch (error) {
    console.error("Search error:", error);
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document
  .getElementById("searchForm")
  .addEventListener("submit", searchPerson);
