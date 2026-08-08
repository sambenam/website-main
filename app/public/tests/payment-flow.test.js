/**
 * Payment flow — checkout, gateway, receipt.
 *
 * Run with:  node tests/payment-flow.test.js
 *
 * Five defects this locks down:
 *
 *   1. checkout dropped `qty` when forwarding the basket, so two copies were
 *      recorded as one: bestsellers under-counted and the line items no
 *      longer added up to the amount charged.
 *   2. the gateway displayed a hardcoded ۳۳,۰۰۰,۰۰۰ while charging the real
 *      total - on a payment screen that is the one number that must be right.
 *   3. receipt.html with no ?status defaulted to "success", so opening the
 *      URL directly showed a confirmed purchase, cleared the cart and
 *      unlocked the product.
 *   4. the receipt printed a fixed date and showed no buyer or product.
 *   5. the tracking code was built from the raw order id, producing
 *      "TRX-#10001".
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { pageScripts, readScripts } = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Load one page of the flow against shared browser storage.
 *
 * The script list comes from the page itself, so adding or splitting a script
 * never leaves this test running an out-of-date bundle.
 */
function page(name, local, session, query) {
  const scripts = pageScripts(name + ".html");
  const html = fs.readFileSync(
    path.join(ROOT, "html/" + name + ".html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "http://localhost/html/" + name + ".html" + (query || ""),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in local ? local[k] : null),
      setItem: (k, v) => {
        local[k] = String(v);
      },
      removeItem: (k) => {
        delete local[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "sessionStorage", {
    value: {
      getItem: (k) => (k in session ? session[k] : null),
      setItem: (k, v) => {
        session[k] = String(v);
      },
      removeItem: (k) => {
        delete session[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  const src = scripts.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push('window.__api = typeof appApi !== "undefined" ? appApi : null;');
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle " + name + "] " + e.message.slice(0, 120));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  return w;
}

(async () => {
  /* ------------------------------------------------------------ checkout */
  section("۱. صفحه تسویه");
  const local = {},
    session = {};
  local.hesabyarCart = JSON.stringify([
    { id: "acc-101", name: "دوره حسابداری", price: 490000, qty: 1 },
    { id: "acc-102", name: "جزوه مالیات", price: 150000, qty: 2 },
  ]);
  const w1 = page("checkout", local, session);
  const d1 = w1.document;
  const expected = 490000 + 150000 * 2;

  t(
    "همه آیتم‌های سبد نمایش داده می‌شوند",
    d1.querySelectorAll(".cart-items-list .cart-item").length === 2,
  );
  t(
    "جمع کل با تعداد محاسبه می‌شود",
    JSON.parse(session.hesabyarCheckout).total === expected,
    String(JSON.parse(session.hesabyarCheckout).total),
  );

  d1.getElementById("billingName").value = "زهرا کریمی";
  d1.getElementById("billingPhone").value = "09121112233";
  d1.getElementById("billingEmail").value = "z@t.com";
  d1.getElementById("checkoutForm").dispatchEvent(
    new w1.Event("submit", { bubbles: true, cancelable: true }),
  );

  const forwarded = JSON.parse(session.hesabyarCheckout);
  t(
    "مشخصات خریدار منتقل می‌شود",
    forwarded.buyer && forwarded.buyer.name === "زهرا کریمی",
  );
  t("آیتم‌ها منتقل می‌شوند", forwarded.items.length === 2);
  // Was dropped: two copies were forwarded as one.
  t(
    "تعداد هر آیتم حفظ می‌شود",
    forwarded.items.every((i) => Number(i.qty) > 0),
    JSON.stringify(forwarded.items.map((i) => i.qty)),
  );
  t(
    "تعداد درست منتقل می‌شود",
    forwarded.items.find((i) => i.id === "acc-102").qty === 2,
  );
  t(
    "جمع آیتم‌ها با مبلغ می‌خواند",
    forwarded.items.reduce((s, i) => s + i.price * i.qty, 0) === expected,
  );

  /* ------------------------------------------------------------- gateway */
  section("۲. صفحه درگاه");
  const w2 = page("gateway", local, session);
  const d2 = w2.document;
  const shown = d2.getElementById("gatewayAmount").textContent;
  t("مبلغ واقعی نمایش داده می‌شود", shown.includes("۷۹۰"), shown.trim());
  t(
    "عدد ثابت ۳۳ میلیون نمانده",
    !shown.includes("۳۳,۰۰۰,۰۰۰") && !shown.includes("۳۳٬۰۰۰٬۰۰۰"),
  );
  ["cardNumber", "cvv2", "expMonth", "expYear", "captchaInput"].forEach(
    (id) => {
      t(`فیلد ${id} وجود دارد`, !!d2.getElementById(id));
    },
  );
  t(
    "دکمه انصراف به رسید لغو می‌رود",
    !!d2.querySelector('a[href*="status=cancelled"]'),
  );

  d2.getElementById("desktopPaymentForm").dispatchEvent(
    new w2.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait(120);
  t(
    "فرم خالی رد می‌شود",
    !!d2.querySelector(".gateway-message"),
    d2.querySelector(".gateway-message")?.textContent.slice(0, 40),
  );

  section("درگاه بدون سبد خرید");
  const w2b = page("gateway", {}, {});
  const d2b = w2b.document;
  t(
    "مبلغ خالی می‌ماند",
    !d2b.getElementById("gatewayAmount").textContent.includes("۳۳"),
  );
  t(
    "دکمه پرداخت غیرفعال می‌شود",
    d2b.querySelector('#desktopPaymentForm [type="submit"]').disabled === true,
  );
  t("به کاربر توضیح داده می‌شود", !!d2b.querySelector(".gateway-message"));

  /* ------------------------------------------------------------- receipt */
  section("۳. رسید پرداخت موفق");
  const rLocal = {
    hesabyarCart: JSON.stringify([
      { id: "acc-101", name: "دوره حسابداری", price: 490000, qty: 1 },
    ]),
    irHesabdarBuyerName: "زهرا کریمی",
  };
  const rSession = {
    hesabyarCheckout: JSON.stringify({
      finalAmount: 790000,
      buyer: { name: "زهرا کریمی", email: "z@t.com" },
      items: [{ id: "acc-101", name: "دوره حسابداری", price: 490000, qty: 1 }],
    }),
  };
  const w3 = page(
    "receipt",
    rLocal,
    rSession,
    "?status=success&orderId=%2310001",
  );
  await wait(400);
  const d3 = w3.document;
  t(
    "عنوان موفقیت",
    d3.getElementById("receiptTitle").textContent.includes("موفقیت"),
  );
  t(
    "مبلغ واقعی روی رسید",
    d3.getElementById("receiptAmount").textContent.includes("۷۹۰"),
    d3.getElementById("receiptAmount").textContent,
  );
  t(
    "تاریخ ثابت نمانده",
    !d3.getElementById("receiptDate").textContent.includes("۱۴۰۴"),
    d3.getElementById("receiptDate").textContent,
  );
  t(
    "نام خریدار روی رسید هست",
    d3.getElementById("receiptBuyer").textContent.includes("زهرا"),
  );
  t(
    "ردیف خریدار نمایان است",
    d3.getElementById("receiptBuyerRow").hidden === false,
  );
  t(
    "نام محصول روی رسید هست",
    d3.getElementById("receiptProduct").textContent.includes("حسابداری"),
  );
  // Was "TRX-#10001": the "#" is not part of a tracking code.
  t(
    "کد رهگیری بدون کاراکتر اضافه",
    /^TRX-[0-9A-Z]+$/.test(d3.getElementById("trxId").textContent),
    d3.getElementById("trxId").textContent,
  );
  t("سبد خرید پاک می‌شود", rLocal.hesabyarCart === undefined);
  t(
    "محصول برای کاربر باز می‌شود",
    (rLocal.irHesabdarPurchasedProducts || "").includes("acc-101"),
  );

  section("رسید پرداخت ناموفق");
  const fLocal = {
    hesabyarCart: JSON.stringify([
      { id: "acc-101", name: "x", price: 1, qty: 1 },
    ]),
  };
  const w4 = page(
    "receipt",
    fLocal,
    { hesabyarCheckout: JSON.stringify({ finalAmount: 1 }) },
    "?status=failed&orderId=%2310002",
  );
  await wait(250);
  t(
    "عنوان ناموفق",
    w4.document.getElementById("receiptTitle").textContent.includes("ناموفق"),
  );
  t("سبد خرید دست‌نخورده می‌ماند", !!fLocal.hesabyarCart);
  t("محصول باز نمی‌شود", !fLocal.irHesabdarPurchasedProducts);
  t(
    "دکمه تلاش مجدد دارد",
    w4.document
      .getElementById("receiptActions")
      .innerHTML.includes("تلاش مجدد"),
  );

  section("رسید لغو شده");
  const cLocal = {
    hesabyarCart: JSON.stringify([
      { id: "acc-101", name: "x", price: 1, qty: 1 },
    ]),
  };
  const w5 = page(
    "receipt",
    cLocal,
    { hesabyarCheckout: JSON.stringify({ finalAmount: 1 }) },
    "?status=cancelled",
  );
  await wait(250);
  t(
    "عنوان لغو",
    w5.document.getElementById("receiptTitle").textContent.includes("لغو"),
  );
  t("سبد خرید دست‌نخورده می‌ماند", !!cLocal.hesabyarCart);

  section("۴. باز کردن مستقیم رسید بدون خرید");
  const dLocal = {
    hesabyarCart: JSON.stringify([
      { id: "acc-101", name: "x", price: 1, qty: 1 },
    ]),
  };
  const w6 = page("receipt", dLocal, {}, "");
  await wait(250);
  const d6 = w6.document;
  t(
    "رسید موفق جعلی نشان نمی‌دهد",
    !d6.getElementById("receiptTitle").textContent.includes("موفقیت"),
    d6.getElementById("receiptTitle").textContent,
  );
  t(
    "پیام مناسب نمایش می‌دهد",
    d6.getElementById("receiptTitle").textContent.includes("وجود ندارد"),
  );
  t("سبد خرید پاک نمی‌شود", !!dLocal.hesabyarCart);
  t("محصول باز نمی‌شود", !dLocal.irHesabdarPurchasedProducts);
  t(
    "مبلغ ساختگی نشان نمی‌دهد",
    !d6.getElementById("receiptAmount").textContent.includes("۳۳"),
    d6.getElementById("receiptAmount").textContent,
  );
  t(
    "راه خروج پیشنهاد می‌دهد",
    d6.getElementById("receiptActions").innerHTML.includes("سفارش‌های من"),
  );

  /* -------------------------------------------------- end-to-end recording */
  section("۵. ثبت سفارش با تعداد درست");
  {
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
    delete require.cache[require.resolve("../scripts/api.js")];
    const { appApi } = require("../scripts/api.js");

    await appApi.auth.register({
      name: "زهرا",
      email: "z@t.com",
      password: "12345678",
    });
    await appApi.commerce.createPayment({
      amount: expected,
      buyer: { name: "زهرا", email: "z@t.com" },
      items: forwarded.items,
    });
    const order = (await appApi.admin.orders.list())[0];
    t(
      "مبلغ سفارش درست ثبت شد",
      order.amount === expected,
      String(order.amount),
    );
    t(
      "تعداد در آیتم‌ها ذخیره شد",
      order.items.every((i) => Number(i.qty) > 0),
    );
    const units = order.items.reduce((s, i) => s + Number(i.qty), 0);
    t("تعداد واحد فروخته‌شده درست است", units === 3, String(units));
    t(
      "جمع آیتم‌ها با مبلغ سفارش می‌خواند",
      order.items.reduce((s, i) => s + i.price * i.qty, 0) === order.amount,
    );
  }

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
