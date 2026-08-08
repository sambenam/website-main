/* ============================================================================
   پشتیبان هوشمند
   ----------------------------------------------------------------------------
   The widget used to be a closed loop: it printed a canned answer after a
   one-second timeout and nothing left the page. A visitor could type a real
   question, get a placeholder back, and no one would ever see it.

   Now every question is also filed as a support message, so it lands in the
   admin inbox next to the contact-form messages and can be answered by a
   human. The automatic reply still shows immediately - the visitor is not
   left waiting - but it is clearly labelled as automatic.

   BACKEND NOTE: askAI() is the only place that needs changing when a real
   assistant is wired up. Everything else already goes through appApi.
   ========================================================================== */

const widget = document.getElementById("aiWidget");
const toggleBtn = document.getElementById("aiToggleBtn");
const closeBtn = document.getElementById("aiCloseBtn");
const messagesEl = document.getElementById("aiMessages");
const inputEl = document.getElementById("aiInput");
const sendBtn = document.getElementById("aiSendBtn");

/** Who is signed in, or null for a visitor. */
function aiCurrentUser() {
  try {
    const raw = localStorage.getItem("hesabyarSession");
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session && session.user ? session.user : null;
  } catch (error) {
    return null;
  }
}

function openChat() {
  widget.classList.add("open");
  inputEl.focus();
  refreshAiGate();
}
function closeChat() {
  widget.classList.remove("open");
}

if (toggleBtn) {
  toggleBtn.addEventListener("click", () =>
    widget.classList.contains("open") ? closeChat() : openChat(),
  );
}
if (closeBtn) closeBtn.addEventListener("click", closeChat);

function addMessage(text, who = "bot") {
  const div = document.createElement("div");
  div.className = `ai-message ${who}`;
  // Visitor text is inserted as text, never as markup - a question containing
  // a tag must not be able to run anything in the page.
  if (who === "user") {
    div.textContent = text;
  } else {
    div.innerHTML = text;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

/**
 * Signing in is required so a reply has somewhere to go.
 *
 * Answering a question needs an account to answer to. Rather than letting
 * someone type a long question and fail at the end, the composer is disabled
 * up front with a link to the sign-in page.
 */
function refreshAiGate() {
  if (!inputEl || !sendBtn) return;
  const user = aiCurrentUser();
  const locked = !user;

  inputEl.disabled = locked;
  sendBtn.disabled = locked;
  inputEl.placeholder = locked
    ? "برای گفتگو ابتدا وارد شوید"
    : "سوالت رو بنویس...";

  const existing = messagesEl.querySelector(".ai-login-hint");
  if (locked && !existing) {
    const hint = document.createElement("div");
    hint.className = "ai-message bot ai-login-hint";
    hint.innerHTML =
      "برای اینکه بتوانیم پاسخ را به پروفایل شما بفرستیم، لازم است " +
      '<a href="sign-up.html">وارد حساب کاربری</a> شوید.';
    messagesEl.appendChild(hint);
  } else if (!locked && existing) {
    existing.remove();
  }
}

// ===== اینجا هوش مصنوعی واقعی رو وصل میکنی =====
async function askAI(question) {
  // BACKEND NOTE: replace this with the real assistant call, for example
  //   const res = await appApi.support.ask({ question });
  //   return res.answer;
  await new Promise((r) => setTimeout(r, 700));
  return (
    "پرسش شما ثبت شد و برای کارشناسان ما ارسال شد. " +
    "پاسخ در بخش «پیام‌های من» در پروفایل شما قرار می‌گیرد."
  );
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  const user = aiCurrentUser();
  if (!user) {
    refreshAiGate();
    return;
  }

  addMessage(text, "user");
  inputEl.value = "";
  inputEl.disabled = true;
  sendBtn.disabled = true;

  const typing = document.createElement("div");
  typing.className = "ai-message bot";
  typing.textContent = "...";
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // File it for a human first. If this fails the visitor needs to know their
  // question did not reach anyone, rather than being reassured by a bot reply.
  let failure = null;
  try {
    if (typeof appApi === "undefined" || !appApi.support) {
      throw new Error("سرویس پیام در دسترس نیست.");
    }
    await appApi.support.sendMessage({
      name: user.name || "کاربر",
      // A session created by the dev helpers carries no email, and the
      // endpoint requires one. Falling back to the account id keeps the
      // message attached to a real person instead of being rejected.
      email: user.email || (user.id ? user.id + "@account.local" : ""),
      subject: "ai",
      message: text,
      source: "ai",
    });
  } catch (error) {
    // Report what actually went wrong. Blaming the connection for what is
    // really a validation error sends the visitor off checking their wifi.
    failure = error && error.message ? error.message : "ارسال پیام انجام نشد.";
  }

  const answer = failure
    ? "ارسال پیام انجام نشد: " + failure
    : await askAI(text);

  typing.remove();
  addMessage(answer, "bot");

  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("ai-suggestion")) {
    if (!aiCurrentUser()) {
      openChat();
      refreshAiGate();
      return;
    }
    inputEl.value = e.target.textContent;
    sendMessage();
  }
});

refreshAiGate();
