document.addEventListener("DOMContentLoaded", () => {
  // FAQ
  document.querySelectorAll(".faq-item").forEach((item) => {
    item.querySelector(".faq-question")?.addEventListener("click", () => {
      item.classList.toggle("active");
    });
  });

  /**
   * Turn a native <select> into the styled dropdown used across this page.
   *
   * Native <option> elements cannot be themed reliably: the browser draws
   * them with the select's own colours, so the near-white --text-primary on
   * an almost transparent background made the choices unreadable, and in
   * light mode they fell back to the raw OS list. This builds a real
   * element list that follows the site theme in both modes.
   *
   * The builder used to be hardcoded to the "موضوع" field; it takes any
   * select now so the report form's dropdowns get the same treatment.
   */
  function enhanceSelect(selectId, config) {
    const nativeSelect = document.getElementById(selectId);
    if (!nativeSelect || nativeSelect.dataset.enhanced === "true") return;
    nativeSelect.dataset.enhanced = "true";

    const icons = (config && config.icons) || {};
    const labels = (config && config.labels) || {};
    const placeholder = (config && config.placeholder) || "انتخاب کنید";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    const customSelect = document.createElement("div");
    customSelect.className = "custom-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    const optionsList = document.createElement("ul");
    optionsList.className = "custom-select-options";

    const paint = (value) => {
      const iconClass = icons[value] || "fa-tag";
      const text = labels[value] || value;
      trigger.innerHTML =
        '<span style="display:flex;align-items:center;gap:10px">' +
        '<span class="opt-icon"><i class="fa-solid ' +
        iconClass +
        '"></i></span>' +
        '<span class="custom-select-value">' +
        text +
        "</span></span>";
    };

    // Honour a preselected option, otherwise show the placeholder.
    const preselected = nativeSelect.value;
    if (preselected) {
      paint(preselected);
    } else {
      trigger.innerHTML =
        '<span class="custom-select-placeholder">' + placeholder + "</span>";
    }

    Array.from(nativeSelect.options).forEach((opt) => {
      if (!opt.value) return;
      const li = document.createElement("li");
      li.className = "custom-select-option";
      li.dataset.value = opt.value;
      const iconClass = icons[opt.value] || "fa-tag";
      li.innerHTML =
        '<span style="display:flex;align-items:center;gap:10px">' +
        '<span class="opt-icon"><i class="fa-solid ' +
        iconClass +
        '"></i></span>' +
        (labels[opt.value] || opt.textContent) +
        "</span>";
      if (opt.value === preselected) li.classList.add("selected");
      li.addEventListener("click", () => {
        nativeSelect.value = opt.value;
        // Let any listener on the real field know, and keep validation honest.
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        paint(opt.value);
        optionsList
          .querySelectorAll(".custom-select-option")
          .forEach((o) => o.classList.remove("selected"));
        li.classList.add("selected");
        customSelect.classList.remove("open");
      });
      optionsList.appendChild(li);
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      // Only one list open at a time.
      document.querySelectorAll(".custom-select.open").forEach((el) => {
        if (el !== customSelect) el.classList.remove("open");
      });
      customSelect.classList.toggle("open");
    });
    document.addEventListener("click", () =>
      customSelect.classList.remove("open"),
    );

    customSelect.appendChild(trigger);
    customSelect.appendChild(optionsList);
    wrapper.appendChild(customSelect);
    nativeSelect.classList.add("native-select-hidden");
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

    // Reset puts the native field back to empty; the trigger must follow.
    const parentForm = nativeSelect.closest("form");
    if (parentForm) {
      parentForm.addEventListener("reset", () => {
        setTimeout(() => {
          if (nativeSelect.value) {
            paint(nativeSelect.value);
          } else {
            trigger.innerHTML =
              '<span class="custom-select-placeholder">' +
              placeholder +
              "</span>";
            optionsList
              .querySelectorAll(".custom-select-option")
              .forEach((o) => o.classList.remove("selected"));
          }
        }, 0);
      });
    }
  }

  enhanceSelect("subject", {
    placeholder: "موضوع را انتخاب کنید",
    icons: {
      question: "fa-circle-question",
      feedback: "fa-lightbulb",
      cooperation: "fa-handshake",
    },
    labels: {
      question: "سوال آموزشی",
      feedback: "نظر یا پیشنهاد",
      cooperation: "همکاری",
    },
  });

  enhanceSelect("reportKind", {
    placeholder: "نوع تخلف را انتخاب کنید",
    icons: {
      content: "fa-file-circle-exclamation",
      copyright: "fa-copyright",
      abuse: "fa-hand-back-fist",
      fraud: "fa-user-secret",
      other: "fa-ellipsis",
    },
    labels: {
      content: "محتوای نامناسب",
      copyright: "نقض حق نشر",
      abuse: "سوءاستفاده یا توهین",
      fraud: "کلاهبرداری",
      other: "سایر موارد",
    },
  });

  enhanceSelect("reportSeverity", {
    placeholder: "درجه اهمیت را انتخاب کنید",
    icons: {
      low: "fa-circle-info",
      medium: "fa-triangle-exclamation",
      high: "fa-fire",
    },
    labels: { low: "کم", medium: "متوسط", high: "زیاد" },
  });

  // Fill in the name and email for someone who is already signed in. Retyping
  // details the site already knows is busywork, and a typo in the email is
  // what breaks the link between a message and the account that sent it.
  const contactSession = (function () {
    try {
      const raw = localStorage.getItem("hesabyarSession");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.user ? parsed.user : null;
    } catch (error) {
      return null;
    }
  })();

  if (contactSession) {
    const nameField = document.getElementById("name");
    const emailField = document.getElementById("email");
    if (nameField && !nameField.value)
      nameField.value = contactSession.name || "";
    if (emailField && !emailField.value)
      emailField.value = contactSession.email || "";
  }

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    const showMessage = (message, type) => {
      let messageEl = contactForm.querySelector(".form-message");
      if (!messageEl) {
        messageEl = document.createElement("p");
        messageEl.className = "form-message";
        contactForm.prepend(messageEl);
      }
      messageEl.textContent = message;
      messageEl.dataset.type = type || "info";
    };

    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = contactForm.querySelector('[type="submit"]');
      const originalText = submit?.innerHTML;
      if (submit) {
        submit.disabled = true;
        submit.innerHTML = "در حال ارسال...";
      }

      try {
        await appApi.support.sendMessage({
          name: document.getElementById("name").value.trim(),
          email: document.getElementById("email").value.trim(),
          subject: document.getElementById("subject").value,
          message: document.getElementById("message").value.trim(),
          source: "contact",
        });
        contactForm.reset();
        if (nativeSelect) {
          nativeSelect.value = "";
        }
        showMessage("پیام شما با موفقیت ارسال شد.", "success");
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.innerHTML = originalText;
        }
      }
    });
  }
});

