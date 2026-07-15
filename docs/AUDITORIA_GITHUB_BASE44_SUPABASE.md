# Auditoria GitHub, Base44 e Supabase

Data da auditoria: 15/07/2026

## Escopo verificado

- Repositório oficial: `master-areiaana/Sistema-Simplificado-Cobranca`.
- Branch de trabalho: `ajuste-layout-base44-supabase`.
- Referência visual: `blazing-cred-flow-pro.zip`.
- Supabase informado: projeto `bjesjsryewgvtppalzib`.
- Publicação: GitHub Pages.

O ZIP da Base44 foi tratado somente como referência visual. O backend oficial permanece Supabase, com modo local apenas quando o Supabase não estiver configurado.

## Estado inicial

- A branch de trabalho e a `main` apontavam para o mesmo commit (`7a9d5cf`) no início.
- O repositório tinha 98 testes e todos passavam.
- O lint tinha cinco imports não utilizados.
- O ZIP e o GitHub tinham 129 arquivos em comum; a maior parte das diferenças era apenas de fim de linha.
- As diferenças materiais estavam concentradas em `Dashboard.jsx`, `ImportPreviewPanel.jsx`, `TabelaCarteira.jsx`, `UI.jsx`, `index.css`, `base44Client.js` e na camada de importação.
- A URL publicada em minúsculas carregava o `index.html` de contingência do código-fonte, não o artefato compilado do Vite. A URL com o nome do repositório em maiúsculas retornava 404.

## Causas técnicas encontradas

### Importação e conciliação

1. A chave oficial usada pelo frontend não incluía a origem, enquanto o índice único documentado no Supabase incluía `source`. Isso permitia colisões lógicas entre EB e Topcon durante a conciliação.
2. A Pré-validação consultava novamente até 5.000 títulos no Supabase, embora a tela já tivesse carregado a carteira. Essa chamada remota era uma causa provável da demora em “Comparando com Carteira”.
3. A aplicação segura fazia `bulkCreate` em lotes e depois atualizações individuais. Uma falha no meio deixava aplicação parcial.
4. O adaptador de dados gravava no armazenamento local antes da confirmação remota e convertia falhas do Supabase em aparente sucesso local.
5. A camada de dados não tinha `bulkUpdate`, `upsert` transacional nem indicador visível de modo Supabase/local.
6. O fluxo antigo de importação continuava disponível no cabeçalho e executava cruzamento `sem_carteira` entre origens, embora o fluxo oficial devesse ser a Pré-validação.

### Carteira Geral

1. O agrupamento principal ainda priorizava CPF/CNPJ e tinha fallback por código. A regra solicitada é agrupar visualmente pelo nome normalizado, preservando códigos e títulos individuais.
2. A lógica segura já existente em `TabelaCarteira.jsx` filtra saldo real zero, títulos pagos/baixados e duplicados; o ZIP regredia parte dessa proteção, portanto o arquivo não pode ser substituído integralmente.
3. `getTituloKey` já diferencia origem, cliente, número, sequência e vencimento. Essa semântica deve ser preservada.

### Layout

1. Os KPIs usavam grids fixos de 4, 5, 6 e 8 colunas; valores grandes podiam quebrar ou apertar cards vizinhos.
2. O ZIP contém melhorias úteis de largura mínima, valor em linha única, auditoria, progresso e badge, mas também contém regressões de negócio.
3. A tabela atual já tem rolagem horizontal interna e largura por conteúdo; o contêiner ainda precisa de `max-width`, `min-width: 0` e `box-sizing` explícitos.

### Base44 residual

- O pacote principal não depende mais de `@base44/sdk`.
- Ainda existem arquivos legados e telas que chamam `base44.auth`, `base44.functions` ou integração de e-mail indisponível.
- Esses arquivos só podem ser removidos após confirmar a ausência de imports ativos e depois de testes/build.

### Supabase

