(function () {
  "use strict";

  var L = HSLogic;
  var S = L.load();
  var tab = "intro";
  var stockView = "plates";
  var moveKind = "all";
  var docView = "lend";
  var auditKind = "lend";
  var auditMonth = "";
  var DL = null, GR = null;
  var stockScope = "company";
  var stockQ = "";
  var acctView = "ar";
  var acctMonth = "all";
  var moreItems = [];
  var stockZero = false;
  var stockLoc = null;
  var mapLayers = { company: true, hospital: true, rep: true };
  var mapView = null;
  
  var repFilter = "all";
  var RE = null;
  var traceQ = "";
  var D = newDraft();
  var SD = newSales();
  var TR = null;
  var refreshDlg = null;

  var TYPE = { company: "公司", hospital: "醫院寄庫", rep: "業務移動庫存" };
  var ICONS = {
    intro: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    todo: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    report: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    acct: '<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    sales: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    docs: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    stock: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    trace: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  function canAct() { return can("report_approve") || can("report_confirm") || can("report_status") || can("sales_confirm") || can("stock_edit") || can("acct_edit"); }
  function defaultTab() { return canAct() ? "todo" : "report"; }
  var NAV = [
    { id: "intro", label: "介紹", title: "系統介紹", sub: "這套系統做了什麼、一張單怎麼從刀房走到帳上。", show: function () { return true; } },
    { id: "todo", label: "待辦", title: "待辦", sub: "需要你動手的事，處理完就會從這裡消失。", show: function () { return canAct(); } },
    { id: "report", label: "報刀", title: "報刀", sub: "跟刀後回報這台刀用了什麼。送出後內勤確認才扣庫；送出後再修改會列入異動待確認。", show: function () { return true; } },
    { id: "stock", label: "庫存", title: "庫存", sub: "先選範圍：公司的庫存可以立即調動，醫院寄庫要先調回公司。", show: function () { return L.can(S, "stock_view"); } },
    { id: "docs", label: "單據", title: "GDP 單據", sub: "進貨、借出（寄庫）、借出還回與每月訂單審核表。格式比照正航，報刀審核後自動產生。", show: function () { return L.can(S, "stock_view"); } },
    { id: "sales", label: "銷貨憑單", title: "銷貨憑單", sub: "對應正航的銷貨憑單：客戶、明細、稅額，覆核後出貨扣庫並自動產生傳票。", show: function () { return L.can(S, "sales_view"); } },
    { id: "acct", label: "會計", title: "會計", sub: "銷貨覆核後自動入帳：應收、收款、銷項發票、傳票與試算表。", show: function () { return L.can(S, "acct_view"); } },
    { id: "stats", label: "統計", title: "數據統計", sub: "報刀、銷貨、庫存的近況，用來看趨勢與找出問題。", show: function () { return L.can(S, "stats_view"); } },
    { id: "trace", label: "追溯", title: "批號追溯", sub: "一個批號現在在哪、用在哪家醫院哪位醫師。召回時直接查。", show: function () { return L.can(S, "audit_view"); } },
    { id: "settings", label: "設定", title: "設定", sub: "庫位、客戶、品項，以及誰能看到什麼、做什麼。", show: function () { return true; } }
  ];

  var view = document.getElementById("view");
  var dlg = document.getElementById("dlg");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function can(c) { return L.can(S, c); }
  function num(n) { return Math.round(n).toLocaleString("zh-Hant"); }
  function money(n) { return "NT$ " + Math.round(n).toLocaleString("zh-Hant"); }
  function persist() { L.save(S); }
  function pName(sku) { var p = L.product(S, sku); return p ? p.name : sku; }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  function toast(msg, err) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast" + (err ? " err" : "");
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, err ? 4200 : 2200);
  }

  function run(fn, okMsg) {
    try {
      var out = fn();
      persist();
      render();
      if (okMsg) toast(okMsg);
      return out === undefined ? true : out;
    } catch (e) {
      toast(e.message || String(e), true);
      return false;
    }
  }

  function options(items, selected) {
    return items.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === selected ? " selected" : "") + (o.disabled ? " disabled" : "") + ">" + esc(o.t) + "</option>";
    }).join("");
  }
  var TYPE_SHORT = { company: "", hospital: "寄庫", rep: "業務" };
  function locLabel(l) { return l.name + (TYPE_SHORT[l.type] ? "（" + TYPE_SHORT[l.type] + "）" : ""); }
  function locOptions(list, selected) {
    return options(list.map(function (l) { return { v: l.id, t: locLabel(l) }; }), selected);
  }
  function locBadge(l) {
    return '<span class="loc-badge ' + l.type + '">' + TYPE[l.type] + (l.type === "company" ? "・可立即調動" : "") + "</span>";
  }
  function expBadge(exp) {
    var d = L.expDays(exp);
    if (d < 0) return '<span class="badge expired">已過期</span>';
    if (d <= 90) return '<span class="badge warn">' + d + " 天到期</span>";
    return "";
  }
  function usableLines(loc, sku) {
    return L.lines(S, loc, sku).filter(function (l) { return !L.isExpired(l.exp); });
  }
  function card(eyebrow, title, body, headExtra) {
    return '<section class="card"><div class="card-h"><div>' + (eyebrow ? '<div class="eyebrow">' + esc(eyebrow) + "</div>" : "") +
      "<h2>" + esc(title) + "</h2></div>" + (headExtra || "") + '</div><div class="card-b">' + body + "</div></section>";
  }
  function noPerm(what) {
    return '<div class="card"><div class="empty">目前身分是「' + esc(S.operator) + "」，沒有「" + esc(what) + "」的權限。到「設定」由負責人調整。</div></div>";
  }

  // ---------------- 骨釘盒: a physical rack drawn as a lamp grid ----------------
  // One lamp per slot and every slot is independent (a size can sit on several
  // columns; there is no auto-fill). Lit = a 骨釘 is in that slot; amber = picked
  // for this 報刀. Column labels and band names are whatever the customer typed.
  function boxGridHtml(box, mode, o) {
    o = o || {};
    var cols = box.labels.length, out = "";
    box.bands.forEach(function (band, bi) {
      var cells = "";
      L.boxCells(box, bi).forEach(function (c) {
        var id = L.slotId(box.id, bi, c.i);
        var st = !c.on ? "off" : (o.picked && o.picked[id]) ? "sel" : "on";
        if (o.thumb) { cells += '<i class="slot ' + st + '"></i>'; return; }
        var attrs = ' data-box="' + esc(box.id) + '" data-band="' + bi + '" data-cell="' + c.i + '" title="' + esc(band.name + " · " + c.label + "（第 " + (c.r + 1) + " 列）") + '"';
        var act = mode === "pick" ? (st === "on" ? "seat-add" : st === "sel" ? "seat-sub" : null) : (st === "off" ? "seat-put" : "seat-take");
        var enabled = o.interactive !== false;
        cells += act ? '<button type="button" class="slot ' + st + '" data-act="' + act + '"' + attrs + (enabled ? "" : " disabled") + "></button>" : '<span class="slot ' + st + '"></span>';
      });
      out += '<div class="bband"><div class="bband-h"><b>' + esc(band.name) + "</b><span>" + L.bandTotal(band) + " 支</span></div>" +
        (o.thumb ? "" : '<div class="bgrid" style="--cols:' + cols + '">' + box.labels.map(function (n) { return '<span class="blabel">' + esc(n) + "</span>"; }).join("") + "</div>") +
        '<div class="bgrid' + (o.thumb ? " thumb" : "") + '" style="--cols:' + cols + '">' + cells + "</div></div>";
    });
    return '<div class="boxscroll">' + out + "</div>";
  }
  function legend(mode) {
    return '<div class="legend"><span><i class="slot on"></i>有骨釘</span>' + (mode === "pick" ? '<span><i class="slot sel"></i>這張報刀選用</span>' : "") + '<span><i class="slot"></i>空位</span></div>';
  }

  // ---------------- 待辦 ----------------
  // Everything here has a button that resolves it. Screw lots are grouped per box so a
  // 40x11 rack is one line, not hundreds.
  function attentionGroups() {
    var map = {}, order = [];
    S.lots.forEach(function (l) {
      if (l.qty <= 0) return;
      var d = L.expDays(l.exp);
      if (d > 90) return;
      var p = L.product(S, l.sku), isScrew = !!(p && p.kind === "screw");
      var key = isScrew ? "B|" + l.loc + "|" + l.lot : "P|" + l.id;
      if (!map[key]) {
        var bx = isScrew ? S.boxes.filter(function (b) { return b.loc === l.loc && b.lot === l.lot; })[0] : null;
        map[key] = { screw: isScrew, loc: l.loc, lot: l.lot, exp: l.exp, days: d, qty: 0, sku: l.sku, box: bx };
        order.push(key);
      }
      map[key].qty += l.qty;
    });
    return order.map(function (k) { return map[k]; }).sort(function (a, b) { return a.days - b.days; });
  }

  function renderTodo() {
    var out = "";
    var pend = S.reports.filter(function (r) { return r.status === "pending"; });
    var drafts = S.sales.filter(function (o) { return o.status === "draft"; });
    var att = attentionGroups();
    pend = pend.filter(function (r) { return !r.deleted; });
    out += notifsHtml();
    var chg = can("report_confirm") ? L.pendingChanges(S).filter(function (c) { var u = L.unitOf(L.role(S)); return u && !c[u]; }) : [];
    if (chg.length) out += card("TODO", "異動待確認（" + chg.length + "）", changesHtml(chg));
    if (pend.length && can("report_approve")) out += card("TODO", "待確認報刀（" + pend.length + "）", pend.map(reportCardHtml).join("") + '<p class="muted" style="margin-top:10px">倉儲或業務助理確認品項、批號後按「確認並扣庫」：寄庫扣庫，同時產生借出還回單、銷貨憑單與補貨借出草稿。</p>');
    if (drafts.length && can("sales_view")) {
      out += card("TODO", "銷貨憑單草稿（" + drafts.length + "）", drafts.map(function (o) {
        var c = L.customer(S, o.customer);
        return '<div class="report"><div class="report-h"><b>' + esc(o.no) + "</b><span>" + esc(c ? c.name : "") + '</span><span class="muted">' + o.lines.length + ' 筆明細</span><span class="badge draft">草稿</span>' +
          '<div class="actions"><button class="btn btn-sm btn-primary" data-act="open-sales" data-id="' + o.id + '">開啟</button></div></div></div>';
      }).join(""));
    }
    if (att.length && can("stock_view")) {
      var rows = att.map(function (g) {
        var loc = L.location(S, g.loc);
        var what = g.screw ? esc(g.box ? g.box.name : "骨釘盒") + ' <span class="muted">骨釘</span>' : '<span class="code">' + esc(g.sku) + "</span> " + esc(pName(g.sku));
        var btn = g.screw
          ? (g.box ? '<button class="btn btn-sm" data-act="open-box" data-id="' + esc(g.box.id) + '">打開盒子</button>' : "")
          : '<button class="btn btn-sm" data-act="open-lot" data-loc="' + esc(g.loc) + '" data-sku="' + esc(g.sku) + '">查看批號</button>';
        return "<tr><td>" + esc(L.locName(S, g.loc)) + " " + (loc ? locBadge(loc) : "") + "</td><td>" + what + '</td><td class="code">' + esc(g.lot) + "</td><td>" + esc(g.exp) + " " + expBadge(g.exp) + '</td><td class="num">' + g.qty + "</td><td>" + btn + "</td></tr>";
      }).join("");
      out += card("TODO", "效期要處理（" + att.length + "）", tbl(["位置", "品項", "批號", "效期", "數量", ""], rows) +
        '<p class="muted" style="margin-top:10px">已過期的批號不能出貨也不能報刀，先查看再決定退回或報廢。</p>');
    }
    var lendDrafts = S.docs.filter(function (d) { return d.type === "lend" && d.status === "draft"; });
    if (lendDrafts.length && can("stock_edit")) {
      out += card("TODO", "借出憑單待出貨檢查（" + lendDrafts.length + "）", tbl(["單號", "借出對象", "配送", "明細", "來源", ""], lendDrafts.map(function (d) {
        return '<tr><td class="code">' + esc(d.no) + "</td><td>" + esc(L.locName(S, d.to)) + "</td><td>" + esc(d.ship) + '</td><td class="num">' + d.lines.length + " 筆</td><td>" + docSource(d) + '</td><td><button class="btn btn-sm btn-primary" data-act="open-doc" data-id="' + d.id + '">出貨檢查</button></td></tr>';
      }).join("")) + '<p class="muted" style="margin-top:10px">報刀審核後，系統依耗用量建議補貨給醫院。倉儲目視確認品項、批號、數量後過帳，庫存才會移到醫院。</p>');
    }
    var low = can("stock_view") ? L.lowStock(S) : [];
    if (low.length) {
      out += card("TODO", "低於安全庫存（" + low.length + "）", tbl(["原廠", "品項", "公司倉", "安全庫存"], low.slice(0, 8).map(function (x) {
        return "<tr><td>" + esc(x.vendor) + '</td><td><span class="code">' + esc(x.sku) + "</span> " + esc(x.name) + '</td><td class="num"><b class="mv-down">' + x.have + '</b></td><td class="num">' + x.safety + "</td></tr>";
      }).join("")) + '<div class="row" style="margin-top:10px"><button class="btn btn-sm" data-act="docs-go" data-v="safety">看全部並產生訂購單</button></div>');
    }
    var overdue = can("acct_edit") ? L.arRows(S).filter(function (r) { return r.days > 30; }) : [];
    if (overdue.length) {
      out += card("TODO", "逾期未收（超過 30 天，" + overdue.length + "）", tbl(["憑單", "客戶", "銷貨日", "未收餘額", "已過", ""], overdue.map(function (r) {
        var c = L.customer(S, r.o.customer);
        return '<tr><td class="code">' + esc(r.o.no) + "</td><td>" + esc(c ? c.name : "") + "</td><td>" + esc(r.o.date) + '</td><td class="num">' + num(r.balance) + '</td><td class="num">' + r.days + ' 天</td><td><button class="btn btn-sm btn-primary" data-act="pay-order" data-id="' + r.o.id + '">登記收款</button></td></tr>';
      }).join("")));
    }
    if (!out) out = card("TODO", "目前沒有待辦", '<div class="empty">報刀都確認完了，沒有異動待確認，也沒有快到期的批號。</div>');
    return out;
  }

  // ---------------- 報刀 ----------------
  function firstHospital() {
    var h = S.locations.filter(function (l) { return l.type === "hospital"; })[0];
    return h ? h.id : (S.locations[0] && S.locations[0].id);
  }
  function newDraft() {
    var h = firstHospital();
    return { date: L.ymd(new Date()), hospital: h, doctor: "", loc: h, note: "", shift: "日刀", patient: "", mrn: "", deliverer: "", rep: "", main: [], picks: [], sp: { box: "" }, showPicker: false };
  }
  function pickedMap() {
    var m = {};
    D.picks.forEach(function (x) { m[x.id] = 1; });
    return m;
  }
  // The server-side shape: one item per (品項, 批號, 報廢) carrying the exact slots used.
  function draftPayload() {
    var groups = {}, order = [];
    D.picks.forEach(function (x) {
      var k = x.sku + "\u0000" + x.lot + "\u0000" + (x.scrap ? 1 : 0);
      if (!groups[k]) { groups[k] = { sku: x.sku, lot: x.lot, qty: 0, scrap: !!x.scrap, slots: [] }; order.push(k); }
      groups[k].qty++; groups[k].slots.push(x.id);
    });
    return { date: D.date, hospital: D.hospital, doctor: D.doctor, loc: D.loc, note: D.note, shift: D.shift, patient: D.patient, mrn: D.mrn, deliverer: D.deliverer, rep: D.rep,
      main: D.main, screws: L.isDealer(S) ? [] : order.map(function (k) { return groups[k]; }) };
  }

  function mainRowHtml(row, i) {
    if (L.isDealer(S)) {
      return '<div class="mainrow">' +
        '<label class="field">品項<select data-bind="main-sku" data-i="' + i + '">' + options(L.sellable(S).map(function (p) { return { v: p.sku, t: (p.kind === "custom" ? "［" + L.kindName(S, p) + "］" : "") + p.sku + "　" + p.name }; }), row.sku) + "</select></label>" +
        '<label class="field">批號（選填）<input data-bind="main-lotx" data-i="' + i + '" value="' + esc(row.lot) + '"></label>' +
        '<label class="field">數量<input type="number" min="1" step="1" value="' + row.qty + '" data-bind="main-qty" data-i="' + i + '"></label>' +
        '<button type="button" class="btn btn-sm" data-act="rm-main" data-i="' + i + '">移除</button></div>';
    }
    var avail = L.sellable(S).filter(function (p) { return L.totalQty(S, D.loc, p.sku) > 0; });
    var skuOpts = options(avail.map(function (p) { return { v: p.sku, t: (p.kind === "custom" ? "［" + L.kindName(S, p) + "］" : "") + p.sku + "　" + p.name + "（庫存 " + L.totalQty(S, D.loc, p.sku) + "）" }; }), row.sku);
    var lotOpts = options(L.lines(S, D.loc, row.sku).map(function (l) {
      var ex = L.isExpired(l.exp);
      return { v: l.lot, t: l.lot + "｜" + l.exp + "｜剩 " + l.qty + (ex ? "（已過期）" : ""), disabled: ex };
    }), row.lot);
    return '<div class="mainrow">' +
      '<label class="field">品項<select data-bind="main-sku" data-i="' + i + '">' + skuOpts + "</select></label>" +
      '<label class="field">批號<select data-bind="main-lot" data-i="' + i + '">' + lotOpts + "</select></label>" +
      '<label class="field">數量<input type="number" min="1" step="1" value="' + row.qty + '" data-bind="main-qty" data-i="' + i + '"></label>' +
      '<label class="field check"><input type="checkbox" data-bind="main-scrap" data-i="' + i + '"' + (row.scrap ? " checked" : "") + ">報廢</label>" +
      '<button type="button" class="btn btn-sm" data-act="rm-main" data-i="' + i + '">移除</button></div>';
  }

  function boxesAt(loc) { return S.boxes.filter(function (b) { return b.loc === loc; }); }

  // The picks as chips: always visible once something is picked, even with the picker closed.
  function screwChipsHtml() {
    var groups = {}, order = [];
    D.picks.forEach(function (x, idx) {
      var k = x.sku + "|" + (x.scrap ? 1 : 0);
      if (!groups[k]) { groups[k] = { sku: x.sku, scrap: x.scrap, idxs: [] }; order.push(k); }
      groups[k].idxs.push(idx);
    });
    if (!order.length) return "";
    return '<div class="chips">' + order.map(function (k) {
      var g = groups[k];
      return '<span class="chip' + (g.scrap ? " scrap" : "") + '"><span class="chip-kind">骨釘</span>' + esc(pName(g.sku)) + " ×" + g.idxs.length + (g.scrap ? " 報廢" : "") +
        (g.scrap ? "" : '<button type="button" data-act="scrap-one" data-idx="' + g.idxs[0] + '" title="把其中 1 支改記為報廢">報廢1</button>') +
        '<button type="button" data-act="dec-pick" data-idx="' + g.idxs[g.idxs.length - 1] + '" title="取消 1 支">−</button></span>';
    }).join("") + "</div>";
  }

  function screwPickerHtml() {
    var boxes = boxesAt(D.loc);
    if (!boxes.length) return '<div class="empty">這個扣庫來源沒有骨釘盒。</div>';
    if (!boxes.some(function (b) { return b.id === D.sp.box; })) D.sp.box = boxes[0].id;
    var box = L.box(S, D.sp.box), expired = L.isExpired(box.exp);
    return '<div class="rack picker"><div class="grid" style="margin-bottom:12px"><label class="field">骨釘盒<select data-bind="sp-box">' +
      options(boxes.map(function (b) { return { v: b.id, t: b.name + "｜批號 " + b.lot + "｜共 " + L.boxTotal(S, b) + " 支" + (L.isExpired(b.exp) ? "（已過期）" : "") }; }), D.sp.box) + "</select></label></div>" +
      '<div class="rack-h"><b>' + esc(box.name) + "</b><span>批號 " + esc(box.lot) + "｜效期 " + esc(box.exp) + "　點亮燈就是用掉那一格，點橘燈取消</span></div>" +
      boxGridHtml(box, "pick", { interactive: !expired, picked: pickedMap() }) + legend("pick") +
      '<div style="margin-top:12px"><button type="button" class="btn btn-sm btn-primary" data-act="close-picker">完成選取</button></div></div>';
  }

  function reportFormHtml() {
    var hospitals = S.locations.filter(function (l) { return l.type === "hospital"; });
    var docs = {};
    S.reports.forEach(function (r) { docs[r.doctor] = 1; });
    var rows = D.main.map(mainRowHtml).join("");
    var chips = screwChipsHtml();
    var n = D.main.length + D.picks.length;
    var canSubmit = can("report_submit") && n > 0;
    var dealer = L.isDealer(S), myRole = L.role(S);
    var reps = S.users.filter(function (u) { return u.role === "業務"; });
    var repField = dealer ? "" : myRole === "業務" ? '<label class="field">業務人員<input readonly value="' + esc(S.operator) + '（本人）"></label>'
      : '<label class="field">業務人員（代報）<select data-bind="r-rep">' + options([{ v: "", t: "請選擇" }].concat(reps.map(function (u) { return { v: u.name, t: u.name }; })), D.rep) + "</select></label>";
    var body = '<form data-form="report"><div class="grid">' +
      '<label class="field">手術日期<input type="date" data-bind="date" value="' + esc(D.date) + '"></label>' +
      '<label class="field">醫院<select data-bind="hospital">' + options(hospitals.map(function (h) { return { v: h.id, t: h.name }; }), D.hospital) + "</select></label>" +
      '<label class="field">醫師<input data-bind="doctor" list="doctors" value="' + esc(D.doctor) + '" placeholder="輸入或選擇"></label>' +
      (dealer ? "" : '<label class="field">刀別<select data-bind="r-shift">' + options(L.SHIFTS.map(function (x) { return { v: x, t: x }; }), D.shift) + "</select></label>") +
      '<label class="field">病人姓名<input data-bind="r-patient" value="' + esc(D.patient) + '" placeholder="還不知道就填「' + L.PT_TBD + '」"></label>' +
      '<label class="field">病例號<input data-bind="r-mrn" value="' + esc(D.mrn) + '" placeholder="選填"></label>' +
      repField + (dealer ? "" : '<label class="field">送器械人員<input data-bind="r-deliverer" value="' + esc(D.deliverer) + '" placeholder="選填"></label>') +
      (dealer ? "" : '<label class="field">扣庫來源<select data-bind="loc">' + locOptions(S.locations, D.loc) + "</select></label>") +
      '<label class="field wide">報刀備註<input data-bind="note" value="' + esc(D.note) + '" placeholder="選填"></label></div>' +
      (dealer ? '<p class="muted" style="margin:8px 0 0">經銷商報刀：用的是貴公司向我們買斷的貨，不扣公司庫存；不分日夜刀、不判定晚報與報錯。骨釘請以品項回報。</p>' : "") +
      '<datalist id="doctors">' + Object.keys(docs).map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>" +
      "<h4>本次用量</h4>" +
      (rows || chips ? rows + chips : '<div class="usage-empty">還沒加入任何品項。用到骨板就按「＋ 骨板」，用到骨釘就按「＋ 骨釘」，只加你用到的。</div>') +
      '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="add-main">＋ 骨板</button>' +
      (dealer ? "</div>" : '<button type="button" class="btn btn-sm' + (D.showPicker ? " on" : "") + '" data-act="toggle-picker">＋ 骨釘' + (D.picks.length ? "（已選 " + D.picks.length + "）" : "") + "</button></div>") +
      (D.showPicker ? screwPickerHtml() : "") +
      '<div class="submitbar"><button type="submit" class="btn btn-primary"' + (canSubmit ? "" : ' disabled title="' + (can("report_submit") ? "先加入品項" : "沒有送出報刀的權限") + '"') + ">送出報刀" + (n ? "（" + n + " 項）" : "") + "</button></div></form>";
    return card("NEW", "新增報刀", body);
  }

  function reportCardHtml(r) {
    var items = L.reportItems(r).map(function (it) {
      var p = L.product(S, it.sku);
      return "<li>" + L.kindName(S, p) + " " + esc(it.sku) + "　" + esc(pName(it.sku)) + " ×" + it.qty +
        '　<span class="muted">批號 ' + esc(it.lot || "—") + "</span>" + (it.scrap ? ' <span class="badge scrap">報廢</span>' : "") + "</li>";
    }).join("");
    var act = "";
    if (r.status === "pending") {
      var ok = can("report_approve");
      act = '<div class="actions"><button class="btn btn-sm" data-act="open-report" data-id="' + r.id + '">開啟</button><button class="btn btn-sm btn-primary" data-act="approve" data-id="' + r.id + '"' + (ok ? "" : ' disabled title="沒有確認權限"') + ">" + (r.src === "經銷商" ? "確認" : "確認並扣庫") + "</button>" +
        '<button class="btn btn-sm btn-danger" data-act="reject" data-id="' + r.id + '"' + (ok ? "" : " disabled") + ">退回</button></div>";
    }
    return '<div class="report"><div class="report-h">' + tableTag(r) + "<b>" + esc(r.date) + "</b><span>" + esc(L.locName(S, r.hospital)) + "</span><span>" + esc(r.doctor) + "</span><span>" + esc(r.patient || "") + "</span>" +
      '<span class="badge ' + r.status + '">' + L.STATUS[r.status] + "</span>" + flagBadges(r) + '<span class="muted">' + (r.src === "經銷商" ? "經銷商：" + esc(r.dealer) : "扣庫：" + esc(L.locName(S, r.loc))) + "</span>" + act + "</div>" +
      "<ul>" + items + "</ul>" +
      '<div class="meta">' + (r.shift ? esc(r.shift) + "｜" : "") + (r.rep ? "業務 " + esc(r.rep) + "｜" : "") + "提交 " + esc(r.createdBy) + " " + esc(r.createdAt) + (r.reviewedBy ? "｜審核 " + esc(r.reviewedBy) + " " + esc(r.reviewedAt) : "") + (r.note ? "｜備註：" + esc(r.note) : "") + "</div></div>";
  }

  function renderReport() {
    return (can("report_submit") ? reportFormHtml() : "") + reportListHtml();
  }

  // ---------------- 銷貨憑單 ----------------
  function firstRep() {
    var u = S.users.filter(function (x) { return x.role === "業務"; })[0];
    return u ? u.name : "";
  }
  function newSales() {
    var c = S.customers[0];
    return { id: "", no: "", date: L.ymd(new Date()), customer: c ? c.id : "", taxMode: "incl", salesRep: firstRep(), dept: "業務部", note: "",
      status: "draft", maker: S.operator, reviewer: "", invoice: "", lines: [] };
  }
  function stockLocsFor(sku) {
    return S.locations.filter(function (l) { return usableLines(l.id, sku).length; });
  }
  function newSalesLine() {
    var p = S.products.filter(function (x) { return x.kind !== "screw" && stockLocsFor(x.sku).length; })[0];
    if (!p) return null;
    var loc = stockLocsFor(p.sku)[0].id;
    return { sku: p.sku, loc: loc, lot: usableLines(loc, p.sku)[0].lot, qty: 1, price: p.price };
  }

  function salesLineHtml(l, i, ro) {
    var priceOn = can("view_price");
    var groups = {}, order = [];
    S.products.filter(function (p) { return p.kind !== "screw"; }).forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
    var skuOpts = order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + options(groups[g].filter(function (p) { return stockLocsFor(p.sku).length || p.sku === l.sku; }).map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), l.sku) + "</optgroup>";
    }).join("");
    var locs = stockLocsFor(l.sku);
    if (!locs.some(function (x) { return x.id === l.loc; })) { var cur = L.location(S, l.loc); if (cur) locs = locs.concat([cur]); }
    var lots = L.lines(S, l.loc, l.sku);
    var dis = ro ? " disabled" : "";
    return "<tr><td class=\"num\">" + (i + 1) + '</td><td><select data-bind="sl-sku" data-i="' + i + '"' + dis + ">" + skuOpts + "</select></td>" +
      "<td>" + esc(pName(l.sku)) + '</td><td><select data-bind="sl-loc" data-i="' + i + '"' + dis + ">" + locOptions(locs, l.loc) + "</select></td>" +
      '<td><select data-bind="sl-lot" data-i="' + i + '"' + dis + ">" + options(lots.map(function (x) { return { v: x.lot, t: x.lot + "｜剩 " + x.qty + (L.isExpired(x.exp) ? "（已過期）" : ""), disabled: L.isExpired(x.exp) }; }), l.lot) + "</select></td>" +
      '<td><input type="number" min="1" step="1" style="width:76px" value="' + l.qty + '" data-bind="sl-qty" data-i="' + i + '"' + dis + "></td>" +
      (priceOn ? '<td><input type="number" min="0" step="1" style="width:96px" value="' + l.price + '" data-bind="sl-price" data-i="' + i + '"' + dis + '></td><td class="num">' + money(l.qty * l.price).replace("NT$ ", "") + "</td>" : "") +
      "<td>" + (ro ? "" : '<button type="button" class="btn btn-sm" data-act="rm-sline" data-i="' + i + '">移除</button>') + "</td></tr>";
  }

  function salesEditorHtml() {
    var ro = SD.status === "confirmed", dis = ro ? " disabled" : "", priceOn = can("view_price");
    var c = L.customer(S, SD.customer) || {};
    var reps = S.users.filter(function (u) { return u.role === "業務"; });
    var t = L.salesTotals(SD);
    var head = '<div class="grid">' +
      '<label class="field">銷貨日期<input type="date" data-bind="s-date" value="' + esc(SD.date) + '"' + dis + "></label>" +
      '<label class="field">單據號碼<input readonly value="' + esc(SD.no || "（儲存後產生）") + '"></label>' +
      '<label class="field">客戶<select data-bind="s-customer"' + dis + ">" + options(S.customers.map(function (x) { return { v: x.id, t: x.code + "　" + x.name }; }), SD.customer) + "</select></label>" +
      '<label class="field">客戶編號<input readonly value="' + esc(c.code || "") + '"></label>' +
      '<label class="field wide">送貨地址<input readonly value="' + esc(c.addr || "") + '"></label>' +
      '<label class="field">聯絡人<input readonly value="' + esc(c.contact || "") + '"></label>' +
      '<label class="field">電話<input readonly value="' + esc(c.tel || "") + '"></label>' +
      '<label class="field">使用幣別<input readonly value="NTD　1.0000"></label>' +
      (priceOn ? '<div class="field">產品單價<div class="radios"><label><input type="radio" name="taxmode" data-bind="s-taxmode" value="excl"' + (SD.taxMode === "excl" ? " checked" : "") + dis + '>未稅</label><label><input type="radio" name="taxmode" data-bind="s-taxmode" value="incl"' + (SD.taxMode === "incl" ? " checked" : "") + dis + ">含稅</label></div></div>" : "") +
      '<label class="field">業務人員<select data-bind="s-rep"' + dis + ">" + options(reps.map(function (u) { return { v: u.name, t: u.name }; }), SD.salesRep) + "</select></label>" +
      '<label class="field">所屬部門<input data-bind="s-dept" value="' + esc(SD.dept) + '"' + dis + "></label>" +
      '<label class="field">製單人員<input readonly value="' + esc(SD.maker || S.operator) + '"></label>' +
      '<label class="field">覆核人員<input readonly value="' + esc(SD.reviewer) + '"></label>' +
      '<label class="field">發票號碼<input readonly value="' + esc(SD.invoice) + '"></label>' +
      '<label class="field wide">備註<input data-bind="s-note" value="' + esc(SD.note) + '"' + dis + "></label></div>";

    var rows = SD.lines.map(function (l, i) { return salesLineHtml(l, i, ro); }).join("");
    var detail = '<h4>單據明細</h4><div class="table-wrap"><table class="table detail-table"><thead><tr><th class="num">欄號</th><th>產品編號</th><th>品名規格</th><th>倉庫</th><th>批號</th><th>數量</th>' +
      (priceOn ? '<th>單價</th><th class="num">金額</th>' : "") + "<th></th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="' + (priceOn ? 9 : 7) + '" class="empty">尚無明細</td></tr>') + "</tbody></table></div>" +
      (ro ? "" : '<div style="margin-top:10px"><button type="button" class="btn btn-sm" data-act="add-sline">＋ 新增明細</button></div>');

    var totals = '<aside class="totals"><dl><div><dt>數量合計</dt><dd>' + t.qty + "</dd></div>" +
      (priceOn ? "<div><dt>未稅合計</dt><dd>" + money(t.net) + "</dd></div><div><dt>稅額（5%）</dt><dd>" + money(t.tax) + '</dd></div><div class="grand"><dt>總計</dt><dd>' + money(t.total) + "</dd></div>" : "") +
      "</dl>" + (priceOn ? "" : '<p class="muted" style="margin-top:8px">目前身分看不到金額。</p>') + "</aside>";

    var canEdit = can("sales_edit"), canConfirm = can("sales_confirm");
    var buttons = '<div class="row" style="margin-top:18px">' +
      (ro ? "" : '<button type="submit" class="btn btn-primary"' + (canEdit ? "" : " disabled") + ">儲存憑單</button>") +
      (!ro && SD.lines.length ? '<button type="button" class="btn" data-act="sales-confirm"' + (canConfirm && canEdit ? "" : ' disabled title="沒有覆核權限"') + ">儲存並覆核出貨（扣庫）</button>" : "") +
      (ro && !SD.invoice ? '<button type="button" class="btn btn-primary" data-act="sales-invoice"' + (canConfirm ? "" : " disabled") + ">開立發票（示範）</button>" : "") +
      (SD.id && ro ? '<button type="button" class="btn" data-act="print-sales" data-id="' + esc(SD.id) + '">列印銷貨憑單</button>' : "") +
      '<button type="button" class="btn" data-act="sales-new">新增憑單</button></div>' +
      (SD.ref && SD.ref.kind === "report" ? '<p class="muted" style="margin-top:10px">這張是報刀耗用自動產生的銷貨憑單（金流單），庫存已在借出還回時處理。<button type="button" class="btn btn-sm" data-act="open-report" data-id="' + esc(SD.ref.id) + '">看報刀單</button></p>' : "");

    return card(SD.id ? "ORDER " + SD.no : "NEW", "銷貨憑單", '<form data-form="sales"><div class="sales-layout"><div>' + head + detail + "</div>" + totals + "</div>" + buttons + "</form>",
      '<span class="badge ' + SD.status + '">' + L.SALES_STATUS[SD.status] + "</span>");
  }

  function renderSales() {
    if (!can("sales_view")) return noPerm("查看銷貨憑單");
    var priceOn = can("view_price");
    var rows = S.sales.map(function (o) {
      var t = L.salesTotals(o), c = L.customer(S, o.customer);
      return '<tr class="click" data-act="open-sales" data-id="' + o.id + '"><td class="code">' + esc(o.no) + "</td><td>" + esc(o.date) + "</td><td>" + esc(c ? c.name : "") + "</td><td>" + esc(o.salesRep) + '</td><td class="num">' + t.qty + "</td>" +
        (priceOn ? '<td class="num">' + money(t.total).replace("NT$ ", "") + "</td>" : "") +
        '<td><span class="badge ' + o.status + '">' + L.SALES_STATUS[o.status] + '</span></td><td class="code">' + esc(o.invoice || "—") + "</td></tr>";
    }).join("");
    var list = card("LIST", "憑單清單", '<div class="table-wrap"><table class="table"><thead><tr><th>單據號碼</th><th>日期</th><th>客戶</th><th>業務</th><th class="num">數量</th>' +
      (priceOn ? '<th class="num">總計</th>' : "") + "<th>狀態</th><th>發票</th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" class="empty">還沒有憑單</td></tr>') + "</tbody></table></div>" +
      '<p class="muted" style="margin-top:10px">點一列開啟。發票號碼是示範用，正式版要串財政部電子發票平台。</p>');
    return salesEditorHtml() + list;
  }

  // ---------------- 庫存 ----------------
  var TYPE_ORDER = { company: 0, hospital: 1, rep: 2 };
  var SCOPES = [["company", "公司・可立即調動"], ["hospital", "醫院寄庫"], ["rep", "業務移動庫存"], ["all", "全部"]];
  function sortedLocs() {
    return S.locations.slice().sort(function (a, b) { return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]; });
  }
  function inScope(locId) {
    if (stockLoc) return locId === stockLoc;
    var l = L.location(S, locId);
    return !!l && (stockScope === "all" || l.type === stockScope);
  }
  function scopeLocs() { return sortedLocs().filter(function (l) { return inScope(l.id); }); }
  function scopeQty(sku) {
    var n = 0;
    S.lots.forEach(function (l) { if (l.sku === sku && inScope(l.loc)) n += l.qty; });
    return n;
  }
  function defaultBoxLoc() {
    var t = stockScope === "all" ? "company" : stockScope;
    var l = S.locations.filter(function (x) { return x.type === t; })[0] || S.locations[0];
    return l.id;
  }

  function renderStock() {
    if (!can("stock_view")) return noPerm("查看庫存");
    var priceOn = can("view_price"), edit = can("stock_edit"), cfg = can("settings_edit");

    // One quiet line for the chosen scope, in separate units; money only with the permission.
    if (stockView.indexOf("cat:") === 0 && !viewCat()) stockView = "plates";
    var cat = viewCat(), plateQ = 0, screwQ = 0, otherQ = 0, val = 0;
    S.lots.forEach(function (l) {
      if (!inScope(l.loc)) return;
      var p = L.product(S, l.sku);
      if (!p) return;
      if (p.kind === "screw") screwQ += l.qty; else if (p.kind === "custom") otherQ += l.qty; else plateQ += l.qty;
      val += l.qty * p.price;
    });
    var scopeName = stockLoc ? L.locName(S, stockLoc) : SCOPES.filter(function (x) { return x[0] === stockScope; })[0][1];
    var summary = '<p class="scope-line"><b>' + esc(scopeName) + "</b>　骨板 " + plateQ + " 件　骨釘 " + screwQ + " 支" + (otherQ ? "　其他產品 " + otherQ + " 件" : "") + (priceOn ? "　約 " + money(val) : "") + "</p>";

    // A banner only for people who can act on it, pointing at the one place that resolves it.
    var att = attentionGroups(), expired = att.filter(function (g) { return g.days < 0; }).length, soon = att.length - expired;
    var banner = att.length && canAct() ? '<div class="banner"><span>' + (expired ? "<b>" + expired + " 批已過期</b>" : "") + (expired && soon ? "、" : "") + (soon ? soon + " 批 90 天內到期" : "") + '</span><button class="btn btn-sm" data-act="go-todo">去處理</button></div>' : "";

    var scopeSeg = '<div class="seg">' + SCOPES.map(function (x) {
      return '<button data-act="stock-scope" data-v="' + x[0] + '" aria-pressed="' + (stockScope === x[0]) + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    var viewSeg = '<div class="seg"><button data-act="stock-view" data-v="plates" aria-pressed="' + (stockView === "plates") + '">骨板</button>' +
      (S.categories || []).map(function (c) { return '<button data-act="stock-view" data-v="cat:' + esc(c.id) + '" aria-pressed="' + (stockView === "cat:" + c.id) + '">' + esc(c.name) + "</button>"; }).join("") +
      '<button data-act="stock-view" data-v="boxes" aria-pressed="' + (stockView === "boxes") + '">骨釘盒</button>' +
      '<button data-act="stock-view" data-v="moves" aria-pressed="' + (stockView === "moves") + '">最新異動</button></div>';
    var actions = '<div class="row">' + (cat ? '<button class="btn btn-sm" data-act="cprod-new" data-cat="' + esc(cat.id) + '"' + (cfg ? "" : ' disabled title="沒有設定權限"') + ">＋ 新增產品</button>" : "") + (stockView === "boxes" ? '<button class="btn btn-sm" data-act="new-box"' + (cfg ? "" : ' disabled title="沒有設定權限"') + ">＋ 新增骨釘盒</button>" : "") +
      '<button class="btn btn-sm" data-act="open-inbound"' + (edit ? "" : ' disabled title="沒有庫存異動權限"') + ">＋ 入庫</button>" +
      '<button class="btn btn-sm" data-act="open-transfer"' + (edit ? "" : " disabled") + ">調撥</button></div>";
    var search = stockView === "plates" || cat ? '<div class="row" style="margin:12px 0"><label class="field" style="flex:1;min-width:220px">搜尋<input id="stockSearch" value="' + esc(stockQ) + '" placeholder="型號或品名" autocomplete="off"></label>' +
      '<label class="field check"><input type="checkbox" data-bind="stock-zero"' + (stockZero ? " checked" : "") + ">顯示沒有庫存的品項</label></div>" : "";

    var focus = stockLoc && L.location(S, stockLoc) ? '<div class="focus-chip"><span>只看</span><b>' + esc(L.locName(S, stockLoc)) + "</b>" + locBadge(L.location(S, stockLoc)) + '<button class="btn btn-sm" data-act="map-clear">顯示全部</button></div>' : "";
    var main = banner + card("STOCK", "庫存", '<div class="row" style="justify-content:space-between">' + scopeSeg + viewSeg + "</div>" + focus + summary + '<div class="row" style="justify-content:flex-end;margin-bottom:6px">' + actions + "</div>" + search +
      (stockView === "plates" || cat ? '<div id="matrixHost">' + platesMatrix() + "</div>" : stockView === "moves" ? movesView() : boxesView()));
    return '<div class="stock-layout"><div class="stock-main">' + main + '</div><aside class="stock-side">' + mapCardHtml() + "</aside></div>";
  }

  function viewCat() { return stockView.indexOf("cat:") === 0 ? L.category(S, stockView.slice(4)) : null; }
  function visiblePlates() {
    var q = stockQ.trim().toLowerCase(), cat = viewCat();
    return (cat ? L.categoryProducts(S, cat.id) : L.plates(S)).filter(function (p) {
      if (q && (p.sku + " " + p.name).toLowerCase().indexOf(q) < 0) return false;
      return stockZero || scopeQty(p.sku) > 0;
    });
  }

  // 最新異動: one row per stock line that changed, newest first, from the append-only ledger.
  var MOVE_GROUPS = [["all", "全部", null], ["in", "入庫", ["入庫", "進貨", "新增骨釘盒"]], ["tr", "調撥", ["調撥", "調撥整盒", "借出"]],
    ["out", "扣庫", ["報刀扣庫", "銷貨出貨"]], ["adj", "盤點", ["盤點調整", "骨釘盒盤點", "骨釘盒設定", "刪除骨釘盒"]]];
  function moveSource(m) {
    var r = m.ref;
    if (!r) return '<span class="muted">—</span>';
    if (r.kind === "report") return '<button class="btn btn-sm" data-act="open-report" data-id="' + esc(r.id) + '">報刀單</button>';
    if (r.kind === "sales") return '<button class="btn btn-sm" data-act="open-sales" data-id="' + esc(r.id) + '"' + (can("sales_view") ? "" : " disabled") + ">銷貨憑單</button>";
    if (r.kind === "doc" && L.doc(S, r.id)) return '<button class="btn btn-sm" data-act="open-doc" data-id="' + esc(r.id) + '">' + L.DOC_TYPES[L.doc(S, r.id).type] + "</button>";
    if (r.kind === "box" && L.box(S, r.id)) return '<button class="btn btn-sm" data-act="open-box" data-id="' + esc(r.id) + '">骨釘盒</button>';
    return '<span class="muted">—</span>';
  }
  function movesView() {
    var grp = MOVE_GROUPS.filter(function (g) { return g[0] === moveKind; })[0] || MOVE_GROUPS[0];
    var chips = '<div class="seg" style="margin-bottom:12px">' + MOVE_GROUPS.map(function (g) {
      return '<button data-act="move-kind" data-v="' + g[0] + '" aria-pressed="' + (g[0] === grp[0]) + '">' + g[1] + "</button>";
    }).join("") + "</div>";
    var all = (S.moves || []).filter(function (m) { return inScope(m.loc) && (!grp[2] || grp[2].indexOf(m.kind) >= 0); });
    var rows = all.slice(0, 80);
    if (!rows.length) return chips + '<div class="empty">這個範圍還沒有庫存異動。</div>';
    return chips + '<p class="muted" style="margin:0 0 10px">每一筆是一個品項批號在一個位置的增減，最新在最上面。共 ' + all.length + " 筆" + (all.length > rows.length ? "，顯示最新 " + rows.length + " 筆" : "") + "。</p>" +
      '<div class="table-wrap"><table class="table moves"><thead><tr><th>時間 / 人員</th><th>類型 / 說明</th><th>品項</th><th class="num">增減</th><th class="num">結餘</th><th>位置 / 批號</th><th>來源</th></tr></thead><tbody>' +
      rows.map(function (m) {
        var p = L.product(S, m.sku), item = p && p.kind === "screw" ? esc(p.name) : '<span class="code">' + esc(m.sku) + "</span> " + esc(pName(m.sku));
        return '<tr><td><span class="code">' + esc(m.ts.slice(5, 16)) + '</span><small class="sub2">' + esc(m.user) + '</small></td><td><span class="badge">' + esc(m.kind) + "</span>" + (m.note ? '<small class="sub2">' + esc(m.note) + "</small>" : "") +
          "</td><td>" + item + '</td><td class="num"><b class="' + (m.delta > 0 ? "mv-up" : "mv-down") + '">' + (m.delta > 0 ? "+" : "−") + Math.abs(m.delta) + '</b></td><td class="num">' + m.after +
          "</td><td>" + esc(L.locName(S, m.loc)) + '<small class="sub2 code">' + esc(m.lot) + "</small></td><td>" + moveSource(m) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---------------- 報刀紀錄、單筆紀錄、異動待確認、通知（spec v34） ----------
  var TABLE_CLASS = { "鐿鈦": "t-yb", "綜合": "t-zh", "北榮": "t-bv" };
  function tableTag(r) { var t = L.tableOf(S, r); return '<span class="ktag ' + (TABLE_CLASS[t] || "") + '">' + t + "</span>"; }
  function flagBadges(r) {
    if (r.src !== "內部") return "";
    if (!r.flags || !r.flags.length) return '<span class="badge approved">正常</span>';
    return r.flags.map(function (f) { return '<span class="badge ' + (f.t === "晚報" ? "draft" : "expired") + '" title="' + esc(f.n) + '">' + f.t + "</span>"; }).join("");
  }
  function changeIds() {
    var m = {};
    L.pendingChanges(S).forEach(function (c) { m[c.reportId] = 1; });
    return m;
  }
  function reportListHtml() {
    var all = L.visibleReports(S), live = all.filter(function (r) { return !r.deleted; }), dels = all.filter(function (r) { return r.deleted; });
    var chg = L.pendingChanges(S), chgMap = changeIds(), mine = !can("report_all");
    var tabs = [["all", mine ? "我的報刀" : "全部", live.length], ["pending", "待確認", live.filter(function (r) { return r.status === "pending"; }).length]]
      .concat(can("report_confirm") || can("report_status") ? [["changes", "異動待確認", chg.length]] : []).concat([["deleted", "刪除紀錄", dels.length]]);
    if (!tabs.some(function (t) { return t[0] === repFilter; })) repFilter = "all";
    var seg = '<div class="seg">' + tabs.map(function (t) {
      return '<button data-act="rep-filter" data-v="' + t[0] + '" aria-pressed="' + (repFilter === t[0]) + '"' + (t[0] === "changes" && t[2] ? ' class="seg-alert"' : "") + ">" + t[1] + "　" + t[2] + "</button>";
    }).join("") + "</div>";
    var head = '<div class="row">' + seg + (can("report_all") ? '<button class="btn btn-sm" data-act="export-csv">匯出 CSV</button>' : "") + "</div>";
    if (repFilter === "changes") return card("CHANGES", "異動待確認", changesHtml(chg), head);
    if (repFilter === "deleted") {
      return card("DELETED", "刪除紀錄", tbl(["刀表", "手術日期", "醫院", "病人", "刪除人", "刪除時間", "原因", ""], dels.map(function (r) {
        return "<tr><td>" + tableTag(r) + "</td><td>" + esc(r.date) + "</td><td>" + esc(L.locName(S, r.hospital)) + "</td><td>" + esc(r.patient) + "</td><td>" + esc(r.delInfo.by) + "</td><td>" + esc(r.delInfo.at.slice(0, 16)) + '</td><td class="wrap">' + esc(r.delInfo.reason) + '</td><td><button class="btn btn-sm" data-act="open-report" data-id="' + r.id + '">開啟</button></td></tr>';
      }).join("")) + '<p class="muted" style="margin-top:10px">刪除的報刀保留原始內容，只供檢視，不列入統計。</p>', head);
    }
    var list = live.filter(function (r) { return repFilter === "all" || r.status === repFilter; }).slice(0, 60);
    var rows = list.map(function (r) {
      var items = L.reportItems(r), main = items.filter(function (it) { var p = L.product(S, it.sku); return p && p.kind !== "screw"; });
      var screwN = items.filter(function (it) { var p = L.product(S, it.sku); return p && p.kind === "screw"; }).reduce(function (a, it) { return a + it.qty; }, 0);
      var u = L.unitsOf(S, r);
      return '<tr class="click" data-act="open-report" data-id="' + r.id + '"><td>' + tableTag(r) + "</td><td>" + esc(r.date) + "</td><td>" + esc(r.shift || "—") + "</td><td>" + esc(L.locName(S, r.hospital)) + "</td><td>" + esc(r.doctor) + "</td>" +
        "<td>" + esc(r.patient || "") + (chgMap[r.id] ? ' <span class="badge expired">異動</span>' : "") + '<small class="sub2 code">' + esc(r.mrn || "") + "</small></td>" +
        "<td>" + (main.length ? esc(pName(main[0].sku)) + (main.length > 1 ? " 等 " + main.length + " 項" : "") : "—") + (screwN ? '<small class="sub2">骨釘 ' + screwN + " 支</small>" : "") + "</td>" +
        '<td class="num">' + (u == null ? "—" : u) + "</td><td>" + esc(r.src === "經銷商" ? r.dealer : r.rep || "") + "</td><td>" + (r.src === "內部" ? flagBadges(r) : '<span class="muted">—</span>') + '</td><td><span class="badge ' + r.status + '">' + L.STATUS[r.status] + "</span></td></tr>";
    }).join("");
    return card("LIST", mine ? "我的報刀" : "報刀紀錄", '<div class="table-wrap"><table class="table"><thead><tr><th>刀表</th><th>手術日期</th><th>刀別</th><th>醫院</th><th>醫師</th><th>病人／病例號</th><th>品項</th><th class="num">使用台數</th><th>業務／經銷商</th><th>報刀狀況</th><th>狀態</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="11" class="empty">沒有資料</td></tr>') + "</tbody></table></div>" +
      '<p class="muted" style="margin-top:10px">點一列開啟單筆紀錄。' + (mine ? "只顯示你自己的報刀。" : "") + "晚報規則客戶還沒提供，目前暫定「手術隔天之後才提交」。</p>", head);
  }
  function changesHtml(chg) {
    if (!chg.length) return '<div class="empty">沒有待確認的異動</div>';
    var u = L.unitOf(L.role(S));
    var st = function (name, v) { return v ? '<div class="cf ok">✓ ' + name + ' <small>' + esc(v.by) + " " + esc(v.at) + "</small></div>" : '<div class="cf">○ ' + name + " <small>待確認</small></div>"; };
    var rows = chg.map(function (c) {
      var r = L.report(S, c.reportId), old = (Date.now() - new Date(c.at.replace(" ", "T")).getTime()) > 864e5;
      return '<tr><td><button class="btn btn-sm" data-act="open-report" data-id="' + r.id + '">' + esc(r.date) + " " + esc(L.locName(S, r.hospital)) + "</button><small class=\"sub2\">" + esc(r.patient) + '</small></td><td class="wrap">' +
        c.diffs.map(function (d) { return '<div>' + esc(d[0]) + '：<span class="old">' + esc(d[1] || "（空白）") + '</span> → <span class="new">' + esc(d[2] || "（空白）") + "</span></div>"; }).join("") +
        "</td><td>" + esc(c.who) + '<small class="sub2">' + esc(c.role) + " " + esc(c.at.slice(5, 16)) + (old ? ' <span class="badge expired">逾 24 小時</span>' : "") + "</small></td><td>" + flagBadges(r) + "</td><td>" + st("帳務部", c.acct) + st("倉儲部／業務助理", c.wh) + "</td>" +
        '<td><button class="btn btn-sm btn-primary" data-act="confirm-change" data-id="' + c.id + '"' + (can("report_confirm") && u && !c[u] ? "" : " disabled") + ">確認</button></td></tr>";
    }).join("");
    return '<div class="table-wrap"><table class="table changes"><thead><tr><th>報刀</th><th>異動內容（修改前 → 修改後）</th><th>修改人／時間</th><th>報刀狀況</th><th>確認進度</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="muted" style="margin-top:10px">帳務部一個單位、倉儲部與業務助理一個單位，各單位任一人確認即可，修改人所屬單位視為已確認。兩單位都確認後移出清單。超過 24 小時未確認會標示。</p>';
  }
  function notifsHtml() {
    var list = L.myNotifs(S), unread = list.filter(function (n) { return n.read.indexOf(S.operator) < 0; });
    if (!list.length) return "";
    var rows = list.slice(0, 6).map(function (n) {
      var un = n.read.indexOf(S.operator) < 0;
      return '<div class="notif' + (un ? " unread" : "") + '"><i></i><div><b>' + esc(n.title) + "</b><span>" + esc(n.text) + '</span></div><small>' + esc(n.ts.slice(5, 16)) + "</small>" +
        (n.ref ? '<button class="btn btn-sm" data-act="notif-open" data-id="' + n.id + '" data-report="' + esc(n.ref) + '">查看</button>' : "") + "</div>";
    }).join("");
    return card("NOTICE", "通知" + (unread.length ? "（" + unread.length + " 則未讀）" : ""), rows, unread.length ? '<button class="btn btn-sm" data-act="notif-all">全部標為已讀</button>' : "");
  }

  // ---- 送出前檢查 ----
  function openSubmitCheck() {
    var d = draftPayload(), dealer = L.isDealer(S);
    var fake = { hospital: d.hospital, main: d.main, screws: d.screws };
    var items = d.main.concat(d.screws);
    if (!items.length) return toast("先加入品項", true);
    openDialog("送出前檢查", function () {
      var kv = [["刀表", L.tableOf(S, fake) + "刀表"], ["報刀來源", dealer ? "經銷商報刀" : L.role(S) === "帳務部" ? "內部報刀（帳務代業務報刀）" : "內部報刀"], ["手術日期", d.date], ["醫院", L.locName(S, d.hospital)], ["醫師", d.doctor]]
        .concat(dealer ? [] : [["刀別", d.shift]]).concat([["病人姓名", d.patient], ["病例號", d.mrn || "—"]])
        .concat(dealer ? [] : [["業務人員", L.role(S) === "業務" ? S.operator : d.rep || "（未選）"], ["送器械人員", d.deliverer || "—"], ["扣庫來源", L.locName(S, d.loc)]]).concat([["報刀備註", d.note || "—"]]);
      return '<dl class="kv">' + kv.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" +
        tbl(["產品編號", "品名", "批號", "數量", ""], items.map(function (it) { return '<tr><td class="code">' + esc(it.sku) + "</td><td>" + esc(pName(it.sku)) + '</td><td class="code">' + esc(it.lot || "—") + '</td><td class="num">' + it.qty + "</td><td>" + (it.scrap ? '<span class="badge scrap">報廢</span>' : "") + "</td></tr>"; }).join("")) +
        '<div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>返回修改</button><button class="btn btn-primary" data-act="submit-confirm">確認送出</button></div>';
    });
  }

  // ---- 單筆報刀紀錄 ----
  function openReport(id) {
    var r0 = L.report(S, id);
    if (!r0) return toast("找不到這張報刀單", true);
    RE = null;
    openDialog("報刀紀錄", function () { return reportRecordHtml(id); }, true);
  }
  function reportRecordHtml(id) {
    var r = L.report(S, id), owner = L.isOwner(S, r), staff = can("report_status"), dealer = r.src === "經銷商";
    var canEdit = !r.deleted && (owner || staff);
    var head = '<div class="rec-head">' + tableTag(r) + '<span class="badge">' + esc(r.src) + "報刀" + (r.proxy ? "・帳務代報" : "") + '</span><span class="badge ' + r.status + '">' + L.STATUS[r.status] + "</span>" + flagBadges(r) +
      (r.deleted ? '<span class="badge expired">已刪除</span>' : "") + '<span class="muted">提交時間 ' + esc(r.createdAt.slice(0, 16)) + "（系統記錄）</span></div>" +
      (r.deleted ? '<div class="note-red">此報刀已於 ' + esc(r.delInfo.at.slice(0, 16)) + " 由 " + esc(r.delInfo.by) + " 刪除；原因：" + esc(r.delInfo.reason) + "。以下為刪除前的內容。</div>" : "");
    var main;
    if (RE) {
      var f = function (k, label, type) {
        if (k === "shift") return '<label class="field">' + label + '<select data-bind="re-shift">' + options(L.SHIFTS.map(function (x) { return { v: x, t: x }; }), RE.shift) + "</select></label>";
        return '<label class="field">' + label + '<input data-bind="re-' + k + '"' + (type ? ' type="' + type + '"' : "") + ' value="' + esc(RE[k] || "") + '"></label>';
      };
      main = '<form data-form="re" data-id="' + esc(r.id) + '"><div class="grid">' + f("date", "手術日期", "date") + f("doctor", "醫師") + (dealer ? "" : f("shift", "刀別")) + f("patient", "病人姓名") + f("mrn", "病例號") + (dealer ? "" : f("deliverer", "送器械人員")) +
        '<label class="field wide">報刀備註<input data-bind="re-note" value="' + esc(RE.note || "") + '"></label></div>' +
        (owner && !staff && r.src === "內部" ? '<p class="note-amber">儲存後會列入異動待確認，由帳務部與倉儲部／業務助理確認；業務送出後自行修改，系統會自動標記「報錯」（只補上待補病人資料或改備註不算）。</p>' : '<p class="muted">儲存後列入異動待確認（只改備註、補病人資料除外）。</p>') +
        '<div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="re-cancel">取消</button><button class="btn btn-primary">儲存</button></div></form>';
    } else {
      main = '<dl class="kv"><dt>手術日期</dt><dd>' + esc(r.date) + "</dd><dt>醫院</dt><dd>" + esc(L.locName(S, r.hospital)) + "</dd><dt>醫師</dt><dd>" + esc(r.doctor) + "</dd>" +
        (dealer ? "<dt>經銷商</dt><dd>" + esc(r.dealer) + "</dd>" : "<dt>刀別</dt><dd>" + esc(r.shift || "—") + "</dd>") +
        "<dt>病人姓名</dt><dd>" + esc(r.patient || "") + (r.patient === L.PT_TBD ? ' <span class="badge draft">待補</span>' : "") + "</dd><dt>病例號</dt><dd>" + esc(r.mrn || "—") + "</dd>" +
        (dealer ? "" : "<dt>業務人員</dt><dd>" + esc(r.rep || "—") + "</dd><dt>送器械人員</dt><dd>" + esc(r.deliverer || "—") + "</dd><dt>扣庫來源</dt><dd>" + esc(L.locName(S, r.loc)) + "</dd>") +
        "<dt>報刀備註</dt><dd>" + esc(r.note || "—") + "</dd></dl>";
    }
    var sec = function (t, body, right) { return '<section class="rec-sec"><div class="rec-sec-h"><b>' + t + "</b>" + (right || "") + "</div>" + body + "</section>"; };
    var items = L.reportItems(r).map(function (it) {
      return '<tr><td class="code">' + esc(it.sku) + "</td><td>" + esc(pName(it.sku)) + '</td><td class="code">' + esc(it.lot || "—") + '</td><td class="num">' + it.qty + "</td><td>" + (it.scrap ? '<span class="badge scrap">報廢</span>' : "") + "</td></tr>";
    }).join("");
    var u = L.unitsOf(S, r);
    var statusBox = dealer ? "" : sec("報刀狀況與使用台數", '<div class="rec-line"><span>報刀狀況</span>' + flagBadges(r) + (r.flags.length ? '<small class="muted">' + esc(r.flags.map(function (x) { return x.t + "：" + x.n; }).join("；")) + "</small>" : "") + "</div>" +
      '<div class="rec-line"><span>使用台數</span><b>' + (u == null ? "—" : u) + " 台</b>" + (r.units != null ? '<small class="muted">人工修改（系統判斷 ' + L.unitsAuto(S, r) + "）</small>" : '<small class="muted">鐿鈦：有骨板 1 台，只有骨釘 0 台；綜合：使用數量</small>') + "</div>" +
      (staff && !r.deleted ? '<form data-form="flags" data-id="' + esc(r.id) + '" class="grid" style="margin-top:10px"><label class="field">更改報刀狀況<select name="to">' + options(L.FLAG_STATES.map(function (x) { return { v: x, t: x }; }), L.flagText(r).replace("不適用", "正常")) + "</select></label>" +
        '<label class="field">錯誤類型<select name="type">' + options(L.ERROR_TYPES.map(function (x) { return { v: x, t: x }; }), L.ERROR_TYPES[3]) + '</select></label><label class="field wide">更改原因（必填）<input name="reason" placeholder="例如：醫院臨時退回 2 支，非業務報錯"></label>' +
        '<div class="field">&nbsp;<button class="btn btn-sm">更改報刀狀況</button></div></form>' +
        '<form data-form="units" data-id="' + esc(r.id) + '" class="grid"><label class="field">使用台數<input name="units" type="number" min="0" step="0.5" value="' + (u == null ? 0 : u) + '"></label><label class="field wide">原因（選填）<input name="reason" placeholder="例如：同一台手術拆成兩筆報刀"></label>' +
        '<div class="field">&nbsp;<button class="btn btn-sm">修改台數</button></div></form><p class="muted">更改後通知主管、負責人，並記在修改歷程。使用台數用於業務獎金（由業務助理匯出計算）。</p>' : ""));
    var hist = (r.history || []).map(function (h) {
      return '<div class="hist"><div class="hist-h"><b>' + esc(h.user) + '</b><small>' + esc(h.role || "") + '</small><span class="badge">' + esc(h.sec) + "</span><small>" + esc(String(h.ts).slice(0, 16)) + "</small></div>" +
        h.ch.map(function (c) { return '<div class="hist-c"><span>' + esc(c[0]) + '</span><span class="old">' + esc(c[1]) + '</span><span>→</span><span class="new">' + esc(c[2]) + "</span></div>"; }).join("") + "</div>";
    }).join("");
    var actions = '<div class="row" style="margin-top:6px">' + (r.status === "pending" && !r.deleted && can("report_approve") ? '<button class="btn btn-primary btn-sm" data-act="approve" data-id="' + r.id + '">' + (dealer ? "確認" : "確認並扣庫") + "</button>" : "") +
      (owner && !r.deleted && r.status !== "approved" ? '<button class="btn btn-danger btn-sm" data-act="del-report" data-id="' + r.id + '">刪除報刀</button>' : "") + "</div>";
    return head + actions +
      sec("手術主紀錄", main, canEdit && !RE ? '<button class="btn btn-sm" data-act="re-edit" data-id="' + r.id + '">✎ 修改</button>' : RE ? '<span class="badge draft">修改中</span>' : "") +
      sec("產品明細", tbl(["產品編號", "品名", "批號", "數量", ""], items) + '<p class="muted">報廢另計，不含在使用數量內。產品明細的修改（增刪骨釘列、數量）待會議確認規則後開放。</p>') +
      statusBox + (r.docs || r.status === "approved" ? sec("產生的單據", reportDocsHtml(r)) : "") +
      sec("修改歷程（" + (r.history || []).length + " 筆）", hist || '<div class="empty">沒有紀錄</div>');
  }

  function platesMatrix() {
    var locs = scopeLocs(), priceOn = can("view_price"), plates = visiblePlates();
    var cat = viewCat(), cfgOn = can("settings_edit"), fields = cat ? cat.fields : [];
    if (!plates.length) return '<div class="empty">這個範圍沒有符合的' + (cat ? "產品" : "骨板") + "。" + (stockZero ? "" : "可以勾選「顯示沒有庫存的品項」。") + "</div>";
    var head = '<tr><th class="sticky">' + (cat ? "品號" : "型號") + "</th><th>品名</th>" + fields.map(function (f) { return '<th' + (f.type === "number" ? ' class="num"' : "") + ">" + esc(f.label) + "</th>"; }).join("") + (priceOn ? '<th class="num">單價</th>' : "") +
      locs.map(function (l) { return '<th class="num lt-' + l.type + '">' + esc(l.name) + "</th>"; }).join("") +
      '<th class="num">合計</th>' + (priceOn ? '<th class="num">金額</th>' : "") + (cat && cfgOn ? "<th></th>" : "") + "</tr>";
    var body = "", lastGroup = null, colspan = 2 + fields.length + locs.length + 1 + (priceOn ? 2 : 0) + (cat && cfgOn ? 1 : 0);
    plates.forEach(function (p) {
      if (!cat && p.group !== lastGroup) { body += '<tr class="group"><td colspan="' + colspan + '">' + esc(p.group) + "</td></tr>"; lastGroup = p.group; }
      var total = scopeQty(p.sku);
      body += '<tr><td class="sticky code">' + esc(p.sku) + "</td><td>" + esc(p.name) + "</td>" + fields.map(function (f) { var val = p.attrs && p.attrs[f.key]; return '<td' + (f.type === "number" ? ' class="num"' : "") + ">" + esc(val == null || val === "" ? "—" : val) + "</td>"; }).join("") + (priceOn ? '<td class="num">' + money(p.price).replace("NT$ ", "") + "</td>" : "") +
        locs.map(function (l) {
          var q = L.totalQty(S, l.id, p.sku);
          return '<td class="num"><button class="qtybtn' + (q ? " has" : "") + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '">' + (q || "·") + "</button></td>";
        }).join("") + '<td class="num"><b>' + total + "</b></td>" + (priceOn ? '<td class="num">' + money(total * p.price).replace("NT$ ", "") + "</td>" : "") + (cat && cfgOn ? '<td><button class="btn btn-sm" data-act="cprod-edit" data-sku="' + esc(p.sku) + '">編輯</button></td>' : "") + "</tr>";
    });
    return '<div class="table-wrap matrix-wrap"><table class="table matrix"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" + matrixList() +
      '<p class="muted" style="margin-top:10px">點數字看批號與效期。' + (stockScope === "company" ? "公司倉的庫存可以立即調動（出貨、調撥到醫院）。" : stockScope === "hospital" ? "醫院寄庫是放在醫院的，要先調回公司才能給別人。" : "") + "</p>";
  }

  function matrixList() {
    var locs = scopeLocs(), priceOn = can("view_price"), html = "", last = null, cat = viewCat();
    visiblePlates().forEach(function (p) {
      if (!cat && p.group !== last) { html += '<h5 class="mgroup">' + esc(p.group) + "</h5>"; last = p.group; }
      var total = scopeQty(p.sku);
      var chips = locs.map(function (l) {
        var q = L.totalQty(S, l.id, p.sku);
        return q ? '<button class="mloc ' + l.type + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '"><span>' + esc(l.name) + "</span><b>" + q + "</b></button>" : "";
      }).join("");
      html += '<div class="mitem"><div class="mitem-h"><b class="code">' + esc(p.sku) + "</b><span>" + esc(p.name) + "</span>" + (cat ? '<small class="muted">' + cat.fields.map(function (f) { var val = p.attrs && p.attrs[f.key]; return esc(f.label) + "：" + esc(val == null || val === "" ? "—" : val); }).join("　") + "</small>" : "") + "<em>合計 " + total + (priceOn ? "｜" + money(total * p.price) : "") + "</em></div>" +
        '<div class="mlocs">' + (chips || '<span class="muted">無庫存</span>') + "</div></div>";
    });
    return '<div class="matrix-list">' + html + "</div>";
  }

  function boxesView() {
    var edit = can("stock_edit");
    var list = S.boxes.filter(function (b) { return inScope(b.loc); }).sort(function (a, b) {
      var la = L.location(S, a.loc), lb = L.location(S, b.loc);
      return (TYPE_ORDER[la.type] - TYPE_ORDER[lb.type]) || (a.name < b.name ? -1 : 1);
    });
    var cards = list.map(function (b) {
      var loc = L.location(S, b.loc);
      var per = b.bands.map(function (band) { return esc(band.name) + " " + L.bandTotal(band); }).join("　");
      return '<article class="boxcard" data-act="open-box" data-id="' + esc(b.id) + '"><div class="boxcard-h"><b>' + esc(b.name) + "</b>" + locBadge(loc) + "</div>" +
        '<div class="muted" style="margin-bottom:8px">' + esc(loc.name) + "｜批號 " + esc(b.lot) + "｜效期 " + esc(b.exp) + " " + expBadge(b.exp) + "</div>" +
        boxGridHtml(b, "thumb", { thumb: true }) + '<div class="boxcard-f"><span>' + per + "</span><b>共 " + L.boxTotal(S, b) + " 支</b></div></article>";
    }).join("");
    return (cards ? '<div class="boxes">' + cards + "</div>" : '<div class="empty">這個範圍沒有骨釘盒。</div>') +
      '<p class="muted" style="margin-top:12px">點一個盒子打開整盒' + (edit ? "，每一格各自獨立，可逐格增減、調撥整盒。" : "。") + " 每個盒子一個批號；盒子的排列與名稱由你們自己設計。</p>";
  }

  // ---------------- 地圖 ----------------
  // One island and a dozen pins, so no mapping library: the county outlines are pre-projected
  // (tw-map.js) and pins use the same Mercator maths. Pan, zoom and picking are plain events.
  var MAP = window.TW_MAP;
  function mapProject(lat, lng) {
    return { x: (lng * Math.PI / 180 - MAP.lon0) * MAP.k, y: (MAP.ymax - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) * MAP.k };
  }

  // Every located place with what is physically there; `all` ignores the layer toggles.
  function mapMarkers(all) {
    var out = [];
    S.locations.forEach(function (l) {
      if (typeof l.lat !== "number" || typeof l.lng !== "number") return;
      if (l.type === "rep" && !l.onDuty) return;
      if (!all && !mapLayers[l.type]) return;
      var pt = mapProject(l.lat, l.lng), plate = 0, screw = 0, minDays = null;
      S.lots.forEach(function (x) {
        if (x.loc !== l.id || x.qty <= 0) return;
        var pr = L.product(S, x.sku), d = L.expDays(x.exp);
        if (pr && pr.kind === "screw") screw += x.qty; else plate += x.qty;
        if (minDays === null || d < minDays) minDays = d;
      });
      var last = S.reports.filter(function (r) { return r.hospital === l.id || r.loc === l.id; })[0];
      var pending = S.reports.filter(function (r) { return r.status === "pending" && (r.hospital === l.id || r.loc === l.id); }).length;
      out.push({ l: l, x: pt.x, y: pt.y, plate: plate, screw: screw, minDays: minDays, last: last, pending: pending });
    });
    return out;
  }

  function mapFit(ms) {
    if (!ms.length) return { k: 1, x: 0, y: 0 };
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    ms.forEach(function (m) { minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x); minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y); });
    var pad = 60, k = Math.min((MAP.w - pad * 2) / Math.max(maxX - minX, 1), (MAP.h - pad * 2) / Math.max(maxY - minY, 1));
    k = Math.max(1, Math.min(k, 9));
    return { k: k, x: MAP.w / 2 - (minX + maxX) / 2 * k, y: MAP.h / 2 - (minY + maxY) / 2 * k };
  }

  function markerTip(m) {
    var l = m.l, lines = [l.name + "｜" + TYPE[l.type] + (l.type === "company" ? "・可立即調動" : "")];
    lines.push("骨板 " + m.plate + " 件　骨釘 " + m.screw + " 支");
    if (m.minDays !== null && m.minDays <= 90) lines.push(m.minDays < 0 ? "有已過期批號" : "最近效期 " + m.minDays + " 天");
    if (l.type === "rep") lines.push("執勤中" + (l.lastSeen ? "｜更新 " + l.lastSeen : ""));
    if (l.type === "hospital" && m.last) lines.push("最近報刀 " + m.last.date + " " + m.last.doctor);
    if (m.pending) lines.push(m.pending + " 張報刀待審核");
    return lines.join("\n");
  }

  function markerSvg(m) {
    var l = m.l, sel = stockLoc === l.id, dim = !inScope(l.id) && !sel;
    var status = m.minDays !== null && m.minDays < 0 ? " exp" : m.minDays !== null && m.minDays <= 90 ? " warn" : "";
    var r = Math.min(15, 6.5 + Math.sqrt(m.plate + m.screw) * 0.42), shape, ly;
    if (l.type === "company") { shape = '<rect class="mk-shape" x="-9" y="-9" width="18" height="18" rx="4"/>'; ly = -15; }
    else if (l.type === "rep") { shape = '<circle class="pulse" r="13"/><path class="mk-shape" d="M0 -9L9 0L0 9L-9 0Z"/>'; ly = -16; }
    else { shape = '<circle class="mk-shape" r="' + r.toFixed(1) + '"/>'; ly = -(r + 6); }
    return '<g class="mk mk-' + l.type + status + (sel ? " sel" : "") + (dim ? " dim" : "") + '" transform="translate(' + m.x.toFixed(1) + " " + m.y.toFixed(1) + ')" data-act="map-pick" data-id="' + esc(l.id) + '" data-tip="' + esc(markerTip(m)) + '">' +
      '<g class="mk-s" transform="scale(' + (1 / mapView.k).toFixed(4) + ')">' + shape + '<text class="mk-label" y="' + ly + '" text-anchor="middle">' + esc(l.name) + "</text></g></g>";
  }

  function mapDetailHtml() {
    var l = stockLoc && L.location(S, stockLoc);
    if (!l) return '<p class="muted">點標記，左邊的庫存就只顯示那個位置。滾輪縮放、拖曳移動，右上按鈕可以回到全台。</p>';
    var m = mapMarkers(true).filter(function (x) { return x.l.id === l.id; })[0];
    var boxes = S.boxes.filter(function (b) { return b.loc === l.id; });
    return '<div class="tw-sel"><div class="tw-sel-h"><b>' + esc(l.name) + "</b>" + locBadge(l) + "</div>" +
      (m ? '<p class="muted">骨板 ' + m.plate + " 件　骨釘 " + m.screw + " 支" + (m.pending ? "　" + m.pending + " 張報刀待審核" : "") + (l.type === "rep" && l.lastSeen ? "　更新 " + esc(l.lastSeen) : "") + "</p>" : '<p class="muted">這個位置還沒有設定座標（設定 → 庫位管理）。</p>') +
      (boxes.length ? '<div class="chips">' + boxes.map(function (b) { return '<button type="button" class="btn btn-sm" data-act="open-box" data-id="' + esc(b.id) + '">打開 ' + esc(b.name) + "</button>"; }).join("") + "</div>" : "") + "</div>";
  }

  function mapCardHtml() {
    if (!MAP) return "";
    var ms = mapMarkers(false);
    if (!mapView) mapView = { k: 1, x: 0, y: 0 };
    var land = MAP.counties.map(function (c) { return '<path class="tw-county" d="' + c.d + '"><title>' + esc(c.n) + "</title></path>"; }).join("");
    var layers = [["company", "公司倉", "sq"], ["hospital", "醫院寄庫", "ci"], ["rep", "執勤中業務", "di"]].map(function (x) {
      return '<label class="layer"><input type="checkbox" data-bind="map-layer" data-layer="' + x[0] + '"' + (mapLayers[x[0]] ? " checked" : "") + '><i class="lg lg-' + x[2] + '"></i>' + x[1] + "</label>";
    }).join("");
    var body = '<div class="tw-box"><svg class="tw-svg' + (mapView.k >= 2.4 ? " show-labels" : "") + '" viewBox="0 0 ' + MAP.w + " " + MAP.h + '" role="img" aria-label="台灣地圖，標示公司、醫院與業務位置">' +
      '<g class="tw-pan" transform="translate(' + mapView.x.toFixed(2) + " " + mapView.y.toFixed(2) + ") scale(" + mapView.k.toFixed(4) + ')"><g class="tw-land">' + land + '</g><g class="tw-markers">' + ms.map(markerSvg).join("") + "</g></g></svg>" +
      '<div class="tw-ctl"><button type="button" class="btn btn-sm" data-act="map-zoom-in" aria-label="放大">＋</button><button type="button" class="btn btn-sm" data-act="map-zoom-out" aria-label="縮小">−</button>' +
      '<button type="button" class="btn btn-sm" data-act="map-fit">聚焦</button><button type="button" class="btn btn-sm" data-act="map-all">全台</button></div><div class="tw-tip" hidden></div></div>' +
      '<div class="tw-layers">' + layers + "</div>" + '<div id="mapDetail">' + mapDetailHtml() + "</div>" +
      '<p class="muted tw-note">座標是依院名推測的示範值，業務位置是模擬的。實際版本的業務位置要靠手機定位，且需要員工同意。地圖：內政部，經 taiwan-atlas 整理。</p>';
    return card("MAP", "位置地圖", body);
  }

  function applyMapView() {
    var g = document.querySelector(".tw-pan");
    if (!g) return;
    g.setAttribute("transform", "translate(" + mapView.x.toFixed(2) + " " + mapView.y.toFixed(2) + ") scale(" + mapView.k.toFixed(4) + ")");
    var inv = (1 / mapView.k).toFixed(4);
    Array.prototype.forEach.call(document.querySelectorAll(".mk-s"), function (el) { el.setAttribute("transform", "scale(" + inv + ")"); });
    var svg = document.querySelector(".tw-svg");
    if (svg) svg.classList.toggle("show-labels", mapView.k >= 2.4);
  }
  function mapGo(target, animate) {
    var still = typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || still) { mapView = target; applyMapView(); return; }
    var from = { k: mapView.k, x: mapView.x, y: mapView.y }, t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var u = Math.min(1, (ts - t0) / 280), e = 1 - Math.pow(1 - u, 3);
      mapView = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      applyMapView();
      if (u < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function mapZoom(factor, px, py, animate) {
    if (px == null) { px = MAP.w / 2; py = MAP.h / 2; }
    var k = Math.max(1, Math.min(18, mapView.k * factor)), r = k / mapView.k;
    mapGo({ k: k, x: px - (px - mapView.x) * r, y: py - (py - mapView.y) * r }, animate);
  }

  function openBox(id) {
    var first = L.box(S, id);
    openDialog(first ? first.name : "骨釘盒", function () {
      var box = L.box(S, id);
      if (!box) return '<div class="empty">找不到這個盒子，可能已被刪除。</div>';
      var loc = L.location(S, box.loc), edit = can("stock_edit"), cfg = can("settings_edit"), total = L.boxTotal(S, box);
      var where = loc.type === "company" ? "在公司倉，可以馬上調動：出貨，或調撥到醫院、業務。" : loc.type === "hospital" ? "寄放在醫院，要先調回公司才能給別人。" : "業務隨身帶著。";
      return '<div class="boxhead">' + locBadge(loc) + "<span><b>" + esc(loc.name) + "</b></span><span>批號 <b>" + esc(box.lot) + "</b></span><span>效期 " + esc(box.exp) + " " + expBadge(box.exp) + "</span><span>共 <b>" + total + "</b> 支</span></div>" +
        '<p class="muted" style="margin:6px 0 12px">' + where + (edit ? " 每一格各自獨立：點亮燈＝這一格取出，點空位＝這一格放入（盤點調整，會寫進操作紀錄）。" : " 目前身分只能檢視。") + "</p>" +
        boxGridHtml(box, "stock", { interactive: edit }) + legend("stock") +
        '<div class="row" style="margin-top:16px"><button class="btn btn-primary btn-sm" data-act="move-box" data-id="' + esc(box.id) + '"' + (edit ? "" : " disabled") + ">調撥整盒</button>" +
        '<button class="btn btn-sm" data-act="edit-box" data-id="' + esc(box.id) + '"' + (cfg ? "" : " disabled") + ">設計這個盒子</button>" +
        '<button class="btn btn-sm btn-danger" data-act="del-box" data-id="' + esc(box.id) + '"' + (cfg && total === 0 ? "" : ' disabled title="盒內還有骨釘，不能刪除"') + ">刪除</button></div>";
    }, true);
  }

  function openBoxConfig(id) {
    var box = id ? L.box(S, id) : null;
    var b = box || { name: "新骨釘盒", loc: defaultBoxLoc(), lot: "", exp: L.addDays(540), labels: L.defaultLabels(), bands: [{ name: "上區", rows: 5 }, { name: "下區", rows: 6 }] };
    openDialog(box ? "設計：" + box.name : "新增骨釘盒", function () {
      var bandRows = [0, 1, 2, 3].map(function (i) {
        var band = b.bands[i];
        return '<div class="row" style="margin-bottom:8px"><label class="field">區塊 ' + (i + 1) + ' 名稱<input name="bname' + i + '" value="' + esc(band ? band.name : "") + '" placeholder="' + (i < 2 ? "" : "不使用就留空") + '" style="min-width:180px"></label>' +
          '<label class="field">列數<input name="brows' + i + '" type="number" min="1" max="30" value="' + (band ? band.rows : "") + '" style="width:90px"></label></div>';
      }).join("");
      return '<form data-form="boxcfg" data-id="' + esc(id || "") + '"><div class="grid">' +
        '<label class="field">盒子名稱<input name="name" required value="' + esc(b.name) + '"></label>' +
        '<label class="field">位置<select name="loc">' + locOptions(S.locations, b.loc) + "</select></label>" +
        '<label class="field">批號<input name="lot" required value="' + esc(b.lot) + '"></label>' +
        '<label class="field">效期<input name="exp" type="date" required value="' + esc(b.exp) + '"></label></div>' +
        "<h4>左到右的欄位標示（一個標示一欄，目前 " + b.labels.length + " 欄）</h4>" +
        '<label class="field">空白或逗號分隔，內容自己決定（例如尺寸 10 12 14，同一個標示可以連續出現幾欄）<textarea name="labels" rows="3" style="padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-family:var(--mono);width:100%">' + esc(b.labels.join(" ")) + "</textarea></label>" +
        '<div class="row" style="margin-top:10px"><label class="field">數字從<input name="gFrom" type="number" value="10" style="width:76px"></label><label class="field">到<input name="gTo" type="number" value="48" style="width:76px"></label>' +
        '<label class="field">間距<input name="gStep" type="number" value="2" min="1" style="width:76px"></label><label class="field">每個幾欄<input name="gRepeat" type="number" value="2" min="1" style="width:90px"></label>' +
        '<button type="button" class="btn btn-sm" data-act="gen-labels">快速產生數字標示</button></div>' +
        "<h4>區塊（由上到下，最多 4 個；列數加起來就是整盒的列數）</h4>" + bandRows +
        '<div style="margin-top:14px"><button class="btn btn-primary">儲存</button></div></form>' +
        '<p class="muted" style="margin-top:10px">預設是 40 欄 × 11 列。已經放了骨釘的格子，不能被刪掉、移動或改名；要改請先把那格清空。位置和批號有骨釘時要用「調撥整盒」。</p>';
    }, true);
  }

  function openMoveBox(id) {
    var box = L.box(S, id);
    if (!box) return;
    openDialog("調撥整盒：" + box.name, function () {
      var cur = L.location(S, box.loc), dests = S.locations.filter(function (l) { return l.id !== box.loc; });
      return '<p class="muted" style="margin-bottom:12px">現在在 ' + esc(cur.name) + " " + locBadge(cur) + "，共 " + L.boxTotal(S, box) + " 支。整盒會一起搬到新位置，每一格的位置、批號、效期都不變。</p>" +
        '<form data-form="movebox" data-id="' + esc(box.id) + '" class="row"><label class="field" style="min-width:280px">搬到<select name="to">' + locOptions(dests, dests[0] && dests[0].id) + "</select></label>" +
        '<button class="btn btn-primary">確認調撥</button></form>';
    });
  }

  // ---------------- 會計 ----------------
  function agingBadge(days) {
    if (days > 90) return '<span class="badge expired">' + days + " 天</span>";
    if (days > 60) return '<span class="badge warn">' + days + " 天</span>";
    return '<span class="muted">' + days + " 天</span>";
  }

  function acctAr() {
    var byC = L.arByCustomer(S), rows = L.arRows(S), canPay = can("acct_edit");
    var tot = { b0: 0, b1: 0, b2: 0, b3: 0, total: 0 };
    byC.forEach(function (g) { ["b0", "b1", "b2", "b3", "total"].forEach(function (k) { tot[k] += g[k]; }); });
    var cells = function (g) {
      return ["b0", "b1", "b2", "b3"].map(function (k) { return '<td class="num">' + (g[k] ? num(g[k]) : "·") + "</td>"; }).join("") + '<td class="num"><b>' + num(g.total) + "</b></td>";
    };
    var summary = byC.length ? tbl(["客戶", "0–30 天", "31–60 天", "61–90 天", "90 天以上", "未收合計"],
      byC.map(function (g) { return "<tr><td>" + esc(g.customer ? g.customer.name : "") + "</td>" + cells(g) + "</tr>"; }).join("") +
      '<tr><td><b>合計</b></td>' + cells(tot) + "</tr>") : '<div class="empty">目前沒有未收帳款。</div>';
    var open = rows.length ? tbl(["憑單", "銷貨日", "客戶", "總計", "已收", "未收餘額", "帳齡", ""], rows.map(function (r) {
      var c = L.customer(S, r.o.customer);
      return '<tr><td class="code">' + esc(r.o.no) + "</td><td>" + esc(r.o.date) + "</td><td>" + esc(c ? c.name : "") + '</td><td class="num">' + num(r.total) + '</td><td class="num">' + num(r.paid) + '</td><td class="num"><b>' + num(r.balance) + "</b></td><td>" + agingBadge(r.days) + "</td>" +
        '<td><button class="btn btn-sm btn-primary" data-act="pay-order" data-id="' + r.o.id + '"' + (canPay ? "" : ' disabled title="沒有登記收款的權限"') + ">登記收款</button></td></tr>";
    }).join("")) : "";
    var pays = S.payments.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 10);
    var payTable = pays.length ? tbl(["收款日", "憑單", "客戶", "金額", "方式", "登記人"], pays.map(function (pm) {
      var o = S.sales.filter(function (x) { return x.id === pm.orderId; })[0], c = o && L.customer(S, o.customer);
      return "<tr><td>" + esc(pm.date) + '</td><td class="code">' + esc(o ? o.no : "") + "</td><td>" + esc(c ? c.name : "") + '</td><td class="num">' + num(pm.amount) + "</td><td>" + esc(pm.method) + "</td><td>" + esc(pm.by) + "</td></tr>";
    }).join("")) : '<div class="empty">還沒有收款紀錄。</div>';
    return "<h4>客戶應收彙總（依帳齡）</h4>" + summary + (rows.length ? "<h4>未收憑單</h4>" + open : "") + "<h4>最近收款</h4>" + payTable;
  }

  function acctInvoices() {
    var all = L.invoiceRows(S);
    var months = [];
    all.forEach(function (r) { var m = L.monthKey(r.o.date); if (months.indexOf(m) < 0) months.push(m); });
    if (acctMonth !== "all" && months.indexOf(acctMonth) < 0) acctMonth = "all";
    var list = all.filter(function (r) { return acctMonth === "all" || L.monthKey(r.o.date) === acctMonth; });
    var net = 0, tax = 0, total = 0;
    list.forEach(function (r) { net += r.t.net; tax += r.t.tax; total += r.t.total; });
    var pick = '<label class="field" style="max-width:240px;margin-bottom:12px">月份<select data-bind="acct-month"><option value="all"' + (acctMonth === "all" ? " selected" : "") + ">全部</option>" +
      options(months.map(function (m) { return { v: m, t: m }; }), acctMonth) + "</select></label>";
    var rows = list.map(function (r) {
      var c = L.customer(S, r.o.customer);
      return '<tr><td class="code">' + esc(r.o.invoice) + "</td><td>" + esc(r.o.date) + '</td><td class="code">' + esc(r.o.no) + "</td><td>" + esc(c ? c.name : "") + '</td><td class="num">' + num(r.t.net) + '</td><td class="num">' + num(r.t.tax) + '</td><td class="num">' + num(r.t.total) + "</td></tr>";
    }).join("") + (list.length ? '<tr><td colspan="4"><b>合計（' + list.length + " 張）</b></td>" + '<td class="num"><b>' + num(net) + '</b></td><td class="num"><b>' + num(tax) + '</b></td><td class="num"><b>' + num(total) + "</b></td></tr>" : "");
    return pick + (list.length ? tbl(["發票號碼", "日期", "憑單", "客戶", "未稅", "稅額", "總計"], rows) : '<div class="empty">這個月沒有發票。</div>') +
      '<p class="muted" style="margin-top:10px">稅額合計就是這段期間的銷項稅額。發票號碼是示範用；正式版要串財政部電子發票平台，並產生營業稅申報檔。</p>';
  }

  function acctJournals() {
    var list = S.journals.slice(0, 60);
    if (!list.length) return '<div class="empty">還沒有傳票。</div>';
    return '<p class="muted" style="margin-bottom:12px">銷貨覆核與收款登記會自動產生傳票，不用手動記帳。</p>' + list.map(function (j) {
      return '<div class="report"><div class="report-h"><b>' + esc(j.no) + "</b><span>" + esc(j.date) + "</span><span>" + esc(j.memo) + '</span><span class="muted">' + esc(j.by) + "</span></div>" +
        tbl(["科目", "借方", "貸方"], j.lines.map(function (l) {
          return '<tr><td><span class="code">' + esc(l.acct) + "</span> " + esc(L.accountName(l.acct)) + '</td><td class="num">' + (l.dr ? num(l.dr) : "") + '</td><td class="num">' + (l.cr ? num(l.cr) : "") + "</td></tr>";
        }).join("")) + "</div>";
    }).join("") + (S.journals.length > 60 ? '<p class="muted">只顯示最近 60 張。</p>' : "");
  }

  function acctTrial() {
    var tb = L.trialBalance(S), dr = 0, cr = 0;
    tb.forEach(function (r) { dr += r.dr; cr += r.cr; });
    var rows = tb.map(function (r) {
      return '<tr><td><span class="code">' + esc(r.code) + "</span> " + esc(r.name) + '</td><td>' + esc(r.type) + '</td><td class="num">' + num(r.dr) + '</td><td class="num">' + num(r.cr) + '</td><td class="num"><b>' + (r.balance < 0 ? "(" + num(-r.balance) + ")" : num(r.balance)) + "</b></td></tr>";
    }).join("") + '<tr><td colspan="2"><b>合計</b></td><td class="num"><b>' + num(dr) + '</b></td><td class="num"><b>' + num(cr) + "</b></td><td>" + (Math.round(dr) === Math.round(cr) ? '<span class="badge approved">借貸平衡</span>' : '<span class="badge expired">借貸不平衡</span>') + "</td></tr>";
    return tbl(["科目", "類別", "借方", "貸方", "餘額（括號為貸方）"], rows) +
      '<p class="muted" style="margin-top:10px">餘額 = 借方 − 貸方。應收帳款的餘額會等於「應收帳款」頁所有未收憑單加總。</p>';
  }

  function renderAcct() {
    if (!can("acct_view")) return noPerm("查看會計");
    var seg = [["ar", "應收帳款"], ["invoice", "銷項發票"], ["journal", "傳票"], ["trial", "試算表"]].map(function (x) {
      return '<button data-act="acct-view" data-v="' + x[0] + '" aria-pressed="' + (acctView === x[0]) + '">' + x[1] + "</button>";
    }).join("");
    var body = acctView === "ar" ? acctAr() : acctView === "invoice" ? acctInvoices() : acctView === "journal" ? acctJournals() : acctTrial();
    return card("ACCOUNTING", "會計", '<div class="row" style="margin-bottom:6px"><div class="seg">' + seg + "</div></div>" + body) +
      '<p class="muted">示範範圍：銷貨 → 傳票 → 應收 → 收款，以及銷項發票。還沒有：進貨與應付帳款、成本與毛利、損益表與資產負債表、營業稅申報檔、票據、固定資產折舊、期末結帳。科目只是示範，正式版要用公司自己的會計科目表。</p>';
  }

  function openPay(orderId) {
    var o = S.sales.filter(function (x) { return x.id === orderId; })[0];
    if (!o) return;
    openDialog("登記收款：" + o.no, function () {
      var c = L.customer(S, o.customer), bal = L.orderBalance(S, o);
      return '<p class="muted" style="margin-bottom:12px">' + esc(c ? c.name : "") + "｜總計 " + num(L.orderTotal(o)) + "｜已收 " + num(L.orderPaid(S, o)) + "｜<b>未收 " + num(bal) + "</b></p>" +
        '<form data-form="pay" data-id="' + esc(o.id) + '" class="grid"><label class="field">收款日期<input name="date" type="date" required value="' + L.ymd(new Date()) + '"></label>' +
        '<label class="field">金額<input name="amount" type="number" min="1" max="' + bal + '" step="1" required value="' + bal + '"></label>' +
        '<label class="field">方式<select name="method"><option>匯款</option><option>支票</option><option>現金</option></select></label>' +
        '<div class="field">&nbsp;<button class="btn btn-primary">確認收款</button></div></form>' +
        '<p class="muted" style="margin-top:10px">會自動產生傳票：借 銀行存款，貸 應收帳款。可以只收一部分。</p>';
    });
  }

  // ---------------- 統計 ----------------
  // The form follows the question: a trend over time is a line, a monthly total is a column,
  // a ranking where exact figures matter is a table, a part-of-whole with severity is a
  // segmented bar, and a single number is just a number.
  function monthLabel(m) { return Number(m.slice(5)) + "月"; }
  function wan(v) { return v >= 10000 ? (v / 10000).toFixed(1).replace(/\.0$/, "") + "萬" : num(v); }

  function chartSvg(points, fmt, kind) {
    var W = 360, H = 156, pl = 12, pr = 12, pt = 24, pb = 28, n = points.length;
    var peak = Math.max.apply(null, points.map(function (q) { return q.v; })) || 1, max = peak * 1.18;
    var iw = W - pl - pr, ih = H - pt - pb;
    var x = function (i) { return kind === "col" ? pl + iw * (i + 0.5) / n : pl + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
    var y = function (v) { return pt + ih - ih * v / max; };
    var out = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img">' +
      '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (pt + ih) + '" y2="' + (pt + ih) + '"/>' +
      '<line class="grid dashed" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(peak).toFixed(1) + '" y2="' + y(peak).toFixed(1) + '"/>';
    if (kind === "col") {
      var bw = iw / n * 0.56;
      points.forEach(function (q, i) {
        out += '<rect class="col" x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + y(q.v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, pt + ih - y(q.v)).toFixed(1) + '" rx="3"/>' +
          '<text class="val" x="' + x(i).toFixed(1) + '" y="' + (y(q.v) - 6).toFixed(1) + '" text-anchor="middle">' + (fmt ? fmt(q.v) : q.v) + "</text>";
      });
    } else {
      var d = points.map(function (q, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(q.v).toFixed(1); }).join(" ");
      out += '<path class="area" d="' + d + " L" + x(n - 1).toFixed(1) + " " + (pt + ih) + " L" + x(0).toFixed(1) + " " + (pt + ih) + ' Z"/><path class="ln" d="' + d + '"/>';
      points.forEach(function (q, i) {
        out += '<circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(q.v).toFixed(1) + '" r="3.4"/>' +
          '<text class="val" x="' + x(i).toFixed(1) + '" y="' + (y(q.v) - 9).toFixed(1) + '" text-anchor="middle">' + (fmt ? fmt(q.v) : q.v) + "</text>";
      });
    }
    points.forEach(function (q, i) { out += '<text class="lab" x="' + x(i).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(q.l) + "</text>"; });
    return out + "</svg>";
  }

  function ctbl(headers, rows) {
    return '<div class="table-wrap"><table class="table compact"><thead><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  // Ranked list: exact figure plus share of the whole, with a small bar only as a visual cue.
  function rankTable(rows, total, unit, nameHead) {
    if (!rows.length) return '<div class="empty">還沒有資料</div>';
    var max = rows[0].v || 1;
    return ctbl(["#", nameHead, unit, "占比"], rows.map(function (r, i) {
      var pct = total ? r.v / total * 100 : 0;
      return '<tr><td class="num rank">' + (i + 1) + "</td><td>" + esc(r.l) + '</td><td class="num"><b>' + (r.fmt ? r.fmt(r.v) : r.v) + '</b></td><td class="share"><span class="mini"><i style="width:' + Math.max(3, Math.round(r.v / max * 100)) + '%"></i></span><em>' + pct.toFixed(0) + "%</em></td></tr>";
    }).join(""));
  }
  function top(obj, n) {
    return Object.keys(obj).map(function (k) { return { l: k, v: obj[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, n);
  }
  function delta(cur, prev, fmt) {
    var d = cur - prev;
    if (!d) return '<span class="delta flat">與上月持平</span>';
    return '<span class="delta ' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "▲ " : "▼ ") + (fmt ? fmt(Math.abs(d)) : Math.abs(d)) + " 較上月</span>";
  }

  function renderStats() {
    if (!can("stats_view")) return noPerm("查看數據統計");
    var months = L.lastMonths(6), rs = L.reportStats(S, months), priceOn = can("view_price") && can("sales_view");
    var cur = months[5], prev = months[4];
    var ss = priceOn ? L.salesStats(S, months) : null;

    var kpis = '<div class="kpis"><div class="kpi"><small>本月報刀</small><b>' + rs.byMonth[cur] + " 張</b>" + delta(rs.byMonth[cur], rs.byMonth[prev]) + "</div>" +
      '<div class="kpi"><small>報廢率（近 6 個月）</small><b>' + (rs.qty ? (rs.scrap / rs.qty * 100).toFixed(1) : "0.0") + '%</b><span class="delta flat">報廢 ' + rs.scrap + " ／ 使用 " + rs.qty + "</span></div>" +
      (priceOn ? '<div class="kpi"><small>本月銷貨額（未稅）</small><b>' + money(ss.byMonth[cur]) + "</b>" + delta(ss.byMonth[cur], ss.byMonth[prev], num) + "</div>" : "") + "</div>";

    var grid = [];
    grid.push(card("趨勢", "報刀數量（近 6 個月）", chartSvg(months.map(function (m) { return { l: monthLabel(m), v: rs.byMonth[m] }; }), null, "line")));
    if (priceOn) grid.push(card("每月總額", "銷貨額（未稅，近 6 個月）", chartSvg(months.map(function (m) { return { l: monthLabel(m), v: ss.byMonth[m] }; }), wan, "col")));
    grid.push(card("排行", "各醫院報刀數", rankTable(top(rs.byHospital, 8), rs.count, "張數", "醫院")));
    grid.push(card("排行", "醫師 Top 5", rankTable(top(rs.byDoctor, 5), rs.count, "張數", "醫師")));
    var out = kpis + '<div class="stat-grid">' + grid.join("") + "</div>";

    out += '<div class="stat-grid" style="margin-top:18px">' + card("排行", "使用量 Top 10 品項", rankTable(top(rs.items, 10), rs.qty, "數量", "品項")) +
      (priceOn ? card("排行", "客戶銷貨排行（未稅）", rankTable(top(ss.byCustomer, 5).map(function (r) { return { l: r.l, v: r.v, fmt: num }; }), ss.total, "金額", "客戶")) : "") + "</div>";

    if (can("stock_view")) {
      var byType = { company: { p: 0, s: 0 }, hospital: { p: 0, s: 0 }, rep: { p: 0, s: 0 } };
      var exp = [["已過期", 0, "expired"], ["30 天內", 0, "d30"], ["31–60 天", 0, "d60"], ["61–90 天", 0, "d90"], ["90 天以上", 0, "ok"]];
      S.lots.forEach(function (l) {
        if (l.qty <= 0) return;
        var loc = L.location(S, l.loc), pr = L.product(S, l.sku), d = L.expDays(l.exp);
        if (loc && pr) byType[loc.type][pr.kind === "screw" ? "s" : "p"] += l.qty;
        exp[d < 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4][1] += l.qty;
      });
      var totalExp = exp.reduce(function (a, e) { return a + e[1]; }, 0) || 1;
      var stackBar = '<div class="segbar">' + exp.filter(function (e) { return e[1] > 0; }).map(function (e) {
        return '<span class="seg seg-' + e[2] + '" style="flex:' + e[1] + '" title="' + e[0] + " " + e[1] + '"></span>';
      }).join("") + '</div><ul class="stack-legend">' + exp.map(function (e) {
        return '<li><i class="seg-' + e[2] + '"></i>' + e[0] + "<b>" + e[1] + "</b><em>" + (e[1] / totalExp * 100).toFixed(0) + "%</em></li>";
      }).join("") + "</ul>";
      out += '<div class="stat-grid" style="margin-top:18px">' +
        card("明細", "各位置庫存", ctbl(["位置", "骨板與其他產品（件）", "骨釘（支）"], ["company", "hospital", "rep"].map(function (t) {
          return "<tr><td>" + TYPE[t] + (t === "company" ? "（可立即調動）" : "") + '</td><td class="num"><b>' + byType[t].p + '</b></td><td class="num"><b>' + byType[t].s + "</b></td></tr>";
        }).join(""))) +
        card("占比", "效期分布（依數量）", stackBar) + "</div>";
    }
    return out;
  }

  // ---------------- 產品別 ----------------
  var CE = null; // category being edited: { id, name, fields: [{ key, label, type }] }
  function syncCE() {
    if (!CE) return;
    var n = dlg.querySelector('[name="cname"]');
    if (n) CE.name = n.value;
    Array.prototype.forEach.call(dlg.querySelectorAll("[data-ce-label]"), function (inp) {
      var i = +inp.getAttribute("data-ce-label");
      if (CE.fields[i]) { CE.fields[i].label = inp.value; CE.fields[i].type = dlg.querySelector('[data-ce-type="' + i + '"]').value; }
    });
  }
  function openCategory(id) {
    var c = id ? L.category(S, id) : null;
    CE = { id: id || null, name: c ? c.name : "", fields: c ? deepCopy(c.fields) : [{ label: "", type: "text" }] };
    openDialog(c ? "編輯產品別：" + c.name : "新增產品別", function () {
      var rows = CE.fields.map(function (f, i) {
        return '<div class="ce-row"><label class="field">欄位名稱<input data-ce-label="' + i + '" value="' + esc(f.label) + '" placeholder="例如 代理商名" autocomplete="off"></label>' +
          '<label class="field">類型<select data-ce-type="' + i + '">' + options(Object.keys(L.FIELD_TYPES).map(function (k) { return { v: k, t: L.FIELD_TYPES[k] }; }), f.type) + "</select></label>" +
          '<button type="button" class="btn btn-sm" data-act="ce-rm" data-i="' + i + '">移除</button></div>';
      }).join("");
      return '<label class="field">產品別名稱<input name="cname" value="' + esc(CE.name) + '" placeholder="例如 PRP" autocomplete="off"></label>' +
        '<h4 class="sub">這個產品要記的欄位</h4>' + (rows || '<p class="muted">沒有額外欄位。品號、品名、單價是每個產品都有的。</p>') +
        '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="ce-add"' + (CE.fields.length >= 8 ? " disabled" : "") + '>＋ 加一個欄位</button></div>' +
        '<p class="muted" style="margin-top:10px">品號、品名、單價每個產品都有，不用另外加。欄位已經有產品填了資料就不能刪除。</p>' +
        '<div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn btn-primary" data-act="ce-save">儲存</button></div>';
    });
  }
  var CP = null; // product being added or edited: { cat, sku|null }
  function openCustomProduct(catId, sku) {
    var cat = L.category(S, catId), p = sku ? L.product(S, sku) : null;
    if (!cat) return;
    CP = { cat: catId, sku: sku || null };
    openDialog(p ? "編輯 " + p.name : "新增 " + cat.name + " 產品", function () {
      var attr = function (f) { return p && p.attrs ? p.attrs[f.key] || "" : ""; };
      var fields = cat.fields.map(function (f) {
        return '<label class="field">' + esc(f.label) + '<input name="a_' + esc(f.key) + '" type="' + (f.type === "number" ? "number" : f.type === "date" ? "date" : "text") + '"' + (f.type === "number" ? ' step="any"' : "") + ' value="' + esc(attr(f)) + '" autocomplete="off"></label>';
      }).join("");
      return '<form data-form="cprod" class="grid"><label class="field">品號<input name="sku" required value="' + esc(p ? p.sku : "") + '"' + (p ? " readonly" : "") + "></label>" +
        '<label class="field">品名<input name="name" required value="' + esc(p ? p.name : "") + '"' + (p ? " readonly" : "") + "></label>" +
        '<label class="field">單價<input name="price" type="number" min="0" required value="' + (p ? p.price : "") + '"' + (p ? " readonly" : "") + ">" + "</label>" + fields +
        '<div class="field">&nbsp;<button class="btn btn-primary">' + (p ? "儲存" : "新增產品") + "</button></div></form>" +
        (cat.fields.length ? "" : '<p class="muted" style="margin-top:10px">這個產品別沒有額外欄位，可以到設定頁的「產品別」加。</p>');
    });
  }

  // ---------------- 介紹 ----------------
  var FLOW = [
    { lane: 0, t: "報刀", d: "醫院、醫師、用了哪些品項與批號" },
    { lane: 1, t: "倉儲確認", d: "確認批號；修改進異動待確認" },
    { lane: 2, t: "借出還回", d: "寄庫扣庫，批號和報刀一致" },
    { lane: 2, t: "銷貨憑單", d: "金流單，自動產生並入帳" },
    { lane: 1, t: "補貨借出", d: "出貨檢查後過帳，補回醫院" },
    { lane: 1, t: "訂單審核表", d: "FR17-02 每月自動彙整列印" },
    { lane: 1, t: "登記收款", d: "沖銷應收，帳齡自動更新" }
  ];
  var LANES = ["業務／經銷商", "內勤", "系統自動"];
  function flowSvg() {
    var X0 = 96, STEP = 146, NW = 134, NH = 66, LH = 104, LY = 16, W = 1116, H = LY + LH * 3 + 78;
    var cy = function (lane) { return LY + LH * lane + LH / 2; };
    var out = '<svg class="flow-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="從報刀到收款的流程圖">' +
      '<defs><marker id="flArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1l9 4-9 4z" class="fl-head"/></marker></defs>';
    LANES.forEach(function (n, i) {
      out += '<rect class="fl-lane' + (i === 2 ? " sys" : "") + '" x="0" y="' + (LY + LH * i) + '" width="' + W + '" height="' + LH + '" rx="10"/>' +
        '<text class="fl-lane-t" x="16" y="' + (cy(i) + 5) + '">' + n + "</text>";
    });
    FLOW.forEach(function (n, i) {
      var x = X0 + i * STEP, y = cy(n.lane) - NH / 2;
      if (i) {
        var p = FLOW[i - 1], x1 = X0 + (i - 1) * STEP + NW, y1 = cy(p.lane), x2 = x, y2 = cy(n.lane), xm = (x1 + x2) / 2;
        out += '<path class="fl-arrow" marker-end="url(#flArrow)" d="M' + x1 + " " + y1 + (y1 === y2 ? " H" + x2 : " H" + xm + " V" + y2 + " H" + x2) + '"/>';
      }
      out += '<g><rect class="fl-node' + (n.lane === 2 ? " sys" : "") + '" x="' + x + '" y="' + y + '" width="' + NW + '" height="' + NH + '" rx="9"/>' +
        '<text class="fl-n" x="' + (x + 12) + '" y="' + (y + 22) + '">' + (i + 1) + '</text><text class="fl-t" x="' + (x + 32) + '" y="' + (y + 22) + '">' + n.t + "</text>" +
        '<foreignObject x="' + (x + 10) + '" y="' + (y + 28) + '" width="' + (NW - 18) + '" height="' + (NH - 30) + '"><div xmlns="http://www.w3.org/1999/xhtml" class="fl-d">' + n.d + "</div></foreignObject></g>";
    });
    var by = LY + LH * 3 + 12;
    out += '<rect class="fl-base" x="0" y="' + by + '" width="' + W + '" height="52" rx="10"/><text class="fl-lane-t" x="16" y="' + (by + 31) + '">全程</text>' +
      '<text class="fl-base-t" x="96" y="' + (by + 31) + '">進貨收貨檢查　·　安全庫存與訂購單　·　每次庫存變動都留下紀錄　·　批號追溯　·　權限依角色</text>';
    return out + "</svg>";
  }
  function flowList() {
    return '<ol class="flow-list">' + FLOW.map(function (n) {
      return '<li><span class="badge">' + LANES[n.lane] + "</span><b>" + n.t + '</b><span class="muted">' + n.d + "</span></li>";
    }).join("") + "</ol>";
  }

  var FEATURES = [
    ["report", "報刀", "照你們 v34 的流程：刀別、病人與病例號、送器械人員、送出前檢查；晚報與報錯自動標記，可人工更改並留原因；送出後修改列入異動待確認，由帳務部與倉儲部／業務助理確認；逐欄位修改歷程；使用台數；經銷商報刀。骨釘直接在盒子上點格子。"],
    ["stock", "庫存與骨釘盒", "公司倉、醫院寄庫、業務移動庫存分開看，公司的可以立即調動。骨釘盒可自訂排列，像座位圖一樣一格一格看。有效期警示、位置地圖、最新異動帳。"],
    ["docs", "GDP 單據", "進貨憑單含收貨檢查與溫度；借出憑單（寄庫）出貨檢查後過帳；報刀審核自動開借出還回單，批號和報刀一致。每月 FR17-02 訂單審核表直接列印，不用再從正航匯出貼 Excel。低於安全庫存時提醒並產生訂購單。"],
    ["sales", "銷貨憑單", "對應正航的銷貨憑單：客戶、明細、稅額。覆核後出貨扣庫，並可開立發票。"],
    ["acct", "會計", "覆核出貨後自動產生傳票。應收帳款與帳齡、收款登記、銷項發票、試算表。"],
    ["stats", "數據統計", "報刀趨勢、每月銷貨額、各醫院與醫師排行、效期分布。每種資訊用最適合的圖或表。"],
    ["trace", "批號追溯", "輸入批號就看到它現在在哪、用在哪家醫院哪位醫師。每筆庫存異動都能點回來源單據。"],
    ["settings", "權限與設定", "角色對應功能可自行調整，例如業務看不到任何金額。醫院、業務移動庫存、客戶都能自己新增，也能新增產品別（例如 PRP）並自訂欄位，業務就能報這個產品。"]
  ];
  var COMPARE = [
    ["報刀", "業務傳 Excel 或訊息，內勤再重打一次", "業務自己報，送出後修改會留下前後紀錄並由兩個單位確認"],
    ["庫存", "寄庫、業務庫存、公司庫存分散在不同檔案", "同一份帳，分位置顯示，骨釘盒看得到每一格"],
    ["GDP 單據", "正航開借出、還回、銷貨，每月匯出貼 Dropbox 的 Excel 再列印", "報刀審核就產生借出還回單與銷貨憑單；訂單審核表直接印"],
    ["銷貨與帳", "資料整理後再轉進正航，另外對帳", "憑單覆核即扣庫、開票、入帳"],
    ["追溯", "翻檔案找批號", "輸入批號，直接看到去向"],
    ["權限與紀錄", "檔案誰都能改，改了沒有紀錄", "依角色給權限，每個動作留紀錄"]
  ];
  var GDP = [
    ["產品可追溯", "批號追溯；每筆庫存異動可回查到報刀單、借出憑單、借出還回單或銷貨憑單", "召回流程的 SOP"],
    ["進貨與出貨檢查", "進貨憑單必須通過收貨檢查（溫控品記溫度）才能入庫；借出憑單出貨檢查後才過帳", "檢查章與紙本歸檔方式"],
    ["效期與不良品管制", "效期警示；過期批號不能出貨、不能報刀", "隔離、退回、銷毀的作業程序"],
    ["人員權責", "角色與功能權限；每個動作記下操作人員", "人員訓練與授權紀錄"],
    ["紀錄不可竄改", "操作紀錄只增不改；庫存異動帳逐筆保存", "紀錄保存年限與備份規定"],
    ["儲存與調撥", "公司、醫院寄庫、業務庫存分區；調撥留紀錄", "場所環境（溫濕度等）不在系統範圍"]
  ];

  function renderIntro() {
    var hero = '<section class="intro-hero"><div class="eyebrow">AMAD Labs · DEMO</div><h2>從刀房到帳本，同一份資料</h2>' +
      '<p>業務在醫院報刀，倉儲確認，庫存自動扣、銷貨憑單、發票、傳票、應收跟著走，批號隨時查得到去向。取代現在的 Excel 加正航的來回整理。</p>' +
      '<div class="row"><button class="btn btn-primary" data-act="intro-as" data-name="業務-小胖" data-tab="report">以業務身分報一張刀</button>' +
      '<button class="btn" data-act="intro-as" data-name="倉儲-小芳" data-tab="todo">以倉儲身分確認</button>' +
      '<button class="btn" data-act="intro-go" data-tab="stock">看庫存與地圖</button></div></section>';

    var flow = card("FLOW", "一張單怎麼走", '<div class="flow-wrap">' + flowSvg() + "</div>" + flowList() +
      '<p class="muted" style="margin-top:12px">報刀審核與銷貨覆核，都會用同一套規則檢查批號與效期，通過才扣庫，並各記下一筆異動。</p>');

    var feats = card("WHAT", "我們做了什麼", '<div class="feat-grid">' + FEATURES.map(function (f) {
      return '<div class="feat"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[f[0]] + "</svg><h3>" + f[1] + "</h3><p>" + f[2] + '</p><button class="btn btn-sm" data-act="intro-go" data-tab="' + f[0] + '">看看</button></div>';
    }).join("") + "</div>");

    var cmp = card("BEFORE / AFTER", "和現在的作法比", '<div class="table-wrap"><table class="table"><thead><tr><th></th><th>目前的作法</th><th>用這套系統</th></tr></thead><tbody>' +
      COMPARE.map(function (r) { return "<tr><td><b>" + r[0] + '</b></td><td class="wrap">' + r[1] + '</td><td class="wrap">' + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="muted" style="margin-top:10px">「目前的作法」是依你們告知的流程整理，細節以實際情況為準。</p>');

    var gdp = card("GDP", "和醫療器材優良運銷準則（GDP）的對應", '<div class="table-wrap"><table class="table"><thead><tr><th>要求重點</th><th>系統怎麼支援</th><th>仍需你們文件化</th></tr></thead><tbody>' +
      GDP.map(function (r) { return "<tr><td><b>" + r[0] + '</b></td><td class="wrap">' + r[1] + '</td><td class="wrap">' + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="muted" style="margin-top:10px">系統提供的是紀錄與管制的工具。GDP 認證還需要文件化的 SOP 與稽核，不是裝了系統就通過。這個示範版資料存在瀏覽器；正式版會放在伺服器的資料庫。</p>');

    var tour = card("TRY", "三分鐘體驗", '<ol class="tour"><li><b>業務報刀</b><span>以「業務-小胖」報一張刀，選醫院、醫師，加骨板，再到骨釘盒點用掉的格子。</span></li>' +
      '<li><b>倉儲確認</b><span>換成「倉儲-小芳」，在待辦按「確認並扣庫」：寄庫扣庫，並自動產生借出還回單、銷貨憑單與補貨借出草稿。</span></li>' +
      '<li><b>送出後修改</b><span>換回「業務-小胖」開啟自己的報刀改醫師或刀別：系統標記報錯、列入異動待確認；再用「帳務-小美」確認。</span></li>' +
      '<li><b>回頭查</b><span>到「庫存」的「最新異動」看到剛剛那筆扣庫，點「報刀單」回到來源；再到「追溯」查批號。</span></li></ol>' +
      '<p class="muted">所有資料都是示範用的假資料，隨時可以在「設定」重設。</p>');
    return hero + flow + feats + '<div class="stat-grid intro-two">' + cmp + gdp + "</div>" + tour;
  }

  // ---------------- 批號追溯 ----------------
  function tbl(headers, rows) {
    return '<div class="table-wrap"><table class="table"><thead><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  function traceLotList() {
    var lots = S.lots.filter(function (l) { return l.qty > 0; }).sort(function (a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : 0; });
    if (!lots.length) return '<div class="empty">目前沒有庫存批號。</div>';
    return '<p class="muted" style="margin:14px 0 10px">輸入批號或型號，或直接從下面選一個，查它現在在哪、用在哪家醫院哪位醫師。</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>批號</th><th>型號</th><th>庫位</th><th>效期</th><th class="num">數量</th><th></th></tr></thead><tbody>' +
      lots.map(function (l) {
        return '<tr><td class="code">' + esc(l.lot) + '</td><td class="code">' + esc(l.sku) + "</td><td>" + esc(L.locName(S, l.loc)) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num">' + l.qty + '</td><td><button class="btn btn-sm" data-act="trace-lot" data-lot="' + esc(l.lot) + '">追溯</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  function traceResultsHtml() {
    var t = L.trace(S, traceQ);
    if (!t) return traceLotList();
    var stock = t.stock.length ? tbl(["庫位", "型號", "品名", "批號", "效期", "數量"], t.stock.map(function (l) {
      return "<tr><td>" + esc(L.locName(S, l.loc)) + '</td><td class="code">' + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + '</td><td class="code">' + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num">' + l.qty + "</td></tr>";
    }).join("")) : '<div class="empty">目前沒有庫存</div>';
    var used = t.used.length ? tbl(["日期", "醫院", "醫師", "型號", "批號", "數量", "狀態"], t.used.map(function (u) {
      return "<tr><td>" + esc(u.r.date) + "</td><td>" + esc(L.locName(S, u.r.hospital)) + "</td><td>" + esc(u.r.doctor) + '</td><td class="code">' + esc(u.it.sku) + '</td><td class="code">' + esc(u.it.lot) + '</td><td class="num">' + u.it.qty +
        '</td><td><span class="badge ' + u.r.status + '">' + L.STATUS[u.r.status] + "</span>" + (u.it.scrap ? ' <span class="badge scrap">報廢</span>' : "") + "</td></tr>";
    }).join("")) : '<div class="empty">沒有報刀使用紀錄</div>';
    var sold = t.sold.length ? tbl(["單據", "日期", "客戶", "型號", "批號", "數量"], t.sold.map(function (s) {
      var c = L.customer(S, s.o.customer);
      return '<tr><td class="code">' + esc(s.o.no) + "</td><td>" + esc(s.o.date) + "</td><td>" + esc(c ? c.name : "") + '</td><td class="code">' + esc(s.l.sku) + '</td><td class="code">' + esc(s.l.lot) + '</td><td class="num">' + s.l.qty + "</td></tr>";
    }).join("")) : '<div class="empty">沒有銷貨紀錄</div>';
    return "<h4>目前庫存位置</h4>" + stock + "<h4>報刀使用（召回時要通知的醫院與醫師）</h4>" + used + "<h4>銷貨出貨（召回時要通知的客戶）</h4>" + sold + "<h4>相關操作紀錄</h4>" + auditTable(t.logs.slice(0, 50));
  }
  function auditTable(rows) {
    if (!rows.length) return '<div class="empty">沒有紀錄</div>';
    return '<div class="table-wrap" style="max-height:320px"><table class="table"><thead><tr><th>時間</th><th>人員</th><th>動作</th><th>內容</th></tr></thead><tbody>' +
      rows.map(function (e) { return '<tr><td class="code">' + esc(e.ts) + "</td><td>" + esc(e.user) + "</td><td>" + esc(e.action) + "</td><td>" + esc(e.detail) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function renderTrace() {
    if (!can("audit_view")) return noPerm("查看批號追溯");
    return card("TRACE", "批號追溯", '<label class="field" style="max-width:420px">批號或型號<input id="traceInput" value="' + esc(traceQ) + '" placeholder="例如 2402270013" autocomplete="off"></label>' +
      '<div id="traceResults">' + traceResultsHtml() + "</div>") +
      card("AUDIT", "操作紀錄（只增不改，最近 100 筆）", auditTable(S.log.slice(0, 100)));
  }

  // ---------------- 設定 ----------------
  function renderSettings() {
    var ok = can("settings_edit"), admin = can("manage_perms");
    var qtyAt = {};
    S.lots.forEach(function (x) { qtyAt[x.loc] = (qtyAt[x.loc] || 0) + x.qty; });
    var locRows = S.locations.map(function (l) {
      var qty = qtyAt[l.id] || 0, geoDis = ok ? "" : " disabled";
      return '<tr><td><input class="cellinput" data-act="loc-rename" data-id="' + esc(l.id) + '" value="' + esc(l.name) + '"' + (ok ? "" : " disabled") + "></td><td>" + TYPE[l.type] + "</td>" +
        '<td><input class="cellinput" type="number" step="0.0001" style="width:104px" data-act="loc-geo" data-field="lat" data-id="' + esc(l.id) + '" value="' + (typeof l.lat === "number" ? l.lat : "") + '" placeholder="24.1477"' + geoDis + "></td>" +
        '<td><input class="cellinput" type="number" step="0.0001" style="width:104px" data-act="loc-geo" data-field="lng" data-id="' + esc(l.id) + '" value="' + (typeof l.lng === "number" ? l.lng : "") + '" placeholder="120.6736"' + geoDis + "></td>" +
        "<td>" + (l.type === "rep" ? '<input type="checkbox" data-act="loc-duty" data-id="' + esc(l.id) + '"' + (l.onDuty ? " checked" : "") + geoDis + ">" : "") + '</td><td class="num">' + qty + "</td>" +
        '<td><button class="btn btn-sm btn-danger" data-act="del-loc" data-id="' + esc(l.id) + '"' + (ok && qty === 0 && l.type !== "company" ? "" : ' disabled title="庫位還有庫存或是公司倉，不能刪除"') + ">刪除</button></td></tr>";
    }).join("");
    var groups = {};
    L.plates(S).forEach(function (p) { groups[p.group] = 1; });
    var dis = ok ? "" : " disabled";


    var catRows = (S.categories || []).map(function (c) {
      var n = L.categoryProducts(S, c.id).length;
      return "<tr><td><b>" + esc(c.name) + "</b></td><td>" + (c.fields.map(function (f) { return '<span class="chip-kind">' + esc(f.label) + "</span>"; }).join(" ") || '<span class="muted">沒有額外欄位</span>') + '</td><td class="num">' + n + "</td>" +
        '<td><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="cprod-new" data-cat="' + esc(c.id) + '"' + dis + ">＋ 新增產品</button>" +
        '<button class="btn btn-sm" data-act="cat-edit" data-id="' + esc(c.id) + '"' + dis + ">編輯欄位</button>" +
        '<button class="btn btn-sm btn-danger" data-act="cat-del" data-id="' + esc(c.id) + '"' + (ok && !n ? "" : ' disabled title="底下還有產品，或沒有設定權限"') + ">刪除</button></div></td></tr>";
    }).join("");
    var catCard = card("CATEGORIES", "產品別", '<p class="muted" style="margin-bottom:12px">骨板和骨釘是內建的。公司還有其他產品（例如 PRP），可以在這裡新增產品別，並自訂這個產品要記哪些欄位，例如代理商名、容量。新增後業務就能在報刀選到，庫存頁會多一個分頁。</p>' +
      (catRows ? '<div class="table-wrap"><table class="table"><thead><tr><th>產品別</th><th>欄位</th><th class="num">產品數</th><th></th></tr></thead><tbody>' + catRows + "</tbody></table></div>" : '<div class="empty">還沒有其他產品別。</div>') +
      '<div style="margin-top:14px"><button class="btn btn-primary" data-act="cat-new"' + dis + ">＋ 新增產品別</button></div>");

    var custRows = S.customers.map(function (c) { return '<tr><td class="code">' + esc(c.code) + "</td><td>" + esc(c.name) + "</td><td>" + esc(c.addr) + "</td><td>" + esc(c.contact) + "</td></tr>"; }).join("");

    var userRows = S.users.map(function (u) {
      return "<tr><td>" + esc(u.name) + '</td><td><select class="cellinput" data-act="user-role" data-name="' + esc(u.name) + '"' + (admin ? "" : " disabled") + ">" + options(L.ROLES.map(function (r) { return { v: r, t: r }; }), u.role) + "</select></td></tr>";
    }).join("");

    var lastGroup = null;
    var permRows = L.CAPS.map(function (c) {
      var head = c[2] !== lastGroup ? '<tr class="group"><td colspan="4">' + esc(c[2]) + "</td></tr>" : "";
      lastGroup = c[2];
      return head + "<tr><td>" + esc(c[1]) + "</td>" + L.ROLES.map(function (r) {
        var fixed = r === L.OWNER || c[0] === "manage_perms";
        var on = r === L.OWNER || (c[0] !== "manage_perms" && !!(S.perms[r] && S.perms[r][c[0]]));
        return '<td><input type="checkbox" data-act="perm" data-role="' + r + '" data-cap="' + c[0] + '"' + (on ? " checked" : "") + (admin && !fixed ? "" : " disabled") + "></td>";
      }).join("") + "</tr>";
    }).join("");

    return (ok && admin ? "" : '<div class="card"><div class="empty">目前身分是「' + esc(S.operator) + "」：" + (ok ? "" : "庫位／客戶／品項只能檢視；") + (admin ? "" : "權限只有管理員能調整。") + "</div></div>") +
      card("PERMISSIONS", "權限設定", '<p class="muted" style="margin-bottom:12px">勾選代表這個角色可以。例如要讓業務看不到金額，就取消「查看金額與單價」。調整後切換上方操作人員就能馬上看到差異。</p>' +
        '<div class="table-wrap"><table class="table perm-table"><thead><tr><th>權限</th>' + L.ROLES.map(function (r) { return "<th>" + r + "</th>"; }).join("") + "</tr></thead><tbody>" + permRows + "</tbody></table></div>" +
        "<h4>人員</h4>" + '<div class="table-wrap"><table class="table"><thead><tr><th>名稱</th><th>角色</th></tr></thead><tbody>' + userRows + "</tbody></table></div>" +
        '<form data-form="adduser" class="row" style="margin-top:14px"><label class="field">新人員名稱<input name="name" required></label>' +
        '<label class="field">角色<select name="role">' + options(L.ROLES.map(function (r) { return { v: r, t: r }; }), "業務") + '</select></label><button class="btn btn-primary"' + (admin ? "" : " disabled") + ">新增人員</button></form>") +
      card("LOCATIONS", "庫位管理", '<p class="muted" style="margin-bottom:12px">醫院寄庫、業務的移動庫存都在這裡設定，新增後報刀和庫存頁會自動出現這個庫位。</p>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>名稱</th><th>類型</th><th>緯度</th><th>經度</th><th>執勤中</th><th class="num">庫存支數</th><th></th></tr></thead><tbody>' + locRows + "</tbody></table></div>" +
        '<form data-form="addloc" class="row" style="margin-top:14px"><label class="field">新庫位名稱<input name="name" required' + dis + '></label>' +
        '<label class="field">類型<select name="type"' + dis + '><option value="hospital">醫院寄庫</option><option value="rep">業務移動庫存</option></select></label>' +
        '<button class="btn btn-primary"' + dis + ">新增庫位</button></form>") +
      card("CUSTOMERS", "客戶", '<div class="table-wrap"><table class="table"><thead><tr><th>編號</th><th>名稱</th><th>地址</th><th>聯絡人</th></tr></thead><tbody>' + custRows + "</tbody></table></div>" +
        '<form data-form="addcustomer" class="grid" style="margin-top:14px"><label class="field">編號<input name="code" required' + dis + '></label><label class="field">名稱<input name="name" required' + dis + '></label>' +
        '<label class="field">地址<input name="addr"' + dis + '></label><label class="field">聯絡人<input name="contact"' + dis + '></label><label class="field">電話<input name="tel"' + dis + '></label>' +
        '<div class="field">&nbsp;<button class="btn btn-primary"' + dis + ">新增客戶</button></div></form>") +
      catCard +
      card("PRODUCTS", "新增骨板品項", '<form data-form="addproduct" class="grid"><label class="field">型號<input name="sku" required' + dis + '></label><label class="field">品名<input name="name" required' + dis + "></label>" +
        '<label class="field">單價<input name="price" type="number" min="0" required' + dis + '></label><label class="field">分類<input name="group" list="groups" required' + dis + '></label>' +
        '<datalist id="groups">' + Object.keys(groups).map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
        '<div class="field">&nbsp;<button class="btn btn-primary"' + dis + ">新增品項</button></div></form>") +
      card("DEMO", "示範資料", '<p class="muted" style="margin-bottom:12px">資料只存在這台瀏覽器。操作紀錄畫面上沒有任何刪除或修改功能。</p><button class="btn btn-danger" data-act="reset-demo">重設為初始示範資料</button>');
  }

  // ---------------- dialogs ----------------
  // Re-rendering through innerHTML throws away every scroll position inside the page. On a phone that
  // is what sent a pinch-zoomed screw box back to its left edge after each tap, so remember them.
  var SCROLLERS = ".boxscroll, .dlg-b, .table-wrap, .flow-wrap";
  function keepScroll(root, rebuild) {
    var vx = window.scrollX, vy = window.scrollY;
    var saved = [].map.call(root.querySelectorAll(SCROLLERS), function (el) { return [el.scrollLeft, el.scrollTop]; });
    rebuild();
    [].forEach.call(root.querySelectorAll(SCROLLERS), function (el, i) {
      if (saved[i]) { el.scrollLeft = saved[i][0]; el.scrollTop = saved[i][1]; }
    });
    window.scrollTo(vx, vy);
  }
  function openDialog(title, fn, wide) {
    dlg.className = wide ? "wide" : "";
    refreshDlg = function () { keepScroll(dlg, function () { dlg.innerHTML = '<div class="dlg"><div class="dlg-h"><h3>' + esc(title) + '</h3><button data-close aria-label="關閉">×</button></div><div class="dlg-b">' + fn() + "</div></div>"; labelTables(dlg); }); };
    dlg.innerHTML = "";
    refreshDlg();
    if (!dlg.open) dlg.showModal();
  }
  function closeDialog() { refreshDlg = null; if (dlg.open) dlg.close(); }

  function openLot(loc, sku) {
    openDialog(sku + " " + pName(sku) + " @ " + L.locName(S, loc), function () {
      var ls = L.lines(S, loc, sku), edit = can("stock_edit");
      var rows = ls.map(function (l) {
        return '<tr><td class="code">' + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num"><input class="cellinput" type="number" min="0" style="width:84px" value="' + l.qty + '" data-act="lot-adj" data-loc="' + esc(loc) + '" data-sku="' + esc(sku) + '" data-lot="' + esc(l.lot) + '"' + (edit ? "" : " disabled") + "></td>" +
          '<td><button class="btn btn-sm" data-act="open-transfer" data-from="' + esc(loc) + '" data-sku="' + esc(sku) + '" data-lot="' + esc(l.lot) + '"' + (edit && !L.isExpired(l.exp) ? "" : " disabled") + ">調撥</button></td></tr>";
      }).join("");
      return (ls.length ? tbl(["批號", "效期", "數量（可盤點修改）", ""], rows) : '<div class="empty">這個庫位沒有這個品項。</div>') +
        '<div style="margin-top:14px"><button class="btn btn-sm" data-act="open-inbound" data-loc="' + esc(loc) + '" data-sku="' + esc(sku) + '"' + (edit ? "" : " disabled") + ">＋ 入庫到這個庫位</button></div>";
    });
  }

  function openInbound(loc, sku) {
    openDialog("入庫", function () {
      var groups = {}, order = [];
      S.products.filter(function (p) { return p.kind !== "screw"; }).forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
      var skuOpts = order.map(function (g) {
        return '<optgroup label="' + esc(g) + '">' + options(groups[g].map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), sku) + "</optgroup>";
      }).join("");
      return '<p class="muted" style="margin-bottom:12px">這裡入骨板。骨釘請到「庫存 → 骨釘盒」，打開盒子點空位增加。</p><form data-form="inbound" class="grid"><label class="field">品項<select name="sku">' + skuOpts + "</select></label>" +
        '<label class="field">入庫到<select name="loc">' + locOptions(S.locations, loc || "co") + "</select></label>" +
        '<label class="field">批號<input name="lot" required></label><label class="field">效期<input name="exp" type="date" required value="' + L.addDays(540) + '"></label>' +
        '<label class="field">數量<input name="qty" type="number" min="1" step="1" value="1" required></label>' +
        '<div class="field">&nbsp;<button class="btn btn-primary">確認入庫</button></div></form>';
    });
  }

  function openTransfer(pre) {
    var withStock = S.locations.filter(function (l) { return S.lots.some(function (x) { return x.loc === l.id && x.qty > 0 && !L.isExpired(x.exp); }); });
    TR = { from: (pre && pre.from) || (withStock[0] && withStock[0].id) || "co", sku: (pre && pre.sku) || "", lot: (pre && pre.lot) || "", qty: 1, to: "" };
    openDialog("調撥", transferHtml);
  }
  function transferHtml() {
    var skus = S.products.filter(function (p) { return p.kind !== "screw" && usableLines(TR.from, p.sku).length; });
    if (!skus.some(function (p) { return p.sku === TR.sku; })) TR.sku = skus[0] ? skus[0].sku : "";
    var ls = TR.sku ? usableLines(TR.from, TR.sku) : [];
    if (!ls.some(function (l) { return l.lot === TR.lot; })) TR.lot = ls[0] ? ls[0].lot : "";
    var line = L.findLine(S, TR.from, TR.sku, TR.lot);
    var dests = S.locations.filter(function (l) { return l.id !== TR.from; });
    if (!dests.some(function (l) { return l.id === TR.to; })) TR.to = dests[0] ? dests[0].id : "";
    return '<form data-form="transfer" class="grid"><label class="field">從<select data-bind="tr-from">' + locOptions(S.locations, TR.from) + "</select></label>" +
      '<label class="field">品項<select data-bind="tr-sku">' + (options(skus.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), TR.sku) || "<option>沒有可調撥庫存</option>") + "</select></label>" +
      '<label class="field">批號<select data-bind="tr-lot">' + options(ls.map(function (l) { return { v: l.lot, t: l.lot + "｜" + l.exp + "｜剩 " + l.qty }; }), TR.lot) + "</select></label>" +
      '<label class="field">數量<input type="number" min="1" step="1" max="' + (line ? line.qty : 1) + '" value="' + TR.qty + '" data-bind="tr-qty"></label>' +
      '<label class="field">到<select data-bind="tr-to">' + locOptions(dests, TR.to) + "</select></label>" +
      '<div class="field">&nbsp;<button class="btn btn-primary">確認調撥</button></div></form><p class="muted" style="margin-top:10px">已過期的批號不能調撥。</p>';
  }

  // On narrow screens CSS turns each table row into a small card; it needs each cell's column name.
  function labelTables(root) {
    Array.prototype.forEach.call(root.querySelectorAll("table.table"), function (t) {
      if (t.classList.contains("matrix") || t.classList.contains("perm-table") || t.classList.contains("compact")) return;
      t.classList.add("stack");
      var heads = Array.prototype.map.call(t.querySelectorAll("thead th"), function (h) { return h.textContent.trim(); });
      Array.prototype.forEach.call(t.querySelectorAll("tbody tr"), function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i]) td.setAttribute("data-label", heads[i]); });
      });
    });
  }

  // ---------------- render ----------------
  var current = function () { return NAV.filter(function (n) { return n.id === tab; })[0] || NAV[0]; };

  var renderedTab = null;
  function render() {
    var visible = NAV.filter(function (n) { return n.show(); });
    if (!visible.some(function (n) { return n.id === tab; })) tab = defaultTab();

    document.getElementById("operator").innerHTML = options(S.users.map(function (u) { return { v: u.name, t: u.name }; }), S.operator);
    document.getElementById("roleChip").textContent = L.role(S);
    var navBtn = function (n) {
      return '<button data-tab="' + n.id + '"' + (n.id === tab ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n.id] + "</svg><span>" + n.label + "</span></button>";
    };
    document.getElementById("nav").innerHTML = visible.map(navBtn).join("");
    // A phone has room for about five: the rest go behind 更多.
    var shown = visible.length > 5 ? visible.slice(0, 4) : visible;
    moreItems = visible.length > 5 ? visible.slice(4) : [];
    document.getElementById("bottomnav").innerHTML = shown.map(navBtn).join("") + (moreItems.length
      ? '<button data-act="more-nav"' + (moreItems.some(function (n) { return n.id === tab; }) ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg><span>更多</span></button>' : "");

    var cur = current();
    document.querySelector(".main").classList.toggle("wide-page", tab === "stock");
    document.getElementById("pageHead").innerHTML = '<div class="eyebrow">' + esc(cur.id) + "</div><h1>" + esc(cur.title) + "</h1><p>" + esc(cur.sub) + "</p>";

    var html = tab === "intro" ? renderIntro() : tab === "todo" ? renderTodo() : tab === "report" ? renderReport() : tab === "sales" ? renderSales() : tab === "stock" ? renderStock() : tab === "docs" ? renderDocs() : tab === "acct" ? renderAcct() : tab === "stats" ? renderStats() : tab === "trace" ? renderTrace() : renderSettings();
    // Only the same page keeps its scroll; a page change starts from the top.
    if (tab !== renderedTab) { renderedTab = tab; view.innerHTML = html; labelTables(view); }
    else keepScroll(view, function () { view.innerHTML = html; labelTables(view); });
    if (dlg.open && refreshDlg) refreshDlg();
  }

  // ---------------- events ----------------
  document.getElementById("operator").addEventListener("change", function (e) {
    S.operator = e.target.value; persist(); tab = defaultTab(); render(); window.scrollTo(0, 0);
  });
  function onNav(e) {
    var b = e.target.closest("[data-tab]");
    if (b) { tab = b.getAttribute("data-tab"); render(); window.scrollTo(0, 0); }
  }
  document.getElementById("nav").addEventListener("click", onNav);
  document.getElementById("bottomnav").addEventListener("click", onNav);
  dlg.addEventListener("click", function (e) {
    var t = e.target.closest("[data-tab]");
    if (t) { tab = t.getAttribute("data-tab"); closeDialog(); render(); window.scrollTo(0, 0); return; }
    if (e.target === dlg || e.target.closest("[data-close]")) closeDialog();
  });
  dlg.addEventListener("close", function () { refreshDlg = null; });

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    var a = el.getAttribute("data-act"), g = function (k) { return el.getAttribute("data-" + k); };

    if (a === "add-main" && L.isDealer(S)) { D.main.push({ sku: L.sellable(S)[0].sku, lot: "", qty: 1, scrap: false }); render(); }
    else if (a === "add-main") {
      var first = L.sellable(S).filter(function (p) { return usableLines(D.loc, p.sku).length; })[0];
      if (!first) return toast("這個扣庫來源沒有可用的庫存", true);
      D.main.push({ sku: first.sku, lot: usableLines(D.loc, first.sku)[0].lot, qty: 1, scrap: false });
      render();
    } else if (a === "rm-main") { D.main.splice(+g("i"), 1); render(); }
    else if (a === "seat-add") {
      var sid = L.slotId(g("box"), Number(g("band")), Number(g("cell"))), sl = L.parseSlot(S, sid);
      if (sl && !D.picks.some(function (x) { return x.id === sid; })) D.picks.push({ id: sid, sku: L.skuFor(sl.band.name, L.slotLabel(sl.box, sl.i)), lot: sl.box.lot, scrap: false });
      render();
    } else if (a === "seat-sub") {
      var sid2 = L.slotId(g("box"), Number(g("band")), Number(g("cell")));
      D.picks = D.picks.filter(function (x) { return x.id !== sid2; });
      render();
    }
    else if (a === "scrap-one") {
      var pk = D.picks[+g("idx")];
      if (pk) pk.scrap = true;
      render();
    } else if (a === "dec-pick") {
      D.picks.splice(+g("idx"), 1);
      render();
        } else if (a === "rep-filter") { repFilter = g("v"); render(); }
    else if (a === "approve") run(function () { var ar = L.approveReport(S, g("id")); if (dlg.open && refreshDlg) refreshDlg(); return ar; }, "已確認：已扣庫，並產生借出還回單、銷貨憑單與補貨借出草稿");
    else if (a === "reject") {
      var why = window.prompt("退回原因（可留空）");
      if (why !== null) run(function () { L.rejectReport(S, g("id"), why); }, "已退回");
    } else if (a === "export-csv") {
      var blob = new Blob(["﻿" + L.reportsCSV(S)], { type: "text/csv;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "報刀紀錄-" + L.ymd(new Date()) + ".csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } else if (a === "stock-view") { stockView = g("v"); render(); }
    else if (a === "trace-lot") { traceQ = g("lot"); render(); }
    else if (a === "move-kind") { moveKind = g("v"); render(); }
    else if (a === "cat-new") openCategory(null);
    else if (a === "cat-edit") openCategory(g("id"));
    else if (a === "cat-del") {
      if (window.confirm("確定刪除這個產品別？")) run(function () { L.deleteCategory(S, g("id")); }, "已刪除產品別");
    } else if (a === "ce-add") { syncCE(); CE.fields.push({ label: "", type: "text" }); refreshDlg(); }
    else if (a === "ce-rm") { syncCE(); CE.fields.splice(+g("i"), 1); refreshDlg(); }
    else if (a === "ce-save") {
      syncCE();
      var fieldsOut = CE.fields.filter(function (f) { return String(f.label).trim() || f.key; });
      if (run(function () { if (CE.id) L.updateCategory(S, CE.id, { name: CE.name, fields: fieldsOut }); else L.addCategory(S, { name: CE.name, fields: fieldsOut }); }, "已儲存產品別")) closeDialog();
    }
    else if (a === "cprod-new") openCustomProduct(g("cat"));
    else if (a === "cprod-edit") { var cp0 = L.product(S, g("sku")); if (cp0) openCustomProduct(cp0.cat, cp0.sku); }
    else if (a === "intro-go") { tab = g("tab"); render(); window.scrollTo(0, 0); }
    else if (a === "intro-as") { S.operator = g("name"); persist(); tab = g("tab"); render(); window.scrollTo(0, 0); }
    else if (a === "open-report") openReport(g("id"));
    else if (a === "stock-scope") { stockScope = g("v"); stockLoc = null; render(); }
    else if (a === "acct-view") { acctView = g("v"); render(); }
    else if (a === "pay-order") openPay(g("id"));
    else if (a === "more-nav") {
      openDialog("更多", function () {
        return '<div class="more-list">' + moreItems.map(function (n) {
          return '<button class="btn" data-tab="' + n.id + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n.id] + "</svg>" + n.label + "</button>";
        }).join("") + "</div>";
      });
    }
    else if (a === "map-pick") {
      var pid = g("id"), ploc = L.location(S, pid);
      if (!ploc) return;
      if (stockLoc === pid) stockLoc = null; else { stockLoc = pid; stockScope = ploc.type; }
      render();
    } else if (a === "map-clear") { stockLoc = null; render(); }
    else if (a === "map-zoom-in") mapZoom(1.7, null, null, true);
    else if (a === "map-zoom-out") mapZoom(1 / 1.7, null, null, true);
    else if (a === "map-fit") mapGo(mapFit(mapMarkers(false)), true);
    else if (a === "map-all") mapGo({ k: 1, x: 0, y: 0 }, true);
    else if (a === "go-todo") { tab = "todo"; render(); window.scrollTo(0, 0); }
    else if (a === "toggle-picker") {
      if (!D.showPicker && !boxesAt(D.loc).length) return toast("這個扣庫來源沒有骨釘盒", true);
      D.showPicker = !D.showPicker; render();
    } else if (a === "close-picker") { D.showPicker = false; render(); }
    else if (a === "open-lot") openLot(g("loc"), g("sku"));
    else if (a === "open-inbound") openInbound(g("loc"), g("sku"));
    else if (a === "open-transfer") openTransfer(g("from") ? { from: g("from"), sku: g("sku"), lot: g("lot") } : null);
    else if (a === "seat-take" || a === "seat-put") {
      run(function () { L.toggleSlot(S, g("box"), Number(g("band")), Number(g("cell"))); });
    } else if (a === "open-box") openBox(g("id"));
    else if (a === "new-box") openBoxConfig(null);
    else if (a === "edit-box") openBoxConfig(g("id"));
    else if (a === "move-box") openMoveBox(g("id"));
    else if (a === "del-box") {
      var bid = g("id");
      if (window.confirm("確定刪除這個骨釘盒？")) { if (run(function () { L.deleteBox(S, bid); }, "已刪除")) closeDialog(); }
    } else if (a === "gen-labels") {
      var fm = el.closest("form"), from = Number(fm.elements.gFrom.value), to = Number(fm.elements.gTo.value), step = Number(fm.elements.gStep.value), rep = Number(fm.elements.gRepeat.value);
      if (!(step >= 1 && rep >= 1 && to >= from)) return toast("起訖、間距、欄數要填對", true);
      var gen = [];
      for (var n = from; n <= to; n += step) for (var k = 0; k < rep; k++) gen.push(n);
      fm.elements.labels.value = gen.join(" ");
        } else if (a === "open-sales") { SD = deepCopy(S.sales.filter(function (o) { return o.id === g("id"); })[0]); tab = "sales"; render(); window.scrollTo(0, 0); }
    else if (a === "sales-new") { SD = newSales(); render(); }
    else if (a === "add-sline") {
      var ln = newSalesLine();
      if (!ln) return toast("目前沒有可出貨的庫存", true);
      SD.lines.push(ln); render();
    } else if (a === "rm-sline") { SD.lines.splice(+g("i"), 1); render(); }
    else if (a === "sales-confirm") {
      run(function () { var o = L.saveSales(S, SD); SD = deepCopy(L.confirmSales(S, o.id)); }, "已覆核出貨，庫存已扣除");
    } else if (a === "sales-invoice") {
      run(function () { SD = deepCopy(L.issueInvoice(S, SD.id)); }, "已開立發票（示範）");
    } else if (a === "del-loc") {
      var id = g("id");
      if (window.confirm("確定刪除這個庫位？")) run(function () {
        if (!can("settings_edit")) throw new Error("沒有權限：庫位、品項、客戶設定");
        L.log(S, "刪除庫位", L.locName(S, id));
        S.locations = S.locations.filter(function (l) { return l.id !== id; });
        S.lots = S.lots.filter(function (x) { return x.loc !== id; });
        if (!L.location(S, D.hospital)) D = newDraft();
      }, "已刪除");
    } else if (a === "reset-demo") {
      if (window.confirm("所有操作會被清掉，回到初始示範資料。確定？")) { S = L.reset(); D = newDraft(); SD = newSales(); closeDialog(); persist(); render(); toast("已重設"); }
    }
  });

  function resetPicker() { D.main = []; D.picks = []; D.sp = { box: "" }; D.showPicker = false; }

  document.addEventListener("change", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind"), act = t.getAttribute && t.getAttribute("data-act");
    if (act === "loc-rename") {
      var loc = L.location(S, t.getAttribute("data-id")), nm = t.value.trim();
      if (loc && nm && nm !== loc.name) run(function () { need("settings_edit"); L.log(S, "庫位改名", loc.name + " → " + nm); loc.name = nm; }, "已更新");
      return;
    }
    if (act === "loc-geo") {
      var row = t.closest("tr"), gid = t.getAttribute("data-id");
      var glat = row.querySelector('[data-field="lat"]').value, glng = row.querySelector('[data-field="lng"]').value;
      if (!run(function () { L.setGeo(S, gid, { lat: glat, lng: glng }); }, "已更新座標")) render();
      return;
    }
    if (act === "loc-duty") {
      var did = t.getAttribute("data-id"), dl = L.location(S, did), duty = t.checked;
      if (!run(function () { L.setGeo(S, did, { lat: dl.lat, lng: dl.lng, onDuty: duty }); }, duty ? "已設為執勤中" : "已設為未執勤")) render();
      return;
    }
    if (act === "lot-adj") {
      run(function () { L.adjustStock(S, t.getAttribute("data-loc"), t.getAttribute("data-sku"), t.getAttribute("data-lot"), Math.floor(Number(t.value))); }, "已盤點調整");
      return;
    }
    if (act === "perm") {
      var on = t.checked;
      if (!run(function () { L.setPerm(S, t.getAttribute("data-role"), t.getAttribute("data-cap"), on); }, "權限已更新")) render();
      return;
    }
    if (act === "user-role") {
      run(function () { L.setUserRole(S, t.getAttribute("data-name"), t.value); }, "角色已更新");
      return;
    }
    if (!b) return;
    var i = +t.getAttribute("data-i");
    if (b === "hospital") { D.hospital = t.value; D.loc = t.value; resetPicker(); render(); }
    else if (b === "loc") { D.loc = t.value; resetPicker(); render(); }
    else if (b === "main-sku") { var ln = usableLines(D.loc, t.value)[0]; D.main[i] = { sku: t.value, lot: ln ? ln.lot : "", qty: 1, scrap: D.main[i].scrap }; render(); }
    else if (b === "main-lot") { D.main[i].lot = t.value; render(); }
    else if (b === "main-qty") { D.main[i].qty = Math.max(1, Math.floor(Number(t.value)) || 1); render(); }
    else if (b === "main-scrap") { D.main[i].scrap = t.checked; }
    else if (b === "sp-box") { D.sp.box = t.value; render(); }
    else if (b === "acct-month") { acctMonth = t.value; render(); }
    else if (b === "map-layer") { mapLayers[t.getAttribute("data-layer")] = t.checked; render(); }
    else if (b === "stock-zero") { stockZero = t.checked; render(); }
    else if (b === "date") D.date = t.value;
    else if (b === "s-date") SD.date = t.value;
    else if (b === "s-customer") { SD.customer = t.value; render(); }
    else if (b === "s-taxmode") { SD.taxMode = t.value; render(); }
    else if (b === "s-rep") SD.salesRep = t.value;
    else if (b === "sl-sku") {
      var p = L.product(S, t.value), locs = stockLocsFor(t.value), keep = locs.some(function (x) { return x.id === SD.lines[i].loc; }) ? SD.lines[i].loc : (locs[0] && locs[0].id);
      var lot0 = keep ? (usableLines(keep, t.value)[0] || {}).lot : "";
      SD.lines[i] = { sku: t.value, loc: keep, lot: lot0, qty: 1, price: p.price }; render();
    } else if (b === "sl-loc") { SD.lines[i].loc = t.value; SD.lines[i].lot = (usableLines(t.value, SD.lines[i].sku)[0] || {}).lot || ""; render(); }
    else if (b === "sl-lot") { SD.lines[i].lot = t.value; render(); }
    else if (b === "sl-qty") { SD.lines[i].qty = Math.max(1, Math.floor(Number(t.value)) || 1); render(); }
    else if (b === "sl-price") { SD.lines[i].price = Math.max(0, Number(t.value) || 0); render(); }
    else if (b.indexOf("tr-") === 0) {
      var k = b.slice(3);
      TR[k] = k === "qty" ? Math.max(1, Math.floor(Number(t.value)) || 1) : t.value;
      if (k === "from") { TR.sku = ""; TR.lot = ""; }
      if (k === "sku") TR.lot = "";
      if (refreshDlg) refreshDlg();
    }
  });
  function need(cap) { L.need(S, cap); }

  document.addEventListener("input", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind");
    if (b === "doctor") D.doctor = t.value;
    else if (b === "note") D.note = t.value;
    else if (b === "s-dept") SD.dept = t.value;
    else if (b === "s-note") SD.note = t.value;
    else if (t.id === "stockSearch") {
      stockQ = t.value;
      document.getElementById("matrixHost").innerHTML = platesMatrix();
      labelTables(document.getElementById("matrixHost"));
    } else if (t.id === "traceInput") {
      traceQ = t.value;
      document.getElementById("traceResults").innerHTML = traceResultsHtml();
      labelTables(document.getElementById("traceResults"));
    }
  });

  document.addEventListener("submit", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-form");
    if (!f) return;
    e.preventDefault();
    var v = function (n) { return e.target.elements[n].value; };
    if (f === "report") {
      openSubmitCheck();
    } else if (f === "sales") {
      run(function () { SD = deepCopy(L.saveSales(S, SD)); }, "憑單已儲存");
    } else if (f === "inbound") {
      if (run(function () { L.addStock(S, v("loc"), v("sku"), v("lot").trim(), v("exp"), Math.floor(Number(v("qty")))); }, "已入庫")) closeDialog();
    } else if (f === "cprod") {
      var cat2 = L.category(S, CP.cat), attrs = {};
      cat2.fields.forEach(function (fl) { attrs[fl.key] = e.target.elements["a_" + fl.key].value; });
      if (run(function () {
        if (CP.sku) L.setProductAttrs(S, CP.sku, attrs);
        else L.addCustomProduct(S, { cat: CP.cat, sku: v("sku"), name: v("name"), price: v("price"), attrs: attrs });
      }, CP.sku ? "已儲存" : "已新增產品")) { if (!CP.sku) stockView = "cat:" + CP.cat; closeDialog(); }
    } else if (f === "transfer") {
      if (run(function () { L.transfer(S, TR.from, TR.to, TR.sku, TR.lot, TR.qty); }, "已調撥")) closeDialog();
    } else if (f === "boxcfg") {
      var bid2 = e.target.getAttribute("data-id");
      var labels = v("labels").split(/[\s,，、]+/).filter(Boolean);
      var bands = [0, 1, 2, 3].map(function (i) { return { name: v("bname" + i).trim(), rows: Number(v("brows" + i)) }; }).filter(function (x) { return x.name; });
      var out = run(function () {
        var cfgObj = { name: v("name"), loc: v("loc"), lot: v("lot"), exp: v("exp"), labels: labels, bands: bands };
        return bid2 ? L.updateBox(S, bid2, cfgObj) : L.createBox(S, cfgObj);
      }, "已儲存骨釘盒");
      if (out) { closeDialog(); openBox(out.id); }
    } else if (f === "movebox") {
      var mid = e.target.getAttribute("data-id");
      if (run(function () { return L.moveBox(S, mid, v("to")); }, "已調撥整盒")) { closeDialog(); openBox(mid); }
    } else if (f === "pay") {
      var oid = e.target.getAttribute("data-id");
      if (run(function () { L.receivePayment(S, oid, Number(v("amount")), v("date"), v("method")); }, "已登記收款，傳票已產生")) closeDialog();
    } else if (f === "adduser") {
      run(function () { L.addUser(S, v("name"), v("role")); e.target.reset(); }, "已新增人員");
    } else if (f === "addloc") {
      run(function () {
        need("settings_edit");
        var name = v("name").trim();
        if (S.locations.some(function (l) { return l.name === name; })) throw new Error("已有同名庫位");
        S.locations.push({ id: "x" + Date.now().toString(36), name: name, type: v("type") });
        L.log(S, "新增庫位", name + "（" + TYPE[v("type")] + "）");
        e.target.reset();
      }, "已新增庫位");
    } else if (f === "addcustomer") {
      run(function () {
        need("settings_edit");
        var code = v("code").trim();
        if (S.customers.some(function (c) { return c.code === code; })) throw new Error("客戶編號已存在");
        S.customers.push({ id: "c" + Date.now().toString(36), code: code, name: v("name").trim(), addr: v("addr").trim(), contact: v("contact").trim(), tel: v("tel").trim() });
        L.log(S, "新增客戶", code + " " + v("name").trim());
        e.target.reset();
      }, "已新增客戶");
    } else if (f === "addproduct") {
      run(function () {
        need("settings_edit");
        var sku = v("sku").trim();
        if (L.product(S, sku)) throw new Error("型號已存在");
        S.products.push({ sku: sku, name: v("name").trim(), price: Number(v("price")), group: v("group").trim(), kind: "plate" });
        L.log(S, "新增品項", sku + " " + v("name").trim());
        e.target.reset();
      }, "已新增品項");
    }
  });

  // Pan, wheel-zoom and the pin tooltip. Pointer positions are converted through the SVG's own
  // matrix, so it stays right however the map is letterboxed or sized.
  var drag = null;
  function svgPoint(svg, e) {
    try {
      var pt = svg.createSVGPoint(), m = svg.getScreenCTM();
      pt.x = e.clientX; pt.y = e.clientY;
      if (m) { var r = pt.matrixTransform(m.inverse()); return { x: r.x, y: r.y }; }
    } catch (err) { /* no SVG matrix available: fall back to the centre */ }
    return { x: MAP ? MAP.w / 2 : 0, y: MAP ? MAP.h / 2 : 0 };
  }
  document.addEventListener("pointerdown", function (e) {
    var svg = e.target.closest && e.target.closest(".tw-svg");
    if (!svg || e.target.closest(".mk") || !mapView) return;
    var p = svgPoint(svg, e);
    drag = { svg: svg, px: p.x, py: p.y, vx: mapView.x, vy: mapView.y };
    svg.classList.add("dragging");
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = svgPoint(drag.svg, e);
    // The pan transform lives on a child group, so the svg's own client -> user mapping never changes.
    mapView = { k: mapView.k, x: drag.vx + (p.x - drag.px), y: drag.vy + (p.y - drag.py) };
    applyMapView();
  });
  function endDrag() { if (drag) { drag.svg.classList.remove("dragging"); drag = null; } }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("wheel", function (e) {
    var svg = e.target.closest && e.target.closest(".tw-svg");
    if (!svg || !mapView) return;
    e.preventDefault();
    var p = svgPoint(svg, e);
    mapZoom(e.deltaY < 0 ? 1.22 : 1 / 1.22, p.x, p.y, false);
  }, { passive: false });

  function placeTip(e, tip) {
    var box = tip.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(box.width - 190, Math.max(4, e.clientX - box.left + 12)) + "px";
    tip.style.top = Math.max(4, e.clientY - box.top + 14) + "px";
  }
  document.addEventListener("mouseover", function (e) {
    var tip = document.querySelector(".tw-tip");
    if (!tip) return;
    var mk = e.target.closest && e.target.closest(".mk");
    if (mk) { tip.textContent = mk.getAttribute("data-tip"); tip.hidden = false; placeTip(e, tip); } else tip.hidden = true;
  });
  document.addEventListener("mousemove", function (e) {
    var tip = document.querySelector(".tw-tip");
    if (tip && !tip.hidden) placeTip(e, tip);
  });

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-act]");
    if (!el) return;
    var a = el.getAttribute("data-act"), g = function (k) { return el.getAttribute("data-" + k); };
    if (a === "submit-confirm") {
      if (run(function () { L.submitReport(S, draftPayload()); }, "已送出報刀，已通知帳務部、倉儲部、業務助理")) { D = newDraft(); closeDialog(); render(); }
    } else if (a === "re-edit") {
      var r = L.report(S, g("id"));
      RE = { date: r.date, doctor: r.doctor, shift: r.shift, patient: r.patient, mrn: r.mrn, deliverer: r.deliverer, note: r.note };
      refreshDlg();
    } else if (a === "re-cancel") { RE = null; refreshDlg(); }
    else if (a === "confirm-change") run(function () { var c = L.confirmChange(S, g("id")); toast(c.done ? "兩個單位都已確認，已移出清單" : "已確認，等待另一個單位"); });
    else if (a === "del-report") {
      var why = window.prompt("刪除原因（必填）");
      if (why !== null && run(function () { L.deleteReport(S, g("id"), why); }, "已刪除，已通知各部門")) refreshDlg && refreshDlg();
    } else if (a === "notif-open") { L.markRead(S, g("id")); L.save(S); render(); openReport(g("report")); }
    else if (a === "notif-all") run(function () { L.markRead(S, null); });
  });
  document.addEventListener("input", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind");
    if (!b) return;
    if (b.indexOf("re-") === 0 && RE) RE[b.slice(3)] = t.value;
    else if (b === "r-patient") D.patient = t.value;
    else if (b === "r-mrn") D.mrn = t.value;
    else if (b === "r-deliverer") D.deliverer = t.value;
    else if (b === "main-lotx") D.main[+t.getAttribute("data-i")].lot = t.value;
  });
  document.addEventListener("change", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind");
    if (b === "r-shift") D.shift = t.value;
    else if (b === "r-rep") D.rep = t.value;
    else if (b === "re-shift" && RE) RE.shift = t.value;
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-form"), id = e.target.getAttribute && e.target.getAttribute("data-id");
    if (f === "re") {
      e.preventDefault();
      var res = run(function () { return L.editReport(S, id, RE); });
      if (res) {
        RE = null; refreshDlg();
        toast(!res.changed ? "沒有變更" : res.flagged ? "已儲存，列入異動待確認；系統已標記為報錯" : res.pending ? "已儲存，列入異動待確認" : "已儲存（不需確認）");
      }
    } else if (f === "flags") {
      e.preventDefault();
      var el = e.target.elements;
      if (run(function () { L.setReportFlags(S, id, el.to.value, el.type.value, el.reason.value); }, "已更改報刀狀況，已通知主管、負責人")) refreshDlg();
    } else if (f === "units") {
      e.preventDefault();
      var el2 = e.target.elements;
      if (run(function () { L.setUnits(S, id, Number(el2.units.value), el2.reason.value.trim()); }, "已更新使用台數，已通知主管、負責人")) refreshDlg();
    }
  });

  // ---------------- GDP 單據 ----------------
  var COMPANY = { name: "禾翔醫藥生技有限公司", tel: "04-0000-0000", fax: "04-0000-0001", taxId: "00000000" };
  function docSource(d) {
    if (d.ref && d.ref.kind === "report") return '<button class="btn btn-sm" data-act="open-report" data-id="' + esc(d.ref.id) + '">報刀單</button>';
    return '<span class="muted">手動</span>';
  }
  function docParty(d) { return d.type === "in" ? d.vendor : L.locName(S, d.type === "lend" ? d.to : d.from); }
  function reportDocsHtml(r) {
    if (r.src === "經銷商") return '<p class="muted">經銷商自有貨，不產生公司單據。</p>';
    if (!r.docs) return r.status === "approved" ? '<p class="muted">這張是系統上線前的歷史資料，沒有對應單據。</p>' : "";
    var x = r.docs, b = [];
    if (x.ret && L.doc(S, x.ret)) b.push('<button class="btn btn-sm" data-act="open-doc" data-id="' + x.ret + '">借出還回單 ' + esc(L.doc(S, x.ret).no) + "</button>");
    if (x.sales) b.push('<button class="btn btn-sm" data-act="open-sales" data-id="' + x.sales + '"' + (can("sales_view") ? "" : " disabled") + ">銷貨憑單</button>");
    if (x.lend && L.doc(S, x.lend)) { var ld = L.doc(S, x.lend); b.push('<button class="btn btn-sm" data-act="open-doc" data-id="' + x.lend + '">補貨借出 ' + esc(ld.no) + "（" + L.DOC_STATUS[ld.status] + "）</button>"); }
    return '<div class="row">' + b.join("") + "</div>" +
      (x.short && x.short.length ? '<p class="muted" style="margin-top:8px">公司倉不足，沒有列入補貨：' + x.short.map(esc).join("、") + "</p>" : "");
  }
  function monthsBack(n) {
    var out = [], d = new Date();
    for (var i = 0; i < n; i++) { out.push(d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2)); d.setMonth(d.getMonth() - 1); }
    return out;
  }

  function renderDocs() {
    if (!can("stock_view")) return noPerm("查看庫存");
    var views = [["lend", "借出憑單"], ["ret", "借出還回單"], ["in", "進貨憑單"], ["audit", "訂單審核表"], ["safety", "安全庫存"]];
    var seg = '<div class="seg" style="margin-bottom:14px">' + views.map(function (v) {
      return '<button data-act="docs-go" data-v="' + v[0] + '" aria-pressed="' + (docView === v[0]) + '">' + v[1] + "</button>";
    }).join("") + "</div>";
    if (docView === "audit") return seg + auditView();
    if (docView === "safety") return seg + safetyView();
    var edit = can("stock_edit");
    var list = S.docs.filter(function (d) { return d.type === docView; });
    var rows = list.map(function (d) {
      var qty = d.lines.reduce(function (a, l) { return a + l.qty; }, 0);
      return '<tr class="click" data-act="open-doc" data-id="' + d.id + '"><td class="code">' + esc(d.no) + "</td><td>" + esc(d.date) + "</td><td>" + esc(docParty(d)) + "</td>" +
        (docView === "lend" ? "<td>" + esc(d.ship || "") + "</td>" : "") + '<td class="num">' + d.lines.length + " 筆／" + qty + '</td><td><span class="badge ' + (d.status === "posted" ? "approved" : "draft") + '">' + L.DOC_STATUS[d.status] + "</span></td><td>" + docSource(d) + "</td></tr>";
    }).join("");
    var heads = ["單號", "日期", docView === "in" ? "廠商" : docView === "lend" ? "借出對象" : "還回自", docView === "lend" ? "配送" : null, "明細／數量", "狀態", "來源"].filter(Boolean);
    var btn = docView === "lend" ? '<button class="btn btn-primary btn-sm" data-act="lend-new"' + (edit ? "" : " disabled") + ">＋ 新增借出憑單</button>"
      : docView === "in" ? '<button class="btn btn-primary btn-sm" data-act="gr-new"' + (edit ? "" : " disabled") + ">＋ 新增進貨憑單</button>" : "";
    var help = { lend: "出貨到醫院寄庫或業務身上，用借出憑單：倉儲目視確認後按「出貨檢查並過帳」，庫存才移出公司倉。報刀審核後會自動產生補貨草稿。",
      ret: "報刀耗用的品項，系統依報刀的批號自動開借出還回單，接著產生銷貨憑單（金流單）。不需要手動開。",
      in: "原廠到貨時開進貨憑單：收貨檢查（外觀、標示、數量，溫控品記溫度）全部合格才能入公司倉。" }[docView];
    return seg + card("DOCS", L.DOC_TYPES[docView], '<p class="muted" style="margin:0 0 12px">' + help + "</p>" +
      '<div class="table-wrap"><table class="table"><thead><tr>' + heads.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="' + heads.length + '" class="empty">還沒有' + L.DOC_TYPES[docView] + "</td></tr>") + "</tbody></table></div>", btn);
  }

  function auditView() {
    var months = monthsBack(6);
    if (months.indexOf(auditMonth) < 0) auditMonth = months[0];
    var rows = L.auditRows(S, auditMonth, auditKind);
    var dates = [];
    rows.forEach(function (r) { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
    var body = rows.map(function (r, i) {
      var first = !i || rows[i - 1].date !== r.date;
      return "<tr" + (first ? ' class="day-first"' : "") + "><td>" + (first ? esc(r.date) : "") + '</td><td class="code">' + esc(r.no) + '</td><td class="code">' + esc(r.code) + "</td><td>" + esc(r.party) + '</td><td class="code">' + esc(r.sku) + "</td><td>" + esc(r.name) + '</td><td class="num">' + r.qty + "</td><td>" + esc(r.ship) + "</td>" +
        (first ? '<td><button class="btn btn-sm" data-act="print-audit" data-date="' + esc(r.date) + '">列印這天</button></td>' : "<td></td>") + "</tr>";
    }).join("");
    var head = '<div class="row" style="margin-bottom:12px"><div class="seg">' + [["lend", "借出（寄庫）"], ["sales", "銷貨（賣斷、耗用）"]].map(function (k) {
      return '<button data-act="audit-kind" data-v="' + k[0] + '" aria-pressed="' + (auditKind === k[0]) + '">' + k[1] + "</button>";
    }).join("") + '</div><label class="field" style="min-width:150px">月份<select data-bind="audit-month">' + options(months.map(function (m) { return { v: m, t: m }; }), auditMonth) + "</select></label>" +
      '<button class="btn btn-sm" data-act="print-audit" data-date=""' + (rows.length ? "" : " disabled") + ">列印整月</button></div>";
    return card("FR17-02", "訂單審核表（" + (auditKind === "lend" ? "借出" : "銷貨") + "）", head +
      '<p class="muted" style="margin:0 0 12px">欄位與正航匯出的相同：日期、單據號碼、對象編號與名稱、產品編號、品名規格、數量。原本要從正航匯出、貼到 Dropbox 的 Excel 再逐日列印，現在直接依日期列印歸檔。共 ' + dates.length + " 天、" + rows.length + " 列。</p>" +
      '<div class="table-wrap"><table class="table audit"><thead><tr><th>日期</th><th>單據號碼</th><th>對象編號</th><th>對象名稱</th><th>產品編號</th><th>品名規格</th><th class="num">數量</th><th>配送／性質</th><th></th></tr></thead><tbody>' +
      (body || '<tr><td colspan="9" class="empty">這個月沒有' + (auditKind === "lend" ? "已過帳的借出憑單" : "已出貨的銷貨憑單") + "</td></tr>") + "</tbody></table></div>");
  }

  function safetyView() {
    var cfg = can("settings_edit");
    var ps = S.products.filter(function (p) { return p.kind !== "screw"; });
    var low = L.lowStock(S), vendors = [];
    low.forEach(function (x) { if (vendors.indexOf(x.vendor) < 0) vendors.push(x.vendor); });
    var rows = ps.map(function (p) {
      var have = L.companyQty(S, p.sku), sf = typeof p.safety === "number" ? p.safety : 0, isLow = sf > 0 && have < sf;
      return '<tr><td>' + esc(p.vendor || "—") + '</td><td class="code">' + esc(p.sku) + "</td><td>" + esc(p.name) + '</td><td class="num"><b class="' + (isLow ? "mv-down" : "") + '">' + have + '</b></td><td class="num"><input class="cellinput" type="number" min="0" step="1" style="width:76px" value="' + sf + '" data-act="safety" data-sku="' + esc(p.sku) + '"' + (cfg ? "" : " disabled") + "></td><td>" + (isLow ? '<span class="badge expired">低於水位</span>' : sf ? '<span class="badge approved">足夠</span>' : '<span class="muted">未設定</span>') + "</td></tr>";
    }).join("");
    var po = vendors.length ? '<div class="row" style="margin-bottom:12px">' + vendors.map(function (v) {
      return '<button class="btn btn-sm btn-primary" data-act="print-po" data-vendor="' + esc(v) + '">產生訂購單：' + esc(v) + "</button>";
    }).join("") + "</div>" : '<p class="muted">目前沒有低於安全庫存的品項。</p>';
    return card("SAFETY", "安全庫存（公司倉）", '<p class="muted" style="margin:0 0 12px">每種規格各自設定水位，公司倉低於水位就在待辦提醒，並依原廠產生訂購單。各原廠的訂購單格式不同，正式版會照你們提供的範本做。</p>' + po +
      '<div class="table-wrap"><table class="table"><thead><tr><th>原廠</th><th>品號</th><th>品名</th><th class="num">公司倉</th><th class="num">安全庫存</th><th>狀態</th></tr></thead><tbody>' + rows + "</tbody></table></div>");
  }

  function openDoc(id) {
    var d = L.doc(S, id);
    if (!d) return toast("找不到這張單據", true);
    openDialog(L.DOC_TYPES[d.type] + " " + d.no, function () {
      d = L.doc(S, id);
      var priceOn = can("view_price");
      var rows = d.lines.map(function (l, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td class="code">' + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + '</td><td class="code">' + esc(l.lot) + "</td><td>" + esc(l.mfg || "—") + "</td><td>" + esc(l.exp || "—") + '</td><td class="num">' + l.qty + "</td>" +
          (d.type === "lend" ? "<td>" + esc(L.locName(S, l.from)) + "</td>" : "") + (priceOn && d.type !== "ret" ? '<td class="num">' + num(l.price) + "</td>" : "") + "<td>" + esc(l.note || "") + "</td></tr>";
      }).join("");
      var heads = ["欄號", "產品編號", "品名規格", "批號", "出廠日期", "有效日期", "數量"].concat(d.type === "lend" ? ["倉庫"] : []).concat(priceOn && d.type !== "ret" ? ["單價"] : []).concat(["備註"]);
      var kv = '<dl class="kv"><dt>單號</dt><dd class="code">' + esc(d.no) + "</dd><dt>日期</dt><dd>" + esc(d.date) + "</dd>" +
        (d.type === "in" ? "<dt>廠商</dt><dd>" + esc(d.vendor) + "</dd><dt>收貨檢查</dt><dd>外觀 ✓　標示 ✓　數量 ✓" + (d.cold ? "　溫度 " + esc(d.check.temp) : "") + "</dd>" : "") +
        (d.type === "lend" ? "<dt>借出對象</dt><dd>" + esc(L.locName(S, d.to)) + "</dd><dt>借出類別</dt><dd>" + esc(d.kind || "寄庫") + "</dd><dt>配送方式</dt><dd>" + esc(d.ship) + "</dd><dt>經手人員</dt><dd>" + esc(d.handler || "—") + "</dd>" : "") +
        (d.type === "ret" ? "<dt>還回自</dt><dd>" + esc(L.locName(S, d.from)) + "</dd>" : "") +
        "<dt>製單人員</dt><dd>" + esc(d.maker) + "</dd><dt>狀態</dt><dd>" + L.DOC_STATUS[d.status] + (d.checker ? "（" + (d.type === "lend" ? "出貨檢查" : d.type === "in" ? "收貨檢查" : "過帳") + "：" + esc(d.checker) + " " + esc(d.checkedAt) + "）" : "") + "</dd>" +
        (d.note ? "<dt>備註</dt><dd>" + esc(d.note) + "</dd>" : "") + "</dl>";
      var post = d.type === "lend" && d.status === "draft"
        ? '<form data-form="post-lend" data-id="' + esc(d.id) + '" class="post-check"><label class="chk"><input type="checkbox" name="ok" required> 已目視確認品項、批號、數量與包裝（出貨檢查）</label><button class="btn btn-primary"' + (can("stock_edit") ? "" : " disabled") + ">出貨檢查並過帳</button>" +
          '<button type="button" class="btn" data-act="lend-edit" data-id="' + esc(d.id) + '"' + (can("stock_edit") ? "" : " disabled") + ">修改</button></form>" : "";
      return kv + tbl(heads, rows) + '<div class="row" style="margin-top:14px">' + docSource(d) + '<button class="btn" data-act="print-doc" data-id="' + esc(d.id) + '">列印' + L.DOC_TYPES[d.type] + "</button></div>" + post;
    }, true);
  }

  // ---- 借出憑單 editor ----
  function companyLines(sku) { return usableLines("co", sku).sort(function (a, b) { return a.exp < b.exp ? -1 : 1; }); }
  function lendLine() {
    var p = S.products.filter(function (x) { return x.kind !== "screw" && companyLines(x.sku).length; })[0];
    if (!p) return null;
    var l = companyLines(p.sku)[0];
    return { sku: p.sku, lot: l.lot, exp: l.exp, qty: 1, from: "co" };
  }
  function openLend(id) {
    var d = id ? L.doc(S, id) : null;
    var dests = S.locations.filter(function (l) { return l.type !== "company"; });
    DL = d ? deepCopy(d) : { date: L.ymd(new Date()), to: dests[0] ? dests[0].id : "", ship: "自送", kind: "寄庫", handler: "", due: "", note: "", lines: [] };
    if (!DL.lines.length) { var first = lendLine(); if (first) DL.lines.push(first); }
    openDialog(d ? "修改借出憑單 " + d.no : "新增借出憑單（寄庫）", lendHtml, true);
  }
  function lendHtml() {
    var dests = S.locations.filter(function (l) { return l.type !== "company"; });
    var skus = S.products.filter(function (x) { return x.kind !== "screw" && companyLines(x.sku).length; });
    var rows = DL.lines.map(function (l, i) {
      var ls = companyLines(l.sku);
      return '<tr><td class="num">' + (i + 1) + '</td><td><select data-bind="dl-sku" data-i="' + i + '">' + options(skus.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), l.sku) + "</select></td>" +
        '<td><select data-bind="dl-lot" data-i="' + i + '">' + options(ls.map(function (x) { return { v: x.lot, t: x.lot + "｜效期 " + x.exp + "｜剩 " + x.qty }; }), l.lot) + "</select></td>" +
        '<td><input type="number" min="1" step="1" style="width:72px" value="' + l.qty + '" data-bind="dl-qty" data-i="' + i + '"></td><td><button type="button" class="btn btn-sm" data-act="dl-rm" data-i="' + i + '">移除</button></td></tr>';
    }).join("");
    return '<form data-form="lend"><div class="grid">' +
      '<label class="field">借出日期<input type="date" data-bind="dl-date" value="' + esc(DL.date) + '"></label>' +
      '<label class="field">借出對象<select data-bind="dl-to">' + locOptions(dests, DL.to) + "</select></label>" +
      '<label class="field">借出類別<input data-bind="dl-kind" value="' + esc(DL.kind) + '"></label>' +
      '<label class="field">配送方式<select data-bind="dl-ship">' + options(L.SHIP_MODES.map(function (m) { return { v: m, t: m + (m === "自送" ? "（親送）" : "（郵局、物流）") }; }), DL.ship) + "</select></label>" +
      '<label class="field">經手人員<select data-bind="dl-handler">' + options([{ v: "", t: "—" }].concat(S.users.map(function (u) { return { v: u.name, t: u.name }; })), DL.handler) + "</select></label>" +
      '<label class="field">預還日期<input type="date" data-bind="dl-due" value="' + esc(DL.due) + '"></label>' +
      '<label class="field wide">備註<input data-bind="dl-note" value="' + esc(DL.note) + '"></label></div>' +
      '<h4>明細（從公司倉出貨，批號依效期由近到遠）</h4><div class="table-wrap"><table class="table detail-table"><thead><tr><th class="num">欄號</th><th>產品</th><th>批號</th><th>數量</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="empty">公司倉沒有可借出的庫存</td></tr>') + "</tbody></table></div>" +
      '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="dl-add">＋ 新增明細</button><span style="flex:1"></span><button class="btn btn-primary">儲存借出憑單（草稿）</button></div>' +
      '<p class="muted" style="margin-top:8px">儲存後還沒有移動庫存，要到單據內做出貨檢查並過帳。骨釘請用骨釘盒整盒調撥或在盒子上補格。</p></form>';
  }

  // ---- 進貨憑單 editor ----
  function openReceive() {
    var p = S.products.filter(function (x) { return x.kind !== "screw"; })[0];
    GR = { date: L.ymd(new Date()), vendor: p && p.vendor || "", cold: false, look: false, label: false, count: false, temp: "", note: "",
      lines: [{ sku: p ? p.sku : "", lot: "", mfg: "", exp: L.addDays(720), qty: 1 }] };
    openDialog("新增進貨憑單", receiveHtml, true);
  }
  function receiveHtml() {
    var ps = S.products.filter(function (x) { return x.kind !== "screw"; });
    var vendors = [];
    S.products.forEach(function (x) { if (x.vendor && vendors.indexOf(x.vendor) < 0) vendors.push(x.vendor); });
    var rows = GR.lines.map(function (l, i) {
      return '<tr><td class="num">' + (i + 1) + '</td><td><select data-bind="gr-sku" data-i="' + i + '">' + options(ps.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), l.sku) + "</select></td>" +
        '<td><input data-bind="gr-lot" data-i="' + i + '" value="' + esc(l.lot) + '" style="width:120px"></td><td><input type="date" data-bind="gr-mfg" data-i="' + i + '" value="' + esc(l.mfg) + '"></td>' +
        '<td><input type="date" data-bind="gr-exp" data-i="' + i + '" value="' + esc(l.exp) + '"></td><td><input type="number" min="1" step="1" style="width:72px" data-bind="gr-qty" data-i="' + i + '" value="' + l.qty + '"></td>' +
        '<td><button type="button" class="btn btn-sm" data-act="gr-rm" data-i="' + i + '">移除</button></td></tr>';
    }).join("");
    var ck = function (k, t) { return '<label class="chk"><input type="checkbox" data-bind="gr-' + k + '"' + (GR[k] ? " checked" : "") + "> " + t + "</label>"; };
    return '<form data-form="receive"><div class="grid">' +
      '<label class="field">進貨日期<input type="date" data-bind="gr-date" value="' + esc(GR.date) + '"></label>' +
      '<label class="field">廠商（原廠）<input list="grVendors" data-bind="gr-vendor" value="' + esc(GR.vendor) + '"><datalist id="grVendors">' + vendors.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + "</datalist></label>" +
      '<label class="field wide">備註<input data-bind="gr-note" value="' + esc(GR.note) + '"></label></div>' +
      '<h4>明細（依原廠銷貨單逐筆輸入）</h4><div class="table-wrap"><table class="table detail-table"><thead><tr><th class="num">欄號</th><th>產品</th><th>批號</th><th>出廠日期</th><th>有效日期</th><th>數量</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="row" style="margin-top:10px"><button type="button" class="btn btn-sm" data-act="gr-add">＋ 新增明細</button></div>' +
      '<h4>收貨檢查</h4><div class="check-grid">' + ck("look", "外觀、包裝完整") + ck("label", "標示、批號、效期正確") + ck("count", "數量與原廠銷貨單相符") + ck("cold", "溫控產品") +
      (GR.cold ? '<label class="field" style="max-width:200px">進貨溫度<input data-bind="gr-temp" value="' + esc(GR.temp) + '" placeholder="例如 18°C"></label>' : "") + "</div>" +
      '<div class="row" style="margin-top:14px"><span class="muted" style="flex:1">檢查全部合格才能入庫；不合格請拒收或另行隔離。</span><button class="btn btn-primary"' + (can("stock_edit") ? "" : " disabled") + ">收貨檢查合格，入公司倉</button></div></form>";
  }

  // ---- printing: a separate window laid out like the 正航 forms ----
  var PRINT_CSS = "@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px/1.45 'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif;color:#000;margin:0}" +
    ".pg{page-break-after:always;padding:2mm 0}.pg:last-child{page-break-after:auto}h1{font-size:20px;font-weight:500;text-align:center;margin:0;letter-spacing:.06em}" +
    "h2{font-size:17px;font-weight:500;text-align:center;margin:2px auto 8px;width:max-content;border-bottom:1.5px solid #000;padding:0 6px}" +
    ".hd{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:1px 16px;border-top:1px solid #000;padding:4px 0 6px}.hd div{white-space:nowrap;overflow:hidden}" +
    ".top{display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse}th{background:#d9d9d9;font-weight:400;text-align:left;padding:3px 4px;border-top:1px solid #000;border-bottom:1px solid #000;white-space:nowrap}" +
    "td{padding:4px;vertical-align:top}.n{text-align:right}.lot td{padding:0 4px 6px}.lot span{display:inline-block;min-width:110px;border-bottom:1px solid #000;margin-right:14px}" +
    ".line td{border-top:1px solid #000;padding-top:6px}.ft{border-top:1px solid #000;margin-top:6px;padding-top:4px}.ft3{display:grid;grid-template-columns:2fr 1fr 1fr;border-top:1px solid #000;border-bottom:1px solid #000;margin-top:8px}" +
    ".ft3>div{padding:4px 6px}.ft3>div+div{border-left:1px solid #000}.stamp{display:inline-block;border:1px dashed #000;width:120px;height:60px;margin-top:8px;text-align:center;padding-top:20px;color:#555}" +
    ".sig{display:flex;gap:28px;margin-top:14px}.sig div{border-top:1px solid #000;min-width:110px;text-align:center;padding-top:3px}";
  function phead(title, left, right) {
    return '<h1>' + esc(COMPANY.name) + "</h1><h2>" + esc(title) + '</h2><div class="top"><div>列印日期: ' + L.ymd(new Date()) + "</div><div>頁碼: 1</div></div>";
  }
  function cells(arr) { return arr.map(function (x) { return x[0] ? "<div>" + esc(x[0]) + ": " + esc(x[1] == null ? "" : x[1]) + "</div>" : "<div></div>"; }).join(""); }
  function lotRow(l, span) { return '<tr class="lot"><td></td><td colspan="' + span + '"><span>批號 ' + esc(l.lot) + "</span><span>批號數量 " + l.qty + "</span><span>出廠日期 " + esc(l.mfg || "") + "</span><span>有效日期 " + esc(l.exp || "") + "</span></td></tr>"; }
  function printLend(d) {
    var priceOn = can("view_price"), c = d.type === "in" ? null : L.partyCustomer(S, d.type === "lend" ? d.to : d.from);
    var title = L.DOC_TYPES[d.type], isIn = d.type === "in";
    var hd = isIn
      ? cells([["進貨日期", d.date], ["進貨單號", d.no], ["公司電話", COMPANY.tel], ["廠商名稱", d.vendor], ["幣別編號", "NTD"], ["製單人員", d.maker], ["收貨檢查", d.checker + " " + d.checkedAt], ["溫控", d.cold ? "是，進貨溫度 " + d.check.temp : "否"], ["", ""]])
      : cells([[d.type === "lend" ? "借出日期" : "還回日期", d.date], [d.type === "lend" ? "借出單號" : "還回單號", d.no], ["公司電話", COMPANY.tel], ["對象名稱", c.name], ["", ""], [d.type === "lend" ? "借出類別" : "還回類別", d.type === "lend" ? (d.kind || "寄庫") : "報刀耗用"],
        ["聯絡電話", c.tel], ["", ""], ["傳真號碼", COMPANY.fax], ["幣別編號", "NTD"], ["經手人員", d.handler || ""], ["製單人員", d.maker], ["統一編號", ""], ["", ""], ["產品單價", "未稅"], ["聯絡地址", c.addr], ["配送方式", d.ship || ""], ["", ""]]);
    var total = 0, qty = 0;
    var body = d.lines.map(function (l, i) {
      var amt = l.qty * (l.price || 0); total += amt; qty += l.qty;
      return '<tr class="line"><td>' + (i + 1) + "</td><td>" + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + "</td><td>" + esc(isIn ? "公司倉" : L.locName(S, l.from || "co")) + '</td><td class="n">' + l.qty + "</td><td>PCS</td>" +
        '<td class="n">' + (priceOn ? num(l.price || 0) : "") + '</td><td class="n">' + (priceOn ? num(amt) : "") + '</td><td class="n">' + (priceOn ? num(Math.round(amt * 1.05)) : "") + "</td><td>" + esc(d.due || "") + "</td><td>" + esc(l.note || "") + "</td></tr>" + lotRow(l, 10);
    }).join("");
    return '<div class="pg">' + phead(title) + '<div class="hd">' + hd + "</div><table><thead><tr><th>欄號</th><th>產品編號</th><th>品名規格</th><th>倉庫</th><th class=\"n\">數量</th><th>單位</th><th class=\"n\">單價</th><th class=\"n\">金額</th><th class=\"n\">含稅金額</th><th>預還日期</th><th>分錄備註</th></tr></thead><tbody>" + body + "</tbody></table>" +
      '<div class="ft">合計: ' + qty + (priceOn ? "　　金額 " + num(total) + "　含稅 " + num(Math.round(total * 1.05)) : "") + "</div><div>備註: " + esc(d.note || "") + "</div>" +
      (d.type === "ret" ? "" : '<div class="stamp">' + (isIn ? "收貨檢查章" : "出貨檢查章") + "</div>") + "</div>";
  }
  function printSales(o) {
    var priceOn = can("view_price"), c = L.customer(S, o.customer) || {}, t = L.salesTotals(o);
    var hd = cells([["銷貨日期", o.date], ["公司電話", COMPANY.tel], ["銷貨單號", o.no], ["客戶名稱", c.name], ["", ""], ["統一編號", ""], ["聯絡電話", c.tel], ["傳真號碼", COMPANY.fax], ["產品單價", o.taxMode === "incl" ? "含稅" : "未稅"],
      ["幣別編號", "NTD"], ["業務人員", o.salesRep], ["所屬部門", o.dept], ["送貨地址", c.addr], ["", ""], ["製單人員", o.maker], ["發票地址", c.addr], ["", ""], ["", ""], ["收款條件", "月結"], ["預收日期", ""], ["預兌日期", ""]]);
    var body = o.lines.map(function (l, i) {
      var amt = l.qty * l.price, net = o.taxMode === "incl" ? Math.round(amt / 1.05) : amt, gross = o.taxMode === "incl" ? amt : Math.round(amt * 1.05);
      var exp = l.exp || (S.lots.filter(function (z) { return z.sku === l.sku && z.lot === l.lot; })[0] || {}).exp || "";
      return '<tr class="line"><td>' + (i + 1) + "</td><td>" + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + '</td><td class="n">' + l.qty + "</td><td>" + esc(l.lot) + "</td><td>" + esc(exp) + '</td><td class="n">' + (priceOn ? num(l.price) : "") + '</td><td class="n">' + (priceOn ? num(net) : "") + '</td><td class="n">' + (priceOn ? num(gross) : "") + "</td><td></td></tr>";
    }).join("");
    return '<div class="pg">' + phead("銷貨憑單") + '<div class="hd">' + hd + "</div><table><thead><tr><th>欄號</th><th>產品編號</th><th>品名規格</th><th class=\"n\">數量</th><th>批號</th><th>有效日期</th><th class=\"n\">單價</th><th class=\"n\">金額</th><th class=\"n\">含稅金額</th><th>分錄備註</th></tr></thead><tbody>" + body + "</tbody></table>" +
      '<div class="ft3"><div>' + cells([["發票日期", o.invoice ? o.confirmedAt.slice(0, 10) : ""], ["課稅類別", "應稅"], ["發票號碼", o.invoice || ""], ["發票聯式", "三聯式"], ["備註", o.note || ""]]) + "</div><div>" +
      cells([["折讓", priceOn ? "0" : ""], ["現收", ""], ["未收款", priceOn ? num(L.orderBalance(S, o)) : ""]]) + "</div><div>" + cells([["合計", priceOn ? num(t.net) : ""], ["稅金", priceOn ? num(t.tax) : ""], ["總計", priceOn ? num(t.total) : ""]]) + "</div></div></div>";
  }
  function printAudit(date) {
    var rows = L.auditRows(S, auditMonth, auditKind).filter(function (r) { return !date || r.date === date; });
    var days = [];
    rows.forEach(function (r) { if (days.indexOf(r.date) < 0) days.push(r.date); });
    var kind = auditKind === "lend" ? "借出" : "銷貨";
    return days.map(function (day) {
      var rs = rows.filter(function (r) { return r.date === day; });
      return '<div class="pg">' + phead("訂單審核表（" + kind + "）") + '<div class="top"><div>表單編號: FR17-02</div><div>日期: ' + day + "</div></div>" +
        "<table><thead><tr><th>" + (auditKind === "lend" ? "借出日期" : "銷貨日期") + "</th><th>單據號碼</th><th>對象編號</th><th>對象名稱</th><th>產品編號</th><th>品名規格</th><th class=\"n\">數量</th><th>" + (auditKind === "lend" ? "配送方式" : "性質") + "</th></tr></thead><tbody>" +
        rs.map(function (r) { return '<tr class="line"><td>' + esc(r.date) + "</td><td>" + esc(r.no) + "</td><td>" + esc(r.code) + "</td><td>" + esc(r.party) + "</td><td>" + esc(r.sku) + "</td><td>" + esc(r.name) + '</td><td class="n">' + r.qty + "</td><td>" + esc(r.ship) + "</td></tr>"; }).join("") +
        '</tbody></table><div class="sig"><div>製表</div><div>倉儲審核</div><div>品保審核</div></div></div>';
    }).join("");
  }
  function printPO(vendor) {
    var low = L.lowStock(S).filter(function (x) { return x.vendor === vendor; });
    return '<div class="pg">' + phead("訂購單") + '<div class="hd">' + cells([["訂購日期", L.ymd(new Date())], ["廠商名稱", vendor], ["公司電話", COMPANY.tel], ["製單人員", S.operator], ["", ""], ["", ""]]) + "</div>" +
      "<table><thead><tr><th>欄號</th><th>產品編號</th><th>品名規格</th><th class=\"n\">公司倉現有</th><th class=\"n\">安全庫存</th><th class=\"n\">訂購數量</th></tr></thead><tbody>" +
      low.map(function (x, i) { return '<tr class="line"><td>' + (i + 1) + "</td><td>" + esc(x.sku) + "</td><td>" + esc(x.name) + '</td><td class="n">' + x.have + '</td><td class="n">' + x.safety + '</td><td class="n">' + (x.safety * 2 - x.have) + "</td></tr>"; }).join("") +
      '</tbody></table><div class="ft">訂購數量預設補到安全庫存的兩倍，可依原廠規定調整。各原廠的訂購單格式不同，正式版依原廠範本產生。</div><div class="sig"><div>申請人</div><div>主管核准</div></div></div>';
  }
  function printHtml(kind, key) {
    var title = "", inner = "";
    if (kind === "doc") { var d = L.doc(S, key); if (!d) return ""; title = L.DOC_TYPES[d.type] + " " + d.no; inner = printLend(d); }
    else if (kind === "sales") { var o = S.sales.filter(function (x) { return x.id === key; })[0]; if (!o) return ""; title = "銷貨憑單 " + o.no; inner = printSales(o); }
    else if (kind === "audit") { title = "訂單審核表 " + (key || auditMonth); inner = printAudit(key); }
    else if (kind === "po") { title = "訂購單 " + key; inner = printPO(key); }
    return '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>' + esc(title) + "</title><style>" + PRINT_CSS + "</style></head><body>" + inner + "</body></html>";
  }
  function openPrint(kind, key) {
    var html = printHtml(kind, key);
    if (!html) return toast("找不到要列印的資料", true);
    var w = window.open("", "_blank");
    if (!w) return toast("瀏覽器擋住了列印視窗，請允許彈出視窗", true);
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) { /* the user can still print from the window */ } }, 300);
  }
  window.HSPrint = printHtml;

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-act]");
    if (!el) return;
    var a = el.getAttribute("data-act"), g = function (k) { return el.getAttribute("data-" + k); };
    if (a === "docs-go") { docView = g("v"); tab = "docs"; closeDialog(); render(); }
    else if (a === "audit-kind") { auditKind = g("v"); render(); }
    else if (a === "open-doc") openDoc(g("id"));
    else if (a === "lend-new") openLend(null);
    else if (a === "lend-edit") openLend(g("id"));
    else if (a === "gr-new") openReceive();
    else if (a === "dl-add") { var ln = lendLine(); if (!ln) return toast("公司倉沒有可借出的庫存", true); DL.lines.push(ln); refreshDlg(); }
    else if (a === "dl-rm") { DL.lines.splice(+g("i"), 1); refreshDlg(); }
    else if (a === "gr-add") { var last = GR.lines[GR.lines.length - 1]; GR.lines.push({ sku: last ? last.sku : "", lot: "", mfg: "", exp: L.addDays(720), qty: 1 }); refreshDlg(); }
    else if (a === "gr-rm") { GR.lines.splice(+g("i"), 1); refreshDlg(); }
    else if (a === "print-doc") openPrint("doc", g("id"));
    else if (a === "print-sales") openPrint("sales", g("id"));
    else if (a === "print-audit") openPrint("audit", g("date"));
    else if (a === "print-po") openPrint("po", g("vendor"));
  });
  function onDocBind(e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind");
    if (!b) return;
    var i = +t.getAttribute("data-i"), val = t.type === "checkbox" ? t.checked : t.value;
    if (b === "audit-month") { auditMonth = val; render(); return; }
    if (b.indexOf("dl-") === 0 && DL) {
      var k = b.slice(3), l = DL.lines[i];
      if (k === "sku") { l.sku = val; var first = companyLines(val)[0]; l.lot = first ? first.lot : ""; l.exp = first ? first.exp : ""; }
      else if (k === "lot") { l.lot = val; var cur = companyLines(l.sku).filter(function (x) { return x.lot === val; })[0]; l.exp = cur ? cur.exp : ""; }
      else if (k === "qty") l.qty = Math.floor(Number(val));
      else DL[k] = val;
      if (e.type === "change" && (k === "sku" || k === "lot")) refreshDlg();
    } else if (b.indexOf("gr-") === 0 && GR) {
      var k2 = b.slice(3);
      if (["sku", "lot", "mfg", "exp", "qty"].indexOf(k2) >= 0) GR.lines[i][k2] = k2 === "qty" ? Math.floor(Number(val)) : val;
      else GR[k2] = val;
      if (k2 === "sku" && e.type === "change") { var pv = L.product(S, val); if (pv && pv.vendor && !GR.vendor) GR.vendor = pv.vendor; }
      if (k2 === "cold" && e.type === "change") refreshDlg();
    }
  }
  document.addEventListener("input", onDocBind);
  document.addEventListener("change", function (e) {
    onDocBind(e);
    var t = e.target;
    if (t.getAttribute && t.getAttribute("data-act") === "safety") {
      var sku = t.getAttribute("data-sku");
      if (!run(function () { L.setSafety(S, sku, Number(t.value)); }, "已更新安全庫存")) render();
    }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-form");
    if (f === "lend") {
      e.preventDefault();
      var x = run(function () { return L.saveLend(S, DL); }, "借出憑單已儲存（草稿）");
      if (x) { docView = "lend"; openDoc(x.id); }
    } else if (f === "receive") {
      e.preventDefault();
      var y = run(function () { return L.receiveGoods(S, { date: GR.date, vendor: GR.vendor, cold: GR.cold, note: GR.note, check: { look: GR.look, label: GR.label, count: GR.count, temp: GR.temp }, lines: GR.lines }); }, "進貨完成，已入公司倉");
      if (y) { docView = "in"; tab = "docs"; render(); openDoc(y.id); }
    } else if (f === "post-lend") {
      e.preventDefault();
      var id = e.target.getAttribute("data-id");
      if (run(function () { L.postLend(S, id); }, "出貨檢查完成，已過帳")) openDoc(id);
    }
  });

  render();
})();
