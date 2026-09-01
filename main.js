const CART_KEY = "neuralx_cart";
const ATTRIBUTION_KEY = "neuralx_attribution";
const FUNNEL_ID_KEY = "neuralx_funnel_id";
const STOREFRONT_VIEW_KEY = "neuralx_storefront_viewed";
const PURCHASE_TRACKING_KEY = "neuralx_tracked_purchases";
const GOOGLE_ADS_PURCHASE_TRACKING_KEY = "neuralx_google_ads_purchases";
const MEASUREMENT_CONSENT_KEY = "neuralx_measurement_consent";
const GOOGLE_ADS_ID = "AW-10867942652";
const GOOGLE_ANALYTICS_ID = "G-JY83B1EM8L";
const GOOGLE_ADS_PURCHASE_DESTINATION =
  "AW-10867942652/-P1jCMGH0-YcEPzJnr4o";
const PAGE_VARIANT =
  document.body.dataset.pageVariant ||
  document.documentElement.dataset.pageVariant ||
  "default";
let pendingGoogleAdsPurchase = null;
const ATTRIBUTION_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const PRODUCTS = Object.freeze({
  "neural-x": {
    id: "neural-x",
    name: "Coleção Neural DSP",
    licenseType: "Licença digital vinculada ao computador",
    price: 29.9,
    paymentLink: "https://mpago.la/116GVoE",
    accessMode: "pending",
    image: "/assets/neural-dsp/archetype-john-mayer-x.png",
  },
  "fl-studio": {
    id: "fl-studio",
    name: "FL Studio 2026",
    edition: "2026",
    licenseType: "Licença digital vinculada ao computador",
    price: 19.9,
    paymentLink: "https://mpago.la/2vmYcir",
    accessMode: "pending",
    image: "/assets/product-fl-studio.jpg",
  },
  reaper: {
    id: "reaper",
    name: "REAPER 2026",
    edition: "2026",
    licenseType: "Licença digital vinculada ao computador",
    price: 19.9,
    paymentLink: "https://mpago.la/2GGbxw5",
    accessMode: "pending",
    image: "/assets/product-reaper.jpg",
  },
});

const HERO_CHOICES = Object.freeze({
  guitar: {
    productId: "neural-x",
    kicker: "Guitarra, baixo e voz",
    description:
      "23 plugins para construir timbres, gravar instrumentos e processar voz em Windows ou macOS.",
    image: "./assets/neural-dsp/archetype-john-mayer-x.png",
    imageAlt: "Interface do plugin Archetype: John Mayer X",
    productUrl: "./produto-neural-x.html",
    demoUrl: "./produto-neural-x.html#demonstracao",
    demoLabel: "Ouvir três timbres clean",
  },
  beats: {
    productId: "fl-studio",
    kicker: "Beats, composição e arranjo",
    description:
      "Um fluxo visual para transformar padrões, melodias e automações em músicas completas.",
    image: "./assets/product-fl-studio.jpg",
    imageAlt: "Interface do FL Studio com piano roll e instrumento aberto",
    productUrl: "./produto-fl-studio.html",
    demoUrl: "./produto-fl-studio.html",
    demoLabel: "Ver interface e fluxo de beatmaking",
  },
  recording: {
    productId: "reaper",
    kicker: "Gravação, edição e mixagem",
    description:
      "Uma estação leve e flexível para capturar, editar e mixar projetos multipista.",
    image: "./assets/product-reaper.jpg",
    imageAlt: "Interface do REAPER com arranjo multipista e mixer",
    productUrl: "./produto-reaper.html",
    demoUrl: "./produto-reaper.html",
    demoLabel: "Ver interface e fluxo de gravação",
  },
});

const RECOMMENDATIONS = Object.freeze({
  guitar: {
    productId: "neural-x",
    match: "Melhor ponto de partida para timbres",
    reason:
      "A Coleção Neural DSP reúne 23 plugins para guitarra, baixo e voz, com uma demonstração real para comparar timbres antes da compra.",
    url: "./produto-neural-x.html",
  },
  beats: {
    productId: "fl-studio",
    match: "Melhor ponto de partida para beatmaking",
    reason:
      "O FL Studio 2026 prioriza um fluxo visual para padrões, piano roll, arranjos e mixagem sem tirar a ideia do ritmo.",
    url: "./produto-fl-studio.html",
  },
  recording: {
    productId: "reaper",
    match: "Melhor ponto de partida para sessões multipista",
    reason:
      "O REAPER 2026 combina gravação, edição precisa, roteamento flexível e desempenho leve para home studio.",
    url: "./produto-reaper.html",
  },
  compare: {
    productId: null,
    name: "Comparação dos três produtos",
    match: "Você ainda está comparando o fluxo",
    reason:
      "Veja lado a lado objetivo, sistemas, diferencial e preço antes de escolher. Nenhum cadastro é necessário.",
    url: "./index.html#produtos",
  },
});

const money = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );

const safeUrl = (value, fallback = "") => {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    if (url.origin === window.location.origin || url.protocol === "https:")
      return url.href;
  } catch {}
  return fallback;
};

function initAnalytics() {
  window.va = window.va || function analyticsQueue() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  window.va("beforeSend", (event) => {
    try {
      const url = new URL(event.url);
      url.search = "";
      url.hash = "";
      return { ...event, url: url.href };
    } catch {
      return event;
    }
  });
  if (document.querySelector('script[src="/_vercel/insights/script.js"]')) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "/_vercel/insights/script.js";
  document.head.append(script);
}

function initGoogleConsentState() {
  if (window.__neuralxGoogleConsentInitialized) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function googleTagQueue() {
      window.dataLayer.push(arguments);
    };
  const granted = getMeasurementConsent() === "granted";
  window.gtag("consent", "default", {
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: granted ? "granted" : "denied",
    wait_for_update: 500,
  });
  window.__neuralxGoogleConsentInitialized = true;
}

