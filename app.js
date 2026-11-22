
'use strict';

// ======================================
// Family Registry - app.js
// Cloudflare D1 + Local CSV
// ======================================

const $ = id => document.getElementById(id);

let people = [];
let shown = [];
let chosen = null;
let page = 0;
let csvRows = [];
let headers = [];

let cache = new Map();
let childrenMap = new Map();
let nameMap = new Map();

let dataSource = 'remote';
let lookupSequence = 0;

const LIMIT = 75;

// ======================================
// Field names and CSV mappings
// ======================================

const labels = {
  id: 'معرّف الشخص (ضروري)',
  name: 'الاسم الكامل',
  first: 'الاسم الأول',
  fatherName: 'اسم الأب (نص)',
  grandfather: 'اسم الجد',
  family: 'العائلة / الحمولة',
  fatherId: 'معرّف الأب',
  motherId: 'معرّف الأم',
  motherName: 'اسم الأم (نص)',
  gender: 'الجنس',
  birth: 'سنة / تاريخ الميلاد',
  notes: 'ملاحظات'
};

const aliases = {
  id: [
    'id', 'personid', 'رقم',
    'رقم السجل', 'رقم الشخص',
    'الرقم', 'مسلسل', 'الرقم الشخصي',
    'الهوية'
  ],
  name: [
    'name', 'fullname', 'الاسم الكامل',
    'اسم الشخص', 'الاسم الرباعي', 'الاسم'
  ],
  first: [
    'firstname', 'الاسم الاول', 'الاسم الأول'
  ],
  fatherName: [
    'اسم الاب', 'اسم الأب', 'الاب'
  ],
  grandfather: [
    'اسم الجد', 'الجد'
  ],
  family: [
    'family', 'العائلة', 'اسم العائلة',
    'الحمولة', 'اللقب'
  ],
  fatherId: [
    'fatherid', 'رقم الاب', 'رقم الأب',
    'معرف الاب', 'معرف الأب'
  ],
  motherId: [
    'motherid', 'رقم الام', 'رقم الأم',
    'معرف الام', 'معرف الأم'
  ],
  motherName: [
    'mothername', 'اسم الام', 'اسم الأم'
  ],
  gender: ['gender', 'الجنس'],
  birth: [
    'birth', 'الميلاد',
    'تاريخ الميلاد', 'سنة الميلاد'
  ],
  notes: ['notes', 'ملاحظات']
};

// ======================================
// Text utilities
// ======================================

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );
}

// ======================================
// CSV parser
// ======================================

function parseCSV(t) {
  t = t.replace(/^\uFEFF/, '');

  let rows = [];
  let row = [];
  let s = '';
  let quote = false;

  for (let i = 0; i < t.length; i++) {
    let c = t[i];

    if (c === '"') {
      if (quote && t[i + 1] === '"') {
        s += '"';
        i++;
      } else {
        quote = !quote;
      }
    } else if (c === ',' && !quote) {
      row.push(s);
      s = '';
    } else if (
      (c === '\n' || c === '\r') && !quote
    ) {
      if (c === '\r' && t[i + 1] === '\n') {
        i++;
      }

      row.push(s);
      s = '';

      if (row.some(x => x.trim())) {
        rows.push(row);
      }

      row = [];
    } else {
      s += c;
    }
  }

  row.push(s);

  if (row.some(x => x.trim())) {
    rows.push(row);
  }

  return rows;
}

// ======================================
// Local IndexedDB
// ======================================

const dbp = new Promise((resolve, reject) => {
  const q = indexedDB.open('families-local-v1', 1);

  q.onupgradeneeded = () => {
    q.result.createObjectStore('data');
  };

  q.onsuccess = () => resolve(q.result);
  q.onerror = () => reject(q.error);
});

