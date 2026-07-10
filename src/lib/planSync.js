import { supabase, supabaseConfigured } from "./supabase";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Assemble app state from normalized tables. */
export async function fetchPlan() {
  if (!supabaseConfigured || !supabase) return null;

  const [
    settingsRes,
    fixedRes,
    paychecksRes,
    categoriesRes,
    expensesRes,
    linksRes,
    savingsRes,
  ] = await Promise.all([
    supabase.from("plan_settings").select("*").eq("id", "default").maybeSingle(),
    supabase.from("fixed_costs").select("*").order("sort_order", { ascending: true }),
    supabase.from("paychecks").select("*").order("sort_order", { ascending: true }),
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("expenses").select("*").order("sort_order", { ascending: true }),
    supabase.from("expense_categories").select("*"),
    supabase.from("savings_buckets").select("*").order("sort_order", { ascending: true }),
  ]);

  for (const res of [
    settingsRes,
    fixedRes,
    paychecksRes,
    categoriesRes,
    expensesRes,
    linksRes,
    savingsRes,
  ]) {
    if (res.error) throw res.error;
  }

  // Empty DB → no cloud plan yet
  if (
    !settingsRes.data &&
    !(paychecksRes.data || []).length &&
    !(expensesRes.data || []).length
  ) {
    return null;
  }

  const catByExpense = {};
  for (const row of linksRes.data || []) {
    if (!catByExpense[row.expense_id]) catByExpense[row.expense_id] = [];
    catByExpense[row.expense_id].push(row.category_id);
  }

  return {
    payAmount: num(settingsRes.data?.pay_amount),
    fixed: (fixedRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      cost: num(r.cost),
    })),
    paychecks: (paychecksRes.data || []).map((r) => ({
      id: r.id,
      label: r.label,
    })),
    categories: (categoriesRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    })),
    items: (expensesRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      cost: num(r.cost),
      pc: r.paycheck_id || "",
      paid: Boolean(r.paid),
      link: r.link || "",
      categoryIds: catByExpense[r.id] || [],
      ...(r.split_group
        ? {
            splitGroup: r.split_group,
            splitIndex: r.split_index ?? undefined,
            splitOf: r.split_of ?? undefined,
          }
        : {}),
    })),
    savings: (savingsRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      balance: num(r.balance),
      deposit: num(r.deposit),
      borrowed: num(r.borrowed),
    })),
  };
}

async function replaceTable(table, rows, idKey = "id") {
  const ids = rows.map((r) => r[idKey]).filter(Boolean);

  if (ids.length) {
    const { error: upsertErr } = await supabase.from(table).upsert(rows, {
      onConflict: idKey,
    });
    if (upsertErr) throw upsertErr;

    const { data: existing, error: listErr } = await supabase.from(table).select(idKey);
    if (listErr) throw listErr;
    const keep = new Set(ids);
    const toDelete = (existing || []).map((r) => r[idKey]).filter((id) => !keep.has(id));
    if (toDelete.length) {
      const { error: delErr } = await supabase.from(table).delete().in(idKey, toDelete);
      if (delErr) throw delErr;
    }
  } else {
    // Clear table when state has none
    const { data: existing, error: listErr } = await supabase.from(table).select(idKey);
    if (listErr) throw listErr;
    const allIds = (existing || []).map((r) => r[idKey]);
    if (allIds.length) {
      const { error: delErr } = await supabase.from(table).delete().in(idKey, allIds);
      if (delErr) throw delErr;
    }
  }
}

/** Persist full app state into normalized tables. */
export async function savePlan(state) {
  if (!supabaseConfigured || !supabase) return;

  const { error: settingsErr } = await supabase.from("plan_settings").upsert(
    {
      id: "default",
      pay_amount: num(state.payAmount),
    },
    { onConflict: "id" }
  );
  if (settingsErr) throw settingsErr;

  const fixedRows = (state.fixed || []).map((f, i) => ({
    id: f.id,
    name: f.name,
    cost: num(f.cost),
    sort_order: i,
  }));
  await replaceTable("fixed_costs", fixedRows);

  const paycheckRows = (state.paychecks || []).map((p, i) => ({
    id: p.id,
    label: p.label,
    sort_order: i,
  }));
  await replaceTable("paychecks", paycheckRows);

  const categoryRows = (state.categories || []).map((c, i) => ({
    id: c.id,
    name: c.name,
    color: c.color || "#E11D2E",
    sort_order: i,
  }));
  await replaceTable("categories", categoryRows);

  const expenseRows = (state.items || []).map((item, i) => ({
    id: item.id,
    name: item.name,
    cost: num(item.cost),
    paycheck_id: item.pc || null,
    paid: Boolean(item.paid),
    link: item.link || "",
    split_group: item.splitGroup || null,
    split_index: item.splitIndex ?? null,
    split_of: item.splitOf ?? null,
    sort_order: i,
  }));
  await replaceTable("expenses", expenseRows);

  // Rebuild expense ↔ category links
  const { data: existingLinks, error: listLinksErr } = await supabase
    .from("expense_categories")
    .select("expense_id");
  if (listLinksErr) throw listLinksErr;
  const existingExpenseIds = [
    ...new Set((existingLinks || []).map((r) => r.expense_id).filter(Boolean)),
  ];
  if (existingExpenseIds.length) {
    const { error: clearLinksErr } = await supabase
      .from("expense_categories")
      .delete()
      .in("expense_id", existingExpenseIds);
    if (clearLinksErr) throw clearLinksErr;
  }

  const linkRows = [];
  for (const item of state.items || []) {
    for (const catId of item.categoryIds || []) {
      linkRows.push({ expense_id: item.id, category_id: catId });
    }
  }
  if (linkRows.length) {
    const { error: linkErr } = await supabase.from("expense_categories").insert(linkRows);
    if (linkErr) throw linkErr;
  }

  const savingsRows = (state.savings || []).map((s, i) => ({
    id: s.id,
    name: s.name,
    balance: num(s.balance),
    deposit: num(s.deposit),
    borrowed: num(s.borrowed),
    sort_order: i,
  }));
  await replaceTable("savings_buckets", savingsRows);
}
