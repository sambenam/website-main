/**
 * Home-page slots — which items reach the front page, and how many.
 *
 * WHY THIS EXISTS
 * ===============
 * Adding an item used to put it on the home page automatically, with no way
 * to say otherwise and no limit. The home page and the category page do two
 * different jobs:
 *
 *   home page      a shop window. A few hand-picked items, fixed count.
 *   category page  an archive. Everything, so a visitor can find it.
 *
 * When every new item is pushed into the window, the window slowly turns
 * into the archive and stops being a window at all. Add fifteen courses and
 * "دوره‌های محبوب" renders nineteen cards.
 *
 * So an item now carries `homeVisible`. The add form defaults it to false —
 * the item goes to its category page, which is what almost always makes
 * sense — and the operator ticks a box to send it to the home page too.
 *
 * BACKWARD COMPATIBILITY
 * ======================
 * Items saved before this field existed have no `homeVisible` key at all.
 * They were all visible on the home page, so `undefined` MUST read as true.
 * Reading it as false would silently empty the front page of every site
 * already using the panel. See isHomeVisible().
 *
 * BACKEND NOTE: `homeVisible` is a plain boolean column on the item record.
 * The slot limits below are a display rule and belong to the front-end, but
 * the server may enforce them too if it wants to reject an over-full section.
 */

/**
 * How many cards each home section shows, and what it is called.
 *
 * These numbers are not arbitrary: they are the layout the page was designed
 * around. `popularCourses` is a four-across grid, `specials` is a three-card
 * feature strip. Changing a number here changes the cap the panel enforces,
 * so it must match the CSS grid in the matching stylesheet.
 *
 * A category that is not listed here never appears on the home page at all —
 * only these five sections exist there. The other ~30 categories are header
 * menu destinations and live only on their own list page.
 */
const HOME_SLOTS = {
  popularCourses: { limit: 4, title: "دوره‌های محبوب" },
  newCourses: { limit: 4, title: "دوره‌های جدید" },
  specials: { limit: 3, title: "پیشنهاد ویژه" },
  articles: { limit: 4, title: "مقالات" },
  exams: { limit: 4, title: "آزمون‌ها و اخبار" },
};

/** Does this category have a section on the home page at all? */
function categoryHasHomeSection(categoryKey) {
  return Object.prototype.hasOwnProperty.call(HOME_SLOTS, categoryKey);
}

/** How many cards this section shows, or 0 if it is not on the home page. */
function homeSlotLimit(categoryKey) {
  const slot = HOME_SLOTS[categoryKey];
  return slot ? slot.limit : 0;
}

/** The section's Persian name, for messages the operator reads. */
function homeSlotTitle(categoryKey) {
  const slot = HOME_SLOTS[categoryKey];
  return slot ? slot.title : categoryKey;
}

/**
 * Should this item appear on the home page?
 *
 * The `undefined` case is the important one and the reason this is a
 * function rather than a property read. Items created before the field
 * existed have no `homeVisible` at all, and they were all on the home page.
 * Treating a missing field as false would make them vanish.
 */
function isHomeVisible(item) {
  if (!item) return false;
  return item.homeVisible !== false;
}

/**
 * The items a home section should render, in display order.
 *
 * PRIORITY RULE
 * =============
 * An item the operator explicitly chose for the home page comes FIRST, and
 * pushes the last built-in out of the section.
 *
 * This is not a detail — without it the feature does nothing. Every section
 * ships with more built-in items than it has slots:
 *
 *     دوره‌های محبوب   ۴ جا،  ۸ آیتم پیش‌فرض
 *     پیشنهاد ویژه     ۳ جا،  ۸ آیتم پیش‌فرض
 *     مقالات           ۴ جا،  ۹ آیتم پیش‌فرض
 *
 * So a first-come rule would leave every section permanently full and the
 * operator could never put anything on the front page. Choosing an item is a
 * deliberate act; it wins over a default.
 *
 * The pushed-out built-in is not deleted. It still appears on the category
 * page, which is where the full archive lives.
 *
 * @param {object[]} allItems  every item in the category
 * @param {string[]} addedIds  ids of operator-created items
 * @param {string} categoryKey
 */
function homeSectionItems(allItems, addedIds, categoryKey) {
  const items = Array.isArray(allItems) ? allItems : [];
  const added = Array.isArray(addedIds) ? addedIds : [];
  const limit = homeSlotLimit(categoryKey);
  if (!limit) return [];

  const builtIn = items.filter((item) => added.indexOf(item.id) === -1);
  const chosen = items.filter(
    (item) => added.indexOf(item.id) !== -1 && isHomeVisible(item),
  );

  // Chosen items take their slots first; built-ins fill whatever is left.
  // slice() handles the case of more chosen items than slots on its own.
  const room = Math.max(0, limit - chosen.length);
  return chosen.slice(0, limit).concat(builtIn.slice(0, room));
}

/**
 * How many built-in items a new choice would displace.
 *
 * The add form uses this to tell the operator the truth before they commit:
 * "این آیتم جای «فلان» را می‌گیرد". Silently dropping something off the front
 * page is the kind of surprise that erodes trust in the panel.
 */
function homeDisplacedItem(allItems, addedIds, categoryKey) {
  const items = Array.isArray(allItems) ? allItems : [];
  const added = Array.isArray(addedIds) ? addedIds : [];
  const limit = homeSlotLimit(categoryKey);
  if (!limit) return null;

  const current = homeSectionItems(items, added, categoryKey);
  // Already room to spare: nothing gets pushed out.
  if (current.length < limit) return null;

  // The last card is the one that falls off when another is added in front.
  return current[current.length - 1] || null;
}

/**
 * How many free slots a section has right now.
 *
 * Reported for information only. Because a chosen item always wins a slot,
 * zero here does NOT mean the operator is blocked — it means the next choice
 * will displace something, and homeDisplacedItem() says what.
 */
function homeSlotsRemaining(allItems, addedIds, categoryKey) {
  const limit = homeSlotLimit(categoryKey);
  if (!limit) return 0;
  const used = homeSectionItems(allItems, addedIds, categoryKey).length;
  return Math.max(0, limit - used);
}

if (typeof window !== "undefined") {
  window.HOME_SLOTS = HOME_SLOTS;
  window.categoryHasHomeSection = categoryHasHomeSection;
  window.homeSlotLimit = homeSlotLimit;
  window.homeSlotTitle = homeSlotTitle;
  window.isHomeVisible = isHomeVisible;
  window.homeSectionItems = homeSectionItems;
  window.homeSlotsRemaining = homeSlotsRemaining;
  window.homeDisplacedItem = homeDisplacedItem;
}

if (typeof module !== "undefined") {
  module.exports = {
    HOME_SLOTS,
    categoryHasHomeSection,
    homeSlotLimit,
    homeSlotTitle,
    isHomeVisible,
    homeSectionItems,
    homeSlotsRemaining,
    homeDisplacedItem,
  };
}
