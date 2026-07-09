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
  // Savings buckets: balance grows by deposit each biweekly check
  savings: [
    { id: "s1", name: "Emergency fund", balance: 400, deposit: 50, borrowed: 0 },
  ],
};

/** Biweekly periods in a forecast horizon (approx). */
const HORIZON_PERIODS = { 1: 2, 3: 6, 6: 13 };

const fmt = (n) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

const uid = () => Math.random().toString(36).slice(2, 10);

/** Split total into n equal payments; last payment absorbs remainder cents. */
function splitAmounts(total, n) {
  const count = Math.max(1, Math.floor(n));
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i === count - 1 ? rem : 0)) / 100);
}

function parseLabelDate(label) {
  if (!label) return null;
  const withYear = Date.parse(`${label} ${new Date().getFullYear()}`);
  if (!Number.isNaN(withYear)) return new Date(withYear);
  const raw = Date.parse(label);
  if (!Number.isNaN(raw)) return new Date(raw);
  return null;
}

function formatPayLabel(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Next biweekly label after the last paycheck, or Check N fallback. */
function nextPaycheckLabel(paychecks) {
  for (let i = paychecks.length - 1; i >= 0; i--) {
    const d = parseLabelDate(paychecks[i].label);
    if (d) {
      const next = new Date(d);
      next.setDate(next.getDate() + 14);
      return formatPayLabel(next);
    }
  }
  return `Check ${paychecks.length + 1}`;
}

function ensurePaychecksFrom(paychecks, startIdx, count) {
  const next = [...paychecks];
  while (next.length < startIdx + count) {
    next.push({ id: uid(), label: nextPaycheckLabel(next) });
  }
  return next;
}

function normalizeSavings(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && s.name)
    .map((s) => ({
      id: s.id || uid(),
      name: String(s.name),
      balance: Number(s.balance) || 0,
      deposit: Number(s.deposit) || 0,
      borrowed: Number(s.borrowed) || 0,
    }));
}

function forecastBucket(bucket, months) {
  const periods = HORIZON_PERIODS[months] ?? 6;
  const onTrackBalance = bucket.balance + bucket.borrowed;
  const projected = onTrackBalance + bucket.deposit * periods;
  const actualProjected = bucket.balance + bucket.deposit * periods;
  return {
    periods,
    months,
    projected: actualProjected,
    onTrackProjected: projected,
    gap: bucket.borrowed,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.paychecks) || !Array.isArray(parsed.items)) {
      return seed;
    }
    return {
      payAmount: Number(parsed.payAmount) || 0,
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed : seed.fixed,
      paychecks: parsed.paychecks,
      items: parsed.items,
      savings: normalizeSavings(parsed.savings),
    };
  } catch {
    return seed;
  }
}

