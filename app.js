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
     NOVOS HELPERS
     ======================================================= */

  function parseBRL(value) {

    if (typeof value === "number") {

      return Number.isFinite(value)
        ? value
        : NaN;
    }

    const raw =
      String(value ?? "")
        .trim()
        .replace(/\s/g, "");

    if (!raw) {
      return NaN;
    }

    const normalized =
      raw.includes(",")
        ? raw
            .replace(/\./g, "")
            .replace(",", ".")
        : raw;

    const number =
      Number(normalized);

    return Number.isFinite(number)
      ? number
      : NaN;
  }


  function todayKey() {

    const date = new Date();

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }


  function isTransactionEffective(
    transaction
  ) {

    if (!transaction?.date) {
      return true;
    }

    return (
      String(transaction.date) <=
      todayKey()
    );
  }


  function isFutureTransaction(
    transaction
  ) {

    if (!transaction?.date) {
      return false;
    }

    return (
      String(transaction.date) >
      todayKey()
    );
  }


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
      theme: "system",
      pinHash: null,
      lastBackupAt: null,
      privacyDismissed: false
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
        indexedDB.open(
          DB_NAME,
          DB_VERSION
        );

      request.onupgradeneeded = () => {

        const database =
          request.result;

        if (
          !database.objectStoreNames.contains(
            STORE
          )
        ) {

          database.createObjectStore(
            STORE
          );
        }
      };

      request.onsuccess = () =>
        resolve(
          request.result
        );

      request.onerror = () =>
        reject(
          request.error
        );
    });
  }


  function idbGet(key) {

    return new Promise((resolve, reject) => {

      const request =
        db
          .transaction(
            STORE,
            "readonly"
          )
          .objectStore(STORE)
          .get(key);

      request.onsuccess = () =>
        resolve(
          request.result
        );

      request.onerror = () =>
        reject(
          request.error
        );
    });
  }


  function idbSet(key, value) {

    return new Promise((resolve, reject) => {

      const request =
        db
          .transaction(
            STORE,
            "readwrite"
          )
          .objectStore(STORE)
          .put(
            value,
            key
          );

      request.onsuccess = () =>
        resolve();

      request.onerror = () =>
        reject(
          request.error
        );
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
          localStorage.getItem(
            LS_KEY
          ) || "null"
        );

      const candidate =
        fromIDB || fromLS;

      if (
        candidate &&
        candidate.schema === SCHEMA
      ) {

        state =
          normalize(candidate);

      } else {

        state =
          defaultState();
      }

    } catch {

      try {

        const fromLS =
          JSON.parse(
            localStorage.getItem(
              LS_KEY
            ) || "null"
          );

        if (
          fromLS?.schema === SCHEMA
        ) {

          state =
            normalize(fromLS);
        }

      } catch {

        state =
          defaultState();
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
        Array.isArray(
          raw.transactions
        )
          ? raw.transactions.map(
              transaction => ({
                ...transaction,

                scheduled:
                  transaction?.scheduled === true ||
                  (
                    String(
                      transaction?.date || ""
                    ) > todayKey() &&
                    transaction?.recurrence &&
                    transaction.recurrence !== "none"
                  )
              })
            )
          : [],

      goals:
        Array.isArray(
          raw.goals
        )
          ? raw.goals
          : [],

      motivationHistory:
        Array.isArray(
          raw.motivationHistory
        )
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

    clearTimeout(
      saveTimer
    );

    saveTimer =
      setTimeout(
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

  async function hashSecret(
    secret,
    salt
  ) {

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(
          secret
        ),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",

          salt:
            new TextEncoder().encode(
              salt
            ),

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

      const element =
        $("#" + id);

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


  async function setupAccount(
    event
  ) {

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


  async function login(
    event
  ) {

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
      digest !==
      credentials.passwordHash
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

      $("#pinInput").value =
        "";

      setTimeout(
        () =>
          $("#pinInput").focus(),
        50
      );

    } else {

      unlocked = true;

      enterApp();
    }
  }


  async function verifyPin(
    event
  ) {

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

    showPrivacyCard();
  }


  function logout() {

    sessionStorage.removeItem(
      SESSION_KEY
    );

    unlocked = false;

    show("authView");

    updateAuthMode();

    if (
      $("#loginPassword")
    ) {

      $("#loginPassword").value =
        "";
    }
  }


  function lockNow() {

    unlocked = false;

    if (
      state.settings.pinHash
    ) {

      show("pinView");

      $("#pinInput").value =
        "";

      setTimeout(
        () =>
          $("#pinInput").focus(),
        50
      );

    } else {

      logout();
    }
  }


  /* =======================================================
     TEMA
     ======================================================= */

  function getResolvedTheme() {

    const theme =
      state.settings.theme;

    if (
      theme === "light"
    ) {

      return "light";
    }

    if (
      theme === "dark"
    ) {

      return "dark";
    }

    return window.matchMedia &&
      window.matchMedia(
        "(prefers-color-scheme: light)"
      ).matches
      ? "light"
      : "dark";
  }


  function applyTheme() {

    const resolved =
      getResolvedTheme();

    const isLight =
      resolved === "light";

    document.body.classList.toggle(
      "light",
      isLight
    );

    document.documentElement.classList.toggle(
      "light",
      isLight
    );

    const select =
      $("#themeSelect");

    if (select) {

      select.value =
        [
          "system",
          "light",
          "dark"
        ].includes(
          state.settings.theme
        )
          ? state.settings.theme
          : "system";
    }

    const switchElement =
      $("#themeSwitch");

    if (switchElement) {

      switchElement.checked =
        isLight;
    }
  }


  /* =======================================================
     PRIVACIDADE / PRIMEIRO ACESSO
     ======================================================= */

  function showPrivacyCard() {

    if (
      state.settings.privacyDismissed
    ) {
      return;
    }

    if (
      document.querySelector(
        "#privacyFirstAccess"
      )
    ) {
      return;
    }

    const card =
      document.createElement(
        "aside"
      );

    card.id =
      "privacyFirstAccess";

    card.className =
      "privacy-first-access";

    card.innerHTML = `
      <div class="privacy-first-access-inner">

        <img
          src="logo-192.png"
          alt=""
          class="privacy-first-access-logo"
        >

        <div class="privacy-first-access-content">

          <span class="privacy-kicker">
            PRIVACIDADE DO SANTINHO
          </span>

          <h2>
            Seus dados financeiros ficam neste aparelho.
          </h2>

          <p>
            O Santinho Finance funciona localmente.
            Suas transações, metas e configurações são
            armazenadas no navegador deste dispositivo
            usando armazenamento local.
          </p>

          <p>
            O aplicativo não possui banco de dados
            financeiro centralizado nem envia suas
            movimentações para um servidor.
          </p>

          <p>
            Por segurança, mantenha seus backups em um
            local confiável. Se o armazenamento do navegador
            for apagado, os dados locais podem ser perdidos.
          </p>

          <label class="privacy-check">
            <input
              id="privacyDontShow"
              type="checkbox"
            >

            <span>
              Não mostrar novamente
            </span>
          </label>

          <button
            id="privacyContinue"
            class="btn primary"
            type="button"
          >
            Entendi
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(
      card
    );

    requestAnimationFrame(() => {

      card.classList.add(
        "visible"
      );
    });

    $("#privacyContinue")?.addEventListener(
      "click",
      () => {

        const dontShow =
          $("#privacyDontShow")
            ?.checked;

        if (dontShow) {

          state.settings.privacyDismissed =
            true;

          try {

            localStorage.setItem(
              "santinho-privacy-dismissed-v1",
              "1"
            );

          } catch {}

          saveState();
        }

        card.classList.remove(
          "visible"
        );

        setTimeout(
          () => card.remove(),
          220
        );
      }
    );
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

      page =
        "dashboard";
    }

    currentPage =
      page;

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
          button.dataset.nav ===
          page;

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


    if (
      page === "dashboard"
    ) {

      renderDashboard();
    }

    if (
      page === "analysis"
    ) {

      renderAnalysis();
    }

    if (
      page === "transactions"
    ) {

      renderTransactions();
    }

    if (
      page === "goals"
    ) {

      renderGoals();
    }

    if (
      page === "profile"
    ) {

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
        phrase =>
          phrase !== last
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

  function transactionAmount(
    transaction
  ) {

    const amount =
      parseBRL(
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
        isTransactionEffective(
          transaction
        ) &&
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
        income -
        expense
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


    if (
      $("#balanceValue")
    ) {

      $("#balanceValue")
        .textContent =
        balanceVisible
          ? money(
              totals.balance
            )
          : "••••••";
    }


    if (
      $("#incomeMonth")
    ) {

      $("#incomeMonth")
        .textContent =
        balanceVisible
          ? money(
              totals.income
            )
          : "••••";
    }


    if (
      $("#expenseMonth")
    ) {

      $("#expenseMonth")
        .textContent =
        balanceVisible
          ? money(
              totals.expense
            )
          : "••••";
    }


    if (
      $("#dashboardAvatar")
    ) {

      $("#dashboardAvatar").src =
        state.profile.avatar ||
        "logo-192.png";
    }


    renderCategories();


    const recent =
      [...state.transactions]
        .filter(
          transaction =>
            isTransactionEffective(
              transaction
            )
        )
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

                <div class="category-row-head">

                  <span>
                    ${escapeHTML(category)}
                  </span>

                  <strong>
                    ${money(value)}
                  </strong>

                </div>

                <div class="progress-track">

                  <div
                    class="progress-fill"
                    style="width:${percentage}%"
                  ></div>

                </div>

                <small>
                  ${percentage}% dos gastos
                </small>

              </div>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     LISTA DE TRANSAÇÕES
     ======================================================= */

  function formatDate(
    value
  ) {

    if (!value) {
      return "";
    }

    const date =
      parseDate(value);

    return date.toLocaleDateString(
      "pt-BR"
    );
  }


  function transactionClass(
    transaction
  ) {

    if (
      isFutureTransaction(
        transaction
      )
    ) {

      return "scheduled";
    }

    return transaction.type ===
      "income"
      ? "income"
      : "expense";
  }


  function renderTransactionList(
    root,
    transactions
  ) {

    if (!root) return;

    if (!transactions.length) {

      root.innerHTML = `
        <div class="empty-state compact">
          <p>
            Nenhuma transação encontrada.
          </p>
        </div>
      `;

      return;
    }

    root.innerHTML =
      transactions
        .map(
          transaction => {

            const isScheduled =
              isFutureTransaction(
                transaction
              );

            const sign =
              transaction.type ===
              "expense"
                ? "-"
                : "+";

            const amountClass =
              transaction.type ===
              "expense"
                ? "negative"
                : "positive";

            const statusLabel =
              isScheduled
                ? "Programado"
                : transaction.type ===
                  "expense"
                    ? "Gasto"
                    : "Renda";

            return `
              <article
                class="transaction-row ${transactionClass(transaction)}"
              >

                <div class="transaction-icon">

                  ${
                    transaction.type ===
                    "expense"
                      ? "↘"
                      : "↗"
                  }

                </div>

                <div class="transaction-main">

                  <strong>
                    ${escapeHTML(
                      transaction.description ||
                      "Transação"
                    )}
                  </strong>

                  <small>
                    ${escapeHTML(
                      transaction.category ||
                      "Outros"
                    )}
                    ·
                    ${formatDate(
                      transaction.date
                    )}

                    ${
                      isScheduled
                        ? " · Programado"
                        : ""
                    }
                  </small>

                </div>

                <div class="transaction-value">

                  <strong
                    class="${amountClass}"
                  >
                    ${sign}
                    ${money(
                      transactionAmount(
                        transaction
                      )
                    )}
                  </strong>

                  <small>
                    ${statusLabel}
                  </small>

                </div>

              </article>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     ANÁLISE
     ======================================================= */

  function renderAnalysis() {

    const year =
      currentYear();

    const months =
      monthNames();

    const monthData =
      months.map(
        (_, index) => {

          const key =
            `${year}-${String(
              index + 1
            ).padStart(2, "0")}`;

          const transactions =
            state.transactions.filter(
              transaction =>
                String(
                  transaction.date || ""
                ).startsWith(key) &&
                isTransactionEffective(
                  transaction
                )
            );

          const totals =
            totalsForTransactions(
              transactions
            );

          return {
            month:
              months[index],

            income:
              totals.income,

            expense:
              totals.expense,

            balance:
              totals.balance
          };
        }
      );


    renderAnalysisChart(
      monthData
    );

    renderAnalysisSummary(
      monthData
    );
  }


  function renderAnalysisChart(
    data
  ) {

    const root =
      $("#analysisChart");

    if (!root) return;

    const max =
      Math.max(
        1,
        ...data.flatMap(
          item => [
            item.income,
            item.expense
          ]
        )
      );

    root.innerHTML =
      data
        .map(
          item => {

            const incomeHeight =
              Math.max(
                2,
                (item.income / max) *
                  100
              );

            const expenseHeight =
              Math.max(
                2,
                (item.expense / max) *
                  100
              );

            return `
              <div class="chart-column">

                <div class="chart-bars">

                  <span
                    class="chart-bar income"
                    style="height:${incomeHeight}%"
                    title="Renda: ${money(item.income)}"
                  ></span>

                  <span
                    class="chart-bar expense"
                    style="height:${expenseHeight}%"
                    title="Gastos: ${money(item.expense)}"
                  ></span>

                </div>

                <small>
                  ${item.month}
                </small>

              </div>
            `;
          }
        )
        .join("");
  }


  function renderAnalysisSummary(
    data
  ) {

    const root =
      $("#analysisSummary");

    if (!root) return;

    const income =
      data.reduce(
        (sum, item) =>
          sum + item.income,
        0
      );

    const expense =
      data.reduce(
        (sum, item) =>
          sum + item.expense,
        0
      );

    const balance =
      income -
      expense;

    root.innerHTML = `
      <div class="analysis-summary-grid">

        <div class="analysis-card">
          <span>
            Renda no ano
          </span>

          <strong>
            ${money(income)}
          </strong>
        </div>

        <div class="analysis-card">
          <span>
            Gastos no ano
          </span>

          <strong>
            ${money(expense)}
          </strong>
        </div>

        <div class="analysis-card">
          <span>
            Resultado
          </span>

          <strong>
            ${money(balance)}
          </strong>
        </div>

      </div>
    `;
  }


  /* =======================================================
     TRANSAÇÕES — MODAL
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
        aria-label="${escapeHTML(title)}"
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
              type="button"
              class="btn secondary modal-cancel"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="btn primary"
            >
              Salvar
            </button>

          </div>

        </form>

      </div>
    `;

    root.classList.add(
      "open"
    );

    const close = () => {

      root.classList.remove(
        "open"
      );

      setTimeout(
        () => {
          root.innerHTML = "";
        },
        180
      );
    };

    $(".modal-close")
      ?.addEventListener(
        "click",
        close
      );

    $(".modal-cancel")
      ?.addEventListener(
        "click",
        close
      );

    root
      .querySelector(".modal")
      ?.addEventListener(
        "click",
        event => {

          if (
            event.target.classList.contains(
              "modal"
            )
          ) {

            close();
          }
        }
      );

    $("#modalForm")
      ?.addEventListener(
        "submit",
        async event => {

          const result =
            await onSubmit(
              event
            );

          if (
            result !== false
          ) {

            close();
          }
        }
      );

    setTimeout(
      () => {

        root
          .querySelector(
            "input,select,textarea"
          )
          ?.focus();

      },
      50
    );
  }


  function transactionModal(
    transaction = null
  ) {

    const editing =
      !!transaction;

    const today =
      todayKey();

    const type =
      transaction?.type ||
      "expense";

    const categories = [
      "Alimentação",
      "Casa",
      "Transporte",
      "Saúde",
      "Educação",
      "Lazer",
      "Assinaturas",
      "Academia",
      "Compras",
      "Contas",
      "Outros"
    ];

    const categoryOptions =
      categories
        .map(
          category =>
            `
              <option
                value="${escapeHTML(category)}"
                ${
                  transaction?.category ===
                  category
                    ? "selected"
                    : ""
                }
              >
                ${escapeHTML(category)}
              </option>
            `
        )
        .join("");

    const body = `
      <label>
        Tipo

        <select
          name="type"
          id="transactionTypeInput"
          required
        >

          <option
            value="expense"
            ${
              type === "expense"
                ? "selected"
                : ""
            }
          >
            Gasto
          </option>

          <option
            value="income"
            ${
              type === "income"
                ? "selected"
                : ""
            }
          >
            Renda
          </option>

        </select>
      </label>

      <label>
        Descrição

        <input
          name="description"
          type="text"
          value="${escapeHTML(
            transaction?.description || ""
          )}"
          placeholder="Ex.: Mercado"
          required
        >
      </label>

      <label>
        Valor

        <input
          name="amount"
          type="text"
          inputmode="decimal"
          value="${
            transaction
              ? String(
                  transactionAmount(
                    transaction
                  )
                ).replace(".", ",")
              : ""
          }"
          placeholder="0,00"
          required
        >
      </label>

      <label>
        Categoria

        <select
          name="category"
          required
        >

          ${categoryOptions}

        </select>
      </label>

      <label>
        Data

        <input
          name="date"
          type="date"
          value="${escapeHTML(
            transaction?.date ||
            today
          )}"
          required
        >
      </label>

      <label>
        Repetição

        <select
          name="recurrence"
          id="recurrence"
        >

          <option
            value="none"
            ${
              !transaction?.recurrence ||
              transaction.recurrence ===
                "none"
                ? "selected"
                : ""
            }
          >
            Não repetir
          </option>

          <option
            value="daily"
            ${
              transaction?.recurrence ===
              "daily"
                ? "selected"
                : ""
            }
          >
            Diariamente
          </option>

          <option
            value="weekly"
            ${
              transaction?.recurrence ===
              "weekly"
                ? "selected"
                : ""
            }
          >
            Semanalmente
          </option>

          <option
            value="biweekly"
            ${
              transaction?.recurrence ===
              "biweekly"
                ? "selected"
                : ""
            }
          >
            A cada 2 semanas
          </option>

          <option
            value="monthly"
            ${
              transaction?.recurrence ===
              "monthly"
                ? "selected"
                : ""
            }
          >
            Mensalmente
          </option>

        </select>
      </label>

      <label
        id="recurrenceEndWrap"
        class="${
          transaction?.recurrence &&
          transaction.recurrence !==
            "none"
            ? ""
            : "hidden"
        }"
      >

        Repetir até

        <input
          name="recurrenceEnd"
          id="recurrenceEnd"
          type="date"
          min="${escapeHTML(
            transaction?.date ||
            today
          )}"
          value="${escapeHTML(
            transaction?.recurrenceEnd ||
            ""
          )}"
        >

        <small class="muted">
          A última ocorrência será criada nessa data.
        </small>

      </label>
    `;

    openModal(
      editing
        ? "Editar transação"
        : "Nova transação",

      body,

      async event => {

        event.preventDefault();

        const form =
          event.currentTarget;

        const data =
          new FormData(form);

        const amount =
          parseBRL(
            data.get("amount")
          );

        const date =
          String(
            data.get("date") || ""
          );

        const recurrence =
          String(
            data.get("recurrence") ||
            "none"
          );

        const recurrenceEnd =
          String(
            data.get(
              "recurrenceEnd"
            ) || ""
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {

          toast(
            "Informe um valor válido.",
            "error"
          );

          return false;
        }

        if (!date) {

          toast(
            "Informe uma data.",
            "error"
          );

          return false;
        }

        if (
          recurrence !==
            "none" &&
          recurrenceEnd &&
          recurrenceEnd < date
        ) {

          toast(
            "A data final da repetição precisa ser posterior à data inicial.",
            "error"
          );

          return false;
        }

        const base = {

          id:
            transaction?.id ||
            uid("tx"),

          type:
            data.get("type"),

          description:
            String(
              data.get(
                "description"
              ) || ""
            ).trim(),

          amount,

          category:
            String(
              data.get(
                "category"
              ) || "Outros"
            ),

          date,

          recurrence,

          recurrenceEnd,

          scheduled:
            date > today,

          createdAt:
            transaction?.createdAt ||
            new Date().toISOString()
        };


        if (editing) {

          const index =
            state.transactions.findIndex(
              item =>
                item.id ===
                transaction.id
            );

          if (
            index !== -1
          ) {

            state.transactions[
              index
            ] = base;
          }

        } else {

          const generated =
            buildRecurringTransactions(
              base
            );

          state.transactions.push(
            ...generated
          );
        }

        saveState();

        renderAll();

        toast(
          editing
            ? "Transação atualizada."
            : "Transação adicionada.",
          "success"
        );

        return true;
      }
    );


    $("#recurrence")
      ?.addEventListener(
        "change",
        event => {

          $("#recurrenceEndWrap")
            ?.classList.toggle(
              "hidden",
              event.target.value ===
                "none"
            );
        }
      );
  }


  /* =======================================================
     RECORRÊNCIA
     ======================================================= */

  function addDays(
    date,
    days
  ) {

    const result =
      new Date(date);

    result.setDate(
      result.getDate() +
      days
    );

    return result;
  }


  function addMonths(
    date,
    months
  ) {

    const result =
      new Date(date);

    const originalDay =
      result.getDate();

    result.setMonth(
      result.getMonth() +
      months
    );

    if (
      result.getDate() !==
      originalDay
    ) {

      result.setDate(0);
    }

    return result;
  }


  function dateToKey(
    date
  ) {

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }


  function buildRecurringTransactions(
    base
  ) {

    const transactions = [];

    const recurrence =
      base.recurrence;

    if (
      !recurrence ||
      recurrence ===
        "none"
    ) {

      return [
        {
          ...base,
          scheduled:
            base.date >
            todayKey()
        }
      ];
    }

    const start =
      parseDate(
        base.date
      );

    const end =
      base.recurrenceEnd
        ? parseDate(
            base.recurrenceEnd
          )
        : addMonths(
            start,
            12
          );

    let current =
      new Date(start);

    let guard =
      0;

    while (
      current <= end &&
      guard < 500
    ) {

      transactions.push({

        ...base,

        id:
          guard === 0
            ? base.id
            : uid("tx"),

        date:
          dateToKey(
            current
          ),

        scheduled:
          dateToKey(
            current
          ) >
          todayKey(),

        recurrence:
          guard === 0
            ? recurrence
            : "generated",

        recurrenceEnd:
          base.recurrenceEnd
      });

      if (
        recurrence ===
        "daily"
      ) {

        current =
          addDays(
            current,
            1
          );

      } else if (
        recurrence ===
        "weekly"
      ) {

        current =
          addDays(
            current,
            7
          );

      } else if (
        recurrence ===
        "biweekly"
      ) {

        current =
          addDays(
            current,
            14
          );

      } else if (
        recurrence ===
        "monthly"
      ) {

        current =
          addMonths(
            current,
            1
          );

      } else {

        break;
      }

      guard++;
    }

    return transactions;
  }


  /* =======================================================
     TRANSAÇÕES — FILTROS
     ======================================================= */

  function getTransactionFilter() {

    const search =
      String(
        $("#transactionSearch")
          ?.value || ""
      )
        .trim()
        .toLowerCase();

    const type =
      String(
        $("#transactionType")
          ?.value || "all"
      );

    const status =
      String(
        $("#transactionStatus")
          ?.value || "all"
      );

    return {
      search,
      type,
      status
    };
  }


  function filterTransactions() {

    const {
      search,
      type,
      status
    } =
      getTransactionFilter();

    return [
      ...state.transactions
    ]
      .filter(
        transaction => {

          if (
            type !==
              "all" &&
            transaction.type !==
              type
          ) {

            return false;
          }

          const future =
            isFutureTransaction(
              transaction
            );

          if (
            status ===
              "past" &&
            future
          ) {

            return false;
          }

          if (
            status ===
              "scheduled" &&
            !future
          ) {

            return false;
          }

          if (
            search
          ) {

            const text =
              [
                transaction.description,
                transaction.category,
                transaction.type
              ]
                .join(" ")
                .toLowerCase();

            if (
              !text.includes(
                search
              )
            ) {

              return false;
            }
          }

          return true;
        }
      )
      .sort(
        (a, b) =>
          String(
            b.date || ""
          ).localeCompare(
            String(
              a.date || ""
            )
          )
      );
  }


  function renderTransactions() {

    const root =
      $("#transactionsList");

    if (!root) return;

    const transactions =
      filterTransactions();

    renderTransactionList(
      root,
      transactions
    );

    const count =
      $("#transactionCount");

    if (count) {

      count.textContent =
        `${transactions.length} ${
          transactions.length === 1
            ? "transação"
            : "transações"
        }`;
    }
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
            Nenhuma meta criada
          </h3>

          <p>
            Crie uma meta para acompanhar
            seu progresso.
          </p>

        </div>
      `;

      return;
    }

    root.innerHTML =
      state.goals
        .map(
          goal => {

            const current =
              Number(
                goal.current
              ) || 0;

            const target =
              Number(
                goal.target
              ) || 0;

            const percentage =
              target > 0
                ? clamp(
                    (current /
                      target) *
                      100,
                    0,
                    100
                  )
                : 0;

            return `
              <article
                class="goal-card"
              >

                <div class="goal-head">

                  <div>

                    <strong>
                      ${escapeHTML(
                        goal.name ||
                        "Meta"
                      )}
                    </strong>

                    ${
                      goal.deadline
                        ? `
                          <small>
                            Até ${formatDate(
                              goal.deadline
                            )}
                          </small>
                        `
                        : ""
                    }

                  </div>

                  <button
                    class="icon-btn"
                    type="button"
                    data-delete-goal="${escapeHTML(
                      goal.id
                    )}"
                    aria-label="Excluir meta"
                  >
                    ×
                  </button>

                </div>

                <div class="goal-values">

                  <strong>
                    ${money(current)}
                  </strong>

                  <span>
                    de ${money(target)}
                  </span>

                </div>

                <div class="progress-track">

                  <div
                    class="progress-fill"
                    style="width:${percentage}%"
                  ></div>

                </div>

                <div class="goal-footer">

                  <span>
                    ${Math.round(
                      percentage
                    )}%
                  </span>

                  <button
                    class="btn small"
                    type="button"
                    data-add-goal="${escapeHTML(
                      goal.id
                    )}"
                  >
                    Adicionar
                  </button>

                </div>

              </article>
            `;
          }
        )
        .join("");
  }


  function goalModal() {

    const body = `

      <label>
        Nome da meta

        <input
          name="name"
          type="text"
          placeholder="Ex.: Viagem"
          required
        >
      </label>

      <label>
        Valor desejado

        <input
          name="target"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
          required
        >
      </label>

      <label>
        Valor já guardado

        <input
          name="current"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
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
    `;

    openModal(
      "Nova meta",
      body,
      event => {

        event.preventDefault();

        const data =
          new FormData(
            event.currentTarget
          );

        const target =
          parseBRL(
            data.get("target")
          );

        const current =
          parseBRL(
            data.get("current")
          ) || 0;

        if (
          !Number.isFinite(
            target
          ) ||
          target <= 0
        ) {

          toast(
            "Informe um valor de meta válido.",
            "error"
          );

          return false;
        }

        state.goals.push({

          id:
            uid("goal"),

          name:
            String(
              data.get("name") ||
              ""
            ).trim(),

          target,

          current:
            Math.max(
              0,
              current
            ),

          deadline:
            String(
              data.get(
                "deadline"
              ) || ""
            )
        });

        saveState();

        renderGoals();

        toast(
          "Meta criada.",
          "success"
        );

        return true;
      }
    );
  }


  function addToGoal(
    goalId
  ) {

    const goal =
      state.goals.find(
        item =>
          item.id ===
          goalId
      );

    if (!goal) return;

    const body = `

      <label>
        Valor para adicionar

        <input
          name="amount"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
          required
        >
      </label>
    `;

    openModal(
      "Adicionar à meta",
      body,
      event => {

        event.preventDefault();

        const data =
          new FormData(
            event.currentTarget
          );

        const amount =
          parseBRL(
            data.get(
              "amount"
            )
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {

          toast(
            "Informe um valor válido.",
            "error"
          );

          return false;
        }

        goal.current =
          Math.min(
            Number(
              goal.target
            ) || Infinity,
            (Number(
              goal.current
            ) || 0) +
              amount
          );

        saveState();

        renderGoals();

        toast(
          "Valor adicionado à meta.",
          "success"
        );

        return true;
      }
    );
  }


  /* =======================================================
     PERFIL
     ======================================================= */

  function renderProfile() {

    const username =
      $("#profileUsername");

    if (username) {

      username.value =
        state.profile.username ||
        "";
    }

    const email =
      $("#profileEmail");

    if (email) {

      email.value =
        state.profile.email ||
        "";
    }

    const avatar =
      $("#profileAvatar");

    if (avatar) {

      avatar.src =
        state.profile.avatar ||
        "logo-192.png";
    }

    const theme =
      $("#themeSelect");

    if (theme) {

      theme.value =
        state.settings.theme;
    }

    renderBackupStatus();
  }


  function saveProfile() {

    const username =
      $("#profileUsername")
        ?.value
        .trim();

    const email =
      $("#profileEmail")
        ?.value
        .trim();

    if (username !== undefined) {

      state.profile.username =
        username;
    }

    if (email !== undefined) {

      state.profile.email =
        email;
    }

    saveState();

    renderDashboard();

    toast(
      "Perfil atualizado.",
      "success"
    );
  }


  function handleAvatar(
    event
  ) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {

      toast(
        "Escolha uma imagem válida.",
        "error"
      );

      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {

        state.profile.avatar =
          reader.result;

        saveState();

        renderProfile();

        renderDashboard();

        toast(
          "Foto atualizada.",
          "success"
        );
      };

    reader.readAsDataURL(
      file
    );
  }


  /* =======================================================
     PIN
     ======================================================= */

  function pinModal() {

    const hasPin =
      !!state.settings.pinHash;

    const body = `

      <p class="muted">
        ${
          hasPin
            ? "Defina um novo PIN ou remova o PIN atual."
            : "Crie um PIN de 4 a 6 números para proteger a abertura do aplicativo."
        }
      </p>

      ${
        hasPin
          ? `
            <button
              type="button"
              class="btn danger"
              id="removePinButton"
            >
              Remover PIN
            </button>
          `
          : ""
      }

      <label>
        ${
          hasPin
            ? "Novo PIN"
            : "PIN"
        }

        <input
          name="pin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          pattern="[0-9]{4,6}"
          placeholder="••••"
          required
        >
      </label>

      <label>
        Confirmar PIN

        <input
          name="pin2"
          type="password"
          inputmode="numeric"
          maxlength="6"
          pattern="[0-9]{4,6}"
          placeholder="••••"
          required
        >
      </label>
    `;

    openModal(
      hasPin
        ? "Alterar PIN"
        : "Criar PIN",
      body,
      async event => {

        event.preventDefault();

        const data =
          new FormData(
            event.currentTarget
          );

        const pin =
          String(
            data.get("pin") ||
            ""
          ).trim();

        const pin2 =
          String(
            data.get("pin2") ||
            ""
          ).trim();

        if (
          !/^\d{4,6}$/.test(pin)
        ) {

          toast(
            "O PIN precisa ter de 4 a 6 números.",
            "error"
          );

          return false;
        }

        if (
          pin !== pin2
        ) {

          toast(
            "Os PINs não conferem.",
            "error"
          );

          return false;
        }

        const salt =
          crypto.randomUUID();

        const hash =
          await hashSecret(
            pin,
            salt
          );

        state.settings.pinHash = {

          salt,

          hash
        };

        saveState();

        toast(
          "PIN configurado.",
          "success"
        );

        return true;
      }
    );


    $("#removePinButton")
      ?.addEventListener(
        "click",
        () => {

          state.settings.pinHash =
            null;

          saveState();

          $("#modalRoot")
            ?.classList
            .remove("open");

          setTimeout(
            () => {

              if (
                $("#modalRoot")
              ) {

                $("#modalRoot")
                  .innerHTML = "";
              }

            },
            180
          );

          toast(
            "PIN removido.",
            "success"
          );
        }
      );
  }


  /* =======================================================
     BACKUP
     ======================================================= */

  function buildBackup() {

    return JSON.stringify(
      {
        app:
          "Santinho Finance",

        version:
          1,

        exportedAt:
          new Date().toISOString(),

        data:
          state
      },
      null,
      2
    );
  }


  async function backupNow() {

    const json =
      buildBackup();

    const filename =
      `santinho-finance-backup-${todayKey()}.json`;

    try {

      if (
        navigator.share &&
        navigator.canShare
      ) {

        const file =
          new File(
            [json],
            filename,
            {
              type:
                "application/json"
            }
          );

        if (
          navigator.canShare({
            files: [file]
          })
        ) {

          await navigator.share({
            title:
              "Backup Santinho Finance",

            text:
              "Backup dos dados locais do Santinho Finance.",

            files: [file]
          });

          state.settings.lastBackupAt =
            new Date().toISOString();

          saveState();

          renderBackupStatus();

          toast(
            "Backup compartilhado.",
            "success"
          );

          return;
        }
      }

    } catch (error) {

      if (
        error?.name ===
        "AbortError"
      ) {

        return;
      }
    }


    const blob =
      new Blob(
        [json],
        {
          type:
            "application/json"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      filename;

    document.body.appendChild(
      anchor
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url
    );

    state.settings.lastBackupAt =
      new Date().toISOString();

    saveState();

    renderBackupStatus();

    toast(
      "Backup baixado.",
      "success"
    );
  }


  function renderBackupStatus() {

    const element =
      $("#lastBackupStatus");

    if (!element) return;

    const last =
      state.settings.lastBackupAt;

    element.textContent =
      last
        ? `Último backup: ${new Date(
            last
          ).toLocaleString("pt-BR")}`
        : "Nenhum backup realizado ainda.";
  }


  function restoreData(
    event
  ) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload =
      () => {

        try {

          const parsed =
            JSON.parse(
              reader.result
            );

          const restored =
            parsed?.data;

          if (
            !restored ||
            restored.schema !==
              SCHEMA
          ) {

            throw new Error(
              "Backup inválido."
            );
          }

          state =
            normalize(
              restored
            );

          saveState();

          renderAll();

          updateAuthMode();

          toast(
            "Backup restaurado.",
            "success"
          );

        } catch (error) {

          console.error(
            error
          );

          toast(
            "Não foi possível restaurar esse backup.",
            "error"
          );
        }

        event.target.value =
          "";
      };

    reader.readAsText(
      file
    );
  }


  /* =======================================================
     TOAST
     ======================================================= */

  function toast(
    message,
    type = "info"
  ) {

    const element =
      $("#toast");

    if (!element) return;

    element.textContent =
      message;

    element.className =
      `toast ${type}`;

    element.classList.add(
      "show"
    );

    clearTimeout(
      element._timer
    );

    element._timer =
      setTimeout(
        () => {

          element.classList.remove(
            "show"
          );

        },
        3000
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

    renderBackupStatus();
  }


  /* =======================================================
     EVENTOS
     ======================================================= */

  function bindEvents() {

    $("#setupForm")
      ?.addEventListener(
        "submit",
        setupAccount
      );

    $("#loginForm")
      ?.addEventListener(
        "submit",
        login
      );

    $("#pinForm")
      ?.addEventListener(
        "submit",
        verifyPin
      );


    $("#toggleSetup")
      ?.addEventListener(
        "click",
        () => {

          const loginForm =
            $("#loginForm");

          const setupForm =
            $("#setupForm");

          if (
            !loginForm ||
            !setupForm
          ) {
            return;
          }

          const loginHidden =
            loginForm.classList.contains(
              "hidden"
            );

          loginForm.classList.toggle(
            "hidden",
            !loginHidden
          );

          setupForm.classList.toggle(
            "hidden",
            loginHidden
          );
        }
      );


    $$(".nav-btn")
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              navigate(
                button.dataset.nav
              );

            }
          );

        }
      );


    $("#addIncome")
      ?.addEventListener(
        "click",
        () =>
          transactionModal({
            type: "income"
          })
      );


    $("#addExpense")
      ?.addEventListener(
        "click",
        () =>
          transactionModal({
            type: "expense"
          })
      );


    $("#newTransaction")
      ?.addEventListener(
        "click",
        () =>
          transactionModal()
      );


    $("#newGoal")
      ?.addEventListener(
        "click",
        goalModal
      );


    $("#profileSave")
      ?.addEventListener(
        "click",
        saveProfile
      );


    $("#avatarInput")
      ?.addEventListener(
        "change",
        handleAvatar
      );


    $("#pinSettings")
      ?.addEventListener(
        "click",
        pinModal
      );


    $("#lockApp")
      ?.addEventListener(
        "click",
        lockNow
      );


    $("#logout")
      ?.addEventListener(
        "click",
        logout
      );


    $("#backupNow")
      ?.addEventListener(
        "click",
        backupNow
      );


    $("#restoreInput")
      ?.addEventListener(
        "change",
        restoreData
      );


    $("#balanceToggle")
      ?.addEventListener(
        "click",
        () => {

          balanceVisible =
            !balanceVisible;

          renderDashboard();
        }
      );


    $("#motivationRefresh")
      ?.addEventListener(
        "click",
        chooseMotivation
      );


    $("#themeSelect")
      ?.addEventListener(
        "change",
        event => {

          state.settings.theme =
            event.target.value;

          applyTheme();

          saveState();
        }
      );


    $("#themeSwitch")
      ?.addEventListener(
        "change",
        event => {

          state.settings.theme =
            event.target.checked
              ? "light"
              : "dark";

          applyTheme();

          saveState();
        }
      );


    [
      "#transactionSearch",
      "#transactionType",
      "#transactionStatus"
    ]
      .forEach(
        selector => {

          $(selector)
            ?.addEventListener(
              "input",
              renderTransactions
            );

          $(selector)
            ?.addEventListener(
              "change",
              renderTransactions
            );
        }
      );


    $("#transactionsList")
      ?.addEventListener(
        "click",
        event => {

          const edit =
            event.target.closest(
              "[data-edit-transaction]"
            );

          if (edit) {

            const id =
              edit.dataset
                .editTransaction;

            const transaction =
              state.transactions.find(
                item =>
                  item.id ===
                  id
              );

            if (transaction) {

              transactionModal(
                transaction
              );
            }

            return;
          }


          const remove =
            event.target.closest(
              "[data-delete-transaction]"
            );

          if (remove) {

            const id =
              remove.dataset
                .deleteTransaction;

            const index =
              state.transactions.findIndex(
                item =>
                  item.id ===
                  id
              );

            if (
              index !== -1
            ) {

              state.transactions.splice(
                index,
                1
              );

              saveState();

              renderAll();

              toast(
                "Transação excluída.",
                "success"
              );
            }
          }
        }
      );


    $("#goalsList")
      ?.addEventListener(
        "click",
        event => {

          const add =
            event.target.closest(
              "[data-add-goal]"
            );

          if (add) {

            addToGoal(
              add.dataset.addGoal
            );

            return;
          }


          const remove =
            event.target.closest(
              "[data-delete-goal]"
            );

          if (remove) {

            const id =
              remove.dataset.deleteGoal;

            state.goals =
              state.goals.filter(
                goal =>
                  goal.id !==
                  id
              );

            saveState();

            renderGoals();

            toast(
              "Meta excluída.",
              "success"
            );
          }
        }
      );
  }


  /* =======================================================
     SERVICE WORKER
     ======================================================= */

  function registerServiceWorker() {

    if (
      "serviceWorker" in navigator
    ) {

      window.addEventListener(
        "load",
        () => {

          navigator.serviceWorker
            .register(
              "./sw.js"
            )
            .catch(
              error =>
                console.warn(
                  "Service Worker registration failed:",
                  error
                )
            );

        }
      );
    }
  }


  /* =======================================================
     INICIALIZAÇÃO
     ======================================================= */

  async function init() {

    await loadState();

    try {

      const dismissed =
        localStorage.getItem(
          "santinho-privacy-dismissed-v1"
        );

      if (
        dismissed === "1"
      ) {

        state.settings.privacyDismissed =
          true;
      }

    } catch {}


    bindEvents();

    updateAuthMode();

    registerServiceWorker();


    const hasSession =
      sessionStorage.getItem(
        SESSION_KEY
      ) === "1";

    if (
      hasSession &&
      state.credentials
    ) {

      if (
        state.settings.pinHash
      ) {

        show("pinView");

      } else {

        unlocked = true;

        enterApp();
      }

    } else {

      show("authView");
    }
  }


  init();

})();
/* =======================================================
   PT 2/3
   CONTINUAÇÃO DO APP.JS
   ======================================================= */


/* =======================================================
   CÁLCULO FINANCEIRO ACUMULATIVO
   ======================================================= */

function getEffectiveTransactions() {

  return state.transactions.filter(
    transaction =>
      isTransactionEffective(
        transaction
      )
  );
}


function getFutureTransactions() {

  return state.transactions.filter(
    transaction =>
      isFutureTransaction(
        transaction
      )
  );
}


function getFinancialTotals() {

  const effective =
    getEffectiveTransactions();

  const future =
    getFutureTransactions();


  const realizedIncome =
    effective
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


  const realizedExpense =
    effective
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


  const futureIncome =
    future
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


  const futureExpense =
    future
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


  /*
   * SALDO REAL:
   *
   * Tudo que já aconteceu até hoje.
   *
   * Uma renda de junho continua compondo
   * o saldo em julho, agosto, setembro etc.
   */
  const currentBalance =
    realizedIncome -
    realizedExpense;


  /*
   * SALDO PLANEJADO:
   *
   * O usuário quer saber quanto realmente
   * ficará livre considerando também os
   * gastos futuros já programados.
   *
   * Renda futura NÃO entra aqui.
   */
  const plannedAvailable =
    currentBalance -
    futureExpense;


  return {

    realizedIncome,

    realizedExpense,

    futureIncome,

    futureExpense,

    currentBalance,

    plannedAvailable,

    totalProjectedExpenses:
      realizedExpense +
      futureExpense,

    totalProjectedIncome:
      realizedIncome +
      futureIncome,

    projectedBalanceIncludingFutureIncome:
      (
        realizedIncome +
        futureIncome
      ) -
      (
        realizedExpense +
        futureExpense
      )
  };
}


/* =======================================================
   SALDO ACUMULADO ATÉ UMA DATA
   ======================================================= */

function getBalanceUntilDate(
  dateKey
) {

  const transactions =
    state.transactions.filter(
      transaction =>
        String(
          transaction.date || ""
        ) <=
        String(dateKey)
    );


  return transactions.reduce(
    (balance, transaction) => {

      const amount =
        transactionAmount(
          transaction
        );

      if (
        transaction.type ===
        "income"
      ) {

        return balance + amount;
      }

      return balance - amount;

    },
    0
  );
}


/* =======================================================
   TOTAL ACUMULADO DE RENDA
   ======================================================= */

function getIncomeUntilDate(
  dateKey
) {

  return state.transactions
    .filter(
      transaction =>
        transaction.type ===
          "income" &&
        String(
          transaction.date || ""
        ) <=
          String(dateKey)
    )
    .reduce(
      (sum, transaction) =>
        sum +
        transactionAmount(
          transaction
        ),
      0
    );
}


/* =======================================================
   TOTAL ACUMULADO DE GASTOS
   ======================================================= */

function getExpenseUntilDate(
  dateKey
) {

  return state.transactions
    .filter(
      transaction =>
        transaction.type ===
          "expense" &&
        String(
          transaction.date || ""
        ) <=
          String(dateKey)
    )
    .reduce(
      (sum, transaction) =>
        sum +
        transactionAmount(
          transaction
        ),
      0
    );
}


/* =======================================================
   DESPESAS PROGRAMADAS
   ======================================================= */

function getScheduledExpenses() {

  return state.transactions.filter(
    transaction =>
      transaction.type ===
        "expense" &&
      isFutureTransaction(
        transaction
      )
  );
}


/* =======================================================
   DATA LOCAL — CORREÇÃO DO BUG DO iPHONE
   ======================================================= */

function parseLocalDateKey(
  value
) {

  if (!value) {

    return new Date();
  }

  const parts =
    String(value)
      .split("-")
      .map(Number);

  if (
    parts.length !== 3 ||
    parts.some(
      number =>
        !Number.isFinite(number)
    )
  ) {

    return new Date();
  }

  const [
    year,
    month,
    day
  ] = parts;

  return new Date(
    year,
    month - 1,
    day
  );
}


function dateKeyFromDate(
  date
) {

  if (!(date instanceof Date)) {

    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatDateBR(
  value
) {

  if (!value) {

    return "";
  }

  const date =
    parseLocalDateKey(
      value
    );

  return date.toLocaleDateString(
    "pt-BR"
  );
}


/* =======================================================
   SUBSTITUIÇÃO DO PARSE DATE
   ======================================================= */

function parseDateSafe(
  value
) {

  if (!value) {

    return new Date();
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(value)
    )
  ) {

    return parseLocalDateKey(
      value
    );
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? new Date()
    : date;
}


/* =======================================================
   MÊS SEM ERRO DE TIMEZONE
   ======================================================= */

function monthKeySafe(
  value
) {

  const date =
    typeof value ===
      "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
      ? parseLocalDateKey(
          value
        )
      : parseDateSafe(
          value
        );

  return (
    date.getFullYear() +
    "-" +
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  );
}


/* =======================================================
   TRANSAÇÕES DO MÊS — REALIZADAS
   ======================================================= */

function getMonthEffectiveTransactions(
  year,
  month
) {

  const key =
    `${year}-${String(
      month
    ).padStart(2, "0")}`;

  return state.transactions.filter(
    transaction =>
      String(
        transaction.date || ""
      ).startsWith(key) &&
      isTransactionEffective(
        transaction
      )
  );
}


/* =======================================================
   TRANSAÇÕES DO MÊS — TODAS
   ======================================================= */

function getMonthAllTransactions(
  year,
  month
) {

  const key =
    `${year}-${String(
      month
    ).padStart(2, "0")}`;

  return state.transactions.filter(
    transaction =>
      String(
        transaction.date || ""
      ).startsWith(key)
  );
}


/* =======================================================
   TRANSAÇÕES FUTURAS POR MÊS
   ======================================================= */

function getMonthFutureTransactions(
  year,
  month
) {

  const key =
    `${year}-${String(
      month
    ).padStart(2, "0")}`;

  return state.transactions.filter(
    transaction =>
      String(
        transaction.date || ""
      ).startsWith(key) &&
      isFutureTransaction(
        transaction
      )
  );
}


/* =======================================================
   TOTAIS DO MÊS
   ======================================================= */

function getMonthFinancialData(
  year,
  month
) {

  const realized =
    getMonthEffectiveTransactions(
      year,
      month
    );

  const future =
    getMonthFutureTransactions(
      year,
      month
    );


  const realizedTotals =
    totalsForTransactions(
      realized
    );


  const futureTotals =
    totalsForTransactions(
      future
    );


  return {

    income:
      realizedTotals.income,

    expense:
      realizedTotals.expense,

    balance:
      realizedTotals.balance,

    futureIncome:
      futureTotals.income,

    futureExpense:
      futureTotals.expense,

    plannedExpense:
      realizedTotals.expense +
      futureTotals.expense,

    plannedBalance:
      realizedTotals.income -
      (
        realizedTotals.expense +
        futureTotals.expense
      )
  };
}


/* =======================================================
   DASHBOARD — NOVA VERSÃO
   ======================================================= */

function renderDashboard() {

  const financial =
    getFinancialTotals();


  const welcomeName =
    $("#welcomeName");

  if (welcomeName) {

    welcomeName.textContent =
      state.profile.username ||
      "amigo";
  }


  /*
   * SALDO REAL ATUAL
   */
  if (
    $("#balanceValue")
  ) {

    $("#balanceValue")
      .textContent =
      balanceVisible
        ? money(
            financial.currentBalance
          )
        : "••••••";
  }


  /*
   * RENDA ACUMULADA
   */
  if (
    $("#incomeMonth")
  ) {

    $("#incomeMonth")
      .textContent =
      balanceVisible
        ? money(
            financial.realizedIncome
          )
        : "••••";
  }


  /*
   * GASTOS ACUMULADOS + PROGRAMADOS
   *
   * Isso permite que o usuário veja
   * quanto dos recursos já está comprometido.
   */
  if (
    $("#expenseMonth")
  ) {

    $("#expenseMonth")
      .textContent =
      balanceVisible
        ? money(
            financial.totalProjectedExpenses
          )
        : "••••";
  }


  /*
   * Campo opcional para saldo disponível planejado.
   */
  const planned =
    $("#plannedBalance");

  if (planned) {

    planned.textContent =
      balanceVisible
        ? money(
            financial.plannedAvailable
          )
        : "••••••";
  }


  /*
   * Campo opcional para gastos futuros.
   */
  const scheduled =
    $("#scheduledExpenses");

  if (scheduled) {

    scheduled.textContent =
      balanceVisible
        ? money(
            financial.futureExpense
          )
        : "••••";
  }


  /*
   * Avatar
   */
  if (
    $("#dashboardAvatar")
  ) {

    $("#dashboardAvatar").src =
      state.profile.avatar ||
      "logo-192.png";
  }


  /*
   * Distribuição de categorias:
   * realizadas + programadas.
   */
  renderCategories();


  /*
   * Últimas transações:
   * realizadas e programadas.
   */
  const recent =
    [...state.transactions]
      .sort(
        (a, b) =>
          String(
            b.date || ""
          ).localeCompare(
            String(
              a.date || ""
            )
          )
      )
      .slice(0, 6);


  renderTransactionList(
    $("#recentTransactions"),
    recent
  );
}


/* =======================================================
   CATEGORIAS — REALIZADAS + PROGRAMADAS
   ======================================================= */

function renderCategories() {

  const root =
    $("#categorySummary");

  if (!root) return;


  const transactions =
    state.transactions.filter(
      transaction =>
        transaction.type ===
        "expense"
    );


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

              <div class="category-row-head">

                <span>
                  ${escapeHTML(
                    category
                  )}
                </span>

                <strong>
                  ${
                    balanceVisible
                      ? money(value)
                      : "••••"
                  }
                </strong>

              </div>

              <div class="progress-track">

                <div
                  class="progress-fill"
                  style="width:${percentage}%"
                ></div>

              </div>

              <small>
                ${percentage}% dos gastos
              </small>

            </div>
          `;
        }
      )
      .join("");
}


