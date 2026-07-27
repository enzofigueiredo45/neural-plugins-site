const checkoutUrl = 'https://buy.stripe.com/test_substitua_pelo_seu_link';
const leadStorageKey = 'neural_plugins_checkout_lead';

const leadForm = document.querySelector('#leadForm');
const formMessage = document.querySelector('#formMessage');

const showMessage = (message, isError = false) => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.dataset.state = isError ? 'error' : 'success';
};

leadForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!leadForm.checkValidity()) {
    leadForm.reportValidity();
    showMessage('Preencha nome, e-mail válido e aceite a política para continuar.', true);
    return;
  }

  const formData = new FormData(leadForm);
  const lead = {
    name: String(formData.get('buyerName')).trim(),
    email: String(formData.get('buyerEmail')).trim(),
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(leadStorageKey, JSON.stringify(lead));
  showMessage('Cadastro salvo. Redirecionando para o checkout seguro...');
  window.location.assign(checkoutUrl);
});
