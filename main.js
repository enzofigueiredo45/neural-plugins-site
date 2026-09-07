const CART_KEY = "neuralx_cart";
const ATTRIBUTION_KEY = "neuralx_attribution";
const FUNNEL_ID_KEY = "neuralx_funnel_id";
const STOREFRONT_VIEW_KEY = "neuralx_storefront_viewed";
const PURCHASE_TRACKING_KEY = "neuralx_ga4_purchases_v2";
const GOOGLE_ADS_PURCHASE_TRACKING_KEY = "neuralx_google_ads_purchases";
const MEASUREMENT_CONSENT_KEY = "neuralx_measurement_consent";
const MEASUREMENT_CONSENT_VERSION_KEY = "neuralx_measurement_consent_version";
const MEASUREMENT_CONSENT_VERSION = "2";
const GOOGLE_ADS_ID = "AW-10867942652";
const GOOGLE_ANALYTICS_ID = "G-JY83B1EM8L";
const GOOGLE_ADS_PURCHASE_DESTINATION =
  "AW-10867942652/-P1jCMGH0-YcEPzJnr4o";
const PAGE_VARIANT =
  document.body.dataset.pageVariant ||
  document.documentElement.dataset.pageVariant ||
  "default";
let pendingGoogleAdsPurchase = null;
let pendingAnalyticsPurchase = null;
let currentAttribution = {};
let currentPageMeasured = false;
let scrollDepth50Measured = false;
const measuredPurchases = new Set();
const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const PRODUCTS = Object.freeze({
  "neural-x": {
    id: "neural-x",
    name: "Coleção Neural DSP",
    licenseType: "Licença digital; confirme a modalidade de ativação antes da compra",
    price: 29.9,
    paymentLink: "https://mpago.la/116GVoE",
    accessMode: "pending",
    image: "/assets/neural-dsp/archetype-john-mayer-x.webp",
  },
  "fl-studio": {
    id: "fl-studio",
    name: "FL Studio 2026",
    edition: "2026",
    licenseType: "Licença digital; confirme a modalidade de ativação antes da compra",
    price: 19.9,
    paymentLink: "https://mpago.la/2vmYcir",
    accessMode: "pending",
    image: "/assets/product-fl-studio.webp",
  },
  reaper: {
    id: "reaper",
    name: "REAPER 2026",
    edition: "2026",
    licenseType: "Licença digital; confirme a modalidade de ativação antes da compra",
    price: 19.9,
    paymentLink: "https://mpago.la/2GGbxw5",
    accessMode: "pending",
    image: "/assets/product-reaper.webp",
  },
});

