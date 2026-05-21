import { useState, useEffect, useRef, useMemo } from "react";

export default function ColHeader({ label, field, data, filters, setFilters, t, sortKey, sortCfg, onSort, width }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftSelected, setDraftSelected] = useState(null);
  const ref = useRef(null);

  const allValues = useMemo(() => {
    const vals = [...new Set(data.map(row => {
      const v = row[field];
      return v == null || v === "" ? "(Vazio)" : String(v);
    }))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return vals;
  }, [data, field]);

  const selected = filters[field] || null;
  const hasFilter = selected !== null && selected.length < allValues.length;

  useEffect(() => {
    if (!open) return;
    setDraftSelected(selected ? selected.filter(v => allValues.includes(v)) : null);
    setSearch("");
  }, [open, field]);

  useEffect(() => {
    if (!open) return;
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const currentSelection = draftSelected || allValues;
  const filtered = allValues.filter(v => !search || v.toLowerCase().includes(search.toLowerCase()));
  const allChecked = !draftSelected || draftSelected.length === allValues.length;
  const someChecked = draftSelected && draftSelected.length > 0 && draftSelected.length < allValues.length;

  function stop(e) {
    e.stopPropagation();
  }

  function toggle(val) {
    const cur = draftSelected || allValues;
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
    setDraftSelected(next.length === allValues.length ? null : next);
  }

  function selectAll() { setDraftSelected(null); }
  function clearAll() { setDraftSelected([]); }

  function applyFilter() {
    setFilters(f => ({ ...f, [field]: draftSelected && draftSelected.length < allValues.length ? draftSelected : null }));
    setOpen(false);
  }

  function cancelFilter() {
    setDraftSelected(selected ? selected.filter(v => allValues.includes(v)) : null);
    setOpen(false);
  }

  function clearColumnFilter() {
    setDraftSelected(null);
    setFilters(f => ({ ...f, [field]: null }));
    setOpen(false);
  }

  const act = sortCfg?.key === sortKey;
  const thStyle = { background: t.th, padding: 0, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, position: "relative", minWidth: width || "auto", userSelect: "none" };

  return (
    <th ref={ref} style={thStyle}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {sortKey
          ? <button onClick={() => onSort && onSort(sortKey)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "9px 6px 9px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: act ? t.p : t.muted, letterSpacing: .4, display: "flex", alignItems: "center", gap: 4 }}>
            {label}{act ? (sortCfg.dir === "asc" ? "  ▲" : "  ▼") : ""}
          </button>
          : <div style={{ flex: 1, padding: "9px 6px 9px 10px", fontSize: 11, fontWeight: 700, color: t.muted, letterSpacing: .4 }}>{label}</div>
        }
        <button onClick={(e) => { e.stopPropagation(); setOpen(x => !x); }} style={{ background: hasFilter ? t.p : "none", border: "none", cursor: "pointer", padding: "0 8px", fontSize: 11, color: hasFilter ? "#fff" : t.muted, borderLeft: `1px solid ${t.bor}33`, display: "flex", alignItems: "center" }} title="Filtrar">
          {hasFilter ? "▼" : "⌄"}
        </button>
      </div>

      {open && (
        <div onMouseDown={stop} onClick={stop} style={{ position: "absolute", top: "100%", left: 0, zIndex: 500, background: t.drop, border: `1px solid ${t.p}`, borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,.25)", minWidth: 240, maxWidth: 340 }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${t.bor}` }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Pesquisar..." style={{ width: "100%", background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "5px 8px", fontSize: 12, color: t.txt, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${t.bor}` }}>
            <button onClick={selectAll} style={{ flex: 1, background: t.th, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "4px 0", fontSize: 11, cursor: "pointer", color: t.txt, fontWeight: 600 }}>Selecionar tudo</button>
            <button onClick={clearAll} style={{ flex: 1, background: t.th, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "4px 0", fontSize: 11, cursor: "pointer", color: "#ef4444", fontWeight: 600 }}>Desmarcar</button>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", padding: "4px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: t.txt }} onMouseEnter={e => e.currentTarget.style.background = t.surf2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked || false; }} onChange={allChecked ? clearAll : selectAll} style={{ accentColor: t.p, width: 14, height: 14 }} />
              (Selecionar tudo)
            </label>
            {filtered.map(val => {
              const chk = currentSelection.includes(val);
              return (
                <label key={val} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, color: t.txt }} onMouseEnter={e => e.currentTarget.style.background = t.surf2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <input type="checkbox" checked={chk} onChange={() => toggle(val)} style={{ accentColor: t.p, width: 14, height: 14 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={val}>{val}</span>
                </label>
              );
            })}
            {filtered.length === 0 && <div style={{ padding: "10px 12px", color: t.muted, fontSize: 12 }}>Nenhum resultado</div>}
          </div>
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${t.bor}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={applyFilter} style={{ background: t.p, border: "none", borderRadius: 5, padding: "5px 14px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Aplicar</button>
            <button onClick={clearColumnFilter} style={{ background: t.th, border: `1px solid ${t.bor}`, borderRadius: 5, padding: "5px 10px", color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Limpar</button>
            <button onClick={cancelFilter} style={{ background: t.th, border: `1px solid ${t.bor}`, borderRadius: 5, padding: "5px 10px", color: t.txt, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
    </th>
  );
}