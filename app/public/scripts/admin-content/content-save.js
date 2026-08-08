/**
 * Site content — saving an edit
 *
 * Collecting every field of the editor back into an item, writing it through
 * appApi, and the two small escaping helpers the whole tab shares.
 *
 * Split out of scripts/admin-content.js, which had grown to 1,784 lines.
 * Every classic <script> shares one global scope, so these four files see
 * each other exactly as one file would. Nothing here runs while the file is
 * being parsed except the boot hook at the end of content-table.js, which is
 * why that file loads last.
 */

function saveEditedContent() {
  if (!contentEditorState.itemId) {
    return;
  }

  const blocks = contentEditorState.blocks
    .map(function (block) {
      return typeof normalizeBlock === "function"
        ? normalizeBlock(block)
        : block;
    })
    .filter(function (block) {
      if (!block) {
        return false;
      }
      if (
        block.type === "heading" ||
        block.type === "paragraph" ||
        block.type === "quote"
      ) {
        return Boolean(block.text);
      }
      if (block.type === "list" || block.type === "ordered-list") {
        return block.items.length > 0;
      }
      if (block.type === "link") {
        return Boolean(block.text && block.url);
      }
      if (block.type === "image") {
        return Boolean(block.src);
      }
      if (block.type === "html") {
        return Boolean(block.html.trim());
      }
      return block.type === "divider";
    });

  const content = { blocks: blocks };
  const excerpt = document.getElementById("editContentExcerpt").value.trim();
  const videoEnabled = document.getElementById("contentVideoEnabled").checked;
  const videoUrl = document.getElementById("contentVideoUrl").value.trim();

  if (videoEnabled && videoUrl) {
    // Clean the link and pick the right player before anything is saved.
    // Pasting an Aparat URL while the dropdown still says "file" used to
    // produce an empty <video> tag on the article - the same bug that was
    // fixed in the products tab.
    const cleanUrl =
      typeof normalizeDownloadUrl === "function"
        ? normalizeDownloadUrl(videoUrl)
        : videoUrl;
    let provider = document.getElementById("contentVideoProvider").value;
    if (typeof videoProviderFor === "function") {
      const detected = videoProviderFor(cleanUrl);
      // A direct file link keeps whatever the operator chose; a recognised
      // hosting link overrides it.
      if (detected !== "file") provider = detected;
    }

    content.video = {
      enabled: true,
      url: cleanUrl,
      provider: provider,
      title: document.getElementById("contentVideoTitle").value.trim(),
    };
  }

  const downloads = collectDownloadsFromForm();
  if (downloads.length) {
    content.downloads = downloads;
  }
  const title = document.getElementById("editContentTitleInput")
    ? document.getElementById("editContentTitleInput").value.trim()
    : "";
  const image = document.getElementById("editContentImageInput")
    ? document.getElementById("editContentImageInput").value.trim()
    : "";

  saveContentOverride(contentEditorState.itemId, {
    content: content,
    excerpt: excerpt,
    title: title || undefined,
    image: image || undefined,
  });
  // If this item was a custom added item, make sure we update its base details inside addedItems
  if (typeof loadAddedItems === "function") {
    const addedItems = loadAddedItems();
    const idx = addedItems.findIndex(function (i) {
      return i.id === contentEditorState.itemId;
    });
    if (idx > -1) {
      addedItems[idx].title = title || addedItems[idx].title;
      addedItems[idx].image = image || addedItems[idx].image;
      addedItems[idx].excerpt = excerpt;
      addedItems[idx].content = content;
      localStorage.setItem("irHesabdarAddedItems", JSON.stringify(addedItems));
    }
  }
  if (typeof appApi !== "undefined" && appApi.content) {
    appApi.content
      .update(contentEditorState.itemId, { content: content, excerpt: excerpt })
      .catch(function (error) {
        console.warn("admin-content: همگام‌سازی API انجام نشد", error);
      });
  }

  const found = findSiteItem(contentEditorState.itemId);
  if (found) {
    found.item.content = content;
    found.item.excerpt = excerpt;
    if (title) {
      found.item.title = title;
    }
    if (image) {
      found.item.image = image;
    }
  }

  if (
    typeof applyContentOverrides === "function" &&
    typeof siteData !== "undefined"
  ) {
    applyContentOverrides(siteData);
  }

  // AUTOMATIC REVERSE SYNC: Content to Product (Separate for Video and Files/Downloads)
  const hasDownloads = downloads && downloads.length > 0;
  const hasVideo = content.video && content.video.enabled && content.video.url;

  const videoIsPaid = document.getElementById("contentVideoIsPaid")
    ? document.getElementById("contentVideoIsPaid").checked
    : false;
  const videoPrice = videoIsPaid
    ? readPriceInput(document.getElementById("contentVideoPrice"))
    : 0;

  const filesIsPaid = document.getElementById("contentFilesIsPaid")
    ? document.getElementById("contentFilesIsPaid").checked
    : false;
  const filesPrice = filesIsPaid
    ? readPriceInput(document.getElementById("contentFilesPrice"))
    : 0;

  const productsRaw = localStorage.getItem("irHesabdarProducts");
  let products = [];
  if (productsRaw) {
    try {
      products = JSON.parse(productsRaw);
    } catch (e) {}
  }
  if (!Array.isArray(products)) products = [];

  const finalTitle = title || (found ? found.item.title : "") || "محصول آموزشی";
  const finalImage =
    image || (found ? found.item.image : "") || "../images/ravin.png";

  // 1. Sync Video Product (ID: [itemId]-video)
  const videoProductId = contentEditorState.itemId + "-video";
  const existingVideoIdx = products.findIndex(function (p) {
    return String(p.id) === String(videoProductId);
  });

  if (hasVideo) {
    const updatedVideoProd = {
      id: videoProductId,
      contentId: contentEditorState.itemId,
      name: "تماشای آنلاین ویدیو: " + finalTitle,
      category: "mp4",
      price: videoPrice,
      fileUrl: content.video.url,
      // No invented size: an Aparat video has no download size, and a real
      // one is unknown until the operator types it.
      fileSize: content.video.size || "",
      img: finalImage,
    };
    if (existingVideoIdx > -1) {
      products[existingVideoIdx] = updatedVideoProd;
    } else {
      products.unshift(updatedVideoProd);
    }
  } else {
    // Delete video product if no video
    products = products.filter(function (p) {
      return String(p.id) !== String(videoProductId);
    });
  }

  // 2. Sync Files/Downloads Product (ID: [itemId])
  const filesProductId = contentEditorState.itemId;
  const existingFilesIdx = products.findIndex(function (p) {
    return String(p.id) === String(filesProductId);
  });

  if (hasDownloads) {
    const firstFile = downloads[0];
    const updatedFilesProd = {
      id: filesProductId,
      contentId: contentEditorState.itemId,
      name: "دانلود فایل‌های دوره: " + finalTitle,
      category: firstFile.type || "pdf",
      price: filesPrice,
      fileUrl: firstFile.url,
      fileSize: firstFile.size || "10MB",
      img: finalImage,
    };
    if (existingFilesIdx > -1) {
      products[existingFilesIdx] = updatedFilesProd;
    } else {
      products.unshift(updatedFilesProd);
    }
  } else {
    // Delete files product if no downloads
    products = products.filter(function (p) {
      return String(p.id) !== String(filesProductId);
    });
  }

  // Route the write through appApi so the products created here reach the
  // server once the backend is live, exactly like the products tab.
  localStorage.setItem("irHesabdarProducts", JSON.stringify(products));
  if (typeof appApi !== "undefined" && appApi.admin && appApi.admin.products) {
    const syncOne = (product) => {
      appApi.admin.products
        .update(product.id, product)
        .catch(() => appApi.admin.products.create(product).catch(() => {}));
    };
    if (hasVideo)
      syncOne(products.find((p) => String(p.id) === String(videoProductId)));
    else appApi.admin.products.remove(videoProductId).catch(() => {});

    if (hasDownloads)
      syncOne(products.find((p) => String(p.id) === String(filesProductId)));
    else appApi.admin.products.remove(filesProductId).catch(() => {});
  }

  if (typeof appState !== "undefined") {
    appState.products = products;
    if (typeof renderProductsTable === "function") {
      renderProductsTable();
    }
    if (typeof renderDashboardProducts === "function") {
      renderDashboardProducts();
    }
  }

  closeModal("editContentModal");
  renderContentTable();
  showToast(
    "محتوای «" + contentEditorState.itemId + "» با موفقیت ذخیره شد",
    "success",
  );
}

function resetEditedContent() {
  if (
    !contentEditorState.itemId ||
    typeof removeContentOverride !== "function"
  ) {
    return;
  }

  if (!confirm("محتوای ذخیره‌شده حذف و نسخه پیش‌فرض نمایش داده شود؟")) {
    return;
  }

  removeContentOverride(contentEditorState.itemId);
  if (typeof appApi !== "undefined" && appApi.content) {
    appApi.content.remove(contentEditorState.itemId).catch(function (error) {
      console.warn("admin-content: حذف از API انجام نشد", error);
    });
  }
  window.location.reload();
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * NOTE: item-content.js defines an escapeHtml too and both files load on
 * admin.html. This file loads last, so this definition wins - it must be at
 * least as strict as the other one. Quotes are escaped so the result is safe
 * inside attribute values, not just text nodes.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