const HERO_CHOICES = Object.freeze({
  guitar: {
    productId: "neural-x",
    kicker: "Guitarra, baixo e voz",
    description:
      "23 plugins para construir timbres, gravar instrumentos e processar voz em Windows ou macOS.",
    image: "./assets/neural-dsp/archetype-john-mayer-x.webp",
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
    image: "./assets/product-fl-studio.webp",
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
    image: "./assets/product-reaper.webp",
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
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;
  try {
    const url = new URL(rawValue, window.location.origin);
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

function initSpeedInsights() {
  if (getMeasurementConsent() !== "granted") return;
  const allowedPaths = new Set([
    "/",
    "/index.html",
    "/produto-neural-x.html",
    "/produto-fl-studio.html",
    "/produto-reaper.html",
    "/guias.html",
    "/guia-plugins-guitarra.html",
    "/guia-escolher-daw.html",
    "/checklist-software-musical.html",
    "/gratis.html",
  ]);
  if (!allowedPaths.has(window.location.pathname)) return;
  window.si = window.si || function speedInsightsQueue() {
    (window.siq = window.siq || []).push(arguments);
  };
  if (document.querySelector('script[src="/_vercel/speed-insights/script.js"]')) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "/_vercel/speed-insights/script.js";
  document.head.append(script);
}

async function initClarity() {
  if (getMeasurementConsent() !== "granted") return;
  let clarityProjectId = "";
  try {
    ({ clarityProjectId = "" } = await getPublicConfig());
  } catch {
    return;
  }
  if (!/^[a-z0-9]{8,32}$/i.test(String(clarityProjectId || ""))) return;
  window.clarity = window.clarity || function clarityQueue() {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };
  window.clarity("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "granted",
  });
  if (document.querySelector("script[data-clarity-tag='true']")) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.clarityTag = "true";
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
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
    ad_user_data: granted ? "granted" : "denied",
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
      ad_user_data: "granted",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    return;
  }
  window.__neuralxGoogleAdsLoaded = true;
  window.gtag("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS_ID);
  window.gtag("config", GOOGLE_ANALYTICS_ID, {
    send_page_view: true,
    ...measurementPageContext(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  if (document.querySelector('script[data-google-ads-tag="true"]')) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.googleAdsTag = "true";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_ID)}`;
  document.head.append(script);
}

function getMeasurementConsent() {
  try {
    const value = localStorage.getItem(MEASUREMENT_CONSENT_KEY) || "";
    const version = localStorage.getItem(MEASUREMENT_CONSENT_VERSION_KEY) || "";
    // Re-ask visitors who accepted the older wording before enhanced conversions.
    if (value === "granted" && version !== MEASUREMENT_CONSENT_VERSION) return "";
    return value;
  } catch {
    return "";
  }
}

function setMeasurementConsent(value) {
  try {
    localStorage.setItem(MEASUREMENT_CONSENT_KEY, value);
    localStorage.setItem(MEASUREMENT_CONSENT_VERSION_KEY, MEASUREMENT_CONSENT_VERSION);
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
    <div><strong>Medição e anúncios</strong><p>Com sua permissão, usamos o Google Analytics para entender o funil e a tag do Google Ads para atribuir compras. Depois de uma compra, o e-mail do checkout pode virar um identificador protegido (hash) para melhorar a medição; o e-mail em texto não é enviado ao Google.</p><a href="./privacy.html">Ver política de privacidade</a></div>
    <div class="measurement-consent-actions"><button class="button primary compact" type="button" data-measurement-accept>Aceitar medição</button><button class="button ghost compact" type="button" data-measurement-essential>Somente essenciais</button></div>`;
  panel.querySelector("[data-measurement-accept]")?.addEventListener("click", () => {
    setMeasurementConsent("granted");
    captureAttribution();
    loadGoogleMeasurementTag();
    initSpeedInsights();
    void initClarity();
    trackCurrentPageView();
    measureScrollDepth50();
    if (pendingAnalyticsPurchase) {
      const { sessionId, data } = pendingAnalyticsPurchase;
      trackPurchaseOnce(sessionId, data);
    }
    if (pendingGoogleAdsPurchase) {
      const { sessionId, data } = pendingGoogleAdsPurchase;
      trackGoogleAdsPurchaseOnce(sessionId, data);
    }
    panel.remove();
  });
  panel.querySelector("[data-measurement-essential]")?.addEventListener("click", () => {
    setMeasurementConsent("denied");
    pendingGoogleAdsPurchase = null;
    pendingAnalyticsPurchase = null;
    clearMeasurementStorage();
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

function trackGoogleAdsPurchaseOnce(sessionId, data = {}) {
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

    const rawHash = data?.userData?.sha256_email_address;
    const sha256Email =
      typeof rawHash === "string" && /^[a-f0-9]{64}$/i.test(rawHash)
        ? rawHash.toLowerCase()
        : "";

    // Fetch the hash only after consent. The endpoint never returns the raw email.
    if (
      !sha256Email &&
      !data.enhancedConversionLookupAttempted &&
      data.enhancedConversionLookup
    ) {
      const userDataUrl = new URL(
        data.enhancedConversionLookup,
        window.location.origin,
      );
      userDataUrl.searchParams.set("include_user_data", "1");
      fetch(userDataUrl.href, { credentials: "include", cache: "no-store" })
        .then(async (response) => ({
          response,
          data: await readJsonResponse(response),
        }))
        .then(({ response, data: lookupData }) => {
          if (!response.ok) throw new Error(lookupData.error || "user_data_lookup_error");
          trackGoogleAdsPurchaseOnce(sessionId, {
            ...data,
            userData: lookupData.userData,
            enhancedConversionLookupAttempted: true,
          });
        })
        .catch(() =>
          trackGoogleAdsPurchaseOnce(sessionId, {
            ...data,
            enhancedConversionLookupAttempted: true,
          }),
        );
      return;
    }

    loadGoogleMeasurementTag();
    if (sha256Email) {
      window.gtag("set", "user_data", {
        sha256_email_address: sha256Email,
      });
    }
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
  captureAttribution();
  initGoogleConsentState();
  const consent = getMeasurementConsent();
  if (consent === "granted") {
    loadGoogleMeasurementTag();
    initSpeedInsights();
    void initClarity();
  }
  else if (consent !== "denied") showMeasurementConsent();
  document
    .querySelector("[data-reset-measurement-consent]")
    ?.addEventListener("click", () => {
      try {
        localStorage.removeItem(MEASUREMENT_CONSENT_KEY);
        localStorage.removeItem(MEASUREMENT_CONSENT_VERSION_KEY);
      } catch {}
      window.gtag?.("consent", "update", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      });
      window.clarity?.("consentv2", {
        ad_Storage: "denied",
        analytics_Storage: "denied",
      });
      clearMeasurementStorage();
      pendingAnalyticsPurchase = null;
      pendingGoogleAdsPurchase = null;
      currentPageMeasured = false;
      showMeasurementConsent();
    });
}

function trackEvent(name, data = {}) {
  if (getMeasurementConsent() !== "granted") return false;
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
        utm_content: attribution.utm_content || "none",
        ...data,
      })
        .filter(([key]) => !/^(?:email|phone|password|customer_email|user_data|sha256_email_address|session_id|token|access_url|download_url)$/i.test(key))
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
        .filter(([, value]) =