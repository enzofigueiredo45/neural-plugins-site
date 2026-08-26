const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));

test("all internal links and assets referenced by HTML exist", () => {
  const missing = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (
        !value ||
        value.startsWith("#") ||
        value.startsWith("data:") ||
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("/api/")
      )
        continue;
      const pathname = value.split(/[?#]/, 1)[0];
      const target = pathname === "/"
        ? path.join(root, "index.html")
        : path.resolve(root, pathname.replace(/^\//, ""));
      if (!fs.existsSync(target)) missing.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("structured data and web manifest contain valid JSON", () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      assert.doesNotThrow(() => JSON.parse(match[1]), file);
    }
  }
  assert.doesNotThrow(() =>
    JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8")),
  );
});

test("Google discovery files cover every public page and product image", () => {
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  const verification = fs.readFileSync(
    path.join(root, "googleab9c8b948f79ec49.html"),
    "utf8",
  );
  for (const page of [
    "/",
    "/produto-neural-x.html",
    "/produto-fl-studio.html",
    "/produto-reaper.html",
    "/guias.html",
    "/guia-plugins-guitarra.html",
    "/guia-escolher-daw.html",
    "/checklist-software-musical.html",
    "/contact.html",
    "/privacy.html",
    "/terms.html",
  ])
    assert.match(sitemap, new RegExp(`<loc>https://neural-plugins-site\\.vercel\\.app${page.replace("/", "\\/")}`));
  for (const image of [
    "archetype-john-mayer-x.png",
    "product-fl-studio.jpg",
    "product-reaper.jpg",
  ])
    assert.match(sitemap, new RegExp(`<image:loc>[^<]+${image}</image:loc>`));
  assert.match(robots, /Sitemap: https:\/\/neural-plugins-site\.vercel\.app\/sitemap\.xml/);
  assert.equal(
    verification.trim(),
    "google-site-verification: googleab9c8b948f79ec49.html",
  );
});

test("guide pages are indexable, canonical and publish valid article data", () => {
  const guides = [
    "guia-plugins-guitarra.html",
    "guia-escolher-daw.html",
    "checklist-software-musical.html",
  ];
  for (const file of guides) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://neural-plugins-site\\.vercel\\.app/${file}"`));
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.match(html, /"@type":\s*"Article"/);
    assert.match(html, /data-content-id="[^"]+"/);
  }
});

test("educational content is linked and measured through the product funnel", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(index, /href="\.\/guias\.html"/);
  assert.match(index, /href="\.\/guia-plugins-guitarra\.html"/);
  assert.match(index, /href="\.\/guia-escolher-daw\.html"/);
  assert.match(index, /href="\.\/checklist-software-musical\.html"/);
  assert.match(main, /"view_content"/);
  assert.match(main, /"select_content_cta"/);
});

test("Google Ads purchase tracking requires consent and preserves transaction value", () => {
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  assert.match(main, /AW-10867942652\/-P1jCMGH0-YcEPzJnr4o/);
  assert.match(main, /getMeasurementConsent\(\) !== "granted"/);
  assert.match(main, /transaction_id: sessionId/);
  assert.match(main, /value: Number\(data\.value \|\| 0\)/);
  assert.match(privacy, /Não ativamos conversões otimizadas/);
  assert.match(vercel, /https:\/\/www\.googletagmanager\.com/);
});

test("private commerce and account pages are not indexable", () => {
  for (const file of [
    "cart.html",
    "client-dashboard.html",
    "client-login.html",
    "client-register.html",
    "forgot-password.html",
    "reset-password.html",
    "success.html",
    "verify-email.html",
  ]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<meta name="robots" content="noindex,(?:no)?follow">/);
  }
});

test("browser-delivered files contain no Stripe or webhook secrets", () => {
  for (const file of [...htmlFiles, "main.js", "styles.css"]) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(content, /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{12,}/, file);
    assert.doesNotMatch(content, /whsec_[A-Za-z0-9]{12,}/, file);
  }
});

test("storefront exposes measurable offers without using HTML prices as checkout authority", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const cart = fs.readFileSync(path.join(root, "cart.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const productId of ["neural-x", "fl-studio", "reaper"]) {
    assert.match(index, new RegExp(`data-product-price="${productId}"`));
    assert.match(index, new RegExp(`data-offer-select="${productId}"`));
  }
  assert.match(cart, /id="fulfillmentNote"/);
  assert.match(main, /fetch\("\/api\/catalog"\)/);
  for (const eventName of [
    "view_item",
    "select_offer",
    "add_to_cart",
    "begin_checkout",
    "checkout_created",
    "purchase",
    "select_hero_path",
    "view_recommendation",
    "generate_lead",
  ]) {
    assert.match(main, new RegExp(`"${eventName}"`));
  }
});

