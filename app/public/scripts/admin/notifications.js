/**
 * Admin panel — notifications and the bell
 *
 * Seven event sources reach the bell: new order, successful payment, failed
 * payment, new signup, staff profile change, admin deletion and violation
 * report.
 *
 * Two rules that are easy to confuse, and were the cause of a real bug:
 * creating a notification record and being allowed to SEE it are separate
 * things. pushAdminNotification() used to return null when the current
 * operator had no right to view the event - so the record was never created
 * at all, and a manager logging in later saw nothing. The record is always
 * built and stored; canReceiveNotification() only filters the display.
 *
 * reconcileNotifications() exists because notifications used to be raised
 * only from a 'storage' event, which fires only in OTHER tabs open at that
 * moment. An order placed overnight produced nothing at all.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

/**
 * Mirror one notification to the server.
 *
 * Notifications were browser-only, so two operators never saw the same list
 * and a refresh could lose an event nobody had read yet. Writes go through
 * appApi as well now; the local copy stays as an offline cache.
 */
function syncNotification(notification) {
  if (
    typeof appApi === "undefined" ||
    !appApi.admin ||
    !appApi.admin.notifications
  )
    return;
  persistAdmin(appApi.admin.notifications.create(notification), "ثبت اعلان");
}

function formatNotificationTime(timestamp, fallback = "همین حالا") {
  if (!timestamp) return fallback;
  const minutes = Math.floor((Date.now() - Number(timestamp)) / 60000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return toPersianDigits(minutes) + " دقیقه پیش";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return toPersianDigits(hours) + " ساعت پیش";
  const days = Math.floor(hours / 24);
  if (days < 7) return toPersianDigits(days) + " روز پیش";
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return toPersianDigits(weeks) + " هفته پیش";
  return toPersianDigits(Math.floor(days / 30)) + " ماه پیش";
}

// Notification source mapping (7 sources as defined by user):
// purchase = ثبت سفارش جدید / پرداخت موفق / پرداخت ناموفق
// user     = ثبت نام کاربر جدید
// staff    = تغییر پروفایل توسط ادمین یا مدیر (NOT for admins)
// report   = گزارش تخلف (NOT for admins, later connected to support)
// deletion = حذف ادمین توسط مدیر
const notificationThemes = {
  purchase: "green",
  user: "blue",
  staff: "yellow",
  report: "red",
  deletion: "black",
};
// Frontend permission guard. The backend must apply this same policy when it delivers notification records.
function currentNotificationRole() {
  const member = appState.users.find((u) => u.id === currentStaffProfileId);
  return member
    ? member.role
    : currentAdminUserRole === "admin"
      ? "ادمین"
      : "مدیر سایت";
}
// Notification filtering rules (as per user requirements / backend will specify roles later):
// - Admins ("ادمین") receive ONLY: purchase (new order, success/fail), user (new user), deletion (admin deleted by manager)
// - Admins do NOT receive: staff (profile change by admin/manager), report (violation report)
// - Managers ("مدیر") receive ALL notification types
function canReceiveNotification(notification) {
  return (
    currentNotificationRole() !== "ادمین" ||
    !["staff", "report"].includes(notification.type)
  );
}
function visibleNotifications() {
  return appState.notifications.filter(canReceiveNotification);
}
let bellTimer = null;
function pushAdminNotification(type, title, desc, details = {}) {
  const theme = notificationThemes[type] || "blue";
  // Recording an event and being allowed to see it are two different things.
  // This used to `return null` when the signed-in operator could not view the
  // type, so an admin editing their own profile created no record at all -
  // and the managers who were supposed to be told never found out. The event
  // is always stored; visibleNotifications() decides who sees it.
  const notification = {
    id: Date.now(),
    type,
    theme,
    title,
    desc,
    time: "همین حالا",
    createdAt: Date.now(),
    unread: true,
    fresh: true,
    details,
  };
  appState.notifications.unshift(notification);
  persistAdminNotifications();
  syncNotification(notification);
  // Only ring the bell for someone entitled to read it.
  if (canReceiveNotification(notification)) {
    activateNotificationBell(theme);
  }
  renderNotificationDropdownItems();
  renderNotificationsPage();
  return notification;
}
// Backend integration point: map the API response to { type, title, desc, details }.
// Each event type owns its display schema, so adding API fields never affects other notification types.
const notificationDetailSchemas = {
  purchase: {
    label: "سفارش و پرداخت",
    icon: "fa-bag-shopping",
    fields: [
      "شماره سفارش",
      "خریدار",
      "ایمیل خریدار",
      "تلفن خریدار",
      "محصول",
      "مبلغ",
      "وضعیت پرداخت",
      "روش پرداخت",
      "کد پیگیری",
      "تاریخ ثبت",
    ],
  },
  user: {
    label: "ثبت‌نام کاربر",
    icon: "fa-user-plus",
    fields: [
      "شناسه کاربر",
      "نام کاربر",
      "ایمیل",
      "تلفن",
      "نقش",
      "وضعیت حساب",
      "روش ثبت‌نام",
      "تاریخ ثبت‌نام",
    ],
  },
  staff: {
    label: "تغییرات پروفایل ادمین",
    icon: "fa-user-gear",
    fields: ["کاربر", "نقش", "موارد تغییرکرده", "زمان تغییر", "نشانی IP"],
  },
  deletion: {
    label: "حذف حساب مدیریت",
    icon: "fa-user-slash",
    fields: ["حساب حذف‌شده", "نقش", "حذف‌کننده", "شناسه حذف‌کننده", "تاریخ"],
  },
  report: {
    label: "گزارش تخلف",
    icon: "fa-flag",
    fields: [
      "شناسه گزارش",
      "گزارش‌دهنده",
      "کاربر/مورد گزارش‌شده",
      "نوع گزارش",
      "درجه اهمیت",
      "وضعیت رسیدگی",
      "شرح",
      "مدرک پیوست",
      "تاریخ",
    ],
  },
};

function activateNotificationBell(theme) {
  const bell = document.getElementById("notificationBtn");
  if (!bell) return;
  clearTimeout(bellTimer);
  bell.classList.remove(
    "bell-green",
    "bell-blue",
    "bell-yellow",
    "bell-red",
    "bell-black",
  );
  bell.classList.add("bell-red");
  bellTimer = setTimeout(
    () =>
      bell.classList.remove(
        "bell-green",
        "bell-blue",
        "bell-yellow",
        "bell-red",
        "bell-black",
      ),
    10000,
  );
}
function notificationCardSummary(n) {
  const d = n.details || {};
  if (n.type === "user")
    return `${d["نام کاربر"] || "کاربر جدید"} · ${d["ایمیل"] || "—"}`;
  if (n.type === "report")
    return `${d["شناسه گزارش"] || "گزارش"} · ${d["درجه اهمیت"] || "—"} · ${d["وضعیت رسیدگی"] || "جدید"}`;
  return n.desc;
}
/** Icon for a notification type. */
function notificationIcon(type) {
  return type === "purchase"
    ? "fa-circle-check"
    : type === "user"
      ? "fa-user-plus"
      : type === "staff"
        ? "fa-user-gear"
        : type === "deletion"
          ? "fa-user-slash"
          : "fa-flag";
}

/** Safely hand a notification object to an inline onclick. */
function notificationPayload(n) {
  return JSON.stringify({
    id: n.id,
    type: n.type,
    theme: n.theme || "blue",
    title: n.title,
    desc: n.desc,
    time: n.time,
    createdAt: n.createdAt || null,
    unread: !!n.unread,
    fresh: !!n.fresh,
    details: n.details || {},
  }).replace(/"/g, "&quot;");
}

function renderNotificationsPage() {
  const container = document.getElementById("notificationsPageList");
  if (!container) return;

  const items = visibleNotifications();
  const clearBtn = document.getElementById("clearAllNotifsBtn");
  if (clearBtn) clearBtn.style.display = items.length ? "inline-flex" : "none";

  if (!items.length) {
    container.innerHTML =
      '<p style="text-align:center;padding:2rem">اعلانی وجود ندارد.</p>';
    return;
  }

  container.innerHTML = items
    .map((n) => {
      return `<div class="notification-item notification-${n.theme || "blue"}" style="cursor: pointer;"
      onclick="openNotificationDetails(${notificationPayload(n)})">
      <i class="fas ${notificationIcon(n.type)}"></i>
      <div><strong>${escapeHtml(n.title)}</strong><p>${notificationCardSummary(n)}</p>
        <small>${formatNotificationTime(n.createdAt, n.time)}</small></div>
      <button type="button" class="notif-delete"
              title="حذف این اعلان" aria-label="حذف این اعلان"
              data-delete-notification="${escapeAttr(String(n.id))}">
        <i class="fas fa-trash"></i>
      </button>
    </div>`;
    })
    .join("");
}
window.pushAdminNotification = pushAdminNotification;

/* ============================================================================
   CATCHING UP ON EVENTS THAT HAPPENED WHILE THE PANEL WAS CLOSED
   ----------------------------------------------------------------------------
   Notifications used to be raised only from a "storage" event, which the
   browser fires only in *other* tabs that are open at the same time. So an
   order placed overnight, or a signup while the panel was shut, produced
   nothing at all - the operator opened the panel to an empty bell.

   Every source is reconciled on load instead: whatever is on record but has
   not been announced yet gets a notification. A seen-id ledger keeps that
   from repeating on the next refresh.
   ========================================================================== */
const ANNOUNCED_KEY = "irHesabdarAnnouncedEvents";

function loadAnnouncedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANNOUNCED_KEY));
    if (raw && typeof raw === "object") return raw;
  } catch (e) {}
  return { orders: [], users: [], reports: [] };
}

