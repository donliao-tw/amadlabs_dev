(function () {
  "use strict";

  const API_ENDPOINT = "/api/iea/analyze";
  const MAX_SIZE_BYTES = 15 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm"];

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const statusMsg = document.getElementById("statusMsg");
  const resultSection = document.getElementById("resultSection");

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    if (e.target !== browseBtn) fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  function setStatus(message, kind) {
    statusMsg.textContent = message;
    statusMsg.hidden = !message;
    statusMsg.className = "iea-status" + (kind ? " is-" + kind : "");
  }

  function hasAllowedExtension(filename) {
    const lower = filename.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function handleFile(file) {
    resultSection.hidden = true;

    if (!hasAllowedExtension(file.name)) {
      setStatus("只支援 .xlsx 或 .xlsm 檔案。", "error");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus("檔案超過 15 MB 上限。", "error");
      return;
    }

    setStatus("分析中…", "loading");

    const formData = new FormData();
    formData.append("file", file);

    fetch(API_ENDPOINT, { method: "POST", body: formData })
      .then(async (resp) => {
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          const message = (data && data.detail) || "分析失敗，請確認檔案格式是否正確。";
          throw new Error(message);
        }
        return data;
      })
      .then((overview) => {
        setStatus("", null);
        renderResult(overview);
      })
      .catch((err) => {
        setStatus(err.message || "分析失敗，請稍後再試。", "error");
      });
  }

  function renderResult(overview) {
    document.getElementById("resultFilename").textContent = overview.filename;
    document.getElementById("resultFileType").textContent = "." + overview.file_type;

    document.getElementById("statSheets").textContent = overview.sheet_count;
    document.getElementById("statFormulas").textContent = overview.total_formula_count;
    document.getElementById("statHidden").textContent = overview.hidden_sheet_count;
    document.getElementById("statNamedRanges").textContent = overview.named_range_count;
    document.getElementById("statVba").textContent = overview.vba_detected ? "偵測到" : "無";

    const tbody = document.getElementById("sheetsTableBody");
    tbody.innerHTML = "";
    overview.sheets.forEach((sheet) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = sheet.name;
      tr.appendChild(nameTd);

      const stateTd = document.createElement("td");
      if (sheet.hidden) {
        stateTd.textContent = "隱藏";
        stateTd.className = "iea-tag-hidden";
      } else {
        stateTd.textContent = "可見";
      }
      tr.appendChild(stateTd);

      const rowsTd = document.createElement("td");
      rowsTd.textContent = sheet.row_count;
      tr.appendChild(rowsTd);

      const colsTd = document.createElement("td");
      colsTd.textContent = sheet.column_count;
      tr.appendChild(colsTd);

      const formulaTd = document.createElement("td");
      formulaTd.textContent = sheet.row_count_truncated ? "未掃描" : sheet.formula_count;
      tr.appendChild(formulaTd);

      const colNamesTd = document.createElement("td");
      colNamesTd.className = "iea-col-names";
      colNamesTd.textContent = sheet.column_names.filter(Boolean).join(", ") || "—";
      tr.appendChild(colNamesTd);

      tbody.appendChild(tr);
    });

    const namedRangesBlock = document.getElementById("namedRangesBlock");
    const namedRangesList = document.getElementById("namedRangesList");
    namedRangesList.innerHTML = "";
    if (overview.named_range_names && overview.named_range_names.length > 0) {
      overview.named_range_names.forEach((name) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = name;
        li.appendChild(code);
        namedRangesList.appendChild(li);
      });
      namedRangesBlock.hidden = false;
    } else {
      namedRangesBlock.hidden = true;
    }

    const warningsBlock = document.getElementById("warningsBlock");
    const warningsList = document.getElementById("warningsList");
    warningsList.innerHTML = "";
    if (overview.warnings && overview.warnings.length > 0) {
      overview.warnings.forEach((w) => {
        const li = document.createElement("li");
        li.textContent = w;
        warningsList.appendChild(li);
      });
      warningsBlock.hidden = false;
    } else {
      warningsBlock.hidden = true;
    }

    resultSection.hidden = false;
  }
})();
