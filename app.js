// ============================================================
//  FacadeApp v4.1
//  Авторизация, Supabase, вспомогательные функции, маршрутизация
// ============================================================

const $ = (sel) => document.querySelector(sel); const $$ = (sel) => document.querySelectorAll(sel);

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
//  АВТОРИЗАЦИЯ
// ============================================================
let currentUser = null;

async function checkAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  } catch (e) {
    console.warn("Ошибка проверки сессии:", e);
    return null;
  }
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name: name || "" }, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.user;
}

async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  showLoginScreen();
}

function showLoginScreen() {
  const loginScreen = $("#loginScreen");
  const appRoot = $("#appRoot");
  if (loginScreen) loginScreen.style.display = "flex";
  if (appRoot) appRoot.style.display = "none";
}

function showAppScreen(user) {
  currentUser = user;
  const loginScreen = $("#loginScreen");
  const appRoot = $("#appRoot");
  if (loginScreen) loginScreen.style.display = "none";
  if (appRoot) appRoot.style.display = "grid";

  if ($("#userEmail")) $("#userEmail").textContent = user.email;
  if ($("#userDropdownEmail")) $("#userDropdownEmail").textContent = user.email;
}

function showLoginError(msg) {
  const err = $("#loginError");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
}

function clearLoginError() {
  const err = $("#loginError");
  if (err) { err.textContent = ""; err.classList.remove("show"); }
}

function initLoginHandlers() {
  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");   const tabs = $$(".login-tab");
  const indicator = $("#loginTabIndicator");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle("active", t === tab));
      if (indicator) indicator.classList.toggle("right", target === "register");
      if (target === "login") {
        if (loginForm) loginForm.style.display = "flex";
        if (registerForm) registerForm.style.display = "none";
      } else {
        if (loginForm) loginForm.style.display = "none";
        if (registerForm) registerForm.style.display = "flex";
      }
    });
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearLoginError();
      const email = $("#loginEmail").value.trim();
      const password = $("#loginPassword").value;
      try {
        const user = await signIn(email, password);
        showAppScreen(user);
        await loadFromCloud();
        showPage("home");
      } catch (err) {
        showLoginError("Ошибка входа: " + (err.message || "неверный логин/пароль"));
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#registerEmail").value.trim();
      const password = $("#registerPassword").value;
      const name = $("#registerName").value.trim();
      try {
        await signUp(email, password, name);
        alert("Регистрация успешна! Войдите в аккаунт.");
        tabs[0].click();
      } catch (err) {
        alert("Ошибка регистрации: " + err.message);
      }
    });
  }

  if ($("#logoutBtn")) {
    $("#logoutBtn").addEventListener("click", async () => {
      await signOut();
    });
  }
}

// ============================================================
//  ХРАНИЛИЩЕ И ОБЛАКО
// ============================================================
const KEY_MILESTONES = "facadeapp.milestones.v4";
const KEY_DELIVERIES = "facadeapp.deliveries.v4";
const KEY_FACTS      = "facadeapp.facts.v4";
const KEY_SUPPLIERS  = "facadeapp.suppliers.v4";

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
let SUPPLIERS_STATE = loadStore(KEY_SUPPLIERS, SUPPLIERS);

function setSyncStatus(status, text) {
  const el = $("#syncIndicator");
  if (!el) return;
  el.className = "sync-indicator sync-" + status;
  const txt = el.querySelector(".sync-text");
  if (txt) txt.textContent = text;
}

async function loadFromCloud() {
  setSyncStatus("loading", "Загрузка...");
  try {
    const { data, error } = await supabase.from("project_state").select("data").eq("id", "main").single();
    if (error) throw error;
    if (data?.data) {
      if (data.data.milestones) MILESTONE_STATE = data.data.milestones;
      if (data.data.deliveries) DELIVERY_STATE = data.data.deliveries;
      if (data.data.suppliers) SUPPLIERS_STATE = data.data.suppliers;
      if (data.data.factsV2) {
        Object.keys(FACTS_V2).forEach(c => {
          if (data.data.factsV2[c]) FACTS_V2[c] = data.data.factsV2[c];
        });
      }
    }
    setSyncStatus("ok", "Облако OK");
  } catch (e) {
    setSyncStatus("error", "Офлайн");
  }
}

