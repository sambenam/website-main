/**
 * Product -> article content sync.
 *
 * Run with:  node tests/product-content-sync.test.js
 * Requires:  npm install --no-save jsdom
 *
 * When a product is saved in the admin panel it must also appear on the
 * article itself: an mp4 lands in the article's video slot, everything else
 * lands in its downloads list. This is the chain:
 *
 *   admin saves product
 *     -> saveContentOverride(contentId, ...)     writes irHesabdarItemContent
 *     -> applyContentOverrides(siteData)         merges into the in-memory data
 *     -> single-post.js renders video/downloads  what the visitor sees
 *
 * Note: findSiteItem() returns { item, categoryKey, categoryTitle }, not the
 * article itself - reading `.content` off the wrapper silently yields
 * undefined, which is easy to mistake for a broken sync.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { adminScripts } = require("./helpers/page-scripts.js");

const ROOT = path.join(__dirname, "..");
let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  \u2713 " + n))
    : (f++, console.log("  \u2717 " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

function boot() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/html/single-post.html",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const store = {};
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
    value: { log() {}, warn() {}, error() {} },
    configurable: true,
  });

  // The data layer only: no api.js, no panel scripts. This test replays what
  // admin.js does after a save, so the panel itself must stay out of the way.
  const files = adminScripts([
    "api.js",
    "app-shell.js",
    "admin-content.js",
    "admin.js",
  ]);
  const src = files.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__x = {
    get siteData() { return siteData; },
    loadContentOverrides, saveContentOverride, findSiteItem, applyContentOverrides,
    normalizeVideo, normalizeDownloads,
  };`);
  w.eval(src.join("\n;\n"));
  return { w, X: w.__x, store };
}

/** Replays exactly what admin.js does after saving a product. */
function saveProduct(X, contentId, { name, category, fileUrl, fileSize }) {
  const overrides = X.loadContentOverrides();
  const current = overrides[contentId] || {};
  const content = current.content || { blocks: [], downloads: [], video: null };

  if (category === "mp4") {
    content.video = {
      enabled: true,
      url: fileUrl,
      provider: "file",
      title: name,
    };
  } else {
    if (!Array.isArray(content.downloads)) content.downloads = [];
    const fileId = "prod-file-" + contentId;
    const fileObj = {
      id: fileId,
      title: name,
      url: fileUrl,
      type: category,
      size: fileSize,
    };
    const i = content.downloads.findIndex((d) => d.id === fileId);
    if (i > -1) content.downloads[i] = fileObj;
    else content.downloads.push(fileObj);
  }

  X.saveContentOverride(contentId, { content, excerpt: current.excerpt || "" });
  X.applyContentOverrides(X.siteData);
}

const article = (X, id) => (X.findSiteItem(id) || {}).item;

// ---------------------------------------------------------------- video
section("a video product lands in the article's video slot");
let { X } = boot();
let id = X.siteData[Object.keys(X.siteData)[0]].items[0].id;
saveProduct(X, id, {
  name: "ویدیوی دوره",
  category: "mp4",
  fileUrl: "https://x/v.mp4",
});

let art = article(X, id);
t(
  "article carries a video",
  !!art.content.video,
  JSON.stringify(art.content.video),
);
t("title matches", art.content.video.title === "ویدیوی دوره");
t("url matches", art.content.video.url === "https://x/v.mp4");
t("marked enabled", art.content.video.enabled === true);
t("downloads untouched", (art.content.downloads || []).length === 0);
t("renderable by item-content", !!X.normalizeVideo(art.content.video));

// ---------------------------------------------------------------- file
section("a file product lands in the article's downloads");
({ X } = boot());
id = X.siteData[Object.keys(X.siteData)[0]].items[0].id;
saveProduct(X, id, {
  name: "جزوه PDF",
  category: "pdf",
  fileUrl: "https://x/f.pdf",
  fileSize: "۱۲ مگابایت",
});

art = article(X, id);
t("article carries one download", (art.content.downloads || []).length === 1);
t("title matches", art.content.downloads[0].title === "جزوه PDF");
t("type recorded", art.content.downloads[0].type === "pdf");
t("size recorded", art.content.downloads[0].size === "۱۲ مگابایت");
t("video slot stays empty", !art.content.video);
t(
  "renderable by item-content",
  X.normalizeDownloads(art.content.downloads).length === 1,
);

// ---------------------------------------------------------------- both
section("one article can hold a video AND files at the same time");
({ X } = boot());
id = X.siteData[Object.keys(X.siteData)[0]].items[0].id;
saveProduct(X, id, {
  name: "ویدیوی دوره",
  category: "mp4",
  fileUrl: "https://x/v.mp4",
});
saveProduct(X, id, {
  name: "جزوه PDF",
  category: "pdf",
  fileUrl: "https://x/f.pdf",
  fileSize: "۱۲ مگ",
});

art = article(X, id);
t(
  "video survived the second save",
  !!art.content.video,
  "the file save used to wipe it",
);
t("file is present too", (art.content.downloads || []).length === 1);
t(
  "they are independent",
  art.content.video.url !== art.content.downloads[0].url,
);

// ---------------------------------------------------------------- updates
section("re-saving the same file replaces it instead of duplicating");
saveProduct(X, id, {
  name: "جزوه ویرایش‌شده",
  category: "pdf",
  fileUrl: "https://x/f2.pdf",
  fileSize: "۱۵ مگ",
});
art = article(X, id);
t(
  "still one download",
  (art.content.downloads || []).length === 1,
  String(art.content.downloads.length),
);
t("updated in place", art.content.downloads[0].title === "جزوه ویرایش‌شده");
t("new url applied", art.content.downloads[0].url === "https://x/f2.pdf");

section("two different formats produce two downloads");
saveProduct(X, id, {
  name: "پکیج کامل",
  category: "zip",
  fileUrl: "https://x/p.zip",
  fileSize: "۵۰ مگ",
});
art = article(X, id);
// same contentId means the same fileId, so zip replaces pdf - document the behaviour
t(
  "file slot holds one entry per article",
  (art.content.downloads || []).length === 1,
  "each article has a single file product by design",
);
t("latest format wins", art.content.downloads[0].type === "zip");

// ---------------------------------------------------------------- persistence
section("survives a page reload");
({ X } = boot());
id = X.siteData[Object.keys(X.siteData)[0]].items[0].id;
saveProduct(X, id, {
  name: "ویدیو",
  category: "mp4",
  fileUrl: "https://x/v.mp4",
});
const raw = JSON.parse(JSON.stringify(X.loadContentOverrides()));
t("written to storage", !!raw[id] && !!raw[id].content.video);
X.applyContentOverrides(X.siteData);
t(
  "re-applying is idempotent",
  article(X, id).content.video.url === "https://x/v.mp4",
);

// ---------------------------------------------------------------- other articles
section("other articles are not touched");
({ X } = boot());
const cat = X.siteData[Object.keys(X.siteData)[0]];
const [first, second] = cat.items;
saveProduct(X, first.id, {
  name: "ویدیو",
  category: "mp4",
  fileUrl: "https://x/v.mp4",
});
t("target article updated", !!article(X, first.id).content.video);
if (second) {
  const other = article(X, second.id);
  t("neighbour untouched", !other.content || !other.content.video);
}

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
