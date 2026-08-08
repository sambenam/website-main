/**
 * Admin/manager profile — editing your own details, and who gets told.
 *
 * Run with:  node tests/profile.test.js
 *
 * The rules:
 *   - the avatar in the header and the card in the sidebar both open پروفایل
 *   - an admin or a manager can edit their own profile
 *   - every edit raises a notification that ONLY managers can see
 *   - every edit is written to the access-management audit trail
 *
 * Two bugs this exists to prevent coming back:
 *   1. pushAdminNotification() returned null when the signed-in operator was
 *      not allowed to *see* the type. Creating a record and being allowed to
 *      read it are different things, so an admin editing their own profile
 *      produced no record and the managers never found out - exactly the
 *      case the feature is for.
 *   2. The audit entry was written inside an 8-second timer that only fires
 *      for a manager who opens the staff tab in the same session, so the
 *      trail could be lost entirely.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  pageScripts,
  readScripts,
  adminSource,
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

const USERS = [
  {
    id: 1,
    name: "سام به‌نام",
    email: "sam@x.com",
    phone: "09121111111",
    role: "مدیر سایت",
    status: "فعال",
  },
  {
    id: 2,
    name: "محمد رضایی",
    email: "mo@x.com",
    phone: "09122222222",
    role: "ادمین",
    status: "فعال",
  },
];

function boot(role, myId, seed) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const me = USERS.find((u) => u.id === myId) || USERS[0];
  const store = Object.assign(
    {
      hesabyarSession: JSON.stringify({
        token: "t",
        isAdmin: true,
        user: { id: myId, name: me.name, email: me.email, role: role },
      }),
      irHesabdarUsers: JSON.stringify(USERS),
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
    applyStaffProfileChanges, pushAdminNotification, visibleNotifications,
    canReceiveNotification, currentNotificationRole, recordStaffChange,
    switchView, renderStaffTable, openStaffAuditModal, editStaff,
    loadAdminNotifications, persistAdminNotifications,
    get notifications() { return appState.notifications; },
    set notifications(v) { appState.notifications = v; },
    get staffLogs() { return staffAuditLogs; },
    get users() { return appState.users; },
    set curId(v) { currentStaffProfileId = v; },
    get curId() { return currentStaffProfileId; },
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

/* ------------------------------------------------------------- entry points */
section("دو راه ورود به پروفایل");
let { w, doc, store } = boot("مدیر سایت", 1);
const headerBtn = doc.getElementById("profileHeaderBtn");
const sidebarCard = doc.getElementById("userProfileTrigger");
t("آیکون آدمک بالا سمت چپ هست", !!headerBtn);
t("کارت پروفایل پایین سایدبار هست", !!sidebarCard);
t(
  "آیکون بالا به پروفایل می‌رود",
  (headerBtn.getAttribute("onclick") || "").includes("switchView('profile')"),
  headerBtn.getAttribute("onclick"),
);
t(
  "کارت پایین به پروفایل می‌رود",
  (sidebarCard.getAttribute("onclick") || "").includes("switchView('profile')"),
  sidebarCard.getAttribute("onclick"),
);

w.__t.switchView("profile");
t(
  "تب پروفایل باز می‌شود",
  doc.getElementById("view-profile").classList.contains("active"),
);
t("فرم ویرایش دارد", !!doc.getElementById("settingsAdminForm"));
t("فیلد نام", !!doc.getElementById("setAdminName"));
t("فیلد ایمیل", !!doc.getElementById("profileEmail"));
t("فیلد تلفن", !!doc.getElementById("profilePhone"));
t("بخش تغییر رمز", !!doc.getElementById("setAdminPassword"));

/* --------------------------------------------------- admin edits own profile */
section("ادمین پروفایل خودش را تغییر می‌دهد");
({ w, doc, store } = boot("ادمین", 2));
w.__t.curId = 2;
t(
  "نقش ادمین تشخیص داده شد",
  w.__t.currentNotificationRole() === "ادمین",
  w.__t.currentNotificationRole(),
);

