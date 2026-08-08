/**
 * Admin panel — the single source of data
 *
 * appState is the one object every view reads from. It is seeded from
 * localStorage so the panel paints immediately, then hydrateFromApi()
 * refreshes it from appApi in the background.
 *
 * persistAdmin() is the only way a change reaches the API. It never throws
 * at the caller: a failed write shows a toast and leaves the local copy
 * alone, so a dropped connection cannot wipe what is on screen.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function toPersianDigits(value) {
  const charMap = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  // `value || ""` swallowed the number 0, because 0 is falsy - so a genuine
  // count of zero rendered as an empty string ("۰ عدد" came out as " عدد").
  // Only null and undefined should become an empty string.
  const text = value === null || value === undefined ? "" : String(value);
  return text.replace(/[0-9]/g, (match) => charMap[parseInt(match)]);
}

function loadDynamicProducts() {
  try {
    const raw = localStorage.getItem("irHesabdarProducts");
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((p) => p && p.id) : [];
    }
  } catch (e) {
    console.warn("admin: error loading products", e);
  }
  localStorage.setItem("irHesabdarProducts", JSON.stringify([]));
  return [];
}

const initialOrders = [
  {
    id: "#۷۴۸۳۲",
    customer: "سام به‌نام",
    product: "دانلود فایل PDF دوره حسابداری مقدماتی",
    amount: "۴۹,۰۰۰ تومان",
    date: "۱۴۰۵/۰۵/۰۱",
    status: "success",
  },
  {
    id: "#۵۸۳۹۲",
    customer: "مریم حسینی",
    product: "دانلود ویدیوهای آموزشی دوره حسابداری مقدماتی",
    amount: "۹۵,۰۰۰ تومان",
    date: "۱۴۰۵/۰۴/۳۰",
    status: "success",
  },
  {
    id: "#۴۸۲۹۱",
    customer: "علی رضایی",
    product: "پکیج آموزش ثبت سند حسابداری از صفر تا صد",
    amount: "۲۹,۰۰۰ تومان",
    date: "۱۴۰۵/۰۴/۲۹",
    status: "success",
  },
];

function loadDynamicOrders() {
  try {
    const raw = localStorage.getItem("irHesabdarOrders");
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : initialOrders;
    }
  } catch (e) {
    console.warn("admin: error loading orders", e);
  }
  localStorage.setItem("irHesabdarOrders", JSON.stringify(initialOrders));
  return initialOrders;
}

const initialUsers = [
  {
    id: 1,
    name: "سام به‌نام",
    email: "sam@example.com",
    phone: "09121111111",
    role: "مدیر سایت",
    status: "فعال",
  },
  {
    id: 2,
    name: "محمد رضایی",
    email: "mohammad@example.com",
    phone: "09122222222",
    role: "ادمین",
    status: "فعال",
  },
  {
    id: 3,
    name: "علی احمدی",
    email: "ali@example.com",
    phone: "09121234567",
    role: "کاربر عادی",
    status: "فعال",
  },
  {
    id: 4,
    name: "سارا محمدی",
    email: "sara@example.com",
    phone: "09129876543",
    role: "کاربر عادی",
    status: "فعال",
  },
  {
    id: 5,
    name: "زهرا کریمی",
    email: "zahra@example.com",
    phone: "09123456789",
    role: "کاربر عادی",
    status: "غیرفعال",
  },
];

function normalizeUserContact(user) {
  const copy = Object.assign({}, user);
  const isEmptyValue = function (value) {
    return !value || String(value).trim() === "—";
  };
  if (isEmptyValue(copy.email) || isEmptyValue(copy.phone)) {
    const parts = String(copy.contact || "")
      .split(/\s*\/\s*/)
      .filter(Boolean);
    if (isEmptyValue(copy.email))
      copy.email =
        parts.find(function (value) {
          return value.includes("@");
        }) || "—";
    if (isEmptyValue(copy.phone))
      copy.phone =
        parts.find(function (value) {
          return !value.includes("@");
        }) || "09121234567";
  }
  return copy;
}

function loadDynamicUsers() {
  try {
    const raw = localStorage.getItem("irHesabdarUsers");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(normalizeUserContact);
      }
    }
  } catch (e) {
    console.warn("admin: error loading users", e);
  }
  localStorage.setItem("irHesabdarUsers", JSON.stringify(initialUsers));
  return initialUsers;
}

