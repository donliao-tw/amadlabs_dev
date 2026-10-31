(function () {
  "use strict";

  var L = HSLogic;
  var S = L.load();
  var tab = "todo";
  var stockView = "plates";
  var moveKind = "all";
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
  var traceQ = "";
  var D = newDraft();
  var SD = newSales();
  var TR = null;
  var refreshDlg = null;

  var TYPE = { company: "公司", hospital: "醫院寄庫", rep: "業務移動庫存" };
  var ICONS = {
    todo: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    report: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    acct: '<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    sales: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    stock: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    trace: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  function canAct() { return can("report_approve") || can("sales_confirm") || can("stock_edit") || can("acct_edit"); }
  function defaultTab() { return canAct() ? "todo" : "report"; }
  var NAV = [
    { id: "todo", label: "待辦", title: "待辦", sub: "需要你動手的事，處理完就會從這裡消失。", show: function () { return canAct(); } },
    { id: "report", label: "報刀", title: "報刀", sub: "跟刀後回報這台刀用了什麼，只報你用到的。內勤審核後才會扣庫存。", show: function () { return true; } },
    { id: "stock", label: "庫存", title: "庫存", sub: "先選範圍：公司的庫存可以立即調動，醫院寄庫要先調回公司。", show: function () { return L.can(S, "stock_view"); } },
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
  function locLabel(l) { return l.name + "（" + TYPE[l.type] + (l.type === "company" ? "・可立即調動" : "") + "）"; }
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
    return '<div class="card"><div class="empty">目前身分是「' + esc(S.operator) + "」，沒有「" + esc(what) + "」的權限。到「設定」由管理員調整。</div></div>";
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
    if (pend.length && can("report_approve")) out += card("TODO", "待審核報刀（" + pend.length + "）", pend.map(reportCardHtml).join(""));
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
    var overdue = can("acct_edit") ? L.arRows(S).filter(function (r) { return r.days > 30; }) : [];
    if (overdue.length) {
      out += card("TODO", "逾期未收（超過 30 天，" + overdue.length + "）", tbl(["憑單", "客戶", "銷貨日", "未收餘額", "已過", ""], overdue.map(function (r) {
        var c = L.customer(S, r.o.customer);
        return '<tr><td class="code">' + esc(r.o.no) + "</td><td>" + esc(c ? c.name : "") + "</td><td>" + esc(r.o.date) + '</td><td class="num">' + num(r.balance) + '</td><td class="num">' + r.days + ' 天</td><td><button class="btn btn-sm btn-primary" data-act="pay-order" data-id="' + r.o.id + '">登記收款</button></td></tr>';
      }).join("")));
    }
    if (!out) out = card("TODO", "目前沒有待辦", '<div class="empty">報刀都審完了，沒有銷貨草稿，也沒有快到期的批號。</div>');
    return out;
  }

  // ---------------- 報刀 ----------------
  function firstHospital() {
    var h = S.locations.filter(function (l) { return l.type === "hospital"; })[0];
    return h ? h.id : (S.locations[0] && S.locations[0].id);
  }
  function newDraft() {
    var h = firstHospital();
    return { date: L.ymd(new Date()), hospital: h, doctor: "", loc: h, note: "", main: [], picks: [], sp: { box: "" }, showPicker: false };
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
    return { date: D.date, hospital: D.hospital, doctor: D.doctor, loc: D.loc, note: D.note, main: D.main, screws: order.map(function (k) { return groups[k]; }) };
  }

  function mainRowHtml(row, i) {
    var avail = L.plates(S).filter(function (p) { return L.totalQty(S, D.loc, p.sku) > 0; });
    var skuOpts = options(avail.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name + "（庫存 " + L.totalQty(S, D.loc, p.sku) + "）" }; }), row.sku);
    var lotOpts = options(L.lines(S, D.loc, row.sku).map(function (l) {
      var ex = L.isExpired(l.exp);
      return { v: l.lot, t: l.lot + "｜效期 " + l.exp + "｜剩 " + l.qty + (ex ? "（已過期）" : ""), disabled: ex };
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
    var body = '<form data-form="report"><div class="grid">' +
      '<label class="field">日期<input type="date" data-bind="date" value="' + esc(D.date) + '"></label>' +
      '<label class="field">醫院<select data-bind="hospital">' + options(hospitals.map(function (h) { return { v: h.id, t: h.name }; }), D.hospital) + "</select></label>" +
      '<label class="field">醫師<input data-bind="doctor" list="doctors" value="' + esc(D.doctor) + '" placeholder="輸入或選擇"></label>' +
      '<label class="field">扣庫來源<select data-bind="loc">' + locOptions(S.locations, D.loc) + "</select></label>" +
      '<label class="field wide">備註<input data-bind="note" value="' + esc(D.note) + '" placeholder="例如 補貨：備貨1"></label></div>' +
      '<datalist id="doctors">' + Object.keys(docs).map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>" +
      "<h4>本次用量</h4>" +
      (rows || chips ? rows + chips : '<div class="usage-empty">還沒加入任何品項。用到骨板就按「＋ 骨板」，用到骨釘就按「＋ 骨釘」，只加你用到的。</div>') +
      '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="add-main">＋ 骨板</button>' +
      '<button type="button" class="btn btn-sm' + (D.showPicker ? " on" : "") + '" data-act="toggle-picker">＋ 骨釘' + (D.picks.length ? "（已選 " + D.picks.length + "）" : "") + "</button></div>" +
      (D.showPicker ? screwPickerHtml() : "") +
      '<div class="submitbar"><button type="submit" class="btn btn-primary"' + (canSubmit ? "" : ' disabled title="' + (can("report_submit") ? "先加入品項" : "沒有送出報刀的權限") + '"') + ">送出報刀" + (n ? "（" + n + " 項）" : "") + "</button></div></form>";
    return card("NEW", "新增報刀", body);
  }

  function reportCardHtml(r) {
    var items = L.reportItems(r).map(function (it) {
      var p = L.product(S, it.sku);
      return "<li>" + (p && p.kind === "screw" ? "骨釘" : "骨板") + " " + esc(it.sku) + "　" + esc(pName(it.sku)) + " ×" + it.qty +
        '　<span class="muted">批號 ' + esc(it.lot) + "</span>" + (it.scrap ? ' <span class="badge scrap">報廢</span>' : "") + "</li>";
    }).join("");
    var act = "";
    if (r.status === "pending") {
      var ok = can("report_approve");
      act = '<div class="actions"><button class="btn btn-sm btn-primary" data-act="approve" data-id="' + r.id + '"' + (ok ? "" : ' disabled title="沒有審核權限"') + ">審核通過並扣庫</button>" +
        '<button class="btn btn-sm btn-danger" data-act="reject" data-id="' + r.id + '"' + (ok ? "" : " disabled") + ">退回</button></div>";
    }
    return '<div class="report"><div class="report-h"><b>' + esc(r.date) + "</b><span>" + esc(L.locName(S, r.hospital)) + "</span><span>" + esc(r.doctor) + "</span>" +
      '<span class="badge ' + r.status + '">' + L.STATUS[r.status] + '</span><span class="muted">扣庫：' + esc(L.locName(S, r.loc)) + "</span>" + act + "</div>" +
      "<ul>" + items + "</ul>" +
      '<div class="meta">送出 ' + esc(r.createdBy) + " " + esc(r.createdAt) + (r.reviewedBy ? "｜審核 " + esc(r.reviewedBy) + " " + esc(r.reviewedAt) : "") + (r.note ? "｜備註：" + esc(r.note) : "") + "</div></div>";
  }

  function renderReport() {
    var list = S.reports.filter(function (r) { return repFilter === "all" || r.status === repFilter; });
    var seg = [["all", "全部"], ["pending", "待審核"], ["approved", "已審核"], ["rejected", "退回"]].map(function (x) {
      return '<button data-act="rep-filter" data-v="' + x[0] + '" aria-pressed="' + (repFilter === x[0]) + '">' + x[1] + "</button>";
    }).join("");
    return reportFormHtml() + card("LOG", "報刀紀錄",
      list.map(reportCardHtml).join("") || '<div class="empty">沒有資料</div>',
      '<div class="row"><div class="seg">' + seg + '</div><button class="btn btn-sm" data-act="export-csv">匯出 CSV（給正航）</button></div>');
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
      '<button type="button" class="btn" data-act="sales-new">新增憑單</button></div>';

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
    var plateQ = 0, screwQ = 0, val = 0;
    S.lots.forEach(function (l) {
      if (!inScope(l.loc)) return;
      var p = L.product(S, l.sku);
      if (!p) return;
      if (p.kind === "screw") screwQ += l.qty; else plateQ += l.qty;
      val += l.qty * p.price;
    });
    var scopeName = stockLoc ? L.locName(S, stockLoc) : SCOPES.filter(function (x) { return x[0] === stockScope; })[0][1];
    var summary = '<p class="scope-line"><b>' + esc(scopeName) + "</b>　骨板 " + plateQ + " 件　骨釘 " + screwQ + " 支" + (priceOn ? "　約 " + money(val) : "") + "</p>";

    // A banner only for people who can act on it, pointing at the one place that resolves it.
    var att = attentionGroups(), expired = att.filter(function (g) { return g.days < 0; }).length, soon = att.length - expired;
    var banner = att.length && canAct() ? '<div class="banner"><span>' + (expired ? "<b>" + expired + " 批已過期</b>" : "") + (expired && soon ? "、" : "") + (soon ? soon + " 批 90 天內到期" : "") + '</span><button class="btn btn-sm" data-act="go-todo">去處理</button></div>' : "";

    var scopeSeg = '<div class="seg">' + SCOPES.map(function (x) {
      return '<button data-act="stock-scope" data-v="' + x[0] + '" aria-pressed="' + (stockScope === x[0]) + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    var viewSeg = '<div class="seg"><button data-act="stock-view" data-v="plates" aria-pressed="' + (stockView === "plates") + '">骨板</button>' +
      '<button data-act="stock-view" data-v="boxes" aria-pressed="' + (stockView === "boxes") + '">骨釘盒</button>' +
      '<button data-act="stock-view" data-v="moves" aria-pressed="' + (stockView === "moves") + '">最新異動</button></div>';
    var actions = '<div class="row">' + (stockView === "boxes" ? '<button class="btn btn-sm" data-act="new-box"' + (cfg ? "" : ' disabled title="沒有設定權限"') + ">＋ 新增骨釘盒</button>" : "") +
      '<button class="btn btn-sm" data-act="open-inbound"' + (edit ? "" : ' disabled title="沒有庫存異動權限"') + ">＋ 入庫</button>" +
      '<button class="btn btn-sm" data-act="open-transfer"' + (edit ? "" : " disabled") + ">調撥</button></div>";
    var search = stockView === "plates" ? '<div class="row" style="margin:12px 0"><label class="field" style="flex:1;min-width:220px">搜尋<input id="stockSearch" value="' + esc(stockQ) + '" placeholder="型號或品名" autocomplete="off"></label>' +
      '<label class="field check"><input type="checkbox" data-bind="stock-zero"' + (stockZero ? " checked" : "") + ">顯示沒有庫存的品項</label></div>" : "";

    var focus = stockLoc && L.location(S, stockLoc) ? '<div class="focus-chip"><span>只看</span><b>' + esc(L.locName(S, stockLoc)) + "</b>" + locBadge(L.location(S, stockLoc)) + '<button class="btn btn-sm" data-act="map-clear">顯示全部</button></div>' : "";
    var main = banner + card("STOCK", "庫存", '<div class="row" style="justify-content:space-between">' + scopeSeg + viewSeg + "</div>" + focus + summary + '<div class="row" style="justify-content:flex-end;margin-bottom:6px">' + actions + "</div>" + search +
      (stockView === "plates" ? '<div id="matrixHost">' + platesMatrix() + "</div>" : stockView === "moves" ? movesView() : boxesView()));
    return '<div class="stock-layout"><div class="stock-main">' + main + '</div><aside class="stock-side">' + mapCardHtml() + "</aside></div>";
  }

  function visiblePlates() {
    var q = stockQ.trim().toLowerCase();
    return L.plates(S).filter(function (p) {
      if (q && (p.sku + " " + p.name).toLowerCase().indexOf(q) < 0) return false;
      return stockZero || scopeQty(p.sku) > 0;
    });
  }

  // 最新異動: one row per stock line that changed, newest first, from the append-only ledger.
  var MOVE_GROUPS = [["all", "全部", null], ["in", "入庫", ["入庫", "新增骨釘盒"]], ["tr", "調撥", ["調撥", "調撥整盒"]],
    ["out", "扣庫", ["報刀扣庫", "銷貨出貨"]], ["adj", "盤點", ["盤點調整", "骨釘盒盤點", "骨釘盒設定", "刪除骨釘盒"]]];
  function moveSource(m) {
    var r = m.ref;
    if (!r) return '<span class="muted">—</span>';
    if (r.kind === "report") return '<button class="btn btn-sm" data-act="open-report" data-id="' + esc(r.id) + '">報刀單</button>';
    if (r.kind === "sales") return '<button class="btn btn-sm" data-act="open-sales" data-id="' + esc(r.id) + '"' + (can("sales_view") ? "" : " disabled") + ">銷貨憑單</button>";
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

  function openReport(id) {
    var r = S.reports.filter(function (x) { return x.id === id; })[0];
    if (!r) return toast("找不到這張報刀單", true);
    openDialog("報刀單 " + r.date, function () {
      var items = L.reportItems(r).map(function (it) {
        return "<tr><td class=\"code\">" + esc(it.sku) + "</td><td>" + esc(pName(it.sku)) + '</td><td class="code">' + esc(it.lot) + '</td><td class="num">' + it.qty + "</td><td>" + (it.scrap ? '<span class="badge scrap">報廢</span>' : "") + "</td></tr>";
      }).join("");
      return '<dl class="kv"><dt>醫院</dt><dd>' + esc(L.locName(S, r.hospital)) + "</dd><dt>醫師</dt><dd>" + esc(r.doctor) + "</dd><dt>扣庫來源</dt><dd>" + esc(L.locName(S, r.loc)) + "</dd><dt>狀態</dt><dd>" + esc(L.STATUS[r.status]) + "</dd>" +
        (r.note ? "<dt>備註</dt><dd>" + esc(r.note) + "</dd>" : "") + (r.createdBy ? "<dt>送出</dt><dd>" + esc(r.createdBy) + " " + esc(r.createdAt || "") + "</dd>" : "") +
        (r.reviewedBy ? "<dt>審核</dt><dd>" + esc(r.reviewedBy) + " " + esc(r.reviewedAt || "") + "</dd>" : "") + "</dl>" + tbl(["型號", "品名", "批號", "數量", ""], items);
    });
  }

  function platesMatrix() {
    var locs = scopeLocs(), priceOn = can("view_price"), plates = visiblePlates();
    if (!plates.length) return '<div class="empty">這個範圍沒有符合的骨板。' + (stockZero ? "" : "可以勾選「顯示沒有庫存的品項」。") + "</div>";
    var head = '<tr><th class="sticky">型號</th><th>品名</th>' + (priceOn ? '<th class="num">單價</th>' : "") +
      locs.map(function (l) { return '<th class="num lt-' + l.type + '">' + esc(l.name) + "</th>"; }).join("") +
      '<th class="num">合計</th>' + (priceOn ? '<th class="num">金額</th>' : "") + "</tr>";
    var body = "", lastGroup = null, colspan = 2 + locs.length + 1 + (priceOn ? 2 : 0);
    plates.forEach(function (p) {
      if (p.group !== lastGroup) { body += '<tr class="group"><td colspan="' + colspan + '">' + esc(p.group) + "</td></tr>"; lastGroup = p.group; }
      var total = scopeQty(p.sku);
      body += '<tr><td class="sticky code">' + esc(p.sku) + "</td><td>" + esc(p.name) + "</td>" + (priceOn ? '<td class="num">' + money(p.price).replace("NT$ ", "") + "</td>" : "") +
        locs.map(function (l) {
          var q = L.totalQty(S, l.id, p.sku);
          return '<td class="num"><button class="qtybtn' + (q ? " has" : "") + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '">' + (q || "·") + "</button></td>";
        }).join("") + '<td class="num"><b>' + total + "</b></td>" + (priceOn ? '<td class="num">' + money(total * p.price).replace("NT$ ", "") + "</td>" : "") + "</tr>";
    });
    return '<div class="table-wrap matrix-wrap"><table class="table matrix"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" + matrixList() +
      '<p class="muted" style="margin-top:10px">點數字看批號與效期。' + (stockScope === "company" ? "公司倉的庫存可以立即調動（出貨、調撥到醫院）。" : stockScope === "hospital" ? "醫院寄庫是放在醫院的，要先調回公司才能給別人。" : "") + "</p>";
  }

  function matrixList() {
    var locs = scopeLocs(), priceOn = can("view_price"), html = "", last = null;
    visiblePlates().forEach(function (p) {
      if (p.group !== last) { html += '<h5 class="mgroup">' + esc(p.group) + "</h5>"; last = p.group; }
      var total = scopeQty(p.sku);
      var chips = locs.map(function (l) {
        var q = L.totalQty(S, l.id, p.sku);
        return q ? '<button class="mloc ' + l.type + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '"><span>' + esc(l.name) + "</span><b>" + q + "</b></button>" : "";
      }).join("");
      html += '<div class="mitem"><div class="mitem-h"><b class="code">' + esc(p.sku) + "</b><span>" + esc(p.name) + "</span><em>合計 " + total + (priceOn ? "｜" + money(total * p.price) : "") + "</em></div>" +
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
        card("明細", "各位置庫存", ctbl(["位置", "骨板（件）", "骨釘（支）"], ["company", "hospital", "rep"].map(function (t) {
          return "<tr><td>" + TYPE[t] + (t === "company" ? "（可立即調動）" : "") + '</td><td class="num"><b>' + byType[t].p + '</b></td><td class="num"><b>' + byType[t].s + "</b></td></tr>";
        }).join(""))) +
        card("占比", "效期分布（依數量）", stackBar) + "</div>";
    }
    return out;
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

    var custRows = S.customers.map(function (c) { return '<tr><td class="code">' + esc(c.code) + "</td><td>" + esc(c.name) + "</td><td>" + esc(c.addr) + "</td><td>" + esc(c.contact) + "</td></tr>"; }).join("");

    var userRows = S.users.map(function (u) {
      return "<tr><td>" + esc(u.name) + '</td><td><select class="cellinput" data-act="user-role" data-name="' + esc(u.name) + '"' + (admin && u.name !== "管理員" ? "" : " disabled") + ">" + options(L.ROLES.map(function (r) { return { v: r, t: r }; }), u.role) + "</select></td></tr>";
    }).join("");

    var lastGroup = null;
    var permRows = L.CAPS.map(function (c) {
      var head = c[2] !== lastGroup ? '<tr class="group"><td colspan="4">' + esc(c[2]) + "</td></tr>" : "";
      lastGroup = c[2];
      return head + "<tr><td>" + esc(c[1]) + "</td>" + L.ROLES.map(function (r) {
        var fixed = r === "管理員" || c[0] === "manage_perms";
        var on = r === "管理員" || (c[0] !== "manage_perms" && !!(S.perms[r] && S.perms[r][c[0]]));
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
      card("PRODUCTS", "新增骨板品項", '<form data-form="addproduct" class="grid"><label class="field">型號<input name="sku" required' + dis + '></label><label class="field">品名<input name="name" required' + dis + "></label>" +
        '<label class="field">單價<input name="price" type="number" min="0" required' + dis + '></label><label class="field">分類<input name="group" list="groups" required' + dis + '></label>' +
        '<datalist id="groups">' + Object.keys(groups).map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
        '<div class="field">&nbsp;<button class="btn btn-primary"' + dis + ">新增品項</button></div></form>") +
      card("DEMO", "示範資料", '<p class="muted" style="margin-bottom:12px">資料只存在這台瀏覽器。操作紀錄畫面上沒有任何刪除或修改功能。</p><button class="btn btn-danger" data-act="reset-demo">重設為初始示範資料</button>');
  }

  // ---------------- dialogs ----------------
  function openDialog(title, fn, wide) {
    dlg.className = wide ? "wide" : "";
    refreshDlg = function () { dlg.innerHTML = '<div class="dlg"><div class="dlg-h"><h3>' + esc(title) + '</h3><button data-close aria-label="關閉">×</button></div><div class="dlg-b">' + fn() + "</div></div>"; labelTables(dlg); };
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
      '<label class="field">批號<select data-bind="tr-lot">' + options(ls.map(function (l) { return { v: l.lot, t: l.lot + "｜效期 " + l.exp + "｜剩 " + l.qty }; }), TR.lot) + "</select></label>" +
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

    var html = tab === "todo" ? renderTodo() : tab === "report" ? renderReport() : tab === "sales" ? renderSales() : tab === "stock" ? renderStock() : tab === "acct" ? renderAcct() : tab === "stats" ? renderStats() : tab === "trace" ? renderTrace() : renderSettings();
    var y = window.scrollY;
    view.innerHTML = html;
    labelTables(view);
    window.scrollTo(0, y);
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

    if (a === "add-main") {
      var first = L.plates(S).filter(function (p) { return usableLines(D.loc, p.sku).length; })[0];
      if (!first) return toast("這個扣庫來源沒有可用的骨板庫存", true);
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
    else if (a === "approve") run(function () { L.approveReport(S, g("id")); }, "已審核，庫存已扣除");
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
      if (run(function () { L.submitReport(S, draftPayload()); }, "已送出，等內勤審核")) D = newDraft();
    } else if (f === "sales") {
      run(function () { SD = deepCopy(L.saveSales(S, SD)); }, "憑單已儲存");
    } else if (f === "inbound") {
      if (run(function () { L.addStock(S, v("loc"), v("sku"), v("lot").trim(), v("exp"), Math.floor(Number(v("qty")))); }, "已入庫")) closeDialog();
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

  render();
})();
