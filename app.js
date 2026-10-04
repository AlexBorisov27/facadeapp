// ============================================================
//  FacadeApp v4.1 - часть 1/3
//  Авторизация, Supabase, вспомогательные функции
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
//  АВТОРИЗАЦИЯ (Supabase Auth)
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
    email,
    password,
    options: {
      data: { name: name || "" },
      emailRedirectTo: window.location.origin,
    },
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
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  if (loginScreen) loginScreen.style.display = "flex";
  if (appRoot) appRoot.style.display = "none";

  // Очищаем поля паролей
  const pwd = document.getElementById("loginPassword");
  if (pwd) pwd.value = "";
  const pwd2 = document.getElementById("registerPassword");
  if (pwd2) pwd2.value = "";
  const pwd3 = document.getElementById("registerPassword2");
  if (pwd3) pwd3.value = "";

  // Возвращаемся на вкладку «Вход»
  const loginTab = document.querySelector('.login-tab[data-tab="login"]');
  if (loginTab) loginTab.click();
}

function showAppScreen(user) {
  currentUser = user;
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  if (loginScreen) loginScreen.style.display = "none";
  if (appRoot) appRoot.style.display = "grid";

  const userEmail = document.getElementById("userEmail");
  const userDropdownEmail = document.getElementById("userDropdownEmail");
  if (userEmail) userEmail.textContent = user.email;
  if (userDropdownEmail) userDropdownEmail.textContent = user.email;
}

function showLoginError(msg) {
  const err = document.getElementById("loginError");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
  err.style.background = "";
  err.style.borderColor = "";
  err.style.color = "";
}

function showLoginSuccess(msg) {
  const err = document.getElementById("loginError");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
  err.style.background = "rgba(52, 199, 89, 0.1)";
  err.style.borderColor = "rgba(52, 199, 89, 0.3)";
  err.style.color = "var(--green)";
}

function clearLoginError() {
  const err = document.getElementById("loginError");
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
}
function showRegisterError(msg) {
  const err = document.getElementById("registerError");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
  err.style.background = "";
  err.style.borderColor = "";
  err.style.color = "";
}

function showRegisterSuccess(msg) {
  const err = document.getElementById("registerError");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
  err.style.background = "rgba(52, 199, 89, 0.1)";
  err.style.borderColor = "rgba(52, 199, 89, 0.3)";
  err.style.color = "var(--green)";
}

function clearRegisterError() {
  const err = document.getElementById("registerError");
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
}

function initLoginHandlers() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userBtn = document.getElementById("userBtn");
  const dropdown = document.getElementById("userDropdown");
  const forgotBtn = document.getElementById("loginForgot");
  const tabs = document.querySelectorAll(".login-tab");
  const indicator = document.getElementById("loginTabIndicator");

  // ─── Переключение вкладок Вход / Регистрация ───
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle("active", t === tab));
      if (indicator) indicator.classList.toggle("right", target === "register");

      if (target === "login") {
        loginForm.style.display = "flex";
        registerForm.style.display = "none";
        clearLoginError();
        clearRegisterError();
      } else {
        loginForm.style.display = "none";
        registerForm.style.display = "flex";
        clearLoginError();
        clearRegisterError();
      }
    });
  });

  // ─── Вход ───
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearLoginError();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!email || !password) {
        showLoginError("Заполните email и пароль");
        return;
      }

      const btnText = loginBtn.querySelector(".login-btn-text");
      const originalText = btnText.textContent;
      loginBtn.disabled = true;
      btnText.textContent = "Вход...";

      try {
        const user = await signIn(email, password);
        showAppScreen(user);
        await loadFromCloud();
        showPage("home");
      } catch (err) {
        console.error("Ошибка входа:", err);
        const msg = (err.message || "").toLowerCase();
        if (msg.includes("invalid") || msg.includes("credentials")) {
          showLoginError("Неверный email или пароль");
        } else if (msg.includes("email not confirmed")) {
          showLoginError("Email не подтверждён. Проверьте почту.");
        } else {
          showLoginError("Ошибка входа: " + (err.message || "неизвестная"));
        }
      } finally {
        loginBtn.disabled = false;
        btnText.textContent = originalText;
      }
    });
  }

  // ─── Регистрация ───
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearRegisterError();

      const name = document.getElementById("registerName").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value;
      const password2 = document.getElementById("registerPassword2").value;

      // Валидация
      if (!email || !password) {
        showRegisterError("Заполните email и пароль");
        return;
      }
      if (password.length < 6) {
        showRegisterError("Пароль должен быть не менее 6 символов");
        return;
      }
      if (password !== password2) {
        showRegisterError("Пароли не совпадают");
        return;
      }

      const btnText = registerBtn.querySelector(".login-btn-text");
      const originalText = btnText.textContent;
      registerBtn.disabled = true;
      btnText.textContent = "Создание...";

      try {
        const user = await signUp(email, password, name);

        // Проверка: email уже занят
        if (user && user.identities && user.identities.length === 0) {
          showRegisterError("Этот email уже зарегистрирован");
          return;
        }

        // Проверяем, есть ли сессия сразу (confirm email выключен)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          showAppScreen(session.user);
          await loadFromCloud();
          showPage("home");
        } else {
          // Confirm email включён — ждём подтверждения
          showRegisterSuccess(
            "Аккаунт создан! Проверьте почту " + email + " и подтвердите регистрацию."
          );
          registerForm.reset();
          setTimeout(() => {
            const loginTab = document.querySelector('.login-tab[data-tab="login"]');
            if (loginTab) loginTab.click();
          }, 3000);
        }
      } catch (err) {
        console.error("Ошибка регистрации:", err);
        const msg = (err.message || "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          showRegisterError("Этот email уже зарегистрирован");
        } else if (msg.includes("password")) {
          showRegisterError("Пароль слишком слабый (минимум 6 символов)");
        } else if (msg.includes("rate limit")) {
          showRegisterError("Слишком много попыток. Попробуйте через минуту.");
        } else {
          showRegisterError("Ошибка: " + (err.message || "неизвестная"));
        }
      } finally {
        registerBtn.disabled = false;
        btnText.textContent = originalText;
      }
    });
  }

  // ─── Выход ───
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (dropdown) dropdown.style.display = "none";
      await signOut();
    });
  }

  // ─── Меню пользователя ───
  if (userBtn && dropdown) {
    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", () => {
      if (dropdown) dropdown.style.display = "none";
    });
    dropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  // ─── Забыли пароль ───
  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail").value.trim();
      if (!email) {
        showLoginError("Введите email в поле выше");
        return;
      }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        showLoginSuccess("Письмо для сброса пароля отправлено на " + email);
      } catch (err) {
        showLoginError("Ошибка: " + (err.message || "неизвестная"));
      }
    });
  }
  }
