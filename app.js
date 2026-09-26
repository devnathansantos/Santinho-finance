/* =========================================================
   SANTINHO FINANCE
   APP.JS
   100% CLIENT-SIDE
   ========================================================= */

(() => {
  "use strict";

  /* =======================================================
     CONFIGURAÇÃO
     ======================================================= */

  const DB_NAME = "santinho-finance-db";
  const DB_VERSION = 1;
  const STORE = "app";

  const LS_KEY = "santinho-finance-snapshot-v1";
  const SESSION_KEY = "santinho-session";

  const SCHEMA = 1;


  /* =======================================================
     HELPERS
     ======================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const money = value =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(value) || 0);

  const uid = prefix =>
    `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const escapeHTML = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      char =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[char]
    );

  const clamp = (number, min, max) =>
    Math.min(max, Math.max(min, number));


  /* =======================================================
     MOTIVAÇÕES
     ======================================================= */

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


  /* =======================================================
     ESTADO PADRÃO
     ======================================================= */

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
      pinHash: null,
      lastBackupAt: null
    },

    motivationHistory: [],

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString()
  });


  /* =======================================================
     ESTADO GLOBAL
     ======================================================= */

  let state = defaultState();

  let db = null;

  let balanceVisible = true;

  let currentPage = "dashboard";

  let unlocked = false;


  /* =======================================================
     INDEXEDDB
     ======================================================= */

  function openDB() {
    return new Promise((resolve, reject) => {

      const request =
        indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {

        const database = request.result;

        if (
          !database.objectStoreNames.contains(STORE)
        ) {
          database.createObjectStore(STORE);
        }
      };

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(request.error);
    });
  }


  function idbGet(key) {
    return new Promise((resolve, reject) => {

      const request =
        db
          .transaction(STORE, "readonly")
          .objectStore(STORE)
          .get(key);

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(request.error);
    });
  }


  function idbSet(key, value) {
    return new Promise((resolve, reject) => {

      const request =
        db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .put(value, key);

      request.onsuccess = () =>
        resolve();

      request.onerror = () =>
        reject(request.error);
    });
  }


  /* =======================================================
     CARREGAMENTO
     ======================================================= */

  async function loadState() {

    try {

      db = await openDB();

      const fromIDB =
        await idbGet("state");

      const fromLS =
        JSON.parse(
          localStorage.getItem(LS_KEY) || "null"
        );

      const candidate =
        fromIDB || fromLS;

      if (
        candidate &&
        candidate.schema === SCHEMA
      ) {
        state = normalize(candidate);
      } else {
        state = defaultState();
      }

    } catch {

      try {

        const fromLS =
          JSON.parse(
            localStorage.getItem(LS_KEY) || "null"
          );

        if (
          fromLS?.schema === SCHEMA
        ) {
          state = normalize(fromLS);
        }

      } catch {

        state = defaultState();

      }
    }

    applyTheme();
  }


  /* =======================================================
     NORMALIZAÇÃO
     ======================================================= */

  function normalize(raw) {

    const defaults =
      defaultState();

    return {

      ...defaults,

      ...raw,

      profile: {
        ...defaults.profile,
        ...(raw.profile || {})
      },

      settings: {
        ...defaults.settings,
        ...(raw.settings || {})
      },

      transactions:
        Array.isArray(raw.transactions)
          ? raw.transactions
          : [],

      goals:
        Array.isArray(raw.goals)
          ? raw.goals
          : [],

      motivationHistory:
        Array.isArray(raw.motivationHistory)
          ? raw.motivationHistory
          : []
    };
  }


  /* =======================================================
     SALVAMENTO
     ======================================================= */

  let saveTimer = null;

  function saveState() {

    state.updatedAt =
      new Date().toISOString();

    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn(
        "localStorage save failed",
        error
      );
    }

    clearTimeout(saveTimer);

    saveTimer = setTimeout(
      async () => {

        try {

          if (db) {
            await idbSet(
              "state",
              state
            );
          }

        } catch (error) {

          console.warn(
            "IndexedDB save failed",
            error
          );

        }

      },
      0
    );
  }


  /* =======================================================
     CRIPTOGRAFIA
     ======================================================= */

  async function hashSecret(secret, salt) {

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt:
            new TextEncoder().encode(salt),
          iterations: 150000,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );

    return [
      ...new Uint8Array(bits)
    ]
      .map(byte =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  }


  function makeCredential(
    identifier,
    password
  ) {

    return {
      identifier:
        identifier
          .trim()
          .toLowerCase(),

      salt:
        crypto.randomUUID(),

      passwordHash: null
    };
  }


  /* =======================================================
     AUTENTICAÇÃO
     ======================================================= */

  function show(view) {

    [
      "authView",
      "pinView",
      "mainView"
    ].forEach(id => {

      const element = $("#" + id);

      if (element) {
        element.classList.toggle(
          "hidden",
          id !== view
        );
      }

    });
  }


  function authMessage(
    message,
    error = false
  ) {

    const element =
      $("#authMessage");

    if (!element) return;

    element.textContent =
      message;

    element.classList.toggle(
      "error",
      error
    );
  }


  function pinMessage(
    message,
    error = false
  ) {

    const element =
      $("#pinMessage");

    if (!element) return;

    element.textContent =
      message;

    element.classList.toggle(
      "error",
      error
    );
  }


  function updateAuthMode() {

    const hasAccount =
      !!state.credentials;

    $("#loginForm")
      ?.classList
      .toggle(
        "hidden",
        !hasAccount
      );

    $("#setupForm")
      ?.classList
      .toggle(
        "hidden",
        hasAccount
      );

    const toggle =
      $("#toggleSetup");

    if (toggle) {

      toggle.textContent =
        hasAccount
          ? "Criar/alterar acesso local"
          : "Já tenho uma conta local";
    }

    const title =
      $("#authTitle");

    if (title) {

      title.textContent =
        hasAccount
          ? "Entrar no Santinho Finance"
          : "Criar seu Santinho Finance";
    }

    const subtitle =
      $("#authSubtitle");

    if (subtitle) {

      subtitle.textContent =
        hasAccount
          ? "A autenticação acontece somente neste aparelho."
          : "Crie um acesso local. Nenhuma credencial será enviada para a internet.";
    }
  }


  async function setupAccount(event) {

    event.preventDefault();

    const username =
      $("#setupUsername")
        .value
        .trim();

    const email =
      $("#setupEmail")
        .value
        .trim();

    const password =
      $("#setupPassword")
        .value;

    const password2 =
      $("#setupPassword2")
        .value;

    if (!username) {

      return authMessage(
        "Informe um nome de usuário.",
        true
      );
    }

    if (
      password !== password2
    ) {

      return authMessage(
        "As senhas não conferem.",
        true
      );
    }

    if (
      password.length < 6
    ) {

      return authMessage(
        "Use pelo menos 6 caracteres.",
        true
      );
    }

    const identifier =
      email || username;

    const credential =
      makeCredential(
        identifier,
        password
      );

    credential.passwordHash =
      await hashSecret(
        password,
        credential.salt
      );

    state.credentials =
      credential;

    state.profile.username =
      username;

    state.profile.email =
      email;

    saveState();

    updateAuthMode();

    authMessage(
      "Conta local criada. Entre para continuar."
    );

    $("#loginIdentifier").value =
      identifier;
  }


  async function login(event) {

    event.preventDefault();

    const identifier =
      $("#loginIdentifier")
        .value
        .trim()
        .toLowerCase();

    const password =
      $("#loginPassword")
        .value;

    const credentials =
      state.credentials;

    const username =
      String(
        state.profile.username || ""
      )
        .trim()
        .toLowerCase();

    const email =
      String(
        state.profile.email || ""
      )
        .trim()
        .toLowerCase();

    const allowedIdentifiers =
      [
        credentials?.identifier,
        username,
        email
      ].filter(Boolean);

    if (
      !credentials ||
      !allowedIdentifiers.includes(
        identifier
      )
    ) {

      return authMessage(
        "Username/e-mail ou senha inválidos.",
        true
      );
    }

    const digest =
      await hashSecret(
        password,
        credentials.salt
      );

    if (
      digest !== credentials.passwordHash
    ) {

      return authMessage(
        "Username/e-mail ou senha inválidos.",
        true
      );
    }

    sessionStorage.setItem(
      SESSION_KEY,
      "1"
    );

    unlocked = false;

    if (
      state.settings.pinHash
    ) {

      show("pinView");

      $("#pinInput").value = "";

      setTimeout(
        () => $("#pinInput").focus(),
        50
      );

    } else {

      unlocked = true;

      enterApp();
    }
  }


  async function verifyPin(event) {

    event.preventDefault();

    const pin =
      $("#pinInput")
        .value
        .trim();

    if (
      !/^\d{4,6}$/.test(pin)
    ) {

      return pinMessage(
        "Use de 4 a 6 números.",
        true
      );
    }

    const digest =
      await hashSecret(
        pin,
        state.settings.pinHash.salt
      );

    if (
      digest !==
      state.settings.pinHash.hash
    ) {

      return pinMessage(
        "PIN incorreto.",
        true
      );
    }

    unlocked = true;

    pinMessage("");

    enterApp();
  }


  function enterApp() {

    show("mainView");

    renderAll();

    chooseMotivation();

    navigate(currentPage);
  }


  function logout() {

    sessionStorage.removeItem(
      SESSION_KEY
    );

    unlocked = false;

    show("authView");

    updateAuthMode();

    if ($("#loginPassword")) {
      $("#loginPassword").value = "";
    }
  }


  function lockNow() {

    unlocked = false;

    if (
      state.settings.pinHash
    ) {

      show("pinView");

      $("#pinInput").value = "";

      setTimeout(
        () => $("#pinInput").focus(),
        50
      );

    } else {

      logout();
    }
  }


  /* =======================================================
     TEMA
     ======================================================= */

  function applyTheme() {

    const isLight =
      state.settings.theme === "light";

    /*
      O CSS usa body.light.
      Mantemos também a classe no html para compatibilidade.
    */

    document.body.classList.toggle(
      "light",
      isLight
    );

    document.documentElement.classList.toggle(
      "light",
      isLight
    );

    const switchElement =
      $("#themeSwitch");

    if (switchElement) {
      switchElement.checked =
        isLight;
    }
  }


  /* =======================================================
     NAVEGAÇÃO
     ======================================================= */

  function navigate(page) {

    const validPages = [
      "dashboard",
      "analysis",
      "transactions",
      "goals",
      "profile"
    ];

    if (
      !validPages.includes(page)
    ) {
      page = "dashboard";
    }

    currentPage = page;

    $$(".page").forEach(
      section => {

        section.classList.toggle(
          "active",
          section.id ===
            `page-${page}`
        );
      }
    );

    $$(".nav-btn").forEach(
      button => {

        const active =
          button.dataset.nav === page;

        button.classList.toggle(
          "active",
          active
        );

        if (active) {

          button.setAttribute(
            "aria-current",
            "page"
          );

        } else {

          button.removeAttribute(
            "aria-current"
          );
        }
      }
    );

    /*
      Atualiza a página aberta.
    */

    if (page === "dashboard") {
      renderDashboard();
    }

    if (page === "analysis") {
      renderAnalysis();
    }

    if (page === "transactions") {
      renderTransactions();
    }

    if (page === "goals") {
      renderGoals();
    }

    if (page === "profile") {
      renderProfile();
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }


  /* =======================================================
     MOTIVAÇÃO
     ======================================================= */

  function chooseMotivation() {

    const last =
      state.motivationHistory.at(-1);

    const choices =
      MOTIVATIONS.filter(
        phrase => phrase !== last
      );

    const phrase =
      choices[
        Math.floor(
          Math.random() *
          choices.length
        )
      ];

    state.motivationHistory =
      [
        ...state.motivationHistory,
        phrase
      ].slice(-5);

    const element =
      $("#motivation");

    if (element) {
      element.textContent =
        phrase;
    }

    saveState();
  }


  /* =======================================================
     DATAS
     ======================================================= */

  function parseDate(value) {

    if (!value) {
      return new Date();
    }

    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? new Date()
      : date;
  }


  function monthKey(date) {

    const d =
      parseDate(date);

    return (
      d.getFullYear() +
      "-" +
      String(
        d.getMonth() + 1
      ).padStart(2, "0")
    );
  }


  function currentYear() {

    return new Date()
      .getFullYear();
  }


  function currentMonthKey() {

    return monthKey(
      new Date()
    );
  }


  function monthNames() {

    return [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez"
    ];
  }


  function fullMonthNames() {

    return [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro"
    ];
  }


  /* =======================================================
     TRANSAÇÕES
     ======================================================= */

  function transactionAmount(transaction) {

    const amount =
      Number(
        transaction?.amount
      );

    return Number.isFinite(amount)
      ? amount
      : 0;
  }


  function currentMonthTransactions() {

    const key =
      currentMonthKey();

    return state.transactions.filter(
      transaction =>
        monthKey(
          transaction.date
        ) === key
    );
  }


  function totalsForTransactions(
    transactions
  ) {

    const income =
      transactions
        .filter(
          transaction =>
            transaction.type ===
            "income"
        )
        .reduce(
          (sum, transaction) =>
            sum +
            transactionAmount(
              transaction
            ),
          0
        );

    const expense =
      transactions
        .filter(
          transaction =>
            transaction.type ===
            "expense"
        )
        .reduce(
          (sum, transaction) =>
            sum +
            transactionAmount(
              transaction
            ),
          0
        );

    return {
      income,
      expense,
      balance:
        income - expense
    };
  }


  function currentMonthTotals() {

    return totalsForTransactions(
      currentMonthTransactions()
    );
  }


  /* =======================================================
     DASHBOARD
     ======================================================= */

  function renderDashboard() {

    const totals =
      currentMonthTotals();

    const welcomeName =
      $("#welcomeName");

    if (welcomeName) {

      welcomeName.textContent =
        state.profile.username ||
        "amigo";
    }


    if ($("#balanceValue")) {

      $("#balanceValue")
        .textContent =
        balanceVisible
          ? money(totals.balance)
          : "••••••";
    }


    if ($("#incomeMonth")) {

      $("#incomeMonth")
        .textContent =
        balanceVisible
          ? money(totals.income)
          : "••••";
    }


    if ($("#expenseMonth")) {

      $("#expenseMonth")
        .textContent =
        balanceVisible
          ? money(totals.expense)
          : "••••";
    }


    if ($("#dashboardAvatar")) {

      $("#dashboardAvatar").src =
        state.profile.avatar ||
        "assets/logo-192.png";
    }


    renderCategories();


    const recent =
      [...state.transactions]
        .sort(
          (a, b) =>
            parseDate(b.date) -
            parseDate(a.date)
        )
        .slice(0, 6);

    renderTransactionList(
      $("#recentTransactions"),
      recent
    );
  }


  /* =======================================================
     CATEGORIAS
     ======================================================= */

  function getCategoryTotals(
    transactions
  ) {

    const totals = {};

    transactions
      .filter(
        transaction =>
          transaction.type ===
          "expense"
      )
      .forEach(
        transaction => {

          const category =
            transaction.category ||
            "Outros";

          totals[category] =
            (totals[category] || 0) +
            transactionAmount(
              transaction
            );
        }
      );

    return totals;
  }


  function renderCategories() {

    const root =
      $("#categorySummary");

    if (!root) return;

    const transactions =
      currentMonthTransactions();

    const categoryTotals =
      getCategoryTotals(
        transactions
      );

    const total =
      Object.values(
        categoryTotals
      ).reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const entries =
      Object.entries(
        categoryTotals
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .slice(0, 6);

    if (!entries.length) {

      root.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            📊
          </div>

          <h3>
            Nenhuma despesa ainda
          </h3>

          <p>
            Quando você registrar gastos,
            eles aparecerão aqui.
          </p>
        </div>
      `;

      return;
    }


    root.innerHTML =
      entries
        .map(
          ([category, value]) => {

            const percentage =
              total > 0
                ? Math.round(
                    (value / total) *
                    100
                  )
                : 0;

            return `
              <div class="category-row">

                <div class="category-meta">

                  <span>
                    ${escapeHTML(
                      category
                    )}
                  </span>

                  <strong>
                    ${money(value)}
                    ·
                    ${percentage}%
                  </strong>

                </div>

                <div class="bar">

                  <i
                    style="
                      width:${percentage}%
                    "
                  ></i>

                </div>

              </div>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     LISTA DE TRANSAÇÕES
     ======================================================= */

  function renderTransactionList(
    container,
    list
  ) {

    if (!container) return;

    if (!list.length) {

      container.innerHTML = `
        <div class="empty-state">

          <div class="empty-state-icon">
            💸
          </div>

          <h3>
            Nenhuma transação
          </h3>

          <p>
            Suas movimentações aparecerão aqui.
          </p>

        </div>
      `;

      return;
    }


    container.innerHTML =
      list
        .map(transaction => {

          const income =
            transaction.type ===
            "income";

          const sign =
            income ? "+" : "−";

          const description =
            transaction.description ||
            (income
              ? "Entrada"
              : "Despesa");

          const category =
            transaction.category ||
            "Outros";

          return `
            <article
              class="transaction-item"
            >

              <div class="tx-icon">

                ${income ? "↗" : "↘"}

              </div>


              <div class="tx-main">

                <strong>
                  ${escapeHTML(
                    description
                  )}
                </strong>

                <small>
                  ${escapeHTML(
                    category
                  )}
                  ·
                  ${parseDate(
                    transaction.date
                  ).toLocaleDateString(
                    "pt-BR"
                  )}
                </small>

              </div>


              <span
                class="
                  tx-value
                  ${income
                    ? "income"
                    : "expense"}
                "
              >

                ${sign}
                ${money(
                  transactionAmount(
                    transaction
                  )
                )}

              </span>


              <button
                class="link-btn"
                type="button"
                data-delete-tx="${escapeHTML(
                  transaction.id
                )}"
                aria-label="Excluir transação"
              >
                ×
              </button>

            </article>
          `;
        })
        .join("");
  }


  /* =======================================================
     PÁGINA DE TRANSAÇÕES
     ======================================================= */

  function renderTransactions() {

    const root =
      $("#allTransactions");

    if (!root) return;

    const search =
      (
        $("#transactionSearch")
          ?.value || ""
      )
        .trim()
        .toLowerCase();

    const type =
      $("#transactionType")
        ?.value || "all";


    const filtered =
      state.transactions
        .filter(
          transaction => {

            const matchesType =
              type === "all" ||
              transaction.type ===
                type;

            const searchable =
              [
                transaction.description,
                transaction.category,
                transaction.note
              ]
                .join(" ")
                .toLowerCase();

            const matchesSearch =
              !search ||
              searchable.includes(
                search
              );

            return (
              matchesType &&
              matchesSearch
            );
          }
        )
        .sort(
          (a, b) =>
            parseDate(b.date) -
            parseDate(a.date)
        );


    renderTransactionList(
      root,
      filtered
    );
  }


  /* =======================================================
     ANÁLISE
     ======================================================= */

  function getAvailableYears() {

    const years =
      new Set();

    years.add(
      currentYear()
    );

    state.transactions
      .forEach(transaction => {

        const date =
          parseDate(
            transaction.date
          );

        years.add(
          date.getFullYear()
        );
      });

    return [
      ...years
    ].sort(
      (a, b) =>
        b - a
    );
  }


  function setupAnalysisYears() {

    const select =
      $("#analysisYear");

    if (!select) return;

    const years =
      getAvailableYears();

    const previous =
      Number(
        select.value
      ) || currentYear();

    select.innerHTML =
      years
        .map(
          year => `
            <option value="${year}">
              ${year}
            </option>
          `
        )
        .join("");

    select.value =
      years.includes(previous)
        ? String(previous)
        : String(years[0]);
  }


  function getYearTransactions(
    year
  ) {

    return state.transactions.filter(
      transaction =>
        parseDate(
          transaction.date
        ).getFullYear() ===
        Number(year)
    );
  }


  function getMonthlyExpenses(
    year
  ) {

    const months =
      Array.from(
        { length: 12 },
        () => 0
      );

    getYearTransactions(year)
      .filter(
        transaction =>
          transaction.type ===
          "expense"
      )
      .forEach(
        transaction => {

          const date =
            parseDate(
              transaction.date
            );

          const month =
            date.getMonth();

          months[month] +=
            transactionAmount(
              transaction
            );
        }
      );

    return months;
  }


  function renderAnalysis() {

    setupAnalysisYears();

    const select =
      $("#analysisYear");

    const year =
      Number(
        select?.value
      ) || currentYear();

    renderAnalysisSummary(year);

    renderYearlyChart(year);

    renderYearlyCategories(year);

    renderIncomeExpenseChart(year);
  }


  function renderAnalysisSummary(
    year
  ) {

    const transactions =
      getYearTransactions(year);

    const totals =
      totalsForTransactions(
        transactions
      );

    const monthly =
      getMonthlyExpenses(year);

    const totalExpense =
      totals.expense;

    const average =
      totalExpense / 12;


    if ($("#analysisYearExpense")) {

      $("#analysisYearExpense")
        .textContent =
        money(totalExpense);
    }


    if ($("#analysisYearLabel")) {

      $("#analysisYearLabel")
        .textContent =
        String(year);
    }


    if ($("#analysisIncome")) {

      $("#analysisIncome")
        .textContent =
        money(totals.income);
    }


    if ($("#analysisExpense")) {

      $("#analysisExpense")
        .textContent =
        money(totals.expense);
    }


    if ($("#analysisBalance")) {

      $("#analysisBalance")
        .textContent =
        money(totals.balance);
    }


    if ($("#analysisAverage")) {

      $("#analysisAverage")
        .textContent =
        money(average);
    }


    const highest =
      Math.max(...monthly);

    const lowest =
      Math.min(...monthly);

    const highestIndex =
      monthly.indexOf(highest);

    const lowestIndex =
      monthly.indexOf(lowest);

    const months =
      fullMonthNames();


    if ($("#highestExpenseMonth")) {

      $("#highestExpenseMonth")
        .textContent =
        highest > 0
          ? months[highestIndex]
          : "—";
    }


    if ($("#highestExpenseMonthValue")) {

      $("#highestExpenseMonthValue")
        .textContent =
        highest > 0
          ? money(highest)
          : money(0);
    }


    if ($("#lowestExpenseMonth")) {

      $("#lowestExpenseMonth")
        .textContent =
        lowest > 0
          ? months[lowestIndex]
          : "Sem gastos";
    }


    if ($("#lowestExpenseMonthValue")) {

      $("#lowestExpenseMonthValue")
        .textContent =
        lowest > 0
          ? money(lowest)
          : money(0);
    }
  }


  /* =======================================================
     GRÁFICO DE BARRAS
     ======================================================= */

  function renderYearlyChart(year) {

    const root =
      $("#yearlyExpenseChart");

    if (!root) return;

    const values =
      getMonthlyExpenses(year);

    const max =
      Math.max(...values, 1);

    const months =
      monthNames();


    root.innerHTML =
      values
        .map(
          (value, index) => {

            const percentage =
              value > 0
                ? Math.max(
                    3,
                    (value / max) *
                      100
                  )
                : 2;

            return `
              <div
                class="year-month"
                title="${months[index]}: ${money(value)}"
              >

                <div class="year-month-value">
                  ${value > 0
                    ? money(value)
                    : ""}
                </div>

                <div class="year-month-bar-wrap">

                  <div
                    class="year-month-bar"
                    style="
                      height:${percentage}%;
                      animation-delay:${index * 35}ms;
                    "
                  ></div>

                </div>

                <div class="year-month-label">
                  ${months[index]}
                </div>

              </div>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     CATEGORIAS DA ANÁLISE
     ======================================================= */

  function renderYearlyCategories(
    year
  ) {

    const root =
      $("#yearlyCategoryChart");

    if (!root) return;

    const transactions =
      getYearTransactions(year);

    const categoryTotals =
      getCategoryTotals(
        transactions
      );

    const entries =
      Object.entries(
        categoryTotals
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        );

    const total =
      entries.reduce(
        (sum, [, value]) =>
          sum + value,
        0
      );


    if (!entries.length) {

      root.innerHTML = `
        <div class="empty-state">

          <div class="empty-state-icon">
            📊
          </div>

          <h3>
            Sem despesas em ${year}
          </h3>

          <p>
            Registre despesas para visualizar
            a distribuição por categoria.
          </p>

        </div>
      `;

      return;
    }


    root.innerHTML =
      entries
        .map(
          ([category, value]) => {

            const percentage =
              total > 0
                ? Math.round(
                    (value / total) *
                      100
                  )
                : 0;

            return `
              <div class="category-row">

                <div class="category-meta">

                  <span>
                    ${escapeHTML(
                      category
                    )}
                  </span>

                  <strong>
                    ${money(value)}
                    ·
                    ${percentage}%
                  </strong>

                </div>

                <div class="bar">

                  <i
                    style="
                      width:${percentage}%
                    "
                  ></i>

                </div>

              </div>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     ENTRADAS X DESPESAS
     ======================================================= */

  function renderIncomeExpenseChart(
    year
  ) {

    const root =
      $("#incomeExpenseChart");

    if (!root) return;

    const totals =
      totalsForTransactions(
        getYearTransactions(year)
      );

    const maximum =
      Math.max(
        totals.income,
        totals.expense,
        1
      );


    const incomeWidth =
      (totals.income / maximum) *
      100;

    const expenseWidth =
      (totals.expense / maximum) *
      100;


    root.innerHTML = `

      <div class="ie-row">

        <div class="ie-head">

          <span>
            Entradas
          </span>

          <strong>
            ${money(totals.income)}
          </strong>

        </div>

        <div class="ie-track">

          <div
            class="ie-fill income"
            style="
              width:${incomeWidth}%
            "
          ></div>

        </div>

      </div>


      <div class="ie-row">

        <div class="ie-head">

          <span>
            Despesas
          </span>

          <strong>
            ${money(totals.expense)}
          </strong>

        </div>

        <div class="ie-track">

          <div
            class="ie-fill expense"
            style="
              width:${expenseWidth}%
            "
          ></div>

        </div>

      </div>
    `;
  }


  /* =======================================================
     METAS
     ======================================================= */

  function renderGoals() {

    const root =
      $("#goalsList");

    if (!root) return;

    if (!state.goals.length) {

      root.innerHTML = `
        <div class="empty-state">

          <div class="empty-state-icon">
            🎯
          </div>

          <h3>
            Nenhuma meta ainda
          </h3>

          <p>
            Crie uma meta para começar
            a acompanhar seu progresso.
          </p>

        </div>
      `;

      return;
    }


    root.innerHTML =
      state.goals
        .map(goal => {

          const target =
            Number(goal.target) || 0;

          const current =
            Number(goal.current) || 0;

          const percentage =
            target > 0
              ? clamp(
                  (current / target) *
                    100,
                  0,
                  100
                )
              : 0;

          const deadline =
            goal.deadline
              ? parseDate(
                  goal.deadline +
                    "T12:00:00"
                ).toLocaleDateString(
                  "pt-BR"
                )
              : "Sem prazo";


          return `
            <article
              class="goal-card glass"
            >

              <div class="goal-card-head">

                <div>

                  <h3>
                    ${escapeHTML(
                      goal.name
                    )}
                  </h3>

                  <small>
                    ${Math.round(
                      percentage
                    )}% concluído
                  </small>

                </div>

                <strong>
                  ${money(current)}
                </strong>

              </div>


              <div class="goal-progress">

                <i
                  style="
                    width:${percentage}%
                  "
                ></i>

              </div>


              <div class="goal-meta">

                <span>
                  ${money(current)}
                  /
                  ${money(target)}
                </span>

                <span>
                  ${deadline}
                </span>

              </div>


              <div class="goal-actions">

                <button
                  class="btn btn-secondary btn-small"
                  type="button"
                  data-add-goal="${escapeHTML(
                    goal.id
                  )}"
                >
                  Adicionar valor
                </button>

                <button
                  class="btn btn-secondary btn-small"
                  type="button"
                  data-delete-goal="${escapeHTML(
                    goal.id
                  )}"
                >
                  Excluir
                </button>

              </div>

            </article>
          `;
        })
        .join("");
  }


  /* =======================================================
     PERFIL
     ======================================================= */

  function renderProfile() {

    if ($("#profileUsername")) {

      $("#profileUsername").value =
        state.profile.username || "";
    }


    if ($("#profileEmail")) {

      $("#profileEmail").value =
        state.profile.email || "";
    }


    if ($("#profileAvatar")) {

      $("#profileAvatar").src =
        state.profile.avatar ||
        "assets/logo-192.png";
    }


    if ($("#pinStatus")) {

      $("#pinStatus").textContent =
        state.settings.pinHash
          ? "Ativado"
          : "Desativado";
    }


    if ($("#configurePin")) {

      $("#configurePin").textContent =
        state.settings.pinHash
          ? "Alterar PIN"
          : "Configurar";
    }


    if ($("#lastBackupStatus")) {

      if (
        state.settings.lastBackupAt
      ) {

        $("#lastBackupStatus")
          .textContent =
          `Último backup: ${parseDate(
            state.settings.lastBackupAt
          ).toLocaleString(
            "pt-BR"
          )}`;

      } else {

        $("#lastBackupStatus")
          .textContent =
          "Nenhum backup feito ainda.";
      }
    }


    applyTheme();
  }


  /* =======================================================
     MODAIS
     ======================================================= */

  function openModal(
    title,
    body,
    onSubmit
  ) {

    const root =
      $("#modalRoot");

    if (!root) return;

    root.innerHTML = `

      <div
        class="modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeHTML(
          title
        )}"
      >

        <div class="modal-head">

          <h3>
            ${escapeHTML(title)}
          </h3>

          <button
            class="modal-close"
            type="button"
            aria-label="Fechar"
          >
            ×
          </button>

        </div>


        <form
          id="modalForm"
          class="form-stack"
        >

          ${body}


          <div
            class="modal-actions"
            style="
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:8px;
              margin-top:6px;
            "
          >

            <button
              class="btn btn-secondary modal-cancel"
              type="button"
            >
              Cancelar
            </button>

            <button
              class="btn btn-primary"
              type="submit"
            >
              Salvar
            </button>

          </div>

        </form>

      </div>
    `;


    root.classList.remove(
      "hidden"
    );


    $(".modal-close", root)
      .onclick =
      closeModal;


    $(".modal-cancel", root)
      .onclick =
      closeModal;


    $("#modalForm", root)
      .onsubmit =
      async event => {

        event.preventDefault();

        await onSubmit(
          new FormData(
            event.currentTarget
          )
        );
      };


    const firstInput =
      $("input, select, textarea", root);

    if (firstInput) {

      setTimeout(
        () => firstInput.focus(),
        50
      );
    }
  }


  function closeModal() {

    const root =
      $("#modalRoot");

    if (!root) return;

    root.classList.add(
      "hidden"
    );

    root.innerHTML = "";
  }


  /* =======================================================
     TRANSAÇÃO — MODAL
     ======================================================= */

  function transactionModal(
    type = "expense"
  ) {

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


    const today =
      new Date()
        .toISOString()
        .slice(0, 10);


    openModal(

      type === "income"
        ? "Adicionar Renda"
        : "Adicionar Despesa",

      `

        <label>

          Descrição

          <input
            name="description"
            maxlength="80"
            required
            placeholder="${
              type === "income"
                ? "Ex.: Salário"
                : "Ex.: Mercado"
            }"
          >

        </label>


        <label>

          Valor (R$)

          <input
            name="amount"
            inputmode="decimal"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="0,00"
          >

        </label>


        <label>

          Categoria

          <select
            name="category"
          >

            ${categories
              .map(
                category =>
                  `<option value="${escapeHTML(
                    category
                  )}">
                    ${escapeHTML(
                      category
                    )}
                  </option>`
              )
              .join("")}

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

          Observação

          <textarea
            name="note"
            maxlength="240"
            placeholder="Opcional"
            style="
              min-height:80px;
              resize:vertical;
            "
          ></textarea>

        </label>

      `,

      async formData => {

        const amount =
          Number(
            formData.get("amount")
          );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return toast(
            "Informe um valor válido."
          );
        }


        const description =
          String(
            formData.get(
              "description"
            ) || ""
          ).trim();


        if (!description) {

          return toast(
            "Informe uma descrição."
          );
        }


        state.transactions.push({

          id: uid("tx"),

          type,

          description,

          amount,

          category:
            String(
              formData.get(
                "category"
              ) || "Outros"
            ),

          date:
            String(
              formData.get(
                "date"
              ) || today
            ),

          note:
            String(
              formData.get(
                "note"
              ) || ""
            ).trim()
        });


        saveState();

        closeModal();

        renderAll();

        if (
          currentPage ===
          "analysis"
        ) {
          renderAnalysis();
        }

        toast(
          type === "income"
            ? "Renda adicionada!"
            : "Despesa adicionada!"
        );
      }
    );
  }


  /* =======================================================
     METAS — MODAL
     ======================================================= */

  function goalModal(
    existing = null
  ) {

    if (existing) {

      openModal(

        "Adicionar à meta",

        `

          <p class="muted">

            Meta:

            <strong>
              ${escapeHTML(
                existing.name
              )}
            </strong>

          </p>


          <label>

            Valor a adicionar (R$)

            <input
              name="add"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0,00"
            >

          </label>

        `,

        async formData => {

          const add =
            Number(
              formData.get("add")
            );

          if (
            !Number.isFinite(add) ||
            add <= 0
          ) {

            return toast(
              "Informe um valor válido."
            );
          }


          existing.current =
            (
              Number(
                existing.current
              ) || 0
            ) + add;


          saveState();

          closeModal();

          renderGoals();

          toast(
            "Valor adicionado à meta!"
          );
        }
      );

      return;
    }


    openModal(

      "Criar nova meta",

      `

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
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="0,00"
          >

        </label>


        <label>

          Valor inicial (R$)

          <input
            name="current"
            type="number"
            min="0"
            step="0.01"
            value="0"
          >

        </label>


        <label>

          Prazo

          <input
            name="deadline"
            type="date"
          >

        </label>

      `,

      async formData => {

        const name =
          String(
            formData.get("name") ||
            ""
          ).trim();

        const target =
          Number(
            formData.get("target")
          );

        const current =
          Number(
            formData.get("current") ||
            0
          );


        if (!name) {

          return toast(
            "Informe o nome da meta."
          );
        }


        if (
          !Number.isFinite(target) ||
          target <= 0
        ) {

          return toast(
            "O alvo precisa ser maior que zero."
          );
        }


        state.goals.push({

          id: uid("goal"),

          name,

          target,

          current:
            Math.max(
              0,
              current
            ),

          deadline:
            String(
              formData.get(
                "deadline"
              ) || ""
            )
        });


        saveState();

        closeModal();

        renderGoals();

        toast(
          "Meta criada!"
        );
      }
    );
  }


  /* =======================================================
     PIN
     ======================================================= */

  async function configurePin() {

    if (
      state.settings.pinHash
    ) {

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
              minlength="4"
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

        async formData => {

          const oldPin =
            String(
              formData.get(
                "old"
              )
            );

          const newPin =
            String(
              formData.get(
                "pin"
              )
            );


          const oldHash =
            await hashSecret(
              oldPin,
              state.settings
                .pinHash
                .salt
            );


          if (
            oldHash !==
            state.settings
              .pinHash
              .hash
          ) {

            return toast(
              "PIN atual incorreto."
            );
          }


          if (
            !/^\d{4,6}$/.test(
              newPin
            )
          ) {

            return toast(
              "O PIN precisa ter 4 a 6 números."
            );
          }


          const salt =
            crypto.randomUUID();


          state.settings.pinHash = {

            salt,

            hash:
              await hashSecret(
                newPin,
                salt
              )
          };


          saveState();

          closeModal();

          renderProfile();

          toast(
            "PIN alterado."
          );
        }
      );

      return;
    }


    openModal(

      "Configurar PIN",

      `

        <p class="muted">

          O PIN será solicitado após
          uma nova abertura ou recarregamento
          do aplicativo.

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

      async formData => {

        const pin =
          String(
            formData.get(
              "pin"
            )
          );


        if (
          !/^\d{4,6}$/.test(pin)
        ) {

          return toast(
            "O PIN precisa ter 4 a 6 números."
          );
        }


        const salt =
          crypto.randomUUID();


        state.settings.pinHash = {

          salt,

          hash:
            await hashSecret(
              pin,
              salt
            )
        };


        saveState();

        closeModal();

        renderProfile();

        toast(
          "PIN ativado."
        );
      }
    );
  }


  /* =======================================================
     BACKUP
     ======================================================= */

  function backupObject() {

    return {

      app:
        "Santinho Finance",

      version:
        1,

      exportedAt:
        new Date().toISOString(),

      data:
        state
    };
  }


  function backupFileName() {

    const now =
      new Date();

    const stamp = [

      now.getFullYear(),

      String(
        now.getMonth() + 1
      ).padStart(2, "0"),

      String(
        now.getDate()
      ).padStart(2, "0"),

      "-",

      String(
        now.getHours()
      ).padStart(2, "0"),

      String(
        now.getMinutes()
      ).padStart(2, "0")

    ].join("");


    return `
      santinho-finance-backup-${stamp}.json
    `.replace(/\s+/g, "");
  }


  function rememberBackup() {

    state.settings.lastBackupAt =
      new Date().toISOString();

    saveState();

    renderProfile();
  }


  async function backupNow() {

    const json =
      JSON.stringify(
        backupObject(),
        null,
        2
      );


    const blob =
      new Blob(
        [json],
        {
          type:
            "application/json"
        }
      );


    const file =
      new File(
        [blob],
        backupFileName(),
        {
          type:
            "application/json"
        }
      );


    try {

      if (
        navigator.share &&
        (
          !navigator.canShare ||
          navigator.canShare({
            files: [file]
          })
        )
      ) {

        await navigator.share({

          title:
            "Backup Santinho Finance",

          text:
            "Backup local do Santinho Finance. Salve em Arquivos/iCloud Drive para não perder seus dados.",

          files: [file]
        });


        rememberBackup();


        if ($("#backupStatus")) {

          $("#backupStatus")
            .textContent =
            "Backup criado. No iPhone, escolha 'Salvar em Arquivos' → iCloud Drive.";
        }

      } else {

        const url =
          URL.createObjectURL(
            blob
          );


        const link =
          document.createElement(
            "a"
          );

        link.href = url;

        link.download =
          file.name;

        document.body.appendChild(
          link
        );

        link.click();

        link.remove();


        setTimeout(
          () =>
            URL.revokeObjectURL(
              url
            ),
          1500
        );


        rememberBackup();


        if ($("#backupStatus")) {

          $("#backupStatus")
            .textContent =
            "Backup baixado. Guarde o arquivo em um local seguro.";
        }
      }

    } catch (error) {

      if (
        error?.name ===
        "AbortError"
      ) {

        if ($("#backupStatus")) {

          $("#backupStatus")
            .textContent =
            "Compartilhamento cancelado. Nenhum dado foi alterado.";
        }

      } else {

        if ($("#backupStatus")) {

          $("#backupStatus")
            .textContent =
            "Não foi possível criar o backup. Tente novamente.";
        }
      }
    }
  }


  /* =======================================================
     RESTAURAÇÃO
     ======================================================= */

  async function restoreFile(
    file
  ) {

    if (!file) return;


    try {

      const raw =
        JSON.parse(
          await file.text()
        );


      if (
        raw?.app !==
          "Santinho Finance" ||
        raw?.version !== 1 ||
        raw?.data?.schema !==
          SCHEMA
      ) {

        throw new Error(
          "invalid"
        );
      }


      const incoming =
        normalize(
          raw.data
        );


      if (
        !incoming.profile ||
        !Array.isArray(
          incoming.transactions
        ) ||
        !Array.isArray(
          incoming.goals
        )
      ) {

        throw new Error(
          "invalid"
        );
      }


      const exportedAt =
        raw.exportedAt
          ? parseDate(
              raw.exportedAt
            ).toLocaleString(
              "pt-BR"
            )
          : "data desconhecida";


      const confirmed =
        window.confirm(
          `Restaurar o backup de ${exportedAt} vai substituir os dados locais atuais.\n\nFaça um backup atual antes de continuar, se quiser poder voltar atrás.\n\nContinuar?`
        );


      if (!confirmed) {
        return;
      }


      state =
        incoming;


      saveState();

      applyTheme();

      renderAll();

      renderAnalysis();


      if ($("#backupStatus")) {

        $("#backupStatus")
          .textContent =
          "Dados restaurados com sucesso.";
      }


      toast(
        "Backup restaurado."
      );

    } catch {

      if ($("#backupStatus")) {

        $("#backupStatus")
          .textContent =
          "Arquivo inválido ou corrompido.";
      }
    }


    if ($("#restoreInput")) {

      $("#restoreInput").value =
        "";
    }
  }


  /* =======================================================
     FOTO DE PERFIL
     ======================================================= */

  function readImageAsBase64(
    file
  ) {

    return new Promise(
      (resolve, reject) => {

        if (
          !file.type.startsWith(
            "image/"
          )
        ) {

          reject(
            new Error(
              "type"
            )
          );

          return;
        }


        const reader =
          new FileReader();


        reader.onload =
          () =>
            resolve(
              reader.result
            );


        reader.onerror =
          reject;


        reader.readAsDataURL(
          file
        );
      }
    );
  }


  /* =======================================================
     RENDER GERAL
     ======================================================= */

  function renderAll() {

    renderDashboard();

    renderAnalysis();

    renderTransactions();

    renderGoals();

    renderProfile();
  }


  /* =======================================================
     TOAST
     ======================================================= */

  function toast(message) {

    const element =
      $("#toast");

    if (!element) return;

    element.textContent =
      message;

    element.classList.add(
      "show"
    );


    clearTimeout(
      toast.timer
    );


    toast.timer =
      setTimeout(
        () =>
          element.classList.remove(
            "show"
          ),
        2200
      );
  }


  /* =======================================================
     EVENTOS
     ======================================================= */

  function bindEvents() {

    /* -----------------------------------------------------
       AUTENTICAÇÃO
       ----------------------------------------------------- */

    $("#toggleSetup").onclick =
      () => {

        const setupHidden =
          $("#setupForm")
            .classList
            .contains(
              "hidden"
            );


        $("#loginForm")
          .classList
          .toggle(
            "hidden",
            setupHidden
          );


        $("#setupForm")
          .classList
          .toggle(
            "hidden",
            !setupHidden
          );


        $("#authTitle")
          .textContent =
          setupHidden
            ? "Criar seu Santinho Finance"
            : "Entrar no Santinho Finance";


        $("#authSubtitle")
          .textContent =
          setupHidden
            ? "Crie um acesso local. Nenhuma credencial será enviada para a internet."
            : "A autenticação acontece somente neste aparelho.";
      };


    $("#setupForm").onsubmit =
      setupAccount;


    $("#loginForm").onsubmit =
      login;


    $("#pinForm").onsubmit =
      verifyPin;


    $("#logoutFromPin").onclick =
      logout;


    $("#lockNow").onclick =
      lockNow;


    /* -----------------------------------------------------
       NAVEGAÇÃO
       ----------------------------------------------------- */

    $$(".nav-btn").forEach(
      button => {

        button.onclick =
          () =>
            navigate(
              button.dataset.nav
            );
      }
    );


    $("#mobileBrand").onclick =
      () =>
        navigate(
          "dashboard"
        );


    /*
      Também permite que o botão
      "Ver análise" do dashboard
      navegue para a nova página.
    */

    $$("[data-nav]").forEach(
      element => {

        element.onclick =
          () =>
            navigate(
              element.dataset.nav
            );
      }
    );


    /* -----------------------------------------------------
       DASHBOARD
       ----------------------------------------------------- */

    $("#addExpense").onclick =
      () =>
        transactionModal(
          "expense"
        );


    $("#addIncome").onclick =
      () =>
        transactionModal(
          "income"
        );


    $("#addTransactionTop").onclick =
      () =>
        transactionModal(
          "expense"
        );


    $("#toggleBalance").onclick =
      () => {

        balanceVisible =
          !balanceVisible;

        renderDashboard();
      };


    /* -----------------------------------------------------
       TRANSAÇÕES
       ----------------------------------------------------- */

    $("#transactionSearch").oninput =
      renderTransactions;


    $("#transactionType").onchange =
      renderTransactions;


    /* -----------------------------------------------------
       ANÁLISE
       ----------------------------------------------------- */

    $("#analysisYear").onchange =
      () => {

        renderAnalysis();
      };


    /* -----------------------------------------------------
       METAS
       ----------------------------------------------------- */

    $("#addGoal").onclick =
      () =>
        goalModal();


    /* -----------------------------------------------------
       TEMA
       ----------------------------------------------------- */

    $("#themeSwitch").onchange =
      event => {

        state.settings.theme =
          event.target.checked
            ? "light"
            : "dark";

        saveState();

        applyTheme();

        toast(
          "Tema atualizado."
        );
      };


    /* -----------------------------------------------------
       PERFIL
       ----------------------------------------------------- */

    $("#configurePin").onclick =
      configurePin;


    $("#saveProfile").onclick =
      () => {

        state.profile.username =
          $("#profileUsername")
            .value
            .trim();

        state.profile.email =
          $("#profileEmail")
            .value
            .trim();


        saveState();

        renderDashboard();

        renderProfile();

        toast(
          "Perfil salvo."
        );
      };


    $("#profilePhoto").onchange =
      async event => {

        const file =
          event.target.files?.[0];

        if (!file) return;


        try {

          /*
            Limite simples para evitar
            armazenar imagens gigantes
            no IndexedDB/localStorage.
          */

          const data =
            await readImageAsBase64(
              file
            );


          if (
            data.length >
            3_000_000
          ) {

            toast(
              "Escolha uma imagem menor para manter o armazenamento leve."
            );

            return;
          }


          state.profile.avatar =
            data;


          saveState();

          renderProfile();

          renderDashboard();

          toast(
            "Foto atualizada."
          );

        } catch {

          toast(
            "Não foi possível ler a imagem."
          );
        }
      };


    /* -----------------------------------------------------
       BACKUP
       ----------------------------------------------------- */

    $("#backupNow").onclick =
      backupNow;


    $("#restoreData").onclick =
      () =>
        $("#restoreInput")
          .click();


    $("#restoreInput").onchange =
      event =>
        restoreFile(
          event.target.files?.[0]
        );


    /* -----------------------------------------------------
       LOGOUT
       ----------------------------------------------------- */

    $("#logout").onclick =
      logout;


    /* -----------------------------------------------------
       EVENTOS DINÂMICOS
       ----------------------------------------------------- */

    document.addEventListener(
      "click",
      event => {

        /* Excluir transação */

        const deleteTransaction =
          event.target.closest(
            "[data-delete-tx]"
          );


        if (
          deleteTransaction
        ) {

          const id =
            deleteTransaction
              .dataset
              .deleteTx;


          const confirmed =
            window.confirm(
              "Excluir esta transação?"
            );


          if (!confirmed) {
            return;
          }


          state.transactions =
            state.transactions.filter(
              transaction =>
                transaction.id !==
                id
            );


          saveState();

          renderAll();

          toast(
            "Transação excluída."
          );

          return;
        }


        /* Excluir meta */

        const deleteGoal =
          event.target.closest(
            "[data-delete-goal]"
          );


        if (deleteGoal) {

          const id =
            deleteGoal
              .dataset
              .deleteGoal;


          const confirmed =
            window.confirm(
              "Excluir esta meta?"
            );


          if (!confirmed) {
            return;
          }


          state.goals =
            state.goals.filter(
              goal =>
                goal.id !== id
            );


          saveState();

          renderGoals();

          toast(
            "Meta excluída."
          );

          return;
        }


        /* Adicionar valor à meta */

        const addGoal =
          event.target.closest(
            "[data-add-goal]"
          );


        if (addGoal) {

          const goal =
            state.goals.find(
              item =>
                item.id ===
                addGoal.dataset
                  .addGoal
            );


          if (goal) {
            goalModal(goal);
          }

          return;
        }
      }
    );


    /* -----------------------------------------------------
       FECHAR MODAL CLICANDO FORA
       ----------------------------------------------------- */

    $("#modalRoot").addEventListener(
      "click",
      event => {

        if (
          event.target.id ===
          "modalRoot"
        ) {

          closeModal();
        }
      }
    );


    /* -----------------------------------------------------
       TECLA ESC
       ----------------------------------------------------- */

    document.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Escape"
        ) {

          closeModal();
        }
      }
    );
  }


  /* =======================================================
     SERVICE WORKER
     ======================================================= */

  function registerServiceWorker() {

    if (
      "serviceWorker" in
      navigator
    ) {

      navigator.serviceWorker
        .register("./sw.js")
        .catch(
          error =>
            console.warn(
              "Service Worker:",
              error
            )
        );
    }
  }


  /* =======================================================
     INICIALIZAÇÃO
     ======================================================= */

  async function init() {

    /*
      Eventos primeiro.
      Assim os elementos do HTML
      já estão preparados.
    */

    bindEvents();


    /*
      Carrega IndexedDB/localStorage.
    */

    await loadState();


    /*
      Configura login/criação
      de conta.
    */

    updateAuthMode();


    /*
      Sempre começamos pela
      autenticação quando o app
      é aberto.
    */

    show("authView");


    /*
      Se não existe conta,
      mostra criação.
    */

    if (!state.credentials) {

      $("#loginForm")
        .classList
        .add("hidden");

      $("#setupForm")
        .classList
        .remove("hidden");

      updateAuthMode();
    }


    /*
      Prepara anos da análise.
    */

    setupAnalysisYears();


    /*
      Service Worker.
    */

    registerServiceWorker();
  }


  /* =======================================================
     START
     ======================================================= */

  init();

})();