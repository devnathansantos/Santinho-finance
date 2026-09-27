/* Santinho Finance — app.js
   100% client-side.
   Dados financeiros permanecem em localStorage + IndexedDB.
   Não alterar as chaves de armazenamento sem criar uma migração.
*/
(() => {
  "use strict";

  const DB_NAME = "santinho-finance-db";
  const DB_VERSION = 1;
  const STORE = "app";
  const LS_KEY = "santinho-finance-snapshot-v1";
  const SESSION_KEY = "santinho-session";
  const SCHEMA = 1;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(value) || 0);

  const uid = (prefix) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const MOTIVATIONS = [
    "Pequenos hábitos, grandes resultados.",
    "Cada real bem direcionado aproxima uma meta.",
    "Controle não é deixar de viver; é escolher para onde o dinheiro vai.",
    "Seu futuro financeiro começa com uma decisão feita hoje.",
    "Registrar um gasto é transformar dinheiro em informação.",
    "Consistência vale mais que perfeição.",
    "Uma meta clara deixa cada economia mais concreta.",
    "O Santinho acredita: organização financeira também é liberdade.",
    "Antes de gastar, pergunte: isso ajuda ou atrapalha minha próxima meta?",
    "Dinheiro organizado dá mais espaço para aproveitar a vida."
  ];

  const defaultState = () => ({
    schema: SCHEMA,
    credentials: null,
    profile: {
      username: "",
      email: "",
      avatar: null
    },
    transactions: [],
    goals: [],
    settings: {
      theme: "dark",
      pinHash: null
    },
    motivationHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let state = defaultState();
  let db = null;
  let balanceVisible = true;
  let currentPage = "dashboard";
  let unlocked = false;
  let saveTimer = null;

  // =========================================================
  // DATAS — SEM UTC PARA EVITAR O ERRO DE 14/06 -> 13/06
  // =========================================================

  function todayKey() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDateKey(key) {
    if (!key) return null;
    const [y, m, d] = String(key).split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function formatDateKey(key) {
    const d = parseDateKey(key);
    return d
      ? d.toLocaleDateString("pt-BR")
      : "Data inválida";
  }

  function monthKey(keyOrDate = new Date()) {
    if (typeof keyOrDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(keyOrDate)) {
      return keyOrDate.slice(0, 7);
    }
    const d = keyOrDate instanceof Date ? keyOrDate : new Date(keyOrDate);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function yearKey(keyOrDate = new Date()) {
    if (typeof keyOrDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(keyOrDate)) {
      return keyOrDate.slice(0, 4);
    }
    const d = keyOrDate instanceof Date ? keyOrDate : new Date(keyOrDate);
    return Number.isNaN(d.getTime()) ? "" : String(d.getFullYear());
  }

  function compareDateKeys(a, b) {
    return String(a).localeCompare(String(b));
  }

  function isFutureTransaction(t) {
    return String(t.date) > todayKey();
  }

  function isRealizedTransaction(t) {
    return String(t.date) <= todayKey();
  }

  // =========================================================
  // VALORES
  // =========================================================

  function parseBRL(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    let s = String(value ?? "").trim();
    if (!s) return 0;

    s = s.replace(/\s/g, "").replace(/R\$/gi, "");

    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeAmount(value) {
    return Math.round(parseBRL(value) * 100) / 100;
  }

  // =========================================================
  // INDEXEDDB + LOCALSTORAGE
  // =========================================================

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB indisponível"));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha no IndexedDB"));
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("DB não aberto"));
        return;
      }

      const req = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(key);

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("DB não aberto"));
        return;
      }

      const req = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put(value, key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function normalize(raw) {
    const base = defaultState();

    const transactions = Array.isArray(raw?.transactions)
      ? raw.transactions
          .filter((t) => t && typeof t === "object")
          .map((t) => ({
            id: t.id || uid("tx"),
            type: t.type === "income" ? "income" : "expense",
            description: String(t.description ?? "").trim() || "Sem descrição",
            amount: normalizeAmount(t.amount),
            category: String(t.category ?? "Outros"),
            date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.date))
              ? String(t.date)
              : todayKey(),
            note: String(t.note ?? "").trim(),
            recurrence: t.recurrence || "none",
            recurrenceEnd: /^\d{4}-\d{2}-\d{2}$/.test(String(t.recurrenceEnd))
              ? String(t.recurrenceEnd)
              : "",
            parentId: t.parentId || null
          }))
      : [];

    const goals = Array.isArray(raw?.goals)
      ? raw.goals.map((g) => ({
          id: g.id || uid("goal"),
          name: String(g.name ?? "").trim(),
          target: normalizeAmount(g.target),
          current: normalizeAmount(g.current),
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(g.deadline))
            ? String(g.deadline)
            : ""
        }))
      : [];

    return {
      ...base,
      ...raw,
      schema: SCHEMA,
      credentials: raw?.credentials ? { ...raw.credentials } : null,
      profile: {
        ...base.profile,
        ...(raw?.profile || {})
      },
      settings: {
        ...base.settings,
        ...(raw?.settings || {})
      },
      transactions,
      goals,
      motivationHistory: Array.isArray(raw?.motivationHistory)
        ? raw.motivationHistory.map(String).slice(-5)
        : []
    };
  }

  async function loadState() {
    let candidate = null;

    try {
      db = await openDB();
      candidate = await idbGet("state");
    } catch (error) {
      console.warn("IndexedDB indisponível:", error);
    }

    if (!candidate) {
      try {
        candidate = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      } catch (error) {
        console.warn("localStorage inválido:", error);
      }
    }

    state = candidate?.schema === SCHEMA
      ? normalize(candidate)
      : defaultState();

    applyTheme();
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Falha ao salvar localStorage:", error);
      toast("Não foi possível salvar os dados locais.");
    }

    clearTimeout(saveTimer);

    saveTimer = setTimeout(async () => {
      try {
        if (db) await idbSet("state", state);
      } catch (error) {
        console.warn("Falha ao salvar IndexedDB:", error);
      }
    }, 0);
  }

  // =========================================================
  // CRIPTOGRAFIA LOCAL
  // =========================================================

  async function hashSecret(secret, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 150000,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

    return [...new Uint8Array(bits)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function makeCredential(identifier, password) {
    const salt = crypto.randomUUID();
    return {
      identifier: identifier.trim().toLowerCase(),
      salt,
      passwordHash: await hashSecret(password, salt)
    };
  }

  // =========================================================
  // AUTENTICAÇÃO
  // =========================================================

  function show(view) {
    ["authView", "pinView", "mainView"].forEach((id) => {
      const element = $("#" + id);
      if (element) element.classList.toggle("hidden", id !== view);
    });
  }

  function authMessage(message, error = false) {
    const el = $("#authMessage");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }

  function pinMessage(message, error = false) {
    const el = $("#pinMessage");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }

  function updateAuthMode() {
    const hasAccount = !!state.credentials;

    $("#loginForm")?.classList.toggle("hidden", !hasAccount);
    $("#setupForm")?.classList.toggle("hidden", hasAccount);

    if ($("#toggleSetup")) {
      $("#toggleSetup").textContent = hasAccount
        ? "Criar/alterar acesso local"
        : "Já tenho uma conta local";
    }

    if ($("#authTitle")) {
      $("#authTitle").textContent = hasAccount
        ? "Entrar no Santinho Finance"
        : "Criar seu Santinho Finance";
    }

    if ($("#authSubtitle")) {
      $("#authSubtitle").textContent = hasAccount
        ? "A autenticação acontece somente neste aparelho."
        : "Crie um acesso local. Nenhuma credencial será enviada para a internet.";
    }
  }

  async function setupAccount(event) {
    event.preventDefault();

    const username = $("#setupUsername").value.trim();
    const email = $("#setupEmail").value.trim();
    const password = $("#setupPassword").value;
    const password2 = $("#setupPassword2").value;

    if (!username) {
      authMessage("Informe um nome de usuário.", true);
      return;
    }

    if (password.length < 6) {
      authMessage("Use pelo menos 6 caracteres.", true);
      return;
    }

    if (password !== password2) {
      authMessage("As senhas não conferem.", true);
      return;
    }

    const identifier = email || username;
    state.credentials = await makeCredential(identifier, password);
    state.profile.username = username;
    state.profile.email = email;

    saveState();
    updateAuthMode();

    $("#loginIdentifier").value = identifier;
    $("#loginPassword").value = "";

    authMessage("Conta local criada. Entre para continuar.");
  }

  async function login(event) {
    event.preventDefault();

    const identifier = $("#loginIdentifier").value.trim().toLowerCase();
    const password = $("#loginPassword").value;
    const credential = state.credentials;

    if (!credential) {
      authMessage("Nenhuma conta local configurada.", true);
      return;
    }

    const username = String(state.profile.username || "").toLowerCase();
    const email = String(state.profile.email || "").toLowerCase();

    if (
      identifier !== credential.identifier &&
      identifier !== username &&
      identifier !== email
    ) {
      authMessage("Username/e-mail ou senha inválidos.", true);
      return;
    }

    const digest = await hashSecret(password, credential.salt);

    if (digest !== credential.passwordHash) {
      authMessage("Username/e-mail ou senha inválidos.", true);
      return;
    }

    sessionStorage.setItem(SESSION_KEY, "1");

    if (state.settings.pinHash) {
      unlocked = false;
      show("pinView");
      $("#pinInput").value = "";
      setTimeout(() => $("#pinInput")?.focus(), 50);
    } else {
      unlocked = true;
      enterApp();
    }
  }

  async function verifyPin(event) {
    event.preventDefault();

    const pin = $("#pinInput").value.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      pinMessage("Use de 4 a 6 números.", true);
      return;
    }

    if (!state.settings.pinHash?.salt || !state.settings.pinHash?.hash) {
      unlocked = true;
      enterApp();
      return;
    }

    const digest = await hashSecret(pin, state.settings.pinHash.salt);

    if (digest !== state.settings.pinHash.hash) {
      pinMessage("PIN incorreto.", true);
      return;
    }

    unlocked = true;
    pinMessage("");
    enterApp();
  }

  function enterApp() {
    show("mainView");
    renderAll();
    chooseMotivation();
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    unlocked = false;
    show("authView");
    updateAuthMode();
    if ($("#loginPassword")) $("#loginPassword").value = "";
  }

  function lockNow() {
    if (!state.settings.pinHash) {
      logout();
      return;
    }

    unlocked = false;
    show("pinView");
    $("#pinInput").value = "";
    setTimeout(() => $("#pinInput")?.focus(), 50);
  }

  // =========================================================
  // TEMA
  // =========================================================

  function applyTheme() {
    const theme = state.settings.theme || "dark";
    const root = document.documentElement;

    root.classList.toggle("light", theme === "light");
    root.dataset.theme = theme;

    const select = $("#themeSelect");
    if (select) {
      select.value = theme;
    }
  }

  function changeTheme(value) {
    state.settings.theme = ["light", "dark", "system"].includes(value)
      ? value
      : "dark";

    applyTheme();
    saveState();
  }

  // =========================================================
  // NAVEGAÇÃO
  // =========================================================

  function navigate(page) {
    const validPages = [
      "dashboard",
      "analysis",
      "transactions",
      "goals",
      "profile"
    ];

    if (!validPages.includes(page)) return;

    currentPage = page;

    $$(".page").forEach((section) => {
      section.classList.toggle("active", section.id === `page-${page}`);
    });

    $$(".nav-btn").forEach((button) => {
      const active = button.dataset.nav === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (page === "dashboard") renderDashboard();
    if (page === "analysis") renderAnalysis();
    if (page === "transactions") renderTransactions();
    if (page === "goals") renderGoals();
    if (page === "profile") renderProfile();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================
  // MOTIVAÇÃO
  // =========================================================

  function chooseMotivation() {
    const last = state.motivationHistory.at(-1);
    const choices = MOTIVATIONS.filter((item) => item !== last);
    const phrase = choices[Math.floor(Math.random() * choices.length)];

    state.motivationHistory = [
      ...state.motivationHistory,
      phrase
    ].slice(-5);

    if ($("#motivation")) $("#motivation").textContent = phrase;
    saveState();
  }

  // =========================================================
  // CÁLCULOS FINANCEIROS
  // =========================================================

  function realizedTransactions() {
    const today = todayKey();
    return state.transactions.filter((t) => String(t.date) <= today);
  }

  function futureTransactions() {
    const today = todayKey();
    return state.transactions.filter((t) => String(t.date) > today);
  }

  function cumulativeTotals() {
    const realized = realizedTransactions();

    const income = realized
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const expense = realized
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return {
      income,
      expense,
      balance: income - expense
    };
  }

  function plannedFutureExpenses() {
    return futureTransactions()
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  function plannedFutureIncome() {
    return futureTransactions()
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  function projectedAvailable() {
    return cumulativeTotals().balance - plannedFutureExpenses();
  }

  function currentMonthRealizedTotals() {
    const month = monthKey(todayKey());
    const tx = state.transactions.filter(
      (t) => monthKey(t.date) === month && isRealizedTransaction(t)
    );

    return {
      income: tx
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + Number(t.amount || 0), 0),
      expense: tx
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount || 0), 0)
    };
  }

  function renderDashboard() {
    const totals = cumulativeTotals();
    const month = currentMonthRealizedTotals();
    const planned = plannedFutureExpenses();
    const projected = projectedAvailable();

    $("#welcomeName").textContent = state.profile.username || "amigo";

    $("#balanceValue").textContent = balanceVisible
      ? money(totals.balance)
      : "••••••";

    const incomeLabel = $("#incomeMonth")?.previousElementSibling;
    const expenseLabel = $("#expenseMonth")?.previousElementSibling;

    if (incomeLabel) incomeLabel.textContent = "Entradas acumuladas";
    if (expenseLabel) expenseLabel.textContent = "Livre após programadas";

    $("#incomeMonth").textContent = balanceVisible
      ? money(totals.income)
      : "••••";

    $("#expenseMonth").textContent = balanceVisible
      ? money(projected)
      : "••••";

    const avatar = $("#dashboardAvatar");
    if (avatar) {
      avatar.src = state.profile.avatar || "logo-192.png";
    }

    renderCategories();
    renderRecentTransactions();

    const balanceCard = $(".balance-card");
    if (balanceCard) {
      let planning = $("#projectedPlanningLine");

      if (!planning) {
        planning = document.createElement("p");
        planning.id = "projectedPlanningLine";
        planning.className = "muted";
        planning.style.margin = "10px 0 0";
        balanceCard.appendChild(planning);
      }

      planning.textContent = planned > 0
        ? `Você tem ${money(totals.balance)} hoje. Após os gastos programados, ficam ${money(projected)} livres.`
        : `Você tem ${money(totals.balance)} disponíveis hoje. Não há gastos futuros programados.`;

      if (!balanceVisible) planning.textContent = "Planejamento financeiro oculto.";

      planning.title =
        `Mês atual: ${money(month.expense)} em gastos realizados. ` +
        `Rendas futuras não entram no saldo atual.`;
    }
  }

  function renderCategories() {
    const root = $("#categorySummary");
    if (!root) return;

    const expenses = state.transactions.filter(
      (t) => t.type === "expense" && (
        isRealizedTransaction(t) || isFutureTransaction(t)
      )
    );

    const byCategory = {};

    expenses.forEach((t) => {
      byCategory[t.category] =
        (byCategory[t.category] || 0) + Number(t.amount || 0);
    });

    const entries = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!entries.length) {
      root.innerHTML = `<div class="empty">Ainda não há despesas registradas.</div>`;
      return;
    }

    root.innerHTML = entries.map(([category, value]) => {
      const pct = total ? Math.round((value / total) * 100) : 0;

      return `
        <div class="category-item category-row">
          <div class="category-item-head category-meta">
            <span>${escapeHTML(category)}</span>
            <b>${money(value)} · ${pct}%</b>
          </div>
          <div class="category-bar bar">
            <span style="width:${pct}%"></span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRecentTransactions() {
    const root = $("#recentTransactions");
    if (!root) return;

    const list = [...state.transactions]
      .sort((a, b) => compareDateKeys(b.date, a.date))
      .slice(0, 6);

    renderTxList(root, list, false);
  }

  function transactionClass(t) {
    if (isFutureTransaction(t)) return "scheduled";
    return t.type === "income" ? "income" : "expense";
  }

  function renderTxList(container, list, showDelete = true) {
    if (!container) return;

    if (!list.length) {
      container.innerHTML =
        `<div class="empty">Nenhuma transação encontrada.</div>`;
      return;
    }

    container.innerHTML = list.map((t) => {
      const future = isFutureTransaction(t);
      const cls = transactionClass(t);
      const sign = t.type === "income" ? "+" : "−";

      const status = future
        ? "Programado"
        : t.type === "income"
          ? "Renda recebida"
          : "Gasto realizado";

      const recurrence = t.recurrence && t.recurrence !== "none"
        ? ` · ${recurrenceLabel(t.recurrence)}`
        : "";

      return `
        <article class="transaction-item ${cls}">
          <div class="transaction-icon tx-icon">
            ${future ? "◷" : t.type === "income" ? "↗" : "↘"}
          </div>

          <div class="transaction-main tx-main">
            <b>${escapeHTML(t.description)}</b>
            <span>${escapeHTML(t.category)} · ${formatDateKey(t.date)}</span>
            <small>${status}${recurrence}</small>
          </div>

          <span class="transaction-value tx-value ${
            future ? "" : t.type === "income" ? "income-text" : "expense-text"
          }">
            ${future && t.type === "expense" ? "−" : sign}
            ${money(t.amount)}
          </span>

          ${showDelete ? `
            <button
              class="link-btn"
              data-delete-tx="${escapeHTML(t.id)}"
              type="button"
              aria-label="Excluir"
            >×</button>
          ` : ""}
        </article>
      `;
    }).join("");
  }

  function renderTransactions() {
    const root = $("#allTransactions");
    if (!root) return;

    const query = ($("#transactionSearch")?.value || "").trim().toLowerCase();
    const type = $("#transactionType")?.value || "all";
    const status = $("#transactionStatus")?.value || "all";

    let list = [...state.transactions];

    list = list.filter((t) => {
      const matchesType = type === "all" || t.type === type;
      const text = `${t.description} ${t.category} ${t.note}`.toLowerCase();
      const matchesQuery = text.includes(query);

      const matchesStatus =
        status === "all" ||
        (status === "past" && isRealizedTransaction(t)) ||
        (status === "scheduled" && isFutureTransaction(t));

      return matchesType && matchesQuery && matchesStatus;
    });

    list.sort((a, b) => compareDateKeys(b.date, a.date));

    renderTxList(root, list, true);
  }

  // =========================================================
  // ANÁLISE
  // =========================================================

  function availableAnalysisYears() {
    const years = new Set([yearKey(todayKey())]);

    state.transactions.forEach((t) => {
      const y = yearKey(t.date);
      if (y) years.add(y);
    });

    return [...years].sort((a, b) => Number(b) - Number(a));
  }

  function renderAnalysis() {
    const select = $("#analysisYear");
    if (!select) return;

    const years = availableAnalysisYears();
    const current = select.value || yearKey(todayKey());

    select.innerHTML = years
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");

    select.value = years.includes(current)
      ? current
      : years[0];

    const selectedYear = select.value;

    const transactions = state.transactions.filter(
      (t) => yearKey(t.date) === selectedYear && isRealizedTransaction(t)
    );

    const incomes = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const monthlyExpenses = Array.from({ length: 12 }, () => 0);
    const monthlyIncome = Array.from({ length: 12 }, () => 0);

    transactions.forEach((t) => {
      const month = Number(String(t.date).slice(5, 7)) - 1;
      if (month < 0 || month > 11) return;

      if (t.type === "expense") monthlyExpenses[month] += Number(t.amount || 0);
      if (t.type === "income") monthlyIncome[month] += Number(t.amount || 0);
    });

    $("#analysisYearExpense").textContent = money(expenses);
    $("#analysisYearLabel").textContent = selectedYear;
    $("#analysisIncome").textContent = money(incomes);
    $("#analysisExpense").textContent = money(expenses);
    $("#analysisBalance").textContent = money(incomes - expenses);
    $("#analysisAverage").textContent = money(expenses / 12);

    renderYearlyChart(monthlyExpenses);
    renderYearlyCategories(transactions);
    renderIncomeExpenseChart(monthlyIncome, monthlyExpenses);
    renderExpenseInsights(monthlyExpenses);
  }

  function renderYearlyChart(values) {
    const root = $("#yearlyExpenseChart");
    if (!root) return;

    const max = Math.max(...values, 1);
    const labels = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez"
    ];

    root.innerHTML = values.map((value, index) => {
      const height = Math.max(2, (value / max) * 150);

      return `
        <div>
          <div
            class="yearly-chart-bar"
            title="${labels[index]}: ${money(value)}"
            style="height:${height}px"
          ></div>
          <span class="yearly-chart-label">${labels[index]}</span>
        </div>
      `;
    }).join("");
  }

  function renderExpenseInsights(values) {
    const max = Math.max(...values);
    const min = Math.min(...values);

    const maxIndex = values.indexOf(max);
    const minIndex = values.indexOf(min);

    const labels = [
      "Janeiro", "Fevereiro", "Março", "Abril",
      "Maio", "Junho", "Julho", "Agosto",
      "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    $("#highestExpenseMonth").textContent =
      max > 0 ? labels[maxIndex] : "—";

    $("#highestExpenseMonthValue").textContent =
      max > 0 ? money(max) : money(0);

    $("#lowestExpenseMonth").textContent =
      max > 0 ? labels[minIndex] : "—";

    $("#lowestExpenseMonthValue").textContent =
      max > 0 ? money(min) : money(0);
  }

  function renderYearlyCategories(transactions) {
    const root = $("#yearlyCategoryChart");
    if (!root) return;

    const map = {};

    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount || 0);
      });

    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!entries.length) {
      root.innerHTML = `<div class="empty">Ainda não há gastos neste ano.</div>`;
      return;
    }

    root.innerHTML = entries.map(([category, value]) => {
      const pct = total ? Math.round((value / total) * 100) : 0;

      return `
        <div class="category-item">
          <div class="category-item-head">
            <span>${escapeHTML(category)}</span>
            <b>${money(value)} · ${pct}%</b>
          </div>
          <div class="category-bar">
            <span style="width:${pct}%"></span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderIncomeExpenseChart(incomes, expenses) {
    const root = $("#incomeExpenseChart");
    if (!root) return;

    const labels = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez"
    ];

    root.innerHTML = labels.map((label, index) => {
      const income = incomes[index];
      const expense = expenses[index];
      const max = Math.max(income, expense, 1);

      return `
        <div class="income-expense-row">
          <div class="income-expense-row-head">
            <span>${label}</span>
            <span>+${money(income)} · −${money(expense)}</span>
          </div>

          <div class="income-expense-bars">
            <div class="income-expense-bar income-bar">
              <span style="width:${(income / max) * 100}%"></span>
            </div>

            <div class="income-expense-bar expense-bar">
              <span style="width:${(expense / max) * 100}%"></span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // =========================================================
  // METAS
  // =========================================================

  function renderGoals() {
    const root = $("#goalsList");
    if (!root) return;

    if (!state.goals.length) {
      root.innerHTML =
        `<div class="empty">Crie sua primeira meta financeira.</div>`;
      return;
    }

    root.innerHTML = state.goals.map((goal) => {
      const target = Number(goal.target) || 0;
      const current = Number(goal.current) || 0;
      const pct = target ? clamp((current / target) * 100, 0, 100) : 0;

      return `
        <article class="goal-card glass">
          <div class="goal-head">
            <b>${escapeHTML(goal.name)}</b>
            <span>${money(current)} / ${money(target)}</span>
          </div>

          <div class="goal-progress">
            <span style="width:${pct}%"></span>
          </div>

          <div class="goal-foot">
            <span>${Math.round(pct)}% concluído</span>
            <span>${goal.deadline ? formatDateKey(goal.deadline) : "Sem prazo"}</span>
          </div>

          <div class="goal-actions">
            <button
              class="btn btn-secondary btn-small"
              data-add-goal="${escapeHTML(goal.id)}"
              type="button"
            >Adicionar valor</button>

            <button
              class="btn btn-secondary btn-small"
              data-delete-goal="${escapeHTML(goal.id)}"
              type="button"
            >Excluir</button>
          </div>
        </article>
      `;
    }).join("");
  }

  // =========================================================
  // PERFIL
  // =========================================================

  function renderProfile() {
    if ($("#profileUsername")) {
      $("#profileUsername").value = state.profile.username || "";
    }

    if ($("#profileEmail")) {
      $("#profileEmail").value = state.profile.email || "";
    }

    if ($("#profileAvatar")) {
      $("#profileAvatar").src = state.profile.avatar || "logo-192.png";
    }

    if ($("#pinStatus")) {
      $("#pinStatus").textContent = state.settings.pinHash
        ? "Ativado"
        : "Desativado";
    }

    if ($("#configurePin")) {
      $("#configurePin").textContent = state.settings.pinHash
        ? "Alterar PIN"
        : "Configurar";
    }

    applyTheme();

    const backup = $("#lastBackupStatus");
    if (backup) {
      backup.textContent = state.settings.lastBackupAt
        ? `Último backup: ${new Date(state.settings.lastBackupAt).toLocaleString("pt-BR")}`
        : "Nenhum backup feito ainda.";
    }
  }

  // =========================================================
  // MODAIS
  // =========================================================

  function openModal(title, body, onSubmit) {
    const root = $("#modalRoot");
    if (!root) return;

    root.innerHTML = `
      <div class="modal glass" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${escapeHTML(title)}</h3>
          <button class="modal-close" type="button" aria-label="Fechar">×</button>
        </div>

        <form id="modalForm" class="form-grid">
          ${body}

          <div class="modal-actions">
            <button class="btn btn-secondary modal-cancel" type="button">
              Cancelar
            </button>

            <button class="btn btn-primary" type="submit">
              Salvar
            </button>
          </div>
        </form>
      </div>
    `;

    root.classList.remove("hidden");

    $(".modal-close", root).onclick = closeModal;
    $(".modal-cancel", root).onclick = closeModal;

    $("#modalForm", root).onsubmit = async (event) => {
      event.preventDefault();

      try {
        await onSubmit(new FormData(event.currentTarget));
      } catch (error) {
        console.error(error);
        toast("Não foi possível salvar.");
      }
    };

    const first = $("input, select, textarea", root);
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal() {
    const root = $("#modalRoot");
    if (!root) return;

    root.classList.add("hidden");
    root.innerHTML = "";
  }

  function recurrenceLabel(value) {
    return {
      daily: "diária",
      weekly: "semanal",
      biweekly: "quinzenal",
      monthly: "mensal"
    }[value] || "";
  }

  function transactionModal(type = "expense") {
    const categories = [
      "Moradia",
      "Alimentação",
      "Transporte",
      "Lazer",
      "Estudos",
      "Saúde",
      "Assinaturas",
      "Salário",
      "Freelance",
      "Investimentos",
      "Outros"
    ];

    const today = todayKey();

    openModal(
      type === "income" ? "Adicionar Renda" : "Adicionar Despesa",
      `
        <label>
          Descrição
          <input
            name="description"
            maxlength="80"
            required
            placeholder="${type === "income" ? "Ex.: Bolsa / salário" : "Ex.: Mercado"}"
          >
        </label>

        <label>
          Valor (R$)
          <input
            name="amount"
            inputmode="decimal"
            type="text"
            autocomplete="off"
            required
            placeholder="0,00"
          >
        </label>

        <label>
          Categoria
          <select name="category">
            ${categories.map((category) =>
              `<option>${escapeHTML(category)}</option>`
            ).join("")}
          </select>
        </label>

        <label>
          Data
          <input
            name="date"
            type="date"
            value="${today}"
            required
          >
        </label>

        <label>
          Repetição
          <select name="recurrence">
            <option value="none">Não repetir</option>
            <option value="daily">Diária</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
          </select>
        </label>

        <label id="recurrenceEndWrap" class="hidden">
          Repetir até
          <input
            name="recurrenceEnd"
            type="date"
            value="${today}"
          >
        </label>

        <label>
          Observação
          <textarea
            name="note"
            maxlength="240"
            style="min-height:80px;border:1px solid var(--line);background:rgba(0,0,0,.16);color:var(--text);border-radius:15px;padding:12px"
          ></textarea>
        </label>
      `,
      async (formData) => {
        const description = String(formData.get("description") || "").trim();
        const amount = normalizeAmount(formData.get("amount"));
        const date = String(formData.get("date") || "");
        const recurrence = String(formData.get("recurrence") || "none");
        const recurrenceEnd = String(formData.get("recurrenceEnd") || "");

        if (!description) {
          toast("Informe uma descrição.");
          return;
        }

        if (!(amount > 0)) {
          toast("Informe um valor válido.");
          return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          toast("Informe uma data válida.");
          return;
        }

        if (
          recurrence !== "none" &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(recurrenceEnd) ||
            recurrenceEnd < date)
        ) {
          toast("Escolha um final de repetição válido.");
          return;
        }

        const base = {
          type,
          description,
          amount,
          category: String(formData.get("category") || "Outros"),
          note: String(formData.get("note") || "").trim(),
          recurrence,
          recurrenceEnd: recurrence === "none" ? "" : recurrenceEnd
        };

        const occurrences = buildOccurrences(date, recurrence, recurrenceEnd);

        occurrences.forEach((occurrenceDate, index) => {
          state.transactions.push({
            id: uid("tx"),
            ...base,
            date: occurrenceDate,
            parentId: index === 0 ? null : undefined
          });
        });

        saveState();
        closeModal();
        renderAll();

        toast(
          occurrences.length > 1
            ? `${occurrences.length} lançamentos programados.`
            : type === "income"
              ? "Renda adicionada!"
              : "Despesa adicionada!"
        );
      }
    );

    const modalRoot = $("#modalRoot");

    $("#modalForm", modalRoot).querySelector('[name="recurrence"]')
      .addEventListener("change", (event) => {
        const wrap = $("#recurrenceEndWrap", modalRoot);
        wrap.classList.toggle("hidden", event.target.value === "none");
      });
  }

  function buildOccurrences(start, recurrence, end) {
    if (recurrence === "none") return [start];

    const result = [];
    let current = parseDateKey(start);
    const final = parseDateKey(end);

    if (!current || !final) return [start];

    let guard = 0;

    while (current <= final && guard < 1000) {
      result.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`
      );

      if (recurrence === "daily") {
        current.setDate(current.getDate() + 1);
      } else if (recurrence === "weekly") {
        current.setDate(current.getDate() + 7);
      } else if (recurrence === "biweekly") {
        current.setDate(current.getDate() + 14);
      } else if (recurrence === "monthly") {
        const originalDay = current.getDate();
        current.setMonth(current.getMonth() + 1);

        // Evita pular para o mês seguinte em meses menores.
        if (current.getDate() !== originalDay) {
          current.setDate(0);
        }
      } else {
        break;
      }

      guard++;
    }

    return result.length ? result : [start];
  }

  function goalModal(existing = null) {
    openModal(
      existing ? "Adicionar à meta" : "Criar nova meta",
      existing
        ? `
          <p class="muted">
            Meta: <b>${escapeHTML(existing.name)}</b>
          </p>

          <label>
            Valor a adicionar (R$)
            <input
              name="add"
              inputmode="decimal"
              type="text"
              required
              placeholder="0,00"
            >
          </label>
        `
        : `
          <label>
            Nome da meta
            <input
              name="name"
              maxlength="60"
              required
              placeholder="Ex.: Reserva de emergência"
            >
          </label>

          <label>
            Valor alvo (R$)
            <input
              name="target"
              inputmode="decimal"
              type="text"
              required
              placeholder="0,00"
            >
          </label>

          <label>
            Valor inicial (R$)
            <input
              name="current"
              inputmode="decimal"
              type="text"
              value="0"
            >
          </label>

          <label>
            Prazo (opcional)
            <input name="deadline" type="date">
          </label>
        `,
      async (formData) => {
        if (existing) {
          const add = normalizeAmount(formData.get("add"));

          if (!(add > 0)) {
            toast("Informe um valor válido.");
            return;
          }

          existing.current = normalizeAmount(
            Number(existing.current || 0) + add
          );
        } else {
          const name = String(formData.get("name") || "").trim();
          const target = normalizeAmount(formData.get("target"));
          const current = normalizeAmount(formData.get("current"));
          const deadline = String(formData.get("deadline") || "");

          if (!name) {
            toast("Informe o nome da meta.");
            return;
          }

          if (!(target > 0)) {
            toast("O alvo precisa ser maior que zero.");
            return;
          }

          state.goals.push({
            id: uid("goal"),
            name,
            target,
            current: Math.min(current, target),
            deadline
          });
        }

        saveState();
        closeModal();
        renderGoals();
        toast("Meta atualizada!");
      }
    );
  }

  async function configurePin() {
    if (state.settings.pinHash) {
      openModal(
        "Alterar PIN",
        `
          <label>
            PIN atual
            <input
              name="old"
              inputmode="numeric"
              type="password"
              pattern="\\d{4,6}"
              maxlength="6"
              required
            >
          </label>

          <label>
            Novo PIN
            <input
              name="pin"
              inputmode="numeric"
              type="password"
              pattern="\\d{4,6}"
              maxlength="6"
              minlength="4"
              required
            >
          </label>
        `,
        async (formData) => {
          const oldPin = String(formData.get("old") || "");
          const newPin = String(formData.get("pin") || "");

          const oldHash = await hashSecret(
            oldPin,
            state.settings.pinHash.salt
          );

          if (oldHash !== state.settings.pinHash.hash) {
            toast("PIN atual incorreto.");
            return;
          }

          if (!/^\d{4,6}$/.test(newPin)) {
            toast("O PIN precisa ter 4 a 6 números.");
            return;
          }

          const salt = crypto.randomUUID();

          state.settings.pinHash = {
            salt,
            hash: await hashSecret(newPin, salt)
          };

          saveState();
          closeModal();
          renderProfile();
          toast("PIN alterado.");
        }
      );
      return;
    }

    openModal(
      "Configurar PIN",
      `
        <p class="muted">
          O PIN será solicitado após a autenticação quando o aplicativo
          for aberto novamente neste aparelho.
        </p>

        <label>
          Novo PIN
          <input
            name="pin"
            inputmode="numeric"
            type="password"
            pattern="\\d{4,6}"
            maxlength="6"
            minlength="4"
            required
            placeholder="4 a 6 números"
          >
        </label>
      `,
      async (formData) => {
        const pin = String(formData.get("pin") || "");

        if (!/^\d{4,6}$/.test(pin)) {
          toast("O PIN precisa ter 4 a 6 números.");
          return;
        }

        const salt = crypto.randomUUID();

        state.settings.pinHash = {
          salt,
          hash: await hashSecret(pin, salt)
        };

        saveState();
        closeModal();
        renderProfile();
        toast("PIN ativado.");
      }
    );
  }

  // =========================================================
  // BACKUP / RESTORE
  // LÓGICA DE STORAGE MANTIDA: exporta o estado atual completo.
  // =========================================================

  function backupObject() {
    return {
      app: "Santinho Finance",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
  }

  async function backupNow() {
    const json = JSON.stringify(backupObject(), null, 2);
    const blob = new Blob([json], { type: "application/json" });

    const file = new File(
      [blob],
      `santinho-finance-backup-${todayKey()}.json`,
      { type: "application/json" }
    );

    try {
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: "Backup Santinho Finance",
          text: "Backup local do Santinho Finance.",
          files: [file]
        });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      state.settings.lastBackupAt = new Date().toISOString();
      saveState();

      if ($("#backupStatus")) {
        $("#backupStatus").textContent = "Backup concluído.";
      }

      renderProfile();
    } catch (error) {
      if ($("#backupStatus")) {
        $("#backupStatus").textContent =
          error?.name === "AbortError"
            ? "Compartilhamento cancelado."
            : "Não foi possível concluir o backup.";
      }
    }
  }

  async function restoreFile(file) {
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());

      if (
        raw?.app !== "Santinho Finance" ||
        raw?.version !== 1 ||
        raw?.data?.schema !== SCHEMA
      ) {
        throw new Error("Backup incompatível.");
      }

      const incoming = normalize(raw.data);

      if (
        !incoming.profile ||
        !Array.isArray(incoming.transactions) ||
        !Array.isArray(incoming.goals)
      ) {
        throw new Error("Estrutura inválida.");
      }

      if (
        !confirm(
          "Restaurar este backup substituirá os dados locais atuais. Continuar?"
        )
      ) {
        return;
      }

      state = incoming;
      saveState();
      applyTheme();
      renderAll();

      if ($("#backupStatus")) {
        $("#backupStatus").textContent =
          "Dados restaurados com sucesso.";
      }

      toast("Backup restaurado.");
    } catch (error) {
      console.error("Restore:", error);

      if ($("#backupStatus")) {
        $("#backupStatus").textContent =
          "Arquivo inválido ou corrompido.";
      }
    } finally {
      if ($("#restoreInput")) $("#restoreInput").value = "";
    }
  }

  // =========================================================
  // FOTO
  // =========================================================

  function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) {
        reject(new Error("Arquivo não é imagem."));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(file);
    });
  }

  // =========================================================
  // RENDER GERAL
  // =========================================================

  function renderAll() {
    renderDashboard();
    renderAnalysis();
    renderTransactions();
    renderGoals();
    renderProfile();
  }

  function toast(message) {
    const element = $("#toast");
    if (!element) return;

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.classList.remove("show");
    }, 2200);
  }

  // =========================================================
  // EVENTOS
  // =========================================================

  function bindEvents() {
    $("#toggleSetup")?.addEventListener("click", () => {
      const setupHidden = $("#setupForm").classList.contains("hidden");

      $("#loginForm").classList.toggle("hidden", !setupHidden);
      $("#setupForm").classList.toggle("hidden", setupHidden);

      if ($("#authTitle")) {
        $("#authTitle").textContent = setupHidden
          ? "Criar seu Santinho Finance"
          : "Entrar no Santinho Finance";
      }

      if ($("#authSubtitle")) {
        $("#authSubtitle").textContent = setupHidden
          ? "Crie um acesso local. Nenhuma credencial será enviada para a internet."
          : "A autenticação acontece somente neste aparelho.";
      }
    });

    $("#setupForm")?.addEventListener("submit", setupAccount);
    $("#loginForm")?.addEventListener("submit", login);
    $("#pinForm")?.addEventListener("submit", verifyPin);
    $("#logoutFromPin")?.addEventListener("click", logout);
    $("#lockNow")?.addEventListener("click", lockNow);
    $("#mobileBrand")?.addEventListener("click", () => navigate("dashboard"));

    $$("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.nav));
    });

    $("#addExpense")?.addEventListener("click", () => transactionModal("expense"));
    $("#addIncome")?.addEventListener("click", () => transactionModal("income"));
    $("#addTransactionTop")?.addEventListener("click", () => transactionModal("expense"));
    $("#addGoal")?.addEventListener("click", () => goalModal());

    $("#toggleBalance")?.addEventListener("click", () => {
      balanceVisible = !balanceVisible;
      renderDashboard();
    });

    $("#transactionSearch")?.addEventListener("input", renderTransactions);
    $("#transactionType")?.addEventListener("change", renderTransactions);
    $("#transactionStatus")?.addEventListener("change", renderTransactions);

    $("#analysisYear")?.addEventListener("change", renderAnalysis);

    $("#themeSelect")?.addEventListener("change", (event) => {
      changeTheme(event.target.value);
      toast("Tema atualizado.");
    });

    $("#configurePin")?.addEventListener("click", configurePin);

    $("#saveProfile")?.addEventListener("click", () => {
      const username = $("#profileUsername").value.trim();
      const email = $("#profileEmail").value.trim();

      if (!username) {
        toast("Informe um nome de usuário.");
        return;
      }

      state.profile.username = username;
      state.profile.email = email;

      saveState();
      renderDashboard();
      renderProfile();
      toast("Perfil salvo.");
    });

    $("#profilePhoto")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const data = await readImageAsBase64(file);

        if (data.length > 3_000_000) {
          toast("Escolha uma imagem menor para manter o armazenamento leve.");
          return;
        }

        state.profile.avatar = data;

        saveState();
        renderProfile();
        renderDashboard();
        toast("Foto atualizada.");
      } catch {
        toast("Não foi possível ler a imagem.");
      }
    });

    $("#backupNow")?.addEventListener("click", backupNow);
    $("#restoreData")?.addEventListener("click", () => $("#restoreInput")?.click());
    $("#restoreInput")?.addEventListener("change", (event) => {
      restoreFile(event.target.files?.[0]);
    });

    $("#logout")?.addEventListener("click", logout);

    document.addEventListener("click", (event) => {
      const deleteTransaction = event.target.closest("[data-delete-tx]");

      if (deleteTransaction) {
        const id = deleteTransaction.dataset.deleteTx;

        if (confirm("Excluir esta transação?")) {
          state.transactions = state.transactions.filter(
            (transaction) => transaction.id !== id
          );

          saveState();
          renderAll();
          toast("Transação excluída.");
        }

        return;
      }

      const deleteGoal = event.target.closest("[data-delete-goal]");

      if (deleteGoal) {
        const id = deleteGoal.dataset.deleteGoal;

        if (confirm("Excluir esta meta?")) {
          state.goals = state.goals.filter((goal) => goal.id !== id);
          saveState();
          renderGoals();
          toast("Meta excluída.");
        }

        return;
      }

      const addGoal = event.target.closest("[data-add-goal]");

      if (addGoal) {
        const goal = state.goals.find(
          (item) => item.id === addGoal.dataset.addGoal
        );

        if (goal) goalModal(goal);
      }
    });

    $("#modalRoot")?.addEventListener("click", (event) => {
      if (event.target.id === "modalRoot") {
        closeModal();
      }
    });
  }

  // =========================================================
  // INICIALIZAÇÃO
  // =========================================================

  async function init() {
    bindEvents();
    await loadState();
    applyTheme();
    updateAuthMode();

    if (state.credentials) {
      show("authView");
    } else {
      show("authView");
      $("#loginForm")?.classList.add("hidden");
      $("#setupForm")?.classList.remove("hidden");
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service Worker não pôde ser registrado:", error);
      });
    }
  }

  init().catch((error) => {
    console.error("Erro fatal na inicialização do Santinho Finance:", error);

    const message = $("#authMessage");
    if (message) {
      message.textContent =
        "O aplicativo encontrou um erro ao iniciar. Seus dados locais não foram apagados.";
      message.classList.add("error");
    }
  });
})();
