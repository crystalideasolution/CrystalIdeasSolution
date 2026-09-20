/* =========================================================
   API ของระบบจัดการเว็บไซต์ (Cloudflare Pages Functions)
   ---------------------------------------------------------
   ข้อมูลทั้งหมดอยู่ที่ Cloudflare KV ทุกเครื่องจึงเห็นชุดเดียวกัน
     users     = รายชื่อผู้ใช้งาน (เก็บเฉพาะค่าแฮชของรหัสผ่าน)
     secret    = กุญแจสำหรับเซ็นตั๋วเข้าสู่ระบบ (ระบบสร้างเอง)
     content   = เนื้อหาเว็บไซต์ทั้งก้อน (JSON)
     messages  = ข้อความจากฟอร์มติดต่อ

   สิทธิ์การใช้งาน
     owner  = เจ้าของระบบ  : แก้เนื้อหาได้ + จัดการผู้ใช้งานได้
     editor = ผู้ดูแลเนื้อหา: แก้เนื้อหาและตอบข้อความได้ แต่จัดการผู้ใช้ไม่ได้
   ========================================================= */

const ITER = 150000;
const SESSION_HOURS = 8;
const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGES = 500;
const LOGIN_TRIES = 8;              // ต่อ 5 นาที ต่อหนึ่ง IP
const ROLES = ["owner", "editor"];

const te = new TextEncoder();
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ok = (data, extra = {}) => new Response(JSON.stringify(data ?? {}), { status: 200, headers: { ...JSON_HEADERS, ...extra } });
const bad = (status, error) => new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randB64 = n => b64(crypto.getRandomValues(new Uint8Array(n)));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const normUser = v => clean(v, 32).toLowerCase();
const okUsername = v => /^[a-z0-9._-]{3,32}$/.test(v);

function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function pbkdf2(password, saltB64, iter) {
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(saltB64), iterations: iter || ITER, hash: "SHA-256" }, key, 256);
  return b64(bits);
}
async function readJSON(kv, key, fallback) {
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
async function makeUser(username, name, role, password) {
  const salt = randB64(16);
  return {
    id: uid(), username, name: name || username, role,
    salt, iter: ITER, hash: await pbkdf2(password, salt, ITER),
    active: true, createdAt: new Date().toISOString(), lastLogin: null
  };
}
/* ข้อมูลผู้ใช้ที่ส่งออกไปให้หน้าเว็บ — ไม่มีรหัสผ่านหรือค่าแฮชติดไปด้วย */
const pub = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active !== false, createdAt: u.createdAt || null, lastLogin: u.lastLogin || null });
const activeOwners = users => users.filter(u => u.role === "owner" && u.active !== false);

