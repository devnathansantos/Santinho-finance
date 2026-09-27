/* Santinho Finance — app.js
   Local-first, sem backend e compatível com o estado existente.
   Mantém as chaves de armazenamento do projeto original.
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

  const money = (value) => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL"
  }).format(Number(value) || 0);

  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  const MOTIVATIONS = [
    "Pequenos hábitos, grandes resultados.",
    "Cada real bem direcionado aproxima uma meta.",
    "Controle não é deixar de viver; é escolher para onde o dinheiro vai.",
    "Seu futuro financeiro começa com uma decisão feita hoje.",
    "Registrar um gasto é transformar dinheiro em informação.",
    "Consistência vale mais que perfeição.",
    "Uma meta clara deixa cada economia mais concreta.",
    "O Santinho acredita: organização financeira também é liberdade.",
    "Antes de gastar, pergunte: isso ajuda ou atrapalha sua próxima meta?",
    "Dinheiro organizado dá mais espaço para aproveitar a vida."
  ];

  const defaultState = () => ({
    schema: SCHEMA,
    credentials: null,
    profile: { username: "", email: "", avatar: null },
    transactions: [],
    goals: [],
    settings: {
      theme: "dark",
      pinHash: null,
      lastBackupAt: null,
      privacyAccepted: false
    },
    motivationHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let state = defaultState();
  let db = null;
  let balanceVisible = true;
  let currentPage = "dashboard";
  let saveTimer = null;
  let toastTimer = null;
  let privacyPending = false;
  let assistantWelcomePending = false;
  let assistantRecognition = null;
  const assistantState = { draft: null, awaiting: null, awaitingConfirm: false, history: [] };

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseDateKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateKey(key) {
    const d = parseDateKey(key);
    return d ? d.toLocaleDateString("pt-BR") : "Data inválida";
  }

  function monthKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) ? String(key).slice(0, 7) : "";
  }

  function yearKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) ? String(key).slice(0, 4) : "";
  }

  function isFutureTransaction(t) { return String(t.date) > todayKey(); }
  function isRealizedTransaction(t) { return String(t.date) <= todayKey(); }
  function compareDateKeys(a, b) { return String(a).localeCompare(String(b)); }

  function parseBRL(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let s = String(value ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeAmount(value) { return Math.round(parseBRL(value) * 100) / 100; }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponível"));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha no IndexedDB"));
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error("DB não aberto"));
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error("DB não aberto"));
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function normalize(raw) {
    const base = defaultState();
    const transactions = Array.isArray(raw?.transactions) ? raw.transactions.filter(Boolean).map(t => ({
      id: t.id || uid("tx"),
      type: t.type === "income" ? "income" : "expense",
      description: String(t.description ?? "Sem descrição").trim() || "Sem descrição",
      amount: normalizeAmount(t.amount),
      category: String(t.category ?? "Outros").trim() || "Outros",
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.date)) ? String(t.date) : todayKey(),
      note: String(t.note ?? "").trim(),
      recurrence: t.recurrence || "none",
      recurrenceEnd: /^\d{4}-\d{2}-\d{2}$/.test(String(t.recurrenceEnd)) ? String(t.recurrenceEnd) : "",
      parentId: t.parentId || null
    })) : [];

    const goals = Array.isArray(raw?.goals) ? raw.goals.filter(Boolean).map(g => ({
      id: g.id || uid("goal"),
      name: String(g.name ?? "").trim(),
      target: normalizeAmount(g.target),
      current: normalizeAmount(g.current),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(g.deadline)) ? String(g.deadline) : "",
      openedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(g.openedAt)) ? String(g.openedAt) : "",
      completedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(g.completedAt)) ? String(g.completedAt) : ""
    })) : [];

    return {
      ...base,
      ...raw,
      schema: SCHEMA,
      credentials: raw?.credentials ? { ...raw.credentials } : null,
      profile: { ...base.profile, ...(raw?.profile || {}) },
      settings: { ...base.settings, ...(raw?.settings || {}) },
      transactions,
      goals,
      motivationHistory: Array.isArray(raw?.motivationHistory) ? raw.motivationHistory.map(String).slice(-5) : []
    };
  }

  async function loadState() {
    let candidate = null;
    try { db = await openDB(); candidate = await idbGet("state"); } catch (e) { console.warn("IndexedDB indisponível", e); }
    if (!candidate) {
      try { candidate = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { console.warn("localStorage inválido", e); }
    }
    state = candidate?.schema === SCHEMA ? normalize(candidate) : defaultState();
    applyTheme();
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.error(e); toast("Não foi possível salvar os dados locais."); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { if (db) await idbSet("state", state); } catch (e) { console.warn("Falha no IndexedDB", e); }
    }, 0);
  }

  async function hashSecret(secret, salt) {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 150000, hash: "SHA-256" }, keyMaterial, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function makeCredential(identifier, password) {
    const salt = crypto.randomUUID();
    return { identifier: identifier.trim().toLowerCase(), salt, passwordHash: await hashSecret(password, salt) };
  }

  function show(view) {
    ["authView", "pinView", "mainView"].forEach(id => $("#" + id)?.classList.toggle("hidden", id !== view));
    $("#voiceAssistant")?.classList.toggle("hidden", view !== "mainView");
    if (view !== "mainView") closeAssistant();
  }

  function authMessage(message, error = false) {
    const el = $("#authMessage"); if (!el) return;
    el.textContent = message; el.classList.toggle("error", error);
  }

  function pinMessage(message, error = false) {
    const el = $("#pinMessage"); if (!el) return;
    el.textContent = message; el.classList.toggle("error", error);
  }

  function updateAuthMode() {
    const hasAccount = !!state.credentials;
    $("#loginForm")?.classList.toggle("hidden", !hasAccount);
    $("#setupForm")?.classList.toggle("hidden", hasAccount);
    $("#authTitle").textContent = hasAccount ? "Entrar no Santinho Finance" : "Criar seu Santinho Finance";
    $("#authSubtitle").textContent = hasAccount ? "A autenticação acontece somente neste aparelho." : "Crie um acesso local. Nenhuma credencial será enviada para a internet.";
    $("#toggleSetup").textContent = hasAccount ? "Criar sua conta" : "Já tenho uma conta — entrar";
  }

  async function setupAccount(event) {
    event.preventDefault();
    const username = $("#setupUsername").value.trim();
    const email = $("#setupEmail").value.trim();
    const password = $("#setupPassword").value;
    const password2 = $("#setupPassword2").value;
    if (!username) return authMessage("Informe um nome de usuário.", true);
    if (password.length < 6) return authMessage("Use pelo menos 6 caracteres.", true);
    if (password !== password2) return authMessage("As senhas não conferem.", true);
    state.credentials = await makeCredential(email || username, password);
    state.profile.username = username;
    state.profile.email = email;
    saveState();
    updateAuthMode();
    $("#loginIdentifier").value = email || username;
    $("#loginPassword").value = "";
    authMessage("Conta criada. Agora entre para continuar.");
    showAuthForm("login");
  }

  function showAuthForm(mode) {
    const login = mode === "login";
    $("#loginForm")?.classList.toggle("hidden", !login);
    $("#setupForm")?.classList.toggle("hidden", login);
    $("#authTitle").textContent = login ? "Entrar no Santinho Finance" : "Criar seu Santinho Finance";
    $("#authSubtitle").textContent = login ? "A autenticação acontece somente neste aparelho." : "Crie um acesso local. Nenhuma credencial será enviada para a internet.";
    $("#toggleSetup").textContent = login ? "Criar sua conta" : "Já tenho uma conta — entrar";
  }

  async function login(event) {
    event.preventDefault();
    const identifier = $("#loginIdentifier").value.trim().toLowerCase();
    const password = $("#loginPassword").value;
    const c = state.credentials;
    if (!c) return authMessage("Nenhuma conta local configurada.", true);
    const validId = identifier === String(c.identifier).toLowerCase() || identifier === String(state.profile.username).toLowerCase() || identifier === String(state.profile.email).toLowerCase();
    if (!validId) return authMessage("Username/e-mail ou senha inválidos.", true);
    const digest = await hashSecret(password, c.salt);
    if (digest !== c.passwordHash) return authMessage("Username/e-mail ou senha inválidos.", true);
    sessionStorage.setItem(SESSION_KEY, "1");
    if (state.settings.pinHash) { show("pinView"); $("#pinInput").value = ""; setTimeout(() => $("#pinInput")?.focus(), 50); }
    else enterApp();
  }

  async function verifyPin(event) {
    event.preventDefault();
    const pin = $("#pinInput").value.trim();
    if (!/^\d{4,6}$/.test(pin)) return pinMessage("Use de 4 a 6 números.", true);
    const p = state.settings.pinHash;
    if (!p) return enterApp();
    const digest = await hashSecret(pin, p.salt);
    if (digest !== p.hash) return pinMessage("PIN incorreto.", true);
    enterApp();
  }

  function enterApp() {
    show("mainView");
    renderAll();
    chooseMotivation();
    if (!state.settings.privacyAccepted) {
      assistantWelcomePending = true;
      maybeShowPrivacy();
    } else {
      setTimeout(() => openAssistant(true), 180);
    }
  }

  function logout() { sessionStorage.removeItem(SESSION_KEY); show("authView"); updateAuthMode(); $("#loginPassword").value = ""; }
  function lockNow() { if (!state.settings.pinHash) return logout(); show("pinView"); $("#pinInput").value = ""; setTimeout(() => $("#pinInput")?.focus(), 50); }

  function applyTheme() {
    const theme = state.settings.theme || "dark";
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.dataset.theme = theme;
    if ($("#themeSelect")) $("#themeSelect").value = theme;
  }

  function changeTheme(value) { state.settings.theme = ["light", "dark", "system"].includes(value) ? value : "dark"; applyTheme(); saveState(); }

  function navigate(page) {
    if (!["dashboard","analysis","transactions","goals","profile"].includes(page)) return;
    currentPage = page;
    $$(".page").forEach(s => s.classList.toggle("active", s.id === `page-${page}`));
    $$(".nav-btn").forEach(b => { const a = b.dataset.nav === page; b.classList.toggle("active", a); if (a) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
    if (page === "dashboard") renderDashboard();
    if (page === "analysis") renderAnalysis();
    if (page === "transactions") renderTransactions();
    if (page === "goals") renderGoals();
    if (page === "profile") renderProfile();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseMotivation() {
    const last = state.motivationHistory.at(-1);
    const choices = MOTIVATIONS.filter(x => x !== last);
    const phrase = choices[Math.floor(Math.random() * choices.length)];
    state.motivationHistory = [...state.motivationHistory, phrase].slice(-5);
    $("#motivation").textContent = phrase;
    saveState();
  }

  function cumulativeTotals() {
    const realized = state.transactions.filter(isRealizedTransaction);
    const income = realized.filter(t => t.type === "income").reduce((s,t) => s + Number(t.amount || 0), 0);
    const expense = realized.filter(t => t.type === "expense").reduce((s,t) => s + Number(t.amount || 0), 0);
    return { income, expense, balance: income - expense };
  }

  function plannedFutureExpenses() { return state.transactions.filter(t => isFutureTransaction(t) && t.type === "expense").reduce((s,t) => s + Number(t.amount || 0), 0); }
  function projectedAvailable() { return cumulativeTotals().balance - plannedFutureExpenses(); }

  function renderDashboard() {
    const totals = cumulativeTotals();
    const scheduled = plannedFutureExpenses();
    const free = projectedAvailable();
    $("#welcomeName").textContent = state.profile.username || "amigo";
    $("#balanceValue").textContent = balanceVisible ? money(free) : "••••••";
    const incomeLabel = $("#incomeMonth")?.previousElementSibling;
    const expenseLabel = $("#expenseMonth")?.previousElementSibling;
    if (incomeLabel) incomeLabel.textContent = "Entradas acumuladas";
    if (expenseLabel) expenseLabel.textContent = "Desconsiderando programadas";
    $("#incomeMonth").textContent = balanceVisible ? money(totals.income) : "••••";
    $("#expenseMonth").textContent = balanceVisible ? money(totals.balance) : "••••";
    $("#dashboardAvatar").src = state.profile.avatar || "logo-192.png";
    const line = $("#projectedPlanningLine");
    if (line) line.textContent = balanceVisible ? `Saldo cheio: ${money(totals.balance)} • Programadas: ${money(scheduled)} • Livre: ${money(free)}` : "Planejamento financeiro oculto.";
    renderCategories(); renderRecentTransactions();
  }

  function renderCategories() {
    const root = $("#categorySummary"); if (!root) return;
    const list = state.transactions.filter(t => t.type === "expense");
    const map = {};
    list.forEach(t => map[t.category] = (map[t.category] || 0) + Number(t.amount || 0));
    const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const total = entries.reduce((s,[,v])=>s+v,0);
    root.innerHTML = entries.length ? entries.map(([cat,v]) => { const pct = total ? Math.round(v/total*100) : 0; return `<div class="category-item"><div class="category-item-head"><span>${escapeHTML(cat)}</span><b>${money(v)} · ${pct}%</b></div><div class="category-bar"><span style="width:${pct}%"></span></div></div>`; }).join("") : `<div class="empty">Ainda não há despesas registradas.</div>`;
  }

  function transactionClass(t) { return isFutureTransaction(t) ? "scheduled" : t.type === "income" ? "income" : "expense"; }
  function recurrenceLabel(v) { return ({daily:"diária",weekly:"semanal",biweekly:"quinzenal",monthly:"mensal"}[v] || ""); }

  function renderTxList(root, list, deletable = true) {
    if (!list.length) { root.innerHTML = `<div class="empty">Nenhuma transação encontrada.</div>`; return; }
    root.innerHTML = list.map(t => {
      const future = isFutureTransaction(t);
      const status = future ? "Programado" : t.type === "income" ? "Renda recebida" : "Gasto realizado";
      const sign = t.type === "income" ? "+" : "−";
      return `<article class="transaction-item ${transactionClass(t)}"><div class="transaction-icon">${future ? "◷" : t.type === "income" ? "↗" : "↘"}</div><div class="transaction-main"><b>${escapeHTML(t.description)}</b><span>${escapeHTML(t.category)} · ${formatDateKey(t.date)}</span><small>${status}${t.recurrence !== "none" ? ` · ${recurrenceLabel(t.recurrence)}` : ""}</small></div><span class="transaction-value">${sign} ${money(t.amount)}</span>${deletable ? `<button class="link-btn" data-delete-tx="${escapeHTML(t.id)}" type="button" aria-label="Excluir">×</button>` : ""}</article>`;
    }).join("");
  }

  function renderRecentTransactions() {
    const root = $("#recentTransactions"); if (!root) return;
    renderTxList(root, [...state.transactions].sort((a,b)=>compareDateKeys(b.date,a.date)).slice(0,6), false);
  }

  function renderTransactions() {
    const root = $("#allTransactions"); if (!root) return;
    const q = ($("#transactionSearch")?.value || "").trim().toLowerCase();
    const type = $("#transactionType")?.value || "all";
    const status = $("#transactionStatus")?.value || "all";
    let list = state.transactions.filter(t => {
      const text = `${t.description} ${t.category} ${t.note}`.toLowerCase();
      return (type === "all" || t.type === type) && text.includes(q) && (status === "all" || (status === "past" && isRealizedTransaction(t)) || (status === "scheduled" && isFutureTransaction(t)));
    }).sort((a,b)=>compareDateKeys(b.date,a.date));
    renderTxList(root,list,true);
  }

  function availableAnalysisYears() { const years = new Set([todayKey().slice(0,4)]); state.transactions.forEach(t=>years.add(yearKey(t.date))); return [...years].filter(Boolean).sort((a,b)=>Number(b)-Number(a)); }

  function renderAnalysis() {
    const select = $("#analysisYear"); if (!select) return;
    const years = availableAnalysisYears(); const current = select.value || years[0];
    select.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join(""); select.value = years.includes(current) ? current : years[0];
    const year = select.value;
    const tx = state.transactions.filter(t => yearKey(t.date) === year && isRealizedTransaction(t));
    const incomes = tx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0);
    const expenses = tx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);
    const me = Array(12).fill(0); const mi = Array(12).fill(0);
    tx.forEach(t=>{ const m=Number(t.date.slice(5,7))-1; if(m>=0&&m<12) (t.type==="expense"?me:mi)[m]+=Number(t.amount||0); });
    $("#analysisYearExpense").textContent=money(expenses); $("#analysisYearLabel").textContent=year; $("#analysisIncome").textContent=money(incomes); $("#analysisExpense").textContent=money(expenses); $("#analysisBalance").textContent=money(incomes-expenses); $("#analysisAverage").textContent=money(expenses/12);
    renderYearlyChart(me); renderYearlyCategories(tx); renderIncomeExpenseChart(mi,me); renderExpenseInsights(me);
  }

  function renderYearlyChart(values) {
    const root=$("#yearlyExpenseChart"); if(!root)return;
    const max=Math.max(...values,1); const labels=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    root.innerHTML=values.map((v,i)=>{ const h=v?Math.max(6,Math.round(v/max*150)):2; return `<div class="chart-column"><div class="yearly-chart-bar" style="height:${h}px" title="${labels[i]}: ${money(v)}"></div><span class="yearly-chart-label">${labels[i]}</span></div>`; }).join("");
  }

  function renderExpenseInsights(values) {
    const labels=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nonZero=values.map((v,i)=>({v,i})).filter(x=>x.v>0);
    const max=nonZero.length?Math.max(...nonZero.map(x=>x.v)):0; const min=nonZero.length?Math.min(...nonZero.map(x=>x.v)):0;
    const hi=nonZero.find(x=>x.v===max); const lo=nonZero.find(x=>x.v===min);
    $("#highestExpenseMonth").textContent=hi?labels[hi.i]:"—"; $("#highestExpenseMonthValue").textContent=money(max);
    $("#lowestExpenseMonth").textContent=lo?labels[lo.i]:"—"; $("#lowestExpenseMonthValue").textContent=money(min);
  }

  function renderYearlyCategories(tx) {
    const root=$("#yearlyCategoryChart"); if(!root)return; const map={}; tx.filter(t=>t.type==="expense").forEach(t=>map[t.category]=(map[t.category]||0)+Number(t.amount||0)); const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]); const total=entries.reduce((s,[,v])=>s+v,0);
    root.innerHTML=entries.length?entries.map(([c,v])=>{const p=total?Math.round(v/total*100):0;return `<div class="category-item"><div class="category-item-head"><span>${escapeHTML(c)}</span><b>${money(v)} · ${p}%</b></div><div class="category-bar"><span style="width:${p}%"></span></div></div>`}).join(""): `<div class="empty">Ainda não há gastos neste ano.</div>`;
  }

  function renderIncomeExpenseChart(incomes,expenses) {
    const root=$("#incomeExpenseChart"); if(!root)return; const labels=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    root.innerHTML=labels.map((l,i)=>{const max=Math.max(incomes[i],expenses[i],1);return `<div class="income-expense-row"><div class="income-expense-row-head"><span>${l}</span><span>+${money(incomes[i])} · −${money(expenses[i])}</span></div><div class="income-expense-bars"><div class="income-expense-bar income-bar"><span style="width:${incomes[i]/max*100}%"></span></div><div class="income-expense-bar expense-bar"><span style="width:${expenses[i]/max*100}%"></span></div></div></div>`}).join("");
  }

  function renderGoals() {
    const root=$("#goalsList"); if(!root)return;
    root.innerHTML=state.goals.length?state.goals.map(g=>{const pct=g.target?clamp(g.current/g.target*100,0,100):0;return `<article class="goal-card glass"><div class="goal-head"><b>${escapeHTML(g.name)}</b><span>${money(g.current)} / ${money(g.target)}</span></div><div class="goal-progress"><span style="width:${pct}%"></span></div><div class="goal-foot"><span>${Math.round(pct)}% concluído</span><span>${g.deadline?formatDateKey(g.deadline):"Sem prazo"}</span></div><div class="goal-actions"><button class="btn btn-secondary btn-small" data-add-goal="${escapeHTML(g.id)}" type="button">Adicionar valor</button><button class="btn btn-secondary btn-small" data-delete-goal="${escapeHTML(g.id)}" type="button">Excluir</button></div></article>`}).join(""):`<div class="empty">Crie sua primeira meta financeira.</div>`;
  }

  function renderProfile() {
    $("#profileUsername").value=state.profile.username||""; $("#profileEmail").value=state.profile.email||""; $("#profileAvatar").src=state.profile.avatar||"logo-192.png"; $("#pinStatus").textContent=state.settings.pinHash?"Ativado":"Desativado"; $("#configurePin").textContent=state.settings.pinHash?"Alterar PIN":"Configurar"; applyTheme();
    $("#lastBackupStatus").textContent=state.settings.lastBackupAt?`Último backup: ${new Date(state.settings.lastBackupAt).toLocaleString("pt-BR")}`:"Nenhum backup feito ainda.";
  }

  function openModal(title,body,onSubmit,submitLabel="Salvar") {
    const root=$("#modalRoot"); if(!root)return;
    root.innerHTML=`<div class="modal-backdrop"><div class="modal glass" role="dialog" aria-modal="true"><div class="modal-head"><h3>${escapeHTML(title)}</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><form id="modalForm" class="form-grid">${body}<div class="modal-actions"><button class="btn btn-secondary modal-cancel" type="button">Cancelar</button><button class="btn btn-primary" type="submit">${escapeHTML(submitLabel)}</button></div></form></div></div>`;
    root.classList.remove("hidden"); $(".modal-close",root).onclick=closeModal; $(".modal-cancel",root).onclick=closeModal;
    $("#modalForm",root).onsubmit=async e=>{e.preventDefault();try{await onSubmit(new FormData(e.currentTarget));}catch(err){console.error(err);toast("Não foi possível salvar.");}};
    setTimeout(()=>$("input,select,textarea",root)?.focus(),50);
  }
  function closeModal(){const r=$("#modalRoot");if(r){r.classList.add("hidden");r.innerHTML="";}}

  function recurrenceLabelFull(v){return ({daily:"diária",weekly:"semanal",biweekly:"quinzenal",monthly:"mensal"}[v]||"");}
  function buildOccurrences(start,recurrence,end){if(recurrence==="none")return[start];const result=[];let d=parseDateKey(start),final=parseDateKey(end),guard=0;while(d&&final&&d<=final&&guard<1000){result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);if(recurrence==="daily")d.setDate(d.getDate()+1);else if(recurrence==="weekly")d.setDate(d.getDate()+7);else if(recurrence==="biweekly")d.setDate(d.getDate()+14);else if(recurrence==="monthly"){const day=d.getDate();d.setMonth(d.getMonth()+1);if(d.getDate()!==day)d.setDate(0);}else break;guard++;}return result.length?result:[start];}

  function transactionModal(type="expense") {
    const categories=["Moradia","Alimentação","Transporte","Lazer","Estudos","Saúde","Assinaturas","Salário","Freelance","Investimentos","Outros"];
    const today=todayKey();
    openModal(type==="income"?"Adicionar Renda":"Adicionar Despesa",`<label>Descrição<input name="description" maxlength="80" required placeholder="${type==="income"?"Ex.: Salário":"Ex.: Mercado"}"></label><label>Valor (R$)<input name="amount" inputmode="decimal" type="text" required placeholder="0,00"></label><label>Categoria<select name="category">${categories.map(c=>`<option>${escapeHTML(c)}</option>`).join("")}</select></label><label>Data<input name="date" type="date" value="${today}" required></label><label>Repetição<select name="recurrence"><option value="none">Não repetir</option><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label><label id="recurrenceEndWrap" class="hidden">Repetir até<input name="recurrenceEnd" type="date" value="${today}"></label><label>Observação<textarea name="note" maxlength="240"></textarea></label>`,async fd=>{
      const description=String(fd.get("description")||"").trim(),amount=normalizeAmount(fd.get("amount")),date=String(fd.get("date")||""),recurrence=String(fd.get("recurrence")||"none"),recurrenceEnd=String(fd.get("recurrenceEnd")||"");
      if(!description)return toast("Informe uma descrição."); if(!(amount>0))return toast("Informe um valor válido."); if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("Informe uma data válida."); if(recurrence!=="none"&&(!/^\d{4}-\d{2}-\d{2}$/.test(recurrenceEnd)||recurrenceEnd<date))return toast("Escolha um final de repetição válido.");
      const occurrences=buildOccurrences(date,recurrence,recurrenceEnd); const parent=uid("txparent"); occurrences.forEach((d,i)=>state.transactions.push({id:uid("tx"),type,description,amount,category:String(fd.get("category")||"Outros"),note:String(fd.get("note")||"").trim(),recurrence,recurrenceEnd:recurrence==="none"?"":recurrenceEnd,parentId:i?parent:null}));
      saveState();closeModal();renderAll();toast(occurrences.length>1?`${occurrences.length} lançamentos criados.`:type==="income"?"Renda adicionada!":"Despesa adicionada!");
    });
    $("#modalForm [name='recurrence']")?.addEventListener("change",e=>$("#recurrenceEndWrap")?.classList.toggle("hidden",e.target.value==="none"));
  }

  function goalModal(existing=null){
    openModal(existing?"Adicionar à meta":"Criar nova meta",existing?`<p class="muted">Meta: <b>${escapeHTML(existing.name)}</b></p><label>Valor a adicionar (R$)<input name="add" inputmode="decimal" type="text" required placeholder="0,00"></label>`:`<label>Nome da meta<input name="name" maxlength="60" required placeholder="Ex.: Reserva de emergência"></label><label>Valor alvo (R$)<input name="target" inputmode="decimal" type="text" required placeholder="0,00"></label><label>Valor inicial (R$)<input name="current" inputmode="decimal" type="text" value="0"></label><label>Prazo (opcional)<input name="deadline" type="date"></label>`,async fd=>{
      if(existing){const add=normalizeAmount(fd.get("add"));if(!(add>0))return toast("Informe um valor válido.");const wasComplete=Number(existing.current)>=Number(existing.target);existing.current=normalizeAmount(Math.min(Number(existing.target),Number(existing.current)+add));if(!wasComplete&&existing.current>=existing.target){existing.completedAt=todayKey();saveState();renderGoals();showGoalCompletion(existing);}else{saveState();renderAll();toast("Meta atualizada!");}}
      else{const name=String(fd.get("name")||"").trim(),target=normalizeAmount(fd.get("target")),current=normalizeAmount(fd.get("current")),deadline=String(fd.get("deadline")||"");if(!name)return toast("Informe o nome da meta.");if(!(target>0))return toast("O alvo precisa ser maior que zero.");const goal={id:uid("goal"),name,target,current:Math.min(current,target),deadline,openedAt:todayKey(),completedAt:current>=target?todayKey():""};state.goals.push(goal);saveState();closeModal();renderGoals();if(goal.completedAt)showGoalCompletion(goal);else toast("Meta criada!");}
    });
  }

  function showGoalCompletion(goal){
    const root=$("#messageCardRoot"); if(!root)return;
    const opened=goal.openedAt?formatDateKey(goal.openedAt):"uma data anterior";
    root.innerHTML=`<div class="message-backdrop"><article class="message-card glass" role="dialog" aria-modal="true"><button class="message-close" type="button" aria-label="Fechar">×</button><div class="message-icon">🎉</div><p class="eyebrow">META CONCLUÍDA</p><h2>Meus parabéns, ${escapeHTML(state.profile.username||"amigo")}!</h2><p>Eu me lembro de quando você abriu a meta <strong>“${escapeHTML(goal.name)}”</strong>${goal.openedAt?` em <strong>${opened}</strong>`:""}.</p><p>Hoje você chegou até o fim. Ficamos muito felizes em ver sua conquista. Aproveite o resultado do seu esforço — você merece.</p><button class="btn btn-primary message-ok" type="button">Aproveitar a conquista</button></article></div>`;
    root.classList.remove("hidden"); $(".message-close",root).onclick=closeMessageCard; $(".message-ok",root).onclick=closeMessageCard;
  }
  function closeMessageCard(){const r=$("#messageCardRoot");if(r){r.classList.add("hidden");r.innerHTML="";}}

  async function configurePin(){
    if(state.settings.pinHash){return openModal("Alterar PIN",`<label>PIN atual<input name="old" inputmode="numeric" type="password" maxlength="6" required></label><label>Novo PIN<input name="pin" inputmode="numeric" type="password" maxlength="6" minlength="4" required></label>`,async fd=>{const old=String(fd.get("old")||""),pin=String(fd.get("pin")||"");if(!/^\d{4,6}$/.test(pin))return toast("O PIN precisa ter 4 a 6 números.");const digest=await hashSecret(old,state.settings.pinHash.salt);if(digest!==state.settings.pinHash.hash)return toast("PIN atual incorreto.");const salt=crypto.randomUUID();state.settings.pinHash={salt,hash:await hashSecret(pin,salt)};saveState();closeModal();renderProfile();toast("PIN alterado.");});}
    openModal("Configurar PIN",`<p class="muted">O PIN será solicitado depois da autenticação neste aparelho.</p><label>Novo PIN<input name="pin" inputmode="numeric" type="password" maxlength="6" minlength="4" required></label>`,async fd=>{const pin=String(fd.get("pin")||"");if(!/^\d{4,6}$/.test(pin))return toast("O PIN precisa ter 4 a 6 números.");const salt=crypto.randomUUID();state.settings.pinHash={salt,hash:await hashSecret(pin,salt)};saveState();closeModal();renderProfile();toast("PIN ativado.");});
  }

  function backupObject(){return{app:"Santinho Finance",version:1,exportedAt:new Date().toISOString(),data:state};}
  async function backupNow(){const json=JSON.stringify(backupObject(),null,2),blob=new Blob([json],{type:"application/json"}),file=new File([blob],`santinho-finance-backup-${todayKey()}.json`,{type:"application/json"});try{if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({title:"Backup Santinho Finance",text:"Backup local do Santinho Finance.",files:[file]});else downloadBlob(blob,file.name);state.settings.lastBackupAt=new Date().toISOString();saveState();renderProfile();$("#backupStatus").textContent="Backup concluído.";}catch(e){$("#backupStatus").textContent=e?.name==="AbortError"?"Compartilhamento cancelado.":"Não foi possível concluir o backup.";}}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function restoreFile(file){if(!file)return;try{const raw=JSON.parse(await file.text());if(raw?.app!=="Santinho Finance"||raw?.version!==1||raw?.data?.schema!==SCHEMA)throw new Error("incompatível");if(!confirm("Restaurar este backup substituirá os dados locais atuais. Continuar?"))return;state=normalize(raw.data);saveState();applyTheme();renderAll();toast("Backup restaurado.");}catch(e){console.error(e);$("#backupStatus").textContent="Arquivo inválido ou corrompido.";}finally{$("#restoreInput").value="";}}

  function readImageAsBase64(file){return new Promise((resolve,reject)=>{if(!file?.type?.startsWith("image/"))return reject(new Error("imagem"));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});}

  function renderAll(){renderDashboard();renderAnalysis();renderTransactions();renderGoals();renderProfile();}
  function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2400);}

  function showPrivacy(){const r=$("#privacyCardRoot");if(!r)return;r.classList.remove("hidden");privacyPending=true;}
  function maybeShowPrivacy(){if(!state.settings.privacyAccepted)showPrivacy();}
  function acceptPrivacy(){state.settings.privacyAccepted=true;saveState();const r=$("#privacyCardRoot");if(r){r.classList.add("hidden");privacyPending=false;}if(assistantWelcomePending){assistantWelcomePending=false;setTimeout(()=>openAssistant(true),180);}}

  function analysisRows(){const year=$("#analysisYear")?.value||todayKey().slice(0,4);const rows=[];for(let m=1;m<=12;m++){const mm=String(m).padStart(2,"0");const tx=state.transactions.filter(t=>yearKey(t.date)===year&&t.date.slice(5,7)===mm&&isRealizedTransaction(t));const expense=tx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);const income=tx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0);rows.push({month:mm,monthName:new Date(Number(year),m-1,1).toLocaleDateString("pt-BR",{month:"long"}),income,expense,balance:income-expense});}return rows;}

  function exportTXT(){const rows=analysisRows();const lines=[`SANTINHO FINANCE — ${$("#analysisYear")?.value||todayKey().slice(0,4)}`,"","Mês | Entradas | Gastos | Saldo"];rows.forEach(r=>lines.push(`${r.monthName} | ${money(r.income)} | ${money(r.expense)} | ${money(r.balance)}`));downloadBlob(new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"}),`santinho-finance-${todayKey()}.txt`);}

  function printPDF(){const year=$("#analysisYear")?.value||todayKey().slice(0,4);const rows=analysisRows();const w=window.open("","_blank");if(!w){toast("O Safari bloqueou a janela. Permita pop-ups para exportar PDF.");return;}const table=rows.map(r=>`<tr><td>${escapeHTML(r.monthName)}</td><td>${money(r.income)}</td><td>${money(r.expense)}</td><td>${money(r.balance)}</td></tr>`).join("");w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Santinho Finance — ${year}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Arial;padding:32px;color:#102018}h1{margin-bottom:4px}p{color:#64736b}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{background:#edf4ef}</style></head><body><h1>Santinho Finance</h1><p>Resumo financeiro de ${year}</p><table><thead><tr><th>Mês</th><th>Entradas</th><th>Gastos</th><th>Saldo</th></tr></thead><tbody>${table}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250);</script></body></html>`);w.document.close();}

  function xmlEscape(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
  function crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}}let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function u16(v){return new Uint8Array([v&255,(v>>>8)&255]);}
  function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);}
  function concatBytes(parts){const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
  function zipStore(files){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const [name,content] of Object.entries(files)){const nb=enc.encode(name),data=enc.encode(content),crc=crc32(data),header=concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb,data]);local.push(header);const c=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);central.push(c);offset+=header.length;}const centralData=concatBytes(central),localData=concatBytes(local),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),u32(centralData.length),u32(localData.length),u16(0)]);return new Blob([localData,centralData,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});}

  function exportXLSX() {
    const year = $("#analysisYear")?.value || todayKey().slice(0, 4);
    const rows = analysisRows();
    const sheetRows = rows.map((r, i) => `
      <row r="${i + 2}">
        <c r="A${i + 2}" t="inlineStr"><is><t>${xmlEscape(r.monthName)}</t></is></c>
        <c r="B${i + 2}"><v>${r.income.toFixed(2)}</v></c>
        <c r="C${i + 2}"><v>${r.expense.toFixed(2)}</v></c>
        <c r="D${i + 2}"><v>${r.balance.toFixed(2)}</v></c>
      </row>`).join("");

    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
          <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
        </Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        </Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/></sheets>
        </workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        </Relationships>`,
      "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts>
          <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
          <borders count="1"><border/></borders>
          <cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>
          <cellXfs count="1"><xf numFmtId="0"/></cellXfs>
        </styleSheet>`,
      "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1">
              <c r="A1" t="inlineStr"><is><t>Mês</t></is></c>
              <c r="B1" t="inlineStr"><is><t>Entradas</t></is></c>
              <c r="C1" t="inlineStr"><is><t>Gastos</t></is></c>
              <c r="D1" t="inlineStr"><is><t>Saldo</t></is></c>
            </row>${sheetRows}
          </sheetData>
        </worksheet>`
    };

    downloadBlob(zipStore(files), `santinho-finance-${year}.xlsx`);
  }

  // ---------- V7: Assistente local por texto e voz ----------
  function assistantCategories() {
    return ["Moradia","Alimentação","Transporte","Lazer","Estudos","Saúde","Assinaturas","Salário","Freelance","Investimentos","Outros"];
  }

  function assistantAddMessage(role, text) {
    assistantState.history.push({ role, text: String(text || "") });
    assistantState.history = assistantState.history.slice(-30);
    const root = $("#assistantMessages");
    if (!root) return;
    const el = document.createElement("div");
    el.className = `assistant-message ${role === "user" ? "user" : "assistant"}`;
    el.textContent = String(text || "");
    root.appendChild(el);
    root.scrollTop = root.scrollHeight;
  }

  function assistantSetSuggestions(items = []) {
    const root = $("#assistantSuggestions");
    if (!root) return;
    root.innerHTML = items.map(item => `<button class="assistant-suggestion" type="button" data-assistant-suggestion="${escapeHTML(item)}">${escapeHTML(item)}</button>`).join("");
    $$("[data-assistant-suggestion]", root).forEach(btn => btn.onclick = () => {
      const text = btn.dataset.assistantSuggestion || "";
      assistantHandleInput(text);
    });
  }

  function assistantResetConversation() {
    assistantState.draft = null;
    assistantState.awaiting = null;
    assistantState.awaitingConfirm = false;
    assistantState.history = [];
    const root = $("#assistantMessages");
    if (root) root.innerHTML = "";
  }

  function assistantWelcome() {
    assistantResetConversation();
    assistantAddMessage("assistant", `Olá, ${state.profile.username || "amigo"}! 👋\n\nSou o assistente do Santinho. Você pode falar ou escrever naturalmente. Eu posso registrar uma movimentação, consultar seus gastos e explicar seu planejamento.\n\nExemplos:\n• “Gastei R$ 35 no mercado hoje.”\n• “Paguei R$ 120 de gasolina ontem.”\n• “Recebi R$ 1.500 de salário dia 05.”\n• “Quanto gastei com alimentação este mês?”\n• “Quanto tenho disponível depois das programadas?”\n\nSe faltar alguma informação, eu vou perguntar. Não vou inventar dados financeiros.`);
    assistantSetSuggestions(["Registrar um gasto", "Quanto gastei este mês?", "Quanto tenho disponível?", "Ver despesas programadas"]);
  }

  function openAssistant(showWelcome = false) {
    const root = $("#assistantRoot");
    if (!root) return;
    root.classList.remove("hidden");
    if (showWelcome || !assistantState.history.length) assistantWelcome();
    setTimeout(() => $("#assistantInput")?.focus(), 80);
  }

  function closeAssistant() {
    const root = $("#assistantRoot");
    if (root) root.classList.add("hidden");
    if (assistantRecognition) {
      try { assistantRecognition.stop(); } catch (_) {}
      assistantRecognition = null;
      $("#assistantMic")?.classList.remove("listening");
    }
  }

  function normalizeWords(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function parseNaturalDate(text) {
    const lower = normalizeWords(text);
    const today = parseDateKey(todayKey());
    if (/\bhoje\b/.test(lower)) return todayKey();
    if (/\bontem\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
    if (/\banteontem\b/.test(lower)) { const d = new Date(today); d.setDate(d.getDate() - 2); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
    const m = lower.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (m) {
      let y = m[3] ? Number(m[3]) : new Date().getFullYear(); if (y < 100) y += 2000;
      const candidate = `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
      if (parseDateKey(candidate)) return candidate;
    }
    const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return "";
  }

  function parseNaturalAmount(text) {
    const lower = normalizeWords(text).replace(/\bmilhao\b/g, "milhao");
    const patterns = [
      /r\$\s*([0-9][0-9.]*)(?:,([0-9]{1,2}))?/i,
      /([0-9][0-9.]*)(?:,([0-9]{1,2}))?\s*(?:reais|real)\b/i,
      /\b([0-9]+(?:[.,][0-9]{1,2})?)\b/
    ];
    let match = null;
    for (const pattern of patterns) { match = lower.match(pattern); if (match) break; }
    if (!match) return 0;
    let raw = match[0].replace(/r\$/i, "").replace(/reais?|real/ig, "").trim();
    if (/\bmil\b/.test(lower) && /^[0-9]+(?:[.,][0-9]+)?$/.test(raw)) {
      raw = String(Number(raw.replace(".", "").replace(",", ".")) * 1000);
    }
    return normalizeAmount(raw);
  }

  function detectTransactionType(text) {
    const lower = normalizeWords(text);
    if (/\b(recebi|ganhei|entrou|entrada|renda|salario|salario recebido|credito)\b/.test(lower)) return "income";
    if (/\b(gastei|paguei|pagar|despesa|gasto|comprei|compras|saida|debito|custou)\b/.test(lower)) return "expense";
    return "";
  }

  function detectRecurrence(text) {
    const lower = normalizeWords(text);
    if (/\b(todo dia|todos os dias|diaria|diario|diariamente)\b/.test(lower)) return "daily";
    if (/\b(todo semana|toda semana|semanal|semanalmente)\b/.test(lower)) return "weekly";
    if (/\b(quinzenal|a cada 15 dias|cada quinze dias)\b/.test(lower)) return "biweekly";
    if (/\b(todo mes|toda mes|mensal|mensalmente|todo mes)\b/.test(lower)) return "monthly";
    if (/\b(uma vez|unica|unico|nao repetir|não repetir|so hoje|só hoje|nao|não)\b/.test(lower)) return "none";
    return "";
  }

  function detectCategory(text) {
    const lower = normalizeWords(text);
    const map = [
      ["Alimentação", /mercado|supermercado|restaurante|lanchonete|lanche|ifood|comida|pizza|delivery|padaria|cafe/],
      ["Transporte", /gasolina|combustivel|uber|99|onibus|onibus|passagem|estacionamento|carro|moto|transporte/],
      ["Moradia", /aluguel|condominio|luz|energia|agua|internet|telefone|casa/],
      ["Lazer", /cinema|bar|festa|jogo|passeio|viagem|lazer/],
      ["Estudos", /faculdade|ufsc|curso|livro|material|estudo|mensalidade/],
      ["Saúde", /farmacia|remedio|consulta|academia|saude|medico|dentista/],
      ["Assinaturas", /netflix|spotify|prime|disney|youtube|assinatura/],
      ["Salário", /salario|salario|pagamento|ordenado/],
      ["Freelance", /freela|freelance|cliente|projeto/],
      ["Investimentos", /investimento|investi|acao|acoes|cdb|tesouro/]
    ];
    return map.find(([,re]) => re.test(lower))?.[0] || "";
  }

  function cleanDescription(text) {
    let result = String(text || "").trim();
    result = result.replace(/r\$\s*[0-9][0-9.]*(?:,[0-9]{1,2})?/gi, " ");
    result = result.replace(/\b[0-9][0-9.]*(?:,[0-9]{1,2})?\s*(?:reais|real)\b/gi, " ");
    result = result.replace(/\b(gastei|paguei|recebi|ganhei|adicione|adicionar|registre|registrar|um|uma|gasto|despesa|renda|entrada|saida|saída|no|na|em|hoje|ontem|anteontem|todo dia|todos os dias|diaria|diário|diaria|semanal|semanalmente|quinzenal|mensal|mensalmente|todo mes|toda semana)\b/gi, " ");
    result = result.replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, " ").replace(/\s+/g, " ").trim();
    return result;
  }

  function parseAssistantText(text) {
    const original = String(text || "").trim();
    if (!original) return {};
    const type = detectTransactionType(original);
    const amount = parseNaturalAmount(original);
    const date = parseNaturalDate(original);
    const recurrence = detectRecurrence(original);
    const category = detectCategory(original);
    let description = cleanDescription(original);
    if (/^(quanto|qual|quais|mostre|me diga|me fala|como|onde|tem|tenho|posso|consigo)\b/i.test(description)) description = "";
    if (["hoje","ontem","anteontem","sim","não","nao"].includes(normalizeWords(description))) description = "";
    return { type, amount, date, recurrence, category, description };
  }

  function isAssistantQuery(text) {
    const lower = normalizeWords(text);
    return /\b(quanto|qual|quais|mostre|me mostra|me diga|onde gastei|como esta|como está|saldo|disponivel|disponível|programad|gastos do mes|gastos deste mes|gastei este mes|gastei nesse mes|gastei no mes|maior gasto|menor gasto)\b/.test(lower);
  }

  function assistantMonthTransactions() {
    const key = todayKey().slice(0, 7);
    return state.transactions.filter(t => monthKey(t.date) === key && isRealizedTransaction(t));
  }

  function assistantAnswerQuery(text) {
    const lower = normalizeWords(text);
    const totals = cumulativeTotals();
    const scheduled = plannedFutureExpenses();
    const free = projectedAvailable();
    if (/saldo|disponivel|disponivel depois|quanto tenho|quanto sobra|quanto vou ter/.test(lower)) {
      return `Seu planejamento agora:\n\nSaldo acumulado: ${money(totals.balance)}\nDespesas programadas: ${money(scheduled)}\nDisponível considerando as programadas: ${money(free)}.`;
    }
    if (/programad/.test(lower)) {
      const list = state.transactions.filter(t => isFutureTransaction(t) && t.type === "expense").sort((a,b)=>compareDateKeys(a.date,b.date));
      if (!list.length) return "Você não tem despesas programadas no momento.";
      return `Você tem ${list.length} despesa(s) programada(s), somando ${money(scheduled)}:\n\n${list.slice(0,8).map(t=>`• ${formatDateKey(t.date)} — ${t.description}: ${money(t.amount)}`).join("\n")}${list.length>8?"\n• ...":""}`;
    }
    const monthTx = assistantMonthTransactions();
    const monthExpenses = monthTx.filter(t=>t.type==="expense");
    const monthIncome = monthTx.filter(t=>t.type==="income");
    if (/maior gasto/.test(lower)) {
      const biggest = [...monthExpenses].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
      return biggest ? `Seu maior gasto realizado neste mês é ${biggest.description}, de ${money(biggest.amount)}, em ${formatDateKey(biggest.date)}.` : "Ainda não há gastos realizados neste mês.";
    }
    const categoryMatch = assistantCategories().find(cat => lower.includes(normalizeWords(cat)));
    if (categoryMatch) {
      const list = monthExpenses.filter(t=>t.category===categoryMatch);
      const total = list.reduce((s,t)=>s+Number(t.amount||0),0);
      return `Neste mês, você gastou ${money(total)} com ${categoryMatch}, em ${list.length} lançamento(s).`;
    }
    if (/entrada|receb/.test(lower) && !/gasto|despesa/.test(lower)) {
      const total = monthIncome.reduce((s,t)=>s+Number(t.amount||0),0);
      return `Neste mês, você recebeu ${money(total)} em entradas realizadas.`;
    }
    if (/gasto|despesa|quanto gastei|gastos/.test(lower)) {
      const total = monthExpenses.reduce((s,t)=>s+Number(t.amount||0),0);
      return `Neste mês, você realizou ${monthExpenses.length} despesa(s), totalizando ${money(total)}.`;
    }
    return `Posso consultar seus gastos, saldo e despesas programadas. Também posso registrar uma movimentação. Tente: “quanto gastei com alimentação este mês?” ou “gastei R$ 35 no mercado hoje”.`;
  }

  function assistantMissingField() {
    const d = assistantState.draft || {};
    if (!d.type) return "Você quer registrar uma **despesa** ou uma **renda**?";
    if (!(d.amount > 0)) return "Qual foi o **valor**? Pode falar, por exemplo, “35 reais”.";
    if (!d.description) return "Qual foi o **nome do gasto ou da entrada**? Por exemplo: mercado, gasolina ou salário.";
    if (!d.date) return "Em qual **data** aconteceu? Você pode dizer “hoje”, “ontem” ou uma data como “25/09”.";
    if (!d.category) return "Qual é a **categoria**? Pode ser Alimentação, Transporte, Moradia, Lazer, Estudos, Saúde, Assinaturas ou Outra.";
    if (!d.recurrence) return "Essa movimentação é **única** ou se repete? Se repetir, diga diária, semanal, quinzenal ou mensal.";
    if (d.recurrence !== "none" && !d.recurrenceEnd) return "Até quando devo repetir essa movimentação? Diga uma data, por exemplo, “31/12/2026”.";
    return "";
  }

  function assistantDraftSummary() {
    const d = assistantState.draft;
    const typeLabel = d.type === "income" ? "renda" : "despesa";
    const repeat = d.recurrence === "none" ? "uma vez" : recurrenceLabelFull(d.recurrence);
    return `Entendi assim:\n\n• Tipo: ${typeLabel}\n• Descrição: ${d.description}\n• Valor: ${money(d.amount)}\n• Data: ${formatDateKey(d.date)}\n• Categoria: ${d.category}\n• Repetição: ${repeat}${d.recurrence !== "none" ? `\n• Até: ${formatDateKey(d.recurrenceEnd)}` : ""}\n\nEstá tudo certo?`;
  }

  function assistantRenderConfirmButtons() {
    const root = $("#assistantSuggestions"); if (!root) return;
    root.innerHTML = `<div class="assistant-confirm-row"><button class="btn btn-primary" type="button" id="assistantConfirmYes">Registrar</button><button class="btn btn-secondary" type="button" id="assistantConfirmNo">Corrigir</button></div>`;
    $("#assistantConfirmYes")?.addEventListener("click", assistantCommitDraft);
    $("#assistantConfirmNo")?.addEventListener("click", () => {
      assistantState.awaitingConfirm = false;
      assistantAddMessage("assistant", "Claro. Me diga o que precisa corrigir. Eu não vou registrar nada até você confirmar novamente.");
      assistantSetSuggestions(["Corrigir valor", "Corrigir data", "Corrigir categoria", "Corrigir recorrência"]);
    });
  }

  function assistantCommitDraft() {
    const d = assistantState.draft;
    if (!d || assistantMissingField()) return assistantAddMessage("assistant", assistantMissingField());
    const occurrences = buildOccurrences(d.date, d.recurrence, d.recurrenceEnd);
    const parent = uid("txparent");
    occurrences.forEach((date, index) => state.transactions.push({
      id: uid("tx"), type: d.type, description: d.description, amount: d.amount, category: d.category,
      date, note: "Lançado pelo Assistente Santinho", recurrence: d.recurrence,
      recurrenceEnd: d.recurrence === "none" ? "" : d.recurrenceEnd, parentId: index ? parent : null
    }));
    saveState(); renderAll();
    assistantState.draft = null; assistantState.awaiting = null; assistantState.awaitingConfirm = false;
    assistantAddMessage("assistant", occurrences.length > 1 ? `✅ Pronto! Registrei ${occurrences.length} lançamentos de ${d.description}, totalizando ${money(d.amount * occurrences.length)}.` : `✅ Pronto! Registrei ${d.description} como ${d.type === "income" ? "renda" : "despesa"} de ${money(d.amount)} em ${formatDateKey(d.date)}.`);
    assistantSetSuggestions(["Quanto tenho disponível?", "Quanto gastei este mês?", "Registrar outro gasto"]);
  }

  function assistantApplyResponse(text) {
    const d = assistantState.draft || {};
    const parsed = parseAssistantText(text);
    if (!d.type && parsed.type) d.type = parsed.type;
    if (!(d.amount > 0) && parsed.amount > 0) d.amount = parsed.amount;
    if (!d.date && parsed.date) d.date = parsed.date;
    if (!d.category && parsed.category) d.category = parsed.category;
    if (!d.recurrence && parsed.recurrence) d.recurrence = parsed.recurrence;
    if (!d.description && parsed.description) d.description = parsed.description;

    const lower = normalizeWords(text);
    if (assistantState.awaiting === "type") { const t = detectTransactionType(text); if (t) d.type = t; }
    if (assistantState.awaiting === "amount") { const a = parseNaturalAmount(text); if (a > 0) d.amount = a; }
    if (assistantState.awaiting === "description") { d.description = String(text).trim(); }
    if (assistantState.awaiting === "date") { const date = parseNaturalDate(text); if (date) d.date = date; }
    if (assistantState.awaiting === "category") { const cat = detectCategory(text); if (cat) d.category = cat; else if (/^outra|^outro|^outras|^outros$/i.test(String(text).trim())) d.category = "Outros"; }
    if (assistantState.awaiting === "recurrence") {
      const rec = detectRecurrence(text); if (rec) d.recurrence = rec;
    }
    if (assistantState.awaiting === "recurrenceEnd") { const date = parseNaturalDate(text); if (date) d.recurrenceEnd = date; }
    assistantState.draft = d;
    assistantState.awaiting = null;
    return d;
  }

  function assistantStartFromText(text) {
    const parsed = parseAssistantText(text);
    assistantState.draft = {
      type: parsed.type || "", amount: parsed.amount || 0, description: parsed.description || "",
      date: parsed.date || "", category: parsed.category || "", recurrence: parsed.recurrence || "", recurrenceEnd: parsed.recurrenceEnd || ""
    };
  }

  function assistantHandleInput(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return;
    $("#assistantInput").value = "";
    assistantAddMessage("user", text);

    const lower = normalizeWords(text);
    if (assistantState.awaitingConfirm) {
      if (/^(sim|sim pode|pode|confirmo|confirmar|registrar|registra|isso|correto|esta certo|está certo)$/i.test(text.trim())) return assistantCommitDraft();
      if (/^(nao|não|cancelar|cancela|corrigir)$/i.test(text.trim())) {
        assistantState.awaitingConfirm = false;
        assistantState.awaiting = null;
        assistantAddMessage("assistant", "Sem problema. Nada foi registrado. O que você quer corrigir?");
        assistantSetSuggestions(["Corrigir valor", "Corrigir data", "Corrigir categoria", "Corrigir recorrência"]);
        return;
      }
      assistantApplyResponse(text);
      const missing = assistantMissingField();
      if (missing) { assistantState.awaiting = assistantFieldName(); assistantAddMessage("assistant", missing); return; }
      assistantAddMessage("assistant", assistantDraftSummary()); assistantRenderConfirmButtons(); return;
    }

    if (!assistantState.draft && isAssistantQuery(text)) {
      assistantAddMessage("assistant", assistantAnswerQuery(text));
      assistantSetSuggestions(["Quanto tenho disponível?", "Ver despesas programadas", "Registrar um gasto"]);
      return;
    }

    const transactionIntent = detectTransactionType(text) || parseNaturalAmount(text) > 0 || /\b(registrar|adicionar|lancar|lançar|gastei|paguei|recebi|ganhei|despesa|renda)\b/i.test(text);
    if (!assistantState.draft && !transactionIntent) {
      if (/^(oi|ola|olá|ajuda|o que voce faz|o que você faz)$/i.test(text)) return assistantWelcome();
      assistantAddMessage("assistant", "Posso registrar despesas e rendas ou consultar seus dados. Se faltar alguma informação, eu pergunto antes de salvar.");
      assistantSetSuggestions(["Registrar um gasto", "Quanto gastei este mês?", "Quanto tenho disponível?"]);
      return;
    }

    if (!assistantState.draft) assistantStartFromText(text);
    else assistantApplyResponse(text);

    const missing = assistantMissingField();
    if (missing) {
      assistantState.awaiting = assistantFieldName();
      assistantAddMessage("assistant", missing);
      assistantSetSuggestions(assistantSuggestionsForField(assistantState.awaiting));
      return;
    }
    assistantState.awaitingConfirm = true;
    assistantAddMessage("assistant", assistantDraftSummary());
    assistantRenderConfirmButtons();
  }

  function assistantFieldName() {
    const d = assistantState.draft || {};
    if (!d.type) return "type";
    if (!(d.amount > 0)) return "amount";
    if (!d.description) return "description";
    if (!d.date) return "date";
    if (!d.category) return "category";
    if (!d.recurrence) return "recurrence";
    if (d.recurrence !== "none" && !d.recurrenceEnd) return "recurrenceEnd";
    return "";
  }

  function assistantSuggestionsForField(field) {
    const map = {
      type: ["Despesa", "Renda"],
      amount: ["R$ 35", "R$ 120,50"],
      date: ["Hoje", "Ontem"],
      category: ["Alimentação", "Transporte", "Moradia", "Outros"],
      recurrence: ["Uma vez", "Mensal", "Semanal"],
      recurrenceEnd: ["31/12/2026"]
    };
    return map[field] || [];
  }

  function assistantStartVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      assistantAddMessage("assistant", "O reconhecimento de voz não está disponível neste navegador. Você pode continuar comigo por texto no campo abaixo.");
      $("#assistantInput")?.focus();
      return;
    }
    if (assistantRecognition) { try { assistantRecognition.stop(); } catch (_) {} assistantRecognition = null; return; }
    const recognition = new Recognition();
    assistantRecognition = recognition;
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    $("#assistantMic")?.classList.add("listening");
    assistantAddMessage("assistant", "🎙️ Pode falar. Estou ouvindo...");
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      assistantRecognition = null;
      $("#assistantMic")?.classList.remove("listening");
      assistantHandleInput(transcript);
    };
    recognition.onerror = event => {
      assistantRecognition = null;
      $("#assistantMic")?.classList.remove("listening");
      if (event?.error !== "aborted") assistantAddMessage("assistant", "Não consegui ouvir essa frase. Tente novamente ou escreva a mensagem.");
    };
    recognition.onend = () => { assistantRecognition = null; $("#assistantMic")?.classList.remove("listening"); };
    try { recognition.start(); } catch (_) { assistantRecognition = null; $("#assistantMic")?.classList.remove("listening"); assistantAddMessage("assistant", "Não consegui iniciar o microfone. Você pode continuar por texto."); }
  }

  function assistantOpenFromFAB() { openAssistant(false); }

  function bindEvents(){
    $("#toggleSetup")?.addEventListener("click",()=>{const setupHidden=$("#setupForm").classList.contains("hidden");showAuthForm(setupHidden?"setup":"login");});
    $("#setupForm")?.addEventListener("submit",setupAccount); $("#loginForm")?.addEventListener("submit",login); $("#pinForm")?.addEventListener("submit",verifyPin); $("#logoutFromPin")?.addEventListener("click",logout); $("#lockNow")?.addEventListener("click",lockNow); $("#mobileBrand")?.addEventListener("click",()=>navigate("dashboard"));
    $$('[data-nav]').forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));
    $("#addExpense")?.addEventListener("click",()=>transactionModal("expense")); $("#addIncome")?.addEventListener("click",()=>transactionModal("income")); $("#addTransactionTop")?.addEventListener("click",()=>transactionModal("expense")); $("#addGoal")?.addEventListener("click",()=>goalModal());
    $("#toggleBalance")?.addEventListener("click",()=>{balanceVisible=!balanceVisible;renderDashboard();});
    $("#transactionSearch")?.addEventListener("input",renderTransactions); $("#transactionType")?.addEventListener("change",renderTransactions); $("#transactionStatus")?.addEventListener("change",renderTransactions); $("#analysisYear")?.addEventListener("change",renderAnalysis);
    $("#themeSelect")?.addEventListener("change",e=>{changeTheme(e.target.value);toast("Tema atualizado.");}); $("#configurePin")?.addEventListener("click",configurePin);
    $("#saveProfile")?.addEventListener("click",()=>{const u=$("#profileUsername").value.trim();if(!u)return toast("Informe um nome de usuário.");state.profile.username=u;state.profile.email=$("#profileEmail").value.trim();saveState();renderDashboard();toast("Perfil salvo.");});
    $("#profilePhoto")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=await readImageAsBase64(f);if(data.length>3000000)return toast("Escolha uma imagem menor.");state.profile.avatar=data;saveState();renderProfile();renderDashboard();toast("Foto atualizada.");}catch{toast("Não foi possível ler a imagem.");}});
    $("#backupNow")?.addEventListener("click",backupNow); $("#restoreData")?.addEventListener("click",()=>$("#restoreInput")?.click()); $("#restoreInput")?.addEventListener("change",e=>restoreFile(e.target.files?.[0])); $("#logout")?.addEventListener("click",logout);
    $("#exportTxt")?.addEventListener("click",exportTXT); $("#exportPdf")?.addEventListener("click",printPDF); $("#exportXlsx")?.addEventListener("click",exportXLSX);
    $("#voiceAssistant")?.addEventListener("click",assistantOpenFromFAB);
    $("#assistantClose")?.addEventListener("click",closeAssistant);
    $("#assistantInputForm")?.addEventListener("submit",e=>{e.preventDefault();assistantHandleInput($("#assistantInput")?.value||"");});
    $("#assistantMic")?.addEventListener("click",assistantStartVoice);
    $("#assistantRoot")?.addEventListener("click",e=>{if(e.target.classList.contains("assistant-backdrop"))closeAssistant();});
    $("#privacyAccept")?.addEventListener("click",acceptPrivacy); $("#privacyDontShow")?.addEventListener("change",e=>{if(e.target.checked)acceptPrivacy();});
    document.addEventListener("click",event=>{const del=event.target.closest("[data-delete-tx]");if(del){if(confirm("Excluir esta transação?")){state.transactions=state.transactions.filter(t=>t.id!==del.dataset.deleteTx);saveState();renderAll();toast("Transação excluída.");}return;}const dg=event.target.closest("[data-delete-goal]");if(dg){if(confirm("Excluir esta meta?")){state.goals=state.goals.filter(g=>g.id!==dg.dataset.deleteGoal);saveState();renderGoals();toast("Meta excluída.");}return;}const ag=event.target.closest("[data-add-goal]");if(ag){const goal=state.goals.find(g=>g.id===ag.dataset.addGoal);if(goal)goalModal(goal);}});
    $("#modalRoot")?.addEventListener("click",e=>{if(e.target.classList.contains("modal-backdrop"))closeModal();}); $("#messageCardRoot")?.addEventListener("click",e=>{if(e.target.classList.contains("message-backdrop"))closeMessageCard();});
  }

  function init(){
    bindEvents();
    loadState().then(()=>{
      updateAuthMode();
      show("authView");
      if(!state.credentials)showAuthForm("setup");
      if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("SW",e));
    }).catch(e=>{console.error(e);authMessage("O aplicativo encontrou um erro ao iniciar. Seus dados locais não foram apagados.",true);});
  }
  init();
})();
