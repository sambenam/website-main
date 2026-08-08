/**
 * Admin panel — products tab and file-source guidance
 *
 * The products table, its add/edit dialogs, and the advice shown under a
 * file URL.
 *
 * The file-source rules, which come from what actually works from Iran:
 * video always goes to Aparat, never this server. A file under 10 MB is
 * fine on your own hosting. Above 50 MB it belongs on Iranian cloud storage
 * (Arvan, Liara). Google Drive and Dropbox are unreachable from Iran, so
 * 'your own host' is always offered first.
 *
 * Every price field is grouped in threes as the operator types; see
 * attachPriceFormatting().
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function formatProductPrice(price) {
  if (typeof price === "number") {
    if (price === 0) {
      return `<span class="status success" style="background: rgba(52, 199, 89, 0.1); color: #34c759; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">رایگان</span>`;
    }
    return toPersianDigits(price.toLocaleString()) + " تومان";
  }
  const cleanNum = parseFloat(String(price || "").replace(/[^\d.]/g, ""));
  if (!isNaN(cleanNum)) {
    if (cleanNum === 0) {
      return `<span class="status success" style="background: rgba(52, 199, 89, 0.1); color: #34c759; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">رایگان</span>`;
    }
    return toPersianDigits(cleanNum.toLocaleString()) + " تومان";
  }
  return toPersianDigits(String(price || "رایگان"));
}

function renderProductsTable() {
  const tbody = document.querySelector("#productsManageTable tbody");
  if (!tbody) return;

  const searchInput = document.getElementById("productTableSearch");
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filteredProducts = appState.products.filter((p) => {
    if (!p || !p.id) return false;
    return [p.name, p.id, p.category, articleTitleFor(p)]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery);
  });

  tbody.innerHTML =
    filteredProducts
      .map((prod) => {
        const video = isVideoProduct(prod);
        const typeBadge = video
          ? '<span class="product-type-badge product-type-badge--video"><i class="fas fa-play"></i> ویدیو</span>'
          : '<span class="product-type-badge product-type-badge--file"><i class="fas fa-file"></i> فایل</span>';

        const safeId = String(prod.id).replace(/'/g, "\\'");

        return `
        <tr>
            <td><img src="${prod.img || "../images/ravin.png"}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);" alt=""></td>
            <td style="font-weight: 500;">${escapeHtml(prod.name || "بدون نام")}
              <small class="product-owner">${escapeHtml(articleTitleFor(prod))}</small>
            </td>
            <td>${typeBadge}
              <span class="status pending" style="background: rgba(0, 122, 255, 0.1); color: var(--primary); font-size: 11px; font-weight: bold; border-radius: 6px; padding: 4px 8px;">${String(prod.category || "FILE").toUpperCase()}</span>
            </td>
            <td style="font-weight: bold; color: var(--success);">${formatProductPrice(prod.price)}</td>
            <td><code>${escapeHtml(prod.id)}</code></td>
            <td>
                <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 6px;" onclick="editProduct('${safeId}')">ویرایش</button>
                <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px; color: var(--danger); border-color: rgba(255,59,48,0.2); background: rgba(255,59,48,0.05); cursor: pointer; border-radius: 6px;" onclick="deleteProduct('${safeId}')">حذف</button>
            </td>
        </tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary);">محصولی برای نمایش وجود ندارد.</td></tr>';
}

/** Which article a product belongs to, for display in the table. */
function articleTitleFor(product) {
  const owner = contentIdOf(product && product.id);
  if (typeof findSiteItem === "function") {
    const item = findSiteItem(owner);
    if (item && item.title) return item.title;
  }
  return owner;
}

/**
 * Make one CSV cell safe.
 *
 * Two separate problems:
 *
 * 1. Excel treats a value starting with = + - or @ as a formula. A product
 *    named `=HYPERLINK("http://bad.site","برنده شدید")` would become a live
 *    link in the operator's spreadsheet. Prefixing with an apostrophe keeps
 *    it as text.
 * 2. A quote inside the value would end the field early, shifting every
 *    later column. Doubling it is the CSV escape.
 */

