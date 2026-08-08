/**
 * Site content — the downloads editor
 *
 * One row per downloadable file attached to an item, and the guidance shown
 * beside each one.
 *
 * The rules come from what actually works from Iran: video always goes to
 * Aparat rather than this server, a file under 10 MB is fine on your own
 * hosting, and anything above 50 MB belongs on Iranian cloud storage such as
 * Arvan or Liara. Google Drive and Dropbox are unreachable from Iran, so
 * "your own host" is always the first option offered.
 *
 * Split out of scripts/admin-content.js, which had grown to 1,784 lines.
 * Every classic <script> shares one global scope, so these four files see
 * each other exactly as one file would. Nothing here runs while the file is
 * being parsed except the boot hook at the end of content-table.js, which is
 * why that file loads last.
 */

function addContentBlock(type) {
  if (type === "heading") {
    contentEditorState.blocks.push({ type: "heading", level: 2, text: "" });
  } else if (type === "paragraph") {
    contentEditorState.blocks.push({ type: "paragraph", text: "" });
  } else if (type === "list" || type === "ordered-list") {
    contentEditorState.blocks.push({ type: type, items: [""] });
  } else if (type === "quote") {
    contentEditorState.blocks.push({ type: "quote", text: "", cite: "" });
  } else if (type === "link") {
    contentEditorState.blocks.push({
      type: "link",
      text: "",
      url: "",
      target: "_blank",
    });
  } else if (type === "image") {
    contentEditorState.blocks.push({
      type: "image",
      src: "",
      alt: "",
      caption: "",
    });
  } else if (type === "divider") {
    contentEditorState.blocks.push({ type: "divider" });
  } else if (type === "html") {
    contentEditorState.blocks.push({ type: "html", html: "" });
  }

  renderBlocksEditor();
}

function renderDownloadsEditor() {
  const container = document.getElementById("contentDownloadsEditor");
  if (!container) {
    return;
  }

  if (!contentEditorState.downloads.length) {
    container.innerHTML =
      '<p class="content-editor_empty">فایل دانلودی ثبت نشده.</p>';
    return;
  }

  container.innerHTML = contentEditorState.downloads
    .map(function (file, index) {
      return (
        '<div class="content-download-row" data-download-index="' +
        index +
        '">' +
        '  <div class="download-row__head">' +
        "    <strong>فایل " +
        toPersianDigitsSafe(index + 1) +
        "</strong>" +
        '    <button type="button" class="btn-secondary download-delete" data-index="' +
        index +
        '">حذف</button>' +
        "  </div>" +
        '  <div class="download-row__grid">' +
        '    <label class="download-field">' +
        "      <span>عنوان فایل</span>" +
        '      <input type="text" class="form-control download-title" placeholder="مثلاً: جزوه فصل اول" value="' +
        escapeAttr(file.title) +
        '">' +
        "    </label>" +
        '    <label class="download-field">' +
        "      <span>نوع فایل</span>" +
        '      <select class="form-control download-type">' +
        buildDownloadTypeOptions(file.type) +
        "      </select>" +
        "    </label>" +
        "  </div>" +
        // Where the file lives - the same three choices as the products form,
        // with upload disabled until there is a server to receive it.
        '  <div class="download-source">' +
        '    <label class="download-source__option">' +
        '      <input type="radio" name="dlSource-' +
        index +
        '" value="host" ' +
        (isRemoteUrl(file.url) ? "" : "checked") +
        ">" +
        '      <span><i class="fas fa-server"></i> فایل روی هاست خودتان</span>' +
        "    </label>" +
        '    <label class="download-source__option">' +
        '      <input type="radio" name="dlSource-' +
        index +
        '" value="link" ' +
        (isRemoteUrl(file.url) ? "checked" : "") +
        ">" +
        '      <span><i class="fas fa-link"></i> لینک از فضای ابری</span>' +
        "    </label>" +
        '    <label class="download-source__option download-source__option--off">' +
        '      <input type="radio" name="dlSource-' +
        index +
        '" value="upload" disabled>' +
        '      <span><i class="fas fa-cloud-arrow-up"></i> آپلود از دستگاه — نیازمند سرور</span>' +
        "    </label>" +
        "  </div>" +
        '  <div class="download-field">' +
        "    <span>آدرس فایل</span>" +
        '    <div class="url-field">' +
        '      <input type="text" class="form-control download-url" dir="ltr" placeholder="../files/course-101.pdf" value="' +
        escapeAttr(file.url) +
        '">' +
        '      <button type="button" class="btn-secondary url-check-btn download-check" data-index="' +
        index +
        '"><i class="fas fa-circle-check"></i> بررسی</button>' +
        "    </div>" +
        '    <small class="field-hint download-hint" data-index="' +
        index +
        '">' +
        "فایل را در پوشه <code>files</code> هاست آپلود کنید و آدرس آن را اینجا بنویسید." +
        "    </small>" +
        '    <div class="url-notice" data-notice="' +
        index +
        '" hidden></div>' +
        "  </div>" +
        '  <div class="download-field download-field--narrow">' +
        "    <span>حجم فایل (اختیاری)</span>" +
        '    <input type="text" class="form-control download-size" placeholder="مثال: ۱۲ مگابایت" value="' +
        escapeAttr(file.size) +
        '">' +
        "  </div>" +
        "</div>"
      );
    })
    .join("");

  bindDownloadRowEvents(container);
}

