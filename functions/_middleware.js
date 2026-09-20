/* ส่ง URL ที่ไม่ตรงกับไฟล์ใด ๆ (เช่น /projects, /admin/company) กลับไปให้ index.html จัดการ
   เพื่อให้พิมพ์ URL ตรง ๆ หรือกด F5 ค้างหน้าไหนก็เปิดได้ และได้สถานะ 200 จริง (ดีต่อ SEO) */
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) return next();

  const res = await next();
  const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(url.pathname);
  if (res.status !== 404 || looksLikeFile) return res;

  const index = await env.ASSETS.fetch(new URL("/index.html", url).toString());
  const headers = new Headers(index.headers);
  headers.set("cache-control", "no-cache");
  return new Response(index.body, { status: 200, headers });
}
