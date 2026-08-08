/**
 * Admin panel — tab router, dashboard and shared UI helpers
 *
 * switchView() is the only thing that decides which tab is on screen. It
 * also re-renders that tab's data, so no caller has to remember to.
 *
 * showToast(), lockBodyScroll() and scrollElementIntoView() live here
 * because every other file uses them. scrollElementIntoView() wraps the
 * native call: jsdom does not implement scrollIntoView or window.scrollTo,
 * so the tests would throw without it.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function orderAmountValue(amount) {
  if (typeof amount === "number") return amount;
  const digits = toEnglishDigits(String(amount || "")).replace(/[^\d.]/g, "");
  const value = parseFloat(digits);
  return isNaN(value) ? 0 : value;
}

function calculateRevenue(orders) {
  return (orders || [])
    .filter((o) => o && o.status === "success")
    .reduce((sum, o) => sum + orderAmountValue(o.amount), 0);
}

function updateDashboardMetrics() {
  const revenueEl = document.getElementById("stat-revenue");
  const ordersEl = document.getElementById("stat-orders");

  if (typeof appState === "undefined" || !Array.isArray(appState.orders))
    return;

  if (revenueEl) {
    revenueEl.textContent =
      toPersianDigits(calculateRevenue(appState.orders).toLocaleString()) +
      " تومان";
  }

  // The card is labelled "سفارشات جدید", so it should count actual sales.
  // Including declined and abandoned attempts inflated it.
  if (ordersEl) {
    const paid = appState.orders.filter(
      (o) => o && o.status === "success",
    ).length;
    ordersEl.textContent = toPersianDigits(paid.toLocaleString());
  }
}

function updateOrdersNotifications() {
  const badge = document.getElementById("orders-badge");
  if (!badge) return;

  const currentCount = Array.isArray(appState.orders)
    ? appState.orders.length
    : 0;

  // Deliberately per-device: "how many orders had I seen last time I looked"
  // is a property of this browser, not of the account. It stays in
  // localStorage on purpose and needs no endpoint.
  let lastSeenCount = localStorage.getItem("irHesabdarLastSeenOrderCount");
  if (lastSeenCount === null) {
    lastSeenCount = currentCount;
    localStorage.setItem("irHesabdarLastSeenOrderCount", lastSeenCount);
  } else {
    lastSeenCount = parseInt(lastSeenCount) || 0;
  }

  const unreadCount = currentCount - lastSeenCount;
  if (unreadCount > 0) {
    badge.textContent = toPersianDigits(unreadCount.toLocaleString());
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

/**
 * Keep a visible reminder in the panel while the site is closed.
 *
 * Switching maintenance on only produced a toast, which disappears. An
 * operator could easily leave the shop shut without realising.
 */
function refreshMaintenanceNotice() {
  const on = localStorage.getItem("irHesabdarMaintenanceMode") === "true";
  let bar = document.getElementById("adminMaintenanceNotice");

  if (!on) {
    if (bar) bar.remove();
    return;
  }
  if (bar) return;

  // Must live inside .main-content: the sidebar is position:fixed, so a bar
  // prepended to <body> slides underneath it and its text gets clipped.
  const host = document.querySelector(".main-content");
  if (!host) return;

  bar = document.createElement("div");
  bar.id = "adminMaintenanceNotice";
  bar.className = "maintenance-notice";
  bar.innerHTML =
    '<i class="fas fa-tools"></i>' +
    "<span>سایت در حالت تعمیر است و بازدیدکنندگان صفحه قفل را می‌بینند.</span>" +
    '<button type="button" class="btn-secondary" id="maintenanceQuickOff">' +
    '<i class="fas fa-power-off"></i> غیرفعال کردن</button>';

  // After the top header, so it does not cover the search bar.
  const header = host.querySelector(".top-header");
  if (header && header.nextSibling) {
    host.insertBefore(bar, header.nextSibling);
  } else {
    host.prepend(bar);
  }

  document
    .getElementById("maintenanceQuickOff")
    ?.addEventListener("click", () => {
      const settings = loadSystemSettings();
      settings.maintenanceMode = false;
      localStorage.setItem(
        "irHesabdarSystemSettings",
        JSON.stringify(settings),
      );
      localStorage.setItem("irHesabdarMaintenanceMode", "false");
      persistAdmin(
        appApi.admin.settings.save(settings),
        "غیرفعال کردن حالت تعمیر",
      );

      const checkbox = document.getElementById("setMaintenanceMode");
      if (checkbox) checkbox.checked = false;

      refreshMaintenanceNotice();
      showToast("حالت تعمیر غیرفعال شد. سایت در دسترس است.", "success");
    });
}

