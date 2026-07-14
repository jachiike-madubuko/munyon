/**
 * Client → Airtable SoT via server /api/plan (PAT never in the browser).
 */

export async function fetchPlan() {
  const res = await fetch("/api/plan", { method: "GET", credentials: "same-origin" });
  if (res.status === 503) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/plan ${res.status}`);
  }
  const data = await res.json();
  return data.plan ?? null;
}

/** @returns {Promise<boolean>} true when cloud accepted the save */
export async function savePlan(state) {
  const res = await fetch("/api/plan", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (res.status === 503) return false;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PUT /api/plan ${res.status}`);
  }
  return true;
}
