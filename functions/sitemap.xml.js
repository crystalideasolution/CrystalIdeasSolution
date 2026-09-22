/* แผนผังเว็บสำหรับ Google (https://crystalideasolution.com/sitemap.xml)
   สร้างใหม่ทุกครั้งจากผลงานที่บันทึกไว้บนเซิร์ฟเวอร์ ผลงานที่เพิ่มจากหลังบ้านจึงเข้าแผนผังเอง
   ผลงานที่ปิดไม่ให้แสดงบนเว็บจะไม่ถูกใส่ */
const SITE = "https://crystalideasolution.com";
const PAGES = ["", "services", "projects", "about", "contact"];

/* ถ้ายังไม่เคยบันทึกเนื้อหาจากหลังบ้าน เว็บจะใช้ผลงานตั้งต้นชุดนี้ (ต้องตรงกับใน index.html) */
const DEFAULT_PROJECTS = [
  "la-mitra-standee-banner", "la-mitra-mithmaitree", "la-mitra-window-graphic",
  "the-kross-asoke", "jiayijia-office", "jiayijia-rollup"
];

const xmlEscape = s => String(s).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

export async function onRequestGet({ env }) {
  let ids = DEFAULT_PROJECTS;
  try {
    const raw = env.CIS_KV && await env.CIS_KV.get("content");
    const content = raw && JSON.parse(raw);
    if (content && Array.isArray(content.projects)) {
      ids = content.projects.filter(p => p && p.id && p.published !== false).map(p => p.id);
    }
  } catch (e) { /* อ่านเนื้อหาไม่ได้ ใช้ผลงานตั้งต้นแทน แผนผังยังใช้ได้ */ }

  const urls = [
    ...PAGES.map(p => ({ loc: SITE + "/" + p, priority: p ? "0.8" : "1.0" })),
    ...ids.map(id => ({ loc: SITE + "/project/" + encodeURIComponent(id), priority: "0.6" }))
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${xmlEscape(u.loc)}</loc><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" }
  });
}
