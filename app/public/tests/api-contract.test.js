/**
 * API contract — what the backend developer has to implement.
 *
 * Run with:  node tests/api-contract.test.js
 *
 * This is the handover check. It asserts that:
 *   - every feature has a real route (nothing lives only in localStorage)
 *   - switching to a real server changes nothing but APP_CONFIG
 *   - requests carry the auth token, method and JSON body a server expects
 *   - errors surface as ApiError with a usable status code
 *
 * Gaps this exists to prevent coming back: entitlements, notifications, the
 * staff audit trail and site content items had no route at all, so they
 * would have stayed in the browser after the backend went live.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

function mockApi(seed) {
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

/** Load api.js pointed at a fake server and capture the requests it makes. */
function realApi() {
  const store = {};
  const sent = [];
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  global.window = {
    APP_CONFIG: { apiMode: "real", apiBaseUrl: "https://api.example.com" },
  };
  global.Headers = class {
    constructor(init) {
      this.m = new Map(Object.entries(init || {}));
    }
    set(k, v) {
      this.m.set(k, v);
    }
    get(k) {
      return this.m.get(k) || null;
    }
  };
  global.AbortController = class {
    constructor() {
      this.signal = {};
    }
    abort() {}
  };
  global.fetch = async (url, opts) => {
    sent.push({
      url,
      method: opts.method || "GET",
      auth: opts.headers.get("Authorization"),
      contentType: opts.headers.get("Content-Type"),
      body: opts.body ? JSON.parse(opts.body) : null,
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    };
  };
  delete require.cache[require.resolve("../scripts/api.js")];
  return { appApi: require("../scripts/api.js").appApi, sent, store };
}

(async () => {
  /* -------------------------------------------------- every method routes */
  section("هر متد appApi به یک مسیر واقعی می‌رسد");
  {
    const { appApi } = mockApi();
    const calls = [
      ["content.get", () => appApi.content.get("x")],
      ["admin.products.list", () => appApi.admin.products.list()],
      ["admin.orders.list", () => appApi.admin.orders.list()],
      ["admin.users.list", () => appApi.admin.users.list()],
      ["admin.messages.list", () => appApi.admin.messages.list()],
      ["admin.reports.list", () => appApi.admin.reports.list()],
      ["admin.settings.get", () => appApi.admin.settings.get()],
      ["admin.notifications.list", () => appApi.admin.notifications.list()],
      ["admin.audit.list", () => appApi.admin.audit.list(1)],
      ["admin.contentItems.list", () => appApi.admin.contentItems.list()],
      [
        "commerce.validateCoupon",
        () => appApi.commerce.validateCoupon({ code: "DISCOUNT10" }),
      ],
      [
        "newsletter.subscribe",
        () => appApi.newsletter.subscribe({ email: "n@t.com" }),
      ],
    ];
    for (const [name, fn] of calls) {
      let ok = true;
      try {
        await fn();
      } catch (e) {
        ok = e.status !== 404 && !/route|not found/i.test(e.message);
      }
      t(name, ok);
    }
  }

  /* ------------------------------------------------------- entitlements */
  section("مجوز دانلود از سفارش‌های پرداخت‌شده ساخته می‌شود");
  {
    const { appApi } = mockApi();
    await appApi.auth.register({
      name: "ز",
      email: "z@t.com",
      password: "12345678",
    });
    await appApi.commerce.createPayment({
      amount: 490000,
      buyer: { name: "ز", email: "z@t.com" },
      items: [{ id: "acc-101", name: "دوره", price: 490000, qty: 1 }],
    });
    try {
      await appApi.commerce.createPayment({
        amount: 1000,
        buyer: { name: "ز", email: "z@t.com" },
        items: [{ id: "acc-999", name: "ناموفق", price: 1000 }],
        forceStatus: "failed",
      });
    } catch (e) {
      /* expected */
    }

    const owned = await appApi.commerce.entitlements();
    t(
      "محصول خریداری‌شده مجاز است",
      owned.includes("acc-101"),
      JSON.stringify(owned),
    );
    t("محصول پرداخت‌نشده مجاز نیست", !owned.includes("acc-999"));

    await appApi.auth.logout();
    await appApi.auth.register({
      name: "غریبه",
      email: "x@t.com",
      password: "12345678",
    });
    t(
      "کاربر دیگر دسترسی ندارد",
      (await appApi.commerce.entitlements()).length === 0,
    );
  }

  /* ------------------------------------------------------ real transport */
  section("در حالت اتصال به سرور واقعی");
  {
    const { appApi, sent, store } = realApi();
    store.hesabyarSession = JSON.stringify({
      token: "TKN",
      user: { id: "u1", email: "a@b.c" },
    });

    await appApi.admin.products.list();
    await appApi.admin.products.create({ id: "p1", name: "n", price: 1 });
    await appApi.admin.messages.remove("m1");
    await appApi.admin.reports.setStatus("RPT-1", "reviewed");

    t(
      "درخواست‌ها به baseUrl می‌روند",
      sent.every((r) => r.url.startsWith("https://api.example.com/")),
      sent[0] && sent[0].url,
    );
    t(
      "توکن در هدر Authorization می‌رود",
      sent.every((r) => r.auth === "Bearer TKN"),
    );
    t("GET برای خواندن", sent[0].method === "GET");
    t("POST برای ساختن", sent[1].method === "POST");
    t("DELETE برای حذف", sent[2].method === "DELETE");
    t("PATCH برای تغییر وضعیت", sent[3].method === "PATCH");
    t(
      "بدنه JSON با content-type درست",
      sent[1].contentType === "application/json" && sent[1].body.id === "p1",
    );
    t(
      "شناسه در مسیر encode می‌شود",
      sent[2].url.endsWith("/admin/messages/m1"),
      sent[2].url,
    );
    t(
      "هیچ درخواستی به localStorage برنمی‌گردد",
      sent.length === 4,
      String(sent.length),
    );
  }

  section("خطای سرور به ApiError تبدیل می‌شود");
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
    global.window = {
      APP_CONFIG: { apiMode: "real", apiBaseUrl: "https://api.example.com" },
    };
    global.Headers = class {
      constructor() {
        this.m = new Map();
      }
      set() {}
      get() {
        return null;
      }
    };
    global.AbortController = class {
      constructor() {
        this.signal = {};
      }
      abort() {}
    };
    global.fetch = async () => ({
      ok: false,
      status: 422,
      headers: { get: () => "application/json" },
      json: async () => ({ message: "ایمیل تکراری است." }),
    });
    delete require.cache[require.resolve("../scripts/api.js")];
    const { appApi } = require("../scripts/api.js");
    try {
      await appApi.admin.products.list();
      t("پاسخ خطا throw می‌شود", false, "خطا نداد");
    } catch (e) {
      t("پاسخ خطا throw می‌شود", true);
      t("کد وضعیت حفظ می‌شود", e.status === 422, String(e.status));
      t(
        "پیام سرور به کاربر می‌رسد",
        e.message === "ایمیل تکراری است.",
        e.message,
      );
    }

    global.fetch = async () => {
      const err = new Error("boom");
      err.name = "AbortError";
      throw err;
    };
    delete require.cache[require.resolve("../scripts/api.js")];
    const again = require("../scripts/api.js").appApi;
    try {
      await again.admin.products.list();
      t("تایم‌اوت throw می‌شود", false);
    } catch (e) {
      t("تایم‌اوت کد ۴۰۸ می‌دهد", e.status === 408, String(e.status));
    }
  }

  /* -------------------------------------------------------- idempotency */
  section("نوشتن تکراری رکورد تکراری نمی‌سازد");
  {
    const { appApi, store } = mockApi();
    await appApi.admin.notifications.create({
      id: 7,
      title: "یک",
      type: "purchase",
    });
    await appApi.admin.notifications.create({
      id: 7,
      title: "یک",
      type: "purchase",
    });
    t(
      "اعلان با شناسه یکسان یک بار ذخیره می‌شود",
      JSON.parse(store.irHesabdarNotifications).length === 1,
      String(JSON.parse(store.irHesabdarNotifications).length),
    );

    const entry = { date: "۱۴۰۵/۰۵/۰۱", text: "تغییر نام" };
    await appApi.admin.audit.record(3, entry);
    await appApi.admin.audit.record(3, entry);
    t(
      "سابقه تغییر تکراری ثبت نمی‌شود",
      (await appApi.admin.audit.list(3)).length === 1,
      String((await appApi.admin.audit.list(3)).length),
    );
  }

  /* ------------------------------------------------------ config surface */
  section("پیکربندی اتصال");
  {
    const src = fs.readFileSync(path.join(ROOT, "scripts/api.js"), "utf8");
    t("حالت از window.APP_CONFIG خوانده می‌شود", src.includes("APP_CONFIG"));
    t("آدرس سرور قابل تنظیم است", src.includes("apiBaseUrl"));
    t("مهلت پاسخ قابل تنظیم است", src.includes("timeout"));
    t(
      "پیش‌فرض روی mock است تا بدون سرور کار کند",
      /mode:\s*[^,]*apiMode[^,]*\|\|\s*"mock"/.test(src) ||
        src.includes('"mock"'),
    );
    t("یادداشت‌های بک‌اند در کد هست", src.includes("BACKEND NOTE"));
  }

  section("هیچ ویژگی‌ای بدون مسیر نمانده");
  {
    const src = fs.readFileSync(path.join(ROOT, "scripts/api.js"), "utf8");
    // Each of these was browser-only before and had no route to hand over.
    [
      ["مجوز دانلود", "/commerce/entitlements"],
      ["اعلان‌ها", "notifications"],
      ["سابقه تغییرات", "audit"],
      ["آیتم‌های محتوا", "content-items"],
      ["گزارش تخلف", "/support/reports"],
    ].forEach(([label, marker]) => {
      t(`${label} مسیر دارد`, src.includes(marker));
    });
  }

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
