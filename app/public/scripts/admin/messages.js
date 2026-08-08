/**
 * Admin panel — the message inbox
 *
 * One inbox fed by three sources: the contact form, the assistant widget
 * and violation reports. The header dropdown and the messages tab are two
 * views of the same list, so they can never disagree about what is unread.
 *
 * Ordering is by arrival time with a sequence number as tiebreaker. Two
 * messages sent inside the same millisecond share a timestamp, and array
 * position cannot break the tie: the admin store unshifts while the site
 * store pushes, so an index means the opposite thing in each half.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

let recentlyRepliedMessageId = null;

function isUnanswered(msg) {
  if (!msg) return false;

  // Defensive check for legacy/corrupted data
  if (!Array.isArray(msg.history) || msg.history.length === 0) {
    return !msg.reply; // If no reply string, then it is unanswered!
  }

  const lastBubble = msg.history[msg.history.length - 1];
  return lastBubble && lastBubble.sender === "user";
}

/**
 * Has this message been read?
 *
 * The panel says "unread", the stored record says "read". A message written
 * by the public contact form arrived with `read: false` and no `unread` at
 * all, so `msg.unread` was undefined and every real message counted as
 * already seen - no badge, no highlight. Both spellings are accepted here.
 */
function isUnreadMessage(msg) {
  if (!msg) return false;
  if (typeof msg.unread === "boolean") return msg.unread;
  return msg.read !== true;
}

/**
 * Order messages newest-first, so the message that just arrived is the one
 * at the top.
 *
 * This used to sort unread and unanswered threads above everything else and
 * only then fall back to `b.id - a.id`. Two problems with that: ids are
 * random UUID strings, so subtracting them gives NaN and the order never
 * changed; and once a message was read it dropped below older unread ones,
 * so the newest arrival was not reliably first.
 *
 * `createdAt` is the real send time. Anything without one (older stored
 * rows) sorts to the bottom rather than jumping to the top.
 *
 * Used by both the tab and the header dropdown so the two always agree.
 */
function messageArrivalTime(message) {
  const stamp = Date.parse((message && message.createdAt) || "");
  if (!isNaN(stamp)) return stamp;
  // Numeric ids from the older seed data still carry rough ordering.
  const numeric = Number(message && message.id);
  return isNaN(numeric) ? 0 : numeric;
}

function sortMessagesByArrival(messages) {
  return (messages || []).slice().sort((a, b) => {
    const byTime = messageArrivalTime(b) - messageArrivalTime(a);
    if (byTime !== 0) return byTime;
    // Same millisecond: the sequence number the API stamps decides.
    return (Number(b.sequence) || 0) - (Number(a.sequence) || 0);
  });
}

/** Where a message came from, as a small label. */
const MESSAGE_SOURCES = {
  ai: { label: "پشتیبان هوشمند", icon: "fa-robot", tone: "ai" },
  contact: { label: "فرم تماس با ما", icon: "fa-envelope", tone: "contact" },
  site: { label: "فرم تماس با ما", icon: "fa-envelope", tone: "contact" },
};

function messageSourceBadge(msg) {
  const meta = MESSAGE_SOURCES[msg && msg.source] || MESSAGE_SOURCES.contact;
  return (
    '<span class="msg-source msg-source--' +
    meta.tone +
    '">' +
    '<i class="fas ' +
    meta.icon +
    '"></i> ' +
    meta.label +
    "</span>"
  );
}

function updateMessagesBadgeCount() {
  const sidebarBadge = document.getElementById("messages-badge");
  const headerBadge = document.getElementById("messages-header-badge");

  const unreadCount = appState.messages.filter(isUnreadMessage).length;

  if (unreadCount > 0) {
    const farsiCount = toPersianDigits(unreadCount);
    if (sidebarBadge) {
      sidebarBadge.textContent = farsiCount;
      sidebarBadge.style.display = "inline-flex";
    }
    if (headerBadge) {
      headerBadge.style.display = "block";
    }
  } else {
    if (sidebarBadge) sidebarBadge.style.display = "none";
    if (headerBadge) headerBadge.style.display = "none";
  }
}