function loadGoogleMeasurementTag() {
  initGoogleConsentState();
  if (getMeasurementConsent() !== "granted") return;
  if (window.__neuralxGoogleAdsLoaded) {
    window.gtag?.("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    return;
  }
  window.__neuralxGoogleAdsLoaded = true;
  window.gtag("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS_ID);
  window.gtag("config", GOOGLE_ANALYTICS_ID, { send_page_view: true });
  if (document.querySelector('script[data-google-ads-tag="true"]')) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.googleAdsTag = "true";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_ID)}`;
  document.head.append(script);
}

function getMeasurementConsent() {
  try {
    return localStorage.getItem(MEASUREMENT_CONSENT_KEY) || "";
  } catch {
    return "";
  }
}

function setMeasurementConsent(value) {
  try {
    localStorage.setItem(MEASUREMENT_CONSENT_KEY, value);
  } catch {}
}

function showMeasurementConsent() {
  if (document.querySelector("[data-measurement-consent]")) return;
  const panel = document.createElement("aside");
  panel.className = "measurement-consent";
  panel.dataset.measurementConsent = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Preferências de medição");
  panel.innerHTML = `
    <div><strong>Medição e anúncios</strong><p>Com sua permissão, usamos o Google Analytics para entender o funil e a tag do Google Ads para atribuir compras. Não enviamos seu e-mail ao Google.</p><a href="./privacy.html">Ver política de privacidade</a></div>
    <div class="measurement-consent-actions"><button class="button primary compact" type="button" data-measurement-accept>Aceitar medição</button><button class="button ghost compact" type="button" data-measurement-essential>Somente essenciais</button></div>`;
  panel.querySelector("[data-measurement-accept]")?.addEventListener("click", () => {
    setMeasurementConsent("granted");
    loadGoogleMeasurementTag();
    if (pendingGoogleAdsPurchase) {
      const { sessionId, data } = pendingGoogleAdsPurchase;
      trackGoogleAdsPurchaseOnce(sessionId, data);
    }
    panel.remove();
  });
  panel.querySelector("[data-measurement-essential]")?.addEventListener("click", () => {
    setMeasurementConsent("denied");
    pendingGoogleAdsPurchase = null;
    window.gtag?.("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    panel.remove();
  });
  document.body.append(panel);
}

function trackGoogleAdsPurchaseOnce(sessionId, data) {
  if (getMeasurementConsent() !== "granted") {
    pendingGoogleAdsPurchase = { sessionId, data };
    return;
  }
  try {
    const tracked = JSON.parse(
      localStorage.getItem(GOOGLE_ADS_PURCHASE_TRACKING_KEY) || "[]",
    );
    const sessions = Array.isArray(tracked)
      ? tracked.filter((value) => typeof value === "string")
      : [];
    if (sessions.includes(sessionId)) return;
    loadGoogleMeasurementTag();
    window.gtag("event", "conversion", {
      send_to: GOOGLE_ADS_PURCHASE_DESTINATION,
      value: Number(data.value || 0),
      currency: String(data.currency || "BRL").toUpperCase(),
      transaction_id: sessionId,
    });
    localStorage.setItem(
      GOOGLE_ADS_PURCHASE_TRACKING_KEY,
      JSON.stringify([...sessions.slice(-19), sessionId]),
    );
    pendingGoogleAdsPurchase = null;
  } catch {}
}

function initMeasurementConsent() {
  initGoogleConsentState();
  const consent = getMeasurementConsent();
  if (consent === "granted") loadGoogleMeasurementTag();
  else if (consent !== "denied") showMeasurementConsent();
  document
    .querySelector("[data-reset-measurement-consent]")
    ?.addEventListener("click", () => {
      try {
        localStorage.removeItem(MEASUREMENT_CONSENT_KEY);
      } catch {}
      window.gtag?.("consent", "update", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      });
      showMeasurementConsent();
    });
}

function trackEvent(name, data = {}) {
  try {
    const attribution = readAttribution();
    const safeData = Object.fromEntries(
      Object.entries({
        funnel_id: getFunnelId(),
        page_variant: PAGE_VARIANT,
        page_path: window.location.pathname,
        utm_source: attribution.utm_source || "direct",
        utm_medium: attribution.utm_medium || "none",
        utm_campaign: attribution.utm_campaign || "none",
        ...data,
      })
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
        .map(([key, value]) => [key.slice(0, 64), typeof value === "string" ? value.slice(0, 255) : value]),
    );
    window.va?.("event", { name: String(name).slice(0, 64), data: safeData });
    if (getMeasurementConsent() === "granted") {
      loadGoogleMeasurementTag();
      const items = Array.isArray(data.items)
        ? data.items.slice(0, 10).map((item) =>
            Object.fromEntries(
              Object.entries(item || {})
                .filter(([, value]) =>
                  ["string", "number", "boolean"].includes(typeof value),
                )
                .map(([key, value]) => [
                  key.slice(0, 64),
                  typeof value === "string" ? value.slice(0, 255) : value,
                ]),
            ),
          )
        : undefined;
      window.gtag?.("event", String(name).slice(0, 40), {
        ...safeData,
        ...(items?.length ? { items } : {}),
      });
    }
  } catch {}
}

function getFunnelId() {
  try {
    let value = sessionStorage.getItem(FUNNEL_ID_KEY) || "";
    if (!/^[A-Za-z0-9-]{16,64}$/.test(value)) {
      value = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      sessionStorage.setItem(FUNNEL_ID_KEY, value);
    }
    return value.slice(0, 64);
  } catch {
    return "session-unavailable";
  }
}

const externalReferrerPath = (value) => {
  try {
    const url = new URL(value);
    return url.origin === window.location.origin ? "" : `${url.origin}${url.pathname}`.slice(0, 400);
  } catch {
    return "";
  }
};

function captureAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const previous = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "{}");
    const campaign = {};
    ATTRIBUTION_FIELDS.forEach((field) => {
      const value = params.get(field)?.trim().slice(0, 120);
      if (value) campaign[field] = value;
    });
    const referrer = externalReferrerPath(document.referrer) || previous.referrer;
    const next = {
      ...previous,
      ...campaign,
      referrer: referrer || undefined,
      landing_page: previous.landing_page || window.location.pathname.slice(0, 400),
      first_seen_at: previous.first_seen_at || new Date().toISOString(),
    };
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {}
}

function readAttribution() {
  try {
    const value = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const readJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json().catch(() => ({}));
};

let catalogRequest;
function syncPublicCatalog() {
  catalogRequest ||= fetch("/api/catalog")
    .then(async (response) => {
      if (!response.ok) return;
      const data = await readJsonResponse(response);
      for (const item of data.products || []) {
        const product = PRODUCTS[item?.id];
        const unitAmount = Number(item?.unitAmount);
        if (!product || !Number.isInteger(unitAmount) || unitAmount < 1) continue;
        product.price = unitAmount / 100;
        product.edition = item.edition || product.edition || null;
        product.licenseType = item.licenseType || product.licenseType;
        product.accessMode = ["automatic", "request"].includes(item.accessMode)
          ? item.accessMode
          : "pending";
        document.querySelectorAll(`[data-product-price="${product.id}"]`).forEach((node) => {
          node.textContent = money(product.price);
        });
      }
      document.dispatchEvent(new CustomEvent("neuralx:catalog-ready"));
    })
    .catch(() => {});
  return catalogRequest;
}

function cartMetrics(cart = readCart()) {
  const cartValue = Number(
    cart.reduce((total, item) => total + PRODUCTS[item.id].price * item.quantity, 0).toFixed(2),
  );
  return {
    cart_value: cartValue,
    currency: "BRL",
    item_count: cart.reduce((total, item) => total + item.quantity, 0),
    product_ids: cart.map((item) => item.id).join(","),
    items: cart.map((item) => ({
      item_id: item.id,
      item_name: PRODUCTS[item.id].name,
      price: PRODUCTS[item.id].price,
      quantity: item.quantity,
    })),
  };
}

function checkoutMetrics(cart = readCart()) {
  const metrics = cartMetrics(cart);
  return { ...metrics, value: metrics.cart_value };
}

function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  const quantities = new Map();
  for (const item of value) {
    const product = PRODUCTS[item?.id];
    if (!product) continue;
    const quantity = Math.min(
      Math.max(Number.parseInt(item.quantity, 10) || 1, 1),
      10,
    );
    quantities.set(product.id, Math.min((quantities.get(product.id) || 0) + quantity, 10));
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

const readCart = () => {
  try {
    return normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
  } catch {
    localStorage.removeItem(CART_KEY);
    return [];
  }
};

const writeCart = (cart) => {
  const normalized = normalizeCart(cart);
  localStorage.setItem(CART_KEY, JSON.stringify(normalized));
  return normalized;
};

function showToast(message, state = "success") {
  let region = document.querySelector("#toastRegion");
  if (!region) {
    region = document.createElement("div");
    region.id = "toastRegion";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.state = state;
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

function updateCartCount() {
  const count = readCart().reduce((total, item) => total + item.quantity, 0);
  document.querySelectorAll("#cartCount, [data-cart-count]").forEach((node) => {
    node.textContent = String(count);
    node.setAttribute("aria-label", `${count} item${count === 1 ? "" : "s"} no carrinho`);
  });
}

function initNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("[data-mobile-nav]");
  if (!toggle || !nav) return;
  const mobileQuery = window.matchMedia("(max-width: 820px)");
  const setOpen = (open) => {
    const nextOpen = mobileQuery.matches && open;
    toggle.setAttribute("aria-expanded", String(nextOpen));
    toggle.setAttribute("aria-label", nextOpen ? "Fechar menu" : "Abrir menu");
    nav.dataset.open = String(nextOpen);
    nav.toggleAttribute("inert", mobileQuery.matches && !nextOpen);
  };
  const close = () => setOpen(false);

  close();
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setOpen(open);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  document.addEventListener("click", (event) => {
    if (
      toggle.getAttribute("aria-expanded") === "true"
      && !nav.contains(event.target)
      && !toggle.contains(event.target)
    ) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || toggle.getAttribute("aria-expanded") !== "true") return;
    close();
    toggle.focus();
  });
  window.addEventListener("resize", () => {
    close();
  });
}

function initPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Mostrar" : "Ocultar";
      button.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
    });
  });
}

function addToCart(productId) {
  const product = PRODUCTS[productId];
  if (!product) return;
  const cart = readCart();
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.quantity = Math.min(existing.quantity + 1, 10);
  else cart.push({ id: productId, quantity: 1 });
  const next = writeCart(cart);
  updateCartCount();
  showToast(`${product.name} foi adicionado ao carrinho.`);
  trackEvent("add_to_cart", {
    product_id: product.id,
    product_name: product.name,
    value: product.price,
    unit_value: product.price,
    currency: "BRL",
    quantity: 1,
    ...cartMetrics(next),
    items: [{
      item_id: product.id,
      item_name: product.name,
      price: product.price,
      quantity: 1,
    }],
  });
}

function initHeroSelector() {
  const buttons = [...document.querySelectorAll("[data-hero-choice]")];
  const image = document.querySelector("#heroProductImage");
  const kicker = document.querySelector("#heroProductKicker");
  const name = document.querySelector("#heroProductName");
  const price = document.querySelector("#heroProductPrice");
  const description = document.querySelector("#heroProductDescription");
  const productLink = document.querySelector("#heroProductLink");
  const demoLink = document.querySelector("#heroDemoLink");
  const addButton = document.querySelector("#heroAddButton");
  if (
    !buttons.length ||
    !image ||
    !kicker ||
    !name ||
    !price ||
    !description ||
    !productLink ||
    !demoLink ||
    !addButton
  )
    return;

  let activeChoice = "guitar";
  const render = (choice, shouldTrack = false) => {
    const content = HERO_CHOICES[choice];
    const product = content && PRODUCTS[content.productId];
    if (!content || !product) return;
    activeChoice = choice;
    buttons.forEach((button) => {
      button.setAttribute(
        "aria-selected",
        String(button.dataset.heroChoice === choice),
      );
    });
    image.src = content.image;
    image.alt = content.imageAlt;
    kicker.textContent = content.kicker;
    name.textContent = product.name;
    price.textContent = money(product.price);
    price.dataset.productPrice = product.id;
    description.textContent = content.description;
    productLink.href = content.productUrl;
    productLink.dataset.offerSelect = product.id;
    demoLink.href = content.demoUrl;
    demoLink.textContent = content.demoLabel;
    demoLink.dataset.offerSelect = product.id;
    addButton.dataset.id = product.id;
    if (shouldTrack) {
      trackEvent("select_hero_path", {
        objective: choice,
        product_id: product.id,
        product_name: product.name,
        value: product.price,
        currency: "BRL",
      });
    }
  };

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => render(button.dataset.heroChoice, true));
    button.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      next.focus();
      render(next.dataset.heroChoice, true);
    });
  });
  document.addEventListener("neuralx:catalog-ready", () => render(activeChoice));
  render(activeChoice);
}

function trackOfferSelection(productId, placement = "page") {
  const product = PRODUCTS[productId];
  if (!product) return;
  trackEvent("select_offer", {
    product_id: product.id,
    product_name: product.name,
    value: product.price,
    currency: "BRL",
    placement,
  });
}

function trackStorefrontViewOnce(entryPoint) {
  try {
    if (sessionStorage.getItem(STOREFRONT_VIEW_KEY)) return;
    sessionStorage.setItem(STOREFRONT_VIEW_KEY, "1");
  } catch {}
  trackEvent("storefront_view", {
    catalog_size: Object.keys(PRODUCTS).length,
    currency: "BRL",
    entry_point: entryPoint,
  });
}

function initProductButtons() {
  document.querySelectorAll(".add-cart").forEach((button) => {
    button.addEventListener("click", () => {
      trackOfferSelection(
        button.dataset.id,
        button.dataset.placement
          || (document.body.dataset.page === "store" ? "catalog_quick_add" : "product_page"),
      );
      addToCart(button.dataset.id);
      const original = button.dataset.originalLabel || button.textContent.trim();
      button.dataset.originalLabel = original;
      button.textContent = "Adicionado ✓";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1400);
    });
  });
}

function initFunnelInteractions() {
  const productId = document.body.dataset.productId;
  const product = PRODUCTS[productId];
  const contentId = document.body.dataset.contentId;
  if (document.body.dataset.page === "store" || product)
    trackStorefrontViewOnce(product ? "product" : "store");
  if (product) {
    trackEvent("view_item", {
      product_id: product.id,
      product_name: product.name,
      value: product.price,
      currency: "BRL",
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity: 1,
      }],
    });
  }
  if (contentId) {
    trackEvent("view_content", {
      content_id: contentId,
      content_type: document.body.dataset.contentType || "guide",
      page_path: window.location.pathname,
    });
  }
  document.addEventListener("click", (event) => {
    const offer = event.target.closest("[data-offer-select]");
    if (offer)
      trackOfferSelection(
        offer.dataset.offerSelect,
        offer.dataset.placement || "page",
      );
    const access = event.target.closest("[data-product-access]");
    if (access)
      trackEvent("access_product", { product_id: access.dataset.productAccess });
    const contentCta = event.target.closest("[data-content-cta]");
    if (contentCta) {
      trackEvent("select_content_cta", {
        content_id: contentId || contentCta.dataset.contentId || "unknown",
        destination: contentCta.dataset.contentCta || "unknown",
        product_id: contentCta.dataset.productId || "",
        placement: contentCta.dataset.placement || "content",
      });
    }
  });
  document.querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      trackEvent("faq_open", {
        question: details.querySelector("summary")?.textContent?.trim() || "",
      });
    });
  });
}

function initProductVideo() {
  document.querySelectorAll("[data-product-video]").forEach((video) => {
    const productId = video.dataset.productVideo || "unknown";
    let started = false;
    let halfway = false;
    let completed = false;

    video.addEventListener("play", () => {
      if (started) return;
      started = true;
      trackEvent("video_start", { product_id: productId });
    });

    video.addEventListener("timeupdate", () => {
      if (
        halfway ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.currentTime / video.duration < 0.5
      )
        return;
      halfway = true;
      trackEvent("video_half", { product_id: productId, progress: 50 });
    });

    video.addEventListener("ended", () => {
      if (completed) return;
      completed = true;
      trackEvent("video_complete", { product_id: productId, progress: 100 });
    });
  });
}

let csrfRequest;
async function fetchCsrf() {
  if (csrfRequest) return csrfRequest;
  csrfRequest = fetch("/api/csrf-token", { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) return null;
      return (await readJsonResponse(response)).csrfToken || null;
    })
    .catch(() => null);
  const token = await csrfRequest;
  if (!token) csrfRequest = null;
  return token;
}

let publicConfigRequest;
let recaptchaLoader;
function getPublicConfig() {
  publicConfigRequest ||= fetch("/api/public-config", { credentials: "include" })
    .then(readJsonResponse)
    .catch(() => ({}));
  return publicConfigRequest;
}

async function getRecaptchaToken(action) {
  const { recaptchaSiteKey } = await getPublicConfig();
  if (!recaptchaSiteKey) return "";
  recaptchaLoader ||= new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve(window.grecaptcha);
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error("captcha_load_error"));
    document.head.appendChild(script);
  });
  const grecaptcha = await recaptchaLoader;
  await new Promise((resolve) => grecaptcha.ready(resolve));
  return grecaptcha.execute(recaptchaSiteKey, { action });
}

async function postJson(url, body) {
  const csrfToken = await fetchCsrf();
  if (!csrfToken) throw new Error("session_store_not_ready");
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify(body),
  });
  return { response, data: await readJsonResponse(response) };
}

const checkoutErrorMessages = {
  csrf_error: "Sua sessão expirou. Atualize a página e tente novamente.",
  session_store_not_ready: "O serviço de sessão está iniciando. Tente novamente em instantes.",
  stripe_not_configured: "O pagamento está temporariamente indisponível.",
  stripe_catalog_invalid: "Os preços do checkout precisam ser sincronizados. Fale com o suporte.",
  stripe_price_not_found: "Um produto está com o preço desatualizado. Fale com o suporte.",
  stripe_authentication_error: "A conexão de pagamento precisa ser revisada.",
  mercado_pago_not_configured: "O Pix automático ainda está sendo configurado. Use a opção disponível ou tente novamente mais tarde.",
  mercado_pago_authentication_error: "A conexão com o Mercado Pago precisa ser revisada.",
  mercado_pago_error: "Não foi possível abrir o Mercado Pago agora. Tente novamente.",
  database_not_ready: "O registro de pedidos está iniciando. Tente novamente em instantes.",
  invalid_cart: "O carrinho contém um produto indisponível. Atualize-o e tente novamente.",
  invalid_cart_or_missing_price_ids: "O carrinho contém um produto indisponível. Atualize-o e tente novamente.",
};

function initCart() {
  const cartList = document.querySelector("#cartList");
  const cartTotal = document.querySelector("#cartTotal");
  if (!cartList || !cartTotal) return;
  const checkoutButton = document.querySelector("#checkoutButton");
  const clearButton = document.querySelector("#clearCart");
  const status = document.querySelector("#checkoutStatus");
  const fulfillmentNote = document.querySelector("#fulfillmentNote");
  const pixButton = document.querySelector("#pixCheckoutButton");
  const pixNote = document.querySelector("#pixCheckoutNote");
  let mercadoPagoCheckoutEnabled = false;
  void fetchCsrf();
  void getPublicConfig().then((config) => {
    mercadoPagoCheckoutEnabled = config.mercadoPagoCheckoutEnabled === true;
    render();
  });

  const render = () => {
    const cart = readCart();
    cartList.innerHTML = cart.length
      ? cart
          .map(({ id, quantity }) => {
            const product = PRODUCTS[id];
            return `<li class="cart-item" data-cart-item="${escapeHtml(id)}"><div class="cart-item-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(money(product.price))} por unidade</small><small>${escapeHtml(product.licenseType)}</small><button class="remove-item" type="button" data-cart-action="remove">Remover</button></div><div class="quantity-control" aria-label="Quantidade de ${escapeHtml(product.name)}"><button type="button" data-cart-action="decrease" aria-label="Diminuir quantidade">−</button><output>${quantity}</output><button type="button" data-cart-action="increase" aria-label="Aumentar quantidade">+</button></div><strong>${escapeHtml(money(product.price * quantity))}</strong></li>`;
          })
          .join("")
      : `<li class="empty-cart"><div class="cart-item-copy"><strong>Seu carrinho está vazio.</strong><small>Escolha uma ferramenta para começar.</small></div><a class="button primary" href="./index.html#produtos">Ver produtos</a></li>`;
    cartTotal.textContent = money(
      cart.reduce((total, item) => total + PRODUCTS[item.id].price * item.quantity, 0),
    );
    if (checkoutButton) checkoutButton.disabled = cart.length === 0;
    if (clearButton) clearButton.disabled = cart.length === 0;
    const pixItem = cart.length === 1 && cart[0].quantity === 1 ? cart[0] : null;
    const pixProduct = pixItem ? PRODUCTS[pixItem.id] : null;
    const manualPixUrl = safeUrl(pixProduct?.paymentLink);
    const automaticPixAvailable = mercadoPagoCheckoutEnabled && cart.length > 0;
    if (pixButton) {
      pixButton.hidden = !automaticPixAvailable && !manualPixUrl;
      if (automaticPixAvailable) {
        pixButton.href = "#";
        pixButton.removeAttribute("target");
        pixButton.dataset.checkoutMode = "api";
        delete pixButton.dataset.productId;
        pixButton.setAttribute("aria-label", "Pagar o carrinho com Pix no Mercado Pago");
      } else if (manualPixUrl) {
        pixButton.href = manualPixUrl;
        pixButton.target = "_blank";
        pixButton.dataset.checkoutMode = "manual";
        pixButton.dataset.productId = pixProduct.id;
        pixButton.setAttribute("aria-label", `Pagar ${pixProduct.name} com Pix no Mercado Pago`);
      } else {
        pixButton.removeAttribute("href");
        delete pixButton.dataset.checkoutMode;
        delete pixButton.dataset.productId;
      }
    }
    if (pixNote) {
      pixNote.hidden = cart.length === 0;
      pixNote.textContent = automaticPixAvailable
        ? "O Pix abre no Mercado Pago. A aprovação é confirmada automaticamente e o pedido aparece na mesma área de cliente usada pelas compras na Stripe."
        : manualPixUrl
          ? "O Pix abre no Mercado Pago. Após pagar, guarde o comprovante; a confirmação e a liberação são conferidas manualmente em até 4 horas."
          : "Para pagar por Pix, deixe apenas uma unidade de um produto no carrinho. A Stripe continua disponível para o carrinho completo.";
    }
    if (fulfillmentNote) {
      fulfillmentNote.textContent =
        "O link de download e as instruções de ativação serão enviados ao e-mail da compra em até 4 horas.";
    }
  };

  cartList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-cart-action]");
    const itemNode = event.target.closest("[data-cart-item]");
    if (!actionButton || !itemNode) return;
    const id = itemNode.dataset.cartItem;
    const cart = readCart();
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    const action = actionButton.dataset.cartAction;
    if (actionButton.dataset.cartAction === "increase") item.quantity = Math.min(item.quantity + 1, 10);
    if (actionButton.dataset.cartAction === "decrease") item.quantity -= 1;
    const next = actionButton.dataset.cartAction === "remove" || item.quantity < 1
      ? cart.filter((entry) => entry.id !== id)
      : cart;
    writeCart(next);
    updateCartCount();
    render();
    const product = PRODUCTS[id];
    trackEvent(action === "increase" ? "add_to_cart" : "remove_from_cart", {
      product_id: id,
      product_name: product.name,
      unit_value: product.price,
      value: product.price,
      quantity: 1,
      action,
      ...cartMetrics(next),
    });
  });

  clearButton?.addEventListener("click", () => {
    const previous = readCart();
    writeCart([]);
    updateCartCount();
    render();
    showToast("Carrinho limpo.");
    trackEvent("remove_from_cart", { action: "clear", ...cartMetrics(previous) });
  });

  pixButton?.addEventListener("click", async (event) => {
    if (pixButton.getAttribute("aria-disabled") === "true")
      return event.preventDefault();
    const cart = readCart();
    if (!cart.length) return event.preventDefault();
    if (pixButton.dataset.checkoutMode === "api") {
      event.preventDefault();
      const originalLabel = pixButton.textContent;
      try {
        trackEvent("begin_checkout", {
          ...checkoutMetrics(cart),
          payment_provider: "mercado_pago",
          payment_method: "pix",
        });
        pixButton.setAttribute("aria-disabled", "true");
        pixButton.classList.add("is-loading");
        pixButton.textContent = "Abrindo Mercado Pago…";
        if (checkoutButton) checkoutButton.disabled = true;
        if (clearButton) clearButton.disabled = true;
        if (status) status.textContent = "Conectando com o Mercado Pago.";
        const { response, data } = await postJson(
          "/api/create-mercado-pago-checkout",
          { cart, attribution: readAttribution() },
        );
        if (!response.ok || !safeUrl(data.url))
          throw new Error(data.error || "mercado_pago_error");
        trackEvent("checkout_created", {
          ...checkoutMetrics(cart),
          payment_provider: "mercado_pago",
          payment_method: "pix",
        });
        window.location.assign(data.url);
      } catch (error) {
        trackEvent("checkout_error", {
          ...checkoutMetrics(cart),
          payment_provider: "mercado_pago",
          payment_method: "pix",
          error_code: String(error.message || "mercado_pago_error").slice(0, 80),
        });
        const message =
          checkoutErrorMessages[error.message] ||
          "Não foi possível abrir o Mercado Pago agora. Tente novamente.";
        showToast(message, "error");
        if (status) status.textContent = message;
        pixButton.removeAttribute("aria-disabled");
        pixButton.classList.remove("is-loading");
        pixButton.textContent = originalLabel;
        if (checkoutButton) checkoutButton.disabled = false;
        if (clearButton) clearButton.disabled = false;
      }
      return;
    }
    const product = PRODUCTS[pixButton.dataset.productId];
    if (!product || cart.length !== 1 || cart[0].id !== product.id || cart[0].quantity !== 1)
      return event.preventDefault();
    trackEvent("begin_checkout", {
      ...checkoutMetrics(cart),
      payment_provider: "mercado_pago",
      payment_method: "pix",
      product_id: product.id,
    });
    if (status) status.textContent = "Abrindo o Pix no Mercado Pago em uma nova aba.";
  });

  checkoutButton?.addEventListener("click", async () => {
    const cart = readCart();
    if (!cart.length) return;
    const label = checkoutButton.querySelector(".checkout-button-label");
    try {
      trackEvent("begin_checkout", {
        ...checkoutMetrics(cart),
        payment_provider: "stripe",
        payment_method: "dynamic",
      });
      checkoutButton.disabled = true;
      checkoutButton.classList.add("is-loading");
      if (label) label.textContent = "Abrindo checkout…";
      if (clearButton) clearButton.disabled = true;
      if (status) status.textContent = "Conectando com a Stripe.";
      const { response, data } = await postJson("/api/create-checkout-session", {
        cart,
        attribution: readAttribution(),
      });
      if (!response.ok || !data.url) throw new Error(data.error || "checkout_error");
      trackEvent("checkout_created", {
        ...checkoutMetrics(cart),
        payment_provider: "stripe",
        payment_method: "dynamic",
      });
      window.location.assign(data.url);
    } catch (error) {
      trackEvent("checkout_error", {
        ...checkoutMetrics(cart),
        payment_provider: "stripe",
        payment_method: "dynamic",
        error_code: String(error.message || "stripe_error").slice(0, 80),
      });
      const message = checkoutErrorMessages[error.message] || "Não foi possível abrir o checkout agora. Tente novamente.";
      showToast(message, "error");
      if (status) status.textContent = message;
      checkoutButton.disabled = false;
      checkoutButton.classList.remove("is-loading");
      if (label) label.textContent = "Finalizar na Stripe";
      if (clearButton) clearButton.disabled = false;
    }
  });

  if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
    status.textContent = "Pagamento cancelado. Seu carrinho continua salvo.";
    trackEvent("checkout_cancelled", {
      ...checkoutMetrics(readCart()),
      payment_provider: "stripe",
    });
  }
  render();
  trackEvent("view_cart", cartMetrics());
  document.addEventListener("neuralx:catalog-ready", render, { once: true });
}