/**
 * Verify the admin's current password.
 *
 * BACKEND NOTE: replace the body of this function with
 *   return appApi.admin.auth.verifyPassword({ password: input });
 * The rest of the panel only calls verifyAdminPassword(), so no other file
 * needs to change when real authentication lands.
 *
 * Until then the credential lives in localStorage and is *never* rendered
 * back into the DOM. A first-run password is generated instead of shipping a
 * hardcoded default in source control.
 */
/** Has a panel password been set on this device yet? */

function loadSystemSettings() {
  const defaultSettings = {
    supportEmail: "support@irhesabdar.ir",
    supportPhone: "۰۹۱۲۳۴۵۶۷۸۹",
    maintenanceMode: false,
    merchantId: "e482da20-9bf3-482a-89a1-893f2dae89cf",
    currencyUnit: "toman",
    adminName: "مدیر کل سایت",
    adminAvatar: "../images/ravin.png",
  };

  try {
    const raw = localStorage.getItem("irHesabdarSystemSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : defaultSettings;
    }
  } catch (e) {
    console.warn("admin: error loading settings", e);
  }
  localStorage.setItem(
    "irHesabdarSystemSettings",
    JSON.stringify(defaultSettings),
  );
  return defaultSettings;
}

/* ============================================================================
   PERMISSIONS
   ----------------------------------------------------------------------------
   Two tiers inside the panel:

     manager  (مدیر سایت / مدیر سیستم)  full access
     admin    (ادمین)                    read-only on the users tab, no
                                         settings changes, no staff editing

   The role comes from the login session, so whoever signs in decides what the
   panel exposes.

   BACKEND NOTE: this only shapes the UI. A determined user can edit these
   values in devtools, so the server must apply the same policy - masked
   fields should not even be sent to an "ادمین" account, and write endpoints
   must reject them.
   ========================================================================== */

/* ----------------------------------------------------------------------------
   Development helpers
   Exposed on window so you can flip roles from the browser console while
   ADMIN_AUTH_ENABLED is false:

     adminDev.whoami()        show the current role
     adminDev.asManager()     become مدیر سایت (full access)
     adminDev.asAdmin()       become ادمین (restricted) to check the locks
     adminDev.reset()         clear the session and start over

   BACKEND NOTE: delete this block before the site goes public. It only works
   because there is no server deciding roles yet.
   -------------------------------------------------------------------------- */

const initialMessages = [
  {
    id: 1,
    sender: "علی احمدی",
    email: "ali@example.com",
    text: "سلام، وقت بخیر. آیا دوره حسابداری مقدماتی شامل پشتیبانی تلگرامی هم هست؟",
    time: "۱۴۰۵/۰۵/۰۲ - ۱۰:۳۰",
    unread: true,
    history: [
      {
        sender: "user",
        name: "علی احمدی",
        text: "سلام، وقت بخیر. آیا دوره حسابداری مقدماتی شامل پشتیبانی تلگرامی هم هست؟",
        time: "۱۴۰۵/۰۵/۰۲ - ۱۰:۳۰",
      },
    ],
  },
  {
    id: 2,
    sender: "سارا محمدی",
    email: "sara@example.com",
    text: "درود بر شما. فایل اکسل محاسبه حقوق و دستمزد را خریدم ولی دانلود نشد. لطفا راهنمایی کنید.",
    time: "۱۴۰۵/۰۵/۰۱ - ۱۶:۴۵",
    unread: true,
    history: [
      {
        sender: "user",
        name: "سارا محمدی",
        text: "درود بر شما. فایل اکسل محاسبه حقوق و دستمزد را خریدم ولی دانلود نشد. لطفا راهنمایی کنید.",
        time: "۱۴۰۵/۰۵/۰۱ - ۱۶:۴۵",
      },
    ],
  },
  {
    id: 3,
    sender: "محمد رضایی",
    email: "mohammad@example.com",
    text: "سلام. خسته نباشید. آزمون استخدامی بعدی وزارت اقتصاد چه زمانی برگزار می‌شود؟",
    time: "۱۴۰۵/۰۴/۳۰ - ۱۴:۱۵",
    unread: false,
    history: [
      {
        sender: "user",
        name: "محمد رضایی",
        text: "سلام. خسته نباشید. آزمون استخدامی بعدی وزارت اقتصاد چه زمانی برگزار می‌شود؟",
        time: "۱۴۰۵/۰۴/۳۰ - ۱۴:۱۵",
      },
      {
        sender: "admin",
        name: "مدیر کل سایت",
        text: "سلام دوست عزیز، هنوز بخشنامه جدیدی صادر نشده است. به محض اعلام اخبار، در تب آزمون‌ها قرار می‌گیرد.",
        time: "۱۴۰۵/۰۴/۳۰ - ۱۵:۰۰",
      },
    ],
  },
  {
    id: 4,
    sender: "زهرا کریمی",
    email: "zahra@example.com",
    text: "سلام. چطور می‌توانم فاکتور خرید دوره مالیاتی را دریافت کنم؟",
    time: "۱۴۰۵/۰۵/۰۳ - ۰۹:۰۰",
    unread: true,
    history: [
      {
        sender: "user",
        name: "زهرا کریمی",
        text: "سلام. چطور می‌توانم فاکتور خرید دوره مالیاتی را دریافت کنم؟",
        time: "۱۴۰۵/۰۵/۰۳ - ۰۹:۰۰",
      },
    ],
  },
  {
    id: 5,
    sender: "پشتیبان تستی",
    email: "test-support@example.com",
    text: "این یک پیام آزمایشی خوانده‌نشده و بی‌پاسخ است تا بتوانید تپش قلب و انتقال‌ها را به راحتی تست کنید.",
    time: "۱۴۰۵/۰۵/۰۳ - ۱۲:۰۰",
    unread: true,
    history: [
      {
        sender: "user",
        name: "پشتیبان تستی",
        text: "این یک پیام آزمایشی خوانده‌نشده و بی‌پاسخ است تا بتوانید تپش قلب و انتقال‌ها را به راحتی تست کنید.",
        time: "۱۴۰۵/۰۵/۰۳ - ۱۲:۰۰",
      },
    ],
  },
];