/* =======================================================
   TRANSAÇÃO — CORRIGIR DATAS
   ======================================================= */

function formatDate(
  value
) {

  return formatDateBR(
    value
  );
}


/* =======================================================
   TRANSAÇÃO — CLASSE VISUAL
   ======================================================= */

function transactionClass(
  transaction
) {

  /*
   * Azul = programado/futuro
   * Vermelho = gasto realizado
   * Verde = renda realizada
   */

  if (
    isFutureTransaction(
      transaction
    )
  ) {

    return "scheduled";
  }


  return transaction.type ===
    "income"
    ? "income"
    : "expense";
}


/* =======================================================
   LISTA DE TRANSAÇÕES — VISUAL
   ======================================================= */

function renderTransactionList(
  root,
  transactions
) {

  if (!root) return;


  if (!transactions.length) {

    root.innerHTML = `
      <div class="empty-state compact">

        <p>
          Nenhuma transação encontrada.
        </p>

      </div>
    `;

    return;
  }


  root.innerHTML =
    transactions
      .map(
        transaction => {

          const isScheduled =
            isFutureTransaction(
              transaction
            );


          const sign =
            transaction.type ===
            "expense"
              ? "-"
              : "+";


          const amountClass =
            isScheduled
              ? "scheduled"
              : transaction.type ===
                "expense"
                  ? "negative"
                  : "positive";


          const statusLabel =
            isScheduled
              ? "Programado"
              : transaction.type ===
                "expense"
                  ? "Gasto realizado"
                  : "Renda recebida";


          const icon =
            isScheduled
              ? "◷"
              : transaction.type ===
                "expense"
                  ? "↘"
                  : "↗";


          return `
            <article
              class="
                transaction-row
                ${transactionClass(
                  transaction
                )}
              "
              data-transaction-id="${escapeHTML(
                transaction.id
              )}"
            >

              <div
                class="transaction-icon"
                aria-hidden="true"
              >
                ${icon}
              </div>


              <div class="transaction-main">

                <strong>
                  ${escapeHTML(
                    transaction.description ||
                    "Transação"
                  )}
                </strong>

                <small>

                  ${escapeHTML(
                    transaction.category ||
                    "Outros"
                  )}

                  ·

                  ${formatDate(
                    transaction.date
                  )}

                </small>

              </div>


              <div
                class="transaction-value"
              >

                <strong
                  class="${amountClass}"
                >

                  ${sign}

                  ${
                    balanceVisible
                      ? money(
                          transactionAmount(
                            transaction
                          )
                        )
                      : "••••"
                  }

                </strong>

                <small>
                  ${statusLabel}
                </small>

              </div>


              <div
                class="transaction-actions"
              >

                <button
                  type="button"
                  class="icon-btn"
                  data-edit-transaction="${escapeHTML(
                    transaction.id
                  )}"
                  aria-label="Editar transação"
                >
                  ✎
                </button>

                <button
                  type="button"
                  class="icon-btn danger"
                  data-delete-transaction="${escapeHTML(
                    transaction.id
                  )}"
                  aria-label="Excluir transação"
                >
                  ×
                </button>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


/* =======================================================
   ANÁLISE — VERSÃO CORRIGIDA
   ======================================================= */

function renderAnalysis() {

  const year =
    currentYear();

  const months =
    monthNames();


  const monthData =
    months.map(
      (_, index) => {

        const month =
          index + 1;

        const data =
          getMonthFinancialData(
            year,
            month
          );


        return {

          month:
            months[index],

          income:
            data.income,

          expense:
            data.expense,

          balance:
            data.balance,

          futureIncome:
            data.futureIncome,

          futureExpense:
            data.futureExpense,

          plannedExpense:
            data.plannedExpense,

          plannedBalance:
            data.plannedBalance
        };
      }
    );


  renderAnalysisChart(
    monthData
  );


  renderAnalysisSummary(
    monthData
  );


  renderAnalysisCategoryBreakdown();
}


/* =======================================================
   GRÁFICO DA ANÁLISE
   ======================================================= */

function renderAnalysisChart(
  data
) {

  const root =
    $("#analysisChart");

  if (!root) return;


  const max =
    Math.max(
      1,
      ...data.flatMap(
        item => [
          item.income,
          item.plannedExpense
        ]
      )
    );


  root.innerHTML =
    data
      .map(
        item => {

          const incomeHeight =
            Math.max(
              2,
              (
                item.income /
                max
              ) *
                100
            );


          const expenseHeight =
            Math.max(
              2,
              (
                item.plannedExpense /
                max
              ) *
                100
            );


          return `
            <div class="chart-column">

              <div class="chart-bars">

                <span
                  class="chart-bar income"
                  style="height:${incomeHeight}%"
                  title="Renda realizada: ${money(
                    item.income
                  )}"
                ></span>

                <span
                  class="chart-bar expense"
                  style="height:${expenseHeight}%"
                  title="Gastos realizados + programados: ${money(
                    item.plannedExpense
                  )}"
                ></span>

              </div>

              <small>
                ${item.month}
              </small>

            </div>
          `;
        }
      )
      .join("");
}


/* =======================================================
   RESUMO DA ANÁLISE
   ======================================================= */

function renderAnalysisSummary(
  data
) {

  const root =
    $("#analysisSummary");

  if (!root) return;


  const income =
    data.reduce(
      (sum, item) =>
        sum + item.income,
      0
    );


  const realizedExpense =
    data.reduce(
      (sum, item) =>
        sum + item.expense,
      0
    );


  const futureExpense =
    data.reduce(
      (sum, item) =>
        sum + item.futureExpense,
      0
    );


  const plannedExpense =
    realizedExpense +
    futureExpense;


  const balance =
    income -
    realizedExpense;


  const plannedBalance =
    income -
    plannedExpense;


  root.innerHTML = `
    <div class="analysis-summary-grid">

      <div class="analysis-card">

        <span>
          Renda realizada
        </span>

        <strong>
          ${
            balanceVisible
              ? money(income)
              : "••••"
          }
        </strong>

      </div>


      <div class="analysis-card">

        <span>
          Gastos realizados
        </span>

        <strong>
          ${
            balanceVisible
              ? money(realizedExpense)
              : "••••"
          }
        </strong>

      </div>


      <div class="analysis-card">

        <span>
          Gastos programados
        </span>

        <strong>
          ${
            balanceVisible
              ? money(futureExpense)
              : "••••"
          }
        </strong>

      </div>


      <div class="analysis-card">

        <span>
          Saldo realizado
        </span>

        <strong>
          ${
            balanceVisible
              ? money(balance)
              : "••••"
          }
        </strong>

      </div>


      <div class="analysis-card">

        <span>
          Saldo livre planejado
        </span>

        <strong>
          ${
            balanceVisible
              ? money(plannedBalance)
              : "••••"
          }
        </strong>

      </div>


      <div class="analysis-card">

        <span>
          Gastos comprometidos
        </span>

        <strong>
          ${
            balanceVisible
              ? money(plannedExpense)
              : "••••"
          }
        </strong>

      </div>

    </div>
  `;
}


/* =======================================================
   ANÁLISE — CATEGORIAS
   ======================================================= */

function renderAnalysisCategoryBreakdown() {

  const root =
    $("#analysisCategoryBreakdown");

  if (!root) return;


  const expenses =
    state.transactions.filter(
      transaction =>
        transaction.type ===
        "expense"
    );


  const totals =
    getCategoryTotals(
      expenses
    );


  const entries =
    Object.entries(
      totals
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

        <h3>
          Ainda não há dados
        </h3>

        <p>
          Registre seus gastos para
          visualizar a distribuição.
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
              ? (
                  value /
                  total
                ) *
                100
              : 0;


          return `
            <div class="analysis-category-row">

              <div>

                <strong>
                  ${escapeHTML(
                    category
                  )}
                </strong>

                <span>
                  ${percentage.toFixed(
                    1
                  )}%
                </span>

              </div>

              <strong>
                ${
                  balanceVisible
                    ? money(value)
                    : "••••"
                }
              </strong>

            </div>

            <div class="progress-track">

              <div
                class="progress-fill"
                style="width:${percentage}%"
              ></div>

            </div>
          `;
        }
      )
      .join("");
}


/* =======================================================
   TRANSAÇÕES — FILTRO CORRIGIDO
   ======================================================= */

function getTransactionFilter() {

  const search =
    String(
      $("#transactionSearch")
        ?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const type =
    String(
      $("#transactionType")
        ?.value ||
      "all"
    );


  const status =
    String(
      $("#transactionStatus")
        ?.value ||
      "all"
    );


  return {

    search,

    type,

    status

  };
}


/* =======================================================
   FILTRAGEM
   ======================================================= */

function filterTransactions() {

  const {
    search,
    type,
    status
  } =
    getTransactionFilter();


  return [
    ...state.transactions
  ]
    .filter(
      transaction => {

        /*
         * TIPO
         */

        if (
          type !==
            "all" &&
          transaction.type !==
            type
        ) {

          return false;
        }


        /*
         * STATUS
         */

        const future =
          isFutureTransaction(
            transaction
          );


        if (
          status ===
            "past" &&
          future
        ) {

          return false;
        }


        if (
          status ===
            "scheduled" &&
          !future
        ) {

          return false;
        }


        /*
         * BUSCA
         */

        if (
          search
        ) {

          const text =
            [
              transaction.description,
              transaction.category,
              transaction.type,
              future
                ? "programado"
                : transaction.type ===
                  "expense"
                    ? "gasto"
                    : "renda"
            ]
              .join(" ")
              .toLowerCase();


          if (
            !text.includes(
              search
            )
          ) {

            return false;
          }
        }


        return true;
      }
    )
    .sort(
      (a, b) =>
        String(
          b.date || ""
        ).localeCompare(
          String(
            a.date || ""
          )
        )
    );
}


/* =======================================================
   RENDER DAS TRANSAÇÕES
   ======================================================= */

function renderTransactions() {

  const root =
    $("#transactionsList");

  if (!root) return;


  const transactions =
    filterTransactions();


  renderTransactionList(
    root,
    transactions
  );


  const count =
    $("#transactionCount");

  if (count) {

    count.textContent =
      `${transactions.length} ${
        transactions.length === 1
          ? "transação"
          : "transações"
      }`;
  }


  const scheduledCount =
    $("#scheduledTransactionCount");

  if (scheduledCount) {

    scheduledCount.textContent =
      String(
        state.transactions.filter(
          transaction =>
            isFutureTransaction(
              transaction
            )
        ).length
      );
  }


  const realizedCount =
    $("#realizedTransactionCount");

  if (realizedCount) {

    realizedCount.textContent =
      String(
        state.transactions.filter(
          transaction =>
            !isFutureTransaction(
              transaction
            )
        ).length
      );
  }
}


/* =======================================================
   EXCLUSÃO DE TRANSAÇÃO
   ======================================================= */

function deleteTransaction(
  transactionId
) {

  const index =
    state.transactions.findIndex(
      transaction =>
        transaction.id ===
        transactionId
    );


  if (
    index === -1
  ) {

    return;
  }


  state.transactions.splice(
    index,
    1
  );


  saveState();

  renderAll();


  toast(
    "Transação excluída.",
    "success"
  );
}


/* =======================================================
   CONFIRMAÇÃO SIMPLES
   ======================================================= */

function confirmDeleteTransaction(
  transactionId
) {

  const transaction =
    state.transactions.find(
      item =>
        item.id ===
        transactionId
    );


  if (!transaction) {

    return;
  }


  const description =
    transaction.description ||
    "esta transação";


  const confirmed =
    window.confirm(
      `Excluir ${description}?`
    );


  if (
    confirmed
  ) {

    deleteTransaction(
      transactionId
    );
  }
}


/* =======================================================
   EDITAR TRANSAÇÃO
   ======================================================= */

function editTransaction(
  transactionId
) {

  const transaction =
    state.transactions.find(
      item =>
        item.id ===
        transactionId
    );


  if (!transaction) {

    return;
  }


  transactionModal(
    transaction
  );
}


/* =======================================================
   GOALS
   ======================================================= */

function renderGoals() {

  const root =
    $("#goalsList");

  if (!root) return;


  if (
    !state.goals.length
  ) {

    root.innerHTML = `
      <div class="empty-state">

        <div class="empty-state-icon">
          🎯
        </div>

        <h3>
          Nenhuma meta criada
        </h3>

        <p>
          Crie uma meta para acompanhar
          seu progresso.
        </p>

      </div>
    `;

    return;
  }


  root.innerHTML =
    state.goals
      .map(
        goal => {

          const current =
            Number(
              goal.current
            ) || 0;


          const target =
            Number(
              goal.target
            ) || 0;


          const percentage =
            target > 0
              ? clamp(
                  (
                    current /
                    target
                  ) *
                    100,
                  0,
                  100
                )
              : 0;


          return `
            <article
              class="goal-card"
            >

              <div class="goal-head">

                <div>

                  <strong>
                    ${escapeHTML(
                      goal.name ||
                      "Meta"
                    )}
                  </strong>

                  ${
                    goal.deadline
                      ? `
                        <small>
                          Até ${formatDate(
                            goal.deadline
                          )}
                        </small>
                      `
                      : ""
                  }

                </div>


                <button
                  class="icon-btn danger"
                  type="button"
                  data-delete-goal="${escapeHTML(
                    goal.id
                  )}"
                  aria-label="Excluir meta"
                >
                  ×
                </button>

              </div>


              <div class="goal-values">

                <strong>
                  ${
                    balanceVisible
                      ? money(current)
                      : "••••"
                  }
                </strong>

                <span>
                  de ${
                    balanceVisible
                      ? money(target)
                      : "••••"
                  }
                </span>

              </div>


              <div
                class="progress-track"
              >

                <div
                  class="progress-fill"
                  style="width:${percentage}%"
                ></div>

              </div>


              <div class="goal-footer">

                <span>
                  ${Math.round(
                    percentage
                  )}%
                </span>

                <button
                  class="btn small"
                  type="button"
                  data-add-goal="${escapeHTML(
                    goal.id
                  )}"
                >
                  Adicionar
                </button>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


