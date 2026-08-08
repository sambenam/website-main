/**
 * Maintenance mode.
 *
 * Run with:  node tests/maintenance.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Rules:
 *   - visitors see a locked screen on every public page
 *   - the admin panel stays reachable
 *   - staff keep browsing the site, with a banner reminding them it is closed
 *   - the locked screen offers a way back into the panel
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  pageScripts,
  readScripts,
} = require("./helpers/page-scripts.js");

const ROOT = path.join(__dirname, "..");
let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  \u2713 " + n))
    : (f++, console.log("  \u2717 " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

function visit(
  page,
  { maintenance = false, settings = null, session = null } = {},
) {
  const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
  const dom = new JSDOM(html, {
    url: `http://localhost/html/${page}`,
    runScripts: "outside-only",
  });
  const w = dom.window;
  const store = {};
  if (maintenance) store.irHesabdarMaintenanceMode = "true";
  if (settings) store.irHesabdarSystemSettings = JSON.stringify(settings);
  if (session) store.hesabyarSession = JSON.stringify(session);
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
    value: { log() {}, warn() {}, error() {} },
    configurable: true,
  });
  w.appApi = {
    auth: { logout: async () => {} },
    admin: { settings: { get: async () => ({}) } },
  };
  w.eval(fs.readFileSync(path.join(ROOT, "scripts/app-shell.js"), "utf8"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  const body = w.document.body.innerHTML;
  return {
    w,
    locked: body.includes("در دست تعمیر"),
    banner: !!w.document.getElementById("maintenanceBanner"),
  };
}

const MANAGER = {
  token: "t",
  isAdmin: true,
  user: { name: "مدیر", role: "مدیر سایت" },
};
const ADMIN = {
  token: "t",
  isAdmin: true,
  user: { name: "ادمین", role: "ادمین" },
};
const CUSTOMER = { token: "t", user: { name: "سام", role: "کاربر عادی" } };

section("خاموش - سایت عادی است");
t("صفحه اصلی باز است", !visit("index.html").locked);
t("نوار هشدار نیست", !visit("index.html").banner);

section("روشن - بازدیدکننده قفل می‌شود");
const PUBLIC = [
  "index.html",
  "list-page.html",
  "single-post.html",
  "checkout.html",
  "gateway.html",
  "receipt.html",
  "sign-up.html",
  "support.html",
  "about-us.html",
  "user-profile.html",
];
for (const page of PUBLIC) {
  t(page, visit(page, { maintenance: true }).locked);
}

section("پنل مدیریت همیشه در دسترس است");
t("admin.html قفل نمی‌شود", !visit("admin.html", { maintenance: true }).locked);

section("کارکنان می‌توانند سایت را ببینند");
const mgr = visit("index.html", { maintenance: true, session: MANAGER });
t("مدیر قفل نمی‌شود", !mgr.locked);
t("مدیر نوار هشدار می‌بیند", mgr.banner);

const adm = visit("index.html", { maintenance: true, session: ADMIN });
t("ادمین هم قفل نمی‌شود", !adm.locked);
t("ادمین نوار هشدار می‌بیند", adm.banner);

const cust = visit("index.html", { maintenance: true, session: CUSTOMER });
t("کاربر عادی قفل می‌شود", cust.locked, "حساب داشتن کافی نیست");
t("کاربر عادی نوار نمی‌بیند", !cust.banner);

section("محتوای نوار هشدار");
const bar = mgr.w.document.getElementById("maintenanceBanner");
t("متن توضیحی دارد", bar.textContent.includes("بسته"));
t("لینک غیرفعال کردن دارد", bar.innerHTML.includes("admin.html"));
t("صفحه را پایین می‌برد", mgr.w.document.body.style.paddingTop === "38px");

section("صفحه قفل");
const locked = visit("index.html", {
  maintenance: true,
  settings: { supportEmail: "help@mysite.ir" },
});
t(
  "ایمیل پشتیبانی تنظیم‌شده",
  locked.w.document.body.innerHTML.includes("help@mysite.ir"),
);
t(
  "راه بازگشت به پنل دارد",
  locked.w.document.body.innerHTML.includes("ورود مدیران"),
);
t("اسکرول قفل است", locked.w.document.body.style.overflow === "hidden");

section("منبع پرچم");
t(
  "از کلید اختصاصی می‌خواند",
  visit("index.html", { maintenance: true }).locked,
);
t(
  "از آبجکت تنظیمات هم می‌خواند",
  visit("index.html", { settings: { maintenanceMode: true } }).locked,
);
t(
  "تنظیمات خراب سایت را قفل نمی‌کند",
  (() => {
    const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
    const dom = new JSDOM(html, {
      url: "http://localhost/html/index.html",
      runScripts: "outside-only",
    });
    const w = dom.window;
    const store = { irHesabdarSystemSettings: "{ broken json" };
    Object.defineProperty(w, "localStorage", {
      value: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: () => {},
        removeItem: () => {},
      },
      configurable: true,
    });
    Object.defineProperty(w, "console", {
      value: { log() {}, warn() {}, error() {} },
      configurable: true,
    });
    w.appApi = {
      auth: { logout: async () => {} },
      admin: { settings: { get: async () => ({}) } },
    };
    w.eval(fs.readFileSync(path.join(ROOT, "scripts/app-shell.js"), "utf8"));
    w.document.dispatchEvent(
      new w.Event("DOMContentLoaded", { bubbles: true }),
    );
    return !w.document.body.innerHTML.includes("در دست تعمیر");
  })(),
);

section("جای نوار هشدار در پنل");
{
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
    irHesabdarMaintenanceMode: "true",
  };
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
  w.appApi = {
    auth: { logout: async () => {} },
    admin: {
      users: { list: async () => [] },
      products: { list: async () => [] },
      orders: { list: async () => [] },
      messages: { list: async () => [] },
      settings: { get: async () => ({}), save: async () => ({}) },
    },
  };

  const FILES = adminScripts(["home-sections.js"]);
  w.eval(
    FILES.map((x) =>
      fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
    ).join("\n;\n"),
  );
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));

  const bar = w.document.getElementById("adminMaintenanceNotice");
  t("نوار در پنل ساخته شد", !!bar);
  t(
    "داخل بخش محتواست",
    !!bar && !!bar.closest(".main-content"),
    "در <body> زیر سایدبار ثابت پنهان می‌شد",
  );
  t("زیر سایدبار نیست", !!bar && !bar.closest(".sidebar"));
  t(
    "بعد از هدر بالایی است",
    !!bar &&
      bar.previousElementSibling &&
      bar.previousElementSibling.classList.contains("top-header"),
    "وگرنه نوار جستجو را می‌پوشاند",
  );
  t(
    "متن کامل دارد",
    !!bar && bar.querySelector("span").textContent.includes("بازدیدکنندگان"),
  );
  t("دکمه غیرفعال کردن دارد", !!bar && !!bar.querySelector("button"));

  w.showToast = () => {};
  bar
    .querySelector("button")
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t(
    "کلیک، حالت تعمیر را خاموش می‌کند",
    store.irHesabdarMaintenanceMode === "false",
  );
  t(
    "نوار پس از خاموش شدن حذف می‌شود",
    !w.document.getElementById("adminMaintenanceNotice"),
  );
  t(
    "تیک فرم تنظیمات هم برداشته می‌شود",
    w.document.getElementById("setMaintenanceMode")?.checked === false,
  );
}

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