function renderFloatingMessages() {
  const container = document.getElementById("floatingMessagesContainer");
  if (!container) return;

  // Newest arrival at the top, matching the messages tab.
  const sortedMsgs = sortMessagesByArrival(appState.messages);

  if (sortedMsgs.length === 0) {
    container.innerHTML =
      '<p style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 10px;">صندوق پیام‌ها خالی است.</p>';
    return;
  }

  container.innerHTML = sortedMsgs
    .map((msg) => {
      // Unread indicator is pulsing heartbeat, read is static gray
      const indicator = isUnreadMessage(msg)
        ? '<span class="pulse-indicator" style="margin-left: 6px;"></span>'
        : '<span class="seen-indicator" style="margin-left: 6px;"></span>';

      // Check if unanswered
      const unansweredBadge = isUnanswered(msg)
        ? '<span style="font-size: 10px; background: rgba(255, 149, 0, 0.1); color: #ff9500; border-radius: 4px; padding: 1px 4px; font-weight: bold; margin-left: 6px;">⚠️ پاسخ داده نشده</span>'
        : "";

      return `
      <div onclick="openReadMessageModal(${msg.id})" style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; cursor: pointer; transition: background 0.3s; display: flex; flex-direction: column; gap: 4px;" class="floating-msg-item">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 13px; color: var(--text-primary); display: flex; align-items: center; gap: 4px;">${indicator} ${escapeHtml(msg.sender || "—")}</strong>
          <span style="font-size: 10px; color: var(--text-secondary);">${toPersianDigits(msg.time)}</span>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin: 0; max-width: 280px;">${unansweredBadge}${escapeHtml(msg.text || "")}</p>
      </div>
    `;
    })
    .join("");
}

function openReadMessageModal(msgId) {
  const msg = appState.messages.find((m) => m.id === msgId);
  if (!msg) return;

  // Mark as read (sets unread to false and saves)
  if (isUnreadMessage(msg)) {
    msg.unread = false;
    msg.read = true;
    persistAdmin(
      appApi.admin.messages.markRead(msgId),
      "علامت‌گذاری خوانده‌شده",
    );
    updateMessagesBadgeCount();
    renderFloatingMessages();
    renderMessages();
  }

  // Populate modal
  document.getElementById("replyMsgId").value = msgId;
  document.getElementById("readMsgSender").textContent = msg.sender || "ناشناس";
  document.getElementById("readMsgEmail").textContent = msg.email || "---";
  document.getElementById("readMsgDate").textContent = toPersianDigits(
    msg.time || "---",
  );
  document.getElementById("readMsgBody").textContent = msg.text || "---";
  document.getElementById("replyMsgText").value = "";

  openModal("readMessageModal");
}

function sendInlineReply(msgId) {
  const textarea = document.getElementById("inline-reply-text-" + msgId);
  if (!textarea) return;

  const replyText = textarea.value.trim();
  if (!replyText) {
    alert("لطفاً متن پاسخ را وارد کنید.");
    return;
  }

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

    // Push new reply into thread history!
    if (!Array.isArray(msg.history)) msg.history = [];
    msg.history.push({
      sender: "admin",
      name: adminDisplayName,
      text: replyText,
      time: replyTime,
    });

    msg.unread = false; // Mark as read
    msg.read = true;

    persistAdmin(
      appApi.admin.messages.reply(msgId, {
        text: replyText,
        adminName: adminDisplayName,
      }),
      "ارسال پاسخ",
    );

    recentlyRepliedMessageId = msgId;
    renderMessages();
    updateMessagesBadgeCount();
    showToast("پاسخ شما با موفقیت ارسال شد.", "success");
  }
}