function loadDynamicMessages() {
  try {
    const raw = localStorage.getItem("irHesabdarMessages");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clean up legacy localstorage data by converting it or filtering
      if (Array.isArray(parsed)) {
        return parsed.map(function (msg) {
          if (msg && !Array.isArray(msg.history)) {
            // Convert old legacy messages to new history bubble format!
            msg.history = [
              {
                sender: "user",
                name: msg.sender,
                text: msg.text,
                time: msg.time,
              },
            ];
            if (msg.reply) {
              msg.history.push({
                sender: "admin",
                name: msg.repliedBy || "مدیر کل سایت",
                text: msg.reply,
                time: msg.replyTime || msg.time,
              });
            }
          }
          return msg;
        });
      }
    }
  } catch (e) {
    console.warn("admin: error loading messages", e);
  }
  localStorage.setItem("irHesabdarMessages", JSON.stringify(initialMessages));
  return initialMessages;
}

/* ----------------------------------------------------------------------------
   READ SIDE OF appState

   These four live here rather than with the tab that uses them because
   appState calls them the instant this file is parsed. Put them in a later
   file and the browser throws:

       ReferenceError: loadAdminNotifications is not defined

   The notification key and the staff-id resolver are the only two pieces of
   other tabs' code that have to run this early.
   -------------------------------------------------------------------------- */

const NOTIFICATIONS_KEY = "irHesabdarNotifications";

function loadAdminNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("admin: error loading notifications", e);
  }
  return [];
}

function persistAdminNotifications() {
  try {
    // Keep the list from growing without bound; the newest 200 is plenty.
    const trimmed = (appState.notifications || []).slice(0, 200);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("admin: error saving notifications", e);
  }
}

/**
 * Which staff record belongs to the signed-in operator.
 *
 * Resolved from the session by email, because ids differ between the auth
 * store and the panel's staff list. Falls back to the first manager so the
 * panel still works while auth is disabled in development.
 */
function resolveCurrentStaffId() {
  let email = "";
  try {
    const raw = localStorage.getItem("hesabyarSession");
    const session = raw ? JSON.parse(raw) : null;
    email = String(
      (session && session.user && session.user.email) || "",
    ).toLowerCase();
  } catch (error) {
    email = "";
  }

  const pool = (typeof appState !== "undefined" && appState.users) || [];
  if (email) {
    const match = pool.find(
      (u) => String(u.email || "").toLowerCase() === email,
    );
    if (match) return match.id;
  }
  const firstManager = pool.find((u) => MANAGER_ROLES.indexOf(u.role) !== -1);
  return firstManager ? firstManager.id : 1;
}

// Seeded to 1, then resolved from the session as soon as appState exists
// (see just below the appState declaration). It cannot be resolved here:
// resolveCurrentStaffId() reads appState, which is declared further down.
let currentStaffProfileId = 1;