async function saveData() {
  const db = await dbp;

  await new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');

    tx.objectStore('data').put(people, 'people');

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadData() {
  const db = await dbp;

  return new Promise((resolve, reject) => {
    const q = db
      .transaction('data', 'readonly')
      .objectStore('data')
      .get('people');

    q.onsuccess = () => resolve(q.result || []);
    q.onerror = () => reject(q.error);
  });
}

// ======================================
// Build indexes
// ======================================

function index() {
  cache = new Map();
  nameMap = new Map();
  childrenMap = new Map();

  for (const p of people) {
    cache.set(String(p.id), p);

    const key = norm(p.name);

    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }

    nameMap.get(key).push(p);

    for (const type of ['fatherId', 'motherId']) {
      const id = p[type];

      if (id) {
        if (!childrenMap.has(id)) {
          childrenMap.set(id, []);
        }

        childrenMap.get(id).push(p);
      }
    }
  }

  const fs = [
    ...new Set(
      people.map(p => p.family).filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, 'ar'));

  const familyFilter = $('familyFilter');
  const old = familyFilter.value;

  familyFilter.innerHTML =
    '<option value="">كل العائلات</option>' +
    fs.map(f =>
      `<option value="${esc(f)}">${esc(f)}</option>`
    ).join('');

  familyFilter.value = fs.includes(old) ? old : '';

  $('peopleCount').textContent =
    people.length.toLocaleString('ar');

  $('familiesCount').textContent =
    fs.length.toLocaleString('ar');

  filter();
}

// ======================================
// Search and filter
// ======================================

function filter() {
  const q = norm($('search').value);
  const f = $('familyFilter').value;

  shown = people.filter(p => {
    const familyMatches = !f || p.family === f;

    const searchMatches =
      dataSource === 'remote' ||
      !q ||
      norm([
        p.name,
        p.family,
        p.id,
        p.fatherName,
        p.motherName
      ].join(' ')).includes(q);

    return familyMatches && searchMatches;
  });

  page = 0;
  renderList();
}

// ======================================
// Results list
// ======================================

function renderList() {
  const start = page * LIMIT;
  const chunk = shown.slice(start, start + LIMIT);

  $('resultCount').textContent =
    shown.length.toLocaleString('ar');

  $('results').innerHTML = chunk.length
    ? chunk.map(p => `
      <button
        class="person ${chosen === p.id ? 'selected' : ''}"
        data-id="${esc(p.id)}"
      >
        <b>${esc(p.name)}</b>
        <small>
          ${esc([p.family, p.birth].filter(Boolean).join(' · '))}
          | رقم السجل: ${esc(p.id)}
        </small>
      </button>
    `).join('')
    : '<p class="muted">لا توجد نتائج.</p>';

  $('pagerLabel').textContent = shown.length
    ? `${page + 1} / ${Math.ceil(shown.length / LIMIT)}`
    : '0 / 0';

  $('prev').disabled = page === 0;

  $('next').disabled =
    (page + 1) * LIMIT >= shown.length;

  document.querySelectorAll('.person').forEach(b => {
    b.onclick = () => show(b.dataset.id);
  });
}

// ======================================
// Family relationships
// ======================================

function relatedPeople(p, kind) {
  let arr = [];

  if (kind === 'father') {
    if (p.fatherId && cache.has(p.fatherId)) {
      arr = [cache.get(p.fatherId)];
    } else if (p.fatherName) {
      const x = nameMap.get(norm(p.fatherName)) || [];
      if (x.length === 1) arr = x;
    }
  }

  if (kind === 'mother') {
    if (p.motherId && cache.has(p.motherId)) {
      arr = [cache.get(p.motherId)];
    } else if (p.motherName) {
      const x = nameMap.get(norm(p.motherName)) || [];
      if (x.length === 1) arr = x;
    }
  }

  if (kind === 'children') {
    arr = childrenMap.get(p.id) || [];
  }

  if (kind === 'siblings') {
    const rel = new Map();

    for (const id of [p.fatherId, p.motherId]) {
      if (!id) continue;

      for (const x of childrenMap.get(id) || []) {
        if (x.id !== p.id) {
          rel.set(x.id, x);
        }
      }
    }

    arr = [...rel.values()];
  }

  return arr;
}

