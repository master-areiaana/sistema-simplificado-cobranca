# Instruções do Supabase

Projeto informado: `bjesjsryewgvtppalzib`.

O Codex reconectou ao painel. O banco real usa `public.titles` (em inglês); não crie uma tabela paralela `public.titulos`.

Status em 15/07/2026: backup concluído, migração aplicada e conferência pós-migração aprovada.

## 1. Auditoria somente leitura

```sql
select count(*) as total_titulos from public.titles;

select source, active, workflow_status, count(*) as quantidade,
       sum(open_value) as valor_aberto
from public.titles
group by source, active, workflow_status
order by source, active desc, workflow_status;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'titles'
order by indexname;

select source, client_code, doc_type, title_number, seq, due_date,
       count(*) as duplicados
from public.titles
group by source, client_code, doc_type, title_number, seq, due_date
having count(*) > 1
order by duplicados desc;

select count(*) filter (where client_name is null or trim(client_name) = '') as sem_cliente,
       count(*) filter (where active is true) as ativos,
       count(*) filter (where active is false) as inativos
from public.titles;
```

Se a consulta de duplicidades retornar linhas, não faça exclusão automática. Salve o resultado e revise qual registro preserva histórico, promessa, observação e demais campos manuais.

## 2. Backup antes da migração

Este passo cria uma cópia e altera o banco; execute somente depois de conferir o espaço disponível:

```sql
create table if not exists public.titles_backup_20260715_before_atomic_import
as table public.titles;

create table if not exists public.charge_events_backup_20260715_before_atomic_import
as table public.charge_events;

create table if not exists public.import_logs_backup_20260715_before_atomic_import
as table public.import_logs;

alter table public.titles_backup_20260715_before_atomic_import enable row level security;
alter table public.charge_events_backup_20260715_before_atomic_import enable row level security;
alter table public.import_logs_backup_20260715_before_atomic_import enable row level security;
```

Confirme as contagens:

```sql
select
  (select count(*) from public.titles) as titulos_original,
  (select count(*) from public.titles_backup_20260715_before_atomic_import) as titulos_backup,
  (select count(*) from public.charge_events) as eventos_original,
  (select count(*) from public.charge_events_backup_20260715_before_atomic_import) as eventos_backup;
```

## 3. Instalar a aplicação transacional

Abra e execute integralmente:

`supabase/migrations/20260715120000_atomic_import.sql`

A função `apply_import_plan`:

- recebe o plano já pré-validado;
- valida a origem;
- impede baixa EB x Topcon;
- cria/atualiza títulos com a chave oficial;
- baixa ausências da mesma origem;
- registra eventos e log;
- confirma tudo em uma transação ou desfaz tudo se qualquer item falhar.

## 4. Verificar a instalação

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'apply_import_plan';
```

O resultado deve conter uma linha.

## 4.1. Correção de datas e reconciliação por origem (16/07/2026)

Execute também, integralmente:

`supabase/migrations/20260716180000_fix_dates_and_source_reconciliation.sql`

Essa migração:

- corrige o erro `column "issue_date" is of type date but expression is of type text`;
- instala `apply_import_plan_v2`, usada pela versão atual do aplicativo;
- mantém a trava normal de cobertura mínima de 70%;
- permite uma reconciliação integral somente após confirmação explícita de que o arquivo é a carteira completa da origem;
- recalcula as ausências no banco imediatamente antes de aplicar;
- protege outras origens, registros manuais, chaves incompletas e chaves ambíguas;
- salva o estado anterior em `title_import_reconciliation_audit`;
- aplica criação, atualização, auditoria e baixas na mesma transação.

Confirme a instalação:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('apply_import_plan', 'apply_import_plan_v2')
order by routine_name;

select to_regclass('public.title_import_reconciliation_audit') as tabela_auditoria;
```

Antes de usar **Preparar reconciliação integral**, confirme que o relatório selecionado é a carteira completa da origem exibida. A quantidade de candidatos precisa permanecer idêntica entre a prévia e a transação; qualquer mudança cancela tudo.

## 5. Secrets do GitHub Actions

No GitHub, em **Settings → Secrets and variables → Actions**, confirme apenas a existência, sem copiar os valores para arquivos:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O aplicativo mostra na tela se está em modo Supabase, cache ou somente navegador.

## 6. Segurança RLS

O schema atual permite leitura e gravação com a chave anônima. Isso mantém o sistema funcionando sem login, mas deixa os dados expostos a quem tiver acesso ao endereço e à anon key.

Não feche as políticas antes de implementar Supabase Auth; isso interromperia o sistema. A correção de autenticação deve ser um trabalho separado, com perfis e testes de acesso.

## 7. GitHub Pages

O site publicado estava servindo o `index.html` de contingência do código-fonte, e não o artefato `dist` do workflow.

No GitHub, confirme em **Settings → Pages → Build and deployment**:

- Source: **GitHub Actions**.

Depois de mesclar o Pull Request, aguarde o workflow `Deploy to GitHub Pages` e use a URL em minúsculas:

`https://master-areiaana.github.io/sistema-simplificado-cobranca/`
