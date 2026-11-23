
'use strict';

const $ = id => document.getElementById(id);
const LIMIT = 75;
const TEST_IDS = new Set(['000000001', '000000002', '000000003']);

let people = [], shown = [], chosen = null, page = 0;
let csvRows = [], headers = [], dataSource = 'remote';
let cache = new Map(), nameMap = new Map(), childrenMap = new Map();
let lookupSequence = 0, detailSequence = 0;

// =====================================
// CSV field configuration
// =====================================

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
  id: ['id','personid','رقم','رقم السجل','رقم الشخص','الرقم','مسلسل','الرقم الشخصي','الهوية'],
  name: ['name','fullname','الاسم الكامل','اسم الشخص','الاسم الرباعي','الاسم'],
  first: ['firstname','الاسم الاول','الاسم الأول'],
  fatherName: ['اسم الاب','اسم الأب','الاب'],
  grandfather: ['اسم الجد','الجد'],
  family: ['family','العائلة','اسم العائلة','الحمولة','اللقب'],
  fatherId: ['fatherid','رقم الاب','رقم الأب','معرف الاب','معرف الأب'],
  motherId: ['motherid','رقم الام','رقم الأم','معرف الام','معرف الأم'],
  motherName: ['mothername','اسم الام','اسم الأم'],
  gender: ['gender','الجنس'],
  birth: ['birth','الميلاد','تاريخ الميلاد','سنة الميلاد'],
  notes: ['notes','ملاحظات']
};

// =====================================
// Text utilities
// =====================================

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

// =====================================
// CSV parser
// =====================================

function parseCSV(t) {
  t = t.replace(/^\uFEFF/, '');

  const rows = [];
  let row = [], s = '', quote = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];

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
    } else if ((c === '\n' || c === '\r') && !quote) {
      if (c === '\r' && t[i + 1] === '\n') i++;

      row.push(s);
      s = '';

      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else {
      s += c;
    }
  }

  row.push(s);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

// =====================================
// IndexedDB - local data
// =====================================

const dbp = new Promise((resolve, reject) => {
  const q = indexedDB.open('families-local-v1', 1);

  q.onupgradeneeded = () => {
    if (!q.result.objectStoreNames.contains('data')) {
      q.result.createObjectStore('data');
    }
  };

  q.onsuccess = () => resolve(q.result);
  q.onerror = () => reject(q.error);
});

