(function () {
  "use strict";

  var L = HSLogic;
  var S = L.load();
  var tab = "report";
  var stockView = "plates";
  var boxLoc = "co";
  var repFilter = "all";
  var traceQ = "";
  var D = newDraft();
  var TR = null;
  var refreshDlg = null;

  var TYPE = { company: "公司", hospital: "醫院寄庫", rep: "業務移動庫存" };
  var view = document.getElementById("view");
  var dlg = document.getElementById("dlg");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "NT$" + Math.round(n).toLocaleString("zh-Hant"); }
  function office() { return L.isOffice(S.operator); }
  function persist() { L.save(S); }

  function toast(msg, err) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "hs-toast" + (err ? " err" : "");
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
  function locOptions(list, selected) {
    return options(list.map(function (l) { return { v: l.id, t: l.name + "（" + TYPE[l.type] + "）" }; }), selected);
  }
  function expBadge(exp) {
    var d = L.expDays(exp);
    if (d < 0) return '<span class="hs-badge expired">已過期</span>';
    if (d <= 90) return '<span class="hs-badge warn">' + d + " 天到期</span>";
    return "";
  }
  function pName(sku) { var p = L.product(S, sku); return p ? p.name : sku; }

  // ---------------- 報刀 ----------------
  function firstHospital() {
    var h = S.locations.filter(function (l) { return l.type === "hospital"; })[0];
    return h ? h.id : (S.locations[0] && S.locations[0].id);
  }
  function newDraft() {
    var h = firstHospital();
    return { date: L.ymd(new Date()), hospital: h, doctor: "", loc: h, note: "", main: [], screws: [], sp: { series: "", lot: "" } };
  }
  function usedInDraft(sku, lot) {
    var n = 0;
    D.screws.forEach(function (e) { if (e.sku === sku && e.lot === lot) n += e.qty; });
    return n;
  }
  function usableLines(loc, sku) {
    return L.lines(S, loc, sku).filter(function (l) { return !L.isExpired(l.exp); });
  }

  function mainRowHtml(row, i) {
    var avail = L.plates(S).filter(function (p) { return L.totalQty(S, D.loc, p.sku) > 0; });
    var skuOpts = options(avail.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name + "（庫存 " + L.totalQty(S, D.loc, p.sku) + "）" }; }), row.sku);
    var lotOpts = options(L.lines(S, D.loc, row.sku).map(function (l) {
      var ex = L.isExpired(l.exp);
      return { v: l.lot, t: l.lot + "｜效期 " + l.exp + "｜剩 " + l.qty + (ex ? "（已過期）" : ""), disabled: ex };
    }), row.lot);
    return '<div class="hs-mainrow">' +
      '<label class="hs-field">品項<select data-bind="main-sku" data-i="' + i + '">' + skuOpts + "</select></label>" +
      '<label class="hs-field">批號<select data-bind="main-lot" data-i="' + i + '">' + lotOpts + "</select></label>" +
      '<label class="hs-field">數量<input type="number" min="1" step="1" value="' + row.qty + '" data-bind="main-qty" data-i="' + i + '"></label>' +
      '<label class="hs-field">報廢<input type="checkbox" data-bind="main-scrap" data-i="' + i + '"' + (row.scrap ? " checked" : "") + "></label>" +
      '<button type="button" class="hs-btn hs-btn-sm" data-act="rm-main" data-i="' + i + '">移除</button></div>';
  }

  function screwPickerHtml() {
    var all = L.screwSeries(S).filter(function (se) {
      return se.lens.some(function (len) { return L.totalQty(S, D.loc, se.sku[len]) > 0; });
    });
    if (!all.length) return '<div class="hs-empty">這個扣庫來源沒有骨釘庫存。</div>';
    if (!all.some(function (s) { return s.series === D.sp.series; })) D.sp.series = all[0].series;
    var se = all.filter(function (s) { return s.series === D.sp.series; })[0];

    var lotSet = {}, lots = [];
    se.lens.forEach(function (len) {
      L.lines(S, D.loc, se.sku[len]).forEach(function (l) {
        if (!lotSet[l.lot]) { lotSet[l.lot] = l.exp; lots.push(l.lot); }
      });
    });
    if (lots.indexOf(D.sp.lot) < 0) {
      D.sp.lot = lots.filter(function (x) { return !L.isExpired(lotSet[x]); })[0] || lots[0];
    }
    var expired = L.isExpired(lotSet[D.sp.lot]);

    var cells = se.lens.map(function (len) {
      var sku = se.sku[len];
      var line = L.findLine(S, D.loc, sku, D.sp.lot);
      var left = (line ? line.qty : 0) - usedInDraft(sku, D.sp.lot);
      return '<button type="button" class="hs-cell' + (left > 0 && left <= 2 ? " low" : "") + '" data-act="pick-screw" data-sku="' + esc(sku) + '"' + (left <= 0 || expired ? " disabled" : "") + ">" +
        '<span class="len">' + len + "<small> mm</small></span><span class=\"qty\">剩 " + Math.max(0, left) + "</span></button>";
    }).join("");

    var seriesSel = options(all.map(function (s) { return { v: s.series, t: s.series + " 骨釘" }; }), D.sp.series);
    var lotSel = options(lots.map(function (x) { return { v: x, t: x + "｜效期 " + lotSet[x] + (L.isExpired(lotSet[x]) ? "（已過期）" : ""), disabled: L.isExpired(lotSet[x]) }; }), D.sp.lot);

    var chips = D.screws.map(function (e, idx) {
      return '<span class="hs-chip' + (e.scrap ? " scrap" : "") + '">' + esc(pName(e.sku)) + " ×" + e.qty + (e.scrap ? " 報廢" : "") +
        ' <span class="hs-muted">' + esc(e.lot) + "</span>" +
        (e.scrap ? "" : '<button type="button" data-act="scrap-one" data-idx="' + idx + '" title="把其中 1 支改記為報廢">報廢1</button>') +
        '<button type="button" data-act="dec-screw" data-idx="' + idx + '" title="減少">−</button></span>';
    }).join("");

    return '<div class="hs-row" style="margin-bottom:10px">' +
      '<label class="hs-field">骨釘種類<select data-bind="sp-series">' + seriesSel + "</select></label>" +
      '<label class="hs-field">骨釘盒批號<select data-bind="sp-lot">' + lotSel + "</select></label></div>" +
      '<div class="hs-tray"><div class="hs-tray-head"><b>' + esc(se.series) + ' 骨釘盒</b><span>點長度加入使用（再點一次再加 1 支）</span></div>' +
      '<div class="hs-tray-grid">' + cells + "</div></div>" +
      '<div class="hs-chips">' + (chips || '<span class="hs-muted">尚未選用骨釘</span>') + "</div>";
  }

  function reportFormHtml() {
    var hospitals = S.locations.filter(function (l) { return l.type === "hospital"; });
    var docs = {};
    S.reports.forEach(function (r) { docs[r.doctor] = 1; });
    var rows = D.main.map(mainRowHtml).join("");
    return '<form class="hs-card" data-form="report"><h2>新增報刀</h2><div class="hs-grid">' +
      '<label class="hs-field">日期<input type="date" data-bind="date" value="' + esc(D.date) + '"></label>' +
      '<label class="hs-field">醫院<select data-bind="hospital">' + options(hospitals.map(function (h) { return { v: h.id, t: h.name }; }), D.hospital) + "</select></label>" +
      '<label class="hs-field">醫師<input data-bind="doctor" list="doctors" value="' + esc(D.doctor) + '" placeholder="輸入或選擇"></label>' +
      '<label class="hs-field">扣庫來源<select data-bind="loc">' + locOptions(S.locations, D.loc) + "</select></label>" +
      '<label class="hs-field hs-field-wide">備註<input data-bind="note" value="' + esc(D.note) + '" placeholder="例如 補貨：備貨1"></label></div>' +
      '<datalist id="doctors">' + Object.keys(docs).map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>" +
      "<h4>骨板／主品項</h4>" + (rows || '<div class="hs-muted" style="margin-bottom:8px">尚未新增品項</div>') +
      '<button type="button" class="hs-btn hs-btn-sm" data-act="add-main">＋ 新增品項</button>' +
      "<h4>骨釘</h4>" + screwPickerHtml() +
      '<div style="margin-top:18px"><button type="submit" class="hs-btn hs-btn-primary">送出報刀</button></div></form>';
  }

  function reportCardHtml(r) {
    var items = L.reportItems(r).map(function (it) {
      var p = L.product(S, it.sku);
      return "<li>" + (p && p.kind === "screw" ? "骨釘" : "骨板") + " " + esc(it.sku) + "　" + esc(pName(it.sku)) + " ×" + it.qty +
        '　<span class="hs-muted">批號 ' + esc(it.lot) + "</span>" + (it.scrap ? ' <span class="hs-badge scrap">報廢</span>' : "") + "</li>";
    }).join("");
    var act = "";
    if (r.status === "pending") {
      act = '<div class="hs-actions"><button class="hs-btn hs-btn-sm hs-btn-primary" data-act="approve" data-id="' + r.id + '"' + (office() ? "" : ' disabled title="只有內勤或管理員可審核"') + ">審核通過並扣庫</button>" +
        '<button class="hs-btn hs-btn-sm hs-btn-danger" data-act="reject" data-id="' + r.id + '"' + (office() ? "" : " disabled") + ">退回</button></div>";
    }
    return '<div class="hs-report"><div class="hs-report-head"><b>' + esc(r.date) + "</b><span>" + esc(L.locName(S, r.hospital)) + "</span><span>" + esc(r.doctor) + "</span>" +
      '<span class="hs-badge ' + r.status + '">' + L.STATUS[r.status] + '</span><span class="hs-muted">扣庫：' + esc(L.locName(S, r.loc)) + "</span>" + act + "</div>" +
      "<ul>" + items + "</ul>" +
      '<div class="meta">送出：' + esc(r.createdBy) + " " + esc(r.createdAt) + (r.reviewedBy ? "｜審核：" + esc(r.reviewedBy) + " " + esc(r.reviewedAt) : "") + (r.note ? "｜備註：" + esc(r.note) : "") + "</div></div>";
  }

  function renderReport() {
    var list = S.reports.filter(function (r) { return repFilter === "all" || r.status === repFilter; });
    var seg = [["all", "全部"], ["pending", "待審核"], ["approved", "已審核"], ["rejected", "退回"]].map(function (x) {
      return '<button data-act="rep-filter" data-v="' + x[0] + '" aria-pressed="' + (repFilter === x[0]) + '">' + x[1] + "</button>";
    }).join("");
    return reportFormHtml() +
      '<div class="hs-card"><div class="hs-row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">報刀紀錄</h2>' +
      '<div class="hs-row"><div class="hs-seg">' + seg + '</div><button class="hs-btn hs-btn-sm" data-act="export-csv">匯出 CSV（給正航）</button></div></div>' +
      (list.map(reportCardHtml).join("") || '<div class="hs-empty">沒有資料</div>') + "</div>";
  }

  // ---------------- 庫存 ----------------
  function stockValue(loc) {
    var v = 0;
    S.lots.forEach(function (l) {
      if (loc !== null && l.loc !== loc) return;
      var p = L.product(S, l.sku);
      if (p) v += l.qty * p.price;
    });
    return v;
  }

  function renderStock() {
    var warn = 0, exp = 0, alerts = [];
    S.lots.forEach(function (l) {
      if (l.qty <= 0) return;
      var d = L.expDays(l.exp);
      if (d < 0) { exp++; alerts.push(l); } else if (d <= 90) { warn++; alerts.push(l); }
    });
    alerts.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });

    var stats = '<div class="hs-stats"><div class="hs-stat"><small>庫存總金額</small><b>' + money(stockValue(null)) + "</b></div>" +
      '<div class="hs-stat"><small>90 天內到期（批號列）</small><b>' + warn + "</b></div>" +
      '<div class="hs-stat"><small>已過期仍有庫存（批號列）</small><b style="color:#d64545">' + exp + "</b></div></div>";

    var alertHtml = alerts.length ? '<div class="hs-card"><h3>效期警示</h3><div class="hs-table-wrap" style="max-height:220px"><table class="hs-table"><thead><tr><th>庫位</th><th>型號</th><th>品名</th><th>批號</th><th>效期</th><th class="num">數量</th></tr></thead><tbody>' +
      alerts.slice(0, 40).map(function (l) {
        return "<tr><td>" + esc(L.locName(S, l.loc)) + "</td><td>" + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + "</td><td>" + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num">' + l.qty + "</td></tr>";
      }).join("") + "</tbody></table></div></div>" : "";

    var bar = '<div class="hs-row" style="justify-content:space-between;margin-bottom:12px"><div class="hs-seg">' +
      '<button data-act="stock-view" data-v="plates" aria-pressed="' + (stockView === "plates") + '">骨板庫存</button>' +
      '<button data-act="stock-view" data-v="boxes" aria-pressed="' + (stockView === "boxes") + '">骨釘盒</button></div>' +
      '<div class="hs-row"><button class="hs-btn hs-btn-sm" data-act="open-inbound"' + (office() ? "" : ' disabled title="只有內勤或管理員可操作"') + ">＋ 入庫</button>" +
      '<button class="hs-btn hs-btn-sm" data-act="open-transfer"' + (office() ? "" : " disabled") + ">調撥</button></div></div>";

    return stats + alertHtml + '<div class="hs-card">' + bar + (stockView === "plates" ? platesMatrix() : boxesView()) + "</div>";
  }

  function platesMatrix() {
    var locs = S.locations;
    var head = "<tr><th class=\"sticky\">型號</th><th>品名</th><th class=\"num\">單價</th>" +
      locs.map(function (l) { return '<th class="num" title="' + esc(TYPE[l.type]) + '">' + esc(l.name) + "</th>"; }).join("") +
      '<th class="num">合計</th><th class="num">金額</th></tr>';
    var body = "", lastGroup = null, colspan = 3 + locs.length + 2;
    L.plates(S).forEach(function (p) {
      if (p.group !== lastGroup) { body += '<tr class="group"><td colspan="' + colspan + '">' + esc(p.group) + "</td></tr>"; lastGroup = p.group; }
      var total = L.totalQty(S, null, p.sku);
      body += '<tr><td class="sticky">' + esc(p.sku) + "</td><td>" + esc(p.name) + '</td><td class="num">' + money(p.price) + "</td>" +
        locs.map(function (l) {
          var q = L.totalQty(S, l.id, p.sku);
          return '<td class="num"><button class="hs-qty' + (q ? " has" : "") + '" data-act="open-lot" data-loc="' + esc(l.id) + '" data-sku="' + esc(p.sku) + '">' + (q || "·") + "</button></td>";
        }).join("") + '<td class="num"><b>' + total + '</b></td><td class="num">' + money(total * p.price) + "</td></tr>";
    });
    var foot = '<tr><td class="sticky"><b>庫位金額</b></td><td></td><td></td>' +
      locs.map(function (l) { return '<td class="num"><b>' + money(stockValue(l.id)).replace("NT$", "") + "</b></td>"; }).join("") +
      '<td></td><td class="num"><b>' + money(stockValue(null)) + "</b></td></tr>";
    return '<div class="hs-table-wrap"><table class="hs-table"><thead>' + head + "</thead><tbody>" + body + "</tbody><tfoot>" + foot + "</tfoot></table></div>" +
      '<p class="hs-muted">點任一格查看該庫位的批號與效期。金額只含骨板；表尾「庫位金額」含骨釘。</p>';
  }

  function boxesView() {
    if (!L.location(S, boxLoc)) boxLoc = S.locations[0].id;
    var out = '<div class="hs-row" style="margin-bottom:12px"><label class="hs-field">庫位<select data-bind="box-loc">' + locOptions(S.locations, boxLoc) + "</select></label></div>";
    var trays = "";
    L.screwSeries(S).forEach(function (se) {
      var lotExp = {}, lots = [];
      se.lens.forEach(function (len) {
        S.lots.forEach(function (l) {
          if (l.loc === boxLoc && l.sku === se.sku[len] && !lotExp[l.lot]) { lotExp[l.lot] = l.exp; lots.push(l.lot); }
        });
      });
      lots.forEach(function (lot) {
        var sum = 0;
        var cells = se.lens.map(function (len) {
          var sku = se.sku[len], q = L.lineQty(S, boxLoc, sku, lot);
          sum += q;
          var dis = office() ? "" : " disabled";
          return '<div class="hs-cell static' + (q > 0 && q <= 2 ? " low" : "") + '"><span class="len">' + len + "<small> mm</small></span><span class=\"qty\">" + q + " 支</span>" +
            '<span class="adj"><button data-act="box-adj" data-sku="' + esc(sku) + '" data-lot="' + esc(lot) + '" data-exp="' + esc(lotExp[lot]) + '" data-d="-1"' + (q ? dis : " disabled") + ">−</button>" +
            '<button data-act="box-adj" data-sku="' + esc(sku) + '" data-lot="' + esc(lot) + '" data-exp="' + esc(lotExp[lot]) + '" data-d="1"' + dis + ">＋</button></span></div>";
        }).join("");
        trays += '<div class="hs-tray"><div class="hs-tray-head"><b>' + esc(se.series) + " 骨釘盒</b><span>批號 " + esc(lot) + "｜效期 " + esc(lotExp[lot]) + " " + expBadge(lotExp[lot]) + "｜共 " + sum + " 支</span></div>" +
          '<div class="hs-tray-grid">' + cells + "</div></div>";
      });
    });
    return out + (trays ? '<div class="hs-trays">' + trays + "</div>" : '<div class="hs-empty">這個庫位沒有骨釘庫存。</div>') +
      '<p class="hs-muted">每個盒子是一個批號，格子是各長度的剩餘支數。用 −／＋ 做盤點調整，會寫入操作紀錄。</p>';
  }

  // ---------------- 批號追溯 ----------------
  function traceResultsHtml() {
    var t = L.trace(S, traceQ);
    if (!t) return '<div class="hs-empty">輸入批號或型號，查它現在在哪、用在哪家醫院哪位醫師。</div>';
    var stock = t.stock.length ? '<div class="hs-table-wrap"><table class="hs-table"><thead><tr><th>庫位</th><th>型號</th><th>品名</th><th>批號</th><th>效期</th><th class="num">數量</th></tr></thead><tbody>' +
      t.stock.map(function (l) {
        return "<tr><td>" + esc(L.locName(S, l.loc)) + "</td><td>" + esc(l.sku) + "</td><td>" + esc(pName(l.sku)) + "</td><td>" + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num">' + l.qty + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="hs-empty">目前沒有庫存</div>';
    var used = t.used.length ? '<div class="hs-table-wrap"><table class="hs-table"><thead><tr><th>日期</th><th>醫院</th><th>醫師</th><th>型號</th><th>批號</th><th class="num">數量</th><th>狀態</th></tr></thead><tbody>' +
      t.used.map(function (u) {
        return "<tr><td>" + esc(u.r.date) + "</td><td>" + esc(L.locName(S, u.r.hospital)) + "</td><td>" + esc(u.r.doctor) + "</td><td>" + esc(u.it.sku) + "</td><td>" + esc(u.it.lot) + '</td><td class="num">' + u.it.qty +
          '</td><td><span class="hs-badge ' + u.r.status + '">' + L.STATUS[u.r.status] + "</span>" + (u.it.scrap ? ' <span class="hs-badge scrap">報廢</span>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="hs-empty">沒有使用紀錄</div>';
    return '<h4>目前庫存位置</h4>' + stock + "<h4>使用紀錄（召回時要通知的醫院與醫師）</h4>" + used +
      "<h4>相關操作紀錄</h4>" + auditTable(t.logs.slice(0, 50));
  }
  function auditTable(rows) {
    if (!rows.length) return '<div class="hs-empty">沒有紀錄</div>';
    return '<div class="hs-table-wrap" style="max-height:320px"><table class="hs-table"><thead><tr><th>時間</th><th>人員</th><th>動作</th><th>內容</th></tr></thead><tbody>' +
      rows.map(function (e) { return "<tr><td>" + esc(e.ts) + "</td><td>" + esc(e.user) + "</td><td>" + esc(e.action) + "</td><td>" + esc(e.detail) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function renderTrace() {
    return '<div class="hs-card"><h2>批號追溯</h2><label class="hs-field" style="max-width:420px">批號或型號<input id="traceInput" value="' + esc(traceQ) + '" placeholder="例如 2402270013"></label>' +
      '<div id="traceResults">' + traceResultsHtml() + "</div></div>" +
      '<div class="hs-card"><h3>操作紀錄（只增不改，最近 100 筆）</h3>' + auditTable(S.log.slice(0, 100)) + "</div>";
  }

  // ---------------- 設定 ----------------
  function renderSettings() {
    var ok = office();
    var locRows = S.locations.map(function (l) {
      var qty = 0;
      S.lots.forEach(function (x) { if (x.loc === l.id) qty += x.qty; });
      return '<tr><td><input class="hs-cellinput" data-act="loc-rename" data-id="' + esc(l.id) + '" value="' + esc(l.name) + '"' + (ok ? "" : " disabled") + "></td><td>" + TYPE[l.type] + '</td><td class="num">' + qty + "</td>" +
        '<td><button class="hs-btn hs-btn-sm hs-btn-danger" data-act="del-loc" data-id="' + esc(l.id) + '"' + (ok && qty === 0 && l.type !== "company" ? "" : ' disabled title="庫位還有庫存或是公司倉，不能刪除"') + ">刪除</button></td></tr>";
    }).join("");
    var groups = {};
    L.plates(S).forEach(function (p) { groups[p.group] = 1; });
    return (ok ? "" : '<div class="hs-card hs-muted">目前身分是「' + esc(S.operator) + "」，設定只能檢視。切到內勤或管理員才能修改。</div>") +
      '<div class="hs-card"><h2>庫位管理</h2><p class="hs-muted">醫院寄庫、業務的移動庫存都在這裡設定，新增後報刀和庫存頁會自動出現這個庫位。</p>' +
      '<div class="hs-table-wrap"><table class="hs-table"><thead><tr><th>名稱</th><th>類型</th><th class="num">庫存支數</th><th></th></tr></thead><tbody>' + locRows + "</tbody></table></div>" +
      '<form data-form="addloc" class="hs-row" style="margin-top:14px"><label class="hs-field">新庫位名稱<input name="name" required></label>' +
      '<label class="hs-field">類型<select name="type"><option value="hospital">醫院寄庫</option><option value="rep">業務移動庫存</option></select></label>' +
      '<button class="hs-btn hs-btn-primary"' + (ok ? "" : " disabled") + ">新增庫位</button></form></div>" +
      '<div class="hs-card"><h2>新增骨板品項</h2><form data-form="addproduct" class="hs-grid">' +
      '<label class="hs-field">型號<input name="sku" required></label><label class="hs-field">品名<input name="name" required></label>' +
      '<label class="hs-field">單價<input name="price" type="number" min="0" required></label>' +
      '<label class="hs-field">分類<input name="group" list="groups" required></label><datalist id="groups">' + Object.keys(groups).map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
      '<div class="hs-field">&nbsp;<button class="hs-btn hs-btn-primary"' + (ok ? "" : " disabled") + ">新增品項</button></div></form></div>" +
      '<div class="hs-card"><h2>權限</h2><div class="hs-table-wrap"><table class="hs-table"><thead><tr><th>動作</th><th>業務</th><th>內勤</th><th>管理員</th></tr></thead><tbody>' +
      "<tr><td>送出報刀</td><td>✔</td><td>✔</td><td>✔</td></tr><tr><td>審核報刀（扣庫）</td><td>—</td><td>✔</td><td>✔</td></tr>" +
      "<tr><td>入庫／調撥／盤點</td><td>—</td><td>✔</td><td>✔</td></tr><tr><td>庫位與品項設定</td><td>—</td><td>✔</td><td>✔</td></tr>" +
      "<tr><td>查看紀錄與追溯</td><td>✔</td><td>✔</td><td>✔</td></tr></tbody></table></div>" +
      '<p class="hs-muted">所有動作都會寫進操作紀錄，且畫面上沒有任何刪除或修改紀錄的功能。</p></div>' +
      '<div class="hs-card"><h2>示範資料</h2><button class="hs-btn hs-btn-danger" data-act="reset-demo">重設為初始示範資料</button></div>';
  }

  // ---------------- dialogs ----------------
  function openDialog(title, fn) {
    refreshDlg = function () { dlg.innerHTML = '<div class="hs-dlg"><div class="hs-dlg-head"><h3>' + esc(title) + '</h3><button data-close aria-label="關閉">×</button></div>' + fn() + "</div>"; };
    refreshDlg();
    if (!dlg.open) dlg.showModal();
  }
  function closeDialog() { refreshDlg = null; if (dlg.open) dlg.close(); }

  function openLot(loc, sku) {
    openDialog(sku + " " + pName(sku) + " @ " + L.locName(S, loc), function () {
      var ls = L.lines(S, loc, sku);
      var rows = ls.map(function (l) {
        return "<tr><td>" + esc(l.lot) + "</td><td>" + esc(l.exp) + " " + expBadge(l.exp) + '</td><td class="num"><input class="hs-cellinput" type="number" min="0" style="width:80px" value="' + l.qty + '" data-act="lot-adj" data-loc="' + esc(loc) + '" data-sku="' + esc(sku) + '" data-lot="' + esc(l.lot) + '"' + (office() ? "" : " disabled") + "></td>" +
          '<td><button class="hs-btn hs-btn-sm" data-act="open-transfer" data-from="' + esc(loc) + '" data-sku="' + esc(sku) + '" data-lot="' + esc(l.lot) + '"' + (office() && !L.isExpired(l.exp) ? "" : " disabled") + ">調撥</button></td></tr>";
      }).join("");
      return (ls.length ? '<div class="hs-table-wrap"><table class="hs-table"><thead><tr><th>批號</th><th>效期</th><th class="num">數量（可盤點修改）</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<div class="hs-empty">這個庫位沒有這個品項。</div>') +
        '<div style="margin-top:12px"><button class="hs-btn hs-btn-sm" data-act="open-inbound" data-loc="' + esc(loc) + '" data-sku="' + esc(sku) + '"' + (office() ? "" : " disabled") + ">＋ 入庫到這個庫位</button></div>";
    });
  }

  function openInbound(loc, sku) {
    openDialog("入庫", function () {
      var groups = {}, order = [];
      S.products.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
      var skuOpts = order.map(function (g) {
        return '<optgroup label="' + esc(g) + '">' + options(groups[g].map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), sku) + "</optgroup>";
      }).join("");
      return '<form data-form="inbound" class="hs-grid"><label class="hs-field">品項<select name="sku">' + skuOpts + "</select></label>" +
        '<label class="hs-field">入庫到<select name="loc">' + locOptions(S.locations, loc || "co") + "</select></label>" +
        '<label class="hs-field">批號<input name="lot" required></label><label class="hs-field">效期<input name="exp" type="date" required value="' + L.addDays(540) + '"></label>' +
        '<label class="hs-field">數量<input name="qty" type="number" min="1" step="1" value="1" required></label>' +
        '<div class="hs-field">&nbsp;<button class="hs-btn hs-btn-primary">確認入庫</button></div></form>';
    });
  }

  function openTransfer(pre) {
    var locsWithStock = S.locations.filter(function (l) { return S.lots.some(function (x) { return x.loc === l.id && x.qty > 0 && !L.isExpired(x.exp); }); });
    TR = { from: (pre && pre.from) || (locsWithStock[0] && locsWithStock[0].id) || "co", sku: (pre && pre.sku) || "", lot: (pre && pre.lot) || "", qty: 1, to: "" };
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
    return '<form data-form="transfer" class="hs-grid"><label class="hs-field">從<select data-bind="tr-from">' + locOptions(S.locations, TR.from) + "</select></label>" +
      '<label class="hs-field">品項<select data-bind="tr-sku">' + (options(skus.map(function (p) { return { v: p.sku, t: p.sku + "　" + p.name }; }), TR.sku) || "<option>沒有可調撥庫存</option>") + "</select></label>" +
      '<label class="hs-field">批號<select data-bind="tr-lot">' + options(ls.map(function (l) { return { v: l.lot, t: l.lot + "｜效期 " + l.exp + "｜剩 " + l.qty }; }), TR.lot) + "</select></label>" +
      '<label class="hs-field">數量<input type="number" min="1" step="1" max="' + (line ? line.qty : 1) + '" value="' + TR.qty + '" data-bind="tr-qty"></label>' +
      '<label class="hs-field">到<select data-bind="tr-to">' + locOptions(dests, TR.to) + "</select></label>" +
      '<div class="hs-field">&nbsp;<button class="hs-btn hs-btn-primary">確認調撥</button></div></form>' +
      '<p class="hs-muted">已過期的批號不能調撥。</p>';
  }

  // ---------------- render ----------------
  function render() {
    var sel = document.getElementById("operator");
    sel.innerHTML = options(L.OPERATORS.map(function (o) { return { v: o, t: o }; }), S.operator);
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab ? "true" : "false");
    });
    var html = tab === "report" ? renderReport() : tab === "stock" ? renderStock() : tab === "trace" ? renderTrace() : renderSettings();
    var y = window.scrollY;
    view.innerHTML = html;
    window.scrollTo(0, y);
    if (dlg.open && refreshDlg) refreshDlg();
  }

  // ---------------- events ----------------
  document.getElementById("operator").addEventListener("change", function (e) {
    S.operator = e.target.value; persist(); render();
  });
  document.getElementById("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (b) { tab = b.getAttribute("data-tab"); render(); }
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-close]")) closeDialog(); });
  dlg.addEventListener("close", function () { refreshDlg = null; });

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    var a = el.getAttribute("data-act"), g = function (k) { return el.getAttribute("data-" + k); };

    if (a === "add-main") {
      var first = L.plates(S).filter(function (p) { return usableLines(D.loc, p.sku).length; })[0];
      if (!first) return toast("這個扣庫來源沒有可用的骨板庫存", true);
      D.main.push({ sku: first.sku, lot: usableLines(D.loc, first.sku)[0].lot, qty: 1, scrap: false });
      render();
    } else if (a === "rm-main") { D.main.splice(+g("i"), 1); render(); }
    else if (a === "pick-screw") {
      var ex = D.screws.filter(function (s) { return s.sku === g("sku") && s.lot === D.sp.lot && !s.scrap; })[0];
      if (ex) ex.qty++; else D.screws.push({ sku: g("sku"), lot: D.sp.lot, qty: 1, scrap: false });
      render();
    } else if (a === "scrap-one") {
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
    else if (a === "box-adj") {
      var sku = g("sku"), lot = g("lot"), d = +g("d"), loc = boxLoc;
      run(function () {
        var line = L.findLine(S, loc, sku, lot);
        if (line) L.adjustStock(S, loc, sku, lot, Math.max(0, line.qty + d));
        else if (d > 0) L.addStock(S, loc, sku, lot, g("exp"), 1, "盤點調整");
      });
    } else if (a === "del-loc") {
      var id = g("id");
      if (window.confirm("確定刪除這個庫位？")) run(function () {
        L.log(S, "刪除庫位", L.locName(S, id));
        S.locations = S.locations.filter(function (l) { return l.id !== id; });
        S.lots = S.lots.filter(function (x) { return x.loc !== id; });
        if (!L.location(S, D.hospital)) D = newDraft();
      }, "已刪除");
    } else if (a === "reset-demo") {
      if (window.confirm("所有操作會被清掉，回到初始示範資料。確定？")) { S = L.reset(); D = newDraft(); closeDialog(); persist(); render(); toast("已重設"); }
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind"), act = t.getAttribute && t.getAttribute("data-act");
    if (act === "loc-rename") {
      var loc = L.location(S, t.getAttribute("data-id")), nm = t.value.trim();
      if (loc && nm && nm !== loc.name) run(function () { L.log(S, "庫位改名", loc.name + " → " + nm); loc.name = nm; }, "已更新");
      return;
    }
    if (act === "lot-adj") {
      run(function () { L.adjustStock(S, t.getAttribute("data-loc"), t.getAttribute("data-sku"), t.getAttribute("data-lot"), Math.floor(Number(t.value))); }, "已盤點調整");
      return;
    }
    if (!b) return;
    var i = +t.getAttribute("data-i");
    if (b === "hospital") { D.hospital = t.value; D.loc = t.value; D.main = []; D.screws = []; D.sp = { series: "", lot: "" }; render(); }
    else if (b === "loc") { D.loc = t.value; D.main = []; D.screws = []; D.sp = { series: "", lot: "" }; render(); }
    else if (b === "main-sku") { var ln = usableLines(D.loc, t.value)[0]; D.main[i] = { sku: t.value, lot: ln ? ln.lot : "", qty: 1, scrap: D.main[i].scrap }; render(); }
    else if (b === "main-lot") { D.main[i].lot = t.value; render(); }
    else if (b === "main-qty") { D.main[i].qty = Math.max(1, Math.floor(Number(t.value)) || 1); render(); }
    else if (b === "main-scrap") { D.main[i].scrap = t.checked; }
    else if (b === "sp-series") { D.sp.series = t.value; D.sp.lot = ""; render(); }
    else if (b === "sp-lot") { D.sp.lot = t.value; render(); }
    else if (b === "box-loc") { boxLoc = t.value; render(); }
    else if (b === "date") D.date = t.value;
    else if (b.indexOf("tr-") === 0) {
      var k = b.slice(3);
      TR[k] = k === "qty" ? Math.max(1, Math.floor(Number(t.value)) || 1) : t.value;
      if (k === "from") { TR.sku = ""; TR.lot = ""; }
      if (k === "sku") TR.lot = "";
      if (refreshDlg) refreshDlg();
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target, b = t.getAttribute && t.getAttribute("data-bind");
    if (b === "doctor") D.doctor = t.value;
    else if (b === "note") D.note = t.value;
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
    } else if (f === "inbound") {
      if (run(function () { L.addStock(S, v("loc"), v("sku"), v("lot").trim(), v("exp"), Math.floor(Number(v("qty")))); }, "已入庫")) closeDialog();
    } else if (f === "transfer") {
      if (run(function () { L.transfer(S, TR.from, TR.to, TR.sku, TR.lot, TR.qty); }, "已調撥")) closeDialog();
    } else if (f === "addloc") {
      run(function () {
        if (!office()) throw new Error("只有內勤或管理員可以設定");
        var name = v("name").trim();
        if (S.locations.some(function (l) { return l.name === name; })) throw new Error("已有同名庫位");
        var id = "x" + Date.now().toString(36);
        S.locations.push({ id: id, name: name, type: v("type") });
        L.log(S, "新增庫位", name + "（" + TYPE[v("type")] + "）");
        e.target.reset();
      }, "已新增庫位");
    } else if (f === "addproduct") {
      run(function () {
        if (!office()) throw new Error("只有內勤或管理員可以設定");
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
