import { hojeISO, normText, fmtD } from "@/lib/cobranca";

const STATUS_PAGO = ["PAGO AGUARD BAIXA", "PAGO AGUARD. BAIXA", "ENCERRADO", "BAIXADO", "CONFIRMADO", "PAGO"];
const STATUS_PROMESSA = ["PROMETEU PAGAR", "PROMESSA", "PROMESSA DE PAGAMENTO"];

function isPago(status = "") {
  const s = normText(status);
  return STATUS_PAGO.some(x => s.includes(x));
}

function isPromessa(status = "", promiseDate) {
  const s = normText(status);
  return !!promiseDate || STATUS_PROMESSA.some(x => s.includes(x));
}

function dateOnly(v) {
  return v ? String(v).slice(0, 10) : "";
}

function eventosDoCliente(grupo = {}, events = []) {
  const clientCode = String(grupo.nrCli || "").trim();
  const clientName = normText(grupo.nomeCli || "");
  return (events || [])
    .filter(e => {
      const sameCode = clientCode && String(e.client_code || e.nrCli || "").trim() === clientCode;
      const sameName = clientName && normText(e.client_name || e.nomeCli || "") === clientName;
      return sameCode || sameName;
    })
    .sort((a, b) => String(a.event_date || a.dataContato || a.created_date || "").localeCompare(String(b.event_date || b.dataContato || b.created_date || "")));
}

export function statusAutomaticoCobranca(frm = {}) {
  if (frm.encaminhar === "assessoria") return "Enviado para assessoria";
  if (frm.encaminhar === "protesto") return "Enviado para gestão";
  if (frm.encaminhar === "verificacao") return "Em verificação";
  if (frm.dataPromessa) return "Promessa ativa";
  return frm.status || "Em Cobrança";
}

export function acaoAutomaticaCliente(grupo = {}, events = []) {
  const ranking = rankingConfiancaCliente(grupo, events);
  if (ranking?.label === "Promessa vencida" || grupo.dataPromessa && grupo.dataPromessa < hojeISO && !isPago(grupo.statusConsolidado)) {
    return `Promessa vencida em ${fmtD(grupo.dataPromessa)}. Recobrar cliente, registrar retorno e criar nova ação.`;
  }
  if (ranking?.nivel === 4) return "Cliente não confiável. Encaminhar para análise da gestão/assessoria e evitar nova promessa simples.";
  if (grupo.encaminharConsolidado === "assessoria") return "Acompanhar retorno da assessoria no chat/histórico do título.";
  if (grupo.encaminharConsolidado === "protesto") return "Aguardar aprovação ou retorno do gestor.";
  if (grupo.encaminharConsolidado === "verificacao") return "Aguardar conferência de pagamento.";
  return grupo.acaoAfazer || "—";
}

export function rankingConfiancaCliente(grupo = {}, events = []) {
  const hist = eventosDoCliente(grupo, events);
  const promessas = hist.filter(e => isPromessa(e.status, e.promise_date || e.dataPromessa));
  const pagos = hist.filter(e => isPago(e.status));
  const pagamentosPorData = new Set(pagos.map(e => dateOnly(e.event_date || e.dataContato || e.created_date)).filter(Boolean));

  if (!promessas.length && grupo.dataPromessa) {
    promessas.push({ promise_date: grupo.dataPromessa, status: grupo.statusConsolidado, event_date: grupo.ultimoContato });
  }

  let promessasQuebradas = 0;
  let pagamentoNaPromessa = false;

  for (const p of promessas) {
    const promessa = dateOnly(p.promise_date || p.dataPromessa);
    if (!promessa) continue;
    if (pagamentosPorData.has(promessa)) {
      pagamentoNaPromessa = true;
      break;
    }
    if (promessa < hojeISO) promessasQuebradas++;
  }

  const promessaAtualVencida = !!(grupo.dataPromessa && grupo.dataPromessa < hojeISO && !isPago(grupo.statusConsolidado));

  if (pagamentoNaPromessa && promessasQuebradas === 0) {
    return { nivel: 1, label: "Ranking 1 · Cliente confiável", cor: "#10b981", acao: "Pagou conforme promessa. Pode receber nova chance controlada." };
  }
  if (pagamentoNaPromessa && promessasQuebradas === 1) {
    return { nivel: 2, label: "Ranking 2 · Segunda chance", cor: "#f59e0b", acao: "Pagou na segunda promessa. Manter acompanhamento." };
  }
  if (pagamentoNaPromessa && promessasQuebradas === 2) {
    return { nivel: 3, label: "Ranking 3 · Baixa confiabilidade", cor: "#f97316", acao: "Pagou somente na terceira promessa. Acompanhar com prioridade." };
  }
  if (promessasQuebradas >= 3) {
    return { nivel: 4, label: "Cliente não confiável", cor: "#ef4444", acao: "Passou da terceira promessa. Criar ação formal e sinalizar gestão/assessoria." };
  }
  if (promessaAtualVencida || promessasQuebradas > 0) {
    return { nivel: 0, label: "Promessa vencida", cor: "#ef4444", acao: "Promessa vencida sem pagamento. Recobrar e registrar nova ação." };
  }
  if (grupo.dataPromessa) {
    return { nivel: 0, label: "Promessa ativa", cor: "#3b82f6", acao: `Aguardar pagamento prometido para ${fmtD(grupo.dataPromessa)}.` };
  }
  return { nivel: null, label: "Sem ranking", cor: "#64748b", acao: "Sem histórico suficiente de promessa." };
}

export function notificacaoPromessa(grupo = {}, events = []) {
  const ranking = rankingConfiancaCliente(grupo, events);
  if (ranking.label === "Promessa vencida" || ranking.nivel === 4) {
    return {
      tipo: "alerta",
      texto: `Atenção: o cliente ${grupo.nomeCli} prometeu pagamento para ${fmtD(grupo.dataPromessa)}, mas o pagamento não foi identificado. Realizar nova cobrança e atualizar a Carteira Geral.`,
      ranking,
    };
  }
  return null;
}