function populateProductContentDropdown() {
  const select = document.getElementById("newProdContentId");
  if (!select) return;

  if (typeof siteData === "undefined") {
    select.innerHTML = '<option value="">اطلاعات لود نشده است</option>';
    return;
  }

  let htmlOptions = "";
  Object.keys(siteData).forEach((catKey) => {
    const category = siteData[catKey];
    if (category && Array.isArray(category.items)) {
      htmlOptions += `<optgroup label="${category.title}">`;
      category.items.forEach((item) => {
        htmlOptions += `<option value="${escapeAttr(item.id)}">${escapeHtml(item.title)} (${escapeHtml(item.id)})</option>`;
      });
      htmlOptions += `</optgroup>`;
    }
  });

  select.innerHTML = htmlOptions;
}

const VIDEO_SUFFIX = "-video";

/** Product id for a given content item and format. */
function productIdFor(contentId, category) {
  const base = String(contentId || "");
  return category === "mp4" ? base + VIDEO_SUFFIX : base;
}

/** The content item a product belongs to, with any format suffix removed. */
function contentIdOf(productId) {
  const id = String(productId || "");
  return id.endsWith(VIDEO_SUFFIX) ? id.slice(0, -VIDEO_SUFFIX.length) : id;
}

/** True when this product represents the video for its article. */
function isVideoProduct(product) {
  return (
    String(product?.id || "").endsWith(VIDEO_SUFFIX) ||
    product?.category === "mp4"
  );
}

function deleteProduct(id) {
  if (confirm("آیا از حذف این محصول اطمینان دارید؟")) {
    const prod = appState.products.find(
      (p) => p && p.id && String(p.id) === String(id),
    );
    appState.products = appState.products.filter(
      (p) => p && p.id && String(p.id) !== String(id),
    );
    persistAdmin(appApi.admin.products.remove(id), "حذف محصول");

    // AUTOMATIC SYNC DELETION: Remove the file or video from Site Content overrides based on URL!
    // Overrides live under the bare content id, never the "-video" variant.
    const ownerId = contentIdOf(id);
    if (prod && typeof saveContentOverride === "function") {
      const overrides = loadContentOverrides();
      const current = overrides[ownerId] || {};
      const content = current.content || {
        blocks: [],
        downloads: [],
        video: null,
      };

      if (Array.isArray(content.downloads)) {
        // Safe URL matching instead of ID matching!
        content.downloads = content.downloads.filter(function (f) {
          return f.url !== prod.fileUrl && f.id !== "prod-file-" + ownerId;
        });
      }

      if (content.video && content.video.url === prod.fileUrl) {
        content.video = null;
      }

      saveContentOverride(ownerId, {
        content: content,
        excerpt: current.excerpt || "",
      });

      if (
        typeof applyContentOverrides === "function" &&
        typeof siteData !== "undefined"
      ) {
        applyContentOverrides(siteData);
        if (typeof renderContentTable === "function") {
          renderContentTable();
        }
      }
    }

    renderProductsTable();
    renderDashboardProducts();
    showToast("محصول با موفقیت حذف شد", "error");
  }
}

function editProduct(id) {
  const prod = appState.products.find(
    (p) => p && p.id && String(p.id) === String(id),
  );
  if (!prod) {
    showToast("محصول پیدا نشد.", "error");
    return;
  }

  document.getElementById("editProdId").value = prod.id;
  document.getElementById("editProdOwner").textContent = articleTitleFor(prod);
  document.getElementById("editProdName").value = prod.name || "";
  document.getElementById("editProdCat").value = prod.category || "pdf";
  writePriceInput(
    document.getElementById("editProdPrice"),
    Number(prod.price) || 0,
  );
  document.getElementById("editProdSize").value = prod.fileSize || "";
  document.getElementById("editProdFileUrl").value = prod.fileUrl || "";

  const imgField = document.getElementById("editProdImg");
  const imgPreview = document.getElementById("editProdImgPreview");
  if (imgField)
    imgField.value =
      prod.img && prod.img !== "../images/ravin.png" ? prod.img : "";
  if (imgPreview) imgPreview.src = prod.img || "../images/ravin.png";

  // Changing between video and file changes the product id, which would
  // orphan any existing purchases. Say so rather than letting it happen
  // silently.
  const hint = document.getElementById("editProdCatHint");
  if (hint) {
    hint.textContent = isVideoProduct(prod)
      ? "این محصول ویدیوی مطلب است. تغییر آن به فایل، شناسه محصول را عوض می‌کند."
      : "تغییر نوع به ویدیو، شناسه محصول را عوض می‌کند.";
  }

  const urlHint = document.getElementById("editProdUrlHint");
  if (urlHint) urlHint.textContent = "";

  openModal("editProductModal");
}

