/**
 * Site content — custom home-page sections (admin side)
 *
 * Named home-sections-admin.js, not home-sections.js: scripts/home-sections.js
 * already exists and holds the read side that every public page loads. Two
 * files with the same name in one project is a trap even when the folders
 * differ.
 *
 * Lets the operator add a section to the home page and choose where it sits.
 *
 * Only the five content sections are offered as anchors. The hero and the
 * learning path are fixed parts of the page, so nothing can be placed above
 * "دوره‌های محبوب".
 *
 * Split out of scripts/admin-content.js, which had grown to 1,784 lines.
 * Every classic <script> shares one global scope, so these four files see
 * each other exactly as one file would. Nothing here runs while the file is
 * being parsed except the boot hook at the end of content-table.js, which is
 * why that file loads last.
 */

/* ============================================================================
   HOME SECTIONS
   ----------------------------------------------------------------------------
   Lets the operator add a section to the home page and choose where it sits.
   Only the five content sections are offered as anchors - the hero and the
   learning path are fixed, so nothing can be placed above "دوره‌های محبوب".
   ========================================================================== */

function renderHomeSectionsList() {
  const host = document.getElementById("homeSectionsList");
  if (!host) return;

  const sections = loadHomeSections();
  if (!sections.length) {
    host.innerHTML =
      '<p class="content-editor_empty">هنوز سکشنی اضافه نشده است. ' +
      "بخش‌های پیش‌فرض صفحه اصلی دست‌نخورده باقی می‌مانند.</p>";
    return;
  }

  host.innerHTML = sections
    .map(function (section) {
      const anchor = HOME_SECTION_ANCHORS.find(function (a) {
        return a.key === section.after;
      });
      const count =
        typeof siteData !== "undefined" && siteData[section.key]
          ? (siteData[section.key].items || []).length
          : 0;
      const safeKey = String(section.key).replace(/'/g, "\\'");

      return (
        '<div class="home-section-row">' +
        '  <div class="home-section-row__main">' +
        '    <i class="fas ' +
        escapeAttr(section.icon || "fa-layer-group") +
        '"></i>' +
        "    <div>" +
        "      <strong>" +
        escapeHtml(section.title) +
        "</strong>" +
        "      <small>بعد از «" +
        escapeHtml(anchor ? anchor.title : "—") +
        "» · " +
        toPersianDigitsSafe(count) +
        " آیتم</small>" +
        "    </div>" +
        "  </div>" +
        '  <div class="home-section-row__actions">' +
        '    <button type="button" class="btn-secondary" onclick="editHomeSection(&#39;' +
        safeKey +
        '&#39;)">ویرایش</button>' +
        '    <button type="button" class="btn-secondary home-section-delete" onclick="deleteHomeSection(&#39;' +
        safeKey +
        '&#39;)">حذف</button>' +
        "  </div>" +
        "</div>"
      );
    })
    .join("");
}

/** Fill the anchor dropdown with the built-in sections, in page order. */
function populateSectionAnchors(selected) {
  const select = document.getElementById("homeSectionAfter");
  if (!select) return;
  select.innerHTML = HOME_SECTION_ANCHORS.map(function (anchor) {
    return (
      '<option value="' +
      anchor.key +
      '"' +
      (selected === anchor.key ? " selected" : "") +
      ">بعد از « " +
      anchor.title +
      " »</option>"
    );
  }).join("");
}

function openHomeSectionModal(section) {
  document.getElementById("homeSectionModalTitle").textContent = section
    ? "ویرایش سکشن"
    : "افزودن سکشن جدید";
  document.getElementById("homeSectionKey").value = section ? section.key : "";
  document.getElementById("homeSectionTitle").value = section
    ? section.title
    : "";
  document.getElementById("homeSectionBadge").value = section
    ? section.badge || ""
    : "";
  document.getElementById("homeSectionLimit").value = section
    ? section.limit || 8
    : 8;
  document.getElementById("homeSectionIcon").value = section
    ? section.icon || "fa-layer-group"
    : "fa-layer-group";
  document.getElementById("homeSectionShowAll").checked = section
    ? section.showAll !== false
    : true;
  populateSectionAnchors(section ? section.after : HOME_SECTION_ANCHORS[0].key);
  openModal("homeSectionModal");
}

function editHomeSection(key) {
  const section = loadHomeSections().find(function (s) {
    return String(s.key) === String(key);
  });
  if (!section) return;
  openHomeSectionModal(section);
}

/**
 * Remove a section, and every trace of it.
 *
 * The category has to go from siteData too. Leaving it behind meant the
 * deleted section kept appearing as a group in the items table and in the
 * category dropdown - it looked like the delete had not worked.
 *
 * Items that belonged to it are deleted with it. The confirmation says how
 * many, so this is never a surprise.
 */
function deleteHomeSection(key) {
  const sections = loadHomeSections();
  const section = sections.find(function (s) {
    return String(s.key) === String(key);
  });
  if (!section) return;

  const items =
    typeof siteData !== "undefined" && siteData[section.key]
      ? (siteData[section.key].items || []).slice()
      : [];

  const warning = items.length
    ? "سکشن «" +
      section.title +
      "» حذف شود؟\n\n" +
      toPersianDigitsSafe(items.length) +
      " آیتم داخل آن هم حذف می‌شوند. این کار برگشت‌پذیر نیست."
    : "سکشن «" + section.title + "» حذف شود؟";

  if (!confirm(warning)) return;

  // 1. drop the section itself
  saveHomeSections(
    sections.filter(function (s) {
      return String(s.key) !== String(key);
    }),
  );

  // 2. remove its items, so they do not linger as orphans in another list
  items.forEach(function (item) {
    if (typeof addDeletedItemId === "function") {
      addDeletedItemId(item.id);
    }
    if (typeof removeAddedItem === "function") {
      removeAddedItem(item.id);
    }
  });

  // 3. drop the category, otherwise the group keeps showing in the items
  //    table and the "add item" dropdown
  if (typeof siteData !== "undefined") {
    delete siteData[section.key];
  }

  renderHomeSectionsList();
  if (typeof populateCategorySelect === "function") populateCategorySelect();
  renderContentTable();
  showToast("سکشن و آیتم‌های آن حذف شدند.", "success");
}

function initHomeSections() {
  const addBtn = document.getElementById("addHomeSectionBtn");
  const form = document.getElementById("homeSectionForm");
  if (!addBtn || !form) return;

  addBtn.addEventListener("click", function () {
    openHomeSectionModal(null);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const existingKey = document.getElementById("homeSectionKey").value;
    const title = document.getElementById("homeSectionTitle").value.trim();
    if (!title) {
      showToast("نام سکشن را وارد کنید.", "error");
      return;
    }

    const sections = loadHomeSections();
    const payload = {
      title: title,
      after: document.getElementById("homeSectionAfter").value,
      icon: document.getElementById("homeSectionIcon").value,
      badge: document.getElementById("homeSectionBadge").value.trim(),
      limit:
        parseInt(document.getElementById("homeSectionLimit").value, 10) || 8,
      showAll: document.getElementById("homeSectionShowAll").checked,
    };

    if (existingKey) {
      const index = sections.findIndex(function (s) {
        return String(s.key) === String(existingKey);
      });
      if (index > -1)
        sections[index] = Object.assign({}, sections[index], payload);
    } else {
      // The key doubles as the siteData category, so it must not collide with
      // a built-in one.
      const taken = sections
        .map(function (s) {
          return s.key;
        })
        .concat(typeof siteData !== "undefined" ? Object.keys(siteData) : []);
      payload.key = makeSectionKey(title, taken);
      sections.push(payload);

      if (typeof siteData !== "undefined" && !siteData[payload.key]) {
        siteData[payload.key] = { title: title, items: [] };
      }
    }

    saveHomeSections(sections);

    // Keep the category title in step with the section title.
    if (typeof siteData !== "undefined") {
      const key = existingKey || payload.key;
      if (siteData[key]) siteData[key].title = title;
    }

    closeModal("homeSectionModal");
    renderHomeSectionsList();
    if (typeof populateCategorySelect === "function") populateCategorySelect();
    renderContentTable();
    showToast(
      existingKey ? "سکشن به‌روزرسانی شد." : "سکشن جدید ساخته شد.",
      "success",
    );
  });

  renderHomeSectionsList();
}

if (typeof window !== "undefined") {
  window.editHomeSection = editHomeSection;
  window.deleteHomeSection = deleteHomeSection;
  window.renderHomeSectionsList = renderHomeSectionsList;
  window.initHomeSections = initHomeSections;
}