async function saveToCloud() {
  setSyncStatus("saving", "Сохранение...");
  try {
    const payload = {
      milestones: MILESTONE_STATE,
      deliveries: DELIVERY_STATE,
      suppliers: SUPPLIERS_STATE,
      factsV2: FACTS_V2
    };
    await supabase.from("project_state").update({ data: payload, updated_at: new Date().toISOString() }).eq("id", "main");
    setSyncStatus("ok", "Облако OK");
  } catch (e) {
    setSyncStatus("error", "Офлайн");
  }
}

function parsePlan(s) {
  if (!s || s === "—") return 0;
  const m = String(s).match(/[\d\s.,]+/);
  if (!m) return 0;
  return parseFloat(m[0].replace(/\s/g, "").replace(",", ".")) || 0;
}

// ============================================================
//  РЕНДЕРИНГ СТРАНИЦ
// ============================================================
const PAGES = {
  home:        { title: "Главная",           sub: "Обзор состояния проекта" },
  dashboard:   { title: "Обзор проекта",     sub: "Сводные метрики по всем корпусам" },
  corpses:     { title: "Корпуса",           sub: "Детальная информация по каждому корпусу" },
  materials:   { title: "Материалы",         sub: "Плитка · Композит · Каркас и крепёж" },
  "mat-tile":  { title: "Плитка",            sub: "Распределение по цветам NCS", parent: "materials" },
  "mat-comp":  { title: "Композит",          sub: "Объёмы по корпусам", parent: "materials" },
  "mat-frame": { title: "Каркас и крепёж",   sub: "Кронштейны, направляющие, метизы", parent: "materials" },
  schedule:    { title: "График работ",      sub: "Работы по типам этажей" },
  glazing:     { title: "Остекление",        sub: "Витражные окна и балконные блоки" },
  fact:        { title: "Факт выполнения",   sub: "Учёт выполненных работ по подработам" },
  milestones:  { title: "Контрольные точки", sub: "Ключевые события проекта" },
  deliveries:  { title: "Поставки",          sub: "Учёт приёмки материалов" },
  suppliers:   { title: "Поставщики",        sub: "Контрагенты и статусы договоров" },
};

let currentPage = "home";

