/**
 * Site-content tab: add, edit, delete, and the sync into products.
 *
 * Run with:  node tests/site-content.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Saving an article's video or files must also produce the matching products,
 * using the same `<id>` / `<id>-video` convention the article page reads.
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
    get siteData(){ return siteData; }, findSiteItem, loadAddedItems, loadDeletedItemIds,
    loadContentOverrides, renderContentTable, deleteContentItem, openContentEditor,
    saveEditedContent, applyContentOverrides,
  };`);
  w.eval(src.join("\n;\n"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.showToast = (m, ty) => {
    w.__toast = { m, ty };
  };
  w.confirm = () => true;
  return { w, doc: w.document, store };
}

const products = (store) => {
  try {
    return JSON.parse(store.irHesabdarProducts || "[]");
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------- add
section("دکمه افزودن آیتم جدید");
let { w, doc, store } = boot();
t("دکمه وجود دارد", !!doc.getElementById("addNewContentItemBtn"));

doc
  .getElementById("addNewContentItemBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t(
  "مودال باز می‌شود",
  doc.getElementById("addNewItemModal").classList.contains("active"),
);

const cats = [...doc.querySelectorAll("#newItemCategory option")];
t("فهرست دسته‌ها پر شد", cats.length > 0, String(cats.length));

doc.getElementById("newItemId").value = "test-item-1";
doc.getElementById("newItemCategory").value = cats[0].value;
doc.getElementById("newItemTitle").value = "آیتم آزمایشی";
doc.getElementById("newItemExcerpt").value = "خلاصه";
doc
  .getElementById("addNewItemForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

const added = w.__t.findSiteItem("test-item-1");
t("آیتم ساخته شد", !!added);
t("در دسته انتخاب‌شده", added && added.categoryKey === cats[0].value);
t("عنوان درست", added && added.item.title === "آیتم آزمایشی");
t("ماندگار شد", !!store.irHesabdarAddedItems);
t(
  "در فهرست دیده می‌شود",
  doc
    .getElementById("groupedContentContainer")
    .innerHTML.includes("آیتم آزمایشی"),
);

w.__toast = null;
doc.getElementById("newItemId").value = "test-item-1";
doc.getElementById("newItemCategory").value = cats[0].value;
doc.getElementById("newItemTitle").value = "تکراری";
doc
  .getElementById("addNewItemForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
t("شناسه تکراری رد می‌شود", w.__toast && w.__toast.ty === "error");

// ---------------------------------------------------------------- delete
section("دکمه حذف");
({ w, doc, store } = boot());
const victim = w.__t.siteData[Object.keys(w.__t.siteData)[0]].items[0];
// Count from the data, not the rendered HTML: switching views re-renders and
// the container may be empty at this point.
const countItems = () =>
  Object.values(w.__t.siteData).reduce(
    (n, cat) => n + (cat && cat.items ? cat.items.length : 0),
    0,
  );
const before = countItems();

w.__t.deleteContentItem(victim.id);
t("از siteData حذف شد", !w.__t.findSiteItem(victim.id));
t("در فهرست حذف‌شده‌ها ثبت شد", w.__t.loadDeletedItemIds().includes(victim.id));

w.__t.renderContentTable();
const html = doc.getElementById("groupedContentContainer").innerHTML;
t("از جدول رفت", !html.includes("'" + victim.id + "'"));
t(
  "فقط همان یکی حذف شد",
  countItems() === before - 1,
  `${before} -> ${countItems()}`,
);

// ---------------------------------------------------------------- video sync
section("ذخیره ویدیو، محصول ویدیو می‌سازد");
({ w, doc, store } = boot());
const article = w.__t.siteData[Object.keys(w.__t.siteData)[0]].items[0];
w.__t.openContentEditor(article.id);
doc.getElementById("contentVideoEnabled").checked = true;
doc.getElementById("contentVideoUrl").value = "https://www.aparat.com/v/abc123";
doc.getElementById("contentVideoProvider").value = "file"; // deliberately wrong
doc.getElementById("contentVideoTitle").value = "ویدیوی دوره";
doc.getElementById("contentVideoIsPaid").checked = true;
doc.getElementById("contentVideoPrice").value = "95000";
w.__t.saveEditedContent();

let vid = products(store).find((x) => x.id === article.id + "-video");
t("محصول ویدیو ساخته شد", !!vid);
t("شناسه با پسوند -video", vid && vid.id === article.id + "-video");
t("به مطلب وصل است", vid && vid.contentId === article.id);
t("قیمت ثبت شد", vid && vid.price === 95000);
t("فرمت mp4", vid && vid.category === "mp4");

const ov = w.__t.loadContentOverrides()[article.id];
t(
  "لینک آپارات شناسایی شد",
  ov.content.video.provider === "aparat",
  `provider=${ov.content.video.provider} - وگرنه تگ video خالی رندر می‌شود`,
);
t(
  "حجم ساختگی ندارد",
  !vid.fileSize || vid.fileSize === "",
  `fileSize=${JSON.stringify(vid.fileSize)}`,
);

// ---------------------------------------------------------------- files sync
section("ذخیره فایل، محصول فایل می‌سازد");
({ w, doc, store } = boot());
const art2 = w.__t.siteData[Object.keys(w.__t.siteData)[0]].items[1];
w.__t.openContentEditor(art2.id);
doc
  .getElementById("addDownloadBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const row =
  doc.querySelector("#contentDownloadsEditor [data-download-row]") ||
  doc.querySelector("#contentDownloadsEditor .download-row") ||
  doc.querySelector("#contentDownloadsEditor > div");
if (row) {
  const title = row.querySelector(
    'input[data-field="title"], input[name*="title"], input[type="text"]',
  );
  const url =
    row.querySelectorAll('input[type="text"]')[1] ||
    row.querySelector('input[data-field="url"]');
  if (title) title.value = "جزوه PDF";
  if (url) url.value = "../files/course.pdf";
}
doc.getElementById("contentFilesIsPaid").checked = true;
doc.getElementById("contentFilesPrice").value = "49000";
w.__t.saveEditedContent();

const fileProd = products(store).find((x) => x.id === art2.id);
t("محصول فایل ساخته شد", !!fileProd, "ردیف دانلود باید پر شده باشد");
if (fileProd) {
  t("شناسه بدون پسوند", fileProd.id === art2.id);
  t("به مطلب وصل است", fileProd.contentId === art2.id);
  t("قیمت ثبت شد", fileProd.price === 49000);
}

// ---------------------------------------------------------------- removal
section("برداشتن ویدیو، محصولش را حذف می‌کند");
({ w, doc, store } = boot());
const art3 = w.__t.siteData[Object.keys(w.__t.siteData)[0]].items[0];
w.__t.openContentEditor(art3.id);
doc.getElementById("contentVideoEnabled").checked = true;
doc.getElementById("contentVideoUrl").value = "https://www.aparat.com/v/x";
doc.getElementById("contentVideoTitle").value = "ویدیو";
w.__t.saveEditedContent();
t("محصول ساخته شد", !!products(store).find((x) => x.id === art3.id + "-video"));

w.__t.openContentEditor(art3.id);
doc.getElementById("contentVideoEnabled").checked = false;
doc.getElementById("contentVideoUrl").value = "";
w.__t.saveEditedContent();
t(
  "پس از برداشتن ویدیو، محصول حذف شد",
  !products(store).find((x) => x.id === art3.id + "-video"),
);

// ---------------------------------------------------------------- form help
section("راهنمای لینک در ویرایشگر محتوا");
({ w, doc } = boot());
t("کادر راهنما وجود دارد", !!doc.getElementById("contentVideoUrlNotice"));
const input = doc.getElementById("contentVideoUrl");
input.value = "https://www.aparat.com/v/abc";
input.dispatchEvent(new w.Event("input", { bubbles: true }));
const notice = doc.getElementById("contentVideoUrlNotice");
t(
  "لینک آپارات تشخیص داده شد",
  !notice.hidden && notice.textContent.includes("آپارات"),
);

input.dispatchEvent(new w.Event("blur", { bubbles: true }));
t(
  "provider در فرم به‌روز شد",
  doc.getElementById("contentVideoProvider").value === "aparat",
);

section("ردیف دانلود: انتخاب منبع و راهنما");
({ w, doc, store } = boot());
const artD = w.__t.siteData[Object.keys(w.__t.siteData)[0]].items[0];
w.__t.openContentEditor(artD.id);
doc
  .getElementById("addDownloadBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

const dlRow = doc.querySelector(".content-download-row");
t("ردیف ساخته شد", !!dlRow);
t("انتخابگر منبع دارد", !!dlRow.querySelector(".download-source"));

const sources = [...dlRow.querySelectorAll(".download-source input")].map(
  (r) => r.value,
);
t("گزینه هاست خودی", sources.includes("host"));
t("گزینه فضای ابری", sources.includes("link"));
t("گزینه آپلود از دستگاه", sources.includes("upload"));
t(
  "آپلود فعلاً غیرفعال است",
  dlRow.querySelector('.download-source input[value="upload"]').disabled,
);
t(
  "هاست خودی پیش‌فرض است",
  dlRow.querySelector('.download-source input[value="host"]').checked,
);

t("راهنمای متنی دارد", !!dlRow.querySelector(".download-hint"));
t(
  "راهنما پوشه files را می‌گوید",
  dlRow.querySelector(".download-hint").textContent.includes("files"),
);
t(
  "placeholder مسیر هاست است",
  dlRow.querySelector(".download-url").placeholder.includes("files/"),
  dlRow.querySelector(".download-url").placeholder,
);
t("دکمه بررسی دارد", !!dlRow.querySelector(".download-check"));

section("تعویض منبع، راهنما را عوض می‌کند");
const cloudRadio = dlRow.querySelector('.download-source input[value="link"]');
cloudRadio.checked = true;
cloudRadio.dispatchEvent(new w.Event("change", { bubbles: true }));
t(
  "راهنما به فضای ابری تغییر کرد",
  dlRow.querySelector(".download-hint").textContent.includes("ابری"),
);
t(
  "placeholder هم عوض شد",
  dlRow.querySelector(".download-url").placeholder.startsWith("https://"),
);

const hostRadio = dlRow.querySelector('.download-source input[value="host"]');
hostRadio.checked = true;
hostRadio.dispatchEvent(new w.Event("change", { bubbles: true }));
t(
  "بازگشت به هاست خودی",
  dlRow.querySelector(".download-url").placeholder.includes("files/"),
);

section("راهنمای زنده هنگام تایپ");
const urlInput = dlRow.querySelector(".download-url");
urlInput.value = "https://drive.google.com/file/d/ABC/view";
urlInput.dispatchEvent(new w.Event("input", { bubbles: true }));
const dlNotice = dlRow.querySelector("[data-notice]");
t("پیام راهنما ظاهر شد", !dlNotice.hidden);
t("گوگل درایو تشخیص داده شد", dlNotice.textContent.includes("گوگل درایو"));

urlInput.dispatchEvent(new w.Event("blur", { bubbles: true }));
t(
  "لینک اشتراکی به دانلود مستقیم تبدیل شد",
  urlInput.value === "https://drive.google.com/uc?export=download&id=ABC",
  urlInput.value,
);

section("ذخیره پس از بازچینش ردیف");
dlRow.querySelector(".download-title").value = "جزوه فصل اول";
dlRow.querySelector(".download-url").value = "../files/ch1.pdf";
dlRow.querySelector(".download-type").value = "pdf";
dlRow.querySelector(".download-size").value = "۱۲ مگابایت";
doc.getElementById("contentFilesIsPaid").checked = true;
doc.getElementById("contentFilesPrice").value = "39000";
w.__t.saveEditedContent();

const savedProd = products(store).find((x) => x.id === artD.id);
t("محصول ساخته شد", !!savedProd, "چیدمان جدید نباید جمع‌آوری فیلدها را بشکند");
if (savedProd) {
  t(
    "آدرس درست ذخیره شد",
    savedProd.fileUrl === "../files/ch1.pdf",
    savedProd.fileUrl,
  );
  t("قیمت درست", savedProd.price === 39000);
  t(
    "حجم واقعی حفظ شد",
    savedProd.fileSize === "۱۲ مگابایت",
    savedProd.fileSize,
  );
}
const savedOv = w.__t.loadContentOverrides()[artD.id];
t(
  "در محتوای مطلب هم نشست",
  savedOv &&
    savedOv.content.downloads &&
    savedOv.content.downloads[0].title === "جزوه فصل اول",
);

section("قالب‌بندی خودکار قیمت");
({ w, doc, store } = boot());
const fmt = (v) => w.eval(`formatPriceDisplay(${JSON.stringify(String(v))})`);
t("سه‌رقمی جدا می‌شود", fmt("50000") === "۵۰,۰۰۰", fmt("50000"));
t("میلیون", fmt("1000000") === "۱,۰۰۰,۰۰۰", fmt("1000000"));
t("کمتر از هزار بدون جداکننده", fmt("500") === "۵۰۰");
t("خالی خالی می‌ماند", fmt("") === "");
t("صفر ابتدایی حذف می‌شود", fmt("00500") === "۵۰۰", fmt("00500"));
t("ورودی فارسی هم کار می‌کند", fmt("۲۵۰۰۰۰") === "۲۵۰,۰۰۰");
t("دوباره قالب‌بندی امن است", fmt("۲۵۰,۰۰۰") === "۲۵۰,۰۰۰");

for (const id of ["contentVideoPrice", "contentFilesPrice"]) {
  const el = doc.getElementById(id);
  t(
    id + " متنی است نه number",
    el.type === "text",
    "type=number اجازه نمایش کاما نمی‌دهد",
  );
  t(id + " صفحه‌کلید عددی موبایل", el.getAttribute("inputmode") === "numeric");
}

section("قیمت قالب‌بندی‌شده درست ذخیره می‌شود");
// Pick any category that actually has items - the first one may be short.
const artP = Object.values(w.__t.siteData).flatMap((c) =>
  c && c.items ? c.items : [],
)[0];
w.__t.openContentEditor(artP.id);
doc.getElementById("contentVideoEnabled").checked = true;
doc.getElementById("contentVideoUrl").value = "https://aparat.com/v/zzz";
doc.getElementById("contentVideoTitle").value = "ویدیو";
doc.getElementById("contentVideoIsPaid").checked = true;
doc.getElementById("contentVideoPrice").value = "۱,۲۵۰,۰۰۰";
w.__t.saveEditedContent();

const pricedProd = products(store).find((x) => x.id === artP.id + "-video");
t("محصول ساخته شد", !!pricedProd);
t(
  "قیمت عدد خام ذخیره شد",
  pricedProd && pricedProd.price === 1250000,
  `parseFloat روی "۱,۲۵۰,۰۰۰" مقدار غلط می‌داد - price=${pricedProd && pricedProd.price}`,
);

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
