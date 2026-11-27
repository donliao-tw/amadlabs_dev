// Go-live data uploads for the 禾翔 demo: one request per file (raw body), then a
// small "done" request that writes the batch's meta.json. Disabled unless
// HS_UPLOAD_CODE is set, so a missing secret never leaves it open.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = process.env.HS_UPLOAD_DIR || path.join(__dirname, "uploads");
const CODE = process.env.HS_UPLOAD_CODE || "";
const MAX_FILE = 20 * 1024 * 1024;
const EXT = new Set([".xlsx", ".xls", ".csv", ".pdf", ".docx", ".doc", ".zip", ".jpg", ".jpeg", ".png", ".heic", ".txt"]);

function codeOk(given) {
  if (!CODE || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(CODE).digest();
  return crypto.timingSafeEqual(a, b);
}

// keep letters (incl. CJK), digits, dot, dash, underscore; no path parts
function clean(s, max) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+/, "_")
    .trim()
    .slice(0, max);
}

function batchDir(batch, sender) {
  if (!/^\d{8}-\d{6}-[a-z0-9]{4}$/.test(batch || "")) return null;
  return path.join(DIR, batch + "_" + (clean(sender, 30) || "unknown"));
}

function send(res, status, obj) {
  res.writeHead(status);
  res.end(JSON.stringify(obj));
}

function handle(req, res, url) {
  if (!CODE) return send(res, 503, { status: "disabled" });
  const q = url.searchParams;
  if (!codeOk(q.get("code"))) return send(res, 403, { status: "bad_code", message: "存取碼不正確" });

  const dir = batchDir(q.get("batch"), q.get("sender"));
  if (!dir) return send(res, 400, { status: "bad_request", message: "batch" });

  if (url.pathname === "/hs-upload/file") {
    const name = clean(q.get("name"), 120);
    const ext = path.extname(name).toLowerCase();
    if (!name || !EXT.has(ext)) return send(res, 400, { status: "bad_type", message: "不支援的檔案類型" });
    if (Number(req.headers["content-length"] || 0) > MAX_FILE) return send(res, 413, { status: "too_large", message: "超過 20 MB" });

    fs.mkdirSync(dir, { recursive: true });
    let target = path.join(dir, name);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, path.basename(name, ext) + "(" + i + ")" + ext);

    const out = fs.createWriteStream(target, { flags: "wx" });
    let size = 0;
    let failed = false;
    const fail = (status, message) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.rm(target, { force: true }, () => {});
      if (!res.headersSent) send(res, status, { status: "error", message });
    };
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_FILE) { fail(413, "超過 20 MB"); req.destroy(); }
    });
    req.on("error", () => fail(400, "傳輸中斷"));
    out.on("error", () => fail(500, "儲存失敗"));
    out.on("finish", () => { if (!failed) send(res, 200, { status: "ok", name: path.basename(target), size }); });
    req.pipe(out);
    return;
  }

  if (url.pathname === "/hs-upload/done") {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 16384) req.destroy(); else chunks.push(c); });
    req.on("end", () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return send(res, 400, { status: "bad_json" }); }
      fs.mkdirSync(dir, { recursive: true });
      const meta = {
        mode: body.mode === "template" ? "template" : "raw",
        sender: clean(body.sender, 60),
        contact: clean(body.contact, 120),
        note: String(body.note || "").slice(0, 2000),
        files: Array.isArray(body.files) ? body.files.map((f) => clean(f, 120)).slice(0, 50) : [],
        at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
      send(res, 200, { status: "ok" });
    });
    return;
  }

  send(res, 404, { status: "not_found" });
}

module.exports = { handle };
