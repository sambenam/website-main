/**
 * Home-page cards — equal height whatever the title length.
 *
 * Run with:  node tests/card-layout.test.js
 *
 * The bug, seen first in the آزمون‌ها section: a card with a short title
 * rendered visibly different from its neighbours in the same grid row —
 * narrower content, a stubby divider line, and a card shorter than the ones
 * beside it.
 *
 * Three separate causes, all of which stayed invisible while every seeded
 * title happened to be 34-41 characters long:
 *
 *   1. `align-items: center` on .exam-news_item. The card is a column, so
 *      align-items governs the HORIZONTAL axis: the content box shrank to
 *      the width of its own text instead of filling the card. A long title
 *      filled the width anyway, which is why nobody saw it.
 *
 *   2. No height on the card. A CSS grid item is only as tall as its content
 *      unless told otherwise, so a one-line title produced a shorter card —
 *      and `margin-top: auto` on the meta row had no spare space to push
 *      into, so the footer floated up too.
 *
 *   3. No reserved height on the title. Even with equal card heights, a
 *      one-line title next to a two-line one puts the link and the meta row
 *      at different vertical positions across the row.
 *
 * All four home sections had at least cause 2. They are fixed together
 * because the next short title added through the panel would have exposed
 * the same thing in whichever section it landed in.
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

/**
 * Every stylesheet index.html actually applies, concatenated in page order.
 *
 * @import has to be followed, not just the <link> list: index.html links
 * main/main.css, which is nothing but a list of @import lines. Reading only
 * the linked files finds an empty rulebook and every assertion below fails
 * for the wrong reason.
 */
function readCssWithImports(absPath, seen) {
  const visited = seen || new Set();
  if (visited.has(absPath) || !fs.existsSync(absPath)) return "";
  visited.add(absPath);

  const src = fs.readFileSync(absPath, "utf8");
  const dir = path.dirname(absPath);
  let out = "";

  [...src.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].forEach((m) => {
    if (m[1].startsWith("http")) return; // web font, nothing to read
    out += readCssWithImports(path.join(dir, m[1]), visited) + "\n";
  });

  return out + src;
}

function homeCss() {
  return pageStyles("index.html")
    .map((rel) => readCssWithImports(path.join(ROOT, "styles", rel)))
    .join("\n");
}

/** The declaration block of one selector, or "" when absent. */
function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp("^" + escaped + "\\s*\\{([^}]*)\\}", "m"));
  return m ? m[1] : "";
}

const SECTIONS = [
  {
    name: "دوره‌های محبوب",
    card: ".popular-courses_item",
    title: ".course-title",
  },
  { name: "دوره‌های جدید", card: ".new-courses_item", title: ".course-title" },
  { name: "مقالات", card: ".article-item", title: ".article-title" },
  { name: "آزمون‌ها", card: ".exam-news_item", title: ".exam-news_title" },
];

/* ------------------------------------------------------------------- 1 */
section("۱. هر کارت ارتفاع ردیف گرید را پر می‌کند");
{
  const css = homeCss();
  SECTIONS.forEach(({ name, card }) => {
    const rules = block(css, card);
    t(
      `${name} — کارت height دارد`,
      /height:\s*100%/.test(rules),
      rules ? "(بدون height)" : "سلکتور پیدا نشد",
    );
  });
}

