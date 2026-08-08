/**
 * Admin panel — users, staff and access management
 *
 * Two tabs share this file because they share their data: the users tab
 * lists everyone, the access-management tab lists only staff, and both read
 * appState.users.
 *
 * The merge rule, which matters: an account owns its own identity (name,
 * email, phone) and the panel owns its status and role. appApi.admin.users
 * .list() merges the two stores on email.
 *
 * Staff edits are held in pendingStaffProfileChanges until a manager
 * reviews them, so the displayed value stays old until it is approved.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

function maskPhone(value) {
  const phone = String(value || "").trim();
  if (!phone || phone === "—") return "—";
  const visible = phone.slice(0, 4);
  return toPersianDigits(visible) + "•".repeat(Math.max(phone.length - 4, 3));
}

let profileReviewState = { timer: null, confirm: null, cancel: null };
function openProfileChangePreview(changes, onConfirm, onCancel) {
  const modal = document.getElementById("profileChangeReviewModal"),
    list = document.getElementById("profileReviewChanges"),
    timer = document.getElementById("profileReviewTimer");
  if (!modal || !list) return;
  list.innerHTML = changes.length
    ? changes
        .map(
          (change) =>
            `<article class="profile-review-row"><strong>${change.label}</strong><div class="profile-review-before"><small>قبل از تغییر</small><span>${change.before || "—"}</span></div><i class="fas fa-arrow-left" style="font-size:13px;color:var(--primary);align-self:center;justify-self:center;flex-shrink:0;"></i><div class="profile-review-after"><small>پس از تغییر</small><span>${change.after || "—"}</span></div></article>`,
        )
        .join("")
    : '<p class="profile-review-empty">تغییری در اطلاعات پروفایل ثبت نشده است.</p>';
  profileReviewState.confirm = onConfirm;
  profileReviewState.cancel = onCancel;
  let remaining = 15;
  timer.textContent = toPersianDigits(remaining);
  openModal("profileChangeReviewModal");
  const finish = function (approved) {
    clearInterval(profileReviewState.timer);
    closeModal("profileChangeReviewModal");
    const action = approved
      ? profileReviewState.confirm
      : profileReviewState.cancel;
    profileReviewState.confirm = profileReviewState.cancel = null;
    if (typeof action === "function") action();
  };
  document.getElementById("profileReviewConfirm").onclick = () => finish(true);
  document.getElementById("profileReviewCancel").onclick = () => finish(false);
  profileReviewState.timer = setInterval(() => {
    remaining--;
    timer.textContent = toPersianDigits(remaining);
    if (remaining <= 0) finish(true);
  }, 1000);
}

let safetyWarningState = {
  timer: null,
  countdown: 10,
  actionCallback: null,
};

function triggerSafetyWarning(actionText, callback) {
  if (safetyWarningState.timer) {
    clearInterval(safetyWarningState.timer);
  }

  safetyWarningState.countdown = 10;
  safetyWarningState.actionCallback = callback;

  document.getElementById("warningActionText").textContent = actionText;
  document.getElementById("warningTimerCount").textContent = toPersianDigits(
    safetyWarningState.countdown,
  );

  openModal("safetyWarningModal");

  safetyWarningState.timer = setInterval(() => {
    safetyWarningState.countdown--;
    document.getElementById("warningTimerCount").textContent = toPersianDigits(
      safetyWarningState.countdown,
    );

    if (safetyWarningState.countdown <= 0) {
      clearInterval(safetyWarningState.timer);
      executeWarningAction();
    }
  }, 1000);
}

function executeWarningAction() {
  if (safetyWarningState.timer) {
    clearInterval(safetyWarningState.timer);
  }
  closeModal("safetyWarningModal");
  if (typeof safetyWarningState.actionCallback === "function") {
    safetyWarningState.actionCallback();
  }
}

function cancelWarningAction() {
  if (safetyWarningState.timer) {
    clearInterval(safetyWarningState.timer);
  }
  closeModal("safetyWarningModal");

  // RESTORE ORIGINAL VALUES ON CANCEL:
  if (typeof loadSystemSettings === "function") {
    const sysSettings = loadSystemSettings();
    const nameInput = document.getElementById("setAdminName");
    const avatarInput = document.getElementById("setAdminAvatar");
    if (nameInput) nameInput.value = sysSettings.adminName || "";
    if (avatarInput) avatarInput.value = sysSettings.adminAvatar || "";

    // SECURITY: never render the stored credential back into the DOM.
    // The field is a write-only confirmation input; the real check happens
    // in verifyAdminPassword() (and server-side once the API is live).
    const currentPass = document.getElementById("setAdminCurrentPassword");
    if (currentPass) {
      currentPass.value = "";
      currentPass.placeholder = "رمز فعلی را وارد کنید";
    }

    // Clear and hide new password section
    const newPass = document.getElementById("setAdminPassword");
    const confirmPass = document.getElementById("setAdminPasswordConfirm");
    if (newPass) newPass.value = "";
    if (confirmPass) confirmPass.value = "";

    const newPasswordSection = document.getElementById("newPasswordSection");
    if (newPasswordSection) newPasswordSection.style.display = "none";
  }

  showToast("عملیات با موفقیت لغو شد.", "info");
}

let staffAuditLogs = (function () {
  try {
    const saved = JSON.parse(localStorage.getItem("irHesabdarStaffAuditLogs"));
    if (saved && typeof saved === "object") return saved;
  } catch (e) {}
  return {};
})();
let recentlyUpdatedStaffId = null;
let recentStaffFieldChanges = {}; // cues used only on the main list
let staffModalReviewChanges = {}; // a separate cue, retained for the later edit-modal review
/**
 * Profile edits waiting for a manager to review them.
 *
 * BACKEND NOTE: this belongs on the server. It is a review queue shared by
 * every manager, so keeping it in one browser means a change staged on one
 * machine is invisible on another and disappears if that browser is cleared.
 * Expose it as:
 *     GET    /admin/staff/pending-changes
 *     POST   /admin/staff/:id/pending-changes
 *     DELETE /admin/staff/:id/pending-changes
 * and drop the localStorage lines below.
 */
