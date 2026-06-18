import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

function renderStartupError(error) {
  const root = document.getElementById('root')
  if (!root) return
  const message = String(error?.message || error || 'Erro desconhecido')
  const stack = String(error?.stack || '')
  root.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 32px; color: #991b1b; max-width: 900px; margin: 40px auto; line-height: 1.5; background: #fff7f7; border: 1px solid #fecaca; border-radius: 12px;">
      <h1 style="font-size: 22px; margin: 0 0 8px;">Erro ao carregar o Sistema de Cobrança</h1>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0 0 12px;">O app carregou a página, mas encontrou um erro antes de montar a tela principal.</p>
      <pre style="white-space: pre-wrap; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #7f1d1d; font-size: 12px; overflow: auto;">${message}\n\n${stack}</pre>
    </div>
  `
}

window.addEventListener('error', (event) => renderStartupError(event.error || event.message))
window.addEventListener('unhandledrejection', (event) => renderStartupError(event.reason))

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[Sistema Cobrança] erro de renderização', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'Arial, sans-serif', padding: 32, color: '#991b1b', maxWidth: 900, margin: '40px auto', lineHeight: 1.5, background: '#fff7f7', border: '1px solid #fecaca', borderRadius: 12 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Erro ao abrir a tela do Sistema de Cobrança</h1>
          <p style={{ fontSize: 14, color: '#7f1d1d', margin: '0 0 12px' }}>A estrutura do app abriu, mas uma tela/componente apresentou erro.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, color: '#7f1d1d', fontSize: 12, overflow: 'auto' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

async function bootstrap() {
  try {
    const { default: App } = await import('./App.jsx')
    ReactDOM.createRoot(document.getElementById('root')).render(
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    )
  } catch (error) {
    renderStartupError(error)
  }
}

bootstrap()
