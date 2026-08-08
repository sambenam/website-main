/**
 * Smart Receipt JavaScript
 * Reads URL query params (?status=success or ?status=failed) and updates UI dynamically.
 */

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  // No status in the URL means the page was opened directly, not reached by
  // paying. It used to default to "success", so anyone visiting
  // receipt.html saw a confirmed transaction for ۳۳,۰۰۰,۰۰۰ that never
  // happened - and the cart was cleared and the product unlocked with it.
  const status = urlParams.get("status") || "unknown";

  const card = document.getElementById("receiptCard");
  const iconElem = document.getElementById("iconElement");
  const titleElem = document.getElementById("receiptTitle");
  const subtitleElem = document.getElementById("receiptSubtitle");
  const statusBadge = document.getElementById("statusBadge");
  const actionsContainer = document.getElementById("receiptActions");
  const orderIdElem = document.getElementById("orderId");
  const trxIdElem = document.getElementById("trxId");
  const amountElem = document.querySelector(".price-text");
  const orderId = urlParams.get("orderId");

  if (orderIdElem && orderId) {
    orderIdElem.textContent = orderId;
  }
  if (trxIdElem && orderId) {
    // The "#" in an order number is not part of a tracking code, and it made
    // every code read as "TRX-#10001".
    trxIdElem.textContent =
      "TRX-" +
      orderId
        .replace(/[^0-9A-Za-z]/g, "")
        .slice(-8)
        .toUpperCase();
  }

  fillReceiptDetails(orderId);

  if (status === "unknown") {
    // Nothing to show: send the visitor somewhere useful instead of
    // congratulating them on a purchase they did not make.
    card.classList.add("failed");
    iconElem.className = "fas fa-circle-question";
    titleElem.textContent = "رسیدی برای نمایش وجود ندارد";
    subtitleElem.textContent =
      "این صفحه پس از پرداخت نمایش داده می‌شود. برای خرید به سبد خرید خود مراجعه کنید.";
    statusBadge.textContent = "نامشخص";
    actionsContainer.innerHTML =
      '<a href="/user-profile" class="btn-action-secondary">' +
      '<i class="fas fa-user"></i> سفارش‌های من</a>' +
      '<a href="/" class="btn-action-primary">' +
      '<i class="fas fa-house"></i> بازگشت به صفحه اصلی</a>';
    return;
  }

  if (status === "success") {
    card.classList.add("success");
    iconElem.className = "fas fa-check";
    titleElem.textContent = "تراکنش با موفقیت انجام شد";
    subtitleElem.textContent = "پرداخت شما با موفقیت ثبت و تایید گردید";
    statusBadge.textContent = "موفق (تایید شده)";

    // REGISTER THE PURCHASE & ORDER INTERACTIVELY!
    let cart = [];
    try {
      cart = JSON.parse(localStorage.getItem("hesabyarCart") || "[]");
    } catch (e) {}

    let downloadButtonHtml = "";
    if (Array.isArray(cart) && cart.length > 0) {
      const product = cart[0];

      // 1. Unlock the product!
      try {
        const purchasedRaw = localStorage.getItem(
          "irHesabdarPurchasedProducts",
        );
        let purchased = purchasedRaw ? JSON.parse(purchasedRaw) : [];
        if (!Array.isArray(purchased)) purchased = [];
        if (purchased.indexOf(product.id) === -1) {
          purchased.push(product.id);
        }
        localStorage.setItem(
          "irHesabdarPurchasedProducts",
          JSON.stringify(purchased),
        );
      } catch (e) {
        console.error("error unlocking product:", e);
      }

      // 2. Fetch fileUrl of this product to render the download button
      let fileUrl = "#";
      try {
        const prodsRaw = localStorage.getItem("irHesabdarProducts");
        const prods = prodsRaw ? JSON.parse(prodsRaw) : [];
        if (Array.isArray(prods)) {
          const match = prods.find(function (p) {
            return String(p.id) === String(product.id);
          });
          if (match && match.fileUrl) {
            fileUrl = match.fileUrl;
          }
        }
      } catch (e) {}

      if (fileUrl && fileUrl !== "#") {
        downloadButtonHtml = `
          <a href="${fileUrl}" download class="btn-action-primary" style="background: #34c759; margin-top: 10px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <i class="fas fa-file-arrow-down"></i> دانلود فایل اصلی محصول
          </a>
        `;
      }

      // The order was already recorded by appApi.commerce.createPayment(),
      // including failed attempts. Writing it again here would create a
      // duplicate row in the admin panel.

      // 4. Clear the cart
      localStorage.removeItem("hesabyarCart");
    }

    actionsContainer.innerHTML = `
            ${downloadButtonHtml}
            <button type="button" class="btn-action-secondary" onclick="window.print()"><i class="fas fa-print"></i> چاپ فاکتور</button>
            <a href="/" class="btn-action-primary"><i class="fas fa-house"></i> بازگشت به صفحه اصلی</a>
        `;
  } else {
    const cancelled = status === "cancelled";

    card.classList.add("failed");
    iconElem.className = "fas fa-times";
    titleElem.textContent = cancelled ? "پرداخت لغو شد" : "تراکنش ناموفق بود";
    subtitleElem.textContent = cancelled
      ? "شما از ادامه پرداخت منصرف شدید. سبد خرید شما دست‌نخورده باقی مانده است."
      : "عملیات پرداخت با خطا مواجه گردید";
    statusBadge.textContent = cancelled ? "لغو شده" : "ناموفق (خطا)";

    // A customer who backs out at the gateway never reaches the payment call,
    // so nothing would be recorded. Log it here so the shop owner can see
    // where people are dropping off.
    if (cancelled && !urlParams.get("orderId")) {
      recordAbandonedOrder();
    }

    actionsContainer.innerHTML = `
            <a href="gateway.html" class="btn-action-secondary" style="background:#fee2e2; color:#991b1b;"><i class="fas fa-redo"></i> تلاش مجدد</a>
            <a href="/user-profile" class="btn-action-primary" style="background:#ef4444;"><i class="fas fa-arrow-right"></i> بازگشت به پروفایل</a>
        `;
  }
});

