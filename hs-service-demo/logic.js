(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HSLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "hs-service-demo-v1";
  var OPERATORS = ["業務-小胖", "業務-阿明", "內勤-小美", "管理員"];

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
  function isOffice(op) { return /^內勤|^管理員/.test(op || ""); }

  function expDays(exp) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.floor((new Date(exp + "T00:00:00") - t) / 86400000);
  }
  function isExpired(exp) { return expDays(exp) < 0; }

  // ---------- state ----------
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

  function screwSeries(S) {
    var map = {}, order = [];
    S.products.forEach(function (p) {
      if (p.kind !== "screw") return;
      if (!map[p.series]) { map[p.series] = { series: p.series, lens: [], sku: {} }; order.push(p.series); }
      map[p.series].lens.push(p.len);
      map[p.series].sku[p.len] = p.sku;
    });
    return order.map(function (s) { map[s].lens.sort(function (a, b) { return a - b; }); return map[s]; });
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
  function posInt(n) { return typeof n === "number" && isFinite(n) && n > 0 && Math.floor(n) === n; }

  function addStock(S, loc, sku, lot, exp, qty, reason) {
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
    var line = findLine(S, loc, sku, lot);
    if (!line) throw new Error("找不到庫存");
    if (typeof newQty !== "number" || newQty < 0 || Math.floor(newQty) !== newQty) throw new Error("數量必須是 0 以上的整數");
    var before = line.qty;
    line.qty = newQty;
    log(S, reason || "盤點調整", locName(S, loc) + "｜" + sku + "｜批號 " + lot + "｜" + before + " → " + newQty);
  }

  function transfer(S, from, to, sku, lot, qty) {
    if (from === to) throw new Error("來源與目的庫位相同");
    var line = findLine(S, from, sku, lot);
    if (!line || line.qty < qty) throw new Error("來源庫存不足");
    if (!posInt(qty)) throw new Error("數量必須是正整數");
    if (isExpired(line.exp)) throw new Error("已過期批號不可調撥");
    line.qty -= qty;
    var dest = findLine(S, to, sku, lot);
    if (dest) dest.qty += qty;
    else S.lots.push({ id: uid("L"), loc: to, sku: sku, lot: lot, exp: line.exp, qty: qty });
    log(S, "調撥", sku + "｜批號 " + lot + "｜" + locName(S, from) + " → " + locName(S, to) + "｜" + qty);
  }

  // ---------- reports ----------
  function reportItems(r) { return r.main.concat(r.screws); }

  function submitReport(S, d) {
    if (!d.date) throw new Error("請填日期");
    if (!location(S, d.hospital)) throw new Error("請選醫院");
    if (!String(d.doctor || "").trim()) throw new Error("請填醫師");
    if (!location(S, d.loc)) throw new Error("請選扣庫來源");
    var items = d.main.concat(d.screws);
    if (!items.length) throw new Error("至少要有一個品項");
    items.forEach(function (it) {
      if (!product(S, it.sku)) throw new Error("品項不存在：" + it.sku);
      if (!it.lot) throw new Error("品項缺批號：" + it.sku);
      if (!posInt(it.qty)) throw new Error("數量必須是正整數：" + it.sku);
    });
    var r = {
      id: uid("R"), date: d.date, hospital: d.hospital, doctor: String(d.doctor).trim(),
      loc: d.loc, note: d.note || "", status: "pending",
      main: d.main.map(function (x) { return { sku: x.sku, lot: x.lot, qty: x.qty, scrap: !!x.scrap }; }),
      screws: d.screws.map(function (x) { return { sku: x.sku, lot: x.lot, qty: x.qty, scrap: !!x.scrap }; }),
      createdBy: S.operator, createdAt: nowStr(), reviewedBy: "", reviewedAt: ""
    };
    S.reports.unshift(r);
    log(S, "報刀送出", r.date + "｜" + locName(S, r.hospital) + "｜" + r.doctor + "｜" + items.length + " 項");
    return r;
  }

  function approveReport(S, id) {
    if (!isOffice(S.operator)) throw new Error("只有內勤或管理員可以審核");
    var r = S.reports.filter(function (x) { return x.id === id; })[0];
    if (!r) throw new Error("找不到報刀單");
    if (r.status !== "pending") throw new Error("這張單已處理過");
    var need = {};
    reportItems(r).forEach(function (it) {
      var k = it.sku + "\u0000" + it.lot;
      need[k] = (need[k] || 0) + it.qty;
    });
    Object.keys(need).forEach(function (k) {
      var p = k.split("\u0000");
      var line = findLine(S, r.loc, p[0], p[1]);
      if (!line) throw new Error("扣庫來源沒有 " + p[0] + " 批號 " + p[1]);
      if (isExpired(line.exp)) throw new Error("批號 " + p[1] + " 已過期，不可使用");
      if (line.qty < need[k]) throw new Error(p[0] + " 批號 " + p[1] + " 庫存不足（剩 " + line.qty + "）");
    });
    Object.keys(need).forEach(function (k) {
      var p = k.split("\u0000");
      findLine(S, r.loc, p[0], p[1]).qty -= need[k];
    });
    r.status = "approved"; r.reviewedBy = S.operator; r.reviewedAt = nowStr();
    log(S, "報刀審核通過", r.date + "｜" + locName(S, r.hospital) + "｜" + r.doctor + "｜扣庫 " + locName(S, r.loc));
    return r;
  }

  function rejectReport(S, id, reason) {
    if (!isOffice(S.operator)) throw new Error("只有內勤或管理員可以審核");
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
    var logs = S.log.filter(function (e) { return e.detail.toLowerCase().indexOf(q) >= 0; });
    return { stock: stock, used: used, logs: logs };
  }

  // ---------- seed ----------
  function seed() {
    var r = rng(20261031);
    var S = {
      v: 1, operator: OPERATORS[2],
      locations: [{ id: "co", name: "公司倉", type: "company" }],
      products: [], lots: [], reports: [], log: []
    };
    ["中榮", "員基", "鹿基", "彰基", "803", "二基"].forEach(function (n, i) {
      S.locations.push({ id: "h" + i, name: n, type: "hospital" });
    });
    S.locations.push({ id: "r0", name: "小胖移動庫存", type: "rep" });

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

    [["2.7LS", 10, 20], ["3.5LS", 12, 26], ["3.5CS", 12, 26]].forEach(function (s) {
      for (var len = s[1]; len <= s[2]; len += 2) {
        S.products.push({ sku: "SC-" + s[0] + "-" + len, name: s[0] + " 骨釘 L" + len, price: 800, group: s[0] + " 骨釘", kind: "screw", series: s[0], len: len });
      }
    });

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

    screwSeries(S).forEach(function (se, si) {
      ["co", "h0", "h1", "h3", "h4", "r0"].forEach(function (loc, li) {
        var lot = "SL" + se.series.replace(".", "") + "-" + (2403 + si + li);
        se.lens.forEach(function (len) {
          S.lots.push({ id: uid("L"), loc: loc, sku: se.sku[len], lot: lot, exp: addDays(400 + si * 30), qty: loc === "co" ? 6 + Math.floor(r() * 6) : Math.floor(r() * 6) });
        });
      });
    });
    S.lots = S.lots.filter(function (l) { return l.qty > 0; });

    S.log.unshift({ ts: nowStr(), user: "系統", action: "初始化", detail: "載入示範資料" });
    seedReports(S);
    S.operator = OPERATORS[2];
    return S;
  }

  function seedReports(S) {
    var docs = ["林醫師", "陳醫師", "黃醫師"];
    var made = 0;
    ["h4", "h0", "h1"].forEach(function (hid, i) {
      var plate = null;
      S.lots.forEach(function (l) {
        var p = product(S, l.sku);
        if (!plate && l.loc === hid && p && p.kind === "plate" && l.qty > 0 && !isExpired(l.exp)) plate = l;
      });
      var screw = null;
      S.lots.forEach(function (l) {
        var p = product(S, l.sku);
        if (!screw && l.loc === hid && p && p.kind === "screw" && l.qty > 1 && !isExpired(l.exp)) screw = l;
      });
      if (!plate || !screw) return;
      S.operator = OPERATORS[i % 2];
      var rep = submitReport(S, {
        date: addDays(-(8 - i * 3)), hospital: hid, doctor: docs[i], loc: hid, note: i === 1 ? "補貨：備貨1" : "",
        main: [{ sku: plate.sku, lot: plate.lot, qty: 1 }],
        screws: [{ sku: screw.sku, lot: screw.lot, qty: 1 }, { sku: screw.sku, lot: screw.lot, qty: 1, scrap: true }]
      });
      if (i < 2) { S.operator = OPERATORS[2]; approveReport(S, rep.id); }
      made++;
    });
    return made;
  }

  // ---------- storage ----------
  function load() {
    try {
      var raw = typeof localStorage !== "undefined" && localStorage.getItem(KEY);
      if (raw) { var S = JSON.parse(raw); if (S && S.v === 1) return S; }
    } catch (e) { /* fall through to a fresh seed */ }
    return seed();
  }
  function save(S) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: demo still works in memory */ }
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return seed();
  }

  return {
    OPERATORS: OPERATORS, STATUS: STATUS, ymd: ymd, addDays: addDays, isOffice: isOffice,
    expDays: expDays, isExpired: isExpired, product: product, location: location, locName: locName,
    plates: plates, screwSeries: screwSeries, findLine: findLine, lines: lines, lineQty: lineQty,
    totalQty: totalQty, addStock: addStock, adjustStock: adjustStock, transfer: transfer,
    submitReport: submitReport, approveReport: approveReport, rejectReport: rejectReport,
    reportItems: reportItems, reportsCSV: reportsCSV, trace: trace, seed: seed, load: load,
    save: save, reset: reset, log: log, posInt: posInt
  };
});
