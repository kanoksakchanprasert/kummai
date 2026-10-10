'use strict';

// ---------- Units ----------
// Each unit converts to the base unit of its category.
const CATEGORIES = {
  mass:   { label: 'น้ำหนัก', base: 'ก.' },
  volume: { label: 'ปริมาตร', base: 'มล.' },
  count:  { label: 'จำนวน',  base: 'ชิ้น' },
  length: { label: 'ความยาว', base: 'ม.' },
};

const UNITS = {
  'g':     { label: 'ก.',    category: 'mass',   factor: 1 },
  'kg':    { label: 'กก.',   category: 'mass',   factor: 1000 },
  'mg':    { label: 'มก.',   category: 'mass',   factor: 0.001 },
  'ml':    { label: 'มล.',   category: 'volume', factor: 1 },
  'l':     { label: 'ล.',    category: 'volume', factor: 1000 },
  'pc':    { label: 'ชิ้น',   category: 'count',  factor: 1 },
  'pack':  { label: 'ซอง',   category: 'count',  factor: 1 },
  'btl':   { label: 'ขวด',   category: 'count',  factor: 1 },
  'box':   { label: 'กล่อง',  category: 'count',  factor: 1 },
  'dozen': { label: 'โหล',   category: 'count',  factor: 12 },
  'cm':    { label: 'ซม.',   category: 'length', factor: 0.01 },
  'm':     { label: 'ม.',    category: 'length', factor: 1 },
};

const DEFAULT_UNIT = 'g';

function toBase(qty, unit) {
  return qty * UNITS[unit].factor;
}

// Pick a readable "per X" unit for a category, based on typical product size.
function displayUnitFor(category, avgBaseQty) {
  switch (category) {
    case 'mass':
      return avgBaseQty >= 1000 ? { per: 1000, label: 'กก.' } : { per: 100, label: '100 ก.' };
    case 'volume':
      return avgBaseQty >= 1000 ? { per: 1000, label: 'ล.' } : { per: 100, label: '100 มล.' };
    case 'count':
      return { per: 1, label: 'ชิ้น' };
    case 'length':
      return { per: 1, label: 'ม.' };
  }
}

// ---------- Formatting ----------
const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 });
const pctFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

