/**
 * User Profile & Cart JavaScript
 * Interactive tab switching, cart management, profile editing, and toast alerts.
 */

/**
 * The cart is whatever the customer actually put in it.
 *
 * This used to fall back to two invented products - a gaming laptop and a
 * pair of earbuds - which are not even things this site sells. A visitor
 * with an empty cart saw 33,000,000 تومان of goods they never chose, and
 * "پاک کردن سبد" could not remove them because they came back on reload.
 */
let cartState = loadCart();

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("hesabyarCart") || "null");
    if (!Array.isArray(saved)) return [];
    // Keep only rows that still look like a product.
    return saved
      .filter((item) => item && (item.id || item.name))
      .map((item) => ({
        id: item.id,
        name: item.name || "محصول",
        price: Number(item.price) || 0,
        qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
        img: item.img || item.image || "../images/ravin.png",
      }));
  } catch (error) {
    return [];
  }
}

function persistCart() {
  localStorage.setItem("hesabyarCart", JSON.stringify(cartState));
}

document.addEventListener("DOMContentLoaded", () => {
  initProfileNavigation();
  initProfileForms();
  initAvatarUpload();
  renderCart();
  loadCurrentProfile();
});

async function loadCurrentProfile() {
  if (typeof appApi === "undefined") return;
  try {
    const user = await appApi.auth.me();
    applyProfile(user);
  } catch (error) {
    try {
      const saved = JSON.parse(
        localStorage.getItem("hesabyarGuestProfile") || "null",
      );
      if (saved) applyProfile(saved);
    } catch (storageError) {
      return;
    }
  }
}

function applyProfile(profile) {
  if (profile.name) {
    document.getElementById("profileFullName").textContent = profile.name;
    document.getElementById("inputName").value = profile.name;
  }
  if (profile.email) {
    document.getElementById("profileUserEmail").textContent = profile.email;
    document.getElementById("inputEmail").value = profile.email;
  }
  if (profile.phone)
    document.getElementById("inputPhone").value = profile.phone;
  if (profile.birth)
    document.getElementById("inputBirth").value = profile.birth;
  if (profile.address)
    document.getElementById("inputAddress").value = profile.address;
}

// Tab Router
function initProfileNavigation() {
  const navItems = document.querySelectorAll(".profile-nav li[data-tab]");
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabName = item.getAttribute("data-tab");

      navItems.forEach((li) => li.classList.remove("active"));
      item.classList.add("active");

      document.querySelectorAll(".profile-tab-content").forEach((tab) => {
        tab.classList.remove("active");
      });
      const targetTab = document.getElementById(`tab-${tabName}`);
      if (targetTab) {
        targetTab.classList.add("active");
      }
    });
  });

  const logoutBtn = document.getElementById("logoutProfileBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("آیا می‌خواهید از حساب کاربری خود خارج شوید؟")) {
        showToast("با موفقیت خارج شدید", "info");
        setTimeout(() => window.location.reload(), 1000);
      }
    });
  }
}

