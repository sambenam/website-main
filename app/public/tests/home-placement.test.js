/**
 * Home-page placement — where a newly added item shows up.
 *
 * Run with:  node tests/home-placement.test.js
 *
 * The behaviour this replaces: adding an item put it on the home page
 * automatically, with no way to say otherwise and no cap. Fifteen new
 * courses turned the four-card "دوره‌های محبوب" grid into nineteen cards,
 * and the front page slowly became a copy of the category page.
 *
 * Two jobs, two pages:
 *
 *   home page      a shop window — a few items, fixed count
 *   category page  an archive — everything, so a visitor can find it
 *
 * The rule now: an item goes to its category page by default, and reaches
 * the home page only when the operator ticks the box AND the section has a
 * free slot.
 *
 * The regression that matters most is the backward-compatible one. Items
 * saved before `homeVisible` existed have no such field, and they were all
 * on the home page. Reading a missing field as false would silently empty
 * the front page of every site already using the panel.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  readScripts,
  pageScripts,
  styleSource,
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

/* ==========================================================  pure logic  */
section("۱. قوانین ظرفیت — منطق خالص");
{
  delete require.cache[require.resolve("../scripts/home-slots.js")];
  const slots = require("../scripts/home-slots.js");

  t(
    "پنج بخش صفحه اصلی تعریف شده‌اند",
    Object.keys(slots.HOME_SLOTS).length === 5,
    Object.keys(slots.HOME_SLOTS).join(","),
  );
  t("دوره‌های محبوب چهار جا دارد", slots.homeSlotLimit("popularCourses") === 4);
  t("پیشنهاد ویژه سه جا دارد", slots.homeSlotLimit("specials") === 3);

  // Roughly thirty categories are header-menu destinations with no home
  // section. Offering the home option for them would be a lie.
  t(
    "دسته‌های منوی هدر بخش صفحه اصلی ندارند",
    !slots.categoryHasHomeSection("diploma") &&
      !slots.categoryHasHomeSection("Exel"),
  );
  t("سقف دسته بدون بخش صفر است", slots.homeSlotLimit("diploma") === 0);

  section("۲. سازگاری با آیتم‌های قدیمی");
  // The whole point: an item saved before the field existed was visible.
  t(
    "آیتم بدون فیلد homeVisible → نمایش داده می‌شود",
    slots.isHomeVisible({ id: "old" }) === true,
  );
  t(
    "آیتم با homeVisible: true → نمایش",
    slots.isHomeVisible({ id: "x", homeVisible: true }) === true,
  );
  t(
    "آیتم با homeVisible: false → پنهان",
    slots.isHomeVisible({ id: "x", homeVisible: false }) === false,
  );
  t("null امن است", slots.isHomeVisible(null) === false);

  section("۳. برش تا سقف");
  {
    const items = [
      { id: "b1" },
      { id: "b2" },
      { id: "b3" },
      { id: "b4" },
      { id: "b5" },
      { id: "b6" },
    ];
    const shown = slots.homeSectionItems(items, [], "popularCourses");
    t(
      "شش آیتم پیش‌فرض به چهار تا بریده می‌شود",
      shown.length === 4,
      String(shown.length),
    );
    t(
      "چهار تای اول انتخاب می‌شوند",
      shown.map((x) => x.id).join(",") === "b1,b2,b3,b4",
    );
  }
  {
    // Two built-ins plus three custom, only two of which want the home page.
    const items = [
      { id: "b1" },
      { id: "b2" },
      { id: "c1", homeVisible: true },
      { id: "c2", homeVisible: false },
      { id: "c3", homeVisible: true },
    ];
    const shown = slots.homeSectionItems(
      items,
      ["c1", "c2", "c3"],
      "popularCourses",
    );
    t(
      "آیتم انصراف‌داده حذف می‌شود",
      shown.map((x) => x.id).indexOf("c2") === -1,
    );
    // Chosen items lead, built-ins fill the rest. This ordering is the whole
    // point: it is what lets an operator reach a section that is already full.
    t(
      "آیتم‌های انتخاب‌شده اول می‌آیند",
      shown.map((x) => x.id).join(",") === "c1,c3,b1,b2",
      shown.map((x) => x.id).join(","),
    );
    t(
      "پیش‌فرض‌ها بعد از آن‌ها می‌آیند",
      shown[2].id === "b1" && shown[3].id === "b2",
    );
  }
  section("۴. اولویت آیتم انتخاب‌شده بر پیش‌فرض");
  {
    // The rule that makes the feature usable at all. Every section ships
    // with more built-ins than slots, so a first-come rule would leave the
    // operator permanently locked out of the home page.
    const items = [
      { id: "b1" },
      { id: "b2" },
      { id: "b3" },
      { id: "b4" },
      { id: "b5" },
      { id: "c1", homeVisible: true },
    ];
    const shown = slots.homeSectionItems(items, ["c1"], "popularCourses");
    t(
      "آیتم انتخاب‌شده وارد بخش پر می‌شود",
      shown.map((x) => x.id).indexOf("c1") !== -1,
      shown.map((x) => x.id).join(","),
    );
    t("آیتم انتخاب‌شده اول می‌آید", shown[0].id === "c1", shown[0].id);
    t("سقف همچنان رعایت می‌شود", shown.length === 4, String(shown.length));
    t(
      "آخرین پیش‌فرض کنار می‌رود",
      shown.map((x) => x.id).indexOf("b4") === -1,
      shown.map((x) => x.id).join(","),
    );

    const pushed = slots.homeDisplacedItem(items, ["c1"], "popularCourses");
    t(
      "آیتم جابه‌جاشونده اعلام می‌شود",
      !!pushed && pushed.id === "b3",
      pushed ? pushed.id : "null",
    );

    // Two chosen items take two slots, and two built-ins keep the rest.
    const two = [
      { id: "b1" },
      { id: "b2" },
      { id: "b3" },
      { id: "b4" },
      { id: "c1", homeVisible: true },
      { id: "c2", homeVisible: true },
    ];
    const shownTwo = slots.homeSectionItems(
      two,
      ["c1", "c2"],
      "popularCourses",
    );
    t(
      "دو آیتم انتخاب‌شده دو جا می‌گیرند",
      shownTwo.map((x) => x.id).join(",") === "c1,c2,b1,b2",
      shownTwo.map((x) => x.id).join(","),
    );

    // More chosen than the section has room for: still capped.
    const many = [
      { id: "b1" },
      { id: "c1", homeVisible: true },
      { id: "c2", homeVisible: true },
      { id: "c3", homeVisible: true },
      { id: "c4", homeVisible: true },
      { id: "c5", homeVisible: true },
    ];
    const shownMany = slots.homeSectionItems(
      many,
      ["c1", "c2", "c3", "c4", "c5"],
      "popularCourses",
    );
    t(
      "انتخاب‌شده‌های بیش از سقف هم بریده می‌شوند",
      shownMany.length === 4,
      String(shownMany.length),
    );
    t(
      "هیچ پیش‌فرضی جا نمی‌ماند وقتی انتخاب‌ها پرش کرده‌اند",
      shownMany.map((x) => x.id).indexOf("b1") === -1,
    );

    t(
      "جای خالی صفر گزارش می‌شود",
      slots.homeSlotsRemaining(items, ["c1"], "popularCourses") === 0,
    );
    t(
      "جای خالی هرگز منفی نیست",
      slots.homeSlotsRemaining(items, ["c1"], "specials") >= 0,
    );

    // Nothing is displaced when there is genuine room.
    const roomy = [{ id: "b1" }, { id: "b2" }];
    t(
      "وقتی جا هست چیزی جابه‌جا نمی‌شود",
      slots.homeDisplacedItem(roomy, [], "popularCourses") === null,
    );
  }
  {
    const items = [{ id: "b1" }, { id: "b2" }];
    t(
      "دو جای خالی از چهار",
      slots.homeSlotsRemaining(items, [], "popularCourses") === 2,
    );
  }
}

