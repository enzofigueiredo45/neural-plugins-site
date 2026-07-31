const checkoutUrl = "https://buy.stripe.com/test_substitua_pelo_seu_link";
const leadForm = document.querySelector("#leadForm");
const formMessage = document.querySelector("#formMessage");
const selectedProduct = document.querySelector("#selectedProduct");
const buyButtons = document.querySelectorAll(".add-cart");

let currentProduct = "Produto não selecionado";

const showMessage = (message, isError = false) => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.dataset.state = isError ? "error" : "success";
};

const trackEvent = (eventName, payload = {}) => {
  window.va?.("event", { name: eventName, data: payload });
};

buyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentProduct = button.dataset.product || "Produto selecionado";
    selectedProduct.textContent = `Produto selecionado: ${currentProduct} — R$ 29,90`;
    trackEvent("intencao_compra", { product: currentProduct });
    document.querySelector("#checkout")?.scrollIntoView({ behavior: "smooth" });
  });
});

leadForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (currentProduct === "Produto não selecionado") {
    showMessage("Escolha um produto do catálogo antes de continuar.", true);
    document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (!leadForm.checkValidity()) {
    leadForm.reportValidity();
    showMessage(
      "Preencha nome, e-mail válido e aceite a política para continuar.",
      true,
    );
    return;
  }

  trackEvent("checkout_iniciado", { product: currentProduct });
  showMessage("Dados validados. Redirecionando para o checkout seguro...");
  window.location.assign(checkoutUrl);
});
