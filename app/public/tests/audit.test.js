/**
 * Whole-project audit — regressions for bugs found by sweeping the codebase.
 *
 * Run with:  node tests/audit.test.js
 *
 * Three real defects, none of which any existing test covered:
 *
 *   1. Blocking an account only stopped the next login. Someone already
 *      signed in kept buying, messaging and editing their profile, so the
 *      moderation control was mostly decorative.
 *
 *   2. An order could be created with a negative amount. Revenue is a plain
 *      sum of paid orders, so one order of -90,000 quietly cancelled out a
 *      real 100,000 sale and every financial figure under-reported.
 *
 *   3. The last remaining manager could be deleted. The role route refused
 *      to demote them, but DELETE had no such check - so the account could
 *      just be removed instead and nobody could administer the site again.
 */
const fs = require("fs");
const path = require("path");
const { adminSource } = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

/** Fresh api.js against an isolated storage bucket. */
function freshApi(seed) {
  const store = Object.assign({}, seed || {});
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
  return { appApi: require("../scripts/api.js").appApi, store };
}

(async () => {
  /* ------------------------------------------------- 1. disabled account */
  section("۱. حساب مسدودشده با سشن باز");
  {
    const { appApi } = freshApi();
    await appApi.auth.register({
      name: "کاربر",
      email: "bad@t.com",
      password: "12345678",
    });
    const id = (await appApi.admin.users.list()).find(
      (u) => u.email === "bad@t.com",
    ).id;
    await appApi.admin.users.updateStatus(id, "بلاک شده");

    const buyer = { name: "کاربر", email: "bad@t.com" };
    const items = [{ id: "p1", name: "دوره", price: 5000 }];

    try {
      await appApi.commerce.createPayment({ amount: 5000, buyer, items });
      t("خرید با حساب مسدود رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("خرید با حساب مسدود رد می‌شود", e.status === 403, String(e.status));
    }

    try {
      await appApi.support.sendMessage({
        name: "کاربر",
        email: "bad@t.com",
        subject: "q",
        message: "hi",
      });
      t("ارسال پیام رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("ارسال پیام رد می‌شود", e.status === 403);
    }

    try {
      await appApi.support.reportAbuse({
        reporterName: "ک",
        reporterEmail: "bad@t.com",
        kind: "content",
        subject: "x",
        description: "y",
      });
      t("گزارش تخلف رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("گزارش تخلف رد می‌شود", e.status === 403);
    }

    try {
      await appApi.profile.update({ name: "نام تازه" });
      t("ویرایش پروفایل رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("ویرایش پروفایل رد می‌شود", e.status === 403);
    }

    try {
      await appApi.profile.changePassword({
        currentPassword: "12345678",
        newPassword: "newpass1",
      });
      t("تغییر رمز رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("تغییر رمز رد می‌شود", e.status === 403);
    }

    try {
      await appApi.commerce.recordCancelled({ amount: 1000, buyer, items });
      t("ثبت انصراف هم رد می‌شود", false, "انجام شد");
    } catch (e) {
      t("ثبت انصراف هم رد می‌شود", e.status === 403);
    }
  }

  section("کاربر فعال همچنان کار می‌کند");
  {
    const { appApi } = freshApi();
    await appApi.auth.register({
      name: "خوب",
      email: "good@t.com",
      password: "12345678",
    });
    const buyer = { name: "خوب", email: "good@t.com" };
    await appApi.commerce.createPayment({
      amount: 5000,
      buyer,
      items: [{ id: "p", name: "x", price: 5000 }],
    });
    t("خرید انجام می‌شود", (await appApi.commerce.myOrders()).length === 1);
    await appApi.support.sendMessage({
      name: "خوب",
      email: "good@t.com",
      subject: "q",
      message: "hi",
    });
    t("پیام ارسال می‌شود", (await appApi.support.myMessages()).length === 1);
    await appApi.profile.update({ name: "خوب تازه" });
    t("پروفایل ویرایش می‌شود", (await appApi.auth.me()).name === "خوب تازه");

    // A guest has no account to be blocked, so they must not be caught.
    await appApi.auth.logout();
    await appApi.support.sendMessage({
      name: "مهمان",
      email: "g@t.com",
      subject: "q",
      message: "hi",
    });
    t("مهمان بدون سشن مسدود نمی‌شود", true);
  }

  /* ----------------------------------------------- 2. negative amounts */
  section("۲. مبلغ منفی سفارش");
  {
    const { appApi } = freshApi();
    await appApi.auth.register({
      name: "x",
      email: "x@t.com",
      password: "12345678",
    });
    const buyer = { name: "x", email: "x@t.com" };

    await appApi.commerce.createPayment({
      amount: 100000,
      buyer,
      items: [{ id: "p1", name: "دوره", price: 100000 }],
    });
    await appApi.commerce.createPayment({
      amount: -90000,
      buyer,
      items: [{ id: "p2", name: "هک", price: -90000 }],
    });

    const orders = await appApi.admin.orders.list();
    t(
      "مبلغ منفی ذخیره نمی‌شود",
      orders.every((o) => o.amount >= 0),
      orders.map((o) => o.amount).join(","),
    );

    const revenue = orders
      .filter((o) => o.status === "success")
      .reduce((s, o) => s + o.amount, 0);
    t("درآمد دستکاری نمی‌شود", revenue === 100000, String(revenue));

    await appApi.commerce.createPayment({ amount: NaN, buyer, items: [] });
    await appApi.commerce.createPayment({ amount: "abc", buyer, items: [] });
    await appApi.commerce.createPayment({ amount: Infinity, buyer, items: [] });
    const all = await appApi.admin.orders.list();
    t(
      "مقدار NaN به صفر تبدیل می‌شود",
      all.every((o) => !isNaN(o.amount)),
    );
    t(
      "مقدار بی‌نهایت رد می‌شود",
      all.every((o) => isFinite(o.amount)),
    );
    t(
      "رشته نامعتبر صفر می‌شود",
      all.every((o) => typeof o.amount === "number"),
    );

    await appApi.commerce.recordCancelled({ amount: -500, buyer, items: [] });
    t(
      "سفارش لغوشده هم محافظت می‌شود",
      (await appApi.admin.orders.list()).every((o) => o.amount >= 0),
    );
  }

  /* -------------------------------------------------- 3. last manager */
  section("۳. حذف آخرین مدیر");
  {
    const { appApi } = freshApi({
      irHesabdarUsers: JSON.stringify([
        {
          id: 1,
          name: "تنها مدیر",
          email: "m@t.com",
          role: "مدیر سایت",
          status: "فعال",
        },
      ]),
    });
    try {
      await appApi.admin.users.remove(1);
      t("حذف آخرین مدیر رد می‌شود", false, "اجازه داده شد");
    } catch (e) {
      t("حذف آخرین مدیر رد می‌شود", e.status === 409, String(e.status));
    }
    t(
      "مدیر هنوز در لیست است",
      (await appApi.admin.users.list()).some((u) => String(u.id) === "1"),
    );
  }

  section("با بیش از یک مدیر، حذف مجاز است");
  {
    const { appApi } = freshApi({
      irHesabdarUsers: JSON.stringify([
        {
          id: 1,
          name: "مدیر یک",
          email: "m1@t.com",
          role: "مدیر سایت",
          status: "فعال",
        },
        {
          id: 2,
          name: "مدیر دو",
          email: "m2@t.com",
          role: "مدیر سایت",
          status: "فعال",
        },
        {
          id: 3,
          name: "ادمین",
          email: "a@t.com",
          role: "ادمین",
          status: "فعال",
        },
      ]),
    });
    await appApi.admin.users.remove(2);
    t(
      "مدیر دوم حذف می‌شود",
      !(await appApi.admin.users.list()).some((u) => String(u.id) === "2"),
    );
    await appApi.admin.users.remove(3);
    t(
      "ادمین حذف می‌شود",
      !(await appApi.admin.users.list()).some((u) => String(u.id) === "3"),
    );
    try {
      await appApi.admin.users.remove(1);
      t("حالا آخرین مدیر محافظت می‌شود", false, "حذف شد");
    } catch (e) {
      t("حالا آخرین مدیر محافظت می‌شود", e.status === 409);
    }
  }

  /* ------------------------------------------------ 4. static hygiene */
  section("۴. تصاویر بیرونی");
  {
    // via.placeholder.com no longer resolves at all and pravatar.cc is
    // unreliable from Iran; both rendered as broken-image icons.
    const sources = {
      "html/admin.html": fs.readFileSync(
        path.join(ROOT, "html/admin.html"),
        "utf8",
      ),
      "html/checkout.html": fs.readFileSync(
        path.join(ROOT, "html/checkout.html"),
        "utf8",
      ),
      "html/user-profile.html": fs.readFileSync(
        path.join(ROOT, "html/user-profile.html"),
        "utf8",
      ),
      "scripts/admin/*.js": adminSource(),
    };
    Object.entries(sources).forEach(([label, src]) => {
      t(
        `${label} بدون تصویر بیرونی`,
        !src.includes("via.placeholder.com") && !src.includes("pravatar.cc"),
      );
    });
  }

  section("۵. امنیت نمایش نام کاربر در پنل");
  {
    // A visitor picks their own name at signup, so it reaches admin views.
    const src = adminSource();
    t(
      "جدول سفارشات داشبورد امن است",
      src.includes('${escapeHtml(order.customer || "—")}'),
    );
    t("جدول کاربران امن است", src.includes('${escapeHtml(user.name || "—")}'));
    t(
      "لیست شناور پیام‌ها امن است",
      src.includes('${escapeHtml(msg.sender || "—")}'),
    );
    t(
      "متن پیام در لیست شناور امن است",
      src.includes('${escapeHtml(msg.text || "")}'),
    );
    t("عنوان اعلان امن است", src.includes("${escapeHtml(n.title)}"));
  }

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
