import { useState, useEffect, useRef } from "react";

// ---------- constants ----------
const STORAGE_KEY = "paycheck-planner-v1";
const C = {
  bg: "#0E1220",
  card: "#171C2E",
  cardUp: "#1F2540",
  line: "#262D47",
  amber: "#F5B841",
  mint: "#5BD9A4",
  red: "#F0616B",
  text: "#EDEFF7",
  mute: "#8B92A8",
};

const seed = {
  payAmount: 1760,
  fixed: [{ id: "f1", name: "Fixed obligations", cost: 1100 }],
  paychecks: [
    { id: "p1", label: "Jul 10" },
    { id: "p2", label: "Jul 24" },
    { id: "p3", label: "Aug 7" },
    { id: "p4", label: "Aug 21" },
  ],
  items: [
    { id: "i1", name: "E-bike", cost: 300, pc: "p1", paid: false },
    { id: "i2", name: "Phone pay off 1/4", cost: 150, pc: "p1", paid: false },
    { id: "i3", name: "Instacart", cost: 80, pc: "p1", paid: false },
    { id: "i4", name: "Smart water bottle", cost: 130, pc: "p1", paid: false },
    { id: "i5", name: "Free the root", cost: 70, pc: "p2", paid: false },
    { id: "i6", name: "Relaxator", cost: 43.25, pc: "p2", paid: false },
    { id: "i7", name: "Vivobarefoot", cost: 180, pc: "p2", paid: false },
    { id: "i8", name: "Food", cost: 100, pc: "p2", paid: false },
    { id: "i9", name: "Phone pay off 2/4", cost: 150, pc: "p2", paid: false },
    { id: "i10", name: "Phone pay off 3/4", cost: 150, pc: "p3", paid: false },
    { id: "i11", name: "Food", cost: 100, pc: "p3", paid: false },
    { id: "i12", name: "Phone pay off 4/4", cost: 150, pc: "p4", paid: false },
    { id: "i13", name: "Food", cost: 100, pc: "p4", paid: false },
  ],
};

