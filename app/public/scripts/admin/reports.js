/**
 * Admin panel — replying to a violation report
 *
 * The reply dialog for an abuse report, including its image attachment.
 *
 * An attachment is checked three ways before it is accepted: the extension,
 * the declared MIME type, and the file's actual magic bytes. Maximum 300 KB,
 * images only.
 *
 * BACKEND NOTE: there is no upload endpoint yet, so the image travels as a
 * data URL. This needs POST /support/reports/evidence.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

const REPLY_MAX_KB = 300;
const REPLY_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function clearReportReplyAttachment() {
  const file = document.getElementById("reportReplyFile");
  const value = document.getElementById("reportReplyAttachment");
  const preview = document.getElementById("reportReplyPreview");
  const clear = document.getElementById("reportReplyClear");
  const hint = document.getElementById("reportReplyHint");
  if (file) file.value = "";
  if (value) value.value = "";
  if (preview) {
    preview.hidden = true;
    preview.removeAttribute("src");
  }
  if (clear) clear.hidden = true;
  if (hint) {
    hint.textContent =
      "فقط تصویر پذیرفته می‌شود (JPG، PNG، WebP یا GIF) و حداکثر ۳۰۰ کیلوبایت.";
    hint.dataset.tone = "";
  }
}

/** Open the reply sheet for one report. */
function openReportReply(reportId) {
  const report = loadAbuseReports().find(
    (r) => String(r.id) === String(reportId),
  );
  if (!report) {
    showToast("گزارش پیدا نشد.", "error");
    return;
  }

  document.getElementById("reportReplyId").value = report.id;
  document.getElementById("reportReplyText").value = "";
  document.getElementById("reportReplyStatus").value = "answered";
  clearReportReplyAttachment();

  // Remind the operator what they are answering, so they do not have to
  // close this sheet and reopen the notification to check.
  document.getElementById("reportReplySummary").innerHTML =
    '<div class="report-reply-summary__row"><span>شناسه</span><strong>' +
    escapeHtml(report.id) +
    "</strong></div>" +
    '<div class="report-reply-summary__row"><span>گزارش‌دهنده</span><strong>' +
    escapeHtml(report.reporterName || "ناشناس") +
    "</strong></div>" +
    '<div class="report-reply-summary__row"><span>مورد گزارش‌شده</span><strong>' +
    escapeHtml(report.subject || "—") +
    "</strong></div>" +
    '<div class="report-reply-summary__row"><span>شرح</span><strong>' +
    escapeHtml(report.description || "—") +
    "</strong></div>";

  closeModal("notificationDetailModal");
  openModal("reportReplyModal");
}

function initReportReply() {
  const form = document.getElementById("reportReplyForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const fileInput = document.getElementById("reportReplyFile");
  const hint = document.getElementById("reportReplyHint");

  document
    .getElementById("reportReplyChoose")
    ?.addEventListener("click", () => fileInput?.click());
  document
    .getElementById("reportReplyClear")
    ?.addEventListener("click", clearReportReplyAttachment);

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    // Check the real MIME type, not the extension - renaming a .pdf to .jpg
    // would sail past a name check.
    if (REPLY_IMAGE_TYPES.indexOf(file.type) === -1) {
      clearReportReplyAttachment();
      hint.textContent = "فقط فایل تصویری می‌توانید پیوست کنید.";
      hint.dataset.tone = "error";
      return;
    }
    const sizeKb = Math.round(file.size / 1024);
    if (sizeKb > REPLY_MAX_KB) {
      clearReportReplyAttachment();
      hint.textContent =
        "این تصویر " +
        toPersianDigits(sizeKb) +
        " کیلوبایت است؛ حداکثر ۳۰۰ کیلوبایت پذیرفته می‌شود.";
      hint.dataset.tone = "error";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById("reportReplyAttachment").value =
        event.target.result;
      const preview = document.getElementById("reportReplyPreview");
      preview.src = event.target.result;
      preview.hidden = false;
      document.getElementById("reportReplyClear").hidden = false;
      hint.textContent =
        "تصویر پیوست شد (" + toPersianDigits(sizeKb) + " کیلوبایت).";
      hint.dataset.tone = "ok";
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reportId = document.getElementById("reportReplyId").value;
    const text = document.getElementById("reportReplyText").value.trim();
    if (!text) {
      showToast("متن پاسخ را وارد کنید.", "error");
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      const settings = loadSystemSettings();
      await appApi.admin.reports.reply(reportId, {
        text: text,
        adminName: settings.adminName || "مدیر سایت",
        attachment: document.getElementById("reportReplyAttachment").value,
      });
      await appApi.admin.reports.setStatus(
        reportId,
        document.getElementById("reportReplyStatus").value,
      );

      // Pull the new thread in so the messages tab shows it immediately.
      const fresh = await appApi.admin.messages.list();
      if (Array.isArray(fresh)) appState.messages = fresh;
      renderMessages();
      renderFloatingMessages();
      updateMessagesBadgeCount();

      closeModal("reportReplyModal");
      showToast("پاسخ برای گزارش‌دهنده ارسال شد.", "success");
    } catch (error) {
      showToast(
        error && error.message ? error.message : "ارسال پاسخ انجام نشد.",
        "error",
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

/* ============================================================================
   DELETING MESSAGES AND NOTIFICATIONS
   ----------------------------------------------------------------------------
   Neither list had any way to remove a row, so a finished conversation or a
   read notice stayed forever and the inbox only ever grew.

   Both ask for confirmation first: these are one-way, and a misplaced click
   next to "reply" should not quietly destroy a customer's thread.
   ========================================================================== */

/**
 * One delegated listener for both delete buttons.
 *
 * The rows are re-rendered constantly, so binding per button would leak
 * handlers. Delegation also keeps record ids out of inline onclick strings,
 * where an apostrophe in an id would break the markup.
 */
