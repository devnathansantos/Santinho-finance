# 👻 Santinho Finance

> Um aplicativo financeiro pessoal, privado e 100% client-side, desenvolvido como uma Progressive Web App (PWA).

O **Santinho Finance** foi criado para facilitar o controle financeiro pessoal sem depender de servidores, bancos de dados externos ou serviços de terceiros.

Toda a informação financeira é processada e armazenada **localmente no dispositivo do usuário**.

---

## ✨ Visão geral

O Santinho Finance permite registrar e acompanhar:

- 💰 Entradas
- 💸 Despesas
- 📊 Análises financeiras
- 🎯 Metas
- 👤 Perfil
- 🔐 Senha e PIN local
- 🌙 Tema claro e escuro
- 💾 Backup e restauração
- 📱 Instalação como aplicativo no celular
- 📴 Funcionamento offline após o primeiro carregamento

O projeto foi desenvolvido pensando principalmente em **celulares**, especialmente no uso como aplicativo instalado no iPhone através do Safari.

---

## 🔒 Privacidade

O Santinho Finance foi projetado para não depender de um servidor financeiro.

### Os dados financeiros ficam no dispositivo

As informações do usuário são armazenadas utilizando:

- **IndexedDB**
- **localStorage**

O GitHub Pages hospeda apenas os arquivos do aplicativo.

O repositório **não recebe automaticamente**:

- salários;
- despesas;
- receitas;
- metas;
- transações;
- senhas;
- PIN;
- informações financeiras.

### Importante

O fato de os dados serem locais significa que o usuário é responsável por manter seus próprios backups.

Se os dados locais do navegador forem apagados, o backup `.json` poderá ser utilizado para restaurá-los.

---

# 🚀 Funcionalidades

## 🏠 Dashboard

A tela inicial apresenta uma visão geral das finanças.

Inclui:

- saldo atual;
- total de entradas;
- total de despesas;
- movimentações recentes;
- categorias de gastos;
- atalhos para adicionar entrada ou despesa;
- frase motivacional do Santinho.

---

## 💰 Entradas e despesas

É possível registrar movimentações financeiras informando dados como:

- tipo da movimentação;
- valor;
- categoria;
- data;
- descrição.

As movimentações são armazenadas localmente e utilizadas automaticamente nos cálculos do aplicativo.

---

## 📊 Análise financeira

A seção **Análise** transforma as transações registradas em informações mais fáceis de interpretar.

Inclui:

- seleção do ano;
- total anual de despesas;
- total anual de entradas;
- saldo anual;
- média mensal de despesas;
- mês com maior gasto;
- mês com menor gasto;
- evolução das despesas ao longo dos meses;
- distribuição das despesas por categoria.

### Gastos mensais

Os valores de cada mês são calculados diretamente a partir das transações registradas.

Assim, os gráficos não são dados fictícios ou estáticos:

> **quanto mais o usuário registra, mais a análise representa sua realidade financeira.**

---

## 🎯 Metas financeiras

O usuário pode criar objetivos financeiros e acompanhar seu progresso.

Uma meta pode representar, por exemplo:

- comprar um computador;
- fazer uma viagem;
- montar uma reserva;
- comprar um celular;
- economizar para um projeto.

O progresso é calculado a partir do valor atual e do objetivo definido.

---

## 👤 Perfil

O perfil permite configurar informações pessoais utilizadas pelo aplicativo.

Também é possível:

- adicionar foto;
- alterar informações do perfil;
- visualizar configurações;
- alterar o tema;
- configurar PIN;
- realizar backup;
- restaurar dados;
- bloquear o aplicativo;
- sair da sessão.

---

# 🔐 Segurança

O Santinho Finance foi desenvolvido com foco em segurança no lado do cliente.

### Senha

A senha não é simplesmente armazenada como texto puro.

O aplicativo utiliza:

- Web Crypto API;
- PBKDF2;
- SHA-256;
- salt aleatório.

### PIN

O usuário pode configurar um PIN adicional para bloquear o aplicativo.

O PIN também é armazenado utilizando hash.

### Conteúdo local

O aplicativo não utiliza:

- APIs financeiras externas;
- analytics;
- servidores próprios;
- banco de dados remoto;
- login social;
- serviços externos para armazenar transações.

---

# 💾 Backup

O Santinho Finance possui sistema de backup através de arquivos `.json`.

O usuário pode gerar uma cópia dos dados e salvá-la, por exemplo, no:

- iCloud Drive;
- Google Drive;
- OneDrive;
- computador;
- armazenamento local;
- outro serviço de arquivos.

No iPhone, o fluxo recomendado é:

**Perfil → Fazer Backup Agora → Compartilhar → Salvar em Arquivos**

### ⚠️ Recomendação

Mantenha mais de uma cópia do backup.

Por exemplo:

```text
Santinho-Finance/
├── backup-2026-09-01.json
├── backup-2026-09-15.json
└── backup-2026-09-30.json