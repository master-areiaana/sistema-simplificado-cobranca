import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtD, fmtM, hojeISO, normText } from "@/lib/cobranca";

const USER_KEY = "sc_assessoria_users";
const SESSION_KEY = "sc_assessoria_session";
const DEFAULT_COMPANY_PASS = "empresa123";
const CADASTRO_EVENT = "DADOS_CLIENTE_ASSESSORIA";

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

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "").trim();
}

function statusColor(status) {
  const s = normText(status);
  if (s.includes("INCOBRAVEL") || s.includes("SEM CONTATO")) return "#ef4444";
  if (s.includes("PROMESSA") || s.includes("NEGOCI")) return "#f59e0b";
  if (s.includes("PAGO") || s.includes("ENCERRADO")) return "#10b981";
  return "#64748b";
}

function parseJson(note) {
  try {
    const obj = JSON.parse(note || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
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
  if (e.event_type === CADASTRO_EVENT && e.event_subtype === "EDICAO_ASSESSORIA") return "Dados preenchidos pela assessoria";
  if (e.event_type === CADASTRO_EVENT && e.event_subtype === "EDICAO_CONTATO_ASSESSORIA") return "Contato atualizado";
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
  const [openItemId, setOpenItemId] = useState(null);
  const [newUser, setNewUser] = useState({ nome: "", usuario: "", senha: "", perfil: "assessoria" });
  const [adminPass, setAdminPass] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  const isEmpresa = session?.perfil === "empresa";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 50000),
        base44.entities.ChargeEvent.list("-created_date", 5000)
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

  function historicoDoTitulo(item) {
    return events
      .filter(e => sameTitleEvent(e, item))
      .sort((a, b) => String(b.event_date || b.created_date || "").localeCompare(String(a.event_date || a.created_date || "")));
  }

  function dadosPreenchidos(item) {
    const historico = historicoDoTitulo(item)
      .filter(e => e.event_type === CADASTRO_EVENT)
      .sort((a, b) => String(a.created_date || a.event_date || "").localeCompare(String(b.created_date || b.event_date || "")));
    const salvos = historico.reduce((acc, e) => ({ ...acc, ...parseJson(e.note) }), {});
    const local = formById[item.id] || {};
    return { ...salvos, ...local };
  }

  const assessoria = useMemo(() => {
    const b = normText(busca);
    return records.filter(r => {
      const dados = dadosPreenchidos(r);
      const histTxt = events.filter(e => sameTitleEvent(e, r)).map(e => `${e.status || ""} ${e.note || ""} ${e.event_user || ""}`).join(" ");
      if (b && !normText(`${r.nrCli} ${r.nomeCli} ${r.titulo} ${r.seq} ${dados.telefone || ""} ${dados.email || ""} ${dados.observacaoAssessoria || ""} ${histTxt}`).includes(b)) return false;
      if (statusFiltro && (dados.statusAssessoria || r.status) !== statusFiltro) return false;
      return true;
    }).sort((a, b2) => (b2.valorTotalDebito || 0) - (a.valorTotalDebito || 0));
  }, [records, events, busca, statusFiltro, formById]);

  const resumo = useMemo(() => ({
    clientes: new Set(assessoria.map(r => `${r.nrCli}|${normText(r.nomeCli)}`)).size,
    titulos: assessoria.length,
    total: assessoria.reduce((s, r) => s + (r.valorTotalDebito || 0), 0),
    vencidos: assessoria.filter(r => r.diasAtraso > 0).length,
    preenchidos: assessoria.filter(r => dadosPreenchidos(r).statusAssessoria || dadosPreenchidos(r).telefone || dadosPreenchidos(r).email || dadosPreenchidos(r).observacaoAssessoria).length,
  }), [assessoria, events, formById]);

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

  function updateForm(id, patch) {
    setFormById(p => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  }

  async function salvarLinha(item) {
    const dados = dadosPreenchidos(item);
    const payload = {
      telefone: dados.telefone || "",
      telefone2: dados.telefone2 || "",
      celular: dados.celular || "",
      email: dados.email || "",
      statusAssessoria: dados.statusAssessoria || "",
      promessa: dados.promessa || "",
      observacaoAssessoria: dados.observacaoAssessoria || "",
      atualizadoEm: new Date().toISOString()
    };

    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: CADASTRO_EVENT,
        event_subtype: "EDICAO_ASSESSORIA",
        event_date: hojeISO,
        status: payload.statusAssessoria || item.status || "Em assessoria",
        motive: "preenchimento_assessoria",
        promise_date: payload.promessa || null,
        note: JSON.stringify(payload),
        event_user: session?.nome || session?.usuario || "Assessoria"
      });

      if (item._dbId && payload.statusAssessoria) {
        await base44.entities.Titulo.update(item._dbId, {
          current_status: payload.statusAssessoria,
          promise_date: payload.promessa || null,
          last_contact_date: hojeISO,
          last_note: payload.observacaoAssessoria || "Dados atualizados pela assessoria",
          contact_count: Number(item.qtd || 0) + 1,
          workflow_status: "assessoria",
          updated_by: session?.nome || "Assessoria"
        });
      }

      setMsg("✅ Linha salva. As informações preenchidas entrarão no relatório da assessoria.");
      await loadData();
    } catch (err) {
      setMsg(`❌ Erro ao salvar linha: ${err.message}`);
    }
  }

  async function enviarChat(item) {
    const dados = dadosPreenchidos(item);
    const text = String(dados.mensagem || "").trim();
    if (!text) { alert("Digite uma mensagem para registrar no chat do título."); return; }
    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: "CHAT_ASSESSORIA",
        event_subtype: isEmpresa ? "EMPRESA_PARA_ASSESSORIA" : "ASSESSORIA_PARA_EMPRESA",
        event_date: hojeISO,
        status: dados.statusAssessoria || item.status || "Em Cobrança",
        motive: "chat_assessoria",
        note: text,
        event_user: session?.nome || session?.usuario || "Usuário"
      });
      updateForm(item.id, { mensagem: "" });
      setMsg("✅ Mensagem registrada no chat do título.");
      await loadData();
    } catch (err) {
      setMsg(`❌ Erro ao enviar mensagem: ${err.message}`);
    }
  }

  function baixarRelatorioAssessoria() {
    const linhas = assessoria.map(item => {
      const dados = dadosPreenchidos(item);
      return {
        CODCLI: item.nrCli || "",
        CLIENTE: item.nomeCli || "",
        TITULO: item.titulo ? `${item.titulo}${item.seq ? `/${item.seq}` : ""}` : "",
        RELATORIO: item.origem === "FINR1253" ? "Topcon" : "EB",
        VENCIMENTO: fmtD(item.vencimento),
        DIAS_ATRASO: item.diasAtraso || 0,
        VALOR_ORIGINAL: item.valorOriginal || 0,
        SALDO_COBRAR: item.valorTotalDebito || 0,
        STATUS_SISTEMA: item.status || "",
        STATUS_ASSESSORIA: dados.statusAssessoria || "",
        PROMESSA: dados.promessa || "",
        TELEFONE: dados.telefone || "",
        TELEFONE_2: dados.telefone2 || "",
        CELULAR: dados.celular || "",
        EMAIL: dados.email || "",
        OBSERVACAO_ASSESSORIA: dados.observacaoAssessoria || "",
        ULTIMA_ATUALIZACAO: dados.atualizadoEm || ""
      };
    });

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assessoria");
    XLSX.writeFile(wb, `relatorio_assessoria_${hojeISO}.xlsx`);
  }

  function addUser() {
    if (!isEmpresa) return;
    if (adminPass !== DEFAULT_COMPANY_PASS) { alert("Senha administrativa inválida."); return; }
    if (!newUser.nome || !newUser.usuario || !newUser.senha) { alert("Preencha nome, usuário e senha."); return; }
    if (users.some(u => normText(u.usuario) === normText(newUser.usuario))) { alert("Esse usuário já existe."); return; }
    const next = [...users, { ...newUser, ativo: true }];
    setUsers(next);
    saveUsers(next);
    setNewUser({ nome: "", usuario: "", senha: "", perfil: "assessoria" });
    setMsg("✅ Usuário de assessoria criado neste navegador.");
  }

  function toggleUser(usuario) {
    const next = users.map(u => u.usuario === usuario ? { ...u, ativo: u.ativo === false } : u);
    setUsers(next);
    saveUsers(next);
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif" }}>
        <form onSubmit={doLogin} style={{ width: 380, background: "#fff", border: "1px solid #ddd", borderRadius: 14, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,.12)" }}>
          <h2 style={{ margin: 0, letterSpacing: 3 }}>ASSESSORIA</h2>
          <p style={{ color: "#666", fontSize: 13 }}>Acesso restrito para cobrança externa.</p>
          <label style={labelLogin}>Usuário</label>
          <input value={login.usuario} onChange={e => setLogin(p => ({ ...p, usuario: e.target.value }))} style={loginInp} />
          <label style={labelLogin}>Senha</label>
          <input type="password" value={login.senha} onChange={e => setLogin(p => ({ ...p, senha: e.target.value }))} style={loginInp} />
          <button style={{ width: "100%", padding: 11, border: 0, borderRadius: 8, background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Entrar</button>
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
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Central de Assessoria · preenchimento em tabela · {session.nome}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/" style={topBtn}>← Sistema interno</a>
          {isEmpresa && <button onClick={() => setShowAdmin(x => !x)} style={topBtn}>Usuários</button>}
          <button onClick={baixarRelatorioAssessoria} style={{ ...topBtn, background: "#16a34a", color: "#fff", border: 0 }}>Baixar relatório</button>
          <button onClick={loadData} disabled={loading} style={{ ...topBtn, background: "#0ea5e9", color: "#fff", border: 0 }}>Atualizar</button>
          <button onClick={logout} style={{ ...topBtn, background: "#ef4444", color: "#fff", border: 0 }}>Sair</button>
        </div>
      </header>

      <main style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Card label="Clientes" value={resumo.clientes} />
          <Card label="Títulos" value={resumo.titulos} />
          <Card label="Vencidos" value={resumo.vencidos} color="#ef4444" />
          <Card label="Preenchidos" value={resumo.preenchidos} color="#16a34a" />
          <Card label="Saldo em Assessoria" value={fmtM(resumo.total)} color="#f97316" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
          <section style={box}>
            <h3 style={{ margin: "0 0 7px" }}>Envio para Assessoria</h3>
            <div style={{ color: "#666", fontSize: 12, lineHeight: 1.5 }}>
              Use os filtros e a tabela abaixo para preparar os títulos e clientes. A exportação do relatório não marca títulos como enviados automaticamente.
            </div>
            <button onClick={baixarRelatorioAssessoria} style={{ ...topBtn, background: "#16a34a", color: "#fff", border: 0, marginTop: 10 }}>
              Exportar relatório para envio
            </button>
          </section>
          <section style={box}>
            <h3 style={{ margin: "0 0 7px" }}>Portal da Assessoria</h3>
            <div style={{ color: "#666", fontSize: 12, lineHeight: 1.5 }}>
              Acompanhe a cobrança diretamente no portal externo RecuperaCob.
            </div>
            <a
              href="https://portal-recuperacob.cobcloud.com.br/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...topBtn, background: "#0ea5e9", color: "#fff", border: 0, display: "inline-block", marginTop: 10 }}
            >
              Acessar Portal RecuperaCob
            </a>
          </section>
        </div>

        {showAdmin && isEmpresa && (
          <section style={box}>
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

        <section style={{ ...box, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Filtros</span>
          <input placeholder="Buscar por cliente, nº, título, telefone, e-mail ou observação..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 9, border: "1px solid #ddd", borderRadius: 8 }} />
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 8 }}>
            <option value="">Todos os status</option>
            <option>Não Contatado</option><option>Em Cobrança</option><option>Sem Retorno</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option><option>INCOBRÁVEL</option><option>SEM CONTATO</option>
          </select>
        </section>

        {msg && <div style={{ marginBottom: 10, fontSize: 12, color: msg.startsWith("❌") ? "#dc2626" : "#16a34a" }}>{msg}</div>}

        <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", fontSize: 12, color: "#555", borderBottom: "1px solid #ddd" }}>
            A assessoria deve preencher as informações diretamente na tabela. O relatório pode ser baixado no botão <b>Baixar relatório</b>.
          </div>
          <div style={{ overflowX: "auto", maxHeight: "70vh" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 2600, width: "100%" }}>
              <thead>
                <tr>{["CODCLI", "TÍTULO", "RELATÓRIO", "CLIENTE", "VENCIMENTO", "DIAS", "VALOR", "SALDO", "STATUS SISTEMA", "STATUS ASSESSORIA", "PROMESSA", "TELEFONE", "TEL. 2", "CELULAR", "E-MAIL", "OBSERVAÇÃO ASSESSORIA", "AÇÕES"].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {assessoria.length === 0 && <tr><td colSpan={17} style={{ padding: 24, textAlign: "center", color: "#777" }}>Nenhum título encaminhado para assessoria.</td></tr>}
                {assessoria.map(item => {
                  const dados = dadosPreenchidos(item);
                  const hist = historicoDoTitulo(item);
                  const isOpen = openItemId === item.id;
                  const rowBg = item.diasAtraso > 900 ? "#fff3b0" : "#9be35d";
                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ background: rowBg }}>
                        <td style={td}>{item.nrCli}</td>
                        <td style={td}><b>{item.titulo}{item.seq ? `/${item.seq}` : ""}</b></td>
                        <td style={td}>{item.origem === "FINR1253" ? "Topcon" : "EB"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{item.nomeCli}</td>
                        <td style={td}>{fmtD(item.vencimento)}</td>
                        <td style={{ ...td, color: item.diasAtraso > 0 ? "#dc2626" : "#111", fontWeight: 800 }}>{item.diasAtraso}</td>
                        <td style={tdMoney}>{fmtM(item.valorOriginal)}</td>
                        <td style={tdMoney}>{fmtM(item.valorTotalDebito)}</td>
                        <td style={td}><span style={{ background: `${statusColor(item.status)}22`, color: statusColor(item.status), padding: "4px 7px", borderRadius: 8, fontWeight: 800 }}>{item.status}</span></td>
                        <td style={td}><select value={dados.statusAssessoria || ""} onChange={e => updateForm(item.id, { statusAssessoria: e.target.value })} style={editInp}><option value="">Selecionar...</option><option>SEM CONTATO</option><option>INCOBRÁVEL</option><option>Em Cobrança</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option></select></td>
                        <td style={td}><input type="date" value={dados.promessa || ""} onChange={e => updateForm(item.id, { promessa: e.target.value, statusAssessoria: e.target.value ? "Prometeu Pagar" : dados.statusAssessoria })} style={editInp} /></td>
                        <td style={td}><input value={dados.telefone || ""} onChange={e => updateForm(item.id, { telefone: e.target.value })} style={editInp} /></td>
                        <td style={td}><input value={dados.telefone2 || ""} onChange={e => updateForm(item.id, { telefone2: e.target.value })} style={editInp} /></td>
                        <td style={td}><input value={dados.celular || ""} onChange={e => updateForm(item.id, { celular: e.target.value })} style={editInp} /></td>
                        <td style={td}><input value={dados.email || ""} onChange={e => updateForm(item.id, { email: e.target.value })} style={{ ...editInp, minWidth: 220 }} /></td>
                        <td style={td}><textarea value={dados.observacaoAssessoria || ""} onChange={e => updateForm(item.id, { observacaoAssessoria: e.target.value })} style={{ ...editInp, minWidth: 260, height: 46, resize: "vertical" }} /></td>
                        <td style={td}>
                          <button onClick={() => salvarLinha(item)} style={miniBtnGreen}>Salvar</button>
                          <button onClick={() => setOpenItemId(isOpen ? null : item.id)} style={miniBtnOrange}>{isOpen ? "Fechar" : "Histórico"}</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={17} style={{ background: "#fff", padding: 14, borderBottom: "1px solid #ddd" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(320px, .9fr)", gap: 14 }}>
                            <div>
                              <h3 style={{ margin: "0 0 10px" }}>Mensagem empresa ↔ assessoria</h3>
                              <textarea rows={3} placeholder={isEmpresa ? "Mensagem da empresa para a assessoria..." : "Mensagem da assessoria para a empresa..."} value={dados.mensagem || ""} onChange={e => updateForm(item.id, { mensagem: e.target.value })} style={{ ...inp, resize: "vertical" }} />
                              <button onClick={() => enviarChat(item)} style={{ marginTop: 8, border: 0, background: "#0ea5e9", color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Enviar mensagem</button>
                            </div>
                            <div>
                              <h3 style={{ margin: "0 0 10px" }}>Histórico do título</h3>
                              <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 8, paddingRight: 4 }}>
                                {hist.length === 0 && <div style={{ color: "#777", fontSize: 12 }}>Ainda não existe histórico para este título.</div>}
                                {hist.map((ev, idx) => <HistoricoItem key={`${ev.id || idx}-${idx}`} ev={ev} />)}
                              </div>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function HistoricoItem({ ev }) {
  const isCadastro = ev.event_type === CADASTRO_EVENT;
  const isChat = ev.event_type === "CHAT_ASSESSORIA";
  const fromEmpresa = ev.event_subtype === "EMPRESA_PARA_ASSESSORIA";
  const dados = isCadastro ? parseJson(ev.note) : null;
  return (
    <div style={{ border: "1px solid #eee", borderLeft: `4px solid ${isCadastro ? "#16a34a" : isChat ? (fromEmpresa ? "#0ea5e9" : "#f97316") : statusColor(ev.status)}`, borderRadius: 10, padding: 9, background: isCadastro ? "#f0fdf4" : isChat ? "#f8fafc" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#666", marginBottom: 4 }}>
        <b style={{ color: "#111" }}>{eventKindLabel(ev)}</b>
        <span>{eventDateLabel(ev)}</span>
      </div>
      <div style={{ fontSize: 12 }}><b>{ev.event_user || "Usuário"}</b>{ev.status ? ` · ${ev.status}` : ""}</div>
      {ev.promise_date && <div style={{ fontSize: 12, color: "#f59e0b" }}>Promessa: {fmtD(ev.promise_date)}</div>}
      {isCadastro ? <div style={{ marginTop: 5, fontSize: 12 }}>Tel.: {dados.telefone || "—"} · Cel.: {dados.celular || "—"} · E-mail: {dados.email || "—"}<br />Obs.: {dados.observacaoAssessoria || "—"}</div> : ev.note && <div style={{ marginTop: 5, whiteSpace: "pre-wrap", fontSize: 12 }}>{ev.note}</div>}
    </div>
  );
}

const labelLogin = { fontSize: 12, fontWeight: 700 };
const loginInp = { width: "100%", padding: 10, margin: "6px 0 12px", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" };
const topBtn = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const box = { background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 14 };
const th = { position: "sticky", top: 0, background: "#e5e7eb", zIndex: 2, border: "1px solid #333", padding: "6px 8px", fontSize: 10, whiteSpace: "nowrap", textAlign: "left" };
const td = { border: "1px solid #333", padding: "5px 7px", fontSize: 10, verticalAlign: "middle", whiteSpace: "nowrap" };
const tdMoney = { ...td, textAlign: "right", fontWeight: 700 };
const editInp = { width: "100%", minWidth: 120, padding: "5px 6px", border: "1px solid #f59e0b", borderRadius: 5, background: "#fff7ed", fontSize: 10, boxSizing: "border-box" };
const miniBtnGreen = { display: "block", width: "100%", marginBottom: 4, border: 0, background: "#16a34a", color: "#fff", borderRadius: 5, padding: "5px 7px", fontSize: 10, fontWeight: 800, cursor: "pointer" };
const miniBtnOrange = { display: "block", width: "100%", border: 0, background: "#f97316", color: "#fff", borderRadius: 5, padding: "5px 7px", fontSize: 10, fontWeight: 800, cursor: "pointer" };
const inp = { width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 7, boxSizing: "border-box", fontSize: 12 };

function Card({ label, value, color = "#111" }) {
  return <div style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: 14 }}><div style={{ color: "#666", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>{label}</div><div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div></div>;
}

function Field({ label, value, onChange, type = "text" }) {
  return <label style={{ fontSize: 12, fontWeight: 700 }}>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", display: "block", padding: 8, border: "1px solid #ddd", borderRadius: 8, marginTop: 4, boxSizing: "border-box" }} /></label>;
}