function renderMessages() {
  const container = document.getElementById("messagesListContainer");
  if (!container) return;

  // Newest arrival at the top, matching the header dropdown.
  const sortedMsgs = sortMessagesByArrival(appState.messages);

  const unreadMsgs = sortedMsgs.filter(isUnreadMessage);
  const unansweredMsgs = sortedMsgs.filter((m) => isUnanswered(m));
  const summaryHeader = `
    <div style="display:flex;gap:12px;margin-bottom:18px;padding:12px 16px;background:rgba(0,122,255,0.06);border:1px solid rgba(0,122,255,0.15);border-radius:12px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-primary);font-weight:700;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-envelope-open-text" style="color:var(--primary);"></i>
        صندوق پیام‌ها
        ${unreadMsgs.length ? `<span style="background:rgba(255,59,48,0.1);color:#ef4444;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;">${toPersianDigits(unreadMsgs.length)} خوانده‌نشده</span>` : ""}
        ${unansweredMsgs.length ? `<span style="background:rgba(255,149,0,0.1);color:#ff9500;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;">${toPersianDigits(unansweredMsgs.length)} بدون پاسخ</span>` : ""}
      </span>
    </div>
  `;

  if (sortedMsgs.length === 0) {
    container.innerHTML =
      summaryHeader +
      '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">هیچ پیامی در صندوق دریافت نشده است.</p>';
    return;
  }

  container.innerHTML =
    summaryHeader +
    sortedMsgs
      .map((msg) => {
        const isUnread = isUnreadMessage(msg);
        const unreadClass = isUnread ? "unread" : "";

        // Background of unread has soft blue, read is translucent white
        const boxBg = isUnread
          ? "rgba(0, 122, 255, 0.04)"
          : "rgba(255, 255, 255, 0.3)";
        const boxBorder = isUnread
          ? "rgba(0, 122, 255, 0.25)"
          : "rgba(255, 255, 255, 0.5)";
        const unreadStyle = `background: ${boxBg} !important; border: 1px solid ${boxBorder} !important; border-left: 3px solid #007aff !important; box-shadow: 0 4px 20px rgba(0,122,255,0.12) !important;`;

        // Indicator dot ( pulsing red vs static gray )
        const indicator = isUnread
          ? '<span class="pulse-indicator" style="margin-left: 8px;"></span>'
          : '<span class="seen-indicator" style="margin-left: 8px;"></span>';

        // Unanswered banner warning badge
        const unansweredBadge = isUnanswered(msg)
          ? '<span style="font-size: 11px; background: rgba(255, 149, 0, 0.08); color: #ff9500; border: 1px solid rgba(255, 149, 0, 0.15); border-radius: 6px; padding: 4px 8px; font-weight: bold; margin-right: 10px;"><i class="fas fa-reply-all"></i> پاسخ داده نشده</span>'
          : '<span style="font-size: 11px; background: rgba(52, 199, 89, 0.08); color: #34c759; border: 1px solid rgba(52, 199, 89, 0.15); border-radius: 6px; padding: 4px 8px; font-weight: bold; margin-right: 10px;"><i class="fas fa-check-circle"></i> پاسخ داده شده</span>';

        // Render full threaded conversation bubbles!
        const history = msg.history || [];
        const bubblesHtml = history
          .map((bubble) => {
            const isAdmin = bubble.sender === "admin";
            const align = isAdmin ? "left" : "right";
            const bubbleBg = isAdmin
              ? "rgba(52, 199, 89, 0.06)"
              : "rgba(255, 255, 255, 0.03)";
            const borderStyle = isAdmin
              ? "border-right: 3px solid #34c759; margin-right: 40px; margin-left: 0;"
              : "border-right: 3px solid #007aff; margin-left: 40px; margin-right: 0;";
            const labelColor = isAdmin ? "#34c759" : "var(--primary)";

            return `
            <div style="padding: 12px; background: ${bubbleBg}; ${borderStyle} border-radius: 8px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong style="font-size: 12px; color: ${labelColor};"><i class="fas ${isAdmin ? "fa-reply" : "fa-user"}" style="margin-left: 5px;"></i> ${bubble.name} ${isAdmin ? '<span style="font-size: 10px; font-weight: normal; color: var(--text-secondary);">(' + (bubble.name === "مدیر کل سایت" ? "مدیر کل" : "ادمین") + ")</span>" : ""}</strong>
                <span style="font-size: 11px; color: var(--text-secondary);">${toPersianDigits(bubble.time)}</span>
              </div>
              <p style="font-size: 13px; color: var(--text-primary); margin: 0; line-height: 1.8; white-space: pre-wrap;">${escapeHtml(bubble.text)}</p>
            </div>
          `;
          })
          .join("");

        // Highlight replied thread
        let flashStyle = "";
        if (recentlyRepliedMessageId === msg.id) {
          flashStyle =
            "outline: 3px solid #007aff; animation: flash-border 1s infinite alternate;";
        }

        return `
          <div class="notification-item ${unreadClass}" id="msg-thread-${msg.id}" style="margin-bottom: 2rem; border-radius: 20px; padding: 22px; transition: all 0.3s; display: block; ${unreadStyle} ${flashStyle}">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px; margin-bottom: 15px; text-align: right; direction: rtl;">
              <div style="display: flex; align-items: center; gap: 6px;">
                ${indicator}
                <strong style="font-size: 14px; color: var(--text-primary);">گفتگو با ${escapeHtml(msg.sender)} <span style="font-size: 11px; font-weight: normal; color: var(--text-secondary);">(${escapeHtml(msg.email)})</span></strong>
                ${messageSourceBadge(msg)}
                ${unansweredBadge}
              </div>
              <span class="thread-meta">
                <span style="font-size: 11px; color: var(--text-secondary);">شروع گفتگو: ${toPersianDigits(msg.time)}</span>
                <button type="button" class="thread-delete"
                        title="حذف این گفتگو" aria-label="حذف این گفتگو"
                        data-delete-message="${escapeAttr(String(msg.id))}">
                  <i class="fas fa-trash"></i>
                </button>
              </span>
            </div>

            <!-- Chat History Area -->
            <div style="display: flex; flex-direction: column;">
              ${bubblesHtml}
            </div>

            <!-- Inline Thread Reply Form (RTL, Beautiful) -->
            <div style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.04); padding-top: 15px;">
              <div style="display: flex; gap: 10px; align-items: flex-end;">
                <textarea id="inline-reply-text-${msg.id}" class="form-control" rows="1" placeholder="پاسخ خود را بنویسید..." style="flex: 1; padding: 10px; border-radius: 8px; resize: none; min-height: 40px; line-height: 1.8; text-align: right; direction: rtl; background: rgba(255,255,255,0.4); border: 1px solid rgba(0,0,0,0.08);"></textarea>
                <button type="button" class="btn-primary" onclick="sendInlineReply(${msg.id})" style="padding: 10px 20px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; color: #fff; height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                  <i class="fas fa-paper-plane"></i> ارسال پاسخ
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

  if (!document.getElementById("flashKeyframeStyle")) {
    const style = document.createElement("style");
    style.id = "flashKeyframeStyle";
    style.innerHTML = `
      @keyframes flash-border {
        0% { outline-color: #007aff; }
        100% { outline-color: rgba(0, 122, 255, 0.1); }
      }
    `;
    document.head.appendChild(style);
  }

  // Smooth scroll and clear flash after 5 seconds
  if (recentlyRepliedMessageId) {
    setTimeout(() => {
      const el = document.getElementById(
        "msg-thread-" + recentlyRepliedMessageId,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setTimeout(() => {
        recentlyRepliedMessageId = null;
        renderMessages();
      }, 5000);
    }, 200);
  }
}

function initRowDeletes() {
  if (document.body.dataset.rowDeletesBound === "true") return;
  document.body.dataset.rowDeletesBound = "true";

  document.addEventListener("click", function (event) {
    const msgBtn = event.target.closest("[data-delete-message]");
    if (msgBtn) {
      event.stopPropagation();
      deleteMessage(msgBtn.getAttribute("data-delete-message"));
      return;
    }
    const notifBtn = event.target.closest("[data-delete-notification]");
    if (notifBtn) {
      event.stopPropagation();
      deleteNotification(notifBtn.getAttribute("data-delete-notification"));
    }
  });
}

/** Remove one conversation from the inbox. */
function deleteMessage(msgId) {
  const message = appState.messages.find((m) => String(m.id) === String(msgId));
  if (!message) return;

  const who = message.sender || "این کاربر";
  if (!confirm(`گفتگو با «${who}» حذف شود؟ این کار قابل بازگشت نیست.`)) return;

  appState.messages = appState.messages.filter(
    (m) => String(m.id) !== String(msgId),
  );
  persistAdmin(appApi.admin.messages.remove(msgId), "حذف پیام");

  renderMessages();
  renderFloatingMessages();
  updateMessagesBadgeCount();
  showToast("گفتگو حذف شد.", "success");
}

/** Remove one notification from the bell and the اعلان‌ها tab. */
