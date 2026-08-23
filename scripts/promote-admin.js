const db = require("../lib/db");

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Informe o e-mail cadastrado: npm run admin:promote -- voce@exemplo.com");

  await db.initSqlite();
  const user = await db.getOne(
    db.usePostgres
      ? "SELECT id, email, role, mfa_enabled FROM users WHERE email = $1 LIMIT 1"
      : "SELECT id, email, role, mfa_enabled FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  if (!user) throw new Error("Conta não encontrada. Cadastre a conta antes de promovê-la.");
  if (!user.mfa_enabled)
    throw new Error("Ative o MFA na conta antes de conceder acesso administrativo.");

  await db.run(
    db.usePostgres
      ? "UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = $1"
      : "UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [user.id],
  );
  console.log(`Acesso administrativo concedido a ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
