/**
 * Custom home-page sections.
 *
 * The five built-in sections stay exactly as they are in index.html. This adds
 * a way to slot extra sections between them without touching that markup.
 *
 * Anchors are the built-in sections a custom one can be placed after. The hero
 * and the learning path are deliberately absent: they are fixed parts of the
 * page and nothing may be inserted before "دوره‌های محبوب".
 *
 * BACKEND NOTE: sections live in localStorage today and move to
 * GET/POST /api/admin/home-sections when the server is ready. The shape below
 * is the contract.
 */

/** Built-in sections a custom section can be placed after, in page order. */
const HOME_SECTION_ANCHORS = [
  {
    key: "popularCourses",
    title: "دوره‌های محبوب",
    selector: ".poplar-courses",
  },
  { key: "newCourses", title: "دوره‌های جدید", selector: ".new-courses" },
  { key: "specials", title: "پیشنهاد ویژه", selector: ".featured-section" },
  { key: "articles", title: "مقالات", selector: ".articles-section" },
  { key: "exams", title: "آزمون‌ها و اخبار", selector: ".exam-news-section" },
];

const HOME_SECTIONS_KEY = "irHesabdarHomeSections";

/** Read the custom sections, oldest first. */
function loadHomeSections() {
  try {
    const raw = localStorage.getItem(HOME_SECTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.warn("home-sections: could not read storage", error);
    return [];
  }
}

function saveHomeSections(sections) {
  localStorage.setItem(HOME_SECTIONS_KEY, JSON.stringify(sections || []));
}

/** A category key derived from the title, unique against existing data. */
function makeSectionKey(title, taken) {
  const base =
    "custom_" +
    String(title || "section")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w\u0600-\u06FF_]/g, "")
      .slice(0, 24);
  let key = base;
  let n = 2;
  while (taken.indexOf(key) !== -1) {
    key = base + "_" + n;
    n++;
  }
  return key;
}

/**
 * Render every custom section into the page.
 *
 * Each one is inserted directly after its anchor section, so the built-in
 * order is preserved and a custom section never lands above the learning path.
 */
function renderCustomHomeSections() {
  // Clear previous output so repeated calls do not stack duplicates.
  document
    .querySelectorAll("[data-custom-section]")
    .forEach((el) => el.remove());

  const sections = loadHomeSections();
  if (!sections.length) return;

  const byAnchor = {};
  sections.forEach((section) => {
    const anchor = section.after || HOME_SECTION_ANCHORS[0].key;
    (byAnchor[anchor] = byAnchor[anchor] || []).push(section);
  });

  Object.keys(byAnchor).forEach((anchorKey) => {
    const anchor = HOME_SECTION_ANCHORS.find((a) => a.key === anchorKey);
    if (!anchor) return;
    const host = document.querySelector(anchor.selector);
    if (!host) return;

    // Insert in reverse so the stored order reads top-to-bottom on the page.
    byAnchor[anchorKey]
      .slice()
      .reverse()
      .forEach((section) => {
        const el = buildCustomSection(section);
        if (el) host.parentNode.insertBefore(el, host.nextSibling);
      });
  });
}

/** Items belonging to a custom section, from siteData. */
function customSectionItems(section) {
  if (typeof siteData === "undefined") return [];
  const category = siteData[section.key];
  if (!category || !Array.isArray(category.items)) return [];
  const limit = Number(section.limit) || 8;
  return category.items.slice(0, limit);
}

/**
 * Build one section element.
 *
 * Custom sections share the popular-courses markup so they inherit its styling
 * rather than needing a stylesheet of their own.
 */
function buildCustomSection(section) {
  const items = customSectionItems(section);

  // An empty section would show as a bare heading on the live site.
  if (!items.length && !section.showWhenEmpty) return null;

  const el = document.createElement("section");
  el.className = "poplar-courses courses-section";
  el.setAttribute("data-custom-section", section.key);

  const esc = (value) =>
    String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const cards = items
    .map(
      (item) => `
        <li class="popular-courses_item">
          <div class="popular-courses_banner">
            <img src="${esc(item.image || "../images/ravin.png")}" class="popular-courses_img" alt="${esc(item.title)}" />
          </div>
          ${section.badge ? `<span class="popular-courses_badge">${esc(section.badge)}</span>` : ""}
          <div class="popular-courses_content">
            <h3 class="course-title">${esc(item.title)}</h3>
            <p class="course-description">${esc(item.excerpt || "توضیحی برای این آیتم ثبت نشده است.")}</p>
            <a href="single-post.html?id=${encodeURIComponent(item.id)}" class="popular-courses_link">
              مشاهده توضیحات <i class="fas fa-arrow-left"></i>
            </a>
          </div>
        </li>`,
    )
    .join("");

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">
        <i class="fas ${esc(section.icon || "fa-layer-group")}"></i>
        ${esc(section.title)}
      </h2>
      ${
        section.showAll === false
          ? ""
          : `<a href="list-page.html?cat=${encodeURIComponent(section.key)}" class="see-all-link">
               مشاهده همه <i class="fa-solid fa-arrow-left"></i>
             </a>`
      }
    </div>
    <div class="popular-courses_container">
      <ul class="popular-courses_items">${cards}</ul>
    </div>`;

  return el;
}

if (typeof window !== "undefined") {
  window.loadHomeSections = loadHomeSections;
  window.saveHomeSections = saveHomeSections;
  window.renderCustomHomeSections = renderCustomHomeSections;
  window.HOME_SECTION_ANCHORS = HOME_SECTION_ANCHORS;
  window.makeSectionKey = makeSectionKey;
}
