/**
 * Admin panel — orders tab and CSV export
 *
 * The orders table, the summary tiles above it, the per-order detail sheet
 * and the four CSV downloads.
 *
 * Amounts are read through orderAmountValue() rather than parsed inline,
 * because older rows stored a formatted string like '۴۹,۰۰۰ تومان' while
 * new ones store a number.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function csvCell(value) {
  let text = String(value === null || value === undefined ? "" : value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Build a CSV row from a list of values. */
function csvRow(values) {
  return values.map(csvCell).join(",") + "\n";
}

/**
 * Hand the file to the browser.
 *
 * The filename stays ASCII - a name built from Persian digits confuses
 * Windows and some cloud drives.
 */
function triggerCsvDownload(content, baseName) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${baseName}-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the object URL, otherwise the blob stays in memory for the life
  // of the page.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadOrdersReport() {
  if (!appState.orders || !appState.orders.length) {
    showToast("هیچ سفارشی برای گزارش‌گیری وجود ندارد.", "error");
    return;
  }

  // UTF-8 BOM to support Persian characters in Excel!
  let csvContent = "\uFEFF";
  csvContent += csvRow([
    "شماره سفارش",
    "نام خریدار",
    "موبایل خریدار",
    "ایمیل خریدار",
    "محصول",
    "مبلغ",
    "تاریخ ثبت",
    "وضعیت",
    "توضیح",
  ]);

  appState.orders.forEach((o) => {
    // No invented placeholders - an empty field should read as empty in the
    // report, not as somebody's fake phone number.
    const phone = o.buyerPhone || "—";
    const email = o.buyerEmail || "—";
    const statusText = getStatusText(o.status);

    // Convert to Farsi digits for report
    const fId = toPersianDigits(o.id);
    const fPhone = toPersianDigits(phone);
    const fAmount = formatOrderAmount(o.amount);
    const fDate = toPersianDigits(o.date || "—");

    csvContent += csvRow([
      fId,
      o.customer,
      fPhone,
      email,
      o.product,
      fAmount,
      fDate,
      statusText,
      o.failureReason || "",
    ]);
  });

  triggerCsvDownload(csvContent, "orders-report");
  showToast("گزارش اکسل سفارشات با موفقیت دانلود شد.", "success");
}

function downloadSingleOrderInvoice(orderId) {
  const order = appState.orders.find((o) => String(o.id) === String(orderId));
  if (!order) {
    showToast("سفارش پیدا نشد.", "error");
    return;
  }

  // UTF-8 BOM
  let csvContent = "\uFEFF";
  csvContent += "فاکتور خرید محصول پلتفرم حسابیار\n\n";
  csvContent +=
    "شناسه سفارش,نام خریدار,موبایل خریدار,ایمیل خریدار,نام محصول,مبلغ پرداختی,تاریخ ثبت,وضعیت پرداخت\n";

  const phone = order.buyerPhone || "۰۹۱۲۳۴۵۶۷۸۹";
  const email = order.buyerEmail || "sam@example.com";
  const statusText = order.status === "success" ? "موفق (تکمیل شده)" : "ناموفق";

  // Convert to Farsi digits for invoice
  const fId = toPersianDigits(order.id);
  const fPhone = toPersianDigits(phone);
  const fAmount = toPersianDigits(order.amount);
  const fDate = toPersianDigits(order.date);

  csvContent += `"${fId}","${order.customer}","${fPhone}","${email}","${order.product}","${fAmount}","${fDate}","${statusText}"\n`;

  triggerCsvDownload(
    csvContent,
    "invoice-" + String(order.id).replace(/[^0-9]/g, ""),
  );
}

