import { fmtD, hojeISO, normText } from "@/lib/cobranca";

export const ASSESSORIA_UNREAD_COUNT_KEY = "sc_assessoria_unread_count";
const LOCAL_NOTIF_KEY = "sc_assessoria_local_notifications";

export function loadLocalAssessoriaNotifications() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_NOTIF_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalAssessoriaNotifications(items) {
  localStorage.setItem(LOCAL_NOTIF_KEY, JSON.stringify(items || []));
}

export function assessoriaReadKey(usuario) {
  return `sc_assessoria_read_${usuario || "geral"}`;
}

export function loadAssessoriaReadIds(usuario) {
  try {
    return new Set(JSON.parse(localStorage.getItem(assessoriaReadKey(usuario)) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveAssessoriaReadIds(usuario, ids) {
  localStorage.setItem(assessoriaReadKey(usuario), JSON.stringify([...ids]));
}

export function updateAssessoriaUnreadCount(count) {
  localStorage.setItem(ASSESSORIA_UNREAD_COUNT_KEY, String(Math.max(0, Number(count || 0))));
  window.dispatchEvent(new Event("storage"));
}

export function notificationId(e, idx = 0) {
  return String(e.id || e.local_id || `${e.event_type || "evt"}-${e.titulo_id || e.client_code || "sem"}-${e.created_date || e.local_created_at || e.event_date || idx}`);
}

export function eventDateLabel(e) {
  const d = e.event_date || e.created_date || e.local_created_at;
  return d ? fmtD(String(d).slice(0, 10)) : "—";
}

export function eventTimeLabel(e) {
  const d = e.created_date || e.local_created_at || e.event_date;
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return eventDateLabel(e);
  return dt.toLocaleString("pt-BR");
}

export function eventKindLabel(e) {
  if (e.event_type === "CHAT_ASSESSORIA") return "Chat";
  if (e.event_type === "ASSESSORIA") return "Retorno Assessoria";
  if (e.event_type === "USUARIO_ASSESSORIA") return "Usuário alterado";
  if (e.event_subtype === "RETORNO_ASSESSORIA") return "Retorno Assessoria";
  if (e.event_type === "COBRANCA") return "Cobrança";
  return e.event_type || "Histórico";
}

export function notificationTitle(e) {
  if (e.event_type === "CHAT_ASSESSORIA") {
    return e.event_subtype === "EMPRESA_PARA_ASSESSORIA" ? "Nova mensagem da empresa" : "Nova mensagem da assessoria";
  }
  if (e.event_type === "USUARIO_ASSESSORIA") return "Usuário alterado";
  if (e.event_type === "ASSESSORIA" || e.event_subtype === "RETORNO_ASSESSORIA") return "Atualização da assessoria";
  if (e.motive === "devolver_carteira") return "Caso devolvido para a empresa";
  return "Movimentação na assessoria";
}

export function notificationPriority(e) {
  const s = normText(`${e.status || ""} ${e.note || ""}`);
  if (s.includes("INCOBRAVEL") || s.includes("SEM CONTATO") || s.includes("REPROV")) return "Alta";
  if (s.includes("PROMETEU") || s.includes("AGUARDANDO")) return "Média";
  return "Normal";
}

export function isAssessoriaNotificationEvent(e) {
  return ["CHAT_ASSESSORIA", "ASSESSORIA", "USUARIO_ASSESSORIA"].includes(e.event_type) ||
    ["RETORNO_ASSESSORIA", "EMPRESA_PARA_ASSESSORIA", "ASSESSORIA_PARA_EMPRESA"].includes(e.event_subtype);
}

export function buildAssessoriaNotifications(events = [], localNotifications = [], readIds = new Set()) {
  const remote = (events || []).filter(isAssessoriaNotificationEvent);
  const all = [...(localNotifications || []), ...remote]
    .sort((a, b) => String(b.created_date || b.local_created_at || b.event_date || "").localeCompare(String(a.created_date || a.local_created_at || a.event_date || "")));

  return all.map((e, idx) => {
    const id = notificationId(e, idx);
    return {
      id,
      raw: e,
      titulo: notificationTitle(e),
      caso: e.titulo_id || e.title || "Caso / título de assessoria",
      cliente: e.client_name || e.clientName || "—",
      usuario: e.event_user || e.user || "Sistema",
      tipo: eventKindLabel(e),
      dataHora: eventTimeLabel(e),
      responsavel: e.responsavel || e.event_user || "—",
      prioridade: notificationPriority(e),
      statusAnterior: e.status_before || "—",
      statusNovo: e.status || "—",
      lida: readIds.has(id),
      tituloId: e.titulo_id || null,
      texto: e.note || e.message || "Atualização registrada na assessoria."
    };
  });
}

export function createLocalAssessoriaNotification({ tipo, status, note, user, title = "Controle de acesso", client_name = "—" }) {
  return {
    local_id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    event_type: "USUARIO_ASSESSORIA",
    event_subtype: tipo || "ALTERACAO_USUARIO",
    local_created_at: new Date().toISOString(),
    event_date: hojeISO,
    status: status || "Atualizado",
    note,
    event_user: user || "Empresa",
    client_name,
    title
  };
}
