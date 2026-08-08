/**
 * Admin panel — dialogs and their forms
 *
 * openModal() and closeModal() handle every one of the eighteen dialogs in
 * admin.html, and initModals() wires up the forms inside them.
 *
 * initModals() is long because it is a list, not a algorithm: one block per
 * form, each independent of the others. Reading it top to bottom follows
 * the same order as the dialogs in admin.html.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function openModal(modalId) {
  if (modalId === "addProductModal") {
    populateProductContentDropdown();

    // Reset product access type toggles on modal open
    const premiumRadio = document.getElementById("accessTypePremium");
    if (premiumRadio) premiumRadio.checked = true;

    const priceContainer = document.getElementById("prodPriceContainer");
    if (priceContainer) priceContainer.style.display = "block";

    const priceInput = document.getElementById("newProdPrice");
    if (priceInput) {
      priceInput.required = true;
      priceInput.value = "";
    }
  }
  // Staff creation is manager-only; refuse before the dialog is even shown.
  if (modalId === "addUserModal" && !isManager()) {
    showToast("افزودن مدیر یا ادمین فقط برای مدیر سایت مجاز است.", "error");
    return;
  }

  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn("admin: openModal called with unknown id", modalId);
    return;
  }
  modal.classList.add("active");
  // Fields inside a modal may have been rendered after page load.
  attachPriceFormatting(modal);
  document.body.classList.add("modal-open");
  lockBodyScroll();
  document.getElementById("overlay")?.classList.add("active");
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("active");
  // Modals can stack (staff audit opens over staff edit), so only release the
  // scroll lock once the last one is gone.
  if (!document.querySelector(".modal-overlay.active")) {
    document.body.classList.remove("modal-open");
    unlockBodyScroll();
  }
  document.getElementById("overlay")?.classList.remove("active");
}

function initModals() {
  // Reply Message Form Submission
  const replyMessageForm = document.getElementById("replyMessageForm");
  const messagesFloatingPanelElement = document.getElementById(
    "messagesFloatingPanel",
  );
  if (replyMessageForm) {
    replyMessageForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const msgId = parseInt(document.getElementById("replyMsgId").value);
      const replyText = document.getElementById("replyMsgText").value.trim();

      const msg = appState.messages.find((m) => m.id === msgId);
      if (msg) {
        const sysSettings = loadSystemSettings();
        const adminDisplayName = sysSettings.adminName || "مدیر سایت";

        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        const hour = String(today.getHours()).padStart(2, "0");
        const minute = String(today.getMinutes()).padStart(2, "0");
        const replyTime = `۱۴۰۵/${month}/${day} - ${hour}:${minute}`;

        msg.reply = replyText;
        msg.repliedBy = adminDisplayName;
        msg.replyTime = replyTime;
        msg.unread = false;
        msg.read = true;

        persistAdmin(
          appApi.admin.messages.reply(msg.id, {
            text: replyText,
            adminName: adminDisplayName,
          }),
          "ارسال پاسخ",
        );

        closeModal("readMessageModal");
        if (messagesFloatingPanelElement) {
          messagesFloatingPanelElement.style.display = "none";
        }

        recentlyRepliedMessageId = msgId;
        switchView("messages");
        renderMessages();
        updateMessagesBadgeCount();

        showToast(
          "پاسخ شما با موفقیت ارسال شد و در تاریخچه پیام‌ها قرار گرفت.",
          "success",
        );
      }
    });
  }

  // Safety confirmation buttons
  document
    .getElementById("warningConfirmBtn")
    ?.addEventListener("click", executeWarningAction);
  document
    .getElementById("warningCancelBtn")
    ?.addEventListener("click", cancelWarningAction);

  // Edit User Form Submission (With safety warning!)
  const editUserForm = document.getElementById("editUserForm");
  if (editUserForm) {
    editUserForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const id = parseInt(document.getElementById("editUserId").value);
      const userForEdit = appState.users.find((u) => u.id === id);
      const name = userForEdit ? userForEdit.name : "کاربر";
      const status = document.getElementById("editUserStatus").value;
      triggerSafetyWarning(
        `آیا از ثبت نهایی تغییرات وضعیت کاربر «${name}» اطمینان دارید؟`,
        () => {
          const user = appState.users.find((u) => u.id === id);
          if (user) {
            user.status = status;
            persistAdmin(
              appApi.admin.users.updateStatus(id, status),
              "تغییر وضعیت کاربر",
            );
            renderUsersTable();
            closeModal("editUserModal");
            showToast(`مشخصات کاربر با موفقیت تغییر یافت.`, "success");
          }
        },
      );
    });
  }

  // Delete User button inside Edit Modal (With safety warning!)
  const deleteUserFromEditBtn = document.getElementById(
    "deleteUserFromEditBtn",
  );
  if (deleteUserFromEditBtn) {
    deleteUserFromEditBtn.addEventListener("click", () => {
      const id = parseInt(document.getElementById("editUserId").value);
      const user = appState.users.find((u) => u.id === id);
      if (!user) return;

      triggerSafetyWarning(
        `⚠️ هشدار جدی: آیا از حذف دائمی کاربر «${user.name}» از دیتابیس کل سیستم مطمئن هستید؟`,
        () => {
          window.pendingUserDeletion = { id: id };
          closeModal("editUserModal");
          switchView("users");
          renderUsersTable();
          showToast(
            "کاربر حذف شد؛ ردیف قرمز تا ۱۰ ثانیه دیگر از لیست خارج می‌شود.",
            "error",
          );
          setTimeout(function () {
            appState.users = appState.users.filter(function (u) {
              return u.id !== id;
            });
            persistAdmin(appApi.admin.users.remove(id), "حذف کاربر");
            window.pendingUserDeletion = null;
            renderUsersTable();
            showToast("کاربر از فهرست کاربران حذف شد.", "success");
          }, 10000);
        },
      );
    });
  }

  const editStaffForm = document.getElementById("editStaffForm");
  if (editStaffForm) {
    editStaffForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const id = document.getElementById("editStaffId").value;
      const staff = appState.users.find(function (u) {
        return String(u.id) === String(id);
      });
      if (!staff) return;

      const status = document.getElementById("editStaffStatus").value;
      const roleField = document.getElementById("editStaffRole");
      const nextRole =
        roleField && !roleField.disabled ? roleField.value : staff.role;
      const roleChanged = nextRole !== staff.role;

      const verdict = canActOnStaff(staff, roleChanged ? "demote" : "edit");
      if (!verdict.allowed) {
        showToast(verdict.reason, "error");
        return;
      }

      const summary = roleChanged
        ? `آیا از تغییر سطح دسترسی «${staff.name}» از «${staff.role}» به «${nextRole}» اطمینان دارید؟`
        : `آیا از تغییر وضعیت حساب «${staff.name}» اطمینان دارید؟`;

      triggerSafetyWarning(summary, function () {
        const actor = appState.users.find(
          (u) => String(u.id) === String(currentStaffProfileId),
        ) || {
          name: "مدیر",
          id: "—",
        };

        if (staff.status !== status) {
          recordStaffChange(
            id,
            `مدیر «${actor.name}» با شناسه #${toPersianDigits(actor.id)} وضعیت حساب را تغییر داد.`,
            { label: "وضعیت حساب", before: staff.status, after: status },
          );
          staff.status = status;
          persistAdmin(
            appApi.admin.users.updateStatus(id, status),
            "تغییر وضعیت حساب",
          );
        }

        if (roleChanged) {
          recordStaffChange(
            id,
            `مدیر «${actor.name}» سطح دسترسی را تغییر داد.`,
            { label: "سطح دسترسی", before: staff.role, after: nextRole },
          );
          staff.role = nextRole;
          persistAdmin(
            appApi.admin.users.updateRole(id, nextRole),
            "تغییر سطح دسترسی",
          );
        }

        renderStaffTable();
        renderUsersTable();
        closeModal("editStaffModal");
        showToast(
          roleChanged
            ? "سطح دسترسی به‌روزرسانی شد."
            : "وضعیت حساب به‌روزرسانی شد.",
          "success",
        );
      });
    });
  }
  document
    .getElementById("deleteStaffBtn")
    ?.addEventListener("click", function () {
      const id = document.getElementById("editStaffId").value;
      const staff = appState.users.find(function (u) {
        return String(u.id) === String(id);
      });
      if (!staff) return;

      const verdict = canActOnStaff(staff, "delete");
      if (!verdict.allowed) {
        showToast(verdict.reason, "error");
        return;
      }

      triggerSafetyWarning(
        `⚠️ آیا از حذف حساب «${staff.name}» مطمئن هستید؟`,
        function () {
          const actor = appState.users.find(
            (u) => String(u.id) === String(currentStaffProfileId),
          ) || {
            name: "مدیر",
            id: "—",
          };
          pushAdminNotification(
            "deletion",
            "حذف حساب ادمین",
            `ادمین «${staff.name}» توسط مدیر حذف شد.`,
            {
              "حساب حذف‌شده": staff.name,
              نقش: staff.role,
              حذف‌کننده: actor.name,
              "شناسه حذف‌کننده": "#" + toPersianDigits(actor.id),
              تاریخ: new Date().toLocaleString("fa-IR"),
            },
          );
          window.pendingStaffDeletion = { id: id };
          closeModal("editStaffModal");
          switchView("staff");
          renderStaffTable();
          showToast(
            "حساب برای ۱۰ ثانیه با هشدار قرمز نمایش داده می‌شود.",
            "error",
          );
          setTimeout(function () {
            appState.users = appState.users.filter(
              (u) => String(u.id) !== String(id),
            );
            persistAdmin(appApi.admin.users.remove(id), "حذف حساب");
            window.pendingStaffDeletion = null;
            renderStaffTable();
            showToast("حساب از فهرست حذف شد.", "success");
          }, 10000);
        },
      );
    });

  // Bind radio button listeners for product access type
  const accessTypePremium = document.getElementById("accessTypePremium");
  const accessTypeFree = document.getElementById("accessTypeFree");
  const prodPriceContainer = document.getElementById("prodPriceContainer");
  const newProdPrice = document.getElementById("newProdPrice");

  if (accessTypePremium && accessTypeFree && prodPriceContainer) {
    accessTypePremium.addEventListener("change", () => {
      if (accessTypePremium.checked) {
        prodPriceContainer.style.display = "block";
        if (newProdPrice) newProdPrice.required = true;
      }
    });
    accessTypeFree.addEventListener("change", () => {
      if (accessTypeFree.checked) {
        prodPriceContainer.style.display = "none";
        if (newProdPrice) {
          newProdPrice.required = false;
          newProdPrice.value = "";
        }
      }
    });
  }

  // Add Product Form
  /* --- live guidance on the product URL fields ------------------------- */
  function bindSourceGuidance(config) {
    const urlInput = document.getElementById(config.url);
    if (!urlInput) return;

    const refresh = () => {
      const category = document.getElementById(config.category)?.value;
      const fileSize = document.getElementById(config.size)?.value;
      renderUrlNotice(
        config.notice,
        fileSourceAdvice({ url: urlInput.value, category, fileSize }),
      );
    };

    urlInput.addEventListener("input", refresh);
    urlInput.addEventListener("blur", () => {
      // Rewrite share links once the operator leaves the field, so they can
      // see what was changed rather than having it happen mid-typing.
      const fixed = normalizeDownloadUrl(urlInput.value);
      if (fixed !== urlInput.value) urlInput.value = fixed;
      refresh();
    });
    document
      .getElementById(config.category)
      ?.addEventListener("change", refresh);
    document.getElementById(config.size)?.addEventListener("input", refresh);

    if (config.sourceName) {
      document
        .querySelectorAll(`input[name="${config.sourceName}"]`)
        .forEach((radio) => {
          radio.addEventListener("change", () => {
            const label = document.getElementById(config.label);
            const hint = document.getElementById(config.hint);
            if (radio.value === "stream" && radio.checked) {
              if (label)
                label.textContent = "لینک صفحه ویدیو در آپارات یا یوتیوب";
              if (hint)
                hint.textContent =
                  "نشانی صفحه ویدیو را کپی کنید؛ لازم نیست لینک مستقیم فایل باشد.";
              urlInput.placeholder = "https://www.aparat.com/v/xxxxx";
            } else if (radio.checked) {
              if (label)
                label.textContent =
                  "لینک دانلود فایل اصلی محصول (پس از خرید موفق)";
              if (hint) {
                hint.innerHTML =
                  "فایل را در پوشه <code>files</code> هاست آپلود کنید و آدرس آن را اینجا بنویسید، " +
                  'مثلاً <code dir="ltr">../files/course-101.pdf</code>';
              }
              urlInput.placeholder = "../files/course-101.pdf";
            }
            refresh();
          });
        });
    }
  }

  /* --- "check link" buttons -------------------------------------------- */
  function bindUrlCheck(buttonId, urlId, noticeId) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(urlId);
    if (!button || !input) return;

    button.addEventListener("click", async () => {
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> بررسی...';

      const result = await checkFileUrl(input.value);

      button.disabled = false;
      button.innerHTML = original;

      renderUrlNotice(noticeId, {
        tone: result.ok === true ? "ok" : result.ok === false ? "warn" : "info",
        text: result.reason,
      });
    });
  }

  bindUrlCheck("newProdUrlCheck", "newProdFileUrl", "newProdUrlNotice");
  bindUrlCheck("editProdUrlCheck", "editProdFileUrl", "editProdUrlNotice");

  bindSourceGuidance({
    url: "newProdFileUrl",
    category: "newProdCat",
    size: "newProdSize",
    notice: "newProdUrlNotice",
    label: "newProdFileUrlLabel",
    hint: "newProdUrlHint",
    sourceName: "newProdSource",
  });
  bindSourceGuidance({
    url: "editProdFileUrl",
    category: "editProdCat",
    size: "editProdSize",
    notice: "editProdUrlNotice",
  });

  /* --- product image picker -------------------------------------------- */
  const prodImgChoose = document.getElementById("editProdImgChoose");
  const prodImgFile = document.getElementById("editProdImgFile");
  const prodImgReset = document.getElementById("editProdImgReset");

  prodImgChoose?.addEventListener("click", () => prodImgFile?.click());

  prodImgFile?.addEventListener("change", () => {
    const file = prodImgFile.files && prodImgFile.files[0];
    if (!file) return;

    const hint = document.getElementById("editProdImgHint");
    const sizeKb = Math.round(file.size / 1024);

    // Until there is a server to resize images, the picture is stored inline
    // as a data URL. That is fine for a small thumbnail and impossible for a
    // large photo, so refuse early with a clear reason.
    if (file.size > 300 * 1024) {
      if (hint) {
        hint.textContent =
          `این تصویر ${toPersianDigits(sizeKb)} کیلوبایت است و تا اتصال سرور، حداکثر ۳۰۰ کیلوبایت پذیرفته می‌شود. ` +
          "تصویر را کوچک‌تر کنید یا آدرس آن را در فیلد لینک وارد کنید.";
        hint.classList.add("field-hint--warn");
      }
      prodImgFile.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById("editProdImg").value = event.target.result;
      document.getElementById("editProdImgPreview").src = event.target.result;
      if (hint) {
        hint.textContent = `تصویر انتخاب شد (${toPersianDigits(sizeKb)} کیلوبایت).`;
        hint.classList.remove("field-hint--warn");
      }
    };
    reader.readAsDataURL(file);
  });

  prodImgReset?.addEventListener("click", () => {
    document.getElementById("editProdImg").value = "";
    document.getElementById("editProdImgPreview").src = "../images/ravin.png";
    const hint = document.getElementById("editProdImgHint");
    if (hint) {
      hint.textContent = "تصویر پیش‌فرض استفاده می‌شود.";
      hint.classList.remove("field-hint--warn");
    }
  });

  const editProductForm = document.getElementById("editProductForm");
  if (editProductForm) {
    editProductForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const oldId = document.getElementById("editProdId").value;
      const prod = appState.products.find(
        (p) => String(p.id) === String(oldId),
      );
      if (!prod) {
        showToast("محصول پیدا نشد.", "error");
        return;
      }

      const name = document.getElementById("editProdName").value.trim();
      const category = document.getElementById("editProdCat").value;
      // parseFloat would stop at the first separator, so read the digits.
      const price = readPriceInput(document.getElementById("editProdPrice"));
      const fileSize = document.getElementById("editProdSize").value.trim();
      const fileUrl = normalizeDownloadUrl(
        document.getElementById("editProdFileUrl").value.trim(),
      );
      const image = document.getElementById("editProdImg")?.value || "";

      if (!name) {
        showToast("نام محصول را وارد کنید.", "error");
        return;
      }
      if (isNaN(price) || price < 0) {
        showToast("قیمت نامعتبر است.", "error");
        return;
      }
      if (!isPlausibleFileUrl(fileUrl)) {
        const urlHint = document.getElementById("editProdUrlHint");
        if (urlHint)
          urlHint.textContent = "آدرس باید با http(s):// یا / یا ../ شروع شود.";
        showToast("آدرس فایل معتبر نیست.", "error");
        return;
      }

      // Switching between video and file moves the product to a different id.
      const ownerId = contentIdOf(oldId);
      const newId = productIdFor(ownerId, category);
      const idChanged = String(newId) !== String(oldId);

      if (
        idChanged &&
        appState.products.some((p) => String(p.id) === String(newId))
      ) {
        showToast(
          "محصولی با این نوع برای همین مطلب از قبل وجود دارد.",
          "error",
        );
        return;
      }

      const updated = {
        ...prod,
        id: newId,
        contentId: ownerId,
        name: name,
        category: category,
        price: price,
        fileSize: fileSize,
        fileUrl: fileUrl,
        img: image || prod.img || "../images/ravin.png",
      };

      const index = appState.products.findIndex(
        (p) => String(p.id) === String(oldId),
      );
      appState.products[index] = updated;

      if (idChanged) {
        // The API has no rename, so remove the old record and create the new
        // one. Order matters: create first would collide on a duplicate id.
        persistAdmin(appApi.admin.products.remove(oldId), "حذف محصول قدیمی");
        persistAdmin(appApi.admin.products.create(updated), "ثبت محصول");
      } else {
        persistAdmin(
          appApi.admin.products.update(newId, updated),
          "به‌روزرسانی محصول",
        );
      }

      renderProductsTable();
      renderDashboardProducts();
      closeModal("editProductModal");
      showToast("محصول با موفقیت به‌روزرسانی شد.", "success");
    });
  }

  document
    .getElementById("orderStatusFilter")
    ?.addEventListener("change", renderOrdersTable);

  const addProductForm = document.getElementById("addProductForm");
  if (addProductForm) {
    addProductForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const contentId = document.getElementById("newProdContentId").value;
      const name = document.getElementById("newProdName").value.trim();
      const category = document.getElementById("newProdCat").value;
      const isFree = document.getElementById("accessTypeFree")
        ? document.getElementById("accessTypeFree").checked
        : false;
      const price = isFree
        ? 0
        : readPriceInput(document.getElementById("newProdPrice"));
      const fileSize = document.getElementById("newProdSize").value.trim();
      const fileUrl = document.getElementById("newProdFileUrl").value.trim();

      // Videos and files are separate products for the same article, so the id
      // carries the format. Without this, adding a PDF would overwrite the
      // article's video and single-post.js would never find either one.
      if (!isPlausibleFileUrl(fileUrl)) {
        showToast(
          "آدرس فایل باید با http(s):// یا / یا ../ شروع شود.",
          "error",
        );
        return;
      }

      const productId = productIdFor(contentId, category);

      const existingIdx = appState.products.findIndex(
        (p) => String(p.id) === String(productId),
      );
      const newProduct = {
        id: productId,
        contentId: contentId,
        name: name,
        category: category,
        price: price,
        fileUrl: fileUrl,
        fileSize: fileSize,
        img: "../images/ravin.png",
      };

      if (existingIdx > -1) {
        appState.products[existingIdx] = newProduct;
        persistAdmin(
          appApi.admin.products.update(productId, newProduct),
          "به‌روزرسانی محصول",
        );
      } else {
        appState.products.unshift(newProduct);
        persistAdmin(appApi.admin.products.create(newProduct), "ثبت محصول");
      }

      // AUTOMATIC TWO-WAY SYNC TO SITE CONTENT:
      if (typeof saveContentOverride === "function") {
        const overrides = loadContentOverrides();
        const current = overrides[contentId] || {};
        const content = current.content || {
          blocks: [],
          downloads: [],
          video: null,
        };

        if (category === "mp4") {
          // Sync to Video field of that content item!
          content.video = {
            enabled: true,
            url: fileUrl,
            // Aparat and YouTube links need their own player; saving them as
            // "file" produced an empty <video> tag.
            provider: videoProviderFor(fileUrl),
            title: name,
          };
        } else {
          // Sync to Downloads field of that content item!
          if (!Array.isArray(content.downloads)) content.downloads = [];
          const fileId = "prod-file-" + contentId;
          const fileObj = {
            id: fileId,
            title: name,
            url: fileUrl,
            type: category,
            size: fileSize,
          };

          const existingFileIndex = content.downloads.findIndex(
            (f) => f.id === fileId,
          );
          if (existingFileIndex > -1) {
            content.downloads[existingFileIndex] = fileObj;
          } else {
            content.downloads.push(fileObj);
          }
        }

        saveContentOverride(contentId, {
          content: content,
          excerpt: current.excerpt || "",
        });

        if (
          typeof applyContentOverrides === "function" &&
          typeof siteData !== "undefined"
        ) {
          applyContentOverrides(siteData);
        }
      }

      renderProductsTable();
      renderDashboardProducts();
      closeModal("addProductModal");
      addProductForm.reset();
      showToast("محصول با موفقیت ذخیره و به محتوای سایت متصل شد", "success");
    });
  }

  // Add User Form
  const addUserForm = document.getElementById("addUserForm");
  if (addUserForm) {
    addUserForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Adding staff is a manager-only action. The button is hidden for an
      // ادمین, but the form is in the DOM and could be submitted from the
      // console.
      if (!isManager()) {
        showToast("افزودن مدیر یا ادمین فقط برای مدیر سایت مجاز است.", "error");
        return;
      }

      const name = document.getElementById("newUserName").value.trim();
      const email = document.getElementById("newUserEmail").value.trim();
      const phone = document.getElementById("newUserPhone").value.trim();
      const role = document.getElementById("newUserRole").value;

      if (!name || !email || !phone) {
        alert("لطفاً تمامی فیلدهای فرم را به درستی پر کنید.");
        return;
      }

      // This tab creates staff only. Regular users arrive by signing up on the
      // site, so an unexpected role here means the form was tampered with.
      if (assignableRoles().indexOf(role) === -1) {
        showToast("از این بخش فقط می‌توان مدیر یا ادمین اضافه کرد.", "error");
        return;
      }

      const newUser = {
        id:
          appState.users.reduce(
            (max, user) => Math.max(max, Number(user.id) || 0),
            0,
          ) + 1,
        name: name,
        email: email,
        phone: phone,
        contact: `${email} / ${phone}`,
        role: role,
        status: "فعال",
      };

      appState.users.push(newUser);
      persistAdmin(appApi.admin.users.create(newUser), "ثبت کاربر");

      renderUsersTable();
      renderStaffTable();
      closeModal("addUserModal");
      addUserForm.reset();
      showToast("مدیر یا ادمین جدید با موفقیت ثبت شد", "success");
    });
  }

  // Edit Profile Form (Manager / Super Admin)
  const editProfileForm = document.getElementById("editProfileForm");
  if (editProfileForm) {
    editProfileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const newName = document.getElementById("editNameInput").value;
      const newRole = document.getElementById("editRoleInput").value;
      const newAvatar = document.getElementById("editAvatarInput").value;

      document.getElementById("sidebarUserName").textContent = newName;
      document.getElementById("sidebarUserRole").textContent = newRole;
      if (newAvatar) {
        document.getElementById("sidebarAvatar").src = newAvatar;
      }
      applyStaffProfileChanges(currentStaffProfileId, { name: newName });

      closeModal("editProfileModal");
      showToast("پروفایل مدیر کل با موفقیت به‌روزرسانی شد", "success");
    });
  }
}
