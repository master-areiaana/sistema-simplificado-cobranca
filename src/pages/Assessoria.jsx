import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtD, fmtM, hojeISO, normText } from "@/lib/cobranca";

const USER_KEY = "sc_assessoria_users";
const SESSION_KEY = "sc_assessoria_session";
const DEFAULT_COMPANY_PASS = "empresa123";

const baseUsers = [
  { nome: "Empresa", usuario: "empresa", senha: DEFAULT_COMPANY_PASS, perfil: "empresa", ativo: true },
  { nome: "Assessoria", usuario: "assessoria", senha: "123456", perfil: "assessoria", ativo: true }
];

function loadUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_KEY) || "[]");
    return saved.length ? saved : baseUsers;
  } catch {
    return baseUsers;
  }
}

function saveUsers(users) {
  localStorage.setItem(USER_KEY, JSON.stringify(users));
}

function statusColor(status) {
  const s = normText(status);
  if (s.includes("INCOBRAVEL") || s.includes("SEM CONTATO")) return "#ef4444";
  if (s.includes("PROMESSA") || s.includes("NEGOCI")) return "#f59e0b";
  if (s.includes("PAGO") || s.includes("ENCERRADO")) return "#10b981";
  return "#64748b";
}

export default function Assessoria() {
  const [users, setUsers] = useState(() => loadUsers());
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  });
  const [login, setLogin] = useState({ usuario: "", senha: "" });
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [formById, setFormById] = useState({});
  const [newUser, setNewUser] = useState({ nome: "", usuario: "", senha: "", perfil: "assessoria" });
  const [adminPass, setAdminPass] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  const isEmpresa = session?.perfil === "empresa";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 3000),
        base44.entities.ChargeEvent.list("-created_date", 3000)
      ]);
      setRecords((titulos || []).map(dbToItem).filter(x => x.encaminhar === "assessoria"));
      setEvents(evts || []);
      setMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${titulos?.length || 0} títulos lidos, ${((titulos || []).map(dbToItem).filter(x => x.encaminhar === "assessoria")).length} em assessoria`);
    } catch (err) {
      setMsg(`❌ Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  const assessoria = useMemo(() => {
    const b = normText(busca);
    return records.filter(r => {
      if (b && !normText(`${r.nrCli} ${r.nomeCli} ${r.titulo} ${r.seq}`).includes(b)) return false;
      if (statusFiltro && r.status !== statusFiltro) return false;
      return true;
    }).sort((a, b2) => (b2.valorTotalDebito || 0) - (a.valorTotalDebito || 0));
  }, [records, busca, statusFiltro]);

  const resumo = useMemo(() => ({
    clientes: new Set(assessoria.map(r => `${r.nrCli}|${normText(r.nomeCli)}`)).size,
    titulos: assessoria.length,
    total: assessoria.reduce((s, r) => s + (r.valorTotalDebito || 0), 0),
    vencidos: assessoria.filter(r => r.diasAtraso > 0).length,
  }), [assessoria]);

  function doLogin(e) {
    e.preventDefault();
    const u = users.find(x => x.ativo !== false && normText(x.usuario) === normText(login.usuario) && x.senha === login.senha);
    if (!u) { setMsg("❌ Usuário ou senha inválidos."); return; }
    const s = { nome: u.nome, usuario: u.usuario, perfil: u.perfil };
    setSession(s);
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  function updateLocalForm(id, patch) {
    setFormById(p => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  }

  async function salvarRetorno(item) {
    const frm = formById[item.id] || {};
    if (!frm.status) { alert("Selecione o status do retorno."); return; }
    if (!frm.obs?.trim()) { alert("Preencha a observação/retorno da assessoria."); return; }

    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: "ASSESSORIA",
        event_subtype: "RETORNO_ASSESSORIA",
        event_date: hojeISO,
        status: frm.status,
        motive: "assessoria",
        contact_type: frm.tipo || null,
        promise_date: frm.promessa || null,
        note: frm.obs,
        event_user: session?.nome || session?.usuario || "Assessoria"
      });
      if (item._dbId) {
        await base44.entities.Titulo.update(item._dbId, {
          current_status: frm.status,
          current_motive: "assessoria",
          current_contact_type: frm.tipo || null,
          promise_date: frm.promessa || null,
          last_contact_date: hojeISO,
          last_note: frm.obs,
          contact_count: Number(item.qtd || 0) + 1,
          workflow_status: frm.devolver ? "normal" : "assessoria",
          updated_by: session?.nome || "Assessoria"
        });
      }
      updateLocalForm(item.id, { obs: "" });
      setMsg("✅ Retorno salvo. A empresa já consegue visualizar no histórico.");
      await loadData();
    } catch (err) {
      setMsg(`❌ Erro ao salvar retorno: ${err.message}`);
    }
  }

  function addUser() {
    if (!isEmpresa) return;
    if (adminPass !== DEFAULT_COMPANY_PASS) { alert("Senha administrativa inválida."); return; }
    if (!newUser.nome || !newUser.usuario || !newUser.senha) { alert("Preencha nome, usuário e senha."); return; }
    if (users.some(u => normText(u.usuario) === normText(newUser.usuario))) { alert("Esse usuário já existe."); return; }
    const next = [...users, { ...newUser, ativo: true }];
    setUsers(next); saveUsers(next);
    setNewUser({ nome: "", usuario: "", senha: "", perfil: "assessoria" });
    setMsg("✅ Usuário de assessoria criado neste navegador.");
  }

  function toggleUser(usuario) {
    const next = users.map(u => u.usuario === usuario ? { ...u, ativo: u.ativo === false } : u);
    setUsers(next); saveUsers(next);
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif" }}>
        <form onSubmit={doLogin} style={{ width: 380, background: "#fff", border: "1px solid #ddd", borderRadius: 14, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,.12)" }}>
          <h2 style={{ margin: 0, letterSpacing: 3 }}>ASSESSORIA</h2>
          <p style={{ color: "#666", fontSize: 13 }}>Acesso restrito para cobrança externa.</p>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Usuário</label>
          <input value={login.usuario} onChange={e => setLogin(p => ({ ...p, usuario: e.target.value }))} style={{ width: "100%", padding: 10, margin: "6px 0 12px", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }} />
          <label style={{ fontSize: 12, fontWeight: 700 }}>Senha</label>
          <input type="password" value={login.senha} onChange={e => setLogin(p => ({ ...p, senha: e.target.value }))} style={{ width: "100%", padding: 10, margin: "6px 0 16px", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }} />
          <button style={{ width: "100%", padding: 11, border: 0, borderRadius: 8, background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Entrar</button>
          <div style={{ marginTop: 12, fontSize: 11, color: "#777" }}>Usuário inicial: assessoria / 123456. Empresa: empresa / empresa123.</div>
          {msg && <div style={{ marginTop: 12, color: msg.startsWith("❌") ? "#dc2626" : "#16a34a", fontSize: 12 }}>{msg}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "Segoe UI, sans-serif", color: "#111" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #ddd", padding: "14px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 4 }}>SISTEMA DE COBRANÇA</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Portal da Assessoria</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/" style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111", background: "#fff", fontSize: 12, fontWeight: 700 }}>← Sistema interno</a>
          {isEmpresa && <button onClick={() => setShowAdmin(x => !x)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", background: showAdmin ? "#111" : "#fff", color: showAdmin ? "#fff" : "#111", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Usuários</button>}
          <button onClick={loadData} disabled={loading} style={{ padding: "7px 10px", borderRadius: 8, border: 0, background: "#0ea5e9", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Atualizar</button>
          <button onClick={logout} style={{ padding: "7px 10px", borderRadius: 8, border: 0, background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Sair</button>
        </div>
      </header>

      <main style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Card label="Clientes" value={resumo.clientes} />
          <Card label="Títulos" value={resumo.titulos} />
          <Card label="Vencidos" value={resumo.vencidos} color="#ef4444" />
          <Card label="Saldo em Assessoria" value={fmtM(resumo.total)} color="#f97316" />
        </div>

        {showAdmin && isEmpresa && (
          <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 10px" }}>Controle de acesso da assessoria</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <Field label="Nome" value={newUser.nome} onChange={v => setNewUser(p => ({ ...p, nome: v }))} />
              <Field label="Usuário" value={newUser.usuario} onChange={v => setNewUser(p => ({ ...p, usuario: v }))} />
              <Field label="Senha" value={newUser.senha} onChange={v => setNewUser(p => ({ ...p, senha: v }))} />
              <Field label="Senha admin" type="password" value={adminPass} onChange={setAdminPass} />
              <button onClick={addUser} style={{ padding: 10, border: 0, borderRadius: 8, background: "#f97316", color: "#fff", fontWeight: 800 }}>Criar acesso</button>
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              {users.map(u => <div key={u.usuario} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #eee", padding: 8, borderRadius: 8, fontSize: 12 }}><span><b>{u.nome}</b> · {u.usuario} · {u.perfil}</span><button onClick={() => toggleUser(u.usuario)} style={{ border: 0, borderRadius: 6, padding: "3px 8px", background: u.ativo === false ? "#10b981" : "#64748b", color: "#fff" }}>{u.ativo === false ? "Ativar" : "Desativar"}</button></div>)}
            </div>
          </section>
        )}

        <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Filtros</span>
          <input placeholder="Buscar por cliente, nº ou título..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 9, border: "1px solid #ddd", borderRadius: 8 }} />
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 8 }}>
            <option value="">Todos os status</option>
            <option>Não Contatado</option><option>Em Cobrança</option><option>Sem Retorno</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option><option>Incobrável</option><option>SEM CONTATO</option>
          </select>
        </section>

        {msg && <div style={{ marginBottom: 10, fontSize: 12, color: msg.startsWith("❌") ? "#dc2626" : "#16a34a" }}>{msg}</div>}

        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#eee", color: "#333", textTransform: "uppercase", fontSize: 10 }}>
              <tr>
                <th style={th}>Processo/Título</th><th style={th}>Saldo</th><th style={th}>Carteira/Credor</th><th style={th}>CNPJ/CPF</th><th style={th}>Devedor</th><th style={th}>Status</th><th style={th}>Vencimento</th><th style={th}>Obs./Retorno</th><th style={th}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {assessoria.length === 0 && <tr><td colSpan="9" style={{ padding: 26, textAlign: "center", color: "#777" }}>Nenhum título encaminhado para assessoria.</td></tr>}
              {assessoria.map(item => {
                const frm = formById[item.id] || {};
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}>{item.titulo}{item.seq ? `/${item.seq}` : ""}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmtM(item.valorTotalDebito)}</td>
                    <td style={td}>{item.nrCli} | {item.portador || item.tp || item.origem}</td>
                    <td style={td}>—</td>
                    <td style={{ ...td, fontWeight: 700 }}>{item.nomeCli}</td>
                    <td style={td}><span style={{ background: `${statusColor(item.status)}22`, color: statusColor(item.status), padding: "4px 7px", borderRadius: 8, fontWeight: 800 }}>{item.status}</span></td>
                    <td style={td}>{fmtD(item.vencimento)}<br/><small style={{ color: item.diasAtraso > 0 ? "#ef4444" : "#666" }}>{item.diasAtraso > 0 ? `${item.diasAtraso} dias` : "em dia"}</small></td>
                    <td style={{ ...td, minWidth: 280 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <select value={frm.status || ""} onChange={e => updateLocalForm(item.id, { status: e.target.value })} style={inp}><option value="">Status do retorno...</option><option>SEM CONTATO</option><option>INCOBRÁVEL</option><option>Em Cobrança</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option></select>
                        <input type="date" value={frm.promessa || ""} onChange={e => updateLocalForm(item.id, { promessa: e.target.value })} style={inp} />
                        <textarea rows={2} placeholder="Observação da assessoria..." value={frm.obs || ""} onChange={e => updateLocalForm(item.id, { obs: e.target.value })} style={{ ...inp, resize: "vertical" }} />
                        <label style={{ fontSize: 11 }}><input type="checkbox" checked={!!frm.devolver} onChange={e => updateLocalForm(item.id, { devolver: e.target.checked })} /> Devolver para carteira da empresa</label>
                      </div>
                    </td>
                    <td style={td}><button onClick={() => salvarRetorno(item)} style={{ border: 0, background: "#f97316", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 800, cursor: "pointer" }}>Salvar retorno</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

const th = { padding: "9px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
const td = { padding: "9px 8px", verticalAlign: "top" };
const inp = { width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 7, boxSizing: "border-box", fontSize: 12 };

function Card({ label, value, color = "#111" }) {
  return <div style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: 14 }}><div style={{ color: "#666", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>{label}</div><div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div></div>;
}
function Field({ label, value, onChange, type = "text" }) {
  return <label style={{ fontSize: 12, fontWeight: 700 }}>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", display: "block", padding: 8, border: "1px solid #ddd", borderRadius: 8, marginTop: 4, boxSizing: "border-box" }} /></label>;
}