/* ============================================================================
   PRICE INPUTS
   ----------------------------------------------------------------------------
   Typing 250000 into a bare box is easy to misread - is that 25,000 or
   250,000? Grouping the digits as they are typed removes the guesswork.

   A number input cannot show separators (the browser rejects the comma), so
   these fields are type="text" with inputmode="numeric" to keep the numeric
   keypad on mobile.
   ========================================================================== */

/** Digits only, Persian or Latin, as a plain string. */
function priceDigitsOf(value) {
  return toEnglishDigits(
    String(value === null || value === undefined ? "" : value),
  ).replace(/[^\d]/g, "");
}

/** The numeric value of a price field. */
function readPriceInput(el) {
  const digits = priceDigitsOf(el && el.value);
  return digits ? parseInt(digits, 10) : 0;
}

/** Group into threes: 250000 -> "۲۵۰,۰۰۰" */
function formatPriceDisplay(value) {
  const digits = priceDigitsOf(value);
  if (!digits) return "";
  return toPersianDigits(parseInt(digits, 10).toLocaleString("en-US"));
}

/** Put a formatted amount into a price field. */
function writePriceInput(el, value) {
  if (el) el.value = formatPriceDisplay(value);
}

/**
 * Format a price field while the operator types.
 *
 * The caret has to be restored by hand: rewriting .value moves it to the end,
 * which makes editing the middle of a number impossible. Counting the digits
 * before the caret and re-finding that position keeps it where the operator
 * expects.
 */
function attachPriceFormatting(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-price-input]").forEach((input) => {
    if (input.dataset.priceBound) return;
    input.dataset.priceBound = "1";

    input.addEventListener("input", () => {
      const caret = input.selectionStart;
      const before = input.value;
      const digitsBeforeCaret = priceDigitsOf(before.slice(0, caret)).length;

      const formatted = formatPriceDisplay(before);
      if (formatted === before) return;
      input.value = formatted;

      // Walk forward until the same number of digits sit behind the caret.
      let seen = 0;
      let position = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/[\d\u06F0-\u06F9]/.test(formatted[i])) seen++;
        if (seen === digitsBeforeCaret) {
          position = i + 1;
          break;
        }
      }
      if (digitsBeforeCaret === 0) position = 0;
      try {
        input.setSelectionRange(position, position);
      } catch (error) {
        /* some browsers refuse this on detached inputs */
      }
    });

    // Tidy up on the way out - "۰۰۵۰" becomes "۵۰".
    input.addEventListener("blur", () => {
      input.value = formatPriceDisplay(input.value);
    });
  });
}

/* ============================================================================
   FILE SOURCE HELPERS
   ----------------------------------------------------------------------------
   An operator adding a product only has a link to paste, and usually does not
   know which link. These helpers make the common cases work without asking
   them to understand hosting:

     - recognise Aparat/YouTube URLs and set the right video provider
     - turn "view" links from Google Drive and Dropbox into direct downloads
     - warn when a file is large enough to hurt the site's bandwidth

   Why this matters: the video player already supports aparat and youtube
   (ITEM_VIDEO_PROVIDERS in item-content.js), but the product form always
   saved provider:"file". A pasted Aparat link produced an empty <video> tag.
   ========================================================================== */