function renderHome() {
  const nvf = FLOW_SUMMARY.nvf;
  const glz = FLOW_SUMMARY.glz;

  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];
  const corpsesHtml = corpseOrder.map(cid => {
    const c = CORPSES[cid];
    return `
      <div class="corpse-row" data-corpse="${cid}">
        <div class="corpse-row-head">
          <div class="corpse-row-id"><span class="corpse-row-dot ${c.status}"></span>Корпус ${cid}</div>
          <div class="corpse-row-status ${c.status}">${c.statusText}</div>
        </div>
        <div class="corpse-row-sub">${c.floors} эт. · ${c.code}</div>
        <div class="corpse-row-bars">
          <div class="corpse-row-bar">
            <span class="corpse-row-label">НВФ</span>
            <div class="corpse-row-track"><div class="corpse-row-fill" style="width:${c.nvfPct}%"></div></div>
            <span class="corpse-row-percent">${c.nvfPct}%</span>
          </div>
          <div class="corpse-row-bar">
            <span class="corpse-row-label">Остекление</span>
            <div class="corpse-row-track"><div class="corpse-row-fill glz" style="width:${c.glz}%"></div></div>
            <span class="corpse-row-percent">${c.glz}%</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="home-hero glass">
      <div class="home-greet">Добрый день!</div>
      <div class="home-project">Проект: Кавказский б-р, з/у 51/3</div>
    </div>
    <div class="flows">
      <div class="flow">
        <div class="head"><div class="title">НВФ</div><span class="badge ${nvf.status}">${nvf.status === 'ok' ? 'В графике' : 'Отстаём'}</span></div>
        <div class="progress"><div class="fill ${nvf.status}" style="width:${nvf.fact}%"></div></div>
      </div>
      <div class="flow glazing">
        <div class="head"><div class="title">Остекление</div><span class="badge ${glz.status}">${glz.status === 'ok' ? 'В графике' : 'Отстаём'}</span></div>
        <div class="progress"><div class="fill glazing" style="width:${glz.fact}%"></div></div>
      </div>
    </div>
    <div class="section"><div class="section-head"><h2>Корпуса</h2></div><div class="corpses-list">${corpsesHtml}</div></div>
  `;
}

function renderFactV2() {
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];
  const corpseHtml = corpseOrder.map(cid => {
    const c = CORPSES[cid];
    const typicalWorks = WORK_TEMPLATE.typical.works.map(w => {
      const subs = w.subworks.map(sub => {
        const val = subworkProgress(cid, "typical", w.id, sub.id);
        return `
          <div class="fw-row">
            <div class="fw-name">${sub.name}</div>
            <div class="fw-slider-wrap">
              <input type="range" class="fw-slider" data-corpse="${cid}" data-type="typical" data-work="${w.id}" data-sub="${sub.id}" min="0" max="100" value="${val}" />
            </div>
            <div class="fw-value-wrap">
              <input type="number" class="fw-input" data-corpse="${cid}" data-type="typical" data-work="${w.id}" data-sub="${sub.id}" min="0" max="100" value="${val}" />
              <span class="fw-pct">%</span>
            </div>
          </div>
        `;
      }).join("");
      return `<div class="fw-work"><div class="fw-work-name">${w.name}</div><div class="fw-subs">${subs}</div></div>`;
    }).join("");

    return `
      <div class="fw-corpse glass">
        <div class="fw-corpse-head"><div class="fw-corpse-title">Корпус ${cid}</div></div>
        <div class="fw-section"><div class="fw-works">${typicalWorks}</div></div>
      </div>
    `;
  }).join("");

  return `<div class="fact-v2">${corpseHtml}</div>`;
}

function showPage(page) {
  currentPage = page;
  const meta = PAGES[page] || PAGES.home;
  if ($("#pageTitle")) $("#pageTitle").textContent = meta.title;
  if ($("#pageSub")) $("#pageSub").textContent = meta.sub;

  const content = $("#content");
  if (!content) return;

  if (page === "home") content.innerHTML = renderHome();
  else if (page === "fact") content.innerHTML = renderFactV2();
  else content.innerHTML = `<div class="card glass">Раздел "${meta.title}" успешно загружен.</div>`;
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  initLoginHandlers();
  const user = await checkAuth();
  if (!user) {
    showLoginScreen();
  } else {
    showAppScreen(user);
    await loadFromCloud();
    showPage("home");
  }

  document.body.addEventListener("input", (e) => {
    const fwSlider = e.target.closest(".fw-slider");
    const fwInput = e.target.closest(".fw-input");
    if (fwSlider || fwInput) {
      const el = fwSlider || fwInput;
      const cid = el.dataset.corpse;
      const type = el.dataset.type;
      const work = el.dataset.work;
      const sub = el.dataset.sub;
      let val = parseFloat(el.value) || 0;

      setSubworkProgress(cid, type, work, sub, val);
      saveStore("facadeapp.factsV2", FACTS_V2);
      saveToCloud();

      const row = el.closest(".fw-row");
      if (row) {
        const other = fwSlider ? row.querySelector(".fw-input") : row.querySelector(".fw-slider");
        if (other) other.value = val;
      }
    }
  });

  $$(".nav-item, .nav-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      if (page) showPage(page);
    });
  });
});