/* =======================================================
   RENDER PERFIL
   ======================================================= */

function renderProfile() {

  const username =
    $("#profileUsername");


  if (username) {

    username.value =
      state.profile.username ||
      "";
  }


  const email =
    $("#profileEmail");


  if (email) {

    email.value =
      state.profile.email ||
      "";
  }


  const avatar =
    $("#profileAvatar");


  if (avatar) {

    avatar.src =
      state.profile.avatar ||
      "logo-192.png";
  }


  const theme =
    $("#themeSelect");


  if (theme) {

    theme.value =
      state.settings.theme;
  }


  renderBackupStatus();
}


/* =======================================================
   SALVAR PERFIL
   ======================================================= */

function saveProfile() {

  const username =
    $("#profileUsername")
      ?.value
      .trim();


  const email =
    $("#profileEmail")
      ?.value
      .trim();


  if (
    username !==
    undefined
  ) {

    state.profile.username =
      username;
  }


  if (
    email !==
    undefined
  ) {

    state.profile.email =
      email;
  }


  saveState();

  renderDashboard();


  toast(
    "Perfil atualizado.",
    "success"
  );
}


/* =======================================================
   AVATAR
   ======================================================= */

function handleAvatar(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) return;


  if (
    !file.type.startsWith(
      "image/"
    )
  ) {

    toast(
      "Escolha uma imagem válida.",
      "error"
    );

    return;
  }


  const reader =
    new FileReader();


  reader.onload =
    () => {

      state.profile.avatar =
        reader.result;


      saveState();

      renderProfile();

      renderDashboard();


      toast(
        "Foto atualizada.",
        "success"
      );
    };


  reader.readAsDataURL(
    file
  );
}