/* ------------------------------------------------------------------- 2 */
section("۲. عنوان ارتفاع ثابت دو خط دارد");
{
  const css = homeCss();
  // Two lines reserved, and capped at two so one long title cannot stretch
  // the whole row taller than the design allows.
  [...new Set(SECTIONS.map((s) => s.title))].forEach((sel) => {
    const rules = block(css, sel);
    t(
      `${sel} — min-height دارد`,
      /min-height:\s*calc\(/.test(rules),
      rules.slice(0, 60),
    );
    t(`${sel} — به دو خط محدود است`, /-webkit-line-clamp:\s*2/.test(rules));
    t(`${sel} — کلمه بلند می‌شکند`, /overflow-wrap:\s*anywhere/.test(rules));
  });
}

/* ------------------------------------------------------------------- 3 */
section("۳. کارت ستونی، محتوا را وسط‌چین افقی نمی‌کند");
{
  // The specific regression: align-items:center on a column flex container
  // shrinks the child to its text width. Anything but "center" is fine;
  // "stretch" is the default and what we want.
  const css = homeCss();
  const rules = block(css, ".exam-news_item");
  t(
    "آزمون‌ها — align-items دیگر center نیست",
    !/align-items:\s*center/.test(rules),
    /align-items:\s*([\w-]+)/.exec(rules)?.[1] || "(تعریف نشده)",
  );
  t("آزمون‌ها — stretch است", /align-items:\s*stretch/.test(rules));

  const content = block(css, ".exam-news_content");
  t("محتوای آزمون‌ها کل عرض را می‌گیرد", /width:\s*100%/.test(content));
  t(
    "محتوای آزمون‌ها min-width صفر دارد",
    /min-width:\s*0/.test(content),
    "وگرنه یک کلمه بلند کارت را پهن‌تر از ستون گرید می‌کند",
  );
}

/* ------------------------------------------------------------------- 4 */
section("۴. در مرورگر واقعی: عنوان کوتاه و بلند یک شکل می‌شوند");
{
  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  const store = {};
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

  // Load the stylesheets by hand: jsdom's outside-only mode does not fetch
  // <link>, and these assertions are entirely about computed style.
  pageStyles("index.html").forEach((rel) => {
    const style = d.createElement("style");
    style.textContent = fs.readFileSync(path.join(ROOT, "styles", rel), "utf8");
    d.head.appendChild(style);
  });

  // Five characters beside fifty-one - the case that broke.
  const probes = [
    "آزمون",
    "جدول حقوق",
    "آیین نامه ماده ۹۵ قانون مالیات های مستقیم مصوب ۱۴۰۵",
    "بخشنامه",
  ];

  SECTIONS.forEach(({ name, card, title }) => {
    const cards = [...d.querySelectorAll(card)];
    if (!cards.length) {
      t(`${name} — کارت پیدا شد`, false, card);
      return;
    }

    cards.forEach((c, i) => {
      const el = c.querySelector(title);
      if (el && probes[i])
        (el.querySelector("a") || el).textContent = probes[i];
    });

    const heights = new Set(cards.map((c) => w.getComputedStyle(c).height));
    t(
      `${name} — ارتفاع همه کارت‌ها یکسان`,
      heights.size === 1,
      [...heights].join(" / "),
    );

    const mins = new Set(
      cards.map((c) => {
        const el = c.querySelector(title);
        return el ? w.getComputedStyle(el).minHeight : "x";
      }),
    );
    t(
      `${name} — ارتفاع رزرو عنوان یکسان`,
      mins.size === 1,
      [...mins].join(" / "),
    );
  });
}

/* ------------------------------------------------------------------- 5 */
section("۵. تصویر کارت‌ها دست‌نخورده مانده");
{
  // height:100% on the card must not be confused with the height:100% these
  // already had on their <img>, which fills the banner area.
  const css = homeCss();
  [".popular-courses_img", ".new-courses_img", ".article-image img"].forEach(
    (sel) => {
      t(`${sel} هنوز height دارد`, /height:\s*100%/.test(block(css, sel)));
    },
  );
}

/* ------------------------------------------------------------------- 6 */
section("۶. هر بخش صفحه اصلی از بخش بعدی فاصله دارد");
{
  // The exams section had no margin-bottom while its four siblings all did.
  // Nobody noticed while it sat between other sections: a neighbour's own
  // spacing covered for it. It is the LAST section before </main>, so its
  // bottom edge is the one that meets the footer - and there the cards
  // looked glued on.
  const css = homeCss();
  const HOME_SECTIONS = [
    [".courses-section", "دوره‌های محبوب و جدید"],
    [".featured-section", "پیشنهاد ویژه"],
    [".articles-section", "مقالات"],
    [".exam-news-section", "آزمون‌ها (آخرین بخش)"],
  ];
  HOME_SECTIONS.forEach(([selector, name]) => {
    const rules = block(css, selector);
    t(
      `${name} فاصله پایین دارد`,
      /margin-bottom:\s*var\(--spacing-2xl\)/.test(rules),
      rules ? "(بدون margin-bottom)" : "سلکتور پیدا نشد",
    );
  });

  // Dead weight in the same rule: the second `margin-top` silently overrode
  // the first, and `gap` was declared twice. Harmless, but it makes the rule
  // read as if two different values were intended.
  const items = block(css, ".exam-news_items");
  t(
    "margin-top در exam-news_items یک بار تعریف شده",
    (items.match(/margin-top:/g) || []).length === 1,
    String((items.match(/margin-top:/g) || []).length) + " بار",
  );
  t(
    "gap در exam-news_items یک بار تعریف شده",
    (items.match(/gap:/g) || []).length === 1,
    String((items.match(/gap:/g) || []).length) + " بار",
  );
}

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