let announcedEvents = loadAnnouncedIds();

function saveAnnouncedIds() {
  try {
    // Keep the ledger bounded; only the newest ids can still be "new".
    const trim = (list) => (Array.isArray(list) ? list.slice(-500) : []);
    localStorage.setItem(
      ANNOUNCED_KEY,
      JSON.stringify({
        orders: trim(announcedEvents.orders),
        users: trim(announcedEvents.users),
        reports: trim(announcedEvents.reports),
      }),
    );
  } catch (e) {}
}

function wasAnnounced(bucket, id) {
  const list = announcedEvents[bucket] || [];
  return list.indexOf(String(id)) !== -1;
}

function markAnnounced(bucket, id) {
  (announcedEvents[bucket] ||= []).push(String(id));
}

/** One order -> one notification, worded by how the payment ended. */
function announceOrder(order) {
  if (!order || !order.id || wasAnnounced("orders", order.id)) return;
  markAnnounced("orders", order.id);

  const titles = {
    success: "پرداخت موفق",
    failed: "پرداخت ناموفق",
    cancelled: "سفارش لغو شده",
  };
  const title = titles[order.status] || "ثبت سفارش جدید";

  pushAdminNotification(
    "purchase",
    title,
    `سفارش ${order.id} ${
      order.status === "success"
        ? "با موفقیت پرداخت شد"
        : order.status === "failed"
          ? "با خطای پرداخت مواجه شد"
          : order.status === "cancelled"
            ? "توسط کاربر لغو شد"
            : "ثبت شد"
    }.`,
    {
      "شماره سفارش": order.id || "—",
      خریدار: order.customer || "—",
      "ایمیل خریدار": order.buyerEmail || "—",
      "تلفن خریدار": toPersianDigits(order.buyerPhone || "—"),
      محصول: order.product || "—",
      مبلغ:
        typeof formatOrderAmount === "function"
          ? formatOrderAmount(order.amount)
          : String(order.amount || "—"),
      "وضعیت پرداخت": getStatusText(order.status),
      "روش پرداخت": order.gateway || "درگاه پرداخت",
      "کد پیگیری": order.trackingCode || order.id || "—",
      "تاریخ ثبت": toPersianDigits(order.date || "—"),
    },
  );
}