function cards(arr, empty) {
  if (!arr.length) {
    return `<p class="muted">${
      esc(empty || 'لا يوجد رابط مثبت في البيانات.')
    }</p>`;
  }

  return arr.slice(0, 300).map(x => `
    <div class="relation" data-go="${esc(x.id)}">
      ${esc(x.name)}
      <small>${esc(x.family || '')}</small>
    </div>
  `).join('') +
  (arr.length > 300
    ? '<p class="hint">عرض أول 300 سجل.</p>'
    : '');
}

// ======================================
// Person details and tree
// ======================================

function show(id) {
  const p = cache.get(String(id));

  if (!p) return;

  chosen = p.id;
  renderList();

  const dad = relatedPeople(p, 'father');
  const mom = relatedPeople(p, 'mother');
  const siblings = relatedPeople(p, 'siblings');
  const children = relatedPeople(p, 'children');

  const info = [
    ['رقم السجل', p.id],
    ['العائلة', p.family],
    ['اسم الأب', p.fatherName],
    ['اسم الأم', p.motherName],
    ['الجنس', p.gender],
    ['الميلاد', p.birth],
    ['ملاحظات', p.notes]
  ].filter(x => x[1]);

  $('profile').innerHTML = `
    <h2>${esc(p.name)}</h2>

    <div>
      ${info.map(x => `
        <span class="pill">
          ${esc(x[0])}: ${esc(x[1])}
        </span>
      `).join('')}
    </div>

    <h3 class="sectiontitle">
      شجرة العائلة المبسطة
    </h3>

    <div class="tree">
      <div>
        ${dad.map(x => `
          <span class="node" data-go="${esc(x.id)}">
            الأب: ${esc(x.name)}
          </span>
        `).join('') || `
          <span class="node">
            الأب: ${esc(p.fatherName || 'غير معروف')}
          </span>
        `}

        ${mom.map(x => `
          <span class="node" data-go="${esc(x.id)}">
            الأم: ${esc(x.name)}
          </span>
        `).join('') || `
          <span class="node">
            الأم: ${esc(p.motherName || 'غير معروفة')}
          </span>
        `}
      </div>

      <div class="tree-line"></div>

      <div class="node main">
        ${esc(p.name)}
      </div>

      <div class="tree-line"></div>

      <div>
        ${children.slice(0, 30).map(x => `
          <span class="node" data-go="${esc(x.id)}">
            ${esc(x.name)}
          </span>
        `).join('') ||
        '<small class="muted">لا يوجد أبناء مرتبطون</small>'}
      </div>
    </div>

    <h3 class="sectiontitle">الأب</h3>
    ${cards(dad, p.fatherName
      ? 'الاسم محفوظ نصيًا، لكن لم يتطابق مع سجل شخص.'
      : 'غير مدوّن')}

    <h3 class="sectiontitle">الأم</h3>
    ${cards(mom, p.motherName
      ? 'الاسم محفوظ نصيًا، لكن لم يتطابق مع سجل شخص.'
      : 'غير مدوّنة')}

    <h3 class="sectiontitle">
      الإخوة والأخوات (${siblings.length})
    </h3>
    ${cards(siblings)}

    <h3 class="sectiontitle">
      الأبناء (${children.length})
    </h3>
    ${cards(children)}
  `;

  document.querySelectorAll('[data-go]').forEach(el => {
    el.onclick = () => show(el.dataset.go);
  });

  $('profile').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// ======================================
// Remote D1 lookup
// ======================================

function resetRemoteResults(message) {
  people = [];
  chosen = null;

  index();

  $('profile').innerHTML = `
    <h2>بيانات الشخص</h2>
    <p class="muted">
      اختر شخصًا من القائمة لعرض بياناته وصلات القرابة.
    </p>
  `;

  $('status').textContent = message;
}

async function lookupPerson() {
  const sequence = ++lookupSequence;
  const id = $('search').value.trim();

  if (!/^\d{9}$/.test(id)) {
    resetRemoteResults(
      'أدخل رقم هوية تجريبيًا من 9 أرقام.'
    );
    return;
  }

  $('status').textContent =
    'جارٍ البحث عن السجل التجريبي...';

  try {
    const response = await fetch(
      '/api/person?id=' + encodeURIComponent(id),
      {
        cache: 'no-store',
        credentials: 'same-origin'
      }
    );

    const data = await response.json();

    if (
      sequence !== lookupSequence ||
      dataSource !== 'remote'
    ) {
      return;
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'فشل البحث');
    }

    if (!data.person) {
      resetRemoteResults(
        'لا يوجد سجل تجريبي مطابق.'
      );
      return;
    }

    const p = data.person;

    people = [{
      id: String(p['الهوية'] ?? id),
      name: String(p['الاسم'] ?? ''),
      first: '',
      fatherName: String(p['الاب'] ?? ''),
      grandfather: String(p['الجد'] ?? ''),
      family: String(p['العائلة'] ?? ''),
      fatherId: '',
      motherId: '',
      motherName: String(p['اسم الام'] ?? ''),
      gender: '',
      birth: String(p['تاريخ الميلاد'] ?? ''),
      notes: ''
    }];

    chosen = null;

    index();
    show(people[0].id);

    $('status').textContent =
      'تم العثور على سجل تجريبي في Cloudflare D1.';

  } catch (error) {
    if (
      sequence !== lookupSequence ||
      dataSource !== 'remote'
    ) {
      return;
    }

    resetRemoteResults(
      error.message === 'Access denied'
        ? 'رقم الهوية غير مصرح به في وضع الاختبار.'
        : 'تعذر البحث: ' + error.message
    );
  }
}

