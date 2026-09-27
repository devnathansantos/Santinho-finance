# 👻 Santinho Finance

Um aplicativo de controle financeiro pessoal, simples, privado e desenvolvido para funcionar diretamente no dispositivo do usuário.

## 🔐 Privacidade

O Santinho Finance foi desenvolvido com foco em privacidade.

- Os dados financeiros ficam armazenados localmente no dispositivo.
- Não existe banco de dados financeiro central.
- Não existe servidor recebendo suas movimentações.
- O aplicativo não precisa de uma conta externa para funcionar.
- GitHub Pages é utilizado apenas para hospedar os arquivos do aplicativo.
- Seus dados financeiros não são enviados para o GitHub.
- Cada dispositivo possui seus próprios dados locais.

> ⚠️ Como os dados ficam armazenados localmente, é importante realizar backups regularmente.

---

## 💰 Recursos

### Dashboard

- Saldo atual
- Receitas
- Despesas
- Resultado financeiro
- Evolução financeira
- Distribuição de despesas
- Transações recentes
- Metas financeiras

### Transações

- Adicionar receitas
- Adicionar despesas
- Valores em reais
- Suporte a valores decimais com vírgula
- Categorias
- Datas
- Descrições
- Transações recorrentes
- Recorrência diária
- Recorrência semanal
- Recorrência quinzenal
- Recorrência mensal
- Data final para recorrências
- Identificação de lançamentos programados

### Metas

- Criar metas
- Definir valor desejado
- Acompanhar progresso
- Registrar contribuições
- Excluir metas

### Perfil

- Nome de usuário
- E-mail
- Foto de perfil
- Alteração de tema
- Tema do dispositivo
- Tema claro
- Tema escuro
- Bloqueio por PIN

### Backup

O aplicativo possui recursos para:

- Criar backup dos dados
- Compartilhar o backup
- Baixar o arquivo de backup
- Restaurar dados através de um arquivo JSON

O backup é realizado pelo próprio usuário e deve ser guardado em um local seguro.

---

## 📱 PWA

O Santinho Finance pode ser instalado como aplicativo no celular.

No iPhone:

1. Abra o aplicativo pelo Safari.
2. Toque em **Compartilhar**.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme a instalação.

Depois disso, o Santinho Finance poderá ser aberto como um aplicativo independente.

---

## 🗂️ Armazenamento

O aplicativo utiliza tecnologias nativas do navegador:

- IndexedDB
- localStorage

Nenhuma dessas tecnologias representa um banco de dados compartilhado entre usuários.

Cada instalação/dispositivo possui seu próprio armazenamento local.

---

## 🌐 Hospedagem

O projeto pode ser hospedado gratuitamente utilizando GitHub Pages.

O GitHub hospeda apenas os arquivos necessários para executar o aplicativo.

Os dados financeiros criados pelo usuário permanecem no armazenamento local do dispositivo.

---

## 🛠️ Tecnologias

- HTML5
- CSS3
- JavaScript
- IndexedDB
- localStorage
- Service Worker
- Web App Manifest
- PWA
- GitHub Pages

---

## 📁 Estrutura

```text
Santinho-finance/
│
├── index.html
├── style.css
├── app.js
├── manifest.json
├── sw.js
├── .nojekyll
│
├── logo.png
├── logo-192.png
├── logo-512.png
└── apple-touch-icon.png