const authMessages = {
  missing_fields: "Preencha todos os campos obrigatórios.",
  invalid_credentials: "E-mail ou senha incorretos.",
  account_locked: "Conta temporariamente bloqueada após várias tentativas. Tente mais tarde.",
  captcha_failed: "Não foi possível validar a segurança. Atualize a página e tente novamente.",
  email_taken: "Já existe uma conta com este e-mail. Tente entrar.",
  invalid_credentials_format: "Confira o nome e o e-mail informados.",
  weak_password: "Use pelo menos 8 caracteres com maiúscula, minúscula, número e símbolo.",
  database_not_ready: "Estamos restabelecendo a conexão. Aguarde alguns segundos e tente novamente.",
  session_store_not_ready: "Estamos restabelecendo a sessão. Aguarde alguns segundos e tente novamente.",
  terms_required: "Você precisa aceitar os termos e a política de privacidade.",
  mfa_failed: "Código de verificação inválido.",
};

function initLogin() {
  const form = document.querySelector("#loginForm");
  if (!form) return;
  const message = document.querySelector("#loginMessage");
  const submit = form.querySelector('button[type="submit"]');
  const mfaField = document.querySelector("#mfaField");
  const mfaInput = document.querySelector("#mfaToken");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    message.dataset.state = "";
    if (!form.reportValidity()) return;
    try {
      submit.disabled = true;
      submit.textContent = "Verificando…";
      const captcha = await getRecaptchaToken("login");
      const { response, data } = await postJson(`/api/login/${form.dataset.role}`, {
        email: form.email.value.trim(),
        password: form.password.value,
        captcha,
        mfa_token: mfaInput?.value || "",
      });
      if (data.error === "mfa_required") {
        mfaField.hidden = false;
        mfaInput.required = true;
        mfaInput.focus();
        message.textContent = "Digite o código do seu aplicativo autenticador.";
        return;
      }
      if (!response.ok) throw new Error(data.error || "login_error");
      window.location.assign("./client-dashboard.html");
    } catch (error) {
      message.textContent = authMessages[error.message] || "Não foi possível entrar agora. Tente novamente.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Entrar na conta";
    }
  });
}

