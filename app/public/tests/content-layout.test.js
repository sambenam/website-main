/**
 * Site content tab — the redesigned layout must not change what it does.
 *
 * Run with:  node tests/content-layout.test.js
 *
 * The tab used to render one five-column table per category. With 27
 * categories the column headings repeated 27 times, and most tables held a
 * single row - the heading was taller than the data. Rows carry the same
 * fields on one line now, grouped under collapsible headers with counts.
 *
 * These tests exist to prove the appearance changed and the behaviour did
 * not: same items, same ids, same edit and delete wiring, same search.
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

function boot() {
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
  src.push(`window.__t = {
    get siteData(){ return siteData; }, findSiteItem, renderContentTable,
    deleteContentItem, openContentEditor, contentItemRow, loadDeletedItemIds,
  };`);
  w.eval(src.join("\n;\n"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.showToast = (m, ty) => {
    w.__toast = { m, ty };
  };
  w.confirm = () => true;
  return { w, doc: w.document, store };
}

const countData = (w) =>
  Object.values(w.__t.siteData).reduce(
    (n, cat) => n + (cat && cat.items ? cat.items.length : 0),
    0,
  );

let { w, doc, store } = boot();
w.__t.renderContentTable();
const box = doc.getElementById("groupedContentContainer");

// ------------------------------------------------------------ nothing lost
section("همه آیتم‌ها هنوز نمایش داده می‌شوند");
const shown = box.querySelectorAll(".content-item").length;
const inData = countData(w);
t(
  "تعداد کارت برابر تعداد آیتم‌های واقعی",
  shown === inData,
  `${shown} از ${inData}`,
);
t("هیچ آیتمی جا نیفتاده", shown > 80, String(shown));

const cats = Object.keys(w.__t.siteData).length;
t(
  "همه دسته‌ها رندر شدند",
  box.querySelectorAll(".content-category").length === cats,
  `${box.querySelectorAll(".content-category").length} از ${cats}`,
);
t(
  "چهار گروه اصلی هست",
  box.querySelectorAll(".content-group").length >= 4,
  String(box.querySelectorAll(".content-group").length),
);

// ------------------------------------------------------------ the old problem
section("سرستون تکراری حذف شد");
t(
  "هیچ جدولی نمانده",
  box.querySelectorAll("table").length === 0,
  String(box.querySelectorAll("table").length),
);
t(
  "هیچ سرستونی تکرار نمی‌شود",
  box.querySelectorAll("th").length === 0,
  String(box.querySelectorAll("th").length),
);
t("رنگ آبی خام #0000dd نمانده", !box.innerHTML.includes("0000dd"));
t("خط مشکی پررنگ نمانده", !box.innerHTML.includes("rgb(0, 0, 0, 0.4)"));

// ------------------------------------------------------------ open state
section("فقط گروه اول باز است");
const groups = [...box.querySelectorAll(".content-group")];
t("گروه اول باز", groups[0].open === true);
t("گروه دوم بسته", groups[1].open === false);
t("گروه سوم بسته", groups[2].open === false);
t(
  "فقط یکی باز است",
  groups.filter((g) => g.open).length === 1,
  String(groups.filter((g) => g.open).length),
);
t(
  "گروه بسته هم محتوایش رندر شده",
  groups[1].querySelectorAll(".content-item").length > 0,
  String(groups[1].querySelectorAll(".content-item").length),
);

// ------------------------------------------------------------ counters
section("شمارنده روی هر گروه و دسته");
const firstStats = groups[0].querySelector(".content-group__stats").textContent;
t("تعداد دسته نوشته شده", firstStats.includes("دسته"), firstStats.trim());
t("تعداد آیتم نوشته شده", firstStats.includes("آیتم"), firstStats.trim());
t("ارقام فارسی است", /[۰-۹]/.test(firstStats), firstStats.trim());

const g0items = groups[0].querySelectorAll(".content-item").length;
const g0label = parseInt(
  firstStats
    .match(/([۰-۹]+)\s*آیتم/)[1]
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
  10,
);
t(
  "شمارنده با تعداد واقعی می‌خواند",
  g0label === g0items,
  `${g0label} در برابر ${g0items}`,
);

const firstCat = box.querySelector(".content-category");
t("هر دسته هم شمارنده دارد", !!firstCat.querySelector(".content-count"));
t(
  "کلید دسته نمایش داده می‌شود",
  !!firstCat.querySelector(".content-category__key"),
);

// ------------------------------------------------------------ row contents
section("محتوای هر ردیف");
const row = box.querySelector(".content-item");
t("تصویر دارد", !!row.querySelector(".content-item__thumb"));
t("عنوان دارد", !!row.querySelector(".content-item__title"));
t("شناسه دارد", !!row.querySelector(".content-item__meta code"));
t("برچسب وضعیت دارد", !!row.querySelector(".content-status"));
t("دکمه ویرایش دارد", !!row.querySelector(".content-edit-btn"));
t("دکمه حذف دارد", !!row.querySelector(".content-delete-btn"));
t(
  "شناسه روی دکمه ویرایش هست",
  !!row.querySelector(".content-edit-btn").getAttribute("data-item-id"),
);
t(
  "شناسه روی دکمه حذف هست",
  !!row.querySelector(".content-delete-btn").getAttribute("data-item-id"),
);
t(
  "دکمه حذف برچسب دسترس‌پذیری دارد",
  !!row.querySelector(".content-delete-btn").getAttribute("aria-label"),
);
t(
  "تصویر جایگزین خطا دارد",
  row.querySelector(".content-item__thumb").hasAttribute("onerror"),
);
t(
  "تصویر با تأخیر بارگذاری می‌شود",
  row.querySelector(".content-item__thumb").getAttribute("loading") === "lazy",
);

// ------------------------------------------------------------ status pill
section("برچسب وضعیت");
t(
  "«پیش‌فرض» دیگر قرمز هشدار نیست",
  !box.innerHTML.includes("status cancelled"),
);
const pill = w.__t.contentItemRow({
  id: "x",
  title: "y",
  hasOverride: false,
  hasBlocks: false,
});
t("حالت پیش‌فرض خنثی است", pill.includes("is-default"));
t(
  "حالت ذخیره ادمین سبز است",
  w.__t
    .contentItemRow({ id: "x", title: "y", hasOverride: true })
    .includes("is-saved"),
);
t(
  "حالت بلوک‌بندی آبی است",
  w.__t
    .contentItemRow({ id: "x", title: "y", hasBlocks: true })
    .includes("is-blocks"),
);
t("متن پیش‌فرض درست است", pill.includes("پیش‌فرض"));

// ------------------------------------------------------------ edit still works
section("دکمه ویرایش هنوز کار می‌کند");
({ w, doc, store } = boot());
w.__t.renderContentTable();
const editBtn = doc.querySelector("#groupedContentContainer .content-edit-btn");
const targetId = editBtn.getAttribute("data-item-id");
editBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const modal = doc.getElementById("editContentModal");
t("مودال ویرایش باز شد", modal && modal.classList.contains("active"));
t(
  "همان آیتم بارگذاری شد",
  doc.getElementById("editContentItemId").value === targetId,
  `${doc.getElementById("editContentItemId").value} در برابر ${targetId}`,
);

// ------------------------------------------------------------ delete still works
section("دکمه حذف هنوز کار می‌کند");
({ w, doc, store } = boot());
w.__t.renderContentTable();
const before = countData(w);
const delBtn = doc.querySelector(
  "#groupedContentContainer .content-delete-btn",
);
const victimId = delBtn.getAttribute("data-item-id");
delBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t("از داده حذف شد", !w.__t.findSiteItem(victimId));
t("در فهرست حذف‌شده‌ها ثبت شد", w.__t.loadDeletedItemIds().includes(victimId));
t(
  "فقط همان یکی حذف شد",
  countData(w) === before - 1,
  `${before} -> ${countData(w)}`,
);
w.__t.renderContentTable();
t(
  "از فهرست هم رفت",
  ![
    ...doc.querySelectorAll("#groupedContentContainer .content-delete-btn"),
  ].some((b) => b.getAttribute("data-item-id") === victimId),
);

// ------------------------------------------------------------ search
section("جستجو");
({ w, doc, store } = boot());
const search = doc.getElementById("contentTableSearch");
const anyItem = Object.values(w.__t.siteData).find(
  (c) => c.items && c.items.length,
).items[0];
search.value = anyItem.title.slice(0, 6);
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const results = doc.querySelectorAll("#groupedContentContainer .content-item");
t("نتیجه پیدا شد", results.length > 0, String(results.length));
t(
  "در حالت جستجو گروه‌بندی نیست",
  doc.querySelectorAll("#groupedContentContainer .content-group").length === 0,
);
t(
  "تعداد نتایج نوشته شده",
  doc
    .getElementById("groupedContentContainer")
    .textContent.includes("نتایج جستجو"),
);
t(
  "دسته هر نتیجه نمایش داده می‌شود",
  !!doc.querySelector("#groupedContentContainer .content-item__cat"),
);
t(
  "دکمه‌های نتیجه هم کار دارند",
  !!doc.querySelector(
    "#groupedContentContainer .content-edit-btn[data-item-id]",
  ),
);

search.value = "یک عبارت که قطعا وجود ندارد zzz";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
t(
  "نتیجه خالی پیام می‌دهد",
  doc
    .getElementById("groupedContentContainer")
    .textContent.includes("پیدا نشد"),
);

search.value = "";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
t(
  "پاک کردن جستجو گروه‌ها را برمی‌گرداند",
  doc.querySelectorAll("#groupedContentContainer .content-group").length >= 4,
);
t(
  "همه آیتم‌ها برگشتند",
  doc.querySelectorAll("#groupedContentContainer .content-item").length ===
    countData(w),
);

// ------------------------------------------------------------ escaping
section("امنیت نمایش");
const nasty = w.__t.contentItemRow({
  id: "<script>x</script>",
  title: "<img src=x onerror=alert(1)>",
  image: '" onload="alert(1)',
});
t("عنوان خطرناک خنثی شد", !nasty.includes("<img src=x"), nasty.slice(0, 80));
t("شناسه خطرناک خنثی شد", !nasty.includes("<script>"));
t("آدرس تصویر خطرناک خنثی شد", !nasty.includes('" onload="'));
t("متن امن نمایش داده می‌شود", nasty.includes("&lt;img"));

// ------------------------------------------------------------ empty category
section("دسته خالی");
({ w, doc, store } = boot());
const emptyKey = Object.keys(w.__t.siteData)[0];
w.__t.siteData[emptyKey].items = [];
w.__t.renderContentTable();
t(
  "پیام خالی بودن نمایش داده می‌شود",
  doc
    .getElementById("groupedContentContainer")
    .textContent.includes("هیچ آیتمی در این دسته"),
);
t(
  "بقیه دسته‌ها سالم ماندند",
  doc.querySelectorAll("#groupedContentContainer .content-item").length ===
    countData(w),
);

// ------------------------------------------------------------ counters follow data
section("شمارنده بعد از افزودن و حذف به‌روز می‌شود");
({ w, doc, store } = boot());
w.__t.renderContentTable();

const groupStats = (title) => {
  const g = [...doc.querySelectorAll(".content-group")].find((x) =>
    x.querySelector(".content-group__title").textContent.includes(title),
  );
  const label = g.querySelector(".content-group__stats").textContent;
  const num = parseInt(
    label
      .match(/([۰-۹]+)\s*آیتم/)[1]
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
    10,
  );
  return { label: num, cards: g.querySelectorAll(".content-item").length };
};
const catCount = (key) => {
  const c = [...doc.querySelectorAll(".content-category")].find(
    (x) => x.querySelector(".content-category__key").textContent === key,
  );
  const num = parseInt(
    c
      .querySelector(".content-count")
      .textContent.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/\D/g, ""),
    10,
  );
  return { label: num, cards: c.querySelectorAll(".content-item").length };
};

const homeBefore = groupStats("سکشن‌های صفحه اصلی");
const begBefore = catCount("beginner");
t(
  "شمارنده اولیه با کارت‌ها می‌خواند",
  homeBefore.label === homeBefore.cards,
  `${homeBefore.label} در برابر ${homeBefore.cards}`,
);

// The category dropdown is filled when the modal opens, so open it first -
// that is the order a real operator goes through.
doc
  .getElementById("addNewContentItemBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
doc.getElementById("newItemId").value = "counter-check-1";
doc.getElementById("newItemCategory").value = "beginner";
doc.getElementById("newItemTitle").value = "آیتم شمارنده";
doc
  .getElementById("addNewItemForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

const homeAfter = groupStats("سکشن‌های صفحه اصلی");
const begAfter = catCount("beginner");
t(
  "شمارنده گروه یکی بالا رفت",
  homeAfter.label === homeBefore.label + 1,
  `${homeBefore.label} -> ${homeAfter.label}`,
);
t("کارت‌های گروه هم یکی بیشتر شد", homeAfter.cards === homeBefore.cards + 1);
t("شمارنده و کارت هم‌خوان ماندند", homeAfter.label === homeAfter.cards);
t(
  "شمارنده دسته هم بالا رفت",
  begAfter.label === begBefore.label + 1,
  `${begBefore.label} -> ${begAfter.label}`,
);
t(
  "آیتم تازه در همان دسته دیده می‌شود",
  [...doc.querySelectorAll(".content-category")]
    .find(
      (x) =>
        x.querySelector(".content-category__key").textContent === "beginner",
    )
    .innerHTML.includes("آیتم شمارنده"),
);
t(
  "دسته‌های دیگر دست‌نخورده ماندند",
  groupStats("منوهای هدر: فایل‌های حسابداری").label ===
    groupStats("منوهای هدر: فایل‌های حسابداری").cards,
);

w.__t.deleteContentItem("counter-check-1");
w.__t.renderContentTable();
const homeBack = groupStats("سکشن‌های صفحه اصلی");
t(
  "بعد از حذف شمارنده برمی‌گردد",
  homeBack.label === homeBefore.label,
  `${homeAfter.label} -> ${homeBack.label}`,
);
t("کارت‌ها هم برگشتند", homeBack.cards === homeBefore.cards);

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
