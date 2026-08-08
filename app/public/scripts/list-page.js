const pageTitle = document.getElementById("page-title");
const postsList = document.getElementById("posts-list");

if (!pageTitle || !postsList) {
  console.warn("list-page.js روی صفحه‌ی نامعتبر اجرا شد");
} else {
  const params = new URLSearchParams(window.location.search);
  const categoryKey = params.get("cat")?.trim();
  const query = params.get("query")?.trim().toLowerCase() || "";

  function renderPosts(posts) {
    postsList.replaceChildren();

    if (!posts.length) {
      const empty = document.createElement("li");
      empty.className = "list-page_empty";
      empty.textContent = query
        ? "نتیجه‌ای برای جستجوی شما پیدا نشد."
        : "هنوز آیتمی در این دسته ثبت نشده است.";
      postsList.appendChild(empty);
      return;
    }

    posts.forEach((item) => {
      const li = document.createElement("li");
      li.className = "list-page_item";

      const body = document.createElement("div");
      body.className = "list-page_item_body";

      const title = document.createElement("h2");
      title.className = "list-page_item_title";
      title.textContent = item.title || "بدون عنوان";

      const excerpt = document.createElement("p");
      excerpt.className = "list-page_item_text";
      excerpt.textContent =
        item.excerpt || "توضیحی برای این آیتم ثبت نشده است.";

      const link = document.createElement("a");
      link.className = "list-page_item_btn";
      link.href = "single-post.html?id=" + encodeURIComponent(item.id);
      link.textContent = "توضیحات بیشتر";

      const image = document.createElement("img");
      image.className = "list-page_item_img";
      image.src = item.image || "../images/ravin.png";
      image.alt = item.title || "تصویر آیتم";
      image.loading = "lazy";

      body.append(title, excerpt, link);
      li.append(body, image);
      postsList.appendChild(li);
    });
  }

  function loadListPage() {
    if (typeof siteData === "undefined") {
      pageTitle.textContent = "اطلاعات سایت بارگذاری نشد";
      renderPosts([]);
      return;
    }

    let category = siteData[categoryKey];
    if (!category && query) {
      category = {
        title: "جستجوی سایت",
        items: Object.values(siteData).flatMap((entry) => entry.items || []),
      };
    }

    if (!category) {
      pageTitle.textContent = "دسته پیدا نشد";
      renderPosts([]);
      return;
    }

    const posts = (category.items || []).filter((item) => {
      if (!query) return true;
      return [item.title, item.excerpt].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    });

    document.title = category.title + " | حسابیار";
    pageTitle.textContent = query
      ? `نتایج جستجو برای «${query}»`
      : category.title;
    renderPosts(posts);
  }

  loadListPage();
}
