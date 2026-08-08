/**
 * File split — the rules that keep a multi-file front-end from breaking.
 *
 * Run with:  node tests/file-split.test.js
 *
 * Splitting one big script into several is safe because classic <script>
 * tags share a single global scope, but three things can still go wrong and
 * every one of them fails quietly:
 *
 *   1. A duplicate top-level `const`/`let`/`class` name. The browser throws
 *      SyntaxError and DROPS THE WHOLE SECOND FILE. Nothing in that file runs
 *      and the console message is easy to miss. Proven in jsdom:
 *
 *          نتیجه: c1 ok | c3 ok | c4 ok        ← c2 never ran
 *          SyntaxError: Identifier 'DUP' has already been declared
 *
 *   2. Load-time use of something defined in a later file. Calls inside a
 *      function body are fine — by the time a user clicks, every file is
 *      loaded. Calls that run while the file is being parsed are not:
 *
 *          ReferenceError: resolveCurrentStaffIdSim is not defined
 *
 *   3. A script listed in the HTML that does not exist on disk, or a script
 *      on disk that no page loads.
 *
 * This file also guards the reason the split happened at all: no source file
 * may grow back past the size limit.
 */
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  pageScripts,
  scriptPath,
  readScripts,
} = require("./helpers/page-scripts.js");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

