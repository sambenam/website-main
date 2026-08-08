/**
 * Integration tests for the admin <-> public data flow.
 *
 * Run with:  node tests/integration.test.js
 *
 * These cover the connections that used to be broken: a message sent from the
 * public contact form must reach the admin inbox, a public signup must appear
 * in the admin user list, and admin settings must be readable by the site
 * shell. They run against the mock backend, which is the same code path the
 * real backend will replace.
 */

// --- minimal browser shims -------------------------------------------------
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
  clear: () => Object.keys(store).forEach((k) => delete store[k]),
};
global.window = undefined;

const { appApi, ApiError } = require("../scripts/api.js");

// --- tiny test harness -----------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log("  \u2713 " + name);
  } else {
    failed++;
    failures.push(name + (detail ? " -> " + detail : ""));
    console.log("  \u2717 " + name + (detail ? " -> " + detail : ""));
  }
}

function section(title) {
  console.log("\n" + title);
}

async function expectReject(name, promise, status) {
  try {
    await promise;
    check(name, false, "expected rejection, got success");
  } catch (error) {
    check(name, !status || error.status === status, "status=" + error.status);
  }
}

// --- tests -----------------------------------------------------------------
async function run() {
  section("products");
  await appApi.admin.products.create({
    id: "course-1",
    name: "دوره حسابداری مقدماتی",
    price: 49000,
    category: "file",
  });
  let products = await appApi.admin.products.list();
  check("create then list", products.length === 1);
  check(
    "fields survive round-trip",
    products[0].name === "دوره حسابداری مقدماتی",
  );

  await expectReject(
    "duplicate id rejected",
    appApi.admin.products.create({ id: "course-1", name: "تکراری" }),
    409,
  );
  await expectReject(
    "missing name rejected",
    appApi.admin.products.create({ id: "course-2" }),
    422,
  );

  await appApi.admin.products.update("course-1", { price: 59000 });
  products = await appApi.admin.products.list();
  check("price update persists", products[0].price === 59000);

  await expectReject(
    "update unknown id 404s",
    appApi.admin.products.update("nope", { price: 1 }),
    404,
  );

  await appApi.admin.products.remove("course-1");
  check("remove works", (await appApi.admin.products.list()).length === 0);

  section("support form -> admin inbox (was broken)");
  await appApi.support.sendMessage({
    name: "سام به‌نام",
    email: "sam@example.com",
    subject: "سوال درباره دوره",
    message: "سلام، آیا این دوره پیش‌نیاز دارد؟",
  });
  const inbox = await appApi.admin.messages.list();
  check("admin sees the site message", inbox.length === 1);
  check("sender name mapped", inbox[0].sender === "سام به‌نام");
  check("body mapped from `message`", inbox[0].text.includes("پیش‌نیاز"));
  // The source now says which form the message came through: "contact" for
  // the support page, "ai" for the assistant widget. The admin list route
  // used to overwrite both with a flat "site", which erased the distinction
  // and left the inbox unable to show where a question originated.
  check("tagged with its origin form", inbox[0].source === "contact");
  check(
    "history seeded",
    Array.isArray(inbox[0].history) && inbox[0].history.length === 1,
  );

  const replied = await appApi.admin.messages.reply(inbox[0].id, {
    text: "بله، آشنایی با مفاهیم پایه لازم است.",
    adminName: "مدیر سایت",
  });
  check("reply appended to thread", replied.history.length === 2);
  check("reply author recorded", replied.history[1].name === "مدیر سایت");
  check("marked read after reply", replied.read === true);

  const afterReply = await appApi.admin.messages.list();
  check("no duplicate after promoting site message", afterReply.length === 1);
  check("thread persisted", afterReply[0].history.length === 2);

  await expectReject(
    "reply to unknown message 404s",
    appApi.admin.messages.reply("does-not-exist", { text: "x" }),
    404,
  );

  section("public signup -> admin user list (was broken)");
  await appApi.auth.register({
    name: "مریم حسینی",
    email: "maryam@example.com",
    password: "secret123",
  });
  const users = await appApi.admin.users.list();
  check(
    "registered user visible to admin",
    users.some((u) => u.email === "maryam@example.com"),
  );
  const maryam = users.find((u) => u.email === "maryam@example.com");
  check("default role assigned", maryam.role === "کاربر عادی");
  check("tagged as site-origin", maryam.source === "site");

  await appApi.auth.register({
    name: "علی رضایی",
    email: "ali-site@example.com",
    password: "secret123",
  });
  const users2 = await appApi.admin.users.list();
  check("second signup also visible", users2.length === 2);
  check(
    "no duplicate emails in merged list",
    new Set(users2.map((u) => u.email)).size === users2.length,
  );

  section("settings -> site shell");
  await appApi.admin.settings.save({
    supportEmail: "help@hesabyar.ir",
    supportPhone: "۰۲۱-۱۲۳۴۵۶۷۸",
    maintenanceMode: false,
  });
  const settings = await appApi.admin.settings.get();
  check("settings round-trip", settings.supportEmail === "help@hesabyar.ir");

  await appApi.admin.settings.save({ maintenanceMode: true });
  const merged = await appApi.admin.settings.get();
  check(
    "partial save merges, does not clobber",
    merged.supportEmail === "help@hesabyar.ir",
  );
  check("new field applied", merged.maintenanceMode === true);

  section("orders");
  await appApi.admin.orders.create({
    id: "ord-1",
    customer: "سام",
    amount: 49000,
    status: "pending",
  });
  const orders = await appApi.admin.orders.list();
  check("order created", orders.length === 1);
  const updated = await appApi.admin.orders.updateStatus("ord-1", "success");
  check("status updated", updated.status === "success");
  await expectReject(
    "unknown order 404s",
    appApi.admin.orders.updateStatus("ord-999", "success"),
    404,
  );

  section("roles and admin access");
  await appApi.auth.logout();
  let session = await appApi.auth.login({
    email: "maryam@example.com",
    password: "secret123",
  });
  check("login exposes a role", session.user.role === "کاربر عادی");
  check("normal user is not admin", session.isAdmin === false);

  await appApi.auth.promote({ email: "maryam@example.com", role: "مدیر سایت" });
  await appApi.auth.logout();
  session = await appApi.auth.login({
    email: "maryam@example.com",
    password: "secret123",
  });
  check("promoted role persists", session.user.role === "مدیر سایت");
  check("staff account flagged as admin", session.isAdmin === true);

  await expectReject(
    "promoting unknown email 404s",
    appApi.auth.promote({ email: "ghost@example.com" }),
    404,
  );

  section("users tab: site signup -> admin panel");
  // Signup asks for name, email and password only. Phone is collected later
  // from the profile page, so it must reach the panel through that route.
  await appApi.auth.register({
    name: "نگین رضایی",
    email: "negin@example.com",
    password: "secret123",
  });
  let panelUsers = await appApi.admin.users.list();
  let negin = panelUsers.find((u) => u.email === "negin@example.com");
  check("signup appears in the panel", !!negin);
  check("phone starts empty", negin.phone === "", JSON.stringify(negin.phone));
  check("createdAt recorded", Boolean(negin.createdAt));

  await appApi.profile.update({ phone: "09121112233" });
  panelUsers = await appApi.admin.users.list();
  negin = panelUsers.find((u) => u.email === "negin@example.com");
  check(
    "phone added later reaches the panel",
    negin.phone === "09121112233",
    negin.phone,
  );
  check("role defaults to کاربر عادی", negin.role === "کاربر عادی");
  check("status defaults to فعال", negin.status === "فعال");
  check("tagged source=site", negin.source === "site");

  await appApi.admin.users.updateStatus(negin.id, "غیرفعال");
  panelUsers = await appApi.admin.users.list();
  negin = panelUsers.find((u) => u.email === "negin@example.com");
  check(
    "moderating a site account persists",
    negin.status === "غیرفعال",
    negin.status,
  );
  check(
    "moderation keeps the phone",
    negin.phone === "09121112233",
    negin.phone,
  );
  check("moderation keeps the name", negin.name === "نگین رضایی", negin.name);

  await appApi.auth.logout();
  await expectReject(
    "disabled account cannot sign in",
    appApi.auth.login({ email: "negin@example.com", password: "secret123" }),
    403,
  );
  await appApi.admin.users.updateStatus(negin.id, "فعال");
  check(
    "one row per email after write",
    panelUsers.filter((u) => u.email === "negin@example.com").length === 1,
  );

  await appApi.admin.users.remove(negin.id);
  panelUsers = await appApi.admin.users.list();
  check(
    "deleted user leaves the list",
    !panelUsers.find((u) => u.email === "negin@example.com"),
  );
  await expectReject(
    "deleted user can no longer log in",
    appApi.auth.login({ email: "negin@example.com", password: "secret123" }),
    401,
  );

  section("users tab: panel-created accounts");
  const madeInPanel = await appApi.admin.users.create({
    name: "علی رضایی",
    email: "panel-user@example.com",
    phone: "09129998877",
    role: "کاربر عادی",
  });
  check("create returns a record", Boolean(madeInPanel.id));
  check("tagged source=admin", madeInPanel.source === "admin");
  check("createdAt set", Boolean(madeInPanel.createdAt));

  let allUsers = await appApi.admin.users.list();
  check(
    "shows up in the list",
    allUsers.some((u) => u.email === "panel-user@example.com"),
  );
  check(
    "no duplicate emails across both stores",
    new Set(allUsers.map((u) => u.email)).size === allUsers.length,
  );

  await expectReject(
    "duplicate email rejected",
    appApi.admin.users.create({ name: "x", email: "panel-user@example.com" }),
    409,
  );
  await expectReject(
    "clash with a site signup rejected",
    appApi.admin.users.create({ name: "y", email: "maryam@example.com" }),
    409,
  );
  await expectReject(
    "missing name rejected",
    appApi.admin.users.create({ email: "nameless@example.com" }),
    422,
  );

  await appApi.admin.users.updateStatus(madeInPanel.id, "غیرفعال");
  allUsers = await appApi.admin.users.list();
  const ali = allUsers.find((u) => u.email === "panel-user@example.com");
  check("panel-created user is moderatable", ali.status === "غیرفعال");
  check("phone preserved", ali.phone === "09129998877", ali.phone);

  section("access management: roles");
  const boss = await appApi.admin.users.create({
    name: "مدیر ارشد",
    email: "boss@example.com",
    role: "مدیر سایت",
  });
  const helper = await appApi.admin.users.create({
    name: "ادمین کمکی",
    email: "helper@example.com",
    role: "ادمین",
  });

  let changed = await appApi.admin.users.updateRole(helper.id, "کاربر عادی");
  check(
    "admin can be demoted to a regular user",
    changed.role === "کاربر عادی",
  );
  changed = await appApi.admin.users.updateRole(helper.id, "ادمین");
  check("and promoted back", changed.role === "ادمین");

  // An earlier section promoted maryam to مدیر سایت, so two managers exist
  // here and the demotion is expected to succeed.
  changed = await appApi.admin.users.updateRole(boss.id, "ادمین");
  check(
    "a manager can be demoted while a peer exists",
    changed.role === "ادمین",
  );

  // Now strip it back to a single manager and confirm the floor holds.
  const maryamRow = (await appApi.admin.users.list()).find(
    (u) => u.email === "maryam@example.com",
  );
  const others = (await appApi.admin.users.list()).filter(
    (u) =>
      ["مدیر سایت", "مدیر سیستم"].includes(u.role) && u.id !== maryamRow.id,
  );
  for (const extra of others) {
    await appApi.admin.users.updateRole(extra.id, "ادمین");
  }
  const managersLeft = (await appApi.admin.users.list()).filter((u) =>
    ["مدیر سایت", "مدیر سیستم"].includes(u.role),
  );
  check(
    "exactly one manager remains",
    managersLeft.length === 1,
    String(managersLeft.length),
  );

  await expectReject(
    "the last manager cannot be demoted, even via the API",
    appApi.admin.users.updateRole(managersLeft[0].id, "ادمین"),
    409,
  );

  await expectReject(
    "empty role rejected",
    appApi.admin.users.updateRole(helper.id, ""),
    422,
  );
  await expectReject(
    "unknown id rejected",
    appApi.admin.users.updateRole("ghost-id", "ادمین"),
    404,
  );

  section("error contract");
  await expectReject(
    "unknown admin route 404s",
    appApi.request("/admin/nope"),
    404,
  );
  check("ApiError is exported", typeof ApiError === "function");

  // --- summary -------------------------------------------------------------
  console.log("\n" + "=".repeat(52));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("=".repeat(52));
  if (failed) {
    console.log("\nfailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("\nunexpected error:", error);
  process.exit(1);
});