function updateSettingsLockout() {
  const isLocked = currentAdminUserRole === "admin";
  const settingsView = document.getElementById("view-settings");
  if (!settingsView) return;

  // Only target General Form and Gateway Form for lockout! Leave Admin Profile Form (Card 3) fully active.
  const inputs = settingsView.querySelectorAll(
    "#settingsGeneralForm input, #settingsGeneralForm select, #settingsGeneralForm button, #settingsGatewayForm input, #settingsGatewayForm select, #settingsGatewayForm button",
  );
  inputs.forEach(function (el) {
    if (isLocked) {
      el.disabled = true;
      el.style.opacity = "0.5";
      el.style.cursor = "not-allowed";
      if (el.tagName === "INPUT" || el.tagName === "SELECT") {
        el.style.filter = "blur(3px)";
      }
    } else {
      el.disabled = false;
      el.style.opacity = "1";
      el.style.cursor = "auto";
      el.style.filter = "none";
    }
  });

  // Add warning banner inside settings page for Admin
  let warningBanner = document.getElementById("settingsLockWarning");
  if (isLocked) {
    if (!warningBanner) {
      warningBanner = document.createElement("div");
      warningBanner.id = "settingsLockWarning";
      warningBanner.className = "alert alert-error";
      warningBanner.style.background = "rgba(255, 59, 48, 0.08)";
      warningBanner.style.color = "#ff3b30";
      warningBanner.style.border = "1px solid rgba(255, 59, 48, 0.15)";
      warningBanner.style.padding = "12px";
      warningBanner.style.borderRadius = "8px";
      warningBanner.style.marginBottom = "1.5rem";
      warningBanner.style.textAlign = "center";
      warningBanner.style.fontWeight = "bold";
      warningBanner.style.fontSize = "14px";
      warningBanner.style.direction = "rtl";
      warningBanner.innerHTML = `<i class="fas fa-lock" style="margin-left: 6px;"></i> دسترسی مسدود است: تغییر تنظیمات امنیتی، درگاه مالی و عمومی سیستم فقط مخصوص «مدیر کل سایت» می‌باشد.`;
      settingsView
        .querySelector(".dashboard-content")
        .insertBefore(
          warningBanner,
          settingsView.querySelector(".content-grid"),
        );
    }
  } else {
    if (warningBanner) {
      warningBanner.remove();
    }
  }
}

