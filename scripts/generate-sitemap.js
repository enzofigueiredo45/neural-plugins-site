const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonicalUrl = String(
  process.env.SITE_URL || "https://neural-plugins-site.vercel.app",
).replace(/\/$/, "");
const lastmod = new Date().toISOString().slice(0, 10);
const pages = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  {
    path: "/produto-neural-x.html",
    priority: "0.9",
    changefreq: "weekly",
    images: [
      "/assets/neural-dsp/archetype-john-mayer-x.png",
      "/assets/neural-dsp/archetype-gojira-x.png",
      "/assets/neural-dsp/parallax-x.png",
      "/assets/neural-dsp/mantra.png",
    ],
  },
  {
    path: "/produto-fl-studio.html",
    priority: "0.8",
    changefreq: "weekly",
    images: ["/assets/product-fl-studio.jpg"],
  },
  {
    path: "/produto-reaper.html",
    priority: "0.8",
    changefreq: "weekly",
    images: ["/assets/product-reaper.jpg"],
  },
  { path: "/contact.html", priority: "0.6", changefreq: "monthly" },
  { path: "/privacy.html", priority: "0.4", changefreq: "yearly" },
  { path: "/terms.html", priority: "0.4", changefreq: "yearly" },
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
    (page) =>
      `  <url><loc>${escapeXml(canonicalUrl + page.path)}</loc><lastmod>${lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority>${(page.images || []).map((image) => `<image:image><image:loc>${escapeXml(canonicalUrl + image)}</image:loc></image:image>`).join("")}</url>`,
  )
  .join("\n");

fs.writeFileSync(
  path.join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`,
);
