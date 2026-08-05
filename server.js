const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || 4173;
const root = path.resolve(process.cwd());
const users = {
  client: { email: "demo@neuralx.com", password: "neuralx123" },
  seller: { email: "seller@neuralx.com", password: "neuralx123" },
};

// Basic in-memory rate-limit / brute force protection for demo purposes
const loginAttempts = new Map(); // ip -> { count, first }
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const defaultSecurityHeaders = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline';",
};

const send = (res, status, body, type = "application/json") => {
  const headers = Object.assign({ "Content-Type": type, "X-Content-Type-Options": "nosniff" }, defaultSecurityHeaders);
  res.writeHead(status, headers);
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

const isBlockedIp = (ip) => {
  const info = loginAttempts.get(ip);
  if (!info) return false;
  if (Date.now() - info.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return info.count >= LOGIN_LIMIT;
};

const registerFailedAttempt = (ip) => {
  const info = loginAttempts.get(ip) || { count: 0, first: Date.now() };
  if (Date.now() - info.first > LOGIN_WINDOW_MS) {
    info.count = 1;
    info.first = Date.now();
  } else {
    info.count += 1;
  }
  loginAttempts.set(ip, info);
};

const server = http.createServer(async (req, res) => {
  try {
    // Simple API routes
    if (req.method === "POST" && req.url.startsWith("/api/login/")) {
      const ip = req.socket.remoteAddress || 'unknown';
      if (isBlockedIp(ip)) return send(res, 429, { ok: false, error: 'too_many_requests' });

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

      // Honeypot check: bots may fill hidden fields
      if (body.hp) {
        // Treat as bot and increment attempts
        registerFailedAttempt(ip);
        return send(res, 400, { ok: false, error: 'bot_detected' });
      }

      const user = users[role];
      if (user && body.email === user.email && body.password === user.password) {
        // successful login -> reset attempts
        loginAttempts.delete(ip);
        return send(res, 200, { ok: true, role });
      }

      // failed login
      registerFailedAttempt(ip);
      return send(res, 401, { ok: false, error: "invalid_credentials" });
    }

    if (req.url === "/api/seller/metrics") return send(res, 200, { revenue: 8721, orders: 312, visits: 1984, carts: 428 });

    // Serve orders with image and price; support ?email=<email> filter for demo
    if (req.url.startsWith("/api/orders")) {
      const urlObj = new URL(req.url, `http://localhost:${port}`);
      const email = urlObj.searchParams.get("email") || "";
      const orders = [
        {
          id: 1042,
          product: "Pacote Neural X",
          status: "Enviado",
          price: 199.9,
          image: "/assets/placeholder.png",
          buyerEmail: "demo@neuralx.com",
        },
      ];
      const filtered = email ? orders.filter((o) => o.buyerEmail === email) : orders;
      return send(res, 200, filtered);
    }

    // Serve static files safely
    const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
    // Prevent absolute requested paths from escaping
    const filePath = path.resolve(root, "." + requested);
    if (!(filePath === root || filePath.startsWith(root + path.sep))) return send(res, 403, "Forbidden", "text/plain");

    fs.readFile(filePath, (error, file) => {
      if (error) return send(res, 404, "Not found", "text/plain");
      const ext = path.extname(filePath);
      const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
      send(res, 200, file, types[ext] || "application/octet-stream");
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    send(res, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(port, () => console.log(`Neural X server running on http://localhost:${port}`));
