const ITEM_CONTENT_STORAGE_KEY = "irHesabdarItemContent";
const ADDED_ITEMS_KEY = "irHesabdarAddedItems";
const DELETED_ITEMS_KEY = "irHesabdarDeletedItems";

function loadContentOverrides() {
  try {
    const raw = localStorage.getItem(ITEM_CONTENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.warn("item-store: خطا در خواندن localStorage", error);
    return {};
  }
}

function saveContentOverride(itemId, payload) {
  const overrides = loadContentOverrides();
  const current = overrides[itemId] || {};
  if (typeof payload === "object") {
    overrides[itemId] = {
      content:
        payload.content !== undefined
          ? payload.content
          : current.content || payload,
      excerpt:
        payload.excerpt !== undefined ? payload.excerpt : current.excerpt,
      title: payload.title !== undefined ? payload.title : current.title,
      image: payload.image !== undefined ? payload.image : current.image,
    };
  } else {
    overrides[itemId] = { content: payload, excerpt: current.excerpt };
  }

  localStorage.setItem(ITEM_CONTENT_STORAGE_KEY, JSON.stringify(overrides));
}

function removeContentOverride(itemId) {
  const overrides = loadContentOverrides();
  delete overrides[itemId];
  localStorage.setItem(ITEM_CONTENT_STORAGE_KEY, JSON.stringify(overrides));
}

function getContentOverride(itemId) {
  const saved = loadContentOverrides()[itemId];
  if (!saved) {
    return null;
  }
  return saved.content || saved;
}

// Added Items Helpers
function loadAddedItems() {
  try {
    const raw = localStorage.getItem(ADDED_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("item-store: خطا در خواندن AddedItems", error);
    return [];
  }
}

function saveAddedItem(item) {
  const items = loadAddedItems();
  const index = items.findIndex((i) => i.id === item.id);
  if (index > -1) {
    items[index] = item;
  } else {
    items.push(item);
  }
  localStorage.setItem(ADDED_ITEMS_KEY, JSON.stringify(items));
}

function removeAddedItem(itemId) {
  const items = loadAddedItems();
  const filtered = items.filter((i) => i.id !== itemId);
  localStorage.setItem(ADDED_ITEMS_KEY, JSON.stringify(filtered));
}

// Deleted Items Helpers
function loadDeletedItemIds() {
  try {
    const raw = localStorage.getItem(DELETED_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("item-store: خطا در خواندن DeletedItems", error);
    return [];
  }
}

function addDeletedItemId(itemId) {
  const ids = loadDeletedItemIds();
  if (!ids.includes(itemId)) {
    ids.push(itemId);
  }
  localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(ids));

  // also remove from added items if it was added
  removeAddedItem(itemId);
}

function applyContentOverrides(data) {
  const overrides = loadContentOverrides();
  const deletedIds = loadDeletedItemIds();
  const addedItems = loadAddedItems();

  Object.keys(data).forEach(function (catKey) {
    const category = data[catKey];
    if (!category) {
      return;
    }

    if (!Array.isArray(category.items)) {
      category.items = [];
    }

    // 1. Filter out deleted items
    category.items = category.items.filter(function (item) {
      return !deletedIds.includes(item.id);
    });

    // 2. Insert added items for this category
    addedItems.forEach(function (item) {
      if (item.categoryKey === catKey) {
        if (
          !category.items.some(function (i) {
            return i.id === item.id;
          })
        ) {
          category.items.push(item);
        }
      }
    });

    // 2.5 Sort items numerically by ID (so they sit next to each other correctly, e.g. diploma-1, diploma-2, diploma-3)
    category.items.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    // 3. Map with edited overrides

    category.items = category.items.map(function (item) {
      const saved = overrides[item.id];
      if (!saved) {
        return item;
      }
      const patch = {};
      if (saved.content !== undefined) {
        patch.content = saved.content;
      } else if (saved.body !== undefined) {
        patch.content = saved.body;
      } else {
        patch.content = saved;
      }

      if (saved.excerpt !== undefined) {
        patch.excerpt = saved.excerpt;
      }

      if (saved.title !== undefined) {
        patch.title = saved.title;
      }
      if (saved.image !== undefined) {
        patch.image = saved.image;
      }

      return Object.assign({}, item, patch);
    });
  });

  return data;
}

function findSiteItem(itemId) {
  if (typeof siteData === "undefined") {
    return null;
  }

  for (const catKey in siteData) {
    const category = siteData[catKey];
    if (!category || !Array.isArray(category.items)) {
      continue;
    }

    const item = category.items.find(function (entry) {
      return entry.id === itemId;
    });

    if (item) {
      return {
        item: item,
        categoryKey: catKey,
        categoryTitle: category.title,
      };
    }
  }

  return null;
}

function getAllSiteItems() {
  if (typeof siteData === "undefined") {
    return [];
  }

  const rows = [];

  Object.keys(siteData).forEach(function (catKey) {
    const category = siteData[catKey];
    if (!category || !Array.isArray(category.items)) {
      return;
    }

    category.items.forEach(function (item) {
      rows.push({
        id: item.id,
        title: item.title,
        excerpt: item.excerpt || "",
        categoryKey: catKey,
        categoryTitle: category.title,
        hasOverride: Boolean(getContentOverride(item.id)),
        hasBlocks:
          typeof getContentBlocks === "function"
            ? getContentBlocks(item).length > 0
            : Boolean(item.content),
      });
    });
  });

  return rows;
}

if (typeof module !== "undefined") {
  module.exports = {
    ITEM_CONTENT_STORAGE_KEY,
    loadContentOverrides,
    saveContentOverride,
    removeContentOverride,
    getContentOverride,
    applyContentOverrides,
    findSiteItem,
    getAllSiteItems,
  };
}
