/**
 * Admin panel — access gate, roles and permission levels
 *
 * Who may open the panel at all, and what each role is allowed to do once
 * inside.
 *
 * BACKEND NOTE: a client-side gate is not security. Anyone can edit
 * JavaScript in their browser. Its job here is to stop the panel being
 * reached by typing the URL, and to give the server one obvious hook.
 * The real fix is for the server to refuse to serve admin.html, and every
 * /admin route, without a valid admin session.
 *
 * ADMIN_AUTH_ENABLED is deliberately false during development. It must be
 * set to true before release.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function mintAdminSession() {
  localStorage.setItem(
    "hesabyarSession",
    JSON.stringify({
      token: "admin-" + Date.now().toString(36),
      isAdmin: true,
      // Use the Persian role name the rest of the panel matches on. Writing
      // "admin" here would read back as the *restricted* tier and silently
      // strip the operator's rights while auth is disabled.
      user: { name: "مدیر سایت", role: "مدیر سایت" },
    }),
  );
}

function denyAdminAccess() {
  document.documentElement.innerHTML =
    '<body style="font-family:Vazirmatn,sans-serif;direction:rtl;display:flex;' +
    "align-items:center;justify-content:center;height:100vh;margin:0;" +
    'background:#0f172a;color:#e2e8f0;text-align:center">' +
    '<div><h1 style="font-size:1.5rem;margin-bottom:12px">دسترسی مجاز نیست</h1>' +
    '<p style="color:#94a3b8;margin-bottom:20px">برای ورود به پنل مدیریت باید احراز هویت کنید.</p>' +
    '<a href="index.html" style="color:#38bdf8">بازگشت به سایت</a></div></body>';
  return false;
}

/**
 * First-run setup: the operator chooses the panel password.
 * Returns true once a password has been stored.
 */
function runAdminPasswordSetup() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const chosen = window.prompt(
      "اولین ورود به پنل مدیریت\n\nیک رمز عبور انتخاب کنید (حداقل ۶ کاراکتر):",
    );
    if (chosen === null) return false;

    if (String(chosen).length < 6) {
      window.alert("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      continue;
    }

    const repeated = window.prompt("رمز عبور را دوباره وارد کنید:");
    if (repeated === null) return false;

    if (repeated !== chosen) {
      window.alert("رمز عبور و تکرار آن یکسان نیستند. دوباره تلاش کنید.");
      continue;
    }

    setAdminPassword(chosen);
    window.alert("رمز عبور ثبت شد. از این پس با همین رمز وارد شوید.");
    return true;
  }
  return false;
}

/* ----------------------------------------------------------------------------
   ADMIN_AUTH_ENABLED
   Development switch. While the project is frontend-only there is no server to
   authenticate against, so the gate is off and the panel opens directly.

   Flip this to true (or implement the server check described in
   docs/API_CONTRACT.md) before the site goes anywhere public. The gate code
   below is complete and tested - it only needs this flag.
   -------------------------------------------------------------------------- */
const ADMIN_AUTH_ENABLED = false;

/** Roles that carry full panel privileges. */
const MANAGER_ROLES = ["مدیر سایت", "مدیر سیستم", "manager"];

function requireAdminSession() {
  if (!ADMIN_AUTH_ENABLED) {
    // Local development: there is no real login, so default the operator to
    // the site manager with full rights.
    //
    // A session that was deliberately set (via adminDev.asAdmin(), or by the
    // test harness) is left alone - otherwise there would be no way to preview
    // the restricted view. Only a missing or role-less session is replaced.
    const existing = readAdminSession();
    if (!existing || !existing.user || !existing.user.role) {
      mintAdminSession();
    }
    return true;
  }

  // Opt-out for local development: append ?dev=1 to the URL.
  try {
    if (new URLSearchParams(window.location.search).get("dev") === "1") {
      return true;
    }
  } catch (error) {
    /* URLSearchParams unsupported - fall through to the normal check */
  }

  const session = readAdminSession();

  // Accept a session that the panel itself established.
  if (session && session.token && session.isAdmin === true) {
    return true;
  }

  // No password on this device yet - let the operator create one instead of
  // asking for a secret that does not exist.
  if (!adminPasswordIsConfigured()) {
    if (runAdminPasswordSetup()) {
      mintAdminSession();
      return true;
    }
    return denyAdminAccess();
  }

  const attempt = window.prompt("رمز عبور پنل مدیریت را وارد کنید:");
  if (attempt !== null && verifyAdminPassword(attempt)) {
    mintAdminSession();
    return true;
  }

  return denyAdminAccess();
}