function isStrongPassword(value) {
  return (
    value.length >= 8 &&
    value.length <= 128 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function initRegistration() {
  const form = document.querySelector("#registerForm");
  if (!form) return;
  const message = document.querySelector("#registerMessage");
  const submit = form.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    message.dataset.state = "";
    if (!form.reportValidity()) return;
    if (form.password.value !== form.confirmPassword.value) {
      message.textContent = "As senhas não coincidem.";
      message.dataset.state = "error";
      return;
    }
    if (!isStrongPassword(form.password.value)) {
      message.textContent = authMessages.weak_password;
      message.dataset.state = "error";
      return;
    }
    try {
      submit.disabled = true;
      submit.textContent = "Criando conta…";
      const fields = form.elements;
      const captcha = await getRecaptchaToken("register");
      const { response, data } = await postJson("/api/register", {
        name: fields.namedItem("name").value.trim(),
        email: fields.namedItem("email").value.trim(),
        password: fields.namedItem("password").value,
        acceptTerms: fields.namedItem("acceptTerms").checked,
        captcha,
      });
      if (!response.ok) throw new Error(data.error || "registration_error");
      message.textContent = "Conta criada. Redirecionando para o login…";
      message.dataset.state = "success";
      window.setTimeout(() => {
        window.location.assign(`./client-login.html?email=${encodeURIComponent(fields.namedItem("email").value.trim())}`);
      }, 900);
    } catch (error) {
      message.textContent = authMessages[error.message] || "Não foi possível criar sua conta agora.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Criar minha conta";
    }
  });
}

