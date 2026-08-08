/**
 * Global search — the box in the panel header.
 *
 * Run with:  node tests/global-search.test.js
 *
 * It had a placeholder and no behaviour: typing in it did nothing at all.
 * It searches every list the panel holds now - users, staff, products,
 * orders, site content and messages - and each result opens the same modal
 * its own tab uses.
 *
 * The rule that matters most here is privacy: the users tab masks phone
 * numbers for a restricted operator, so search must not become a side door
 * that confirms a number by matching on it.
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
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

const USERS = [
  {
    id: 1,
    name: "سام به‌نام",
    email: "sam@x.com",
    phone: "09121112233",
    role: "مدیر سایت",
    status: "فعال",
  },
  {
    id: 2,
    name: "محمد رضایی",
    email: "mo@x.com",
    phone: "09122223344",
    role: "ادمین",
    status: "فعال",
  },
  {
    id: 3,
    name: "زهرا کریمی",
    email: "zahra@x.com",
    phone: "09129998877",
    role: "کاربر عادی",
    status: "فعال",
  },
];
const PRODUCTS = [
  {
    id: "acc-101",
    name: "دوره حسابداری مقدماتی",
    price: 490000,
    category: "pdf",
  },
];
const ORDERS = [
  {
    id: "#۷۰۱",
    customer: "زهرا کریمی",
    product: "دوره حسابداری مقدماتی",
    amount: 490000,
    date: "۱۴۰۵/۰۵/۰۶",
    status: "success",
    buyerEmail: "zahra@x.com",
  },
];
const MESSAGES = [
  {
    id: "m1",
    sender: "علی احمدی",
    email: "ali@x.com",
    text: "سوالی درباره دوره حسابداری دارم",
    time: "۱۴۰۵/۰۵/۰۶",
    unread: true,
    source: "contact",
    history: [],
  },
];

function boot(role) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const me = USERS.find((u) => u.role === role) || USERS[0];
  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: me.id, name: me.name, email: me.email, role: role },
    }),
    irHesabdarUsers: JSON.stringify(USERS),
    irHesabdarProducts: JSON.stringify(PRODUCTS),
    irHesabdarOrders: JSON.stringify(ORDERS),
    irHesabdarMessages: JSON.stringify(MESSAGES),
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
  const FILES = adminScripts();
  const src = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__t = {
    globalSearchResults, renderGlobalSearch, runGlobalSearchItem,
    moveGlobalSearchFocus, closeGlobalSearch, searchNormalize, isManager,
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
const typeIn = async (w, doc, value) => {
  const input = doc.getElementById("globalSearch");
  input.value = value;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  await wait(220);
};
const groupNames = (doc) =>
  [
    ...doc.querySelectorAll(".global-search__group .global-search__head span"),
  ].map((el) => el.textContent.trim());
const titles = (doc) =>
  [...doc.querySelectorAll(".global-search__item strong")].map(
    (el) => el.textContent,
  );

(async () => {
  let { w, doc } = boot("مدیر سایت");

  section("کادر جستجو");
  const input = doc.getElementById("globalSearch");
  const panel = doc.getElementById("globalSearchResults");
  t("کادر وجود دارد", !!input);
  t("پنل نتایج اضافه شد", !!panel);
  t("راهنمای دسترس‌پذیری دارد", !!input.getAttribute("aria-label"));
  t(
    "تکمیل خودکار مرورگر خاموش است",
    input.getAttribute("autocomplete") === "off",
  );
  t("در ابتدا بسته است", !panel.classList.contains("is-open"));

  section("جستجو در همه بخش‌ها");
  await typeIn(w, doc, "حسابداری");
  const names = groupNames(doc);
  t("پنل باز شد", panel.classList.contains("is-open"));
  t("محصولات پیدا شد", names.includes("محصولات"), names.join(", "));
  t("سفارشات پیدا شد", names.includes("سفارشات"), names.join(", "));
  t("محتوای سایت پیدا شد", names.includes("محتوای سایت"), names.join(", "));
  t("پیام‌ها پیدا شد", names.includes("پیام‌ها"), names.join(", "));

  await typeIn(w, doc, "زهرا");
  t(
    "کاربر با نام پیدا می‌شود",
    titles(doc).includes("زهرا کریمی"),
    titles(doc).join(" | "),
  );
  t("سفارش همان کاربر هم می‌آید", titles(doc).includes("#۷۰۱"));

  await typeIn(w, doc, "mo@x.com");
  t(
    "جستجو با ایمیل کار می‌کند",
    titles(doc).includes("محمد رضایی"),
    titles(doc).join(" | "),
  );
  t(
    "عضو مدیریت زیر گروه درست است",
    groupNames(doc).includes("مدیریت دسترسی‌ها"),
    groupNames(doc).join(", "),
  );

  await typeIn(w, doc, "acc-101");
  t("جستجو با شناسه محصول", titles(doc).includes("دوره حسابداری مقدماتی"));

  section("ارقام فارسی و انگلیسی یکی حساب می‌شوند");
  await typeIn(w, doc, "۷۰۱");
  t(
    "با ارقام فارسی پیدا می‌شود",
    titles(doc).includes("#۷۰۱"),
    titles(doc).join(" | "),
  );
  await typeIn(w, doc, "701");
  t(
    "با ارقام انگلیسی هم پیدا می‌شود",
    titles(doc).includes("#۷۰۱"),
    titles(doc).join(" | "),
  );

  section("املای عربی و فارسی یکی حساب می‌شوند");
  await typeIn(w, doc, "کريمي"); // ي عربی به‌جای ی فارسی
  t(
    "ي عربی با ی فارسی می‌خواند",
    titles(doc).includes("زهرا کریمی"),
    titles(doc).join(" | "),
  );
  await typeIn(w, doc, "كريمي"); // ك عربی هم
  t(
    "ك عربی با ک فارسی می‌خواند",
    titles(doc).includes("زهرا کریمی"),
    titles(doc).join(" | "),
  );

  section("حریم خصوصی شماره تلفن");
  // The users tab masks phone numbers for anyone who is not a manager.
  // Search must not become a way around that: matching on a full number
  // would confirm it digit by digit.
  const mgr = boot("مدیر سایت");
  const adm = boot("ادمین");
  t(
    "مدیر می‌تواند با شماره جستجو کند",
    mgr.w.__t.globalSearchResults("09129998877").length > 0,
  );
  t(
    "ادمین نمی‌تواند با شماره جستجو کند",
    adm.w.__t.globalSearchResults("09129998877").length === 0,
    "شماره نباید از این راه قابل تأیید باشد",
  );
  t(
    "ادمین همچنان با نام جستجو می‌کند",
    adm.w.__t.globalSearchResults("زهرا").length > 0,
  );
  const admUserHit = adm.w.__t
    .globalSearchResults("زهرا")
    .find((g) => g.type === "user");
  t(
    "ادمین دکمه ویرایش کاربر نمی‌گیرد",
    admUserHit && admUserHit.items[0].action === null,
    String(admUserHit && admUserHit.items[0].action),
  );
  const mgrUserHit = mgr.w.__t
    .globalSearchResults("زهرا")
    .find((g) => g.type === "user");
  t("مدیر دکمه ویرایش می‌گیرد", mgrUserHit && !!mgrUserHit.items[0].action);

  section("کلیک روی نتیجه");
  ({ w, doc } = boot("مدیر سایت"));
  await typeIn(w, doc, "۷۰۱");
  const first = doc.querySelector(".global-search__item");
  t(
    "نتیجه تب مقصد را می‌داند",
    first.getAttribute("data-view") === "orders",
    first.getAttribute("data-view"),
  );
  first.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(200);
  t(
    "به تب سفارشات رفت",
    doc.getElementById("view-orders").classList.contains("active"),
  );
  t(
    "مودال جزئیات باز شد",
    doc.getElementById("orderDetailModal").classList.contains("active"),
  );
  t("کادر جستجو خالی شد", doc.getElementById("globalSearch").value === "");
  t(
    "پنل بسته شد",
    !doc.getElementById("globalSearchResults").classList.contains("is-open"),
  );

  section("کلیک روی محصول");
  ({ w, doc } = boot("مدیر سایت"));
  await typeIn(w, doc, "acc-101");
  doc
    .querySelector(".global-search__item")
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(200);
  t(
    "به تب محصولات رفت",
    doc.getElementById("view-products").classList.contains("active"),
  );
  t(
    "مودال ویرایش محصول باز شد",
    doc.getElementById("editProductModal").classList.contains("active"),
  );

  section("کار با صفحه‌کلید");
  ({ w, doc } = boot("مدیر سایت"));
  const inp = doc.getElementById("globalSearch");
  await typeIn(w, doc, "حسابداری");
  inp.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  t(
    "فلش پایین یک نتیجه را فعال می‌کند",
    !!doc.querySelector(".global-search__item.is-active"),
  );
  inp.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  const activeIdx = [...doc.querySelectorAll(".global-search__item")].findIndex(
    (el) => el.classList.contains("is-active"),
  );
  t("فلش دوباره به بعدی می‌رود", activeIdx === 1, String(activeIdx));
  inp.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
  );
  t(
    "فلش بالا برمی‌گردد",
    [...doc.querySelectorAll(".global-search__item")].findIndex((el) =>
      el.classList.contains("is-active"),
    ) === 0,
  );
  inp.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  t(
    "Escape پنل را می‌بندد",
    !doc.getElementById("globalSearchResults").classList.contains("is-open"),
  );

  await typeIn(w, doc, "acc-101");
  inp.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await wait(200);
  t(
    "Enter اولین نتیجه را باز می‌کند",
    doc.getElementById("view-products").classList.contains("active"),
  );

  section("موارد مرزی");
  ({ w, doc } = boot("مدیر سایت"));
  await typeIn(w, doc, "ز");
  t(
    "یک حرف جستجو نمی‌شود",
    doc
      .getElementById("globalSearchResults")
      .textContent.includes("حداقل دو حرف"),
    doc.getElementById("globalSearchResults").textContent.trim(),
  );
  await typeIn(w, doc, "zzzzzzz");
  t(
    "نتیجه خالی پیام می‌دهد",
    doc.getElementById("globalSearchResults").textContent.includes("پیدا نشد"),
  );
  await typeIn(w, doc, "");
  t(
    "کادر خالی پنل را می‌بندد",
    !doc.getElementById("globalSearchResults").classList.contains("is-open"),
  );
  await typeIn(w, doc, "   ");
  t(
    "فقط فاصله جستجو نمی‌شود",
    doc.querySelectorAll(".global-search__item").length === 0,
  );

  section("امنیت نمایش");
  await typeIn(w, doc, "<img src=x onerror=alert(1)>");
  const html = doc.getElementById("globalSearchResults").innerHTML;
  t(
    "عبارت خطرناک اجرا نمی‌شود",
    !html.includes("<img src=x"),
    html.slice(0, 90),
  );
  t(
    "متن امن نمایش داده می‌شود",
    html.includes("&lt;img") || html.includes("پیدا نشد"),
  );

  section("نرمال‌سازی");
  t("ارقام فارسی به انگلیسی", w.__t.searchNormalize("۱۲۳") === "123");
  t("حروف بزرگ کوچک می‌شوند", w.__t.searchNormalize("ABC") === "abc");
  t("فاصله اضافه حذف می‌شود", w.__t.searchNormalize("  a   b  ") === "a b");
  t("مقدار خالی خطا نمی‌دهد", w.__t.searchNormalize(null) === "");

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
