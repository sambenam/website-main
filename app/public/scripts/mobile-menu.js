(function () {
  if (window.__hesabyarMobileMenuInitialized) {
    return;
  }
  window.__hesabyarMobileMenuInitialized = true;

  const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
  const mobileCloseBtn = document.querySelector(".mobile-close");
  const mobileMenu = document.querySelector(".mobile-menu");
  const mobileOverlay = document.querySelector(".mobile-overlay");
  const mobileSearchBtn = document.querySelector(".mobile-search-btn");
  const mobileSearchBox = document.querySelector(".mobile-search-box");
  const mobileSearchInput = document.querySelector(".mobile-search-box input");

  function closeMobileMenu() {
    mobileMenu?.classList.remove("active");
    mobileOverlay?.classList.remove("active");
    document.body.style.overflow = "";
    document.body.classList.remove("mobile-menu-open");
  }

  mobileMenuBtn?.addEventListener("click", () => {
    mobileMenu?.classList.add("active");
    mobileOverlay?.classList.add("active");
    document.body.style.overflow = "hidden";
    document.body.classList.add("mobile-menu-open");
  });

  mobileCloseBtn?.addEventListener("click", closeMobileMenu);
  mobileOverlay?.addEventListener("click", closeMobileMenu);

  mobileSearchBtn?.addEventListener("click", () => {
    mobileSearchBox?.classList.toggle("active");
    if (mobileSearchBox?.classList.contains("active")) {
      mobileSearchInput?.focus();
    }
  });

  mobileSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && mobileSearchInput.value.trim()) {
      window.location.href =
        "list-page.html?query=" +
        encodeURIComponent(mobileSearchInput.value.trim());
    }
  });

  document.querySelectorAll(".mobile-dropdown").forEach((dropdown) => {
    const button = dropdown.querySelector(".mobile-dropdown-btn");
    button?.addEventListener("click", () => {
      const isActive = dropdown.classList.contains("active");
      document.querySelectorAll(".mobile-dropdown").forEach((item) => {
        if (item !== dropdown) item.classList.remove("active");
      });
      dropdown.classList.toggle("active", !isActive);
    });
  });

  document.querySelectorAll(".mobile-sub-dropdown").forEach((dropdown) => {
    const button = dropdown.querySelector(".mobile-sub-btn");
    button?.addEventListener("click", (event) => {
      event.stopPropagation();
      const parent = dropdown.closest(".mobile-dropdown-menu");
      const isActive = dropdown.classList.contains("active");
      parent?.querySelectorAll(".mobile-sub-dropdown").forEach((item) => {
        if (item !== dropdown) item.classList.remove("active");
      });
      dropdown.classList.toggle("active", !isActive);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMobileMenu();
  });
})();