/** A visitor who created an account on the public site. */
function announceUser(user) {
  if (!user || !user.id || wasAnnounced("users", user.id)) return;
  // Staff accounts are created inside the panel; only public signups qualify.
  if (user.role && user.role !== "کاربر عادی") return;
  markAnnounced("users", user.id);

  pushAdminNotification(
    "user",
    "ثبت‌نام کاربر جدید",
    `کاربر «${user.name || "جدید"}» به سامانه پیوست.`,
    {
      "شناسه کاربر": "#" + toPersianDigits(user.id),
      "نام کاربر": user.name || "—",
      ایمیل: user.email || "—",
      تلفن: toPersianDigits(user.phone || "—"),
      نقش: user.role || "کاربر عادی",
      "وضعیت حساب": user.status || "فعال",
      "روش ثبت‌نام": "فرم ثبت‌نام سایت",
      "تاریخ ثبت‌نام": toPersianDigits(
        user.createdAt
          ? new Date(user.createdAt).toLocaleDateString("fa-IR")
          : "—",
      ),
    },
  );
}

/** A violation report filed from the support page. */
function announceReport(report) {
  if (!report || !report.id || wasAnnounced("reports", report.id)) return;
  markAnnounced("reports", report.id);

  pushAdminNotification(
    "report",
    "گزارش تخلف جدید",
    `کاربر «${report.reporterName || "ناشناس"}» یک گزارش تخلف ثبت کرده است.`,
    {
      "شناسه گزارش": report.id,
      گزارش‌دهنده: report.reporterName || "ناشناس",
      "کاربر/مورد گزارش‌شده": report.subject || "—",
      "نوع گزارش": REPORT_KIND_LABELS[report.kind] || report.kind || "—",
      "درجه اهمیت":
        REPORT_SEVERITY_LABELS[report.severity] || report.severity || "متوسط",
      "وضعیت رسیدگی":
        report.status === "reviewed" ? "بررسی شد" : "در انتظار بررسی",
      شرح: report.description || "—",
      "مدرک پیوست": report.evidenceImage ? "تصویر پیوست شده" : "—",
      تاریخ: toPersianDigits(report.date || "—"),
    },
  );
}

