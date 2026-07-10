# Sistema de Cobrança — Versão Unificada (GitHub + Supabase)

Esta é a versão **única** do sistema: um só código, editável no GitHub, com o
banco de dados no **Supabase**. A plataforma Base44 saiu do caminho — você não
gasta mais crédito e ajusta o sistema quando e onde quiser.

## O que mudou nesta versão

- **Fonte única da verdade:** unificado o código das duas versões (GitHub +
  Base44), ficando com a lógica de importação **corrigida**.
- **Duplicados resolvidos:** removida a gambiarra de caracteres invisíveis no
  número do título. A deduplicação agora é garantida por uma **chave única** no
  banco (origem + cliente + tipo + número + sequência + vencimento).
- **Impacto no Caixa correto:** título que some do relatório importado é tratado
  como pago/baixado (baixa por ausência), respeitando as travas de segurança
  contra importação parcial.
- **Sem Base44:** removidas as dependências e o plugin da Base44. Build 100%
  independente (Vite + React + Supabase).
- **Rede de segurança:** se o Supabase não estiver configurado ou cair, o app
  continua funcionando em modo local (não quebra).

---

## Passo a passo (uma vez só)

### 1. Criar o projeto no Supabase
1. Acesse https://supabase.com e crie um projeto (plano grátis serve).
2. No menu **SQL Editor → New query**, cole todo o arquivo
   [`supabase-schema.sql`](./supabase-schema.sql) e clique em **Run**.
   Isso cria as tabelas, a chave única e as permissões.

### 2. Pegar as credenciais
No Supabase: **Project Settings → API**. Você vai copiar dois valores:
- **Project URL** → vira `VITE_SUPABASE_URL`
- **anon public** (em Project API keys) → vira `VITE_SUPABASE_ANON_KEY`

### 3. Rodar localmente (para testar/ajustar)
```bash
npm install
cp .env.example .env      # depois edite o .env com suas credenciais
npm run dev
```
Abra o endereço que aparecer (ex.: http://localhost:5173).

### 4. Publicar no GitHub Pages (deploy automático, sem crédito)
1. Suba este projeto para um repositório no GitHub.
2. No repositório: **Settings → Secrets and variables → Actions → New repository
   secret** e crie dois secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Em **Settings → Pages → Build and deployment → Source**, escolha
   **GitHub Actions**.
4. A cada `git push` na branch `main`, o site publica sozinho (o workflow
   [`deploy-pages.yml`](./.github/workflows/deploy-pages.yml) já está pronto).

> Se preferir Vercel/Netlify (sem a pausa do plano grátis do Supabase e sem se
> preocupar com base path), basta importar o repositório e definir as mesmas
> duas variáveis de ambiente. Nesse caso, deixe `VITE_BASE_PATH="/"`.

---

## Como testar se ficou tudo certo (5 minutos)

1. Rode o app com o `.env` preenchido.
2. Importe um relatório normalmente pela tela de importação.
3. Confira no Supabase (**Table Editor → titulos**) que os títulos apareceram.
4. Importe **o mesmo relatório de novo**: a quantidade de títulos **não deve
   dobrar** (chave única funcionando → sem duplicados).
5. Importe um relatório onde um cliente que existia **não aparece mais**: ele
   deve sair da Carteira Geral e ir para **Impacto no Caixa** (baixado).

Se algo não gravar no Supabase, abra o console do navegador (F12). Uma mensagem
`[dados] ... usando cache local` indica que o Supabase recusou a operação —
quase sempre é RLS/credencial. Confirme que rodou o `supabase-schema.sql` e que
as duas variáveis estão corretas.

---

## Segurança (importante)

- O arquivo antigo `SETUP_BASE44.md` **continha uma API key exposta**. Ela foi
  removida deste projeto. **Regenere essa chave na Base44** para invalidar a
  antiga, já que ela ficou registrada no histórico do repositório anterior.
- No Supabase, o schema entrega o **modo aberto** (funciona de imediato). Para
  uma empresa, ative login (Supabase Auth) e use o **modo seguro** comentado no
  fim do `supabase-schema.sql`. Enquanto não fizer isso, mantenha a URL do app
  restrita.

---

## Estrutura rápida

- `src/api/supabaseClient.js` — conexão com o Supabase (segura, não quebra sem env).
- `src/api/base44Client.js` — camada de dados: Supabase primeiro, local como reserva.
- `src/lib/importacao/` — lógica de importação, deduplicação e baixa por ausência.
- `supabase-schema.sql` — o banco (rode uma vez no Supabase).
- `.github/workflows/deploy-pages.yml` — publicação automática no GitHub Pages.