- A reconexão ao projeto real foi concluída em 15/07/2026.
- O banco real usa `titles`, `charge_events` e `import_logs`; não existe `public.titulos`.
- O adaptador local estava apontando para `titulos`, criando uma incompatibilidade direta com a carteira real. A correção preserva o nome `titles` para não criar uma segunda base vazia.
- A tabela `titles` contém dados manuais que precisam ser preservados: 247 registros com observação, 18 com promessa, 248 com data de contato e 186 com status diferente de “Não Contatado”.
- A carteira real tem 29.244 títulos ativos e 6.777 inativos: 214/40 em FINR1253 e 29.030/6.737 em EB. O limite antigo de 10.000 ativos e 1.000 inativos truncava a maior parte da base.
- A auditoria da chave `(source, client_code, doc_type, title_number, seq, due_date)` encontrou zero grupos duplicados e zero nomes de cliente vazios.
- O schema real já possui `workflow_status` e `updated_at`, mas ainda não possui `open_value`, `received_value`, `erp_balance` e `client_category`; os equivalentes legados são `current_value`, `recebido_parcial` e `calculado`.
- A migration preparada é aditiva: preserva as colunas legadas, cria os campos faltantes e os mantém sincronizados com o adaptador.
- A tabela `vw_carteira_ativa` aparece no painel como `Unrestricted`, e o Advisor marcou a view `public.vw_carteira_ativa` como `Security Definer View`; isso exige correção de segurança separada e validada.
- O painel informa que não há backups configurados no projeto.
- O índice documentado é `(source, client_code, doc_type, title_number, seq, due_date) nulls not distinct`.
- As políticas RLS documentadas estão abertas para `anon` e `authenticated`; isso é um risco conhecido e não deve ser fechado sem antes implementar autenticação.
- Em 15/07/2026, após autorização explícita, foram criados backups protegidos por RLS: `titles_backup_20260715_before_atomic_import` (36.021 linhas), `charge_events_backup_20260715_before_atomic_import` (460 linhas) e `import_logs_backup_20260715_before_atomic_import` (52 linhas).
- A migração transacional foi aplicada com sucesso após o backup. A conferência pós-migração confirmou 36.021 títulos, 460 eventos, 52 logs, 29.244 títulos ativos, 6.777 inativos, 247 observações e 18 promessas, sem perda em relação ao backup.
- O índice único `titles_chave_oficial`, as 15 colunas aditivas e a função `public.apply_import_plan(...)` estão instalados.

## Merge seletivo planejado

Serão aproveitados do ZIP apenas os conceitos visuais de:

- cards/KPIs com valor em uma linha;
- badge totalmente visível;
- Pré-validação compacta com progresso;
- auditoria detalhada sob demanda;
- tabela contida na área útil;
- contagem de clientes por origem.

Não serão copiados do ZIP:

- `package.json`, lockfile ou `vite.config.js`;
- cliente antigo da Base44;
- `AuthContext`, `ProtectedRoute`, pasta `base44/` ou funções Base44;
- lógica de carteira/importação que enfraqueça saldo, status, origem ou segurança.

## Plano de correção

1. Alinhar a chave de importação à origem sem alterar `getTituloKey`.
2. Agrupar visualmente clientes pelo nome normalizado.
3. Reutilizar a carteira já carregada na Pré-validação.
4. Tornar falhas do Supabase explícitas e impedir sucesso local silencioso quando o remoto estiver configurado.
5. Implementar aplicação atômica via RPC Supabase e uma única transação local no modo local.
6. Retirar o fluxo antigo de importação da interface principal.
7. Aplicar o layout seletivo do ZIP.
8. Criar migração idempotente e instruções de execução/validação do Supabase.
9. Ampliar testes, corrigir lint, executar build e validar a interface publicada/local.

## Validações finais previstas

- `npm test`;
- `npm run lint`;
- `npm run build`;
- teste de regressão EB/Topcon, valor `0,01`, origem, agrupamento por nome e baixa por ausência;
- teste de falha remota sem fallback silencioso;
- inspeção visual dos KPIs, tabela, badge e Pré-validação;
- verificação do GitHub Actions e abertura de Pull Request sem merge.
