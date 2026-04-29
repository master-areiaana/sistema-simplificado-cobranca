import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Aceita tanto chamada autenticada (admin) quanto do scheduler (sem auth)
  // Validação: se vier com Authorization, exige admin
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7);

  // Buscar todos os títulos ativos
  const titulos = await base44.asServiceRole.entities.Titulo.filter({ active: true }, "due_date", 5000);

  // Agrupar por cliente
  const clienteMap = new Map();
  for (const t of (titulos || [])) {
    const key = `${t.client_code || ""}||${(t.client_name || "").trim().toUpperCase()}`;
    if (!clienteMap.has(key)) clienteMap.set(key, []);
    clienteMap.get(key).push(t);
  }

  let atualizados = 0;
  let notificacoes = 0;
  const erros = [];

  for (const [, titulosCliente] of clienteMap.entries()) {
    // Calcular maior atraso e qtd de contatos
    let maiorAtraso = 0;
    let qtdContatos = 0;

    for (const titulo of titulosCliente) {
      const venc = titulo.due_date;
      if (venc) {
        const dias = Math.floor((new Date(hoje) - new Date(`${venc}T00:00:00`)) / 86400000);
        if (dias > maiorAtraso) maiorAtraso = dias;
      }
      qtdContatos += Number(titulo.contact_count || 0);
    }

    // Calcular prioridade
    let novaPrioridade = "normal";
    if (maiorAtraso > 90 || qtdContatos >= 3) novaPrioridade = "critico";
    else if (maiorAtraso > 30 || qtdContatos >= 2) novaPrioridade = "alto";
    else if (maiorAtraso > 0 || qtdContatos >= 1) novaPrioridade = "medio";

    // Atualizar cada título com a nova prioridade calculada (campo workflow_status reutilizado como prioridade automática)
    for (const titulo of titulosCliente) {
      const statusAtual = titulo.current_status || "Não Contatado";

      // Só cria notificação se: vencido, sem contato hoje e status = Não Contatado ou Em Cobrança
      const deveCobrar = maiorAtraso > 0 && ["Não Contatado", "Em Cobrança", "Sem Retorno"].includes(statusAtual);

      if (deveCobrar && titulo.last_contact_date !== hoje) {
        // Criar evento de notificação automática
        await base44.asServiceRole.entities.ChargeEvent.create({
          titulo_id: titulo.id,
          client_code: titulo.client_code,
          client_name: titulo.client_name,
          event_type: "ALERTA_AUTOMATICO",
          event_subtype: `PRIO_${novaPrioridade.toUpperCase()}`,
          event_date: hoje,
          status: statusAtual,
          motive: `Vencido há ${maiorAtraso} dias — prioridade ${novaPrioridade.toUpperCase()}`,
          note: `Alerta automático gerado em ${hoje}. Maior atraso: ${maiorAtraso}d. Contatos: ${qtdContatos}.`,
          event_user: "Sistema",
        });
        notificacoes++;
      }
      atualizados++;
    }
  }

  return Response.json({
    ok: true,
    date: hoje,
    titulos_processados: titulos?.length || 0,
    clientes: clienteMap.size,
    atualizados,
    notificacoes_criadas: notificacoes,
  });
});