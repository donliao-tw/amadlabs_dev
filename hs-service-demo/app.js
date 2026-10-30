(function () {
  "use strict";

  var L = HSLogic;
  var S = L.load();
  var tab = "report";
  var stockView = "plates";
  var boxLoc = "all";
  var repFilter = "all";
  var traceQ = "";
  var D = newDraft();
  var SD = newSales();
  var TR = null;
  var refreshDlg = null;

  var TYPE = { company: "公司", hospital: "醫院寄庫", rep: "業務移動庫存" };
  var ICONS = {
    report: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    sales: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    stock: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    trace: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  var NAV = [
    { id: "report", label: "報刀", title: "報刀", sub: "業務在醫院跟刀後回報用了哪些植入物，內勤審核後才會扣庫存。", show: function () { return true; } },
    { id: "sales", label: "銷貨憑單", title: "銷貨憑單", sub: "對應正航的銷貨憑單：客戶、明細、稅額，覆核後出貨扣庫。", show: function () { return L.can(S, "sales_view"); } },
    { id: "stock", label: "庫存", title: "庫存", sub: "公司、醫院寄庫、業務移動庫存，每個批號與效期都看得到。", show: function () { return L.can(S, "stock_view"); } },
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

  // ---------------- screw boxes: a physical rack drawn as a lamp grid ----------------
  // One slot per hole. Sizes run left to right (a size can span several columns),
  // screw types stack as row bands. Lit = in stock; amber = picked for this 報刀.
  function boxGridHtml(box, mode, o) {
    o = o || {};
    var cols = box.labels.length, out = "";
    L.boxBands(S, box).forEach(function (band) {
      var total = 0;
      band.groups.forEach(function (g) { total += g.qty; });
      var grid = [];
      for (var r = 0; r < band.rows; r++) grid.push(new Array(cols));
      band.groups.forEach(function (g) {
        var used = o.used ? o.used(g.sku) : 0;
        var vis = Math.min(g.qty, g.cap), sel = Math.min(used, vis), lit = vis - sel;
        g.cols.forEach(function (ci, k) {
          for (var r = 0; r < band.rows; r++) {
            var idx = k * band.rows + r;
            grid[r][ci] = { st: idx < lit ? "on" : idx < vis ? "sel" : "off", g: g };
          }
        });
      });
      var cells = "";
      for (var r2 = 0; r2 < band.rows; r2++) {
        for (var c = 0; c < cols; c++) {
          var cell = grid[r2][c], st = cell.st, g2 = cell.g;
          if (o.thumb) { cells += '<i class="slot ' + st + '"></i>'; continue; }
          var attrs = ' data-box="' + esc(box.id) + '" data-series="' + esc(band.series) + '" data-len="' + g2.len + '" data-sku="' + esc(g2.sku || "") +
            '" data-lot="' + esc(box.lot) + '" title="' + esc(band.series + " · " + g2.len + " mm") + '"';
          var act = null;
          if (mode === "pick") act = st === "on" ? "seat-add" : st === "sel" ? "seat-sub" : null;
          else act = st === "on" ? "seat-take" : "seat-put";
          var enabled = o.interactive !== false && !(mode === "pick" && !g2.sku);
          cells += act ? '<button type="button" class="slot ' + st + '" data-act="' + act + '"' + attrs + (enabled ? "" : " disabled") + "></button>" : '<span class="slot ' + st + '"></span>';
        }
      }
      out += '<div class="bband"><div class="bband-h"><b>' + esc(band.series) + "</b><span>" + total + " 支</span></div>" +
        (o.thumb ? "" : '<div class="bgrid" style="--cols:' + cols + '">' + box.labels.map(function (n) { return '<span class="blabel">' + n + "</span>"; }).join("") + "</div>") +
        '<div class="bgrid' + (o.thumb ? " thumb" : "") + '" style="--cols:' + cols + '">' + cells + "</div></div>";
    });
    return '<div class="boxscroll">' + out + "</div>";
  }
  function legend(mode) {
    return '<div class="legend"><span><i class="slot on"></i>有貨</span>' + (mode === "pick" ? '<span><i class="slot sel"></i>這張報刀選用</span>' : "") + '<span><i class="slot"></i>空位</span></div>';
  }

  // ---------------- 報刀 ----------------
  function firstHospital() {
    var h = S.locations.filter(function (l) { return l.type === "hospital"; })[0];
    return h ? h.id : (S.locations[0] && S.locations[0].id);
  }
  function newDraft() {
    var h = firstHospital();
    return { date: L.ymd(new Date()), hospital: h, doctor: "", loc: h, note: "", main: [], screws: [], sp: { box: "" } };
  }
  function usedInDraft(sku, lot) {
    var n = 0;
    D.screws.forEach(function (e) { if (e.sku === sku && e.lot === lot) n += e.qty; });
    return n;
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

  function screwPickerHtml() {
    var boxes = boxesAt(D.loc);
    if (!boxes.length) return '<div class="empty">這個扣庫來源沒有骨釘盒。</div>';
    if (!boxes.some(function (b) { return b.id === D.sp.box; })) D.sp.box = boxes[0].id;
    var box = L.box(S, D.sp.box), expired = L.isExpired(box.exp);

    var chips = D.screws.map(function (e, idx) {
      return '<span class="chip' + (e.scrap ? " scrap" : "") + '">' + esc(pName(e.sku)) + " ×" + e.qty + (e.scrap ? " 報廢" : "") +
        ' <span class="mono">' + esc(e.lot) + "</span>" +
        (e.scrap ? "" : '<button type="button" data-act="scrap-one" data-idx="' + idx + '" title="把其中 1 支改記為報廢">報廢1</button>') +
        '<button type="button" data-act="dec-screw" data-idx="' + idx + '" title="減少">−</button></span>';
    }).join("");

    return '<div class="grid" style="margin-bottom:12px"><label class="field">骨釘盒<select data-bind="sp-box">' +
      options(boxes.map(function (b) { return { v: b.id, t: b.name + "｜批號 " + b.lot + "｜共 " + L.boxTotal(S, b) + " 支" + (L.isExpired(b.exp) ? "（已過期）" : "") }; }), D.sp.box) + "</select></label></div>" +
      '<div class="rack"><div class="rack-h"><b>' + esc(box.name) + "</b><span>批號 " + esc(box.lot) + "｜效期 " + esc(box.exp) + "　點亮燈選用，點橘燈取消</span></div>" +
      boxGridHtml(box, "pick", { interactive: !expired, used: function (sku) { return sku ? usedInDraft(sku, box.lot) : 0; } }) +
      legend("pick") + "</div>" +
      '<div class="chips">' + (chips || '<span class="muted">尚未選用骨釘</span>') + "</div>";
  }

  function reportFormHtml() {
    var hospitals = S.locations.filter(function (l) { return l.type === "hospital"; });
    var docs = {};
    S.reports.forEach(function (r) { docs[r.doctor] = 1; });
    var rows = D.main.map(mainRowHtml).join("");
    var canSubmit = can("report_submit");
    var body = '<form data-form="report"><div class="grid">' +
      '<label class="field">日期<input type="date" data-bind="date" value="' + esc(D.date) + '"></label>' +
      '<label class="field">醫院<select data-bind="hospital">' + options(hospitals.map(function (h) { return { v: h.id, t: h.name }; }), D.hospital) + "</select></label>" +
      '<label class="field">醫師<input data-bind="doctor" list="doctors" value="' + esc(D.doctor) + '" placeholder="輸入或選擇"></label>' +
      '<label class="field">扣庫來源<select data-bind="loc">' + locOptions(S.locations, D.loc) + "</select></label>" +
      '<label class="field wide">備註<input data-bind="note" value="' + esc(D.note) + '" placeholder="例如 補貨：備貨1"></label></div>' +
      '<datalist id="doctors">' + Object.keys(docs).map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>" +
      "<h4>骨板／主品項</h4>" + (rows || '<div class="muted" style="margin-bottom:10px">尚未新增品項</div>') +
      '<button type="button" class="btn btn-sm" data-act="add-main">＋ 新增品項</button>' +
      "<h4>骨釘</h4>" + screwPickerHtml() +
      '<div style="margin-top:20px"><button type="submit" class="btn btn-primary"' + (canSubmit ? "" : ' disabled title="沒有送出報刀的權限"') + ">送出報刀</button></div></form>";
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
    var p = S.products.filter(function (x) { return stockLocsFor(x.sku).length; })[0];
    if (!p) return null;
    var loc = stockLocsFor(p.sku)[0].id;
    return { sku: p.sku, loc: loc, lot: usableLines(loc, p.sku)[0].lot, qty: 1, price: p.price };
  }

  function salesLineHtml(l, i, ro) {
    var priceOn = can("view_price");
    var groups = {}, order = [];
    S.products.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
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
  var TYPE_SHORT = { company: "可調動", hospital: "寄庫", rep: "隨身" };
  function sortedLocs() {
    return S.locations.slice().sort(function (a, b) { return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]; });
  }
  function stockValue(loc) {
    var v = 0;
    S.lots.forEach(function (l) {
      if (loc !== null && l.loc !== loc) return;
      var p = L.product(S, l.sku);
      if (p) v += l.qty * p.price;
    });
    return v;
  }
  function qtyOfType(type) {
    var n = 0;
    S.lots.forEach(function (l) { var loc = L.location(S, l.loc); if (loc && loc.type === type) n += l.qty; });
    return n;
  }

  function renderStock() {
    if (!can("stock_view")) return noPerm("查看庫存");
    var priceOn = can("view_price"), edit = can("stock_edit"), cfg = can("settings_edit");
    var warn = 0, exp = 0, alerts = [];
    S.lots.forEach(function (l) {
      if (l.qty <= 0) return;
      var d = L.expDays(l.exp);
      if (d < 0) { exp++; alerts.push(l); } else if (d <= 90) { warn++; alerts.push(l); }
    });
    alerts.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });

    var stats = '<div class="readouts">' +
      '<div class="readout"><small>公司倉・可立即調動</small><b>' + qtyOfType("company") + '</b><i class="led"></i></div>' +
      '<div class="readout"><small>醫院寄庫・放在醫院</small><b>' + qtyOfType("hospital") + '</b><i class="led off"></i></div>' +
      '<div class="readout"><small>業務移動庫存・隨身</small><b>' + qtyOfType("rep") + '</b><i class="led off"></i></div>' +
      (priceOn ? '<div class="readout"><small>庫存總金額</small><b>' + money(stockValue(null)) + '</b><i class="led"></i></div>' : "") +
      '<div class="readout"><small>90 天內到期（批號列）</small><b>' + warn + '</b><i class="led ' + (warn ? "amber" : "") + '"></i></div>' +
      '<div class="readout"><small>已過期仍有庫存</small><b>' + exp + '</b><i class="led ' + (exp ? "red" : "") + '"></i></div></div>';

    var alertHtml = alerts.length ? card("ALERT", "效期警示", '<div class="table-wrap" style="max-height:220px"><table class="table"><thead><tr><th>位置</th><th>型號</th><th>品名</th><th>批號</th><th>效期</th><th class="num">數量</th></tr></thead><tbody>' +
      alerts.slice(0, 40).map(function (l) {
        var loc = L.location(S, l.loc);
        return "<tr><td>" + esc(L.locName(S, l.loc)) + " " + (loc ? locBadge(loc) : "") + '</td><td class="code">' + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + '</td><td class="code">' + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num">' + l.qty + "</td></tr>";
      }).join("") + "</tbody></table></div>") : "";

    var bar = '<div class="row" style="justify-content:space-between"><div class="seg">' +
      '<button data-act="stock-view" data-v="plates" aria-pressed="' + (stockView === "plates") + '">骨板庫存</button>' +
      '<button data-act="stock-view" data-v="boxes" aria-pressed="' + (stockView === "boxes") + '">骨釘盒</button></div>' +
      '<div class="row">' + (stockView === "boxes" ? '<button class="btn btn-sm" data-act="new-box"' + (cfg ? "" : ' disabled title="沒有設定權限"') + ">＋ 新增骨釘盒</button>" : "") +
      '<button class="btn btn-sm" data-act="open-inbound"' + (edit ? "" : ' disabled title="沒有庫存異動權限"') + ">＋ 入庫</button>" +
      '<button class="btn btn-sm" data-act="open-transfer"' + (edit ? "" : " disabled") + ">調撥</button></div></div>";

    return stats + alertHtml + card("STOCK", stockView === "plates" ? "骨板庫存矩陣" : "骨釘盒", stockView === "plates" ? platesMatrix() : boxesView(), bar);
  }

  function platesMatrix() {
    var locs = sortedLocs(), priceOn = can("view_price");
    var head = '<tr><th class="sticky">型號</th><th>品名</th>' + (priceOn ? '<th class="num">單價</th>' : "") +
      locs.map(function (l) { return '<th class="num lt-' + l.type + '">' + esc(l.name) + "<small>" + TYPE_SHORT[l.type] + "</small></th>"; }).join("") +
      '<th class="num">合計</th>' + (priceOn ? '<th class="num">金額</th>' : "") + "</tr>";
    var body = "", lastGroup = null, colspan = 2 + locs.length + 1 + (priceOn ? 2 : 0);
    L.plates(S).forEach(function (p) {
      if (p.group !== lastGroup) { body += '<tr class="group"><td colspan="' + colspan + '">' + esc(p.group) + "</td></tr>"; lastGroup = p.group; }
      var total = L.totalQty(S, null, p.sku);
      body += '<tr><td class="sticky code">' + esc(p.sku) + "</td><td>" + esc(p.name) + "</td>" + (priceOn ? '<td class="num">' + money(p.price).replace("NT$ ", "") + "</td>" : "") +
        locs.map(function (l) {
          var q = L.totalQty(S, l.id, p.sku);
          return '<td class="num"><button class="qtybtn' + (q ? " has" : "") + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '">' + (q || "·") + "</button></td>";
        }).join("") + '<td class="num"><b>' + total + "</b></td>" + (priceOn ? '<td class="num">' + money(total * p.price).replace("NT$ ", "") + "</td>" : "") + "</tr>";
    });
    var foot = priceOn ? '<tr><td class="sticky"><b>位置金額</b></td><td></td><td></td>' +
      locs.map(function (l) { return '<td class="num"><b>' + money(stockValue(l.id)).replace("NT$ ", "") + "</b></td>"; }).join("") +
      '<td></td><td class="num"><b>' + money(stockValue(null)).replace("NT$ ", "") + "</b></td></tr>" : "";
    return '<div class="table-wrap"><table class="table"><thead>' + head + "</thead><tbody>" + body + "</tbody>" + (foot ? "<tfoot>" + foot + "</tfoot>" : "") + "</table></div>" +
      '<p class="muted" style="margin-top:10px"><b>公司倉的庫存可以立即調動</b>（出貨、調撥到醫院）；醫院寄庫是放在醫院的，要調回公司才能給別人；業務移動庫存是業務隨身帶著的。點任一格查看批號與效期。' + (priceOn ? "表尾金額含骨釘。" : "") + "</p>";
  }

  function boxesView() {
    var edit = can("stock_edit");
    var locs = sortedLocs();
    if (boxLoc !== "all" && !L.location(S, boxLoc)) boxLoc = "all";
    var list = S.boxes.filter(function (b) { return boxLoc === "all" || b.loc === boxLoc; }).sort(function (a, b) {
      var la = L.location(S, a.loc), lb = L.location(S, b.loc);
      return (TYPE_ORDER[la.type] - TYPE_ORDER[lb.type]) || (a.name < b.name ? -1 : 1);
    });
    var pick = '<div class="row" style="margin-bottom:14px"><label class="field" style="min-width:260px">位置<select data-bind="box-loc"><option value="all"' + (boxLoc === "all" ? " selected" : "") + ">全部位置</option>" + locOptions(locs, boxLoc) + "</select></label></div>";
    var cards = list.map(function (b) {
      var loc = L.location(S, b.loc);
      var per = L.boxBands(S, b).map(function (band) {
        var n = 0; band.groups.forEach(function (g) { n += g.qty; });
        return esc(band.series) + " " + n;
      }).join("　");
      return '<article class="boxcard" data-act="open-box" data-id="' + esc(b.id) + '"><div class="boxcard-h"><b>' + esc(b.name) + "</b>" + locBadge(loc) + "</div>" +
        '<div class="muted" style="margin-bottom:8px">' + esc(loc.name) + "｜批號 " + esc(b.lot) + "｜效期 " + esc(b.exp) + " " + expBadge(b.exp) + "</div>" +
        boxGridHtml(b, "thumb", { thumb: true }) + '<div class="boxcard-f"><span>' + per + "</span><b>共 " + L.boxTotal(S, b) + " 支</b></div></article>";
    }).join("");
    return pick + (cards ? '<div class="boxes">' + cards + "</div>" : '<div class="empty">這個位置沒有骨釘盒。</div>') +
      '<p class="muted" style="margin-top:12px">點一個盒子打開整盒格子' + (edit ? "，可以逐格增減、調撥整盒。" : "。") + " 每個盒子一個批號；<b>在公司倉的盒子可以立即調動</b>。</p>";
  }

  function openBox(id) {
    var first = L.box(S, id);
    openDialog(first ? first.name : "骨釘盒", function () {
      var box = L.box(S, id);
      if (!box) return '<div class="empty">找不到這個盒子，可能已被刪除。</div>';
      var loc = L.location(S, box.loc), edit = can("stock_edit"), cfg = can("settings_edit"), total = L.boxTotal(S, box);
      var where = loc.type === "company" ? "在公司倉，可以馬上調動：出貨，或調撥到醫院、業務。" : loc.type === "hospital" ? "寄放在醫院，要先調回公司才能給別人。" : "業務隨身帶著。";
      return '<div class="boxhead">' + locBadge(loc) + "<span><b>" + esc(loc.name) + "</b></span><span>批號 <b>" + esc(box.lot) + "</b></span><span>效期 " + esc(box.exp) + " " + expBadge(box.exp) + "</span><span>共 <b>" + total + "</b> 支</span></div>" +
        '<p class="muted" style="margin:6px 0 12px">' + where + (edit ? " 點亮燈減 1 支，點空位加 1 支（盤點調整，會寫進操作紀錄）。" : " 目前身分只能檢視。") + "</p>" +
        boxGridHtml(box, "stock", { interactive: edit }) + legend("stock") +
        '<div class="row" style="margin-top:16px"><button class="btn btn-primary btn-sm" data-act="move-box" data-id="' + esc(box.id) + '"' + (edit ? "" : " disabled") + ">調撥整盒</button>" +
        '<button class="btn btn-sm" data-act="edit-box" data-id="' + esc(box.id) + '"' + (cfg ? "" : " disabled") + ">設定這個盒子</button>" +
        '<button class="btn btn-sm btn-danger" data-act="del-box" data-id="' + esc(box.id) + '"' + (cfg && total === 0 ? "" : ' disabled title="盒內還有螺絲，不能刪除"') + ">刪除</button></div>";
    }, true);
  }

  function openBoxConfig(id) {
    var box = id ? L.box(S, id) : null;
    var series = L.screwSeries(S).map(function (x) { return x.series; });
    var b = box || { name: "新骨釘盒", loc: boxLoc !== "all" ? boxLoc : "co", lot: "", exp: L.addDays(540), labels: L.defaultLabels(), bands: [{ series: series[0], rows: 5 }, { series: series[series.length - 1], rows: 6 }] };
    openDialog(box ? "設定：" + box.name : "新增骨釘盒", function () {
      var bandRows = [0, 1, 2].map(function (i) {
        var band = b.bands[i];
        return '<div class="row" style="margin-bottom:8px"><label class="field">螺絲區塊 ' + (i + 1) + '<select name="series' + i + '"><option value="">（不使用）</option>' + options(series.map(function (x) { return { v: x, t: x + " 骨釘" }; }), band ? band.series : "") + "</select></label>" +
          '<label class="field">列數<input name="rows' + i + '" type="number" min="1" max="30" value="' + (band ? band.rows : "") + '" style="width:90px"></label></div>';
      }).join("");
      return '<form data-form="boxcfg" data-id="' + esc(id || "") + '"><div class="grid">' +
        '<label class="field">盒子名稱<input name="name" required value="' + esc(b.name) + '"></label>' +
        '<label class="field">位置<select name="loc">' + locOptions(S.locations, b.loc) + "</select></label>" +
        '<label class="field">批號<input name="lot" required value="' + esc(b.lot) + '"></label>' +
        '<label class="field">效期<input name="exp" type="date" required value="' + esc(b.exp) + '"></label></div>' +
        "<h4>左到右的尺寸標示（一個數字一欄，目前 " + b.labels.length + " 欄）</h4>" +
        '<label class="field">空白或逗號分隔，同一個尺寸可以連續出現幾欄<textarea name="labels" rows="3" style="padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-family:var(--mono);width:100%">' + esc(b.labels.join(" ")) + "</textarea></label>" +
        '<div class="row" style="margin-top:10px"><label class="field">從<input name="gFrom" type="number" value="10" style="width:76px"></label><label class="field">到<input name="gTo" type="number" value="48" style="width:76px"></label>' +
        '<label class="field">間距<input name="gStep" type="number" value="2" min="1" style="width:76px"></label><label class="field">每個尺寸幾欄<input name="gRepeat" type="number" value="2" min="1" style="width:96px"></label>' +
        '<button type="button" class="btn btn-sm" data-act="gen-labels">快速產生</button></div>' +
        "<h4>螺絲區塊（由上到下，列數加起來就是整盒的列數）</h4>" + bandRows +
        '<div style="margin-top:14px"><button class="btn btn-primary">儲存</button></div></form>' +
        '<p class="muted" style="margin-top:10px">預設是 40 欄 × 11 列。盒子裡還有螺絲時，不能改位置和批號，請用「調撥整盒」。</p>';
    }, true);
  }

  function openMoveBox(id) {
    var box = L.box(S, id);
    if (!box) return;
    openDialog("調撥整盒：" + box.name, function () {
      var cur = L.location(S, box.loc), dests = S.locations.filter(function (l) { return l.id !== box.loc; });
      return '<p class="muted" style="margin-bottom:12px">現在在 ' + esc(cur.name) + " " + locBadge(cur) + "，共 " + L.boxTotal(S, box) + " 支。整盒會一起搬到新位置，批號和效期不變。</p>" +
        '<form data-form="movebox" data-id="' + esc(box.id) + '" class="row"><label class="field" style="min-width:280px">搬到<select name="to">' + locOptions(dests, dests[0] && dests[0].id) + "</select></label>" +
        '<button class="btn btn-primary">確認調撥</button></form>';
    });
  }

  // ---------------- 批號追溯 ----------------
  function tbl(headers, rows) {
    return '<div class="table-wrap"><table class="table"><thead><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  function traceResultsHtml() {
    var t = L.trace(S, traceQ);
    if (!t) return '<div class="empty">輸入批號或型號，查它現在在哪、用在哪家醫院哪位醫師。</div>';
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
      var qty = qtyAt[l.id] || 0;
      return '<tr><td><input class="cellinput" data-act="loc-rename" data-id="' + esc(l.id) + '" value="' + esc(l.name) + '"' + (ok ? "" : " disabled") + "></td><td>" + TYPE[l.type] + '</td><td class="num">' + qty + "</td>" +
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
        '<div class="table-wrap"><table class="table"><thead><tr><th>名稱</th><th>類型</th><th class="num">庫存支數</th><th></th></tr></thead><tbody>' + locRows + "</tbody></table></div>" +
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
    refreshDlg = function () { dlg.innerHTML = '<div class="dlg"><div class="dlg-h"><h3>' + esc(title) + '</h3><button data-close aria-label="關閉">×</button></div><div class="dlg-b">' + fn() + "</div></div>"; };
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
    var skus = S.products.filter(function (p) { return usableLines(TR.from, p.sku).length; });
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

  // ---------------- render ----------------
  var current = function () { return NAV.filter(function (n) { return n.id === tab; })[0] || NAV[0]; };

  function render() {
    var visible = NAV.filter(function (n) { return n.show(); });
    if (!visible.some(function (n) { return n.id === tab; })) tab = "report";

    document.getElementById("operator").innerHTML = options(S.users.map(function (u) { return { v: u.name, t: u.name }; }), S.operator);
    document.getElementById("roleChip").textContent = L.role(S);
    var nav = visible.map(function (n) {
      return '<button data-tab="' + n.id + '"' + (n.id === tab ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n.id] + "</svg><span>" + n.label + "</span></button>";
    }).join("");
    document.getElementById("nav").innerHTML = nav;
    document.getElementById("bottomnav").innerHTML = nav;

    var cur = current();
    document.getElementById("pageHead").innerHTML = '<div class="eyebrow">' + esc(cur.id) + "</div><h1>" + esc(cur.title) + "</h1><p>" + esc(cur.sub) + "</p>";

    var html = tab === "report" ? renderReport() : tab === "sales" ? renderSales() : tab === "stock" ? renderStock() : tab === "trace" ? renderTrace() : renderSettings();
    var y = window.scrollY;
    view.innerHTML = html;
    window.scrollTo(0, y);
    if (dlg.open && refreshDlg) refreshDlg();
  }

  // ---------------- events ----------------
  document.getElementById("operator").addEventListener("change", function (e) {
    S.operator = e.target.value; persist(); render();
  });
  function onNav(e) {
    var b = e.target.closest("[data-tab]");
    if (b) { tab = b.getAttribute("data-tab"); render(); window.scrollTo(0, 0); }
  }
  document.getElementById("nav").addEventListener("click", onNav);
  document.getElementById("bottomnav").addEventListener("click", onNav);
  dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-close]")) closeDialog(); });
  dlg.addEventListener("close", function () { refreshDlg = null; });

  function draftScrewAdd(sku, lot) {
    var ex = D.screws.filter(function (s) { return s.sku === sku && s.lot === lot && !s.scrap; })[0];
    if (ex) ex.qty++; else D.screws.push({ sku: sku, lot: lot, qty: 1, scrap: false });
  }
  function draftScrewSub(sku, lot) {
    var e = D.screws.filter(function (s) { return s.sku === sku && s.lot === lot && !s.scrap; })[0] ||
      D.screws.filter(function (s) { return s.sku === sku && s.lot === lot; })[0];
    if (e) e.qty--;
    D.screws = D.screws.filter(function (s) { return s.qty > 0; });
  }

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
    else if (a === "seat-add") { draftScrewAdd(g("sku"), g("lot")); render(); }
    else if (a === "seat-sub") { draftScrewSub(g("sku"), g("lot")); render(); }
    else if (a === "scrap-one") {
      var e1 = D.screws[+g("idx")];
      if (e1) {
        e1.qty--;
        var sc = D.screws.filter(function (s) { return s.sku === e1.sku && s.lot === e1.lot && s.scrap; })[0];
        if (sc) sc.qty++; else D.screws.push({ sku: e1.sku, lot: e1.lot, qty: 1, scrap: true });
        D.screws = D.screws.filter(function (s) { return s.qty > 0; });
      }
      render();
    } else if (a === "dec-screw") {
      var e2 = D.screws[+g("idx")];
      if (e2) { e2.qty--; D.screws = D.screws.filter(function (s) { return s.qty > 0; }); }
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
    else if (a === "open-lot") openLot(g("loc"), g("sku"));
    else if (a === "open-inbound") openInbound(g("loc"), g("sku"));
    else if (a === "open-transfer") openTransfer(g("from") ? { from: g("from"), sku: g("sku"), lot: g("lot") } : null);
    else if (a === "seat-take" || a === "seat-put") {
      var dd = a === "seat-put" ? 1 : -1;
      run(function () { L.boxAdjust(S, g("box"), g("series"), Number(g("len")), dd); });
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
        } else if (a === "open-sales") { SD = deepCopy(S.sales.filter(function (o) { return o.id === g("id"); })[0]); render(); window.scrollTo(0, 0); }
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

  function resetPicker() { D.main = []; D.screws = []; D.sp = { box: "" }; }

  document.addEventListener("change", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind"), act = t.getAttribute && t.getAttribute("data-act");
    if (act === "loc-rename") {
      var loc = L.location(S, t.getAttribute("data-id")), nm = t.value.trim();
      if (loc && nm && nm !== loc.name) run(function () { need("settings_edit"); L.log(S, "庫位改名", loc.name + " → " + nm); loc.name = nm; }, "已更新");
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
    else if (b === "box-loc") { boxLoc = t.value; render(); }
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
    else if (t.id === "traceInput") {
      traceQ = t.value;
      document.getElementById("traceResults").innerHTML = traceResultsHtml();
    }
  });

  document.addEventListener("submit", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-form");
    if (!f) return;
    e.preventDefault();
    var v = function (n) { return e.target.elements[n].value; };
    if (f === "report") {
      if (run(function () { L.submitReport(S, D); }, "已送出，等內勤審核")) D = newDraft();
    } else if (f === "sales") {
      run(function () { SD = deepCopy(L.saveSales(S, SD)); }, "憑單已儲存");
    } else if (f === "inbound") {
      if (run(function () { L.addStock(S, v("loc"), v("sku"), v("lot").trim(), v("exp"), Math.floor(Number(v("qty")))); }, "已入庫")) closeDialog();
    } else if (f === "transfer") {
      if (run(function () { L.transfer(S, TR.from, TR.to, TR.sku, TR.lot, TR.qty); }, "已調撥")) closeDialog();
    } else if (f === "boxcfg") {
      var bid2 = e.target.getAttribute("data-id");
      var labels = v("labels").split(/[\s,，、]+/).filter(Boolean).map(Number);
      var bands = [0, 1, 2].map(function (i) { return { series: v("series" + i), rows: Number(v("rows" + i)) }; }).filter(function (x) { return x.series; });
      var out = run(function () {
        var cfgObj = { name: v("name"), loc: v("loc"), lot: v("lot"), exp: v("exp"), labels: labels, bands: bands };
        return bid2 ? L.updateBox(S, bid2, cfgObj) : L.createBox(S, cfgObj);
      }, "已儲存骨釘盒");
      if (out) { closeDialog(); openBox(out.id); }
    } else if (f === "movebox") {
      var mid = e.target.getAttribute("data-id");
      if (run(function () { return L.moveBox(S, mid, v("to")); }, "已調撥整盒")) { closeDialog(); openBox(mid); }
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

  render();
})();