/* =======================================================
   PIN
   ======================================================= */

function pinModal() {

  const hasPin =
    !!state.settings.pinHash;


  const body = `

    <p class="muted">

      ${
        hasPin
          ? "Defina um novo PIN ou remova o PIN atual."
          : "Crie um PIN de 4 a 6 números para proteger a abertura do aplicativo."
      }

    </p>


    ${
      hasPin
        ? `
          <button
            type="button"
            class="btn danger"
            id="removePinButton"
          >
            Remover PIN
          </button>
        `
        : ""
    }


    <label>

      ${
        hasPin
          ? "Novo PIN"
          : "PIN"
      }


      <input
        name="pin"
        type="password"
        inputmode="numeric"
        maxlength="6"
        pattern="[0-9]{4,6}"
        placeholder="••••"
        required
      >

    </label>


    <label>

      Confirmar PIN

      <input
        name="pin2"
        type="password"
        inputmode="numeric"
        maxlength="6"
        pattern="[0-9]{4,6}"
        placeholder="••••"
        required
      >

    </label>

  `;


  openModal(
    hasPin
      ? "Alterar PIN"
      : "Criar PIN",

    body,

    async event => {

      event.preventDefault();


      const data =
        new FormData(
          event.currentTarget
        );


      const pin =
        String(
          data.get(
            "pin"
          ) ||
          ""
        ).trim();


      const pin2 =
        String(
          data.get(
            "pin2"
          ) ||
          ""
        ).trim();


      if (
        !/^\d{4,6}$/.test(
          pin
        )
      ) {

        toast(
          "O PIN precisa ter de 4 a 6 números.",
          "error"
        );

        return false;
      }


      if (
        pin !==
        pin2
      ) {

        toast(
          "Os PINs não conferem.",
          "error"
        );

        return false;
      }


      const salt =
        crypto.randomUUID();


      const hash =
        await hashSecret(
          pin,
          salt
        );


      state.settings.pinHash = {

        salt,

        hash

      };


      saveState();


      toast(
        "PIN configurado.",
        "success"
      );


      return true;
    }
  );


  $("#removePinButton")
    ?.addEventListener(
      "click",
      () => {

        state.settings.pinHash =
          null;


        saveState();


        $("#modalRoot")
          ?.classList
          .remove(
            "open"
          );


        setTimeout(
          () => {

            if (
              $("#modalRoot")
            ) {

              $("#modalRoot")
                .innerHTML =
                "";
            }

          },
          180
        );


        toast(
          "PIN removido.",
          "success"
        );
      }
    );
}


