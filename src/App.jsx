import { useState, useEffect, useRef, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import AuthGate, { isUnlocked, setUnlocked } from "./AuthGate";
import { supabaseConfigured } from "./lib/supabase";
import { fetchPlan, savePlan } from "./lib/planSync";

// ---------- constants ----------
const STORAGE_KEY = "paycheck-planner-v2";

/** Red / black Munyon palette */
const C = {
  bg: "#0A0A0A",
  card: "#141414",
  cardUp: "#1C1C1C",
  line: "#2E2E2E",
  accent: "#E11D2E",
  amber: "#E11D2E",
  mint: "#5BD9A4",
  red: "#FF4D4D",
  text: "#F5F5F5",
  mute: "#8A8A8A",
};

/** Wide category palette — not red-only */
const CAT_COLORS = [
  "#E11D2E", // red
  "#FF6B35", // orange
  "#F4A261", // sand
  "#E9C46A", // gold
  "#2A9D8F", // teal
  "#4CC9F0", // sky
  "#4361EE", // blue
  "#7B2CBF", // purple
  "#F72585", // magenta
  "#06D6A0", // mint
  "#90BE6D", // green
  "#577590", // slate
  "#F94144", // coral red
  "#F3722C", // tangerine
  "#43AA8B", // sea green
  "#277DA1", // ocean
  "#B5179E", // orchid
  "#FFD166", // sunflower
  "#118AB2", // cyan
  "#EF476F", // rose
];

const PAY_ANCHOR = new Date(2026, 6, 15); // Jul 15, 2026 — first check; +14 days each

function addDays(d, days) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function formatPayLabel(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function paycheckLabelAt(index) {
  return formatPayLabel(addDays(PAY_ANCHOR, index * 14));
}

const seed = {
  payAmount: 1760,
  fixed: [{ id: "f1", name: "Fixed obligations", cost: 1100 }],
  paychecks: [
    { id: "p1", label: paycheckLabelAt(0) },
    { id: "p2", label: paycheckLabelAt(1) },
    { id: "p3", label: paycheckLabelAt(2) },
    { id: "p4", label: paycheckLabelAt(3) },
  ],
  categories: [
    { id: "c1", name: "Transport", color: "#E11D2E" },
    { id: "c2", name: "Tech", color: "#FF6B6B" },
    { id: "c3", name: "Food", color: "#C41E3A" },
    { id: "c4", name: "Health", color: "#FF8A80" },
  ],
  items: [
    { id: "i1", name: "E-bike", cost: 300, pc: "p1", paid: false, categoryIds: ["c1"] },
    {
      id: "i2",
      name: "Phone pay off",
      cost: 150,
      pc: "p1",
      paid: false,
      categoryIds: ["c2"],
      splitGroup: "sg-phone",
      splitIndex: 1,
      splitOf: 4,
    },
    { id: "i3", name: "Instacart", cost: 80, pc: "p1", paid: false, categoryIds: ["c3"] },
    { id: "i4", name: "Smart water bottle", cost: 130, pc: "p1", paid: false, categoryIds: ["c4"] },
    { id: "i5", name: "Free the root", cost: 70, pc: "p2", paid: false, categoryIds: ["c4"] },
    { id: "i6", name: "Relaxator", cost: 43.25, pc: "p2", paid: false, categoryIds: ["c4"] },
    { id: "i7", name: "Vivobarefoot", cost: 180, pc: "p2", paid: false, categoryIds: ["c1"] },
    { id: "i8", name: "Food", cost: 100, pc: "p2", paid: false, categoryIds: ["c3"] },
    {
      id: "i9",
      name: "Phone pay off",
      cost: 150,
      pc: "p2",
      paid: false,
      categoryIds: ["c2"],
      splitGroup: "sg-phone",
      splitIndex: 2,
      splitOf: 4,
    },
    {
      id: "i10",
      name: "Phone pay off",
      cost: 150,
      pc: "p3",
      paid: false,
      categoryIds: ["c2"],
      splitGroup: "sg-phone",
      splitIndex: 3,
      splitOf: 4,
    },
    { id: "i11", name: "Food", cost: 100, pc: "p3", paid: false, categoryIds: ["c3"] },
    {
      id: "i12",
      name: "Phone pay off",
      cost: 150,
      pc: "p4",
      paid: false,
      categoryIds: ["c2"],
      splitGroup: "sg-phone",
      splitIndex: 4,
      splitOf: 4,
    },
    { id: "i13", name: "Food", cost: 100, pc: "p4", paid: false, categoryIds: ["c3"] },
  ],
  savings: [{ id: "s1", name: "Emergency fund", balance: 400, deposit: 50, borrowed: 0 }],
};

const HORIZON_PERIODS = { 1: 2, 3: 6, 6: 13 };

const fmt = (n) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

const uid = () => Math.random().toString(36).slice(2, 10);

function splitAmounts(total, n) {
  const count = Math.max(1, Math.floor(n));
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i === count - 1 ? rem : 0)) / 100);
}

