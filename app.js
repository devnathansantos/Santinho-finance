/* Santinho Finance — 100% client-side.
   Sem fetch(), XMLHttpRequest, WebSocket ou chamadas a APIs externas.
   O Service Worker também só trabalha com o cache local do app. */

(() => {
  "use strict";

  const DB_NAME = "santinho-finance-db";
  const DB_VERSION = 1;
  const STORE = "app";
  const LS_KEY = "santinho-finance-snapshot-v1";
  const SESSION_KEY = "santinho-session";
  const SCHEMA = 1;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const money = n => new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"}).format(Number(n)||0);
  const uid = p => `${p}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

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
    profile: {username:"", email:"", avatar:null},
    transactions: [],
    goals: [],
    settings: {theme:"dark", pinHash:null, lastBackupAt:null},
    motivationHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let state = defaultState();
  let db = null;
  let balanceVisible = true;
  let currentPage = "dashboard";
  let unlocked = false;

  // ---------- IndexedDB + localStorage ----------
  function openDB() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,"readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(key,value) {
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,"readwrite").objectStore(STORE).put(value,key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function loadState() {
    try {
      db = await openDB();
      const fromIDB = await idbGet("state");
      const fromLS = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      const candidate = fromIDB || fromLS;
      if (candidate && candidate.schema === SCHEMA) state = normalize(candidate);
      else state = defaultState();
    } catch {
      try {
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY) || "null");
        if (fromLS?.schema === SCHEMA) state = normalize(fromLS);
      } catch { state = defaultState(); }
    }
    applyTheme();
  }

  function normalize(raw) {
    const d = defaultState();
    return {
      ...d, ...raw,
      profile:{...d.profile,...(raw.profile||{})},
      settings:{...d.settings,...(raw.settings||{})},
      transactions:Array.isArray(raw.transactions)?raw.transactions:[],
      goals:Array.isArray(raw.goals)?raw.goals:[],
      motivationHistory:Array.isArray(raw.motivationHistory)?raw.motivationHistory:[]
    };
  }

  let saveTimer = null;
  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { if (db) await idbSet("state", state); } catch (e) { console.warn("IndexedDB save failed", e); }
    }, 0);
  }

  // ---------- Crypto ----------
  async function hashSecret(secret, salt) {
    // PBKDF2 is deliberately local: credentials never leave this browser.
    const keyMaterial = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {name:"PBKDF2", salt:new TextEncoder().encode(salt), iterations:150000, hash:"SHA-256"},
      keyMaterial, 256
    );
    return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  function makeCredential(identifier, password) {
    return {identifier:identifier.trim().toLowerCase(), salt:crypto.randomUUID(), passwordHash:null};
  }

  // ---------- UI auth ----------
  function show(view) {
    ["authView","pinView","mainView"].forEach(id => $("#"+id).classList.toggle("hidden", id !== view));
  }

  function authMessage(msg, error=false) {
    $("#authMessage").textContent = msg;
    $("#authMessage").classList.toggle("error",error);
  }
  function pinMessage(msg,error=false) {
    $("#pinMessage").textContent=msg;
    $("#pinMessage").classList.toggle("error",error);
  }

  function updateAuthMode() {
    const hasAccount = !!state.credentials;
    $("#loginForm").classList.toggle("hidden", !hasAccount);
    $("#setupForm").classList.toggle("hidden", hasAccount);
    $("#toggleSetup").textContent = hasAccount ? "Criar/alterar acesso local" : "Já tenho uma conta local";
    $("#authTitle").textContent = hasAccount ? "Entrar no Santinho Finance" : "Criar seu Santinho Finance";
    $("#authSubtitle").textContent = hasAccount
      ? "A autenticação acontece somente neste aparelho."
      : "Crie um acesso local. Nenhuma credencial será enviada para a internet.";
  }

  async function setupAccount(e) {
    e.preventDefault();
    const username=$("#setupUsername").value.trim();
    const email=$("#setupEmail").value.trim();
    const p=$("#setupPassword").value;
    const p2=$("#setupPassword2").value;
    if (p !== p2) return authMessage("As senhas não conferem.",true);
    if (p.length < 6) return authMessage("Use pelo menos 6 caracteres.",true);
    const identifier = email || username;
    const cred = makeCredential(identifier,p);
    cred.passwordHash = await hashSecret(p,cred.salt);
    state.credentials = cred;
    state.profile.username = username;
    state.profile.email = email;
    saveState();
    updateAuthMode();
    authMessage("Conta local criada. Entre para continuar.",false);
    $("#loginIdentifier").value=identifier;
  }

  async function login(e) {
    e.preventDefault();
    const identifier=$("#loginIdentifier").value.trim().toLowerCase();
    const password=$("#loginPassword").value;
    const c=state.credentials;
    const username=String(state.profile.username||"").trim().toLowerCase();
    const email=String(state.profile.email||"").trim().toLowerCase();
    if (!c || ![c.identifier, username, email].filter(Boolean).includes(identifier))
      return authMessage("Username/e-mail ou senha inválidos.",true);
    const digest=await hashSecret(password,c.salt);
    if (digest !== c.passwordHash) return authMessage("Username/e-mail ou senha inválidos.",true);
    sessionStorage.setItem(SESSION_KEY,"1");
    unlocked=false;
    if (state.settings.pinHash) {
      show("pinView");
      $("#pinInput").value="";
      $("#pinInput").focus();
    } else {
      unlocked=true; enterApp();
    }
  }

  async function verifyPin(e) {
    e.preventDefault();
    const pin=$("#pinInput").value.trim();
    if (!/^\d{4,6}$/.test(pin)) return pinMessage("Use de 4 a 6 números.",true);
    const digest=await hashSecret(pin,state.settings.pinHash.salt);
    if (digest !== state.settings.pinHash.hash) return pinMessage("PIN incorreto.",true);
    unlocked=true; pinMessage(""); enterApp();
  }

  function enterApp() {
    show("mainView");
    renderAll();
    chooseMotivation();
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    unlocked=false;
    show("authView");
    updateAuthMode();
    $("#loginPassword").value="";
  }

  function lockNow() {
    unlocked=false;
    if (state.settings.pinHash) { show("pinView"); $("#pinInput").value=""; }
    else logout();
  }

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.classList.toggle("light", state.settings.theme === "light");
    $("#themeSwitch").checked = state.settings.theme === "light";
  }

  // ---------- Navigation ----------
  function navigate(page) {
    currentPage=page;
    $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
    $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.nav===page));
    if(page==="dashboard") renderDashboard();
    if(page==="transactions") renderTransactions();
    if(page==="goals") renderGoals();
    if(page==="profile") renderProfile();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  // ---------- Motivation ----------
  function chooseMotivation() {
    const last = state.motivationHistory.at(-1);
    const choices=MOTIVATIONS.filter(x=>x!==last);
    const phrase=choices[Math.floor(Math.random()*choices.length)];
    state.motivationHistory=[...state.motivationHistory,phrase].slice(-5);
    $("#motivation").textContent=phrase;
    saveState();
  }

  // ---------- Dashboard ----------
  function monthKey(date=new Date()) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function currentMonthTx() { return state.transactions.filter(t=>monthKey(t.date)===monthKey()); }
  function totals() {
    const tx=currentMonthTx();
    const income=tx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
    const expense=tx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
    return {income,expense,balance:income-expense};
  }
  function renderDashboard() {
    const t=totals();
    $("#welcomeName").textContent=state.profile.username || "amigo";
    $("#balanceValue").textContent=balanceVisible?money(t.balance):"••••••";
    $("#incomeMonth").textContent=balanceVisible?money(t.income):"••••";
    $("#expenseMonth").textContent=balanceVisible?money(t.expense):"••••";
    $("#dashboardAvatar").src=state.profile.avatar || "assets/logo-192.png";
    renderCategories();
    const recent=[...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
    renderTxList($("#recentTransactions"),recent);
  }

  function renderCategories() {
    const expenses=currentMonthTx().filter(t=>t.type==="expense");
    const totalsBy={};
    expenses.forEach(t=>totalsBy[t.category]=(totalsBy[t.category]||0)+Number(t.amount));
    const total=expenses.reduce((s,t)=>s+Number(t.amount),0);
    const entries=Object.entries(totalsBy).sort((a,b)=>b[1]-a[1]).slice(0,6);
    $("#categorySummary").innerHTML=entries.length ? entries.map(([cat,val])=>{
      const pct=total?Math.round(val/total*100):0;
      return `<div class="category-row"><div class="category-meta"><span>${escapeHTML(cat)}</span><b>${money(val)} · ${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join("") : `<div class="empty">Ainda não há despesas neste mês.</div>`;
  }

  function renderTxList(container,list) {
    if(!list.length){container.innerHTML=`<div class="empty">Nenhuma transação encontrada.</div>`;return}
    container.innerHTML=list.map(t=>`
      <article class="transaction-item">
        <div class="tx-icon">${t.type==="income"?"↗":"↘"}</div>
        <div class="tx-main"><b>${escapeHTML(t.description)}</b><small>${escapeHTML(t.category)} · ${new Date(t.date).toLocaleDateString("pt-BR")}</small></div>
        <span class="tx-value ${t.type==="income"?"income-text":"expense-text"}">${t.type==="income"?"+":"−"} ${money(t.amount)}</span>
        <button class="link-btn" data-delete-tx="${t.id}" type="button" aria-label="Excluir">×</button>
      </article>`).join("");
  }

  function renderTransactions() {
    const q=$("#transactionSearch").value.trim().toLowerCase();
    const type=$("#transactionType").value;
    const list=[...state.transactions].filter(t=>(type==="all"||t.type===type)&&(`${t.description} ${t.category}`).toLowerCase().includes(q)).sort((a,b)=>new Date(b.date)-new Date(a.date));
    renderTxList($("#allTransactions"),list);
  }

  // ---------- Goals ----------
  function renderGoals() {
    const root=$("#goalsList");
    if(!state.goals.length){root.innerHTML=`<div class="empty">Crie sua primeira meta financeira.</div>`;return}
    root.innerHTML=state.goals.map(g=>{
      const pct=clamp((Number(g.current)/Number(g.target))*100,0,100);
      return `<article class="goal-card glass">
        <div class="goal-head"><b>${escapeHTML(g.name)}</b><span>${money(g.current)} / ${money(g.target)}</span></div>
        <div class="goal-progress"><i style="width:${pct}%"></i></div>
        <div class="goal-foot"><span>${Math.round(pct)}% concluído</span><span>${g.deadline?new Date(g.deadline+"T12:00:00").toLocaleDateString("pt-BR"):"Sem prazo"}</span></div>
        <div class="goal-actions"><button class="btn btn-secondary btn-small" data-add-goal="${g.id}">Adicionar valor</button><button class="btn btn-secondary btn-small" data-delete-goal="${g.id}">Excluir</button></div>
      </article>`;
    }).join("");
  }

  // ---------- Profile ----------
  function renderProfile() {
    $("#profileUsername").value=state.profile.username||"";
    $("#profileEmail").value=state.profile.email||"";
    $("#profileAvatar").src=state.profile.avatar||"assets/logo-192.png";
    $("#pinStatus").textContent=state.settings.pinHash?"Ativado":"Desativado";
    $("#configurePin").textContent=state.settings.pinHash?"Alterar PIN":"Configurar";
    applyTheme();
  }

  // ---------- Modals ----------
  function openModal(title,body,onSubmit) {
    const root=$("#modalRoot");
    root.innerHTML=`<div class="modal glass" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${escapeHTML(title)}</h3><button class="modal-close" type="button">×</button></div>
      <form id="modalForm" class="form-grid">${body}<div class="modal-actions"><button class="btn btn-secondary modal-cancel" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>
    </div>`;
    root.classList.remove("hidden");
    $(".modal-close",root).onclick=closeModal;
    $(".modal-cancel",root).onclick=closeModal;
    $("#modalForm",root).onsubmit=async e=>{e.preventDefault();await onSubmit(new FormData(e.currentTarget));};
    const first=$("input,select",root); if(first) setTimeout(()=>first.focus(),50);
  }
  function closeModal(){ $("#modalRoot").classList.add("hidden"); $("#modalRoot").innerHTML=""; }

  function transactionModal(type="expense") {
    const cats=["Moradia","Alimentação","Transporte","Lazer","Estudos","Saúde","Assinaturas","Salário","Freelance","Investimentos","Outros"];
    openModal(type==="income"?"Adicionar Renda":"Adicionar Despesa",`
      <label>Descrição<input name="description" maxlength="80" required placeholder="${type==="income"?"Ex.: Bolsa / salário":"Ex.: Mercado"}"></label>
      <label>Valor (R$)<input name="amount" inputmode="decimal" type="number" min="0.01" step="0.01" required></label>
      <label>Categoria<select name="category">${cats.map(c=>`<option>${c}</option>`).join("")}</select></label>
      <label>Data<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
      <label>Observação<textarea name="note" maxlength="240" style="min-height:80px;border:1px solid var(--line);background:rgba(0,0,0,.16);color:var(--text);border-radius:15px;padding:12px"></textarea></label>
    `, async fd=>{
      const amount=Number(fd.get("amount"));
      if(!Number.isFinite(amount)||amount<=0) return toast("Informe um valor válido.");
      state.transactions.push({id:uid("tx"),type,description:String(fd.get("description")).trim(),amount,category:String(fd.get("category")),date:String(fd.get("date")),note:String(fd.get("note")||"").trim()});
      saveState();closeModal();renderAll();toast(type==="income"?"Renda adicionada!":"Despesa adicionada!");
    });
  }

  function goalModal(existing=null) {
    openModal(existing?"Adicionar à meta":"Criar nova meta", existing ? `
      <p class="muted">Meta: <b>${escapeHTML(existing.name)}</b></p>
      <label>Valor a adicionar (R$)<input name="add" type="number" min="0.01" step="0.01" required></label>
    ` : `
      <label>Nome da meta<input name="name" maxlength="60" required placeholder="Ex.: Reserva de emergência"></label>
      <label>Valor alvo (R$)<input name="target" type="number" min="0.01" step="0.01" required></label>
      <label>Valor inicial (R$)<input name="current" type="number" min="0" step="0.01" value="0"></label>
      <label>Prazo (opcional)<input name="deadline" type="date"></label>
    `, async fd=>{
      if(existing){
        const add=Number(fd.get("add"));
        if(add<=0)return toast("Informe um valor válido.");
        existing.current=Number(existing.current)+add;
      }else{
        const target=Number(fd.get("target"));
        if(target<=0)return toast("O alvo precisa ser maior que zero.");
        state.goals.push({id:uid("goal"),name:String(fd.get("name")).trim(),target,current:Number(fd.get("current")||0),deadline:String(fd.get("deadline")||"")});
      }
      saveState();closeModal();renderGoals();toast("Meta atualizada!");
    });
  }

  async function configurePin() {
    if(state.settings.pinHash){
      openModal("Alterar PIN",`
        <label>PIN atual<input name="old" inputmode="numeric" type="password" pattern="\\d{4,6}" maxlength="6" required></label>
        <label>Novo PIN<input name="pin" inputmode="numeric" type="password" pattern="\\d{4,6}" maxlength="6" minlength="4" required></label>
      `,async fd=>{
        const old=String(fd.get("old")), pin=String(fd.get("pin"));
        const oldHash=await hashSecret(old,state.settings.pinHash.salt);
        if(oldHash!==state.settings.pinHash.hash)return toast("PIN atual incorreto.");
        if(!/^\d{4,6}$/.test(pin))return toast("O PIN precisa ter 4 a 6 números.");
        const salt=crypto.randomUUID();
        state.settings.pinHash={salt,hash:await hashSecret(pin,salt)};
        saveState();closeModal();renderProfile();toast("PIN alterado.");
      });
    }else{
      openModal("Configurar PIN",`
        <p class="muted">O PIN será solicitado após cada nova abertura/recarregamento do app, depois da autenticação local.</p>
        <label>Novo PIN<input name="pin" inputmode="numeric" type="password" pattern="\\d{4,6}" maxlength="6" minlength="4" required placeholder="4 a 6 números"></label>
      `,async fd=>{
        const pin=String(fd.get("pin"));
        if(!/^\d{4,6}$/.test(pin))return toast("O PIN precisa ter 4 a 6 números.");
        const salt=crypto.randomUUID();
        state.settings.pinHash={salt,hash:await hashSecret(pin,salt)};
        saveState();closeModal();renderProfile();toast("PIN ativado.");
      });
    }
  }

  // ---------- Backup / restore ----------
  function backupObject() {
    return {
      app:"Santinho Finance",
      version:1,
      exportedAt:new Date().toISOString(),
      data:state
    };
  }

  function backupFileName() {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth()+1).padStart(2,"0"),
      String(now.getDate()).padStart(2,"0"),
      "-",
      String(now.getHours()).padStart(2,"0"),
      String(now.getMinutes()).padStart(2,"0")
    ].join("");
    return `santinho-finance-backup-${stamp}.json`;
  }

  function rememberBackup() {
    state.settings.lastBackupAt = new Date().toISOString();
    saveState();
    renderProfile();
  }

  async function backupNow() {
    const json=JSON.stringify(backupObject(),null,2);
    const blob=new Blob([json],{type:"application/json"});
    const file=new File([blob],backupFileName(),{type:"application/json"});
    try{
      // On iPhone/iPad, the native share sheet lets the user choose
      // "Save to Files" and then iCloud Drive. Nothing is uploaded by the app.
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        await navigator.share({
          title:"Backup Santinho Finance",
          text:"Backup local do Santinho Finance. Salve em Arquivos/iCloud Drive para não perder seus dados.",
          files:[file]
        });
        rememberBackup();
        $("#backupStatus").textContent="Backup criado. No iPhone, escolha 'Salvar em Arquivos' → iCloud Drive.";
      }else{
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;
        a.download=file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1500);
        rememberBackup();
        $("#backupStatus").textContent="Backup baixado. Guarde o arquivo em um local seguro, como o iCloud Drive.";
      }
    }catch(e){
      if(e?.name==="AbortError") $("#backupStatus").textContent="Compartilhamento cancelado. Nenhum dado foi alterado.";
      else $("#backupStatus").textContent="Não foi possível criar o backup. Tente novamente.";
    }
  }

  async function restoreFile(file) {
    if(!file)return;
    try{
      const raw=JSON.parse(await file.text());
      if(raw?.app!=="Santinho Finance" || raw?.version!==1 || raw?.data?.schema!==SCHEMA) throw new Error("invalid");
      const incoming=normalize(raw.data);
      if(!incoming.profile || !Array.isArray(incoming.transactions) || !Array.isArray(incoming.goals)) throw new Error("invalid");
      const date = raw.exportedAt ? new Date(raw.exportedAt).toLocaleString("pt-BR") : "data desconhecida";
      if(!confirm(`Restaurar o backup de ${date} vai substituir os dados locais atuais.\n\nFaça um backup atual antes de continuar, se quiser poder voltar atrás.\n\nContinuar?`)) return;
      state=incoming;
      saveState();
      applyTheme();renderAll();
      $("#backupStatus").textContent="Dados restaurados com sucesso.";
      toast("Backup restaurado.");
    }catch{ $("#backupStatus").textContent="Arquivo inválido ou corrompido."; }
    $("#restoreInput").value="";
  }

  // ---------- Image -> Base64 ----------
  function readImageAsBase64(file) {
    return new Promise((resolve,reject)=>{
      if(!file.type.startsWith("image/"))return reject(new Error("type"));
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Rendering ----------
  function renderAll(){renderDashboard();renderTransactions();renderGoals();renderProfile();}
  function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200);}

  // ---------- Events ----------
  function bindEvents(){
    $("#toggleSetup").onclick=()=>{
      const setupHidden=$("#setupForm").classList.contains("hidden");
      $("#loginForm").classList.toggle("hidden",setupHidden);
      $("#setupForm").classList.toggle("hidden",!setupHidden);
      $("#authTitle").textContent=setupHidden?"Criar seu Santinho Finance":"Entrar no Santinho Finance";
      $("#authSubtitle").textContent=setupHidden?"Crie um acesso local. Nenhuma credencial será enviada para a internet.":"A autenticação acontece somente neste aparelho.";
    };
    $("#setupForm").onsubmit=setupAccount;
    $("#loginForm").onsubmit=login;
    $("#pinForm").onsubmit=verifyPin;
    $("#logoutFromPin").onclick=logout;
    $("#lockNow").onclick=lockNow;
    $("#mobileBrand").onclick=()=>navigate("dashboard");

    $$("[data-nav]").forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
    $("#addExpense").onclick=()=>transactionModal("expense");
    $("#addIncome").onclick=()=>transactionModal("income");
    $("#addTransactionTop").onclick=()=>transactionModal("expense");
    $("#addGoal").onclick=()=>goalModal();
    $("#toggleBalance").onclick=()=>{balanceVisible=!balanceVisible;renderDashboard();};
    $("#transactionSearch").oninput=renderTransactions;
    $("#transactionType").onchange=renderTransactions;

    $("#themeSwitch").onchange=e=>{state.settings.theme=e.target.checked?"light":"dark";saveState();applyTheme();toast("Tema atualizado.");};
    $("#configurePin").onclick=configurePin;
    $("#saveProfile").onclick=()=>{state.profile.username=$("#profileUsername").value.trim();state.profile.email=$("#profileEmail").value.trim();saveState();renderDashboard();toast("Perfil salvo.");};
    $("#profilePhoto").onchange=async e=>{
      const f=e.target.files?.[0];if(!f)return;
      try{
        const data=await readImageAsBase64(f);
        if(data.length>3_000_000)return toast("Escolha uma imagem menor para manter o armazenamento leve.");
        state.profile.avatar=data;saveState();renderProfile();renderDashboard();toast("Foto atualizada.");
      }catch{toast("Não foi possível ler a imagem.");}
    };
    $("#backupNow").onclick=backupNow;
    $("#restoreData").onclick=()=>$("#restoreInput").click();
    $("#restoreInput").onchange=e=>restoreFile(e.target.files?.[0]);
    $("#logout").onclick=logout;

    document.addEventListener("click",e=>{
      const tx=e.target.closest("[data-delete-tx]");
      if(tx){const id=tx.dataset.deleteTx;if(confirm("Excluir esta transação?")){state.transactions=state.transactions.filter(x=>x.id!==id);saveState();renderAll();toast("Transação excluída.");}}
      const dg=e.target.closest("[data-delete-goal]");
      if(dg){if(confirm("Excluir esta meta?")){state.goals=state.goals.filter(x=>x.id!==dg.dataset.deleteGoal);saveState();renderGoals();toast("Meta excluída.");}}
      const ag=e.target.closest("[data-add-goal]");
      if(ag){const g=state.goals.find(x=>x.id===ag.dataset.addGoal);if(g)goalModal(g);}
    });

    $("#modalRoot").addEventListener("click",e=>{if(e.target.id==="modalRoot")closeModal();});
  }

  async function init(){
    bindEvents();
    await loadState();
    updateAuthMode();
    if(state.credentials){
      show("authView");
    }else{
      show("authView");
      $("#loginForm").classList.add("hidden");
      $("#setupForm").classList.remove("hidden");
      updateAuthMode();
    }
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    }
  }

  init();
})();