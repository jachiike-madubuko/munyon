/**
 * Airtable helpers for Munyon plan SoT (Jah OS base).
 * Server-only — never import from client code.
 */

export const BASE_ID = process.env.AIRTABLE_BASE_ID || "appwQ4gHMHDfUwjqD";

export const TABLES = {
  planSettings: process.env.AIRTABLE_TABLE_PLAN_SETTINGS || "tblgylUiLyx7joiPK",
  fixedCosts: process.env.AIRTABLE_TABLE_FIXED_COSTS || "tblh76npaHxwIMFtP",
  paychecks: process.env.AIRTABLE_TABLE_PAYCHECKS || "tbleUC9ZWNeK4MK8C",
  categories: process.env.AIRTABLE_TABLE_CATEGORIES || "tblmkDHcpQXbS3IBY",
  savings: process.env.AIRTABLE_TABLE_SAVINGS || "tbl3zBSdcCXDZICXg",
  expenses: process.env.AIRTABLE_TABLE_EXPENSES || "tblYwT3yjEuhMpy1y",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getToken() {
  const token = process.env.AIRTABLE_PAT;
  if (!token) {
    const err = new Error("AIRTABLE_PAT is not configured");
    err.statusCode = 503;
    throw err;
  }
  return token;
}

async function airtableFetch(path, { method = "GET", body } = {}) {
  const token = getToken();
  let attempt = 0;
  for (;;) {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      attempt += 1;
      await sleep(Math.min(30000, 1000 * 2 ** attempt));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Airtable ${res.status}`);
      err.statusCode = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }
}

/** List all records from a table (paginated). */
export async function listAll(tableId, { sortField } = {}) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    if (sortField) {
      params.set("sort[0][field]", sortField);
      params.set("sort[0][direction]", "asc");
    }
    const data = await airtableFetch(`${tableId}?${params}`);
    records.push(...(data.records || []));
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);
  return records;
}

async function createRecords(tableId, fieldsList) {
  const out = [];
  for (let i = 0; i < fieldsList.length; i += 10) {
    const chunk = fieldsList.slice(i, i + 10).map((fields) => ({ fields }));
    const data = await airtableFetch(tableId, {
      method: "POST",
      body: { records: chunk, typecast: true },
    });
    out.push(...(data.records || []));
    if (i + 10 < fieldsList.length) await sleep(220);
  }
  return out;
}

async function updateRecords(tableId, updates) {
  const out = [];
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10);
    const data = await airtableFetch(tableId, {
      method: "PATCH",
      body: { records: chunk, typecast: true },
    });
    out.push(...(data.records || []));
    if (i + 10 < updates.length) await sleep(220);
  }
  return out;
}

async function deleteRecords(tableId, recordIds) {
  for (let i = 0; i < recordIds.length; i += 10) {
    const chunk = recordIds.slice(i, i + 10);
    const params = new URLSearchParams();
    chunk.forEach((id) => params.append("records[]", id));
    await airtableFetch(`${tableId}?${params}`, { method: "DELETE" });
    if (i + 10 < recordIds.length) await sleep(220);
  }
}

/**
 * Upsert rows keyed by Source Id. Deletes Airtable rows whose Source Id
 * is not in the payload (replace-table semantics).
 * Dedupes payload by sourceId and purges Airtable duplicates of the same Source Id.
 */
async function replaceBySourceId(tableId, rows, toFields) {
  const existing = await listAll(tableId);

  // Keep first Airtable record per Source Id; queue extras for delete
  const bySource = new Map();
  const duplicateRecIds = [];
  for (const rec of existing) {
    const sid = rec.fields?.["Source Id"];
    if (!sid) continue;
    const key = String(sid);
    if (bySource.has(key)) duplicateRecIds.push(rec.id);
    else bySource.set(key, rec);
  }

  // Dedupe payload rows (last write wins) so we never PATCH the same record twice
  const uniqueRows = [];
  const seenSid = new Set();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const sid = String(rows[i].sourceId);
    if (!sid || seenSid.has(sid)) continue;
    seenSid.add(sid);
    uniqueRows.unshift(rows[i]);
  }

  const keep = new Set();
  const toCreate = [];
  const toUpdate = [];
  const updateIds = new Set();

  for (const row of uniqueRows) {
    const sid = String(row.sourceId);
    keep.add(sid);
    const fields = toFields(row);
    fields["Source Id"] = sid;
    const prev = bySource.get(sid);
    if (prev) {
      if (updateIds.has(prev.id)) continue;
      updateIds.add(prev.id);
      toUpdate.push({ id: prev.id, fields });
    } else {
      toCreate.push(fields);
    }
  }

  if (toUpdate.length) await updateRecords(tableId, toUpdate);
  if (toCreate.length) await createRecords(tableId, toCreate);

  const staleOrDupes = existing
    .filter((rec) => {
      const sid = rec.fields?.["Source Id"];
      if (!sid) return false;
      const key = String(sid);
      if (!keep.has(key)) return true;
      // Extra Airtable rows sharing a kept Source Id
      const keeper = bySource.get(key);
      return keeper && keeper.id !== rec.id;
    })
    .map((r) => r.id);

  const toDelete = [...new Set([...duplicateRecIds, ...staleOrDupes])];
  if (toDelete.length) await deleteRecords(tableId, toDelete);

  // Refresh map for link resolution
  const refreshed = await listAll(tableId);
  const map = new Map();
  for (const rec of refreshed) {
    const sid = rec.fields?.["Source Id"];
    if (sid) map.set(String(sid), rec.id);
  }
  return map;
}

/** Prefer first occurrence when Source Ids collide. */
function dedupeById(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = String(row?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function linkedIds(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field.map(String);
  return [];
}

/** Assemble Munyon app state from Airtable. */
export async function fetchPlanFromAirtable() {
  const [settings, fixed, paychecks, categories, savings, expenses] =
    await Promise.all([
      listAll(TABLES.planSettings),
      listAll(TABLES.fixedCosts, { sortField: "Sort Order" }),
      listAll(TABLES.paychecks, { sortField: "Sort Order" }),
      listAll(TABLES.categories, { sortField: "Sort Order" }),
      listAll(TABLES.savings, { sortField: "Sort Order" }),
      listAll(TABLES.expenses, { sortField: "Sort Order" }),
    ]);

  if (!settings.length && !paychecks.length && !expenses.length) {
    return null;
  }

  const paycheckByRec = new Map();
  for (const rec of paychecks) {
    paycheckByRec.set(rec.id, String(rec.fields?.["Source Id"] || ""));
  }
  const categoryByRec = new Map();
  for (const rec of categories) {
    categoryByRec.set(rec.id, String(rec.fields?.["Source Id"] || ""));
  }

  const settingsRec = settings.find((r) => r.fields?.["Source Id"] === "default") || settings[0];

  let savingsPlacements = {};
  try {
    const raw = settingsRec?.fields?.["Savings Placements"];
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        savingsPlacements = parsed;
      }
    }
  } catch {
    savingsPlacements = {};
  }

  return {
    payAmount: num(settingsRec?.fields?.["Pay Amount"]),
    savingsPlacements,
    fixed: dedupeById(
      fixed.map((r) => ({
        id: String(r.fields?.["Source Id"] || r.id),
        name: r.fields?.Name || "",
        cost: num(r.fields?.Cost),
      }))
    ),
    paychecks: dedupeById(
      paychecks.map((r) => ({
        id: String(r.fields?.["Source Id"] || r.id),
        label: r.fields?.Label || "",
      }))
    ),
    categories: dedupeById(
      categories.map((r) => ({
        id: String(r.fields?.["Source Id"] || r.id),
        name: r.fields?.Name || "",
        color: r.fields?.Color || "#E11D2E",
      }))
    ),
    items: dedupeById(
      expenses.map((r) => {
        const f = r.fields || {};
        const pcRec = linkedIds(f.Paycheck)[0];
        const catRecs = linkedIds(f.Categories);
        const item = {
          id: String(f["Source Id"] || r.id),
          name: f.Name || "",
          cost: num(f.Cost),
          pc: pcRec ? paycheckByRec.get(pcRec) || "" : "",
          paid: Boolean(f.Paid),
          link: f.Link || "",
          categoryIds: catRecs.map((id) => categoryByRec.get(id)).filter(Boolean),
        };
        if (f["Split Group"]) {
          item.splitGroup = f["Split Group"];
          item.splitIndex = f["Split Index"] ?? undefined;
          item.splitOf = f["Split Of"] ?? undefined;
        }
        if (f["Split Cadence"]) {
          const cad = String(f["Split Cadence"]).toLowerCase();
          item.splitCadence = cad === "monthly" ? "monthly" : "biweekly";
        }
        return item;
      })
    ),
    savings: dedupeById(
      savings.map((r) => ({
        id: String(r.fields?.["Source Id"] || r.id),
        name: r.fields?.Name || "",
        balance: num(r.fields?.Balance),
        deposit: num(r.fields?.Deposit),
        borrowed: num(r.fields?.Borrowed),
        frequency:
          String(r.fields?.Frequency || "")
            .toLowerCase()
            .includes("month")
            ? "monthly"
            : "biweekly",
      }))
    ),
  };
}

/** Persist full Munyon state into Airtable (replace semantics). */
export async function savePlanToAirtable(state) {
  // Settings (single row)
  const placements =
    state.savingsPlacements && typeof state.savingsPlacements === "object"
      ? state.savingsPlacements
      : {};
  await replaceBySourceId(TABLES.planSettings, [
    {
      sourceId: "default",
      payAmount: num(state.payAmount),
      savingsPlacements: JSON.stringify(placements),
    },
  ], (row) => ({
    Name: "default",
    "Pay Amount": row.payAmount,
    "Savings Placements": row.savingsPlacements || "{}",
  }));

  await replaceBySourceId(
    TABLES.fixedCosts,
    (state.fixed || []).map((f, i) => ({
      sourceId: f.id,
      name: f.name,
      cost: num(f.cost),
      sortOrder: i,
    })),
    (row) => ({
      Name: row.name,
      Cost: row.cost,
      "Sort Order": row.sortOrder,
    })
  );

  const paycheckMap = await replaceBySourceId(
    TABLES.paychecks,
    (state.paychecks || []).map((p, i) => ({
      sourceId: p.id,
      label: p.label,
      sortOrder: i,
    })),
    (row) => ({
      Label: row.label,
      "Sort Order": row.sortOrder,
    })
  );

  const categoryMap = await replaceBySourceId(
    TABLES.categories,
    (state.categories || []).map((c, i) => ({
      sourceId: c.id,
      name: c.name,
      color: c.color || "#E11D2E",
      sortOrder: i,
    })),
    (row) => ({
      Name: row.name,
      Color: row.color,
      "Sort Order": row.sortOrder,
    })
  );

  await replaceBySourceId(
    TABLES.savings,
    (state.savings || []).map((s, i) => ({
      sourceId: s.id,
      name: s.name,
      balance: num(s.balance),
      deposit: num(s.deposit),
      borrowed: num(s.borrowed),
      frequency: s.frequency === "monthly" ? "Monthly" : "Biweekly",
      sortOrder: i,
    })),
    (row) => ({
      Name: row.name,
      Balance: row.balance,
      Deposit: row.deposit,
      Borrowed: row.borrowed,
      Frequency: row.frequency,
      "Sort Order": row.sortOrder,
    })
  );

  await replaceBySourceId(
    TABLES.expenses,
    (state.items || []).map((item, i) => ({
      sourceId: item.id,
      name: item.name,
      cost: num(item.cost),
      paid: Boolean(item.paid),
      link: item.link || "",
      splitGroup: item.splitGroup || null,
      splitIndex: item.splitIndex ?? null,
      splitOf: item.splitOf ?? null,
      splitCadence: item.splitCadence || null,
      sortOrder: i,
      pc: item.pc || "",
      categoryIds: item.categoryIds || [],
    })),
    (row) => {
      const fields = {
        Name: row.name,
        Cost: row.cost,
        Paid: row.paid,
        "Sort Order": row.sortOrder,
      };
      if (row.link) fields.Link = row.link;
      else fields.Link = null;
      if (row.splitGroup) {
        fields["Split Group"] = row.splitGroup;
        fields["Split Index"] = row.splitIndex;
        fields["Split Of"] = row.splitOf;
        fields["Split Cadence"] =
          row.splitCadence === "monthly" ? "Monthly" : "Biweekly";
      } else {
        fields["Split Group"] = null;
        fields["Split Index"] = null;
        fields["Split Of"] = null;
        fields["Split Cadence"] = null;
      }
      const pcRec = row.pc ? paycheckMap.get(row.pc) : null;
      fields.Paycheck = pcRec ? [pcRec] : [];
      fields.Categories = (row.categoryIds || [])
        .map((cid) => categoryMap.get(cid))
        .filter(Boolean);
      return fields;
    }
  );
}
