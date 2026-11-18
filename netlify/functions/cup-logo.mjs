// Team logos for the GFC Cup page.
// GET    /api/cup-logo?t=A1   -> the logo image (public)
// POST   /api/cup-logo?t=A1   -> upload a logo (needs the organiser PIN)
// DELETE /api/cup-logo?t=A1   -> remove a logo (needs the organiser PIN)
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

export default async (req) => {
  const store = getStore({ name: "gfc-cup", consistency: "strong" });
  const url = new URL(req.url);
  const t = url.searchParams.get("t") || "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(t)) return json({ error: "bad-team" }, 400);
  const key = "logo/" + t;

  if (req.method === "GET") {
    const r = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, {
      headers: { "content-type": (r.metadata && r.metadata.type) || "image/png", "cache-control": "public, max-age=86400" }
    });
  }

  if (req.method !== "POST" && req.method !== "DELETE") return json({ error: "method" }, 405);

  const expected = Netlify.env.get("ORGANISER_PIN");
  if (!expected) return json({ error: "not-configured" }, 503);
  const given = req.headers.get("x-organiser-pin") || "";
  if (!safeEqual(given, expected)) return json({ error: "bad-pin" }, 401);

  const overlay = (await store.get("overlay", { type: "json" })) || {};
  overlay.fixtures = overlay.fixtures || {};
  overlay.logos = overlay.logos || {};

  if (req.method === "DELETE") {
    await store.delete(key);
    overlay.logos[t] = 0;
  } else {
    const buf = await req.arrayBuffer();
    if (buf.byteLength < 16 || buf.byteLength > 1500000) return json({ error: "size" }, 413);
    const type = sniff(buf);
    if (!type) return json({ error: "type" }, 415);
    await store.set(key, buf, { metadata: { type } });
    overlay.logos[t] = Date.now();
  }
  overlay.updated = new Date().toISOString();
  await store.setJSON("overlay", overlay);
  return json({ ok: true });
};

export const config = { path: "/api/cup-logo" };
