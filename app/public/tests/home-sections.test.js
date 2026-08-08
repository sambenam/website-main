/**
 * Custom home-page sections.
 *
 * Run with:  node tests/home-sections.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Rules:
 *   - the hero and learning-path sections are fixed and cannot be displaced
 *   - a custom section is placed after a chosen built-in section
 *   - it gets its own category so items can be assigned to it
 *   - deleting a section leaves its items alone
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { adminScripts, pageScripts } = require("./helpers/page-scripts.js");

const ROOT = path.join(__dirname, "..");
let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  \u2713 " + n))
    : (f++, console.log("  \u2717 " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

function bootAdmin(stored, addedItems) {
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
      user: { id: 1, role: "مدیر سایت" },
    }),
  };
  if (stored) store.irHesabdarHomeSections = JSON.stringify(stored);
  if (addedItems) store.irHesabdarAddedItems = JSON.stringify(addedItems);
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
    content: { update: async () => ({}), remove: async () => ({}) },
    admin: {
      users: { list: async () => [] },
      products: {
        list: async () => [],
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
      },
      orders: { list: async () => [] },
      messages: { list: async () => [] },
      settings: { get: async () => ({}), save: async () => ({}) },
    },
  };

  const FILES = adminScripts();
  const src = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__t = { get siteData(){ return siteData; }, loadHomeSections, saveHomeSections,
    HOME_SECTION_ANCHORS, makeSectionKey, renderHomeSectionsList, deleteHomeSection,
    populateCategorySelect, findSiteItem, loadAddedItems };`);
  w.eval(src.join("\n;\n"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.showToast = (m, ty) => {
    w.__toast = { m, ty };
  };
  w.confirm = () => true;
  return { w, doc: w.document, store };
}

function bootHome(stored, extraCategory) {
  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const store = {};
  if (stored) store.irHesabdarHomeSections = JSON.stringify(stored);
  if (extraCategory) store.irHesabdarAddedItems = JSON.stringify(extraCategory);
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
    auth: { logout: async () => {}, me: async () => ({}) },
    newsletter: { subscribe: async () => ({}) },
    admin: { settings: { get: async () => ({}) } },
  };

  const FILES = pageScripts("index.html", {
    exclude: ["ai-widget.js", "up-btn.js", "toggle-btn.js"],
  });
  const src = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(
    `window.__t = { get siteData(){ return siteData; }, renderCustomHomeSections };`,
  );
  w.eval(src.join("\n;\n"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  return { w, doc: w.document };
}

const sectionOrder = (doc) =>
  [...doc.querySelectorAll(".main-container > section, main section")].map(
    (el) =>
      el.getAttribute("data-custom-section") || el.className.split(" ")[0],
  );

// ---------------------------------------------------------------- anchors
section("لنگرهای مجاز");
let { w, doc } = bootAdmin();
const anchors = w.__t.HOME_SECTION_ANCHORS.map((a) => a.key);
t("پنج لنگر تعریف شده", anchors.length === 5, String(anchors.length));
t("دوره‌های محبوب اولین است", anchors[0] === "popularCourses");
t("هیرو در فهرست نیست", !anchors.includes("hero"));
t(
  "مسیر یادگیری در فهرست نیست",
  !anchors.some((k) => /learning/i.test(k)),
  "این دو بخش ثابت‌اند و چیزی قبلشان درج نمی‌شود",
);

// ---------------------------------------------------------------- create
section("ساخت سکشن از پنل");
({ w, doc } = bootAdmin());
doc
  .getElementById("addHomeSectionBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t(
  "مودال باز شد",
  doc.getElementById("homeSectionModal").classList.contains("active"),
);
t(
  "فهرست جای قرارگیری پر شد",
  doc.querySelectorAll("#homeSectionAfter option").length === 5,
);

doc.getElementById("homeSectionTitle").value = "دوره‌های پیشنهادی";
doc.getElementById("homeSectionAfter").value = "newCourses";
doc.getElementById("homeSectionIcon").value = "fa-fire";
doc.getElementById("homeSectionBadge").value = "پیشنهادی";
doc.getElementById("homeSectionLimit").value = "6";
doc
  .getElementById("homeSectionForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

let saved = w.__t.loadHomeSections();
t("سکشن ذخیره شد", saved.length === 1);
t("عنوان درست", saved[0].title === "دوره‌های پیشنهادی");
t("جای قرارگیری درست", saved[0].after === "newCourses");
t(
  "آیکون و برچسب",
  saved[0].icon === "fa-fire" && saved[0].badge === "پیشنهادی",
);
t("سقف نمایش", saved[0].limit === 6);
t(
  "کلید یکتا ساخته شد",
  !!saved[0].key && saved[0].key.startsWith("custom_"),
  saved[0].key,
);
t("دسته در siteData ساخته شد", !!w.__t.siteData[saved[0].key]);
t(
  "در فهرست پنل دیده می‌شود",
  doc
    .getElementById("homeSectionsList")
    .innerHTML.includes("دوره‌های پیشنهادی"),
);
t(
  "دسته در فهرست افزودن آیتم هست",
  [...doc.querySelectorAll("#newItemCategory option")].some(
    (o) => o.value === saved[0].key,
  ),
);

section("کلید با دسته‌های موجود تداخل نمی‌کند");
const collide = w.__t.makeSectionKey("articles", ["custom_articles"]);
t("کلید تکراری خودکار عوض می‌شود", collide !== "custom_articles", collide);

// ---------------------------------------------------------------- render
section("نمایش در صفحه اصلی");
const SECTION = {
  key: "custom_test",
  title: "سکشن آزمایشی",
  after: "newCourses",
  icon: "fa-fire",
  badge: "تازه",
  limit: 8,
  showAll: true,
};
let home = bootHome([SECTION]);
t(
  "سکشن خالی نمایش داده نمی‌شود",
  !home.doc.querySelector("[data-custom-section]"),
  "یک عنوان بدون محتوا روی سایت زنده بد است",
);

const ITEMS = [
  {
    id: "ct-1",
    title: "آیتم یک",
    categoryKey: "custom_test",
    image: "../images/ravin.png",
    excerpt: "الف",
  },
  {
    id: "ct-2",
    title: "آیتم دو",
    categoryKey: "custom_test",
    image: "../images/ravin.png",
    excerpt: "ب",
  },
];
home = bootHome([SECTION], ITEMS);
const custom = home.doc.querySelector("[data-custom-section]");
t("سکشن رندر شد", !!custom);
t("عنوان درست", custom && custom.textContent.includes("سکشن آزمایشی"));
t(
  "هر دو آیتم",
  custom && custom.querySelectorAll(".popular-courses_item").length === 2,
);
t("برچسب روی کارت", custom && custom.innerHTML.includes("تازه"));
t(
  "لینک مشاهده همه",
  custom && custom.innerHTML.includes("list-page.html?cat=custom_test"),
);

section("جای درست در ترتیب صفحه");
const order = sectionOrder(home.doc);
const iNew = order.indexOf("new-courses");
const iCustom = order.indexOf("custom_test");
const iFeatured = order.indexOf("featured-section");
t("بعد از دوره‌های جدید", iCustom === iNew + 1, order.join(" | "));
t("قبل از پیشنهاد ویژه", iCustom < iFeatured);
t("هیرو همچنان اول است", order[0] === "hero-section");
t("مسیر یادگیری همچنان دوم است", order[1] === "learning-path-section");

section("لنگر دیگر، جای دیگر");
home = bootHome([{ ...SECTION, after: "exams" }], ITEMS);
const order2 = sectionOrder(home.doc);
t(
  "بعد از آزمون‌ها می‌نشیند",
  order2.indexOf("custom_test") === order2.indexOf("exam-news-section") + 1,
  order2.join(" | "),
);

section("دو سکشن روی یک لنگر");
home = bootHome(
  [
    { ...SECTION, key: "custom_a", title: "الف" },
    { ...SECTION, key: "custom_b", title: "ب" },
  ],
  [
    { id: "a1", title: "یک", categoryKey: "custom_a", excerpt: "" },
    { id: "b1", title: "دو", categoryKey: "custom_b", excerpt: "" },
  ],
);
const order3 = sectionOrder(home.doc);
t(
  "هر دو رندر شدند",
  order3.includes("custom_a") && order3.includes("custom_b"),
  order3.join(" | "),
);
t(
  "ترتیب ذخیره حفظ شد",
  order3.indexOf("custom_a") < order3.indexOf("custom_b"),
);

section("رندر دوباره تکراری نمی‌سازد");
home.w.__t.renderCustomHomeSections();
home.w.__t.renderCustomHomeSections();
t(
  "فقط یک نسخه از هر سکشن",
  home.doc.querySelectorAll('[data-custom-section="custom_a"]').length === 1,
);

// ---------------------------------------------------------------- delete
section("حذف سکشن، هیچ ردی باقی نمی‌گذارد");
({ w, doc } = bootAdmin([SECTION]));
t("در فهرست هست", w.__t.loadHomeSections().length === 1);

w.__t.deleteHomeSection("custom_test");

t("از فهرست سکشن‌ها رفت", w.__t.loadHomeSections().length === 0);
t(
  "دسته از siteData حذف شد",
  !w.__t.siteData["custom_test"],
  "ماندنش باعث می‌شد سکشن حذف‌شده باز هم در جدول آیتم‌ها دیده شود",
);
t(
  "کارت پنل پاک شد",
  !doc.getElementById("homeSectionsList").innerHTML.includes("سکشن آزمایشی"),
);

w.__t.populateCategorySelect();
const remaining = [...doc.querySelectorAll("#newItemCategory option")].map(
  (o) => o.value,
);
t("از فهرست افزودن آیتم رفت", !remaining.includes("custom_test"));
const groups = [...doc.querySelectorAll("#newItemCategory optgroup")].map(
  (g) => g.label,
);
t(
  "گروه «سکشن‌های سفارشی» خالی نماند",
  !groups.some((l) => l.includes("سفارشی")),
);

section("حذف سکشن دارای آیتم");
// Seed through storage, the way the app itself does - w.eval() runs in a
// fresh scope and cannot see the bundle's top-level bindings.
({ w, doc } = bootAdmin(
  [SECTION],
  [
    { id: "ct-1", title: "آیتم یک", categoryKey: "custom_test", excerpt: "" },
    { id: "ct-2", title: "آیتم دو", categoryKey: "custom_test", excerpt: "" },
  ],
));
t(
  "دو آیتم دارد",
  (w.__t.siteData["custom_test"].items || []).length === 2,
  String((w.__t.siteData["custom_test"] || {}).items?.length),
);

let confirmText = "";
w.confirm = (msg) => {
  confirmText = msg;
  return true;
};
w.__t.deleteHomeSection("custom_test");

t(
  "تعداد آیتم‌ها در هشدار آمده",
  confirmText.includes("۲"),
  confirmText.replace(/\n/g, " "),
);
t("هشدار می‌گوید برگشت‌ناپذیر است", confirmText.includes("برگشت‌پذیر"));
t("آیتم اول حذف شد", !w.__t.findSiteItem("ct-1"));
t("آیتم دوم حذف شد", !w.__t.findSiteItem("ct-2"));
t(
  "از فهرست آیتم‌های افزوده هم رفت",
  !w.__t.loadAddedItems().some((i) => i.categoryKey === "custom_test"),
);
t("دسته هم رفت", !w.__t.siteData["custom_test"]);

section("انصراف از حذف چیزی را عوض نمی‌کند");
({ w, doc } = bootAdmin([SECTION]));
w.confirm = () => false;
w.__t.deleteHomeSection("custom_test");
t("سکشن سر جایش ماند", w.__t.loadHomeSections().length === 1);
t("دسته هم دست‌نخورده", !!w.__t.siteData["custom_test"]);

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
