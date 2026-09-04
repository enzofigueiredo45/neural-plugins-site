const { createHash } = require("node:crypto");

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function normalizeSiteUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function getEmailConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || "").trim(),
    from: String(env.EMAIL_FROM || "Neural X <onboarding@resend.dev>").trim(),
    replyTo: String(env.EMAIL_REPLY_TO || "").trim(),
    supportTo: String(env.EMAIL_SUPPORT_TO || "").trim().toLowerCase(),
    siteUrl: normalizeSiteUrl(env.SITE_URL) || "https://neuralxplugins.com.br",
  };
}

function idempotencyKey(value) {
  return `neural-x-${createHash("sha256").update(String(value)).digest("hex").slice(0, 48)}`;
}

function emailShell({ preview, title, body, ctaLabel, ctaUrl, siteUrl }) {
  const safeSiteUrl = escapeHtml(siteUrl);
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#5b39f3;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f4f4f7;color:#17171b;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div><main style="max-width:600px;margin:0 auto;padding:32px 16px"><section style="background:#fff;border:1px solid #e4e4ea;border-radius:16px;padding:32px"><p style="margin:0 0 20px;color:#5b39f3;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Neural X</p><h1 style="font-size:26px;line-height:1.2;margin:0 0 18px">${escapeHtml(title)}</h1>${body}${cta}<p style="margin:28px 0 0;border-top:1px solid #ececf1;padding-top:18px;color:#686875;font-size:13px;line-height:1.5">Mensagem automática da Neural X. Nunca envie senhas ou dados completos de cartão por e-mail.<br><a href="${safeSiteUrl}/contact.html" style="color:#5b39f3">Suporte Neural X</a></p></section></main></body></html>`;
}

