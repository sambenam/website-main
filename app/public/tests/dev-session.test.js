/**
 * Local-development session behaviour.
 *
 * Run with:  node tests/dev-session.test.js
 * Requires:  npm install --no-save jsdom
 *
 * While ADMIN_AUTH_ENABLED is false there is no real login, so the panel must
 * always hand the operator full manager rights - including recovering from a
 * leftover "ادمین" session left behind by earlier testing.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const ROOT = require("path").join(__dirname, "..");
const {
  adminScripts,
  pageScripts,
  readScripts,
} = require("./helpers/page-scripts.js");

function boot(seedSession) {
  const html = fs.readFileSync(ROOT + "/html/admin.html", "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const store = {};
  if (seedSession) store.hesabyarSession = JSON.stringify(seedSession);
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
        create: async () => ({}),
        updateStatus: async () => ({}),
        updateRole: async () => ({}),
        remove: async () => ({}),
      },
      products: { list: async () => [] },
      orders: { list: async () => [] },
      messages: { list: async () => [] },
      settings: { get: async () => ({}), save: async () => ({}) },
    },
  };
  const ORDER = adminScripts();
  const src = ORDER.map((f) => fs.readFileSync(ROOT + "/scripts/" + f, "utf8"));
  src.push(
    "window.__t = { get role(){return currentAdminUserRole;}, isManager };",
  );
  Object.defineProperty(window, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  let err = null;
  try {
    window.eval(src.join("\n;\n"));
  } catch (e) {
    err = e;
  }
  if (err) return { crashed: err.message };
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return { window, store };
}

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};

console.log("\nfresh browser, no session");
let r = boot(null);
t("panel loads without crashing", !r.crashed, r.crashed);
t("operator is manager", r.window.__t.isManager());
t("session written", !!r.store.hesabyarSession);
t(
  "role is the Persian name",
  JSON.parse(r.store.hesabyarSession).user.role === "مدیر سایت",
);

console.log("\nsession with no role is replaced with a manager one");
r = boot({ token: "old", isAdmin: true, user: { name: "اپراتور" } });
t("panel loads", !r.crashed, r.crashed);
t("restored to manager", r.window.__t.isManager(), r.window.__t.role);
t(
  "session rewritten",
  JSON.parse(r.store.hesabyarSession).user.role === "مدیر سایت",
);

console.log("\na deliberately restricted session is respected");
r = boot({
  token: "t",
  isAdmin: true,
  user: { name: "اپراتور", role: "ادمین" },
});
t(
  "stays restricted so the locked view can be previewed",
  !r.window.__t.isManager(),
  r.window.__t.role,
);
t(
  "adminDev.asManager is the way back",
  typeof r.window.adminDev.asManager === "function",
);

console.log("\nexisting valid manager session is respected");
r = boot({
  token: "keep-me",
  isAdmin: true,
  user: { name: "مدیر واقعی", role: "مدیر سیستم" },
});
t("still manager", r.window.__t.isManager());
t("token preserved", JSON.parse(r.store.hesabyarSession).token === "keep-me");
t(
  "name preserved",
  JSON.parse(r.store.hesabyarSession).user.name === "مدیر واقعی",
);

console.log("\nadminDev helpers available");
r = boot(null);
t("adminDev exposed", typeof r.window.adminDev === "object");
t("whoami", typeof r.window.adminDev.whoami === "function");
t("asManager", typeof r.window.adminDev.asManager === "function");
t("asAdmin", typeof r.window.adminDev.asAdmin === "function");
t("reset", typeof r.window.adminDev.reset === "function");

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
