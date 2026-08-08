/**
 * Cross-platform test runner.
 *
 * The project ships as plain classic <script> files with no bundler, so each
 * test file in tests/ is a standalone program that exits non-zero on the first
 * failed assertion. There is no mocha/jest. Running them one at a time with a
 * shell glob works on Linux/macOS but not on Windows, and it is easy to forget
 * a file. This runner spawns every *.test.js file in turn, inherits its output
 * so each suite still prints its own per-test lines, and exits non-zero if any
 * suite failed — which is what `npm test`, CI and a backend developer
 * validating the contract all expect.
 *
 * Usage:   npm test          (runs every suite)
 *          node tests/run-all.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// The suites depend on jsdom. Catch a missing install once, up front, instead
// of letting every file crash with the same "Cannot find module" stack.
try {
  require.resolve("jsdom");
} catch (e) {
  console.error(
    "\n❌ وابستگی توسعه‌ای «jsdom» نصب نیست. قبل از اجرای تست این دستور را بزن:\n" +
      "   npm install\n",
  );
  process.exit(1);
}

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let passed = 0;
const failed = [];

for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(dir, file)], {
    stdio: "inherit",
  });
  if (result.status === 0) {
    passed += 1;
  } else {
    failed.push(file);
  }
}

const line = "=".repeat(56);
console.log("\n" + line);
console.log(`نتيجه‌ی نهايی: ${passed}/${files.length} فایل تست سبز`);
if (failed.length > 0) {
  console.log(`❌ فایل‌های ناموفق (${failed.length}): ${failed.join("، ")}`);
  process.exit(1);
}
console.log("✅ همه‌ی فایل‌های تست با موفقیت گذرند");
