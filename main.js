const checkoutUrl = "https://buy.stripe.com/test_substitua_pelo_seu_link";
const CART_KEY = "neuralx_cart";

const readCart = () => JSON.parse(localStorage.getItem(CART_KEY) || "[]");
const writeCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));
const money = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const updateCartCount = () => {
  const count = readCart().reduce((total, item) => total + item.quantity, 0);
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
    addToCart({ id: button.dataset.id, name: button.dataset.name, price: Number(button.dataset.price) });
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
      ? cart.map((item) => `<li><span>${item.name} <small>x${item.quantity}</small></span><strong>${money(item.price * item.quantity)}</strong></li>`).join("")
      : "<li>Seu carrinho está vazio.</li>";
    cartTotal.textContent = money(cart.reduce((total, item) => total + item.price * item.quantity, 0));
  };
  document.querySelector("#clearCart")?.addEventListener("click", () => { writeCart([]); renderCart(); updateCartCount(); });
  document.querySelector("#checkoutButton")?.addEventListener("click", () => {
    if (!readCart().length) return;
    window.va?.("event", { name: "checkout_iniciado", data: { items: readCart().length } });
    window.location.assign(checkoutUrl);
  });
  renderCart();
}

const loginForm = document.querySelector("#loginForm");
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = loginForm.dataset.role;
  const email = loginForm.email.value;
  const password = loginForm.password.value;
  const message = document.querySelector("#loginMessage");
  try {
    const response = await fetch(`/api/login/${role}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error("Login inválido");
    sessionStorage.setItem("neuralx_role", role);
    window.location.assign(role === "seller" ? "./seller-dashboard.html" : "./client-dashboard.html");
  } catch {
    message.textContent = "Use demo@neuralx.com / neuralx123 para cliente ou seller@neuralx.com / neuralx123 para vendedor.";
    message.dataset.state = "error";
  }
});

updateCartCount();
