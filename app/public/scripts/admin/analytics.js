/**
 * Admin panel — analytics and reporting
 *
 * Average purchase, cancellation rate, twelve-month revenue chart and the
 * three bestsellers.
 *
 * Every figure is computed from real orders. orderMonthIndex() converts the
 * date first: rows are stored as '۱۴۰۵/۰۵/۰۱' and parseInt on Persian
 * digits returns NaN, which silently emptied the chart.
 *
 * The cards link through to the underlying data - clicking the cancellation
 * rate jumps to the orders tab and flashes the cancelled tile for four
 * seconds.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/**
 * Read the month out of an order date and return it as 0..11.
 *
 * api.js writes dates through Intl with the fa-IR calendar, which produces
 * Persian digits: "۱۴۰۵/۰۵/۰۱". A plain parseInt("۰۵") is NaN, so every real
 * order used to fall out of the chart and every bar rendered as zero. The
 * digits are normalised to ASCII first.
 *
 * Returns null when the date is missing or unparseable, so callers can skip
 * the row instead of silently counting it as فروردین.
 */
function orderMonthIndex(order) {
  const raw = toEnglishDigits(String((order && order.date) || "")).trim();
  if (!raw) return null;

  // Jalali dates arrive as year/month/day.
  const parts = raw.split(/[\/\-.]/);
  if (parts.length < 2) return null;

  const month = parseInt(parts[1], 10);
  if (isNaN(month) || month < 1 || month > 12) return null;
  return month - 1;
}

/**
 * Total revenue per Jalali month, from paid orders only.
 * Returns a 12-slot array where index 0 is فروردین.
 */
function revenueByMonth(orders) {
  const totals = new Array(12).fill(0);
  (orders || [])
    .filter((o) => o && o.status === "success")
    .forEach((order) => {
      const idx = orderMonthIndex(order);
      if (idx === null) return;
      totals[idx] += orderAmountValue(order.amount);
    });
  return totals;
}

/**
 * Rank products by how many copies actually sold.
 *
 * Counts the line items inside each paid order rather than the order's
 * `product` summary string. A basket holding two courses stores
 * "دوره اکسل، جزوه مالیات" in `product`; grouping on that text invented a
 * single fake product and hid the two real ones. `items[]` carries the real
 * per-product rows, so each course gets credited properly.
 *
 * Older orders predate `items[]` and only have the summary string; those fall
 * back to the whole string as one product so historical rows still show up.
 *
 * Sorted by units sold, with revenue breaking ties.
 */
function bestsellingProducts(orders) {
  const tally = new Map();

  const add = (name, units, revenue) => {
    const key = String(name || "").trim();
    if (!key) return;
    const row = tally.get(key) || { name: key, count: 0, revenue: 0 };
    row.count += units;
    row.revenue += revenue;
    tally.set(key, row);
  };

  (orders || [])
    .filter((o) => o && o.status === "success")
    .forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];

      if (items.length) {
        items.forEach((item) => {
          const units = Number(item.qty) > 0 ? Number(item.qty) : 1;
          add(item.name, units, (Number(item.price) || 0) * units);
        });
        return;
      }

      // Legacy row: no line items, so the summary string is all we have.
      add(order.product, 1, orderAmountValue(order.amount));
    });

  return [...tally.values()].sort(
    (a, b) => b.count - a.count || b.revenue - a.revenue,
  );
}

/** How many products are listed in the products tab. */
function totalProductCount() {
  return (appState.products || []).filter((p) => p && p.id).length;
}

/** Orders the customer abandoned. Mirrors the "لغو شده" tile in the orders tab. */
function cancelledOrders(orders) {
  return (orders || []).filter((o) => o && o.status === "cancelled");
}

