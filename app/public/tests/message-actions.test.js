/**
 * Deleting rows, and answering a violation report.
 *
 * Run with:  node tests/message-actions.test.js
 *
 * Three things this covers:
 *   - a conversation can be removed from the messages tab
 *   - a notification can be removed, one at a time or all at once
 *   - a گزارش تخلف can be answered, and the answer reaches the reporter
 *
 * The reply deliberately travels as an ordinary support thread rather than
 * a separate report-only channel: the reporter then sees it in
 * "پیام‌های من" beside their other conversations, and the panel shows it in
 * the messages tab. A parallel inbox would be two places to check.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  pageScripts,
  readScripts,
  styleSource,
} = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORTS = [
  {
    id: "RPT-1041",
    reporterId: "u5",
    reporterName: "علی احمدی",
    reporterEmail: "ali@t.com",
    kind: "content",
    severity: "high",
    subject: "دوره حسابداری",
    description: "محتوای نامناسب دارد",
    evidenceImage: "",
    status: "pending",
    date: "۱۴۰۵/۰۵/۰۶",
    createdAt: "2026-07-28T10:00:00Z",
  },
];
const MESSAGES = [
  {
    id: "m1",
    sender: "مریم حسینی",
    email: "maryam@t.com",
    text: "سلام، سوال دارم",
    time: "۱۴۰۵/۰۵/۰۵",
    unread: true,
    source: "contact",
    createdAt: "2026-07-27T10:00:00Z",
    history: [
      {
        sender: "user",
        name: "مریم حسینی",
        text: "سلام، سوال دارم",
        time: "۱۴۰۵/۰۵/۰۵",
      },
    ],
  },
  {
    id: "m2",
    sender: "کاوه رضایی",
    email: "kaveh@t.com",
    text: "پیام دوم",
    time: "۱۴۰۵/۰۵/۰۴",
    unread: false,
    source: "ai",
    createdAt: "2026-07-26T10:00:00Z",
    history: [
      {
        sender: "user",
        name: "کاوه رضایی",
        text: "پیام دوم",
        time: "۱۴۰۵/۰۵/۰۴",
      },
    ],
  },
];

function boot(role, seed) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const store = Object.assign(
    {
      hesabyarSession: JSON.stringify({
        token: "t",
        isAdmin: true,
        user: {
          id: 1,
          name: "مدیر",
          email: "m@x.com",
          role: role || "مدیر سایت",
        },
      }),
      irHesabdarUsers: JSON.stringify([
        {
          id: 1,
          name: "مدیر",
          email: "m@x.com",
          role: "مدیر سایت",
          status: "فعال",
        },
        {
          id: 2,
          name: "محمد",
          email: "mo@x.com",
          role: "ادمین",
          status: "فعال",
        },
      ]),
      irHesabdarMessages: JSON.stringify(MESSAGES),
      irHesabdarReports: JSON.stringify(REPORTS),
    },
    seed || {},
  );
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  const FILES = adminScripts();
  const src = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__t = {
    deleteMessage, deleteNotification, clearAllNotifications, openReportReply,
    renderMessages, renderNotificationsPage, renderFloatingMessages,
    openNotificationDetails, visibleNotifications, appApi,
    get msgs() { return appState.messages; },
    set msgs(v) { appState.messages = v; },
    get notifs() { return appState.notifications; },
    set notifs(v) { appState.notifications = v; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  // jsdom's confirm returns undefined, which would read as "cancelled".
  Object.defineProperty(w, "confirm", {
    value: () => true,
    configurable: true,
    writable: true,
  });
  return { w, doc: w.document, store };
}

(async () => {
  /* ------------------------------------------------------- delete a message */
  section("حذف گفتگو در تب پیام‌ها");
  let { w, doc, store } = boot();
  await wait(900);
  w.__t.renderMessages();

  t(
    "هر گفتگو دکمه حذف دارد",
    doc.querySelectorAll(".thread-delete").length === 2,
    String(doc.querySelectorAll(".thread-delete").length),
  );
  t(
    "دکمه برچسب دسترس‌پذیری دارد",
    !!doc.querySelector(".thread-delete").getAttribute("aria-label"),
  );
  t(
    "شناسه روی دکمه است",
    !!doc.querySelector(".thread-delete").getAttribute("data-delete-message"),
  );

  const before = w.__t.msgs.length;
  doc
    .querySelector('[data-delete-message="m1"]')
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(150);
  t(
    "گفتگو از حافظه حذف شد",
    w.__t.msgs.length === before - 1,
    `${before} -> ${w.__t.msgs.length}`,
  );
  t("گفتگوی درست حذف شد", !w.__t.msgs.some((m) => m.id === "m1"));
  t(
    "بقیه دست‌نخورده ماندند",
    w.__t.msgs.some((m) => m.id === "m2"),
  );
  t("از فهرست هم رفت", !doc.querySelector('[data-delete-message="m1"]'));

  const persisted = JSON.parse(store.irHesabdarMessages || "[]");
  t(
    "از حافظه دائمی هم حذف شد",
    !persisted.some((m) => m.id === "m1"),
    persisted.map((m) => m.id).join(","),
  );

  section("انصراف از حذف");
  ({ w, doc, store } = boot());
  await wait(900);
  w.__t.renderMessages();
  Object.defineProperty(w, "confirm", {
    value: () => false,
    configurable: true,
    writable: true,
  });
  const keep = w.__t.msgs.length;
  doc
    .querySelector('[data-delete-message="m1"]')
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(150);
  t(
    "با انصراف چیزی حذف نمی‌شود",
    w.__t.msgs.length === keep,
    `${keep} -> ${w.__t.msgs.length}`,
  );

  /* -------------------------------------------------- delete a notification */
  section("حذف اعلان");
  ({ w, doc, store } = boot());
  await wait(900);
  w.__t.renderNotificationsPage();
  const notifCount = w.__t.notifs.length;
  t("اعلان‌هایی وجود دارد", notifCount > 0, String(notifCount));
  t(
    "هر اعلان دکمه حذف دارد",
    doc.querySelectorAll(".notif-delete").length === notifCount,
    `${doc.querySelectorAll(".notif-delete").length} / ${notifCount}`,
  );
  t(
    "دکمه «حذف همه» نمایان است",
    doc.getElementById("clearAllNotifsBtn").style.display !== "none",
  );

  const firstId = doc
    .querySelector(".notif-delete")
    .getAttribute("data-delete-notification");
  doc
    .querySelector(".notif-delete")
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(120);
  t(
    "اعلان حذف شد",
    w.__t.notifs.length === notifCount - 1,
    `${notifCount} -> ${w.__t.notifs.length}`,
  );
  t(
    "همان اعلان رفت",
    !w.__t.notifs.some((n) => String(n.id) === String(firstId)),
  );
  t(
    "در حافظه دائمی ذخیره شد",
    JSON.parse(store.irHesabdarNotifications || "[]").length === notifCount - 1,
  );

  section("حذف همه اعلان‌ها");
  ({ w, doc, store } = boot());
  await wait(900);
  w.__t.renderNotificationsPage();
  w.__t.clearAllNotifications();
  t("همه حذف شدند", w.__t.notifs.length === 0, String(w.__t.notifs.length));
  w.__t.renderNotificationsPage();
  t(
    "پیام خالی بودن نمایش داده می‌شود",
    doc
      .getElementById("notificationsPageList")
      .textContent.includes("اعلانی وجود ندارد"),
  );
  t(
    "دکمه حذف همه پنهان شد",
    doc.getElementById("clearAllNotifsBtn").style.display === "none",
  );

  section("ادمین فقط اعلان‌های خودش را پاک می‌کند");
  // An admin cannot see staff/report notices, so clearing their list must
  // not silently destroy manager-only records they never had access to.
  const adm = boot("ادمین", {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 2, name: "محمد", email: "mo@x.com", role: "ادمین" },
    }),
  });
  await wait(900);
  const totalBefore = adm.w.__t.notifs.length;
  const hiddenBefore = totalBefore - adm.w.__t.visibleNotifications().length;
  adm.w.__t.clearAllNotifications();
  t(
    "اعلان‌های مخفی باقی می‌مانند",
    adm.w.__t.notifs.length === hiddenBefore,
    `${totalBefore} -> ${adm.w.__t.notifs.length}، مخفی: ${hiddenBefore}`,
  );
  t(
    "چیزی برای ادمین باقی نماند",
    adm.w.__t.visibleNotifications().length === 0,
  );

  /* ------------------------------------------------------ reply to a report */
  section("پاسخ به گزارش تخلف");
  ({ w, doc, store } = boot());
  await wait(900);
  const reportNotif = w.__t.notifs.find((n) => n.type === "report");
  t("اعلان گزارش تخلف وجود دارد", !!reportNotif);

  w.__t.openNotificationDetails(reportNotif);
  t(
    "دکمه «پاسخ به کاربر» در جزئیات هست",
    !!doc.querySelector(".report-reply-btn"),
  );
  t(
    "متن دکمه درست است",
    doc
      .querySelector(".report-reply-btn")
      .textContent.includes("پاسخ به کاربر"),
  );

  w.__t.openReportReply("RPT-1041");
  t(
    "مودال پاسخ باز شد",
    doc.getElementById("reportReplyModal").classList.contains("active"),
  );
  t(
    "مودال جزئیات بسته شد",
    !doc.getElementById("notificationDetailModal").classList.contains("active"),
  );
  t(
    "خلاصه گزارش نمایش داده می‌شود",
    doc.getElementById("reportReplySummary").textContent.includes("علی احمدی"),
  );
  t(
    "مورد گزارش‌شده در خلاصه هست",
    doc
      .getElementById("reportReplySummary")
      .textContent.includes("دوره حسابداری"),
  );
  t("کادر متن پاسخ هست", !!doc.getElementById("reportReplyText"));
  t("انتخاب وضعیت رسیدگی هست", !!doc.getElementById("reportReplyStatus"));
  t("امکان پیوست فایل هست", !!doc.getElementById("reportReplyFile"));
  t(
    "پیوست فقط تصویر می‌پذیرد",
    doc.getElementById("reportReplyFile").getAttribute("accept") === "image/*",
  );
  t(
    "به کاربر گفته شده فقط تصویر",
    doc.getElementById("reportReplyHint").textContent.includes("فقط تصویر"),
  );

  section("چیدمان و وضعیت اولیه پنجره پاسخ");
  // The `hidden` attribute is only a weak default style, so the CSS rules
  // that set `display` on these two were overriding it - the delete button
  // and a broken image preview showed before anything was attached.
  // Every stylesheet the page links, in page order — the same thing the
  // browser sees. Naming one file would break the moment it is split.
  const replyCss = styleSource("admin.html");
  t(
    "قانون سراسری hidden اضافه شد",
    /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(replyCss),
  );
  t(
    "دکمه حذف در ابتدا پنهان است",
    doc.getElementById("reportReplyClear").hidden === true,
  );
  t(
    "پیش‌نمایش در ابتدا پنهان است",
    doc.getElementById("reportReplyPreview").hidden === true,
  );
  t(
    "دکمه انتخاب تصویر پنهان نیست",
    doc.getElementById("reportReplyChoose").hidden === false,
  );

  t("پنجره دوستونه است", replyCss.includes(".report-reply-body"));
  t("عرض پنجره بیشتر شد", replyCss.includes("max-width: 880px"));
  t(
    "ارتفاع کادر متن کمتر شد",
    doc.getElementById("reportReplyText").getAttribute("rows") === "4",
    doc.getElementById("reportReplyText").getAttribute("rows"),
  );
  t(
    "در موبایل تک‌ستونه می‌شود",
    replyCss.includes("grid-template-columns: 1fr"),
  );
  t(
    "خلاصه گزارش ستون جدا دارد",
    !!doc.querySelector(".report-reply-col--context"),
  );
  t("فرم پاسخ ستون جدا دارد", !!doc.querySelector(".report-reply-col--form"));

  doc.getElementById("reportReplyText").value =
    "بررسی شد و محتوا اصلاح گردید. ممنون از گزارش شما.";
  doc
    .getElementById("reportReplyForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await wait(400);

  t(
    "مودال بعد از ارسال بسته شد",
    !doc.getElementById("reportReplyModal").classList.contains("active"),
  );

  const inbox = await w.__t.appApi.admin.messages.list();
  const thread = inbox.find((m) => String(m.id).includes("RPT-1041"));
  t("نخ گفتگو ساخته شد", !!thread);
  t(
    "دو حباب دارد",
    thread && thread.history.length === 2,
    String(thread && thread.history.length),
  );
  t(
    "حباب اول شرح گزارش کاربر است",
    thread &&
      thread.history[0].sender === "user" &&
      thread.history[0].text.includes("نامناسب"),
  );
  t(
    "حباب دوم پاسخ مدیر است",
    thread &&
      thread.history[1].sender === "admin" &&
      thread.history[1].text.includes("اصلاح گردید"),
  );
  t(
    "به حساب گزارش‌دهنده وصل است",
    thread && thread.userId === "u5",
    String(thread && thread.userId),
  );
  t("ایمیل گزارش‌دهنده ثبت شد", thread && thread.email === "ali@t.com");
  t("موضوع به گزارش اشاره دارد", thread && thread.subject.includes("RPT-1041"));

  const savedReport = JSON.parse(store.irHesabdarReports)[0];
  t(
    "وضعیت گزارش به پاسخ‌داده‌شده تغییر کرد",
    savedReport.status === "answered",
    savedReport.status,
  );
  t("متن پاسخ روی گزارش ذخیره شد", savedReport.reply.includes("اصلاح گردید"));
  t("زمان پاسخ ثبت شد", !!savedReport.repliedAt);

  section("کاربر پاسخ را در پروفایل می‌بیند");
  // Sign in as the reporter: my-messages reads the session, never a passed-in
  // address, so nobody can request another person's history.
  store.hesabyarSession = JSON.stringify({
    token: "u",
    user: {
      id: "u5",
      name: "علی احمدی",
      email: "ali@t.com",
      role: "کاربر عادی",
    },
  });
  const seen = await w.__t.appApi.support.myMessages();
  t(
    "در پیام‌های کاربر ظاهر می‌شود",
    seen.some((m) => String(m.id).includes("RPT-1041")),
    String(seen.length),
  );
  t(
    "پاسخ مدیر برای کاربر قابل خواندن است",
    seen
      .find((m) => String(m.id).includes("RPT-1041"))
      .history.some((b) => b.sender === "admin"),
  );

  section("پیام دیگران نشت نمی‌کند");
  store.hesabyarSession = JSON.stringify({
    token: "x",
    user: {
      id: "u9",
      name: "غریبه",
      email: "stranger@t.com",
      role: "کاربر عادی",
    },
  });
  const stranger = await w.__t.appApi.support.myMessages();
  t(
    "کاربر دیگر گزارش را نمی‌بیند",
    !stranger.some((m) => String(m.id).includes("RPT-1041")),
    String(stranger.length),
  );
  const spoof = await w.__t.appApi.support.myMessages({ email: "ali@t.com" });
  t(
    "با جعل ایمیل هم نمی‌شود دید",
    !spoof.some((m) => String(m.id).includes("RPT-1041")),
    "ایمیل ارسالی نباید به جای سشن اعتبار داشته باشد",
  );

  // Restore the admin session for the rest of the run.
  store.hesabyarSession = JSON.stringify({
    token: "t",
    isAdmin: true,
    user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
  });

  section("پاسخ دوم به همان گزارش");
  w.__t.openReportReply("RPT-1041");
  doc.getElementById("reportReplyText").value = "پیگیری تکمیلی انجام شد.";
  doc
    .getElementById("reportReplyForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await wait(400);
  const again = (await w.__t.appApi.admin.messages.list()).find((m) =>
    String(m.id).includes("RPT-1041"),
  );
  t(
    "به همان نخ اضافه شد، نخ تازه نساخت",
    again && again.history.length === 3,
    String(again && again.history.length),
  );
  t(
    "نخ تکراری ایجاد نشد",
    (await w.__t.appApi.admin.messages.list()).filter((m) =>
      String(m.id).includes("RPT-1041"),
    ).length === 1,
  );

  section("اعتبارسنجی");
  try {
    await w.__t.appApi.admin.reports.reply("RPT-1041", { text: "" });
    t("پاسخ خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("پاسخ خالی رد می‌شود", true);
  }
  try {
    await w.__t.appApi.admin.reports.reply("RPT-9999", { text: "x" });
    t("گزارش ناموجود رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("گزارش ناموجود رد می‌شود", e.status === 404, String(e.status));
  }

  section("حذف گزارش از طریق API");
  const beforeDel = (await w.__t.appApi.admin.reports.list()).length;
  await w.__t.appApi.admin.reports.remove("RPT-1041");
  t(
    "گزارش حذف شد",
    (await w.__t.appApi.admin.reports.list()).length === beforeDel - 1,
  );

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
