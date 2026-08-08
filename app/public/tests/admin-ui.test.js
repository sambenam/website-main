/**
 * Admin panel UI tests.
 *
 * Run with:  node tests/admin-ui.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Covers the bell dropdown (open/close, scroll lock, no page-wide veil),
 * modal stacking, and that every icon/asset the page needs actually resolves.
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

// ---------------------------------------------------------------- static checks
section("font-awesome integrity (icons render at all)");
const FA_HASHES = {
  "6.7.2":
    "sha384-nRgPTkuX86pH8yjPJUAFuASXQSSl2/bBUiNV47vSYpKFxHJhbcrGnmlYpYJMeD7a",
};
for (const file of fs
  .readdirSync(path.join(ROOT, "html"))
  .filter((x) => x.endsWith(".html"))) {
  const s = fs.readFileSync(path.join(ROOT, "html", file), "utf8");
  const ver = (s.match(/font-awesome\/([\d.]+)\//) || [])[1];
  const integrity = (s.match(/integrity="(sha384-[^"]+)"/) || [])[1];
  if (!ver) continue;
  t(
    `${file}: hash matches FA ${ver}`,
    FA_HASHES[ver] !== undefined && integrity === FA_HASHES[ver],
    integrity ? `ver=${ver}` : "no integrity",
  );
}

section("no page-wide veil behind the bell");
const notifCss = fs.readFileSync(
  path.join(ROOT, "styles/pages/admin-notifications.css"),
  "utf8",
);
t(
  "no backdrop-filter on the body overlay",
  !/notification-panel-open::before/.test(notifCss),
);
t(
  "scroll lock kept",
  /notification-panel-open\s*\{[^}]*overflow:\s*hidden/.test(notifCss),
);
t(
  "scrollbar width reserved",
  /notification-panel-open\s*\{[^}]*--scrollbar-width/.test(notifCss),
);

section("dropdown can actually become visible");
t(
  ".active overrides inline opacity",
  /\.notification-dropdown\.active\s*\{[^}]*opacity:\s*1\s*!important/.test(
    notifCss,
  ),
);
t(
  ".active restores pointer events",
  /\.notification-dropdown\.active\s*\{[^}]*pointer-events:\s*auto\s*!important/.test(
    notifCss,
  ),
);

// ---------------------------------------------------------------- live DOM
function boot() {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const store = {};
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
        list: async () => [],
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
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addListener() {}, removeListener() {} }));
  // Mirror the exact <script> order in admin.html - a wrong order silently
  // produces empty data and hides real failures.
  const ORDER = adminScripts();
  // Browsers give every classic <script> one shared global scope, but
  // window.eval() keeps top-level `const` out of `window`. Concatenating the
  // files reproduces the browser's single-scope behaviour.
  const bundle = ORDER.map((f) =>
    fs.readFileSync(path.join(ROOT, "scripts", f), "utf8"),
  ).join("\n;\n");
  try {
    window.eval(bundle);
  } catch (e) {
    console.log(`     [bundle] ${e.message.slice(0, 120)}`);
  }
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return window;
}

section("bell dropdown behaviour");
const w = boot();
const doc = w.document;
const bell = doc.getElementById("notificationBtn");
const drop = doc.getElementById("notificationDropdown");

t("bell exists", !!bell);
t("dropdown exists", !!drop);
t("starts closed", drop && !drop.classList.contains("active"));
t(
  "body not locked initially",
  !doc.body.classList.contains("notification-panel-open"),
);

bell.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t("opens on click", drop.classList.contains("active"));
t("body scroll locked", doc.body.classList.contains("notification-panel-open"));
t(
  "scrollbar width variable set",
  doc.documentElement.style.getPropertyValue("--scrollbar-width") !== "",
);

bell.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t("closes on second click", !drop.classList.contains("active"));
t(
  "scroll lock released",
  !doc.body.classList.contains("notification-panel-open"),
);

bell.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
doc.dispatchEvent(
  new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
);
t("Escape closes it", !drop.classList.contains("active"));
t(
  "Escape releases scroll lock",
  !doc.body.classList.contains("notification-panel-open"),
);

bell.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
doc.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
t("outside click closes it", !drop.classList.contains("active"));

section("modals");
t("openModal exists", typeof w.openModal === "function");
if (typeof w.openModal === "function") {
  w.openModal("addUserModal");
  t(
    "modal opens",
    doc.getElementById("addUserModal").classList.contains("active"),
  );
  t("body locked", doc.body.classList.contains("modal-open"));
  w.openModal("editStaffModal");
  w.closeModal("editStaffModal");
  t(
    "stacked modal closes without releasing lock",
    doc.body.classList.contains("modal-open"),
  );
  w.closeModal("addUserModal");
  t("last modal releases lock", !doc.body.classList.contains("modal-open"));
  w.openModal("doesNotExist");
  t("unknown modal id does not throw", true);
}

section("sidebar navigation");
const views = [...doc.querySelectorAll("[data-view]")].map((li) =>
  li.getAttribute("data-view"),
);
t(`${views.length} sidebar items`, views.length === 9);
let missing = views.filter((v) => !doc.getElementById("view-" + v));
t("every sidebar item has a view", missing.length === 0, missing.join(","));

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