const REPORT_KIND_LABELS = {
  content: "محتوای نامناسب",
  copyright: "نقض حق نشر",
  abuse: "سوءاستفاده یا توهین",
  fraud: "کلاهبرداری",
  other: "سایر موارد",
};
const REPORT_SEVERITY_LABELS = { low: "کم", medium: "متوسط", high: "زیاد" };

/**
 * Violation reports.
 *
 * Read straight from storage so the first paint is synchronous; the
 * authoritative copy arrives with hydrateFromApi(), which calls
 * appApi.admin.reports.list(). Once a real server is attached that call is
 * the only thing that matters and this becomes a cache read.
 */
function loadAbuseReports() {
  try {
    const raw = JSON.parse(localStorage.getItem("irHesabdarReports"));
    if (Array.isArray(raw)) return raw;
  } catch (e) {}
  return [];
}

/**
 * Announce anything on record that has not been announced yet.
 * Safe to call repeatedly - the ledger stops duplicates.
 */
function reconcileNotifications() {
  const before = appState.notifications.length;

  // Oldest first, so the newest event ends up at the top of the list.
  (appState.orders || []).slice().reverse().forEach(announceOrder);
  (appState.users || []).forEach(announceUser);
  loadAbuseReports().slice().reverse().forEach(announceReport);

  if (appState.notifications.length !== before) {
    persistAdminNotifications();
    renderNotificationDropdownItems();
    renderNotificationsPage();
  }
  saveAnnouncedIds();
}

function initNotifications() {
  const btn = document.getElementById("notificationBtn");
  const dropdown = document.getElementById("notificationDropdown");
  const markAllBtn = document.getElementById("markAllRead");

  if (btn && dropdown) {
    const setPanelOpen = (isOpen) => {
      dropdown.classList.toggle("active", isOpen);
      document.body.classList.toggle("notification-panel-open", isOpen);
      if (isOpen) lockBodyScroll();
      else unlockBodyScroll();
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !dropdown.classList.contains("active");
      if (willOpen) renderNotificationDropdownItems();
      setPanelOpen(willOpen);
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        setPanelOpen(false);
      }
    });

    // Escape should close it too - a panel you can only dismiss by clicking
    // elsewhere is a small trap for keyboard users.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dropdown.classList.contains("active")) {
        setPanelOpen(false);
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener("click", () => {
      dropdown.classList.remove("active");
      document.body.classList.remove("notification-panel-open");
      unlockBodyScroll();
      switchView("notifications");
      renderNotificationsPage();
    });
  }
}

