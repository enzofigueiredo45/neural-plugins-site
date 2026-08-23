const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonicalUrl = String(
  process.env.SITE_URL || "https://neural-plugins-site.vercel.app",
).replace(/\/$/, "");
const lastmod = new Date().toISOString().slice(0, 10);
const pages = [
  ["/", "1.0"],
  ["/produto-neural-x.html", "0.9"],
  ["/produto-fl-studio.html", "0.8"],
  ["/produto-reaper.html", "0.8"],
  ["/contact.html", "0.6"],
  ["/privacy.html", "0.4"],
  ["/terms.html", "0.4"],
];

const escapeXml = (value) =>
  String(value).replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '\"': "&quot;",
  })[character]);

const urls = pages
  .map(
    ([pathname, priority]) =>
      `  <url><loc>${escapeXml(canonicalUrl + pathname)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`,
  )
  .join("\n");

fs.writeFileSync(
  path.join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