/** Build the bar markup shared by the inline chart and the expanded modal. */
function renderRevenueBars(container, totals, options) {
  const opts = options || {};
  const barWidth = opts.barWidth || "35px";
  const valueSize = opts.valueSize || "11px";
  const labelSize = opts.labelSize || "12px";

  const peak = Math.max(...totals, 0) || 1;

  container.innerHTML = JALALI_MONTHS.map((name, idx) => {
    const revenue = totals[idx];
    // An empty month keeps a sliver of height so the axis stays readable.
    const height =
      revenue > 0 ? Math.max(Math.round((revenue / peak) * 100), 4) : 2;
    const label =
      revenue > 0
        ? toPersianDigits(Math.round(revenue / 1000).toLocaleString()) + "K"
        : "۰";
    const tone = revenue > 0 ? "var(--success)" : "var(--text-secondary)";
    const fill =
      revenue > 0
        ? "linear-gradient(180deg, var(--primary) 0%, rgba(0,122,255,0.4) 100%)"
        : "rgba(148,163,184,0.25)";

    return `
      <div class="chart-bar-item" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;flex:1;min-width:0;"
           title="فروش ${name}: ${toPersianDigits(revenue.toLocaleString())} تومان">
        <span style="font-size:${valueSize};font-weight:bold;color:${tone};margin-bottom:5px;white-space:nowrap;">${label}</span>
        <div class="chart-bar" style="height:${height}%;width:${barWidth};max-width:100%;background:${fill};border-radius:6px 6px 0 0;transition:height .6s cubic-bezier(.16,1,.3,1);"></div>
        <span style="font-size:${labelSize};color:var(--text-primary);margin-top:8px;white-space:nowrap;">${name}</span>
      </div>
    `;
  }).join("");
}

