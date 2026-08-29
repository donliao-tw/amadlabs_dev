const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const THEME_FILE = process.env.THEME_FILE || path.join(__dirname, "data", "theme.json");

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function ensureDataDir() {
  fs.mkdirSync(path.dirname(THEME_FILE), { recursive: true });
}

function readTheme() {
  try {
    const raw = fs.readFileSync(THEME_FILE, "utf8");
    const theme = JSON.parse(raw);
    if (theme.bg === undefined) theme.bg = null;
    return theme;
  } catch (e) {
    return { stops: null, bg: null };
  }
}

function writeTheme(theme) {
  ensureDataDir();
  fs.writeFileSync(THEME_FILE, JSON.stringify(theme), "utf8");
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", service: "amadlabs-backend" }));
    return;
  }

  if (req.url === "/theme" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(readTheme()));
    return;
  }

  if (req.url === "/theme" && req.method === "POST") {
    // No auth for now — this is a public setting until SSO + permissions
    // land, at which point this route should require an authenticated
    // request with an authorized role before writing.

    readBody(req, 4096)
      .then((raw) => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch (e) {
          throw new Error("invalid json");
        }

        const stops = body.stops;
        const isValidStops =
          stops === null ||
          (Array.isArray(stops) &&
            (stops.length === 2 || stops.length === 3) &&
            stops.every((c) => typeof c === "string" && HEX_RE.test(c)));

        if (!isValidStops) {
          throw new Error("stops must be null or an array of 2-3 hex colors");
        }

        const bg = body.bg === undefined ? null : body.bg;
        const isValidBg = bg === null || (typeof bg === "string" && HEX_RE.test(bg));

        if (!isValidBg) {
          throw new Error("bg must be null or a hex color");
        }

        const theme = { stops: stops, bg: bg };
        writeTheme(theme);
        res.writeHead(200);
        res.end(JSON.stringify(theme));
      })
      .catch((err) => {
        res.writeHead(400);
        res.end(JSON.stringify({ status: "bad_request", message: err.message }));
      });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ status: "not_found", path: req.url }));
});

server.listen(PORT, () => {
  console.log(`amadlabs-backend listening on ${PORT}`);
});
