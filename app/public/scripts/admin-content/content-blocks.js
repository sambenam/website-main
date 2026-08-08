/**
 * Site content — the block editor
 *
 * A block is one piece of a page: a heading, a paragraph, a list or an image.
 * This is the editor that adds, reorders and removes them, and the dialog
 * that opens the whole thing.
 *
 * Split out of scripts/admin-content.js, which had grown to 1,784 lines.
 * Every classic <script> shares one global scope, so these four files see
 * each other exactly as one file would. Nothing here runs while the file is
 * being parsed except the boot hook at the end of content-table.js, which is
 * why that file loads last.
 */

function openContentEditor(itemId) {
  const found = findSiteItem(itemId);
  if (!found) {
    showToast("آیتم پیدا نشد", "error");
    return;
  }

  const item = found.item;
  contentEditorState.itemId = itemId;
  contentEditorState.blocks = getContentBlocks(item);
  contentEditorState.downloads = getEditableDownloads(item);

  document.getElementById("editContentItemId").value = itemId;
  const titleInput = document.getElementById("editContentTitleInput");
  if (titleInput) {
    titleInput.value = item.title || "";
  }

  const imageInput = document.getElementById("editContentImageInput");
  if (imageInput) {
    imageInput.value = item.image || "";
  }
  document.getElementById("editContentCategory").textContent =
    found.categoryTitle;
  document.getElementById("editContentExcerpt").value = item.excerpt || "";

  const content =
    item.content && typeof item.content === "object" ? item.content : {};
  const video = content.video || {};
  const videoEnabled = Boolean(video.enabled && video.url);

  document.getElementById("contentVideoEnabled").checked = videoEnabled;
  document.getElementById("contentVideoUrl").value = video.url || "";
  document.getElementById("contentVideoProvider").value =
    video.provider || "youtube";
  document.getElementById("contentVideoTitle").value = video.title || "";

  renderBlocksEditor();
  renderDownloadsEditor();
  toggleVideoFields();

  // Load associated product prices (separate for Video and Files/Downloads)
  const productsRaw = localStorage.getItem("irHesabdarProducts");
  let videoProductPrice = 0;
  let filesProductPrice = 0;
  if (productsRaw) {
    try {
      const prods = JSON.parse(productsRaw);
      if (Array.isArray(prods)) {
        const videoProd = prods.find(function (p) {
          return String(p.id) === String(itemId) + "-video";
        });
        if (videoProd) {
          videoProductPrice = Number(videoProd.price) || 0;
        }
        const filesProd = prods.find(function (p) {
          return String(p.id) === String(itemId);
        });
        if (filesProd) {
          filesProductPrice = Number(filesProd.price) || 0;
        }
      }
    } catch (e) {}
  }

  // Setup Video Lock Initial State
  const cVideoIsPaid = document.getElementById("contentVideoIsPaid");
  const cVideoPriceContainer = document.getElementById(
    "contentVideoPriceContainer",
  );
  const cVideoPrice = document.getElementById("contentVideoPrice");

  if (cVideoIsPaid && cVideoPriceContainer && cVideoPrice) {
    if (videoProductPrice > 0) {
      cVideoIsPaid.checked = true;
      cVideoPriceContainer.style.display = "flex";
      writePriceInput(cVideoPrice, videoProductPrice);
      cVideoPrice.required = true;
    } else {
      cVideoIsPaid.checked = false;
      cVideoPriceContainer.style.display = "none";
      cVideoPrice.value = "";
      cVideoPrice.required = false;
    }
  }

  // Setup Files Lock Initial State
  const cFilesIsPaid = document.getElementById("contentFilesIsPaid");
  const cFilesPriceContainer = document.getElementById(
    "contentFilesPriceContainer",
  );
  const cFilesPrice = document.getElementById("contentFilesPrice");

  if (cFilesIsPaid && cFilesPriceContainer && cFilesPrice) {
    if (filesProductPrice > 0) {
      cFilesIsPaid.checked = true;
      cFilesPriceContainer.style.display = "flex";
      writePriceInput(cFilesPrice, filesProductPrice);
      cFilesPrice.required = true;
    } else {
      cFilesIsPaid.checked = false;
      cFilesPriceContainer.style.display = "none";
      cFilesPrice.value = "";
      cFilesPrice.required = false;
    }
  }

  openModal("editContentModal");
}