// ============================================================
//  ХРАНИЛИЩЕ (localStorage)
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
let SUPPLIERS_STATE = loadStore(KEY_SUPPLIERS, JSON.parse(JSON.stringify(SUPPLIERS)));

// ============================================================
//  СИНХРОНИЗАЦИЯ С ОБЛАКОМ (Supabase)
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
    version: 4,
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
    const { data, error } = await supabase
      .from("project_state")
      .select("data")
      .eq("id", "main")
      .single();

    if (error) throw error;

    if (data && data.data && Object.keys(data.data).length) {
      applyAllData(data.data);
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
      const { error } = await supabase
        .from("project_state")
        .update({
          data: collectAllData(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main");

      if (error) throw error;
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
//  МЕТАДАННЫЕ СТРАНИЦ
// ============================================================
const PAGES = {
  home:        { title: "Главная",           sub: "Обзор состояния проекта" },
  dashboard:   { title: "Обзор проекта",     sub: "Сводные метрики по всем корпусам" },
  corpses:     { title: "Корпуса",           sub: "Детальная информация по каждому корпусу" },
  materials:   { title: "Материалы",         sub: "Плитка · Композит · Каркас и крепёж" },
  "mat-tile":  { title: "Плитка",            sub: "Распределение по цветам NCS",        parent: "materials" },
  "mat-comp":  { title: "Композит",          sub: "Объёмы по корпусам",                 parent: "materials" },
  "mat-frame": { title: "Каркас и крепёж",   sub: "Кронштейны, направляющие, метизы",   parent: "materials" },
  schedule:    { title: "График работ",      sub: "Диаграмма Ганта · НВФ и Остекление" },
  glazing:     { title: "Остекление",        sub: "Витражные окна и балконные блоки" },
  fact:        { title: "Факт выполнения",   sub: "Учёт выполненных работ по корпусам" },
  milestones:  { title: "Контрольные точки", sub: "Ключевые события проекта" },
  deliveries:  { title: "Поставки",          sub: "Учёт приёмки материалов по корпусам" },
  suppliers:   { title: "Поставщики",        sub: "Контрагенты и статусы договоров" },
};

let currentPage = "home";
let detailOpenCorpse = null;

// ============================================================
//  КОНЕЦ ЧАСТИ 1/3
//  Часть 2 — рендер-функции (главная, корпуса, Гант, остекление)
// ============================================================
// ============================================================
//  FacadeApp v4.1 - часть 2/3
//  Рендер-функции: главная, корпуса, график, остекление, detail panel
// ============================================================

// ============================================================
//  ГЛАВНАЯ — новый дизайн
// ============================================================
function renderHome() {
  const hour = new Date().getHours();
  let greet = "Добрый день";
  if (hour < 6) greet = "Доброй ночи";
  else if (hour < 12) greet = "Доброе утро";
  else if (hour < 18) greet = "Добрый день";
  else greet = "Добрый вечер";

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const dateStr = today.toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // ─── Потоки (НВФ + Остекление) ───
  const nvf = FLOW_SUMMARY.nvf;
  const glz = FLOW_SUMMARY.glz;

  const flowCard = (label, flow, isGlazing) => {
    const statusClass = flow.status === "ok" ? "ok" : flow.status === "warn" ? "warn" : "bad";
    const statusText = flow.status === "ok" ? "В графике" : flow.status === "warn" ? "Отстаём" : "Критично";
    return `
      <div class="flow${isGlazing ? ' glazing' : ''}">
        <div class="head">
          <div class="title"><span class="dot"></span>${label}</div>
          <span class="badge ${statusClass}">${statusText}</span>
        </div>
        <div class="progress"><div class="fill ${statusClass}" style="width:${flow.fact}%"></div></div>
        <div class="nums">
          <div><div class="lbl">План</div><div class="val">${flow.plan}%</div></div>
          <div><div class="lbl">Факт</div><div class="val ${statusClass}">${flow.fact}%</div></div>
          <div><div class="lbl">Откл.</div><div class="val ${statusClass}">${flow.deviation}</div></div>
        </div>
      </div>
    `;
  };

  // ─── Вердикт ───
  const verdictHtml = nvf.status === "warn"
    ? `НВФ отстаёт на <b>${nvf.deviation.replace("−", "").replace(" ", " ")}</b>. Остекление идёт в графике.`
    : nvf.status === "ok"
      ? `Оба потока идут в графике.`
      : `НВФ в критическом состоянии. Требуется вмешательство.`;

  // ─── Список корпусов ───
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];
  const corpsesHtml = corpseOrder.map(cid => {
    const c = CORPSES[cid];
    const dotClass = c.status === "ok" ? "" : c.status;
    return `
      <div class="corpse-row" data-corpse="${cid}">
        <div class="corpse-row-head">
          <div class="corpse-row-id">
            <span class="corpse-row-dot ${dotClass}"></span>
            ${cid}
          </div>
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

  // ─── Лента событий ───
  const feedHtml = FEED.map(f => `
    <div class="feed-item">
      <div class="dot ${f.type}"></div>
      <div class="body">
        <div><b>${f.user}</b> ${f.text}</div>
        <div class="meta">${f.corp ? "Корпус " + f.corp + " · " : ""}${f.time}</div>
      </div>
    </div>
  `).join("");

  // ─── Ближайшие КТ ───
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
  }).join("") : `<div class="empty-state">Все контрольные точки пройдены</div>`;

  return `
    <div class="home-hero glass">
      <div class="home-greet">${greet}!</div>
      <div class="home-project">Проект: Кавказский б-р, з/у 51/3</div>
      <div class="home-subtitle">${dateCap} · 7 корпусов · 2 этапа</div>
    </div>

    <div class="flows">
      ${flowCard("НВФ", nvf, false)}
      ${flowCard("Остекление", glz, true)}
    </div>

    <div class="verdict">
      <div class="ico">!</div>
      <div class="text">${verdictHtml}</div>
    </div>

    <div class="quick">
      <button class="quick-btn" data-goto="schedule">
        <span class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M8 2v4M16 2v4M3 10h18"/>
          </svg>
        </span>
        <span class="lbl">График</span>
      </button>
      <button class="quick-btn" data-goto="glazing">
        <span class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 12h18M12 3v18"/>
          </svg>
        </span>
        <span class="lbl">Остекление</span>
      </button>
      <button class="quick-btn" id="quickExport">
        <span class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/>
          </svg>
        </span>
        <span class="lbl">Экспорт</span>
      </button>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Корпуса</h2>
        <button class="section-action" data-goto="corpses">Все →</button>
      </div>
      <div class="corpses-list">${corpsesHtml}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Последние изменения</h2>
      </div>
      <div class="feed">${feedHtml}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Ближайшие контрольные точки</h2>
        <button class="section-action" data-goto="milestones">Все →</button>
      </div>
      <div class="home-kt-list">${upcomingHtml}</div>
    </div>
  `;
}

// ============================================================
//  КОРПУСА — компактный список
// ============================================================
function renderCorpses() {
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];

  const rowsHtml = corpseOrder.map(cid => {
    const c = CORPSES[cid];
    const dotClass = c.status === "ok" ? "" : c.status;
    return `
      <div class="corpse-row" data-corpse="${cid}">
        <div class="corpse-row-head">
          <div class="corpse-row-id">
            <span class="corpse-row-dot ${dotClass}"></span>
            Корпус ${cid}
          </div>
          <div class="corpse-row-status ${c.status}">${c.statusText}</div>
        </div>
        <div class="corpse-row-sub">${c.floors} · ${c.height} м · ${c.code} · ${c.rev}</div>
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
    <div class="corpses-list">${rowsHtml}</div>
    <p style="font-size:12px;color:var(--text-gray);margin-top:16px;padding:0 4px;">
      Клик по корпусу — детали справа
    </p>
  `;
}

// ============================================================
//  ГРАФИК — раскрывающийся Гант
// ============================================================
function renderSchedule() {
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];

  const renderStage = (stage) => `
    <div class="stage-item">
      <div class="stage-name">${stage.name}</div>
      <div class="stage-progress"><div class="fill ${stage.status}" style="width:${stage.fact}%"></div></div>
      <div class="stage-status ${stage.status}">${stage.fact}%</div>
    </div>
  `;

  const corpsHtml = corpseOrder.map(cid => {
    const g = GANTT_DATA[cid];
    if (!g) return "";
    const nvfStages = g.nvf.stages.map(renderStage).join("");
    const glzStages = g.glz.stages.map(renderStage).join("");

    return `
      <div class="gantt-corp" data-corp="${cid}">
        <div class="gantt-corp-row">
          <div class="label">
            ${cid}
            <small>${g.meta.floors} · ${g.meta.area} м²</small>
          </div>
          <div class="gantt-bars">
            <div class="gantt-bar nvf" style="left:${g.nvf.left}%; width:${g.nvf.width}%;"></div>
            <div class="gantt-bar glz" style="left:${g.glz.left}%; width:${g.glz.width}%;"></div>
            <div class="gantt-fact-line" style="left:${g.nvf.left + g.nvf.width * (g.nvf.fact / 100)}%;"></div>
          </div>
          <div class="chevron">›</div>
        </div>
        <div class="gantt-detail">
          <div class="detail-inner">
            ${nvfStages ? `<div class="detail-title">НВФ · по этапам</div>${nvfStages}` : ""}
            ${glzStages ? `<div class="detail-title">Остекление · по этапам</div>${glzStages}` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="gantt">
      <div class="gantt-header">
        <h3>Диаграмма Ганта</h3>
        <div class="legend">
          <div class="item"><span class="sw nvf"></span>НВФ</div>
          <div class="item"><span class="sw glz"></span>Остекление</div>
          <div class="item"><span class="sw fact"></span>Факт</div>
        </div>
      </div>

      <div class="gantt-chart">
        <div class="gantt-months">
          <div></div>
          <div class="row">
            <span>сен</span><span>окт</span><span>ноя</span><span>дек</span>
            <span>янв</span><span>фев</span><span>мар</span><span>апр</span>
          </div>
        </div>

        ${corpsHtml}
      </div>

      <p style="font-size:12px;color:var(--text-gray);margin-top:16px;line-height:1.5;">
        Красная линия — фактическая дата. <b>Клик по корпусу</b> — детализация по этапам.
      </p>
    </div>
  `;
}

// ============================================================
//  ОСТЕКЛЕНИЕ — карточки марок
// ============================================================
function renderGlazing() {
  const stats = GLAZING_STATS;

  const statsHtml = `
    <div class="stat"><div class="t">Марок</div><div class="v">${stats.marks}</div></div>
    <div class="stat"><div class="t">Изделий</div><div class="v">${stats.items} <small>шт</small></div></div>
    <div class="stat"><div class="t">Площадь</div><div class="v">${fmt(stats.area)} <small>м²</small></div></div>
    <div class="stat"><div class="t">Готово</div><div class="v">${stats.done} <small>марки</small></div></div>
    <div class="stat"><div class="t">Критично</div><div class="v" style="color:var(--red)">${stats.critical}</div></div>
  `;

  const statusText = { ok: "В графике", warn: "Отстаём", bad: "Критично", future: "Будущее" };

  const marksHtml = MARKS.map(m => `
    <div class="mark ${m.status}">
      <div class="top">
        <div class="code">${m.code}</div>
        <span class="badge ${m.status}">${statusText[m.status]}</span>
      </div>
      <div class="badges">
        <span class="tag corp">Корпус ${m.corp}</span>
        <span class="tag type">${m.type}</span>
        <span class="tag ${m.stage === "№1" ? "stage1" : "stage2"}">Этап ${m.stage}</span>
      </div>
      <div class="meta">
        <span>Габарит: <b>${m.size}</b></span>
        <span>Кол-во: <b>${m.qty} шт</b></span>
        <span>Площадь: <b>${m.area} м²</b></span>
      </div>
      <div class="fact-bar">
        <div class="progress"><div class="fill ${m.status}" style="width:${m.fact}%"></div></div>
        <div class="pct">${m.fact}%</div>
      </div>
    </div>
  `).join("");

  return `
    <div class="chips">
      <button class="chip on">Все типы</button>
      <button class="chip">Витраж</button>
      <button class="chip">Балкон</button>
      <button class="chip">Этап №1</button>
      <button class="chip">Этап №2</button>
    </div>

    <div class="stat-grid">${statsHtml}</div>

    ${marksHtml}
  `;
}

// ============================================================
//  DETAIL PANEL — справа
// ============================================================
function renderDetailPanel(cid) {
  const c = CORPSES[cid];
  if (!c) return;

  const dotClass = c.status === "ok" ? "" : c.status;

  document.getElementById("dpTitle").textContent = "Корпус " + cid;
  document.getElementById("dpSub").textContent = c.floors + " · " + c.code;

  document.getElementById("dpBody").innerHTML = `
    <div class="dp-section">
      <div class="dp-lbl">Статус</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600">
        <span class="corpse-row-dot ${dotClass}"></span>
        ${c.statusText}
      </div>
    </div>

    <div class="dp-section">
      <div class="dp-lbl">Прогресс</div>
      <div class="dp-progress">
        <div class="dp-progress-row">
          <span class="dp-progress-label">НВФ</span>
          <div class="dp-progress-bar"><div class="dp-progress-fill" style="width:${c.nvfPct}%"></div></div>
          <span class="dp-progress-value">${c.nvfPct}%</span>
        </div>
      </div>
      <div class="dp-progress">
        <div class="dp-progress-row">
          <span class="dp-progress-label">Остекление</span>
          <div class="dp-progress-bar"><div class="dp-progress-fill glz" style="width:${c.glz}%"></div></div>
          <span class="dp-progress-value">${c.glz}%</span>
        </div>
      </div>
    </div>

    <div class="dp-section">
      <div class="dp-lbl">Документация</div>
      <div class="dp-row"><span class="k">Шифр</span><span class="v">${c.code}</span></div>
      <div class="dp-row"><span class="k">Ревизия</span><span class="v">${c.rev}</span></div>
      <div class="dp-row"><span class="k">Листов</span><span class="v">${c.sheets}</span></div>
      <div class="dp-row"><span class="k">Марок</span><span class="v">${c.marks}</span></div>
    </div>

    <div class="dp-section">
      <div class="dp-lbl">Профиль</div>
      <div class="dp-row"><span class="k">Наружный</span><span class="v" style="font-size:12px">${c.colorOuter}</span></div>
      <div class="dp-row"><span class="k">Внутренний</span><span class="v">${c.colorInner}</span></div>
    </div>

    <div class="dp-section">
      <div class="dp-lbl">Материалы</div>
      <div class="dp-row"><span class="k">Плитка</span><span class="v">${fmt(c.tile)} м²</span></div>
      <div class="dp-row"><span class="k">Композит</span><span class="v">${fmt(c.composite)} м²</span></div>
      <div class="dp-row"><span class="k">Итого фасад</span><span class="v">${fmt(c.total)} м²</span></div>
    </div>

    <div class="dp-section">
      <div class="dp-lbl">Действия</div>
      <div class="dp-actions">
        <button class="dp-btn primary" data-goto="fact">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
          </svg>
          Факт выполнения
        </button>
        <button class="dp-btn" data-goto="deliveries">
          Поставки
        </button>
      </div>
    </div>
  `;
}

function openDetail(cid) {
  const panel = document.getElementById("detailPanel");
  const overlay = document.getElementById("overlay");
  if (!panel || !overlay) return;

  detailOpenCorpse = cid;
  renderDetailPanel(cid);
  panel.classList.add("open");
  overlay.classList.add("open");
}

function closeDetail() {
  const panel = document.getElementById("detailPanel");
  const overlay = document.getElementById("overlay");
  if (!panel || !overlay) return;

  detailOpenCorpse = null;
  panel.classList.remove("open");
  overlay.classList.remove("open");
}

// ============================================================
//  РАСКРЫТИЕ КОРПУСА В ГАНТЕ
// ============================================================
function toggleCorp(rowEl) {
  const corp = rowEl.closest(".gantt-corp");
  if (corp) corp.classList.toggle("open");
}

// ============================================================
//  КОНЕЦ ЧАСТИ 2/3
//  Часть 3 — старые рендеры + роутер + init
// ============================================================
// ============================================================
//  FacadeApp v4.1 - часть 3/3
//  Старые рендеры, роутер, аккордеон, init
// ============================================================

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
          <div style="flex:1;height:6px;background:var(--gray-light);border-radius:3px;overflow:hidden;">
            <div style="width:${prog}%;height:100%;background:linear-gradient(90deg,var(--blue),var(--teal));"></div>
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
//  MATERIALS
// ============================================================
function renderMaterialsHub() {
  const totalTile = Object.values(CORPSES).reduce((s, c) => s + c.tile, 0);
  const totalComp = Object.values(CORPSES).reduce((s, c) => s + c.composite, 0);
  const totalBr   = Object.values(CORPSES).reduce((s, c) => s + c.brackets, 0);

  const cards = [
    { page: "mat-tile",  icon: "🎨", title: "Плитка",          sub: `${fmt(totalTile)} м²`, color: "var(--green)" },
    { page: "mat-comp",  icon: "🧱", title: "Композит",        sub: `${fmt(totalComp)} м²`, color: "var(--orange)" },
    { page: "mat-frame", icon: "🔩", title: "Каркас и крепёж", sub: `${fmt(totalBr)} шт`,   color: "var(--purple)" },
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
            ${isDone ? `<span class="milestone-date-fact">✓ ${state.fact}</span>` : ""}
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
  saveToCloud();
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
        💾 Данные сохраняются в облако автоматически.
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
                 value="${s.materials || ''}" placeholder="Материалы" />
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
  glazing:     renderGlazing,
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

  const pageTitle = $("#pageTitle");
  const pageSub = $("#pageSub");
  const content = $("#content");
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSub) pageSub.textContent = meta.sub;
  if (content) content.innerHTML = crumb + (RENDERERS[page] ? RENDERERS[page]() : "");

  // Подсветка активного пункта в sidebar
  const rootPage = meta.parent || page;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === rootPage || b.dataset.page === page));

  // Подсветка активного раздела
  $$(".nav-section").forEach(sec => {
    const active = sec.querySelector(".nav-item.active, .nav-header.active");
    sec.classList.toggle("active", !!active && !sec.querySelector(".nav-sub"));
  });

  // Обновляем прогресс-бары
  requestAnimationFrame(() => {
    $$(".corpse-row-fill, .flow .fill, .stage-progress .fill, .fact-progress-fill, .dp-progress-fill").forEach(el => {
      const w = el.style.width;
      el.style.width = "0";
      setTimeout(() => { el.style.width = w; }, 50);
    });
  });
}

// ============================================================
//  EXPORT CSV
// ============================================================
// ============================================================
//  ЭКСПОРТ PDF — отчёт для руководителя
// ============================================================
function exportPDF() {
  // Проверяем, что библиотека загрузилась
  if (typeof html2pdf === "undefined") {
    alert("Библиотека html2pdf не загружена. Проверьте интернет-соединение и обновите страницу.");
    return;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric"
  });

  // ─── Потоки ───
  const nvf = FLOW_SUMMARY.nvf;
  const glz = FLOW_SUMMARY.glz;
  const totalPct = Math.round((nvf.fact + glz.fact) / 2);

  const statusClass = (s) => s === "ok" ? "ok" : s === "warn" ? "warn" : "risk";

  // ─── Проблемные корпуса ───
  const problems = [];
  Object.keys(CORPSES).sort().forEach(cid => {
    const c = CORPSES[cid];
    if (c.status === "risk" || c.status === "warn") {
      problems.push({
        id: cid,
        status: c.status,
        statusText: c.statusText,
        detail: `НВФ ${c.nvfPct}% · Остекление ${c.glz}% · ${c.deviation}`
      });
    }
  });

  // ─── Список корпусов ───
  const corpseOrder = ["3.4", "3.5", "3.6", "3.7", "3.1", "3.2", "3.3"];
  const corpseRows = corpseOrder.map(cid => {
    const c = CORPSES[cid];
    const avg = Math.round((c.nvfPct + c.glz) / 2);
    return `
      <div class="pdf-corpse-row">
        <div class="pdf-corpse-id">${cid}</div>
        <div class="pdf-corpse-status ${c.status}">${c.statusText}</div>
        <div class="pdf-corpse-bar">
          <div class="pdf-corpse-fill ${c.status}" style="width:${avg}%"></div>
        </div>
        <div class="pdf-corpse-pct">${avg}%</div>
      </div>
    `;
  }).join("");

  // ─── Ближайшие контрольные точки ───
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = MILESTONES
    .filter(m => !(MILESTONE_STATE[milestoneKey(m)]?.done))
    .map(m => ({ ...m, dateObj: parseDate(m.date) }))
    .filter(m => m.dateObj >= todayMidnight)
    .sort((a, b) => a.dateObj - b.dateObj)
    .slice(0, 5);

  const milestoneRows = upcoming.length ? upcoming.map(m => `
    <div class="pdf-milestone">
      <div class="pdf-milestone-date">${m.date}</div>
      <div class="pdf-milestone-label">${m.label}</div>
    </div>
  `).join("") : `<div class="pdf-milestone">Все контрольные точки пройдены</div>`;

  // ─── Проблемы ───
  const problemsHtml = problems.length
    ? problems.map(p => `
        <div class="pdf-alert ${p.status}">
          <div class="pdf-alert-icon"></div>
          <div class="pdf-alert-text">
            <b>Корпус ${p.id}</b> — ${p.statusText}. ${p.detail}
          </div>
        </div>
      `).join("")
    : `<div class="pdf-alert" style="border-left-color:#34C759;background:#F0FBF4;">
        <div class="pdf-alert-icon" style="background:#34C759;"></div>
        <div class="pdf-alert-text">Все корпуса в графике</div>
       </div>`;

  // ─── Финальный HTML отчёта ───
  const reportHtml = `
    <div class="pdf-report">
      <div class="pdf-header">
        <div>
          <div class="pdf-title">FacadeApp · Отчёт по проекту</div>
          <div class="pdf-subtitle">Кавказский б-р, з/у 51/3 · 7 корпусов · 2 этапа</div>
        </div>
        <div class="pdf-date">${dateStr}</div>
      </div>

      <div class="pdf-section">
        <div class="pdf-section-title">Общий прогресс</div>
        <div class="pdf-kpi-grid">
          <div class="pdf-kpi">
            <div class="pdf-kpi-label">НВФ</div>
            <div class="pdf-kpi-value ${statusClass(nvf.status)}">${nvf.fact}%</div>
            <div class="pdf-kpi-meta ${statusClass(nvf.status)}">${nvf.deviation} · план ${nvf.plan}%</div>
          </div>
          <div class="pdf-kpi">
            <div class="pdf-kpi-label">Остекление</div>
            <div class="pdf-kpi-value ${statusClass(glz.status)}">${glz.fact}%</div>
            <div class="pdf-kpi-meta ${statusClass(glz.status)}">${glz.deviation} · план ${glz.plan}%</div>
          </div>
          <div class="pdf-kpi">
            <div class="pdf-kpi-label">Всего</div>
            <div class="pdf-kpi-value" style="color:#007AFF">${totalPct}%</div>
            <div class="pdf-kpi-meta" style="color:#8E8E93">по двум потокам</div>
          </div>
        </div>
      </div>

      <div class="pdf-section">
        <div class="pdf-section-title">Требует внимания (${problems.length})</div>
        <div class="pdf-alerts">${problemsHtml}</div>
      </div>

      <div class="pdf-section">
        <div class="pdf-section-title">Статус по корпусам</div>
        <div class="pdf-corpse-list">${corpseRows}</div>
      </div>

      <div class="pdf-section">
        <div class="pdf-section-title">Ближайшие контрольные точки (${upcoming.length})</div>
        <div class="pdf-milestones">${milestoneRows}</div>
      </div>

      <div class="pdf-footer">
        Сгенерировано ${dateStr} · FacadeApp v4.1 · Симплекс Фасад
      </div>
    </div>
  `;

  // ─── Временный контейнер ───
  const container = document.createElement("div");
container.style.position = "fixed";
container.style.left = "-9999px";
container.style.top = "0";
container.style.width = "760px";
container.style.background = "#FFFFFF";
container.style.padding = "0";
container.style.margin = "0";
container.innerHTML = reportHtml.trim();
document.body.appendChild(container);

  // ─── Имя файла ───
  const filename = `FacadeApp_Отчёт_${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.pdf`;

  // ─── Настройки PDF ───
  const opt = {
    margin: 0,
    filename: filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#FFFFFF",
      logging: false,
          windowWidth: 794,
    width: 794,
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    },
    pagebreak: { mode: ["avoid-all", "css"] },
  };

  // ─── Генерация и скачивание ───
 // Вынимаем отчёт из контейнера — html2pdf не должен видеть родителя
const reportElement = container.firstElementChild;
container.removeChild(reportElement);

html2pdf()
  .set(opt)
  .from(reportElement)
  .save()
  .then(() => {
    console.log("✅ PDF сгенерирован:", filename);
    document.body.removeChild(container);
  })
  .catch((err) => {
    console.error("Ошибка PDF:", err);
    document.body.removeChild(container);
    alert("Не удалось создать PDF: " + err.message);
  });
}
function exportCSV() {
  let headers = [], rows = [], filename = "export.csv";

  if (currentPage === "home" || currentPage === "dashboard" || currentPage === "corpses") {
    headers = ["Корпус", "Этаж", "Высота", "Этап", "Шифр", "НВФ %", "Остекление %", "Статус", "Плитка м²", "Композит м²", "Итого м²", "Прогресс %"];
    rows = Object.keys(CORPSES).sort().map(cid => {
      const c = CORPSES[cid];
      return [cid, c.floors, c.height, c.stage, c.code, c.nvfPct, c.glz, c.statusText, c.tile, c.composite, c.total, corpseProgress(cid)];
    });
    filename = "corpses.csv";
  } else if (currentPage === "glazing") {
    headers = ["Марка", "Корпус", "Тип", "Этап", "Габарит", "Кол-во", "Площадь м²", "Факт %", "Статус"];
    rows = MARKS.map(m => [m.code, m.corp, m.type, m.stage, m.size, m.qty, m.area, m.fact, m.status]);
    filename = "glazing.csv";
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
  if (!container) return;
  const clearAll = () => {
    $$("tr", container).forEach(tr => tr.style.display = "");
    $$(".corpse-card, .corpse-row, .gantt-row, .gantt-corp-row, .folder-card, .milestone-card, .delivery-card, .home-kt-row, .home-corpus, .fact-card, .fact-stage, .supplier-card, .gantt-summary-card, .mark, .flow", container).forEach(el => el.style.display = "");
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
  filterList(".corpse-row");
  filterList(".gantt-corp-row");
  filterList(".folder-card");
  filterList(".milestone-card");
  filterList(".delivery-card");
  filterList(".home-kt-row");
  filterList(".home-corpus");
  filterList(".fact-card");
  filterList(".supplier-card");
  filterList(".gantt-summary-card");
  filterList(".mark");
}

// ============================================================
//  THEME
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", dark ? "light" : "dark");
  const btn = $("#themeToggle");
  if (btn) btn.textContent = dark ? "🌙 Тёмная тема" : "☀️ Светлая тема";
}

// ============================================================
//  АККОРДЕОН SIDEBAR
// ============================================================
function initAccordion() {
  $$(".nav-section").forEach(section => {
    const header = section.querySelector(".nav-header");
    const sub = section.querySelector(".nav-sub");
    if (!sub) return; // Обзор — без подпунктов

    header.addEventListener("click", (e) => {
      e.stopPropagation();
      section.classList.toggle("open");
    });
  });

  // Клик по подпункту — смена страницы
  $$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const page = item.dataset.page;
      if (page) showPage(page);
    });
  });

  // Клик по «Обзор» (без подпунктов)
  const overviewHeader = document.querySelector('[data-section="overview"] .nav-header');
  if (overviewHeader) {
    overviewHeader.addEventListener("click", () => {
      showPage("home");
    });
  }
}

// ============================================================
//  DETAIL PANEL — обработчики
// ============================================================
function initDetailPanel() {
  const closeBtn = document.getElementById("dpClose");
  const overlay = document.getElementById("overlay");
  if (closeBtn) closeBtn.addEventListener("click", closeDetail);
  if (overlay) overlay.addEventListener("click", closeDetail);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Обработчики формы логина
  initLoginHandlers();

  // 2. Проверяем авторизацию
  const user = await checkAuth();
  if (!user) {
    showLoginScreen();
    console.log("Не авторизован — показываю экран логина");
    return;
  }

  // 3. Пользователь авторизован — показываем приложение
  showAppScreen(user);
  console.log("Авторизован как:", user.email);

  // 4. Загружаем данные из облака
  await loadFromCloud();

  // 5. Автосрез фактов
  autoTrimFacts();

  // 6. Аккордеон sidebar
  initAccordion();

  // 7. Detail Panel — обработчики закрытия
  initDetailPanel();

  // 8. Делегирование кликов
  document.body.addEventListener("click", (e) => {
    // Удаление поставщика
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

    // Добавление поставщика
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

    // Быстрый экспорт
    if (e.target.closest("#quickExport")) {
      exportCSV();
      return;
    }

    // Клик по корпусу → detail panel
    const corpseRow = e.target.closest("[data-corpse]");
    if (corpseRow) {
      const cid = corpseRow.dataset.corpse;
      openDetail(cid);
      return;
    }

    // Клик по корпусу в Ганте → раскрытие
    const ganttRow = e.target.closest(".gantt-corp-row");
    if (ganttRow) {
      toggleCorp(ganttRow);
      return;
    }

    // Клик по контрольной точке
    const kt = e.target.closest("[data-kt]");
    if (kt) { handleMilestoneClick(kt.dataset.kt); return; }

    // Переход по data-goto
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      e.preventDefault();
      showPage(goto.dataset.goto);
      return;
    }

    // Клик по чипу (фильтр)
    const chip = e.target.closest(".chip");
    if (chip) {
      chip.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
      chip.classList.add("on");
      return;
    }
  });

  // 9. Ввод данных
  document.body.addEventListener("input", (e) => {
    // Ввод в поставках
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

    // Ввод слайдера/числа факта
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

    // Ввод в поставщиках
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

  // 10. Чекбоксы поставщиков
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

  // 11. Кнопки в topbar
     const globalSearch = $("#globalSearch");
    const exportBtn = $("#exportBtn");
    const exportPdfBtn = $("#exportPdfBtn");
    const themeToggle = $("#themeToggle");
    if (globalSearch) globalSearch.addEventListener("input", (e) => applySearch(e.target.value));
    if (exportBtn) exportBtn.addEventListener("click", exportCSV);
    if (exportPdfBtn) exportPdfBtn.addEventListener("click", exportPDF);
    if (themeToggle) themeToggle.addEventListener("click", toggleTheme);

  // 12. Стартовая страница
  showPage("home");

  console.log("%c✅ FacadeApp v4.1 запущен", "color:#007AFF; font-weight:bold; font-size:14px;");
});

// ============================================================
//  КОНЕЦ ФАЙЛА app.js
// ============================================================