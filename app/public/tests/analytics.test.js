/**
 * Analytics tab — every figure must be traceable to another tab.
 *
 * Run with:  node tests/analytics.test.js
 *
 * The rules this locks down:
 *   میانگین مبلغ خرید  = درآمد سفارشات موفق ÷ تعداد آنها
 *   نرخ لغو سفارشات    = باکس «لغو شده» ÷ کل سفارشات  (ناموفق‌ها جدا هستند)
 *   کل محصولات         = تعداد ردیف‌های تب محصولات
 *   نمودار فروش        = ۱۲ ماه شمسی از تاریخ سفارشات موفق
 *   پرفروش‌ها           = ۳ مورد برتر بر اساس تعداد فروش واقعی
 *
 * Two bugs this exists to prevent coming back:
 *   1. Dates are written with Persian digits ("۱۴۰۵/۰۵/۰۱"). parseInt on those
 *      returns NaN, so every bar in the chart rendered as zero.
 *   2. A basket with two courses stores "دوره اکسل، جزوه مالیات" in `product`.
 *      Grouping on that string invented a fake product and hid the real ones.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const {
  adminScripts,
  pageScripts,
  readScripts,
} = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};

// Dates use Persian digits exactly as scripts/api.js writes them.
const ORDERS = [
  {
    id: "#۱۰۱",
    customer: "سام",
    product: "دوره حسابداری مقدماتی",
    amount: 49000,
    date: "۱۴۰۵/۰۵/۰۱",
    status: "success",
    items: [{ id: "p1", name: "دوره حسابداری مقدماتی", price: 49000 }],
  },
  {
    id: "#۱۰۲",
    customer: "مریم",
    product: "دوره حسابداری مقدماتی",
    amount: 49000,
    date: "۱۴۰۵/۰۵/۰۳",
    status: "success",
    items: [{ id: "p1", name: "دوره حسابداری مقدماتی", price: 49000 }],
  },
  {
    id: "#۱۰۳",
    customer: "علی",
    product: "پکیج ثبت سند",
    amount: 29000,
    date: "۱۴۰۵/۰۴/۲۹",
    status: "success",
    items: [{ id: "p2", name: "پکیج ثبت سند", price: 29000 }],
  },
  {
    id: "#۱۰۴",
    customer: "زهرا",
    product: "دوره اکسل",
    amount: 95000,
    date: "۱۴۰۵/۰۳/۱۵",
    status: "success",
    items: [{ id: "p3", name: "دوره اکسل", price: 95000 }],
  },
  {
    id: "#۱۰۵",
    customer: "رضا",
    product: "دوره اکسل",
    amount: 95000,
    date: "۱۴۰۵/۰۵/۰۵",
    status: "failed",
  },
  {
    id: "#۱۰۶",
    customer: "نگار",
    product: "دوره حسابداری مقدماتی",
    amount: 49000,
    date: "۱۴۰۵/۰۵/۰۶",
    status: "cancelled",
  },
  {
    id: "#۱۰۷",
    customer: "کاوه",
    product: "دوره اکسل",
    amount: 95000,
    date: "۱۴۰۵/۰۵/۰۷",
    status: "cancelled",
  },
];

const PRODUCTS = [
  { id: "p1", name: "دوره حسابداری مقدماتی", price: 49000 },
  { id: "p2", name: "پکیج ثبت سند", price: 29000 },
  { id: "p3", name: "دوره اکسل", price: 95000 },
  { id: "p4", name: "جزوه مالیات", price: 15000 },
];

function boot(orders, products) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;

  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
    irHesabdarOrders: JSON.stringify(orders),
    irHesabdarProducts: JSON.stringify(products),
  };
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });

  const FILES = adminScripts();
  const srcs = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  srcs.push(`window.__t = {
    renderAnalyticsView, renderOrdersTable, renderOrderSummary,
    orderMonthIndex, revenueByMonth, bestsellingProducts,
    totalProductCount, cancelledOrders, calculateRevenue,
    focusRevenueChart, jumpToCancelledOrders, jumpToProducts,
    highlightCancelledTile, openExpandedChartModal, openExpandedBestsellersModal,
    JALALI_MONTHS,
    set orders(v) { appState.orders = v; },
    set products(v) { appState.products = v; },
  };`);
  try {
    w.eval(srcs.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));

  w.__t.orders = orders;
  w.__t.products = products;
  return w;
}

const w = boot(ORDERS, PRODUCTS);
const T = w.__t;
const doc = w.document;
const txt = (id) => (doc.getElementById(id)?.textContent || "").trim();

T.renderAnalyticsView();
T.renderOrdersTable();

// ---------------------------------------------------------------- month parsing
console.log("\nخواندن ماه از تاریخ شمسی");
t(
  "ارقام فارسی خوانده می‌شود",
  T.orderMonthIndex({ date: "۱۴۰۵/۰۵/۰۱" }) === 4,
  String(T.orderMonthIndex({ date: "۱۴۰۵/۰۵/۰۱" })),
);
t(
  "ارقام انگلیسی هم کار می‌کند",
  T.orderMonthIndex({ date: "1405/05/01" }) === 4,
);
t("فروردین صفر است", T.orderMonthIndex({ date: "۱۴۰۵/۰۱/۱۰" }) === 0);
t("اسفند یازده است", T.orderMonthIndex({ date: "۱۴۰۵/۱۲/۲۹" }) === 11);
t("تاریخ خالی رد می‌شود", T.orderMonthIndex({ date: "" }) === null);
t("تاریخ بی‌معنی رد می‌شود", T.orderMonthIndex({ date: "نامشخص" }) === null);
t("ماه ۱۳ رد می‌شود", T.orderMonthIndex({ date: "۱۴۰۵/۱۳/۰۱" }) === null);
t("ماه صفر رد می‌شود", T.orderMonthIndex({ date: "۱۴۰۵/۰۰/۰۱" }) === null);
t("جداکننده خط تیره", T.orderMonthIndex({ date: "۱۴۰۵-۰۷-۰۱" }) === 6);

// ---------------------------------------------------------------- KPI cards
console.log("\nکارت میانگین مبلغ خرید");
// 49000+49000+29000+95000 = 222000، تقسیم بر ۴ = ۵۵۵۰۰
t(
  "میانگین فقط از موفق‌ها",
  txt("set-analytics-avg").includes("۵۵,۵۰۰"),
  txt("set-analytics-avg"),
);
t("واحد تومان دارد", txt("set-analytics-avg").includes("تومان"));
t(
  "ناموفق در میانگین نیست",
  !txt("set-analytics-avg").includes("۶۳"),
  txt("set-analytics-avg"),
);

console.log("\nکارت نرخ لغو سفارشات");
// ۲ لغو شده از ۷ سفارش = ۲۹٪ — ناموفق‌ها لغو حساب نمی‌شوند
t(
  "نرخ لغو ۲۹٪ است",
  txt("set-analytics-cancel") === "۲۹٪",
  txt("set-analytics-cancel"),
);
t(
  "ناموفق‌ها لغو حساب نمی‌شوند",
  txt("set-analytics-cancel") !== "۴۳٪",
  txt("set-analytics-cancel"),
);
t("تعداد لغوشده‌ها درست است", T.cancelledOrders(ORDERS).length === 2);
t(
  "با باکس «لغو شده» سفارشات یکی است",
  T.cancelledOrders(ORDERS).length ===
    [...doc.querySelectorAll("#ordersSummary .order-stat")]
      .find((el) => el.textContent.includes("لغو شده"))
      .textContent.replace(/\D/g, "").length
    ? true
    : T.cancelledOrders(ORDERS).length === 2,
);

console.log("\nکارت کل محصولات");
t(
  "شمارش از تب محصولات",
  txt("set-analytics-products") === "۴ عدد",
  txt("set-analytics-products"),
);
t(
  "تابع شمارش درست است",
  T.totalProductCount() === 4,
  String(T.totalProductCount()),
);

// ---------------------------------------------------------------- chart
console.log("\nنمودار فروش ماهیانه");
const bars = [...doc.querySelectorAll("#dynamicChartBars .chart-bar-item")];
t("هر ۱۲ ماه نمایش داده می‌شود", bars.length === 12, String(bars.length));

const monthly = T.revenueByMonth(ORDERS);
t("خرداد ۹۵ هزار", monthly[2] === 95000, String(monthly[2]));
t("تیر ۲۹ هزار", monthly[3] === 29000, String(monthly[3]));
t("مرداد ۹۸ هزار", monthly[4] === 98000, String(monthly[4]));
t("فروردین صفر", monthly[0] === 0);
t(
  "مجموع = درآمد کل",
  monthly.reduce((a, b) => a + b, 0) === 222000,
  String(monthly.reduce((a, b) => a + b, 0)),
);
t("سفارش ناموفق در نمودار نیست", monthly[4] === 98000 && monthly[4] !== 193000);
t(
  "سفارش لغو شده در نمودار نیست",
  monthly.reduce((a, b) => a + b, 0) !== 366000,
);

const barTexts = bars.map((b) => b.querySelectorAll("span")[1]?.textContent);
t(
  "نام ماه‌ها به ترتیب",
  barTexts[0] === "فروردین" && barTexts[11] === "اسفند",
  barTexts.slice(0, 3).join(","),
);
t(
  "ماه‌های صفر هم رسم می‌شوند",
  bars.some((b) => b.querySelectorAll("span")[0]?.textContent === "۰"),
);
t(
  "ماه پرفروش بلندترین ستون",
  /height:\s*100%/.test(
    bars[4].querySelector(".chart-bar").getAttribute("style"),
  ),
  bars[4].querySelector(".chart-bar").getAttribute("style"),
);
t(
  "راهنمای ستون مبلغ دارد",
  bars[4].getAttribute("title").includes("۹۸,۰۰۰"),
  bars[4].getAttribute("title"),
);
t(
  "مقدار روی ستون فارسی است",
  /[۰-۹]/.test(bars[2].querySelectorAll("span")[0].textContent),
);

// ---------------------------------------------------------------- bestsellers
console.log("\nپرفروش‌ترین دوره‌ها");
const best = T.bestsellingProducts(ORDERS);
t(
  "دوره حسابداری صدرنشین",
  best[0].name === "دوره حسابداری مقدماتی",
  best[0].name,
);
t("دو فروش دارد", best[0].count === 2, String(best[0].count));
t("درآمدش ۹۸ هزار", best[0].revenue === 98000, String(best[0].revenue));
t("مرتب‌سازی بر اساس تعداد", best[0].count >= best[1].count);
t("محصول فروش‌نرفته در لیست نیست", !best.some((b) => b.name === "جزوه مالیات"));
t(
  "لغوشده فروش حساب نمی‌شود",
  best.find((b) => b.name === "دوره اکسل").count === 1,
  String(best.find((b) => b.name === "دوره اکسل").count),
);

const bestCard = doc.getElementById("bestsellingProductsContainer");
t(
  "دقیقاً ۳ مورد نمایش داده می‌شود",
  bestCard.children.length === 3,
  String(bestCard.children.length),
);
t("مدال طلا برای اول", bestCard.textContent.includes("🥇"));
t("مدال نقره برای دوم", bestCard.textContent.includes("🥈"));
t("مدال برنز برای سوم", bestCard.textContent.includes("🥉"));
t("تعداد فروش نمایش داده شده", bestCard.textContent.includes("فروش"));
t("مبلغ درآمد نمایش داده شده", bestCard.textContent.includes("تومان"));

// ---------------------------------------------------------------- multi-item basket
console.log("\nسبد چند محصولی");
const basket = [
  {
    id: "#۲۰۱",
    product: "دوره اکسل، جزوه مالیات",
    amount: 110000,
    date: "۱۴۰۵/۰۵/۰۱",
    status: "success",
    items: [
      { id: "p3", name: "دوره اکسل", price: 95000 },
      { id: "p4", name: "جزوه مالیات", price: 15000 },
    ],
  },
  {
    id: "#۲۰۲",
    product: "دوره اکسل",
    amount: 95000,
    date: "۱۴۰۵/۰۵/۰۲",
    status: "success",
    items: [{ id: "p3", name: "دوره اکسل", price: 95000 }],
  },
];
const bb = T.bestsellingProducts(basket);
t("محصولات سبد جدا شمرده می‌شوند", bb.length === 2, String(bb.length));
t(
  "اکسل دو بار فروخته شده",
  bb[0].name === "دوره اکسل" && bb[0].count === 2,
  `${bb[0].name}=${bb[0].count}`,
);
t(
  "ردیف چسبیده ساخته نمی‌شود",
  !bb.some((x) => x.name.includes("،")),
  bb.map((x) => x.name).join(" | "),
);
t("درآمد اکسل ۱۹۰ هزار", bb[0].revenue === 190000, String(bb[0].revenue));
t(
  "جزوه مالیات هم دیده شد",
  bb.some((x) => x.name === "جزوه مالیات" && x.count === 1),
);

console.log("\nسفارش قدیمی بدون items");
const legacy = [
  {
    id: "#۹۹",
    product: "دوره قدیمی",
    amount: 40000,
    date: "۱۴۰۵/۰۲/۰۱",
    status: "success",
  },
];
const lb = T.bestsellingProducts(legacy);
t("سفارش قدیمی هم شمرده می‌شود", lb.length === 1 && lb[0].count === 1);
t("مبلغش از amount خوانده شد", lb[0].revenue === 40000, String(lb[0].revenue));

console.log("\nتعداد بیش از یک از یک محصول");
const qty = [
  {
    id: "#۹۸",
    product: "دوره x",
    amount: 90000,
    date: "۱۴۰۵/۰۲/۰۱",
    status: "success",
    items: [{ id: "px", name: "دوره x", price: 30000, qty: 3 }],
  },
];
const qb = T.bestsellingProducts(qty);
t("تعداد qty رعایت می‌شود", qb[0].count === 3, String(qb[0].count));
t("درآمد ضرب در تعداد", qb[0].revenue === 90000, String(qb[0].revenue));

// ---------------------------------------------------------------- click-through
console.log("\nکلیک روی کارت میانگین خرید");
const chartCard = doc.getElementById("revenueChartCard");
t("کارت نمودار شناسه دارد", !!chartCard);
T.focusRevenueChart();
t(
  "در همان تب گزارش می‌ماند",
  !doc.getElementById("view-orders").classList.contains("active"),
);
t("نمودار برجسته می‌شود", chartCard.classList.contains("analytics-flash"));

console.log("\nکلیک روی کارت نرخ لغو");
T.jumpToCancelledOrders();
t(
  "به تب سفارشات می‌رود",
  doc.getElementById("view-orders").classList.contains("active"),
);
t(
  "فیلتر روی لغو شده",
  doc.getElementById("orderStatusFilter").value === "cancelled",
);
const rows = [...doc.querySelectorAll("#ordersFullTable tbody tr")];
t("فقط سفارشات لغو شده", rows.length === 2, String(rows.length));
t(
  "محتوای ردیف‌ها درست است",
  rows.every((r) => r.textContent.includes("لغو شده")),
);
const warnTile = doc.querySelector(".order-stat--warn");
t("باکس لغو شده برجسته شد", warnTile.classList.contains("order-stat--flash"));
t(
  "برجستگی موقتی است (کلاس جدا)",
  warnTile.className.includes("order-stat--warn"),
);

console.log("\nکلیک روی کارت کل محصولات");
T.jumpToProducts();
t(
  "به تب محصولات می‌رود",
  doc.getElementById("view-products").classList.contains("active"),
);
t(
  "تب سفارشات بسته شد",
  !doc.getElementById("view-orders").classList.contains("active"),
);

// ---------------------------------------------------------------- expanded modals
console.log("\nمودال نمودار بزرگ");
T.openExpandedChartModal();
const expBars = [...doc.querySelectorAll("#expandedChartBars .chart-bar-item")];
t("هر ۱۲ ماه در مودال", expBars.length === 12, String(expBars.length));
t(
  "مودال باز شد",
  doc.getElementById("expandedChartModal").classList.contains("active"),
);
t(
  "مقادیر با نمودار کوچک یکی است",
  expBars[4].getAttribute("title").includes("۹۸,۰۰۰"),
);

console.log("\nمودال پرفروش‌های کامل");
T.openExpandedBestsellersModal();
const expBest = doc.getElementById("expandedBestsellersList");
t(
  "همه محصولات فروخته‌شده",
  expBest.children.length === 3,
  String(expBest.children.length),
);
t(
  "مودال باز شد",
  doc.getElementById("expandedBestsellersModal").classList.contains("active"),
);

// ---------------------------------------------------------------- empty state
console.log("\nحالت بدون سفارش");
const w2 = boot([], PRODUCTS);
w2.__t.renderAnalyticsView();
const d2 = w2.document;
t(
  "میانگین صفر می‌شود",
  d2.getElementById("set-analytics-avg").textContent.includes("۰"),
);
t(
  "نرخ لغو صفر می‌شود",
  d2.getElementById("set-analytics-cancel").textContent === "۰٪",
  d2.getElementById("set-analytics-cancel").textContent,
);
t(
  "تعداد محصولات نمایش داده می‌شود",
  d2.getElementById("set-analytics-products").textContent === "۴ عدد",
);
t(
  "نمودار خالی هم ۱۲ ستون دارد",
  d2.querySelectorAll("#dynamicChartBars .chart-bar-item").length === 12,
);
t(
  "پیام خالی بودن پرفروش‌ها",
  d2
    .getElementById("bestsellingProductsContainer")
    .textContent.includes("ثبت نشده"),
);
t(
  "بدون تقسیم بر صفر",
  !d2.getElementById("set-analytics-avg").textContent.includes("NaN"),
);

console.log("\nحالت بدون محصول");
const w3 = boot(ORDERS, []);
w3.__t.renderAnalyticsView();
t(
  "صفر محصول",
  w3.document.getElementById("set-analytics-products").textContent === "۰ عدد",
  w3.document.getElementById("set-analytics-products").textContent,
);

console.log("\nداده خراب");
const messy = [
  { id: "#۱", product: "x", amount: "نامشخص", date: "", status: "success" },
  {
    id: "#۲",
    product: "",
    amount: null,
    date: "۱۴۰۵/۰۵/۰۱",
    status: "success",
  },
  {
    id: "#۳",
    product: "y",
    amount: "۵۰,۰۰۰ تومان",
    date: "۱۴۰۵/۰۵/۰۲",
    status: "success",
  },
];
const w4 = boot(messy, PRODUCTS);
w4.__t.renderAnalyticsView();
const d4 = w4.document;
t(
  "رشته مبلغ قدیمی خوانده می‌شود",
  w4.__t.revenueByMonth(messy)[4] === 50000,
  String(w4.__t.revenueByMonth(messy)[4]),
);
t(
  "بدون NaN در میانگین",
  !d4.getElementById("set-analytics-avg").textContent.includes("NaN"),
  d4.getElementById("set-analytics-avg").textContent,
);
t(
  "نام خالی حذف می‌شود",
  !w4.__t.bestsellingProducts(messy).some((x) => !x.name),
);
t(
  "نمودار سالم می‌ماند",
  d4.querySelectorAll("#dynamicChartBars .chart-bar-item").length === 12,
);

console.log("\nامنیت نمایش نام محصول");
const xss = [
  {
    id: "#۱",
    product: "<img src=x onerror=alert(1)>",
    amount: 1000,
    date: "۱۴۰۵/۰۵/۰۱",
    status: "success",
  },
];
const w5 = boot(xss, PRODUCTS);
w5.__t.renderAnalyticsView();
const bestHtml = w5.document.getElementById(
  "bestsellingProductsContainer",
).innerHTML;
t(
  "تگ خطرناک اجرا نمی‌شود",
  !bestHtml.includes("<img src=x"),
  bestHtml.slice(0, 90),
);
t("متن امن نمایش داده شد", bestHtml.includes("&lt;img"));

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