function openOrderDetailModal(orderId) {
  const order = appState.orders.find((o) => String(o.id) === String(orderId));
  if (!order) {
    showToast("سفارش پیدا نشد.", "error");
    return;
  }

  // Populate modal fields with gorgeous Persian digits
  document.getElementById("detailOrderNum").textContent =
    "شماره سفارش: " + toPersianDigits(order.id);
  document.getElementById("detailOrderCustomer").textContent =
    order.customer || "نامشخص";
  document.getElementById("detailOrderPhone").textContent = toPersianDigits(
    order.buyerPhone || "۰۹۱۲۳۴۵۶۷۸۹",
  );
  document.getElementById("detailOrderEmail").textContent =
    order.buyerEmail || "sam@example.com";
  document.getElementById("detailOrderProduct").textContent =
    order.product || "محصول آموزشی";
  document.getElementById("detailOrderAmount").textContent = toPersianDigits(
    order.amount || "۰ تومان",
  );
  document.getElementById("detailOrderDate").textContent = toPersianDigits(
    order.date || "---",
  );

  // Try to find the download link for this product
  let fileUrl = "";
  try {
    const prodsRaw = localStorage.getItem("irHesabdarProducts");
    const prods = prodsRaw ? JSON.parse(prodsRaw) : [];
    if (Array.isArray(prods)) {
      const match = prods.find(
        (p) => String(p.id) === String(order.productId || order.product),
      );
      if (match && match.fileUrl) {
        fileUrl = match.fileUrl;
      }
    }
  } catch (e) {}

  const downloadContainer = document.getElementById(
    "detailOrderDownloadContainer",
  );
  if (downloadContainer) {
    let htmlButtons = `
      <button type="button" class="btn-primary" onclick="downloadSingleOrderInvoice('${order.id}')" style="background: #10b981; border-color: #10b981; padding: 10px 20px; border-radius: 8px; font-weight: bold; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; border: none;">
        <i class="fas fa-file-excel"></i> دانلود فاکتور اکسل (CSV)
      </button>
    `;

    if (fileUrl && fileUrl !== "#") {
      htmlButtons += `
        <a href="${fileUrl}" download class="btn-primary" style="background: #007aff; border-color: #007aff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; margin-right: 10px;">
          <i class="fas fa-file-arrow-down"></i> دانلود فایل اصلی محصول
        </a>
      `;
    }

    downloadContainer.innerHTML = htmlButtons;
  }

  openModal("orderDetailModal");
}

function renderOrdersTable() {
  const tbody = document.querySelector("#ordersFullTable tbody");
  if (!tbody) return;

  const filter = document.getElementById("orderStatusFilter")?.value || "all";
  const rows = appState.orders.filter(
    (order) => filter === "all" || order.status === filter,
  );

  tbody.innerHTML =
    rows
      .map((order) => {
        const safeId = String(order.id).replace(/'/g, "\\'");
        // Only a completed payment is money in the bank; showing a failed
        // attempt in green would misread at a glance.
        const amountColour =
          order.status === "success"
            ? "var(--success)"
            : "var(--text-secondary)";

        return `
        <tr>
            <td>${toPersianDigits(order.id)}</td>
            <td>${escapeHtml(order.customer || "—")}</td>
            <td>${escapeHtml(order.product || "—")}</td>
            <td style="font-weight: bold; color: ${amountColour};">${formatOrderAmount(order.amount)}</td>
            <td>${toPersianDigits(order.date || "—")}</td>
            <td><span class="status ${order.status}">${getStatusText(order.status)}</span>
              ${order.failureReason ? `<small class="order-reason">${escapeHtml(order.failureReason)}</small>` : ""}
            </td>
            <td>
                <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; cursor: pointer;" onclick="openOrderDetailModal('${safeId}')">بررسی جزئیات</button>
            </td>
        </tr>`;
      })
      .join("") ||
    '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">سفارشی با این وضعیت ثبت نشده است.</td></tr>';

  renderOrderSummary();
}

/** A small tally above the table: how many succeeded, failed, or were dropped. */
function renderOrderSummary() {
  const host = document.getElementById("ordersSummary");
  if (!host) return;

  const all = appState.orders || [];
  const count = (s) => all.filter((o) => o.status === s).length;
  const revenue = calculateRevenue(all);

  host.innerHTML = [
    ["کل سفارش‌ها", toPersianDigits(all.length), ""],
    ["پرداخت موفق", toPersianDigits(count("success")), "ok"],
    ["ناموفق", toPersianDigits(count("failed")), "bad"],
    ["لغو شده", toPersianDigits(count("cancelled")), "warn"],
    ["درآمد", toPersianDigits(revenue.toLocaleString()) + " تومان", "ok"],
  ]
    .map(
      ([label, value, tone]) =>
        `<div class="order-stat order-stat--${tone || "plain"}">
           <small>${label}</small><strong>${value}</strong>
         </div>`,
    )
    .join("");
}

// Track recently replied message ID to flash it

function getStatusText(status) {
  if (status === "success") return "پرداخت موفق";
  if (status === "pending") return "در حال پردازش";
  if (status === "failed") return "پرداخت ناموفق";
  if (status === "cancelled") return "لغو شده";
  return status;
}

/**
 * Money for display.
 *
 * Orders store the amount as a number so reports can add it up; older rows
 * kept a pre-formatted string like "۴۹,۰۰۰ تومان", so both are handled.
 */
function formatOrderAmount(amount) {
  if (typeof amount === "number") {
    return toPersianDigits(amount.toLocaleString()) + " تومان";
  }
  const text = String(amount || "").trim();
  if (!text) return "—";
  return /تومان/.test(text)
    ? toPersianDigits(text)
    : toPersianDigits(text) + " تومان";
}