/** Persian digits without depending on admin.js load order. */
function toPersianDigitsSafe(value) {
  if (typeof toPersianDigits === "function") return toPersianDigits(value);
  return String(value);
}

/** True when the address points at another host rather than this site. */
function isRemoteUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function bindDownloadRowEvents(container) {
  container.querySelectorAll(".download-delete").forEach(function (button) {
    button.addEventListener("click", function () {
      contentEditorState.downloads.splice(
        Number(button.getAttribute("data-index")),
        1,
      );
      renderDownloadsEditor();
    });
  });

  // Swap the hint and placeholder when the source changes, so the operator is
  // told what to paste rather than facing an empty box.
  container
    .querySelectorAll(".download-source input[type=radio]")
    .forEach(function (radio) {
      radio.addEventListener("change", function () {
        const row = radio.closest(".content-download-row");
        const index = row.getAttribute("data-download-index");
        const input = row.querySelector(".download-url");
        const hint = row.querySelector(".download-hint");
        if (!input || !hint) return;

        if (radio.value === "link") {
          hint.innerHTML =
            "لینک مستقیم از فضای ابری (آروان، لیارا) یا هر میزبان دیگر.";
          input.placeholder = "https://storage.example.ir/files/course.pdf";
        } else {
          hint.innerHTML =
            "فایل را در پوشه <code>files</code> هاست آپلود کنید و آدرس آن را اینجا بنویسید.";
          input.placeholder = "../files/course-101.pdf";
        }
      });
    });

  // Live advice while typing, mirroring the products form.
  container.querySelectorAll(".download-url").forEach(function (input) {
    const row = input.closest(".content-download-row");
    const index = row.getAttribute("data-download-index");
    const notice = row.querySelector('[data-notice="' + index + '"]');

    const refresh = function () {
      if (typeof fileSourceAdvice !== "function" || !notice) return;
      const type = row.querySelector(".download-type");
      const size = row.querySelector(".download-size");
      const advice = fileSourceAdvice({
        url: input.value,
        category: type ? type.value : "pdf",
        fileSize: size ? size.value : "",
      });
      paintDownloadNotice(notice, advice);
    };

    input.addEventListener("input", refresh);
    input.addEventListener("blur", function () {
      if (typeof normalizeDownloadUrl === "function") {
        const fixed = normalizeDownloadUrl(input.value);
        if (fixed !== input.value) input.value = fixed;
      }
      refresh();
    });
    row.querySelector(".download-size")?.addEventListener("input", refresh);
  });

  // "Check" button - confirms the file really is at that address.
  container.querySelectorAll(".download-check").forEach(function (button) {
    button.addEventListener("click", async function () {
      const row = button.closest(".content-download-row");
      const index = row.getAttribute("data-download-index");
      const input = row.querySelector(".download-url");
      const notice = row.querySelector('[data-notice="' + index + '"]');
      if (typeof checkFileUrl !== "function") return;

      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> بررسی...';

      const result = await checkFileUrl(input.value);

      button.disabled = false;
      button.innerHTML = original;
      paintDownloadNotice(notice, {
        tone: result.ok === true ? "ok" : result.ok === false ? "warn" : "info",
        text: result.reason,
      });
    });
  });
}

function paintDownloadNotice(box, advice) {
  if (!box) return;
  if (!advice) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  const icon =
    advice.tone === "warn"
      ? "fa-triangle-exclamation"
      : advice.tone === "ok"
        ? "fa-circle-check"
        : "fa-circle-info";
  box.hidden = false;
  box.className = "url-notice url-notice--" + advice.tone;
  box.innerHTML =
    '<i class="fas ' +
    icon +
    '"></i><span>' +
    escapeHtml(advice.text) +
    "</span>";
}

function buildDownloadTypeOptions(selected) {
  const types = ["file", "pdf", "xlsx", "xls", "doc", "docx", "zip"];
  return types
    .map(function (type) {
      return (
        '<option value="' +
        type +
        '"' +
        (selected === type ? " selected" : "") +
        ">" +
        type +
        "</option>"
      );
    })
    .join("");
}

function addDownloadRow() {
  contentEditorState.downloads.push({
    id: "download-" + Date.now(),
    title: "",
    url: "",
    type: "file",
    size: "",
  });
  renderDownloadsEditor();
}

function toggleVideoFields() {
  const enabled = document.getElementById("contentVideoEnabled").checked;
  const fields = document.getElementById("contentVideoFields");
  if (fields) {
    fields.hidden = !enabled;
  }
}

function collectDownloadsFromForm() {
  const rows = document.querySelectorAll(".content-download-row");
  const downloads = [];

  rows.forEach(function (row, index) {
    const title = row.querySelector(".download-title").value.trim();
    const url = row.querySelector(".download-url").value.trim();
    const type = row.querySelector(".download-type").value;
    const size = row.querySelector(".download-size").value.trim();

    if (!title || !url) {
      return;
    }

    downloads.push({
      id: contentEditorState.downloads[index]?.id || "download-" + (index + 1),
      title: title,
      url: url,
      type: type,
      size: size,
    });
  });

  return downloads;
}