let pendingStaffProfileChanges = (function () {
  try {
    return (
      JSON.parse(
        localStorage.getItem("irHesabdarStaffPendingProfileChanges"),
      ) || {}
    );
  } catch (e) {
    return {};
  }
})(); // values remain old until a manager reviews them
function savePendingStaffProfileChanges(staffId) {
  localStorage.setItem(
    "irHesabdarStaffPendingProfileChanges",
    JSON.stringify(pendingStaffProfileChanges),
  );
  // Mirror to the server so another manager sees the same review queue.
  if (
    typeof appApi === "undefined" ||
    !appApi.admin ||
    !appApi.admin.pendingChanges
  )
    return;
  if (staffId === undefined) return;
  const staged = pendingStaffProfileChanges[staffId];
  persistAdmin(
    staged
      ? appApi.admin.pendingChanges.stage(staffId, staged)
      : appApi.admin.pendingChanges.clear(staffId),
    "همگام‌سازی تغییرات در انتظار بازبینی",
  );
}
function recordStaffChange(staffId, text, change = null) {
  const now = new Date().toLocaleString("fa-IR");
  const entry = { date: now, text: text, change: change };
  (staffAuditLogs[staffId] ||= []).unshift(entry);
  localStorage.setItem(
    "irHesabdarStaffAuditLogs",
    JSON.stringify(staffAuditLogs),
  );
  // The audit trail is evidence; it has to survive the browser it was made in.
  if (typeof appApi !== "undefined" && appApi.admin && appApi.admin.audit) {
    persistAdmin(appApi.admin.audit.record(staffId, entry), "ثبت سابقه تغییر");
  }
}
function markStaffRecentlyUpdated(staffId, fields) {
  recentlyUpdatedStaffId = staffId;
  if (fields && fields.length) {
    recentStaffFieldChanges[staffId] = fields;
    staffModalReviewChanges[staffId] = fields.slice();
  }
  renderStaffTable();
  setTimeout(() => {
    const staff = appState.users.find((user) => user && user.id === staffId);
    const pending = pendingStaffProfileChanges[staffId];
    if (staff && pending) {
      // Apply the staged values. The audit entry was already written by
      // applyStaffProfileChanges() the moment the edit was made, so logging
      // again here would duplicate every row.
      Object.keys(pending).forEach((field) => {
        staff[field] = pending[field];
      });
      persistAdmin(
        appApi.admin.users.updateStatus(staffId, staff.status),
        "به‌روزرسانی پروفایل",
      );
      delete pendingStaffProfileChanges[staffId];
      savePendingStaffProfileChanges(staffId);
    }
    if (recentlyUpdatedStaffId === staffId) recentlyUpdatedStaffId = null;
    delete recentStaffFieldChanges[staffId];
    refreshStaffModalChangeCues(staffId);
    renderStaffTable();
  }, 8000);
}
function applyStaffProfileChanges(staffId, changes) {
  const staff = appState.users.find(function (user) {
    return user && user.id === staffId;
  });
  if (!staff) return;
  const changed = {};
  Object.keys(changes || {}).forEach(function (field) {
    const value = String(changes[field] || "").trim();
    if (value && String(staff[field] || "") !== value) changed[field] = value;
  });
  const fields = Object.keys(changed);
  if (!fields.length) return;
  // All manager/admin profile changes are staged: old values remain visible during the red review indicator.
  pendingStaffProfileChanges[staffId] = changed;
  savePendingStaffProfileChanges(staffId);
  const profileLabels = {
    name: "نام کاربری",
    email: "ایمیل",
    phone: "تلفن همراه",
  };

  // Write the audit entry now, not when someone eventually opens the staff
  // tab. The trail used to be produced inside markStaffRecentlyUpdated()'s
  // 8-second timer, which only runs for a manager who happens to visit that
  // tab in the same session - so an admin could change their details and
  // leave no record at all.
  fields.forEach(function (field) {
    recordStaffChange(staffId, `${profileLabels[field]} خود را تغییر داد.`, {
      label: profileLabels[field],
      before: staff[field] || "—",
      after: changed[field],
    });
  });
  pushAdminNotification(
    "staff",
    "تغییر پروفایل عضو مدیریت",
    `«${staff.name}» ${fields.map((field) => profileLabels[field]).join("، ")} را به‌روزرسانی کرد.`,
    {
      کاربر: staff.name,
      "شناسه کاربر": "#" + toPersianDigits(staff.id),
      نقش: staff.role === "ادمین" ? "ادمین" : "مدیر",
      "موارد تغییرکرده": fields.map((field) => profileLabels[field]).join("، "),
      "جزئیات تغییرات": fields
        .map(
          (field) =>
            `${profileLabels[field]}: ${staff[field] || "—"} → ${changed[field]}`,
        )
        .join("| "),
      "زمان تغییر": new Date().toLocaleString("fa-IR"),
      "نشانی IP": "در انتظار اتصال به سرور",
    },
  );
}
window.applyStaffProfileChanges = applyStaffProfileChanges;