// ======================================
// Search, filtering and pagination
// ======================================

$('search').oninput = () => {
  if (dataSource === 'local') {
    filter();
  } else {
    lookupPerson();
  }
};

$('familyFilter').onchange = filter;

$('prev').onclick = () => {
  if (page > 0) {
    page--;
    renderList();
  }
};

$('next').onclick = () => {
  if ((page + 1) * LIMIT < shown.length) {
    page++;
    renderList();
  }
};

// ======================================
// CSV import
// ======================================

$('importBtn').onclick = () => {
  $('importPanel').style.display = 'block';
};

$('closeImport').onclick = () => {
  $('importPanel').style.display = 'none';
};

$('readFile').onclick = async () => {
  const f = $('csvFile').files[0];

  if (!f) {
    return alert('اختر CSV أولًا');
  }

  try {
    const txt = new TextDecoder(
      $('encoding').value
    ).decode(await f.arrayBuffer());

    const rows = parseCSV(txt);

    if (rows.length < 2) {
      throw Error('الملف لا يحتوي على صفوف بيانات');
    }

    headers = rows[0].map(
      (h, i) => h.trim() || 'عمود ' + (i + 1)
    );

    csvRows = rows.slice(1);

    $('importInfo').textContent =
      `عدد الصفوف: ${csvRows.length.toLocaleString('ar')}` +
      ` | عدد الأعمدة: ${headers.length}`;

    $('mapArea').innerHTML =
      Object.entries(labels).map(([key, label]) => {
        const options =
          '<option value="">— غير موجود —</option>' +
          headers.map((h, i) =>
            `<option value="${i}">${esc(h)}</option>`
          ).join('');

        return `
          <label>
            ${label}
            <select id="map-${key}">
              ${options}
            </select>
          </label>
        `;
      }).join('');

    for (const key of Object.keys(labels)) {
      const i = headers.findIndex(h =>
        (aliases[key] || []).some(
          a => norm(a) === norm(h)
        )
      );

      if (i >= 0) {
        $('map-' + key).value = String(i);
      }
    }

    $('saveImport').classList.remove('hidden');

  } catch (e) {
    alert('تعذرت القراءة: ' + e.message);
  }
};

