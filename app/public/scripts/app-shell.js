(function () {
  function fixKnownLinks() {
    document.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (href === "home.html") link.setAttribute("href", "index.html");
      if (href === "../html/home.html")
        link.setAttribute("href", "../html/index.html");
      if (href === "signup.html") link.setAttribute("href", "sign-up.html");
      if (href === "../html/signup.html")
        link.setAttribute("href", "../html/sign-up.html");
    });
  }

  function bindSearch() {
    document.querySelectorAll(".search-box input").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && input.value.trim()) {
          window.location.href =
            "list-page.html?query=" + encodeURIComponent(input.value.trim());
        }
      });
    });
  }

  function bindNewsletter() {
    document.querySelectorAll(".newsletter-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector('input[type="email"]');
        const button = form.querySelector("button");
        if (!input?.value.trim()) return;
        const original = button?.innerHTML;
        if (button) {
          button.disabled = true;
          button.innerHTML = "...";
        }
        try {
          const result = await appApi.newsletter.subscribe({
            email: input.value.trim(),
          });
          showShellMessage(form, result.message, "success");
          form.reset();
        } catch (error) {
          showShellMessage(form, error.message, "error");
        } finally {
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
        }
      });
    });
  }

  function showShellMessage(form, message, type) {
    let messageEl = form.querySelector(".shell-form-message");
    if (!messageEl) {
      messageEl = document.createElement("small");
      messageEl.className = "shell-form-message";
      form.appendChild(messageEl);
    }
    messageEl.textContent = message;
    messageEl.dataset.type = type || "info";
  }

  function checkMaintenanceMode() {
    if (window.location.pathname.includes("admin.html")) {
      return;
    }

    // Read the dedicated flag first (written synchronously by the panel so the
    // gate applies before first paint), then fall back to the settings object.
    let isMaintenance =
      localStorage.getItem("irHesabdarMaintenanceMode") === "true";
    if (!isMaintenance) {
      try {
        const raw = localStorage.getItem("irHesabdarSystemSettings");
        if (raw) isMaintenance = JSON.parse(raw).maintenanceMode === true;
      } catch (error) {
        /* malformed settings should never block the site */
      }
    }

    let supportEmail = "support@irhesabdar.ir";
    try {
      const raw = localStorage.getItem("irHesabdarSystemSettings");
      if (raw) supportEmail = JSON.parse(raw).supportEmail || supportEmail;
    } catch (error) {
      /* keep the fallback */
    }

    if (!isMaintenance) return;

    // Staff keep browsing. The whole point of maintenance mode is to work on
    // the site while visitors are held back, so locking out the person doing
    // the work is backwards. A banner reminds them the site is closed.
    if (isStaff(readSession())) {
      showMaintenanceBanner();
      return;
    }

    {
      document.body.innerHTML = `
        <div style="position: fixed; inset: 0; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999999; color: #fff; text-align: center; font-family: 'Vazirmatn', sans-serif; padding: 20px; direction: rtl;">
          <i class="fas fa-tools" style="font-size: 5rem; color: #ff9500; margin-bottom: 20px; animation: bounce 2s infinite;"></i>
          <h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 10px;">🛠️ وب‌سایت در دست تعمیر و به‌روزرسانی است</h1>
          <p style="color: #94a3b8; max-width: 500px; line-height: 1.8; margin-bottom: 20px; font-size: 15px;">کاربر گرامی، ما در حال ارتقا و بهبود خدمات وبسایت هستیم. از اینکه تا پایان این فرایند مارا همراهی میکنید متشکریم.</p>
          <div style="font-size: 13px; color: #64748b; margin-bottom: 18px;">پشتیبانی: ${supportEmail}</div>
          <a href="admin.html" style="font-size: 12px; color: #64748b; text-decoration: none; border: 1px solid #334155; padding: 7px 14px; border-radius: 8px;">ورود مدیران</a>
          
          <style>
            @keyframes bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
          </style>
        </div>
      `;
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Apply site settings managed from the admin panel.
   *
   * Markup opts in with data attributes:
   *   <span data-site-email>...</span>
   *   <span data-site-phone>...</span>
   * The text in the HTML stays as a sensible fallback, so a page still reads
   * correctly if settings were never saved or the request fails.
   *
   * BACKEND NOTE: this reads through appApi.admin.settings.get(), so when the
   * API goes live the footer picks up server-managed values automatically.
   */
  async function applySiteSettings() {
    const emailNodes = document.querySelectorAll("[data-site-email]");
    const phoneNodes = document.querySelectorAll("[data-site-phone]");
    if (!emailNodes.length && !phoneNodes.length) return;

    let settings = null;
    try {
      if (typeof appApi !== "undefined" && appApi.admin) {
        settings = await appApi.admin.settings.get();
      }
    } catch (error) {
      console.warn("app-shell: could not load site settings", error);
    }
    if (!settings || typeof settings !== "object") return;

    if (settings.supportEmail) {
      emailNodes.forEach((node) => {
        node.textContent = settings.supportEmail;
      });
    }
    if (settings.supportPhone) {
      phoneNodes.forEach((node) => {
        node.textContent = settings.supportPhone;
      });
    }
  }

  /* ==========================================================================
     AUTH-AWARE HEADER
     --------------------------------------------------------------------------
     The header ships a static "ورود / عضویت" link. Once someone is signed in
     that link should become their account, and staff accounts additionally get
     a link into the admin panel - that is the normal way an admin reaches the
     dashboard, rather than typing the URL.

     Roles that unlock the admin link:
       مدیر سایت · مدیر سیستم · ادمین   (or role === "admin" / isAdmin === true)

     BACKEND NOTE: the role must come from the server (appApi.auth.me()), never
     from a value the browser can edit. This function reads the session for
     display purposes only - the server still has to reject /admin/* requests
     from non-staff accounts.
     ========================================================================== */
  const STAFF_ROLES = ["مدیر سایت", "مدیر سیستم", "ادمین", "admin", "manager"];

  function readSession() {
    try {
      const raw = localStorage.getItem("hesabyarSession");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function isStaff(session) {
    if (!session) return false;
    if (session.isAdmin === true) return true;
    const role = session.user && session.user.role;
    return STAFF_ROLES.indexOf(role) !== -1;
  }

  /**
   * Build the two links a signed-in visitor sees.
   *
   * Staff and regular users get different destinations because they manage
   * their account in different places: an admin edits their profile inside the
   * dashboard, a customer edits it on user-profile.html. So there is exactly
   * one account link either way, never both.
   *
   *   staff         ->  پنل مدیریت  +  خروج
   *   regular user  ->  پروفایل     +  خروج
   */
  function buildAuthLinks(session) {
    const staff = isStaff(session);
    return {
      href: staff ? "admin.html" : "/user-profile",
      label: staff ? "پنل مدیریت" : "پروفایل",
      icon: staff ? "fa-gauge-high" : "fa-user",
      isStaff: staff,
    };
  }

  function renderAuthMenu() {
    const session = readSession();
    const signedIn = Boolean(session && session.token);
    if (!signedIn) return; // signed out: leave the authored markup untouched

    const link = buildAuthLinks(session);
    const onAdminPage = window.location.pathname.indexOf("admin.html") !== -1;

    // --- desktop header -----------------------------------------------------
    document.querySelectorAll(".right-menu_items.signin").forEach((slot) => {
      const parts = [];

      // On the admin page the dashboard link would point at the current page,
      // so offer a way back to the site instead.
      if (link.isStaff && onAdminPage) {
        parts.push(
          '<a href="index.html" class="signup">' +
            '<i class="fa-solid fa-house" style="margin-left:6px"></i>بازگشت به سایت</a>',
        );
      } else {
        parts.push(
          '<a href="' +
            link.href +
            '" class="signup">' +
            '<i class="fa-solid ' +
            link.icon +
            '" style="margin-left:6px"></i>' +
            link.label +
            "</a>",
        );
      }

      parts.push(
        '<a href="#" data-logout style="margin-right:10px;color:#ef4444" ' +
          'title="خروج از حساب">' +
          '<i class="fa-solid fa-arrow-right-from-bracket"></i></a>',
      );

      slot.innerHTML = parts.join("");
    });

    // --- mobile menu --------------------------------------------------------
    document
      .querySelectorAll('.mobile-dropdown-btn[href*="sign-up.html"]')
      .forEach((btn) => {
        const item = btn.closest(".mobile-dropdown") || btn.parentElement;
        if (!item) return;
        item.innerHTML =
          '<a href="' +
          link.href +
          '" class="mobile-dropdown-btn">' +
          "<span>" +
          link.label +
          "</span></a>";

        const logout = document.createElement("li");
        logout.className = "mobile-dropdown";
        logout.innerHTML =
          '<a href="#" class="mobile-dropdown-btn" data-logout>' +
          '<span style="color:#ef4444">خروج از حساب</span></a>';
        item.parentElement?.insertBefore(logout, item.nextSibling);
      });

    bindLogout();
  }

  function bindLogout() {
    document.querySelectorAll("[data-logout]").forEach((el) => {
      if (el.dataset.logoutBound) return;
      el.dataset.logoutBound = "1";
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          if (typeof appApi !== "undefined") await appApi.auth.logout();
        } catch (error) {
          /* clearing the local session is enough for the mock backend */
        }
        localStorage.removeItem("hesabyarSession");
        window.location.href = "/";
      });
    });
  }

  /**
   * A strip across the top telling staff the site is closed to visitors.
   * Without it, it is easy to switch maintenance on, get distracted, and
   * leave the shop shut for a day.
   */
  function showMaintenanceBanner() {
    if (document.getElementById("maintenanceBanner")) return;

    const bar = document.createElement("div");
    bar.id = "maintenanceBanner";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;" +
      "align-items:center;justify-content:center;gap:10px;padding:9px 14px;" +
      "background:#ff9500;color:#1c1c1e;font-size:13px;font-weight:700;" +
      "font-family:Vazirmatn,sans-serif;direction:rtl;box-shadow:0 2px 10px rgba(0,0,0,.15)";
    bar.innerHTML =
      '<i class="fas fa-tools"></i>' +
      "<span>سایت در حالت تعمیر است و برای بازدیدکنندگان بسته می‌باشد.</span>" +
      '<a href="admin.html#settings" style="color:#1c1c1e;text-decoration:underline;">غیرفعال کردن</a>';

    document.body.prepend(bar);
    // Push the page down so the banner does not cover the header.
    document.body.style.paddingTop = "38px";
  }

  function init() {
    checkMaintenanceMode();
    fixKnownLinks();
    bindSearch();
    bindNewsletter();
    applySiteSettings();
    renderAuthMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