function initSupportForm() {
  const form = document.querySelector("#supportForm");
  if (!form) return;
  const status = document.querySelector("#supportMessageStatus");
  const submit = form.querySelector('button[type="submit"]');
  const subject = new URLSearchParams(window.location.search).get("assunto");
  const subjectMap = { acesso: "access", privacidade: "privacy", pagamento: "payment", pedido: "order" };
  if (subjectMap[subject]) form.category.value = subjectMap[subject];
  void fetchCsrf();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    status.dataset.state = "";
    if (!form.reportValidity()) return;
    try {
      submit.disabled = true;
      submit.textContent = "Enviando…";
      const fields = form.elements;
      const captcha = await getRecaptchaToken("support");
      const { response, data } = await postJson("/api/support", {
        name: fields.namedItem("name").value.trim(),
        email: fields.namedItem("email").value.trim(),
        category: fields.namedItem("category").value,
        orderReference: fields.namedItem("orderReference").value.trim(),
        message: fields.namedItem("message").value.trim(),
        privacyConsent: fields.namedItem("privacyConsent").checked,
        captcha,
      });
      if (!response.ok) throw new Error(data.error || "support_error");
      status.textContent = `Chamado #${data.ticketId} enviado. Guarde este número para acompanhamento.`;
      status.dataset.state = "success";
      form.reset();
    } catch (error) {
      const messages = {
        invalid_support_request: "Confira os campos e tente novamente.",
        captcha_failed: authMessages.captcha_failed,
        database_not_ready: "Estamos restabelecendo a conexão. Seu texto foi mantido; aguarde alguns segundos e envie novamente.",
        session_store_not_ready: authMessages.session_store_not_ready,
      };
      status.textContent = messages[error.message] || "Não foi possível enviar seu chamado agora.";
      status.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar chamado";
    }
  });
}

