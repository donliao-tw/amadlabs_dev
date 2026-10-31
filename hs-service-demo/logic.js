(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HSLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "hs-service-demo-v5";
  var VERSION = 6;
  var ROLES = ["業務", "內勤", "管理員"];
  var TAX = 0.05;

  // key, label, group — the order here is the order shown in the matrix.
  var CAPS = [
    ["report_submit", "送出報刀", "報刀"],
    ["report_approve", "審核報刀（扣庫）", "報刀"],
    ["stock_view", "查看庫存", "庫存"],
    ["stock_edit", "入庫／調撥／盤點", "庫存"],
    ["view_price", "查看金額與單價", "金額"],
    ["sales_view", "查看銷貨憑單", "銷貨"],
    ["sales_edit", "開立／編輯銷貨憑單", "銷貨"],
    ["sales_confirm", "覆核出貨與開發票", "銷貨"],
    ["settings_edit", "庫位、品項、客戶設定", "設定"],
    ["acct_view", "查看會計（應收、發票、傳票、試算表）", "會計"],
    ["acct_edit", "登記收款", "會計"],
    ["stats_view", "查看數據統計", "統計"],
    ["audit_view", "查看批號追溯與操作紀錄", "紀錄"],
    ["manage_perms", "管理人員與權限", "權限"]
  ];
  var DEFAULT_PERMS = {
    "業務": { report_submit: true, stock_view: true, audit_view: true },
    "內勤": { report_submit: true, report_approve: true, stock_view: true, stock_edit: true, view_price: true, sales_view: true, sales_edit: true, sales_confirm: true, settings_edit: true, acct_view: true, acct_edit: true, stats_view: true, audit_view: true },
    "管理員": {}
  };
  CAPS.forEach(function (c) { DEFAULT_PERMS["管理員"][c[0]] = true; });

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function nowStr() {
    var d = new Date();
    return ymd(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
  function rng(seed) {
    var s = seed;
    return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }
  function posInt(n) { return typeof n === "number" && isFinite(n) && n > 0 && Math.floor(n) === n; }

  function expDays(exp) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.floor((new Date(exp + "T00:00:00") - t) / 86400000);
  }
  function isExpired(exp) { return expDays(exp) < 0; }

  // ---------- users / permissions ----------
  function user(S, name) {
    for (var i = 0; i < S.users.length; i++) if (S.users[i].name === name) return S.users[i];
    return null;
  }
  function role(S) { var u = user(S, S.operator); return u ? u.role : ""; }
  // manage_perms is pinned to 管理員 so the matrix can never lock everyone out.
  function can(S, cap) {
    var r = role(S);
    if (cap === "manage_perms") return r === "管理員";
    return !!(S.perms[r] && S.perms[r][cap]);
  }
  function need(S, cap) {
    if (!can(S, cap)) {
      var c = CAPS.filter(function (x) { return x[0] === cap; })[0];
      throw new Error("沒有權限：" + (c ? c[1] : cap));
    }
  }
  function setPerm(S, r, cap, on) {
    need(S, "manage_perms");
    if (cap === "manage_perms") throw new Error("這項權限固定只給管理員");
    if (ROLES.indexOf(r) < 0) throw new Error("沒有這個角色");
    if (r === "管理員") throw new Error("管理員的權限不能調整");
    S.perms[r][cap] = !!on;
    log(S, "權限調整", r + "｜" + cap + " → " + (on ? "開" : "關"));
  }
  function addUser(S, name, r) {
    need(S, "manage_perms");
    name = String(name || "").trim();
    if (!name) throw new Error("請填名稱");
    if (user(S, name)) throw new Error("已有同名人員");
    if (ROLES.indexOf(r) < 0) throw new Error("沒有這個角色");
    S.users.push({ name: name, role: r });
    log(S, "新增人員", name + "（" + r + "）");
  }
  function setUserRole(S, name, r) {
    need(S, "manage_perms");
    var u = user(S, name);
    if (!u) throw new Error("找不到人員");
    if (name === "管理員") throw new Error("內建管理員不能改角色");
    u.role = r;
    log(S, "人員角色", name + " → " + r);
  }

  // ---------- 位置座標（地圖用） ----------
  // Demo placeholders guessed from the location names: they only decide where a pin sits on
  // the map and must be confirmed (and corrected in 設定) with the customer.
  var GEO_DEFAULTS = {
    co: { lat: 24.1477, lng: 120.6736 },
    h0: { lat: 24.1823, lng: 120.6037 },
    h1: { lat: 23.9602, lng: 120.5760 },
    h2: { lat: 24.0618, lng: 120.4337 },
    h3: { lat: 24.0718, lng: 120.5422 },
    h4: { lat: 24.1372, lng: 120.7347 },
    h5: { lat: 23.9007, lng: 120.3660 },
    r0: { lat: 24.0200, lng: 120.5600, onDuty: true, lastSeen: "今天 09:40" }
  };
  function applyGeoDefaults(S) {
    S.locations.forEach(function (l) {
      var g = GEO_DEFAULTS[l.id];
      if (g && typeof l.lat !== "number") {
        l.lat = g.lat; l.lng = g.lng;
        if (l.type === "rep") { l.onDuty = !!g.onDuty; l.lastSeen = g.lastSeen || ""; }
      }
    });
  }
  // lat/lng both empty clears the pin; otherwise both must be a believable point around Taiwan.
  function setGeo(S, id, g) {
    need(S, "settings_edit");
    var l = location(S, id);
    if (!l) throw new Error("找不到庫位");
    var hasLat = g.lat !== "" && g.lat != null, hasLng = g.lng !== "" && g.lng != null;
    if (!hasLat && !hasLng) { delete l.lat; delete l.lng; }
    else {
      var lat = Number(g.lat), lng = Number(g.lng);
      if (!hasLat || !hasLng || !isFinite(lat) || !isFinite(lng)) throw new Error("緯度和經度都要填");
      if (lat < 21.5 || lat > 25.6 || lng < 119.2 || lng > 122.3) throw new Error("座標不在台灣範圍內（緯度 21.5–25.6、經度 119.2–122.3）");
      l.lat = Math.round(lat * 10000) / 10000; l.lng = Math.round(lng * 10000) / 10000;
    }
    if (l.type === "rep" && typeof g.onDuty === "boolean") {
      var was = !!l.onDuty;
      l.onDuty = g.onDuty;
      if (g.onDuty && !was) l.lastSeen = "今天 " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
    }
    log(S, "位置座標", l.name + "｜" + (typeof l.lat === "number" ? l.lat + ", " + l.lng : "清除") + (l.type === "rep" ? "｜" + (l.onDuty ? "執勤中" : "未執勤") : ""));
    return l;
  }

  // ---------- state helpers ----------
  function log(S, action, detail) {
    S.log.unshift({ ts: nowStr(), user: S.operator, action: action, detail: detail });
    if (S.log.length > 600) S.log.length = 600;
  }
  function product(S, sku) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].sku === sku) return S.products[i];
    return null;
  }
  function location(S, id) {
    for (var i = 0; i < S.locations.length; i++) if (S.locations[i].id === id) return S.locations[i];
    return null;
  }
  function locName(S, id) { var l = location(S, id); return l ? l.name : id; }
  function plates(S) { return S.products.filter(function (p) { return p.kind === "plate"; }); }
  function customer(S, id) {
    for (var i = 0; i < S.customers.length; i++) if (S.customers[i].id === id) return S.customers[i];
    return null;
  }

  function findLine(S, loc, sku, lot) {
    for (var i = 0; i < S.lots.length; i++) {
      var l = S.lots[i];
      if (l.loc === loc && l.sku === sku && l.lot === lot) return l;
    }
    return null;
  }
  function lines(S, loc, sku) {
    return S.lots.filter(function (l) { return l.loc === loc && l.sku === sku && l.qty > 0; })
      .sort(function (a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : 0; });
  }
  function lineQty(S, loc, sku, lot) { var l = findLine(S, loc, sku, lot); return l ? l.qty : 0; }
  function totalQty(S, loc, sku) {
    var n = 0;
    S.lots.forEach(function (l) { if ((loc === null || l.loc === loc) && l.sku === sku) n += l.qty; });
    return n;
  }

  // ---------- stock movements ----------
  function addStock(S, loc, sku, lot, exp, qty, reason) {
    need(S, "stock_edit");
    if (!location(S, loc)) throw new Error("找不到庫位");
    if (!product(S, sku)) throw new Error("找不到品項");
    if (!lot) throw new Error("批號必填");
    if (!exp) throw new Error("效期必填");
    if (!posInt(qty)) throw new Error("數量必須是正整數");
    var line = findLine(S, loc, sku, lot);
    if (line) line.qty += qty;
    else { line = { id: uid("L"), loc: loc, sku: sku, lot: lot, exp: exp, qty: qty }; S.lots.push(line); }
    log(S, reason || "入庫", locName(S, loc) + "｜" + sku + "｜批號 " + lot + "｜效期 " + line.exp + "｜+" + qty);
    return line;
  }

  function adjustStock(S, loc, sku, lot, newQty, reason) {
    need(S, "stock_edit");
    var line = findLine(S, loc, sku, lot);
    if (!line) throw new Error("找不到庫存");
    if (typeof newQty !== "number" || newQty < 0 || Math.floor(newQty) !== newQty) throw new Error("數量必須是 0 以上的整數");
    var before = line.qty;
    line.qty = newQty;
    log(S, reason || "盤點調整", locName(S, loc) + "｜" + sku + "｜批號 " + lot + "｜" + before + " → " + newQty);
  }

  function transfer(S, from, to, sku, lot, qty) {
    need(S, "stock_edit");
    if (from === to) throw new Error("來源與目的庫位相同");
    if (!posInt(qty)) throw new Error("數量必須是正整數");
    var line = findLine(S, from, sku, lot);
    if (!line || line.qty < qty) throw new Error("來源庫存不足");
    if (isExpired(line.exp)) throw new Error("已過期批號不可調撥");
    line.qty -= qty;
    var dest = findLine(S, to, sku, lot);
    if (dest) dest.qty += qty;
    else S.lots.push({ id: uid("L"), loc: to, sku: sku, lot: lot, exp: line.exp, qty: qty });
    log(S, "調撥", sku + "｜批號 " + lot + "｜" + locName(S, from) + " → " + locName(S, to) + "｜" + qty);
  }

  // Shared by 報刀 approval and 銷貨 confirmation: aggregate what a document
  // consumes per (location, sku, lot), refuse expired or short lots, then deduct.
  function consume(S, items) {
    var need_ = {};
    items.forEach(function (it) {
      var k = it.loc + "\u0000" + it.sku + "\u0000" + it.lot;
      need_[k] = (need_[k] || 0) + it.qty;
    });
    var keys = Object.keys(need_);
    keys.forEach(function (k) {
      var p = k.split("\u0000");
      var line = findLine(S, p[0], p[1], p[2]);
      if (!line) throw new Error(locName(S, p[0]) + " 沒有 " + p[1] + " 批號 " + p[2]);
      if (isExpired(line.exp)) throw new Error("批號 " + p[2] + " 已過期，不可使用");
      if (line.qty < need_[k]) throw new Error(p[1] + " 批號 " + p[2] + " 庫存不足（剩 " + line.qty + "）");
    });
    keys.forEach(function (k) {
      var p = k.split("\u0000");
      findLine(S, p[0], p[1], p[2]).qty -= need_[k];
    });
  }

  // ---------- 骨釘盒 (a physical rack the customer lays out themselves) ----------
  // A box is a grid: one label per column (any text, e.g. a size), and 1-4 row bands
  // with a free name each (e.g. a screw type). Every slot is independent: filled or
  // empty. A filled slot is one 骨釘 of (band name, column label); stock lines in
  // S.lots are kept in step with the slots by syncBox.
  function defaultLabels() {
    var out = [];
    for (var n = 10; n <= 48; n += 2) { out.push(String(n)); out.push(String(n)); }
    return out;
  }
  function cleanKey(x) { return String(x).replace(/\s+/g, ""); }
  function skuFor(bandName, label) { return "SC-" + cleanKey(bandName) + "-" + cleanKey(label); }
  function ensureProduct(S, bandName, label) {
    var sku = skuFor(bandName, label);
    if (!product(S, sku)) {
      S.products.push({ sku: sku, name: bandName + " " + label, price: 800, group: bandName + " 骨釘", kind: "screw", series: bandName, len: String(label) });
    }
    return sku;
  }
  function box(S, id) {
    for (var i = 0; i < S.boxes.length; i++) if (S.boxes[i].id === id) return S.boxes[i];
    return null;
  }
  function slotId(boxId, bi, i) { return boxId + "|" + bi + "|" + i; }
  function parseSlot(S, id) {
    var p = String(id).split("|"), b = box(S, p[0]);
    if (!b) return null;
    var band = b.bands[+p[1]];
    var i = +p[2];
    if (!band || !(i >= 0 && i < band.fill.length)) return null;
    return { box: b, bi: +p[1], band: band, i: i };
  }
  function slotLabel(box, i) { return box.labels[i % box.labels.length]; }
  // Cells of one band, row by row, for drawing.
  function boxCells(box, bi) {
    var band = box.bands[bi], cols = box.labels.length, out = [];
    band.fill.forEach(function (v, i) { out.push({ i: i, r: Math.floor(i / cols), c: i % cols, label: box.labels[i % cols], on: !!v }); });
    return out;
  }
  function filledSlots(S, bx) {
    var out = [];
    bx.bands.forEach(function (band, bi) {
      band.fill.forEach(function (v, i) {
        if (v) out.push({ id: slotId(bx.id, bi, i), bi: bi, i: i, sku: skuFor(band.name, slotLabel(bx, i)) });
      });
    });
    return out;
  }
  function boxTotal(S, bx) {
    var n = 0;
    bx.bands.forEach(function (band) { band.fill.forEach(function (v) { if (v) n++; }); });
    return n;
  }
  function bandTotal(band) { var n = 0; band.fill.forEach(function (v) { if (v) n++; }); return n; }

  // Make the stock lines match what is physically in the box.
  function syncBox(S, bx) {
    var counts = {};
    bx.bands.forEach(function (band) {
      band.fill.forEach(function (v, i) {
        if (!v) return;
        var sku = ensureProduct(S, band.name, slotLabel(bx, i));
        counts[sku] = (counts[sku] || 0) + 1;
      });
    });
    var all = Object.keys(counts).concat((bx.synced || []).filter(function (k) { return !(k in counts); }));
    all.forEach(function (sku) {
      var q = counts[sku] || 0, line = findLine(S, bx.loc, sku, bx.lot);
      if (line) { line.qty = q; line.exp = bx.exp; }
      else if (q > 0) S.lots.push({ id: uid("L"), loc: bx.loc, sku: sku, lot: bx.lot, exp: bx.exp, qty: q });
    });
    bx.synced = Object.keys(counts);
  }

  function checkBoxConfig(S, c) {
    if (!String(c.name || "").trim()) throw new Error("請填盒子名稱");
    if (!location(S, c.loc)) throw new Error("請選位置");
    if (!String(c.lot || "").trim()) throw new Error("批號必填");
    if (!c.exp) throw new Error("效期必填");
    if (!c.labels || !c.labels.length) throw new Error("至少要有一欄標示");
    if (c.labels.length > 80) throw new Error("最多 80 欄");
    c.labels.forEach(function (n) { if (!String(n).trim()) throw new Error("標示不能是空的"); });
    if (!c.bands || !c.bands.length) throw new Error("至少要有一個區塊");
    if (c.bands.length > 4) throw new Error("最多 4 個區塊");
    c.bands.forEach(function (b) {
      if (!String(b.name || "").trim()) throw new Error("區塊要有名稱");
      if (!posInt(b.rows) || b.rows > 30) throw new Error("列數必須是 1 到 30 的整數");
    });
  }

  function createBox(S, c) {
    need(S, "settings_edit");
    checkBoxConfig(S, c);
    var cols = c.labels.length;
    var b = { id: uid("B"), name: String(c.name).trim(), loc: c.loc, lot: String(c.lot).trim(), exp: c.exp, synced: [],
      labels: c.labels.map(function (x) { return String(x).trim(); }),
      bands: c.bands.map(function (x) { return { name: String(x.name).trim(), rows: x.rows, fill: new Array(x.rows * cols).fill(0) }; }) };
    S.boxes.push(b);
    log(S, "新增骨釘盒", b.name + "｜" + locName(S, b.loc) + "｜" + b.labels.length + " 欄");
    return b;
  }

  // Layout edits are allowed as long as no filled slot is removed, moved or renamed.
  function updateBox(S, id, c) {
    need(S, "settings_edit");
    var b = box(S, id);
    if (!b) throw new Error("找不到骨釘盒");
    checkBoxConfig(S, c);
    var filled = boxTotal(S, b) > 0;
    if (filled && (c.loc !== b.loc || String(c.lot).trim() !== b.lot)) throw new Error("盒內還有骨釘，位置與批號要用「調撥整盒」處理");
    var oldCols = b.labels.length, newLabels = c.labels.map(function (x) { return String(x).trim(); }), newCols = newLabels.length;
    b.bands.forEach(function (ob, bi) {
      ob.fill.forEach(function (v, i) {
        if (!v) return;
        var r = Math.floor(i / oldCols), col = i % oldCols, nb = c.bands[bi];
        var same = nb && String(nb.name).trim() === ob.name && r < nb.rows && col < newCols && newLabels[col] === b.labels[col];
        if (!same) throw new Error("這樣改會影響已放入的骨釘（區塊 " + (bi + 1) + " 第 " + (r + 1) + " 列第 " + (col + 1) + " 欄），請先把那格清空");
      });
    });
    var newBands = c.bands.map(function (nb, bi) {
      var ob = b.bands[bi], fill = new Array(nb.rows * newCols).fill(0);
      if (ob) ob.fill.forEach(function (v, i) { if (v) fill[Math.floor(i / oldCols) * newCols + (i % oldCols)] = 1; });
      return { name: String(nb.name).trim(), rows: nb.rows, fill: fill };
    });
    b.name = String(c.name).trim(); b.loc = c.loc; b.lot = String(c.lot).trim(); b.exp = c.exp;
    b.labels = newLabels; b.bands = newBands;
    syncBox(S, b);
    log(S, "骨釘盒設定", b.name + "｜" + b.labels.length + " 欄｜" + b.bands.map(function (x) { return x.name + "×" + x.rows; }).join("、"));
    return b;
  }

  function deleteBox(S, id) {
    need(S, "settings_edit");
    var b = box(S, id);
    if (!b) throw new Error("找不到骨釘盒");
    if (boxTotal(S, b) > 0) throw new Error("盒內還有骨釘，不能刪除");
    S.boxes = S.boxes.filter(function (x) { return x.id !== id; });
    log(S, "刪除骨釘盒", b.name);
  }

  // Flip exactly one slot: filled -> empty (-1) or empty -> filled (+1).
  function toggleSlot(S, id, bi, i) {
    need(S, "stock_edit");
    var b = box(S, id);
    if (!b) throw new Error("找不到骨釘盒");
    var band = b.bands[bi];
    if (!band || !(i >= 0 && i < band.fill.length)) throw new Error("沒有這一格");
    var on = !band.fill[i];
    band.fill[i] = on ? 1 : 0;
    syncBox(S, b);
    log(S, "盤點調整", b.name + "｜" + band.name + " " + slotLabel(b, i) + "｜" + (on ? "+1" : "-1"));
    return on;
  }

  // Move the whole box (and everything in it) to another location in one go.
  function moveBox(S, id, to) {
    need(S, "stock_edit");
    var b = box(S, id);
    if (!b) throw new Error("找不到骨釘盒");
    if (!location(S, to)) throw new Error("請選目的位置");
    if (to === b.loc) throw new Error("目的位置和現在相同");
    if (isExpired(b.exp)) throw new Error("已過期的盒子不能調撥");
    var from = b.loc, n = boxTotal(S, b);
    (b.synced || []).forEach(function (sku) {
      var line = findLine(S, from, sku, b.lot);
      if (line) line.qty = 0;
    });
    b.loc = to;
    syncBox(S, b);
    log(S, "調撥整盒", b.name + "｜" + locName(S, from) + " → " + locName(S, to) + "｜" + n + " 支");
    return n;
  }

  // ---------- 報刀 ----------
  function reportItems(r) { return r.main.concat(r.screws); }

  function submitReport(S, d) {
    need(S, "report_submit");
    if (!d.date) throw new Error("請填日期");
    if (!location(S, d.hospital)) throw new Error("請選醫院");
    if (!String(d.doctor || "").trim()) throw new Error("請填醫師");
    if (!location(S, d.loc)) throw new Error("請選扣庫來源");
    var items = d.main.concat(d.screws);
    if (!items.length) throw new Error("至少要有一個品項");
    var seen = {};
    items.forEach(function (it) {
      if (!product(S, it.sku)) throw new Error("品項不存在：" + it.sku);
      if (!it.lot) throw new Error("品項缺批號：" + it.sku);
      if (!posInt(it.qty)) throw new Error("數量必須是正整數：" + it.sku);
      if (it.slots) {
        if (it.slots.length !== it.qty) throw new Error("格子數與數量不一致：" + it.sku);
        it.slots.forEach(function (id) {
          var sl = parseSlot(S, id);
          if (!sl) throw new Error("找不到格子");
          if (!sl.band.fill[sl.i]) throw new Error("這一格沒有骨釘：" + sl.band.name + " " + slotLabel(sl.box, sl.i));
          if (sl.box.loc !== d.loc) throw new Error("格子不在扣庫來源：" + sl.box.name);
          if (sl.box.lot !== it.lot || skuFor(sl.band.name, slotLabel(sl.box, sl.i)) !== it.sku) throw new Error("格子和品項不符");
          if (seen[id]) throw new Error("同一格不能選兩次");
          seen[id] = 1;
        });
      }
    });
    var r = {
      id: uid("R"), date: d.date, hospital: d.hospital, doctor: String(d.doctor).trim(),
      loc: d.loc, note: d.note || "", status: "pending",
      main: d.main.map(function (x) { return { sku: x.sku, lot: x.lot, qty: x.qty, scrap: !!x.scrap }; }),
      screws: d.screws.map(function (x) { return { sku: x.sku, lot: x.lot, qty: x.qty, scrap: !!x.scrap, slots: x.slots ? x.slots.slice() : undefined }; }),
      createdBy: S.operator, createdAt: nowStr(), reviewedBy: "", reviewedAt: ""
    };
    S.reports.unshift(r);
    log(S, "報刀送出", r.date + "｜" + locName(S, r.hospital) + "｜" + r.doctor + "｜" + items.length + " 項");
    return r;
  }

  function approveReport(S, id) {
    need(S, "report_approve");
    var r = S.reports.filter(function (x) { return x.id === id; })[0];
    if (!r) throw new Error("找不到報刀單");
    if (r.status !== "pending") throw new Error("這張單已處理過");
    var byLine = r.main.slice(), slotIds = [];
    r.screws.forEach(function (it) { if (it.slots) it.slots.forEach(function (sid) { slotIds.push(sid); }); else byLine.push(it); });
    slotIds.forEach(function (sid) {
      var sl = parseSlot(S, sid);
      if (!sl || !sl.band.fill[sl.i]) throw new Error("有一格骨釘已經被用掉或移走，請退回這張單重新選");
      if (sl.box.loc !== r.loc) throw new Error("骨釘盒已不在扣庫來源（" + locName(S, r.loc) + "）");
      if (isExpired(sl.box.exp)) throw new Error("批號 " + sl.box.lot + " 已過期，不可使用");
    });
    consume(S, byLine.map(function (it) { return { loc: r.loc, sku: it.sku, lot: it.lot, qty: it.qty }; }));
    var touched = {};
    slotIds.forEach(function (sid) {
      var sl = parseSlot(S, sid);
      sl.band.fill[sl.i] = 0;
      touched[sl.box.id] = sl.box;
    });
    Object.keys(touched).forEach(function (k) { syncBox(S, touched[k]); });
    r.status = "approved"; r.reviewedBy = S.operator; r.reviewedAt = nowStr();
    log(S, "報刀審核通過", r.date + "｜" + locName(S, r.hospital) + "｜" + r.doctor + "｜扣庫 " + locName(S, r.loc));
    return r;
  }

  function rejectReport(S, id, reason) {
    need(S, "report_approve");
    var r = S.reports.filter(function (x) { return x.id === id; })[0];
    if (!r || r.status !== "pending") throw new Error("這張單已處理過");
    r.status = "rejected"; r.reviewedBy = S.operator; r.reviewedAt = nowStr();
    if (reason) r.note = (r.note ? r.note + "；" : "") + "退回原因：" + reason;
    log(S, "報刀退回", r.date + "｜" + locName(S, r.hospital) + "｜" + r.doctor + (reason ? "｜" + reason : ""));
    return r;
  }

  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var STATUS = { pending: "待審核", approved: "已審核", rejected: "退回" };
  function reportsCSV(S) {
    var rows = [["日期", "醫院", "醫師", "扣庫來源", "類型", "型號", "品名", "數量", "批號", "報廢", "備註", "狀態"]];
    S.reports.slice().reverse().forEach(function (r) {
      [["骨板", r.main], ["骨釘", r.screws]].forEach(function (g) {
        g[1].forEach(function (it) {
          var p = product(S, it.sku);
          rows.push([r.date, locName(S, r.hospital), r.doctor, locName(S, r.loc), g[0], it.sku,
            p ? p.name : "", it.qty, it.lot, it.scrap ? "是" : "", r.note, STATUS[r.status]]);
        });
      });
    });
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
  }

  // ---------- 銷貨憑單 ----------
  var SALES_STATUS = { draft: "草稿", confirmed: "已覆核出貨" };

  function salesTotals(order) {
    var sum = 0, qty = 0;
    order.lines.forEach(function (l) { sum += l.qty * l.price; qty += l.qty; });
    var net, tax, total;
    if (order.taxMode === "incl") { total = Math.round(sum); net = Math.round(total / (1 + TAX)); tax = total - net; }
    else { net = Math.round(sum); tax = Math.round(net * TAX); total = net + tax; }
    return { net: net, tax: tax, total: total, qty: qty };
  }
  function nextSalesNo(S, date) {
    var prefix = String(date).replace(/-/g, "");
    var n = S.sales.filter(function (o) { return o.no.indexOf(prefix) === 0; }).length + 1;
    return prefix + (n < 10 ? "00" : n < 100 ? "0" : "") + n;
  }

  function validateSales(S, d) {
    if (!d.date) throw new Error("請填銷貨日期");
    if (!customer(S, d.customer)) throw new Error("請選客戶");
    if (!d.lines.length) throw new Error("至少要有一筆明細");
    d.lines.forEach(function (l, i) {
      if (!product(S, l.sku)) throw new Error("第 " + (i + 1) + " 筆品項不存在");
      if (product(S, l.sku).kind === "screw") throw new Error("第 " + (i + 1) + " 筆是骨釘，骨釘走報刀，銷貨憑單先不支援");
      if (!location(S, l.loc)) throw new Error("第 " + (i + 1) + " 筆缺倉庫");
      if (!l.lot) throw new Error("第 " + (i + 1) + " 筆缺批號");
      if (!posInt(l.qty)) throw new Error("第 " + (i + 1) + " 筆數量必須是正整數");
      if (typeof l.price !== "number" || l.price < 0) throw new Error("第 " + (i + 1) + " 筆單價錯誤");
    });
  }

  function saveSales(S, d) {
    need(S, "sales_edit");
    validateSales(S, d);
    var copy = {
      date: d.date, customer: d.customer, currency: "NTD", taxMode: d.taxMode === "excl" ? "excl" : "incl",
      salesRep: d.salesRep || "", dept: d.dept || "", note: d.note || "",
      lines: d.lines.map(function (l) { return { sku: l.sku, loc: l.loc, lot: l.lot, qty: l.qty, price: l.price }; })
    };
    var o;
    if (d.id) {
      o = S.sales.filter(function (x) { return x.id === d.id; })[0];
      if (!o) throw new Error("找不到憑單");
      if (o.status !== "draft") throw new Error("已覆核的憑單不能再修改");
      Object.keys(copy).forEach(function (k) { o[k] = copy[k]; });
      log(S, "銷貨憑單修改", o.no);
    } else {
      o = Object.assign({ id: uid("S"), no: nextSalesNo(S, copy.date), status: "draft", maker: S.operator, reviewer: "", invoice: "", createdAt: nowStr() }, copy);
      S.sales.unshift(o);
      log(S, "銷貨憑單建立", o.no + "｜" + customer(S, o.customer).name);
    }
    return o;
  }

  function confirmSales(S, id) {
    need(S, "sales_confirm");
    var o = S.sales.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("找不到憑單");
    if (o.status !== "draft") throw new Error("這張憑單已覆核");
    consume(S, o.lines);
    o.status = "confirmed"; o.reviewer = S.operator; o.confirmedAt = nowStr();
    postSalesJournal(S, o, ymd(new Date()));
    log(S, "銷貨憑單覆核出貨", o.no + "｜扣庫 " + o.lines.length + " 筆｜已產生傳票");
    return o;
  }

  // Demo only: a real invoice number comes from the Ministry of Finance e-invoice platform.
  function issueInvoice(S, id) {
    need(S, "sales_confirm");
    var o = S.sales.filter(function (x) { return x.id === id; })[0];
    if (!o || o.status !== "confirmed") throw new Error("要先覆核出貨才能開發票");
    if (o.invoice) throw new Error("已開過發票");
    var n = S.sales.filter(function (x) { return x.invoice; }).length + 1;
    o.invoice = "ZZ" + String(10000000 + n * 37);
    log(S, "開立發票(示範)", o.no + "｜" + o.invoice);
    return o;
  }

  // ---------- 會計 (demo scope: 銷貨 -> 傳票 -> 應收 -> 收款) ----------
  // Account codes are demo placeholders, not a real chart of accounts: a bookkeeper
  // has to supply the company's own before this is used for real.
  var ACCOUNTS = [
    { code: "1100", name: "銀行存款", type: "資產" },
    { code: "1200", name: "應收帳款", type: "資產" },
    { code: "2200", name: "銷項稅額", type: "負債" },
    { code: "4100", name: "銷貨收入", type: "收入" }
  ];
  function accountName(code) {
    for (var i = 0; i < ACCOUNTS.length; i++) if (ACCOUNTS[i].code === code) return ACCOUNTS[i].name;
    return code;
  }
  function shiftDate(str, n) {
    var d = new Date(str + "T00:00:00");
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function postJournal(S, date, memo, source, ls) {
    var dr = 0, cr = 0;
    ls.forEach(function (l) { dr += l.dr || 0; cr += l.cr || 0; });
    if (Math.round(dr) !== Math.round(cr)) throw new Error("傳票借貸不平衡");
    var prefix = "J" + String(date).replace(/-/g, "");
    var n = S.journals.filter(function (j) { return j.no.indexOf(prefix) === 0; }).length + 1;
    var j = { id: uid("J"), no: prefix + (n < 10 ? "00" : n < 100 ? "0" : "") + n, date: date, memo: memo, source: source, by: S.operator,
      lines: ls.map(function (l) { return { acct: l.acct, dr: l.dr || 0, cr: l.cr || 0 }; }) };
    S.journals.unshift(j);
    return j;
  }
  function postSalesJournal(S, o, date) {
    var t = salesTotals(o);
    return postJournal(S, date, "銷貨 " + o.no, "sales:" + o.id, [{ acct: "1200", dr: t.total }, { acct: "4100", cr: t.net }, { acct: "2200", cr: t.tax }]);
  }
  function orderTotal(o) { return salesTotals(o).total; }
  function orderPaid(S, o) {
    var n = 0;
    S.payments.forEach(function (p) { if (p.orderId === o.id) n += p.amount; });
    return n;
  }
  function orderBalance(S, o) { return orderTotal(o) - orderPaid(S, o); }

  function receivePayment(S, orderId, amount, date, method) {
    need(S, "acct_edit");
    var o = S.sales.filter(function (x) { return x.id === orderId; })[0];
    if (!o || o.status !== "confirmed") throw new Error("只有已覆核的憑單才能收款");
    amount = Math.round(Number(amount));
    if (!(amount > 0)) throw new Error("金額必須大於 0");
    var bal = orderBalance(S, o);
    if (amount > bal) throw new Error("收款金額超過未收餘額（" + bal + "）");
    if (!date) throw new Error("請填收款日期");
    var pay = { id: uid("P"), orderId: orderId, date: date, amount: amount, method: method || "匯款", by: S.operator };
    S.payments.push(pay);
    postJournal(S, date, "收款 " + o.no, "pay:" + pay.id, [{ acct: "1100", dr: amount }, { acct: "1200", cr: amount }]);
    log(S, "收款登記", o.no + "｜" + amount + "｜" + pay.method);
    return pay;
  }

  // Unpaid confirmed orders, oldest first; days = age since the sales date.
  function arRows(S) {
    return S.sales.filter(function (o) { return o.status === "confirmed"; }).map(function (o) {
      return { o: o, total: orderTotal(o), paid: orderPaid(S, o), balance: orderBalance(S, o), days: -expDays(o.date) };
    }).filter(function (r) { return r.balance > 0; }).sort(function (a, b) { return b.days - a.days; });
  }
  function arByCustomer(S) {
    var map = {}, order = [];
    arRows(S).forEach(function (r) {
      var c = customer(S, r.o.customer), key = r.o.customer;
      if (!map[key]) { map[key] = { customer: c, b0: 0, b1: 0, b2: 0, b3: 0, total: 0 }; order.push(key); }
      var g = map[key], k = r.days <= 30 ? "b0" : r.days <= 60 ? "b1" : r.days <= 90 ? "b2" : "b3";
      g[k] += r.balance; g.total += r.balance;
    });
    return order.map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
  }
  function invoiceRows(S) {
    return S.sales.filter(function (o) { return o.status === "confirmed" && o.invoice; })
      .map(function (o) { return { o: o, t: salesTotals(o) }; }).sort(function (a, b) { return a.o.date < b.o.date ? 1 : -1; });
  }
  function trialBalance(S) {
    return ACCOUNTS.map(function (a) {
      var dr = 0, cr = 0;
      S.journals.forEach(function (j) { j.lines.forEach(function (l) { if (l.acct === a.code) { dr += l.dr; cr += l.cr; } }); });
      return { code: a.code, name: a.name, type: a.type, dr: dr, cr: cr, balance: dr - cr };
    });
  }

  // ---------- 統計 ----------
  function monthKey(d) { return String(d).slice(0, 7); }
  function lastMonths(n) {
    var out = [], now = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(x.getFullYear() + "-" + pad(x.getMonth() + 1));
    }
    return out;
  }
  function reportStats(S, months) {
    var res = { byMonth: {}, byHospital: {}, byDoctor: {}, items: {}, scrap: 0, qty: 0, count: 0 };
    months.forEach(function (m) { res.byMonth[m] = 0; });
    S.reports.forEach(function (r) {
      if (r.status !== "approved") return;
      var m = monthKey(r.date);
      if (!(m in res.byMonth)) return;
      res.count++; res.byMonth[m]++;
      var hn = locName(S, r.hospital);
      res.byHospital[hn] = (res.byHospital[hn] || 0) + 1;
      res.byDoctor[r.doctor] = (res.byDoctor[r.doctor] || 0) + 1;
      reportItems(r).forEach(function (it) {
        res.qty += it.qty;
        if (it.scrap) res.scrap += it.qty;
        var p = product(S, it.sku), key = (p && p.kind === "screw" ? "骨釘 " : "骨板 ") + (p ? p.name : it.sku);
        res.items[key] = (res.items[key] || 0) + it.qty;
      });
    });
    return res;
  }
  function salesStats(S, months) {
    var res = { byMonth: {}, byCustomer: {}, total: 0 };
    months.forEach(function (m) { res.byMonth[m] = 0; });
    S.sales.forEach(function (o) {
      if (o.status !== "confirmed") return;
      var m = monthKey(o.date);
      if (!(m in res.byMonth)) return;
      var t = salesTotals(o), c = customer(S, o.customer), name = c ? c.name : o.customer;
      res.byMonth[m] += t.net; res.total += t.net;
      res.byCustomer[name] = (res.byCustomer[name] || 0) + t.net;
    });
    return res;
  }

  // ---------- tracing ----------
  function trace(S, q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return null;
    var hit = function (sku, lot) {
      return String(lot).toLowerCase().indexOf(q) >= 0 || String(sku).toLowerCase().indexOf(q) >= 0;
    };
    var stock = S.lots.filter(function (l) { return l.qty > 0 && hit(l.sku, l.lot); });
    var used = [];
    S.reports.forEach(function (r) {
      reportItems(r).forEach(function (it) { if (hit(it.sku, it.lot)) used.push({ r: r, it: it }); });
    });
    var sold = [];
    S.sales.forEach(function (o) {
      if (o.status !== "confirmed") return;
      o.lines.forEach(function (l) { if (hit(l.sku, l.lot)) sold.push({ o: o, l: l }); });
    });
    var logs = S.log.filter(function (e) { return e.detail.toLowerCase().indexOf(q) >= 0; });
    return { stock: stock, used: used, sold: sold, logs: logs };
  }

  // ---------- seed ----------
  function seed() {
    var r = rng(20261031);
    var S = {
      v: VERSION, operator: "內勤-小美",
      users: [
        { name: "業務-小胖", role: "業務" }, { name: "業務-阿明", role: "業務" },
        { name: "內勤-小美", role: "內勤" }, { name: "管理員", role: "管理員" }
      ],
      perms: JSON.parse(JSON.stringify(DEFAULT_PERMS)),
      locations: [{ id: "co", name: "公司倉", type: "company" }],
      customers: [
        { id: "c101", code: "101", name: "示範醫院（骨科部）", addr: "台中市示範區範例路 1 號", contact: "王小姐", tel: "04-2000-0001" },
        { id: "c102", code: "102", name: "範例醫療器材行", addr: "彰化縣範例鎮示範街 28 號", contact: "李先生", tel: "04-7000-0002" },
        { id: "c103", code: "103", name: "測試聯合診所", addr: "雲林縣示範市測試路 5 號", contact: "陳先生", tel: "05-5000-0003" }
      ],
      products: [], lots: [], reports: [], sales: [], payments: [], journals: [], log: []
    };
    ["中榮", "員基", "鹿基", "彰基", "803", "二基"].forEach(function (n, i) {
      S.locations.push({ id: "h" + i, name: n, type: "hospital" });
    });
    S.locations.push({ id: "r0", name: "小胖移動庫存", type: "rep" });
    applyGeoDefaults(S);

    var holes = [[3, "046"], [5, "058"], [7, "074"], [9, "086"], [11, "102"]];
    [["橈骨遠端掌側鎖定骨板，標準型 (Radius)", [["1", "左寬"], ["2", "右寬"]]],
     ["橈骨遠端掌側鎖定骨板，窄型 (Radius)", [["3", "左窄"], ["4", "右窄"]]]].forEach(function (g) {
      g[1].forEach(function (side) {
        holes.forEach(function (h) {
          S.products.push({ sku: "4R30" + side[0] + h[1], name: side[1] + " " + h[0] + "孔", price: 7000, group: g[0], kind: "plate" });
        });
      });
    });
    S.products.push({ sku: "4C310R04", name: "Hook15 右4", price: 9500, group: "鎖骨鉤型骨板 (Hook)", kind: "plate" });
    S.products.push({ sku: "4C310L04", name: "Hook15 左4", price: 9500, group: "鎖骨鉤型骨板 (Hook)", kind: "plate" });

    var plateLots = [["2402270013", addDays(55)], ["2410100021", addDays(520)], ["2504150007", addDays(880)]];
    plates(S).forEach(function (p) {
      var lot = plateLots[Math.floor(r() * 3)];
      S.lots.push({ id: uid("L"), loc: "co", sku: p.sku, lot: lot[0], exp: lot[1], qty: 4 + Math.floor(r() * 9) });
      ["h0", "h1", "h2", "h3", "h4", "h5", "r0"].forEach(function (loc) {
        if (r() < 0.45) {
          var l2 = plateLots[1 + Math.floor(r() * 2)];
          S.lots.push({ id: uid("L"), loc: loc, sku: p.sku, lot: l2[0], exp: l2[1], qty: 1 + Math.floor(r() * 2) });
        }
      });
    });
    S.lots.push({ id: uid("L"), loc: "h4", sku: "4C310R04", lot: "2210120008", exp: addDays(-20), qty: 1 });

    S.boxes = [];
    function mkBox(name, loc, lot, bands, fillRate) {
      var labels = defaultLabels(), cols = labels.length;
      var b = { id: uid("B"), name: name, loc: loc, lot: lot, exp: addDays(420), labels: labels, synced: [],
        bands: bands.map(function (x) { return { name: x[0], rows: x[1], fill: new Array(x[1] * cols).fill(0) }; }) };
      b.bands.forEach(function (band) {
        for (var i = 0; i < band.fill.length; i++) band.fill[i] = r() < fillRate ? 1 : 0;
      });
      S.boxes.push(b);
      syncBox(S, b);
    }
    var two = [["3.5 VALS 鎖定骨釘", 5], ["3.5 CS 皮質骨釘", 6]];
    mkBox("3.5 VA 上肢器械 A盒", "co", "SL35-2403", two, 0.6);
    mkBox("3.5 VA 上肢器械 B盒", "co", "SL35-2406", two, 0.5);
    mkBox("3.5 VA 上肢器械（中榮）", "h0", "SL35-2403", two, 0.28);
    mkBox("3.5 VA 上肢器械（員基）", "h1", "SL35-2403", two, 0.25);
    mkBox("3.5 VA 上肢器械（803）", "h4", "SL35-2406", two, 0.3);
    mkBox("3.5 VA 上肢器械（小胖）", "r0", "SL35-2403", two, 0.3);
    mkBox("2.7 小骨釘盒", "co", "SL27-2404", [["2.7 骨釘", 11]], 0.4);
    S.lots = S.lots.filter(function (l) { return l.qty > 0; });

    S.log.unshift({ ts: nowStr(), user: "系統", action: "初始化", detail: "載入示範資料" });
    seedReports(S);
    seedSales(S);
    seedHistory(S);
    S.operator = "內勤-小美";
    return S;
  }

  function seedReports(S) {
    var docs = ["林醫師", "陳醫師", "黃醫師"];
    var reps = ["業務-小胖", "業務-阿明", "業務-小胖"];
    ["h4", "h0", "h1"].forEach(function (hid, i) {
      var plate = null;
      S.lots.forEach(function (l) {
        var p = product(S, l.sku);
        if (!plate && l.loc === hid && p && p.kind === "plate" && l.qty > 0 && !isExpired(l.exp)) plate = l;
      });
      var bx = S.boxes.filter(function (b) { return b.loc === hid; })[0];
      var slots = bx ? filledSlots(S, bx).slice(0, 2) : [];
      if (!plate || slots.length < 2) return;
      S.operator = reps[i];
      var rep = submitReport(S, {
        date: addDays(-(8 - i * 3)), hospital: hid, doctor: docs[i], loc: hid, note: i === 1 ? "補貨：備貨1" : "",
        main: [{ sku: plate.sku, lot: plate.lot, qty: 1 }],
        screws: [{ sku: slots[0].sku, lot: bx.lot, qty: 1, slots: [slots[0].id] }, { sku: slots[1].sku, lot: bx.lot, qty: 1, scrap: true, slots: [slots[1].id] }]
      });
      if (i < 2) { S.operator = "內勤-小美"; approveReport(S, rep.id); }
    });
  }

  // Backdated, already-approved activity so the statistics and the ledger are not empty.
  // It does not touch stock: it stands for what already happened before the demo started.
  function seedHistory(S) {
    var r = rng(77123);
    var docs = ["林醫師", "陳醫師", "黃醫師", "吳醫師", "張醫師", "李醫師", "周醫師", "蔡醫師"];
    var reps = ["業務-小胖", "業務-阿明"];
    var pl = plates(S);
    var screws = S.products.filter(function (p) { return p.kind === "screw"; });
    var hospitals = S.locations.filter(function (l) { return l.type === "hospital"; });
    var lotOf = function (sku) {
      var ln = S.lots.filter(function (l) { return l.sku === sku; })[0];
      return ln ? ln.lot : "2410100021";
    };
    for (var i = 0; i < 44; i++) {
      var date = addDays(-(4 + Math.floor(r() * 165)));
      var hosp = hospitals[Math.floor(r() * hospitals.length)];
      var main = [], sc = [];
      for (var k = 0, n1 = 1 + Math.floor(r() * 2); k < n1; k++) {
        var p = pl[Math.floor(r() * pl.length)];
        main.push({ sku: p.sku, lot: lotOf(p.sku), qty: 1, scrap: false });
      }
      for (var k2 = 0, n2 = Math.floor(r() * 4); k2 < n2 && screws.length; k2++) {
        var sp = screws[Math.floor(r() * screws.length)];
        sc.push({ sku: sp.sku, lot: S.boxes[Math.floor(r() * S.boxes.length)].lot, qty: 1, scrap: r() < 0.15 });
      }
      S.reports.push({ id: uid("R"), date: date, hospital: hosp.id, doctor: docs[Math.floor(r() * docs.length)], loc: hosp.id, note: "", status: "approved",
        main: main, screws: sc, createdBy: reps[Math.floor(r() * 2)], createdAt: date + " 09:00:00", reviewedBy: "內勤-小美", reviewedAt: date + " 17:00:00" });
    }
    S.reports.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    S.operator = "內勤-小美";
    var invN = S.sales.filter(function (o) { return o.invoice; }).length;
    for (var j = 0; j < 10; j++) {
      var d2 = addDays(-(8 + Math.floor(r() * 150)));
      var cust = S.customers[Math.floor(r() * S.customers.length)];
      var ls = [];
      for (var q = 0, n3 = 1 + Math.floor(r() * 3); q < n3; q++) {
        var pp = pl[Math.floor(r() * pl.length)];
        ls.push({ sku: pp.sku, loc: "co", lot: lotOf(pp.sku), qty: 1 + Math.floor(r() * 3), price: pp.price });
      }
      invN++;
      var o = { id: uid("S"), no: nextSalesNo(S, d2), date: d2, customer: cust.id, currency: "NTD", taxMode: "incl", salesRep: reps[Math.floor(r() * 2)], dept: "業務部", note: "",
        status: "confirmed", maker: "內勤-小美", reviewer: "內勤-小美", invoice: "ZZ" + String(10000000 + invN * 37), createdAt: d2 + " 10:00:00", confirmedAt: d2 + " 15:00:00", lines: ls };
      S.sales.push(o);
      postSalesJournal(S, o, d2);
      var total = orderTotal(o), roll = r();
      if (roll < 0.55) addPaymentSeed(S, o, shiftDate(d2, 12 + Math.floor(r() * 25)), total);
      else if (roll < 0.75) addPaymentSeed(S, o, shiftDate(d2, 20 + Math.floor(r() * 20)), Math.round(total / 2));
    }
    S.sales.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    S.journals.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.no < b.no ? 1 : -1); });
  }
  function addPaymentSeed(S, o, date, amount) {
    if (date > ymd(new Date())) return;
    var pay = { id: uid("P"), orderId: o.id, date: date, amount: amount, method: "匯款", by: "內勤-小美" };
    S.payments.push(pay);
    postJournal(S, date, "收款 " + o.no, "pay:" + pay.id, [{ acct: "1100", dr: amount }, { acct: "1200", cr: amount }]);
  }

  function seedSales(S) {
    S.operator = "內勤-小美";
    var line = S.lots.filter(function (l) {
      var p = product(S, l.sku);
      return l.loc === "co" && p && p.kind === "plate" && !isExpired(l.exp) && l.qty >= 2;
    })[0];
    if (!line) return;
    var o = saveSales(S, {
      date: addDays(-3), customer: "c101", taxMode: "incl", salesRep: "業務-小胖", dept: "業務部", note: "",
      lines: [{ sku: line.sku, loc: "co", lot: line.lot, qty: 2, price: product(S, line.sku).price }]
    });
    confirmSales(S, o.id);
    issueInvoice(S, o.id);
  }

  // ---------- storage ----------
  function load() {
    try {
      var raw = typeof localStorage !== "undefined" && localStorage.getItem(KEY);
      if (raw) {
        var S = JSON.parse(raw);
        if (S && S.v === 5) { applyGeoDefaults(S); S.v = VERSION; }
        if (S && S.v === VERSION) return S;
      }
    } catch (e) { /* fall through to a fresh seed */ }
    return seed();
  }
  function save(S) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: the demo still works in memory */ }
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return seed();
  }

  return {
    ROLES: ROLES, CAPS: CAPS, STATUS: STATUS, SALES_STATUS: SALES_STATUS, TAX: TAX, 
    ymd: ymd, addDays: addDays, expDays: expDays, isExpired: isExpired, posInt: posInt,
    user: user, role: role, can: can, need: need, setPerm: setPerm, addUser: addUser, setUserRole: setUserRole,
    product: product, location: location, locName: locName, customer: customer, plates: plates,
    findLine: findLine, lines: lines, lineQty: lineQty, totalQty: totalQty,
    defaultLabels: defaultLabels, skuFor: skuFor, box: box, boxCells: boxCells, boxTotal: boxTotal, bandTotal: bandTotal,
    slotId: slotId, parseSlot: parseSlot, slotLabel: slotLabel, filledSlots: filledSlots,
    createBox: createBox, updateBox: updateBox, deleteBox: deleteBox, toggleSlot: toggleSlot, moveBox: moveBox,
    addStock: addStock, adjustStock: adjustStock, transfer: transfer,
    submitReport: submitReport, approveReport: approveReport, rejectReport: rejectReport,
    reportItems: reportItems, reportsCSV: reportsCSV,
    salesTotals: salesTotals, saveSales: saveSales, confirmSales: confirmSales, issueInvoice: issueInvoice,
    ACCOUNTS: ACCOUNTS, accountName: accountName, orderTotal: orderTotal, orderPaid: orderPaid, orderBalance: orderBalance,
    receivePayment: receivePayment, arRows: arRows, arByCustomer: arByCustomer, invoiceRows: invoiceRows, trialBalance: trialBalance,
    monthKey: monthKey, lastMonths: lastMonths, reportStats: reportStats, salesStats: salesStats,
    setGeo: setGeo, GEO_DEFAULTS: GEO_DEFAULTS,
    trace: trace, seed: seed, load: load, save: save, reset: reset, log: log
  };
});
