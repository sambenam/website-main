/**
 * Gateway Desktop Script
 * Handles card formatting, captcha regeneration, timer countdown, and OTP requests.
 */

/**
 * Show what is actually being charged.
 *
 * The amount was hardcoded as ۳۳,۰۰۰,۰۰۰ in the markup, so every customer
 * saw the same fictional figure on the payment page while a different sum
 * was charged. On a payment screen that is the one number that has to be
 * right.
 */
function renderGatewayAmount() {
  const target = document.getElementById("gatewayAmount");
  if (!target) return;

  let checkout = {};
  try {
    checkout = JSON.parse(sessionStorage.getItem("hesabyarCheckout") || "{}");
  } catch (error) {
    checkout = {};
  }

  const amount = Number(checkout.finalAmount);
  if (!isFinite(amount) || amount <= 0) {
    // Reaching the gateway with no basket means the flow was skipped.
    target.innerHTML = "— <span>تومان</span>";
    const submit = document.querySelector(
      '#desktopPaymentForm [type="submit"]',
    );
    if (submit) submit.disabled = true;
    showGatewayMessage(
      "سفارشی برای پرداخت پیدا نشد. لطفاً از سبد خرید دوباره اقدام کنید.",
      "error",
    );
    return;
  }
  target.innerHTML = amount.toLocaleString("fa-IR") + " <span>تومان</span>";
}

document.addEventListener("DOMContentLoaded", () => {
  renderGatewayAmount();
  initCardFormatting();
  initCountdownTimer();
  initCaptcha();
  initPaymentForm();
});

function toEnglishDigits(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
}

// 1. Auto format card number with dashes every 4 digits
function initCardFormatting() {
  const cardInput = document.getElementById("cardNumber");
  if (!cardInput) return;

  cardInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    let formattedValue = "";

    for (let i = 0; i < value.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formattedValue += "-";
      }
      formattedValue += value[i];
    }

    e.target.value = formattedValue.substring(0, 23);
  });
}

// 2. Refresh Captcha Code
function refreshCaptcha() {
  const captchaSpan = document.getElementById("captchaCode");
  if (!captchaSpan) return;

  const randomCode = Math.floor(10000 + Math.random() * 90000);
  captchaSpan.dataset.value = String(randomCode);
  captchaSpan.textContent = randomCode.toLocaleString("fa-IR");
}

function initCaptcha() {
  refreshCaptcha();
}

// 3. Request OTP / Dynamic Password
function requestOtp() {
  const btn = document.querySelector(".btn-otp-request");
  if (!btn) return;

  let countdown = 60;
  btn.disabled = true;
  btn.style.opacity = "0.6";

  alert("رمز دوم پویا با موفقیت به شماره همراه شما ارسال شد.");

  const timer = setInterval(() => {
    btn.innerHTML = `<i class="fas fa-clock"></i> ارسال مجدد (${countdown}s)`;
    countdown--;

    if (countdown < 0) {
      clearInterval(timer);
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> دریافت رمز پویا';
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  }, 1000);
}

function initPaymentForm() {
  const form = document.getElementById("desktopPaymentForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cardNumber = document
      .getElementById("cardNumber")
      .value.replace(/\D/g, "");
    const cvv = document.getElementById("cvv2").value.replace(/\D/g, "");
    const month = Number(
      toEnglishDigits(document.getElementById("expMonth").value),
    );
    const captchaInput = toEnglishDigits(
      document.getElementById("captchaInput").value,
    );
    const captchaCode = document.getElementById("captchaCode").dataset.value;
    const submit = form.querySelector('[type="submit"]');

    if (cardNumber.length !== 16) {
      showGatewayMessage("شماره کارت باید ۱۶ رقمی باشد.", "error");
      return;
    }
    if (cvv.length < 3 || cvv.length > 4 || month < 1 || month > 12) {
      showGatewayMessage("اطلاعات کارت را به‌درستی وارد کنید.", "error");
      return;
    }
    if (captchaInput !== captchaCode) {
      showGatewayMessage("کد امنیتی صحیح نیست.", "error");
      refreshCaptcha();
      return;
    }

    let checkout = {};
    try {
      checkout = JSON.parse(sessionStorage.getItem("hesabyarCheckout") || "{}");
    } catch (error) {
      checkout = {};
    }

    if (!checkout.finalAmount) {
      showGatewayMessage(
        "اطلاعات سفارش پیدا نشد؛ دوباره از صفحه خرید شروع کنید.",
        "error",
      );
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "در حال پردازش...";
    }

    // A test switch on the page lets an operator produce a failed payment so
    // the admin panel can be checked without a real gateway.
    const forceFail = document.getElementById("gatewayForceFail")?.checked;

    try {
      const result = await appApi.commerce.createPayment({
        amount: checkout.finalAmount,
        buyer: checkout.buyer || {},
        items: checkout.items || [],
        forceStatus: forceFail ? "failed" : undefined,
      });
      window.location.href = `receipt.html?status=${result.status}&orderId=${encodeURIComponent(result.orderId)}`;
    } catch (error) {
      // A declined payment is still an order: the API recorded it and returns
      // the id, so send the customer to a receipt that explains what happened
      // rather than leaving them on the gateway.
      const orderId = error.details && error.details.orderId;
      if (orderId) {
        window.location.href = `receipt.html?status=failed&orderId=${encodeURIComponent(orderId)}`;
        return;
      }
      showGatewayMessage(error.message, "error");
      if (submit) {
        submit.disabled = false;
        submit.textContent = "پرداخت نهایی";
      }
    }
  });
}

function showGatewayMessage(message, type) {
  const form = document.getElementById("desktopPaymentForm");
  if (!form) return;
  let messageEl = form.querySelector(".gateway-message");
  if (!messageEl) {
    messageEl = document.createElement("p");
    messageEl.className = "gateway-message";
    form.prepend(messageEl);
  }
  messageEl.textContent = message;
  messageEl.dataset.type = type || "info";
}

// 4. Topbar Countdown Timer (9:50 counting down)
function initCountdownTimer() {
  const timerElem = document.getElementById("countdownTimer");
  if (!timerElem) return;

  let totalSeconds = 9 * 60 + 50; // 9 minutes 50 seconds

  const interval = setInterval(() => {
    if (totalSeconds <= 0) {
      clearInterval(interval);
      alert("زمان تراکنش به پایان رسید. لطفاً مجدداً تلاش کنید.");
      window.location.href = "checkout.html";
      return;
    }

    totalSeconds--;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    timerElem.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, 1000);
}
