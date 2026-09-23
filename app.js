// ============================================================
//  FacadeApp v3.0 - часть 1/3
//  Константы, хранилище, Supabase-клиент, синхронизация
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmt = (n) => {
  if (typeof n !== "number") return n;
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
};

const parseDate = (s) => {
  if (!s) return null;
  const [d, m, y] = s.split(".").map(Number);
  return new Date(y, m - 1, d);
};

const pad = (n) => String(n).padStart(2, "0");

const nowStamp = () => {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// ============================================================
//  SUPABASE КЛИЕНТ
// ============================================================
const SUPABASE_URL = "https://dcwmeltcrizsaalxvrlk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd21lbHRjcml6c2FhbHh2cmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODY3OTYsImV4cCI6MjEwNTc2Mjc5Nn0.chhVffiuHrMjjfwaf60twSLijCgZnh_-FUdUoYoCl6E";
const SUPABASE_TABLE = "project_state";
const SUPABASE_ROW = "main";

// ============================================================
//  ХРАНИЛИЩЕ
// ============================================================
const KEY_MILESTONES = "facadeapp.milestones.v3";
const KEY_DELIVERIES = "facadeapp.deliveries.v3";
const KEY_FACTS      = "facadeapp.facts.v3";
const KEY_SUPPLIERS  = "facadeapp.suppliers.v3";

function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveStore(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.warn("LocalStorage error:", e); }
}

function milestoneKey(m) {
  return m.kind === "milestone" ? `gen:${m.label}` : `corpse:${m.corpse}:${m.label}`;
}

let MILESTONE_STATE = loadStore(KEY_MILESTONES, {});
let DELIVERY_STATE  = loadStore(KEY_DELIVERIES, {});
let FACT_STATE      = loadStore(KEY_FACTS, {});
let SUPPLIERS_STATE = loadStore(KEY_SUPPLIERS, JSON.parse(JSON.stringify(SUPPLIERS)));

// ============================================================
//  СВЯЗЬ ЭТАП ↔ МАТЕРИАЛ
// ============================================================
const STAGE_TO_MATERIAL = {
  "Монтаж кронштейнов":   "Кронштейны",
  "Монтаж утеплителя":    "Утеплитель",
  "Монтаж плитки":        "Плитка бетонная",
};

function parsePlan(s) {
  if (!s || s === "—") return 0;
  const m = String(s).match(/[\d\s.,]+/);
  if (!m) return 0;
  return parseFloat(m[0].replace(/\s/g, "").replace(",", ".")) || 0;
}

function getMaterialAvailable(cid, stageName) {
  const matName = STAGE_TO_MATERIAL[stageName];
  if (!matName) return { required: false, percent: 100, plan: 0, arrived: 0 };

  let plan = 0, arrived = 0;
  DELIVERY_SCHEDULE.forEach((row, idx) => {
    const [c, mat, volStr] = row;
    if (c !== cid || mat !== matName) return;
    plan += parsePlan(volStr);
    arrived += parseFloat(DELIVERY_STATE[`${idx}.arrived`]) || 0;
  });

  if (plan === 0) return { required: true, percent: 0, plan: 0, arrived: 0 };
  const percent = Math.min(100, Math.round((arrived / plan) * 100));
  return { required: true, percent, plan, arrived };
}

function factKey(cid, stage) { return `${cid}::${stage}`; }

function getFact(cid, stage) {
  const mat = getMaterialAvailable(cid, stage);
  const raw = FACT_STATE[factKey(cid, stage)] || 0;
  if (!mat.required) return raw;
  return Math.min(raw, mat.percent);
}

function autoTrimFacts() {
  let changed = false;
  WORK_SCHEDULE.forEach(([cid, stage]) => {
    const key = factKey(cid, stage);
    const raw = FACT_STATE[key];
    if (typeof raw !== "number") return;
    const mat = getMaterialAvailable(cid, stage);
    if (mat.required && raw > mat.percent) {
      FACT_STATE[key] = mat.percent;
      changed = true;
    }
  });
  if (changed) saveStore(KEY_FACTS, FACT_STATE);
  return changed;
}

function stageProgressReal(stageName) {
  let sum = 0, count = 0;
  WORK_SCHEDULE.forEach(([cid, stage]) => {
    if (stage !== stageName) return;
    sum += getFact(cid, stage);
    count++;
  });
  return count ? Math.round(sum / count) : 0;
}

function corpseProgress(cid) {
  let sum = 0, count = 0;
  WORK_SCHEDULE.forEach(([c, stage]) => {
    if (c !== cid) return;
    sum += getFact(c, stage);
    count++;
  });
  return count ? Math.round(sum / count) : 0;
}

function projectProgress() {
  let sum = 0, count = 0;
  WORK_SCHEDULE.forEach(([cid, stage]) => {
    sum += getFact(cid, stage);
    count++;
  });
  return count ? Math.round(sum / count) : 0;
}

// ============================================================
//  СИНХРОНИЗАЦИЯ С ОБЛАКОМ (SUPABASE)
// ============================================================
let syncTimer = null;
let syncInFlight = false;
let pendingSave = false;

function setSyncStatus(status, text) {
  const el = document.getElementById("syncIndicator");
  if (!el) return;
  el.className = "sync-indicator sync-" + status;
  const txt = el.querySelector(".sync-text");
  if (txt) txt.textContent = text;
}

function collectAllData() {
  return {
    version: 3,
    savedAt: nowStamp(),
    milestones: MILESTONE_STATE,
    deliveries: DELIVERY_STATE,
    facts: FACT_STATE,
    suppliers: SUPPLIERS_STATE,
  };
}

function applyAllData(data) {
  if (!data || typeof data !== "object") return false;
  if (data.milestones) MILESTONE_STATE = data.milestones;
  if (data.deliveries) DELIVERY_STATE = data.deliveries;
  if (data.facts)      FACT_STATE = data.facts;
  if (data.suppliers)  SUPPLIERS_STATE = data.suppliers;

  saveStore(KEY_MILESTONES, MILESTONE_STATE);
  saveStore(KEY_DELIVERIES, DELIVERY_STATE);
  saveStore(KEY_FACTS, FACT_STATE);
  saveStore(KEY_SUPPLIERS, SUPPLIERS_STATE);
  return true;
}

