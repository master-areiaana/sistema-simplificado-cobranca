import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Aceita chamada sem auth para automação agendada, mas verifica se é admin quando há token
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (_) { /* chamada do scheduler sem token */ }

    const hoje = new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Buscar títulos ativos
    const titulos = await base44.asServiceRole.entities.Titulo.filter({ active: true }, "client_name", 2000);

    const alertas = [];

    for (const t of (titulos || [])) {
      const venc = t.due_date || "";
      const atraso = venc ? Math.floor((Date.now() - new Date(venc).getTime()) / 86400000) : 0;

      // Promessa vencendo hoje ou amanhã
      if (t.promise_date === hoje || t.promise_date === amanha) {
        alertas.push({
          tipo: "promessa_vencendo",
          cliente: t.client_name,
          nrCli: t.client_code,
          data: t.promise_date,
          valor: t.original_value,
          urgencia: t.promise_date === hoje ? "HOJE" : "AMANHÃ",
        });
      }

      // Título com mais de 30 dias de atraso e ainda "Não Contatado"
      if (atraso > 30 && t.current_status === "Não Contatado") {
        alertas.push({
          tipo: "atraso_critico",
          cliente: t.client_name,
          nrCli: t.client_code,
          diasAtraso: atraso,
          valor: t.original_value,
          urgencia: atraso > 90 ? "CRÍTICO" : "ALTO",
        });
      }
    }

    // Registrar alertas como eventos de sistema
    for (const alerta of alertas.slice(0, 20)) { // limita a 20 por execução
      await base44.asServiceRole.entities.ChargeEvent.create({
        client_name: alerta.cliente,
        client_code: alerta.nrCli || "",
        event_type: "ALERTA",
        event_subtype: alerta.tipo,
        event_date: hoje,
        status: alerta.urgencia,
        motive: alerta.tipo === "promessa_vencendo"
          ? `Promessa vencendo ${alerta.urgencia} — ${alerta.data}`
          : `Sem contato há ${alerta.diasAtraso} dias`,
        note: `Valor: R$ ${Number(alerta.valor || 0).toFixed(2)}`,
        event_user: "Sistema",
      });
    }

    return Response.json({ ok: true, alertas: alertas.length, detalhes: alertas.slice(0, 50) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});