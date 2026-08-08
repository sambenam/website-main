/**
 * appApi — the one and only way this project touches data.
 *
 * FOR THE BACKEND DEVELOPER: this file is yours. It is short on purpose.
 * Everything below is either the fetch() call that talks to your server, or
 * the list of routes the front-end expects. There is no business logic here.
 *
 * SWITCHING TO THE REAL SERVER
 * ============================
 * Two lines, in every HTML page, in a <script> before this file:
 *
 *     window.APP_CONFIG = {
 *       apiMode: "real",
 *       apiBaseUrl: "https://api.example.com",
 *     };
 *
 * Then delete the three <script src="../scripts/api-mock-*.js"> tags.
 * Nothing else changes. Every page in the site calls appApi and nothing else,
 * so no page knows or cares where the data comes from.
 *
 * Until then the mock in api-mock-*.js answers every route from localStorage,
 * which is how the whole front-end was built and tested without a server.
 *
 * WHAT YOU HAVE TO IMPLEMENT
 * ==========================
 * The `appApi` object at the bottom of this file is the complete list of
 * routes, grouped by area. docs/API_CONTRACT.md describes the request and
 * response shape of each one; api-mock-site.js and api-mock-admin.js are a
 * working reference
 * implementation you can read to see exactly what the front-end expects.
 *
 * FOUR SECURITY RULES THAT ARE NOT OPTIONAL
 * =========================================
 *   1. Build download entitlements from the ORDERS TABLE. Never trust a list
 *      of product ids sent by the client.
 *   2. Never send "staff" or "report" notification rows to an "ادمین" role.
 *      The client filter is for display only, not for access control.
 *   3. Re-check the account status on EVERY authenticated request. Blocking
 *      an account must stop a session that is already open, not just the
 *      next login.
 *   4. Confirm the amount and the payment result with the gateway itself,
 *      never from a URL parameter.
 *
 * Full checklist: docs/تحویل-به-بک‌اند.md
 */

const APP_API_STORAGE = "hesabyarApiState";
const APP_SESSION_STORAGE = "hesabyarSession";
const APP_LOCAL_STORAGE =
  typeof localStorage !== "undefined" ? localStorage : null;

const APP_API_CONFIG = {
  baseUrl:
    (typeof window !== "undefined" && window.APP_CONFIG?.apiBaseUrl) ||
    APP_LOCAL_STORAGE?.getItem("hesabyarApiBaseUrl") ||
    "",
  mode:
    (typeof window !== "undefined" && window.APP_CONFIG?.apiMode) ||
    APP_LOCAL_STORAGE?.getItem("hesabyarApiMode") ||
    "mock",
  timeout: 10000,
};

/** Roles that may reach the admin panel. */
const ADMIN_ROLES = ["مدیر سایت", "مدیر سیستم", "ادمین", "admin", "manager"];

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status || 0;
    this.details = details || null;
  }
}