/* =======================================================
   BACKUP — NÃO ALTERAR A LÓGICA DE STORAGE
   ======================================================= */

function buildBackup() {

  return JSON.stringify(
    {

      app:
        "Santinho Finance",

      version:
        1,

      exportedAt:
        new Date().toISOString(),

      data:
        state

    },
    null,
    2
  );
}


async function backupNow() {

  const json =
    buildBackup();


  const filename =
    `santinho-finance-backup-${todayKey()}.json`;


  try {

    if (
      navigator.share &&
      navigator.canShare
    ) {

      const file =
        new File(
          [json],
          filename,
          {
            type:
              "application/json"
          }
        );


      if (
        navigator.canShare({
          files: [
            file
          ]
        })
      ) {

        await navigator.share({

          title:
            "Backup Santinho Finance",

          text:
            "Backup dos dados locais do Santinho Finance.",

          files: [
            file
          ]

        });


        state.settings.lastBackupAt =
          new Date().toISOString();


        saveState();

        renderBackupStatus();


        toast(
          "Backup compartilhado.",
          "success"
        );


        return;
      }
    }

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      return;
    }
  }


  const blob =
    new Blob(
      [json],
      {
        type:
          "application/json"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const anchor =
    document.createElement(
      "a"
    );


  anchor.href =
    url;


  anchor.download =
    filename;


  document.body.appendChild(
    anchor
  );


  anchor.click();


  anchor.remove();


  URL.revokeObjectURL(
    url
  );


  state.settings.lastBackupAt =
    new Date().toISOString();


  saveState();

  renderBackupStatus();


  toast(
    "Backup baixado.",
    "success"
  );
}


function renderBackupStatus() {

  const element =
    $("#lastBackupStatus");


  if (!element) return;


  const last =
    state.settings.lastBackupAt;


  element.textContent =
    last
      ? `Último backup: ${new Date(
          last
        ).toLocaleString(
          "pt-BR"
        )}`
      : "Nenhum backup realizado ainda.";
}


/* =======================================================
   RESTORE
   ======================================================= */

function restoreData(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) return;


  const reader =
    new FileReader();


  reader.onload =
    () => {

      try {

        const parsed =
          JSON.parse(
            reader.result
          );


        const restored =
          parsed?.data;


        if (
          !restored ||
          restored.schema !==
            SCHEMA
        ) {

          throw new Error(
            "Backup inválido."
          );
        }


        state =
          normalize(
            restored
          );


        saveState();

        renderAll();

        updateAuthMode();


        toast(
          "Backup restaurado.",
          "success"
        );


      } catch (error) {

        console.error(
          error
        );


        toast(
          "Não foi possível restaurar esse backup.",
          "error"
        );
      }


      event.target.value =
        "";
    };


  reader.readAsText(
    file
  );
}


