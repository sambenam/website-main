/**
 * Admin panel — quick search
 *
 * One box in the header that searches users, products, orders and messages
 * at once, grouped by kind, with arrow-key navigation.
 *
 * searchNormalize() folds Arabic ي and ك onto Persian ی and ک and strips
 * zero-width joiners, so 'کتاب' finds 'كتاب' - a real problem when data
 * arrives from different keyboards.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function searchNormalize(value) {
  return toEnglishDigits(String(value == null ? "" : value))
    .toLowerCase()
    .replace(/[\u064A\u0649]/g, "\u06CC") // ي / ى  ->  ی
    .replace(/[\u0643]/g, "\u06A9") // ك      ->  ک
    .replace(/\u200c/g, " ") // zero-width non-joiner
    .replace(/\s+/g, " ")
    .trim();
}

const GLOBAL_SEARCH_GROUPS = {
  user: { label: "کاربران", icon: "fa-user", view: "users" },
  staff: { label: "مدیریت دسترسی‌ها", icon: "fa-user-shield", view: "staff" },
  product: { label: "محصولات", icon: "fa-box", view: "products" },
  order: { label: "سفارشات", icon: "fa-receipt", view: "orders" },
  content: {
    label: "محتوای سایت",
    icon: "fa-file-lines",
    view: "site-content",
  },
  message: { label: "پیام‌ها", icon: "fa-comment-dots", view: "messages" },
};

/**
 * Collect everything matching the query.
 *
 * Each record contributes a "haystack" of the fields worth searching. A
 * phone number is only searchable by an operator allowed to see it -
 * otherwise a restricted admin could confirm a number by guessing at it,
 * which is exactly what masking is there to prevent.
 */
function globalSearchResults(rawQuery, limitPerGroup) {
  const query = searchNormalize(rawQuery);
  if (query.length < 2) return [];

  const limit = limitPerGroup || 5;
  const manager = isManager();
  const groups = {};
  const push = (type, item) => {
    (groups[type] ||= []).push(item);
  };
  const hit = (haystack) =>
    searchNormalize(haystack.filter(Boolean).join(" ")).includes(query);

  /* ---- users (regular accounts) ---- */
  (appState.users || []).forEach((user) => {
    if (!user || rankOf(user.role) !== 3) return;
    const fields = [user.name, user.email, user.id, user.role, user.status];
    if (manager) fields.push(user.phone);
    if (!hit(fields)) return;
    push("user", {
      title: user.name || "بدون نام",
      subtitle: user.email || "—",
      badge: user.status || "",
      // Only a manager can open the edit sheet; others just land on the tab.
      action: manager
        ? `editUser('${String(user.id).replace(/'/g, "\\'")}')`
        : null,
    });
  });

  /* ---- staff (admins and managers) ---- */
  (appState.users || []).forEach((user) => {
    if (!user || rankOf(user.role) > 2) return;
    const fields = [user.name, user.email, user.id, user.role];
    if (manager) fields.push(user.phone);
    if (!hit(fields)) return;
    push("staff", {
      title: user.name || "بدون نام",
      subtitle: (user.role || "—") + " · " + (user.email || "—"),
      badge: user.status || "",
      action: manager
        ? `editStaff('${String(user.id).replace(/'/g, "\\'")}')`
        : null,
    });
  });

  /* ---- products ---- */
  (appState.products || []).forEach((product) => {
    if (!product || !product.id) return;
    if (
      !hit([
        product.name,
        product.id,
        product.category,
        articleTitleFor(product),
      ])
    )
      return;
    push("product", {
      title: product.name || "بدون نام",
      subtitle: product.id,
      badge: formatProductPrice(product.price),
      action: `editProduct('${String(product.id).replace(/'/g, "\\'")}')`,
    });
  });

  /* ---- orders ---- */
  (appState.orders || []).forEach((order) => {
    if (!order || !order.id) return;
    if (
      !hit([
        order.id,
        order.customer,
        order.product,
        order.buyerEmail,
        order.amount,
      ])
    )
      return;
    push("order", {
      title: order.id,
      subtitle: (order.customer || "—") + " · " + (order.product || "—"),
      badge: getStatusText(order.status),
      action: `openOrderDetailModal('${String(order.id).replace(/'/g, "\\'")}')`,
    });
  });

  /* ---- site content ---- */
  if (typeof getAllSiteItems === "function") {
    try {
      getAllSiteItems().forEach((row) => {
        if (!hit([row.id, row.title, row.categoryTitle])) return;
        push("content", {
          title: row.title || "بدون عنوان",
          subtitle: row.categoryTitle || row.id,
          badge: "",
          action: `openContentEditor('${String(row.id).replace(/'/g, "\\'")}')`,
        });
      });
    } catch (e) {
      /* content not loaded on this page */
    }
  }

  /* ---- messages ---- */
  (appState.messages || []).forEach((message) => {
    if (!message || !message.id) return;
    if (!hit([message.sender, message.email, message.text, message.subject]))
      return;
    push("message", {
      title: message.sender || "ناشناس",
      subtitle: String(message.text || "").slice(0, 60),
      badge: isUnreadMessage(message) ? "خوانده‌نشده" : "",
      action: `openReadMessageModal('${String(message.id).replace(/'/g, "\\'")}')`,
    });
  });

  // Flatten in a stable order, capped per group so one busy list cannot
  // crowd out the others.
  return Object.keys(GLOBAL_SEARCH_GROUPS)
    .filter((type) => groups[type] && groups[type].length)
    .map((type) => ({
      type: type,
      meta: GLOBAL_SEARCH_GROUPS[type],
      items: groups[type].slice(0, limit),
      total: groups[type].length,
    }));
}