/**
 * Put the real order on the receipt.
 *
 * The amount used to come from sessionStorage, which is the amount the
 * customer was *asked* for - not what the gateway actually recorded. It also
 * showed no buyer and no product, so the page was not usable as proof of
 * purchase. The recorded order is the source of truth; sessionStorage is
 * only a fallback for a guest whose order cannot be looked up.
 */
async function fillReceiptDetails(orderId) {
  const amountEl = document.getElementById("receiptAmount");
  const dateEl = document.getElementById("receiptDate");
  const buyerEl = document.getElementById("receiptBuyer");
  const productEl = document.getElementById("receiptProduct");

  let order = null;
  if (orderId && typeof appApi !== "undefined" && appApi.commerce) {
    try {
      const mine = await appApi.commerce.myOrders();
      if (Array.isArray(mine)) {
        order = mine.find((o) => String(o.id) === String(orderId)) || null;
      }
    } catch (error) {
      order = null;
    }
  }

  let checkout = {};
  try {
    checkout = JSON.parse(sessionStorage.getItem("hesabyarCheckout") || "{}");
  } catch (error) {
    checkout = {};
  }

  const amount = order ? order.amount : checkout.finalAmount;
  if (amountEl && (amount || amount === 0)) {
    amountEl.textContent = Number(amount).toLocaleString("fa-IR") + " تومان";
  }

  if (dateEl) {
    // Was a fixed "۲۸ تیر ۱۴۰۴ - ۱۶:۴۵" printed on every receipt.
    const when = new Date();
    let stamp;
    try {
      stamp = new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(when);
    } catch (error) {
      stamp = when.toLocaleString("fa-IR");
    }
    dateEl.textContent =
      order && order.date ? order.date + " - " + stamp.split(" ").pop() : stamp;
  }

  const buyerName =
    (order && order.customer) ||
    (checkout.buyer && checkout.buyer.name) ||
    localStorage.getItem("irHesabdarBuyerName") ||
    "";
  if (buyerEl && buyerName) {
    buyerEl.textContent = buyerName;
    document.getElementById("receiptBuyerRow").hidden = false;
  }

  const productName =
    (order && order.product) ||
    (Array.isArray(checkout.items)
      ? checkout.items
          .map((i) => i.name)
          .filter(Boolean)
          .join("، ")
      : "");
  if (productEl && productName) {
    productEl.textContent = productName;
    document.getElementById("receiptProductRow").hidden = false;
  }
}

/**
 * Record a checkout the customer walked away from.
 *
 * The payment endpoint is never called in this case, so without this the
 * attempt would leave no trace. Recorded as "cancelled" to keep it distinct
 * from a payment the gateway actually declined.
 */
async function recordAbandonedOrder() {
  try {
    const checkout = JSON.parse(
      sessionStorage.getItem("hesabyarCheckout") || "{}",
    );
    if (!checkout.finalAmount) return;

    await appApi.commerce.recordCancelled({
      amount: checkout.finalAmount,
      buyer: checkout.buyer || {},
      items: checkout.items || [],
    });
  } catch (error) {
    console.warn("receipt: could not record the cancelled order", error);
  }
}
