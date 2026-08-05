const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || 4173;
const root = path.resolve(process.cwd());
const users = {
  client: { email: "demo@neuralx.com", password: "neuralx123" },
  seller: { email: "seller@neuralx.com", password: "neuralx123" },
};

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  if (type === "application/json") {
    try {
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    } catch {
      res.end(JSON.stringify({ ok: false }));
    }
  } else {
    res.end(body);
  }
};

// Read body with limits and JSON parse safety
const readBody = (req, { limit = 1e6 } = {}) =>
  new Promise((resolve, reject) => {
    let data = "";
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > limit) {
        req.destroy();
        return reject(new Error("Payload too large"));
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  try {
    // Simple API routes
    if (req.method === "POST" && req.url.startsWith("/api/login/")) {
      const urlPath = req.url.split("?")[0];
      const parts = urlPath.split("/").filter(Boolean);
      const role = parts[parts.length - 1] || "";
      if (!role) return send(res, 400, { ok: false, error: "invalid_role" });

      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message === "Invalid JSON" ? "invalid_json" : "payload_too_large" });
      }

      const user = users[role];
      if (user && body.email === user.email && body.password === user.password) return send(res, 200, { ok: true, role });
      return send(res, 401, { ok: false, error: "invalid_credentials" });
    }

    if (req.url === "/api/seller/metrics") return send(res, 200, { revenue: 8721, orders: 312, visits: 1984, carts: 428 });
    if (req.url === "/api/orders") return send(res, 200, [{ id: 1042, product: "Pacote Neural X", status: "Enviado" }]);

    // Serve static files safely
    const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
    // Prevent absolute requested paths from escaping
    const filePath = path.resolve(root, "." + requested);
    if (!(filePath === root || filePath.startsWith(root + path.sep))) return send(res, 403, "Forbidden", "text/plain");

    fs.readFile(filePath, (error, file) => {
      if (error) return send(res, 404, "Not found", "text/plain");
      const ext = path.extname(filePath);
      const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
      send(res, 200, file, types[ext] || "application/octet-stream");
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    send(res, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(port, () => console.log(`Neural X server running on http://localhost:${port}`));