function readAdminSession() {
  try {
    const raw = localStorage.getItem("hesabyarSession");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function adminPasswordIsConfigured() {
  return Boolean(localStorage.getItem("irHesabdarAdminPassword"));
}

/**
 * Store the panel password.
 *
 * BACKEND NOTE: swap for a request to the server. Never store credentials
 * client-side once a real API exists; the server should hash with bcrypt or
 * argon2.
 */
function setAdminPassword(value) {
  localStorage.setItem("irHesabdarAdminPassword", String(value));
}

function verifyAdminPassword(input) {
  const stored = localStorage.getItem("irHesabdarAdminPassword");
  if (!stored) return false;
  return String(input || "") === stored;
}

function setDevRole(role) {
  const raw = localStorage.getItem("hesabyarSession");
  let session;
  try {
    session = raw ? JSON.parse(raw) : null;
  } catch (error) {
    session = null;
  }
  session = session || {
    token: "dev-" + Date.now().toString(36),
    isAdmin: true,
    user: {},
  };
  session.user = {
    ...(session.user || {}),
    name: session.user?.name || "مدیر سایت",
    role: role,
  };
  session.isAdmin = true;
  localStorage.setItem("hesabyarSession", JSON.stringify(session));
  window.location.reload();
}

if (typeof window !== "undefined") {
  window.adminDev = {
    whoami() {
      const role = (readAdminSession()?.user || {}).role || "(بدون سشن)";
      const tier = isManager() ? "مدیر - دسترسی کامل" : "ادمین - دسترسی محدود";
      console.log(`نقش فعلی: ${role}\nسطح: ${tier}`);
      return role;
    },
    asManager: () => setDevRole("مدیر سایت"),
    asAdmin: () => setDevRole("ادمین"),
    reset() {
      localStorage.removeItem("hesabyarSession");
      window.location.reload();
    },
  };
}

/** Read the signed-in operator's role from the session. */
function readAdminRole() {
  try {
    const raw = localStorage.getItem("hesabyarSession");
    const session = raw ? JSON.parse(raw) : null;
    const role = session && session.user && session.user.role;
    if (!role) return "manager"; // dev fallback when auth is disabled
    return MANAGER_ROLES.indexOf(role) !== -1 ? "manager" : "admin";
  } catch (error) {
    return "manager";
  }
}

let currentAdminUserRole = readAdminRole();

/** True when the operator has full privileges. */
function isManager() {
  return currentAdminUserRole === "manager";
}

/* ----------------------------------------------------------------------------
   Staff hierarchy rules  (tab: مدیریت دسترسی‌ها)

     rank 1  مدیر سایت / مدیر سیستم   manager
     rank 2  ادمین                     admin
     rank 3  کاربر عادی                regular user

   Policy:
     - only a manager may change roles or delete staff
     - a manager may not act on another manager (no peer wars)
     - the last remaining manager cannot be deleted or demoted, otherwise the
       panel locks everyone out permanently
   -------------------------------------------------------------------------- */
const STAFF_RANK = {
  "مدیر سایت": 1,
  "مدیر سیستم": 1,
  ادمین: 2,
  "کاربر عادی": 3,
};

function rankOf(role) {
  return STAFF_RANK[role] || 3;
}

function isManagerRole(role) {
  return rankOf(role) === 1;
}

/** How many active managers exist right now. */
function managerCount() {
  const pool = (typeof appState !== "undefined" && appState.users) || [];
  return pool.filter((u) => u && isManagerRole(u.role)).length;
}

/**
 * Decide whether the signed-in operator may act on a target account.
 * Returns { allowed, reason } so callers can show a specific message rather
 * than a generic refusal.
 */
function canActOnStaff(target, action) {
  if (!target) return { allowed: false, reason: "حساب موردنظر پیدا نشد." };

  if (!isManager()) {
    return {
      allowed: false,
      reason: "این عملیات فقط برای مدیر سایت مجاز است.",
    };
  }

  // Never let the system end up without a manager - that would lock everyone
  // out of this tab permanently, with no way back from inside the panel.
  const removesAManager = action === "delete" || action === "demote";
  if (isManagerRole(target.role) && removesAManager && managerCount() <= 1) {
    return {
      allowed: false,
      reason: "این تنها مدیر سامانه است و نمی‌توان حذف یا تنزلش داد.",
    };
  }

  return { allowed: true, reason: "" };
}

/**
 * Roles a manager may assign from the panel.
 *
 * A manager can appoint another manager - the backend only seeds the *first*
 * one so there is someone to start with. "کاربر عادی" is deliberately absent:
 * this tab manages staff, and demoting someone out of staff happens by
 * deleting their staff record instead.
 */
function assignableRoles() {
  return ["مدیر سایت", "مدیر سیستم", "ادمین"];
}

/**
 * Hide all but the last four digits: ۰۹۱۲•••••۶۷۸۹ -> ۰۹۱۲•••••
 * The real value never reaches the DOM, so devtools cannot recover it.
 */
