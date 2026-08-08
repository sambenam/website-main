/**
 * User profile page — readable text in both themes.
 *
 * Run with:  node tests/profile-theme.test.js
 *
 * The page rendered as a nearly blank sheet: every heading, label and field
 * value was drawn in #f1f5f9 (near white) on a light background.
 *
 * Why: the page declared --text-primary on :root, but it also loads
 * styles/main/variables.css twice - once through main.css and again through
 * main-footer.css, which is linked AFTER this page's own stylesheet. Same
 * specificity, so the later one won and the dark-theme value was applied to
 * a light page.
 *
 * The fix namespaces the page's tokens (--up-*) so nothing can overwrite
 * them, and wires the page into the site's day/night toggle.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { pageStyles } = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

/** Inline every local stylesheet in document order, resolving @import. */
function loadCss(fp) {
  if (!fs.existsSync(fp)) return "";
  return fs
    .readFileSync(fp, "utf8")
    .replace(/@import url\(['"]([^'"]+)['"]\);/g, (m, rel) =>
      rel.startsWith("http") ? "" : loadCss(path.join(path.dirname(fp), rel)),
    );
}

function boot(theme) {
  const html = fs.readFileSync(
    path.join(ROOT, "html/user-profile.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "http://localhost/html/user-profile.html",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    doc = w.document;
  let css = "";
  doc.querySelectorAll("link[rel=stylesheet]").forEach((l) => {
    const href = l.getAttribute("href");
    if (!href || href.startsWith("http")) return;
    css += "\n" + loadCss(path.join(ROOT, "html", href));
  });
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.appendChild(style);
  if (theme === "light")
    doc.documentElement.setAttribute("data-theme", "light");
  return { w, doc };
}

const cssVar = (w, doc, name) =>
  w.getComputedStyle(doc.documentElement).getPropertyValue(name).trim();

/** Rough luminance, 0 = black, 1 = white. */
function luminance(hex) {
  const m = String(hex)
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ------------------------------------------------------------- day theme */
section("حالت روز — متن باید تیره باشد");
let { w, doc } = boot("light");
const dayText = cssVar(w, doc, "--up-text");
t("متغیر متن تعریف شده", !!dayText, dayText);
t(
  "متن تیره است، نه سفید",
  luminance(dayText) < 0.4,
  `${dayText} (روشنایی ${luminance(dayText)?.toFixed(2)})`,
);
t("دقیقاً همان مقدار روشن نیست", dayText.toLowerCase() !== "#f1f5f9", dayText);
const daySoft = cssVar(w, doc, "--up-text-soft");
t("متن کم‌رنگ هم خوانا است", luminance(daySoft) < 0.6, daySoft);

/* ----------------------------------------------------------- night theme */
section("حالت شب — متن باید روشن باشد");
let night = boot("dark");
const nightText = cssVar(night.w, night.doc, "--up-text");
t(
  "متن روشن است",
  luminance(nightText) > 0.6,
  `${nightText} (روشنایی ${luminance(nightText)?.toFixed(2)})`,
);
t("با حالت روز فرق دارد", nightText !== dayText, `${dayText} / ${nightText}`);

section("تم واقعاً عوض می‌شود");
t(
  "رنگ متن بین دو حالت جابه‌جا می‌شود",
  luminance(dayText) < 0.4 && luminance(nightText) > 0.6,
  `روز ${dayText} · شب ${nightText}`,
);
t(
  "پس‌زمینه هم عوض می‌شود",
  cssVar(w, doc, "--up-page") !== cssVar(night.w, night.doc, "--up-page"),
);
t(
  "سطح کارت هم عوض می‌شود",
  cssVar(w, doc, "--up-card") !== cssVar(night.w, night.doc, "--up-card"),
);

/* --------------------------------------------------------- no collisions */
section("متغیرها دیگر با بقیه صفحات تداخل ندارند");
// Only the page's OWN stylesheets, not the shared header and footer ones.
//
// The whole point of this section is that user-profile.css must not define
// or read --text-primary, because main-footer.css imports variables.css and
// overwrites it. Searching every linked file would therefore always find the
// name — in the very file that is allowed to have it.
const css = pageStyles("user-profile.html")
  .filter((rel) => rel.startsWith("pages/user-profile"))
  .map((rel) => fs.readFileSync(path.join(ROOT, "styles", rel), "utf8"))
  .join("\n");
t("نام‌ها پیشوند دارند", css.includes("--up-text"));
t("دیگر --text-primary تعریف نمی‌کند", !/^\s*--text-primary\s*:/m.test(css));
t(
  "دیگر --text-secondary تعریف نمی‌کند",
  !/^\s*--text-secondary\s*:/m.test(css),
);
t("دیگر --glass-bg تعریف نمی‌کند", !/^\s*--glass-bg\s*:/m.test(css));
t(
  "هیچ ارجاع قدیمی نمانده",
  !css.includes("var(--text-primary)") && !css.includes("var(--glass-bg)"),
);
t("قانون حالت روز دارد", css.includes('html[data-theme="light"]'));

section("سطح‌های سفید ثابت حذف شدند");
// Hardcoded white panels stayed white in night mode and hid the text.
t(
  "پس‌زمینه سفید ثابت نمانده",
  !css.includes("background: rgba(255, 255, 255, 0.3);") &&
    !css.includes("background: rgba(255, 255, 255, 0.4);"),
);
t("رنگ متن سیاه ثابت نمانده", !css.includes("color: #0f172a;"));
t(
  "تب پیام‌های من هم تم‌پذیر شد",
  css.includes(".my-message-bubble__head strong { color: var(--up-text); }"),
);

section("کادرهای ورودی هنگام کلیک خوانا می‌مانند");
// Focus used to force `background: #fff`. With near-white text in night
// mode, clicking into any editable box turned it white on white and hid
// whatever was typed.
t(
  "پس‌زمینه سفید ثابت روی focus نمانده",
  !/\.form-control:focus\s*\{[^}]*background:\s*#fff\s*;/.test(css),
);
t(
  "از توکن تم استفاده می‌کند",
  css.includes("background: var(--up-field-focus)"),
);
t("توکن در حالت روز تعریف شده", !!cssVar(w, doc, "--up-field-focus"));
t(
  "توکن در حالت شب تعریف شده",
  !!cssVar(night.w, night.doc, "--up-field-focus"),
);
t(
  "مقدار دو حالت فرق دارد",
  cssVar(w, doc, "--up-field-focus") !==
    cssVar(night.w, night.doc, "--up-field-focus"),
  `${cssVar(w, doc, "--up-field-focus")} / ${cssVar(night.w, night.doc, "--up-field-focus")}`,
);

const dayFocus = cssVar(w, doc, "--up-field-focus");
t(
  "در حالت روز، متن تیره روی زمینه روشن",
  luminance(dayFocus) !== null &&
    Math.abs(luminance(dayFocus) - luminance(dayText)) > 0.4,
  `متن ${dayText} روی ${dayFocus}`,
);
t(
  "در حالت شب زمینه فوکوس روشن نمی‌شود",
  !/^#f{3,6}$/i.test(cssVar(night.w, night.doc, "--up-field-focus").trim()),
  cssVar(night.w, night.doc, "--up-field-focus"),
);

// The toast had the same mismatch: fixed white panel, themed text.
t("پیام شناور هم تم‌پذیر شد", css.includes("background: var(--up-toast)"));

t(
  "هر هشت کادر قابل ویرایش از همین کلاس‌اند",
  doc.querySelectorAll(".form-control").length === 8,
  String(doc.querySelectorAll(".form-control").length),
);
[
  "inputName",
  "inputEmail",
  "inputPhone",
  "inputBirth",
  "inputAddress",
  "currentPassword",
  "newPassword",
  "confirmPassword",
].forEach((id) => {
  const el = doc.getElementById(id);
  t(`کادر ${id} پوشش داده شد`, !!el && el.classList.contains("form-control"));
});

section("اجزای صفحه سر جای خود هستند");
t("سایدبار پروفایل", !!doc.querySelector(".profile-sidebar"));
t("تب مشخصات شخصی", !!doc.getElementById("tab-info"));
t("تب پیام‌های من", !!doc.getElementById("tab-messages"));
t("فرم ویرایش", !!doc.querySelector(".form-group input"));
t("دکمه ذخیره", !!doc.querySelector("#tab-info button"));

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