/** Bandwidth guidance, in megabytes. */
const FILE_SIZE_COMFORTABLE = 10; // fine on your own server
const FILE_SIZE_WARN = 50; // move it to cloud storage

/**
 * Work out where a URL points.
 * Returns "aparat" | "youtube" | "drive" | "dropbox" | "direct" | "" .
 */
function detectUrlSource(value) {
  const url = String(value || "")
    .trim()
    .toLowerCase();
  if (!url) return "";
  if (url.includes("aparat.com")) return "aparat";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("drive.google.com")) return "drive";
  if (url.includes("dropbox.com")) return "dropbox";
  if (!/^https?:\/\//i.test(url)) return "relative";
  return "direct";
}

/**
 * Rewrite share links into ones that actually download.
 *
 * Google Drive and Dropbox hand out preview pages by default. Pasting those
 * straight in means a paying customer clicks download and lands on a Google
 * viewer instead of getting their file.
 */
function normalizeDownloadUrl(value) {
  const url = String(value || "").trim();
  if (!url) return url;

  // drive.google.com/file/d/<id>/view  ->  direct download
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) {
    return "https://drive.google.com/uc?export=download&id=" + drive[1];
  }

  // dropbox.com/...?dl=0  ->  ?dl=1
  if (url.includes("dropbox.com")) {
    if (url.includes("dl=0")) return url.replace("dl=0", "dl=1");
    if (!url.includes("dl=1"))
      return url + (url.includes("?") ? "&" : "?") + "dl=1";
  }

  return url;
}

/** The video provider implied by a URL, for content-override sync. */
function videoProviderFor(url) {
  const source = detectUrlSource(url);
  return source === "aparat" || source === "youtube" ? source : "file";
}

/** Parse "۱۲ مگابایت", "12MB", "500 kb" into megabytes. */
function parseFileSizeMb(value) {
  const text = toEnglishDigits(String(value || "")).toLowerCase();
  const num = parseFloat(text.replace(/[^\d.]/g, ""));
  if (isNaN(num)) return null;
  if (/(kb|kilo|کیلو)/.test(text)) return num / 1024;
  if (/(gb|giga|گیگ)/.test(text)) return num * 1024;
  return num; // default to MB
}

