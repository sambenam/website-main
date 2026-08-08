/**
 * Products tab.
 *
 * Run with:  node tests/products.test.js
 * Requires:  npm install --no-save jsdom
 *
 * The headline case: an article can sell a video AND files at the same time.
 * single-post.js looks them up as `<id>` and `<id>-video`, so the panel has to
 * produce those ids - previously it always saved under the bare id, which made
 * videos undiscoverable and let a PDF silently overwrite one.
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

function boot(products) {
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
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
    irHesabdarProducts: JSON.stringify(products || []),
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

  const calls = [];

  const ORDER = adminScripts();
  const src = ORDER.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  // api.js assigns window.appApi on load, so a stub set beforehand is thrown
  // away. Wrap the real object afterwards instead: the calls still execute,
  // and every admin call is recorded for the assertions.
  src.push(`
    (function () {
      const log = window.__calls;
      Object.keys(appApi.admin).forEach(function (group) {
        Object.keys(appApi.admin[group]).forEach(function (fn) {
          const original = appApi.admin[group][fn];
          appApi.admin[group][fn] = function () {
            log.push({ op: group + '.' + fn, args: Array.from(arguments) });
            return original.apply(this, arguments);
          };
        });
      });
    })();
  `);
  src.push(`window.__t = {
    productIdFor, contentIdOf, isVideoProduct, isPlausibleFileUrl,
    editProduct, deleteProduct, renderProductsTable,
    get products() { return appState.products; },
    set products(v) { appState.products = v; },
  };`);
  Object.defineProperty(window, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  window.__calls = calls;
  try {
    window.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 120));
  }
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return window;
}

// ---------------------------------------------------------------- id convention
section("id convention");
let w = boot([]);
t(
  "mp4 becomes <id>-video",
  w.__t.productIdFor("acc-101", "mp4") === "acc-101-video",
);
t("pdf stays bare", w.__t.productIdFor("acc-101", "pdf") === "acc-101");
t(
  "contentIdOf strips the suffix",
  w.__t.contentIdOf("acc-101-video") === "acc-101",
);
t(
  "contentIdOf is a no-op on a bare id",
  w.__t.contentIdOf("acc-101") === "acc-101",
);
t(
  "an id containing 'video' is untouched",
  w.__t.contentIdOf("my-video-course") === "my-video-course",
);

// ---------------------------------------------------------------- the real bug
section("an article can sell a video AND files (the bug)");
const both = [
  {
    id: "acc-101",
    contentId: "acc-101",
    name: "جزوه دوره",
    category: "pdf",
    price: 49000,
    fileUrl: "https://x/f.pdf",
  },
  {
    id: "acc-101-video",
    contentId: "acc-101",
    name: "ویدیو دوره",
    category: "mp4",
    price: 95000,
    fileUrl: "https://x/v.mp4",
  },
];
w = boot(both);
w.__t.products = both;
w.__t.renderProductsTable();

// exactly what single-post.js does
const found = {
  video: both.find((x) => String(x.id) === "acc-101" + "-video"),
  files: both.find((x) => String(x.id) === "acc-101"),
};
t("single-post finds the video", !!found.video);
t("single-post finds the files", !!found.files);
t("they are different products", found.video.id !== found.files.id);
t(
  "prices stay independent",
  found.video.price === 95000 && found.files.price === 49000,
);

let html = w.document.getElementById("productsManageTable").innerHTML;
t(
  "table shows both rows",
  w.document.querySelectorAll("#productsManageTable tbody tr").length === 2,
);
t("video row is badged", html.includes("product-type-badge--video"));
t("file row is badged", html.includes("product-type-badge--file"));
t("owning article is shown", html.includes("product-owner"));

// ---------------------------------------------------------------- edit modal
section("edit modal replaces the prompt()");
w = boot(both);
w.__t.products = JSON.parse(JSON.stringify(both));
w.__t.editProduct("acc-101");
t(
  "modal opens",
  w.document.getElementById("editProductModal").classList.contains("active"),
);
t(
  "name prefilled",
  w.document.getElementById("editProdName").value === "جزوه دوره",
);
// The field now shows a grouped, Persian-digit value, so compare the parsed
// number rather than the raw string.
t(
  "price prefilled",
  w.eval('readPriceInput(document.getElementById("editProdPrice"))') === 49000,
  w.document.getElementById("editProdPrice").value,
);
t(
  "price shown with separators",
  w.document.getElementById("editProdPrice").value === "۴۹,۰۰۰",
  w.document.getElementById("editProdPrice").value,
);
t("format prefilled", w.document.getElementById("editProdCat").value === "pdf");
t(
  "file url prefilled",
  w.document.getElementById("editProdFileUrl").value === "https://x/f.pdf",
);
t(
  "owning article shown",
  w.document.getElementById("editProdOwner").textContent.length > 0,
);

section("saving an edit");
w = boot(both);
w.__t.products = JSON.parse(JSON.stringify(both));
let toast = null;
w.showToast = (m, ty) => {
  toast = { m, ty };
};
w.__t.editProduct("acc-101");
w.document.getElementById("editProdName").value = "جزوه ویرایش‌شده";
w.document.getElementById("editProdPrice").value = "55000";
w.document
  .getElementById("editProductForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
let edited = w.__t.products.find((x) => x.id === "acc-101");
t("name saved", edited.name === "جزوه ویرایش‌شده", edited.name);
t("price saved", edited.price === 55000, String(edited.price));
t("id unchanged for a same-format edit", edited.id === "acc-101");
t(
  "update call issued",
  w.__calls.some((c) => c.op === "products.update"),
);
t("success toast", toast && toast.ty === "success");

section("switching a file to a video moves its id");
w = boot(both);
w.__t.products = [
  {
    id: "acc-202",
    contentId: "acc-202",
    name: "فایل",
    category: "pdf",
    price: 1000,
    fileUrl: "https://x/a.pdf",
  },
];
w.showToast = () => {};
w.__t.editProduct("acc-202");
w.document.getElementById("editProdCat").value = "mp4";
w.document
  .getElementById("editProductForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
t(
  "id gained the suffix",
  w.__t.products[0].id === "acc-202-video",
  w.__t.products[0].id,
);
t(
  "old record removed via API",
  w.__calls.some((c) => c.op === "products.remove" && c.args[0] === "acc-202"),
);
t(
  "new record created via API",
  w.__calls.some((c) => c.op === "products.create"),
);

section("cannot create a duplicate for the same article+type");
w = boot(both);
w.__t.products = JSON.parse(JSON.stringify(both));
toast = null;
w.showToast = (m, ty) => {
  toast = { m, ty };
};
w.__t.editProduct("acc-101");
w.document.getElementById("editProdCat").value = "mp4"; // a -video already exists
w.document
  .getElementById("editProductForm")
  .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
t("refused", toast && toast.ty === "error", JSON.stringify(toast));
t(
  "nothing changed",
  w.__t.products.find((x) => x.id === "acc-101").category === "pdf",
);

// ---------------------------------------------------------------- url validation
section("file url validation");
w = boot([]);
t("https accepted", w.__t.isPlausibleFileUrl("https://a.com/f.pdf"));
t("http accepted", w.__t.isPlausibleFileUrl("http://a.com/f.pdf"));
t("root-relative accepted", w.__t.isPlausibleFileUrl("/files/f.pdf"));
t("parent-relative accepted", w.__t.isPlausibleFileUrl("../files/f.pdf"));
t("empty accepted (optional)", w.__t.isPlausibleFileUrl(""));
t("bare text rejected", !w.__t.isPlausibleFileUrl("my file.pdf"));
t("typo'd scheme rejected", !w.__t.isPlausibleFileUrl("htp://a.com/f.pdf"));

// ---------------------------------------------------------------- delete
section("delete uses the article id for content sync");
w = boot(both);
w.__t.products = JSON.parse(JSON.stringify(both));
w.confirm = () => true;
w.showToast = () => {};
w.__t.deleteProduct("acc-101-video");
t("video removed", !w.__t.products.some((x) => x.id === "acc-101-video"));
t(
  "sibling file kept",
  w.__t.products.some((x) => x.id === "acc-101"),
);
t(
  "remove called with the product id",
  w.__calls.some(
    (c) => c.op === "products.remove" && c.args[0] === "acc-101-video",
  ),
);

console.log("\n" + "=".repeat(52));
console.log(`  ${p} passed, ${f} failed`);
console.log("=".repeat(52));
process.exit(f ? 1 : 0);