// ---------- app ----------
export default function App() {
  const [state, setState] = useState(null);
  const [sheet, setSheet] = useState(null); // {type:'item'|'addItem'|'pay'|'addPaycheck'|'savings', ...}
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);
  const hydrated = useRef(false);

  // load from localStorage (real persistence; swap for Supabase later)
  useEffect(() => {
    setState(loadState());
    hydrated.current = true;
  }, []);

  // debounced save
  useEffect(() => {
    if (!state || !hydrated.current) return;
    clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveStatus("saved");
      } catch (e) {
        console.error("save failed", e);
        setSaveStatus("error");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  // lock body scroll while sheet is open (iOS Safari)
  useEffect(() => {
    if (sheet) document.body.classList.add("sheet-open");
    else document.body.classList.remove("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, [sheet]);

  if (!state)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.mute,
          fontFamily: "Outfit, system-ui, sans-serif",
        }}
      >
        Loading your plan…
      </div>
    );

  const fixedTotal = state.fixed.reduce((s, f) => s + f.cost, 0);
  const free = state.payAmount - fixedTotal;

  const pcData = state.paychecks.map((pc) => {
    const items = state.items.filter((i) => i.pc === pc.id);
    const planned = items.reduce((s, i) => s + i.cost, 0);
    const unpaid = items.filter((i) => !i.paid).reduce((s, i) => s + i.cost, 0);
    const paidCount = items.filter((i) => i.paid).length;
    return { ...pc, items, planned, unpaid, paidCount, remaining: free - planned };
  });

  const totalPlanned = state.items.reduce((s, i) => s + i.cost, 0);
  const totalUnpaid = state.items.filter((i) => !i.paid).reduce((s, i) => s + i.cost, 0);
  const overChecks = pcData.filter((pc) => pc.remaining < 0);
  const onTrack = overChecks.length === 0;
  const totalLeft = pcData.reduce((s, pc) => s + Math.max(0, pc.remaining), 0);

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

  /** Split a purchase across upcoming checks from startPcId; auto-adds checks if needed. */
  const addSplitItems = (name, cost, startPcId, splitCount) => {
    const startIdx = state.paychecks.findIndex((p) => p.id === startPcId);
    const from = startIdx >= 0 ? startIdx : 0;
    const paychecks = ensurePaychecksFrom(state.paychecks, from, splitCount);
    const amounts = splitAmounts(cost, splitCount);
    const groupId = uid();
    const newItems = amounts.map((amt, i) => ({
      id: uid(),
      name: `${name} ${i + 1}/${splitCount}`,
      cost: amt,
      pc: paychecks[from + i].id,
      paid: false,
      splitGroup: groupId,
    }));
    up({ paychecks, items: [...state.items, ...newItems] });
  };

  const saveSavings = (savings) => up({ savings: normalizeSavings(savings) });

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "error"
        ? "Save failed"
        : saveStatus === "saved"
          ? "Saved on this phone"
          : "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Outfit', system-ui, sans-serif",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* header */}
      <div style={{ padding: "22px 18px 6px", paddingTop: "calc(22px + env(safe-area-inset-top, 0px))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              color: C.amber,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Paycheck Planner
          </div>
          <div
            style={{
              fontSize: 11,
              color: saveStatus === "error" ? C.red : C.mute,
              fontWeight: 500,
              minHeight: 16,
            }}
            aria-live="polite"
          >
            {saveLabel}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 34, fontWeight: 800 }}>${fmt(free)}</span>
          <span style={{ color: C.mute, fontSize: 14 }}>free per check</span>
        </div>

        {/* status strip: calm when on track, clear when over */}
        <div
          style={{
            marginTop: 12,
            background: onTrack ? "rgba(91,217,164,0.08)" : "rgba(240,97,107,0.1)",
            border: `1px solid ${onTrack ? "rgba(91,217,164,0.28)" : "rgba(240,97,107,0.35)"}`,
            borderRadius: 14,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: onTrack ? C.mint : C.red }}>
            {onTrack
              ? "You're in control"
              : `${overChecks.length} check${overChecks.length === 1 ? "" : "s"} overallocated`}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: C.mute, lineHeight: 1.4 }}>
            {onTrack
              ? `$${fmt(totalLeft)} still unassigned across upcoming checks · $${fmt(totalUnpaid)} left to buy`
              : `Move or trim purchases until every check shows green. Over by $${fmt(
                  overChecks.reduce((s, pc) => s + Math.abs(pc.remaining), 0)
                )} total.`}
          </div>
        </div>

        <div
          onClick={() => setSheet({ type: "pay" })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setSheet({ type: "pay" });
          }}
          style={{
            marginTop: 10,
            background: C.card,
            borderRadius: 14,
            padding: "14px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            border: `1px solid ${C.line}`,
            cursor: "pointer",
            minHeight: 48,
          }}
        >
          <div style={{ fontSize: 13, color: C.mute }}>
            ${fmt(state.payAmount)} pay − ${fmt(fixedTotal)} fixed
          </div>
          <div style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>Edit ›</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: C.mute }}>
          {state.items.length} planned · ${fmt(totalPlanned)} spoken for · ${fmt(totalUnpaid)} unpaid
        </div>
      </div>

      {/* savings forecast */}
      <SavingsSection
        savings={state.savings || []}
        onManage={() => setSheet({ type: "savings" })}
        onBucketTap={(bucket) => setSheet({ type: "savings", focusId: bucket.id })}
      />

      {/* paycheck cards */}
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        {pcData.map((pc, idx) => (
          <PaycheckCard
            key={pc.id}
            pc={pc}
            free={free}
            idx={idx}
            onItemTap={(item) => setSheet({ type: "item", item })}
            onAdd={() =>
              setSheet({
                type: "addItem",
                pc: pc.id,
                remaining: pc.remaining,
                pcIndex: idx,
              })
            }
            onPaidToggle={togglePaid}
            onFixOver={() => {
              const firstUnpaid = pc.items.find((i) => !i.paid);
              if (firstUnpaid) setSheet({ type: "item", item: firstUnpaid });
            }}
          />
        ))}
        <button onClick={() => setSheet({ type: "addPaycheck" })} style={btnGhost}>
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
              onMove={(pcId) => {
                moveItem(sheet.item.id, pcId);
                setSheet(null);
              }}
              onDelete={() => {
                deleteItem(sheet.item.id);
                setSheet(null);
              }}
              onSave={(name, cost) => {
                editItem(sheet.item.id, name, cost);
                setSheet(null);
              }}
            />
          )}
          {sheet.type === "addItem" && (
            <AddItemSheet
              remaining={sheet.remaining}
              startPcId={sheet.pc}
              pcIndex={sheet.pcIndex ?? 0}
              paychecks={pcData}
              free={free}
              onAdd={(name, cost) => {
                addItem(name, cost, sheet.pc);
                setSheet(null);
              }}
              onAddSplit={(name, cost, splitCount) => {
                addSplitItems(name, cost, sheet.pc, splitCount);
                setSheet(null);
              }}
            />
          )}
          {sheet.type === "pay" && (
            <PaySheet
              payAmount={state.payAmount}
              fixed={state.fixed}
              onSave={(payAmount, fixed) => {
                up({ payAmount, fixed });
                setSheet(null);
              }}
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
          {sheet.type === "savings" && (
            <SavingsSheet
              savings={state.savings || []}
              focusId={sheet.focusId}
              onSave={(savings) => {
                saveSavings(savings);
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
function PaycheckCard({ pc, free, idx, onItemTap, onAdd, onPaidToggle, onFixOver }) {
  const pct = free > 0 ? Math.min(100, Math.max(0, (pc.planned / free) * 100)) : pc.planned > 0 ? 100 : 0;
  const over = pc.remaining < 0;
  const empty = pc.items.length === 0;

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 18,
        border: `1px solid ${over ? "rgba(240,97,107,0.45)" : C.line}`,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            Check {idx + 1}{" "}
            <span style={{ color: C.mute, fontWeight: 500, fontSize: 13 }}>· {pc.label}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, color: over ? C.red : C.mint }}>
            {over ? "−" : ""}${fmt(Math.abs(pc.remaining))}
            <span style={{ color: C.mute, fontWeight: 500, fontSize: 11 }}> left</span>
          </div>
        </div>

        <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.line }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, pct)}%`,
              borderRadius: 3,
              background: over ? C.red : C.amber,
              transition: "width .3s ease",
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: C.mute }}>
          ${fmt(pc.planned)} of ${fmt(free)} allocated
          {pc.unpaid > 0 ? ` · $${fmt(pc.unpaid)} still to buy` : pc.paidCount ? " · all marked paid" : ""}
        </div>

        {over && (
          <button
            onClick={onFixOver}
            style={{
              marginTop: 10,
              width: "100%",
              background: "rgba(240,97,107,0.12)",
              color: C.red,
              border: `1px solid rgba(240,97,107,0.35)`,
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              minHeight: 44,
            }}
          >
            Over by ${fmt(Math.abs(pc.remaining))} — tap to move a purchase
          </button>
        )}
      </div>

      <div>
        {empty ? (
          <div
            style={{
              padding: "18px 16px",
              borderTop: `1px solid ${C.line}`,
              color: C.mute,
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Nothing planned yet. Add what you want to buy from this check.
          </div>
        ) : (
          pc.items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderTop: `1px solid ${C.line}`,
                minHeight: 52,
              }}
            >
              <button
                onClick={() => onPaidToggle(item.id)}
                aria-label={item.paid ? "Mark unpaid" : "Mark paid"}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  flexShrink: 0,
                  border: `2px solid ${item.paid ? C.mint : C.mute}`,
                  background: item.paid ? C.mint : "transparent",
                  color: C.bg,
                  fontSize: 14,
                  fontWeight: 800,
                  lineHeight: "24px",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {item.paid ? "✓" : ""}
              </button>
              <div
                onClick={() => onItemTap(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onItemTap(item);
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    color: item.paid ? C.mute : C.text,
                    textDecoration: item.paid ? "line-through" : "none",
                  }}
                >
                  {item.name}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: item.paid ? C.mute : C.text,
                  }}
                >
                  ${fmt(item.cost)}
                </span>
              </div>
            </div>
          ))
        )}
        <button
          onClick={onAdd}
          style={{
            ...btnGhost,
            border: "none",
            borderTop: `1px solid ${C.line}`,
            borderRadius: 0,
            width: "100%",
            textAlign: "left",
            padding: "14px 16px",
            minHeight: 48,
          }}
        >
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,8,16,0.7)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: C.cardUp,
          borderRadius: "22px 22px 0 0",
          padding: "10px 18px 28px",
          maxHeight: "82vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: C.line,
            margin: "6px auto 14px",
          }}
        />
        {children}
      </div>
    </div>
  );
}

// ---------- item sheet: edit / move / delete ----------
function ItemSheet({ item, paychecks, onMove, onDelete, onSave }) {
  const [name, setName] = useState(item?.name ?? "");
  const [cost, setCost] = useState(String(item?.cost ?? ""));
  if (!item) return null;

  const dirty = name !== item.name || Number(cost) !== item.cost;

  return (
    <div>
      <div style={sheetTitle}>Edit purchase</div>
      <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input
        style={input}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        inputMode="decimal"
        placeholder="Cost"
      />
      {dirty && (
        <button style={btnPrimary} onClick={() => onSave(name.trim() || item.name, Number(cost) || 0)}>
          Save changes
        </button>
      )}

      <div style={{ ...sheetTitle, marginTop: 20 }}>Move to</div>
      <div style={{ fontSize: 12, color: C.mute, marginBottom: 10, lineHeight: 1.4 }}>
        See how much breathing room each check keeps after the move.
      </div>
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
                border: `1px solid ${here ? C.amber : after < 0 ? "rgba(240,97,107,0.45)" : C.line}`,
                minHeight: 48,
              }}
            >
              <span>
                Check {idx + 1} · {pc.label}
                {here ? " (current)" : ""}
              </span>
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

// ---------- savings section (home) ----------
function SavingsSection({ savings, onManage, onBucketTap }) {
  const list = savings || [];

  return (
    <div style={{ padding: "4px 14px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 4px 8px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            color: C.mute,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Savings
        </div>
        <button
          onClick={onManage}
          style={{
            background: "none",
            border: "none",
            color: C.amber,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "6px 4px",
            minHeight: 36,
          }}
        >
          {list.length ? "Manage ›" : "+ Add bucket"}
        </button>
      </div>

      {list.length === 0 ? (
        <div
          onClick={onManage}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onManage();
          }}
          style={{
            background: C.card,
            border: `1px dashed ${C.line}`,
            borderRadius: 16,
            padding: "16px 14px",
            color: C.mute,
            fontSize: 13,
            lineHeight: 1.45,
            cursor: "pointer",
          }}
        >
          Track a savings bucket to see where it lands in 3 months if you keep depositing each check.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((bucket) => {
            const f3 = forecastBucket(bucket, 3);
            const f1 = forecastBucket(bucket, 1);
            const f6 = forecastBucket(bucket, 6);
            const offTrack = bucket.borrowed > 0;
            return (
              <div
                key={bucket.id}
                onClick={() => onBucketTap(bucket)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onBucketTap(bucket);
                }}
                style={{
                  background: C.card,
                  borderRadius: 16,
                  border: `1px solid ${offTrack ? "rgba(245,184,65,0.4)" : C.line}`,
                  padding: "14px 14px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{bucket.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>${fmt(bucket.balance)}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: C.mute }}>
                  {bucket.deposit > 0
                    ? `+$${fmt(bucket.deposit)} each check`
                    : "No planned deposit yet"}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 12px",
                    borderRadius: 12,
                    background: "rgba(91,217,164,0.07)",
                    border: "1px solid rgba(91,217,164,0.22)",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 600 }}>In 3 months</div>
                  <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: C.mint }}>
                    ${fmt(f3.projected)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: C.mute, lineHeight: 1.35 }}>
                    1 mo ${fmt(f1.projected)} · 6 mo ${fmt(f6.projected)}
                  </div>
                </div>

                {offTrack && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: C.amber,
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}
                  >
                    Put back ${fmt(bucket.borrowed)} to stay on this path
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- savings manage sheet ----------
function SavingsSheet({ savings, onSave, focusId }) {
  const [rows, setRows] = useState(() =>
    (savings || []).map((s) => ({
      ...s,
      balance: String(s.balance ?? ""),
      deposit: String(s.deposit ?? ""),
      borrowed: String(s.borrowed ?? ""),
    }))
  );

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`sav-row-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusId]);

  const setRow = (id, k, v) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  return (
    <div>
      <div style={sheetTitle}>Savings buckets</div>
      <div style={{ fontSize: 13, color: C.mute, marginBottom: 14, lineHeight: 1.45 }}>
        Forecast assumes your deposit hits every biweekly check. Borrowed is what you pulled out and
        still need to restore.
      </div>

      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: C.mute, marginBottom: 12 }}>No buckets yet.</div>
      )}

      {rows.map((r) => {
        const preview = forecastBucket(
          {
            balance: Number(r.balance) || 0,
            deposit: Number(r.deposit) || 0,
            borrowed: Number(r.borrowed) || 0,
          },
          3
        );
        return (
          <div
            key={r.id}
            id={`sav-row-${r.id}`}
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 14,
              border: `1px solid ${C.line}`,
              background: C.card,
            }}
          >
            <input
              style={{ ...input, marginBottom: 8 }}
              value={r.name}
              onChange={(e) => setRow(r.id, "name", e.target.value)}
              placeholder="Bucket name"
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>Balance</div>
                <input
                  style={{ ...input, marginBottom: 0 }}
                  value={r.balance}
                  onChange={(e) => setRow(r.id, "balance", e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>Deposit / check</div>
                <input
                  style={{ ...input, marginBottom: 0 }}
                  value={r.deposit}
                  onChange={(e) => setRow(r.id, "deposit", e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={fieldLabel}>Borrowed (to restore)</div>
              <input
                style={{ ...input, marginBottom: 0 }}
                value={r.borrowed}
                onChange={(e) => setRow(r.id, "borrowed", e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 8 }}>
              In 3 months:{" "}
              <span style={{ color: C.mint, fontWeight: 700 }}>${fmt(preview.projected)}</span>
              {(Number(r.borrowed) || 0) > 0 && (
                <>
                  {" "}
                  · restore{" "}
                  <span style={{ color: C.amber, fontWeight: 700 }}>
                    ${fmt(Number(r.borrowed) || 0)}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
              style={{ ...btnGhost, width: "100%", color: C.red, borderStyle: "solid" }}
            >
              Remove bucket
            </button>
          </div>
        );
      })}

      <button
        style={{ ...btnGhost, width: "100%", marginBottom: 12 }}
        onClick={() =>
          setRows([
            ...rows,
            { id: uid(), name: "", balance: "", deposit: "", borrowed: "" },
          ])
        }
      >
        + Add bucket
      </button>

      <button
        style={btnPrimary}
        onClick={() =>
          onSave(
            rows
              .filter((r) => r.name.trim())
              .map((r) => ({
                id: r.id,
                name: r.name.trim(),
                balance: Number(r.balance) || 0,
                deposit: Number(r.deposit) || 0,
                borrowed: Number(r.borrowed) || 0,
              }))
          )
        }
      >
        Save savings
      </button>
    </div>
  );
}

// ---------- add item (+ optional split across checks) ----------
function AddItemSheet({ onAdd, onAddSplit, remaining, pcIndex, paychecks, free }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [splitOn, setSplitOn] = useState(false);
  const [splitCount, setSplitCount] = useState(4);

  const costNum = Number(cost) || 0;
  const count = Math.max(2, Math.min(24, Math.floor(Number(splitCount) || 4)));
  const amounts = splitOn && costNum > 0 ? splitAmounts(costNum, count) : [];
  const after = remaining - (splitOn ? amounts[0] || 0 : costNum);
  const canAdd = name.trim() && costNum > 0;

  const checksAhead = Math.max(0, (paychecks?.length || 0) - (pcIndex || 0));
  const willAutoAdd = splitOn && count > checksAhead;

  // Preview remaining on each target check after placing splits
  const splitPreview =
    splitOn && amounts.length
      ? amounts.map((amt, i) => {
          const targetIdx = (pcIndex || 0) + i;
          const existing = paychecks?.[targetIdx];
          const remBefore = existing ? existing.remaining : free;
          const remAfter = remBefore - amt;
          const label = existing ? existing.label : `new check ${targetIdx + 1}`;
          return { amt, remAfter, label, isNew: !existing };
        })
      : [];

  const anyOver = splitPreview.some((p) => p.remAfter < 0);

  return (
    <div>
      <div style={sheetTitle}>Add purchase</div>
      <input
        style={input}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What is it?"
      />
      <input
        style={input}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        inputMode="decimal"
        placeholder="Cost"
      />

      {/* split toggle */}
      <button
        type="button"
        onClick={() => setSplitOn((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: C.card,
          border: `1px solid ${splitOn ? "rgba(245,184,65,0.45)" : C.line}`,
          borderRadius: 12,
          padding: "13px 14px",
          marginBottom: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          color: C.text,
          minHeight: 48,
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Split payment</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
            Equal chunks across upcoming checks
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            background: splitOn ? C.amber : C.line,
            position: "relative",
            flexShrink: 0,
            transition: "background .2s",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: splitOn ? "#141200" : C.mute,
              position: "absolute",
              top: 2,
              left: splitOn ? 20 : 2,
              transition: "left .2s",
            }}
          />
        </div>
      </button>

      {splitOn && (
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>Number of payments</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setSplitCount(Math.max(2, count - 1))}
              style={stepBtn}
              aria-label="Fewer payments"
            >
              −
            </button>
            <input
              style={{ ...input, marginBottom: 0, textAlign: "center", fontWeight: 700 }}
              value={String(splitCount)}
              onChange={(e) => setSplitCount(e.target.value)}
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={() => setSplitCount(Math.min(24, count + 1))}
              style={stepBtn}
              aria-label="More payments"
            >
              +
            </button>
          </div>

          {costNum > 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: anyOver ? "rgba(240,97,107,0.1)" : "rgba(91,217,164,0.08)",
                border: `1px solid ${anyOver ? "rgba(240,97,107,0.35)" : "rgba(91,217,164,0.28)"}`,
                fontSize: 13,
                color: C.mute,
                lineHeight: 1.45,
              }}
            >
              <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>
                {count} payments of ~${fmt(amounts[0])}
                {amounts.length > 1 && amounts[0] !== amounts[amounts.length - 1]
                  ? ` (last $${fmt(amounts[amounts.length - 1])})`
                  : ""}
              </div>
              {splitPreview.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {i + 1}. {p.label}
                    {p.isNew ? " · added" : ""}
                  </span>
                  <span style={{ color: p.remAfter < 0 ? C.red : C.mint, fontWeight: 600 }}>
                    ${fmt(p.amt)} → {p.remAfter < 0 ? "−" : ""}${fmt(Math.abs(p.remAfter))} left
                  </span>
                </div>
              ))}
              {willAutoAdd && (
                <div style={{ marginTop: 8, color: C.amber, fontWeight: 600 }}>
                  Adds {count - checksAhead} paycheck
                  {count - checksAhead === 1 ? "" : "s"} so every payment has a home.
                </div>
              )}
              {anyOver && (
                <div style={{ marginTop: 8, color: C.red, fontWeight: 600 }}>
                  One or more checks will go over — you can still add, then move or trim.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!splitOn && costNum > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 12,
            background: after < 0 ? "rgba(240,97,107,0.1)" : "rgba(91,217,164,0.08)",
            border: `1px solid ${after < 0 ? "rgba(240,97,107,0.35)" : "rgba(91,217,164,0.28)"}`,
            fontSize: 13,
            color: C.mute,
            lineHeight: 1.4,
          }}
        >
          After this, this check will have{" "}
          <span style={{ color: after < 0 ? C.red : C.mint, fontWeight: 700 }}>
            {after < 0 ? "−" : ""}${fmt(Math.abs(after))}
          </span>{" "}
          left
          {after < 0 ? " — you'll need to move something else." : "."}
        </div>
      )}

      <button
        style={{ ...btnPrimary, opacity: canAdd ? 1 : 0.4 }}
        disabled={!canAdd}
        onClick={() => {
          if (splitOn) onAddSplit(name.trim(), costNum, count);
          else onAdd(name.trim(), costNum);
        }}
      >
        {splitOn ? `Split into ${count} payments` : "Add to this check"}
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
          <input
            style={{ ...input, flex: 2, marginBottom: 0 }}
            value={r.name}
            onChange={(e) => setRow(r.id, "name", e.target.value)}
            placeholder="Name"
          />
          <input
            style={{ ...input, flex: 1, marginBottom: 0 }}
            value={r.cost}
            onChange={(e) => setRow(r.id, "cost", e.target.value)}
            inputMode="decimal"
            placeholder="$"
          />
          <button
            onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
            style={{ ...btnGhost, padding: "0 12px", color: C.red, minWidth: 44 }}
            aria-label="Remove deduction"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        style={{ ...btnGhost, width: "100%", marginTop: 4 }}
        onClick={() => setRows([...rows, { id: uid(), name: "", cost: "" }])}
      >
        + Add deduction
      </button>

      <div style={{ marginTop: 14, fontSize: 13, color: C.mute }}>
        Free per check:{" "}
        <span style={{ color: C.amber, fontWeight: 700 }}>${fmt((Number(pay) || 0) - total)}</span>
      </div>

      <button
        style={{ ...btnPrimary, marginTop: 14 }}
        onClick={() =>
          onSave(
            Number(pay) || 0,
            rows
              .filter((r) => r.name.trim())
              .map((r) => ({ id: r.id, name: r.name.trim(), cost: Number(r.cost) || 0 }))
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
      <input
        style={input}
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Date label, e.g. Sep 4"
      />
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
  minHeight: 48,
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
  minHeight: 48,
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

const fieldLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: C.mute,
  marginBottom: 4,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const stepBtn = {
  width: 48,
  height: 48,
  flexShrink: 0,
  borderRadius: 12,
  border: `1px solid ${C.line}`,
  background: C.card,
  color: C.amber,
  fontSize: 22,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1,
};