function initRecommendation() {
  const form = document.querySelector("#recommendationForm");
  const result = document.querySelector("#recommendationResult");
  const match = document.querySelector("#recommendationMatch");
  const name = document.querySelector("#recommendationName");
  const reason = document.querySelector("#recommendationReason");
  const link = document.querySelector("#recommendationLink");
  const changeButton = document.querySelector("#changeRecommendation");
  const emailToggle = document.querySelector("#showRecommendationEmail");
  const leadForm = document.querySelector("#leadForm");
  const leadInterest = document.querySelector("#leadInterest");
  if (
    !form ||
    !result ||
    !match ||
    !name ||
    !reason ||
    !link ||
    !changeButton ||
    !emailToggle ||
    !leadForm ||
    !leadInterest
  )
    return;

  let activeRecommendation = null;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const interest = new FormData(form).get("recommendationInterest");
    const recommendation = RECOMMENDATIONS[interest];
    if (!recommendation) return;
    const product = recommendation.productId
      ? PRODUCTS[recommendation.productId]
      : null;
    activeRecommendation = recommendation;
    match.textContent = recommendation.match;
    name.textContent = product?.name || recommendation.name;
    reason.textContent = recommendation.reason;
    link.href = recommendation.url;
    link.textContent = product ? "Conhecer produto" : "Comparar agora";
    leadInterest.value = interest;
    form.hidden = true;
    result.hidden = false;
    leadForm.hidden = true;
    emailToggle.hidden = false;
    trackEvent("view_recommendation", {
      interest,
      recommended_product: product?.id || "compare",
    });
    name.focus?.();
  });

  link.addEventListener("click", () => {
    if (activeRecommendation?.productId)
      trackOfferSelection(activeRecommendation.productId, "recommendation");
  });
  emailToggle.addEventListener("click", () => {
    leadForm.hidden = false;
    emailToggle.hidden = true;
    document.querySelector("#leadName")?.focus();
  });
  changeButton.addEventListener("click", () => {
    result.hidden = true;
    leadForm.hidden = true;
    emailToggle.hidden = false;
    form.hidden = false;
    form.querySelector('input[name="recommendationInterest"]:checked')?.focus();
  });
}

function initLeadForm() {
  const form = document.querySelector("#leadForm");
  if (!form) return;
  const message = document.querySelector("#leadMessage");
  const submit = form.querySelector('button[type="submit"]');
  void fetchCsrf();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.replaceChildren();
    message.dataset.state = "";
    if (!form.reportValidity()) return;
    const fields = form.elements;
    const interest = fields.namedItem("interest").value;
    try {
      submit.disabled = true;
      submit.textContent = "Enviando recomendação…";
      const captcha = await getRecaptchaToken("lead");
      const { response, data } = await postJson("/api/leads", {
        name: fields.namedItem("name").value.trim(),
        email: fields.namedItem("email").value.trim(),
        interest,
        marketingConsent: fields.namedItem("marketingConsent").checked,
        attribution: readAttribution(),
        captcha,
      });
      if (!response.ok) throw new Error(data.error || "lead_error");
      message.textContent = data.emailSent
        ? "Recomendação enviada. Confira sua caixa de entrada."
        : "Preferência registrada, mas o e-mail não pôde ser enviado agora. Sua recomendação continua disponível acima.";
      message.dataset.state = data.emailSent ? "success" : "error";
      trackEvent("generate_lead", {
        interest,
        recommended_product: data.recommendation?.id || "compare",
      });
      form.reset();
      fields.namedItem("interest").value = interest;
    } catch (error) {
      message.textContent = error.message === "invalid_lead"
        ? "Confira seu nome, e-mail e o consentimento de comunicação."
        : error.message === "captcha_failed"
          ? authMessages.captcha_failed
          : "Não foi possível registrar seu interesse agora. Tente novamente.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar recomendação por e-mail";
    }
  });
}

function initials(nameOrEmail) {
  return (
    String(nameOrEmail || "NX")
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "NX"
  );
}