function openNotificationDetails(notification) {
  if (!notification) return;
  const d = notification.details || {};
  const schema = notificationDetailSchemas[notification.type] || {
    label: "اعلان",
    icon: "fa-bell",
  };

  document.getElementById("notifDetailTitle").textContent =
    notification.title || "اعلان سیستم";
  document.getElementById("notifDetailTime").textContent =
    formatNotificationTime(notification.createdAt, notification.time) +
    " · " +
    (notification.type === "purchase"
      ? "سفارش و پرداخت"
      : notification.type === "user"
        ? "ثبت‌نام کاربر"
        : notification.type === "staff"
          ? "تغییر پروفایل"
          : notification.type === "report"
            ? "گزارش تخلف"
            : notification.type === "deletion"
              ? "حذف حساب"
              : "اعلان");

  const hero = document.getElementById("notifDetailHero");
  hero.className =
    "notification-detail-hero notification-detail-hero--" +
    (notification.theme || "blue");
  hero.innerHTML = `<i class="fas ${schema.icon || "fa-bell"}" id="notifDetailIcon" style="font-size: 24px;"></i><div><small>نوع اعلان</small><strong id="notifDetailType" style="font-size: 15px;">${schema.label}</strong></div>`;

  document.getElementById("notifDetailDesc").textContent =
    notification.desc || "—";

  let dynamicHtml = "";
  if (notification.type === "purchase") {
    dynamicHtml = `<div class="notification-detail-desc" style="margin-top:10px;padding:14px;background:rgba(22,163,74,0.05);border-radius:9px;border-right:3px solid #16a34a;"><p style="margin:0;font-size:13px;line-height:1.9;color:var(--text-primary);"><strong>شماره سفارش:</strong> ${d["شماره سفارش"] || "—"}<br><strong>خریدار:</strong> ${d["خریدار"] || "—"} · ${d["ایمیل خریدار"] || "—"}<br><strong>محصول:</strong> ${d["محصول"] || "—"}<br><strong>مبلغ:</strong> ${d["مبلغ"] || "—"} · <strong>وضعیت پرداخت:</strong> ${d["وضعیت پرداخت"] || "—"}<br><strong>روش پرداخت:</strong> ${d["روش پرداخت"] || "—"} · <strong>کد پیگیری:</strong> ${d["کد پیگیری"] || "—"}</p></div>`;
  } else if (notification.type === "user") {
    dynamicHtml = `<div class="signup-account-card" style="margin-top:10px;border:1px solid rgba(0,122,255,0.16);border-radius:13px;overflow:hidden;"><div class="signup-account-head" style="display:flex;align-items:center;gap:10px;padding:14px;background:rgba(0,122,255,0.06);"><div class="signup-account-avatar" style="width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#007aff;color:#fff;font-weight:bold;font-size:16px;">${(d["نام کاربر"] || "?")[0] || "؟"}</div><div><strong style="font-size:15px;color:var(--text-primary);">${d["نام کاربر"] || "کاربر جدید"}</strong><small style="font-size:10px;color:var(--text-secondary);display:block;">${d["نقش"] || "کاربر عادی"}</small></div><span class="signup-account-status" style="margin-right:auto;padding:4px 8px;border-radius:99px;background:rgba(22,163,74,0.12);color:#16a34a;font-size:10px;font-weight:bold;">${d["وضعیت حساب"] || "فعال"}</span></div><div style="padding:12px;font-size:13px;line-height:1.8;color:var(--text-primary);"><p style="margin:0;">ایمیل: <strong>${d["ایمیل"] || "—"}</strong> · تلفن: <strong>${d["تلفن"] || "—"}</strong></p><p style="margin:5px 0 0;">روش ثبت‌نام: <strong>${d["روش ثبت‌نام"] || "—"}</strong> · تاریخ: <strong>${d["تاریخ ثبت‌نام"] || "—"}</strong></p></div></div>`;
  } else if (notification.type === "staff") {
    dynamicHtml = `<div class="profile-audit-card" style="margin-top:10px;border:1px solid rgba(234,179,8,0.15);border-radius:13px;overflow:hidden;background:rgba(234,179,8,0.02);"><div class="profile-audit-head" style="display:flex;gap:12px;padding:14px;background:rgba(234,179,8,0.09);"><i class="fas fa-user-gear" style="font-size:24px;color:#ca8a04;"></i><div><small style="font-size:10px;color:var(--text-secondary);">تغییر پروفایل عضو مدیریت</small><strong style="font-size:15px;color:var(--text-primary);">${d["کاربر"] || "—"}</strong></div></div><div style="padding:12px;font-size:13px;line-height:1.9;color:var(--text-primary);"><p style="margin:0;"><strong>شناسه کاربر:</strong> ${d["شناسه کاربر"] || "—"} · <strong>نقش:</strong> ${d["نقش"] || "—"}</p><p style="margin:6px 0 0;"><strong>موارد تغییرکرده:</strong> ${d["موارد تغییرکرده"] || "—"}</p><p style="margin:6px 0 0;color:var(--text-secondary);font-size:12px;">${d["جزئیات تغییرات"] || "—"}</p><p style="margin:6px 0 0;font-size:11px;color:var(--text-secondary);"><strong>زمان تغییر:</strong> ${d["زمان تغییر"] || "—"} · <strong>نشانی IP:</strong> ${d["نشانی IP"] || "—"}</p></div></div>`;
  } else if (notification.type === "report") {
    dynamicHtml = `<div style="margin-top:10px;"><div class="notification-report-text" style="padding:11px;border-radius:9px;background:rgba(239,68,68,0.05);border-right:3px solid #ef4444;font-size:13px;line-height:1.9;color:var(--text-primary);"><p style="margin:0;"><strong>گزارش‌دهنده:</strong> ${d["گزارش‌دهنده"] || "—"}</p><p style="margin:6px 0 0;"><strong>مورد گزارش‌شده:</strong> ${d["کاربر/مورد گزارش‌شده"] || "—"}</p><p style="margin:6px 0 0;"><strong>نوع گزارش:</strong> ${d["نوع گزارش"] || "—"} · <strong>درجه اهمیت:</strong> ${d["درجه اهمیت"] || "—"}</p><p style="margin:6px 0 0;color:var(--text-secondary);font-size:12px;"><strong>وضعیت رسیدگی:</strong> ${d["وضعیت رسیدگی"] || "—"}</p><p style="margin:6px 0 0;">${d["شرح"] || "—"}</p></div>
      ${d["شناسه گزارش"] ? `<button type="button" class="btn-primary report-reply-btn" onclick="openReportReply('${String(d["شناسه گزارش"]).replace(/'/g, "\\'")}')"><i class="fas fa-reply"></i> پاسخ به کاربر</button>` : ""}${d["تصویر/فایل ضمیمه"] ? `<div class="notification-evidence" style="margin-top:10px;padding:11px;border:1px dashed rgba(239,68,68,0.35);border-radius:9px;display:flex;gap:10px;align-items:center;"><i class="fas fa-paperclip" style="color:#ef4444;"></i><div><small style="font-size:10px;color:var(--text-secondary);">فایل ضمیمه</small><a href="data:text/plain;charset=utf-8,${encodeURIComponent("فایل ضمیمه گزارش تخلف\nنام فایل: " + (d["تصویر/فایل ضمیمه"] || "—") + "\nتاریخ: " + (d["تاریخ"] || "—"))}" download="${d["تصویر/فایل ضمیمه"] || "attachment.txt"}" style="font-size:12px;color:var(--primary);text-decoration:none;font-weight:bold;"><i class="fas fa-download" style="margin-left:5px;font-size:10px;"></i>${d["تصویر/فایل ضمیمه"] || "—"}</a></div></div>` : ""}${d["لینک شواهد"] && d["لینک شواهد"] !== "#" ? `<div style="margin-top:8px;font-size:12px;"><a href="${d["لینک شواهد"]}" style="color:var(--primary);text-decoration:none;"><i class="fas fa-link"></i> لینک شواهد</a></div>` : ""}</div>`;
  } else if (notification.type === "deletion") {
    dynamicHtml = `<div class="notification-deletion-warning" style="margin-top:10px;padding:11px;border-radius:9px;background:rgba(17,24,39,0.06);font-size:13px;line-height:1.9;color:var(--text-primary);"><p style="margin:0;"><strong>حساب حذف‌شده:</strong> ${d["حساب حذف‌شده"] || "—"} · <strong>نقش:</strong> ${d["نقش"] || "—"}</p><p style="margin:6px 0 0;"><strong>حذف‌کننده:</strong> ${d["حذف‌کننده"] || "—"} (${d["شناسه حذف‌کننده"] || "—"})</p><p style="margin:6px 0 0;font-size:11px;color:var(--text-secondary);"><i class="fas fa-exclamation-triangle" style="margin-left:6px;color:#ef4444;"></i>این عملیات غیرقابل بازگشت است و در سوابق سیستم ثبت شده است.</p><p style="margin:6px 0 0;font-size:11px;color:var(--text-secondary);"><strong>تاریخ:</strong> ${d["تاریخ"] || "—"}</p></div>`;
  } else {
    const keys = Object.keys(d);
    if (keys.length) {
      dynamicHtml =
        `<div style="margin-top:10px;padding:12px;background:rgba(0,122,255,0.03);border-radius:9px;font-size:13px;line-height:1.9;color:var(--text-primary);">` +
        keys
          .map(
            (k) =>
              `<p style="margin:4px 0;"><strong>${k}:</strong> ${d[k] || "—"}</p>`,
          )
          .join("") +
        `</div>`;
    }
  }
  document.getElementById("notifDetailDynamic").innerHTML = dynamicHtml;
  openModal("notificationDetailModal");
}