/** Build the ranked bestseller rows shared by the card and the modal. */
function renderBestsellerRows(container, rows, options) {
  const opts = options || {};
  const barHeight = opts.barHeight || "8px";
  const nameWidth = opts.nameWidth || "250px";

  if (!rows.length) {
    container.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:2rem;">هنوز تراکنش موفقی ثبت نشده است.</p>';
    return;
  }

  const peak = rows[0].count || 1;
  const medals = ["🥇", "🥈", "🥉"];

  container.innerHTML = rows
    .map((row, idx) => {
      const percent = Math.max(Math.round((row.count / peak) * 100), 3);
      const badge = medals[idx] ? medals[idx] + " " : "";
      return `
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:500;">
          <span style="color:var(--text-primary);font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:${nameWidth};">${badge}${escapeHtml(row.name)}</span>
          <span style="color:var(--success);font-weight:bold;white-space:nowrap;">${toPersianDigits(row.count)} فروش (${toPersianDigits(row.revenue.toLocaleString())} تومان)</span>
        </div>
        <div style="height:${barHeight};width:100%;background:rgba(0,0,0,0.05);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${percent}%;background:linear-gradient(90deg, var(--primary) 0%, #34c759 100%);border-radius:4px;transition:width .6s cubic-bezier(.16,1,.3,1);"></div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderAnalyticsView() {
  const chartContainer = document.getElementById("dynamicChartBars");
  const productsContainer = document.getElementById(
    "bestsellingProductsContainer",
  );
  const avgEl = document.getElementById("set-analytics-avg");
  const cancelEl = document.getElementById("set-analytics-cancel");
  const prodCountEl = document.getElementById("set-analytics-products");

  if (!chartContainer || !productsContainer) return;

  const orders = appState.orders || [];
  const paid = orders.filter((o) => o && o.status === "success");
  const cancelled = cancelledOrders(orders);

  // --- KPI 1: average value of a completed purchase -----------------------
  // Reads the same paid orders the "درآمد" tile in the orders tab sums, so
  // the two tabs can never disagree.
  const revenue = calculateRevenue(paid);
  const average = paid.length ? Math.round(revenue / paid.length) : 0;
  if (avgEl)
    avgEl.textContent = toPersianDigits(average.toLocaleString()) + " تومان";

  // --- KPI 2: share of orders the customer abandoned ----------------------
  // Only "cancelled" counts, matching the "لغو شده" tile in the orders tab.
  // A declined payment is a failure, not a cancellation, and used to be
  // folded in here - which made this number disagree with that tile.
  const cancelRate = orders.length
    ? Math.round((cancelled.length / orders.length) * 100)
    : 0;
  if (cancelEl) cancelEl.textContent = toPersianDigits(cancelRate) + "٪";

  // --- KPI 3: how many products are on sale -------------------------------
  if (prodCountEl) {
    prodCountEl.textContent = toPersianDigits(totalProductCount()) + " عدد";
  }

  // --- Monthly revenue, all twelve Jalali months --------------------------
  renderRevenueBars(chartContainer, revenueByMonth(paid), {
    barWidth: "26px",
    valueSize: "10px",
    labelSize: "11px",
  });

  // --- Top three sellers --------------------------------------------------
  renderBestsellerRows(
    productsContainer,
    bestsellingProducts(paid).slice(0, 3),
  );
}

// --- EXPANDED ANALYTICS AND PORTAL JUMPERS ---

/**
 * Scroll an element into view without letting a missing implementation break
 * the rest of the handler. Older browsers ignore the options object, and a
 * headless test environment may not implement the method at all.
 */

function focusRevenueChart() {
  // Addressed by id: the old selector grabbed "first .glass-card in the grid",
  // which silently points at the wrong card if the layout is ever reordered.
  const chartCard = document.getElementById("revenueChartCard");
  if (!chartCard) return;

  scrollElementIntoView(chartCard, { behavior: "smooth", block: "center" });
  chartCard.classList.add("analytics-flash");
  setTimeout(() => chartCard.classList.remove("analytics-flash"), 2000);
}

/**
 * Send the operator to the orders tab, filter down to the cancelled ones and
 * pulse the "لغو شده" tile for a few seconds so it is obvious where the
 * number on the analytics card came from.
 */
function jumpToCancelledOrders() {
  switchView("orders");

  const filter = document.getElementById("orderStatusFilter");
  if (filter) {
    filter.value = "cancelled";
    // Set programmatically, so fire the event the table listens for rather
    // than calling the renderer directly - keeps one code path.
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    renderOrdersTable();
  }

  highlightCancelledTile();
}

/** Pulse the cancelled-orders tile so the operator sees the source figure. */
function highlightCancelledTile() {
  const tile = document.querySelector(".order-stat--warn");
  if (!tile) return;

  // Restart cleanly if the operator clicks through twice in a row.
  tile.classList.remove("order-stat--flash");
  void tile.offsetWidth;
  tile.classList.add("order-stat--flash");

  scrollElementIntoView(tile, { behavior: "smooth", block: "nearest" });
  clearTimeout(highlightCancelledTile._timer);
  highlightCancelledTile._timer = setTimeout(
    () => tile.classList.remove("order-stat--flash"),
    4000,
  );
}

/** The products card jumps straight to the products tab. */
function jumpToProducts() {
  switchView("products");
}

function openExpandedChartModal() {
  const chartBars = document.getElementById("expandedChartBars");
  if (!chartBars) return;

  renderRevenueBars(chartBars, revenueByMonth(appState.orders), {
    barWidth: "22px",
    valueSize: "10px",
    labelSize: "11px",
  });

  openModal("expandedChartModal");
}

function downloadDetailedRevenueReport() {
  const totals = revenueByMonth(appState.orders);

  let csv = "\uFEFF";
  csv += csvRow(["گزارش مالی سالانه حسابیار - تفکیک ۱۲ ماه"]);
  csv += csvRow([]);
  csv += csvRow(["نام ماه", "مبلغ کل فروش (تومان)"]);

  JALALI_MONTHS.forEach((name, idx) => {
    csv += csvRow([name, toPersianDigits(totals[idx].toLocaleString())]);
  });

  const sum = totals.reduce((total, value) => total + value, 0);
  csv += csvRow(["مجموع سال", toPersianDigits(sum.toLocaleString())]);

  triggerCsvDownload(csv, "revenue-report");
}

function openExpandedBestsellersModal() {
  const container = document.getElementById("expandedBestsellersList");
  if (!container) return;

  renderBestsellerRows(
    container,
    bestsellingProducts(appState.orders).slice(0, 12),
    { barHeight: "10px", nameWidth: "320px" },
  );

  openModal("expandedBestsellersModal");
}

function downloadDetailedBestsellersReport() {
  const rows = bestsellingProducts(appState.orders);

  let csv = "\uFEFF";
  csv += csvRow(["گزارش تفکیکی پرفروش ترین دوره ها و فایل ها"]);
  csv += csvRow([]);
  csv += csvRow([
    "رتبه",
    "نام محصول",
    "تعداد فروش کل",
    "مجموع درآمد تولید شده (تومان)",
  ]);

  rows.forEach((row, idx) => {
    csv += csvRow([
      toPersianDigits(idx + 1),
      row.name,
      toPersianDigits(row.count),
      toPersianDigits(row.revenue.toLocaleString()),
    ]);
  });

  triggerCsvDownload(csv, "bestsellers-report");
}
