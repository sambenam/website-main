/**
 * User profile — every tab backed by real data.
 *
 * Run with:  node tests/user-profile.test.js
 *
 *   مشخصات شخصی      ویرایش در پروفایل → لیست کاربران پنل
 *   سبد خرید من       فقط چیزی که واقعاً اضافه شده
 *   سفارش‌های من      هر سه وضعیت → تب سفارشات پنل
 *   پیام‌های من       تماس با ما + پشتیبان هوشمند + گزارش تخلف
 *   امنیت            بخش جمع‌شونده، چشمک، هشدار شمارش معکوس
 *   باکس‌های آمار     از داده واقعی، بدون «امتیاز کل» ساختگی
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

function bootPage(seed) {
  const html = fs.readFileSync(
    path.join(ROOT, "html/user-profile.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "http://localhost/html/user-profile.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const store = Object.assign({}, seed || {});
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
  const src = readScripts(
    pageScripts("user-profile.html", { exclude: ["mobile-menu.js"] }),
  );
  src.push(`window.__t = {
    appApi, renderCart, renderMyOrders, renderMyMessages, updateQty, removeItem,
    get cart() { return cartState; }, set cart(v) { cartState = v; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  Object.defineProperty(w, "confirm", {
    value: () => true,
    configurable: true,
    writable: true,
  });
  return { w, doc: w.document, store };
}

(async () => {
  /* ------------------------------------------------- 1. personal details */
  section("۱. مشخصات شخصی — ذخیره در سرور");
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
      name: "سام",
      email: "sam@t.com",
      password: "12345678",
      phone: "09121112233",
    });
    await appApi.profile.update({
      name: "سام به‌نام",
      phone: "09129998877",
      address: "تهران",
    });

    const me = await appApi.auth.me();
    t("تغییر در سشن اعمال شد", me.name === "سام به‌نام", me.name);
    t("آدرس ذخیره شد", me.address === "تهران");

    // Was broken: the profile copy updated but the account record did not,
    // so the admin users tab kept showing the old name for ever.
    const adminUsers = await appApi.admin.users.list();
    const row = adminUsers.find((u) => u.email === "sam@t.com");
    t(
      "در لیست کاربران پنل هم به‌روز شد",
      row && row.name === "سام به‌نام",
      row && row.name,
    );
    t("تلفن هم همگام شد", row && row.phone === "09129998877", row && row.phone);

    await appApi.auth.logout();
    await appApi.auth.register({
      name: "دیگری",
      email: "other@t.com",
      password: "12345678",
    });
    try {
      await appApi.profile.update({ email: "sam@t.com" });
      t("ایمیل تکراری رد می‌شود", false, "خطا نداد");
    } catch (e) {
      t("ایمیل تکراری رد می‌شود", e.status === 409, String(e.status));
    }
  }

  /* ------------------------------------------------------------ 2. cart */
  section("۲. سبد خرید — بدون داده ساختگی");
  let { w, doc, store } = bootPage();
  await wait(150);
  t(
    "سبد در ابتدا خالی است",
    w.__t.cart.length === 0,
    String(w.__t.cart.length),
  );
  t(
    "لپ‌تاپ ساختگی نمانده",
    !doc.getElementById("cartItemsContainer").textContent.includes("لپ‌تاپ"),
  );
  t(
    "پیام خالی بودن",
    doc.getElementById("cartItemsContainer").textContent.includes("خالی"),
  );
  t("شمارنده صفر", doc.getElementById("cartCountStat").textContent === "۰");
  t(
    "بج سبد پنهان است",
    doc.getElementById("cartBadge").style.display === "none",
  );

  const realCart = [
    {
      id: "acc-101",
      name: "دوره حسابداری مقدماتی",
      price: 490000,
      qty: 2,
      img: "../images/ravin.png",
    },
  ];
  ({ w, doc, store } = bootPage({ hesabyarCart: JSON.stringify(realCart) }));
  await wait(150);
  t(
    "محصول واقعی نمایش داده می‌شود",
    doc
      .getElementById("cartItemsContainer")
      .textContent.includes("دوره حسابداری"),
  );
  t(
    "شمارنده از تعداد واقعی",
    doc.getElementById("cartCountStat").textContent === "۲",
    doc.getElementById("cartCountStat").textContent,
  );
  t("بج نمایان شد", doc.getElementById("cartBadge").style.display !== "none");
  t(
    "مبلغ با ارقام فارسی",
    /[۰-۹]/.test(doc.getElementById("cartItemsContainer").textContent),
  );

  // Ids are strings like "acc-101"; a numeric-only handler broke on them.
  w.__t.updateQty("acc-101", -1);
  t(
    "کم کردن تعداد کار می‌کند",
    w.__t.cart[0].qty === 1,
    String(w.__t.cart[0].qty),
  );
  w.__t.removeItem("acc-101");
  t("حذف با شناسه متنی کار می‌کند", w.__t.cart.length === 0);
  t(
    "پس از حذف در حافظه هم رفت",
    JSON.parse(store.hesabyarCart || "[]").length === 0,
  );

  /* ---------------------------------------------------------- 3. orders */
  section("۳. سفارش‌های من — هر سه وضعیت");
  {
    const s2 = {};
    global.localStorage = {
      getItem: (k) => (k in s2 ? s2[k] : null),
      setItem: (k, v) => {
        s2[k] = String(v);
      },
      removeItem: (k) => {
        delete s2[k];
      },
    };
    delete require.cache[require.resolve("../scripts/api.js")];
    const { appApi } = require("../scripts/api.js");

    await appApi.auth.register({
      name: "زهرا کریمی",
      email: "z@t.com",
      password: "12345678",
      phone: "09121112233",
    });
    const buyer = {
      name: "زهرا کریمی",
      email: "z@t.com",
      phone: "09121112233",
    };
    const items = [
      { id: "acc-101", name: "دوره حسابداری مقدماتی", price: 490000, qty: 1 },
    ];

    await appApi.commerce.createPayment({ amount: 490000, buyer, items });
    try {
      await appApi.commerce.createPayment({
        amount: 290000,
        buyer,
        items,
        forceStatus: "failed",
      });
    } catch (e) {}
    await appApi.commerce.recordCancelled({ amount: 150000, buyer, items });

    const mine = await appApi.commerce.myOrders();
    t("هر سه سفارش در پروفایل", mine.length === 3, String(mine.length));
    t(
      "سفارش موفق هست",
      mine.some((o) => o.status === "success"),
    );
    t(
      "سفارش ناموفق هم هست",
      mine.some((o) => o.status === "failed"),
    );
    t(
      "سفارش لغوشده هم هست",
      mine.some((o) => o.status === "cancelled"),
    );

    const adminOrders = await appApi.admin.orders.list();
    t(
      "همان‌ها در تب سفارشات پنل",
      adminOrders.length === 3,
      String(adminOrders.length),
    );
    t(
      "نام مشتری با پروفایل یکی است",
      adminOrders.every((o) => o.customer === "زهرا کریمی"),
    );
    t(
      "محصول ثبت شده",
      adminOrders.every((o) => o.product.includes("حسابداری")),
    );
    t(
      "مبلغ عددی است",
      adminOrders.every((o) => typeof o.amount === "number"),
    );
    t(
      "به حساب کاربر وصل است",
      adminOrders.every((o) => !!o.userId),
    );

    await appApi.auth.logout();
    await appApi.auth.register({
      name: "غریبه",
      email: "x@t.com",
      password: "12345678",
    });
    const others = await appApi.commerce.myOrders();
    t(
      "سفارش کاربر دیگر نشت نمی‌کند",
      others.length === 0,
      String(others.length),
    );
  }

  /* -------------------------------------------------------- 4. messages */
  section("۴. پیام‌های من — هر سه منبع");
  {
    const s3 = {};
    global.localStorage = {
      getItem: (k) => (k in s3 ? s3[k] : null),
      setItem: (k, v) => {
        s3[k] = String(v);
      },
      removeItem: (k) => {
        delete s3[k];
      },
    };
    delete require.cache[require.resolve("../scripts/api.js")];
    const { appApi } = require("../scripts/api.js");

    await appApi.auth.register({
      name: "زهرا",
      email: "z@t.com",
      password: "12345678",
    });
    await appApi.support.sendMessage({
      name: "زهرا",
      email: "z@t.com",
      subject: "question",
      message: "از تماس با ما",
      source: "contact",
    });
    await appApi.support.sendMessage({
      name: "زهرا",
      email: "z@t.com",
      subject: "ai",
      message: "از پشتیبان هوشمند",
      source: "ai",
    });
    const rep = await appApi.support.reportAbuse({
      reporterName: "زهرا",
      reporterEmail: "z@t.com",
      kind: "content",
      subject: "دوره",
      description: "گزارش تخلف من",
    });
    await appApi.admin.reports.reply(rep.reportId, {
      text: "پاسخ به گزارش شما",
      adminName: "مدیر",
    });

    const msgs = await appApi.support.myMessages();
    t("هر سه منبع رسیده", msgs.length === 3, String(msgs.length));
    t(
      "پیام تماس با ما",
      msgs.some((m) => m.source === "contact"),
    );
    t(
      "پیام پشتیبان هوشمند",
      msgs.some((m) => m.source === "ai"),
    );
    t(
      "گزارش تخلف",
      msgs.some((m) => m.source === "report"),
    );

    const answered = msgs.find((m) => m.source === "report");
    t(
      "پاسخ گزارش در همان نخ",
      answered.history.length === 2,
      String(answered.history.length),
    );
    t(
      "پاسخ از سمت مدیر است",
      answered.history[1].sender === "admin" &&
        answered.history[1].text.includes("پاسخ به گزارش"),
    );
  }

  /* -------------------------------------------------------- 5. wishlist */
  section("۵. لیست علاقه‌مندی‌ها حذف شد");
  ({ w, doc } = bootPage());
  t("تب از منو حذف شد", !doc.querySelector('[data-tab="wishlist"]'));
  t("محتوای تب حذف شد", !doc.getElementById("tab-wishlist"));
  t("هیچ اشاره‌ای نمانده", !doc.body.innerHTML.includes("علاقه‌مندی"));

  /* -------------------------------------------------------- 6. security */
  section("۶. امنیت و رمز عبور");
  t(
    "سه کادر رمز، هر کدام چشمک دارند",
    doc.querySelectorAll(".password-eye").length === 3,
    String(doc.querySelectorAll(".password-eye").length),
  );
  t(
    "بخش رمز جدید در ابتدا بسته است",
    doc.getElementById("newPasswordSection").hidden === true,
  );
  t(
    "دکمه به‌روزرسانی در ابتدا غیرفعال",
    doc.getElementById("updatePasswordBtn").disabled === true,
  );

  const toggle = doc.getElementById("togglePasswordChange");
  t("گزینه «تمایل به تغییر رمز» هست", !!toggle);
  toggle.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t(
    "با کلیک باز می‌شود",
    doc.getElementById("newPasswordSection").hidden === false,
  );
  t(
    "وضعیت دسترس‌پذیری اعلام می‌شود",
    toggle.getAttribute("aria-expanded") === "true",
  );
  toggle.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t(
    "دوباره بسته می‌شود",
    doc.getElementById("newPasswordSection").hidden === true,
  );

  toggle.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const eye = doc.querySelector('[data-toggle-password="newPassword"]');
  const field = doc.getElementById("newPassword");
  t("رمز در ابتدا پنهان است", field.type === "password");
  eye.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t("چشمک رمز را نمایان می‌کند", field.type === "text");
  eye.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t("دوباره پنهان می‌کند", field.type === "password");

  doc.getElementById("currentPassword").value = "old12345";
  field.value = "123";
  field.dispatchEvent(new w.Event("input", { bubbles: true }));
  t(
    "رمز کوتاه هشدار می‌دهد",
    doc.getElementById("passwordHint").textContent.includes("۶ کاراکتر"),
  );
  t(
    "دکمه با رمز کوتاه غیرفعال می‌ماند",
    doc.getElementById("updatePasswordBtn").disabled === true,
  );

  field.value = "newpass123";
  doc.getElementById("confirmPassword").value = "different";
  doc
    .getElementById("confirmPassword")
    .dispatchEvent(new w.Event("input", { bubbles: true }));
  t(
    "عدم تطابق تشخیص داده می‌شود",
    doc.getElementById("passwordHint").textContent.includes("یکسان نیستند"),
  );

  doc.getElementById("confirmPassword").value = "newpass123";
  doc
    .getElementById("confirmPassword")
    .dispatchEvent(new w.Event("input", { bubbles: true }));
  t(
    "با ورودی درست دکمه فعال می‌شود",
    doc.getElementById("updatePasswordBtn").disabled === false,
  );

  t("مودال هشدار وجود دارد", !!doc.getElementById("passwordConfirmOverlay"));
  t(
    "هشدار در ابتدا پنهان است",
    doc.getElementById("passwordConfirmOverlay").hidden === true,
  );
  doc
    .getElementById("securityForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await wait(100);
  t(
    "هنگام ثبت، هشدار نمایش داده می‌شود",
    doc.getElementById("passwordConfirmOverlay").hidden === false,
  );
  t(
    "شمارش معکوس دارد",
    /[۰-۹]/.test(doc.getElementById("passwordConfirmCount").textContent),
  );
  doc
    .getElementById("passwordConfirmCancel")
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await wait(80);
  t(
    "انصراف هشدار را می‌بندد",
    doc.getElementById("passwordConfirmOverlay").hidden === true,
  );

  /* ----------------------------------------------------- 7. stat boxes */
  section("۷. باکس‌های آمار");
  t(
    "فقط دو باکس مانده",
    doc.querySelectorAll(".stat-box").length === 2,
    String(doc.querySelectorAll(".stat-box").length),
  );
  t("«امتیاز کل» حذف شد", !doc.body.textContent.includes("امتیاز کل"));
  t("باکس سفارش‌ها شناسه دارد", !!doc.getElementById("ordersCountStat"));
  t("باکس سبد خرید شناسه دارد", !!doc.getElementById("cartCountStat"));
  t(
    "عدد ثابت ۱۲ نمانده",
    doc.getElementById("ordersCountStat").textContent !== "۱۲",
  );
  // Scope the check to the stats block: "۴۵۰" also appears in the footer
  // marketing copy, which is unrelated.
  t(
    "عدد امتیاز ثابت نمانده",
    !doc.querySelector(".profile-stats").textContent.includes("۴۵۰"),
    doc.querySelector(".profile-stats").textContent.replace(/\s+/g, " ").trim(),
  );

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