let globalSearchIndex = -1;

function renderGlobalSearch(rawQuery) {
  const panel = document.getElementById("globalSearchResults");
  if (!panel) return;

  const query = String(rawQuery || "").trim();
  globalSearchIndex = -1;

  if (searchNormalize(query).length < 2) {
    panel.innerHTML = query
      ? '<p class="global-search__empty">برای جستجو حداقل دو حرف وارد کنید.</p>'
      : "";
    panel.classList.toggle("is-open", Boolean(query));
    return;
  }

  const groups = globalSearchResults(query);
  if (!groups.length) {
    panel.innerHTML =
      '<p class="global-search__empty">نتیجه‌ای برای «' +
      escapeHtml(query) +
      "» پیدا نشد.</p>";
    panel.classList.add("is-open");
    return;
  }

  panel.innerHTML = groups
    .map((group) => {
      const more =
        group.total > group.items.length
          ? '<span class="global-search__more">' +
            toPersianDigits(group.total - group.items.length) +
            " مورد دیگر</span>"
          : "";
      const rows = group.items
        .map((item) => {
          const badge = item.badge
            ? '<span class="global-search__badge">' +
              escapeHtml(item.badge) +
              "</span>"
            : "";
          return (
            '<button type="button" class="global-search__item"' +
            ' data-action="' +
            escapeHtml(item.action || "") +
            '"' +
            ' data-view="' +
            escapeHtml(group.meta.view) +
            '">' +
            '  <i class="fas ' +
            group.meta.icon +
            '"></i>' +
            '  <span class="global-search__text">' +
            "    <strong>" +
            escapeHtml(item.title) +
            "</strong>" +
            "    <small>" +
            escapeHtml(item.subtitle) +
            "</small>" +
            "  </span>" +
            badge +
            "</button>"
          );
        })
        .join("");

      return (
        '<div class="global-search__group">' +
        '  <div class="global-search__head">' +
        "    <span>" +
        group.meta.label +
        "</span>" +
        more +
        "  </div>" +
        rows +
        "</div>"
      );
    })
    .join("");

  panel.classList.add("is-open");
}

function closeGlobalSearch() {
  const panel = document.getElementById("globalSearchResults");
  if (panel) panel.classList.remove("is-open");
  globalSearchIndex = -1;
}

/** Jump to the record: switch to its tab, then open its existing modal. */
function runGlobalSearchItem(button) {
  if (!button) return;
  const view = button.getAttribute("data-view");
  const action = button.getAttribute("data-action");

  if (view) switchView(view);
  closeGlobalSearch();

  const input = document.getElementById("globalSearch");
  if (input) input.value = "";

  if (action) {
    // Let the view finish painting before its modal opens on top.
    setTimeout(function () {
      try {
        window.eval(action);
      } catch (e) {
        console.warn("global search: " + e.message);
      }
    }, 60);
  }
}

function moveGlobalSearchFocus(step) {
  const items = [...document.querySelectorAll(".global-search__item")];
  if (!items.length) return;
  items.forEach((el) => el.classList.remove("is-active"));
  globalSearchIndex = (globalSearchIndex + step + items.length) % items.length;
  const active = items[globalSearchIndex];
  active.classList.add("is-active");
  scrollElementIntoView(active, { block: "nearest" });
}

function initGlobalSearch() {
  const input = document.getElementById("globalSearch");
  const panel = document.getElementById("globalSearchResults");
  if (!input || !panel) return;

  // Bind once. If this ran twice every keypress would be handled twice, and
  // the arrow keys would jump two rows at a time instead of one.
  if (input.dataset.searchBound === "true") return;
  input.dataset.searchBound = "true";

  let timer = null;
  input.addEventListener("input", function () {
    // Debounced: re-scanning every list on each keystroke is wasted work.
    clearTimeout(timer);
    const value = input.value;
    timer = setTimeout(function () {
      renderGlobalSearch(value);
    }, 140);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeGlobalSearch();
      input.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGlobalSearchFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGlobalSearchFocus(-1);
      return;
    }
    if (event.key === "Enter") {
      const items = [...panel.querySelectorAll(".global-search__item")];
      if (!items.length) return;
      event.preventDefault();
      runGlobalSearchItem(
        items[globalSearchIndex >= 0 ? globalSearchIndex : 0],
      );
    }
  });

  input.addEventListener("focus", function () {
    if (input.value.trim()) renderGlobalSearch(input.value);
  });

  panel.addEventListener("click", function (event) {
    const button = event.target.closest(".global-search__item");
    if (button) runGlobalSearchItem(button);
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".search-box")) closeGlobalSearch();
  });
}

function initSearch() {
  const userSearch = document.getElementById("userTableSearch");
  if (userSearch) {
    userSearch.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll("#usersManageTable tbody tr").forEach((row) => {
        row.style.display = row.textContent.toLowerCase().includes(query)
          ? ""
          : "none";
      });
    });
  }

  const staffSearch = document.getElementById("staffTableSearch");
  if (staffSearch) staffSearch.addEventListener("input", renderStaffTable);

  const prodSearch = document.getElementById("productTableSearch");
  if (prodSearch) {
    prodSearch.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      document
        .querySelectorAll("#productsManageTable tbody tr")
        .forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(query)
            ? ""
            : "none";
        });
    });
  }
}

// --- ADVANCED DYNAMIC ANALYTICS SYSTEM ---

/**
 * The twelve Jalali month names, in order. Index 0 is فروردین.
 */