/**
 * Notifications survive a reload.
 *
 * They used to live only in memory, seeded from a fixed demo list. That made
 * the "tell the managers" rule impossible to honour: an admin edits their
 * profile, the event is recorded, then the manager signs in on their own
 * machine or simply refreshes - and the record is gone. Storing them keeps
 * the audit trail intact.
 *
 * BACKEND NOTE: replace this with GET /admin/notifications. The server must
 * apply the same visibility rule (see canReceiveNotification) rather than
 * trusting the client to hide rows.
 */

function formatJoinDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return toPersianDigits(date.toLocaleDateString("fa-IR"));
}

function renderUsersTable() {
  const tbody = document.querySelector("#usersManageTable tbody");
  if (!tbody) return;
  const searchQuery = document.getElementById("userTableSearch")
    ? document.getElementById("userTableSearch").value.trim().toLowerCase()
    : "";
  const pendingDeletion = window.pendingUserDeletion || null;
  // Searching by phone is a side channel: a restricted operator could type
  // digits and confirm a number from which row survives the filter.
  const canSeePhone = isManager();
  const users = appState.users.filter(function (user) {
    if (!user || user.role !== "کاربر عادی") return false;
    const haystack = canSeePhone
      ? [user.name, user.email, user.phone, user.id]
      : [user.name, user.email, user.id];
    return haystack.join(" ").toLowerCase().includes(searchQuery);
  });
  // "ادمین" gets a read-only view: phone is masked and editing is disabled.
  const manager = isManager();

  tbody.innerHTML =
    users
      .map(function (user) {
        const isPending = pendingDeletion && pendingDeletion.id === user.id;

        // Build the phone cell. For a restricted operator the digits are replaced
        // before they reach the DOM, so devtools cannot reveal them.
        const phoneCell = manager
          ? `<td class="user-contact-cell">${toPersianDigits(user.phone || "—")}</td>`
          : `<td class="user-contact-cell user-cell--restricted" title="نمایش شماره تلفن فقط برای مدیر سایت مجاز است">${maskPhone(user.phone)}</td>`;

        const actionCell = manager
          ? `<td><button class="btn-secondary" style="padding:6px 14px;font-size:12px;cursor:pointer;border-radius:8px;" onclick="editUser('${String(user.id).replace(/'/g, "\\'")}')" ${isPending ? "disabled" : ""}>بررسی و ویرایش</button></td>`
          : `<td><button class="btn-secondary user-action--locked" disabled title="ویرایش کاربران فقط برای مدیر سایت مجاز است"><i class="fas fa-lock" style="margin-left:6px;font-size:11px;"></i>ویرایش</button></td>`;

        return `<tr class="${isPending ? "user-pending-delete" : ""}">
      <td>#${toPersianDigits(user.id)}</td>
      <td style="font-weight:500;">${escapeHtml(user.name || "—")}${isPending ? '<span class="user-pending-delete-note"><i class="fas fa-exclamation-circle"></i> این کاربر حذف شده و تا چند ثانیه دیگر از لیست خارج می‌شود</span>' : ""}</td>
      <td class="user-contact-cell">${user.email || "—"}</td>
      ${phoneCell}
      <td class="user-contact-cell">${formatJoinDate(user.createdAt)}</td>
      <td><span class="status ${user.status === "فعال" ? "success" : "cancelled"}">${user.status}</span></td>
      ${actionCell}
    </tr>`;
      })
      .join("") ||
    '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">کاربر عادی برای نمایش وجود ندارد.</td></tr>';

  renderUsersPermissionNotice(manager);
}