/* ============================================================================
   REPLYING TO A VIOLATION REPORT
   ----------------------------------------------------------------------------
   A report used to be read-only: a manager could see it and nothing else.
   The answer now goes back as an ordinary support thread, so it appears in
   the reporter's "پیام‌های من" beside their other conversations and in the
   panel's messages tab. A second parallel inbox would have meant two places
   to check and two things to keep in sync.
   ========================================================================== */

function deleteNotification(notifId) {
  const notification = appState.notifications.find(
    (n) => String(n.id) === String(notifId),
  );
  if (!notification) return;

  if (!confirm("این اعلان حذف شود؟")) return;

  appState.notifications = appState.notifications.filter(
    (n) => String(n.id) !== String(notifId),
  );
  persistAdminNotifications();
  renderNotificationDropdownItems();
  renderNotificationsPage();
  showToast("اعلان حذف شد.", "success");
}

/** Clear every notification this operator can see. */
function clearAllNotifications() {
  const visible = visibleNotifications();
  if (!visible.length) {
    showToast("اعلانی برای حذف وجود ندارد.", "info");
    return;
  }
  if (!confirm(`همه ${toPersianDigits(visible.length)} اعلان حذف شوند؟`))
    return;

  // Only remove what this operator is allowed to see. An admin clearing
  // their list must not wipe manager-only records they cannot even read.
  const removable = new Set(visible.map((n) => String(n.id)));
  appState.notifications = appState.notifications.filter(
    (n) => !removable.has(String(n.id)),
  );
  persistAdminNotifications();
  renderNotificationDropdownItems();
  renderNotificationsPage();
  showToast("همه اعلان‌ها حذف شدند.", "success");
}

