# 🚀 Guia de Configuração Base44

## 📋 Dados da Aplicação
- **App ID**: 69f14ec85dcdced93f9de899
- **Nome**: Sistema Simplificado de Cobrança
- **Workspace**: Master's Workspace
- **URL Publicada**: https://blazing-cred-flow-pro.base44.app

---

## 🔑 PASSO 1: Configurar Secrets no GitHub

Você precisa adicionar as credenciais como **Secrets** no repositório GitHub:

### Como adicionar:
1. Vá para: **Settings → Secrets and variables → Actions**
2. Clique em **"New repository secret"**
3. Adicione os seguintes secrets:

| Secret Name | Valor | Onde encontrar |
|-------------|-------|----------------|
| `BASE44_APP_ID` | `69f14ec85dcdced93f9de899` | Já temos aqui |
| `BASE44_API_KEY` | Sua API Key | https://app.base44.com/settings/api-keys |
| `STRIPE_PUBLIC_KEY` | Sua chave Stripe (opcional) | Dashboard Stripe |

---

## 🔑 PASSO 2: Gerar API Key na Base44

1. Acesse: https://app.base44.com/settings/api-keys
2. Clique em **"Generate API Key"** ou **"Nova Chave"**
3. Selecione permissões:
   - ✅ `apps:deploy`
   - ✅ `apps:read`
   - ✅ `apps:write`
4. Copie a chave (aparecerá uma única vez!)
5. Cole no secret `BASE44_API_KEY` no GitHub

---

## 📦 PASSO 3: Testar o Deploy

### Opção A: Deploy automático (Recomendado)
```bash
git push origin main
```
O GitHub Actions vai fazer o build e deploy automaticamente!

### Opção B: Deploy manual
```bash
# 1. Install CLI
npm install -g @base44/cli

# 2. Build
npm run build

# 3. Deploy
base44 deploy \
  --app-id 69f14ec85dcdced93f9de899 \
  --api-key sua_api_key_aqui \
  --path dist
```

---

## ✅ Verificar Deploy

1. Acesse: https://blazing-cred-flow-pro.base44.app
2. Verifique se a app carregou corretamente
3. Teste as funcionalidades principais

---

## 🐛 Problemas Conhecidos

### ⚠️ Créditos de Integração Esgotados
- **Problema**: Banner amarelo "Seus créditos de integração acabaram"
- **Solução**: Atualizar plano na Base44 → https://app.base44.com/billing

### ⚠️ Preview em branco
- **Problema**: Painel de preview não carrega
- **Causa**: Erro anterior com imports dinâmicos no Vite
- **Solução**: Já foi corrigido no main.jsx (import estático)

---

## 📚 Próximos Passos

- [ ] Gerar API Key na Base44
- [ ] Adicionar secrets no GitHub
- [ ] Fazer push para trigger o deploy
- [ ] Verificar se app está rodando em blazing-cred-flow-pro.base44.app
- [ ] Deletar os 2 repositórios antigos:
  - master-areiaana/sistema-simplificado-de-cobran-a
  - master-areiaana/sistema-simplificado-de-cobranca

---

## 🆘 Suporte

- **Base44 Docs**: https://docs.base44.com
- **Base44 CLI**: `base44 --help`
- **GitHub Secrets**: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions

