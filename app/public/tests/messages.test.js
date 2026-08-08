/**
 * Messages — the whole round trip.
 *
 * Run with:  node tests/messages.test.js
 *
 *   پشتیبان هوشمند (صفحه اصلی)  ─┐
 *                                ├─→  تب پیام‌ها (پنل)  ─→  پاسخ  ─→  پروفایل کاربر
 *   فرم تماس با ما / قوانین     ─┘
 *
 * Two bugs this exists to prevent coming back:
 *   1. The API stored `read: false` while the panel checked `msg.unread`.
 *      Every real message arrived looking already-read: no badge, no
 *      highlight, sorted to the bottom.
 *   2. The assistant widget never called the API at all - it printed a canned
 *      answer on a timer and the question died in the page.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

/* ---------------------------------------------------------------- data layer */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
global.window = undefined;
const { appApi } = require("../scripts/api.js");
const {
  adminScripts,
  pageScripts,
  readScripts,
} = require("./helpers/page-scripts.js");

(async () => {
  section("پیام از فرم تماس با ما");
  await appApi.auth.register({
    name: "سام به‌نام",
    email: "sam@test.com",
    password: "12345678",
    phone: "09121112233",
  });
  await appApi.support.sendMessage({
    name: "سام به‌نام",
    email: "sam@test.com",
    subject: "question",
    message: "سلام، درباره دوره سوال دارم",
    source: "contact",
  });

  let inbox = await appApi.admin.messages.list();
  t("در صندوق ادمین نشست", inbox.length === 1, String(inbox.length));
  t("متن پیام درست است", inbox[0].text === "سلام، درباره دوره سوال دارم");
  t("نام فرستنده ثبت شد", inbox[0].sender === "سام به‌نام");
  t("ایمیل ثبت شد", inbox[0].email === "sam@test.com");

  // The bug: API wrote read:false, panel read msg.unread -> undefined.
  t("پرچم unread ست شده", inbox[0].unread === true, String(inbox[0].unread));
  t("پرچم read هم ست شده", inbox[0].read === false, String(inbox[0].read));
  t("هر دو پرچم هماهنگ‌اند", inbox[0].unread === !inbox[0].read);
  t("منبع «تماس با ما» ثبت شد", inbox[0].source === "contact", inbox[0].source);
  t("به حساب کاربر وصل است", !!inbox[0].userId, String(inbox[0].userId));
  t("تاریخچه یک حباب دارد", inbox[0].history.length === 1);

  section("پیام از پشتیبان هوشمند");
  await appApi.support.sendMessage({
    name: "سام به‌نام",
    email: "sam@test.com",
    subject: "ai",
    message: "مالیات حقوق چقدر است؟",
    source: "ai",
  });
  inbox = await appApi.admin.messages.list();
  t("هر دو پیام در صندوق‌اند", inbox.length === 2, String(inbox.length));
  const aiMsg = inbox.find((m) => m.source === "ai");
  t("منبع «پشتیبان هوشمند» ثبت شد", !!aiMsg);
  t("متن سوال درست است", aiMsg.text === "مالیات حقوق چقدر است؟");
  t("این هم خوانده‌نشده است", aiMsg.unread === true);
  t("این هم به کاربر وصل است", !!aiMsg.userId);

  section("کاربر پیام‌های خودش را می‌بیند");
  let mine = await appApi.support.myMessages();
  t("هر دو پیام کاربر", mine.length === 2, String(mine.length));

  section("پاسخ ادمین به پروفایل کاربر می‌رسد");
  const target = inbox.find((m) => m.source === "contact");
  await appApi.admin.messages.reply(target.id, {
    text: "سلام، بفرمایید در خدمتم",
    adminName: "مدیر سایت",
  });

  mine = await appApi.support.myMessages();
  const answered = mine.find((m) => String(m.id) === String(target.id));
  t(
    "پاسخ در نخ گفتگو هست",
    answered.history.length === 2,
    String(answered.history.length),
  );
  t("حباب دوم از ادمین است", answered.history[1].sender === "admin");
  t(
    "متن پاسخ درست است",
    answered.history[1].text === "سلام، بفرمایید در خدمتم",
  );
  t("نام پاسخ‌دهنده ثبت شد", answered.history[1].name === "مدیر سایت");
  t("بعد از پاسخ خوانده‌شده است", answered.unread === false);
  t(
    "پیام دیگر هنوز بی‌پاسخ است",
    mine.find((m) => m.source === "ai").history.length === 1,
  );

  section("پیام تازه، اولین پیام لیست می‌شود");
  // End to end: send one more and it must be at the front of what the API
  // hands the panel, ahead of the two already there.
  await new Promise((r) => setTimeout(r, 20));
  await appApi.support.sendMessage({
    name: "سام به‌نام",
    email: "sam@test.com",
    subject: "question",
    message: "این باید اول لیست باشد",
    source: "contact",
  });
  const afterSend = await appApi.admin.messages.list();
  t(
    "تازه‌ترین پیام صدر لیست است",
    afterSend[0].text === "این باید اول لیست باشد",
    afterSend[0].text,
  );
  t(
    "زمان ارسال ذخیره می‌شود",
    !!afterSend[0].createdAt,
    String(afterSend[0].createdAt),
  );
  t(
    "ترتیب نزولی است",
    afterSend.every(
      (m, i) =>
        i === 0 ||
        Date.parse(afterSend[i - 1].createdAt || 0) >=
          Date.parse(m.createdAt || 0),
    ),
    afterSend.map((m) => m.text.slice(0, 12)).join(" | "),
  );

  section("پیام کاربر دیگر نشت نمی‌کند");
  await appApi.auth.logout();
  await appApi.auth.register({
    name: "مریم حسینی",
    email: "maryam@test.com",
    password: "12345678",
    phone: "09122223344",
  });
  const hers = await appApi.support.myMessages();
  t("کاربر تازه پیامی ندارد", hers.length === 0, String(hers.length));
  await appApi.support.sendMessage({
    name: "مریم حسینی",
    email: "maryam@test.com",
    subject: "feedback",
    message: "پیشنهاد دارم",
    source: "contact",
  });
  const hers2 = await appApi.support.myMessages();
  t("فقط پیام خودش را می‌بیند", hers2.length === 1, String(hers2.length));
  t("پیام سام را نمی‌بیند", !hers2.some((m) => m.email === "sam@test.com"));

  inbox = await appApi.admin.messages.list();
  t("ادمین همه را می‌بیند", inbox.length === 4, String(inbox.length));

  section("اعتبارسنجی");
  try {
    await appApi.support.sendMessage({
      name: "",
      email: "x@y.com",
      subject: "q",
      message: "hi",
    });
    t("نام خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("نام خالی رد می‌شود", true);
  }
  try {
    await appApi.support.sendMessage({
      name: "x",
      email: "x@y.com",
      subject: "q",
      message: "",
    });
    t("متن خالی رد می‌شود", false, "خطا نداد");
  } catch (e) {
    t("متن خالی رد می‌شود", true);
  }

  /* ------------------------------------------------------------ admin panel */
  section("نمایش در تب پیام‌ها");
  const adminMsgs = await appApi.admin.messages.list();

  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const panelStore = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "m@x.com", role: "مدیر سایت" },
    }),
    irHesabdarMessages: JSON.stringify(adminMsgs),
  };
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (k) => (k in panelStore ? panelStore[k] : null),
      setItem: (k, v) => {
        panelStore[k] = String(v);
      },
      removeItem: (k) => {
        delete panelStore[k];
      },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });

  const FILES = adminScripts();
  const src = FILES.map((x) =>
    fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
  );
  src.push(`window.__t = {
    renderMessages, renderFloatingMessages, updateMessagesBadgeCount,
    isUnreadMessage, isUnanswered, messageSourceBadge, switchView,
    sortMessagesByArrival, messageArrivalTime,
    set messages(v) { appState.messages = v; },
    get messages() { return appState.messages; },
  };`);
  try {
    w.eval(src.join("\n;\n"));
  } catch (e) {
    console.log("   [bundle] " + e.message.slice(0, 140));
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  const doc = w.document;

  w.__t.messages = adminMsgs;
  w.__t.renderMessages();
  w.__t.updateMessagesBadgeCount();

  const box = doc.getElementById("messagesListContainer");
  t(
    "همه پیام‌ها رندر شدند",
    box.querySelectorAll('[id^="msg-thread-"]').length === 4,
    String(box.querySelectorAll('[id^="msg-thread-"]').length),
  );
  t(
    "پیام تماس با ما دیده می‌شود",
    box.textContent.includes("درباره دوره سوال دارم"),
  );
  t("پیام پشتیبان هوشمند دیده می‌شود", box.textContent.includes("مالیات حقوق"));
  t("پاسخ ادمین دیده می‌شود", box.textContent.includes("بفرمایید در خدمتم"));

  section("برچسب منبع پیام");
  t("برچسب پشتیبان هوشمند هست", box.innerHTML.includes("msg-source--ai"));
  t("برچسب فرم تماس هست", box.innerHTML.includes("msg-source--contact"));
  t(
    "متن «پشتیبان هوشمند» نوشته شده",
    box.textContent.includes("پشتیبان هوشمند"),
  );
  t(
    "متن «فرم تماس با ما» نوشته شده",
    box.textContent.includes("فرم تماس با ما"),
  );

  section("شمارش خوانده‌نشده‌ها");
  // Two are still unread (the ai one and Maryam's); the replied one is read.
  const badge = doc.getElementById("messages-badge");
  t(
    "بج سایدبار نمایش داده می‌شود",
    badge.style.display !== "none",
    badge.style.display,
  );
  t("عدد بج درست است", badge.textContent === "۳", badge.textContent);
  t(
    "نقطه هدر روشن است",
    doc.getElementById("messages-header-badge").style.display === "block",
  );
  t(
    "خلاصه بالای صندوق درست است",
    box.textContent.includes("۳ خوانده‌نشده"),
    box.textContent.slice(0, 120).replace(/\s+/g, " "),
  );

  section("آخرین پیام باید اولین باشد");
  // The inbox used to put unread and unanswered threads above everything
  // else, and only then fall back to `b.id - a.id`. Ids are random UUID
  // strings, so that subtraction is NaN and the order never actually
  // changed. Ordering is purely by arrival time now: the message that just
  // came in is the one at the top, whatever its read state.
  const threadTexts = [...box.querySelectorAll('[id^="msg-thread-"]')].map(
    (el) => el.querySelector("p").textContent.trim(),
  );
  t(
    "تازه‌ترین پیام اول است",
    threadTexts[0].includes("پیشنهاد دارم"),
    threadTexts[0].slice(0, 40),
  );
  t(
    "قدیمی‌ترین پیام آخر است",
    threadTexts[threadTexts.length - 1].includes("درباره دوره سوال دارم"),
    threadTexts[threadTexts.length - 1].slice(0, 40),
  );

  // Sorting must be the same list in the same order in both places, or the
  // dropdown and the tab disagree about which message is newest.
  w.__t.renderFloatingMessages();
  const floatTexts = [
    ...doc.querySelectorAll("#floatingMessagesContainer .floating-msg-item"),
  ].map((el) => el.querySelectorAll("p")[0].textContent.trim());
  t(
    "آیکون پیام همان ترتیب را دارد",
    floatTexts[0].includes("پیشنهاد دارم"),
    floatTexts[0].slice(0, 40),
  );
  t(
    "هر دو لیست هم‌تعدادند",
    floatTexts.length === threadTexts.length,
    `${floatTexts.length} / ${threadTexts.length}`,
  );

  section("خواندن و پاسخ دادن ترتیب را به‌هم نمی‌زند");
  // A replied thread must not jump to the bottom, and reading an old message
  // must not push it up. Only arrival time decides.
  const ordered = [
    {
      id: "a",
      text: "قدیمی، خوانده‌نشده",
      createdAt: "2026-07-01T10:00:00Z",
      unread: true,
      history: [
        { sender: "user", name: "x", text: "قدیمی، خوانده‌نشده", time: "۱" },
      ],
    },
    {
      id: "b",
      text: "میانی، پاسخ داده شده",
      createdAt: "2026-07-02T10:00:00Z",
      unread: false,
      history: [
        { sender: "user", name: "x", text: "میانی، پاسخ داده شده", time: "۲" },
        { sender: "admin", name: "م", text: "پاسخ", time: "۲" },
      ],
    },
    {
      id: "c",
      text: "تازه‌ترین، خوانده‌شده",
      createdAt: "2026-07-03T10:00:00Z",
      unread: false,
      history: [
        { sender: "user", name: "x", text: "تازه‌ترین، خوانده‌شده", time: "۳" },
      ],
    },
  ];
  w.__t.messages = ordered;
  w.__t.renderMessages();
  const byArrival = [
    ...doc.querySelectorAll('#messagesListContainer [id^="msg-thread-"]'),
  ].map((el) => el.querySelector("p").textContent.trim());
  t(
    "تازه‌ترین اول، حتی وقتی خوانده شده",
    byArrival[0].includes("تازه‌ترین"),
    byArrival[0],
  );
  t("پاسخ‌داده‌شده وسط می‌ماند", byArrival[1].includes("میانی"), byArrival[1]);
  t(
    "قدیمی آخر، حتی وقتی خوانده‌نشده",
    byArrival[2].includes("قدیمی"),
    byArrival[2],
  );

  section("مرتب‌سازی بدون زمان ارسال");
  t(
    "پیام بدون createdAt ته لیست می‌رود",
    w.__t.sortMessagesByArrival([
      { id: "no-stamp", text: "بی‌تاریخ" },
      { id: "z", text: "با تاریخ", createdAt: "2026-07-05T10:00:00Z" },
    ])[0].text === "با تاریخ",
  );
  t(
    "شناسه UUID ترتیب را تعیین نمی‌کند",
    w.__t.sortMessagesByArrival([
      { id: "message-zzzz", createdAt: "2026-07-01T10:00:00Z", text: "قدیمی" },
      { id: "message-aaaa", createdAt: "2026-07-09T10:00:00Z", text: "جدید" },
    ])[0].text === "جدید",
  );
  t("لیست خالی خطا نمی‌دهد", w.__t.sortMessagesByArrival([]).length === 0);
  t(
    "ورودی نامعتبر خطا نمی‌دهد",
    w.__t.sortMessagesByArrival(null).length === 0,
  );
  t(
    "آرایه اصلی دست‌نخورده می‌ماند",
    (() => {
      const src = [
        { id: "1", createdAt: "2026-07-01T10:00:00Z" },
        { id: "2", createdAt: "2026-07-09T10:00:00Z" },
      ];
      w.__t.sortMessagesByArrival(src);
      return src[0].id === "1";
    })(),
  );

  section("آیکون پیام هدر به تب وصل است");
  // Restore the real inbox: the ordering checks above swapped in a small
  // fixture to isolate the sort.
  w.__t.messages = adminMsgs;
  w.__t.renderMessages();
  const openBtn = doc.getElementById("openMessagesTabBtn");
  t("دکمه «مشاهده همه پیام‌ها» هست", !!openBtn);
  w.__t.renderFloatingMessages();
  t(
    "لیست شناور پر شد",
    doc.getElementById("floatingMessagesContainer").children.length === 4,
    String(doc.getElementById("floatingMessagesContainer").children.length),
  );
  openBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t(
    "به تب پیام‌ها می‌رود",
    doc.getElementById("view-messages").classList.contains("active"),
  );
  t(
    "پنل شناور بسته شد",
    doc.getElementById("messagesFloatingPanel").style.display === "none",
  );

  section("پیام آزمایشی حذف شده");
  t("«پشتیبان تستی» ساختگی نیست", !box.textContent.includes("پشتیبان تستی"));
  t(
    "تعداد با داده واقعی می‌خواند",
    w.__t.messages.length === 4,
    String(w.__t.messages.length),
  );

  section("امنیت نمایش پیام");
  w.__t.messages = [
    {
      id: "x1",
      sender: "<img src=x onerror=alert(1)>",
      email: "a@b.c",
      text: "<script>alert(2)</script>",
      time: "۱۴۰۵/۰۵/۰۱",
      unread: true,
      source: "contact",
      history: [
        {
          sender: "user",
          name: "x",
          text: "<script>alert(3)</script>",
          time: "۱۴۰۵/۰۵/۰۱",
        },
      ],
    },
  ];
  w.__t.renderMessages();
  const nasty = doc.getElementById("messagesListContainer").innerHTML;
  t("نام خطرناک خنثی شد", !nasty.includes("<img src=x"), nasty.slice(0, 100));
  t("متن حباب خنثی شد", !nasty.includes("<script>alert(3)"));
  t("متن امن نمایش داده شد", nasty.includes("&lt;script&gt;"));

  section("حالت صندوق خالی");
  w.__t.messages = [];
  w.__t.renderMessages();
  w.__t.updateMessagesBadgeCount();
  t(
    "پیام خالی بودن",
    doc
      .getElementById("messagesListContainer")
      .textContent.includes("هیچ پیامی"),
  );
  t(
    "بج پنهان می‌شود",
    doc.getElementById("messages-badge").style.display === "none",
  );
  t(
    "نقطه هدر خاموش",
    doc.getElementById("messages-header-badge").style.display === "none",
  );

  section("تشخیص خوانده‌نشده");
  t("unread صریح", w.__t.isUnreadMessage({ unread: true }) === true);
  t("read صریح", w.__t.isUnreadMessage({ read: true }) === false);
  t(
    "فقط read:false هم خوانده‌نشده است",
    w.__t.isUnreadMessage({ read: false }) === true,
  );
  t("بدون هیچ پرچم، خوانده‌نشده", w.__t.isUnreadMessage({}) === true);
  t(
    "unread بر read اولویت دارد",
    w.__t.isUnreadMessage({ unread: false, read: false }) === false,
  );

  /* ------------------------------------------------- support page + widget */
  section("صفحه تماس با ما");
  const supportHtml = fs.readFileSync(
    path.join(ROOT, "html/support.html"),
    "utf8",
  );
  t(
    "گزینه «گزارش مشکل» از موضوع حذف شد",
    !supportHtml.includes(">گزارش مشکل<"),
  );
  t("بخش «گزارش تخلف» اضافه شد", supportHtml.includes("گزارش تخلف"));
  t(
    "زیر فرم ارسال پیام است",
    supportHtml.indexOf("گزارش تخلف") > supportHtml.indexOf('id="contactForm"'),
  );
  t(
    "سه گزینه موضوع مانده",
    (
      supportHtml.match(/<option value="(question|feedback|cooperation)"/g) ||
      []
    ).length === 3,
  );
  const supportJs = fs.readFileSync(
    path.join(ROOT, "scripts/support.js"),
    "utf8",
  );
  t("bug از فهرست موضوع‌ها رفت", !supportJs.includes("bug:"));
  t("منبع contact ارسال می‌شود", supportJs.includes('source: "contact"'));
  t(
    "نام و ایمیل کاربر لاگین‌کرده پر می‌شود",
    supportJs.includes("hesabyarSession"),
  );

  section("ویجت پشتیبان هوشمند");
  const widgetJs = fs.readFileSync(
    path.join(ROOT, "scripts/ai-widget.js"),
    "utf8",
  );
  t("به appApi وصل شد", widgetJs.includes("appApi.support.sendMessage"));
  t("منبع ai علامت می‌خورد", widgetJs.includes('source: "ai"'));
  t("ورود کاربر بررسی می‌شود", widgetJs.includes("aiCurrentUser"));
  t("بدون لاگین قفل می‌شود", widgetJs.includes("refreshAiGate"));
  t("متن کاربر امن درج می‌شود", widgetJs.includes("div.textContent = text"));
  t(
    "خطای ارسال به کاربر گفته می‌شود",
    widgetJs.includes("ارسال پیام انجام نشد"),
  );

  section("ویجت واقعاً از صفحه اصلی پیام می‌فرستد");
  // Loads index.html with the same script order the real page uses, then
  // clicks the send button. A static check on the source cannot catch the
  // bug this covers: the endpoint requires an email, and a session created
  // by the dev helpers has none, so every send was rejected and the widget
  // blamed the connection.
  async function bootHome(seed) {
    const homeHtml = fs.readFileSync(
      path.join(ROOT, "html/index.html"),
      "utf8",
    );
    const d = new JSDOM(homeHtml, {
      url: "http://localhost/html/index.html",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const win = d.window;
    const st = Object.assign({}, seed);
    Object.defineProperty(win, "localStorage", {
      value: {
        getItem: (k) => (k in st ? st[k] : null),
        setItem: (k, v) => {
          st[k] = String(v);
        },
        removeItem: (k) => {
          delete st[k];
        },
      },
      configurable: true,
    });
    Object.defineProperty(win, "console", {
      value: { log() {}, warn() {}, error() {} },
      configurable: true,
    });
    const homeFiles = pageScripts("index.html", {
      exclude: ["up-btn.js", "toggle-btn.js"],
    });
    const homeSrc = homeFiles.map((x) =>
      fs.readFileSync(path.join(ROOT, "scripts", x), "utf8"),
    );
    homeSrc.push(`window.__w = { appApi, refreshAiGate };`);
    win.eval(homeSrc.join("\n;\n"));
    win.document.dispatchEvent(
      new win.Event("DOMContentLoaded", { bubbles: true }),
    );
    return win;
  }
  const lastBubble = (win) => {
    const all = [...win.document.querySelectorAll("#aiMessages .ai-message")];
    return all.length ? all[all.length - 1].textContent.trim() : "";
  };
  async function sendVia(win, question) {
    win.document.getElementById("aiInput").value = question;
    win.document
      .getElementById("aiSendBtn")
      .dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
  }

  const fullSession = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: false,
      user: { id: "u1", name: "سام", email: "sam@t.com", role: "کاربر عادی" },
    }),
  };
  let hw = await bootHome(fullSession);
  await sendVia(hw, "مالیات حقوق چقدر است؟");
  t(
    "پیام ویجت واقعاً ارسال شد",
    !lastBubble(hw).includes("انجام نشد"),
    lastBubble(hw).slice(0, 70),
  );
  let hwInbox = await hw.__w.appApi.admin.messages.list();
  t("در صندوق ادمین نشست", hwInbox.length === 1, String(hwInbox.length));
  t(
    "با برچسب پشتیبان هوشمند",
    hwInbox[0] && hwInbox[0].source === "ai",
    hwInbox[0] && hwInbox[0].source,
  );

  // The reported failure: a session with no email address.
  const noEmail = {
    hesabyarSession: JSON.stringify({
      token: "t",
      isAdmin: true,
      user: { id: "u2", name: "مدیر سایت", role: "مدیر سایت" },
    }),
  };
  hw = await bootHome(noEmail);
  await sendVia(hw, "سوال بدون ایمیل");
  t(
    "سشن بدون ایمیل هم کار می‌کند",
    !lastBubble(hw).includes("انجام نشد"),
    lastBubble(hw).slice(0, 70),
  );
  hwInbox = await hw.__w.appApi.admin.messages.list();
  t("پیامش هم ثبت شد", hwInbox.length === 1, String(hwInbox.length));

  hw = await bootHome({
    hesabyarSession: JSON.stringify({
      token: "t",
      user: { id: "u3", email: "x@y.com" },
    }),
  });
  await sendVia(hw, "سوال بدون نام");
  t(
    "سشن بدون نام هم کار می‌کند",
    !lastBubble(hw).includes("انجام نشد"),
    lastBubble(hw).slice(0, 70),
  );

  section("پیام خطا باید راست بگوید");
  hw = await bootHome(fullSession);
  hw.eval(
    'appApi.support.sendMessage = async () => { throw new Error("سرور در دسترس نیست."); };',
  );
  await sendVia(hw, "تست خطا");
  t(
    "علت واقعی خطا نشان داده می‌شود",
    lastBubble(hw).includes("سرور در دسترس نیست"),
    lastBubble(hw),
  );
  t(
    "اتهام بی‌جا به اینترنت نمی‌زند",
    !lastBubble(hw).includes("اتصال خود را بررسی"),
    lastBubble(hw),
  );
  t(
    "کادر بعد از خطا دوباره فعال می‌شود",
    hw.document.getElementById("aiInput").disabled === false,
  );

  section("قفل ورود");
  hw = await bootHome({});
  t(
    "مهمان نمی‌تواند بنویسد",
    hw.document.getElementById("aiInput").disabled === true,
  );
  t(
    "راهنمای ورود نشان داده می‌شود",
    !!hw.document.querySelector(".ai-login-hint"),
  );
  await sendVia(hw, "پیام مهمان");
  const guestInbox = await hw.__w.appApi.admin.messages.list();
  t(
    "پیام مهمان ثبت نمی‌شود",
    guestInbox.length === 0,
    String(guestInbox.length),
  );

  section("تب پیام‌های من در پروفایل");
  const profileHtml = fs.readFileSync(
    path.join(ROOT, "html/user-profile.html"),
    "utf8",
  );
  t("تب اضافه شد", profileHtml.includes('data-tab="messages"'));
  t("محفظه لیست هست", profileHtml.includes('id="myMessagesList"'));
  t("بج تب هست", profileHtml.includes('id="myMessagesBadge"'));
  const profileJs = fs.readFileSync(
    path.join(ROOT, "scripts/user-profile.js"),
    "utf8",
  );
  t("از appApi می‌خواند", profileJs.includes("appApi.support.myMessages"));
  t("پاسخ ادمین جدا نمایش داده می‌شود", profileJs.includes("is-admin"));
  t("متن پیام امن نمایش داده می‌شود", profileJs.includes("escapeProfileHtml"));

  console.log(`\n${p} تست موفق، ${f} ناموفق`);
  process.exit(f ? 1 : 0);
})();
