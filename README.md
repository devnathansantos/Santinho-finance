# Santinho Finance V8

Versão revisada com foco em Safari/iPhone e PWA.

## O que mudou

- Layout de viewport sem depender de `100dvh` para overlays críticos.
- Altura do viewport sincronizada pelo `visualViewport` quando disponível.
- Modais, privacidade e assistente usam uma camada de rolagem própria e bloqueiam o scroll da página.
- Login e cadastro revisados.
- Análise ganhou tabela mensal funcional.
- Análise ganhou seleção de mês e uma “Fatura do mês” com todos os gastos realizados daquele mês.
- Transações agora são clicáveis.
- Ao abrir uma transação recorrente, aparecem os demais lançamentos da série, datas e situação.
- Edição de transação individual.
- Edição de toda uma recorrência.
- Exclusão individual.
- Assistente passou a pedir, nesta ordem: nome/descrição, valor, data, categoria e recorrência, além do tipo quando necessário.
- Assistente cria as transações realmente no armazenamento local e as inclui no cálculo do saldo.
- Assistente usa um robô SVG próprio em vez de emoji.
- Backup/restore, metas, PIN, tema e exportações continuam locais.
- Service Worker atualizado para V8.

## Arquivos

- `index.html` — estrutura e novas áreas de análise/assistente.
- `style.css` — layout inteiro revisado e correções de Safari/responsividade.
- `app.js` — lógica de transações, recorrências, análise, assistente, autenticação e viewport.
- `manifest.json` — PWA.
- `sw.js` — cache V8.
- `assistant-robot.svg` — ícone do robô do assistente.
- `logo*.png` — ícones locais do pacote.

## Privacidade

Não há backend financeiro. Dados ficam no dispositivo em IndexedDB + localStorage.
