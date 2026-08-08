/**
 * Notifications — all seven sources must reach the bell and the اعلان‌ها tab.
 *
 * Run with:  node tests/notifications.test.js
 *
 *   ثبت سفارش · پرداخت موفق · پرداخت ناموفق   ← تب سفارشات
 *   ثبت‌نام کاربر جدید                          ← تب کاربران
 *   تغییر پروفایل ادمین/مدیر                    ← تب پروفایل
 *   حذف ادمین توسط مدیر                         ← تب مدیریت دسترسی‌ها
 *   گزارش تخلف                                  ← فرم تماس با ما / قوانین
 *
 * The bug this mostly exists to prevent: notifications were raised only from
 * a "storage" event, which fires only in other tabs open at the same moment.
 * An order placed overnight produced nothing - the operator opened the panel
 * to an empty bell.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  pageScripts,
  readScripts,
  adminSource,
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

function bootPanel(seed, role) {
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
      ]),
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
    reconcileNotifications, announceOrder, announceUser, announceReport,
    visibleNotifications, canReceiveNotification, pushAdminNotification,
    applyStaffProfileChanges, renderNotificationsPage, switchView,
    get notifications() { return appState.notifications; },
    set orders(v) { appState.orders = v; },
    set users(v) { appState.users = v; },
    get users() { return appState.users; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.showToast = () => {};
  return { w, doc: w.document, store };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* --------------------------------------------------------- orders */
  section("سفارش و پرداخت — پنل بسته بوده");
  const orders = [
    {
      id: "#۷۰۱",
      customer: "سام",
      product: "دوره اکسل",
      amount: 95000,
      date: "۱۴۰۵/۰۵/۰۶",
      status: "success",
      buyerEmail: "s@x.com",
    },
    {
      id: "#۷۰۲",
      customer: "مریم",
      product: "جزوه مالیات",
      amount: 15000,
      date: "۱۴۰۵/۰۵/۰۶",
      status: "failed",
    },
    {
      id: "#۷۰۳",
      customer: "علی",
      product: "پکیج ثبت سند",
      amount: 29000,
      date: "۱۴۰۵/۰۵/۰۶",
      status: "cancelled",
    },
  ];
  let panel = bootPanel({ irHesabdarOrders: JSON.stringify(orders) });
  await wait(900);
  let notes = panel.w.__t.notifications;
  const purchases = notes.filter((n) => n.type === "purchase");
  t(
    "هر سه سفارش اعلان گرفتند",
    purchases.length === 3,
    String(purchases.length),
  );
  t(
    "پرداخت موفق عنوان درست دارد",
    purchases.some((n) => n.title === "پرداخت موفق"),
  );
  t(
    "پرداخت ناموفق عنوان درست دارد",
    purchases.some((n) => n.title === "پرداخت ناموفق"),
  );
  t(
    "سفارش لغو شده عنوان درست دارد",
    purchases.some((n) => n.title === "سفارش لغو شده"),
  );
  const paid = purchases.find((n) => n.title === "پرداخت موفق");
  t(
    "شماره سفارش در جزئیات",
    paid.details["شماره سفارش"] === "#۷۰۱",
    paid.details["شماره سفارش"],
  );
  t("خریدار در جزئیات", paid.details["خریدار"] === "سام");
  t(
    "مبلغ در جزئیات",
    String(paid.details["مبلغ"]).includes("۹۵"),
    String(paid.details["مبلغ"]),
  );
  t("وضعیت پرداخت در جزئیات", !!paid.details["وضعیت پرداخت"]);

  section("رفرش دوباره، اعلان تکراری نمی‌سازد");
  const carried = {
    irHesabdarOrders: JSON.stringify(orders),
    irHesabdarNotifications: panel.store.irHesabdarNotifications,
    irHesabdarAnnouncedEvents: panel.store.irHesabdarAnnouncedEvents,
  };
  const again = bootPanel(carried);
  await wait(900);
  t(
    "تعداد همان می‌ماند",
    again.w.__t.notifications.filter((n) => n.type === "purchase").length === 3,
    String(
      again.w.__t.notifications.filter((n) => n.type === "purchase").length,
    ),
  );
  t(
    "دفتر رویدادهای اعلام‌شده ذخیره شد",
    !!panel.store.irHesabdarAnnouncedEvents,
  );

  section("سفارش تازه بعد از باز بودن پنل");
  const more = orders.concat([
    {
      id: "#۷۰۴",
      customer: "نگار",
      product: "دوره جدید",
      amount: 50000,
      date: "۱۴۰۵/۰۵/۰۷",
      status: "success",
    },
  ]);
  again.w.__t.orders = more;
  again.w.__t.reconcileNotifications();
  t(
    "فقط سفارش تازه اعلان می‌گیرد",
    again.w.__t.notifications.filter((n) => n.type === "purchase").length === 4,
    String(
      again.w.__t.notifications.filter((n) => n.type === "purchase").length,
    ),
  );

  /* ---------------------------------------------------------- users */
  section("ثبت‌نام کاربر جدید");
  const withUsers = [
    {
      id: 1,
      name: "مدیر",
      email: "m@x.com",
      role: "مدیر سایت",
      status: "فعال",
    },
    {
      id: 9,
      name: "کاربر تازه",
      email: "new@x.com",
      phone: "09121234567",
      role: "کاربر عادی",
      status: "فعال",
    },
  ];
  panel = bootPanel({ irHesabdarUsers: JSON.stringify(withUsers) });
  await wait(900);
  const userNotes = panel.w.__t.notifications.filter((n) => n.type === "user");
  t(
    "کاربر عادی اعلان می‌گیرد",
    userNotes.length === 1,
    String(userNotes.length),
  );
  t(
    "نام کاربر در اعلان",
    userNotes[0].desc.includes("کاربر تازه"),
    userNotes[0].desc,
  );
  t("ایمیل در جزئیات", userNotes[0].details["ایمیل"] === "new@x.com");
  t(
    "مدیر اعلان ثبت‌نام نمی‌گیرد",
    !userNotes.some((n) => n.desc.includes("مدیر")),
  );

  /* ------------------------------------------------------- profile */
  section("تغییر پروفایل ادمین یا مدیر");
  panel = bootPanel({
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
        phone: "09122222222",
        role: "ادمین",
        status: "فعال",
      },
    ]),
  });
  panel.w.__t.applyStaffProfileChanges(2, { name: "محمد رضایی‌منش" });
  const staffNotes = panel.w.__t.notifications.filter(
    (n) => n.type === "staff",
  );
  t(
    "اعلان تغییر پروفایل ساخته شد",
    staffNotes.length === 1,
    String(staffNotes.length),
  );
  t("نام فرد در اعلان", staffNotes[0].desc.includes("محمد"));
  t(
    "جزئیات قبل و بعد دارد",
    staffNotes[0].details["جزئیات تغییرات"].includes("→"),
  );

  /* ------------------------------------------------------ deletion */
  section("حذف ادمین توسط مدیر");
  panel.w.__t.pushAdminNotification(
    "deletion",
    "حذف حساب ادمین",
    "ادمین «محمد» توسط مدیر حذف شد.",
    {
      "حساب حذف‌شده": "محمد",
      نقش: "ادمین",
      حذف‌کننده: "مدیر",
      "شناسه حذف‌کننده": "#۱",
      تاریخ: "۱۴۰۵/۰۵/۰۶",
    },
  );
  const delNotes = panel.w.__t.notifications.filter(
    (n) => n.type === "deletion",
  );
  t("اعلان حذف ثبت شد", delNotes.length === 1);
  t("حساب حذف‌شده ذکر شده", delNotes[0].details["حساب حذف‌شده"] === "محمد");
  const src = adminSource();
  t("دکمه حذف واقعاً اعلان می‌فرستد", src.includes('"حذف حساب ادمین"'));

  /* -------------------------------------------------------- report */
  section("گزارش تخلف — از فرم سایت تا پنل");
  const shtml = fs.readFileSync(path.join(ROOT, "html/support.html"), "utf8");
  const sdom = new JSDOM(shtml, {
    url: "http://localhost/html/support.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const sw = sdom.window;
  const sstore = {
    hesabyarSession: JSON.stringify({
      token: "t",
      user: { id: "u5", name: "علی احمدی", email: "ali@t.com" },
    }),
  };
  Object.defineProperty(sw, "localStorage", {
    value: {
      getItem: (k) => (k in sstore ? sstore[k] : null),
      setItem: (k, v) => {
        sstore[k] = String(v);
      },
      removeItem: (k) => {
        delete sstore[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(sw, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  const ssrc = readScripts(
    pageScripts("support.html", {
      exclude: ["mobile-menu.js", "ai-widget.js", "up-btn.js", "toggle-btn.js"],
    }),
  );
  ssrc.push(`window.__s = { appApi };`);
  sw.eval(ssrc.join("\n;\n"));
  sw.document.dispatchEvent(
    new sw.Event("DOMContentLoaded", { bubbles: true }),
  );

  t(
    "فرم گزارش تخلف وجود دارد",
    !!sw.document.getElementById("reportAbuseForm"),
  );
  t(
    "دکمه دیگر غیرفعال نیست",
    !sw.document.getElementById("reportAbuseBtn").disabled,
  );
  t(
    "نام از سشن پر شد",
    sw.document.getElementById("reportName").value === "علی احمدی",
    sw.document.getElementById("reportName").value,
  );
  t(
    "ایمیل از سشن پر شد",
    sw.document.getElementById("reportEmail").value === "ali@t.com",
  );
  t(
    "انتخاب نوع تخلف دارد",
    sw.document.querySelectorAll("#reportKind option").length >= 5,
  );
  t("انتخاب درجه اهمیت دارد", !!sw.document.getElementById("reportSeverity"));

  sw.document.getElementById("reportKind").value = "content";
  sw.document.getElementById("reportSeverity").value = "high";
  sw.document.getElementById("reportSubject").value = "دوره حسابداری مقدماتی";
  // Attach an image the way the picker does: a data URL in the hidden field.
  sw.document.getElementById("reportEvidence").value =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  sw.document.getElementById("reportDescription").value =
    "محتوای این صفحه نامناسب است";
  sw.document
    .getElementById("reportAbuseForm")
    .dispatchEvent(new sw.Event("submit", { bubbles: true, cancelable: true }));
  await wait(400);

  const stored = JSON.parse(sstore.irHesabdarReports || "[]");
  t("گزارش ذخیره شد", stored.length === 1, String(stored.length));
  t("شناسه RPT دارد", /^RPT-\d+$/.test(stored[0].id), stored[0].id);
  t("به حساب کاربر وصل است", stored[0].reporterId === "u5");
  t("نوع تخلف ثبت شد", stored[0].kind === "content");
  t("درجه اهمیت ثبت شد", stored[0].severity === "high");
  t(
    "تصویر مدرک ثبت شد",
    String(stored[0].evidenceImage).startsWith("data:image/"),
    String(stored[0].evidenceImage).slice(0, 30),
  );
  t("وضعیت اولیه در انتظار است", stored[0].status === "pending");
  t(
    "پیام موفقیت با شماره گزارش",
    sw.document
      .querySelector("#reportAbuseForm .form-message")
      .textContent.includes("RPT-"),
    sw.document.querySelector("#reportAbuseForm .form-message").textContent,
  );

  section("گزارش در پنل مدیر");
  panel = bootPanel({ irHesabdarReports: sstore.irHesabdarReports });
  await wait(900);
  const repNotes = panel.w.__t.notifications.filter((n) => n.type === "report");
  t(
    "اعلان گزارش تخلف ساخته شد",
    repNotes.length === 1,
    String(repNotes.length),
  );
  t("عنوان درست است", repNotes[0].title === "گزارش تخلف جدید");
  t(
    "نام گزارش‌دهنده",
    repNotes[0].desc.includes("علی احمدی"),
    repNotes[0].desc,
  );
  t(
    "شناسه گزارش در جزئیات",
    repNotes[0].details["شناسه گزارش"] === stored[0].id,
  );
  t(
    "نوع به فارسی ترجمه شد",
    repNotes[0].details["نوع گزارش"] === "محتوای نامناسب",
    repNotes[0].details["نوع گزارش"],
  );
  t("اهمیت به فارسی ترجمه شد", repNotes[0].details["درجه اهمیت"] === "زیاد");
  t("شرح تخلف در جزئیات", repNotes[0].details["شرح"].includes("نامناسب"));
  t(
    "مدرک پیوست در جزئیات",
    repNotes[0].details["مدرک پیوست"] === "تصویر پیوست شده",
    repNotes[0].details["مدرک پیوست"],
  );
  t(
    "مدیر گزارش را می‌بیند",
    panel.w.__t.visibleNotifications().filter((n) => n.type === "report")
      .length === 1,
  );

  section("ادمین گزارش تخلف را نمی‌بیند");
  const adminPanel = bootPanel({
    irHesabdarReports: sstore.irHesabdarReports,
    irHesabdarUsers: JSON.stringify([
      {
        id: 1,
        name: "مدیر",
        email: "m@x.com",
        role: "مدیر سایت",
        status: "فعال",
      },
      { id: 2, name: "محمد", email: "mo@x.com", role: "ادمین", status: "فعال" },
    ]),
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 2, name: "محمد", email: "mo@x.com", role: "ادمین" },
    }),
  });
  await wait(900);
  t(
    "اعلان ساخته می‌شود",
    adminPanel.w.__t.notifications.filter((n) => n.type === "report").length ===
      1,
  );
  t(
    "ولی ادمین نمی‌بیندش",
    adminPanel.w.__t.visibleNotifications().filter((n) => n.type === "report")
      .length === 0,
  );
  t(
    "ادمین سفارش را می‌بیند",
    adminPanel.w.__t.canReceiveNotification({ type: "purchase" }) === true,
  );

  section("ظاهر منوهای بازشو");
  // Native <option> elements take the select's own colours, so the near-white
  // --text-primary on an almost transparent background left the choices
  // unreadable, and light mode fell back to the raw OS list. Every select on
  // the page is replaced by a themed list instead.
  ["subject", "reportKind", "reportSeverity"].forEach((id) => {
    const nat = sw.document.getElementById(id);
    const wrap = nat.parentNode.querySelector(".custom-select-wrapper");
    t(`منوی ${id} به حالت سفارشی درآمد`, !!wrap);
    t(
      `منوی ${id} از حالت خام مخفی شد`,
      nat.classList.contains("native-select-hidden"),
    );
  });
  const kindWrap = sw.document
    .getElementById("reportKind")
    .parentNode.querySelector(".custom-select-wrapper");
  const kindOpts = [...kindWrap.querySelectorAll(".custom-select-option")];
  t(
    "پنج نوع تخلف نمایش داده می‌شود",
    kindOpts.length === 5,
    String(kindOpts.length),
  );
  t(
    "متن گزینه‌ها فارسی است",
    kindOpts[0].textContent.includes("محتوای نامناسب"),
    kindOpts[0].textContent.trim(),
  );
  t(
    "هر گزینه آیکون دارد",
    kindOpts.every((li) => !!li.querySelector(".opt-icon i")),
  );
  const sevWrap = sw.document
    .getElementById("reportSeverity")
    .parentNode.querySelector(".custom-select-wrapper");
  t(
    "مقدار پیش‌فرض اهمیت نمایش داده می‌شود",
    sevWrap.querySelector(".custom-select-trigger").textContent.trim() ===
      "متوسط",
    sevWrap.querySelector(".custom-select-trigger").textContent.trim(),
  );
  t(
    "گزینه پیش‌فرض علامت خورده",
    !!sevWrap.querySelector(".custom-select-option.selected"),
  );

  // Every stylesheet the page links, in page order — what the browser sees.
  const css = styleSource("support.html");
  t("رنگ گزینه خام هم تعیین شد", css.includes(".form-group select option"));
  t(
    "حالت روز برای گزینه خام",
    css.includes('html[data-theme="light"] .form-group select option'),
  );
  t(
    "حالت روز برای گزینه انتخاب‌شده",
    css.includes('html[data-theme="light"] .custom-select-option.selected'),
  );

  section("بارگذاری مدرک به‌جای لینک");
  t(
    "فیلد لینک متنی حذف شد",
    sw.document.getElementById("reportEvidence").type === "hidden",
  );
  t("ورودی فایل اضافه شد", !!sw.document.getElementById("reportEvidenceFile"));
  t(
    "فقط تصویر می‌پذیرد",
    sw.document.getElementById("reportEvidenceFile").getAttribute("accept") ===
      "image/*",
  );
  t(
    "به کاربر گفته شده فقط عکس",
    sw.document
      .getElementById("reportEvidenceHint")
      .textContent.includes("فقط تصویر"),
    sw.document.getElementById("reportEvidenceHint").textContent.trim(),
  );
  t(
    "محدودیت حجم اعلام شده",
    sw.document
      .getElementById("reportEvidenceHint")
      .textContent.includes("۳۰۰"),
  );
  t(
    "دکمه انتخاب تصویر هست",
    !!sw.document.getElementById("reportEvidenceChoose"),
  );
  t(
    "پیش‌نمایش در ابتدا پنهان است",
    sw.document.getElementById("reportEvidencePreview").hidden === true,
  );

  const fileInput = sw.document.getElementById("reportEvidenceFile");
  const hintEl = sw.document.getElementById("reportEvidenceHint");

  // A PDF renamed to .jpg must still be refused: the MIME type is checked.
  Object.defineProperty(fileInput, "files", {
    value: [{ type: "application/pdf", size: 1000, name: "x.jpg" }],
    configurable: true,
  });
  fileInput.dispatchEvent(new sw.Event("change", { bubbles: true }));
  t(
    "فایل غیرتصویری رد می‌شود",
    hintEl.dataset.tone === "error",
    hintEl.dataset.tone,
  );
  t(
    "پیام رد شدن روشن است",
    hintEl.textContent.includes("فقط فایل تصویری"),
    hintEl.textContent.trim(),
  );
  t(
    "مقدار مخفی خالی ماند",
    sw.document.getElementById("reportEvidence").value === "",
  );

  Object.defineProperty(fileInput, "files", {
    value: [{ type: "image/png", size: 500 * 1024, name: "big.png" }],
    configurable: true,
  });
  fileInput.dispatchEvent(new sw.Event("change", { bubbles: true }));
  t("تصویر بزرگ رد می‌شود", hintEl.dataset.tone === "error");
  t(
    "حجم واقعی به کاربر گفته می‌شود",
    hintEl.textContent.includes("۵۰۰"),
    hintEl.textContent.trim(),
  );

  section("اعتبارسنجی فرم گزارش");
  try {
    await sw.__s.appApi.support.reportAbuse({
      reporterName: "",
      reporterEmail: "a@b.c",
      kind: "content",
      subject: "x",
      description: "y",
    });
    t("نام خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("نام خالی رد می‌شود", true);
  }
  try {
    await sw.__s.appApi.support.reportAbuse({
      reporterName: "x",
      reporterEmail: "a@b.c",
      kind: "",
      subject: "x",
      description: "y",
    });
    t("نوع تخلف خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("نوع تخلف خالی رد می‌شود", true);
  }
  try {
    await sw.__s.appApi.support.reportAbuse({
      reporterName: "x",
      reporterEmail: "a@b.c",
      kind: "content",
      subject: "x",
      description: "",
    });
    t("شرح خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("شرح خالی رد می‌شود", true);
  }

  section("شماره‌گذاری گزارش‌ها");
  await sw.__s.appApi.support.reportAbuse({
    reporterName: "ب",
    reporterEmail: "b@x.com",
    kind: "fraud",
    subject: "y",
    description: "z",
  });
  const two = JSON.parse(sstore.irHesabdarReports);
  t("گزارش دوم ثبت شد", two.length === 2);
  t(
    "شناسه‌ها یکتا هستند",
    two[0].id !== two[1].id,
    two.map((r) => r.id).join(","),
  );
  t(
    "شماره افزایشی است",
    parseInt(two[0].id.replace(/\D/g, "")) >
      parseInt(two[1].id.replace(/\D/g, "")),
    two.map((r) => r.id).join(","),
  );

  section("نمایش در تب اعلان‌ها");
  panel = bootPanel({
    irHesabdarOrders: JSON.stringify(orders),
    irHesabdarReports: sstore.irHesabdarReports,
  });
  await wait(900);
  panel.w.__t.renderNotificationsPage();
  const page = panel.doc.getElementById("notificationsPageList");
  t(
    "همه اعلان‌ها رندر شدند",
    page.children.length >= 4,
    String(page.children.length),
  );
  t("گزارش تخلف در صفحه هست", page.textContent.includes("گزارش تخلف"));
  t("پرداخت موفق در صفحه هست", page.textContent.includes("پرداخت موفق"));
  const bell = panel.doc.getElementById("notifBadge");
  t("بج زنگوله عدد دارد", bell.textContent.trim().length > 0, bell.textContent);

  section("ماندگاری اعلان‌ها");
  t("در localStorage ذخیره شدند", !!panel.store.irHesabdarNotifications);
  const persisted = JSON.parse(panel.store.irHesabdarNotifications);
  t(
    "انواع مختلف ذخیره شدند",
    new Set(persisted.map((n) => n.type)).size >= 2,
    [...new Set(persisted.map((n) => n.type))].join(","),
  );

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