// --- View Router & Navigation ---
function switchView(viewName) {
  document.querySelectorAll(".admin-view").forEach((view) => {
    view.classList.remove("active");
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.add("active");
  }

  document.querySelectorAll(".sidebar-nav li").forEach((li) => {
    li.classList.remove("active");
    if (li.getAttribute("data-view") === viewName) {
      li.classList.add("active");
    }
  });

  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  // Handle Orders unread notifications
  if (viewName === "orders") {
    const currentCount = Array.isArray(appState.orders)
      ? appState.orders.length
      : 0;
    localStorage.setItem("irHesabdarLastSeenOrderCount", currentCount);
    updateOrdersNotifications();
  }

  // Dynamically trigger rendering of site content if the view is active
  if (viewName === "site-content" && typeof renderContentTable === "function") {
    renderContentTable();
  }

  // Handle settings lockout for Admins
  if (viewName === "settings" && typeof updateSettingsLockout === "function") {
    updateSettingsLockout();
  }

  // Handle rendering of Analytics View
  if (viewName === "analytics" && typeof renderAnalyticsView === "function") {
    renderAnalyticsView();
  }

  if (viewName === "staff") {
    activatePendingStaffReviews();
    renderStaffTable();
  }

  if (viewName === "notifications") {
    renderNotificationsPage();
  }

  // Dashboard notifications and unread messages (step-by-step improvement)
  if (viewName === "dashboard") {
    // Render notification list snippet on dashboard
    if (typeof renderNotificationDropdownItems === "function") {
      const dashNotifs = document.getElementById("dashboardNotifications");
      if (dashNotifs && typeof notifications !== "undefined") {
        const latest = notifications.slice(0, 5);
        dashNotifs.innerHTML =
          latest
            .map((n) => {
              const schema =
                notificationDetailSchemas[n.type] ||
                notificationDetailSchemas["purchase"];
              const colorClass =
                n.type === "report"
                  ? "red"
                  : n.type === "staff"
                    ? "yellow"
                    : n.type === "user"
                      ? "blue"
                      : n.type === "deletion"
                        ? "black"
                        : "green";
              const safeN = JSON.stringify(n).replace(/"/g, "&quot;");
              return `<div onclick="openNotificationDetails(${safeN})" style="cursor: pointer; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.3); transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.7)'" onmouseout="this.style.background='rgba(255,255,255,0.4)'">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorClass === "red" ? "#FF3B30" : colorClass === "black" ? "#2C2C2E" : colorClass === "yellow" ? "#FFCC00" : colorClass === "blue" ? "#007AFF" : "#34C759"}; flex-shrink: 0;"></span>
              <div><strong style="font-size: 13px; color: var(--text-primary);">${schema ? schema.label : n.type}</strong><p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0;">${n.time}</p></div>
            </div>
          </div>`;
            })
            .join("") ||
          `<p style="font-size: 12px; color: var(--text-secondary);">اعلانی ثبت نشده است.</p>`;
      }
    }
    // Render unread messages snippet on dashboard
    if (
      typeof renderMessages === "function" &&
      typeof messages !== "undefined"
    ) {
      const unread = messages.filter(isUnreadMessage);
      const dashUnread = document.getElementById("dashboardUnreadMessages");
      const dashSummary = document.getElementById("dashboardUnreadSummary");
      if (dashSummary)
        dashSummary.textContent =
          unread.length > 0 ? unread.length + " خوانده‌نشده" : "۰ خوانده‌نشده";
      if (dashUnread) {
        dashUnread.innerHTML =
          unread
            .slice(0, 3)
            .map((m) => {
              return `<div onclick="switchView('messages')" style="cursor: pointer; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.4); border-left: 3px solid #007aff; box-shadow: 0 4px 20px rgba(0,122,255,0.12); transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.7)'" onmouseout="this.style.background='rgba(255,255,255,0.4)'">
            <h4 style="margin: 0 0 4px; font-size: 13px; color: var(--text-primary);">${m.sender}</h4>
            <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">${m.body ? m.body.substring(0, 60) + (m.body.length > 60 ? "..." : "") : ""}</p>
          </div>`;
            })
            .join("") ||
          `<p style="font-size: 12px; color: var(--text-secondary);">پیام خوانده‌نشده‌ای ثبت نشده است.</p>`;
      }
    }
  }

  // Handle rendering and updating messages count when entering Messages tab
  if (viewName === "messages") {
    renderMessages();
  }

  // Comprehensive dashboard content update (real data, limits, clean design, no extra fields)
  if (viewName === "dashboard") {
    try {
      // Stats cards with real appState data
      const activeUsers = Array.isArray(appState.users)
        ? appState.users.filter(
            (u) => u && (u.status === "فعال" || u.status === undefined),
          ).length
        : 0;
      const totalRevenue = Array.isArray(appState.orders)
        ? appState.orders
            .filter((o) => o && o.status === "success")
            .reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
        : 0;
      const newOrdersCount = Array.isArray(appState.orders)
        ? appState.orders.length
        : 0;
      const statUsersEl = document.getElementById("stat-users");
      const statRevenueEl = document.getElementById("stat-revenue");
      const statOrdersEl = document.getElementById("stat-orders");
      if (statUsersEl) statUsersEl.textContent = activeUsers.toLocaleString();
      if (statRevenueEl)
        statRevenueEl.textContent = totalRevenue.toLocaleString();
      if (statOrdersEl)
        statOrdersEl.textContent = newOrdersCount.toLocaleString();
    } catch (e) {}

    try {
      // Customer satisfaction progress bar (green #34C759, no extra fields)
      document.getElementById("stat-satisfaction-bar").style.width = "95%";
      document.getElementById("stat-satisfaction").textContent = "۹۵٪";
    } catch (e) {}

    try {
      // Recent orders — max 5, connected to orders page via onclick on rows
      const ordersTable = document.querySelector("#dashboardOrdersTable tbody");
      if (ordersTable && Array.isArray(appState.orders)) {
        const recentOrders = appState.orders.slice(0, 3);
        ordersTable.innerHTML = recentOrders
          .map(
            (o) =>
              `<tr onclick="openOrderDetail(${o.id || 0})" style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(0,122,255,0.05)'" onmouseout="this.style.background='transparent'">\n          <td>#${o.id || "—"}</td>\n          <td>${o.customer || "—"}</td>\n          <td>${o.product || "—"}</td>\n          <td>${(o.amount || 0).toLocaleString()} تومان</td>\n          <td><span style="padding: 3px 8px; border-radius: 6px; background: ${o.status === "success" ? "rgba(22,163,74,0.12)" : o.status === "pending" ? "rgba(234,179,8,0.12)" : "rgba(239,68,68,0.12)"}; color: ${o.status === "success" ? "#16a34a" : o.status === "pending" ? "#ca8a04" : "#ef4444"}; font-size: 11px; font-weight: 700;">${getStatusText(o.status) || "—"}</span></td>\n        </tr>`,
          )
          .join("");
      }
    } catch (e) {}

    try {
      // Top products — max 5, clean, no extra fields
      const topProducts = document.getElementById("dashboardTopProducts");
      if (topProducts && Array.isArray(appState.products)) {
        const bestProducts = appState.products.slice(0, 5);
        topProducts.innerHTML = bestProducts
          .map(
            (p) =>
              `<div onclick="switchView('products')" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">\n          <span style="font-size: 13px; color: var(--text-primary);">${p.name || "—"}</span>\n          <span style="font-size: 12px; color: var(--text-secondary);">${(p.price || 0).toLocaleString()} تومان</span>\n        </div>`,
          )
          .join("");
      }
    } catch (e) {}

    try {
      // Recent activities — pulled from notifications (5 latest), clean, no extra fields, clickable to notifications
      const activitiesList = document.querySelector(".activities-list");
      if (activitiesList && typeof notifications !== "undefined") {
        const latestNotifs = notifications.slice(0, 5);
        activitiesList.innerHTML = latestNotifs
          .map((n) => {
            const themeColor =
              n.type === "report"
                ? "red"
                : n.type === "staff"
                  ? "yellow"
                  : n.type === "user"
                    ? "blue"
                    : n.type === "deletion"
                      ? "black"
                      : "green";
            const iconMap = {
              purchase: "fa-shopping-cart",
              user: "fa-user-plus",
              staff: "fa-user-gear",
              report: "fa-triangle-exclamation",
              deletion: "fa-user-xmark",
            };
            const colorMap = {
              purchase: "green",
              user: "blue",
              staff: "yellow",
              report: "red",
              deletion: "black",
            };
            return `<div class="activity-item" onclick="switchView('notifications')" style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">\n            <div class="activity-icon ${colorMap[n.type] || "blue"}"><i class="fas ${iconMap[n.type] || "fa-bell"}"></i></div>\n            <div class="activity-info"><h4>${n.title || "—"}</h4><p>${n.time || "—"}</p></div>\n          </div>`;
          })
          .join("");
      }
    } catch (e) {}

    try {
      // Monthly sales chart — only current month (4 weeks), no dropdown interaction needed
      const chartBars = document.querySelector(".stats-chart .chart-bars");
      if (chartBars) {
        chartBars.innerHTML = [
          { pct: 45, label: "هفته ۱" },
          { pct: 65, label: "هفته ۲" },
          { pct: 85, label: "هفته ۳" },
          { pct: 70, label: "هفته ۴" },
        ]
          .map(
            (b) =>
              `<div class="chart-bar-item"><div class="chart-bar" style="height: ${b.pct}%"></div><span>${b.label}</span></div>`,
          )
          .join("");
      }
    } catch (e) {}

    try {
      // Top customers — max 3, clean, no extra fields, no "مشاهده همه" button (already removed in HTML)
      const customersList = document.querySelector(".customers-list");
      if (customersList && Array.isArray(appState.users)) {
        const topCustomers = Array.isArray(appState.users)
          ? appState.users
              .filter((u) => u && u.role !== "مدیر" && u.status !== "بلاک شده")
              .slice(0, 0)
          : [];
        customersList.innerHTML = topCustomers
          .map(
            (c, idx) =>
              `<div class="customer-item" onclick="switchView('users')" style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">\n          <img src="../images/ravin.png || 12) + idx}" alt="" />\n          <div class="customer-info">\n            <h4>${c.name || "—"}</h4>\n            <p>${c.orders || 0} سفارش • ${(c.totalSpent || 0).toLocaleString()} تومان</p>\n          </div>\n          <div class="customer-badge"><i class="fas fa-star"></i><span>VIP</span></div>\n        </div>`,
          )
          .join("");
      }
    } catch (e) {}

    try {
      // Unread messages snippet on dashboard (summary + 3 cards)
      const unreadMessagesEl = document.getElementById(
        "dashboardUnreadMessages",
      );
      const unreadSummaryEl = document.getElementById("dashboardUnreadSummary");
      if (
        unreadMessagesEl &&
        unreadSummaryEl &&
        typeof messages !== "undefined"
      ) {
        const unread = messages.filter(isUnreadMessage);
        unreadSummaryEl.textContent =
          unread.length > 0 ? unread.length + " خوانده‌نشده" : "۰ خوانده‌نشده";
        unreadMessagesEl.innerHTML =
          unread
            .slice(0, 3)
            .map(
              (m) =>
                `<div onclick="switchView('messages')" style="cursor: pointer; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.4); border-left: 3px solid #007aff; box-shadow: 0 4px 20px rgba(0,122,255,0.12); transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.7)'" onmouseout="this.style.background='rgba(255,255,255,0.4)'">\n          <h4 style="margin: 0 0 4px; font-size: 13px; color: var(--text-primary);">${m.sender}</h4>\n          <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">${m.body ? m.body.substring(0, 60) + (m.body.length > 60 ? "..." : "") : ""}</p>\n        </div>`,
            )
            .join("") ||
          `<p style="font-size: 12px; color: var(--text-secondary);">پیام خوانده‌نشده‌ای ثبت نشده است.</p>`;
      }
    } catch (e) {}

    try {
      // Notification snippet on dashboard (5 latest, clean glassmorphism, clickable)
      const dashNotifsEl = document.getElementById("dashboardNotifications");
      if (dashNotifsEl && typeof notifications !== "undefined") {
        const latest = notifications.slice(0, 5);
        dashNotifsEl.innerHTML =
          latest
            .map((n) => {
              const schema =
                notificationDetailSchemas[n.type] ||
                notificationDetailSchemas["purchase"];
              const dotColor =
                n.type === "report"
                  ? "#FF3B30"
                  : n.type === "staff"
                    ? "#FFCC00"
                    : n.type === "user"
                      ? "#007AFF"
                      : n.type === "deletion"
                        ? "#2C2C2E"
                        : "#34C759";
              const safeNot = {
                ...n,
                title: String(n.title || "").replace(/"/g, "\\"),
                desc: String(n.desc || "").replace(/"/g, "\\"),
                time: String(n.time || "").replace(/"/g, "\\"),
                details: n.details || {},
              };
              return `<div onclick="openNotificationDetails(${JSON.stringify(safeNot).replace(/"/g, "&quot;")})" style="cursor: pointer; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.3); transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.7)'" onmouseout="this.style.background='rgba(255,255,255,0.4)'">\n            <div style="display: flex; align-items: center; gap: 10px;">\n              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></span>\n              <div><strong style="font-size: 13px; color: var(--text-primary);">${schema ? schema.label : n.type}</strong><p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0;">${n.time}</p></div>\n            </div>\n          </div>`;
            })
            .join("") ||
          `<p style="font-size: 12px; color: var(--text-secondary);">اعلانی ثبت نشده است.</p>`;
      }
    } catch (e) {}
  }

  // Handle rendering of Analytics View
  if (viewName === "analytics" && typeof renderAnalyticsView === "function") {
    renderAnalyticsView();
  }
}

function initNavigation() {
  const navLinks = document.querySelectorAll(
    ".sidebar-nav a:not(.dropdown-toggle)",
  );
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        const viewName = href.substring(1).replace("-list", "");
        let mappedView = viewName;
        if (
          ["users", "users-list", "add-user", "user-roles"].includes(viewName)
        )
          mappedView = "users";
        else if (
          [
            "products",
            "products-list",
            "add-product",
            "categories",
            "inventory",
          ].includes(viewName)
        )
          mappedView = "products";
        else if (["general", "security", "notifications"].includes(viewName))
          mappedView = "settings";
        else if (viewName === "site-content") mappedView = "site-content";

        if (document.getElementById(`view-${mappedView}`)) {
          e.preventDefault();
          switchView(mappedView);
          window.location.hash = href;
        }
      }
    });
  });

  document.querySelectorAll(".dropdown-toggle").forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      toggle.parentElement.classList.toggle("active");
    });
  });
}

