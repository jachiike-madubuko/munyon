import {
  fetchPlanFromAirtable,
  savePlanToAirtable,
} from "../lib/airtablePlan.js";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const plan = await fetchPlanFromAirtable();
      send(res, 200, { plan });
      return;
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body || typeof body !== "object") {
        send(res, 400, { error: "Expected plan JSON body" });
        return;
      }
      await savePlanToAirtable(body);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("api/plan", e);
    send(res, e.statusCode || 500, {
      error: e.message || "Plan API failed",
      details: e.details || undefined,
    });
  }
}