/** Persian/Arabic digits -> ASCII, so parseFloat can read them. */
function toEnglishDigits(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * Advice to show under the URL field. Returns null when nothing is wrong.
 * { tone: "info" | "warn", text }
 */
function fileSourceAdvice({ url, category, fileSize }) {
  const source = detectUrlSource(url);
  const sizeMb = parseFileSizeMb(fileSize);

  if (
    category === "mp4" &&
    (source === "direct" || source === "drive" || source === "dropbox")
  ) {
    return {
      tone: "warn",
      text: "برای ویدیو بهتر است از آپارات استفاده کنید. پخش از سرور خودتان کند است و پهنای باند زیادی مصرف می‌کند.",
    };
  }

  if (source === "aparat" || source === "youtube") {
    const label = source === "aparat" ? "آپارات" : "یوتیوب";
    return {
      tone: "info",
      text: `لینک ${label} شناسایی شد. ویدیو با پخش‌کننده ${label} نمایش داده می‌شود.`,
    };
  }

  if (source === "relative") {
    return {
      tone: "info",
      text: "فایل روی هاست خودتان است. مطمئن شوید آن را در همین مسیر آپلود کرده‌اید.",
    };
  }

  if (source === "drive") {
    return {
      tone: "info",
      text: "لینک گوگل درایو به لینک دانلود مستقیم تبدیل می‌شود.",
    };
  }

  if (source === "dropbox") {
    return {
      tone: "info",
      text: "لینک دراپ‌باکس به لینک دانلود مستقیم تبدیل می‌شود.",
    };
  }

  if (sizeMb !== null && sizeMb > FILE_SIZE_WARN) {
    return {
      tone: "warn",
      text: `حجم حدود ${toPersianDigits(Math.round(sizeMb))} مگابایت است. برای فایل‌های بزرگ‌تر از ${toPersianDigits(FILE_SIZE_WARN)} مگابایت، فضای ابری بهتر از سرور سایت است.`,
    };
  }

  if (sizeMb !== null && sizeMb > FILE_SIZE_COMFORTABLE) {
    return {
      tone: "info",
      text: `حجم حدود ${toPersianDigits(Math.round(sizeMb))} مگابایت است. تا ${toPersianDigits(FILE_SIZE_WARN)} مگابایت روی سرور خودتان مشکلی ندارد.`,
    };
  }

  return null;
}

/**
 * Check that a file actually exists at the given address.
 *
 * A mistyped filename is invisible until a paying customer clicks download,
 * so it is worth catching while the operator is still in the form. Uses a
 * HEAD request: headers only, no body, so a 500 MB file costs nothing to test.
 *
 * Returns { ok, status, reason }.
 */
async function checkFileUrl(url) {
  const target = String(url || "").trim();
  if (!target) return { ok: false, reason: "آدرسی وارد نشده است." };

  // Aparat/YouTube pages block HEAD from other origins; the player handles
  // them, so treat a recognised video link as fine.
  const source = detectUrlSource(target);
  if (source === "aparat" || source === "youtube") {
    return {
      ok: true,
      reason: "لینک ویدیو است و توسط پخش‌کننده بارگذاری می‌شود.",
    };
  }

  try {
    const response = await fetch(target, {
      method: "HEAD",
      redirect: "follow",
    });
    if (response.ok) {
      const size = response.headers.get("content-length");
      const mb = size ? (Number(size) / 1024 / 1024).toFixed(1) : null;
      return {
        ok: true,
        status: response.status,
        reason: mb
          ? `فایل پیدا شد (حدود ${toPersianDigits(mb)} مگابایت).`
          : "فایل پیدا شد.",
        sizeMb: mb ? Number(mb) : null,
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        status: 404,
        reason: "فایلی در این آدرس نیست. نام فایل را بررسی کنید.",
      };
    }
    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        reason: "دسترسی به فایل بسته است. مجوز فایل را در هاست بررسی کنید.",
      };
    }
    return {
      ok: false,
      status: response.status,
      reason: `سرور پاسخ ${toPersianDigits(response.status)} داد.`,
    };
  } catch (error) {
    // A cross-origin server that does not send CORS headers also lands here,
    // so this is "could not verify" rather than "definitely broken".
    return {
      ok: null,
      reason:
        "بررسی ممکن نشد. اگر آدرس روی دامنه دیگری است، ممکن است درست باشد ولی قابل بررسی نباشد.",
    };
  }
}

/** Paint the advice box under a URL field. */
function renderUrlNotice(noticeId, advice) {
  const box = document.getElementById(noticeId);
  if (!box) return;
  if (!advice) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.className = "url-notice url-notice--" + advice.tone;
  const icon =
    advice.tone === "warn"
      ? "fa-triangle-exclamation"
      : advice.tone === "ok"
        ? "fa-circle-check"
        : "fa-circle-info";
  box.innerHTML =
    '<i class="fas ' +
    icon +
    '"></i><span>' +
    escapeHtml(advice.text) +
    "</span>";
}

/**
 * Accept an http(s) link or a site-relative path. A typo here is invisible
 * until a paying customer clicks download, so it is worth catching early.
 */
function isPlausibleFileUrl(value) {
  const url = String(value || "").trim();
  if (!url) return true; // optional field
  if (/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("/") || url.startsWith("../") || url.startsWith("./"))
    return true;
  // "files/course.pdf" - a path relative to the page, which is what an
  // operator naturally types after uploading through cPanel.
  return /^[\w\-./]+\.[a-z0-9]{2,5}$/i.test(url);
}

/* ----------------------------------------------------------------------------
   Scroll locking
   Hiding the body scrollbar reclaims its width and everything jumps sideways.
   Measuring it once and exposing it as a CSS variable keeps the layout still.
   -------------------------------------------------------------------------- */
