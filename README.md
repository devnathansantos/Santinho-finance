# Santinho Finance — PWA pessoal

Aplicativo financeiro 100% client-side. Os dados de uso ficam no navegador do aparelho em IndexedDB + localStorage. O projeto não possui API financeira, analytics, login externo ou servidor de banco de dados.

## Hospedar de graça com GitHub Pages

1. Crie uma conta gratuita no GitHub: https://github.com/
2. Crie um repositório público, por exemplo `santinho-finance`.
3. Envie **todo o conteúdo desta pasta** para o repositório (incluindo `index.html`, `app.js`, `style.css`, `manifest.json`, `sw.js` e `assets/`).
4. No repositório, abra **Settings → Pages**.
5. Em **Build and deployment**, escolha **Deploy from a branch**.
6. Selecione a branch `main` e a pasta `/ (root)` e salve.
7. Aguarde o GitHub publicar o site. O endereço será parecido com:
   `https://SEU-USUARIO.github.io/santinho-finance/`
8. Abra esse endereço no Safari do iPhone.

O código do aplicativo fica público no repositório, mas isso não expõe os seus gastos: os dados financeiros são criados e armazenados no iPhone, não no GitHub.

## Backup no iPhone

Dentro do app: **Perfil & Configurações → Fazer Backup Agora → Compartilhar → Salvar em Arquivos → iCloud Drive → Santinho Finance**.

Guarde várias versões dos arquivos `.json` e não dependa de uma única cópia.

## Restaurar

No iPhone novo ou depois de limpar os dados do Safari: abra o app → Perfil & Configurações → Restaurar Dados → escolha o backup `.json` no app Arquivos.

Antes de restaurar, o app pede confirmação porque a restauração substitui os dados locais atuais.

## Instalar no iPhone

Safari → abra o endereço do app → botão Compartilhar → **Adicionar à Tela de Início** → Adicionar.

O app usa `display: standalone`, ícone próprio, Safe Area do iPhone e Service Worker para funcionar offline depois da primeira carga.
