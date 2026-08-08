/**
 * Header menu tests - what a visitor sees depending on who is signed in.
 *
 * Run with:  node tests/header-menu.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Rules under test:
 *   signed out    ->  ورود / عضویت      (authored markup, untouched)
 *   regular user  ->  پروفایل  +  خروج
 *   staff         ->  پنل مدیریت  +  خروج
 *
 * Staff never see a profile link: an admin manages their account inside the
 * dashboard, so offering both would be two doors to the same thing.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

function run(sessionObj, pageFile) {
  const html = fs.readFileSync("/home/user/project/html/" + pageFile, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/" + pageFile,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const store = {};
  if (sessionObj) store["hesabyarSession"] = JSON.stringify(sessionObj);
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
    admin: { settings: { get: async () => ({}) } },
  };
  const src = fs.readFileSync(
    "/home/user/project/scripts/app-shell.js",
    "utf8",
  );
  window.eval(src);
  // the IIFE registers on DOMContentLoaded; jsdom already fired it
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return window.document;
}

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};

console.log("\nsigned OUT on index.html");
let doc = run(null, "index.html");
let slot = doc.querySelector(".right-menu_items.signin");
t(
  "original login link untouched",
  slot.textContent.includes("ورود / عضویت"),
  slot.textContent.trim(),
);
t("no logout button", !doc.querySelector("[data-logout]"));

console.log("\nREGULAR USER on index.html");
doc = run(
  { token: "t", user: { name: "سام", role: "کاربر عادی" } },
  "index.html",
);
slot = doc.querySelector(".right-menu_items.signin");
t(
  "shows پروفایل",
  slot.textContent.includes("پروفایل"),
  slot.textContent.trim(),
);
t(
  "links to user-profile.html",
  slot.querySelector("a").getAttribute("href") === "user-profile.html",
);
t("does NOT show پنل مدیریت", !slot.textContent.includes("پنل مدیریت"));
t("has logout", !!slot.querySelector("[data-logout]"));
t(
  "exactly 2 links",
  slot.querySelectorAll("a").length === 2,
  String(slot.querySelectorAll("a").length),
);

console.log("\nSTAFF on index.html");
doc = run(
  { token: "t", isAdmin: true, user: { name: "مدیر", role: "مدیر سایت" } },
  "index.html",
);
slot = doc.querySelector(".right-menu_items.signin");
t(
  "shows پنل مدیریت",
  slot.textContent.includes("پنل مدیریت"),
  slot.textContent.trim(),
);
t(
  "links to admin.html",
  slot.querySelector("a").getAttribute("href") === "admin.html",
);
t("does NOT show پروفایل", !slot.textContent.includes("پروفایل"));
t("has logout", !!slot.querySelector("[data-logout]"));
t(
  "exactly 2 links",
  slot.querySelectorAll("a").length === 2,
  String(slot.querySelectorAll("a").length),
);

console.log("\nmobile menu (regular user)");
doc = run(
  { token: "t", user: { name: "سام", role: "کاربر عادی" } },
  "index.html",
);
const mob = doc.querySelectorAll(".mobile-dropdown-btn");
const mobTexts = Array.from(mob).map((a) => a.textContent.trim());
t(
  "mobile shows پروفایل",
  mobTexts.some((x) => x.includes("پروفایل")),
  mobTexts
    .filter((x) => x)
    .slice(-3)
    .join(" | "),
);
t(
  "mobile shows خروج",
  mobTexts.some((x) => x.includes("خروج")),
);
t("mobile no longer shows ورود", !mobTexts.some((x) => x === "ورود"));

console.log("\nmobile menu (staff)");
doc = run({ token: "t", isAdmin: true, user: { role: "ادمین" } }, "index.html");
const mob2 = Array.from(doc.querySelectorAll(".mobile-dropdown-btn")).map((a) =>
  a.textContent.trim(),
);
t(
  "mobile shows پنل مدیریت",
  mob2.some((x) => x.includes("پنل مدیریت")),
  mob2
    .filter((x) => x)
    .slice(-3)
    .join(" | "),
);
t("mobile no پروفایل for staff", !mob2.some((x) => x.includes("پروفایل")));

console.log("\nother pages carry the same menu");
for (const page of [
  "about-us.html",
  "support.html",
  "list-page.html",
  "single-post.html",
]) {
  const d = run({ token: "t", user: { role: "کاربر عادی" } }, page);
  const s = d.querySelector(".right-menu_items.signin");
  t(page + " -> پروفایل", s && s.textContent.includes("پروفایل"));
}

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
