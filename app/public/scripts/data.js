const siteData = (() => {
  const fromHeader =
    typeof headerItems !== "undefined" &&
    typeof flattenHeaderItems === "function"
      ? flattenHeaderItems(headerItems)
      : {};

  const fromMain = typeof mainItems !== "undefined" ? mainItems : {};

  const merged = {
    ...fromHeader,
    ...fromMain,
  };

  // Categories created by custom home sections. Without this the section
  // exists but has nowhere to put its items.
  if (typeof loadHomeSections === "function") {
    loadHomeSections().forEach((section) => {
      if (section && section.key && !merged[section.key]) {
        merged[section.key] = { title: section.title, items: [] };
      }
    });
  }

  return typeof applyContentOverrides === "function"
    ? applyContentOverrides(merged)
    : merged;
})();