/* ==============================================  the panel, in a browser */
section("۵. فرم افزودن آیتم در پنل");

function bootPanel(store) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const data = Object.assign(
    {
      hesabyarSession: JSON.stringify({
        token: "t",
        isAdmin: true,
        user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
      }),
      irHesabdarUsers: JSON.stringify([
        {
          id: 1,
          name: "مدیر",
          email: "m@x.com",
          role: "مدیر سایت",
          status: "فعال",
        },
      ]),
    },
    store || {},
  );
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
      removeItem: (k) => {
        delete data[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  const src = readScripts(adminScripts());
  src.push(`window.__t = {
    refreshPlacementField, populateCategorySelect,
    homeSlotsRemaining, homeSlotLimit, categoryHasHomeSection,
    get added() { return loadAddedItems(); },
    get siteData() { return siteData; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.showToast = (m, tone) => {
    w.__toast = { m, tone };
  };
  return { w, doc: w.document, data };
}

{
  const { w, doc } = bootPanel();

  t("فیلد محل نمایش در فرم هست", !!doc.getElementById("newItemPlacementField"));
  const radios = doc.querySelectorAll('input[name="newItemPlacement"]');
  t("دو گزینه دارد", radios.length === 2, String(radios.length));

  const listRadio = doc.querySelector(
    'input[name="newItemPlacement"][value="list"]',
  );
  const homeRadio = doc.querySelector(
    'input[name="newItemPlacement"][value="both"]',
  );
  t(
    "پیش‌فرض «فقط صفحه دسته‌بندی» است",
    !!listRadio && listRadio.checked === true,
  );
  t("گزینه صفحه اصلی پیش‌فرض نیست", !!homeRadio && homeRadio.checked === false);

  section("۶. راهنمای زنده بر اساس دسته انتخاب‌شده");

  const select = doc.getElementById("newItemCategory");
  w.__t.populateCategorySelect();

  // A header-menu category: no home section at all.
  select.value = "diploma";
  w.__t.refreshPlacementField();
  t("دسته منوی هدر → گزینه صفحه اصلی غیرفعال", homeRadio.disabled === true);
  t(
    "دسته منوی هدر → پیام توضیحی نمایش داده می‌شود",
    doc.getElementById("newItemPlacementNotice").hidden === false,
  );
  t(
    "پیام می‌گوید در صفحه اصلی بخشی ندارد",
    doc
      .getElementById("newItemPlacementNotice")
      .textContent.includes("صفحه اصلی"),
  );

  // A real home section. articles has four slots; siteData ships fewer than
  // four built-ins in some categories, so read the live number rather than
  // asserting a fixed one.
  select.value = "articles";
  w.__t.refreshPlacementField();
  const free = w.__t.homeSlotsRemaining(
    w.__t.siteData.articles.items,
    [],
    "articles",
  );
  const hint = doc.getElementById("newItemPlacementHint").textContent;
  // A full section must stay CHOOSABLE. Every section ships with more
  // built-ins than slots, so disabling the option when full would lock the
  // operator out of the home page permanently - which is exactly the bug
  // the first version of this feature had.
  t(
    "گزینه صفحه اصلی برای بخش واقعی فعال است",
    homeRadio.disabled === false,
    "بخش پر هم باید قابل انتخاب باشد",
  );
  t("راهنما نام بخش را می‌گوید", hint.includes("مقالات"), hint);

  if (free > 0) {
    t("راهنما تعداد جای خالی را می‌گوید", /جای خالی/.test(hint), hint);
  } else {
    const noticeText = doc.getElementById("newItemPlacementNotice").textContent;
    t("راهنما می‌گوید بخش پر است", hint.includes("پر است"), hint);
    t(
      "پیام نام آیتمی که کنار می‌رود را می‌گوید",
      noticeText.includes("کنار می‌رود"),
      noticeText.slice(0, 90),
    );
    t(
      "پیام اطمینان می‌دهد آیتم حذف نمی‌شود",
      noticeText.includes("صفحه دسته‌بندی"),
      noticeText.slice(0, 90),
    );
  }

  section("۷. انتخاب پس از غیرفعال شدن به حالت امن برمی‌گردد");
  // Tick the home option on a section that has room, then switch to a
  // category that has none. The form must not stay on a choice it can no
  // longer honour.
  select.value = "articles";
  w.__t.refreshPlacementField();
  if (!homeRadio.disabled) {
    homeRadio.checked = true;
    select.value = "diploma";
    w.__t.refreshPlacementField();
    t("انتخاب صفحه اصلی برداشته شد", homeRadio.checked === false);
    t("به «فقط دسته‌بندی» برگشت", listRadio.checked === true);
  } else {
    t("انتخاب صفحه اصلی برداشته شد", true, "بخش از ابتدا پر بود");
    t("به «فقط دسته‌بندی» برگشت", listRadio.checked === true);
  }
}

/* ====================================================  saving a new item */
section("۸. ذخیره آیتم — فیلد homeVisible");
{
  const { w, doc } = bootPanel();
  w.__t.populateCategorySelect();

  const fill = (id, cat) => {
    doc.getElementById("newItemId").value = id;
    doc.getElementById("newItemCategory").value = cat;
    doc.getElementById("newItemTitle").value = "آیتم آزمایشی";
    doc.getElementById("newItemExcerpt").value = "خلاصه";
  };

  // Default path: nothing ticked.
  fill("test-list-only", "articles");
  w.__t.refreshPlacementField();
  doc
    .getElementById("addNewItemForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

  const saved = w.__t.added.find((x) => x.id === "test-list-only");
  t("آیتم ذخیره شد", !!saved);
  t(
    "homeVisible صریحاً false است",
    saved && saved.homeVisible === false,
    saved ? String(saved.homeVisible) : "—",
  );
  t("undefined نیست", saved && saved.homeVisible !== undefined);

  // Opt in, if the section still has room after the first save.
  const homeRadio = doc.querySelector(
    'input[name="newItemPlacement"][value="both"]',
  );
  fill("test-on-home", "articles");
  w.__t.refreshPlacementField();
  if (!homeRadio.disabled) {
    homeRadio.checked = true;
    doc
      .getElementById("addNewItemForm")
      .dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    const onHome = w.__t.added.find((x) => x.id === "test-on-home");
    t(
      "آیتم انتخاب‌شده homeVisible: true دارد",
      !!onHome && onHome.homeVisible === true,
      onHome ? String(onHome.homeVisible) : "ذخیره نشد",
    );
  } else {
    t("آیتم انتخاب‌شده homeVisible: true دارد", true, "بخش پر بود — رد شد");
  }
}

/* ==========================================  the home page actually obeys */
section("۹. صفحه اصلی واقعاً قانون را رعایت می‌کند");
{
  // Five custom articles, only one marked for the home page. The section
  // must never render more than its limit, and the opted-out ones must not
  // appear at all.
  const custom = [
    {
      id: "ca1",
      title: "الف",
      categoryKey: "articles",
      excerpt: "",
      homeVisible: false,
      content: { blocks: [], video: null, downloads: [] },
    },
    {
      id: "ca2",
      title: "ب",
      categoryKey: "articles",
      excerpt: "",
      homeVisible: false,
      content: { blocks: [], video: null, downloads: [] },
    },
    {
      id: "ca3",
      title: "ج",
      categoryKey: "articles",
      excerpt: "",
      homeVisible: true,
      content: { blocks: [], video: null, downloads: [] },
    },
    {
      id: "ca4",
      title: "د",
      categoryKey: "articles",
      excerpt: "",
      homeVisible: false,
      content: { blocks: [], video: null, downloads: [] },
    },
    {
      id: "ca5",
      title: "ه",
      categoryKey: "articles",
      excerpt: "",
      homeVisible: false,
      content: { blocks: [], video: null, downloads: [] },
    },
  ];

  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const data = { irHesabdarAddedItems: JSON.stringify(custom) };
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
      removeItem: (k) => {
        delete data[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  const src = readScripts(
    pageScripts("index.html", {
      exclude: ["ai-widget.js", "up-btn.js", "toggle-btn.js"],
    }),
  );
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));

  // Match on the LINK TARGET, not on the visible text. An earlier version of
  // this test searched the section's textContent for the title "الف" and
  // failed: that letter appears inside ordinary Persian words, so the check
  // was reading real article titles as a match. The href carries the item id
  // and cannot collide with prose.
  const linkedIds = [
    ...w.document.querySelectorAll('.articles-section a[href*="id="]'),
  ].map((a) =>
    new URL(a.href, "http://localhost/html/").searchParams.get("id"),
  );

  t(
    "آیتم انصراف‌داده در صفحه اصلی نیست",
    linkedIds.indexOf("ca1") === -1 && linkedIds.indexOf("ca2") === -1,
    linkedIds.join(","),
  );

  // The cap is the real point: whatever renders, it cannot exceed the limit.
  const articleItems = w.document.querySelectorAll(
    ".articles-section .articles_item, .articles-section li",
  );
  t(
    `بخش مقالات از سقف چهار عبور نکرده (${articleItems.length} کارت)`,
    articleItems.length <= 4,
    String(articleItems.length),
  );

  // The section was already full of built-in articles, yet the item the
  // operator explicitly chose still gets a slot - and takes the first one.
  // Without this the feature would be decorative.
  t(
    "آیتم انتخاب‌شده وارد بخش پر شد",
    linkedIds.indexOf("ca3") !== -1,
    linkedIds.join(","),
  );
  t(
    "آیتم انتخاب‌شده اول نشسته",
    linkedIds[0] === "ca3",
    linkedIds.slice(0, 3).join(","),
  );
}

/* ================================================================  style */
section("۱۰. ظاهر");
{
  const css = styleSource("admin.html");
  t(
    "قانون سراسری hidden برای پیام",
    /\.placement-notice\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(
      css,
    ),
  );
  t(
    "گزینه انتخاب‌شده متمایز است",
    css.includes(".placement-option:has(input:checked)"),
  );
  t("گزینه غیرفعال متمایز است", css.includes("placement-option--blocked"));
  t("حالت پر بودن رنگ هشدار دارد", css.includes("placement-notice--full"));
}

/* =============================================================  the shape */
section("۱۱. چیدمان پنجره — عریض و کوتاه");
{
  // The dialog was the default 500px box with six fields stacked vertically,
  // which pushed the submit button off the bottom of a laptop screen. The
  // operator had to scroll inside the dialog to find it.
  const { w, doc } = bootPanel();
  const css = styleSource("admin.html");

  const box = doc.querySelector("#addNewItemModal .modal-box");
  t(
    "جعبه کلاس مخصوص خودش را دارد",
    box.classList.contains("add-item-modal"),
    box.className,
  );
  t(
    "عرض به ۹۰۰ پیکسل رسید",
    /\.add-item-modal\s*\{[^}]*max-width:\s*900px/.test(css),
  );

  // Height must be bounded by the viewport, not by content: a dialog taller
  // than the screen hides its own footer no matter how wide it is.
  t(
    "ارتفاع به بلندی صفحه محدود است",
    /\.add-item-modal\s*\{[^}]*max-height:\s*92vh/.test(css),
  );
  t(
    "بدنه اسکرول می‌شود نه کل پنجره",
    /\.add-item-body\s*\{[^}]*overflow-y:\s*auto/.test(css),
  );
  t(
    "سرصفحه و پاورقی جمع نمی‌شوند",
    /\.add-item-modal\s+\.modal-header,\s*\.add-item-modal\s+\.modal-footer\s*\{[^}]*flex:\s*0 0 auto/.test(
      css,
    ),
  );

  const body = doc.querySelector("#addNewItemModal .add-item-body");
  t(
    "بدنه گرید دوستونه است",
    /\.add-item-body\s*\{[^}]*grid-template-columns/.test(css),
  );
  t(
    "دو ستون در HTML هست",
    doc.querySelectorAll("#addNewItemModal .add-item-col").length === 2,
    String(doc.querySelectorAll("#addNewItemModal .add-item-col").length),
  );
  t(
    "در موبایل تک‌ستونه می‌شود",
    /@media[^{]*max-width:\s*780px[\s\S]*?\.add-item-body\s*\{[^}]*grid-template-columns:\s*1fr/.test(
      css,
    ),
  );

  // Two short fields side by side save a whole row of height.
  t(
    "شناسه و دسته کنار هم‌اند",
    !!doc.querySelector("#addNewItemModal .add-item-row"),
  );
  const row = doc.querySelector("#addNewItemModal .add-item-row");
  t(
    "ردیف دوتایی دقیقاً دو فیلد دارد",
    row.querySelectorAll(".form-group").length === 2,
    String(row.querySelectorAll(".form-group").length),
  );

  section("۱۲. هیچ فیلدی در بازچینی گم نشد");
  // Rearranging markup is exactly when a field quietly disappears, and every
  // one of these is read by id at save time.
  [
    "newItemId",
    "newItemCategory",
    "newItemTitle",
    "newItemImage",
    "newItemExcerpt",
    "newItemPlacementField",
    "newItemPlacementHomeOption",
    "newItemPlacementHint",
    "newItemPlacementNotice",
  ].forEach((id) => {
    t(`${id} موجود است`, !!doc.getElementById(id));
  });
  t(
    "هر دو رادیو سر جایشان‌اند",
    doc.querySelectorAll('#addNewItemModal input[name="newItemPlacement"]')
      .length === 2,
  );
  t(
    "دکمه ثبت هست",
    !!doc.querySelector('#addNewItemModal button[type="submit"]'),
  );

  // The select used to carry its colours in a style attribute, so it ignored
  // the theme and stayed dark on a light page.
  const select = doc.getElementById("newItemCategory");
  t(
    "رنگ‌های درون‌خطی از سلکت برداشته شد",
    !(select.getAttribute("style") || "").includes("background"),
    select.getAttribute("style") || "(بدون style)",
  );

  // And it must still work: the whole dialog is pointless if a rearranged
  // form no longer saves.
  w.__t.populateCategorySelect();
  doc.getElementById("newItemId").value = "layout-check";
  doc.getElementById("newItemCategory").value = "articles";
  doc.getElementById("newItemTitle").value = "آزمون چیدمان";
  w.__t.refreshPlacementField();
  doc
    .getElementById("addNewItemForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  t(
    "فرم بازچینی‌شده هنوز ذخیره می‌کند",
    !!w.__t.added.find((x) => x.id === "layout-check"),
  );
}

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