/* =======================================================
   TOAST
   ======================================================= */

function toast(
  message,
  type = "info"
) {

  const element =
    $("#toast");


  if (!element) return;


  element.textContent =
    message;


  element.className =
    `toast ${type}`;


  element.classList.add(
    "show"
  );


  clearTimeout(
    element._timer
  );


  element._timer =
    setTimeout(
      () => {

        element.classList.remove(
          "show"
        );

      },
      3000
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

  renderBackupStatus();
}


/* =======================================================
   EVENTOS — PARTE 1
   ======================================================= */

function bindEvents() {

  $("#setupForm")
    ?.addEventListener(
      "submit",
      setupAccount
    );


  $("#loginForm")
    ?.addEventListener(
      "submit",
      login
    );


  $("#pinForm")
    ?.addEventListener(
      "submit",
      verifyPin
    );


  $("#toggleSetup")
    ?.addEventListener(
      "click",
      () => {

        const loginForm =
          $("#loginForm");


        const setupForm =
          $("#setupForm");


        if (
          !loginForm ||
          !setupForm
        ) {

          return;
        }


        const loginHidden =
          loginForm.classList.contains(
            "hidden"
          );


        loginForm.classList.toggle(
          "hidden",
          !loginHidden
        );


        setupForm.classList.toggle(
          "hidden",
          loginHidden
        );

      }
    );


  $$(".nav-btn")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            navigate(
              button.dataset.nav
            );

          }
        );

      }
    );


  $("#addIncome")
    ?.addEventListener(
      "click",
      () =>
        transactionModal({
          type:
            "income"
        })
    );


  $("#addExpense")
    ?.addEventListener(
      "click",
      () =>
        transactionModal({
          type:
            "expense"
        })
    );


  $("#newTransaction")
    ?.addEventListener(
      "click",
      () =>
        transactionModal()
    );


  $("#newGoal")
    ?.addEventListener(
      "click",
      goalModal
    );


  $("#profileSave")
    ?.addEventListener(
      "click",
      saveProfile
    );


  $("#avatarInput")
    ?.addEventListener(
      "change",
      handleAvatar
    );


  $("#pinSettings")
    ?.addEventListener(
      "click",
      pinModal
    );


  $("#lockApp")
    ?.addEventListener(
      "click",
      lockNow
    );


  $("#logout")
    ?.addEventListener(
      "click",
      logout
    );


  $("#backupNow")
    ?.addEventListener(
      "click",
      backupNow
    );


  $("#restoreInput")
    ?.addEventListener(
      "change",
      restoreData
    );


  $("#balanceToggle")
    ?.addEventListener(
      "click",
      () => {

        balanceVisible =
          !balanceVisible;


        renderDashboard();

        renderAnalysis();

        renderTransactions();

        renderGoals();

      }
    );


  $("#motivationRefresh")
    ?.addEventListener(
      "click",
      chooseMotivation
    );


  $("#themeSelect")
    ?.addEventListener(
      "change",
      event => {

        state.settings.theme =
          event.target.value;


        applyTheme();

        saveState();

      }
    );


  $("#themeSwitch")
    ?.addEventListener(
      "change",
      event => {

        state.settings.theme =
          event.target.checked
            ? "light"
            : "dark";


        applyTheme();

        saveState();

      }
    );


  [
    "#transactionSearch",
    "#transactionType",
    "#transactionStatus"
  ]
    .forEach(
      selector => {

        $(selector)
          ?.addEventListener(
            "input",
            renderTransactions
          );


        $(selector)
          ?.addEventListener(
            "change",
            renderTransactions
          );

      }
    );


  /* =====================================================
     TRANSAÇÕES — CLIQUES
     ===================================================== */

  $("#transactionsList")
    ?.addEventListener(
      "click",
      event => {

        const edit =
          event.target.closest(
            "[data-edit-transaction]"
          );


        if (edit) {

          editTransaction(
            edit.dataset
              .editTransaction
          );

          return;
        }


        const remove =
          event.target.closest(
            "[data-delete-transaction]"
          );


        if (remove) {

          confirmDeleteTransaction(
            remove.dataset
              .deleteTransaction
          );

        }

      }
    );


  /* =====================================================
     METAS
     ===================================================== */

  $("#goalsList")
    ?.addEventListener(
      "click",
      event => {

        const add =
          event.target.closest(
            "[data-add-goal]"
          );


        if (add) {

          addToGoal(
            add.dataset.addGoal
          );

          return;
        }


        const remove =
          event.target.closest(
            "[data-delete-goal]"
          );


        if (remove) {

          const id =
            remove.dataset
              .deleteGoal;


          state.goals =
            state.goals.filter(
              goal =>
                goal.id !==
                id
            );


          saveState();

          renderGoals();


          toast(
            "Meta excluída.",
            "success"
          );
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

    window.addEventListener(
      "load",
      () => {

        navigator.serviceWorker
          .register(
            "./sw.js"
          )
          .catch(
            error =>
              console.warn(
                "Service Worker registration failed:",
                error
              )
          );

      }
    );
  }
}


/* =======================================================
   INICIALIZAÇÃO
   ======================================================= */

async function init() {

  await loadState();


  try {

    const dismissed =
      localStorage.getItem(
        "santinho-privacy-dismissed-v1"
      );


    if (
      dismissed ===
      "1"
    ) {

      state.settings.privacyDismissed =
        true;
    }

  } catch {}


  bindEvents();

  updateAuthMode();

  registerServiceWorker();


  const hasSession =
    sessionStorage.getItem(
      SESSION_KEY
    ) ===
    "1";


  if (
    hasSession &&
    state.credentials
  ) {

    if (
      state.settings.pinHash
    ) {

      show(
        "pinView"
      );

    } else {

      unlocked =
        true;

      enterApp();
    }

  } else {

    show(
      "authView"
    );
  }
}


init();

})();
/* =========================================================
   SANTINHO FINANCE
   APP.JS — PT 3/3
   FUNÇÕES FINAIS E UTILITÁRIOS
   ========================================================= */


/* =======================================================
   HELPERS DE DOM
   ======================================================= */

function $(selector) {
  return document.querySelector(selector);
}


function $$(selector) {
  return Array.from(
    document.querySelectorAll(selector)
  );
}


function show(id) {

  $$(".view").forEach(
    view => {
      view.classList.add("hidden");
    }
  );

  const target =
    typeof id === "string"
      ? document.getElementById(id)
      : id;

  target?.classList.remove(
    "hidden"
  );
}


function hide(id) {

  const target =
    typeof id === "string"
      ? document.getElementById(id)
      : id;

  target?.classList.add(
    "hidden"
  );
}


/* =======================================================
   NAVEGAÇÃO
   ======================================================= */

function navigate(
  target
) {

  if (!target) {
    return;
  }


  const viewId =
    target.endsWith("View")
      ? target
      : `${target}View`;


  show(viewId);


  $$(".nav-btn").forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.nav ===
          target
      );

    }
  );


  if (
    target ===
    "dashboard"
  ) {

    renderDashboard();
  }


  if (
    target ===
    "analysis"
  ) {

    renderAnalysis();
  }


  if (
    target ===
    "transactions"
  ) {

    renderTransactions();
  }


  if (
    target ===
    "goals"
  ) {

    renderGoals();
  }


  if (
    target ===
    "profile"
  ) {

    renderProfile();
  }
}


/* =======================================================
   AUTENTICAÇÃO
   ======================================================= */

function updateAuthMode() {

  const hasCredentials =
    !!state.credentials;


  const loginForm =
    $("#loginForm");


  const setupForm =
    $("#setupForm");


  const authTitle =
    $("#authTitle");


  const authSubtitle =
    $("#authSubtitle");


  if (
    hasCredentials
  ) {

    loginForm
      ?.classList
      .remove("hidden");


    setupForm
      ?.classList
      .add("hidden");


    if (authTitle) {

      authTitle.textContent =
        "Bem-vindo de volta";
    }


    if (authSubtitle) {

      authSubtitle.textContent =
        "Entre para acessar suas finanças.";
    }

  } else {

    loginForm
      ?.classList
      .add("hidden");


    setupForm
      ?.classList
      .remove("hidden");


    if (authTitle) {

      authTitle.textContent =
        "Crie sua conta";
    }


    if (authSubtitle) {

      authSubtitle.textContent =
        "Seus dados ficam somente neste dispositivo.";
    }
  }
}


/* =======================================================
   CRIAR CONTA
   ======================================================= */

async function setupAccount(
  event
) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const data =
    new FormData(form);


  const username =
    String(
      data.get("username") ||
      ""
    ).trim();


  const email =
    String(
      data.get("email") ||
      ""
    ).trim();


  const password =
    String(
      data.get("password") ||
      ""
    );


  const password2 =
    String(
      data.get("password2") ||
      ""
    );


  if (
    username.length <
    2
  ) {

    toast(
      "Digite um nome válido.",
      "error"
    );

    return;
  }


  if (
    password.length <
    6
  ) {

    toast(
      "A senha precisa ter pelo menos 6 caracteres.",
      "error"
    );

    return;
  }


  if (
    password !==
    password2
  ) {

    toast(
      "As senhas não conferem.",
      "error"
    );

    return;
  }


  const salt =
    crypto.randomUUID();


  const hash =
    await hashSecret(
      password,
      salt
    );


  state.credentials = {

    username,

    email,

    salt,

    hash

  };


  state.profile.username =
    username;


  state.profile.email =
    email;


  await saveState();


  sessionStorage.setItem(
    SESSION_KEY,
    "1"
  );


  unlocked =
    true;


  enterApp();


  toast(
    "Conta criada com sucesso.",
    "success"
  );
}


/* =======================================================
   LOGIN
   ======================================================= */

