# 🔧 Guia Rápido: Base44 Setup

> **Para o guia completo, consulte:** [`SETUP_BASE44.md`](./SETUP_BASE44.md)

## Dados da Sua Conta

| Campo | Valor |
|-------|-------|
| **App ID** | `69f14ec85dcdced93f9de899` |
| **Workspace** | Master's Workspace |
| **URL** | https://blazing-cred-flow-pro.base44.app |
| **GitHub** | ✅ Conectado |

## 3 Passos Rápidos

### 1. GitHub Secrets
Vá para Settings → Secrets → Actions e adicione:
- `BASE44_APP_ID` = `69f14ec85dcdced93f9de899`
- `BASE44_WORKSPACE_ID` = `69e8f32ae17dd0a960161f4e`
- `BASE44_API_KEY` = [sua chave]

### 2. Criar Workflow
Arquivo: `.github/workflows/deploy-base44.yml`

[Ver conteúdo completo em SETUP_BASE44.md](./SETUP_BASE44.md#2️⃣-criar-workflow-de-deploy-5-min)

### 3. Push
```bash
git add .github/workflows/deploy-base44.yml
git commit -m "chore: add Base44 deploy"
git push origin main
```

**Pronto! Acesse:** https://blazing-cred-flow-pro.base44.app

---

→ [Leia SETUP_BASE44.md para instruções completas](./SETUP_BASE44.md)
