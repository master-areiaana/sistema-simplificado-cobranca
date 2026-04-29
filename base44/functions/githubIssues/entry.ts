import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
    const REPO = "master-areiaana/Sistema-de-cobranca";
    const body = await req.json().catch(() => ({}));
    const { action, title, bodyText, labels, state, label_filter } = body;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Sistema-Cobranca-App",
    };

    if (action === "create") {
      if (!title) return Response.json({ error: "title required" }, { status: 400 });
      const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, body: bodyText || "", labels: labels || [] }),
      });
      const data = await res.json();
      return Response.json({ issue: data });
    }

    // list issues
    let url = `https://api.github.com/repos/${REPO}/issues?state=${state || "open"}&per_page=50`;
    if (label_filter) url += `&labels=${encodeURIComponent(label_filter)}`;
    const res = await fetch(url, { headers });
    const issues = await res.json();
    return Response.json({ issues: Array.isArray(issues) ? issues : [] });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});