function nextPaycheckLabel(paychecks) {
  return paycheckLabelAt(paychecks.length);
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

function normalizeCategories(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && c.name)
    .map((c, i) => ({
      id: c.id || uid(),
      name: String(c.name),
      color: c.color || CAT_COLORS[i % CAT_COLORS.length],
    }));
}

function normalizeLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function openItemLink(link) {
  const href = normalizeLink(link);
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function normalizeItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map((i) => ({
    ...i,
    categoryIds: Array.isArray(i.categoryIds) ? i.categoryIds : [],
    paid: Boolean(i.paid),
    cost: Number(i.cost) || 0,
    link: typeof i.link === "string" ? i.link : "",
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

function displayItemName(item) {
  if (item.splitGroup && item.splitOf) {
    return `${item.name} ${item.splitIndex || "?"}/${item.splitOf}`;
  }
  return item.name;
}

function itemAccent(item, categories) {
  const cats = (item.categoryIds || [])
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean);
  if (!cats.length) return C.line;
  return cats[0].color;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("paycheck-planner-v1");
    if (!raw) return seed;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.paychecks) || !Array.isArray(parsed.items)) {
      return seed;
    }
    return {
      payAmount: Number(parsed.payAmount) || 0,
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed : seed.fixed,
      paychecks: parsed.paychecks,
      items: normalizeItems(parsed.items),
      savings: normalizeSavings(parsed.savings),
      categories: normalizeCategories(parsed.categories?.length ? parsed.categories : seed.categories),
    };
  } catch {
    return seed;
  }
}