test("the commercial funnel has consistent anonymous dimensions and monetary context", () => {
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const cart = fs.readFileSync(path.join(root, "cart.html"), "utf8");
  const success = fs.readFileSync(path.join(root, "success.html"), "utf8");

  for (const dimension of [
    "funnel_id",
    "page_variant",
    "page_path",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ])
    assert.match(main, new RegExp(`${dimension}:`));

  assert.match(main, /sessionStorage\.getItem\(FUNNEL_ID_KEY\)/);
  assert.match(main, /sessionStorage\.getItem\(STOREFRONT_VIEW_KEY\)/);
  assert.match(main, /trackStorefrontViewOnce\(product \? "product" : "store"\)/);
  assert.match(main, /function trackOfferSelection[\s\S]*?product_name:[\s\S]*?currency: "BRL"[\s\S]*?placement,/);
  assert.match(main, /trackOfferSelection\([\s\S]*?addToCart\(button\.dataset\.id\)/);
  assert.match(main, /trackEvent\("add_to_cart", \{[\s\S]*?quantity: 1,[\s\S]*?cartMetrics\(next\)/);
  assert.match(main, /trackEvent\("begin_checkout", checkoutMetrics\(cart\)\)/);
  assert.match(main, /trackPurchaseOnce\(sessionId,[\s\S]*?value:[\s\S]*?currency:[\s\S]*?item_count:[\s\S]*?product_ids:/);
  assert.match(cart, /data-page-variant="studio-editorial-v1"/);
  assert.match(success, /data-page-variant="studio-editorial-v1"/);
});

test("purchase measurement is server-confirmed and deduplicated by Stripe session", () => {
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(main, /fetch\(`\/api\/checkout-session\?session_id=/);
  assert.match(main, /if \(data\.paymentStatus === "paid"\)/);
  assert.match(main, /if \(!sessions\.includes\(sessionId\)\) \{\s*trackEvent\("purchase", data\)/);
});

test("recommendation is immediate and optional email capture has separate consent", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const database = fs.readFileSync(path.join(root, "lib/db.js"), "utf8");
  assert.match(index, /id="recommendationForm"/);
  assert.match(index, /Ver recomendação sem cadastro/);
  assert.match(index, /id="recommendationResult" hidden/);
  assert.match(index, /id="leadForm" hidden/);
  assert.match(index, /name="recommendationConsent"[^>]*required/);
  assert.match(index, /name="marketingConsent"/);
  assert.doesNotMatch(index, /name="marketingConsent"[^>]*required/);
  assert.match(index, /Consentimento separado/);
  assert.match(index, /href="\.\/privacy\.html"/);
  assert.match(main, /function initRecommendation\(\)/);
  assert.match(main, /trackEvent\("view_recommendation"/);
  assert.match(server, /"\/api\/leads"/);
  assert.match(server, /sendRecommendationEmail/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS leads/);
  assert.match(privacy, /cancelar o consentimento/);
});

test("homepage has an interactive production selector and a non-numbered studio strip", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  for (const objective of ["guitar", "beats", "recording"])
    assert.match(index, new RegExp(`data-hero-choice="${objective}"`));
  assert.match(index, /id="heroProductImage"/);
  assert.match(index, /id="heroDemoLink"/);
  assert.match(main, /const HERO_CHOICES/);
  assert.match(main, /function initHeroSelector\(\)/);
  assert.match(index, /class="trust-row studio-signal-strip"/);
  assert.doesNotMatch(index, /trust-index/);
  assert.match(styles, /\.studio-signal-strip/);
  assert.match(styles, /\.signal-led/);
});

test("unconfirmed offer details pause checkout without inventing delivery or activation", () => {
  for (const file of [
    "index.html",
    "produto-neural-x.html",
    "produto-fl-studio.html",
    "produto-reaper.html",
    "cart.html",
    "terms.html",
  ]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /(?:confirmação|publicad|pausad)/i, file);
    assert.doesNotMatch(html, /licenças? (?:digital )?(?:fica|ficam) vinculad[ao]s? ao computador/i, file);
  }
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(main, /offer_not_ready/);
  assert.match(main, /saleReady/);
  assert.match(server, /offer_not_ready/);
  assert.match(server, /terms_version: "2026-08-26"/);
});

test("product pages identify the stable store product", () => {
  const pages = {
    "produto-neural-x.html": "neural-x",
    "produto-fl-studio.html": "fl-studio",
    "produto-reaper.html": "reaper",
  };
  for (const [file, productId] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, new RegExp(`<body data-product-id="${productId}">`));
    assert.match(html, new RegExp(`data-product-price="${productId}"`));
  }
});

test("FL Studio and REAPER avoid asserting an unconfirmed edition", () => {
  for (const file of ["produto-fl-studio.html", "produto-reaper.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<h1>(?:FL Studio|REAPER)<\/h1>/);
    assert.match(html, /(?:Edição|Versão)<\/span><strong>Em confirmação<\/strong>/);
    assert.doesNotMatch(html, /(?:FL Studio|REAPER) 2026/);
  }
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(main, /name: "FL Studio"/);
  assert.match(main, /name: "REAPER"/);
});

test("product pages disclose that license and activation are pending confirmation", () => {
  for (const file of [
    "produto-neural-x.html",
    "produto-fl-studio.html",
    "produto-reaper.html",
  ]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /Licença[\s\S]{0,80}(?:confirmação|confirmad)/i);
    assert.match(html, /disabled aria-disabled="true"/);
  }
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const terms = fs.readFileSync(path.join(root, "terms.html"), "utf8");
  assert.match(main, /licenseType: "(?:Edição, |Versão, )?Licença e ativação em confirmação"/i);
  assert.match(terms, /Enquanto algum desses dados estiver em confirmação, a compra correspondente permanece pausada/i);
});

test("storefront avoids an unverified legal entity and preserves the legal refund window", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const contact = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  const terms = fs.readFileSync(path.join(root, "terms.html"), "utf8");
  assert.doesNotMatch(index, /Neural X Inc\./);
  assert.doesNotMatch(contact, /Neural X Inc\./);
  assert.match(contact, /identificação legal, fiscal e o endereço do responsável/);
  assert.match(terms, /prazo legal de 7 dias/i);
  assert.match(terms, /responde à solicitação em até 24 horas/i);
  assert.match(terms, /não reduz nenhum direito/i);
});

test("Neural DSP page includes an accessible measured video demo", () => {
  const page = fs.readFileSync(path.join(root, "produto-neural-x.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(page, /<video[^>]+controls[^>]+playsinline/);
  assert.match(page, /data-product-video="neural-x"/);
  assert.match(page, /neural-dsp-comparacao-clean-neural-x\.mp4/);
  assert.match(page, /neural-dsp-comparacao-clean-neural-x-poster\.jpg/);
  assert.match(page, /O vídeo demonstra 3 dos 23 plugins/);
  assert.match(page, /Alternativa textual da demonstração/);
  assert.match(page, /O vídeo é instrumental e não contém fala/);
  for (const eventName of ["video_start", "video_half", "video_complete"])
    assert.match(main, new RegExp(`"${eventName}"`));
});

test("client dashboard includes a protected MFA disable flow", () => {
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(dashboard, /id="mfaDisable"[^>]*hidden/);
  assert.match(dashboard, /id="mfaDisablePassword"/);
  assert.match(dashboard, /id="mfaDisableToken"/);
  assert.match(main, /postJson\("\/api\/mfa\/disable"/);
});

test("account ownership and product access require verification and paid-order claim", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const database = fs.readFileSync(path.join(root, "lib/db.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const route of [
    "/api/email-verification/confirm",
    "/api/password/forgot",
    "/api/password/reset",
    "/api/orders/claim",
    "/api/orders/:orderId/access",
  ]) assert.match(server, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(server, /requireVerifiedEmail/);
  assert.match(server, /WHERE user_id = \$1/);
  assert.doesNotMatch(server, /FROM orders WHERE buyer_email = \$1/);
  assert.match(database, /email_verified_at/);
  assert.match(database, /auth_version/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS account_tokens/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS email_outbox/);
  assert.match(main, /order\.access_url/);
  assert.doesNotMatch(main, /order\.download_url/);
});

test("post-purchase page exposes four operational milestones", () => {
  const success = fs.readFileSync(path.join(root, "success.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const id of ["milestonePayment", "milestoneOrder", "milestoneEmail", "milestoneAccess"])
    assert.match(success, new RegExp(`id="${id}"`));
  assert.match(main, /emailStatus/);
  assert.match(main, /PENDING_ORDER_CLAIM_KEY/);
});

test("the hero tabs implement keyboard and panel relationships", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(index, /role="tabpanel"[^>]*aria-labelledby="heroTabGuitar"/);
  assert.match(index, /role="tab"[^>]*aria-controls="heroOffer"[^>]*tabindex="-1"/);
  assert.match(main, /"Home", "End"/);
  assert.match(main, /event\.key !== "Escape"/);
});