const money = (n) => '฿' + moneyFmt.format(n);
const moneyShort = (n) => '฿' + (Number.isInteger(n) ? numFmt.format(n) : moneyFmt.format(n));

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Accepts "1,234.5" and blank; returns NaN for garbage, null for blank.
function parseNum(raw) {
  const s = String(raw).replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ---------- State ----------
let nextId = 1;
const newOption = () => ({ id: nextId++, name: '', qty: '', count: '', unit: DEFAULT_UNIT, price: '', extra: '' });
let options = [newOption(), newOption()];

const letterOf = (i) => {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

// ---------- Compute ----------
// Returns one result per option (same order) plus summary info.
function compute(opts) {
  const rows = opts.map((o, i) => {
    const letter = letterOf(i);
    const name = o.name.trim() || `ตัวเลือก ${letter}`;
    const qty = parseNum(o.qty);
    const count = parseNum(o.count) ?? 1; // blank = 1 piece
    const price = parseNum(o.price);
    const extra = parseNum(o.extra) ?? 0;
    const unit = UNITS[o.unit];
    const row = { id: o.id, letter, name, unitKey: o.unit, unit, category: unit.category, qty, count, price, extra, errors: {} };

    const blank = qty === null && price === null;
    if (blank) { row.status = 'empty'; return row; }

    if (qty === null || Number.isNaN(qty) || qty <= 0) row.errors.qty = 'ปริมาณต้องมากกว่า 0';
    if (Number.isNaN(count) || count <= 0) row.errors.count = 'จำนวนต้องมากกว่า 0';
    if (price === null || Number.isNaN(price)) row.errors.price = 'กรอกราคา';
    else if (price < 0) row.errors.price = 'ราคาต้องไม่ติดลบ';
    if (Number.isNaN(extra)) row.errors.extra = 'ค่าอื่นๆ ไม่ถูกต้อง';

    if (Object.keys(row.errors).length) { row.status = 'invalid'; return row; }

    row.total = price + extra;
    if (row.total <= 0) {
      row.errors.extra = 'ยอดจ่ายจริงต้องมากกว่า 0';
      row.status = 'invalid';
      return row;
    }
    row.baseQty = toBase(qty, o.unit) * count; // price is the total for all pieces
    row.unitPrice = row.total / row.baseQty; // baht per base unit
    row.status = 'ok';
    return row;
  });

  const valid = rows.filter((r) => r.status === 'ok');

  // Main category = the one most options use (ties → first seen).
  const counts = new Map();
  for (const r of valid) counts.set(r.category, (counts.get(r.category) || 0) + 1);
  let mainCategory = null;
  for (const [cat, n] of counts) if (mainCategory === null || n > counts.get(mainCategory)) mainCategory = cat;

  const comparable = valid.filter((r) => r.category === mainCategory);
  for (const r of valid) if (r.category !== mainCategory) r.status = 'incomparable';

  // Display unit per category (comparable rows share one so numbers line up).
  const displayByCat = {};
  for (const cat of counts.keys()) {
    const inCat = valid.filter((r) => r.category === cat);
    const avg = inCat.reduce((s, r) => s + r.baseQty, 0) / inCat.length;
    displayByCat[cat] = displayUnitFor(cat, avg);
  }
  for (const r of valid) {
    r.display = displayByCat[r.category];
    r.displayPrice = r.unitPrice * r.display.per;
  }

  const ranked = [...comparable].sort((a, b) => a.unitPrice - b.unitPrice);
  const best = ranked[0] || null;
  const EPS = 1e-9;
  for (const r of ranked) {
    r.isBest = Math.abs(r.unitPrice - best.unitPrice) <= EPS * Math.max(1, best.unitPrice);
    if (!r.isBest) {
      r.diffPct = (r.unitPrice / best.unitPrice - 1) * 100;
      // Extra paid vs. buying this same quantity at the best rate.
      r.overpay = r.total - best.unitPrice * r.baseQty;
    }
  }

  return { rows, ranked, best, mainCategory };
}

// ---------- Render ----------
const $options = document.getElementById('options');
const $results = document.getElementById('results');
const $template = document.getElementById('card-template');
const $sticky = document.getElementById('sticky-bar');

function buildUnitSelect(select) {
  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    const group = document.createElement('optgroup');
    group.label = cat.label;
    for (const [key, u] of Object.entries(UNITS)) {
      if (u.category !== catKey) continue;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = u.label;
      group.appendChild(opt);
    }
    select.appendChild(group);
  }
}

// Rebuild the card list (only on add/remove/clear so typing keeps focus).
function renderCards() {
  $options.replaceChildren();
  options.forEach((o, i) => {
    const node = $template.content.firstElementChild.cloneNode(true);
    node.dataset.id = o.id;
    node.querySelector('.badge-letter').textContent = letterOf(i);
    node.querySelector('[data-field="name"]').placeholder = `ชื่อ / ร้าน (ตัวเลือก ${letterOf(i)})`;
    const select = node.querySelector('[data-field="unit"]');
    buildUnitSelect(select);
    for (const field of ['name', 'qty', 'count', 'unit', 'price', 'extra']) {
      node.querySelector(`[data-field="${field}"]`).value = o[field];
    }
    node.querySelector('.remove').disabled = options.length <= 1;
    $options.appendChild(node);
  });
  update();
}

function qtyLabel(r) {
  const base = `${numFmt.format(r.qty)} ${r.unit.label}`;
  return r.count === 1 ? base : `${base} × ${numFmt.format(r.count)}`;
}

function cardResultHtml(r) {
  if (r.status === 'empty') return 'กรอกปริมาณและราคาเพื่อคำนวณ';
  if (r.status === 'invalid') {
    return `<span class="tag tag-neutral">ข้อมูลไม่ครบ</span> ${escapeHtml(Object.values(r.errors)[0])}`;
  }
  const parts = [
    `<span>จ่ายจริง <strong>${moneyShort(r.total)}</strong></span>`,
    ...(r.count === 1 ? [] : [`<span>รวม <strong>${numFmt.format(r.qty * r.count)} ${r.unit.label}</strong></span>`]),
    `<span><strong>${money(r.displayPrice)}</strong> / ${r.display.label}</span>`,
  ];
  if (r.status === 'incomparable') {
    parts.push(`<span class="tag tag-neutral">เทียบไม่ได้ (หน่วย${CATEGORIES[r.category].label})</span>`);
  } else if (r.isBest) {
    parts.push('<span class="tag tag-best">🏆 คุ้มที่สุด</span>');
  } else if (r.diffPct !== undefined) {
    parts.push(`<span class="tag tag-worse">แพงกว่า +${pctFmt.format(r.diffPct)}%</span>`);
  }
  return parts.join('');
}

function resultsHtml({ rows, ranked, best }) {
  if (!best) {
    return `<div class="empty">กรอกปริมาณและราคาอย่างน้อย 2 ตัวเลือก<br>แล้วผลจะแสดงที่นี่ทันที</div>`;
  }

  const bests = ranked.filter((r) => r.isBest);
  const tie = bests.length > 1;
  let html = `
    <div class="winner">
      <div class="winner-label">🏆 ${tie ? 'คุ้มที่สุด (เท่ากัน)' : 'คุ้มที่สุด'}</div>
      <div class="winner-name">${bests.map((r) => `${r.letter} · ${escapeHtml(r.name)}`).join('<br>')}</div>
      <div class="winner-price">${money(best.displayPrice)} <small>/ ${best.display.label}</small></div>
      ${tie ? '' : `<div class="winner-meta">จ่ายจริง ${moneyShort(best.total)} · ${qtyLabel(best)}</div>`}
    </div>`;

  if (ranked.length > 1) {
    const max = ranked[ranked.length - 1].unitPrice;
    html += `<p class="rank-title">อันดับ (ถูก → แพง)</p><ol class="ranking">`;
    ranked.forEach((r, i) => {
      const width = Math.max(4, (r.unitPrice / max) * 100);
      const note = r.isBest
        ? `<span class="tag tag-best">คุ้มที่สุด</span>จ่ายจริง ${moneyShort(r.total)} · ${qtyLabel(r)}`
        : `<span class="tag tag-worse">แพงกว่า +${pctFmt.format(r.diffPct)}%</span>จ่ายเกิน ${money(r.overpay)} เมื่อเทียบปริมาณเท่ากัน`;
      html += `
        <li class="rank-item${r.isBest ? ' is-best' : ''}">
          <div class="rank-row">
            <span class="rank-no">${i + 1}</span>
            <span class="rank-name">${r.letter} · ${escapeHtml(r.name)}</span>
            <span class="rank-price">${money(r.displayPrice)}/${r.display.label}</span>
          </div>
          <div class="bar"><span style="width:${width}%"></span></div>
          <div class="rank-note">${note}</div>
        </li>`;
    });
    html += `</ol>`;
  } else {
    html += `<p class="hint">เพิ่มอีกอย่างน้อย 1 ตัวเลือกเพื่อเปรียบเทียบ</p>`;
  }

  const warnings = [];
  for (const r of rows) {
    if (r.status === 'incomparable') {
      warnings.push(`⚠ ${r.letter} · ${escapeHtml(r.name)} ใช้หน่วย${CATEGORIES[r.category].label} (${r.unit.label}) — เทียบกับตัวอื่นไม่ได้`);
    } else if (r.status === 'invalid') {
      warnings.push(`⚠ ${r.letter} · ${escapeHtml(r.name)}: ${escapeHtml(Object.values(r.errors)[0])}`);
    }
  }
  if (warnings.length) {
    html += `<div class="warnings">${warnings.map((w) => `<div class="warning">${w}</div>`).join('')}</div>`;
  }
  return html;
}

function update() {
  const result = compute(options);

  for (const r of result.rows) {
    const card = $options.querySelector(`.card[data-id="${r.id}"]`);
    if (!card) continue;
    card.classList.toggle('is-best', !!r.isBest && result.ranked.length > 1);
    card.querySelector('.card-result').innerHTML = cardResultHtml(r);
    for (const field of ['qty', 'count', 'price', 'extra']) {
      card.querySelector(`[data-field="${field}"]`).classList.toggle('invalid', !!r.errors[field]);
    }
  }

  $results.innerHTML = resultsHtml(result);

  if (result.best && result.ranked.length > 1) {
    const b = result.best;
    $sticky.textContent = `🏆 ${b.letter} · ${b.name} · ${money(b.displayPrice)}/${b.display.label}`;
    $sticky.hidden = false;
  } else {
    $sticky.hidden = true;
  }
}

// ---------- Events ----------
function onFieldChange(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  const card = e.target.closest('.card');
  const opt = options.find((o) => o.id === Number(card.dataset.id));
  opt[field] = e.target.value;
  update();
}

$options.addEventListener('input', onFieldChange);
$options.addEventListener('change', onFieldChange);

$options.addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="remove"]')) return;
  const id = Number(e.target.closest('.card').dataset.id);
  if (options.length <= 1) return;
  options = options.filter((o) => o.id !== id);
  renderCards();
});

document.getElementById('add-btn').addEventListener('click', () => {
  const last = options[options.length - 1];
  const o = newOption();
  if (last) o.unit = last.unit; // new options usually share the same unit
  options.push(o);
  renderCards();
  $options.lastElementChild.querySelector('[data-field="name"]').focus();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  const hasData = options.some((o) => o.name || o.qty || o.count || o.price || o.extra);
  if (hasData && !confirm('ล้างข้อมูลทั้งหมด?')) return;
  options = [newOption(), newOption()];
  renderCards();
});

$sticky.addEventListener('click', () => {
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

renderCards();
