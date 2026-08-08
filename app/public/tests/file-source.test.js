/**
 * File source handling in the products tab.
 *
 * Run with:  node tests/file-source.test.js
 * Requires:  npm install --no-save jsdom
 *
 * An operator adding a product only has a link to paste. These tests cover the
 * help we give them:
 *   - Aparat/YouTube links get the right video provider (they used to be saved
 *     as provider:"file", which rendered an empty <video> tag)
 *   - Drive/Dropbox "view" links become real download links
 *   - oversized files and misplaced videos raise a warning
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
  const { window } = dom;
  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
  };
  Object.defineProperty(window, "localStorage", {
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
  const ORDER = adminScripts();
  const src = ORDER.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__t = {
    detectUrlSource, normalizeDownloadUrl, videoProviderFor, checkFileUrl,
    parseFileSizeMb, fileSourceAdvice, isPlausibleFileUrl,
    get products() { return appState.products; },
    set products(v) { appState.products = v; },
  };`);
  Object.defineProperty(window, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  try {
    window.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 120));
  }
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return window;
}

const w = boot();
const T = w.__t;

(async () => {
  // ---------------------------------------------------------------- detection
  section("recognising where a link points");
  t(
    "aparat",
    T.detectUrlSource("https://www.aparat.com/v/abc123") === "aparat",
  );
  t(
    "youtube full",
    T.detectUrlSource("https://www.youtube.com/watch?v=abc") === "youtube",
  );
  t("youtu.be short", T.detectUrlSource("https://youtu.be/abc") === "youtube");
  t(
    "google drive",
    T.detectUrlSource("https://drive.google.com/file/d/ABC/view") === "drive",
  );
  t(
    "dropbox",
    T.detectUrlSource("https://www.dropbox.com/s/x/f.pdf?dl=0") === "dropbox",
  );
  t(
    "plain host",
    T.detectUrlSource("https://mysite.ir/files/a.pdf") === "direct",
  );
  t("empty", T.detectUrlSource("") === "");

  section("the Aparat bug is fixed");
  t(
    "aparat link -> aparat player",
    T.videoProviderFor("https://aparat.com/v/x") === "aparat",
  );
  t(
    "youtube link -> youtube player",
    T.videoProviderFor("https://youtu.be/x") === "youtube",
  );
  t(
    "direct mp4 -> file player",
    T.videoProviderFor("https://mysite.ir/v.mp4") === "file",
  );
  t(
    "drive link is not treated as a player",
    T.videoProviderFor("https://drive.google.com/file/d/A/view") === "file",
  );

  // ---------------------------------------------------------------- rewriting
  section("share links become download links");
  t(
    "drive view -> uc?export=download",
    T.normalizeDownloadUrl(
      "https://drive.google.com/file/d/ABC123/view?usp=sharing",
    ) === "https://drive.google.com/uc?export=download&id=ABC123",
  );
  t(
    "drive without /view also works",
    T.normalizeDownloadUrl("https://drive.google.com/file/d/XYZ789/") ===
      "https://drive.google.com/uc?export=download&id=XYZ789",
  );
  t(
    "dropbox dl=0 -> dl=1",
    T.normalizeDownloadUrl("https://www.dropbox.com/s/x/f.pdf?dl=0") ===
      "https://www.dropbox.com/s/x/f.pdf?dl=1",
  );
  t(
    "dropbox without dl gets dl=1",
    T.normalizeDownloadUrl("https://www.dropbox.com/s/x/f.pdf").endsWith(
      "?dl=1",
    ),
  );
  t(
    "dropbox already dl=1 untouched",
    T.normalizeDownloadUrl("https://www.dropbox.com/s/x/f.pdf?dl=1") ===
      "https://www.dropbox.com/s/x/f.pdf?dl=1",
  );
  t(
    "a plain link is left alone",
    T.normalizeDownloadUrl("https://mysite.ir/a.pdf") ===
      "https://mysite.ir/a.pdf",
  );
  t(
    "aparat link is left alone",
    T.normalizeDownloadUrl("https://aparat.com/v/x") ===
      "https://aparat.com/v/x",
  );
  t("empty stays empty", T.normalizeDownloadUrl("") === "");

  // ---------------------------------------------------------------- sizes
  section("reading a size the operator typed");
  t("plain MB", T.parseFileSizeMb("12") === 12);
  t("with MB suffix", T.parseFileSizeMb("12MB") === 12);
  t("persian digits", T.parseFileSizeMb("۱۲ مگابایت") === 12);
  t(
    "kilobytes convert down",
    Math.abs(T.parseFileSizeMb("500 KB") - 0.488) < 0.01,
  );
  t("gigabytes convert up", T.parseFileSizeMb("2 GB") === 2048);
  t("persian گیگ", T.parseFileSizeMb("۲ گیگابایت") === 2048);
  t("nonsense -> null", T.parseFileSizeMb("نامشخص") === null);
  t("empty -> null", T.parseFileSizeMb("") === null);

  // ---------------------------------------------------------------- advice
  section("advice shown to the operator");
  let a = T.fileSourceAdvice({
    url: "https://mysite.ir/v.mp4",
    category: "mp4",
    fileSize: "200MB",
  });
  t("direct video is discouraged", a && a.tone === "warn", JSON.stringify(a));
  t("suggests aparat", a.text.includes("آپارات"));

  a = T.fileSourceAdvice({
    url: "https://aparat.com/v/x",
    category: "mp4",
    fileSize: "",
  });
  t("aparat video is fine", a && a.tone === "info");

  a = T.fileSourceAdvice({
    url: "https://drive.google.com/file/d/A/view",
    category: "pdf",
    fileSize: "5MB",
  });
  t("drive link explained", a && a.text.includes("گوگل درایو"));

  a = T.fileSourceAdvice({
    url: "https://mysite.ir/a.zip",
    category: "zip",
    fileSize: "200MB",
  });
  t("large file warned", a && a.tone === "warn", JSON.stringify(a));

  a = T.fileSourceAdvice({
    url: "https://mysite.ir/a.pdf",
    category: "pdf",
    fileSize: "25MB",
  });
  t("medium file gets a note", a && a.tone === "info");

  a = T.fileSourceAdvice({
    url: "https://mysite.ir/a.pdf",
    category: "pdf",
    fileSize: "3MB",
  });
  t("small file needs no advice", a === null, JSON.stringify(a));

  // ---------------------------------------------------------------- the form
  section("the add-product form");
  const doc = w.document;
  t("source picker present", !!doc.getElementById("newProdSourceOptions"));
  const opts = [...doc.querySelectorAll('input[name="newProdSource"]')].map(
    (o) => o.value,
  );
  t("offers a direct link", opts.includes("link"));
  t("offers aparat/youtube", opts.includes("stream"));
  t("offers upload", opts.includes("upload"));
  t(
    "upload is disabled for now",
    doc.querySelector('input[name="newProdSource"][value="upload"]').disabled,
  );
  t(
    "direct link is the default",
    doc.querySelector('input[name="newProdSource"][value="link"]').checked,
  );
  t("notice box exists", !!doc.getElementById("newProdUrlNotice"));

  section("switching to the video source relabels the field");
  const streamRadio = doc.querySelector(
    'input[name="newProdSource"][value="stream"]',
  );
  streamRadio.checked = true;
  streamRadio.dispatchEvent(new w.Event("change", { bubbles: true }));
  t(
    "label mentions aparat",
    doc.getElementById("newProdFileUrlLabel").textContent.includes("آپارات"),
  );
  t(
    "placeholder updated",
    doc.getElementById("newProdFileUrl").placeholder.includes("aparat"),
  );

  section("typing a link shows guidance");
  const urlInput = doc.getElementById("newProdFileUrl");
  urlInput.value = "https://drive.google.com/file/d/ABC/view";
  urlInput.dispatchEvent(new w.Event("input", { bubbles: true }));
  const notice = doc.getElementById("newProdUrlNotice");
  t("notice becomes visible", notice.hidden === false);
  t("mentions drive", notice.textContent.includes("گوگل درایو"));

  section("leaving the field rewrites the link");
  urlInput.dispatchEvent(new w.Event("blur", { bubbles: true }));
  t(
    "rewritten in place",
    urlInput.value === "https://drive.google.com/uc?export=download&id=ABC",
    urlInput.value,
  );

  // ---------------------------------------------------------------- image
  section("product image picker");
  t("preview element exists", !!doc.getElementById("editProdImgPreview"));
  t("file input exists", !!doc.getElementById("editProdImgFile"));
  t(
    "accepts images only",
    doc.getElementById("editProdImgFile").accept === "image/*",
  );
  t("hidden field for the value", !!doc.getElementById("editProdImg"));
  t("reset button exists", !!doc.getElementById("editProdImgReset"));

  section("modal layout - two columns, no endless scrolling");
  t(
    "add modal is wide",
    doc
      .querySelector("#addProductModal .modal-box")
      .className.includes("product-modal"),
  );
  t(
    "edit modal is wide",
    doc
      .querySelector("#editProductModal .modal-box")
      .className.includes("product-modal"),
  );
  t(
    "add form uses a grid",
    !!doc.querySelector("#addProductModal .product-form-grid"),
  );
  t(
    "edit form uses a grid",
    !!doc.querySelector("#editProductModal .product-form-grid"),
  );
  t(
    "add form has two columns",
    doc.querySelectorAll("#addProductModal .product-form-col").length === 2,
  );
  t(
    "edit form has two columns",
    doc.querySelectorAll("#editProductModal .product-form-col").length === 2,
  );
  t(
    "columns are labelled",
    doc.querySelectorAll("#addProductModal .product-form-legend").length === 2,
  );
  t(
    "format and size share a row",
    !!doc.querySelector("#addProductModal .form-row"),
  );

  section("every field survived the restructure");
  for (const id of [
    "newProdContentId",
    "newProdName",
    "newProdCat",
    "newProdSize",
    "newProdPrice",
    "newProdFileUrl",
    "accessTypePremium",
    "accessTypeFree",
    "prodPriceContainer",
  ]) {
    t(id, doc.querySelectorAll("#" + id).length === 1);
  }
  for (const id of [
    "editProdId",
    "editProdOwner",
    "editProdName",
    "editProdCat",
    "editProdSize",
    "editProdPrice",
    "editProdFileUrl",
    "editProdImg",
    "editProdImgFile",
  ]) {
    t(id, doc.querySelectorAll("#" + id).length === 1);
  }

  section("files hosted on your own cPanel (the practical option in Iran)");
  t(
    "../files/x.pdf detected as relative",
    T.detectUrlSource("../files/course.pdf") === "relative",
  );
  t(
    "/files/x.pdf detected as relative",
    T.detectUrlSource("/files/course.pdf") === "relative",
  );
  t(
    "bare files/x.pdf detected as relative",
    T.detectUrlSource("files/course.pdf") === "relative",
  );
  t(
    "a full URL is not relative",
    T.detectUrlSource("https://mysite.ir/files/c.pdf") === "direct",
  );

  t("../files/x.pdf accepted", T.isPlausibleFileUrl("../files/course.pdf"));
  t("/files/x.pdf accepted", T.isPlausibleFileUrl("/files/course.pdf"));
  t(
    "bare files/x.pdf accepted",
    T.isPlausibleFileUrl("files/course.pdf"),
    "operators type this after uploading via cPanel",
  );
  t("nested path accepted", T.isPlausibleFileUrl("files/2026/course-101.zip"));
  t("still rejects prose", !T.isPlausibleFileUrl("فایل من.pdf را آپلود کردم"));
  t(
    "still rejects a broken scheme",
    !T.isPlausibleFileUrl("htp://a.com/f.pdf"),
  );

  let rel = T.fileSourceAdvice({
    url: "../files/course.pdf",
    category: "pdf",
    fileSize: "3MB",
  });
  t(
    "relative path gets a reminder",
    rel && rel.tone === "info",
    JSON.stringify(rel),
  );
  t("reminder mentions the host", rel.text.includes("هاست"));

  t(
    "a relative path is never rewritten",
    T.normalizeDownloadUrl("../files/course.pdf") === "../files/course.pdf",
  );

  section("the form leads with the host option");
  const firstOpt = doc.querySelector("#addProductModal .source-option");
  t(
    "first choice is the host",
    firstOpt.textContent.includes("هاست خودتان"),
    firstOpt.textContent.trim().slice(0, 40),
  );
  t(
    "mentions cPanel File Manager",
    firstOpt.textContent.includes("File Manager"),
  );
  // An earlier section switched the source to "video", which rewrites the
  // placeholder. Switch back so this checks the default state.
  const linkRadio = doc.querySelector(
    'input[name="newProdSource"][value="link"]',
  );
  linkRadio.checked = true;
  linkRadio.dispatchEvent(new w.Event("change", { bubbles: true }));
  t(
    "placeholder shows a host path",
    doc.getElementById("newProdFileUrl").placeholder.includes("files/"),
    doc.getElementById("newProdFileUrl").placeholder,
  );
  t(
    "hint explains where to upload",
    doc.getElementById("newProdUrlHint").textContent.includes("هاست"),
  );

  section("the check-link button");
  t("add form has a check button", !!doc.getElementById("newProdUrlCheck"));
  t("edit form has a check button", !!doc.getElementById("editProdUrlCheck"));
  t(
    "button sits beside the input",
    !!doc.querySelector("#addProductModal .url-field .form-control"),
  );

  // checkFileUrl talks to the network, so stub fetch per case.
  async function checkWith(fetchImpl, url) {
    const saved = w.fetch;
    w.fetch = fetchImpl;
    const out = await w.__t.checkFileUrl(url);
    w.fetch = saved;
    return out;
  }
  const res =
    (status, headers = {}) =>
    async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    });

  let r = await checkWith(
    res(200, { "content-length": String(12 * 1024 * 1024) }),
    "../files/a.pdf",
  );
  t("existing file reported ok", r.ok === true, JSON.stringify(r));
  t("size read from the header", r.sizeMb === 12, String(r.sizeMb));

  r = await checkWith(res(404), "../files/typo.pdf");
  t("missing file reported", r.ok === false && r.status === 404);
  t("message points at the filename", r.reason.includes("نام فایل"));

  r = await checkWith(res(403), "../files/locked.pdf");
  t("permission problem reported", r.ok === false && r.status === 403);
  t("message mentions permissions", r.reason.includes("مجوز"));

  r = await checkWith(async () => {
    throw new Error("CORS");
  }, "https://other.ir/a.pdf");
  t("unverifiable is not called broken", r.ok === null, JSON.stringify(r));

  r = await w.__t.checkFileUrl("https://www.aparat.com/v/abc");
  t("aparat link passes without a request", r.ok === true);
  t("explains the player handles it", r.reason.includes("پخش‌کننده"));

  r = await w.__t.checkFileUrl("");
  t("empty address refused", r.ok === false);

  section("قالب‌بندی قیمت در فرم محصول");
  const priceFmt = (v) =>
    w.eval(`formatPriceDisplay(${JSON.stringify(String(v))})`);
  t("سه‌رقمی جدا می‌شود", priceFmt("50000") === "۵۰,۰۰۰", priceFmt("50000"));
  t("میلیون", priceFmt("1250000") === "۱,۲۵۰,۰۰۰");
  for (const id of ["newProdPrice", "editProdPrice"]) {
    const el = doc.getElementById(id);
    t(id + " متنی است", el.type === "text", "type=number کاما را نمی‌پذیرد");
    t(id + " صفحه‌کلید عددی", el.getAttribute("inputmode") === "numeric");
  }

  const priceInput = doc.getElementById("newProdPrice");
  priceInput.value = "";
  for (const ch of "250000") {
    priceInput.value += ch;
    priceInput.selectionStart = priceInput.value.length;
    priceInput.dispatchEvent(new w.Event("input", { bubbles: true }));
  }
  t(
    "حین تایپ قالب‌بندی می‌شود",
    priceInput.value === "۲۵۰,۰۰۰",
    priceInput.value,
  );
  t(
    "مقدار عددی درست خوانده می‌شود",
    w.eval('readPriceInput(document.getElementById("newProdPrice"))') ===
      250000,
  );

  console.log("\n" + "=".repeat(52));
  console.log(`  ${p} passed, ${f} failed`);
  console.log("=".repeat(52));
  process.exit(f ? 1 : 0);
})();
