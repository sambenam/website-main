const postTitle = document.getElementById("post-title");
const postImage = document.getElementById("post-image");
const postContent = document.getElementById("post-content");
const postVideo = document.getElementById("post-video");
const postDownloads = document.getElementById("post-downloads");
const backLink = document.getElementById("back-link");

const postId = new URLSearchParams(window.location.search).get("id");

async function loadSinglePost() {
  if (!postId) {
    postTitle.textContent = "مطلب پیدا نشد";
    postImage.style.display = "none";
    postContent.innerHTML = "شناسه مطلب در آدرس وجود ندارد.";
    if (postVideo) postVideo.hidden = true;
    if (postDownloads) postDownloads.hidden = true;
    backLink.textContent = "بازگشت به صفحه اصلی";
    backLink.href = "index.html";
    return;
  }

  for (const slug in siteData) {
    const category = siteData[slug];
    const post = category.items.find(function (item) {
      return item.id === postId;
    });

    if (post) {
      document.title = post.title + " | آی آر حسابداران";
      postTitle.textContent = post.title;
      postImage.src = post.image;
      postImage.alt = post.title;

      // CHECK FOR ASSOCIATED DIGITAL PRODUCTS (VIDEO and FILES separately)
      const productsRaw = localStorage.getItem("irHesabdarProducts");
      let videoProduct = null;
      let filesProduct = null;
      if (productsRaw) {
        try {
          const prods = JSON.parse(productsRaw);
          if (Array.isArray(prods)) {
            videoProduct = prods.find(function (p) {
              return String(p.id) === String(postId) + "-video";
            });
            filesProduct = prods.find(function (p) {
              return String(p.id) === String(postId);
            });
          }
        } catch (e) {}
      }

      // CHECK IF ALREADY PURCHASED
      // What the customer owns comes from their paid orders, not from a list
      // the browser kept. The old localStorage flag was per-device - a paid
      // customer lost access on another browser - and could be forged from
      // the console. localStorage is still read as a fallback so a purchase
      // made before this change keeps working offline.
      let isVideoPurchased = false;
      let isFilesPurchased = false;
      let purchased = [];
      try {
        if (
          typeof appApi !== "undefined" &&
          appApi.commerce &&
          appApi.commerce.entitlements
        ) {
          const owned = await appApi.commerce.entitlements();
          if (Array.isArray(owned)) purchased = owned;
        }
      } catch (e) {
        purchased = [];
      }
      if (!purchased.length) {
        try {
          const cached = JSON.parse(
            localStorage.getItem("irHesabdarPurchasedProducts") || "[]",
          );
          if (Array.isArray(cached)) purchased = cached;
        } catch (e) {}
      }
      isVideoPurchased = purchased.indexOf(postId + "-video") !== -1;
      isFilesPurchased = purchased.indexOf(postId) !== -1;

      // Flags for display (Only lock if product price is greater than 0)
      const showLockedVideo =
        videoProduct && Number(videoProduct.price) > 0 && !isVideoPurchased;
      const showLockedFiles =
        filesProduct && Number(filesProduct.price) > 0 && !isFilesPurchased;

      // 1. Render Video content or Locked Video Box
      if (showLockedVideo) {
        if (postVideo) {
          postVideo.hidden = false;
          postVideo.innerHTML = `
            <div class="paid-video-box" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 2rem; text-align: center; margin-bottom: 2rem; box-shadow: var(--shadow-card); backdrop-filter: blur(10px);">
              <i class="fa-solid fa-circle-play" style="font-size: 3rem; color: #ff9500; margin-bottom: 1rem;"></i>
              <h3 style="margin-bottom: 0.5rem; color: #fff; font-size: 1.25rem;">تماشای آنلاین ویدیوی این دوره نقدی می‌باشد</h3>
              <p style="color: #86868b; margin-bottom: 1.5rem; font-size: 14px;">برای بازگشایی قفل ویدیو و تماشای آنلاین، لطفا هزینه آن را پرداخت کنید.</p>
              <div style="font-size: 1.5rem; font-weight: bold; color: #34c759; margin-bottom: 1.5rem;">${Number(videoProduct.price).toLocaleString()} تومان</div>
              <button id="buyVideoBtn" class="btn-primary" style="background: #007aff; padding: 12px 24px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; font-size: 15px; color: #fff; display: inline-flex; align-items: center; gap: 8px; transition: background 0.3s;">
                <i class="fa-solid fa-credit-card"></i> خرید و بازگشایی ویدیو
              </button>
            </div>
          `;

          document
            .getElementById("buyVideoBtn")
            ?.addEventListener("click", function () {
              const cartItem = {
                id: videoProduct.id,
                name: videoProduct.name,
                price: videoProduct.price,
                img: videoProduct.img || "../images/ravin.png",
                qty: 1,
              };
              localStorage.setItem("hesabyarCart", JSON.stringify([cartItem]));
              window.location.href = "checkout.html";
            });
        }
      } else {
        // Show video normally if free or already purchased
        renderItemContent(post, {
          body: null,
          video: postVideo,
          downloads: null,
        });

        if (isVideoPurchased && postVideo) {
          const badge = document.createElement("div");
          badge.className = "alert alert-success";
          badge.style.background = "rgba(52, 199, 89, 0.08)";
          badge.style.color = "#34c759";
          badge.style.border = "1px solid rgba(52, 199, 89, 0.15)";
          badge.style.padding = "8px 12px";
          badge.style.borderRadius = "8px";
          badge.style.marginBottom = "1rem";
          badge.style.textAlign = "center";
          badge.style.fontWeight = "bold";
          badge.style.fontSize = "13px";
          badge.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-left: 6px;"></i> قفل ویدیو باز شده است. تماشای آنلاین فعال است.`;
          postVideo.prepend(badge);
        }
      }

      // 2. Render Downloads or Locked Downloads Box
      if (showLockedFiles) {
        if (postDownloads) {
          postDownloads.hidden = false;
          postDownloads.innerHTML = `
            <div class="paid-product-box" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 2.5rem; text-align: center; margin-top: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.15); backdrop-filter: blur(10px);">
              <i class="fa-solid fa-file-shield" style="font-size: 3rem; color: #ff9500; margin-bottom: 1rem;"></i>
              <h3 style="margin-bottom: 0.5rem; color: #fff; font-size: 1.25rem;">دانلود فایل‌های این دوره نقدی می‌باشد</h3>
              <p style="color: #86868b; margin-bottom: 1.5rem; font-size: 14px;">برای دریافت لینک دانلود اصلی فایل‌ها، لطفا این محصول را خریداری کنید.</p>
              <div style="font-size: 1.75rem; font-weight: bold; color: #34c759; margin-bottom: 1.5rem;">${Number(filesProduct.price).toLocaleString()} تومان</div>
              <button id="buyFilesBtn" class="btn-primary" style="background: #007aff; padding: 14px 28px; border-radius: 10px; font-weight: bold; border: none; cursor: pointer; font-size: 16px; color: #fff; display: inline-flex; align-items: center; gap: 8px; transition: background 0.3s;">
                <i class="fa-solid fa-credit-card"></i> خرید و دسترسی فوری به فایل‌ها
              </button>
            </div>
          `;

          document
            .getElementById("buyFilesBtn")
            ?.addEventListener("click", function () {
              const cartItem = {
                id: filesProduct.id,
                name: filesProduct.name,
                price: filesProduct.price,
                img: filesProduct.img || "../images/ravin.png",
                qty: 1,
              };
              localStorage.setItem("hesabyarCart", JSON.stringify([cartItem]));
              window.location.href = "checkout.html";
            });
        }
      } else {
        // Show downloads normally if free or already purchased
        renderItemContent(post, {
          body: null,
          video: null,
          downloads: postDownloads,
        });

        if (isFilesPurchased && postDownloads) {
          const badge = document.createElement("div");
          badge.className = "alert alert-success";
          badge.style.background = "rgba(52, 199, 89, 0.08)";
          badge.style.color = "#34c759";
          badge.style.border = "1px solid rgba(52, 199, 89, 0.15)";
          badge.style.padding = "12px";
          badge.style.borderRadius = "8px";
          badge.style.marginBottom = "1.5rem";
          badge.style.textAlign = "center";
          badge.style.fontWeight = "bold";
          badge.style.fontSize = "14px";
          badge.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-left: 6px;"></i> خرید موفقیت‌آمیز بود! قفل فایل با موفقیت باز شد و هم‌اکنون می‌توانید آن را دانلود کنید.`;
          postDownloads.prepend(badge);
        }
      }

      // Render main text description
      renderItemContent(post, {
        body: postContent,
        video: null,
        downloads: null,
      });

      backLink.textContent = "بازگشت به " + category.title;
      backLink.href = "list-page.html?cat=" + slug;
      return;
    }
  }

  postTitle.textContent = "مطلب پیدا نشد";
  postImage.style.display = "none";
  postContent.innerHTML = "مطلب مورد نظر پیدا نشد.";
  if (postVideo) postVideo.hidden = true;
  if (postDownloads) postDownloads.hidden = true;
  backLink.textContent = "بازگشت به صفحه اصلی";
  backLink.href = "/";
}

loadSinglePost();