(async () => {
  const PAGES = fs
    .readdirSync(path.join(ROOT, "html"))
    .filter((x) => x.endsWith(".html"));

  /** Largest a single source file may be before it should be split again. */
  const MAX_JS_LINES = 800;
  const MAX_CSS_LINES = 700;

  /**
   * Top-level declarations in one script.
   *
   * Only column-zero declarations count. Anything indented is inside a
   * function or an IIFE and cannot collide with another file.
   */
  function topLevelDeclarations(source) {
    const out = [];
    source.split("\n").forEach((line, i) => {
      const m = line.match(
        /^(?:async\s+)?(function|const|let|var|class)\s+([\w$]+)/,
      );
      if (m) out.push({ kind: m[1], name: m[2], line: i + 1 });
    });
    return out;
  }

  /**
   * Statements that run while the file is being parsed.
   *
   * A top-level `const X = f()` calls f() immediately, so f must already exist.
   * A `function g() { return f(); }` does not.
   */
  function loadTimeCalls(source, knownNames) {
    const lines = source.split("\n");
    const decls = topLevelDeclarations(source);
    const spans = decls.map((d, i) => ({
      ...d,
      end: i + 1 < decls.length ? decls[i + 1].line - 1 : lines.length,
    }));

    const calls = [];
    spans.forEach((span) => {
      if (span.kind === "function" || span.kind === "class") return;
      const body = lines.slice(span.line - 1, span.end).join("\n");
      [...body.matchAll(/([\w$]+)\s*\(/g)].forEach((m) => {
        if (knownNames.has(m[1]) && m[1] !== span.name) {
          calls.push({ caller: span.name, callee: m[1], line: span.line });
        }
      });
    });

    // Bare statements at column zero that are not declarations: `foo();`
    lines.forEach((line, i) => {
      const m = line.match(/^([\w$]+)\s*\(/);
      if (m && knownNames.has(m[1])) {
        calls.push({ caller: "(سطح فایل)", callee: m[1], line: i + 1 });
      }
    });

    return calls;
  }

  /* ------------------------------------------------------------------ 1 */
  section(
    "۱. هیچ نام سراسری تکراری نیست (وگرنه مرورگر کل فایل دوم را دور می‌اندازد)",
  );
  {
    PAGES.forEach((page) => {
      const names = pageScripts(page);
      const owners = {};
      const clashes = [];

      names.forEach((name) => {
        topLevelDeclarations(fs.readFileSync(scriptPath(name), "utf8")).forEach(
          (d) => {
            // Only const/let/class throw. Two `function` declarations of the same
            // name are legal: the later one simply wins.
            const fatal =
              d.kind === "const" || d.kind === "let" || d.kind === "class";
            if (owners[d.name] && fatal) {
              clashes.push(`${d.name} (${owners[d.name]} و ${name})`);
            }
            if (!owners[d.name]) owners[d.name] = name;
          },
        );
      });

      t(`${page} بدون تصادم نام`, clashes.length === 0, clashes.join("، "));
    });
  }

  /* ------------------------------------------------------------------ 2 */
  section("۲. هیچ فایلی هنگام لود به فایل بعدی نیاز ندارد");
  {
    PAGES.forEach((page) => {
      const names = pageScripts(page);
      const sources = names.map((n) => fs.readFileSync(scriptPath(n), "utf8"));

      // Where each top-level name is defined, by script index.
      const definedIn = {};
      sources.forEach((src, i) => {
        topLevelDeclarations(src).forEach((d) => {
          if (definedIn[d.name] === undefined) definedIn[d.name] = i;
        });
      });
      const known = new Set(Object.keys(definedIn));

      const late = [];
      sources.forEach((src, i) => {
        loadTimeCalls(src, known).forEach((call) => {
          if (definedIn[call.callee] > i) {
            late.push(
              `${names[i]}:${call.line} به ${call.callee} از ${names[definedIn[call.callee]]}`,
            );
          }
        });
      });

      t(
        `${page} ترتیب اسکریپت‌ها درست است`,
        late.length === 0,
        late.slice(0, 3).join(" · "),
      );
    });
  }

  /* ------------------------------------------------------------------ 3 */
  section("۳. هر اسکریپتی که صفحه صدا می‌زند روی دیسک هست");
  {
    const referenced = new Set();
    PAGES.forEach((page) => {
      pageScripts(page).forEach((name) => {
        referenced.add(name);
        t(
          `${page} → ${name}`,
          fs.existsSync(scriptPath(name)),
          "فایل پیدا نشد",
        );
      });
    });

    const onDisk = [];
    const walk = (dir, prefix) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (entry.isDirectory())
          walk(path.join(dir, entry.name), prefix + entry.name + "/");
        else if (entry.name.endsWith(".js")) onDisk.push(prefix + entry.name);
      });
    };
    walk(path.join(ROOT, "scripts"), "");

    const orphans = onDisk.filter(
      (name) => !referenced.has(name) && !referenced.has(name.split("/").pop()),
    );
    t(
      "هیچ اسکریپت یتیمی در scripts/ نمانده",
      orphans.length === 0,
      orphans.join("، "),
    );
  }

  /* ------------------------------------------------------------------ 4 */
  section("۴. هیچ فایلی دوباره غول‌پیکر نشده");
  {
    const jsFiles = [];
    const walkJs = (dir, prefix) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (entry.isDirectory())
          walkJs(path.join(dir, entry.name), prefix + entry.name + "/");
        else if (entry.name.endsWith(".js")) jsFiles.push(prefix + entry.name);
      });
    };
    walkJs(path.join(ROOT, "scripts"), "");

    // Pure data files are lists, not logic: splitting them helps nobody.
    const DATA_FILES = ["main-items.js", "header-items.js"];

    const tooBig = [];
    jsFiles.forEach((rel) => {
      if (DATA_FILES.indexOf(rel.split("/").pop()) !== -1) return;
      const lines = fs
        .readFileSync(path.join(ROOT, "scripts", rel), "utf8")
        .split("\n").length;
      if (lines > MAX_JS_LINES) tooBig.push(`${rel} = ${lines} خط`);
    });
    t(
      `هیچ اسکریپتی بالای ${MAX_JS_LINES} خط نیست`,
      tooBig.length === 0,
      tooBig.join("، "),
    );

    const cssFiles = [];
    ["main", "pages", "header", "footer"].forEach((sub) => {
      const dir = path.join(ROOT, "styles", sub);
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir)
        .filter((x) => x.endsWith(".css"))
        .forEach((x) => cssFiles.push(sub + "/" + x));
    });

    const bigCss = [];
    cssFiles.forEach((rel) => {
      const lines = fs
        .readFileSync(path.join(ROOT, "styles", rel), "utf8")
        .split("\n").length;
      if (lines > MAX_CSS_LINES) bigCss.push(`${rel} = ${lines} خط`);
    });
    t(
      `هیچ استایلی بالای ${MAX_CSS_LINES} خط نیست`,
      bigCss.length === 0,
      bigCss.join("، "),
    );
  }

  /* ------------------------------------------------------------------ 5 */
  section("۵. هر استایلی که صفحه صدا می‌زند روی دیسک هست");
  {
    PAGES.forEach((page) => {
      const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
      const hrefs = [
        ...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g),
      ].map((m) => m[1]);
      const local = hrefs.filter((h) => h.startsWith("../styles/"));
      const missing = local.filter(
        (h) => !fs.existsSync(path.join(ROOT, "html", h)),
      );
      t(
        `${page} همه ${local.length} استایل موجودند`,
        missing.length === 0,
        missing.join("، "),
      );
    });

    // A stylesheet that @imports another must find it.
    const brokenImports = [];
    const walkCss = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkCss(full);
        if (!entry.name.endsWith(".css")) return;
        const src = fs.readFileSync(full, "utf8");
        [...src.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].forEach((m) => {
          if (m[1].startsWith("http")) return;
          if (!fs.existsSync(path.join(path.dirname(full), m[1]))) {
            brokenImports.push(path.relative(ROOT, full) + " → " + m[1]);
          }
        });
      });
    };
    walkCss(path.join(ROOT, "styles"));
    t(
      "همه @import ها مقصد دارند",
      brokenImports.length === 0,
      brokenImports.join("، "),
    );
  }

  /* ------------------------------------------------------------------ 6 */
  section("۶. توابعی که HTML مستقیم صدا می‌زند، در جاوااسکریپت وجود دارند");
  {
    // An inline onclick="foo()" only works if foo is a real global. After a
    // split it is easy to move foo into an IIFE by accident and the button
    // silently stops working - no error until someone clicks it.
    PAGES.forEach((page) => {
      const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
      const handlers = new Set(
        [...html.matchAll(/\son[a-z]+="([a-zA-Z_$][\w$]*)\s*\(/g)].map(
          (m) => m[1],
        ),
      );
      if (handlers.size === 0) return;

      const bundle = readScripts(pageScripts(page)).join("\n");
      const defined = new Set(topLevelDeclarations(bundle).map((d) => d.name));
      // Some are attached explicitly, e.g. window.pushAdminNotification = ...
      [...bundle.matchAll(/window\.([\w$]+)\s*=/g)].forEach((m) =>
        defined.add(m[1]),
      );

      const missing = [...handlers].filter((h) => !defined.has(h));
      t(
        `${page} هر ${handlers.size} تابع inline تعریف شده`,
        missing.length === 0,
        missing.join("، "),
      );
    });
  }

  /* ------------------------------------------------------------------ 7 */
  section("۷. صفحه ادمین با همه استایل‌های تقسیم‌شده درست بالا می‌آید");
  {
    // A split stylesheet fails in a way no string search catches: the variables
    // in :root resolve to nothing because the file defining them now loads too
    // late, and the whole panel turns colourless. Loading the real page in a
    // real DOM and reading the computed values is the only honest check.
    const { JSDOM } = require("jsdom");
    const dom = await JSDOM.fromFile(path.join(ROOT, "html/admin.html"), {
      resources: "usable",
      pretendToBeVisual: true,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const w = dom.window;
    const d = w.document;

    let rules = 0;
    [...d.styleSheets].forEach((sheet) => {
      try {
        rules += sheet.cssRules.length;
      } catch (e) {
        /* cross-origin font sheet */
      }
    });
    // 2,655 was the count before admin.css was split into twelve files, and it
    // stayed at 2,655 across the split - which is what proved nothing was lost.
    //
    // Since then, deliberately:
    //   +15  placement picker in the add-item dialog
    //   +12  two-column layout for that dialog
    //   = 2,682
    //
    // The number is not sacred. Update it when rules are deliberately added or
    // removed, and say why in the commit. An UNEXPLAINED change is the signal
    // worth catching: it means a stylesheet stopped loading.
    t("همه قوانین CSS بارگذاری شدند", rules === 2682, String(rules));

    const rootStyle = w.getComputedStyle(d.documentElement);
    const VARS = { "--primary": "#007AFF", "--danger": "#FF3B30" };
    Object.entries(VARS).forEach(([name, expected]) => {
      t(
        `متغیر ${name} حل می‌شود`,
        rootStyle.getPropertyValue(name).trim() === expected,
        rootStyle.getPropertyValue(name).trim() || "(خالی)",
      );
    });

    // The [hidden] rule lives in the last stylesheet on purpose: it has to beat
    // every `display` rule that came before it.
    const clearBtn = d.getElementById("reportReplyClear");
    t(
      "ویژگی hidden هنوز برنده است",
      !!clearBtn && w.getComputedStyle(clearBtn).display === "none",
      clearBtn ? w.getComputedStyle(clearBtn).display : "دکمه پیدا نشد",
    );

    dom.window.close();
  }

  /* ------------------------------------------------------------------ 8 */
  section("۸. هر صفحه در مرورگر واقعی، بدون خطا بالا می‌آید");
  {
    // Everything above reads files. This actually RUNS them, over HTTP, the
    // same way a browser does — the only check that catches a script throwing
    // on load. A classic <script> stops at the first uncaught error, so one
    // bad line silently kills every line after it in that file.
    //
    // This found a real bug the moment it was written: up-btn.js called
    // addEventListener on a querySelector result without checking it, and
    // three pages load that script without having the button in their markup.
    // All three threw TypeError on every single visit.
    const http = require("http");
    const { JSDOM, VirtualConsole } = require("jsdom");

    const TYPES = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
    };
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": TYPES[path.extname(file)] || "text/plain",
        });
        res.end(data);
      });
    });
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;

    for (const page of PAGES) {
      const errors = [];
      const vc = new VirtualConsole();
      vc.on("jsdomError", (e) => errors.push(e.message.split("\n")[0]));
      let dom = null;
      try {
        dom = await JSDOM.fromURL(
          "http://localhost:" + port + "/html/" + page,
          {
            runScripts: "dangerously",
            resources: "usable",
            pretendToBeVisual: true,
            virtualConsole: vc,
          },
        );
        await new Promise((r) => setTimeout(r, 1200));
      } catch (e) {
        errors.push("بارگذاری نشد: " + e.message);
      }
      t(
        page + " بدون خطای جاوااسکریپت",
        errors.length === 0,
        errors.slice(0, 2).join(" · "),
      );
      if (dom) dom.window.close();
    }

    server.close();
  }

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