function getEditableDownloads(item) {
  const content =
    item.content && typeof item.content === "object" ? item.content : {};
  const downloads = content.downloads || item.downloads || [];

  if (!Array.isArray(downloads)) {
    return [];
  }

  return downloads.map(function (file, index) {
    return {
      id: file.id || "download-" + (index + 1),
      title: file.title || "",
      url: file.url || "",
      type: file.type || "file",
      size: file.size || "",
    };
  });
}

function renderBlocksEditor() {
  const container = document.getElementById("contentBlocksEditor");
  if (!container) {
    return;
  }

  if (!contentEditorState.blocks.length) {
    container.innerHTML =
      '<p class="content-editor_empty">هنوز بلوکی اضافه نشده. از دکمه‌های بالا استفاده کنید.</p>';
    return;
  }

  container.innerHTML = contentEditorState.blocks
    .map(function (block, index) {
      return buildBlockEditorHtml(block, index);
    })
    .join("");

  bindBlockEditorEvents(container);
}

function buildBlockEditorHtml(block, index) {
  const labels = {
    heading: "عنوان",
    paragraph: "پاراگراف",
    list: "لیست",
    "ordered-list": "لیست شماره‌دار",
    quote: "نقل‌قول",
    link: "لینک",
    image: "تصویر",
    divider: "جداکننده",
    html: "HTML سفارشی",
  };

  let fields = "";

  if (block.type === "heading") {
    fields =
      "<label>متن عنوان</label>" +
      '<input type="text" class="form-control block-text" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.text || "") +
      '">' +
      '<label style="margin-top:8px">سطح</label>' +
      '<select class="form-control block-level" data-index="' +
      index +
      '">' +
      [1, 2, 3, 4, 5, 6]
        .map(function (level) {
          return (
            '<option value="' +
            level +
            '"' +
            (block.level === level ? " selected" : "") +
            ">H" +
            level +
            "</option>"
          );
        })
        .join("") +
      "</select>";
  } else if (block.type === "paragraph") {
    fields =
      "<label>متن پاراگراف</label>" +
      '<textarea class="form-control block-text" rows="3" data-index="' +
      index +
      '">' +
      escapeHtml(block.text || "") +
      "</textarea>";
  } else if (block.type === "list" || block.type === "ordered-list") {
    const listValue = (block.items || []).join("\n");
    fields =
      "<label>آیتم‌ها (هر خط یک مورد)</label>" +
      '<textarea class="form-control block-items" rows="4" data-index="' +
      index +
      '">' +
      escapeHtml(listValue) +
      "</textarea>";
  } else if (block.type === "quote") {
    fields =
      "<label>متن نقل‌قول</label>" +
      '<textarea class="form-control block-text" rows="3" data-index="' +
      index +
      '">' +
      escapeHtml(block.text || "") +
      "</textarea>" +
      '<label style="margin-top:8px">منبع یا گوینده (اختیاری)</label>' +
      '<input type="text" class="form-control block-cite" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.cite || "") +
      '">';
  } else if (block.type === "link") {
    fields =
      "<label>متن لینک</label>" +
      '<input type="text" class="form-control block-text" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.text || "") +
      '">' +
      '<label style="margin-top:8px">آدرس لینک</label>' +
      '<input type="text" class="form-control block-url" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.url || "") +
      '">' +
      '<label style="margin-top:8px">نحوه باز شدن</label>' +
      '<select class="form-control block-target" data-index="' +
      index +
      '">' +
      '<option value="_blank"' +
      (block.target !== "_self" ? " selected" : "") +
      ">تب جدید</option>" +
      '<option value="_self"' +
      (block.target === "_self" ? " selected" : "") +
      ">همین صفحه</option>" +
      "</select>";
  } else if (block.type === "image") {
    fields =
      "<label>آدرس تصویر</label>" +
      '<input type="text" class="form-control block-src" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.src || "") +
      '">' +
      '<label style="margin-top:8px">متن جایگزین</label>' +
      '<input type="text" class="form-control block-alt" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.alt || "") +
      '">' +
      '<label style="margin-top:8px">توضیح زیر تصویر (اختیاری)</label>' +
      '<input type="text" class="form-control block-caption" data-index="' +
      index +
      '" value="' +
      escapeAttr(block.caption || "") +
      '">';
  } else if (block.type === "html") {
    fields =
      "<label>کد HTML این بخش</label>" +
      '<textarea class="form-control block-html" rows="7" data-index="' +
      index +
      '" dir="ltr">' +
      escapeHtml(block.html || "") +
      "</textarea>";
  } else if (block.type === "divider") {
    fields =
      '<p class="content-editor_empty">یک خط جداکننده در متن نمایش داده می‌شود.</p>';
  }

  return (
    '<div class="content-block-card" data-block-index="' +
    index +
    '">' +
    '<div class="content-block-card_header">' +
    "<strong>" +
    (labels[block.type] || block.type) +
    "</strong>" +
    '<div class="content-block-card_actions">' +
    '<button type="button" class="btn-secondary block-move-up" data-index="' +
    index +
    '" title="بالا">↑</button>' +
    '<button type="button" class="btn-secondary block-move-down" data-index="' +
    index +
    '" title="پایین">↓</button>' +
    '<button type="button" class="btn-secondary block-delete" data-index="' +
    index +
    '" style="color:var(--danger)">حذف</button>' +
    "</div></div>" +
    fields +
    "</div>"
  );
}

