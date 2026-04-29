import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("supabase");
    const body = await req.json().catch(() => ({}));
    const { action, table, data: payload, filters } = body;

    // Get project ref
    const projRes = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = await projRes.json();
    if (!projects?.length) return Response.json({ error: "No Supabase projects found" }, { status: 404 });
    const projectRef = projects[0].ref;

    // Get service_role key
    const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const keys = await keysRes.json();
    const serviceKey = keys?.find(k => k.name === "service_role")?.api_key;
    if (!serviceKey) return Response.json({ error: "service_role key not found" }, { status: 500 });

    const restBase = `https://${projectRef}.supabase.co/rest/v1`;
    const restHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    if (action === "insert") {
      const res = await fetch(`${restBase}/${table}`, {
        method: "POST",
        headers: restHeaders,
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      return Response.json({ result });
    }

    if (action === "list_tables") {
      const schemaRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" }),
      });
      const schema = await schemaRes.json();
      return Response.json({ tables: schema });
    }

    // default: read table
    let qs = `?order=created_at.desc&limit=${filters?.limit || 100}`;
    if (filters?.cobrador) qs += `&cobrador=eq.${encodeURIComponent(filters.cobrador)}`;
    if (filters?.mes) qs += `&mes=eq.${encodeURIComponent(filters.mes)}`;
    const res = await fetch(`${restBase}/${table || "productivity_logs"}${qs}`, { headers: restHeaders });
    const rows = await res.json();
    return Response.json({ rows: Array.isArray(rows) ? rows : [], project: projects[0].name });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});