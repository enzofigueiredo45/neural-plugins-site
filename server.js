const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || 4173;
const root = process.cwd();
const users = {
  client: { email: "demo@neuralx.com", password: "neuralx123" },
  seller: { email: "seller@neuralx.com", password: "neuralx123" },
};

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

const readBody = (req) => new Promise((resolve) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => resolve(data ? JSON.parse(data) : {}));
});

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/login/")) {
    const role = req.url.split("/").pop();
    const body = await readBody(req);
    const user = users[role];
    if (user && body.email === user.email && body.password === user.password) return send(res, 200, { ok: true, role });
    return send(res, 401, { ok: false, error: "invalid_credentials" });
  }
  if (req.url === "/api/seller/metrics") return send(res, 200, { revenue: 8721, orders: 312, visits: 1984, carts: 428 });
  if (req.url === "/api/orders") return send(res, 200, [{ id: 1042, product: "Pacote Neural X", status: "Enviado" }]);

  const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(root, requested);
  if (!filePath.startsWith(root)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(filePath, (error, file) => {
    if (error) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
    send(res, 200, file, types[ext] || "application/octet-stream");
  });
});

server.listen(port, () => console.log(`Neural X server running on http://localhost:${port}`));
