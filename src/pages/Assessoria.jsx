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

function sameTitleEvent(e, item) {
  const byId = e.titulo_id && item.id && String(e.titulo_id) === String(item.id);
  const byClient = String(e.client_code || "").trim() === String(item.nrCli || "").trim() && normText(e.client_name || "") === normText(item.nomeCli || "");
  return byId || byClient;
}

function eventDateLabel(e) {
  const d = e.event_date || e.created_date;
  return d ? fmtD(String(d).slice(0, 10)) : "—";
}

function eventKindLabel(e) {
  if (e.event_type === "CHAT_ASSESSORIA") return "Chat";
  if (e.event_type === "ASSESSORIA") return "Retorno Assessoria";
  if (e.event_subtype === "RETORNO_ASSESSORIA") return "Retorno Assessoria";
  if (e.event_type === "COBRANCA") return "Cobrança";
  return e.event_type || "Histórico";
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
  const [chatById, setChatById] = useState({});
  const [openItemId, setOpenItemId] = useState(null);
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
      const emAssessoria = (titulos || []).map(dbToItem).filter(x => x.encaminhar === "assessoria");
      setRecords(emAssessoria);
      setEvents(evts || []);
      setMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${emAssessoria.length} título(s) em assessoria`);
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
      const histTxt = events.filter(e => sameTitleEvent(e, r)).map(e => `${e.status || ""} ${e.note || ""} ${e.event_user || ""}`).join(" ");
      if (b && !normText(`${r.nrCli} ${r.nomeCli} ${r.titulo} ${r.seq} ${histTxt}`).includes(b)) return false;
      if (statusFiltro && r.status !== statusFiltro) return false;
      return true;
    }).sort((a, b2) => (b2.valorTotalDebito || 0) - (a.valorTotalDebito || 0));
  }, [records, events, busca, statusFiltro]);

  const resumo = useMemo(() => ({
    clientes: new Set(assessoria.map(r => `${r.nrCli}|${normText(r.nomeCli)}`)).size,
    titulos: assessoria.length,
    total: assessoria.reduce((s, r) => s + (r.valorTotalDebito || 0), 0),
    vencidos: assessoria.filter(r => r.diasAtraso > 0).length,
    semRetorno: assessoria.filter(r => !events.some(e => sameTitleEvent(e, r) && (e.event_type === "ASSESSORIA" || e.event_type === "CHAT_ASSESSORIA"))).length,
  }), [assessoria, events]);

  function historicoDoTitulo(item) {
    return events
      .filter(e => sameTitleEvent(e, item))
      .sort((a, b) => String(b.event_date || b.created_date || "").localeCompare(String(a.event_date || a.created_date || "")));
  }

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
        motive: frm.devolver ? "devolver_carteira" : "assessoria",
        contact_type: frm.tipo || null,
        promise_date: frm.promessa || null,
        note: frm.obs,
        event_user: session?.nome || session?.usuario || "Assessoria"
      });
      if (item._dbId) {
        await base44.entities.Titulo.update(item._dbId, {
          current_status: frm.status,
          current_motive: frm.devolver ? "devolver_carteira" : "assessoria",
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
      setMsg("✅ Retorno salvo e registrado no histórico do título.");
      await loadData();
    } catch (err) {
      setMsg(`❌ Erro ao salvar retorno: ${err.message}`);
    }
  }

  async function enviarChat(item) {
    const text = (chatById[item.id] || "").trim();
    if (!text) { alert("Digite uma mensagem para registrar no chat do título."); return; }
    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: "CHAT_ASSESSORIA",
        event_subtype: isEmpresa ? "EMPRESA_PARA_ASSESSORIA" : "ASSESSORIA_PARA_EMPRESA",
        event_date: hojeISO,
        status: item.status || "Em Cobrança",
        motive: "chat_assessoria",
        note: text,
        event_user: session?.nome || session?.usuario || "Usuário"
      });
      setChatById(p => ({ ...p, [item.id]: "" }));
      setMsg("✅ Mensagem registrada no chat do título.");
      await loadData();
    } catch (err) {
      setMsg(`❌ Erro ao enviar mensagem: ${err.message}`);
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
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Central de Assessoria · Acompanhamento por título · {session.nome}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/" style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111", background: "#fff", fontSize: 12, fontWeight: 700 }}>← Sistema interno</a>
          {isEmpresa && <button onClick={() => setShowAdmin(x => !x)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", background: showAdmin ? "#111" : "#fff", color: showAdmin ? "#fff" : "#111", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Usuários</button>}
          <button onClick={loadData} disabled={loading} style={{ padding: "7px 10px", borderRadius: 8, border: 0, background: "#0ea5e9", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Atualizar</button>
          <button onClick={logout} style={{ padding: "7px 10px", borderRadius: 8, border: 0, background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Sair</button>
        </div>
      </header>

      <main style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Card label="Clientes" value={resumo.clientes} />
          <Card label="Títulos" value={resumo.titulos} />
          <Card label="Vencidos" value={resumo.vencidos} color="#ef4444" />
          <Card label="Sem retorno" value={resumo.semRetorno} color="#f59e0b" />
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
          <input placeholder="Buscar por cliente, nº, título, mensagem ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 9, border: "1px solid #ddd", borderRadius: 8 }} />
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 8 }}>
            <option value="">Todos os status</option>
            <option>Não Contatado</option><option>Em Cobrança</option><option>Sem Retorno</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option><option>Incobrável</option><option>SEM CONTATO</option>
          </select>
        </section>

        {msg && <div style={{ marginBottom: 10, fontSize: 12, color: msg.startsWith("❌") ? "#dc2626" : "#16a34a" }}>{msg}</div>}

        <div style={{ display: "grid", gap: 12 }}>
          {assessoria.length === 0 && <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 26, textAlign: "center", color: "#777" }}>Nenhum título encaminhado para assessoria.</div>}
          {assessoria.map(item => {
            const frm = formById[item.id] || {};
            const hist = historicoDoTitulo(item);
            const isOpen = openItemId === item.id;
            return (
              <section key={item.id} style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${statusColor(item.status)}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 130px 1fr 140px 120px 120px auto", gap: 8, alignItems: "center", padding: 12, borderBottom: "1px solid #eee" }}>
                  <div><small style={muted}>Processo/Título</small><br/><b>{item.titulo}{item.seq ? `/${item.seq}` : ""}</b></div>
                  <div><small style={muted}>Saldo</small><br/><b>{fmtM(item.valorTotalDebito)}</b></div>
                  <div><small style={muted}>Devedor</small><br/><b>{item.nomeCli}</b><br/><span style={muted}>{item.nrCli} · {item.portador || item.tp || item.origem}</span></div>
                  <div><small style={muted}>Status</small><br/><span style={{ background: `${statusColor(item.status)}22`, color: statusColor(item.status), padding: "4px 7px", borderRadius: 8, fontWeight: 800 }}>{item.status}</span></div>
                  <div><small style={muted}>Vencimento</small><br/>{fmtD(item.vencimento)}<br/><span style={{ color: item.diasAtraso > 0 ? "#ef4444" : "#666", fontSize: 11 }}>{item.diasAtraso > 0 ? `${item.diasAtraso} dias` : "em dia"}</span></div>
                  <div><small style={muted}>Registros</small><br/><b>{hist.length}</b></div>
                  <button onClick={() => setOpenItemId(isOpen ? null : item.id)} style={{ border: 0, borderRadius: 8, padding: "8px 10px", background: isOpen ? "#111827" : "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{isOpen ? "Fechar" : "Acompanhar"}</button>
                </div>

                {isOpen && (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(320px, .9fr)", gap: 14, padding: 14 }}>
                    <div>
                      <h3 style={{ margin: "0 0 10px" }}>Retorno da assessoria / ação no título</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <select value={frm.status || ""} onChange={e => updateLocalForm(item.id, { status: e.target.value })} style={inp}><option value="">Status do retorno...</option><option>SEM CONTATO</option><option>INCOBRÁVEL</option><option>Em Cobrança</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option></select>
                        <input type="date" value={frm.promessa || ""} onChange={e => updateLocalForm(item.id, { promessa: e.target.value, status: e.target.value ? "Prometeu Pagar" : frm.status })} style={inp} />
                      </div>
                      <textarea rows={3} placeholder="Observação/ação da assessoria..." value={frm.obs || ""} onChange={e => updateLocalForm(item.id, { obs: e.target.value })} style={{ ...inp, resize: "vertical", marginTop: 8 }} />
                      <label style={{ display: "block", fontSize: 11, marginTop: 8 }}><input type="checkbox" checked={!!frm.devolver} onChange={e => updateLocalForm(item.id, { devolver: e.target.checked })} /> Devolver para carteira da empresa</label>
                      <button onClick={() => salvarRetorno(item)} style={{ marginTop: 10, border: 0, background: "#f97316", color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Salvar retorno no histórico</button>

                      <h3 style={{ margin: "18px 0 10px" }}>Chat empresa ↔ assessoria</h3>
                      <textarea rows={3} placeholder={isEmpresa ? "Mensagem da empresa para a assessoria..." : "Mensagem da assessoria para a empresa..."} value={chatById[item.id] || ""} onChange={e => setChatById(p => ({ ...p, [item.id]: e.target.value }))} style={{ ...inp, resize: "vertical" }} />
                      <button onClick={() => enviarChat(item)} style={{ marginTop: 8, border: 0, background: "#0ea5e9", color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Enviar mensagem e registrar</button>
                    </div>

                    <div>
                      <h3 style={{ margin: "0 0 10px" }}>Histórico completo do título</h3>
                      <div style={{ maxHeight: 390, overflowY: "auto", display: "grid", gap: 8, paddingRight: 4 }}>
                        {hist.length === 0 && <div style={{ color: "#777", fontSize: 12 }}>Ainda não existe histórico para este título.</div>}
                        {hist.map((e, idx) => {
                          const isChat = e.event_type === "CHAT_ASSESSORIA";
                          const fromEmpresa = e.event_subtype === "EMPRESA_PARA_ASSESSORIA";
                          return (
                            <div key={`${e.id || idx}-${idx}`} style={{ border: "1px solid #eee", borderLeft: `4px solid ${isChat ? (fromEmpresa ? "#0ea5e9" : "#f97316") : statusColor(e.status)}`, borderRadius: 10, padding: 9, background: isChat ? "#f8fafc" : "#fff" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#666", marginBottom: 4 }}>
                                <b style={{ color: "#111" }}>{eventKindLabel(e)}</b>
                                <span>{eventDateLabel(e)}</span>
                              </div>
                              <div style={{ fontSize: 12 }}><b>{e.event_user || "Usuário"}</b>{e.status ? ` · ${e.status}` : ""}</div>
                              {e.promise_date && <div style={{ fontSize: 12, color: "#f59e0b" }}>Promessa: {fmtD(e.promise_date)}</div>}
                              {e.note && <div style={{ marginTop: 5, whiteSpace: "pre-wrap", fontSize: 12 }}>{e.note}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const muted = { color: "#666", fontSize: 11 };
const inp = { width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 7, boxSizing: "border-box", fontSize: 12 };

function Card({ label, value, color = "#111" }) {
  return <div style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: 14 }}><div style={{ color: "#666", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>{label}</div><div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div></div>;
}
function Field({ label, value, onChange, type = "text" }) {
  return <label style={{ fontSize: 12, fontWeight: 700 }}>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", display: "block", padding: 8, border: "1px solid #ddd", borderRadius: 8, marginTop: 4, boxSizing: "border-box" }} /></label>;
}