const beforeCount = w.__t.notifications.filter(
  (n) => n.type === "staff",
).length;
w.__t.applyStaffProfileChanges(2, {
  name: "محمد رضایی‌منش",
  phone: "09129999999",
});
const staffNotifs = w.__t.notifications.filter((n) => n.type === "staff");

t(
  "اعلان ساخته شد",
  staffNotifs.length === beforeCount + 1,
  `${beforeCount} -> ${staffNotifs.length}`,
);
t("نوع اعلان staff است", staffNotifs[0].type === "staff");
t(
  "نام ادمین در اعلان هست",
  staffNotifs[0].desc.includes("محمد رضایی"),
  staffNotifs[0].desc,
);
t(
  "موارد تغییرکرده ذکر شده",
  staffNotifs[0].details["موارد تغییرکرده"].includes("نام کاربری"),
  staffNotifs[0].details["موارد تغییرکرده"],
);
t(
  "جزئیات قبل و بعد دارد",
  staffNotifs[0].details["جزئیات تغییرات"].includes("→"),
  staffNotifs[0].details["جزئیات تغییرات"],
);
t("نقش در جزئیات ثبت شد", staffNotifs[0].details["نقش"] === "ادمین");

section("خودِ ادمین این اعلان را نمی‌بیند");
t(
  "در فهرست قابل مشاهده ادمین نیست",
  w.__t.visibleNotifications().filter((n) => n.type === "staff").length === 0,
  String(w.__t.visibleNotifications().filter((n) => n.type === "staff").length),
);
t(
  "ولی در انبار ثبت شده",
  w.__t.notifications.filter((n) => n.type === "staff").length === 1,
);
t("در localStorage ماندگار شد", !!store.irHesabdarNotifications);

section("ثبت در مدیریت دسترسی‌ها");
const logs = w.__t.staffLogs[2] || [];
t("لاگ نوشته شد", logs.length === 2, String(logs.length));
t(
  "برای هر فیلد یک ردیف",
  logs.length === 2,
  logs.map((l) => l.text).join(" | "),
);
t("تکراری ثبت نشده", new Set(logs.map((l) => l.text)).size === logs.length);
t(
  "مقدار قبل ثبت شده",
  logs.every((l) => l.change && l.change.before),
  JSON.stringify(logs[0].change),
);
t(
  "مقدار بعد ثبت شده",
  logs.every((l) => l.change && l.change.after),
);
t(
  "نام کاربری در لاگ",
  logs.some((l) => l.change.label === "نام کاربری"),
);
t(
  "تلفن در لاگ",
  logs.some((l) => l.change.label === "تلفن همراه"),
);
t("بلافاصله ذخیره شد، نه با تأخیر", !!store.irHesabdarStaffAuditLogs);

/* ------------------------------------------------ manager sees what admin did */
section("مدیر وارد می‌شود و اعلان را می‌بیند");
const carried = {
  irHesabdarNotifications: store.irHesabdarNotifications,
  irHesabdarStaffAuditLogs: store.irHesabdarStaffAuditLogs,
};
const mgr = boot("مدیر سایت", 1, carried);
t(
  "مدیر اعلان را می‌بیند",
  mgr.w.__t.visibleNotifications().filter((n) => n.type === "staff").length ===
    1,
  String(
    mgr.w.__t.visibleNotifications().filter((n) => n.type === "staff").length,
  ),
);
t(
  "لاگ پس از ورود مجدد باقی است",
  (mgr.w.__t.staffLogs[2] || []).length === 2,
  String((mgr.w.__t.staffLogs[2] || []).length),
);
t(
  "اعلان بعد از رفرش گم نمی‌شود",
  mgr.w.__t.notifications.some((n) => n.type === "staff"),
);

section("مدیر پروفایل خودش را تغییر می‌دهد");
const m2 = boot("مدیر سایت", 1);
m2.w.__t.curId = 1;
m2.w.__t.applyStaffProfileChanges(1, { name: "سام به‌نام جدید" });
t(
  "اعلان برای تغییر مدیر هم ساخته می‌شود",
  m2.w.__t.notifications.filter((n) => n.type === "staff").length === 1,
);
t(
  "مدیر آن را می‌بیند",
  m2.w.__t.visibleNotifications().filter((n) => n.type === "staff").length ===
    1,
);
t(
  "نقش مدیر در جزئیات",
  m2.w.__t.notifications.find((n) => n.type === "staff").details["نقش"] ===
    "مدیر",
);
t("لاگ مدیر هم ثبت شد", (m2.w.__t.staffLogs[1] || []).length === 1);