/* ============================================================================
   گزارش تخلف
   ----------------------------------------------------------------------------
   A separate channel from the contact form. Reports are moderation cases, so
   they go to their own store and surface in the panel as a "گزارش تخلف"
   notification that only managers can see.
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("reportAbuseForm");
  if (!form) return;

  // Prefill for a signed-in visitor, same as the contact form.
  let session = null;
  try {
    const raw = localStorage.getItem("hesabyarSession");
    const parsed = raw ? JSON.parse(raw) : null;
    session = parsed && parsed.user ? parsed.user : null;
  } catch (error) {
    session = null;
  }
  if (session) {
    const nameField = document.getElementById("reportName");
    const emailField = document.getElementById("reportEmail");
    if (nameField && !nameField.value) nameField.value = session.name || "";
    if (emailField && !emailField.value) emailField.value = session.email || "";
  }

  const showMessage = (message, type) => {
    let el = form.querySelector(".form-message");
    if (!el) {
      el = document.createElement("p");
      el.className = "form-message";
      form.prepend(el);
    }
    el.textContent = message;
    el.dataset.type = type || "info";
  };

  /* -- evidence image -------------------------------------------------------
     A link to evidence is easy to get wrong and can rot before anyone looks
     at it, so the reporter attaches the picture itself. Images only: a
     moderation queue should never invite arbitrary files, and the panel can
     render a picture inline.

     BACKEND NOTE: the image travels as a data URL because there is no upload
     endpoint yet. Swap this for POST /support/reports/evidence returning a
     stored path, and keep the same accept/size checks on the server - a
     client-side check stops honest mistakes, not a determined uploader. */
  const EVIDENCE_MAX_KB = 300;
  const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  const fileInput = document.getElementById("reportEvidenceFile");
  const chooseBtn = document.getElementById("reportEvidenceChoose");
  const clearBtn = document.getElementById("reportEvidenceClear");
  const preview = document.getElementById("reportEvidencePreview");
  const evidenceHint = document.getElementById("reportEvidenceHint");
  const evidenceValue = document.getElementById("reportEvidence");
  const defaultHint =
    "فقط تصویر پذیرفته می‌شود (JPG، PNG، WebP یا GIF) و حداکثر ۳۰۰ کیلوبایت.";

  const setHint = (text, tone) => {
    if (!evidenceHint) return;
    evidenceHint.textContent = text;
    evidenceHint.dataset.tone = tone || "";
  };

  const clearEvidence = () => {
    if (fileInput) fileInput.value = "";
    if (evidenceValue) evidenceValue.value = "";
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
    if (clearBtn) clearBtn.hidden = true;
    setHint(defaultHint, "");
  };

  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener("click", () => fileInput.click());
  }
  if (clearBtn) clearBtn.addEventListener("click", clearEvidence);

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      // Check the real MIME type, not the file name - renaming a .pdf to
      // .jpg would sail past an extension check.
      if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        clearEvidence();
        setHint(
          "فقط فایل تصویری می‌توانید بارگذاری کنید (JPG، PNG، WebP یا GIF).",
          "error",
        );
        return;
      }

      const sizeKb = Math.round(file.size / 1024);
      if (sizeKb > EVIDENCE_MAX_KB) {
        clearEvidence();
        setHint(
          "این تصویر " +
            sizeKb.toLocaleString("fa-IR") +
            " کیلوبایت است؛ " +
            "حداکثر ۳۰۰ کیلوبایت پذیرفته می‌شود. لطفاً تصویر کوچک‌تری انتخاب کنید.",
          "error",
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (evidenceValue) evidenceValue.value = event.target.result;
        if (preview) {
          preview.src = event.target.result;
          preview.hidden = false;
        }
        if (clearBtn) clearBtn.hidden = false;
        setHint(
          "تصویر انتخاب شد (" + sizeKb.toLocaleString("fa-IR") + " کیلوبایت).",
          "ok",
        );
      };
      reader.onerror = () => {
        clearEvidence();
        setHint("خواندن فایل ممکن نشد. دوباره تلاش کنید.", "error");
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const originalText = submit ? submit.innerHTML : "";
    if (submit) {
      submit.disabled = true;
      submit.innerHTML = "در حال ارسال...";
    }

    try {
      const result = await appApi.support.reportAbuse({
        reporterName: document.getElementById("reportName").value.trim(),
        reporterEmail: document.getElementById("reportEmail").value.trim(),
        kind: document.getElementById("reportKind").value,
        severity: document.getElementById("reportSeverity").value,
        subject: document.getElementById("reportSubject").value.trim(),
        evidenceImage: document.getElementById("reportEvidence").value,
        description: document.getElementById("reportDescription").value.trim(),
      });
      form.reset();
      clearEvidence();
      if (session) {
        document.getElementById("reportName").value = session.name || "";
        document.getElementById("reportEmail").value = session.email || "";
      }
      showMessage(
        "گزارش شما با شماره " +
          (result.reportId || "") +
          " ثبت شد و به‌صورت محرمانه بررسی می‌شود.",
        "success",
      );
    } catch (error) {
      // Say what actually failed rather than blaming the connection.
      showMessage(
        error && error.message ? error.message : "ثبت گزارش انجام نشد.",
        "error",
      );
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.innerHTML = originalText;
      }
    }
  });
});