function initDashboard() {
  if (!document.querySelector(".dashboard-page")) return;
  const profileForm = document.querySelector("#profileForm");
  const profileName = document.querySelector("#profileName");
  const profileEmail = document.querySelector("#profileEmail");
  const profileMessage = document.querySelector("#profileMessage");
  const avatarPreview = document.querySelector("#avatarPreview");
  const ordersList = document.querySelector("#ordersList");
  const ticketList = document.querySelector("#ticketList");
  const welcomeName = document.querySelector("#welcomeName");
  const productCount = document.querySelector("#productCount");
  const ticketCount = document.querySelector("#ticketCount");
  const securityStatus = document.querySelector("#securityStatus");

  const setAvatar = (user) => {
    avatarPreview.textContent = initials(user.name || user.email);
  };

  const loadAccount = async () => {
    try {
      const response = await fetch("/api/me", { credentials: "include" });
      if (!response.ok) throw new Error("unauthorized");
      const data = await readJsonResponse(response);
      if (data.user?.role !== "client") throw new Error("invalid_role");
      profileName.value = data.user.name || "";
      profileEmail.value = data.user.email || "";
      welcomeName.textContent = (data.user.name || data.user.email).split(/\s+|@/)[0];
      securityStatus.textContent = data.user.mfaEnabled ? "MFA ativado" : "MFA disponível";
      const mfaButton = document.querySelector("#mfaSetup");
      const mfaDescription = document.querySelector("#mfaDescription");
      const mfaDisable = document.querySelector("#mfaDisable");
      if (data.user.mfaEnabled) {
        mfaButton.hidden = true;
        mfaDisable.hidden = false;
        mfaDescription.textContent = "A verificação em duas etapas está ativa nesta conta.";
      } else {
        mfaButton.hidden = false;
        mfaDisable.hidden = true;
        mfaDescription.textContent = "Adicione uma segunda etapa de verificação ao login.";
      }
      setAvatar(data.user);
      return data.user;
    } catch {
      window.location.replace("./client-login.html");
      return null;
    }
  };

  const loadOrders = async () => {
    try {
      const response = await fetch("/api/orders", { credentials: "include" });
      if (!response.ok) throw new Error("orders_error");
      const orders = await readJsonResponse(response);
      productCount.textContent = String(
        orders.filter((order) => order.access_mode !== "revoked").length,
      );
      ordersList.innerHTML = orders.length
        ? orders
            .map((order) => {
              const fallback = Object.values(PRODUCTS).find((item) => item.name === order.product)?.image || PRODUCTS["neural-x"].image;
              const image = safeUrl(order.image, new URL(fallback, window.location.href).href);
              const download = safeUrl(order.download_url);
              const date = order.created_at ? new Date(order.created_at).toLocaleDateString("pt-BR") : "";
              const accessLabel = order.access_mode === "request"
                ? "Abrir link de download"
                : "Acessar produto";
              const unavailableMessage = order.access_mode === "revoked"
                ? '<small>O acesso deste pedido não está ativo. Se você não reconhece esse estado, <a class="inline-link" href="./contact.html?assunto=pedido">fale com o suporte</a>.</small>'
                : '<small>O link de download será enviado ao e-mail da compra em até 4 horas. Se o prazo terminar, <a class="inline-link" href="./contact.html?assunto=pedido">fale com o suporte</a>.</small>';
              return `<article class="order-card"><img src="${escapeHtml(image)}" alt="${escapeHtml(order.product || "Produto")}" /><div class="order-details"><span class="status-badge">${escapeHtml(order.status || "Processando")}</span><h3>${escapeHtml(order.product || "Produto digital")}</h3><p>${date ? `Pedido de ${escapeHtml(date)} · ` : ""}${escapeHtml(money(Number(order.price)))}</p>${download ? `<a class="button primary compact" href="${escapeHtml(download)}" data-product-access="${escapeHtml(order.product_id || "unknown")}" rel="noopener" target="_blank">${accessLabel}</a>${order.access_mode === "request" ? "<small>Se o Drive pedir identificação, use o mesmo e-mail informado na compra.</small>" : ""}` : unavailableMessage}</div></article>`;
            })
            .join("")
        : '<div class="empty-state">Nenhuma compra vinculada a este e-mail. Se você já pagou, confirme se sua conta usa o mesmo endereço do checkout.</div>';
    } catch {
      ordersList.innerHTML = '<div class="empty-state">Não foi possível carregar sua biblioteca agora.</div>';
    }
  };

  const loadTickets = async () => {
    try {
      const response = await fetch("/api/support-tickets", { credentials: "include" });
      if (!response.ok) throw new Error("tickets_error");
      const tickets = await readJsonResponse(response);
      ticketCount.textContent = String(tickets.length);
      ticketList.innerHTML = tickets.length
        ? tickets
            .map((ticket) => `<article class="ticket-card"><header><strong>Chamado #${escapeHtml(ticket.id)}</strong><span class="status-badge">${escapeHtml(ticket.status)}</span></header><p>${escapeHtml(ticket.subject)}</p><small>${escapeHtml(new Date(ticket.created_at).toLocaleDateString("pt-BR"))}</small></article>`)
            .join("")
        : '<div class="empty-state">Você ainda não abriu chamados.</div>';
    } catch {
      ticketList.innerHTML = '<div class="empty-state">Não foi possível carregar seus chamados.</div>';
    }
  };

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveButton = profileForm.querySelector('button[type="submit"]');
    try {
      saveButton.disabled = true;
      saveButton.textContent = "Salvando…";
      const { response, data } = await postJson("/api/profile", { name: profileName.value.trim() });
      if (!response.ok) throw new Error(data.error || "profile_error");
      setAvatar(data.user);
      welcomeName.textContent = (data.user.name || data.user.email).split(/\s+|@/)[0];
      profileMessage.textContent = "Perfil atualizado.";
      profileMessage.dataset.state = "success";
    } catch (error) {
      profileMessage.textContent = "Não foi possível salvar o perfil.";
      profileMessage.dataset.state = "error";
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Salvar perfil";
    }
  });

  document.querySelector("#mfaSetup")?.addEventListener("click", async (event) => {
    const message = document.querySelector("#mfaMessage");
    try {
      event.currentTarget.disabled = true;
      const { response, data } = await postJson("/api/mfa/setup", {});
      if (!response.ok) throw new Error(data.error || "mfa_setup_error");
      document.querySelector("#mfaQr").src = data.qr;
      document.querySelector("#mfaEnrollment").hidden = false;
      document.querySelector("#mfaVerifyToken").focus();
    } catch {
      message.textContent = "Não foi possível iniciar a configuração agora.";
      message.dataset.state = "error";
      event.currentTarget.disabled = false;
    }
  });

  document.querySelector("#mfaVerify")?.addEventListener("click", async () => {
    const token = document.querySelector("#mfaVerifyToken").value.trim();
    const message = document.querySelector("#mfaMessage");
    try {
      if (!/^\d{6}$/.test(token)) throw new Error("mfa_failed");
      const { response, data } = await postJson("/api/mfa/verify", { token });
      if (!response.ok) throw new Error(data.error || "mfa_failed");
      message.textContent = "Verificação em duas etapas ativada.";
      message.dataset.state = "success";
      document.querySelector("#mfaEnrollment").hidden = true;
      document.querySelector("#mfaSetup").hidden = true;
      document.querySelector("#mfaDisable").hidden = false;
      securityStatus.textContent = "MFA ativado";
    } catch {
      message.textContent = "Código inválido. Confira o autenticador e tente novamente.";
      message.dataset.state = "error";
    }
  });

  document.querySelector("#mfaDisable")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector("#mfaMessage");
    const submit = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    try {
      submit.disabled = true;
      const { response, data } = await postJson("/api/mfa/disable", {
        currentPassword: form.currentPassword.value,
        token: form.token.value.trim(),
      });
      if (!response.ok) throw new Error(data.error || "mfa_disable_failed");
      if (data.csrfToken) csrfRequest = Promise.resolve(data.csrfToken);
      form.reset();
      form.hidden = true;
      document.querySelector("#mfaSetup").hidden = false;
      document.querySelector("#mfaDescription").textContent =
        "Adicione uma segunda etapa de verificação ao login.";
      securityStatus.textContent = "MFA disponível";
      message.textContent = "Verificação em duas etapas desativada.";
      message.dataset.state = "success";
    } catch (error) {
      message.textContent = error.message === "invalid_current_password"
        ? "A senha atual está incorreta."
        : error.message === "mfa_failed"
          ? "O código do autenticador é inválido."
          : "Não foi possível desativar a verificação em duas etapas.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector("#passwordMessage");
    const submit = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    if (!isStrongPassword(form.newPassword.value)) {
      message.textContent = authMessages.weak_password;
      message.dataset.state = "error";
      return;
    }
    try {
      submit.disabled = true;
      const { response, data } = await postJson("/api/account/password", { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value });
      if (!response.ok) throw new Error(data.error || "password_error");
      if (data.csrfToken) csrfRequest = Promise.resolve(data.csrfToken);
      form.reset();
      message.textContent = "Senha atualizada com sucesso.";
      message.dataset.state = "success";
    } catch (error) {
      message.textContent = error.message === "invalid_current_password" ? "A senha atual está incorreta." : "Não foi possível atualizar a senha.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#logout")?.addEventListener("click", async () => {
    await postJson("/api/logout", {}).catch(() => {});
    window.location.replace("./client-login.html");
  });

  loadAccount().then((user) => {
    if (user) Promise.all([loadOrders(), loadTickets()]);
  });
}

