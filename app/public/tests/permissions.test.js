/**
 * Users-tab permission tests.
 *
 * Run with:  node tests/permissions.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Policy under test:
 *   مدیر سایت / مدیر سیستم  ->  full access
 *   ادمین                    ->  sees id, name, email; phone masked;
 *                                edit button disabled
 *
 * The masked phone must never reach the DOM - checking only the visible text
 * would pass even if the real digits sat in a title attribute.
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
    ? (p++, console.log("  \u2713 " + n))
    : (f++, console.log("  \u2717 " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

const SEED_USERS = [
  {
    id: 1,
    name: "سام به‌نام",
    email: "sam@test.com",
    phone: "09121112233",
    role: "کاربر عادی",
    status: "فعال",
  },
  {
    id: 2,
    name: "مریم حسینی",
    email: "maryam@test.com",
    phone: "09354445566",
    role: "کاربر عادی",
    status: "فعال",
  },
];

function boot(role) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 9, name: "اپراتور", role },
    }),
    irHesabdarUsers: JSON.stringify(SEED_USERS),
  };
  Object.defineProperty(window, "localStorage", {
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
  window.appApi = {
    auth: { logout: async () => {} },
    admin: {
      users: {
        list: async () => SEED_USERS,
        updateStatus: async () => ({}),
        remove: async () => ({}),
      },
      products: {
        list: async () => [],
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
      },
      orders: {
        list: async () => [],
        create: async () => ({}),
        updateStatus: async () => ({}),
      },
      messages: {
        list: async () => [],
        reply: async () => ({}),
        markRead: async () => ({}),
      },
      settings: { get: async () => ({}), save: async () => ({}) },
    },
  };
  const ORDER = adminScripts();
  const bundle = ORDER.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  ).join("\n;\n");
  // The app logs its data inventory on boot; silence it so test output stays readable.
  const quiet = { log() {}, warn() {}, error: console.error };
  Object.defineProperty(window, "console", {
    value: quiet,
    configurable: true,
  });
  try {
    window.eval(bundle);
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 110));
  }
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  window.renderUsersTable();
  return window;
}

// ---------------------------------------------------------------- manager
section("مدیر سایت - full access");
let w = boot("مدیر سایت");
let rows = [...w.document.querySelectorAll("#usersManageTable tbody tr")];
t("rows rendered", rows.length === 2, String(rows.length));
let html = w.document.getElementById("usersManageTable").innerHTML;
t(
  "real phone visible",
  html.includes("۰۹۱۲۱۱۱۲۲۳۳") || html.includes("09121112233"),
);
t(
  "edit button enabled",
  !!w.document.querySelector("#usersManageTable button:not([disabled])"),
);
t("no lock icon", !html.includes("fa-lock"));
t("no permission banner", !w.document.getElementById("usersPermissionNotice"));

section("مدیر سیستم - also full access");
w = boot("مدیر سیستم");
w.renderUsersTable();
html = w.document.getElementById("usersManageTable").innerHTML;
t(
  "treated as manager",
  html.includes("۰۹۱۲۱۱۱۲۲۳۳") || html.includes("09121112233"),
);

// ---------------------------------------------------------------- restricted
section("ادمین - restricted");
w = boot("ادمین");
w.renderUsersTable();
const table = w.document.getElementById("usersManageTable");
html = table.innerHTML;
rows = [...table.querySelectorAll("tbody tr")];

t("still sees the rows", rows.length === 2, String(rows.length));
t("sees id column", html.includes("#۱"));
t("sees name", html.includes("سام به‌نام"));
t("sees email", html.includes("sam@test.com"));

section("phone is genuinely hidden, not just styled");
t("full phone absent from DOM (fa digits)", !html.includes("۰۹۱۲۱۱۱۲۲۳۳"));
t("full phone absent from DOM (latin)", !html.includes("09121112233"));
t(
  "second user's phone also absent",
  !html.includes("09354445566") && !html.includes("۰۹۳۵۴۴۴۵۵۶۶"),
);
t("mask characters present", html.includes("•"));
t("prefix still shown", html.includes("۰۹۱۲"));
t("restricted cell class applied", html.includes("user-cell--restricted"));

section("edit is blocked");
const enabled = table.querySelectorAll("tbody button:not([disabled])");
t("no enabled edit buttons", enabled.length === 0, String(enabled.length));
t("lock icon shown", html.includes("fa-lock"));
t("onclick not wired", !html.includes('onclick="editUser'));

section("calling editUser directly is refused");
let toasted = null;
w.showToast = (msg, type) => {
  toasted = { msg, type };
};
w.editUser(1);
t(
  "no modal opened",
  !w.document.getElementById("editUserModal").classList.contains("active"),
);
t(
  "error toast shown",
  toasted && toasted.type === "error",
  JSON.stringify(toasted),
);

section("search cannot be used to probe phone numbers");
const input = w.document.getElementById("userTableSearch");
input.value = "09121112233";
w.renderUsersTable();
const afterSearch = [
  ...w.document.querySelectorAll("#usersManageTable tbody tr"),
];
const isEmptyState =
  afterSearch.length === 1 && afterSearch[0].textContent.includes("وجود ندارد");
t("phone search returns nothing", isEmptyState, `${afterSearch.length} rows`);

input.value = "سام";
w.renderUsersTable();
t(
  "name search still works",
  w.document
    .getElementById("usersManageTable")
    .innerHTML.includes("سام به‌نام"),
);

section("operator is told why");
input.value = "";
w.renderUsersTable();
const notice = w.document.getElementById("usersPermissionNotice");
t("permission banner shown", !!notice);
t(
  "banner explains the restriction",
  notice && notice.textContent.includes("مدیر سایت"),
);

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
