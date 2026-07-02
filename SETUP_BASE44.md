# 🚀 SETUP COMPLETO: Base44 + GitHub Actions Deploy

## 📋 INFORMAÇÕES DA SUA CONTA BASE44

```
App ID:           69f14ec85dcdced93f9de899
App Name:         Sistema Simplificado de Cobrança
Workspace:        Master's Workspace
Workspace ID:     69e8f32ae17dd0a960161f4e
URL Publicada:    https://blazing-cred-flow-pro.base44.app
Email:            portalcore.consult@gmail.com
GitHub:           ✅ Conectado
Google Drive:     ✅ Conectado
```

---

## ⚡ QUICK START (10 minutos)

### 1️⃣ Adicionar GitHub Secrets (3 min)

Vá para: https://github.com/master-areiaana/Sistema-Simplificado-Cobranca/settings/secrets/actions

Clique em **"New repository secret"** e adicione:

| Nome | Valor |
|------|-------|
| `BASE44_APP_ID` | `69f14ec85dcdced93f9de899` |
| `BASE44_WORKSPACE_ID` | `69e8f32ae17dd0a960161f4e` |
| `BASE44_API_KEY` | `ade773272e51416e943d4a8d4a739258` |

✅ **PRONTO!** Os secrets estão seguros no GitHub.

---

### 2️⃣ Criar Workflow de Deploy (5 min)

Na sua máquina local, crie:

**Caminho:** `.github/workflows/deploy-base44.yml`

**Conteúdo:**

```yaml
name: Deploy to Base44

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      
      - run: npm run build
        env:
          VITE_BASE44_APP_ID: ${{ secrets.BASE44_APP_ID }}
          VITE_BASE44_WORKSPACE_ID: ${{ secrets.BASE44_WORKSPACE_ID }}
      
      - run: |
          npm install -g @base44/cli
          base44 deploy \
            --app-id ${{ secrets.BASE44_APP_ID }} \
            --api-key ${{ secrets.BASE44_API_KEY }} \
            --path dist
        env:
          BASE44_API_KEY: ${{ secrets.BASE44_API_KEY }}
      
      - name: ✅ Deploy Success
        if: success()
        run: echo "Deployed to https://blazing-cred-flow-pro.base44.app"
      
      - name: ❌ Deploy Failed
        if: failure()
        run: exit 1
```

---

### 3️⃣ Fazer Commit e Push (2 min)

```bash
# Na raiz do projeto
git add .github/workflows/deploy-base44.yml
git commit -m "chore: add Base44 CI/CD workflow"
git push origin main
```

---

### 4️⃣ Verificar Deploy

1. Acesse: https://github.com/master-areiaana/Sistema-Simplificado-Cobranca/actions
2. Você verá "Deploy to Base44" rodando
3. Espere ficar **verde ✅**
4. Acesse: https://blazing-cred-flow-pro.base44.app
5. **PRONTO!** 🎉

---

## 🔄 Próximos Pushes = Deploy Automático

Agora, **toda vez que você fizer push para `main`**, o workflow:
1. ✅ Faz build (`npm run build`)
2. ✅ Faz deploy na Base44 automaticamente
3. ✅ Atualiza https://blazing-cred-flow-pro.base44.app em tempo real

---

## 🧪 Teste Manual (Opcional)

```bash
# 1. Build local
npm run build

# 2. Deploy manual
base44 deploy \
  --app-id 69f14ec85dcdced93f9de899 \
  --api-key ade773272e51416e943d4a8d4a739258 \
  --path dist
```

---

## 🧹 Limpar Repositórios Antigos

Agora que tudo está funcionando, **delete os 2 repos antigos:**

### ❌ Delete: `sistema-simplificado-de-cobran-a`
- URL: https://github.com/master-areiaana/sistema-simplificado-de-cobran-a/settings
- Role para **"Danger Zone"**
- Clique **"Delete this repository"**
- Digite o nome para confirmar

### ❌ Delete: `sistema-simplificado-de-cobranca`
- URL: https://github.com/master-areiaana/sistema-simplificado-de-cobranca/settings
- Role para **"Danger Zone"**
- Clique **"Delete this repository"**
- Digite o nome para confirmar

✅ **Agora você tem apenas 1 repo unificado!**

---

## 🚨 Troubleshooting

### ❌ "Créditos de integração esgotados"
- Acesse: https://app.base44.com/billing
- Atualize seu plano
- Refaça o deploy

### ❌ "API Key inválida"
- Verifique se o secret `BASE44_API_KEY` tem a chave correta
- Se errou, regenere em: https://app.base44.com/settings/api-keys

### ❌ "Build falha"
- Verifique os logs em: `/actions`
- Rode `npm run build` localmente para testar

### ❌ "App em branco após deploy"
- Limpe cache do browser: `Ctrl+Shift+Delete`
- Acesse novamente: https://blazing-cred-flow-pro.base44.app

---

## 📊 Fluxo de Deploy

```
git push main
    ↓
GitHub Actions dispara
    ↓
npm ci (instala deps)
    ↓
npm run build (compila)
    ↓
base44 deploy (publica)
    ↓
https://blazing-cred-flow-pro.base44.app atualizada ✅
```

---

## 📚 Referências

- Base44 Docs: https://docs.base44.com
- GitHub Actions: https://docs.github.com/en/actions
- Base44 CLI: `base44 --help`

---

## ✅ Checklist de Conclusão

- [ ] Adicionei 3 secrets no GitHub
- [ ] Criei `.github/workflows/deploy-base44.yml`
- [ ] Fiz `git push` (acionou workflow)
- [ ] Workflow ficou verde ✅
- [ ] App rodando em https://blazing-cred-flow-pro.base44.app
- [ ] Deletei 2 repos antigos
- [ ] Créditos de integração atualizados

---

**🎉 TUDO PRONTO! Sua app está unificada, deploy automático ativo e rodando na Base44!**
