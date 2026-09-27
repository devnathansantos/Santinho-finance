# Santinho Finance V9

Versão revisada com foco em Safari/iPhone e PWA.

## O que mudou

- Layout de viewport sem depender de `100dvh` para overlays críticos.
- Altura do viewport sincronizada pelo `visualViewport` quando disponível.
- Modais, privacidade e assistente usam uma camada de rolagem própria e bloqueiam o scroll da página.
- Login e cadastro revisados.
- Análise ganhou tabela mensal funcional.
- Análise mantém a seleção de ano no topo e move a navegação do mês para perto do resumo mensal, com botões personalizados.
- O mês selecionado continua ligado à “Fatura do mês”, permitindo comparar o mesmo mês entre anos diferentes.
- Transações agora são clicáveis.
- Ao abrir uma transação recorrente, aparecem os demais lançamentos da série, datas e situação.
- Edição de transação individual.
- Edição de toda uma recorrência.
- Exclusão individual.
- Assistente passou a pedir, nesta ordem: nome/descrição, valor, data, categoria e recorrência, além do tipo quando necessário.
- Assistente cria as transações realmente no armazenamento local e as inclui no cálculo do saldo.
- O botão flutuante do Assistente usa ícone de microfone; o robô permanece dentro do cartão do assistente.
- Backup/restore, metas, PIN, tema e exportações continuam locais.
- Service Worker atualizado para V9.
- Ajustes de espaçamento e centralização no perfil, com correção do layout móvel.
- O cartão do Assistente não abre automaticamente ao entrar no aplicativo; ele só aparece quando acionado pelo usuário.

## Arquivos

- `index.html` — estrutura e novas áreas de análise/assistente.
- `style.css` — layout inteiro revisado e correções de Safari/responsividade.
- `app.js` — lógica de transações, recorrências, análise, assistente, autenticação e viewport.
- `manifest.json` — PWA.
- `sw.js` — cache V9.
- `assistant-robot.svg` — ícone do robô dentro do cartão do assistente.
- `microphone.svg` — ícone de microfone usado pelos controles de voz.
- `logo*.png` — ícones locais do pacote.

## Privacidade

Não há backend financeiro. Dados ficam no dispositivo em IndexedDB + localStorage.


### Visualização e desempenho no PWA

A versão instalada como PWA tende a se comportar melhor para visualizar o aplicativo e definir/avaliar o desempenho da interface no iPhone. A versão em Safari continua disponível e funcional.
