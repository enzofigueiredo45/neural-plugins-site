const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );

const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const currency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

let csrfToken;
async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/csrf-token", { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.csrfToken) throw new Error(data.error || "csrf_error");
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = await getCsrfToken();
  }
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "request_failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showToast(message, state = "success") {
  const region = document.querySelector("#toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.state = state;
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 4_000);
}

function table(headers, rows, emptyMessage = "Nenhum registro encontrado.") {
  if (!rows.length) return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  return `<table class="admin-table"><thead><tr>${headers
    .map((header) => `<th scope="col">${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function options(values, selected) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`,
    )
    .join("");
}

const ORDER_STATUSES = [
  "Pagamento confirmado",
  "Pagamento confirmado · solicite acesso no Drive",
  "Pagamento confirmado · liberação pendente",
  "Acesso liberado",
  "Acesso solicitado",
  "Liberação pendente",
  "Reembolsado",
  "Cancelado",
];
const TICKET_STATUSES = [
  "Aberto",
  "Em andamento",
  "Aguardando cliente",
  "Resolvido",
  "Fechado",
];
const LEAD_STATUSES = [
  "Novo",
  "Em contato",
  "Qualificado",
  "Convertido",
  "Arquivado",
];

const loaded = new Set();
let currentTab = "overview";

function renderOverview(data) {
  const metrics = data.metrics || {};
  document.querySelector("#adminMetrics").innerHTML = [
    ["Receita registrada", currency(metrics.revenue)],
    ["Pedidos", metrics.orders || 0],
    ["Clientes", metrics.users || 0],
    ["Chamados abertos", `${metrics.openTickets || 0} de ${metrics.tickets || 0}`],
    ["Leads novos", `${metrics.newLeads || 0} de ${metrics.leads || 0}`],
  ]
    .map(
      ([label, value]) =>
        `<article class="admin-metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`,
    )
    .join("");
  document.querySelector("#recentOrders").innerHTML = table(
    ["Pedido", "Cliente", "Produto", "Valor", "Status"],
    (data.recentOrders || []).map(
      (item) =>
        `<tr><td>#${escapeHtml(item.id)}</td><td>${escapeHtml(item.buyer_email)}</td><td>${escapeHtml(item.product)}</td><td>${escapeHtml(currency(Number(item.price || 0) * Number(item.quantity || 1)))}</td><td><span class="status-badge">${escapeHtml(item.status)}</span></td></tr>`,
    ),
  );
  document.querySelector("#recentTickets").innerHTML = table(
    ["Chamado", "Cliente", "Assunto", "Status"],
    (data.recentTickets || []).map(
      (item) =>
        `<tr><td>#${escapeHtml(item.id)}</td><td>${escapeHtml(item.requester_name || item.requester_email)}</td><td>${escapeHtml(item.subject)}</td><td><span class="status-badge">${escapeHtml(item.status)}</span></td></tr>`,
    ),
  );
}

async function loadOverview() {
  renderOverview(await request("/api/admin/overview"));
  loaded.add("overview");
}

async function loadOrders(search = "") {
  const data = await request(`/api/admin/orders?search=${encodeURIComponent(search)}`);
  document.querySelector("#adminOrders").innerHTML = table(
    ["Pedido", "Cliente", "Produto", "Total", "Status", "Acesso", "Ação"],
    (data.items || []).map(
      (item) =>
        `<tr data-order-id="${escapeHtml(item.id)}"><td><strong>#${escapeHtml(item.id)}</strong><small>${escapeHtml(dateTime(item.created_at))}</small></td><td>${escapeHtml(item.buyer_email)}</td><td>${escapeHtml(item.product)}<small>${escapeHtml(item.product_id || "—")}</small></td><td>${escapeHtml(currency(Number(item.price || 0) * Number(item.quantity || 1)))}</td><td><select data-order-status aria-label="Status do pedido ${escapeHtml(item.id)}">${options(ORDER_STATUSES, item.status)}</select></td><td><input data-order-url type="url" value="${escapeHtml(item.download_url || "")}" placeholder="https://…" aria-label="URL de acesso do pedido ${escapeHtml(item.id)}"></td><td><button class="button secondary compact" data-order-save type="button">Salvar</button></td></tr>`,
    ),
  );
  loaded.add("orders");
}

async function loadUsers(search = "") {
  const data = await request(`/api/admin/users?search=${encodeURIComponent(search)}`);
  document.querySelector("#adminUsers").innerHTML = table(
    ["Cliente", "Função", "MFA", "Pedidos", "Último login", "Cadastro"],
    (data.items || []).map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.name || "Sem nome")}</strong><small>${escapeHtml(item.email)}</small></td><td>${escapeHtml(item.role === "admin" ? "Administrador" : "Cliente")}</td><td><span class="status-badge">${item.mfa_enabled ? "Ativo" : "Inativo"}</span></td><td>${escapeHtml(item.order_count || 0)}</td><td>${escapeHtml(dateTime(item.last_login_at))}</td><td>${escapeHtml(dateTime(item.created_at))}</td></tr>`,
    ),
  );
  loaded.add("users");
}

async function loadTickets(search = "") {
  const data = await request(`/api/admin/tickets?search=${encodeURIComponent(search)}`);
  document.querySelector("#adminTickets").innerHTML = table(
    ["Chamado", "Cliente", "Assunto", "Mensagem", "Status"],
    (data.items || []).map(
      (item) =>
        `<tr><td><strong>#${escapeHtml(item.id)}</strong><small>${escapeHtml(dateTime(item.created_at))}</small></td><td>${escapeHtml(item.requester_name)}<small>${escapeHtml(item.requester_email)}</small></td><td>${escapeHtml(item.subject)}<small>${escapeHtml(item.category)}${item.order_reference ? ` · Pedido ${escapeHtml(item.order_reference)}` : ""}</small></td><td><span class="admin-message">${escapeHtml(item.message)}</span></td><td><select data-status-update="tickets" data-id="${escapeHtml(item.id)}" aria-label="Status do chamado ${escapeHtml(item.id)}">${options(TICKET_STATUSES, item.status)}</select></td></tr>`,
    ),
  );
  loaded.add("tickets");
}