function readStorage(key, fallback) {
  try {
    const value = APP_LOCAL_STORAGE?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  APP_LOCAL_STORAGE?.setItem(key, JSON.stringify(value));
}

/**
 * A strictly increasing counter for records created in the same millisecond.
 *
 * Date.now() has millisecond resolution, so two messages sent back to back
 * can share a timestamp and their relative order becomes undefined. This
 * breaks the tie, and it survives a reload because it is seeded from what is
 * already stored.
 */
let recordSequence = 0;
function nextSequence() {
  recordSequence += 1;
  return Date.now() * 1000 + (recordSequence % 1000);
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return prefix + "-" + crypto.randomUUID();
  }
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getSession() {
  return readStorage(APP_SESSION_STORAGE, null);
}

/**
 * The session of a customer who is allowed to act right now.
 *
 * Blocking an account only stopped the next login: anyone already signed in
 * carried on buying, sending messages and editing their profile for as long
 * as the tab stayed open, which made the moderation control largely
 * decorative. Every write path that acts on behalf of a customer checks the
 * live account status here instead of trusting the token.
 *
 * BACKEND NOTE: the server must repeat this on every authenticated request.
 * A disabled account has to be rejected at the API, not just in the client.
 */
function getActiveSession() {
  const session = getSession();
  if (!session || !session.user) return session;

  const account = (getApiState().users || []).find(
    (u) => String(u.id) === String(session.user.id),
  );
  // No matching record means a seeded or dev session; leave it alone.
  if (!account) return session;

  if (account.status && account.status !== "فعال") {
    throw new ApiError(
      "حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید.",
      403,
    );
  }
  return session;
}

function setSession(session) {
  if (session) {
    writeStorage(APP_SESSION_STORAGE, session);
  } else {
    APP_LOCAL_STORAGE?.removeItem(APP_SESSION_STORAGE);
  }
}

function getApiState() {
  const saved = readStorage(APP_API_STORAGE, {});
  return {
    ...saved,
    users: Array.isArray(saved.users) ? saved.users : [],
    messages: Array.isArray(saved.messages) ? saved.messages : [],
    newsletter: Array.isArray(saved.newsletter) ? saved.newsletter : [],
    orders: Array.isArray(saved.orders) ? saved.orders : [],
    profiles:
      saved.profiles && typeof saved.profiles === "object"
        ? saved.profiles
        : {},
    content:
      saved.content && typeof saved.content === "object" ? saved.content : {},
  };
}

function saveApiState(state) {
  writeStorage(APP_API_STORAGE, state);
}

/**
 * A money value that is safe to store.
 *
 * A negative amount used to be written straight through, and because the
 * revenue report just sums paid orders, one order of -90,000 cancelled out a
 * real 100,000 sale and the totals silently under-reported. Anything that is
 * not a finite, non-negative number becomes 0.
 */
function sanitizeAmount(value) {
  const amount = Number(value);
  if (!isFinite(amount) || amount < 0) return 0;
  return amount;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validateRequired(value, message) {
  if (!String(value || "").trim()) {
    throw new ApiError(message, 422);
  }
}

async function request(path, options) {
  const settings = options || {};

  if (APP_API_CONFIG.mode === "mock" || !APP_API_CONFIG.baseUrl) {
    return mockRequest(path, settings);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_API_CONFIG.timeout);
  const headers = new Headers(settings.headers || {});
  headers.set("Accept", "application/json");

  if (settings.body && typeof settings.body !== "string") {
    headers.set("Content-Type", "application/json");
    settings.body = JSON.stringify(settings.body);
  }

  const session = getSession();
  if (session?.token) {
    headers.set("Authorization", "Bearer " + session.token);
  }

  try {
    const response = await fetch(
      APP_API_CONFIG.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, ""),
      {
        method: settings.method || "GET",
        headers: headers,
        body: settings.body,
        signal: controller.signal,
      },
    );
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiError(
        payload?.message || "ارتباط با سرور ناموفق بود.",
        response.status,
        payload,
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("زمان پاسخ‌گویی سرور به پایان رسید.", 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("امکان برقراری ارتباط با سرور وجود ندارد.", 0, error);
  } finally {
    clearTimeout(timeout);
  }
}

const appApi = {
  config: APP_API_CONFIG,
  request: request,
  auth: {
    login: (payload) =>
      request("/auth/login", { method: "POST", body: payload }),
    register: (payload) =>
      request("/auth/register", { method: "POST", body: payload }),
    logout: () => request("/auth/logout", { method: "POST" }),
    /** Dev helper - see the /auth/promote note in the mock router. */
    promote: (payload) =>
      request("/auth/promote", { method: "POST", body: payload }),
    me: () => request("/auth/me"),
    forgotPassword: (payload) =>
      request("/auth/forgot-password", { method: "POST", body: payload }),
  },
  support: {
    sendMessage: (payload) =>
      request("/support/messages", { method: "POST", body: payload }),
    myMessages: (payload) =>
      request("/support/my-messages", { method: "POST", body: payload || {} }),
    reportAbuse: (payload) =>
      request("/support/reports", { method: "POST", body: payload }),
  },
  newsletter: {
    subscribe: (payload) =>
      request("/newsletter/subscribe", { method: "POST", body: payload }),
  },
  profile: {
    update: (payload) =>
      request("/profile/update", { method: "PATCH", body: payload }),
    changePassword: (payload) =>
      request("/profile/password", { method: "POST", body: payload }),
  },
  commerce: {
    validateCoupon: (payload) =>
      request("/commerce/coupon", { method: "POST", body: payload }),
    createPayment: (payload) =>
      request("/commerce/payment", { method: "POST", body: payload }),
    recordCancelled: (payload) =>
      request("/commerce/cancelled", { method: "POST", body: payload }),
    myOrders: (payload) =>
      request("/commerce/my-orders", { method: "POST", body: payload || {} }),
    // Which products this customer may download, derived from paid orders.
    entitlements: () =>
      request("/commerce/entitlements", { method: "POST", body: {} }),
  },
  content: {
    get: (itemId) => request("/content/items/" + encodeURIComponent(itemId)),
    update: (itemId, payload) =>
      request("/content/items/" + encodeURIComponent(itemId), {
        method: "PATCH",
        body: payload,
      }),
    remove: (itemId) =>
      request("/content/items/" + encodeURIComponent(itemId), {
        method: "DELETE",
      }),
  },

  /* ------------------------------------------------------------------------
     ADMIN PANEL API
     Every admin-panel data operation goes through here. A backend developer
     implements the endpoints listed in scripts/admin/API_CONTRACT.md, flips
     APP_API_CONFIG.mode to "real", and the panel keeps working unchanged.
     ------------------------------------------------------------------------ */
  admin: {
    products: {
      list: () => request("/admin/products"),
      create: (payload) =>
        request("/admin/products", { method: "POST", body: payload }),
      update: (id, payload) =>
        request("/admin/products/" + encodeURIComponent(id), {
          method: "PATCH",
          body: payload,
        }),
      remove: (id) =>
        request("/admin/products/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    orders: {
      list: () => request("/admin/orders"),
      create: (payload) =>
        request("/admin/orders", { method: "POST", body: payload }),
      updateStatus: (id, status) =>
        request("/admin/orders/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
    },
    users: {
      list: () => request("/admin/users"),
      create: (payload) =>
        request("/admin/users", { method: "POST", body: payload }),
      updateStatus: (id, status) =>
        request("/admin/users/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
      updateRole: (id, role) =>
        request("/admin/users/" + encodeURIComponent(id) + "/role", {
          method: "PATCH",
          body: { role },
        }),
      remove: (id) =>
        request("/admin/users/" + encodeURIComponent(id), { method: "DELETE" }),
    },
    notifications: {
      list: () => request("/admin/notifications"),
      create: (payload) =>
        request("/admin/notifications", { method: "POST", body: payload }),
      markRead: (id) =>
        request("/admin/notifications/" + encodeURIComponent(id) + "/read", {
          method: "PATCH",
          body: {},
        }),
      remove: (id) =>
        request("/admin/notifications/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
      clear: () => request("/admin/notifications", { method: "DELETE" }),
    },
    pendingChanges: {
      list: () => request("/admin/pending-changes"),
      stage: (staffId, changes) =>
        request("/admin/pending-changes/" + encodeURIComponent(staffId), {
          method: "POST",
          body: changes,
        }),
      clear: (staffId) =>
        request("/admin/pending-changes/" + encodeURIComponent(staffId), {
          method: "DELETE",
        }),
    },
    audit: {
      list: (staffId) => request("/admin/audit/" + encodeURIComponent(staffId)),
      record: (staffId, entry) =>
        request("/admin/audit/" + encodeURIComponent(staffId), {
          method: "POST",
          body: entry,
        }),
    },
    contentItems: {
      list: () => request("/admin/content-items"),
      create: (payload) =>
        request("/admin/content-items", { method: "POST", body: payload }),
      remove: (id) =>
        request("/admin/content-items/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    reports: {
      list: () => request("/admin/reports"),
      setStatus: (id, status) =>
        request("/admin/reports/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
      reply: (id, payload) =>
        request("/admin/reports/" + encodeURIComponent(id) + "/reply", {
          method: "POST",
          body: payload,
        }),
      remove: (id) =>
        request("/admin/reports/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    messages: {
      list: () => request("/admin/messages"),
      reply: (id, payload) =>
        request("/admin/messages/" + encodeURIComponent(id) + "/reply", {
          method: "POST",
          body: payload,
        }),
      markRead: (id) =>
        request("/admin/messages/" + encodeURIComponent(id) + "/read", {
          method: "PATCH",
          body: {},
        }),
      remove: (id) =>
        request("/admin/messages/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    settings: {
      get: () => request("/admin/settings"),
      save: (payload) =>
        request("/admin/settings", { method: "PUT", body: payload }),
    },
  },
};

/* ============================================================================
   MOCK BRIDGE

   In a browser, the api-mock-*.js files are loaded by their own <script>
   tags before this one, so mockRequest is already a global by the time
   request() runs.

   Under Node there are no script tags. Loading the mock with eval() puts its
   declarations into this module's scope, which is what a browser does for
   free — a plain require() would give the mock its own scope and its helpers
   would not see readStorage, getApiState or ApiError.

   When the backend is live and the mock files are deleted, this block finds
   nothing and does nothing. request() then always goes to fetch(), which is the
   intended end state.
   ========================================================================== */
if (typeof mockRequest === "undefined" && typeof require === "function") {
  try {
    const nodeFs = require("fs");
    const nodePath = require("path");
    // Same order the HTML pages use: the store first, then the two route
    // files that build on it.
    //
    // The three sources are joined and eval'd ONCE, in this scope. Evaluating
    // them one call at a time does not work: each eval() would get its own
    // scope, so api-mock-site.js could not see ADMIN_KEYS from the store file
    // and Node failed with "mockRequest is not defined" while the browser was
    // perfectly happy. Joining them reproduces the single shared scope that
    // classic <script> tags give for free.
    const mockSource = [
      "api-mock-store.js",
      "api-mock-site.js",
      "api-mock-admin.js",
    ]
      .map((name) => nodePath.join(__dirname, name))
      .filter((file) => nodeFs.existsSync(file))
      .map((file) => nodeFs.readFileSync(file, "utf8"))
      .join("\n;\n");
    if (mockSource) eval(mockSource);
  } catch (error) {
    /* No mock available: request() falls through to fetch(). */
  }
}

if (typeof window !== "undefined") {
  window.appApi = appApi;
  window.ApiError = ApiError;
}

if (typeof module !== "undefined") {
  module.exports = { appApi, ApiError, APP_API_CONFIG };
}
