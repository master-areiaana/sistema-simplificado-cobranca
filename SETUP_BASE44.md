# 🔧 Guia Completo: Configurar Base44 + GitHub Actions

## 📋 Resumo do que você precisa fazer:

### ✅ ETAPA 1: Adicionar Secrets no GitHub (5 minutos)

1. Vá para seu repositório: https://github.com/master-areiaana/Sistema-Simplificado-Cobranca
2. Clique em **Settings** (⚙️ no topo direito)
3. Clique em **Secrets and variables → Actions** (no menu esquerdo)
4. Clique em **"New repository secret"**

**Adicione estes 3 secrets:**

| Chave | Valor |
|-------|-------|
| `BASE44_APP_ID` | `69f14ec85dcdced93f9de899` |
| `BASE44_API_KEY` | *Sua API Key da Base44* |
| `STRIPE_PUBLIC_KEY` | *Sua chave Stripe* (opcional) |

#### 🔑 Como gerar `BASE44_API_KEY`:
1. Acesse: https://app.base44.com/settings/api-keys
2. Clique em **"Generate New Key"** ou **"Gerar Nova Chave"**
3. Copie a chave (aparecerá uma única vez!)
4. Cole no secret `BASE44_API_KEY` no GitHub

---

### ✅ ETAPA 2: Criar o Workflow de Deploy (5 minutos)

Você precisa criar um arquivo na sua máquina local:

#### Abra seu terminal e execute:

```bash
# 1. Navegue até o repositório
cd ~/path/to/Sistema-Simplificado-Cobranca

# 2. Crie a pasta de workflows (se não existir)
mkdir -p .github/workflows

# 3. Crie o arquivo do workflow
touch .github/workflows/deploy-base44.yml
```

#### 4. Abra o arquivo em um editor e cole este conteúdo:

```yaml
name: Deploy to Base44

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint check
        run: npm run lint --if-present
      
      - name: Build aplicação
        run: npm run build
        env:
          VITE_BASE44_APP_ID: ${{ secrets.BASE44_APP_ID }}
          VITE_BASE44_API_KEY: ${{ secrets.BASE44_API_KEY }}
          VITE_STRIPE_PUBLIC_KEY: ${{ secrets.STRIPE_PUBLIC_KEY }}
      
      - name: Deploy para Base44
        run: |
          npm install -g @base44/cli
          base44 deploy --app-id ${{ secrets.BASE44_APP_ID }} --api-key ${{ secrets.BASE44_API_KEY }} --path dist
        env:
          BASE44_API_KEY: ${{ secrets.BASE44_API_KEY }}
      
      - name: Notificar sucesso
        if: success()
        run: echo "✅ Deployed para https://blazing-cred-flow-pro.base44.app"
      
      - name: Notificar erro
        if: failure()
        run: echo "❌ Deploy falhou! Verifique os logs acima."
```

#### 5. Salve o arquivo

---

### ✅ ETAPA 3: Fazer Commit e Push (5 minutos)

```bash
# 1. Adicione os arquivos
git add .github/workflows/deploy-base44.yml
git add base44.json
git add .env.example

# 2. Commit
git commit -m "chore: configure Base44 deployment with GitHub Actions"

# 3. Push para main
git push origin main
```

---

### ✅ ETAPA 4: Verificar o Deploy (2 minutos)

1. Vá para: https://github.com/master-areiaana/Sistema-Simplificado-Cobranca/actions
2. Você verá um workflow chamado **"Deploy to Base44"** rodando
3. Espere até ficar verde ✅
4. Acesse: https://blazing-cred-flow-pro.base44.app
5. Verifique se sua app está rodando!

---

## 🧪 Testar Deploy Manual (Opcional)

Se quiser testar antes de fazer push:

```bash
# 1. Instale o CLI
npm install -g @base44/cli

# 2. Build
npm run build

# 3. Deploy (substitua sua_api_key)
base44 deploy \
  --app-id 69f14ec85dcdced93f9de899 \
  --api-key sua_api_key_aqui \
  --path dist
```

---

## 🚨 Problemas e Soluções

### ❌ "Créditos de integração acabaram"
- Acesse: https://app.base44.com/billing
- Atualize seu plano para obter mais créditos

### ❌ "Preview em branco"
- Verificar se o build gerou a pasta `dist` corretamente
- Confirmar que o `main.jsx` tem imports estáticos (não dinâmicos)

### ❌ "API Key inválida"
- Gere uma nova key em: https://app.base44.com/settings/api-keys
- Certifique-se de selecionar permissões: `apps:deploy`, `apps:read`, `apps:write`

### ❌ "Workflow não roda"
- Verifique se o arquivo está em `.github/workflows/deploy-base44.yml` (pasta correta)
- Certifique-se que o YAML está com indentação correta (use espaços, não tabs)

---

## 📚 Próximos Passos

- [ ] Adicionar 3 secrets no GitHub
- [ ] Criar `.github/workflows/deploy-base44.yml`
- [ ] Fazer commit e push
- [ ] Acompanhar o workflow em Actions
- [ ] Testar app em: https://blazing-cred-flow-pro.base44.app
- [ ] Deletar repositórios antigos:
  - master-areiaana/sistema-simplificado-de-cobran-a
  - master-areiaana/sistema-simplificado-de-cobranca

---

## 🆘 Precisa de Ajuda?

Se algo não funcionar:
1. Verifique os logs em: https://github.com/master-areiaana/Sistema-Simplificado-Cobranca/actions
2. Base44 Docs: https://docs.base44.com
3. GitHub Actions Docs: https://docs.github.com/en/actions

