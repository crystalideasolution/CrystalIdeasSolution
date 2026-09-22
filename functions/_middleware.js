/* ส่ง URL ที่ไม่ตรงกับไฟล์ใด ๆ (เช่น /projects, /admin/company) กลับไปให้ index.html จัดการ
   เพื่อให้พิมพ์ URL ตรง ๆ หรือกด F5 ค้างหน้าไหนก็เปิดได้ และได้สถานะ 200 จริง (ดีต่อ SEO) */
/* ชื่อเว็บหลักมีชื่อเดียว การล็อกอินผูกกับชื่อเว็บ ถ้าเข้าได้หลายชื่อ
   คนที่ล็อกอินที่ชื่อหนึ่งแล้วไปเปิดอีกชื่อจะต้องล็อกอินใหม่ และ Google จะเห็นเป็นคนละเว็บ
   ลิงก์ทดลองของแต่ละรอบ deploy (xxxx.crystal-ideas-solution.pages.dev) ไม่ถูกเด้ง
   จะได้มีทางเข้าสำรองไว้ตรวจงานเสมอ */
const CANONICAL = "crystalideasolution.com";
const MOVE_TO_CANONICAL = new Set(["www.crystalideasolution.com", "crystal-ideas-solution.pages.dev"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  /* API ไม่เด้ง แท็บเก่าที่เปิดค้างไว้จะได้บันทึกงานที่ทำอยู่ได้จนเสร็จ
     พอโหลดหน้าใหม่เมื่อไหร่ก็จะไปอยู่ที่โดเมนหลักเอง */
  if (url.pathname.startsWith("/api/")) return next();

  if (MOVE_TO_CANONICAL.has(url.hostname)) {
    return Response.redirect("https://" + CANONICAL + url.pathname + url.search, 301);
  }

  const res = await next();
  const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(url.pathname);
  if (res.status !== 404 || looksLikeFile) return res;

  const index = await env.ASSETS.fetch(new URL("/index.html", url).toString());
  const headers = new Headers(index.headers);
  headers.set("cache-control", "no-cache");
  return new Response(index.body, { status: 200, headers });
}