async function login(
  event
) {

  event.preventDefault();


  if (
    !state.credentials
  ) {

    updateAuthMode();

    return;
  }


  const data =
    new FormData(
      event.currentTarget
    );


  const identifier =
    String(
      data.get(
        "identifier"
      ) ||
      ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      data.get(
        "password"
      ) ||
      ""
    );


  const credentials =
    state.credentials;


  const validIdentifier =
    identifier ===
      String(
        credentials.username ||
        ""
      ).toLowerCase() ||
      identifier ===
        String(
          credentials.email ||
          ""
        ).toLowerCase();


  if (
    !validIdentifier
  ) {

    toast(
      "Usuário ou e-mail incorreto.",
      "error"
    );

    return;
  }


  const hash =
    await hashSecret(
      password,
      credentials.salt
    );


  if (
    hash !==
    credentials.hash
  ) {

    toast(
      "Senha incorreta.",
      "error"
    );

    return;
  }


  sessionStorage.setItem(
    SESSION_KEY,
    "1"
  );


  if (
    state.settings.pinHash
  ) {

    show(
      "pinView"
    );

    return;
  }


  unlocked =
    true;


  enterApp();
}


/* =======================================================
   VERIFICAÇÃO DO PIN
   ======================================================= */

async function verifyPin(
  event
) {

  event.preventDefault();


  if (
    !state.settings.pinHash
  ) {

    unlocked =
      true;

    enterApp();

    return;
  }


  const data =
    new FormData(
      event.currentTarget
    );


  const pin =
    String(
      data.get("pin") ||
      ""
    ).trim();


  const pinData =
    state.settings.pinHash;


  const hash =
    await hashSecret(
      pin,
      pinData.salt
    );


  if (
    hash !==
    pinData.hash
  ) {

    toast(
      "PIN incorreto.",
      "error"
    );

    return;
  }


  unlocked =
    true;


  enterApp();
}


/* =======================================================
   ENTRAR NO APP
   ======================================================= */

function enterApp() {

  if (!unlocked) {
    return;
  }


  show(
    "mainView"
  );


  renderAll();


  navigate(
    "dashboard"
  );


  showPrivacyNotice();
}


/* =======================================================
   BLOQUEAR APP
   ======================================================= */

function lockNow() {

  unlocked =
    false;


  sessionStorage.removeItem(
    SESSION_KEY
  );


  const pinView =
    $("#pinView");


  if (
    state.settings.pinHash
  ) {

    show(
      "pinView"
    );

  } else {

    show(
      "authView"
    );
  }
}


/* =======================================================
   LOGOUT
   ======================================================= */

function logout() {

  unlocked =
    false;


  sessionStorage.removeItem(
    SESSION_KEY
  );


  show(
    "authView"
  );


  updateAuthMode();


  const loginForm =
    $("#loginForm");


  if (loginForm) {

    loginForm.reset();
  }


  toast(
    "Sessão encerrada.",
    "success"
  );
}


/* =======================================================
   HASH
   ======================================================= */

async function hashSecret(
  value,
  salt
) {

  const encoder =
    new TextEncoder();


  const data =
    encoder.encode(
      `${salt}:${value}`
    );


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


/* =======================================================
   MODAL
   ======================================================= */

function openModal(
  title,
  content,
  submitHandler
) {

  const root =
    $("#modalRoot");


  if (!root) {
    return;
  }


  root.innerHTML = `

    <div
      class="modal-backdrop"
      data-close-modal
    ></div>

    <section
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
    >

      <header class="modal-header">

        <h2 id="modalTitle">
          ${escapeHTML(title)}
        </h2>

        <button
          type="button"
          class="icon-btn"
          data-close-modal
          aria-label="Fechar"
        >
          ×
        </button>

      </header>


      <form
        id="dynamicModalForm"
        class="modal-form"
      >

        <div class="modal-body">

          ${content}

        </div>


        <footer class="modal-footer">

          <button
            type="button"
            class="btn secondary"
            data-close-modal
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="btn primary"
          >
            Salvar
          </button>

        </footer>

      </form>

    </section>
  `;


  root.classList.add(
    "open"
  );


  root
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          closeModal
        );

      }
    );


  const form =
    $("#dynamicModalForm");


  form?.addEventListener(
    "submit",
    async event => {

      const result =
        await submitHandler(
          event
        );


      if (
        result !==
        false
      ) {

        closeModal();
      }

    }
  );


  setTimeout(
    () => {

      form
        ?.querySelector(
          "input, select, textarea"
        )
        ?.focus();

    },
    50
  );
}


function closeModal() {

  const root =
    $("#modalRoot");


  if (!root) {
    return;
  }


  root.classList.remove(
    "open"
  );


  setTimeout(
    () => {

      root.innerHTML =
        "";

    },
    180
  );
}


/* =======================================================
   MODAL DE TRANSAÇÃO
   ======================================================= */

function transactionModal(
  existing = {}
) {

  const isEdit =
    !!existing.id;


  const type =
    existing.type ||
    "expense";


  const today =
    todayKey();


  const description =
    existing.description ||
    "";


  const category =
    existing.category ||
    (
      type === "income"
        ? "Salário"
        : "Outros"
    );


  const amount =
    existing.amount ??
    "";


  const date =
    existing.date ||
    today;


  const recurrence =
    existing.recurrence ||
    "none";


  const recurrenceEnd =
    existing.recurrenceEnd ||
    "";


  const body = `

    <div class="form-grid">

      <label>

        Tipo

        <select
          name="type"
          required
        >

          <option
            value="expense"
            ${
              type ===
              "expense"
                ? "selected"
                : ""
            }
          >
            Gasto
          </option>

          <option
            value="income"
            ${
              type ===
              "income"
                ? "selected"
                : ""
            }
          >
            Renda
          </option>

        </select>

      </label>


      <label>

        Valor

        <input
          name="amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="R$ 0,00"
          value="${
            escapeAttribute(
              formatBRLInput(
                amount
              )
            )
          }"
          required
        >

      </label>


      <label>

        Descrição

        <input
          name="description"
          type="text"
          maxlength="80"
          value="${escapeAttribute(
            description
          )}"
          placeholder="Ex.: Internet"
          required
        >

      </label>


      <label>

        Categoria

        <select
          name="category"
        >

          ${categoryOptions(
            category
          )}

        </select>

      </label>


      <label>

        Data

        <input
          name="date"
          type="date"
          value="${escapeAttribute(
            date
          )}"
          required
        >

      </label>


      <label>

        Repetição

        <select
          name="recurrence"
          id="transactionRecurrence"
        >

          <option
            value="none"
            ${
              recurrence ===
              "none"
                ? "selected"
                : ""
            }
          >
            Não repetir
          </option>

          <option
            value="daily"
            ${
              recurrence ===
              "daily"
                ? "selected"
                : ""
            }
          >
            Diariamente
          </option>

          <option
            value="weekly"
            ${
              recurrence ===
              "weekly"
                ? "selected"
                : ""
            }
          >
            Semanalmente
          </option>

          <option
            value="biweekly"
            ${
              recurrence ===
              "biweekly"
                ? "selected"
                : ""
            }
          >
            A cada 2 semanas
          </option>

          <option
            value="monthly"
            ${
              recurrence ===
              "monthly"
                ? "selected"
                : ""
            }
          >
            Mensalmente
          </option>

        </select>

      </label>


      <label
        id="recurrenceEndField"
        class="${
          recurrence ===
          "none"
            ? "hidden"
            : ""
        }"
      >

        Repetir até

        <input
          name="recurrenceEnd"
          type="date"
          value="${escapeAttribute(
            recurrenceEnd
          )}"
        >

      </label>


    </div>


    <div class="form-hint">

      <strong>
        Como o Santinho calcula:
      </strong>

      <p>
        Rendas passadas e gastos passados
        entram no saldo acumulado.
        Gastos futuros programados também
        reduzem o valor livre planejado.
      </p>

    </div>

  `;


  openModal(
    isEdit
      ? "Editar transação"
      : "Nova transação",

    body,

    event =>
      saveTransactionFromModal(
        event,
        existing
      )
  );


  const recurrenceSelect =
    $("#transactionRecurrence");


  const recurrenceEndField =
    $("#recurrenceEndField");


  recurrenceSelect
    ?.addEventListener(
      "change",
      () => {

        recurrenceEndField
          ?.classList
          .toggle(
            "hidden",
            recurrenceSelect.value ===
              "none"
          );

      }
    );
}


/* =======================================================
   SALVAR TRANSAÇÃO
   ======================================================= */

function saveTransactionFromModal(
  event,
  existing
) {

  event.preventDefault();


  const data =
    new FormData(
      event.currentTarget
    );


  const type =
    String(
      data.get("type") ||
      "expense"
    );


  const amount =
    parseBRL(
      data.get("amount")
    );


  const description =
    String(
      data.get(
        "description"
      ) ||
      ""
    ).trim();


  const category =
    String(
      data.get(
        "category"
      ) ||
      "Outros"
    );


  const date =
    String(
      data.get("date") ||
      ""
    );


  const recurrence =
    String(
      data.get(
        "recurrence"
      ) ||
      "none"
    );


  const recurrenceEnd =
    String(
      data.get(
        "recurrenceEnd"
      ) ||
      ""
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    toast(
      "Digite um valor válido.",
      "error"
    );

    return false;
  }


  if (!date) {

    toast(
      "Escolha uma data.",
      "error"
    );

    return false;
  }


  if (
    recurrence !==
      "none" &&
    !recurrenceEnd
  ) {

    toast(
      "Escolha até quando essa repetição deve acontecer.",
      "error"
    );

    return false;
  }


  if (
    recurrenceEnd &&
    recurrenceEnd <
      date
  ) {

    toast(
      "A data final não pode ser anterior à data inicial.",
      "error"
    );

    return false;
  }


  /*
   * Se estiver editando uma transação
   * recorrente, removemos as ocorrências
   * antigas geradas por ela e reconstruímos.
   */
  if (
    existing.id
  ) {

    state.transactions =
      state.transactions.filter(
        transaction =>
          transaction.id !==
            existing.id &&
          transaction.parentId !==
            existing.id
      );
  }


  const base = {

    id:
      existing.id ||
      crypto.randomUUID(),

    type,

    amount,

    description,

    category,

    date,

    recurrence,

    recurrenceEnd,

    scheduled:
      date >
      todayKey(),

    parentId:
      null

  };


  state.transactions.push(
    base
  );


  /*
   * Cria ocorrências futuras.
   */
  if (
    recurrence !==
    "none"
  ) {

    const occurrences =
      generateRecurringTransactions(
        base
      );


    state.transactions.push(
      ...occurrences
    );
  }


  saveState();

  renderAll();


  toast(
    existing.id
      ? "Transação atualizada."
      : "Transação adicionada.",
    "success"
  );


  return true;
}


/* =======================================================
   RECORRÊNCIA
   ======================================================= */

function generateRecurringTransactions(
  base
) {

  const result =
    [];


  if (
    !base ||
    base.recurrence ===
      "none"
  ) {

    return result;
  }


  const start =
    parseLocalDateKey(
      base.date
    );


  const end =
    base.recurrenceEnd
      ? parseLocalDateKey(
          base.recurrenceEnd
        )
      : null;


  let cursor =
    new Date(
      start
    );


  let safety =
    0;


  while (
    safety <
    1000
  ) {

    safety++;


    cursor =
      nextRecurrenceDate(
        cursor,
        base.recurrence
      );


    if (
      end &&
      cursor >
        end
    ) {

      break;
    }


    const date =
      dateKeyFromDate(
        cursor
      );


    result.push({

      id:
        crypto.randomUUID(),

      parentId:
        base.id,

      type:
        base.type,

      amount:
        base.amount,

      description:
        base.description,

      category:
        base.category,

      date,

      recurrence:
        base.recurrence,

      recurrenceEnd:
        base.recurrenceEnd,

      scheduled:
        date >
        todayKey()

    });


    /*
     * Evita uma recorrência infinita
     * caso algo esteja errado na data.
     */
    if (
      !end &&
      result.length >=
        120
    ) {

      break;
    }
  }


  return result;
}


function nextRecurrenceDate(
  date,
  recurrence
) {

  const next =
    new Date(
      date
    );


  switch (
    recurrence
  ) {

    case "daily":

      next.setDate(
        next.getDate() + 1
      );

      break;


    case "weekly":

      next.setDate(
        next.getDate() + 7
      );

      break;


    case "biweekly":

      next.setDate(
        next.getDate() + 14
      );

      break;


    case "monthly": {

      const day =
        next.getDate();


      next.setDate(1);


      next.setMonth(
        next.getMonth() + 1
      );


      const lastDay =
        new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0
        ).getDate();


      next.setDate(
        Math.min(
          day,
          lastDay
        )
      );


      break;
    }


    default:

      break;
  }


  return next;
}


/* =======================================================
   METAS
   ======================================================= */

function goalModal() {

  const body = `

    <label>

      Nome da meta

      <input
        name="name"
        type="text"
        maxlength="80"
        placeholder="Ex.: Viagem"
        required
      >

    </label>


    <label>

      Valor da meta

      <input
        name="target"
        type="text"
        inputmode="decimal"
        placeholder="R$ 0,00"
        required
      >

    </label>


    <label>

      Já guardado

      <input
        name="current"
        type="text"
        inputmode="decimal"
        placeholder="R$ 0,00"
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

  `;


  openModal(
    "Nova meta",
    body,
    event => {

      event.preventDefault();


      const data =
        new FormData(
          event.currentTarget
        );


      const name =
        String(
          data.get("name") ||
          ""
        ).trim();


      const target =
        parseBRL(
          data.get(
            "target"
          )
        );


      const current =
        parseBRL(
          data.get(
            "current"
          )
        ) || 0;


      const deadline =
        String(
          data.get(
            "deadline"
          ) ||
          ""
        );


      if (
        !name ||
        !Number.isFinite(
          target
        ) ||
        target <= 0
      ) {

        toast(
          "Preencha os dados da meta.",
          "error"
        );

        return false;
      }


      state.goals.push({

        id:
          crypto.randomUUID(),

        name,

        target,

        current,

        deadline

      });


      saveState();

      renderGoals();


      toast(
        "Meta criada.",
        "success"
      );


      return true;
    }
  );
}