async function sendEmail({ to, subject, html, text, replyTo, key, headers }, env = process.env) {
  const config = getEmailConfig(env);
  if (!config.apiKey) return { sent: false, skipped: "RESEND_API_KEY" };
  const recipients = (Array.isArray(to) ? to : [to])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (!recipients.length) return { sent: false, skipped: "recipient" };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(key || `${subject}:${recipients.join(",")}`),
    },
    body: JSON.stringify({
      from: config.from,
      to: recipients,
      subject,
      html,
      text,
      reply_to: replyTo || config.replyTo || undefined,
      headers: headers && typeof headers === "object" ? headers : undefined,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const error = new Error(`Resend request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  const data = await response.json();
  return { sent: true, id: data.id || null };
}

async function sendWelcomeEmail({ email, name }, env = process.env) {
  const config = getEmailConfig(env);
  const accountUrl = `${config.siteUrl}/client-login.html`;
  return sendEmail({
    to: email,
    subject: "Sua conta Neural X foi criada",
    key: `welcome:${String(email).toLowerCase()}`,
    text: `Olá, ${name || "Cliente"}. Sua conta Neural X foi criada. Acesse ${accountUrl}`,
    html: emailShell({
      preview: "Sua conta Neural X está pronta.",
      title: "Sua conta está pronta.",
      body: `<p style="font-size:16px;line-height:1.65;margin:0">Olá, ${escapeHtml(name || "Cliente")}. Use o mesmo e-mail informado no pagamento para acompanhar pedidos e acessar seus produtos digitais.</p>`,
      ctaLabel: "Entrar na minha conta",
      ctaUrl: accountUrl,
      siteUrl: config.siteUrl,
    }),
  }, env);
}

async function sendSupportConfirmationEmail({ email, name, ticketId, subject }, env = process.env) {
  const config = getEmailConfig(env);
  const ticketLabel = ticketId ? `#${ticketId}` : "recebido";
  return sendEmail({
    to: email,
    subject: `Chamado ${ticketLabel} recebido pela Neural X`,
    key: `support-confirmation:${ticketId || email}`,
    text: `Olá, ${name}. Recebemos seu chamado ${ticketLabel} sobre ${subject}. Acompanhe pela sua conta ou responda a este e-mail.`,
    html: emailShell({
      preview: `Recebemos seu chamado ${ticketLabel}.`,
      title: `Chamado ${ticketLabel} recebido.`,
      body: `<p style="font-size:16px;line-height:1.65;margin:0 0 12px">Olá, ${escapeHtml(name)}. Recebemos sua solicitação sobre <strong>${escapeHtml(subject)}</strong>.</p><p style="font-size:16px;line-height:1.65;margin:0">Guarde o número do chamado para acompanhamento.</p>`,
      ctaLabel: "Acessar minha conta",
      ctaUrl: `${config.siteUrl}/client-login.html`,
      siteUrl: config.siteUrl,
    }),
  }, env);
}

async function sendSupportNotificationEmail({ email, name, ticketId, subject, orderReference, message }, env = process.env) {
  const config = getEmailConfig(env);
  if (!config.supportTo) return { sent: false, skipped: "EMAIL_SUPPORT_TO" };
  const ticketLabel = ticketId ? `#${ticketId}` : "sem número";
  const details = [
    `<p style="font-size:16px;line-height:1.65"><strong>Cliente:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>`,
    `<p style="font-size:16px;line-height:1.65"><strong>Assunto:</strong> ${escapeHtml(subject)}</p>`,
    orderReference ? `<p style="font-size:16px;line-height:1.65"><strong>Pedido:</strong> ${escapeHtml(orderReference)}</p>` : "",
    `<div style="white-space:pre-wrap;background:#f6f6f9;border-radius:10px;padding:16px;font-size:15px;line-height:1.6">${escapeHtml(message)}</div>`,
  ].join("");
  return sendEmail({
    to: config.supportTo,
    replyTo: email,
    subject: `[Neural X] Chamado ${ticketLabel}: ${subject}`,
    key: `support-notification:${ticketId || `${email}:${subject}`}`,
    text: `Chamado ${ticketLabel}\nCliente: ${name} <${email}>\nAssunto: ${subject}\nPedido: ${orderReference || "não informado"}\n\n${message}`,
    html: emailShell({
      preview: `Novo chamado ${ticketLabel} de ${name}.`,
      title: `Novo chamado ${ticketLabel}.`,
      body: details,
      siteUrl: config.siteUrl,
    }),
  }, env);
}

async function sendOrderConfirmationEmail({ checkoutId, email, products, amountTotal, currency }, env = process.env) {
  const config = getEmailConfig(env);
  const total = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
  }).format(Number(amountTotal || 0) / 100);
  const productList = products
    .map(({ name, quantity }) => `<li style="margin:6px 0">${escapeHtml(name)} × ${Number(quantity) || 1}</li>`)
    .join("");
  const downloadLinks = products.filter(({ accessUrl }) => accessUrl);
  const downloadList = downloadLinks.length
    ? `<div style="margin:20px 0;padding:16px;border:1px solid #e4e4ea;border-radius:10px"><strong style="display:block;margin-bottom:10px">Links de download</strong>${downloadLinks
        .map(({ name, accessUrl }) => `<p style="margin:8px 0"><a href="${escapeHtml(accessUrl)}" style="color:#5b39f3;font-weight:700">Baixar ${escapeHtml(name)}</a></p>`)
        .join("")}</div>`
    : "";
  const accessMessage = downloadLinks.length === products.length
    ? "Use os links abaixo e siga as instruções de ativação. A licença digital fica vinculada ao computador usado na ativação."
    : "O link de download e as instruções de ativação serão enviados a este e-mail em até 4 horas. A licença digital ficará vinculada ao computador usado na ativação.";
  const textLinks = downloadLinks.length
    ? ` Links: ${downloadLinks.map(({ name, accessUrl }) => `${name}: ${accessUrl}`).join(" | ")}`
    : "";
  return sendEmail({
    to: email,
    subject: "Pagamento confirmado — Neural X",
    key: `order-confirmation:${checkoutId}`,
    text: `Pagamento confirmado (${total}). ${products.map((item) => `${item.name} x${item.quantity}`).join(", ")}. ${accessMessage}${textLinks}`,
    html: emailShell({
      preview: `Pagamento confirmado no valor de ${total}.`,
      title: "Pagamento confirmado.",
      body: `<p style="font-size:16px;line-height:1.65;margin:0 0 12px">Recebemos seu pagamento de <strong>${escapeHtml(total)}</strong>.</p><ul style="font-size:16px;line-height:1.6;padding-left:20px">${productList}</ul><p style="font-size:16px;line-height:1.65;margin:14px 0 0">${escapeHtml(accessMessage)}</p>${downloadList}`,
      ctaLabel: "Abrir minha biblioteca",
      ctaUrl: `${config.siteUrl}/client-login.html`,
      siteUrl: config.siteUrl,
    }),
  }, env);
}

