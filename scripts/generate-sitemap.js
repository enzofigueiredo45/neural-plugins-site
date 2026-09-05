const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonicalUrl = String(
  process.env.SITE_URL || "https://neuralxplugins.com.br",
).replace(/\/$/, "");
if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(canonicalUrl)) {
  throw new Error("SITE_URL precisa ser uma origem HTTPS válida, sem caminho.");
}
const lastmod = new Date().toISOString().slice(0, 10);
const pages = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  {
    path: "/produto-neural-x.html",
    priority: "0.9",
    changefreq: "weekly",
    images: [
      "/assets/neural-dsp/archetype-john-mayer-x.png",
      "/assets/neural-dsp/morgan-amps-suite.png",
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
  { path: "/guias.html", priority: "0.8", changefreq: "weekly" },
  {
    path: "/guia-plugins-guitarra.html",
    priority: "0.8",
    changefreq: "monthly",
    images: ["/assets/neural-dsp/archetype-john-mayer-x.png"],
  },
  {
    path: "/guia-escolher-daw.html",
    priority: "0.8",
    changefreq: "monthly",
    images: ["/assets/product-fl-studio.jpg", "/assets/product-reaper.jpg"],
  },
  { path: "/checklist-software-musical.html", priority: "0.8", changefreq: "monthly" },
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

const indexPath = path.join(root, "index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const currentCanonicalMatch = indexHtml.match(
  /<link\s+rel="canonical"\s+href="(https:\/\/[^"/]+)(?:\/[^" ]*)?"/i,
);
const currentCanonicalUrl = currentCanonicalMatch?.[1] || canonicalUrl;
const htmlFiles = [
  "index.html",
  ...pages
    .map((page) => page.path.replace(/^\//, ""))
    .filter((page) => page.endsWith(".html")),
];

for (const file of new Set(htmlFiles)) {
  const filePath = path.join(root, file);
  const html = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, html.split(currentCanonicalUrl).join(canonicalUrl));
}

const robotsPath = path.join(root, "robots.txt");
const robots = fs.readFileSync(robotsPath, "utf8").replace(
  /^Sitemap:\s*.+$/m,
  `Sitemap: ${canonicalUrl}/sitemap.xml`,
);
fs.writeFileSync(robotsPath, robots);

fs.writeFileSync(
  path.join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`,
);