$('saveImport').onclick = async () => {
  const fields = Object.keys(labels);

  const map = Object.fromEntries(
    fields.map(x => [x, $('map-' + x).value])
  );

  if (map.name === '' && map.first === '') {
    return alert('اربط عمود الاسم الكامل أو الاسم الأول');
  }

  if (map.id === '') {
    return alert('يجب ربط عمود معرّف ثابت للشخص');
  }

  if (!confirm(
    'سيتم استبدال البيانات المحفوظة حاليًا في هذا المتصفح. متابعة؟'
  )) {
    return;
  }

  const temp = [];
  const ids = new Set();
  let dup = 0;

  for (const r of csvRows) {
    const p = {};

    for (const k of fields) {
      p[k] = map[k] === ''
        ? ''
        : String(r[Number(map[k])] ?? '').trim();
    }

    if (!p.id) continue;

    if (ids.has(p.id)) {
      dup++;
      continue;
    }

    ids.add(p.id);

    p.name = p.name || [
      p.first,
      p.fatherName,
      p.grandfather,
      p.family
    ].filter(Boolean).join(' ');

    if (!p.name) continue;

    temp.push(p);
  }

  if (!temp.length) {
    return alert('لم تُقرأ سجلات صالحة');
  }

  dataSource = 'local';
  lookupSequence++;

  people = temp;
  chosen = null;

  await saveData();
  $('search').value = '';

  index();

  $('status').textContent =
    'البيانات مستوردة محليًا داخل هذا المتصفح.';

  $('importPanel').style.display = 'none';

  alert(
    `تم استيراد ${temp.length} سجل.` +
    (dup
      ? ` تجاهل مكررات رقم السجل: ${dup}`
      : '')
  );
};

// ======================================
// JSON backup
// ======================================

$('backupBtn').onclick = () => {
  if (!people.length) {
    return alert('لا توجد بيانات');
  }

  const b = new Blob(
    [JSON.stringify({ version: 1, people })],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(b);
  const a = document.createElement('a');

  a.href = url;
  a.download = 'family-registry-backup.json';
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

// ======================================
// Restore JSON
// ======================================

$('restoreBtn').onclick = () => {
  $('restoreFile').click();
};

$('restoreFile').onchange = async e => {
  try {
    const file = e.target.files[0];

    if (!file) return;

    const x = JSON.parse(await file.text());
    const arr = Array.isArray(x) ? x : x.people;

    if (
      !Array.isArray(arr) ||
      arr.some(p =>
        !p ||
        typeof p.id !== 'string' ||
        typeof p.name !== 'string'
      )
    ) {
      throw Error('صيغة بيانات غير صحيحة');
    }

    if (!confirm(
      'سيتم استبدال البيانات الموجودة محليًا. متابعة؟'
    )) {
      return;
    }

    dataSource = 'local';
    lookupSequence++;

    people = arr;
    chosen = null;
    $('search').value = '';

    await saveData();

    index();

    $('status').textContent =
      'تمت استعادة السجلات داخل هذا المتصفح.';

    alert('تمت الاستعادة');

  } catch (err) {
    alert(err.message);
  }
};

// ======================================
// Delete local records
// ======================================

$('eraseBtn').onclick = async () => {
  if (!confirm(
    'هل تريد حذف جميع السجلات المحلية من هذا المتصفح؟'
  )) {
    return;
  }

  people = [];
  chosen = null;

  await saveData();

  index();

  $('profile').innerHTML = `
    <h2>بيانات الشخص</h2>
    <p class="muted">لا توجد بيانات.</p>
  `;

  $('status').textContent =
    'تم حذف البيانات المحلية من المتصفح فقط.';
};

// ======================================
// Initialization
// ======================================

// Do not automatically load local records.
// The default mode tests Cloudflare D1.
// CSV and JSON import switch to local mode.

resetRemoteResults(
  'البحث من Cloudflare D1 متاح حاليًا للسجلات التجريبية المصرح بها فقط.'
);