const fmt = (n) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- app ----------
export default function App() {
  const [state, setState] = useState(null);
  const [sheet, setSheet] = useState(null); // {type:'item'|'addItem'|'fixed'|'pay'|'addPaycheck', ...}
  const saveTimer = useRef(null);

  // load
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        setState(r ? JSON.parse(r.value) : seed);
      } catch {
        setState(seed);
      }
    })();
  }, []);

  // debounced save
  useEffect(() => {
    if (!state) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error("save failed", e);
      }
    }, 400);
  }, [state]);

  if (!state)
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.mute, fontFamily: "Outfit, system-ui, sans-serif" }}>
        Loading your plan…
      </div>
    );

  const fixedTotal = state.fixed.reduce((s, f) => s + f.cost, 0);
  const free = state.payAmount - fixedTotal;

  const pcData = state.paychecks.map((pc) => {
    const items = state.items.filter((i) => i.pc === pc.id);
    const planned = items.reduce((s, i) => s + i.cost, 0);
    return { ...pc, items, planned, remaining: free - planned };
  });

  const totalPlanned = state.items.reduce((s, i) => s + i.cost, 0);

  // ---------- mutations ----------
  const up = (patch) => setState((s) => ({ ...s, ...patch }));
  const moveItem = (id, pc) =>
    up({ items: state.items.map((i) => (i.id === id ? { ...i, pc } : i)) });
  const togglePaid = (id) =>
    up({ items: state.items.map((i) => (i.id === id ? { ...i, paid: !i.paid } : i)) });
  const deleteItem = (id) => up({ items: state.items.filter((i) => i.id !== id) });
  const addItem = (name, cost, pc) =>
    up({ items: [...state.items, { id: uid(), name, cost, pc, paid: false }] });
  const editItem = (id, name, cost) =>
    up({ items: state.items.map((i) => (i.id === id ? { ...i, name, cost } : i)) });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Outfit', system-ui, sans-serif", paddingBottom: 90 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* header */}
      <div style={{ padding: "22px 18px 6px" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.14em", color: C.amber, fontWeight: 700, textTransform: "uppercase" }}>
          Paycheck Planner
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 34, fontWeight: 800 }}>${fmt(free)}</span>
          <span style={{ color: C.mute, fontSize: 14 }}>free per check</span>
        </div>
        <div
          onClick={() => setSheet({ type: "pay" })}
          style={{ marginTop: 10, background: C.card, borderRadius: 14, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${C.line}`, cursor: "pointer" }}
        >
          <div style={{ fontSize: 13, color: C.mute }}>
            ${fmt(state.payAmount)} pay − ${fmt(fixedTotal)} fixed
          </div>
          <div style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>Edit ›</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: C.mute }}>
          {state.items.length} planned purchases · ${fmt(totalPlanned)} total
        </div>
      </div>

      {/* paycheck cards */}
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        {pcData.map((pc, idx) => (
          <PaycheckCard
            key={pc.id}
            pc={pc}
            free={free}
            idx={idx}
            onItemTap={(item) => setSheet({ type: "item", item })}
            onAdd={() => setSheet({ type: "addItem", pc: pc.id })}
            onPaidToggle={togglePaid}
          />
        ))}
        <button
          onClick={() => setSheet({ type: "addPaycheck" })}
          style={btnGhost}
        >
          + Add paycheck
        </button>
      </div>

      {/* sheets */}
      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.type === "item" && (
            <ItemSheet
              item={state.items.find((i) => i.id === sheet.item.id)}
              paychecks={pcData}
              onMove={(pcId) => { moveItem(sheet.item.id, pcId); setSheet(null); }}
              onDelete={() => { deleteItem(sheet.item.id); setSheet(null); }}
              onSave={(name, cost) => { editItem(sheet.item.id, name, cost); setSheet(null); }}
            />
          )}
          {sheet.type === "addItem" && (
            <AddItemSheet
              onAdd={(name, cost) => { addItem(name, cost, sheet.pc); setSheet(null); }}
            />
          )}
          {sheet.type === "pay" && (
            <PaySheet
              payAmount={state.payAmount}
              fixed={state.fixed}
              onSave={(payAmount, fixed) => { up({ payAmount, fixed }); setSheet(null); }}
            />
          )}
          {sheet.type === "addPaycheck" && (
            <AddPaycheckSheet
              onAdd={(label) => {
                up({ paychecks: [...state.paychecks, { id: uid(), label }] });
                setSheet(null);
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}

// ---------- paycheck card ----------
function PaycheckCard({ pc, free, idx, onItemTap, onAdd, onPaidToggle }) {
  const pct = Math.min(100, Math.max(0, (pc.planned / free) * 100));
  const over = pc.remaining < 0;
  return (
    <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            Check {idx + 1} <span style={{ color: C.mute, fontWeight: 500, fontSize: 13 }}>· {pc.label}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, color: over ? C.red : C.mint }}>
            {over ? "−" : ""}${fmt(Math.abs(pc.remaining))}
            <span style={{ color: C.mute, fontWeight: 500, fontSize: 11 }}> left</span>
          </div>
        </div>
        {/* allocation bar */}
        <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.line }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 3,
              background: over ? C.red : C.amber,
              transition: "width .3s ease",
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: C.mute }}>
          ${fmt(pc.planned)} of ${fmt(free)} allocated
        </div>
      </div>

      <div>
        {pc.items.map((item) => (
          <div
            key={item.id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.line}` }}
          >
            <button
              onClick={() => onPaidToggle(item.id)}
              aria-label={item.paid ? "Mark unpaid" : "Mark paid"}
              style={{
                width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                border: `2px solid ${item.paid ? C.mint : C.mute}`,
                background: item.paid ? C.mint : "transparent",
                color: C.bg, fontSize: 13, fontWeight: 800, lineHeight: "18px",
                cursor: "pointer", padding: 0,
              }}
            >
              {item.paid ? "✓" : ""}
            </button>
            <div
              onClick={() => onItemTap(item)}
              style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <span style={{ fontSize: 15, color: item.paid ? C.mute : C.text, textDecoration: item.paid ? "line-through" : "none" }}>
                {item.name}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: item.paid ? C.mute : C.text }}>
                ${fmt(item.cost)}
              </span>
            </div>
          </div>
        ))}
        <button onClick={onAdd} style={{ ...btnGhost, border: "none", borderTop: `1px solid ${C.line}`, borderRadius: 0, width: "100%", textAlign: "left", padding: "12px 16px" }}>
          + Add purchase
        </button>
      </div>
    </div>
  );
}

// ---------- bottom sheet shell ----------
function Sheet({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.7)", display: "flex", alignItems: "flex-end", zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", background: C.cardUp, borderRadius: "22px 22px 0 0", padding: "10px 18px 28px", maxHeight: "82vh", overflowY: "auto" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: C.line, margin: "6px auto 14px" }} />
        {children}
      </div>
    </div>
  );
}

