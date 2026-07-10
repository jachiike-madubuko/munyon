import { supabase } from "./supabase";

export function planToRow(userId, state) {
  return {
    user_id: userId,
    pay_amount: Number(state.payAmount) || 0,
    fixed: state.fixed || [],
    paychecks: state.paychecks || [],
    items: state.items || [],
    savings: state.savings || [],
    categories: state.categories || [],
  };
}

export function rowToPlan(row) {
  if (!row) return null;
  return {
    payAmount: Number(row.pay_amount) || 0,
    fixed: Array.isArray(row.fixed) ? row.fixed : [],
    paychecks: Array.isArray(row.paychecks) ? row.paychecks : [],
    items: Array.isArray(row.items) ? row.items : [],
    savings: Array.isArray(row.savings) ? row.savings : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
  };
}

export async function fetchPlan(userId) {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertPlan(userId, state) {
  const { data, error } = await supabase
    .from("plans")
    .upsert(planToRow(userId, state), { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
