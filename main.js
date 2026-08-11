const CART_KEY = "neuralx_cart";
const PRODUCTS = Object.freeze({
  "neural-x": {
    id: "neural-x",
    name: "Neural X Collection",
    price: 19.9,
    image: "/assets/product-neural-x.svg",
  },
  "fl-studio": {
    id: "fl-studio",
    name: "FL Studio",
    price: 19.9,
    image: "/assets/product-fl-studio.svg",
  },
  reaper: {
    id: "reaper",
    name: "REAPER",
    price: 19.9,
    image: "/assets/product-reaper.svg",
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

const readJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json().catch(() => ({}));
};

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
  const close = () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menu");
    nav.dataset.open = "false";
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    nav.dataset.open = String(open);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) close();
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
  writeCart(cart);
  updateCartCount();
  showToast(`${product.name} foi adicionado ao carrinho.`);
  window.va?.("event", { name: "carrinho_adicionado", data: { product: product.name } });
}

function initProductButtons() {
  document.querySelectorAll(".add-cart").forEach((button) => {
    button.addEventListener("click", () => {
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
async function getRecaptchaToken(action) {
  publicConfigRequest ||= fetch("/api/public-config", { credentials: "include" })
    .then(readJsonResponse)
    .catch(() => ({}));
  const { recaptchaSiteKey } = await publicConfigRequest;
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
  invalid_cart_or_missing_price_ids: "O carrinho contém um produto indisponível. Atualize-o e tente novamente.",
};

function initCart() {
  const cartList = document.querySelector("#cartList");
  const cartTotal = document.querySelector("#cartTotal");
  if (!cartList || !cartTotal) return;
  const checkoutButton = document.querySelector("#checkoutButton");
  const clearButton = document.querySelector("#clearCart");
  const status = document.querySelector("#checkoutStatus");
  void fetchCsrf();

  const render = () => {
    const cart = readCart();
    cartList.innerHTML = cart.length
      ? cart
          .map(({ id, quantity }) => {
            const product = PRODUCTS[id];
            return `<li class="cart-item" data-cart-item="${escapeHtml(id)}"><div class="cart-item-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(money(product.price))} por unidade</small><button class="remove-item" type="button" data-cart-action="remove">Remover</button></div><div class="quantity-control" aria-label="Quantidade de ${escapeHtml(product.name)}"><button type="button" data-cart-action="decrease" aria-label="Diminuir quantidade">−</button><output>${quantity}</output><button type="button" data-cart-action="increase" aria-label="Aumentar quantidade">+</button></div><strong>${escapeHtml(money(product.price * quantity))}</strong></li>`;
          })
          .join("")
      : `<li class="empty-cart"><div class="cart-item-copy"><strong>Seu carrinho está vazio.</strong><small>Escolha uma ferramenta para começar.</small></div><a class="button primary" href="./index.html#produtos">Ver produtos</a></li>`;
    cartTotal.textContent = money(
      cart.reduce((total, item) => total + PRODUCTS[item.id].price * item.quantity, 0),
    );
    if (checkoutButton) checkoutButton.disabled = cart.length === 0;
    if (clearButton) clearButton.disabled = cart.length === 0;
  };

  cartList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-cart-action]");
    const itemNode = event.target.closest("[data-cart-item]");
    if (!actionButton || !itemNode) return;
    const id = itemNode.dataset.cartItem;
    const cart = readCart();
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    if (actionButton.dataset.cartAction === "increase") item.quantity = Math.min(item.quantity + 1, 10);
    if (actionButton.dataset.cartAction === "decrease") item.quantity -= 1;
    const next = actionButton.dataset.cartAction === "remove" || item.quantity < 1
      ? cart.filter((entry) => entry.id !== id)
      : cart;
    writeCart(next);
    updateCartCount();
    render();
  });

  clearButton?.addEventListener("click", () => {
    writeCart([]);
    updateCartCount();
    render();
    showToast("Carrinho limpo.");
  });

  checkoutButton?.addEventListener("click", async () => {
    const cart = readCart();
    if (!cart.length) return;
    const label = checkoutButton.querySelector(".checkout-button-label");
    try {
      checkoutButton.disabled = true;
      checkoutButton.classList.add("is-loading");
      if (label) label.textContent = "Abrindo checkout…";
      if (clearButton) clearButton.disabled = true;
      if (status) status.textContent = "Conectando com a Stripe.";
      const { response, data } = await postJson("/api/create-checkout-session", { cart });
      if (!response.ok || !data.url) throw new Error(data.error || "checkout_error");
      window.va?.("event", { name: "checkout_iniciado", data: { items: cart.length } });
      window.location.assign(data.url);
    } catch (error) {
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
  }
  render();
}

const authMessages = {
  missing_fields: "Preencha todos os campos obrigatórios.",
  invalid_credentials: "E-mail ou senha incorretos.",
  account_locked: "Conta temporariamente bloqueada após várias tentativas. Tente mais tarde.",
  captcha_failed: "Não foi possível validar a segurança. Atualize a página e tente novamente.",
  email_taken: "Já existe uma conta com este e-mail. Tente entrar.",
  invalid_credentials_format: "Confira o e-mail e use uma senha forte com pelo menos 12 caracteres.",
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
    value.length >= 12 &&
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
      message.textContent = "Use 12 ou mais caracteres com maiúscula, minúscula, número e símbolo.";
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
        database_not_ready: "O atendimento está temporariamente indisponível. Tente novamente.",
      };
      status.textContent = messages[error.message] || "Não foi possível enviar seu chamado agora.";
      status.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar chamado";
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
      if (data.user.mfaEnabled) {
        mfaButton.hidden = true;
        mfaDescription.textContent = "A verificação em duas etapas está ativa nesta conta.";
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
      productCount.textContent = String(orders.length);
      ordersList.innerHTML = orders.length
        ? orders
            .map((order) => {
              const fallback = Object.values(PRODUCTS).find((item) => item.name === order.product)?.image || PRODUCTS["neural-x"].image;
              const image = safeUrl(order.image, new URL(fallback, window.location.href).href);
              const download = safeUrl(order.download_url);
              const date = order.created_at ? new Date(order.created_at).toLocaleDateString("pt-BR") : "";
              return `<article class="order-card"><img src="${escapeHtml(image)}" alt="${escapeHtml(order.product || "Produto")}" /><div class="order-details"><span class="status-badge">${escapeHtml(order.status || "Processando")}</span><h3>${escapeHtml(order.product || "Produto digital")}</h3><p>${date ? `Pedido de ${escapeHtml(date)} · ` : ""}${escapeHtml(money(Number(order.price)))}</p>${download ? `<a class="button primary compact" href="${escapeHtml(download)}">Acessar produto</a>` : "<small>O acesso será exibido após a liberação do pedido.</small>"}</div></article>`;
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
      securityStatus.textContent = "MFA ativado";
    } catch {
      message.textContent = "Código inválido. Confira o autenticador e tente novamente.";
      message.dataset.state = "error";
    }
  });

  document.querySelector("#passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector("#passwordMessage");
    const submit = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    if (!isStrongPassword(form.newPassword.value)) {
      message.textContent = "A nova senha precisa de 12 caracteres, maiúscula, minúscula, número e símbolo.";
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

function initCheckoutSuccess() {
  const card = document.querySelector("[data-checkout-success]");
  if (!card) return;
  const title = document.querySelector("#successTitle");
  const message = document.querySelector("#successMessage");
  const icon = document.querySelector("#successIcon");
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  const fail = () => {
    icon.textContent = "!";
    title.textContent = "Não foi possível confirmar.";
    message.textContent = "Consulte o pagamento na Stripe ou abra um chamado antes de tentar novamente.";
    card.dataset.state = "error";
  };
  if (!sessionId) return fail();
  fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`, { credentials: "include" })
    .then(async (response) => ({ response, data: await readJsonResponse(response) }))
    .then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || "session_lookup_error");
      if (data.paymentStatus === "paid") {
        writeCart([]);
        updateCartCount();
        icon.textContent = "✓";
        title.textContent = "Pagamento confirmado.";
        const items = data.products?.map((item) => item.name).filter(Boolean).join(", ");
        message.textContent = data.fulfillment === "recorded"
          ? items
            ? `${items} foi vinculado ao e-mail usado no checkout.`
            : "Seu pedido foi vinculado ao e-mail usado no checkout."
          : "Seu pagamento foi aprovado e o pedido está sendo liberado. Se ele não aparecer na conta em alguns minutos, abra um chamado.";
        card.dataset.state = "success";
      } else {
        icon.textContent = "…";
        title.textContent = "Pagamento em processamento.";
        message.textContent = "A Stripe ainda está processando o pagamento. Atualize esta página em instantes.";
        card.dataset.state = "pending";
      }
    })
    .catch(fail);
}

function applyQueryPrefill() {
  const email = new URLSearchParams(window.location.search).get("email");
  const emailInput = document.querySelector("#email");
  if (email && emailInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput.value = email.slice(0, 254);
    document.querySelector("#password")?.focus();
  }
}

initNavigation();
initPasswordToggles();
initProductButtons();
initCart();
initLogin();
initRegistration();
initSupportForm();
initDashboard();
initCheckoutSuccess();
applyQueryPrefill();
updateCartCount();