// ---------- app ----------
export default function App() {
  const [unlocked, setUnlockedState] = useState(() => isUnlocked());
  const [state, setState] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [tab, setTab] = useState("plan"); // plan | trends
  const [saveStatus, setSaveStatus] = useState("idle");
  const saveTimer = useRef(null);
  const hydrated = useRef(false);

  // Load: Supabase wins when configured; localStorage is cache / offline fallback
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    hydrated.current = false;

    async function hydrate() {
      const local = loadState();
      if (!supabaseConfigured) {
        if (!cancelled) {
          setState(local);
          hydrated.current = true;
        }
        return;
      }

      try {
        const cloud = await fetchPlan();
        if (cancelled) return;
        if (cloud) {
          setState(cloud);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud));
        } else {
          setState(local);
          // Seed cloud from local on first connect
          await savePlan(local);
        }
      } catch (e) {
        console.error("cloud load failed", e);
        if (!cancelled) setState(local);
      } finally {
        if (!cancelled) hydrated.current = true;
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  // Debounced save: local always; Supabase when configured
  useEffect(() => {
    if (!state || !hydrated.current) return;
    clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (supabaseConfigured) {
          await savePlan(state);
          setSaveStatus("synced");
        } else {
          setSaveStatus("saved");
        }
      } catch (e) {
        console.error("save failed", e);
        setSaveStatus("error");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  useEffect(() => {
    if (sheet) document.body.classList.add("sheet-open");
    else document.body.classList.remove("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, [sheet]);

  if (!unlocked) {
    return (
      <AuthGate
        onUnlock={() => {
          setUnlocked(true);
          setUnlockedState(true);
        }}
      />
    );
  }

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

  const categories = state.categories || [];
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

  const up = (patch) => setState((s) => ({ ...s, ...patch }));

  const moveItem = (id, pc) =>
    up({ items: state.items.map((i) => (i.id === id ? { ...i, pc } : i)) });

  const moveItemBySteps = (id, delta) => {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const idx = state.paychecks.findIndex((p) => p.id === item.pc);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= state.paychecks.length) return;
    moveItem(id, state.paychecks[target].id);
  };

  const togglePaid = (id) =>
    up({ items: state.items.map((i) => (i.id === id ? { ...i, paid: !i.paid } : i)) });

  const deleteItem = (id) => {
    const item = state.items.find((i) => i.id === id);
    if (item?.splitGroup) {
      // delete only this installment; siblings stay
      up({ items: state.items.filter((i) => i.id !== id) });
      return;
    }
    up({ items: state.items.filter((i) => i.id !== id) });
  };

  const addItem = (name, cost, pc, categoryIds = [], link = "") =>
    up({
      items: [
        ...state.items,
        { id: uid(), name, cost, pc, paid: false, categoryIds, link: normalizeLink(link) },
      ],
    });

  const editItem = (id, name, cost, categoryIds, link) =>
    up({
      items: state.items.map((i) => {
        if (i.id !== id) {
          // keep split siblings' shared cart link in sync
          if (
            i.splitGroup &&
            state.items.find((x) => x.id === id)?.splitGroup === i.splitGroup &&
            link !== undefined
          ) {
            return { ...i, link: normalizeLink(link), categoryIds: categoryIds ?? i.categoryIds ?? [] };
          }
          return i;
        }
        return {
          ...i,
          name,
          cost,
          categoryIds: categoryIds ?? i.categoryIds ?? [],
          link: link !== undefined ? normalizeLink(link) : i.link || "",
        };
      }),
    });

  const addSplitItems = (name, cost, startPcId, splitCount, categoryIds = [], link = "") => {
    const startIdx = state.paychecks.findIndex((p) => p.id === startPcId);
    const from = startIdx >= 0 ? startIdx : 0;
    const paychecks = ensurePaychecksFrom(state.paychecks, from, splitCount);
    const amounts = splitAmounts(cost, splitCount);
    const groupId = uid();
    const href = normalizeLink(link);
    const newItems = amounts.map((amt, i) => ({
      id: uid(),
      name,
      cost: amt,
      pc: paychecks[from + i].id,
      paid: false,
      categoryIds,
      link: href,
      splitGroup: groupId,
      splitIndex: i + 1,
      splitOf: splitCount,
    }));
    up({ paychecks, items: [...state.items, ...newItems] });
  };

  /** Convert an existing expense into N equal payments starting at its check. */
  const enableSplitOnItem = (itemId, splitCount) => {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const count = Math.max(2, Math.min(24, Math.floor(splitCount) || 4));

    // If already split, use group total; otherwise this item's cost
    let total = item.cost;
    let baseName = item.name;
    let categoryIds = item.categoryIds || [];
    let link = item.link || "";
    let startPc = item.pc;
    let without = state.items;

    if (item.splitGroup) {
      const group = state.items.filter((i) => i.splitGroup === item.splitGroup);
      total = group.reduce((s, i) => s + i.cost, 0);
      baseName = item.name;
      categoryIds = item.categoryIds || [];
      link = item.link || group.find((g) => g.link)?.link || "";
      const first = group.sort((a, b) => (a.splitIndex || 0) - (b.splitIndex || 0))[0];
      startPc = first?.pc || item.pc;
      without = state.items.filter((i) => i.splitGroup !== item.splitGroup);
    } else {
      without = state.items.filter((i) => i.id !== itemId);
    }

    const startIdx = state.paychecks.findIndex((p) => p.id === startPc);
    const from = startIdx >= 0 ? startIdx : 0;
    const paychecks = ensurePaychecksFrom(state.paychecks, from, count);
    const amounts = splitAmounts(total, count);
    const groupId = uid();
    const href = normalizeLink(link);
    const newItems = amounts.map((amt, i) => ({
      id: uid(),
      name: baseName,
      cost: amt,
      pc: paychecks[from + i].id,
      paid: false,
      categoryIds,
      link: href,
      splitGroup: groupId,
      splitIndex: i + 1,
      splitOf: count,
    }));
    up({ paychecks, items: [...without, ...newItems] });
  };

  /** Keep this installment as a single expense (full group total); remove siblings. */
  const disableSplitOnItem = (itemId) => {
    const item = state.items.find((i) => i.id === itemId);
    if (!item?.splitGroup) return;
    const group = state.items.filter((i) => i.splitGroup === item.splitGroup);
    const total = group.reduce((s, i) => s + i.cost, 0);
    const kept = {
      id: item.id,
      name: item.name,
      cost: total,
      pc: item.pc,
      paid: item.paid,
      categoryIds: item.categoryIds || [],
      link: item.link || group.find((g) => g.link)?.link || "",
    };
    const others = state.items.filter((i) => i.splitGroup !== item.splitGroup);
    up({ items: [...others, kept] });
  };

  const saveCategories = (cats) => up({ categories: normalizeCategories(cats) });

  const createCategory = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const exists = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return exists.id;
    const cat = {
      id: uid(),
      name: trimmed,
      color: CAT_COLORS[categories.length % CAT_COLORS.length],
    };
    up({ categories: [...categories, cat] });
    return cat.id;
  };

  const saveSavings = (savings) => up({ savings: normalizeSavings(savings) });

  const renamePaycheck = (id, label) => {
    const trimmed = String(label || "").trim();
    if (!trimmed) return;
    up({
      paychecks: state.paychecks.map((p) => (p.id === id ? { ...p, label: trimmed } : p)),
    });
  };

  /** One tap: next check number + next biweekly date from Jul 15. */
  const addPaycheck = () => {
    const label = nextPaycheckLabel(state.paychecks);
    up({ paychecks: [...state.paychecks, { id: uid(), label }] });
  };

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "error"
        ? "Save failed"
        : saveStatus === "synced"
          ? "Synced to cloud"
          : saveStatus === "saved"
            ? "Saved on this phone"
            : "";

  const lock = () => {
    setUnlocked(false);
    setUnlockedState(false);
  };

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
              color: C.accent,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Munyon
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <button
              type="button"
              onClick={lock}
              style={{
                background: "transparent",
                border: `1px solid ${C.line}`,
                color: C.mute,
                borderRadius: 8,
                padding: "6px 10px",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                minHeight: 32,
              }}
            >
              Lock
            </button>
          </div>
        </div>

        {/* tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 14,
            background: C.card,
            borderRadius: 12,
            padding: 4,
            border: `1px solid ${C.line}`,
          }}
        >
          {[
            { id: "plan", label: "Plan" },
            { id: "trends", label: "Trends" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                background: tab === t.id ? C.accent : "transparent",
                color: tab === t.id ? "#fff" : C.mute,
                minHeight: 40,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "plan" && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
              <span style={{ fontSize: 34, fontWeight: 800 }}>${fmt(free)}</span>
              <span style={{ color: C.mute, fontSize: 14 }}>free per check</span>
            </div>

            <div
              style={{
                marginTop: 12,
                background: onTrack ? "rgba(91,217,164,0.08)" : "rgba(255,77,77,0.1)",
                border: `1px solid ${onTrack ? "rgba(91,217,164,0.28)" : "rgba(255,77,77,0.35)"}`,
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
              <div style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>Edit ›</div>
            </div>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: C.mute }}>
                {state.items.length} planned · ${fmt(totalPlanned)} spoken for · ${fmt(totalUnpaid)} unpaid
              </div>
              <button
                type="button"
                onClick={() => setSheet({ type: "categories" })}
                style={{
                  background: "none",
                  border: "none",
                  color: C.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "4px 0",
                  whiteSpace: "nowrap",
                }}
              >
                Categories ›
              </button>
            </div>
          </>
        )}
      </div>

      {tab === "plan" ? (
        <>
          <SavingsSection
            savings={state.savings || []}
            onManage={() => setSheet({ type: "savings" })}
            onBucketTap={(bucket) => setSheet({ type: "savings", focusId: bucket.id })}
          />

          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
            {pcData.map((pc, idx) => (
              <PaycheckCard
                key={pc.id}
                pc={pc}
                free={free}
                idx={idx}
                categories={categories}
                canMoveUp={idx > 0}
                canMoveDown={idx < pcData.length - 1}
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
                onMoveUp={(id) => moveItemBySteps(id, -1)}
                onMoveDown={(id) => moveItemBySteps(id, 1)}
                onRename={() => setSheet({ type: "editPaycheck", id: pc.id })}
                onFixOver={() => {
                  const firstUnpaid = pc.items.find((i) => !i.paid);
                  if (firstUnpaid) setSheet({ type: "item", item: firstUnpaid });
                }}
              />
            ))}
            <button
              type="button"
              onClick={addPaycheck}
              style={btnGhost}
            >
              + Add paycheck
            </button>
          </div>
        </>
      ) : (
        <TrendsTab
          paychecks={pcData}
          categories={categories}
          items={state.items}
          savings={state.savings || []}
        />
      )}

      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.type === "item" && (
            <ItemSheet
              item={state.items.find((i) => i.id === sheet.item.id)}
              paychecks={pcData}
              categories={categories}
              onMove={(pcId) => {
                moveItem(sheet.item.id, pcId);
                setSheet(null);
              }}
              onDelete={() => {
                deleteItem(sheet.item.id);
                setSheet(null);
              }}
              onSave={(name, cost, categoryIds, link) => {
                editItem(sheet.item.id, name, cost, categoryIds, link);
                setSheet(null);
              }}
              onEnableSplit={(count) => {
                enableSplitOnItem(sheet.item.id, count);
                setSheet(null);
              }}
              onDisableSplit={() => {
                disableSplitOnItem(sheet.item.id);
                setSheet(null);
              }}
              onCreateCategory={createCategory}
              onSaveCategories={saveCategories}
            />
          )}
          {sheet.type === "addItem" && (
            <AddItemSheet
              remaining={sheet.remaining}
              startPcId={sheet.pc}
              pcIndex={sheet.pcIndex ?? 0}
              paychecks={pcData}
              free={free}
              categories={categories}
              onCreateCategory={createCategory}
              onAdd={(name, cost, categoryIds, link) => {
                addItem(name, cost, sheet.pc, categoryIds, link);
                setSheet(null);
              }}
              onAddSplit={(name, cost, splitCount, categoryIds, link) => {
                addSplitItems(name, cost, sheet.pc, splitCount, categoryIds, link);
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
          {sheet.type === "editPaycheck" && (
            <EditPaycheckSheet
              paycheck={state.paychecks.find((p) => p.id === sheet.id)}
              idx={state.paychecks.findIndex((p) => p.id === sheet.id)}
              onSave={(label) => {
                renamePaycheck(sheet.id, label);
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
          {sheet.type === "categories" && (
            <CategoriesSheet
              categories={categories}
              onSave={(cats) => {
                saveCategories(cats);
                setSheet(null);
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}

// ---------- category chips ----------
function CategoryPicker({ categories, selectedIds, onChange, onCreate }) {
  const [newName, setNewName] = useState("");
  const selected = selectedIds || [];

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={fieldLabel}>Categories</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {categories.map((cat) => {
          const on = selected.includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggle(cat.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${on ? cat.color : C.line}`,
                background: on ? `${cat.color}22` : C.card,
                color: C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                minHeight: 36,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: cat.color,
                  flexShrink: 0,
                }}
              />
              {cat.name}
            </button>
          );
        })}
        {!categories.length && (
          <span style={{ fontSize: 12, color: C.mute }}>No categories yet — create one below.</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...input, marginBottom: 0, flex: 1 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category"
        />
        <button
          type="button"
          style={{ ...btnGhost, marginBottom: 0, padding: "0 14px", minWidth: 72, borderStyle: "solid" }}
          onClick={() => {
            const id = onCreate(newName);
            if (id) {
              setNewName("");
              if (!selected.includes(id)) onChange([...selected, id]);
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------- trends tab ----------
function TrendsTab({ paychecks, categories, items, savings }) {
  const [showSavings, setShowSavings] = useState(() => {
    try {
      const v = localStorage.getItem("munyon-show-savings-line");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  const chartData = useMemo(() => {
    return paychecks.map((pc, idx) => {
      const row = {
        label: pc.label || `Check ${idx + 1}`,
        check: idx + 1,
      };
      categories.forEach((cat) => {
        row[cat.id] = items
          .filter((i) => i.pc === pc.id && (i.categoryIds || []).includes(cat.id))
          .reduce((s, i) => s + i.cost, 0);
      });
      const totalDeposit = (savings || []).reduce((s, b) => s + (Number(b.deposit) || 0), 0);
      const baseBalance = (savings || []).reduce((s, b) => s + (Number(b.balance) || 0), 0);
      // projected savings balance after this check's deposit lands
      row.savings = baseBalance + totalDeposit * (idx + 1);
      return row;
    });
  }, [paychecks, categories, items, savings]);

  const hasCats = categories.length > 0;
  const hasSavings = (savings || []).length > 0;
  const plotSavings = hasSavings && showSavings;

  const toggleSavings = () => {
    setShowSavings((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("munyon-show-savings-line", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div style={{ padding: "12px 14px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, flex: 1 }}>
          Spending by category across paychecks
          {plotSavings ? ", with savings balance climbing from planned deposits." : "."}
        </div>
        {hasSavings && (
          <button
            type="button"
            onClick={toggleSavings}
            aria-pressed={showSavings}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: C.card,
              border: `1px solid ${showSavings ? "rgba(225,29,46,0.45)" : C.line}`,
              borderRadius: 10,
              padding: "8px 12px",
              color: C.text,
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 40,
            }}
          >
            <span
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: showSavings ? C.accent : C.line,
                position: "relative",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: showSavings ? "#fff" : C.mute,
                  position: "absolute",
                  top: 2,
                  left: showSavings ? 18 : 2,
                }}
              />
            </span>
            Savings line
          </button>
        )}
      </div>

      {!hasCats && !hasSavings ? (
        <div
          style={{
            background: C.card,
            border: `1px dashed ${C.line}`,
            borderRadius: 16,
            padding: 18,
            color: C.mute,
            fontSize: 14,
          }}
        >
          Add categories to purchases and a savings bucket to see trends here.
        </div>
      ) : (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 18,
            padding: "14px 8px 8px",
          }}
        >
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={C.mute} tick={{ fill: C.mute, fontSize: 11 }} />
                <YAxis stroke={C.mute} tick={{ fill: C.mute, fontSize: 11 }} width={48} />
                <Tooltip
                  contentStyle={{
                    background: C.cardUp,
                    border: `1px solid ${C.line}`,
                    borderRadius: 10,
                    color: C.text,
                  }}
                  formatter={(value, name) => {
                    const cat = categories.find((c) => c.id === name);
                    const label = name === "savings" ? "Savings" : cat?.name || name;
                    return [`$${fmt(Number(value) || 0)}`, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: C.mute }}
                  formatter={(value) => {
                    if (value === "savings") return "Savings";
                    return categories.find((c) => c.id === value)?.name || value;
                  }}
                />
                {categories.map((cat) => (
                  <Line
                    key={cat.id}
                    type="monotone"
                    dataKey={cat.id}
                    name={cat.id}
                    stroke={cat.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: cat.color }}
                    activeDot={{ r: 5 }}
                  />
                ))}
                {plotSavings && (
                  <Line
                    type="monotone"
                    dataKey="savings"
                    name="savings"
                    stroke="#F5F5F5"
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: "#F5F5F5" }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasCats && (
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {categories.map((cat) => {
            const total = items
              .filter((i) => (i.categoryIds || []).includes(cat.id))
              .reduce((s, i) => s + i.cost, 0);
            return (
              <div
                key={cat.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  minWidth: 120,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: cat.color }} />
                  <span style={{ fontSize: 12, color: C.mute, fontWeight: 600 }}>{cat.name}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>${fmt(total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- paycheck card ----------
function PaycheckCard({
  pc,
  free,
  idx,
  categories,
  canMoveUp,
  canMoveDown,
  onItemTap,
  onAdd,
  onPaidToggle,
  onMoveUp,
  onMoveDown,
  onRename,
  onFixOver,
}) {
  const pct = free > 0 ? Math.min(100, Math.max(0, (pc.planned / free) * 100)) : pc.planned > 0 ? 100 : 0;
  const over = pc.remaining < 0;
  const empty = pc.items.length === 0;

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 18,
        border: `1px solid ${over ? "rgba(255,77,77,0.45)" : C.line}`,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px 10px" }}>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRename?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRename?.();
            }
          }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            minHeight: 48,
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>
              Check {idx + 1}{" "}
              <span style={{ color: C.accent, fontWeight: 600, fontSize: 13 }}>· {pc.label}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: C.mute, fontWeight: 500 }}>
              Tap to edit date
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, color: over ? C.red : C.mint, flexShrink: 0 }}>
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
              background: over ? C.red : C.accent,
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
              background: "rgba(255,77,77,0.12)",
              color: C.red,
              border: `1px solid rgba(255,77,77,0.35)`,
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
          pc.items.map((item) => {
            const accent = itemAccent(item, categories);
            const cats = (item.categoryIds || [])
              .map((id) => categories.find((c) => c.id === id))
              .filter(Boolean);
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 10px 10px 0",
                  borderTop: `1px solid ${C.line}`,
                  minHeight: 56,
                  borderLeft: `3px solid ${accent}`,
                  background: item.paid ? "transparent" : `${accent}08`,
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
                    marginLeft: 12,
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

                {item.link ? (
                  <button
                    type="button"
                    aria-label="Open cart or payment link"
                    title="Open link"
                    onClick={(e) => {
                      e.stopPropagation();
                      openItemLink(item.link);
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      flexShrink: 0,
                      border: `1px solid ${C.line}`,
                      background: C.cardUp,
                      color: C.accent,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "inherit",
                      lineHeight: 1,
                    }}
                  >
                    ↗
                  </button>
                ) : null}

                <div
                  onClick={() => onItemTap(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onItemTap(item);
                  }}
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    minHeight: 44,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 15,
                        color: item.paid ? C.mute : C.text,
                        textDecoration: item.paid ? "line-through" : "none",
                      }}
                    >
                      {displayItemName(item)}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: item.paid ? C.mute : C.text,
                        flexShrink: 0,
                      }}
                    >
                      ${fmt(item.cost)}
                    </span>
                  </div>
                  {cats.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cats.map((c) => (
                        <span
                          key={c.id}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: c.color,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Move to earlier paycheck"
                    disabled={!canMoveUp}
                    onClick={() => onMoveUp(item.id)}
                    style={arrowBtn(!canMoveUp)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move to later paycheck"
                    disabled={!canMoveDown}
                    onClick={() => onMoveDown(item.id)}
                    style={arrowBtn(!canMoveDown)}
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })
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

function arrowBtn(disabled) {
  return {
    width: 32,
    height: 26,
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: C.cardUp,
    color: disabled ? C.line : C.accent,
    fontSize: 10,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.35 : 1,
    padding: 0,
    fontFamily: "inherit",
    lineHeight: 1,
  };
}

// ---------- bottom sheet shell ----------
function Sheet({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
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
          maxHeight: "85vh",
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

// ---------- item sheet ----------
function ItemSheet({
  item,
  paychecks,
  categories,
  onMove,
  onDelete,
  onSave,
  onEnableSplit,
  onDisableSplit,
  onCreateCategory,
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [cost, setCost] = useState(String(item?.cost ?? ""));
  const [link, setLink] = useState(item?.link ?? "");
  const [categoryIds, setCategoryIds] = useState(item?.categoryIds || []);
  const [splitOn, setSplitOn] = useState(Boolean(item?.splitGroup));
  const [splitCount, setSplitCount] = useState(item?.splitOf || 4);

  if (!item) return null;

  const isSplit = Boolean(item.splitGroup);
  const dirty =
    name !== item.name ||
    Number(cost) !== item.cost ||
    (link || "") !== (item.link || "") ||
    JSON.stringify(categoryIds) !== JSON.stringify(item.categoryIds || []);

  const count = Math.max(2, Math.min(24, Math.floor(Number(splitCount) || 4)));
  const hasLink = Boolean(normalizeLink(link));

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
        disabled={isSplit}
      />
      {isSplit && (
        <div style={{ fontSize: 12, color: C.mute, marginTop: -6, marginBottom: 10 }}>
          This is payment {item.splitIndex}/{item.splitOf}. Turn off split to edit the full amount, or
          change the split count below.
        </div>
      )}

      <div style={fieldLabel}>Cart / payment link</div>
      <input
        style={input}
        value={link}
        onChange={(e) => setLink(e.target.value)}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="https://… paste checkout or cart URL"
      />
      {hasLink && (
        <button
          type="button"
          style={{ ...btnGhost, width: "100%", marginTop: -2, marginBottom: 12, borderStyle: "solid" }}
          onClick={() => openItemLink(link)}
        >
          Open link ↗
        </button>
      )}

      <CategoryPicker
        categories={categories}
        selectedIds={categoryIds}
        onChange={setCategoryIds}
        onCreate={onCreateCategory}
      />

      {dirty && (
        <button
          style={btnPrimary}
          onClick={() => onSave(name.trim() || item.name, Number(cost) || 0, categoryIds, link)}
        >
          Save changes
        </button>
      )}

      {/* split toggle for existing */}
      <button
        type="button"
        onClick={() => {
          if (isSplit || splitOn) {
            // turning off
            if (isSplit) onDisableSplit();
            else setSplitOn(false);
          } else {
            setSplitOn(true);
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: C.card,
          border: `1px solid ${isSplit || splitOn ? "rgba(225,29,46,0.45)" : C.line}`,
          borderRadius: 12,
          padding: "13px 14px",
          marginTop: 8,
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
            {isSplit
              ? "On — turn off to keep this one and remove the other payments"
              : "Split this purchase across upcoming checks"}
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            background: isSplit || splitOn ? C.accent : C.line,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: isSplit || splitOn ? "#fff" : C.mute,
              position: "absolute",
              top: 2,
              left: isSplit || splitOn ? 20 : 2,
            }}
          />
        </div>
      </button>

      {(splitOn || isSplit) && (
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
          <button
            style={btnPrimary}
            onClick={() => onEnableSplit(count)}
          >
            {isSplit ? `Resplit into ${count} payments` : `Split into ${count} payments`}
          </button>
        </div>
      )}

      <div style={{ ...sheetTitle, marginTop: 12 }}>Move to</div>
      <div style={{ fontSize: 12, color: C.mute, marginBottom: 10, lineHeight: 1.4 }}>
        Or use the ▲ ▼ arrows on the list for one-check moves.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {paychecks.map((pc, i) => {
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
                border: `1px solid ${here ? C.accent : after < 0 ? "rgba(255,77,77,0.45)" : C.line}`,
                minHeight: 48,
              }}
            >
              <span>
                Check {i + 1} · {pc.label}
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

// ---------- categories manage sheet ----------
function CategoriesSheet({ categories, onSave }) {
  const [rows, setRows] = useState(() =>
    (categories || []).map((c) => ({ ...c }))
  );
  const [pickingId, setPickingId] = useState(null);

  return (
    <div>
      <div style={sheetTitle}>Categories</div>
      <div style={{ fontSize: 13, color: C.mute, marginBottom: 14, lineHeight: 1.45 }}>
        Tag purchases with one or more categories. Tap the swatch to pick from a full color set.
      </div>

      {rows.map((r) => (
        <div key={r.id} style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              title="Pick color"
              onClick={() => setPickingId(pickingId === r.id ? null : r.id)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `2px solid ${pickingId === r.id ? C.text : C.line}`,
                background: r.color,
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <input
              style={{ ...input, marginBottom: 0, flex: 1 }}
              value={r.name}
              onChange={(e) =>
                setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))
              }
              placeholder="Category name"
            />
            <button
              onClick={() => {
                setRows(rows.filter((x) => x.id !== r.id));
                if (pickingId === r.id) setPickingId(null);
              }}
              style={{ ...btnGhost, padding: "0 12px", color: C.red, minWidth: 44, borderStyle: "solid" }}
              aria-label="Remove category"
            >
              ✕
            </button>
          </div>
          {pickingId === r.id && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
                padding: 10,
                borderRadius: 12,
                background: C.card,
                border: `1px solid ${C.line}`,
              }}
            >
              {CAT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  onClick={() => {
                    setRows(rows.map((x) => (x.id === r.id ? { ...x, color } : x)));
                    setPickingId(null);
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: r.color === color ? `2px solid ${C.text}` : `1px solid ${C.line}`,
                    background: color,
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        style={{ ...btnGhost, width: "100%", marginTop: 4, marginBottom: 12 }}
        onClick={() =>
          setRows([
            ...rows,
            { id: uid(), name: "", color: CAT_COLORS[rows.length % CAT_COLORS.length] },
          ])
        }
      >
        + Add category
      </button>

      <button
        style={btnPrimary}
        onClick={() =>
          onSave(
            rows
              .filter((r) => r.name.trim())
              .map((r) => ({ id: r.id, name: r.name.trim(), color: r.color }))
          )
        }
      >
        Save categories
      </button>
    </div>
  );
}

// ---------- savings section ----------
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
            color: C.accent,
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
                  border: `1px solid ${offTrack ? "rgba(225,29,46,0.45)" : C.line}`,
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
                    background: "rgba(225,29,46,0.08)",
                    border: "1px solid rgba(225,29,46,0.25)",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.mute, fontWeight: 600 }}>In 3 months</div>
                  <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: C.text }}>
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
                      color: C.accent,
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
              <span style={{ color: C.text, fontWeight: 700 }}>${fmt(preview.projected)}</span>
              {(Number(r.borrowed) || 0) > 0 && (
                <>
                  {" "}
                  · restore{" "}
                  <span style={{ color: C.accent, fontWeight: 700 }}>
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
          setRows([...rows, { id: uid(), name: "", balance: "", deposit: "", borrowed: "" }])
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

// ---------- add item ----------
function AddItemSheet({
  onAdd,
  onAddSplit,
  remaining,
  pcIndex,
  paychecks,
  free,
  categories,
  onCreateCategory,
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [link, setLink] = useState("");
  const [splitOn, setSplitOn] = useState(false);
  const [splitCount, setSplitCount] = useState(4);
  const [categoryIds, setCategoryIds] = useState([]);

  const costNum = Number(cost) || 0;
  const count = Math.max(2, Math.min(24, Math.floor(Number(splitCount) || 4)));
  const amounts = splitOn && costNum > 0 ? splitAmounts(costNum, count) : [];
  const after = remaining - (splitOn ? amounts[0] || 0 : costNum);
  const canAdd = name.trim() && costNum > 0;

  const checksAhead = Math.max(0, (paychecks?.length || 0) - (pcIndex || 0));
  const willAutoAdd = splitOn && count > checksAhead;

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

      <div style={fieldLabel}>Cart / payment link</div>
      <input
        style={input}
        value={link}
        onChange={(e) => setLink(e.target.value)}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Optional — paste checkout URL"
      />

      <CategoryPicker
        categories={categories}
        selectedIds={categoryIds}
        onChange={setCategoryIds}
        onCreate={onCreateCategory}
      />

      <button
        type="button"
        onClick={() => setSplitOn((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: C.card,
          border: `1px solid ${splitOn ? "rgba(225,29,46,0.45)" : C.line}`,
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
            background: splitOn ? C.accent : C.line,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: splitOn ? "#fff" : C.mute,
              position: "absolute",
              top: 2,
              left: splitOn ? 20 : 2,
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
                background: anyOver ? "rgba(255,77,77,0.1)" : "rgba(91,217,164,0.08)",
                border: `1px solid ${anyOver ? "rgba(255,77,77,0.35)" : "rgba(91,217,164,0.28)"}`,
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
                <div style={{ marginTop: 8, color: C.accent, fontWeight: 600 }}>
                  Adds {count - checksAhead} paycheck
                  {count - checksAhead === 1 ? "" : "s"} so every payment has a home.
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
            background: after < 0 ? "rgba(255,77,77,0.1)" : "rgba(91,217,164,0.08)",
            border: `1px solid ${after < 0 ? "rgba(255,77,77,0.35)" : "rgba(91,217,164,0.28)"}`,
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
          if (splitOn) onAddSplit(name.trim(), costNum, count, categoryIds, link);
          else onAdd(name.trim(), costNum, categoryIds, link);
        }}
      >
        {splitOn ? `Split into ${count} payments` : "Add to this check"}
      </button>
    </div>
  );
}

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
        <span style={{ color: C.accent, fontWeight: 700 }}>${fmt((Number(pay) || 0) - total)}</span>
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

function EditPaycheckSheet({ paycheck, idx, onSave }) {
  const [label, setLabel] = useState(paycheck?.label ?? "");
  if (!paycheck) return null;
  const dirty = label.trim() !== paycheck.label;
  const checkNum = (idx >= 0 ? idx : 0) + 1;

  return (
    <div>
      <div style={sheetTitle}>Edit Check {checkNum}</div>
      <div style={{ fontSize: 13, color: C.mute, marginBottom: 12, lineHeight: 1.4 }}>
        Change the date for Check {checkNum}. New checks auto-add on the Jul 15 + 2 weeks schedule.
      </div>
      <input
        style={input}
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Jul 15"
      />
      <button
        type="button"
        style={{ ...btnPrimary, opacity: label.trim() && dirty ? 1 : 0.4 }}
        disabled={!label.trim() || !dirty}
        onClick={() => onSave(label.trim())}
      >
        Save date
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
  background: C.accent,
  color: "#fff",
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
  color: C.accent,
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
  color: C.accent,
  fontSize: 22,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1,
};