/**
 * Explain the greyed-out controls instead of leaving the operator guessing
 * why the edit button does nothing.
 */
function renderUsersPermissionNotice(manager) {
  const view = document.getElementById("view-users");
  if (!view) return;

  let notice = document.getElementById("usersPermissionNotice");
  if (manager) {
    if (notice) notice.remove();
    return;
  }
  if (notice) return;

  const card = view.querySelector(".glass-card");
  if (!card) return;

  notice = document.createElement("div");
  notice.id = "usersPermissionNotice";
  notice.className = "permission-notice";
  notice.innerHTML =
    '<i class="fas fa-lock"></i>' +
    "<span>شما با نقش «ادمین» وارد شده‌اید. شماره تلفن کاربران و ویرایش حساب‌ها فقط برای «مدیر سایت» در دسترس است.</span>";
  card.parentElement.insertBefore(notice, card);
}
function activatePendingStaffReviews() {
  if (currentNotificationRole() === "ادمین") return;
  Object.keys(pendingStaffProfileChanges).forEach((id) => {
    const fields = Object.keys(pendingStaffProfileChanges[id] || {});
    if (fields.length && !recentStaffFieldChanges[id])
      markStaffRecentlyUpdated(Number(id), fields);
  });
}

function renderStaffTable() {
  const tbody = document.querySelector("#staffManageTable tbody");
  if (!tbody) return;

  const input = document.getElementById("staffTableSearch");
  const query = input ? input.value.trim().toLowerCase() : "";
  const manager = isManager();

  // Only a manager can add staff.
  const addStaffBtn = document.querySelector("#view-staff .btn-primary");
  if (addStaffBtn) addStaffBtn.style.display = manager ? "inline-flex" : "none";

  const staff = appState.users
    .filter(function (user) {
      if (!user || rankOf(user.role) > 2) return false;
      return [user.id, user.name, user.email, user.phone, user.role]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort(function (a, b) {
      return rankOf(a.role) - rankOf(b.role);
    });

  const onlyManagerLeft = managerCount() <= 1;

  tbody.innerHTML =
    staff
      .map(function (user) {
        const isSelf = String(user.id) === String(currentStaffProfileId);
        const verdict = canActOnStaff(user, "edit");
        const changedFields = manager
          ? recentStaffFieldChanges[user.id] || []
          : [];
        const updated = changedFields.length > 0;
        const pendingDelete =
          window.pendingStaffDeletion &&
          window.pendingStaffDeletion.id === user.id;

        const cue = function (field) {
          return changedFields.includes(field) ? "staff-field-changed" : "";
        };

        // Phone follows the same masking rule as the users tab.
        const phone = manager
          ? toPersianDigits(user.phone || "—")
          : maskPhone(user.phone);
        const phoneClass = manager ? "" : " user-cell--restricted";

        const badges =
          '<span class="staff-role-badge ' +
          (isManagerRole(user.role) ? "manager" : "admin") +
          '">' +
          user.role +
          "</span>" +
          (isSelf ? '<span class="staff-self-badge">شما</span>' : "") +
          (isManagerRole(user.role) && onlyManagerLeft
            ? '<span class="staff-locked-badge" title="تنها مدیر سامانه">آخرین مدیر</span>'
            : "");

        const action = verdict.allowed
          ? '<button class="btn-secondary" style="padding:6px 14px;font-size:12px;cursor:pointer;border-radius:8px;" onclick="editStaff(\'' +
            String(user.id).replace(/'/g, "\\'") +
            "')\">بررسی و ویرایش</button>"
          : '<button class="btn-secondary user-action--locked" disabled title="' +
            verdict.reason +
            '"><i class="fas fa-lock" style="margin-left:6px;font-size:11px;"></i>ویرایش</button>';

        return (
          '<tr class="' +
          (pendingDelete ? "user-pending-delete" : "") +
          '">' +
          "<td>#" +
          toPersianDigits(user.id) +
          (updated
            ? '<span class="staff-update-dot staff-update-dot--between" title="تغییر جدید ثبت شده"></span>'
            : "") +
          "</td>" +
          '<td style="font-weight:500;"><span class="staff-field-value ' +
          cue("name") +
          '">' +
          user.name +
          "</span></td>" +
          "<td>" +
          badges +
          "</td>" +
          '<td class="user-contact-cell"><span class="staff-field-value ' +
          cue("email") +
          '">' +
          (user.email || "—") +
          "</span></td>" +
          '<td class="user-contact-cell' +
          phoneClass +
          '"><span class="staff-field-value ' +
          cue("phone") +
          '">' +
          phone +
          "</span></td>" +
          '<td><span class="status ' +
          (user.status === "فعال" ? "success" : "cancelled") +
          '">' +
          user.status +
          "</span></td>" +
          "<td>" +
          action +
          "</td>" +
          "</tr>"
        );
      })
      .join("") ||
    '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">مدیر یا ادمینی برای نمایش وجود ندارد.</td></tr>';

  renderStaffPermissionNotice(manager);
}

/** Tell a restricted operator why the staff controls are inert. */
function renderStaffPermissionNotice(manager) {
  const view = document.getElementById("view-staff");
  if (!view) return;

  let notice = document.getElementById("staffPermissionNotice");
  if (manager) {
    if (notice) notice.remove();
    return;
  }
  if (notice) return;

  const card = view.querySelector(".glass-card");
  if (!card) return;

  notice = document.createElement("div");
  notice.id = "staffPermissionNotice";
  notice.className = "permission-notice";
  notice.innerHTML =
    '<i class="fas fa-lock"></i>' +
    "<span>شما با نقش «ادمین» وارد شده‌اید. مدیریت سطوح دسترسی فقط برای «مدیر سایت» در دسترس است.</span>";
  card.parentElement.insertBefore(notice, card);
}

function refreshStaffModalChangeCues(id) {
  const changed = staffModalReviewChanges[id] || [];
  document.querySelectorAll(".staff-modal-field-dot").forEach(function (dot) {
    dot.hidden = changed.indexOf(dot.getAttribute("data-staff-field")) === -1;
  });
}

/**
 * Fill the role selector in the staff modal.
 *
 * Managers are not listed as an assignable option: promoting someone to
 * manager (or changing an existing one) is a server-side decision, and the
 * first manager is seeded by the backend.
 */
function populateStaffRoleField(staff) {
  const select = document.getElementById("editStaffRole");
  const hint = document.getElementById("editStaffRoleHint");
  if (!select) return;

  const isSelf = String(staff.id) === String(currentStaffProfileId);
  const lastManager = isManagerRole(staff.role) && managerCount() <= 1;

  const options = assignableRoles().slice();
  // Keep the current role visible even when it is not assignable, otherwise
  // the select would silently show the wrong value.
  if (options.indexOf(staff.role) === -1) options.unshift(staff.role);

  select.innerHTML = options
    .map(function (role) {
      const label = role === "کاربر عادی" ? "کاربر عادی (تنزل به کاربر)" : role;
      return '<option value="' + role + '">' + label + "</option>";
    })
    .join("");
  select.value = staff.role;

  // The only frozen case is the last manager: demoting them would leave the
  // panel with nobody who can manage access.
  select.disabled = lastManager;

  if (hint) {
    if (lastManager) {
      hint.textContent =
        "این تنها مدیر سامانه است؛ تا زمانی که مدیر دیگری اضافه نشود، سطح دسترسی او قابل تغییر نیست.";
    } else if (isSelf) {
      hint.textContent =
        "این حساب خود شماست؛ در تغییر سطح دسترسی خود دقت کنید.";
    } else {
      hint.textContent = "";
    }
  }
}

function editStaff(id) {
  const staff = appState.users.find(function (user) {
    return user && String(user.id) === String(id);
  });

  // The button is disabled for anyone who may not act, but this function is
  // global and reachable from the console - re-check here.
  const verdict = canActOnStaff(staff, "edit");
  if (!verdict.allowed) {
    showToast(verdict.reason, "error");
    return;
  }

  document.getElementById("editStaffId").value = id;
  populateStaffRoleField(staff);
  document.getElementById("staffModalDisplayName").textContent =
    staff.name || "—";
  document.getElementById("staffIdDisplay").textContent =
    "#" + toPersianDigits(staff.id);
  document.getElementById("staffNameDisplay").textContent = staff.name || "—";
  document.getElementById("staffEmailDisplay").textContent = staff.email || "—";
  document.getElementById("staffPhoneDisplay").textContent = toPersianDigits(
    staff.phone || "—",
  );
  document.getElementById("editStaffStatus").value = staff.status || "فعال";
  const modalChanges = staffModalReviewChanges[id] || [];
  refreshStaffModalChangeCues(id);
  // The edit-modal notification has its own timer; it starts only after the manager opens this sheet.
  if (modalChanges.length)
    setTimeout(function () {
      delete staffModalReviewChanges[id];
      refreshStaffModalChangeCues(id);
    }, 8000);
  openModal("editStaffModal");
}
function openStaffAuditModal() {
  const id = Number(document.getElementById("editStaffId").value),
    staff = appState.users.find((u) => u.id === id),
    list = document.getElementById("staffAuditList");
  const entries = staffAuditLogs[id] || [];
  list.innerHTML = entries.length
    ? entries
        .map(
          (entry) => `
    <article class="staff-audit-item" style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(148,163,184,0.1);margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <i class="fas fa-pen-to-square" style="font-size:18px;color:var(--primary);"></i>
        <strong style="font-size:14px;color:var(--text-primary);">${staff ? staff.name : "کاربر"}</strong>
        <span style="font-size:11px;color:var(--text-secondary);margin-right:auto;">تغییر پروفایل</span>
      </div>
      <div style="padding:10px 12px;background:rgba(234,179,8,0.04);border-right:3px solid #eab308;border-radius:9px;margin-bottom:10px;">
        <strong style="font-size:12px;color:var(--text-secondary);">موارد تغییر کرده :</strong>
        <span style="font-size:12px;color:var(--text-primary);font-weight:bold;margin-right:6px;">${entry.change ? entry.change.label || entry.text.split(" ")[0] || "—" : entry.text || "—"}</span>
      </div>
      ${
        entry.change
          ? `
      <div style="padding:10px 12px;background:rgba(15,23,42,0.03);border-radius:9px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--text-primary);font-weight:bold;">${entry.change.label || "—"}</span>
        <span style="font-size:10px;color:var(--text-secondary);">قبل از تغییر</span>
        <b style="font-size:13px;color:#ef4444;">${entry.change.before || "—"}</b>
        <i class="fas fa-arrow-left" style="font-size:11px;color:var(--primary);flex-shrink:0;"></i>
        <b style="font-size:13px;color:#16a34a;">${entry.change.after || "—"}</b>
        <span style="font-size:10px;color:var(--text-secondary);">بعد از تغییر</span>
      </div>`
          : `<p style="margin:0 0 10px;font-size:13px;color:var(--text-secondary);line-height:1.8;">${entry.text || "—"}</p>`
      }
      <div style="font-size:11px;color:var(--text-secondary);border-top:1px solid rgba(148,163,184,0.1);padding-top:8px;">
        <strong>زمان تغییر :</strong> ${entry.date || "—"}
      </div>
    </article>
  `,
        )
        .join("")
    : '<p class="staff-audit-empty">تغییری برای این حساب ثبت نشده است.</p>';
  openModal("staffAuditModal");
}

function editUser(id) {
  // The button is disabled for restricted operators, but the function is
  // global and reachable from the console - check here too.
  if (!isManager()) {
    showToast("ویرایش کاربران فقط برای مدیر سایت مجاز است.", "error");
    return;
  }
  const user = appState.users.find(function (u) {
    return String(u.id) === String(id) && u.role === "کاربر عادی";
  });
  if (!user) return;
  document.getElementById("editUserId").value = id;
  document.getElementById("userModalDisplayName").textContent =
    user.name || "—";
  document.getElementById("editUserIdDisplay").textContent =
    "#" + toPersianDigits(user.id);
  document.getElementById("editUserNameDisplay").textContent = user.name || "—";
  document.getElementById("editUserEmailDisplay").textContent =
    user.email || "—";
  document.getElementById("editUserPhoneDisplay").textContent = toPersianDigits(
    user.phone || "—",
  );
  document.getElementById("editUserStatus").value = user.status || "فعال";
  renderUserOrders(user);
  openModal("editUserModal");
}

function renderUserOrders(user) {
  const list = document.getElementById("userOrdersList");
  const count = document.getElementById("userOrdersCount");
  if (!list || !count) return;
  const orders = appState.orders.filter(function (order) {
    return (
      String(order.customer || "").trim() === String(user.name || "").trim() ||
      (order.buyerEmail &&
        String(order.buyerEmail).toLowerCase() ===
          String(user.email).toLowerCase())
    );
  });
  count.textContent = orders.length
    ? toPersianDigits(orders.length) + " سفارش · برای مشاهده کلیک کنید"
    : "سفارشی ثبت نشده است";
  list.innerHTML = orders.length
    ? orders
        .map(function (order) {
          return `<article class="user-order-item"><div class="user-order-item__top"><span>${order.id}</span><span class="status ${order.status}">${getStatusText(order.status)}</span></div><p>${order.product || "محصول"}</p><div class="user-order-item__meta"><span>${toPersianDigits(order.date || "—")}</span><strong>${toPersianDigits(order.amount || "—")}</strong></div></article>`;
        })
        .join("")
    : '<p style="text-align:center;color:var(--text-secondary);font-size:12px;padding:10px 0;margin:0;">هنوز سفارشی برای این کاربر ثبت نشده است.</p>';
}
/* ----------------------------------------------------------------------------
   Product id convention
   ----------------------------------------------------------------------------
   A single article can sell two different things: downloadable files and a
   video. single-post.js looks them up as separate products:

     <contentId>          the file bundle
     <contentId>-video    the video

   So the product id is derived from the content id plus the format. Content
   overrides, however, are always keyed by the bare content id - mixing the two
   up silently writes to the wrong record.
   -------------------------------------------------------------------------- */