function bindBlockEditorEvents(container) {
  container.querySelectorAll(".block-text").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].text = input.value;
    });
  });

  container.querySelectorAll(".block-level").forEach(function (select) {
    select.addEventListener("change", function () {
      const index = Number(select.getAttribute("data-index"));
      contentEditorState.blocks[index].level = Number(select.value);
    });
  });

  container.querySelectorAll(".block-items").forEach(function (textarea) {
    textarea.addEventListener("input", function () {
      const index = Number(textarea.getAttribute("data-index"));
      contentEditorState.blocks[index].items = textarea.value
        .split("\n")
        .map(function (line) {
          return line.trim();
        })
        .filter(Boolean);
    });
  });

  container.querySelectorAll(".block-cite").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].cite = input.value;
    });
  });

  container.querySelectorAll(".block-url").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].url = input.value;
    });
  });

  container.querySelectorAll(".block-target").forEach(function (select) {
    select.addEventListener("change", function () {
      const index = Number(select.getAttribute("data-index"));
      contentEditorState.blocks[index].target = select.value;
    });
  });

  container.querySelectorAll(".block-src").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].src = input.value;
    });
  });

  container.querySelectorAll(".block-alt").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].alt = input.value;
    });
  });

  container.querySelectorAll(".block-caption").forEach(function (input) {
    input.addEventListener("input", function () {
      const index = Number(input.getAttribute("data-index"));
      contentEditorState.blocks[index].caption = input.value;
    });
  });

  container.querySelectorAll(".block-html").forEach(function (textarea) {
    textarea.addEventListener("input", function () {
      const index = Number(textarea.getAttribute("data-index"));
      contentEditorState.blocks[index].html = textarea.value;
    });
  });

  container.querySelectorAll(".block-delete").forEach(function (button) {
    button.addEventListener("click", function () {
      const index = Number(button.getAttribute("data-index"));
      contentEditorState.blocks.splice(index, 1);
      renderBlocksEditor();
    });
  });

  container.querySelectorAll(".block-move-up").forEach(function (button) {
    button.addEventListener("click", function () {
      moveBlock(Number(button.getAttribute("data-index")), -1);
    });
  });

  container.querySelectorAll(".block-move-down").forEach(function (button) {
    button.addEventListener("click", function () {
      moveBlock(Number(button.getAttribute("data-index")), 1);
    });
  });
}

function moveBlock(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= contentEditorState.blocks.length) {
    return;
  }

  const blocks = contentEditorState.blocks;
  const temp = blocks[index];
  blocks[index] = blocks[target];
  blocks[target] = temp;
  renderBlocksEditor();
}
