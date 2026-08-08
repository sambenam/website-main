/**
 * A customer editing their own profile must show up in the users tab.
 *
 * Run with:  node tests/profile-sync.test.js
 *
 * Three defects this locks down:
 *
 *   1. /profile/update only wrote the profile copy, so the account record
 *      kept the old name and the panel showed stale details for ever.
 *   2. The panel's live-update handler assigned the raw storage payload to
 *      appState.users. That payload is only the admin store, so every
 *      account created on the public site vanished from the list until the
 *      next reload.
 *   3. The handler watched irHesabdarUsers only. A customer editing their
 *      own profile writes hesabyarApiState, so an open panel never noticed.
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MANAGER = {
  token: "t",
  isAdmin: true,
  user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
};

/** Boot the admin panel; everything runs against one api.js instance. */
function bootPanel(store) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
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
    appApi, renderUsersTable,
    get users() { return appState.users; }, set users(v) { appState.users = v; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 130));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  return w;
}
const tableText = (w) =>
  w.document.getElementById("usersManageTable").textContent;

(async () => {
  /* ------------------------------------------------------- API level */
  section("۱. ویرایش پروفایل به رکورد حساب می‌رسد");
  {
    const store = {};
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    };
    global.window = undefined;
    delete require.cache[require.resolve("../scripts/api.js")];
    const { appApi } = require("../scripts/api.js");

    await appApi.auth.register({
      name: "زهرا کریمی",
      email: "z@t.com",
      password: "12345678",
      phone: "09121112233",
    });
    await appApi.profile.update({
      name: "زهرا کریمی‌نژاد",
      phone: "09129998877",
      address: "تهران",
    });

    const row = (await appApi.admin.users.list()).find(
      (u) => u.email === "z@t.com",
    );
    t("نام تازه در لیست کاربران", row.name === "زهرا کریمی‌نژاد", row.name);
    t("تلفن تازه در لیست کاربران", row.phone === "09129998877", row.phone);
    t(
      "سشن کاربر هم به‌روز شد",
      (await appApi.auth.me()).name === "زهرا کریمی‌نژاد",
    );

    section("تغییر ایمیل، ردیف تکراری نمی‌سازد");
    await appApi.profile.update({ email: "zahra.new@t.com" });
    const all = await appApi.admin.users.list();
    t(
      "همچنان یک ردیف",
      all.filter((u) => String(u.id) === String(row.id)).length === 1,
    );
    t(
      "ایمیل تازه دیده می‌شود",
      all.some((u) => u.email === "zahra.new@t.com"),
    );
    t("ایمیل قدیمی نمانده", !all.some((u) => u.email === "z@t.com"));

    section("وضعیت و نقش دست کاربر نیست");
    // The account owns its identity; the panel owns moderation fields.
    await appApi.admin.users.updateStatus(row.id, "غیرفعال");
    const moderated = (await appApi.admin.users.list()).find(
      (u) => String(u.id) === String(row.id),
    );
    t(
      "وضعیت تعیین‌شده مدیر حفظ می‌شود",
      moderated.status === "غیرفعال",
      moderated.status,
    );
    t(
      "نام ویرایش‌شده کاربر هم حفظ می‌شود",
      moderated.name === "زهرا کریمی‌نژاد",
    );
  }

  /* ----------------------------------------------------- panel, reload */
  section("۲. مدیر پنل را باز می‌کند و تغییر را می‌بیند");
  {
    const store = { hesabyarSession: JSON.stringify(MANAGER) };
    let w = bootPanel(store);
    await wait(900);
    await w.__t.appApi.auth.register({
      name: "سارا نوری",
      email: "s@t.com",
      password: "12345678",
      phone: "09121110000",
    });
    await w.__t.appApi.profile.update({
      name: "سارا نوری‌زاده",
      phone: "09127770000",
    });
    store.hesabyarSession = JSON.stringify(MANAGER);

    // Fresh load, as if the manager opened the panel afterwards.
    w = bootPanel(store);
    await wait(900);
    w.__t.renderUsersTable();
    t(
      "نام ویرایش‌شده در جدول",
      tableText(w).includes("نوری‌زاده"),
      "نام قدیمی مانده",
    );
    t("تلفن ویرایش‌شده در جدول", tableText(w).includes("۰۹۱۲۷۷۷۰۰۰۰"));
  }

  /* --------------------------------------------------- panel, live tab */
  section("۳. پنل باز است و کاربر در تب دیگر پروفایلش را عوض می‌کند");
  {
    const store = { hesabyarSession: JSON.stringify(MANAGER) };
    const w = bootPanel(store);
    await wait(900);

    await w.__t.appApi.auth.register({
      name: "کاوه رضایی",
      email: "k@t.com",
      password: "12345678",
      phone: "09121112233",
    });
    w.__t.users = await w.__t.appApi.admin.users.list();
    w.__t.renderUsersTable();
    const before = w.__t.users.length;
    t("کاربر تازه در پنل دیده می‌شود", tableText(w).includes("کاوه رضایی"));

    await w.__t.appApi.profile.update({
      name: "کاوه رضایی‌فر",
      phone: "09129998877",
    });
    store.hesabyarSession = JSON.stringify(MANAGER);

    // The browser fires this in the open panel tab. A profile edit touches
    // hesabyarApiState, not irHesabdarUsers - the handler used to ignore it.
    const event = new w.Event("storage");
    event.key = "hesabyarApiState";
    event.newValue = store.hesabyarApiState;
    w.dispatchEvent(event);
    await wait(500);

    t(
      "جدول بدون رفرش به‌روز شد",
      tableText(w).includes("رضایی‌فر"),
      "هنوز نام قدیمی را نشان می‌دهد",
    );
    t("تلفن تازه هم آمد", tableText(w).includes("۰۹۱۲۹۹۹۸۸۷۷"));
    t(
      "هیچ کاربری گم نشد",
      w.__t.users.length === before,
      `${before} -> ${w.__t.users.length}`,
    );
    t("کاربران نمونه سر جایشان هستند", tableText(w).includes("علی احمدی"));
  }

  section("۴. رویداد انبار پنل هم همچنان کار می‌کند");
  {
    const store = { hesabyarSession: JSON.stringify(MANAGER) };
    const w = bootPanel(store);
    await wait(900);
    w.__t.users = await w.__t.appApi.admin.users.list();
    const before = w.__t.users.length;

    const event = new w.Event("storage");
    event.key = "irHesabdarUsers";
    event.newValue = store.irHesabdarUsers || "[]";
    w.dispatchEvent(event);
    await wait(400);
    t(
      "کاربران سایت حذف نمی‌شوند",
      w.__t.users.length >= before,
      `${before} -> ${w.__t.users.length}`,
    );
  }

  section("۵. کد در برابر بازگشت باگ محافظت شده");
  {
    const src = adminSource();
    t(
      "هر دو کلید پایش می‌شوند",
      src.includes('event.key === "hesabyarApiState"'),
    );
    t(
      "از appApi می‌خواند نه از payload خام",
      /event\.key === "irHesabdarUsers"[\s\S]{0,900}appApi\.admin\.users\s*\n?\s*\.list\(\)/.test(
        src,
      ),
    );
    t(
      "جدول پس از دریافت رندر می‌شود",
      /appApi\.admin\.users[\s\S]{0,600}renderUsersTable\(\)/.test(src),
    );
  }

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