// Cart Management
function renderCart() {
  const container = document.getElementById("cartItemsContainer");
  const badge = document.getElementById("cartBadge");
  const countStat = document.getElementById("cartCountStat");
  const summarySection = document.getElementById("cartSummarySection");

  if (!container) return;

  const totalCount = cartState.reduce((sum, item) => sum + item.qty, 0);
  if (badge) {
    badge.textContent = totalCount.toLocaleString("fa-IR");
    badge.style.display = totalCount ? "" : "none";
  }
  if (countStat) countStat.textContent = totalCount.toLocaleString("fa-IR");

  if (cartState.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">سبد خرید شما خالی است.</p>`;
    if (summarySection) summarySection.style.display = "none";
    return;
  }

  if (summarySection) summarySection.style.display = "block";

  container.innerHTML = cartState
    .map((item) => {
      // Product ids are strings like "acc-101", so they are passed as
      // quoted values; a bare ${item.id} produced invalid JavaScript.
      const safeId = String(item.id).replace(/'/g, "\\'");
      return `
        <div class="cart-item">
            <img src="${escapeProfileHtml(item.img)}" alt=""
                 onerror="this.src='../images/ravin.png'">
            <div class="cart-item-info">
                <h4>${escapeProfileHtml(item.name)}</h4>
                <p class="price">${(item.price * item.qty).toLocaleString("fa-IR")} تومان</p>
            </div>
            <div class="cart-quantity-controls">
                <button class="qty-btn" onclick="updateQty('${safeId}', -1)" aria-label="کاهش">-</button>
                <span style="font-weight:600; min-width:20px; text-align:center;">${item.qty.toLocaleString("fa-IR")}</span>
                <button class="qty-btn" onclick="updateQty('${safeId}', 1)" aria-label="افزایش">+</button>
                <button class="qty-btn" style="color:var(--up-danger,#FF3B30); margin-right:8px;" onclick="removeItem('${safeId}')" aria-label="حذف"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
    })
    .join("");

  const totalPrice = cartState.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const formattedTotal = totalPrice.toLocaleString("fa-IR") + " تومان";
  const totalEl = document.getElementById("cartTotalPrice");
  const finalEl = document.getElementById("cartFinalPrice");
  if (totalEl) totalEl.textContent = formattedTotal;
  if (finalEl) finalEl.textContent = formattedTotal;
}

function updateQty(id, delta) {
  const item = cartState.find((i) => String(i.id) === String(id));
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      cartState = cartState.filter((i) => String(i.id) !== String(id));
    }
    renderCart();
    persistCart();
  }
}

function removeItem(id) {
  cartState = cartState.filter((i) => String(i.id) !== String(id));
  renderCart();
  persistCart();
  showToast("محصول از سبد خرید حذف شد", "info");
}

function checkoutCart() {
  if (cartState.length === 0) {
    showToast("سبد خرید شما خالی است", "info");
    return;
  }
  // Carry the line items through, not just the total: the gateway records
  // an order per product and the bestsellers report reads those rows.
  const total = cartState.reduce((sum, item) => sum + item.price * item.qty, 0);
  sessionStorage.setItem(
    "hesabyarCheckout",
    JSON.stringify({
      total: total,
      finalAmount: total,
      items: cartState.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.qty,
      })),
    }),
  );
  window.location.href = "checkout.html";
}

// Form Handlers
function initProfileForms() {
  const personalForm = document.getElementById("personalInfoForm");
  if (personalForm) {
    personalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("inputName").value;
      const email = document.getElementById("inputEmail").value;

      const profile = {
        name,
        email,
        phone: document.getElementById("inputPhone").value.trim(),
        birth: document.getElementById("inputBirth").value.trim(),
        address: document.getElementById("inputAddress").value.trim(),
      };
      try {
        await appApi.profile.update(profile);
      } catch (error) {
        localStorage.setItem("hesabyarGuestProfile", JSON.stringify(profile));
      }
      applyProfile(profile);
      showToast("اطلاعات شخصی با موفقیت ذخیره شد", "success");
    });
  }

  initSecurityTab();
}

/* ============================================================================
   امنیت و رمز عبور
   ----------------------------------------------------------------------------
   Three password boxes used to sit open permanently, so the tab looked like
   it was demanding a password change just to be viewed. The new fields are
   collapsed until the customer asks for them, every box has an eye toggle,
   and the change itself goes through a countdown confirmation - losing your
   password by mis-clicking is not a recoverable mistake.
   ========================================================================== */
function initSecurityTab() {
  const form = document.getElementById("securityForm");
  if (!form) return;

  const toggle = document.getElementById("togglePasswordChange");
  const section = document.getElementById("newPasswordSection");
  const submitBtn = document.getElementById("updatePasswordBtn");
  const newPass = document.getElementById("newPassword");
  const confirmPass = document.getElementById("confirmPassword");
  const hint = document.getElementById("passwordHint");

  /* -- eye toggles ------------------------------------------------------- */
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = document.getElementById(
        button.getAttribute("data-toggle-password"),
      );
      if (!field) return;
      const showing = field.type === "text";
      field.type = showing ? "password" : "text";
      button.querySelector("i").className = showing
        ? "fas fa-eye"
        : "fas fa-eye-slash";
      button.setAttribute(
        "aria-label",
        showing ? "نمایش رمز عبور" : "پنهان کردن رمز عبور",
      );
    });
  });

  /* -- reveal the new-password fields ------------------------------------ */
  let wantsChange = false;
  if (toggle && section) {
    toggle.addEventListener("click", () => {
      wantsChange = !wantsChange;
      section.hidden = !wantsChange;
      toggle.setAttribute("aria-expanded", String(wantsChange));
      toggle.classList.toggle("is-open", wantsChange);
      if (!wantsChange) {
        newPass.value = "";
        confirmPass.value = "";
      }
      refreshState();
      if (wantsChange) newPass.focus();
    });
  }

  /* -- live validation --------------------------------------------------- */
  function problem() {
    if (!wantsChange) return "برای تغییر رمز، گزینه بالا را انتخاب کنید.";
    if (!document.getElementById("currentPassword").value)
      return "رمز عبور فعلی را وارد کنید.";
    if (newPass.value.length < 6) return "رمز جدید باید حداقل ۶ کاراکتر باشد.";
    if (newPass.value !== confirmPass.value)
      return "رمز جدید و تکرار آن یکسان نیستند.";
    return null;
  }

  function refreshState() {
    const issue = problem();
    if (submitBtn) submitBtn.disabled = Boolean(issue);
    if (!hint) return;
    if (!wantsChange) {
      hint.textContent = "رمز جدید باید حداقل ۶ کاراکتر باشد.";
      hint.dataset.tone = "";
    } else if (issue) {
      hint.textContent = issue;
      hint.dataset.tone = "warn";
    } else {
      hint.textContent = "رمز جدید آماده ثبت است.";
      hint.dataset.tone = "ok";
    }
  }

  [document.getElementById("currentPassword"), newPass, confirmPass]
    .filter(Boolean)
    .forEach((field) => field.addEventListener("input", refreshState));
  refreshState();

  /* -- countdown confirmation -------------------------------------------- */
  const overlay = document.getElementById("passwordConfirmOverlay");
  const countEl = document.getElementById("passwordConfirmCount");
  let timer = null;

  function closeConfirm() {
    clearInterval(timer);
    if (overlay) overlay.hidden = true;
  }

  function askConfirm() {
    return new Promise((resolve) => {
      if (!overlay) {
        resolve(true);
        return;
      }
      let remaining = 5;
      countEl.textContent = remaining.toLocaleString("fa-IR");
      overlay.hidden = false;

      const finish = (ok) => {
        closeConfirm();
        resolve(ok);
      };
      document.getElementById("passwordConfirmAccept").onclick = () =>
        finish(true);
      document.getElementById("passwordConfirmCancel").onclick = () =>
        finish(false);

      timer = setInterval(() => {
        remaining -= 1;
        countEl.textContent = Math.max(remaining, 0).toLocaleString("fa-IR");
        // Running out means "go ahead" - the operator has had five seconds
        // staring at the warning to say no.
        if (remaining <= 0) finish(true);
      }, 1000);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const issue = problem();
    if (issue) {
      showToast(issue, "error");
      return;
    }

    const confirmed = await askConfirm();
    if (!confirmed) {
      showToast("تغییر رمز عبور لغو شد.", "info");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      await appApi.profile.changePassword({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: newPass.value,
      });
      form.reset();
      wantsChange = false;
      if (section) section.hidden = true;
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.classList.remove("is-open");
      }
      refreshState();
      showToast("رمز عبور با موفقیت به‌روزرسانی شد", "success");
    } catch (error) {
      showToast(
        error && error.message ? error.message : "تغییر رمز انجام نشد.",
        "error",
      );
    } finally {
      refreshState();
    }
  });
}

// Avatar Upload Simulation
function initAvatarUpload() {
  const uploadInput = document.getElementById("avatarUpload");
  const avatarImg = document.getElementById("userAvatarImg");

  if (uploadInput && avatarImg) {
    uploadInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          avatarImg.src = event.target.result;
          showToast("تصویر پروفایل به‌روز شد", "success");
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// Toast notification helper
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = type === "success" ? "fa-check-circle" : "fa-info-circle";

  toast.innerHTML = `
        <i class="fas ${icon}" style="font-size: 18px; color: var(--${type === "success" ? "success" : "primary"});"></i>
        <span>${message}</span>
    `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================================
   MY ORDERS
   The profile page shipped with hardcoded sample rows showing 25,000,000-toman
   purchases. This renders the visitor's real order history instead - including
   failed and cancelled attempts, so a customer can see why a payment did not
   go through rather than assuming the site lost their money.
   ========================================================================== */
const MY_ORDER_LABELS = {
  success: { text: "پرداخت موفق", cls: "success" },
  failed: { text: "پرداخت ناموفق", cls: "cancelled" },
  cancelled: { text: "لغو شده", cls: "cancelled" },
  pending: { text: "در حال پردازش", cls: "pending" },
};

function formatMyOrderAmount(amount) {
  const value =
    typeof amount === "number"
      ? amount
      : parseFloat(String(amount || "").replace(/[^\d.]/g, ""));
  if (isNaN(value)) return "—";
  return value.toLocaleString("fa-IR") + " تومان";
}

async function renderMyOrders() {
  const tbody = document.getElementById("myOrdersBody");
  if (!tbody) return;

  let orders = [];
  try {
    orders = await appApi.commerce.myOrders();
  } catch (error) {
    console.warn("profile: could not load orders", error);
  }

  // Sidebar count and nav badge come from the same list the table renders,
  // so the number can never disagree with what is on screen.
  const countStat = document.getElementById("ordersCountStat");
  const badge = document.getElementById("ordersBadge");
  const total = Array.isArray(orders) ? orders.length : 0;
  if (countStat) countStat.textContent = total.toLocaleString("fa-IR");
  if (badge) {
    badge.textContent = total.toLocaleString("fa-IR");
    badge.style.display = total ? "" : "none";
  }

  if (!total) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--up-text-soft,#86868b);">' +
      "هنوز سفارشی ثبت نکرده‌اید.</td></tr>";
    return;
  }

  tbody.innerHTML = orders
    .map((order) => {
      const label = MY_ORDER_LABELS[order.status] || {
        text: order.status,
        cls: "pending",
      };
      const reason = order.failureReason
        ? `<small style="display:block;margin-top:4px;font-size:11px;color:var(--up-text-soft,#86868b);">${escapeProfileHtml(order.failureReason)}</small>`
        : "";
      // Only a paid order has an invoice worth downloading.
      const action =
        order.status === "success"
          ? `<button class="btn-secondary" onclick="showToast('فاکتور سفارش ${order.id} آماده شد', 'info')">فاکتور</button>`
          : `<button class="btn-secondary" disabled style="opacity:.5;cursor:not-allowed;">—</button>`;

      return `
        <tr>
          <td>${escapeProfileHtml(order.id)}
            <small style="display:block;margin-top:3px;font-size:11px;color:var(--up-text-soft,#86868b);">${escapeProfileHtml(order.product || "—")}</small>
          </td>
          <td>${escapeProfileHtml(order.date || "—")}</td>
          <td>${formatMyOrderAmount(order.amount)}</td>
          <td><span class="status ${label.cls}">${label.text}</span>${reason}</td>
          <td>${action}</td>
        </tr>`;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", renderMyOrders);

/* ============================================================================
   پیام‌های من
   ----------------------------------------------------------------------------
   The other half of the support inbox. A message sent from the contact form
   or the assistant widget shows up here, and so does the admin's reply -
   otherwise an answer written in the panel never reaches the person who
   asked the question.
   ========================================================================== */

function escapeProfileHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MY_MESSAGE_SOURCES = {
  ai: { label: "پشتیبان هوشمند", icon: "fa-robot" },
  contact: { label: "فرم تماس با ما", icon: "fa-envelope" },
  site: { label: "فرم تماس با ما", icon: "fa-envelope" },
};

async function renderMyMessages() {
  const host = document.getElementById("myMessagesList");
  if (!host) return;

  let messages = [];
  try {
    if (
      typeof appApi !== "undefined" &&
      appApi.support &&
      appApi.support.myMessages
    ) {
      const result = await appApi.support.myMessages();
      if (Array.isArray(result)) messages = result;
    }
  } catch (error) {
    host.innerHTML =
      '<p class="my-messages-empty">پیام‌ها بارگذاری نشد. لطفاً صفحه را دوباره باز کنید.</p>';
    return;
  }

  // Newest conversation first. Ids are random UUIDs, so comparing them
  // sorted alphabetically rather than by when the message was sent.
  messages.sort(function (a, b) {
    const at = Date.parse(a.createdAt || "") || 0;
    const bt = Date.parse(b.createdAt || "") || 0;
    return bt - at;
  });

  const badge = document.getElementById("myMessagesBadge");
  // A thread is "waiting on you" only once support has written back.
  const replied = messages.filter(
    (m) =>
      Array.isArray(m.history) && m.history.some((b) => b.sender === "admin"),
  ).length;
  if (badge) {
    if (replied > 0) {
      badge.textContent = replied;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  if (!messages.length) {
    host.innerHTML =
      '<p class="my-messages-empty">هنوز پیامی نفرستاده‌اید. ' +
      'از بخش <a href="support.html">تماس با ما</a> یا پشتیبان هوشمند صفحه اصلی ' +
      "می‌توانید سوال خود را بپرسید.</p>";
    return;
  }

  host.innerHTML = messages
    .map(function (message) {
      const meta =
        MY_MESSAGE_SOURCES[message.source] || MY_MESSAGE_SOURCES.contact;
      const history = Array.isArray(message.history) ? message.history : [];
      const answered = history.some((b) => b.sender === "admin");

      const bubbles = history
        .map(function (bubble) {
          const fromAdmin = bubble.sender === "admin";
          return (
            '<div class="my-message-bubble ' +
            (fromAdmin ? "is-admin" : "is-user") +
            '">' +
            '  <div class="my-message-bubble__head">' +
            "    <strong>" +
            (fromAdmin ? "پشتیبانی حسابیار" : "شما") +
            "</strong>" +
            "    <span>" +
            escapeProfileHtml(bubble.time) +
            "</span>" +
            "  </div>" +
            "  <p>" +
            escapeProfileHtml(bubble.text) +
            "</p>" +
            "</div>"
          );
        })
        .join("");

      return (
        '<article class="my-message-thread">' +
        '  <header class="my-message-thread__head">' +
        '    <span class="my-message-source"><i class="fas ' +
        meta.icon +
        '"></i> ' +
        meta.label +
        "</span>" +
        '    <span class="my-message-state ' +
        (answered ? "is-answered" : "is-waiting") +
        '">' +
        (answered ? "پاسخ داده شده" : "در انتظار پاسخ") +
        "</span>" +
        "  </header>" +
        '  <div class="my-message-thread__body">' +
        bubbles +
        "</div>" +
        "</article>"
      );
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", renderMyMessages);
