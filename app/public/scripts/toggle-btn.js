// toggle theme
// شب = حالت فعلی سایت - پیشفرض
(function () {
  const KEY = "hesabyar-theme";
  const html = document.documentElement;
  function getTheme() {
    return localStorage.getItem(KEY) || "dark";
  }
  function applyTheme(t) {
    if (t === "light") html.setAttribute("data-theme", "light");
    else html.removeAttribute("data-theme");
    localStorage.setItem(KEY, t);
  }
  function toggleTheme() {
    const cur = html.getAttribute("data-theme") === "light" ? "light" : "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  }
  applyTheme(getTheme());
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.addEventListener("click", toggleTheme);
  });
  window.toggleHesabyarTheme = toggleTheme;
})();