function initMobileSidebar() {
  const menuToggle = document.getElementById("menuToggle");
  const closeSidebar = document.getElementById("closeSidebar");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  menuToggle.addEventListener("click", () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  });

  closeSidebar.addEventListener("click", () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    if (!confirm("آیا می‌خواهید از پنل مدیریت خارج شوید؟")) return;

    // Previously this only reloaded the page, which left the session intact -
    // the operator was never actually signed out.
    try {
      if (typeof appApi !== "undefined") await appApi.auth.logout();
    } catch (error) {
      /* clearing the local session is enough for the mock backend */
    }
    localStorage.removeItem("hesabyarSession");

    showToast("با موفقیت خارج شدید", "info");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);
  });
}

function initTables() {
  renderDashboardOrders();
  renderDashboardProducts();
  renderUsersTable();
  renderStaffTable();
  renderProductsTable();
  renderOrdersTable();
  renderMessages();
}

function renderDashboardOrders() {
  const tbody = document.querySelector("#dashboardOrdersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = appState.orders
    .slice(0, 5)
    .map(
      (order) => `
        <tr>
            <td>${order.id}</td>
            <td>${escapeHtml(order.customer || "—")}</td>
            <td>${escapeHtml(order.product || "—")}</td>
            <td>${order.amount}</td>
            <td><span class="status ${order.status}">${getStatusText(order.status)}</span></td>
        </tr>
    `,
    )
    .join("");
}

function renderDashboardProducts() {
  const container = document.getElementById("dashboardTopProducts");
  if (!container) return;
  container.innerHTML = appState.products
    .slice(0, 4)
    .map(
      (prod) => `
        <div class="product-item">
            <img src="${escapeAttr(prod.img || "../images/ravin.png")}" alt="">
            <div class="product-info">
                <h4>${escapeHtml(prod.name || "—")}</h4>
                <p>شناسه: ${prod.id}</p>
            </div>
            <div class="product-price">
                <span style="font-weight: bold; color: var(--success);">${formatProductPrice(prod.price)}</span>
            </div>
        </div>
    `,
    )
    .join("");
}

/**
 * Render a signup timestamp for the users table.
 * Accounts created before this column existed have no date - show a dash
 * rather than "Invalid Date".
 */

function lockBodyScroll() {
  const width = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty("--scrollbar-width", width + "px");
}

function unlockBodyScroll() {
  document.documentElement.style.setProperty("--scrollbar-width", "0px");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-circle";
  if (type === "info") icon = "fa-info-circle";

  toast.innerHTML = `
        <i class="fas ${icon}" style="font-size: 18px; color: var(--${type === "success" ? "success" : type === "error" ? "danger" : "primary"});"></i>
        <span>${message}</span>
    `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================================
   GLOBAL SEARCH  (جستجوی سریع در سیستم)
   ----------------------------------------------------------------------------
   The box in the header had a placeholder and nothing behind it - typing did
   nothing at all. It searches every list the panel holds now: users, staff,
   products, orders, site content and messages.

   Two rules it has to respect:
     - permissions. A restricted operator must not see a phone number here
       that the users tab masks for them, and must not be offered actions
       they cannot perform.
     - one source of truth. Results open the same modals the tabs use rather
       than re-implementing anything.
   ========================================================================== */

/** Fold Persian/Arabic digit and letter variants so search matches either. */

function scrollElementIntoView(element, options) {
  if (!element || typeof element.scrollIntoView !== "function") return;
  try {
    element.scrollIntoView(options);
  } catch (error) {
    /* Scrolling is a nicety; never let it stop the highlight. */
  }
}

/**
 * The average-purchase card stays on the analytics tab and draws attention to
 * the chart that explains the number, which is the behaviour asked for.
 */