async function sendRecommendationEmail({
  email,
  name,
  recommendation,
  marketingConsent = false,
  unsubscribeUrl = "",
  oneClickUnsubscribeUrl = "",
}, env = process.env) {
  const config = getEmailConfig(env);
  const recommendationUrl = new URL(
    recommendation?.url || "/#produtos",
    `${config.siteUrl}/`,
  );
  recommendationUrl.searchParams.set("utm_source", "neuralx");
  recommendationUrl.searchParams.set("utm_medium", "email");
  recommendationUrl.searchParams.set("utm_campaign", "recomendacao_solicitada");
  recommendationUrl.searchParams.set("utm_content", recommendation?.id || "compare");
  const recommendationName = recommendation?.name || "Comparação Neural X";
  const reason = recommendation?.reason ||
    "Compare os produtos pelo objetivo, sistema e fluxo antes de escolher.";
  const marketingText = marketingConsent && unsubscribeUrl
    ? ` Você também autorizou conteúdos e ofertas. Cancele quando quiser: ${unsubscribeUrl}.`
    : " Você pediu somente esta recomendação e não foi inscrito em conteúdos ou ofertas.";
  const marketingHtml = marketingConsent && unsubscribeUrl
    ? `<p style="font-size:13px;line-height:1.6;margin:18px 0 0">Você também autorizou conteúdos e ofertas da Neural X. <a href="${escapeHtml(unsubscribeUrl)}">Cancele com um clique</a> a qualquer momento. Isso não altera seus pedidos.</p>`
    : `<p style="font-size:13px;line-height:1.6;margin:18px 0 0">Você pediu somente esta recomendação. Seu e-mail não foi inscrito em conteúdos ou ofertas.</p>`;
  const listHeaders = marketingConsent && oneClickUnsubscribeUrl
    ? {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  return sendEmail({
    to: email,
    subject: `Sua recomendação Neural X: ${recommendationName}`,
    key: `recommendation:${String(email).toLowerCase()}:${recommendation?.id || "compare"}`,
    text: `Olá, ${name}. Sua recomendação é ${recommendationName}. ${reason} Veja: ${recommendationUrl.href}.${marketingText}`,
    headers: listHeaders,
    html: emailShell({
      preview: `Sua recomendação: ${recommendationName}.`,
      title: "Sua recomendação chegou.",
      body: `<p style="font-size:16px;line-height:1.65;margin:0 0 12px">Olá, ${escapeHtml(name)}.</p><p style="font-size:16px;line-height:1.65;margin:0 0 12px">Pelo objetivo que você escolheu, um ponto de partida é <strong>${escapeHtml(recommendationName)}</strong>.</p><p style="font-size:16px;line-height:1.65;margin:0">${escapeHtml(reason)}</p>${marketingHtml}`,
      ctaLabel: "Ver recomendação",
      ctaUrl: recommendationUrl.href,
      siteUrl: config.siteUrl,
    }),
  }, env);
}

module.exports = {
  escapeHtml,
  getEmailConfig,
  sendEmail,
  sendOrderConfirmationEmail,
  sendRecommendationEmail,
  sendSupportConfirmationEmail,
  sendSupportNotificationEmail,
  sendWelcomeEmail,
};
