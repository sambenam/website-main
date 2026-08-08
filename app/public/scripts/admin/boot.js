/**
 * Admin panel — startup
 *
 * MUST BE THE LAST SCRIPT ON THE PAGE. This is the only file whose code
 * runs while it is being parsed, so everything it touches has to exist
 * already.
 *
 * Three things happen here: the storage listener that picks up changes made
 * by other tabs, the DOMContentLoaded block that wires the whole panel
 * together, and the settings and profile forms that belong to no single tab.
 *
 * The storage listener re-reads users through appApi rather than taking the
 * event payload: the event carries only the admin store, but users.list()
 * merges that with accounts created on the public site. Assigning the raw
 * payload made the list visibly shrink.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

// Same-site pages (checkout, sign-up, the report form) write straight to
// localStorage. This picks those up live when the panel is already open;
// reconcileNotifications() covers anything missed while it was closed.
window.addEventListener("storage", function (event) {
  if (event.key === "irHesabdarOrders" && event.newValue) {
    try {
      appState.orders = JSON.parse(event.newValue);
    } catch (e) {
      return;
    }
    reconcileNotifications();
    if (typeof renderOrdersTable === "function") renderOrdersTable();
  }
  // hesabyarApiState holds accounts created on the public site, so a customer
  // editing their own profile changes that key - not irHesabdarUsers. Watching
  // only the admin store meant those edits never reached an open panel.
  if (
    (event.key === "irHesabdarUsers" || event.key === "hesabyarApiState") &&
    event.newValue
  ) {
    // Re-read through the API rather than taking the raw value.
    //
    // The event only carries the admin store, but users.list() merges that
    // with accounts created on the public site. Assigning the raw payload
    // dropped every site account from the panel until the next reload - the
    // list visibly shrank. Going through appApi also keeps the merge rule in
    // one place: the account owns its own name, email and phone; the panel
    // owns status and role.
    if (typeof appApi === "undefined" || !appApi.admin) return;
    appApi.admin.users
      .list()
      .then((users) => {
        if (!Array.isArray(users)) return;
        appState.users = users;
        // A profile edited in another tab has to show up here without the
        // manager having to reload.
        if (typeof renderUsersTable === "function") renderUsersTable();
        if (typeof renderStaffTable === "function") renderStaffTable();
        reconcileNotifications();
      })
      .catch(() => {});
  }
  if (event.key === "irHesabdarReports" && event.newValue) {
    reconcileNotifications();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  // Gate first - everything below assumes an authenticated operator.
  if (!requireAdminSession()) return;

  // requireAdminSession may have just created the session, so re-read the role
  // before anything renders.
  currentAdminUserRole = readAdminRole();

  refreshMaintenanceNotice();

  // Group the digits in every price field as the operator types.
  attachPriceFormatting();

  // Pull authoritative data through appApi (contact-form messages, real
  // signups, server data once the backend is live). Non-blocking: the panel
  // has already rendered from the local seed.
  hydrateFromApi();

  // --- MESSAGE SHORTCUT AND PANEL TOGGLES ---
  const messagesHeaderBtn = document.getElementById("messagesHeaderBtn");
  const messagesFloatingPanel = document.getElementById(
    "messagesFloatingPanel",
  );
  const closeFloatingPanelBtn = document.getElementById(
    "closeFloatingPanelBtn",
  );

  if (messagesHeaderBtn && messagesFloatingPanel) {
    messagesHeaderBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = messagesFloatingPanel.style.display === "block";
      if (isVisible) {
        messagesFloatingPanel.style.display = "none";
      } else {
        renderFloatingMessages();
        messagesFloatingPanel.style.display = "block";
      }
    });
  }

  if (closeFloatingPanelBtn && messagesFloatingPanel) {
    closeFloatingPanelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      messagesFloatingPanel.style.display = "none";
    });
  }

  // The envelope in the header and the messages tab are two views of one
  // inbox, so the dropdown offers a way through to the full tab.
  const openMessagesTabBtn = document.getElementById("openMessagesTabBtn");
  if (openMessagesTabBtn) {
    openMessagesTabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (messagesFloatingPanel) messagesFloatingPanel.style.display = "none";
      switchView("messages");
    });
  }

  // Click anywhere else to close the floating messages panel
  document.addEventListener("click", (e) => {
    if (
      messagesFloatingPanel &&
      messagesFloatingPanel.style.display === "block"
    ) {
      if (
        !messagesFloatingPanel.contains(e.target) &&
        messagesHeaderBtn &&
        !messagesHeaderBtn.contains(e.target)
      ) {
        messagesFloatingPanel.style.display = "none";
      }
    }
  });

  initNavigation();
  initMobileSidebar();
  initTables();
  // Demo indicator expires after a short review interval.
  if (recentlyUpdatedStaffId)
    setTimeout(function () {
      const id = recentlyUpdatedStaffId;
      recentlyUpdatedStaffId = null;
      delete recentStaffFieldChanges[id];
      renderStaffTable();
    }, 8000);
  // A fake "پشتیبان تستی" message used to be unshifted here on every single
  // load, so the inbox count never matched what customers had actually sent
  // and the badge could never reach zero. Real messages now arrive from the
  // contact form and the assistant widget, so the placeholder is gone.
  initNotifications();
  renderNotificationsPage();
  // A demo stack of seven fake notifications used to be injected here on
  // every load, and it began with `appState.notifications = []` - so any
  // real event, including the profile changes managers are meant to be told
  // about, was wiped on the next refresh. Notifications now come only from
  // real activity and are persisted.
  initModals();
  initSearch();
  initGlobalSearch();
  initReportReply();
  initRowDeletes();

  // Populate System Settings from localStorage
  const sysSettings = loadSystemSettings();

  if (document.getElementById("setSupportEmail"))
    document.getElementById("setSupportEmail").value =
      sysSettings.supportEmail || "";
  if (document.getElementById("setSupportPhone"))
    document.getElementById("setSupportPhone").value =
      sysSettings.supportPhone || "";
  if (document.getElementById("setMaintenanceMode"))
    document.getElementById("setMaintenanceMode").checked =
      sysSettings.maintenanceMode || false;

  if (document.getElementById("setMerchantId"))
    document.getElementById("setMerchantId").value =
      sysSettings.merchantId || "";
  if (document.getElementById("setCurrencyUnit"))
    document.getElementById("setCurrencyUnit").value =
      sysSettings.currencyUnit || "toman";

  if (document.getElementById("setAdminName"))
    document.getElementById("setAdminName").value = sysSettings.adminName || "";
  if (document.getElementById("setAdminAvatar"))
    document.getElementById("setAdminAvatar").value =
      sysSettings.adminAvatar || "";
  const activeStaff =
    appState.users.find((u) => u.id === currentStaffProfileId) || {};
  if (document.getElementById("profileEmail"))
    document.getElementById("profileEmail").value =
      activeStaff.email || "manager@example.com";
  if (document.getElementById("profilePhone"))
    document.getElementById("profilePhone").value =
      activeStaff.phone || "09120000000";
  if (document.getElementById("profileAvatarPreview"))
    document.getElementById("profileAvatarPreview").src =
      sysSettings.adminAvatar || "../images/ravin.png";
  const roleBadge = document.getElementById("profileRoleBadge");
  if (roleBadge) {
    const role = activeStaff.role || "مدیر سایت";
    roleBadge.textContent = role === "ادمین" ? "ادمین" : "مدیر";
    roleBadge.className =
      "profile-role-badge " +
      (role === "ادمین"
        ? "profile-role-badge--admin"
        : "profile-role-badge--manager");
  }

  const sideName = document.getElementById("sidebarUserName");
  const sideAvatar = document.getElementById("sidebarAvatar");
  if (sideName && sysSettings.adminName)
    sideName.textContent = sysSettings.adminName;
  if (sideAvatar && sysSettings.adminAvatar)
    sideAvatar.src = sysSettings.adminAvatar;

  // 1. General Settings Form Submission
  const settingsGeneralForm = document.getElementById("settingsGeneralForm");
  if (settingsGeneralForm) {
    settingsGeneralForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("setSupportEmail").value.trim();
      const phone = document.getElementById("setSupportPhone").value.trim();
      const maintenance = document.getElementById("setMaintenanceMode").checked;

      const currentSettings = loadSystemSettings();
      currentSettings.supportEmail = email;
      currentSettings.supportPhone = phone;
      currentSettings.maintenanceMode = maintenance;

      localStorage.setItem(
        "irHesabdarSystemSettings",
        JSON.stringify(currentSettings),
      );
      persistAdmin(
        appApi.admin.settings.save(currentSettings),
        "ذخیره تنظیمات",
      );
      localStorage.setItem(
        "irHesabdarMaintenanceMode",
        maintenance ? "true" : "false",
      );
      refreshMaintenanceNotice();

      showToast("تنظیمات عمومی و پشتیبانی با موفقیت ذخیره شد.", "success");
    });
  }

  // 2. Gateway Settings Form Submission
  const settingsGatewayForm = document.getElementById("settingsGatewayForm");
  if (settingsGatewayForm) {
    settingsGatewayForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const merchant = document.getElementById("setMerchantId").value.trim();
      const currency = document.getElementById("setCurrencyUnit").value;

      const currentSettings = loadSystemSettings();
      currentSettings.merchantId = merchant;
      currentSettings.currencyUnit = currency;

      localStorage.setItem(
        "irHesabdarSystemSettings",
        JSON.stringify(currentSettings),
      );
      persistAdmin(
        appApi.admin.settings.save(currentSettings),
        "ذخیره تنظیمات",
      );
      showToast("تنظیمات درگاه مالی با موفقیت ذخیره شد.", "success");
    });
  }

  // SECURITY: the current-password field stays empty. The admin types it to
  // confirm a change; we verify via verifyAdminPassword() instead of echoing
  // the stored value back into the page.
  const currentPasswordField = document.getElementById(
    "setAdminCurrentPassword",
  );
  if (currentPasswordField) {
    currentPasswordField.value = "";
    currentPasswordField.placeholder = "رمز فعلی را وارد کنید";
  }

  // Toggle New Password section in Settings
  const toggleNewPasswordBtn = document.getElementById("toggleNewPasswordBtn");
  const newPasswordSection = document.getElementById("newPasswordSection");
  if (toggleNewPasswordBtn && newPasswordSection) {
    toggleNewPasswordBtn.addEventListener("click", () => {
      if (newPasswordSection.style.display === "none") {
        newPasswordSection.style.display = "block";
        document.getElementById("setAdminPassword").required = true;
        document.getElementById("setAdminPasswordConfirm").required = true;
      } else {
        newPasswordSection.style.display = "none";
        document.getElementById("setAdminPassword").required = false;
        document.getElementById("setAdminPasswordConfirm").required = false;
        document.getElementById("setAdminPassword").value = "";
        document.getElementById("setAdminPasswordConfirm").value = "";
      }
    });
  }

  // 3. Admin Profile Settings Form Submission (With safety warning & password verification!)
  const settingsAdminForm = document.getElementById("settingsAdminForm");
  if (settingsAdminForm) {
    settingsAdminForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("setAdminName").value.trim();
      const avatar = document.getElementById("setAdminAvatar").value.trim();
      const profileEmail = document.getElementById("profileEmail").value.trim();
      const profilePhone = document.getElementById("profilePhone").value.trim();
      const currentPasswordInput = document.getElementById(
        "setAdminCurrentPassword",
      ).value;

      const isChangingPassword =
        newPasswordSection && newPasswordSection.style.display === "block";
      const newPassword = isChangingPassword
        ? document.getElementById("setAdminPassword").value
        : "";
      const confirmPassword = isChangingPassword
        ? document.getElementById("setAdminPasswordConfirm").value
        : "";

      if (isChangingPassword) {
        if (!verifyAdminPassword(currentPasswordInput)) {
          showToast("خطا: رمز عبور فعلی نادرست است.", "error");
          return;
        }
        if (newPassword !== confirmPassword) {
          showToast("خطا: رمز عبور جدید با تکرار آن همخوانی ندارد.", "error");
          return;
        }
        if (String(newPassword).length < 6) {
          showToast("رمز عبور جدید باید حداقل ۶ کاراکتر باشد.", "error");
          return;
        }
      }

      const currentProfile =
        appState.users.find((u) => u.id === currentStaffProfileId) || {};
      const existingSettings = loadSystemSettings();
      const profileChanges = [];
      if (name !== (currentProfile.name || existingSettings.adminName || ""))
        profileChanges.push({
          label: "نام کاربری",
          before: currentProfile.name || existingSettings.adminName || "—",
          after: name,
        });
      if (profileEmail !== (currentProfile.email || ""))
        profileChanges.push({
          label: "ایمیل",
          before: currentProfile.email || "—",
          after: profileEmail,
        });
      if (profilePhone !== (currentProfile.phone || ""))
        profileChanges.push({
          label: "تلفن همراه",
          before: currentProfile.phone || "—",
          after: profilePhone,
        });
      if (avatar !== (existingSettings.adminAvatar || ""))
        profileChanges.push({
          label: "تصویر پروفایل",
          before: "تصویر فعلی",
          after: "تصویر جدید انتخاب شد",
        });
      if (isChangingPassword && newPassword)
        profileChanges.push({
          label: "رمز عبور",
          before: "رمز فعلی",
          after: "رمز جدید",
        });
      openProfileChangePreview(
        profileChanges,
        () => {
          const currentSettings = loadSystemSettings();
          currentSettings.adminName = name;
          currentSettings.adminAvatar = avatar;

          localStorage.setItem(
            "irHesabdarSystemSettings",
            JSON.stringify(currentSettings),
          );
          persistAdmin(
            appApi.admin.settings.save(currentSettings),
            "ذخیره تنظیمات",
          );

          // Live update sidebar display!
          const sideNameEl = document.getElementById("sidebarUserName");
          const sideAvatarEl = document.getElementById("sidebarAvatar");
          if (sideNameEl) sideNameEl.textContent = name;
          if (sideAvatarEl) sideAvatarEl.src = avatar;
          const profileHeading = document.getElementById("profileHeadingName");
          if (profileHeading) profileHeading.textContent = name;
          // Keep the access-management record and its audit trail in sync with profile edits.
          applyStaffProfileChanges(currentStaffProfileId, {
            name: name,
            email: profileEmail,
            phone: profilePhone,
          });

          if (isChangingPassword && newPassword) {
            setAdminPassword(newPassword);
            document.getElementById("setAdminCurrentPassword").value = "";
            document.getElementById("setAdminPassword").value = "";
            document.getElementById("setAdminPasswordConfirm").value = "";
            newPasswordSection.style.display = "none";

            // Show 10-second disappearing red alert
            const changeAlert = document.getElementById("passwordChangeAlert");
            if (changeAlert) {
              changeAlert.textContent =
                "⚠️ شما رمز عبور خود را با موفقیت تغییر دادید.";
              changeAlert.style.display = "block";
              setTimeout(() => {
                changeAlert.style.animation = "fadeOut 0.5s ease forwards";
                setTimeout(() => {
                  changeAlert.style.display = "none";
                  changeAlert.style.animation = "";
                }, 500);
              }, 10000);
            }

            showToast("پروفایل و رمز عبور جدید با موفقیت ذخیره شد.", "success");
          } else {
            showToast("پروفایل کاربری با موفقیت به‌روزرسانی شد.", "success");
          }
        },
        () => {
          const latestSettings = loadSystemSettings();
          document.getElementById("setAdminName").value =
            currentProfile.name || latestSettings.adminName || "";
          document.getElementById("profileEmail").value =
            currentProfile.email || "";
          document.getElementById("profilePhone").value =
            currentProfile.phone || "";
          document.getElementById("setAdminAvatar").value =
            latestSettings.adminAvatar || "";
          document.getElementById("profileAvatarPreview").src =
            latestSettings.adminAvatar || "../images/ravin.png";
          document.getElementById("setAdminPassword").value = "";
          document.getElementById("setAdminPasswordConfirm").value = "";
          showToast("تغییرات اعمال نشد و اطلاعات قبلی بازگردانده شد.", "info");
        },
      );
    });
  }

  // Bind password visibility eye icon toggles for settings page!
  document
    .querySelectorAll(".toggle-password-settings")
    .forEach(function (icon) {
      icon.addEventListener("click", function () {
        const targetId = icon.getAttribute("data-target");
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
          if (targetInput.type === "password") {
            targetInput.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
            icon.style.color = "var(--primary)";
          } else {
            targetInput.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
            icon.style.color = "var(--text-secondary)";
          }
        }
      });
    });

  const avatarInput = document.getElementById("profileAvatarFile");
  const avatarChoose = document.getElementById("profilePhotoChoose");
  if (avatarChoose && avatarInput)
    avatarChoose.addEventListener("click", () => avatarInput.click());
  if (avatarInput)
    avatarInput.addEventListener("change", function () {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (event) {
        const src = event.target.result;
        document.getElementById("setAdminAvatar").value = src;
        document.getElementById("profileAvatarPreview").src = src;
      };
      reader.readAsDataURL(file);
    });

  // Handle direct hash navigation on page load
  const currentHash = window.location.hash;
  if (currentHash && currentHash.startsWith("#")) {
    const viewName = currentHash.substring(1).replace("-list", "");
    let mappedView = viewName;
    if (["users", "users-list", "add-user", "user-roles"].includes(viewName)) {
      mappedView = "users";
    } else if (
      [
        "products",
        "products-list",
        "add-product",
        "categories",
        "inventory",
      ].includes(viewName)
    ) {
      mappedView = "products";
    } else if (["general", "security", "notifications"].includes(viewName)) {
      mappedView = "settings";
    } else if (viewName === "site-content") {
      mappedView = "site-content";
    } else if (viewName === "analytics") {
      mappedView = "analytics";
    } else if (viewName === "messages") {
      mappedView = "messages";
    }

    if (document.getElementById(`view-${mappedView}`)) {
      switchView(mappedView);
    }
  }

  // Update dynamic dashboard counters and notification badges on load
  updateDashboardMetrics();
  updateOrdersNotifications();
  updateSettingsLockout();
  if (typeof renderAnalyticsView === "function") {
    renderAnalyticsView();
  }

  // Render message badges and containers on load
  updateMessagesBadgeCount();
  renderMessages();
  if (typeof renderAnalyticsView === "function") {
    renderAnalyticsView();
  }
});

/**
 * Sum the value of paid orders.
 *
 * Shared by the dashboard, the orders tab and the analytics view so the three
 * can never disagree. Only "success" counts - a declined or abandoned
 * checkout is not income.
 *
 * Amounts are numbers now, but rows created before that change stored a
 * formatted string like "۴۹,۰۰۰ تومان", so both are parsed.
 */
/**
 * Read an order amount as a number.
 *
 * Handles both the current numeric form and older rows that stored a
 * formatted string, including Persian digits.
 */