/* --------------------------------------------------------- visibility policy */
section("قانون دسترسی اعلان‌ها");
const adminView = boot("ادمین", 2);
t(
  "ادمین اعلان staff نمی‌بیند",
  adminView.w.__t.canReceiveNotification({ type: "staff" }) === false,
);
t(
  "ادمین اعلان report نمی‌بیند",
  adminView.w.__t.canReceiveNotification({ type: "report" }) === false,
);
t(
  "ادمین اعلان سفارش می‌بیند",
  adminView.w.__t.canReceiveNotification({ type: "purchase" }) === true,
);
t(
  "ادمین اعلان کاربر جدید می‌بیند",
  adminView.w.__t.canReceiveNotification({ type: "user" }) === true,
);
t(
  "ادمین اعلان حذف حساب می‌بیند",
  adminView.w.__t.canReceiveNotification({ type: "deletion" }) === true,
);
const mgrView = boot("مدیر سایت", 1);
t(
  "مدیر همه انواع را می‌بیند",
  ["staff", "report", "purchase", "user", "deletion"].every((type) =>
    mgrView.w.__t.canReceiveNotification({ type }),
  ),
);

/* ------------------------------------------------------------- edge cases */
section("موارد مرزی");
const e1 = boot("ادمین", 2);
e1.w.__t.curId = 2;
e1.w.__t.applyStaffProfileChanges(2, { name: "محمد رضایی" }); // same as current
t(
  "تغییر بدون تفاوت اعلان نمی‌سازد",
  e1.w.__t.notifications.filter((n) => n.type === "staff").length === 0,
  String(e1.w.__t.notifications.filter((n) => n.type === "staff").length),
);
t("لاگ هم نمی‌نویسد", (e1.w.__t.staffLogs[2] || []).length === 0);

e1.w.__t.applyStaffProfileChanges(2, { name: "   " });
t(
  "مقدار خالی نادیده گرفته می‌شود",
  e1.w.__t.notifications.filter((n) => n.type === "staff").length === 0,
);

e1.w.__t.applyStaffProfileChanges(999, { name: "کاربر ناموجود" });
t(
  "کاربر ناموجود خطا نمی‌دهد",
  e1.w.__t.notifications.filter((n) => n.type === "staff").length === 0,
);

section("چند تغییر پشت سر هم");
const e2 = boot("ادمین", 2);
e2.w.__t.curId = 2;
e2.w.__t.applyStaffProfileChanges(2, { email: "new1@x.com" });
e2.w.__t.applyStaffProfileChanges(2, { phone: "09120000000" });
t(
  "هر تغییر اعلان جدا دارد",
  e2.w.__t.notifications.filter((n) => n.type === "staff").length === 2,
  String(e2.w.__t.notifications.filter((n) => n.type === "staff").length),
);
t(
  "هر تغییر ردیف لاگ جدا دارد",
  (e2.w.__t.staffLogs[2] || []).length === 2,
  String((e2.w.__t.staffLogs[2] || []).length),
);

section("داده آزمایشی ساختگی حذف شد");
const clean = boot("مدیر سایت", 1);
t(
  "لاگ تغییرات از ابتدا خالی است",
  Object.keys(clean.w.__t.staffLogs).length === 0,
  JSON.stringify(Object.keys(clean.w.__t.staffLogs)),
);
t(
  "اعلان‌های نمونه ساخته نمی‌شوند",
  clean.w.__t.notifications.length === 0,
  String(clean.w.__t.notifications.length),
);

const src = adminSource();
t(
  "بلوک اعلان‌های آزمایشی حذف شد",
  !src.includes("گزارش آزمایشی برای بررسی سیستم اعلان"),
);
t("اعلان‌ها پاک نمی‌شوند", !src.includes("appState.notifications = [];"));
t("اعلان‌ها ماندگار می‌شوند", src.includes("persistAdminNotifications"));

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
