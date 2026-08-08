document.addEventListener("DOMContentLoaded", () => {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  function showMessage(form, message, type) {
    let messageEl = form.querySelector(".auth-form-message");
    if (!messageEl) {
      messageEl = document.createElement("p");
      messageEl.className = "auth-form-message";
      form.prepend(messageEl);
    }
    messageEl.textContent = message;
    messageEl.dataset.type = type || "info";
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = busy;
    });
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.dataset.defaultText ||= submit.textContent.trim();
      submit.textContent = busy
        ? "در حال پردازش..."
        : submit.dataset.defaultText;
    }
  }

  function switchTab(tabId) {
    tabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    tabContents.forEach((content) => {
      content.classList.toggle("active", content.id === tabId);
    });
    const url = new URL(window.location);
    url.searchParams.set("tab", tabId);
    window.history.replaceState({}, "", url);
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".toggle-password").forEach((icon) => {
    icon.addEventListener("click", () => {
      const input = icon.previousElementSibling;
      input.type = input.type === "password" ? "text" : "password";
      icon.classList.toggle("fa-eye");
      icon.classList.toggle("fa-eye-slash");
    });
  });

  const params = new URLSearchParams(window.location.search);
  switchTab(params.get("tab") === "register" ? "register" : "login");

  document
    .querySelector(".forgot-password")
    ?.addEventListener("click", async (event) => {
      event.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      if (!email) {
        showMessage(loginForm, "ابتدا ایمیل خود را وارد کنید.", "error");
        return;
      }
      try {
        await appApi.auth.forgotPassword({ email });
        showMessage(loginForm, "لینک بازیابی رمز عبور ارسال شد.", "success");
      } catch (error) {
        showMessage(loginForm, error.message, "error");
      }
    });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    setBusy(loginForm, true);

    try {
      await appApi.auth.login({ email, password });
      showMessage(loginForm, "ورود با موفقیت انجام شد.", "success");
      setTimeout(() => {
        window.location.href = "/user-profile";
      }, 500);
    } catch (error) {
      showMessage(loginForm, error.message, "error");
      setBusy(loginForm, false);
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("registerPassword").value;
    const confirmation = document.getElementById(
      "registerConfirmPassword",
    ).value;

    if (password !== confirmation) {
      showMessage(registerForm, "رمز عبور و تکرار آن یکسان نیستند.", "error");
      return;
    }

    setBusy(registerForm, true);
    const email = document.getElementById("registerEmail").value.trim();
    try {
      // Phone is collected later, from the profile page - signup stays short.
      await appApi.auth.register({
        name: document.getElementById("registerName").value.trim(),
        email: email,
        password,
      });
      showMessage(
        registerForm,
        "ثبت‌نام انجام شد؛ اکنون وارد حساب شوید.",
        "success",
      );
      registerForm.reset();
      setBusy(registerForm, false);
      switchTab("login");
      document.getElementById("loginEmail").value = email;
    } catch (error) {
      showMessage(registerForm, error.message, "error");
      setBusy(registerForm, false);
    }
  });

  document.querySelectorAll(".social-login button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const provider = button.classList.contains("google") ? "گوگل" : "تلگرام";
      showMessage(
        button.closest("form"),
        `ورود با ${provider} پس از اتصال OAuth فعال می‌شود.`,
        "info",
      );
    });
  });
});