async function loadLeads(search = "") {
  const data = await request(`/api/admin/leads?search=${encodeURIComponent(search)}`);
  document.querySelector("#adminLeads").innerHTML = table(
    ["Lead", "Interesse", "Origem", "Cadastro", "Status"],
    (data.items || []).map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email)}</small></td><td>${escapeHtml(item.interest)}</td><td>${escapeHtml([item.utm_source, item.utm_medium, item.utm_campaign].filter(Boolean).join(" / ") || item.landing_page || "Direto")}</td><td>${escapeHtml(dateTime(item.created_at))}</td><td><select data-status-update="leads" data-id="${escapeHtml(item.id)}" aria-label="Status do lead ${escapeHtml(item.id)}">${options(LEAD_STATUSES, item.status)}</select></td></tr>`,
    ),
  );
  loaded.add("leads");
}

async function loadAudit() {
  const data = await request("/api/admin/audit");
  document.querySelector("#adminAudit").innerHTML = table(
    ["Data", "Administrador", "Ação", "Registro", "Alteração", "Request ID"],
    (data.items || []).map((item) => {
      let details = item.details_json || "—";
      try {
        details = JSON.stringify(JSON.parse(details));
      } catch {}
      return `<tr><td>${escapeHtml(dateTime(item.created_at))}</td><td>${escapeHtml(item.admin_email)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity_type)} #${escapeHtml(item.entity_id || "—")}</td><td><span class="admin-message">${escapeHtml(details)}</span></td><td><code>${escapeHtml(item.request_id || "—")}</code></td></tr>`;
    }),
  );
  loaded.add("audit");
}

const loaders = {
  overview: loadOverview,
  orders: loadOrders,
  users: loadUsers,
  tickets: loadTickets,
  leads: loadLeads,
  audit: loadAudit,
};

async function activateTab(tab, force = false) {
  if (!loaders[tab]) return;
  currentTab = tab;
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    const active = button.dataset.adminTab === tab;
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== tab;
  });
  if (force || !loaded.has(tab)) {
    try {
      await loaders[tab]();
    } catch {
      showToast("Não foi possível carregar esta seção.", "error");
    }
  }
}

async function initialize() {
  const gate = document.querySelector("#adminGate");
  try {
    const account = await request("/api/me");
    if (account.user?.role !== "admin") {
      window.location.replace("./admin-login.html");
      return;
    }
    document.querySelector("#adminWelcome").textContent = `${account.user.name || account.user.email} · acesso administrativo`;
    await loadOverview();
    document.querySelector("#adminWorkspace").hidden = false;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("./admin-login.html");
      return;
    }
    gate.hidden = false;
    if (error.message === "mfa_required") {
      gate.innerHTML = '<strong>MFA obrigatório.</strong><p>Ative a verificação em duas etapas em Conta e segurança antes de usar o painel.</p><a class="button primary compact" href="./client-dashboard.html">Ativar MFA</a>';
    } else {
      gate.textContent = "Não foi possível validar o acesso administrativo agora.";
    }
  }
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-admin-tab]");
  if (tab) await activateTab(tab.dataset.adminTab);

  const save = event.target.closest("[data-order-save]");
  if (save) {
    const row = save.closest("[data-order-id]");
    try {
      save.disabled = true;
      await request(`/api/admin/orders/${row.dataset.orderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: row.querySelector("[data-order-status]").value,
          download_url: row.querySelector("[data-order-url]").value.trim(),
        }),
      });
      loaded.delete("overview");
      showToast("Pedido atualizado e registrado na auditoria.");
    } catch (error) {
      showToast(
        error.message === "invalid_access_url"
          ? "Use uma URL HTTPS válida, sem usuário ou senha."
          : "Não foi possível atualizar o pedido.",
        "error",
      );
    } finally {
      save.disabled = false;
    }
  }
});

document.addEventListener("change", async (event) => {
  const control = event.target.closest("[data-status-update]");
  if (!control) return;
  try {
    control.disabled = true;
    await request(`/api/admin/${control.dataset.statusUpdate}/${control.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: control.value }),
    });
    loaded.delete("overview");
    showToast("Status atualizado e registrado na auditoria.");
  } catch {
    showToast("Não foi possível atualizar o status.", "error");
    loaded.delete(control.dataset.statusUpdate);
    await activateTab(control.dataset.statusUpdate, true);
  } finally {
    control.disabled = false;
  }
});

document.querySelectorAll("[data-filter]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const section = form.dataset.filter;
    try {
      await loaders[section](form.search.value.trim());
    } catch {
      showToast("Não foi possível executar a busca.", "error");
    }
  });
});

document.querySelector("#adminRefresh")?.addEventListener("click", async () => {
  loaded.clear();
  await activateTab(currentTab, true);
  showToast("Dados atualizados.");
});

document.querySelector("#adminLogout")?.addEventListener("click", async () => {
  try {
    await request("/api/logout", { method: "POST", body: "{}" });
  } finally {
    window.location.replace("./admin-login.html");
  }
});

initialize();