/**
 * Red count on the bell.
 *
 * The badge element existed in the markup but nothing ever wrote to it, so it
 * stayed permanently hidden no matter how many notifications arrived. Counts
 * only what this operator is allowed to see, so an admin is not shown a
 * number made up of manager-only events they cannot open.
 */
function updateNotificationBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const unread = visibleNotifications().filter((n) => n.unread).length;
  if (unread > 0) {
    badge.textContent = toPersianDigits(unread > 99 ? "99+" : unread);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function renderNotificationDropdownItems() {
  updateNotificationBadge();

  const container = document.getElementById("notifListContainer");
  if (!container) return;
  container.innerHTML = visibleNotifications()
    .slice(0, 10)
    .map(
      (n) =>
        `<div class="notif-item notif-item--${n.theme || "blue"}" style="cursor: pointer;" onclick="openNotificationDetails({ id: ${n.id}, type: '${n.type}', theme: '${n.theme || "blue"}', title: '${String(n.title).replace(/'/g, "\\'")}', desc: '${String(n.desc).replace(/'/g, "\\'")}', time: '${n.time}', createdAt: ${n.createdAt || "null"}, unread: ${n.unread ? "true" : "false"}, fresh: ${n.fresh ? "true" : "false"}, details: ${JSON.stringify(
          n.details || {},
        )
          .replace(/"/g, "&quot;")
          .replace(
            /'/g,
            "\\'",
          )} })"><span class="notif-event-dot"></span><div><div style="font-size:13px;color:var(--text-primary);font-weight:600;">${escapeHtml(n.title)}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${notificationCardSummary(n)} · ${formatNotificationTime(n.createdAt, n.time)}</div></div></div>`,
    )
    .join("");
}