/* ---------- ตั๋วเข้าสู่ระบบ ---------- */
async function secretKey(kv) {
  let s = await kv.get("secret");
  if (!s) { s = randB64(32); await kv.put("secret", s); }
  return crypto.subtle.importKey("raw", te.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function signTicket(kv, payload) {
  const sig = await crypto.subtle.sign("HMAC", await secretKey(kv), te.encode(payload));
  return payload + "." + b64(sig);
}
const newTicket = (kv, user) => signTicket(kv, "v2|" + user.id + "|" + (Date.now() + SESSION_HOURS * 3600e3));
const cookieOf = (request, name) => {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
};
const setCookie = (value, maxAge) => `cis_sess=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

async function currentUser(request, kv, users) {
  const ticket = cookieOf(request, "cis_sess");
  if (!ticket || ticket.indexOf(".") < 1) return null;
  const payload = ticket.slice(0, ticket.indexOf("."));
  if (!sameString(await signTicket(kv, payload), ticket)) return null;
  const parts = payload.split("|");
  if (parts[0] !== "v2" || Number(parts[2] || 0) <= Date.now()) return null;
  const u = (users || []).find(x => x.id === parts[1]);
  return u && u.active !== false ? u : null;
}

/* ---------- จำกัดจำนวนครั้งที่ลองรหัสผ่าน ---------- */
const ipOf = request => request.headers.get("CF-Connecting-IP") || "local";
const loginBlocked = async (kv, ip) => Number(await kv.get("rl:" + ip) || 0) >= LOGIN_TRIES;
async function loginFailed(kv, ip) {
  const n = Number(await kv.get("rl:" + ip) || 0) + 1;
  await kv.put("rl:" + ip, String(n), { expirationTtl: 300 });
}

/* =========================================================
   เส้นทางทั้งหมด
   ========================================================= */
export async function onRequest({ request, env, params }) {
  const kv = env.CIS_KV;
  if (!kv) return bad(500, "ยังไม่ได้ผูกที่เก็บข้อมูล (KV binding ชื่อ CIS_KV)");

  const path = (Array.isArray(params.path) ? params.path.join("/") : params.path || "").toLowerCase();
  const method = request.method.toUpperCase();

  try {
    const users = await readJSON(kv, "users", []);
    const me = await currentUser(request, kv, users);
    const isOwner = !!me && me.role === "owner";
    const body = ["POST", "PUT", "PATCH"].includes(method)
      ? await request.clone().json().catch(() => ({})) : {};

    /* ---------- สถานะระบบ ---------- */
    if (path === "state" && method === "GET") {
      return ok({ ready: users.length > 0, authed: !!me, me: me ? pub(me) : null });
    }

    /* ---------- สร้างผู้ใช้คนแรก (ทำได้ตอนยังไม่มีผู้ใช้เท่านั้น) ---------- */
    if (path === "setup" && method === "POST") {
      if (users.length) return bad(409, "ระบบมีผู้ใช้งานอยู่แล้ว");
      const username = normUser(body.username);
      if (!okUsername(username)) return bad(400, "ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3-32 ตัว");
      if (String(body.password || "").length < 8) return bad(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      const owner = await makeUser(username, clean(body.name, 80), "owner", body.password);
      owner.lastLogin = new Date().toISOString();
      await kv.put("users", JSON.stringify([owner]));
      return ok({ ready: true, authed: true, me: pub(owner) }, { "set-cookie": setCookie(await newTicket(kv, owner), SESSION_HOURS * 3600) });
    }

    /* ---------- เข้าสู่ระบบ ---------- */
    if (path === "login" && method === "POST") {
      if (!users.length) return bad(409, "ยังไม่มีผู้ใช้งานในระบบ");
      const ip = ipOf(request);
      if (await loginBlocked(kv, ip)) return bad(429, "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่");
      const username = normUser(body.username);
      const u = users.find(x => x.username === username);
      const okPw = u && sameString(await pbkdf2(String(body.password || ""), u.salt, u.iter), u.hash);
      if (!u || !okPw) { await loginFailed(kv, ip); return bad(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); }
      if (u.active === false) return bad(403, "บัญชีนี้ถูกระงับการใช้งาน");
      u.lastLogin = new Date().toISOString();
      await kv.put("users", JSON.stringify(users));
      await kv.delete("rl:" + ip);
      return ok({ authed: true, me: pub(u) }, { "set-cookie": setCookie(await newTicket(kv, u), SESSION_HOURS * 3600) });
    }

    if (path === "logout" && method === "POST") {
      return ok({ authed: false }, { "set-cookie": setCookie("", 0) });
    }

    /* ---------- เปลี่ยนรหัสผ่านของตัวเอง ---------- */
    if (path === "password" && method === "POST") {
      if (!me) return bad(401, "กรุณาเข้าสู่ระบบก่อน");
      if (String(body.next || "").length < 8) return bad(400, "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      if (!sameString(await pbkdf2(String(body.current || ""), me.salt, me.iter), me.hash)) return bad(403, "รหัสผ่านเดิมไม่ถูกต้อง");
      me.salt = randB64(16); me.iter = ITER; me.hash = await pbkdf2(body.next, me.salt, ITER);
      await kv.put("users", JSON.stringify(users));
      return ok({ changed: true }, { "set-cookie": setCookie(await newTicket(kv, me), SESSION_HOURS * 3600) });
    }

    /* ---------- จัดการผู้ใช้งาน (เฉพาะเจ้าของระบบ) ---------- */
    if (path === "users") {
      if (!me) return bad(401, "กรุณาเข้าสู่ระบบก่อน");
      if (!isOwner) return bad(403, "เฉพาะเจ้าของระบบเท่านั้นที่จัดการผู้ใช้งานได้");

      if (method === "GET") return ok(users.map(pub));

      if (method === "POST") {
        const username = normUser(body.username);
        if (!okUsername(username)) return bad(400, "ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3-32 ตัว");
        if (users.some(u => u.username === username)) return bad(409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        if (String(body.password || "").length < 8) return bad(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        const role = ROLES.includes(body.role) ? body.role : "editor";
        const u = await makeUser(username, clean(body.name, 80), role, body.password);
        users.push(u);
        await kv.put("users", JSON.stringify(users));
        return ok({ user: pub(u) });
      }

      if (method === "PUT") {
        const u = users.find(x => x.id === body.id);
        if (!u) return bad(404, "ไม่พบผู้ใช้งานนี้");
        const wasLastOwner = u.role === "owner" && activeOwners(users).length === 1 && u.active !== false;
        if (body.role !== undefined && ROLES.includes(body.role)) {
          if (wasLastOwner && body.role !== "owner") return bad(400, "ต้องมีเจ้าของระบบอย่างน้อยหนึ่งคน");
          u.role = body.role;
        }
        if (body.active !== undefined) {
          if (wasLastOwner && body.active === false) return bad(400, "ต้องมีเจ้าของระบบที่ใช้งานได้อย่างน้อยหนึ่งคน");
          if (u.id === me.id && body.active === false) return bad(400, "ระงับบัญชีของตัวเองไม่ได้");
          u.active = !!body.active;
        }
        if (body.name !== undefined) u.name = clean(body.name, 80) || u.username;
        if (body.password) {
          if (String(body.password).length < 8) return bad(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
          u.salt = randB64(16); u.iter = ITER; u.hash = await pbkdf2(body.password, u.salt, ITER);
        }
        await kv.put("users", JSON.stringify(users));
        return ok({ user: pub(u) });
      }

      if (method === "DELETE") {
        const id = new URL(request.url).searchParams.get("id");
        const i = users.findIndex(x => x.id === id);
        if (i < 0) return bad(404, "ไม่พบผู้ใช้งานนี้");
        if (users[i].id === me.id) return bad(400, "ลบบัญชีของตัวเองไม่ได้");
        if (users[i].role === "owner" && activeOwners(users).length === 1) return bad(400, "ต้องมีเจ้าของระบบอย่างน้อยหนึ่งคน");
        const gone = users.splice(i, 1)[0];
        await kv.put("users", JSON.stringify(users));
        return ok({ deleted: pub(gone) });
      }
    }

    /* ---------- เนื้อหาเว็บไซต์ ---------- */
    if (path === "content" && method === "GET") {
      const raw = await kv.get("content");
      return new Response(raw || "null", { status: 200, headers: JSON_HEADERS });
    }
    if (path === "content" && method === "PUT") {
      if (!me) return bad(401, "กรุณาเข้าสู่ระบบก่อน");
      const text = await request.text();
      if (text.length > MAX_CONTENT_BYTES) return bad(413, "ข้อมูลใหญ่เกิน 10 MB ลองลดขนาดรูปที่อัปโหลด");
      try { JSON.parse(text); } catch (e) { return bad(400, "รูปแบบข้อมูลไม่ถูกต้อง"); }
      await kv.put("content", text);
      return ok({ saved: true, bytes: text.length, by: me.username });
    }

    /* ---------- ข้อความจากฟอร์มติดต่อ ---------- */
    if (path === "messages" && method === "POST") {
      const name = clean(body.name, 120), tel = clean(body.tel, 40);
      if (!name || !tel) return bad(400, "กรุณากรอกชื่อและเบอร์โทรศัพท์");
      const list = await readJSON(kv, "messages", []);
      list.unshift({
        id: uid(), date: new Date().toISOString(), read: false,
        name, tel, email: clean(body.email, 160), type: clean(body.type, 120), message: clean(body.message, 4000)
      });
      await kv.put("messages", JSON.stringify(list.slice(0, MAX_MESSAGES)));
      return ok({ sent: true });
    }
    if (path === "messages" && method === "GET") {
      if (!me) return bad(401, "กรุณาเข้าสู่ระบบก่อน");
      return ok(await readJSON(kv, "messages", []));
    }
    if (path === "messages" && method === "PUT") {
      if (!me) return bad(401, "กรุณาเข้าสู่ระบบก่อน");
      if (!Array.isArray(body)) return bad(400, "รูปแบบข้อมูลไม่ถูกต้อง");
      await kv.put("messages", JSON.stringify(body.slice(0, MAX_MESSAGES)));
      return ok({ saved: true });
    }

    return bad(404, "ไม่พบคำสั่งนี้");
  } catch (e) {
    return bad(500, "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: " + (e && e.message ? e.message : e));
  }
}