function addToGoal(
  goalId
) {

  const goal =
    state.goals.find(
      item =>
        item.id ===
        goalId
    );


  if (!goal) {
    return;
  }


  const body = `

    <label>

      Quanto adicionar?

      <input
        name="amount"
        type="text"
        inputmode="decimal"
        placeholder="R$ 0,00"
        required
      >

    </label>

  `;


  openModal(
    `Adicionar à meta`,
    body,
    event => {

      event.preventDefault();


      const data =
        new FormData(
          event.currentTarget
        );


      const amount =
        parseBRL(
          data.get(
            "amount"
          )
        );


      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {

        toast(
          "Digite um valor válido.",
          "error"
        );

        return false;
      }


      goal.current =
        (
          Number(
            goal.current
          ) || 0
        ) +
        amount;


      saveState();

      renderGoals();


      toast(
        "Valor adicionado à meta.",
        "success"
      );


      return true;
    }
  );
}


/* =======================================================
   PRIVACIDADE
   ======================================================= */

function showPrivacyNotice() {

  if (
    state.settings.privacyDismissed
  ) {

    return;
  }


  const root =
    $("#privacyNotice");


  if (!root) {
    return;
  }


  root.classList.remove(
    "hidden"
  );


  $("#privacyDismiss")
    ?.addEventListener(
      "click",
      dismissPrivacy,
      {
        once: true
      }
    );
}


function dismissPrivacy() {

  state.settings.privacyDismissed =
    true;


  try {

    localStorage.setItem(
      "santinho-privacy-dismissed-v1",
      "1"
    );

  } catch {}


  saveState();


  $("#privacyNotice")
    ?.classList
    .add("hidden");
}


/* =======================================================
   MOTIVAÇÃO
   ======================================================= */

const MOTIVATION_PHRASES = [

  "Cada real organizado hoje facilita o amanhã.",

  "Dinheiro bem cuidado dá liberdade para escolher.",

  "Pequenos controles criam grandes resultados.",

  "Seu orçamento é uma ferramenta, não uma prisão.",

  "Saber para onde seu dinheiro vai é o primeiro passo.",

  "Consistência vale mais que perfeição.",

  "Planejar antes de gastar muda o jogo.",

  "Seu futuro financeiro começa nas decisões de hoje.",

  "Organização financeira também é tranquilidade.",

  "Gaste com intenção, não por impulso."

];


function chooseMotivation() {

  const element =
    $("#motivationText");


  if (!element) {
    return;
  }


  const history =
    Array.isArray(
      state.motivationHistory
    )
      ? state.motivationHistory
      : [];


  const available =
    MOTIVATION_PHRASES.filter(
      phrase =>
        !history.includes(
          phrase
        )
    );


  const source =
    available.length
      ? available
      : MOTIVATION_PHRASES;


  const phrase =
    source[
      Math.floor(
        Math.random() *
        source.length
      )
    ];


  element.textContent =
    phrase;


  state.motivationHistory =
    [
      ...history,
      phrase
    ].slice(-5);


  saveState();
}


/* =======================================================
   UTILITÁRIOS FINANCEIROS
   ======================================================= */

function transactionAmount(
  transaction
) {

  const amount =
    Number(
      transaction?.amount
    );


  return Number.isFinite(
    amount
  )
    ? amount
    : 0;
}


function totalsForTransactions(
  transactions
) {

  let income =
    0;


  let expense =
    0;


  transactions.forEach(
    transaction => {

      const amount =
        transactionAmount(
          transaction
        );


      if (
        transaction.type ===
        "income"
      ) {

        income += amount;

      } else if (
        transaction.type ===
        "expense"
      ) {

        expense += amount;
      }

    }
  );


  return {

    income,

    expense,

    balance:
      income -
      expense

  };
}


function getCategoryTotals(
  transactions
) {

  return transactions.reduce(
    (
      totals,
      transaction
    ) => {

      const category =
        transaction.category ||
        "Outros";


      totals[category] =
        (
          totals[category] ||
          0
        ) +
        transactionAmount(
          transaction
        );


      return totals;

    },
    {}
  );
}


/* =======================================================
   ESTADO TEMPORAL
   ======================================================= */

function isFutureTransaction(
  transaction
) {

  if (!transaction?.date) {

    return false;
  }


  return String(
    transaction.date
  ) >
  todayKey();
}


function isTransactionEffective(
  transaction
) {

  if (!transaction?.date) {

    return false;
  }


  return String(
    transaction.date
  ) <=
  todayKey();
}


/* =======================================================
   DATA ATUAL
   ======================================================= */

function currentYear() {

  return new Date()
    .getFullYear();
}


function currentMonth() {

  return new Date()
    .getMonth() + 1;
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


/* =======================================================
   FORMATAÇÃO MONETÁRIA
   ======================================================= */

const BRL_FORMATTER =
  new Intl.NumberFormat(
    "pt-BR",
    {
      style:
        "currency",

      currency:
        "BRL"
    }
  );


function money(
  value
) {

  return BRL_FORMATTER.format(
    Number(
      value
    ) || 0
  );
}


function parseBRL(
  value
) {

  if (
    typeof value ===
    "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }


  let text =
    String(
      value ??
      ""
    )
      .trim();


  if (!text) {
    return 0;
  }


  text =
    text
      .replace(
        /R\$/gi,
        ""
      )
      .replace(
        /\s/g,
        ""
      );


  /*
   * Brasileiro:
   * 1.234,56
   */
  if (
    text.includes(",")
  ) {

    text =
      text.replace(
        /\./g,
        ""
      );


    text =
      text.replace(
        ",",
        "."
      );

  } else {

    /*
     * Também aceita:
     * 1234.56
     */
    text =
      text.replace(
        /[^0-9.-]/g,
        ""
      );
  }


  const result =
    Number(
      text
    );


  return Number.isFinite(
    result
  )
    ? result
    : 0;
}


function formatBRLInput(
  value
) {

  if (
    value ===
    "" ||
    value ===
    null ||
    value ===
    undefined
  ) {

    return "";
  }


  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return "";
  }


  return number
    .toLocaleString(
      "pt-BR",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    );
}


/* =======================================================
   CATEGORIAS
   ======================================================= */

function categoryOptions(
  selected
) {

  const categories = [

    "Alimentação",

    "Casa",

    "Transporte",

    "Saúde",

    "Educação",

    "Lazer",

    "Academia",

    "Assinaturas",

    "Internet",

    "Celular",

    "Compras",

    "Salário",

    "Freelance",

    "Investimentos",

    "Outros"

  ];


  return categories
    .map(
      category => `

        <option
          value="${escapeAttribute(
            category
          )}"
          ${
            category ===
            selected
              ? "selected"
              : ""
          }
        >
          ${escapeHTML(
            category
          )}
        </option>

      `
    )
    .join("");
}


/* =======================================================
   ESCAPE HTML
   ======================================================= */

function escapeHTML(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(
  value
) {

  return escapeHTML(
    value
  );
}


/* =======================================================
   CLAMP
   ======================================================= */

function clamp(
  value,
  min,
  max
) {

  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


/* =======================================================
   TEMA
   ======================================================= */

function applyTheme() {

  const theme =
    state.settings.theme ||
    "system";


  document.documentElement
    .dataset
    .theme =
    theme;


  const themeSelect =
    $("#themeSelect");


  if (themeSelect) {

    themeSelect.value =
      theme;
  }


  const themeSwitch =
    $("#themeSwitch");


  if (themeSwitch) {

    themeSwitch.checked =
      theme ===
      "light";
  }
}


/* =======================================================
   VISIBILIDADE DO SALDO
   ======================================================= */

let balanceVisible =
  true;


/* =======================================================
   ESTADO INICIAL
   ======================================================= */

let unlocked =
  false;


/* =======================================================
   BANCO DE DADOS
   ======================================================= */

let db =
  null;


function openDB() {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      if (db) {

        resolve(db);

        return;
      }


      const request =
        indexedDB.open(
          DB_NAME,
          DB_VERSION
        );


      request.onupgradeneeded =
        event => {

          const database =
            event.target.result;


          if (
            !database.objectStoreNames.contains(
              STORE
            )
          ) {

            database.createObjectStore(
              STORE
            );
          }

        };


      request.onsuccess =
        event => {

          db =
            event.target.result;


          resolve(
            db
          );
        };


      request.onerror =
        () => {

          reject(
            request.error
          );

        };

    }
  );
}


function idbGet(
  key
) {

  return new Promise(
    async (
      resolve,
      reject
    ) => {

      try {

        const database =
          await openDB();


        const transaction =
          database.transaction(
            STORE,
            "readonly"
          );


        const store =
          transaction.objectStore(
            STORE
          );


        const request =
          store.get(
            key
          );


        request.onsuccess =
          () =>
            resolve(
              request.result
            );


        request.onerror =
          () =>
            reject(
              request.error
            );

      } catch (
        error
      ) {

        reject(
          error
        );
      }

    }
  );
}


function idbSet(
  key,
  value
) {

  return new Promise(
    async (
      resolve,
      reject
    ) => {

      try {

        const database =
          await openDB();


        const transaction =
          database.transaction(
            STORE,
            "readwrite"
          );


        const store =
          transaction.objectStore(
            STORE
          );


        const request =
          store.put(
            value,
            key
          );


        request.onsuccess =
          () =>
            resolve();


        request.onerror =
          () =>
            reject(
              request.error
            );

      } catch (
        error
      ) {

        reject(
          error
        );
      }

    }
  );
}


/* =======================================================
   ESTADO PADRÃO
   ======================================================= */

const SCHEMA =
  1;


function defaultState() {

  return {

    schema:
      SCHEMA,

    credentials:
      null,

    profile: {

      username:
        "",

      email:
        "",

      avatar:
        ""

    },

    settings: {

      theme:
        "system",

      pinHash:
        null,

      lastBackupAt:
        null,

      privacyDismissed:
        false

    },

    transactions:
      [],

    goals:
      [],

    motivationHistory:
      []

  };
}


/* =======================================================
   NORMALIZAÇÃO
   ======================================================= */

function normalize(
  raw
) {

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
      Array.isArray(
        raw.transactions
      )
        ? raw.transactions.map(
            transaction => ({

              ...transaction,

              amount:
                Number(
                  transaction.amount
                ) || 0,

              scheduled:
                transaction?.scheduled ===
                  true ||
                (
                  String(
                    transaction?.date ||
                    ""
                  ) >
                    todayKey()
                )

            })
          )
        : [],

    goals:
      Array.isArray(
        raw.goals
      )
        ? raw.goals
        : [],

    motivationHistory:
      Array.isArray(
        raw.motivationHistory
      )
        ? raw.motivationHistory
        : []

  };
}


/* =======================================================
   CARREGAR ESTADO
   ======================================================= */

async function loadState() {

  try {

    db =
      await openDB();


    const fromIDB =
      await idbGet(
        "state"
      );


    const fromLS =
      JSON.parse(
        localStorage.getItem(
          LS_KEY
        ) ||
        "null"
      );


    const candidate =
      fromIDB ||
      fromLS;


    if (
      candidate &&
      candidate.schema ===
        SCHEMA
    ) {

      state =
        normalize(
          candidate
        );

    } else {

      state =
        defaultState();
    }

  } catch {

    try {

      const fromLS =
        JSON.parse(
          localStorage.getItem(
            LS_KEY
          ) ||
          "null"
        );


      if (
        fromLS?.schema ===
        SCHEMA
      ) {

        state =
          normalize(
            fromLS
          );

      } else {

        state =
          defaultState();
      }

    } catch {

      state =
        defaultState();
    }
  }


  applyTheme();
}


/* =======================================================
   SALVAR ESTADO
   ======================================================= */

let saveTimer =
  null;


async function saveState() {

  state.schema =
    SCHEMA;


  /*
   * Backup rápido local:
   * localStorage.
   */
  try {

    localStorage.setItem(
      LS_KEY,
      JSON.stringify(
        state
      )
    );

  } catch (
    error
  ) {

    console.warn(
      "localStorage indisponível:",
      error
    );
  }


  /*
   * Persistência principal:
   * IndexedDB.
   */
  clearTimeout(
    saveTimer
  );


  saveTimer =
    setTimeout(
      async () => {

        try {

          await idbSet(
            "state",
            state
          );

        } catch (
          error
        ) {

          console.warn(
            "IndexedDB indisponível:",
            error
          );

        }

      },
      80
    );
}


/* =======================================================
   DATA ATUAL
   ======================================================= */

function todayKey() {

  const date =
    new Date();


  return dateKeyFromDate(
    date
  );
}


/* =======================================================
   FRASE INICIAL
   ======================================================= */

function initializeMotivation() {

  if (
    !$("#motivationText")
  ) {

    return;
  }


  if (
    state.motivationHistory
      ?.length
  ) {

    $("#motivationText")
      .textContent =
      state.motivationHistory[
        state.motivationHistory.length -
          1
      ];

    return;
  }


  chooseMotivation();
}


/* =======================================================
   FINALIZAÇÃO DO APP
   ======================================================= */

window.SantinhoFinance = {

  getState() {

    return state;
  },

  getFinancialTotals() {

    return getFinancialTotals();
  },

  getBalanceUntilDate(
    date
  ) {

    return getBalanceUntilDate(
      date
    );
  },

  save() {

    return saveState();
  }

};


/* =======================================================
   FIM DO APP.JS
   ======================================================= */