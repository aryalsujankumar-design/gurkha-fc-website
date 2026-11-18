// Saves organiser edits (scores, goal scorers, cards) for the GFC Cup page.
// GET  /api/cup-state            -> latest saved edits (public)
// POST /api/cup-state            -> save edits (needs the organiser PIN)
// POST /api/cup-state?check=1    -> check the PIN only
// The PIN is the ORGANISER_PIN setting in Netlify (Site configuration > Environment variables).
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function clean(v, n) { return String(v == null ? "" : v).slice(0, n); }

function num(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function sanitise(f) {
  const goals = (Array.isArray(f.goals) ? f.goals : []).slice(0, 40).map((g) => ({
    player: clean(g && g.player, 80).trim(),
    team: clean(g && g.team, 60),
    goals: num(g && g.goals, 1, 20) || 1
  })).filter((g) => g.player);
  const cards = (Array.isArray(f.cards) ? f.cards : []).slice(0, 40).map((c) => ({
    player: clean(c && c.player, 80).trim(),
    team: clean(c && c.team, 60),
    type: c && c.type === "Red" ? "Red" : "Yellow"
  })).filter((c) => c.player);
  return { score1: num(f.score1, 0, 99), score2: num(f.score2, 0, 99), goals, cards };
}

export default async (req) => {
  const store = getStore({ name: "gfc-cup", consistency: "strong" });

  if (req.method === "GET") {
    const cur = await store.get("overlay", { type: "json" });
    return json(cur || { updated: null, fixtures: {} });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const expected = Netlify.env.get("ORGANISER_PIN");
  if (!expected) return json({ error: "not-configured" }, 503);
  const given = req.headers.get("x-organiser-pin") || "";
  if (!safeEqual(given, expected)) return json({ error: "bad-pin" }, 401);

  const url = new URL(req.url);
  if (url.searchParams.get("check")) return json({ ok: true });

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad-json" }, 400); }
  const incoming = body && body.fixtures && typeof body.fixtures === "object" ? body.fixtures : {};

  const cur = (await store.get("overlay", { type: "json" })) || { fixtures: {} };
  const fixtures = cur.fixtures || {};
  Object.keys(incoming).slice(0, 200).forEach((id) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return;
    fixtures[id] = sanitise(incoming[id] || {});
  });
  const overlay = { updated: new Date().toISOString(), fixtures };
  await store.setJSON("overlay", overlay);
  return json({ ok: true, overlay });
};

export const config = { path: "/api/cup-state" };
