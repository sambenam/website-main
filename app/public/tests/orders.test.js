/**
 * Orders tab — every purchase attempt must appear in the panel.
 *
 * Run with:  node tests/orders.test.js
 *
 * Before this, only successful payments were recorded, and only by the
 * receipt page writing straight to localStorage. A declined payment or a
 * customer who backed out at the gateway left no trace at all.
 */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
global.window = undefined;
const { appApi } = require("../scripts/api.js");
const { adminScripts, adminSource } = require("./helpers/page-scripts.js");
let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
(async () => {
  const buyer = {
    name: "سام به‌نام",
    email: "sam@t.com",
    phone: "09121112233",
  };
  const items = [{ id: "acc-101", name: "دوره حسابداری", price: 49000 }];

  console.log("\nخرید موفق");
  const ok = await appApi.commerce.createPayment({
    amount: 49000,
    buyer,
    items,
  });
  t("پاسخ موفق", ok.success === true);
  let orders = await appApi.admin.orders.list();
  t("در پنل ثبت شد", orders.length === 1);
  t("وضعیت موفق", orders[0].status === "success");
  t(
    "نام خریدار واقعی",
    orders[0].customer === "سام به‌نام",
    orders[0].customer,
  );
  t("ایمیل ثبت شد", orders[0].buyerEmail === "sam@t.com");
  t(
    "مبلغ عددی است",
    typeof orders[0].amount === "number",
    typeof orders[0].amount,
  );
  t("تاریخ شمسی", /^۱۴۰۵/.test(orders[0].date), orders[0].date);
  t("شماره سفارش", /^#\d+$/.test(orders[0].id), orders[0].id);

  console.log("\nخرید ناموفق");
  try {
    await appApi.commerce.createPayment({
      amount: 95000,
      buyer,
      items,
      forceStatus: "failed",
    });
    t("خطا پرتاب شد", false, "بدون خطا تمام شد");
  } catch (e) {
    t("خطا پرتاب شد", e.status === 402, "status " + e.status);
    t("شناسه سفارش برگشت", !!e.details?.orderId);
  }
  orders = await appApi.admin.orders.list();
  t("ناموفق هم ثبت شد", orders.length === 2, String(orders.length));
  const failed = orders.find((o) => o.status === "failed");
  t("وضعیت ناموفق", !!failed);
  t("دلیل ثبت شد", !!failed.failureReason, failed?.failureReason);
  t("اطلاعات خریدار حفظ شد", failed.customer === "سام به‌نام");

  console.log("\nانصراف کاربر");
  await appApi.commerce.recordCancelled({ amount: 30000, buyer, items });
  orders = await appApi.admin.orders.list();
  t("لغو هم ثبت شد", orders.length === 3);
  const cancelled = orders.find((o) => o.status === "cancelled");
  t("وضعیت لغو", !!cancelled);
  t("دلیل انصراف", cancelled.failureReason.includes("انصراف"));

  console.log("\nشماره‌گذاری");
  const ids = orders.map((o) => parseInt(String(o.id).replace(/\D/g, ""), 10));
  t("شماره‌ها یکتا هستند", new Set(ids).size === ids.length, ids.join(","));
  t("افزایشی هستند", Math.max(...ids) > Math.min(...ids));

  console.log("\nمحاسبه درآمد");
  const revenue = orders
    .filter((o) => o.status === "success")
    .reduce((s, o) => s + o.amount, 0);
  t("فقط موفق‌ها شمرده می‌شوند", revenue === 49000, String(revenue));

  // ---- how the panel renders them -------------------------------------
  const { JSDOM } = require("jsdom");
  const fs = require("fs");
  const path = require("path");
  const ROOT = path.join(__dirname, "..");

  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const panelStore = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
    irHesabdarOrders: JSON.stringify(orders),
  };
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in panelStore ? panelStore[k] : null),
      setItem: (k, v) => {
        panelStore[k] = String(v);
      },
      removeItem: (k) => {
        delete panelStore[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });

  const ORDER = adminScripts();
  const srcs = ORDER.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  srcs.push(`window.__t = {
    renderOrdersTable, getStatusText, formatOrderAmount, downloadOrdersReport,
    csvCell, csvRow,
    calculateRevenue, orderAmountValue, updateDashboardMetrics,
    set orders(v) { appState.orders = v; },
  };`);
  try {
    w.eval(srcs.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 110));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.__t.orders = orders;
  w.__t.renderOrdersTable();

  console.log("\nنمایش در پنل");
  const doc = w.document;
  const rowCount = doc.querySelectorAll("#ordersFullTable tbody tr").length;
  t("هر سه سفارش نمایش داده شد", rowCount === 3, String(rowCount));

  const tableHtml = doc.getElementById("ordersFullTable").innerHTML;
  t("برچسب پرداخت موفق", tableHtml.includes("پرداخت موفق"));
  t("برچسب پرداخت ناموفق", tableHtml.includes("پرداخت ناموفق"));
  t("برچسب لغو شده", tableHtml.includes("لغو شده"));
  t("دلیل ناموفقی نمایش داده شد", tableHtml.includes("order-reason"));
  t("مبلغ با تومان", tableHtml.includes("تومان"));

  console.log("\nخلاصه بالای جدول");
  const summary = doc.getElementById("ordersSummary");
  t(
    "کادر خلاصه پر شد",
    summary && summary.children.length === 5,
    String(summary?.children.length),
  );
  t(
    "درآمد فقط از موفق‌ها",
    summary.textContent.includes("۴۹٬۰۰۰") ||
      summary.textContent.includes("۴۹,۰۰۰"),
    summary.textContent.replace(/\s+/g, " ").slice(0, 120),
  );

  console.log("\nفیلتر وضعیت");
  const filter = doc.getElementById("orderStatusFilter");
  filter.value = "failed";
  filter.dispatchEvent(new w.Event("change", { bubbles: true }));
  const failedRows = [...doc.querySelectorAll("#ordersFullTable tbody tr")];
  t("فقط ناموفق‌ها", failedRows.length === 1, String(failedRows.length));
  t("ردیف درست است", failedRows[0].textContent.includes("پرداخت ناموفق"));

  filter.value = "all";
  filter.dispatchEvent(new w.Event("change", { bubbles: true }));
  t(
    "بازگشت به همه",
    doc.querySelectorAll("#ordersFullTable tbody tr").length === 3,
  );

  filter.value = "pending";
  filter.dispatchEvent(new w.Event("change", { bubbles: true }));
  t(
    "وضعیت خالی پیام می‌دهد",
    doc
      .querySelector("#ordersFullTable tbody")
      .textContent.includes("ثبت نشده"),
  );

  console.log("\nقالب‌بندی مبلغ");
  t("عدد", w.__t.formatOrderAmount(49000).includes("تومان"));
  t("رشته قدیمی", w.__t.formatOrderAmount("۴۹,۰۰۰ تومان").includes("تومان"));
  t("خالی", w.__t.formatOrderAmount(null) === "—");

  console.log("\nتاریخچه خرید در پروفایل کاربر");
  await appApi.auth.register({
    name: "نگین",
    email: "negin@t.com",
    password: "123456",
  });
  const nBuyer = { name: "نگین", email: "negin@t.com", phone: "0912" };
  await appApi.commerce.createPayment({ amount: 49000, buyer: nBuyer, items });
  try {
    await appApi.commerce.createPayment({
      amount: 95000,
      buyer: nBuyer,
      items,
      forceStatus: "failed",
    });
  } catch (e) {}
  await appApi.commerce.recordCancelled({
    amount: 30000,
    buyer: nBuyer,
    items,
  });
  // an order billed to someone else must not appear in her history
  await appApi.commerce.createPayment({
    amount: 70000,
    buyer: { name: "دیگری", email: "other@t.com", phone: "0913" },
    items,
  });

  const mine = await appApi.commerce.myOrders();
  t("سفارش‌های خودش را می‌بیند", mine.length === 3, String(mine.length));
  t(
    "سفارش دیگران نشت نمی‌کند",
    !mine.some((o) => o.buyerEmail === "other@t.com"),
  );
  t(
    "هر سه وضعیت را می‌بیند",
    ["success", "failed", "cancelled"].every((st) =>
      mine.some((o) => o.status === st),
    ),
  );
  t(
    "دلیل ناموفقی را می‌بیند",
    !!mine.find((o) => o.status === "failed").failureReason,
  );

  console.log("\nاتصال به داشبورد و آنالیز");
  const dashOrders = [
    {
      id: "#1",
      status: "success",
      amount: 100000,
      customer: "a",
      date: "۱۴۰۵/۰۱/۰۱",
    },
    {
      id: "#2",
      status: "success",
      amount: 100000,
      customer: "b",
      date: "۱۴۰۵/۰۱/۰۲",
    },
    {
      id: "#3",
      status: "failed",
      amount: 900000,
      customer: "c",
      date: "۱۴۰۵/۰۱/۰۳",
    },
    {
      id: "#4",
      status: "cancelled",
      amount: 800000,
      customer: "d",
      date: "۱۴۰۵/۰۱/۰۴",
    },
    // a legacy row that stored the amount as a formatted string
    {
      id: "#5",
      status: "success",
      amount: "۵۰,۰۰۰ تومان",
      customer: "e",
      date: "۱۴۰۵/۰۱/۰۵",
    },
  ];
  w.__t.orders = dashOrders;
  w.__t.renderOrdersTable();
  w.__t.updateDashboardMetrics();

  t(
    "درآمد فقط از موفق‌ها",
    w.__t.calculateRevenue(dashOrders) === 250000,
    String(w.__t.calculateRevenue(dashOrders)),
  );
  t(
    "رشته قدیمی هم خوانده شد",
    w.__t.orderAmountValue("۵۰,۰۰۰ تومان") === 50000,
    String(w.__t.orderAmountValue("۵۰,۰۰۰ تومان")),
  );
  t("عدد ساده", w.__t.orderAmountValue(49000) === 49000);
  t("مقدار خراب صفر می‌شود", w.__t.orderAmountValue("نامشخص") === 0);

  const statRevenue = doc.getElementById("stat-revenue")?.textContent || "";
  t("کارت درآمد داشبورد پر شد", statRevenue.includes("تومان"), statRevenue);
  const statOrders = doc.getElementById("stat-orders")?.textContent || "";
  t(
    "کارت سفارشات فقط موفق‌ها را می‌شمارد",
    statOrders.trim() === "۳",
    statOrders,
  );

  console.log("\nهمخوانی سه بخش");
  const panelRevenue = w.__t.calculateRevenue(dashOrders);
  t(
    "داشبورد و تب سفارشات یک عدد می‌دهند",
    doc
      .getElementById("ordersSummary")
      .textContent.includes(
        panelRevenue.toLocaleString("fa-IR").replace(/\u066c/g, "٬"),
      ) || doc.getElementById("ordersSummary").textContent.includes("۲۵۰"),
    doc
      .getElementById("ordersSummary")
      .textContent.replace(/\s+/g, " ")
      .slice(0, 100),
  );

  console.log("\nدکمه دانلود گزارش");
  // Capture the download instead of letting jsdom attempt a real one.
  let captured = null,
    clicked = false;
  w.URL.createObjectURL = (blob) => {
    captured = blob;
    return "blob:test";
  };
  w.URL.revokeObjectURL = () => {};
  const realCreate = w.document.createElement.bind(w.document);
  w.document.createElement = (tag) => {
    const el = realCreate(tag);
    if (tag === "a")
      el.click = function () {
        clicked = true;
        captured.__name = this.getAttribute("download");
      };
    return el;
  };

  const exportOrders = [
    {
      id: "#۱۰۰۰۱",
      customer: "سام",
      buyerPhone: "09121112233",
      buyerEmail: "s@t.com",
      product: "دوره",
      amount: 49000,
      date: "۱۴۰۵/۰۵/۰۵",
      status: "success",
    },
    {
      id: "#۱۰۰۰۲",
      customer: "مریم",
      buyerPhone: "",
      buyerEmail: "",
      product: '=HYPERLINK("http://bad.site","برنده")',
      amount: 250000,
      date: "۱۴۰۵/۰۵/۰۴",
      status: "failed",
      failureReason: "موجودی کافی نیست",
    },
  ];
  w.__t.orders = exportOrders;
  w.showToast = () => {};
  w.__t.downloadOrdersReport();

  t("دانلود آغاز شد", clicked === true);
  t("فایل CSV ساخته شد", captured && captured.type.includes("text/csv"));
  t(
    "نام فایل لاتین است",
    /^orders-report-\d{4}-\d{2}-\d{2}\.csv$/.test(captured.__name || ""),
    captured.__name,
  );

  const csv = await captured.text();
  const rows = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\n");
  t("یک سرستون و دو سطر", rows.length === 3, String(rows.length));
  t("ستون توضیح دارد", rows[0].includes("توضیح"));
  t("دلیل ناموفقی نوشته شد", csv.includes("موجودی کافی نیست"));
  t("مقدار خالی به‌جای شماره ساختگی", csv.includes('"—"'));
  t("مبلغ با واحد", csv.includes("تومان"));

  console.log("\nمحافظت از اکسل");
  t(
    "فرمول خنثی شد",
    csv.includes("\"'=HYPERLINK"),
    "بدون آپستروف، اکسل آن را اجرا می‌کند",
  );
  t("کوتیشن داخلی دوبل شد", csv.includes('""http://bad.site""'));

  console.log("\nهر چهار خروجی از یک مسیر می‌گذرند");
  const adminSrc = adminSource();
  t(
    "triggerCsvDownload تعریف شده",
    adminSrc.includes("function triggerCsvDownload"),
  );
  t(
    "چهار فراخوانی دارد",
    (adminSrc.match(/triggerCsvDownload\(/g) || []).length === 4 + 1,
    String((adminSrc.match(/triggerCsvDownload\(/g) || []).length),
  );
  t(
    "هیچ نام فایل فارسی نمانده",
    !/setAttribute\("download", `[^`]*toPersianDigits/.test(adminSrc),
  );

  console.log(`\n  ${p} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})();
