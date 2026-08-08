/**
 * Scroll-to-top button.
 *
 * Three pages load this script without having the button in their markup:
 * support.html, about-us.html and sign-up.html. The old code called
 * addEventListener on the result of querySelector without checking it, so on
 * those three pages the very first line threw:
 *
 *     TypeError: Cannot read properties of null (reading 'addEventListener')
 *
 * A classic <script> stops at the first uncaught error, so nothing after that
 * line ran. Here that was the whole file, but the same pattern in a longer
 * file silently kills everything below it.
 *
 * The button is optional now. A page that has it gets the behaviour; a page
 * that does not is left alone.
 */
(function () {
  const scrollTopBtn = document.querySelector(".scroll-top-btn");
  if (!scrollTopBtn) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 200) {
      scrollTopBtn.classList.add("show");
    } else {
      scrollTopBtn.classList.remove("show");
    }
  });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
})();