// ---------- item sheet: edit / move / delete ----------
function ItemSheet({ item, paychecks, onMove, onDelete, onSave }) {
  const [name, setName] = useState(item.name);
  const [cost, setCost] = useState(String(item.cost));
  const dirty = name !== item.name || Number(cost) !== item.cost;

  return (
    <div>
      <div style={sheetTitle}>Edit purchase</div>
      <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input style={input} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="Cost" />
      {dirty && (
        <button style={btnPrimary} onClick={() => onSave(name.trim() || item.name, Number(cost) || 0)}>
          Save changes
        </button>
      )}

      <div style={{ ...sheetTitle, marginTop: 20 }}>Move to</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {paychecks.map((pc, idx) => {
          const here = pc.id === item.pc;
          const after = here ? pc.remaining : pc.remaining - item.cost;
          return (
            <button
              key={pc.id}
              disabled={here}
              onClick={() => onMove(pc.id)}
              style={{
                ...rowBtn,
                opacity: here ? 0.45 : 1,
                border: `1px solid ${here ? C.amber : C.line}`,
              }}
            >
              <span>Check {idx + 1} · {pc.label}{here ? " (current)" : ""}</span>
              <span style={{ color: after < 0 ? C.red : C.mint, fontWeight: 700 }}>
                {after < 0 ? "−" : ""}${fmt(Math.abs(after))} left
              </span>
            </button>
          );
        })}
      </div>

      <button style={{ ...btnGhost, color: C.red, marginTop: 18, width: "100%" }} onClick={onDelete}>
        Delete purchase
      </button>
    </div>
  );
}

// ---------- add item ----------
function AddItemSheet({ onAdd }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  return (
    <div>
      <div style={sheetTitle}>Add purchase</div>
      <input style={input} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What is it?" />
      <input style={input} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="Cost" />
      <button
        style={{ ...btnPrimary, opacity: name.trim() && Number(cost) > 0 ? 1 : 0.4 }}
        disabled={!name.trim() || !(Number(cost) > 0)}
        onClick={() => onAdd(name.trim(), Number(cost))}
      >
        Add to this check
      </button>
    </div>
  );
}

// ---------- pay + fixed deductions ----------
function PaySheet({ payAmount, fixed, onSave }) {
  const [pay, setPay] = useState(String(payAmount));
  const [rows, setRows] = useState(fixed.map((f) => ({ ...f, cost: String(f.cost) })));

  const setRow = (id, k, v) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);

  return (
    <div>
      <div style={sheetTitle}>Paycheck amount</div>
      <input style={input} value={pay} onChange={(e) => setPay(e.target.value)} inputMode="decimal" />

      <div style={{ ...sheetTitle, marginTop: 18 }}>Fixed deductions (every check)</div>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input style={{ ...input, flex: 2, marginBottom: 0 }} value={r.name} onChange={(e) => setRow(r.id, "name", e.target.value)} placeholder="Name" />
          <input style={{ ...input, flex: 1, marginBottom: 0 }} value={r.cost} onChange={(e) => setRow(r.id, "cost", e.target.value)} inputMode="decimal" placeholder="$" />
          <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} style={{ ...btnGhost, padding: "0 12px", color: C.red }}>✕</button>
        </div>
      ))}
      <button style={{ ...btnGhost, width: "100%", marginTop: 4 }} onClick={() => setRows([...rows, { id: uid(), name: "", cost: "" }])}>
        + Add deduction
      </button>

      <div style={{ marginTop: 14, fontSize: 13, color: C.mute }}>
        Free per check: <span style={{ color: C.amber, fontWeight: 700 }}>${fmt((Number(pay) || 0) - total)}</span>
      </div>

      <button
        style={{ ...btnPrimary, marginTop: 14 }}
        onClick={() =>
          onSave(
            Number(pay) || 0,
            rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name.trim(), cost: Number(r.cost) || 0 }))
          )
        }
      >
        Save
      </button>
    </div>
  );
}

// ---------- add paycheck ----------
function AddPaycheckSheet({ onAdd }) {
  const [label, setLabel] = useState("");
  return (
    <div>
      <div style={sheetTitle}>Add paycheck</div>
      <input style={input} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Date label, e.g. Sep 4" />
      <button
        style={{ ...btnPrimary, opacity: label.trim() ? 1 : 0.4 }}
        disabled={!label.trim()}
        onClick={() => onAdd(label.trim())}
      >
        Add paycheck
      </button>
    </div>
  );
}

// ---------- shared styles ----------
const input = {
  width: "100%",
  boxSizing: "border-box",
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  color: C.text,
  fontSize: 16,
  padding: "13px 14px",
  marginBottom: 10,
  fontFamily: "inherit",
  outline: "none",
};

const btnPrimary = {
  width: "100%",
  background: C.amber,
  color: "#141200",
  border: "none",
  borderRadius: 12,
  padding: "14px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnGhost = {
  background: "transparent",
  color: C.amber,
  border: `1px dashed ${C.line}`,
  borderRadius: 14,
  padding: "13px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const rowBtn = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: C.card,
  color: C.text,
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};

const sheetTitle = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.mute,
  marginBottom: 10,
};