async function loadFromCloud() {
  setSyncStatus("loading", "Загрузка...");
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_ROW}&select=data`;
    const res = await fetch(url, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length && arr[0].data && Object.keys(arr[0].data).length) {
      applyAllData(arr[0].data);
      setSyncStatus("ok", "Облако OK");
      console.log("Данные загружены из облака");
      return true;
    }
    setSyncStatus("ok", "Облако OK");
    console.log("Облако пустое — работаем локально");
    return false;
  } catch (e) {
    console.warn("Ошибка загрузки из облака:", e);
    setSyncStatus("error", "Офлайн");
    return false;
  }
}

async function saveToCloud(immediate = false) {
  if (syncInFlight) { pendingSave = true; return; }

  const doSave = async () => {
    syncInFlight = true;
    setSyncStatus("saving", "Сохранение...");
    try {
      const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_ROW}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          data: collectAllData(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSyncStatus("ok", "Облако OK");
      console.log("Сохранено в облако:", nowStamp());
    } catch (e) {
      console.warn("Ошибка сохранения:", e);
      setSyncStatus("error", "Офлайн");
    } finally {
      syncInFlight = false;
      if (pendingSave) {
        pendingSave = false;
        saveToCloud(true);
      }
    }
  };

  if (syncTimer) clearTimeout(syncTimer);
  if (immediate) {
    syncTimer = null;
    await doSave();
  } else {
    setSyncStatus("saving", "Сохранение...");
    syncTimer = setTimeout(doSave, 1000);
  }
}

// ============================================================
//  МЕТАДАННЫЕ СТРАНИЦ
// ============================================================
const PAGES = {
  home:        { title: "Главная", sub: "Обзор состояния проекта" },
  dashboard:   { title: "Обзор проекта", sub: "Сводные метрики по всем корпусам" },
  corpses:     { title: "Корпуса", sub: "Детальная информация по каждому корпусу" },
  materials:   { title: "Материалы", sub: "Плитка · Композит · Каркас и крепёж" },
  "mat-tile":  { title: "Плитка", sub: "Распределение по цветам NCS", parent: "materials" },
  "mat-comp":  { title: "Композит", sub: "Объёмы по корпусам", parent: "materials" },
  "mat-frame": { title: "Каркас и крепёж", sub: "Кронштейны, направляющие, метизы", parent: "materials" },
  schedule:    { title: "График работ", sub: "Диаграмма Ганта · контрольные точки" },
  fact:        { title: "Факт выполнения", sub: "Учёт выполненных работ по корпусам" },
  milestones:  { title: "Контрольные точки", sub: "Ключевые события проекта" },
  deliveries:  { title: "Поставки", sub: "Учёт приёмки материалов по корпусам" },
  suppliers:   { title: "Поставщики", sub: "Контрагенты и статусы договоров" },
};

let currentPage = "home";

// ============================================================
//  КОНЕЦ ЧАСТИ 1/3
//  Продолжение — в части 2/3
// ============================================================// ============================================================
//  FacadeApp v3.0 - часть 2/3
//  Рендер-функции страниц (Главная, Обзор, Корпуса, Материалы, График)
// ============================================================

// ============================================================
//  ГЛАВНАЯ
// ============================================================
function renderHome() {
  const totalArea = Object.values(CORPSES).reduce((s, c) => s + c.total, 0);
  const progress = projectProgress();
  const totalMilestones = MILESTONES.length;
  const doneMilestones = Object.values(MILESTONE_STATE).filter(s => s && s.done).length;

  const hour = new Date().getHours();
  let greet = "Добрый день";
  if (hour < 6) greet = "Доброй ночи";
  else if (hour < 12) greet = "Доброе утро";
  else if (hour < 18) greet = "Добрый день";
  else greet = "Добрый вечер";

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const upcoming = MILESTONES
    .filter(m => !(MILESTONE_STATE[milestoneKey(m)]?.done))
    .map(m => ({ ...m, dateObj: parseDate(m.date) }))
    .filter(m => m.dateObj >= todayMidnight)
    .sort((a, b) => a.dateObj - b.dateObj)
    .slice(0, 5);

  const upcomingHtml = upcoming.length ? upcoming.map(m => {
    const days = daysBetween(todayMidnight, m.dateObj);
    const daysText = days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} дн.`;
    return `
      <div class="home-kt-row glass">
        <div class="home-kt-dot" style="background:${m.color};"></div>
        <div class="home-kt-info">
          <div class="home-kt-label">${m.label}</div>
          <div class="home-kt-date">${m.date} · <b>${daysText}</b></div>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty-state">Все контрольные точки пройдены 🎉</div>`;

  const activeCorpses = Object.keys(CORPSES).sort().filter(cid => {
    const endDate = parseDate(CORPSES[cid].end);
    return endDate >= todayMidnight;
  });

  const activeHtml = activeCorpses.slice(0, 4).map(cid => {
    const c = CORPSES[cid];
    const prog = corpseProgress(cid);
    return `
      <div class="home-corpus glass" data-goto="fact">
        <div class="home-corpus-name">Корпус ${cid}</div>
        <div class="home-corpus-meta">${c.floors} эт. · ${fmt(c.total)} м²</div>
        <div class="home-corpus-bar">
          <div class="home-corpus-fill" style="width:${prog}%"></div>
        </div>
        <div class="home-corpus-progress">${prog}%</div>
      </div>
    `;
  }).join("");

  const stages = ["Монтаж кронштейнов", "Монтаж утеплителя", "Монтаж направляющих", "Монтаж плитки", "Откосы / отливы"];
  const stageIcons = {
    "Монтаж кронштейнов": "🔩",
    "Монтаж утеплителя": "🧊",
    "Монтаж направляющих": "➡️",
    "Монтаж плитки": "🎨",
    "Откосы / отливы": "📐",
  };
  const factStagesHtml = stages.map(st => {
    const pct = stageProgressReal(st);
    return `
      <div class="home-fact-stage">
        <div class="home-fact-stage-name">
          <span>${stageIcons[st]} ${st}</span>
          <span class="home-fact-stage-pct">${pct}%</span>
        </div>
        <div class="home-fact-stage-bar">
          <div class="home-fact-stage-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="home-hero glass">
      <div class="home-greet">${greet}! 👋</div>
      <div class="home-project">Проект: Кавказский б-р, з/у 51/3</div>
      <div class="home-subtitle">7 корпусов · 2 этапа · до 30.08.2027</div>
    </div>

    <div class="home-kpi-grid">
      <div class="home-kpi glass">
        <div class="home-kpi-value" style="color:var(--blue)">${Object.keys(CORPSES).length}</div>
        <div class="home-kpi-label">Корпусов</div>
      </div>
      <div class="home-kpi glass">
        <div class="home-kpi-value" style="color:var(--green)">${fmt(totalArea)}</div>
        <div class="home-kpi-label">м² фасада</div>
      </div>
      <div class="home-kpi glass">
        <div class="home-kpi-value" style="color:var(--orange)">${progress}%</div>
        <div class="home-kpi-label">Прогресс работ</div>
      </div>
      <div class="home-kpi glass">
        <div class="home-kpi-value" style="color:var(--purple)">${doneMilestones}<span style="font-size:16px;color:var(--text-gray)">/${totalMilestones}</span></div>
        <div class="home-kpi-label">Выполнено КТ</div>
      </div>
    </div>

    <div class="home-fact-block glass">
      <div class="home-fact-head">
        <div class="home-fact-title">✅ Фактическое выполнение</div>
        <div class="home-fact-total">${progress}%</div>
      </div>
      <div class="home-fact-total-bar">
        <div class="home-fact-total-fill" style="width:${progress}%"></div>
      </div>
      <div class="home-fact-stages">${factStagesHtml}</div>
    </div>

    <div class="home-section-title">📍 Ближайшие контрольные точки</div>
    <div class="home-kt-list">${upcomingHtml}</div>

    <div class="home-section-title">🏢 Активные корпуса</div>
    <div class="home-corpse-grid">${activeHtml}</div>
  `;
}

// ============================================================
//  DASHBOARD
// ============================================================
function renderDashboard() {
  const totalTile = Object.values(CORPSES).reduce((s, c) => s + c.tile, 0);
  const totalComp = Object.values(CORPSES).reduce((s, c) => s + c.composite, 0);
  const totalBr   = Object.values(CORPSES).reduce((s, c) => s + c.brackets, 0);
  const totalRv   = Object.values(CORPSES).reduce((s, c) => s + c.rivets, 0);

  const kpis = [
    { label: "Корпусов", value: Object.keys(CORPSES).length, unit: "объектов", color: "var(--blue)" },
    { label: "Плитка", value: fmt(totalTile), unit: "м²", color: "var(--green)" },
    { label: "Композит", value: fmt(totalComp), unit: "м²", color: "var(--orange)" },
    { label: "Кронштейны", value: fmt(totalBr), unit: "шт", color: "var(--purple)" },
    { label: "Заклёпки", value: fmt(totalRv), unit: "шт", color: "var(--red)" },
  ];

  const kpiHtml = kpis.map(k => `
    <div class="kpi glass">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value" style="color:${k.color}">${k.value}</div>
      <div class="kpi-unit">${k.unit}</div>
    </div>
  `).join("");

  const rows = Object.keys(CORPSES).sort().map(cid => {
    const c = CORPSES[cid];
    const prog = corpseProgress(cid);
    return `<tr>
      <td><b>${cid}</b></td>
      <td class="num">${c.floors}</td>
      <td class="num">${c.height}</td>
      <td style="text-align:center"><span class="tag">${c.stage}</span></td>
      <td class="num">${fmt(c.tile)}</td>
      <td class="num">${fmt(c.composite)}</td>
      <td class="num"><b>${fmt(c.total)}</b></td>
      <td class="num">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden;">
            <div style="width:${prog}%;height:100%;background:linear-gradient(90deg,var(--blue),#5AC8FA);"></div>
          </div>
          <span style="font-weight:700;color:var(--blue);min-width:36px;text-align:right;">${prog}%</span>
        </div>
      </td>
    </tr>`;
  }).join("");

  return `
    <div class="kpi-grid">${kpiHtml}</div>
    <div class="card-title">📋 Сводка по корпусам</div>
    <div class="table-wrap glass">
      <table>
        <thead><tr>
          <th>Корпус</th><th>Этаж</th><th>Высота, м</th><th>Этап</th>
          <th>Плитка, м²</th><th>Композит, м²</th><th>Итого, м²</th><th>Прогресс</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ============================================================
//  CORPSES
// ============================================================
function renderCorpses() {
  return Object.keys(CORPSES).sort().map(cid => {
    const c = CORPSES[cid];
    const prog = corpseProgress(cid);
    const items = [
      ["Этажность", `${c.floors} эт.`],
      ["Высота", `${c.height} м`],
      ["Плитка", `${fmt(c.tile)} м²`],
      ["Композит", `${fmt(c.composite)} м²`],
      ["Итого фасад", `${fmt(c.total)} м²`],
      ["Кронштейны", `${fmt(c.brackets)} шт`],
      ["Удлинители", `${fmt(c.extenders)} шт`],
      ["Направляющие", `${fmt(c.guides)} м`],
      ["Анкер клиновой", `${fmt(c.anchor_wedge)} шт`],
      ["Анкер фасадный", `${fmt(c.anchor_facade)} шт`],
      ["Заклёпки", `${fmt(c.rivets)} шт`],
      ["Теплоизоляция", `${fmt(c.insulation)} м²`],
    ];
    const gridHtml = items.map(([k, v]) => `
      <div class="corpse-item">
        <div class="item-label">${k}</div>
        <div class="item-value">${v}</div>
      </div>
    `).join("");

    return `
      <div class="corpse-card glass">
        <div class="corpse-head">
          <div class="corpse-title">Корпус ${cid}</div>
          <div class="badge">Этап ${c.stage}</div>
        </div>
        <div class="corpse-code">АР3: ${c.ar3} &nbsp;·&nbsp; НВФ: ${c.nvf}</div>
        <div class="corpse-progress">
          <div class="corpse-progress-bar"><div class="corpse-progress-fill" style="width:${prog}%"></div></div>
          <div class="corpse-progress-text">Выполнено: ${prog}%</div>
        </div>
        <div class="corpse-grid">${gridHtml}</div>
      </div>
    `;
  }).join("");
}

// ============================================================
//  MATERIALS
// ============================================================
function renderMaterialsHub() {
  const totalTile = Object.values(CORPSES).reduce((s, c) => s + c.tile, 0);
  const totalComp = Object.values(CORPSES).reduce((s, c) => s + c.composite, 0);
  const totalBr   = Object.values(CORPSES).reduce((s, c) => s + c.brackets, 0);

  const cards = [
    { page: "mat-tile",  icon: "🎨", title: "Плитка",           sub: `${fmt(totalTile)} м²`,  color: "var(--green)" },
    { page: "mat-comp",  icon: "🧱", title: "Композит",         sub: `${fmt(totalComp)} м²`,  color: "var(--orange)" },
    { page: "mat-frame", icon: "🔩", title: "Каркас и крепёж",  sub: `${fmt(totalBr)} шт`,    color: "var(--purple)" },
  ];

  const cardsHtml = cards.map(c => `
    <div class="folder-card glass" data-goto="${c.page}">
      <div class="folder-icon" style="color:${c.color}">${c.icon}</div>
      <div class="folder-title">${c.title}</div>
      <div class="folder-sub">${c.sub}</div>
    </div>
  `).join("");

  return `<div class="folder-grid">${cardsHtml}</div>`;
}

function renderMaterialsTile() {
  const rows = Object.keys(CORPSES).sort().map(cid => {
    const t = TILES[cid] || {};
    const vals = TILE_COLORS.map(col => {
      const v = t[col] || 0;
      return `<td class="num">${v ? v.toFixed(2) : "—"}</td>`;
    }).join("");
    const total = TILE_COLORS.reduce((s, col) => s + (t[col] || 0), 0);
    return `<tr>
      <td><b>${cid}</b></td>
      ${vals}
      <td class="num"><b>${total.toFixed(2)}</b></td>
    </tr>`;
  }).join("");

  const totals = TILE_COLORS.map(col =>
    Object.values(TILES).reduce((s, t) => s + (t[col] || 0), 0)
  );
  const grand = totals.reduce((s, v) => s + v, 0);

  const totalRow = `<tr class="total-row">
    <td>ИТОГО</td>
    ${totals.map(v => `<td class="num">${v.toFixed(2)}</td>`).join("")}
    <td class="num">${grand.toFixed(2)}</td>
  </tr>`;

  return `
    <div class="table-wrap glass">
      <table>
        <thead><tr>
          <th>Корпус</th>
          ${TILE_COLORS.map(c => `<th>${c}</th>`).join("")}
          <th>Всего, м²</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    </div>
  `;
}

function renderMaterialsComp() {
  const rows = Object.keys(CORPSES).sort().map(cid => {
    const c = CORPSES[cid];
    return `<tr>
      <td><b>${cid}</b></td>
      <td class="num">${fmt(c.composite)}</td>
      <td class="num">${fmt(c.total)}</td>
      <td class="num">${c.total > 0 ? ((c.composite / c.total) * 100).toFixed(1) + "%" : "—"}</td>
    </tr>`;
  }).join("");

  const totalComp = Object.values(CORPSES).reduce((s, c) => s + c.composite, 0);
  const totalAll  = Object.values(CORPSES).reduce((s, c) => s + c.total, 0);

  const totalRow = `<tr class="total-row">
    <td>ИТОГО</td>
    <td class="num">${fmt(totalComp)}</td>
    <td class="num">${fmt(totalAll)}</td>
    <td class="num">${totalAll > 0 ? ((totalComp / totalAll) * 100).toFixed(1) + "%" : "—"}</td>
  </tr>`;

  return `
    <div class="card glass" style="margin-bottom:16px; padding:16px 20px;">
      <div style="font-size:13px; color:var(--text-gray);">
        Композит — отдельная позиция (не ПБФ, не плитка). Применяется на отдельных участках фасада.
      </div>
    </div>
    <div class="table-wrap glass">
      <table>
        <thead><tr>
          <th>Корпус</th><th>Композит, м²</th><th>Итого фасад, м²</th><th>Доля</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    </div>
  `;
}

function renderMaterialsFrame() {
  const rows = Object.keys(CORPSES).sort().map(cid => {
    const c = CORPSES[cid];
    return `<tr>
      <td><b>${cid}</b></td>
      <td class="num">${fmt(c.brackets)}</td>
      <td class="num">${fmt(c.extenders)}</td>
      <td class="num">${fmt(c.guides)}</td>
      <td class="num">${fmt(c.anchor_wedge)}</td>
      <td class="num">${fmt(c.anchor_facade)}</td>
      <td class="num">${fmt(c.rivets)}</td>
    </tr>`;
  }).join("");

  const t = {
    br:  Object.values(CORPSES).reduce((s, c) => s + c.brackets, 0),
    ext: Object.values(CORPSES).reduce((s, c) => s + c.extenders, 0),
    gd:  Object.values(CORPSES).reduce((s, c) => s + c.guides, 0),
    aw:  Object.values(CORPSES).reduce((s, c) => s + c.anchor_wedge, 0),
    af:  Object.values(CORPSES).reduce((s, c) => s + c.anchor_facade, 0),
    rv:  Object.values(CORPSES).reduce((s, c) => s + c.rivets, 0),
  };

  const totalRow = `<tr class="total-row">
    <td>ИТОГО</td>
    <td class="num">${fmt(t.br)}</td>
    <td class="num">${fmt(t.ext)}</td>
    <td class="num">${fmt(t.gd)}</td>
    <td class="num">${fmt(t.aw)}</td>
    <td class="num">${fmt(t.af)}</td>
    <td class="num">${fmt(t.rv)}</td>
  </tr>`;

  return `
    <div class="table-wrap glass">
      <table>
        <thead><tr>
          <th>Корпус</th>
          <th>Кронштейны, шт</th><th>Удлинители, шт</th>
          <th>Направляющие, м</th><th>Анкер клиновой, шт</th>
          <th>Анкер фасадный, шт</th><th>Заклёпки, шт</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    </div>
  `;
}

// ============================================================
//  SCHEDULE
// ============================================================
function renderSchedule() {
  let minDate = null, maxDate = null;
  WORK_SCHEDULE.forEach(([,, s, e]) => {
    const ds = parseDate(s), de = parseDate(e);
    if (!minDate || ds < minDate) minDate = ds;
    if (!maxDate || de > maxDate) maxDate = de;
  });
  MILESTONES.forEach(m => {
    const d = parseDate(m.date);
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  });

  const minMonday = new Date(minDate);
  const dayIdx = (minMonday.getDay() + 6) % 7;
  minMonday.setDate(minMonday.getDate() - dayIdx);
  const totalDays = Math.max(1, daysBetween(minMonday, maxDate) + 1);

  const monthNames = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  const months = [];
  const cursor = new Date(minMonday);
  while (cursor <= maxDate) {
    const mk = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
    const last = months[months.length - 1];
    if (last && last.key === mk) last.days++;
    else months.push({ key: mk, name: `${monthNames[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, days: 1 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks = [];
  const wc = new Date(minMonday);
  const today = new Date();
  while (wc <= maxDate) {
    const wEnd = new Date(wc);
    wEnd.setDate(wEnd.getDate() + 6);
    const isCurrent = today >= wc && today <= wEnd;
    weeks.push({
      days: 7,
      label: `${pad(wc.getDate())}.${pad(wc.getMonth() + 1)}–${pad(wEnd.getDate())}.${pad(wEnd.getMonth() + 1)}`,
      isCurrent,
    });
    wc.setDate(wc.getDate() + 7);
  }

  const todayOffset = daysBetween(minMonday, today);
  const todayPos = (todayOffset / totalDays) * 100;
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;

  const byCorpse = {};
  WORK_SCHEDULE.forEach(row => {
    const cid = row[0];
    if (!byCorpse[cid]) byCorpse[cid] = [];
    byCorpse[cid].push(row);
  });
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];

  const summaryHtml = corpseOrder.map(cid => {
    const prog = corpseProgress(cid);
    return `
      <div class="gantt-summary-card glass" data-scroll-to="corpse-${cid}">
        <div class="gantt-summary-name">Корпус ${cid}</div>
        <div class="gantt-summary-progress">
          <div class="gantt-summary-bar">
            <div class="gantt-summary-fill" style="width:${prog}%"></div>
          </div>
          <div class="gantt-summary-pct">${prog}%</div>
        </div>
      </div>
    `;
  }).join("");

  const totalProg = projectProgress();

  const rowsHtml = corpseOrder.map(cid => {
    const rows = byCorpse[cid] || [];
    const header = `
      <div class="gantt-corpse-header glass" id="corpse-${cid}">
        <span class="gantt-corpse-title">Корпус ${cid}</span>
        <span class="gantt-corpse-meta">${CORPSES[cid].floors} эт. · ${CORPSES[cid].total} м² · <b style="color:var(--blue)">${corpseProgress(cid)}%</b></span>
      </div>
    `;
    const stagesHtml = rows.map(([, stage, s, e, vol]) => {
      const ds = parseDate(s), de = parseDate(e);
      const left  = (daysBetween(minMonday, ds) / totalDays) * 100;
      const width = Math.max(0.8, ((daysBetween(ds, de) + 1) / totalDays) * 100);
      const color = STAGE_COLORS[stage] || "#8E8E93";
      const factPct = getFact(cid, stage);

      return `
        <div class="gantt-row">
          <div class="gantt-label">
            ${stage}
            <small>${s} → ${e} · ${vol}</small>
          </div>
          <div class="gantt-track">
            <div class="gantt-bar" style="left:${left}%; width:${width}%; background:${color}; opacity:0.30;"></div>
            <div class="gantt-bar gantt-fact" style="left:${left}%; width:${width * (factPct / 100)}%; background:${color};">
              ${width * (factPct / 100) > 8 ? factPct + "%" : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");
    return header + stagesHtml;
  }).join("");

  const milestoneLines = MILESTONES.filter(m => m.kind === "milestone").map(m => {
    const d = parseDate(m.date);
    const pos = (daysBetween(minMonday, d) / totalDays) * 100;
    if (pos < 0 || pos > 100) return "";
    return `<div class="milestone-line" style="left:calc(220px + (100% - 220px) * ${pos / 100});" title="${m.label} · ${m.date}"></div>`;
  }).join("");

  return `
    <div class="home-fact-block glass" style="margin-bottom:16px;">
      <div class="home-fact-head">
        <div class="home-fact-title">📊 Общий прогресс проекта</div>
        <div class="home-fact-total">${totalProg}%</div>
      </div>
      <div class="home-fact-total-bar">
        <div class="home-fact-total-fill" style="width:${totalProg}%"></div>
      </div>
    </div>

    <div class="gantt-summary">${summaryHtml}</div>

    <div class="card glass" style="margin-bottom:16px;">
      <div class="legend-title">Контрольные точки</div>
      <div class="legend-row">
        ${MILESTONES.filter(m => m.kind === "milestone").map(m => `
          <span class="legend-item">
            <span class="legend-dot" style="background:${m.color};"></span>${m.label} — <b>${m.date}</b>
          </span>
        `).join("")}
      </div>
      <div class="legend-title" style="margin-top:12px;">Прогресс</div>
      <div class="legend-row">
        <span class="legend-item"><span class="legend-bar plan"></span>План</span>
        <span class="legend-item"><span class="legend-bar fact" style="background:var(--green)"></span>Факт выполнения</span>
      </div>
    </div>

    <div class="gantt glass">
      <div class="cal-header">
        <div class="cal-corner"></div>
        <div class="cal-months">${months.map(m => `<div class="cal-month" style="flex:${m.days}">${m.name}</div>`).join("")}</div>
      </div>
      <div class="cal-header cal-header-weeks">
        <div class="cal-corner"></div>
        <div class="cal-weeks">${weeks.map(w => `<div class="cal-week ${w.isCurrent ? 'cal-week-current' : ''}" style="flex:${w.days}">${w.label}</div>`).join("")}</div>
      </div>

      <div class="gantt-body">
        ${rowsHtml}
        ${showTodayLine ? `<div class="today-line" style="left:calc(220px + (100% - 220px) * ${todayPos / 100});" title="Сегодня"></div>` : ""}
      </div>
    </div>
  `;
}

// ============================================================
//  КОНЕЦ ЧАСТИ 2/3
//  Продолжение — в части 3/3
// ============================================================// ============================================================
//  FacadeApp v3.0 - часть 3/3
//  Факт, КТ, Поставки, Поставщики, роутер, экспорт, init
// ============================================================

// ============================================================
//  FACT
// ============================================================
function renderFact() {
  const totalProg = projectProgress();
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];

  const cardsHtml = corpseOrder.map(cid => {
    const rows = WORK_SCHEDULE.filter(([c]) => c === cid);
    if (!rows.length) return "";

    const corpseProg = corpseProgress(cid);

    const stagesHtml = rows.map(([, stage]) => {
      const key = factKey(cid, stage);
      const mat = getMaterialAvailable(cid, stage);
      const maxVal = mat.required ? Math.min(100, mat.percent) : 100;
      const val = Math.min(FACT_STATE[key] || 0, maxVal);
      const blocked = mat.required && mat.percent === 0;
      const limited = mat.required && mat.percent > 0 && mat.percent < 100;

      let statusIcon, statusText, statusClass;
      if (!mat.required) {
        statusIcon = "⚪"; statusText = "Без привязки к материалу"; statusClass = "";
      } else if (mat.percent >= 100) {
        statusIcon = "🟢"; statusText = `Материал в наличии (${fmt(mat.arrived)} из ${fmt(mat.plan)})`; statusClass = "mat-ok";
      } else if (mat.percent > 0) {
        statusIcon = "🟡"; statusText = `Частично: ${mat.percent}% (${fmt(mat.arrived)} из ${fmt(mat.plan)})`; statusClass = "mat-partial";
      } else {
        statusIcon = "🔴"; statusText = `Материал не привезён (0 из ${fmt(mat.plan)})`; statusClass = "mat-empty";
      }

      return `
        <div class="fact-stage ${blocked ? 'fact-blocked' : ''}">
          <div class="fact-stage-head">
            <div class="fact-stage-name">${stage}</div>
            <div class="fact-stage-status ${statusClass}" title="${statusText}">
              ${statusIcon} ${statusText}
            </div>
          </div>
          <div class="fact-controls">
            <input type="range" class="fact-slider" data-cid="${cid}" data-stage="${stage}"
                   min="0" max="${maxVal}" value="${val}"
                   ${blocked ? 'disabled' : ''} />
            <div class="fact-value-wrap">
              <input type="number" class="fact-input" data-cid="${cid}" data-stage="${stage}"
                     min="0" max="${maxVal}" value="${val}"
                     ${blocked ? 'disabled' : ''} />
              <span class="fact-pct">%</span>
            </div>
          </div>
          ${limited ? `<div class="fact-hint">Максимум ${mat.percent}% — привезено частично</div>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="fact-card glass">
        <div class="fact-head">
          <div>
            <div class="fact-title">Корпус ${cid}</div>
            <div class="fact-sub">${CORPSES[cid].floors} эт. · ${fmt(CORPSES[cid].total)} м²</div>
          </div>
          <div class="fact-progress">
            <div class="fact-progress-bar"><div class="fact-progress-fill" style="width:${corpseProg}%"></div></div>
            <div class="fact-progress-text">${corpseProg}%</div>
          </div>
        </div>
        <div class="fact-stages">${stagesHtml}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="milestone-progress glass">
      <div class="mp-info">
        <div class="mp-label">Общий прогресс проекта</div>
        <div class="mp-count">${totalProg}%</div>
      </div>
      <div class="mp-bar"><div class="mp-fill" style="width:${totalProg}%"></div></div>
    </div>
    ${cardsHtml}
  `;
}

// ============================================================
//  MILESTONES
// ============================================================
function renderMilestones() {
  const general = MILESTONES.filter(m => m.kind === "milestone");
  const byCorpse = MILESTONES.filter(m => m.kind === "corpse");

  const total = MILESTONES.length;
  const done = Object.values(MILESTONE_STATE).filter(s => s && s.done).length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const card = (m) => {
    const key = milestoneKey(m);
    const state = MILESTONE_STATE[key];
    const isDone = state?.done;
    return `
      <div class="milestone-card glass ${isDone ? 'milestone-done' : ''}" data-kt="${key}">
        <div class="milestone-dot" style="background:${m.color};"></div>
        <div class="milestone-info">
          <div class="milestone-label">${m.label}</div>
          <div class="milestone-dates">
            <span class="milestone-date-plan ${isDone ? 'plan-struck' : ''}">${m.date}</span>
            ${isDone ? `<span class="milestone-date-fact">✅ ${state.fact}</span>` : ""}
          </div>
        </div>
        ${isDone ? `<div class="milestone-check">✓</div>` : ""}
      </div>
    `;
  };

  return `
    <div class="milestone-progress glass">
      <div class="mp-info">
        <div class="mp-label">Прогресс контрольных точек</div>
        <div class="mp-count">${done} из ${total} · ${progress}%</div>
      </div>
      <div class="mp-bar"><div class="mp-fill" style="width:${progress}%"></div></div>
    </div>

    <div class="card-title">📍 Общие контрольные точки</div>
    <div class="milestone-grid">${general.map(card).join("")}</div>

    <div class="card-title" style="margin-top:24px;">🏢 По корпусам — завершение кровли</div>
    <div class="milestone-grid">${byCorpse.map(card).join("")}</div>
  `;
}

function handleMilestoneClick(key) {
  const state = MILESTONE_STATE[key] || {};
  if (state.done) delete MILESTONE_STATE[key];
  else MILESTONE_STATE[key] = { done: true, fact: nowStamp() };
  saveStore(KEY_MILESTONES, MILESTONE_STATE);
  saveToCloud();  // Автосохранение в облако
  if (currentPage === "milestones" || currentPage === "home") showPage(currentPage);
}

// ============================================================
//  DELIVERIES
// ============================================================
function renderDeliveries() {
  const byCorpse = {};
  DELIVERY_SCHEDULE.forEach((row, idx) => {
    const cid = row[0];
    if (!byCorpse[cid]) byCorpse[cid] = [];
    byCorpse[cid].push({ idx, row });
  });

  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];

  const cards = corpseOrder.map(cid => {
    const items = byCorpse[cid] || [];
    if (!items.length) return "";

    let totalPlan = 0, totalArrived = 0;
    items.forEach(({ idx, row }) => {
      const plan = parsePlan(row[2]);
      const arrived = parseFloat(DELIVERY_STATE[`${idx}.arrived`] || 0);
      if (plan > 0) {
        totalPlan += plan;
        totalArrived += Math.min(arrived, plan);
      }
    });
    const progress = totalPlan ? Math.round((totalArrived / totalPlan) * 100) : 0;

    const rowsHtml = items.map(({ idx, row }) => {
      const [, mat, volStr, planS, , sup] = row;
      const plan = parsePlan(volStr);
      const arrived = DELIVERY_STATE[`${idx}.arrived`] ?? "";
      const newDate = DELIVERY_STATE[`${idx}.newDate`] ?? "";
      const factDate = DELIVERY_STATE[`${idx}.factDate`] ?? "";
      const rest = plan > 0 ? Math.max(0, plan - (parseFloat(arrived) || 0)) : "—";
      const unit = volStr.includes("шт") ? "шт" : "м²";

      return `
        <tr>
          <td>${mat}</td>
          <td class="num">${plan > 0 ? fmt(plan) + " " + unit : "—"}</td>
          <td class="num">
            <input type="number" class="inp inp-arrived" data-idx="${idx}" data-field="arrived"
                   value="${arrived}" placeholder="0" min="0" step="1" />
          </td>
          <td class="num"><b class="rest-cell">${plan > 0 ? (typeof rest === "number" ? fmt(rest) : rest) : "—"}</b></td>
          <td>
            <span class="date-plan ${newDate ? 'date-struck' : ''}">${planS}</span>
          </td>
          <td>
            <input type="text" class="inp inp-date" data-idx="${idx}" data-field="newDate"
                   value="${newDate}" placeholder="новая дата" />
          </td>
          <td>
            <input type="text" class="inp inp-date" data-idx="${idx}" data-field="factDate"
                   value="${factDate}" placeholder="факт. дата" />
          </td>
          <td>${sup}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="delivery-card glass">
        <div class="delivery-head">
          <div>
            <div class="delivery-title">Корпус ${cid}</div>
            <div class="delivery-sub">${items.length} позиц. · ${CORPSES[cid].floors} эт.</div>
          </div>
          <div class="delivery-progress">
            <div class="delivery-progress-bar"><div class="delivery-progress-fill" style="width:${progress}%"></div></div>
            <div class="delivery-progress-text">${progress}%</div>
          </div>
        </div>
        <div class="delivery-table-wrap">
          <table class="delivery-table">
            <thead><tr>
              <th>Материал</th><th>План</th><th>Привезено</th><th>Остаток</th>
              <th>План. дата</th><th>Новая дата</th><th>Факт. дата</th><th>Поставщик</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="card glass" style="margin-bottom:16px; padding:16px 20px;">
      <div style="font-size:13px; color:var(--text-gray);">
        💾 Данные сохраняются в облако автоматически. При вводе «Новой даты» плановая зачёркивается.
      </div>
    </div>
    ${cards}
  `;
}

// ============================================================
//  SUPPLIERS
// ============================================================
function renderSuppliers() {
  const cards = SUPPLIERS_STATE.map(s => `
    <div class="supplier-card glass" data-supplier="${s.id}">
      <div class="supplier-head">
        <div style="flex:1;">
          <input class="supplier-input supplier-name-input" data-id="${s.id}" data-field="name"
                 value="${s.name || ''}" placeholder="Название" />
          <input class="supplier-input supplier-materials" data-id="${s.id}" data-field="materials"
                 value="${s.materials || ''}" placeholder="Материалы (через запятую)" />
        </div>
        <button class="supplier-delete" data-del="${s.id}" title="Удалить">🗑</button>
      </div>
      <div class="supplier-fields">
        <div class="supplier-field">
          <span class="supplier-field-icon">👤</span>
          <input class="supplier-input" data-id="${s.id}" data-field="contact"
                 value="${s.contact || ''}" placeholder="Контактное лицо" />
        </div>
        <div class="supplier-field">
          <span class="supplier-field-icon">📞</span>
          <input class="supplier-input" data-id="${s.id}" data-field="phone"
                 value="${s.phone || ''}" placeholder="Телефон" />
        </div>
        <div class="supplier-field">
          <span class="supplier-field-icon">✉️</span>
          <input class="supplier-input" data-id="${s.id}" data-field="email"
                 value="${s.email || ''}" placeholder="Email" />
        </div>
      </div>
      <div class="supplier-status">
        <label class="supplier-check ${s.status?.tender ? 'checked' : ''}">
          <input type="checkbox" data-id="${s.id}" data-status="tender" ${s.status?.tender ? 'checked' : ''} />
          <span>🏆 Побеждён тендер</span>
        </label>
        <label class="supplier-check ${s.status?.contract ? 'checked' : ''}">
          <input type="checkbox" data-id="${s.id}" data-status="contract" ${s.status?.contract ? 'checked' : ''} />
          <span>📝 Договор подписан</span>
        </label>
        <label class="supplier-check ${s.status?.paid ? 'checked' : ''}">
          <input type="checkbox" data-id="${s.id}" data-status="paid" ${s.status?.paid ? 'checked' : ''} />
          <span>💰 Материал оплачен</span>
        </label>
      </div>
    </div>
  `).join("");

  return `
    <div class="suppliers-grid">
      ${cards}
      <div class="supplier-add" id="addSupplier">
        <span style="font-size:24px;">➕</span>
        <span>Добавить поставщика</span>
      </div>
    </div>
  `;
}

// ============================================================
//  ROUTER
// ============================================================
const RENDERERS = {
  home:        renderHome,
  dashboard:   renderDashboard,
  corpses:     renderCorpses,
  materials:   renderMaterialsHub,
  "mat-tile":  renderMaterialsTile,
  "mat-comp":  renderMaterialsComp,
  "mat-frame": renderMaterialsFrame,
  schedule:    renderSchedule,
  fact:        renderFact,
  milestones:  renderMilestones,
  deliveries:  renderDeliveries,
  suppliers:   renderSuppliers,
};

function showPage(page) {
  currentPage = page;
  const meta = PAGES[page] || PAGES.home;

  let crumb = "";
  if (meta.parent) {
    const parent = PAGES[meta.parent];
    crumb = `<div class="breadcrumb"><a href="#" data-goto="${meta.parent}">${parent.title}</a> <span>›</span> ${meta.title}</div>`;
  }

  $("#pageTitle").textContent = meta.title;
  $("#pageSub").textContent = meta.sub;
  $("#content").innerHTML = crumb + RENDERERS[page]();

  const rootPage = meta.parent || page;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === rootPage));
}

// ============================================================
//  EXPORT CSV
// ============================================================
function exportCSV() {
  let headers = [], rows = [], filename = "export.csv";

  if (currentPage === "home" || currentPage === "dashboard" || currentPage === "corpses") {
    headers = ["Корпус", "Этаж", "Высота", "Этап", "Плитка м²", "Композит м²", "Итого м²", "Прогресс %"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const c = CORPSES[cid];
      return [cid, c.floors, c.height, c.stage, c.tile, c.composite, c.total, corpseProgress(cid)];
    });
    filename = "corpses.csv";
  } else if (currentPage === "mat-tile") {
    headers = ["Корпус", ...TILE_COLORS, "Всего"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const t = TILES[cid] || {};
      const total = TILE_COLORS.reduce((s, col) => s + (t[col] || 0), 0);
      return [cid, ...TILE_COLORS.map(col => (t[col] || 0).toFixed(2)), total.toFixed(2)];
    });
    filename = "tile.csv";
  } else if (currentPage === "mat-comp") {
    headers = ["Корпус", "Композит, м²", "Итого, м²", "Доля, %"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const c = CORPSES[cid];
      return [cid, c.composite, c.total, c.total > 0 ? ((c.composite / c.total) * 100).toFixed(1) : "0"];
    });
    filename = "composite.csv";
  } else if (currentPage === "mat-frame") {
    headers = ["Корпус", "Кронштейны", "Удлинители", "Направляющие", "Анкер кл.", "Анкер фас.", "Заклёпки"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const c = CORPSES[cid];
      return [cid, c.brackets, c.extenders, c.guides, c.anchor_wedge, c.anchor_facade, c.rivets];
    });
    filename = "frame.csv";
  } else if (currentPage === "schedule") {
    headers = ["Корпус", "Этап", "Начало", "Окончание", "Объём", "Факт %"];
    rows = WORK_SCHEDULE.map(([cid, stage, s, e, vol]) => [cid, stage, s, e, vol, getFact(cid, stage)]);
    filename = "schedule.csv";
  } else if (currentPage === "fact") {
    headers = ["Корпус", "Этап", "Факт %", "Материал", "Привезено", "План", "Доступно %"];
    rows = [];
    WORK_SCHEDULE.forEach(([cid, stage]) => {
      const mat = getMaterialAvailable(cid, stage);
      rows.push([cid, stage, getFact(cid, stage), STAGE_TO_MATERIAL[stage] || "—", mat.arrived, mat.plan, mat.percent]);
    });
    filename = "fact.csv";
  } else if (currentPage === "milestones") {
    headers = ["Тип", "Корпус", "Плановая дата", "Статус", "Факт. дата"];
    rows = MILESTONES.map(m => {
      const key = milestoneKey(m);
      const st = MILESTONE_STATE[key];
      return [m.kind === "milestone" ? "Общая" : "По корпусу", m.corpse || "все", m.date, st?.done ? "Выполнено" : "Ожидание", st?.fact || ""];
    });
    filename = "milestones.csv";
  } else if (currentPage === "deliveries") {
    headers = ["Корпус", "Материал", "План", "Привезено", "Остаток", "План. дата", "Новая дата", "Факт. дата", "Поставщик"];
    rows = DELIVERY_SCHEDULE.map((row, idx) => {
      const [cid, mat, volStr, planS, , sup] = row;
      const plan = parsePlan(volStr);
      const arrived = parseFloat(DELIVERY_STATE[`${idx}.arrived`]) || 0;
      const rest = plan > 0 ? Math.max(0, plan - arrived) : 0;
      return [cid, mat, plan, arrived, rest, planS, DELIVERY_STATE[`${idx}.newDate`] || "", DELIVERY_STATE[`${idx}.factDate`] || "", sup];
    });
    filename = "deliveries.csv";
  } else if (currentPage === "suppliers") {
    headers = ["Название", "Материалы", "Контакт", "Телефон", "Email", "Тендер", "Договор", "Оплата"];
    rows = SUPPLIERS_STATE.map(s => [
      s.name, s.materials, s.contact, s.phone, s.email,
      s.status?.tender ? "Да" : "Нет",
      s.status?.contract ? "Да" : "Нет",
      s.status?.paid ? "Да" : "Нет",
    ]);
    filename = "suppliers.csv";
  } else {
    headers = ["Корпус", "Этаж", "Высота", "Этап"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const c = CORPSES[cid];
      return [cid, c.floors, c.height, c.stage];
    });
    filename = "corpses.csv";
  }

  const csv = "\uFEFF" + [headers, ...rows]
    .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
//  SEARCH
// ============================================================
function applySearch(query) {
  const q = query.trim().toLowerCase();
  const container = $("#content");
  const clearAll = () => {
    $$("tr", container).forEach(tr => tr.style.display = "");
    $$(".corpse-card, .gantt-row, .folder-card, .milestone-card, .delivery-card, .home-kt-row, .home-corpus, .fact-card, .fact-stage, .supplier-card, .gantt-summary-card", container).forEach(el => el.style.display = "");
  };
  if (!q) { clearAll(); return; }
  clearAll();
  const filterList = (selector) => {
    $$(selector, container).forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
  filterList("tbody tr");
  filterList(".corpse-card");
  filterList(".gantt-row");
  filterList(".folder-card");
  filterList(".milestone-card");
  filterList(".delivery-card");
  filterList(".home-kt-row");
  filterList(".home-corpus");
  filterList(".fact-card");
  filterList(".supplier-card");
  filterList(".gantt-summary-card");
}

// ============================================================
//  THEME
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", dark ? "light" : "dark");
  $("#themeToggle").textContent = dark ? "🌙 Тёмная тема" : "☀️ Светлая тема";
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Загружаем данные из облака (если есть)
  await loadFromCloud();

  // 2. Автосрез фактов (если материалов стало меньше)
  autoTrimFacts();

  // 3. Меню
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  // 4. Делегирование кликов
  document.body.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      if (confirm("Удалить поставщика?")) {
        SUPPLIERS_STATE = SUPPLIERS_STATE.filter(s => s.id !== del.dataset.del);
        saveStore(KEY_SUPPLIERS, SUPPLIERS_STATE);
        saveToCloud();
        showPage("suppliers");
      }
      return;
    }

    if (e.target.closest("#addSupplier")) {
      const id = "supp_" + Date.now();
      SUPPLIERS_STATE.push({
        id, name: "Новый поставщик", materials: "",
        contact: "", phone: "", email: "", comment: "",
        status: { tender: false, contract: false, paid: false },
      });
      saveStore(KEY_SUPPLIERS, SUPPLIERS_STATE);
      saveToCloud();
      showPage("suppliers");
      return;
    }

    const scrollTo = e.target.closest("[data-scroll-to]");
    if (scrollTo) {
      const el = document.getElementById(scrollTo.dataset.scrollTo);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const goto = e.target.closest("[data-goto]");
    if (goto) { e.preventDefault(); showPage(goto.dataset.goto); return; }

    const kt = e.target.closest("[data-kt]");
    if (kt) { handleMilestoneClick(kt.dataset.kt); return; }
  });

  // 5. Ввод
  document.body.addEventListener("input", (e) => {
    const inp = e.target.closest(".inp");
    if (inp) {
      const idx = inp.dataset.idx;
      const field = inp.dataset.field;
      DELIVERY_STATE[`${idx}.${field}`] = inp.value;
      saveStore(KEY_DELIVERIES, DELIVERY_STATE);
      saveToCloud();

      if (field === "arrived") {
        const tr = inp.closest("tr");
        if (tr) {
          const plan = parsePlan(DELIVERY_SCHEDULE[idx][2]);
          const arrived = parseFloat(inp.value) || 0;
          const rest = plan > 0 ? Math.max(0, plan - arrived) : "—";
          const restCell = tr.querySelector(".rest-cell");
          if (restCell) restCell.textContent = typeof rest === "number" ? fmt(rest) : rest;
        }
        if (autoTrimFacts()) {
          if (currentPage === "fact") showPage("fact");
        }
      }
      if (field === "newDate") {
        const tr = inp.closest("tr");
        if (tr) {
          const planCell = tr.querySelector(".date-plan");
          if (planCell) planCell.classList.toggle("date-struck", !!inp.value);
        }
      }
      return;
    }

    const slider = e.target.closest(".fact-slider");
    const factInput = e.target.closest(".fact-input");
    if (slider || factInput) {
      const el = slider || factInput;
      const cid = el.dataset.cid;
      const stage = el.dataset.stage;
      const max = parseFloat(el.max) || 100;
      let val = parseFloat(el.value) || 0;
      if (val > max) val = max;
      if (val < 0) val = 0;

      FACT_STATE[factKey(cid, stage)] = val;
      saveStore(KEY_FACTS, FACT_STATE);
      saveToCloud();

      const card = el.closest(".fact-card");
      if (card) {
        const other = slider
          ? card.querySelector(`.fact-input[data-cid="${cid}"][data-stage="${stage}"]`)
          : card.querySelector(`.fact-slider[data-cid="${cid}"][data-stage="${stage}"]`);
        if (other) other.value = val;

        const cp = corpseProgress(cid);
        const fill = card.querySelector(".fact-progress-fill");
        const text = card.querySelector(".fact-progress-text");
        if (fill) fill.style.width = cp + "%";
        if (text) text.textContent = cp + "%";
      }
      const overall = projectProgress();
      const mpFill = document.querySelector(".mp-fill");
      const mpCount = document.querySelector(".mp-count");
      if (mpFill) mpFill.style.width = overall + "%";
      if (mpCount) mpCount.textContent = overall + "%";
      return;
    }

    const supInput = e.target.closest(".supplier-input");
    if (supInput) {
      const id = supInput.dataset.id;
      const field = supInput.dataset.field;
      const sup = SUPPLIERS_STATE.find(s => s.id === id);
      if (sup) {
        sup[field] = supInput.value;
        saveStore(KEY_SUPPLIERS, SUPPLIERS_STATE);
        saveToCloud();
      }
      return;
    }
  });

  // 6. Чекбоксы поставщиков
  document.body.addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-status]");
    if (cb) {
      const id = cb.dataset.id;
      const status = cb.dataset.status;
      const sup = SUPPLIERS_STATE.find(s => s.id === id);
      if (sup) {
        sup.status[status] = cb.checked;
        saveStore(KEY_SUPPLIERS, SUPPLIERS_STATE);
        saveToCloud();
        cb.closest(".supplier-check").classList.toggle("checked", cb.checked);
      }
    }
  });

  // 7. Кнопки
  $("#globalSearch").addEventListener("input", (e) => applySearch(e.target.value));
  $("#exportBtn").addEventListener("click", exportCSV);
  $("#themeToggle").addEventListener("click", toggleTheme);

  // 8. Стартовая страница
  showPage("home");

  console.log("%c✅ FacadeApp v3.0 запущен с облачной синхронизацией", "color:#007AFF; font-weight:bold; font-size:14px;");
});