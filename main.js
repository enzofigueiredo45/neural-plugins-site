const checkoutUrl = "https://buy.stripe.com/test_substitua_pelo_seu_link";
const leadForm = document.querySelector("#leadForm");
const formMessage = document.querySelector("#formMessage");

const showMessage = (message, isError = false) => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.dataset.state = isError ? "error" : "success";
};

leadForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!leadForm.checkValidity()) {
    leadForm.reportValidity();
    showMessage(
      "Preencha nome, e-mail válido e aceite a política para continuar.",
      true,
    );
    return;
  }

  showMessage("Dados validados. Redirecionando para o checkout seguro...");
  window.location.assign(checkoutUrl);
});
