const CART_KEY = "neuralx_cart";

const readCart = () => {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    localStorage.removeItem(CART_KEY);
    return [];
  }
};
const writeCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));
const money = (value) => Number.isFinite(value) ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";

const updateCartCount = () => {
  const count = readCart().reduce((total, item) => total + (item.quantity || 0), 0);
  document.querySelectorAll("#cartCount, [data-cart-count]").forEach((node) => {
    node.textContent = String(count);
  });
};

const addToCart = (product) => {
  const cart = readCart();
  const existing = cart.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ ...product, quantity: 1 });
  writeCart(cart);
  updateCartCount();
  window.va?.("event", { name: "carrinho_adicionado", data: { product: product.name } });
};

document.querySelectorAll(".add-cart").forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.dataset.id;
    const name = button.dataset.name || "Produto";
    const priceRaw = Number(button.dataset.price);
    const price = Number.isFinite(priceRaw) ? priceRaw : 0;
    addToCart({ id, name, price });
    button.textContent = "Adicionado";
    setTimeout(() => (button.textContent = "Adicionar"), 1200);
  });
});

const cartList = document.querySelector("#cartList");
const cartTotal = document.querySelector("#cartTotal");
if (cartList && cartTotal) {
  const renderCart = () => {
    const cart = readCart();
    cartList.innerHTML = cart.length
      ? cart.map((item) => `<li><span><strong>${item.name}</strong><small>Quantidade: ${item.quantity}</small></span><strong>${money(item.price * item.quantity)}</strong></li>`).join("")
      : `<li class="empty-cart"><span><strong>Seu carrinho está vazio.</strong><small>Volte para a loja e adicione um produto digital.</small></span><a class="button secondary" href="./index.html#produtos">Ver produtos</a></li>`;
    cartTotal.textContent = money(cart.reduce((total, item) => total + (item.price || 0) * (item.quantity || 0), 0));
  };
  document.querySelector("#clearCart")?.addEventListener("click", () => { writeCart([]); renderCart(); updateCartCount(); });
  document.querySelector("#checkoutButton")?.addEventListener("click", async () => {
    const cart = readCart();
    if (!cart.length) return;
    const button = document.querySelector("#checkoutButton");
    try {
      if (button) button.disabled = true;
      const csrfToken = await fetchCsrf();
      const headers = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ cart })
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "checkout_error");
      window.va?.("event", { name: "checkout_iniciado", data: { items: cart.length } });
      window.location.assign(data.url);
    } catch (err) {
      alert("Checkout ainda não configurado. Verifique STRIPE_SECRET_KEY e os STRIPE_PRICE_* no servidor.");
      if (button) button.disabled = false;
    }
  });
  renderCart();
}

async function fetchCsrf() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.csrfToken || null;
  } catch {
    return null;
  }
}

const loginForm = document.querySelector("#loginForm");
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  const role = loginForm.dataset.role;
  const message = document.querySelector("#loginMessage");
  if (!role) {
    message.textContent = "Role inválido";
    message.dataset.state = "error";
    return;
  }

  const email = loginForm.email.value;
  const password = loginForm.password.value;
  try {
    if (submitBtn) submitBtn.disabled = true;
    const csrfToken = await fetchCsrf();
    const headers = { "Content-Type": "application/json" };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`/api/login/${role}`, { method: "POST", headers, credentials: 'include', body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error("Login inválido");
    sessionStorage.setItem("neuralx_role", role);
    sessionStorage.setItem("neuralx_email", email);
    window.location.assign("./client-dashboard.html");
  } catch (err) {
    message.textContent = "Não foi possível entrar. Confira e-mail/senha e abra o site pelo servidor Node (npm start), não como arquivo estático.";
    message.dataset.state = "error";
    if (submitBtn) submitBtn.disabled = false;
  }
});

const dashboardPage = document.querySelector('.dashboard-page');
if (dashboardPage) {
  const profileForm = document.querySelector('#profileForm');
  const profileName = document.querySelector('#profileName');
  const profileEmail = document.querySelector('#profileEmail');
  const profileAvatar = document.querySelector('#profileAvatar');
  const profileMessage = document.querySelector('#profileMessage');
  const avatarPreview = document.querySelector('#avatarPreview');
  const ordersList = document.querySelector('#ordersList');

  const initials = (nameOrEmail) => String(nameOrEmail || 'NX')
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'NX';

  const setAvatar = (user) => {
    if (!avatarPreview) return;
    avatarPreview.textContent = initials(user.name || user.email);
    avatarPreview.style.backgroundImage = user.avatarUrl ? `url(${user.avatarUrl})` : '';
    avatarPreview.classList.toggle('has-image', Boolean(user.avatarUrl));
  };

  const requireClient = async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) throw new Error('unauthorized');
      const data = await res.json();
      if (data.user?.role !== 'client') throw new Error('invalid_role');
      sessionStorage.setItem('neuralx_role', 'client');
      sessionStorage.setItem('neuralx_email', data.user.email);
      profileName.value = data.user.name || '';
      profileEmail.value = data.user.email || '';
      profileAvatar.value = data.user.avatarUrl || '';
      setAvatar(data.user);
      return data.user;
    } catch {
      window.location.assign('./client-login.html');
      return null;
    }
  };

  const loadOrders = async () => {
    try {
      const res = await fetch('/api/orders', { credentials: 'include' });
      if (!res.ok) throw new Error('orders_error');
      const orders = await res.json();
      ordersList.innerHTML = orders.length
        ? orders.map((order) => `<article class="order-card"><img src="${order.image || './assets/neural-collection.svg'}" alt="${order.product || 'Produto'}" /><div><h3>${order.product || 'Produto digital'}</h3><p>Status: <strong>${order.status || 'Processando'}</strong></p><p>Valor: <strong>${money(Number(order.price))}</strong></p>${order.download_url ? `<a class="button secondary" href="${order.download_url}">Acessar produto</a>` : ''}</div></article>`).join('')
        : '<p>Você ainda não possui compras vinculadas a este e-mail.</p>';
    } catch {
      ordersList.innerHTML = '<p>Não foi possível carregar seus pedidos agora.</p>';
    }
  };

  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const csrfToken = await fetchCsrf();
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name: profileName.value, avatarUrl: profileAvatar.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'profile_error');
      setAvatar(data.user);
      profileMessage.textContent = 'Perfil atualizado com sucesso.';
      profileMessage.dataset.state = 'success';
    } catch {
      profileMessage.textContent = 'Não foi possível salvar o perfil.';
      profileMessage.dataset.state = 'error';
    }
  });

  document.querySelector('#logout')?.addEventListener('click', async () => {
    const csrfToken = await fetchCsrf();
    const headers = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
    await fetch('/api/logout', { method: 'POST', headers, credentials: 'include' }).catch(() => {});
    sessionStorage.clear();
    window.location.assign('./client-login.html');
  });

  requireClient().then((user) => { if (user) loadOrders(); });
}

updateCartCount();
