import React from "react";

const fieldStyle = { width: "100%", display: "block", padding: 8, border: "1px solid #ddd", borderRadius: 8, marginTop: 4, boxSizing: "border-box" };

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 700 }}>
      {label}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={fieldStyle} />
    </label>
  );
}

export default function ControleUsuariosAssessoria({
  users = [],
  newUser,
  setNewUser,
  adminPass,
  setAdminPass,
  onAddUser,
  onToggleUser
}) {
  return (
    <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <h3 style={{ margin: "0 0 10px" }}>Controle de acesso da assessoria</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <Field label="Nome" value={newUser.nome} onChange={v => setNewUser(p => ({ ...p, nome: v }))} />
        <Field label="Usuário" value={newUser.usuario} onChange={v => setNewUser(p => ({ ...p, usuario: v }))} />
        <Field label="Senha" value={newUser.senha} onChange={v => setNewUser(p => ({ ...p, senha: v }))} />
        <Field label="Senha admin" type="password" value={adminPass} onChange={setAdminPass} />
        <button onClick={onAddUser} style={{ padding: 10, border: 0, borderRadius: 8, background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Criar acesso</button>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {users.map(u => (
          <div key={u.usuario} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #eee", padding: 8, borderRadius: 8, fontSize: 12 }}>
            <span><b>{u.nome}</b> · {u.usuario} · {u.perfil}</span>
            <button onClick={() => onToggleUser(u.usuario)} style={{ border: 0, borderRadius: 6, padding: "3px 8px", background: u.ativo === false ? "#10b981" : "#64748b", color: "#fff", cursor: "pointer" }}>
              {u.ativo === false ? "Ativar" : "Desativar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