let appState = {
  users: loadDynamicUsers(),
  products: loadDynamicProducts(),
  orders: loadDynamicOrders(),
  notifications: loadAdminNotifications(),
  messages: loadDynamicMessages(),
};

// Work out who is signed in now that the user list exists. This used to wait
// for hydrateFromApi(), so until that async call resolved an admin counted as
// the first manager in the list - and anything reading the role in that
// window, notification visibility included, got the wrong answer.
currentStaffProfileId = resolveCurrentStaffId();

/* ============================================================================
   API HYDRATION LAYER
   ----------------------------------------------------------------------------
   appState is seeded synchronously above (from localStorage) so the panel can
   paint immediately. hydrateFromApi() then pulls the authoritative data
   through appApi and re-renders.

   Why this matters for the backend: appApi.admin.* is the ONLY place that
   knows where data comes from. Today it reads localStorage; once
   APP_API_CONFIG.mode is "real" it hits the server. Nothing in this file
   changes.

   It also merges data the public site produced - contact-form messages and
   real signups - which the panel previously never saw.
   ========================================================================== */
async function hydrateFromApi() {
  if (typeof appApi === "undefined" || !appApi.admin) return;

  const tasks = [
    ["users", appApi.admin.users.list()],
    ["products", appApi.admin.products.list()],
    ["orders", appApi.admin.orders.list()],
    ["messages", appApi.admin.messages.list()],
    // Both were browser-only before, so the panel never showed what another
    // operator had already seen or dismissed.
    ["notifications", appApi.admin.notifications.list()],
  ];

  const results = await Promise.allSettled(tasks.map(([, p]) => p));

  results.forEach((result, index) => {
    const key = tasks[index][0];
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      if (key === "notifications") {
        // Merge rather than replace. Events can be raised while this request
        // is still in flight - a signup or an order arriving on another tab -
        // and a plain assignment threw those away before anyone saw them.
        const incoming = result.value;
        const known = new Set(incoming.map((n) => String(n.id)));
        const local = (appState.notifications || []).filter(
          (n) => !known.has(String(n.id)),
        );
        appState.notifications = local.concat(incoming);
      } else {
        appState[key] = result.value;
      }
    } else if (result.status === "rejected") {
      console.warn("admin: hydration failed for " + key, result.reason);
    }
  });

  // The staff list is now real, so the signed-in operator can be matched.
  currentStaffProfileId = resolveCurrentStaffId();

  // Announce anything that happened while the panel was closed. Runs after
  // hydration so it works from the authoritative lists, not the stale seed.
  if (typeof reconcileNotifications === "function") reconcileNotifications();

  refreshAllViews();
}

/**
 * Fire-and-report helper for admin writes.
 *
 * The panel updates appState optimistically so the UI stays snappy; this
 * pushes the same change through appApi and surfaces failures. Once a real
 * backend is attached, a rejected promise here means the server refused the
 * write - that is the single place to add rollback if you want it.
 */
function persistAdmin(promise, label) {
  if (!promise || typeof promise.catch !== "function") return promise;
  return promise.catch((error) => {
    console.warn("admin: " + label + " failed to persist", error);
    if (typeof showToast === "function") {
      const detail = error && error.message ? error.message : "خطای ناشناخته";
      showToast(label + " در سرور ذخیره نشد: " + detail, "error");
    }
  });
}

/** Re-render whatever is currently on screen after data changes. */
function refreshAllViews() {
  const safe = (fn) => {
    try {
      if (typeof fn === "function") fn();
    } catch (error) {
      console.warn("admin: refresh step failed", error);
    }
  };
  safe(typeof renderUsersTable === "function" ? renderUsersTable : null);
  safe(typeof renderStaffTable === "function" ? renderStaffTable : null);
  safe(typeof renderProductsTable === "function" ? renderProductsTable : null);
  safe(typeof renderOrdersTable === "function" ? renderOrdersTable : null);
  safe(typeof renderMessages === "function" ? renderMessages : null);
  safe(
    typeof renderDashboardOrders === "function" ? renderDashboardOrders : null,
  );
  safe(
    typeof renderDashboardProducts === "function"
      ? renderDashboardProducts
      : null,
  );
  safe(
    typeof updateDashboardMetrics === "function"
      ? updateDashboardMetrics
      : null,
  );
  safe(
    typeof updateMessagesBadgeCount === "function"
      ? updateMessagesBadgeCount
      : null,
  );
}