async function saveData() {
  const db = await dbp;

  await new Promise((res, rej) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').put(people, 'people');
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function loadData() {
  const db = await dbp;

  return new Promise((res, rej) => {
    const q = db.transaction('data', 'readonly')
      .objectStore('data').get('people');

    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
}

// =====================================
// Index people
// =====================================

function index() {
  cache = new Map();
  nameMap = new Map();
  childrenMap = new Map();

  for (const p of people) {
    p.id = String(p.id);
    cache.set(p.id, p);

    const k = norm(p.name);

    if (!nameMap.has(k)) nameMap.set(k, []);
    nameMap.get(k).push(p);

    for (const type of ['fatherId', 'motherId']) {
      const id = String(p[type] || '');
      if (!id) continue;

      if (!childrenMap.has(id)) childrenMap.set(id, []);
      childrenMap.get(id).push(p);
    }
  }

  const fs = [
    ...new Set(people.map(p => p.family).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b, 'ar'));

  const old = $('familyFilter').value;

  $('familyFilter').innerHTML =
    '<option value="">كل العائلات</option>' +
    fs.map(f =>
      `<option value="${esc(f)}">${esc(f)}</option>`
    ).join('');

  $('familyFilter').value = fs.includes(old) ? old : '';

  $('peopleCount').textContent =
    people.length.toLocaleString('ar');

  $('familiesCount').textContent =
    fs.length.toLocaleString('ar');

  filter();
}

function filter() {
  const q = norm($('search').value);
  const f = $('familyFilter').value;

  shown = people.filter(p =>
    (!f || p.family === f) &&
    (
      dataSource === 'remote' ||
      !q ||
      norm([
        p.name, p.family, p.id,
        p.fatherName, p.motherName
      ].join(' ')).includes(q)
    )
  );

  page = 0;
  renderList();
}

function renderList() {
  const chunk = shown.slice(page * LIMIT, (page + 1) * LIMIT);

  $('resultCount').textContent =
    shown.length.toLocaleString('ar');

  $('results').innerHTML = chunk.length
    ? chunk.map(p => `
      <button class="person ${chosen === p.id ? 'selected' : ''}"
        data-id="${esc(p.id)}">
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
  $('next').disabled = (page + 1) * LIMIT >= shown.length;

  document.querySelectorAll('.person').forEach(b => {
    b.onclick = () => show(b.dataset.id);
  });
}

// =====================================
// Convert D1 record
// =====================================

function fromD1(p) {
  return {
    id: String(p['الهوية'] ?? ''),
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
  };
}

// =====================================
// Local family relationships
// =====================================

function localRelated(p, kind) {
  if (kind === 'father') {
    if (p.fatherId && cache.has(p.fatherId)) {
      return [cache.get(p.fatherId)];
    }

    const a = nameMap.get(norm(p.fatherName)) || [];
    return p.fatherName && a.length === 1 ? a : [];
  }

  if (kind === 'mother') {
    if (p.motherId && cache.has(p.motherId)) {
      return [cache.get(p.motherId)];
    }

    const a = nameMap.get(norm(p.motherName)) || [];
    return p.motherName && a.length === 1 ? a : [];
  }

  if (kind === 'children') {
    return childrenMap.get(p.id) || [];
  }

  if (kind === 'siblings') {
    const m = new Map();

    for (const id of [p.fatherId, p.motherId]) {
      if (!id) continue;

      for (const x of childrenMap.get(id) || []) {
        if (x.id !== p.id) m.set(x.id, x);
      }
    }

    return [...m.values()];
  }

  return [];
}

// =====================================
// Family cards
// =====================================

function cards(arr, empty) {
  if (!arr.length) {
    return `<p class="muted">${esc(
      empty || 'لا يوجد رابط مثبت في البيانات.'
    )}</p>`;
  }

  return arr.slice(0, 100).map(x => `
    <div class="relation" data-go="${esc(x.id)}">
      ${esc(x.name)}
      <small>${esc(x.family || '')}</small>
    </div>
  `).join('') +
  (arr.length > 100
    ? '<p class="hint">عرض أول 100 سجل.</p>'
    : '');
}

// =====================================
// Render family tree
// =====================================

function renderProfile(
  p, children = [], siblings = [],
  dad = [], mom = [], loading = false
) {
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

    <h3 class="sectiontitle">شجرة العائلة المبسطة</h3>

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
        `).join('') || (
          loading
            ? '<small class="muted">جارٍ تحميل الأبناء...</small>'
            : '<small class="muted">لا يوجد أبناء مطابقون</small>'
        )}
      </div>
    </div>

    <h3 class="sectiontitle">الأب</h3>
    ${cards(
      dad,
      p.fatherName
        ? 'اسم الأب معروف، لكن سجل الأب غير مرتبط.'
        : 'غير مدوّن'
    )}

    <h3 class="sectiontitle">الأم</h3>
    ${cards(
      mom,
      p.motherName
        ? 'اسم الأم معروف، لكن سجل الأم غير مرتبط.'
        : 'غير مدوّنة'
    )}

    <h3 class="sectiontitle">
      الإخوة والأخوات (${siblings.length})
    </h3>
    ${loading
      ? '<p class="muted">جارٍ التحميل...</p>'
      : cards(siblings)}

    <h3 class="sectiontitle">
      الأبناء (${children.length})
    </h3>
    ${loading
      ? '<p class="muted">جارٍ التحميل...</p>'
      : cards(children)}

    ${dataSource === 'remote'
      ? '<p class="hint">العلاقات مستنتجة من تطابق الأسماء وليست إثباتًا رسميًا للقرابة.</p>'
      : ''}
  `;

  $('profile').querySelectorAll('[data-go]').forEach(el => {
    el.onclick = () => goToPerson(el.dataset.go);
  });
}

// =====================================
// Cloudflare D1 API
// =====================================

async function apiGet(path, id) {
  const response = await fetch(
    `${path}?id=${encodeURIComponent(id)}`,
    {
      cache: 'no-store',
      credentials: 'same-origin'
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw Error(data.error || 'Search failed');
  }

  return data;
}

async function apiSearch(query) {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}`,
    { cache: 'no-store', credentials: 'same-origin' }
  );
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw Error(data.error || 'Search failed');
  }
  return data;
}

// =====================================
// Show person and relationships
// =====================================

async function show(id) {
  const p = cache.get(String(id));
  if (!p) return;

  chosen = p.id;
  renderList();

  const sequence = ++detailSequence;

  if (dataSource === 'local') {
    renderProfile(
      p,
      localRelated(p, 'children'),
      localRelated(p, 'siblings'),
      localRelated(p, 'father'),
      localRelated(p, 'mother')
    );
  } else {
    renderProfile(p, [], [], [], [], true);

    const results = await Promise.allSettled([
      apiGet('/api/children', p.id),
      apiGet('/api/siblings', p.id)
    ]);

    if (
      sequence !== detailSequence ||
      dataSource !== 'remote'
    ) return;

    const children = results[0].status === 'fulfilled'
      ? (results[0].value.children || []).map(fromD1)
      : [];

    const siblings = results[1].status === 'fulfilled'
      ? (results[1].value.siblings || [])
          .filter(x => String(x['الهوية']) !== p.id)
          .map(fromD1)
      : [];

    renderProfile(p, children, siblings);

    if (results.some(r => r.status === 'rejected')) {
      $('status').textContent =
        'تم عرض الشخص، لكن تعذر تحميل بعض روابط القرابة.';
    }
  }

  $('profile').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// =====================================
// Navigate between family members
// =====================================

async function goToPerson(id) {
  if (dataSource === 'local') {
    show(id);
    return;
  }

  $('search').value = id;
  await lookupPerson(id);
}

// =====================================
// Reset remote results
// =====================================

function resetRemote(message) {
  ++detailSequence;

  people = [];
  chosen = null;
  index();

  $('profile').innerHTML = `
    <h2>بيانات الشخص</h2>
    <p class="muted">
      اكتب اسمًا أو رقم الهوية لعرض شجرة العائلة.
    </p>
  `;

  $('status').textContent = message;
}

// =====================================
// Search for a person in D1
// =====================================

async function lookupPerson(inputId) {
  const sequence = ++lookupSequence;
  const query = String(inputId ?? $('search').value).trim();

  if (query.length < 2) {
    resetRemote('اكتب اسمًا أو رقم هوية من رقمين على الأقل.');
    return;
  }

  $('status').textContent =
    'جارٍ البحث في Cloudflare D1...';

  try {
    const data = await apiSearch(query);

    if (
      sequence !== lookupSequence ||
      dataSource !== 'remote'
    ) return;

    if (!data.people?.length) {
      resetRemote('لم يُعثر على نتائج مطابقة.');
      return;
    }

    people = data.people.map(fromD1);
    chosen = null;
    index();

    $('status').textContent =
      `تم العثور على ${people.length.toLocaleString('ar')} نتيجة.`;

  } catch (e) {
    if (
      sequence !== lookupSequence ||
      dataSource !== 'remote'
    ) return;

    resetRemote('تعذر البحث: ' + e.message);
  }
}

// =====================================
// UI event handlers
// =====================================

$('search').oninput = () => {
  if (dataSource === 'local') filter();
  else lookupPerson();
};

$('familyFilter').onchange = filter;

$('prev').onclick = () => {
  if (page) {
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

$('importBtn').onclick = () => {
  $('importPanel').style.display = 'block';
};

$('closeImport').onclick = () => {
  $('importPanel').style.display = 'none';
};

// =====================================
// Read CSV file
// =====================================

$('readFile').onclick = async () => {
  const f = $('csvFile').files[0];

  if (!f) return alert('اختر CSV أولًا');

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
            ${esc(label)}
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

// =====================================
// Save CSV into local browser
// =====================================

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
    'سيتم استبدال البيانات المحفوظة في هذا المتصفح فقط. متابعة؟'
  )) return;

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

    if (p.name) temp.push(p);
  }

  if (!temp.length) {
    return alert('لم تُقرأ سجلات صالحة');
  }

  ++lookupSequence;
  ++detailSequence;

  dataSource = 'local';
  people = temp;
  chosen = null;

  try {
    await saveData();
  } catch (e) {
    alert('تعذر حفظ البيانات محليًا: ' + e.message);
    return;
  }

  $('search').value = '';
  index();

  $('importPanel').style.display = 'none';

  $('status').textContent =
    'البيانات محفوظة في المتصفح فقط، وليست في Cloudflare D1.';

  alert(
    `تم استيراد ${temp.length} سجل. ` +
    (dup ? `السجلات المكررة: ${dup}` : '')
  );
};

// =====================================
// Export JSON backup
// =====================================

$('backupBtn').onclick = () => {
  if (dataSource !== 'local') {
    return alert(
      'هذه نتيجة بحث تجريبية. النسخ الاحتياطي مخصص للبيانات المحلية المستوردة.'
    );
  }

  if (!people.length) return alert('لا توجد بيانات');

  const blob = new Blob(
    [JSON.stringify({ version: 1, people })],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = 'family-registry-backup.json';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// =====================================
// Restore JSON backup
// =====================================

$('restoreBtn').onclick = () => {
  $('restoreFile').click();
};

$('restoreFile').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;

    const x = JSON.parse(await f.text());
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
      'سيتم استبدال البيانات المحلية في هذا المتصفح. متابعة؟'
    )) return;

    ++lookupSequence;
    ++detailSequence;

    dataSource = 'local';
    people = arr;
    chosen = null;

    await saveData();

    $('search').value = '';
    index();

    $('status').textContent =
      'تم استعادة البيانات محليًا داخل المتصفح.';

    alert('تمت الاستعادة');

  } catch (e) {
    alert(e.message);
  }
};

// =====================================
// Delete local records
// =====================================

$('eraseBtn').onclick = async () => {
  if (!confirm(
    'حذف البيانات المحلية من هذا المتصفح فقط؟'
  )) return;

  ++lookupSequence;
  ++detailSequence;

  const oldPeople = people;
  const oldMode = dataSource;

  people = [];

  try {
    await saveData();
  } catch (e) {
    people = oldPeople;
    dataSource = oldMode;
    alert('تعذر الحذف: ' + e.message);
    return;
  }

  dataSource = 'remote';
  chosen = null;
  $('search').value = '';

  resetRemote(
    'حُذفت البيانات المحلية. يمكنك البحث في السجلات التجريبية على Cloudflare.'
  );
};

// =====================================
// Start application
// =====================================

resetRemote(
  'اكتب اسمًا أو رقم هوية للبحث في قاعدة Cloudflare D1.'
);
