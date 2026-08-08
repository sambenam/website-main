/**
 * Read a page's <script> order straight from its HTML.
 *
 * Why this exists
 * ---------------
 * Twenty of the twenty-six test files used to carry their own hand-written
 * copy of the script list:
 *
 *     const FILES = ['api.js','app-shell.js','header-items.js', ...];
 *
 * Every one of those copies was a promise that the list still matched
 * html/admin.html. Nothing enforced the promise. Split one script into two,
 * or reorder them, and twenty files silently drifted: the bundle would still
 * evaluate, but with a missing definition the panel renders empty and the
 * assertions fail for a reason that has nothing to do with the bug being
 * tested.
 *
 * Reading the order out of the page removes the promise entirely. The page is
 * the single source of truth, exactly as it is for a real browser.
 *
 * Browser scope note
 * ------------------
 * Classic <script> tags share one global scope, but window.eval() keeps
 * top-level `const` and `let` out of `window`. Concatenating the sources and
 * evaluating them once reproduces the browser's single-scope behaviour, which
 * is why bundleSource() joins rather than evaluating file by file.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

/**
 * File names of every local script a page loads, in page order.
 *
 * Duplicates are dropped: about-us.html lists mobile-menu.js twice, and a
 * browser would run it twice, but the file guards itself with
 * `window.__hesabyarMobileMenuInitialized` so the second run is a no-op.
 * Evaluating a concatenated bundle twice is not equivalent, so once is right.
 *
 * @param {string} page      file name inside html/, e.g. "admin.html"
 * @param {object} [options]
 * @param {string[]} [options.exclude]  scripts to leave out
 * @returns {string[]}
 */
function pageScripts(page, options) {
  const settings = options || {};
  const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
  const found = [];

  const pattern = /<script[^>]*\ssrc=["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const src = match[1];
    // Only local scripts. A CDN URL cannot be read off disk.
    if (!src.includes("../scripts/")) continue;
    // Keep any sub-folder: the admin panel lives in scripts/admin/, so the
    // bare file name is not enough to find it.
    const name = src.split("../scripts/")[1];
    if (found.indexOf(name) === -1) found.push(name);
  }

  const exclude = settings.exclude || [];
  return found.filter((name) => exclude.indexOf(name) === -1);
}

/**
 * Absolute path of a script inside scripts/.
 *
 * `name` may carry a sub-folder, e.g. "admin/users.js".
 */
function scriptPath(name) {
  return path.join(ROOT, "scripts", name);
}

/** Source text of each script, in the given order. */
function readScripts(names) {
  return names.map((name) => fs.readFileSync(scriptPath(name), "utf8"));
}

/**
 * One string holding every script a page loads, ready for window.eval().
 *
 * @param {string} page
 * @param {object} [options]
 * @param {string[]} [options.exclude]
 * @param {string} [options.append]  extra source appended last, normally the
 *                                   `window.__t = { ... }` export bridge
 */
function bundleSource(page, options) {
  const settings = options || {};
  const parts = readScripts(pageScripts(page, settings));
  if (settings.append) parts.push(settings.append);
  return parts.join("\n;\n");
}

/**
 * The panel's own source, as one string.
 *
 * A handful of tests search the panel source for a pattern rather than
 * running it — checking that a value is escaped before it reaches innerHTML,
 * for instance. They used to read scripts/admin.js by name, which stopped
 * existing the moment it was split into scripts/admin/.
 *
 * Only the panel's thirteen files are joined: api.js, the mock and the shared
 * data files are excluded, so a pattern found here really is in panel code.
 */
function adminSource() {
  return readScripts(adminScripts().filter((n) => n.startsWith("admin/"))).join(
    "\n",
  );
}

/**
 * File names of every local stylesheet a page links, in page order.
 *
 * Same reasoning as pageScripts(): a test that hard-codes a stylesheet name
 * breaks the moment that file is split, and the failure looks like a missing
 * rule rather than a stale path.
 *
 * @param {string} page  file name inside html/, e.g. "admin.html"
 * @returns {string[]}   paths relative to styles/, e.g. "pages/admin-base.css"
 */
function pageStyles(page) {
  const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
  const found = [];
  const pattern = /<link[^>]+href=["']([^"']+\.css)["']/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1];
    if (!href.includes("../styles/")) continue;
    const rel = href.split("../styles/")[1];
    if (found.indexOf(rel) === -1) found.push(rel);
  }
  return found;
}

/**
 * Every stylesheet a page loads, concatenated in page order.
 *
 * This is what the browser effectively sees, so a test can search it for a
 * rule without caring which of the twelve admin files that rule now lives in.
 */
function styleSource(page) {
  return pageStyles(page)
    .map((rel) => fs.readFileSync(path.join(ROOT, "styles", rel), "utf8"))
    .join("\n");
}

/**
 * The panel's scripts, in page order.
 *
 * up-btn.js is left out on purpose: it is a scroll-to-top widget that reaches
 * for `.scroll-top-btn` at load time and plays no part in any panel
 * behaviour under test.
 *
 * @param {string[]} [alsoExclude]  further scripts to drop
 */
function adminScripts(alsoExclude) {
  return pageScripts("admin.html", {
    exclude: ["up-btn.js"].concat(alsoExclude || []),
  });
}

module.exports = {
  ROOT,
  pageScripts,
  scriptPath,
  readScripts,
  bundleSource,
  adminScripts,
  pageStyles,
  styleSource,
  adminSource,
};