function trackPurchaseOnce(sessionId, data) {
  const purchaseData = { ...data, transaction_id: sessionId };
  try {
    const tracked = JSON.parse(localStorage.getItem(PURCHASE_TRACKING_KEY) || "[]");
    const sessions = Array.isArray(tracked) ? tracked.filter((value) => typeof value === "string") : [];
    if (!sessions.includes(sessionId)) {
      trackEvent("purchase", purchaseData);
      localStorage.setItem(
        PURCHASE_TRACKING_KEY,
        JSON.stringify([...sessions.slice(-19), sessionId]),
      );
    }
  } catch {
    trackEvent("purchase", purchaseData);
  }
  trackGoogleAdsPurchaseOnce(sessionId, purchaseData);
}

function renderConfirmedAccess(products) {
  const section = document.querySelector("#confirmedAccess");
  const list = document.querySelector("#confirmedAccessList");
  if (!section || !list) return;
  list.replaceChildren();
  for (const product of products || []) {
    let url;
    try {
      url = new URL(product.accessUrl);
      if (url.protocol !== "https:" || url.username || url.password) continue;
    } catch {
      continue;
    }
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = product.name || "Produto adquirido";
    const link = document.createElement("a");
    link.className = "button primary";
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.productAccess = product.id || "";
    link.textContent = product.accessMode === "request"
      ? "Solicitar acesso ao produto"
      : url.hostname === "drive.google.com"
        ? "Abrir no Google Drive"
        : "Acessar produto";
    item.append(name, link);
    list.append(item);
  }
  section.hidden = list.children.length === 0;
}

function initCheckoutSuccess() {
  const card = document.querySelector("[data-checkout-success]");
  if (!card) return;
  const title = document.querySelector("#successTitle");
  const message = document.querySelector("#successMessage");
  const icon = document.querySelector("#successIcon");
  const retry = document.querySelector("#retryConfirmation");
  let attempts = 0;
  let retryTimer;
  const params = new URLSearchParams(window.location.search);
  const isMercadoPago = params.get("provider") === "mercado_pago";
  const sessionId = params.get("session_id");
  const paymentId = params.get("payment_id") || params.get("collection_id");
  const externalReference = params.get("external_reference");
  const providerName = isMercadoPago ? "Mercado Pago" : "Stripe";
  const transactionId = isMercadoPago
    ? `mercado_pago:${paymentId || "missing"}`
    : sessionId;
  const fail = () => {
    icon.textContent = "!";
    title.textContent = "Não foi possível confirmar.";
    message.textContent = `Não faça outro pagamento. Tente verificar novamente ou consulte o ${providerName}.`;
    card.dataset.state = "error";
    if (retry) retry.hidden = false;
  };
  if (
    (isMercadoPago && (!paymentId || !externalReference)) ||
    (!isMercadoPago && !sessionId)
  ) {
    fail();
    if (retry) retry.hidden = true;
    return;
  }
  const lookupUrl = isMercadoPago
    ? `/api/mercado-pago-payment?payment_id=${encodeURIComponent(paymentId)}&external_reference=${encodeURIComponent(externalReference)}`
    : `/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`;
  const confirmPayment = () => {
    attempts += 1;
    if (retry) retry.hidden = true;
    return fetch(lookupUrl, { credentials: "include", cache: "no-store" })
    .then(async (response) => ({ response, data: await readJsonResponse(response) }))
    .then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || "session_lookup_error");
      if (data.paymentStatus === "paid") {
        writeCart([]);
        updateCartCount();
        trackPurchaseOnce(transactionId, {
          value: Number(data.amountTotal || 0) / 100,
          currency: String(data.currency || "brl").toUpperCase(),
          item_count: (data.products || []).reduce(
            (total, item) => total + (Number(item.quantity) || 1),
            0,
          ),
          product_ids: (data.products || [])
            .map((item) => item.id)
            .filter(Boolean)
            .join(","),
          items: (data.products || [])
            .filter((item) => item?.id)
            .map((item) => ({
              item_id: item.id,
              item_name: item.name || PRODUCTS[item.id]?.name || item.id,
              price: PRODUCTS[item.id]?.price,
              quantity: Number(item.quantity) || 1,
            })),
          fulfillment: data.fulfillment || "unknown",
          payment_provider: isMercadoPago ? "mercado_pago" : "stripe",
        });
        icon.textContent = "✓";
        title.textContent = "Pagamento confirmado.";
        renderConfirmedAccess(data.products);
        const items = data.products?.map((item) => item.name).filter(Boolean).join(", ");
        if (data.fulfillment === "ready") {
          message.textContent = items
            ? `${items}: acesse pelos links abaixo. Seus produtos também ficam na área do cliente, usando o e-mail da compra.`
            : "Seu acesso foi liberado. Use os links abaixo ou entre na área do cliente com o e-mail da compra.";
        } else if (data.fulfillment === "request_required") {
          message.textContent = "Seu pedido foi registrado. Abra o link abaixo para solicitar acesso com o e-mail da compra. A liberação e as instruções de ativação seguem o prazo de até 4 horas.";
        } else if (data.fulfillment === "recorded_pending_access") {
          message.textContent = "Seu pedido foi registrado. O link de download e as instruções de ativação serão enviados ao e-mail da compra em até 4 horas.";
        } else {
          message.textContent = "Seu pagamento foi aprovado e a confirmação do pedido está em andamento. Se ele não aparecer na conta em alguns minutos, abra um chamado.";
        }
        card.dataset.state = "success";
        if (data.fulfillment === "pending") scheduleRetry();
      } else if (data.paymentStatus === "pending" ||
        (data.paymentStatus === "unpaid" && data.status === "complete")) {
        icon.textContent = "…";
        title.textContent = "Pagamento em processamento.";
        message.textContent = `O ${providerName} ainda está processando o pagamento. Vamos consultar novamente; não é necessário pagar outra vez.`;
        card.dataset.state = "pending";
        scheduleRetry();
      } else {
        icon.textContent = "!";
        title.textContent = "Pagamento não aprovado.";
        message.textContent = `O ${providerName} não informa um pagamento aprovado para este pedido. Volte ao carrinho ou fale com o suporte se houve cobrança.`;
        card.dataset.state = "error";
      }
    })
    .catch(fail);
  };
  function scheduleRetry() {
    if (attempts < 3) retryTimer = window.setTimeout(confirmPayment, 2500);
    else if (retry) retry.hidden = false;
  }
  retry?.addEventListener("click", () => {
    window.clearTimeout(retryTimer);
    attempts = 0;
    void confirmPayment();
  });
  void confirmPayment();
}

function applyQueryPrefill() {
  const email = new URLSearchParams(window.location.search).get("email");
  const emailInput = document.querySelector("#email");
  if (email && emailInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput.value = email.slice(0, 254);
    document.querySelector("#password")?.focus();
  }
}

initAnalytics();
initMeasurementConsent();
captureAttribution();
void syncPublicCatalog();
initNavigation();
initPasswordToggles();
initHeroSelector();
initProductButtons();
initFunnelInteractions();
initProductVideo();
initCart();
initLogin();
initRegistration();
initSupportForm();
initRecommendation();
initLeadForm();
initDashboard();
initCheckoutSuccess();
applyQueryPrefill();
updateCartCount();
