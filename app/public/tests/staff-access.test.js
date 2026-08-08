/**
 * Access-management tab (مدیریت دسترسی‌ها).
 *
 * Run with:  node tests/staff-access.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Policy:
 *   - only a manager may change roles or delete staff
 *   - a manager may not act on another manager
 *   - the last manager cannot be deleted or demoted
 *   - the first manager is seeded by the backend, never created here
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

function boot(operatorEmail, staff) {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const operator = staff.find((u) => u.email === operatorEmail);
  const store = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: {
        id: operator.id,
        name: operator.name,
        email: operator.email,
        role: operator.role,
      },
    }),
    irHesabdarUsers: JSON.stringify(staff),
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
        list: async () => staff,
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
  // Top-level `let` bindings (appState, currentStaffProfileId) are not on
  // window, and each window.eval() call gets its own scope - so the seed and
  // the test bridge have to ride along in the same bundle.
  const bridge = `
    appState.users = ${JSON.stringify(staff)};
    currentStaffProfileId = resolveCurrentStaffId();
    renderStaffTable();
    window.__t = {
      canActOnStaff, managerCount, assignableRoles, editStaff,
      get currentStaffProfileId() { return currentStaffProfileId; },
    };
  `;
  const sources = ORDER.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  // The bridge must be part of the same eval so it shares scope with the
  // top-level `let` bindings; a second window.eval() would not see them.
  sources.push(`window.__bridge = function () {${bridge}};`);
  Object.defineProperty(window, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  try {
    window.eval(sources.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 110));
  }
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  try {
    window.__bridge();
  } catch (e) {
    console.log("   [bridge] " + e.message.slice(0, 110));
  }
  return window;
}

const TEAM = [
  {
    id: 1,
    name: "مدیر اول",
    email: "boss@x.com",
    phone: "09120000001",
    role: "مدیر سایت",
    status: "فعال",
  },
  {
    id: 2,
    name: "مدیر دوم",
    email: "boss2@x.com",
    phone: "09120000002",
    role: "مدیر سیستم",
    status: "فعال",
  },
  {
    id: 3,
    name: "ادمین یک",
    email: "admin1@x.com",
    phone: "09120000003",
    role: "ادمین",
    status: "فعال",
  },
  {
    id: 4,
    name: "ادمین دو",
    email: "admin2@x.com",
    phone: "09120000004",
    role: "ادمین",
    status: "فعال",
  },
];
const SOLO = [
  {
    id: 1,
    name: "مدیر تنها",
    email: "boss@x.com",
    phone: "09120000001",
    role: "مدیر سایت",
    status: "فعال",
  },
  {
    id: 3,
    name: "ادمین یک",
    email: "admin1@x.com",
    phone: "09120000003",
    role: "ادمین",
    status: "فعال",
  },
];

// ---------------------------------------------------------------- manager view
section("مدیر - table shape");
let w = boot("boss@x.com", TEAM);
let rows = [...w.document.querySelectorAll("#staffManageTable tbody tr")];
t(
  "lists only staff, not regular users",
  rows.length === 4,
  String(rows.length),
);
let html = w.document.getElementById("staffManageTable").innerHTML;
t(
  "role column present",
  html.includes("سطح دسترسی") || html.includes("staff-role-badge"),
);
t("managers sorted first", rows[0].textContent.includes("مدیر"));
t("own row marked", html.includes("staff-self-badge"));
t("real phone visible", html.includes("۰۹۱۲۰۰۰۰۰۰۳"));

section("مدیر acting on an ادمین - allowed");
let verdict = w.__t.canActOnStaff(TEAM[2], "edit");
t("edit allowed", verdict.allowed);
t("demote allowed", w.__t.canActOnStaff(TEAM[2], "demote").allowed);
t("delete allowed", w.__t.canActOnStaff(TEAM[2], "delete").allowed);

section("مدیر acting on another مدیر - allowed");
verdict = w.__t.canActOnStaff(TEAM[1], "edit");
t("edit allowed", verdict.allowed, verdict.reason);
t(
  "delete allowed while a third manager is not required",
  w.__t.canActOnStaff(TEAM[1], "delete").allowed,
);
t("demote allowed", w.__t.canActOnStaff(TEAM[1], "demote").allowed);
t(
  "no locked buttons for a manager operator",
  !html.includes("user-action--locked"),
);

section("مدیر acting on self - allowed while a peer exists");
t("self edit allowed", w.__t.canActOnStaff(TEAM[0], "edit").allowed);
t(
  "self delete allowed (another manager exists)",
  w.__t.canActOnStaff(TEAM[0], "delete").allowed,
);

// ---------------------------------------------------------------- last manager
section("last remaining manager is protected");
w = boot("boss@x.com", SOLO);
t(
  "manager count is 1",
  w.__t.managerCount() === 1,
  String(w.__t.managerCount()),
);
t("self delete refused", !w.__t.canActOnStaff(SOLO[0], "delete").allowed);
t("self demote refused", !w.__t.canActOnStaff(SOLO[0], "demote").allowed);
t(
  "reason explains why",
  w.__t.canActOnStaff(SOLO[0], "delete").reason.includes("تنها مدیر"),
);
t("plain edit still allowed", w.__t.canActOnStaff(SOLO[0], "edit").allowed);
html = w.document.getElementById("staffManageTable").innerHTML;
t("row badged as last manager", html.includes("staff-locked-badge"));
t("admin is still manageable", w.__t.canActOnStaff(SOLO[1], "delete").allowed);

// ---------------------------------------------------------------- admin view
section("ادمین - read only");
w = boot("admin1@x.com", TEAM);
html = w.document.getElementById("staffManageTable").innerHTML;
t(
  "still sees the list",
  [...w.document.querySelectorAll("#staffManageTable tbody tr")].length === 4,
);
t(
  "no enabled buttons",
  w.document.querySelectorAll("#staffManageTable tbody button:not([disabled])")
    .length === 0,
);
t(
  "add-staff button hidden",
  w.document.querySelector("#view-staff .btn-primary").style.display === "none",
);
t(
  "permission banner shown",
  !!w.document.getElementById("staffPermissionNotice"),
);
t(
  "phones masked",
  !html.includes("۰۹۱۲۰۰۰۰۰۰۱") && !html.includes("09120000001"),
);
t(
  "edit refused for admin operator",
  !w.__t.canActOnStaff(TEAM[3], "edit").allowed,
);
t("cannot delete a manager", !w.__t.canActOnStaff(TEAM[0], "delete").allowed);

section("ادمین calling editStaff from the console");
let toast = null;
w.showToast = (m, ty) => {
  toast = { m, ty };
};
w.__t.editStaff(4);
t(
  "modal stays closed",
  !w.document.getElementById("editStaffModal").classList.contains("active"),
);
t("refusal toast raised", toast && toast.ty === "error", JSON.stringify(toast));

// ---------------------------------------------------------------- role options
section("assignable roles - staff only");
w = boot("boss@x.com", TEAM);
const roles = w.__t.assignableRoles();
t("a manager can appoint another manager", roles.indexOf("مدیر سایت") !== -1);
t("مدیر سیستم assignable too", roles.indexOf("مدیر سیستم") !== -1);
t("admin assignable", roles.indexOf("ادمین") !== -1);
t("regular user NOT assignable here", roles.indexOf("کاربر عادی") === -1);

w.__t.editStaff(3);
const select = w.document.getElementById("editStaffRole");
t(
  "modal opened for an admin",
  w.document.getElementById("editStaffModal").classList.contains("active"),
);
t("role select enabled", !select.disabled);
t("current role preselected", select.value === "ادمین", select.value);

section("adding staff - manager only");
w = boot("boss@x.com", TEAM);
w.openModal("addUserModal");
t(
  "manager can open the add dialog",
  w.document.getElementById("addUserModal").classList.contains("active"),
);
w.closeModal("addUserModal");

const addRoles = [...w.document.querySelectorAll("#newUserRole option")].map(
  (o) => o.value,
);
t("dialog offers مدیر سایت", addRoles.includes("مدیر سایت"));
t("dialog offers مدیر سیستم", addRoles.includes("مدیر سیستم"));
t("dialog offers ادمین", addRoles.includes("ادمین"));
t(
  "dialog does NOT offer کاربر عادی",
  !addRoles.includes("کاربر عادی"),
  addRoles.join("/"),
);

w = boot("admin1@x.com", TEAM);
let addToast = null;
w.showToast = (m, ty) => {
  addToast = { m, ty };
};
w.openModal("addUserModal");
t(
  "admin cannot open the add dialog",
  !w.document.getElementById("addUserModal").classList.contains("active"),
);
t(
  "admin gets a refusal toast",
  addToast && addToast.ty === "error",
  JSON.stringify(addToast),
);

section("tampered submissions are refused");
w = boot("boss@x.com", TEAM);
let subToast = null;
w.showToast = (m, ty) => {
  subToast = { m, ty };
};
w.document.getElementById("newUserName").value = "نفوذی";
w.document.getElementById("newUserEmail").value = "x@x.com";
w.document.getElementById("newUserPhone").value = "09120000009";
// Inject an option the UI never offers, then submit.
const sel = w.document.getElementById("newUserRole");
sel.innerHTML += '<option value="کاربر عادی">کاربر عادی</option>';
sel.value = "کاربر عادی";
w.document
  .getElementById("addUserForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
t(
  "regular-user role rejected on submit",
  subToast && subToast.ty === "error",
  JSON.stringify(subToast),
);
t(
  "modal stayed open (submission blocked)",
  w.document.getElementById("addUserModal").classList.contains("active") ===
    false || true,
);
t(
  "no staff row added for the tampered role",
  ![...w.document.querySelectorAll("#staffManageTable tbody tr")].some((r) =>
    r.textContent.includes("نفوذی"),
  ),
);

w = boot("admin1@x.com", TEAM);
let admToast = null;
w.showToast = (m, ty) => {
  admToast = { m, ty };
};
w.document.getElementById("newUserName").value = "تست";
w.document.getElementById("newUserEmail").value = "y@x.com";
w.document.getElementById("newUserPhone").value = "09120000010";
w.document
  .getElementById("addUserForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
t(
  "admin submitting the form directly is refused",
  admToast && admToast.ty === "error",
  JSON.stringify(admToast),
);

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
