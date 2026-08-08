const ITEM_CONTENT_DEFAULTS = {
  body: "",
  video: null,
  downloads: [],
  blocks: [],
};

const ITEM_VIDEO_PROVIDERS = ["youtube", "aparat", "file"];

const ITEM_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "ordered-list",
  "quote",
  "link",
  "image",
  "divider",
  "html",
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value) {
  const url = String(value || "").trim();

  if (!url || /^(javascript|vbscript|data):/i.test(url)) {
    return "";
  }

  return url;
}

function normalizeBlock(block) {
  if (
    !block ||
    typeof block !== "object" ||
    !ITEM_BLOCK_TYPES.includes(block.type)
  ) {
    return null;
  }

  if (block.type === "heading") {
    const level = Number(block.level);
    return {
      type: "heading",
      level: Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2,
      text: String(block.text || "").trim(),
    };
  }

  if (block.type === "paragraph") {
    return { type: "paragraph", text: String(block.text || "").trim() };
  }

  if (block.type === "list" || block.type === "ordered-list") {
    return {
      type: block.type,
      items: Array.isArray(block.items)
        ? block.items.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    };
  }

  if (block.type === "quote") {
    return {
      type: "quote",
      text: String(block.text || "").trim(),
      cite: String(block.cite || "").trim(),
    };
  }

  if (block.type === "link") {
    return {
      type: "link",
      text: String(block.text || "").trim(),
      url: safeUrl(block.url || block.href),
      target: block.target === "_self" ? "_self" : "_blank",
    };
  }

  if (block.type === "image") {
    return {
      type: "image",
      src: safeUrl(block.src || block.url),
      alt: String(block.alt || "").trim(),
      caption: String(block.caption || "").trim(),
    };
  }

  if (block.type === "html") {
    return { type: "html", html: String(block.html || "") };
  }

  return { type: "divider" };
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks.map(normalizeBlock).filter(Boolean);
}

function renderBlock(block) {
  if (block.type === "heading") {
    return (
      "<h" +
      block.level +
      ">" +
      escapeHtml(block.text) +
      "</h" +
      block.level +
      ">"
    );
  }

  if (block.type === "paragraph") {
    return "<p>" + escapeHtml(block.text) + "</p>";
  }

  if (block.type === "list" || block.type === "ordered-list") {
    const tag = block.type === "list" ? "ul" : "ol";
    const items = block.items
      .map((item) => "<li>" + escapeHtml(item) + "</li>")
      .join("");
    return "<" + tag + ">" + items + "</" + tag + ">";
  }

  if (block.type === "quote") {
    const cite = block.cite
      ? "<cite>" + escapeHtml(block.cite) + "</cite>"
      : "";
    return "<blockquote>" + escapeHtml(block.text) + cite + "</blockquote>";
  }

  if (block.type === "link") {
    const target =
      block.target === "_blank"
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
    return (
      '<p><a href="' +
      escapeHtml(block.url) +
      '"' +
      target +
      ">" +
      escapeHtml(block.text || block.url) +
      "</a></p>"
    );
  }

  if (block.type === "image") {
    if (!block.src) {
      return "";
    }

    const caption = block.caption
      ? "<figcaption>" + escapeHtml(block.caption) + "</figcaption>"
      : "";
    return (
      '<figure><img src="' +
      escapeHtml(block.src) +
      '" alt="' +
      escapeHtml(block.alt) +
      '" loading="lazy">' +
      caption +
      "</figure>"
    );
  }

  if (block.type === "html") {
    return block.html;
  }

  return "<hr>";
}

function blocksToHtml(blocks) {
  return normalizeBlocks(blocks).map(renderBlock).filter(Boolean).join("\n");
}

function createItemContent(options) {
  const settings = options || {};
  const content = {};
  const blocks = normalizeBlocks(settings.blocks);

  if (blocks.length) {
    content.blocks = blocks;
  } else if (settings.body || settings.html) {
    content.body = String(settings.body || settings.html);
  }

  if (settings.video) {
    content.video = settings.video;
  }

  if (Array.isArray(settings.downloads) && settings.downloads.length) {
    content.downloads = settings.downloads;
  }

  return content;
}

function getContentBlocks(item) {
  const content = item && item.content;

  if (
    content &&
    typeof content === "object" &&
    Array.isArray(content.blocks) &&
    content.blocks.length
  ) {
    return normalizeBlocks(content.blocks);
  }

  if (typeof content === "string" && content.trim()) {
    return [{ type: "html", html: content.trim() }];
  }

  if (content && typeof content.body === "string" && content.body.trim()) {
    return [{ type: "html", html: content.body.trim() }];
  }

  return [];
}

function normalizeItemContent(item) {
  if (!item || typeof item !== "object") {
    return { ...ITEM_CONTENT_DEFAULTS };
  }

  const legacyBody =
    typeof item.content === "string" ? item.content : item.description || "";

  if (
    item.content &&
    typeof item.content === "object" &&
    !Array.isArray(item.content)
  ) {
    const blocks = normalizeBlocks(item.content.blocks);
    const bodyFromBlocks = blocksToHtml(blocks);
    const body = bodyFromBlocks || item.content.body || legacyBody;

    return {
      body: body,
      video: normalizeVideo(item.content.video || item.video),
      downloads: normalizeDownloads(item.content.downloads || item.downloads),
      blocks: blocks,
    };
  }

  return {
    body: legacyBody,
    video: normalizeVideo(item.video),
    downloads: normalizeDownloads(item.downloads),
    blocks: legacyBody.trim()
      ? [{ type: "html", html: legacyBody.trim() }]
      : [],
  };
}

function normalizeVideo(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  if (!video.enabled || !video.url) {
    return null;
  }

  const provider = ITEM_VIDEO_PROVIDERS.includes(video.provider)
    ? video.provider
    : "file";

  return {
    enabled: true,
    url: String(video.url).trim(),
    provider: provider,
    title: video.title ? String(video.title).trim() : "",
  };
}

function normalizeDownloads(downloads) {
  if (!Array.isArray(downloads)) {
    return [];
  }

  return downloads
    .filter(function (file) {
      return file && file.url && file.title;
    })
    .map(function (file, index) {
      return {
        id: file.id || "download-" + (index + 1),
        title: String(file.title).trim(),
        url: safeUrl(file.url),
        type: file.type ? String(file.type).trim() : "file",
        size: file.size ? String(file.size).trim() : "",
      };
    })
    .filter(function (file) {
      return file.url;
    });
}

function toYoutubeEmbed(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  const videoId = match ? match[1] : url;
  return "https://www.youtube.com/embed/" + videoId;
}

function toAparatEmbed(url) {
  const match = url.match(/aparat\.com\/v\/([\w-]+)/);
  const videoId = match ? match[1] : url;
  return "https://www.aparat.com/video/video/embed/videohash/" + videoId;
}

function getDownloadIcon(type) {
  const icons = {
    pdf: "fa-file-pdf",
    xlsx: "fa-file-excel",
    xls: "fa-file-excel",
    doc: "fa-file-word",
    docx: "fa-file-word",
    zip: "fa-file-zipper",
  };

  return icons[type] || "fa-file-arrow-down";
}

function renderItemVideo(container, video) {
  if (!container) {
    return;
  }

  if (!video) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;

  if (video.provider === "youtube") {
    container.innerHTML =
      '<div class="single-post_video_wrapper">' +
      '<iframe src="' +
      escapeHtml(toYoutubeEmbed(video.url)) +
      '" title="' +
      escapeHtml(video.title || "ویدیو") +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>' +
      "</div>";
    return;
  }

  if (video.provider === "aparat") {
    container.innerHTML =
      '<div class="single-post_video_wrapper">' +
      '<iframe src="' +
      escapeHtml(toAparatEmbed(video.url)) +
      '" title="' +
      escapeHtml(video.title || "ویدیو") +
      '" allowfullscreen loading="lazy"></iframe>' +
      "</div>";
    return;
  }

  container.innerHTML =
    '<video class="single-post_video_player" controls preload="metadata" src="' +
    escapeHtml(video.url) +
    '"></video>';
}

function renderItemDownloads(container, downloads) {
  if (!container) {
    return;
  }

  if (!downloads.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;

  const items = downloads
    .map(function (file) {
      const sizeHtml = file.size
        ? '<span class="single-post_download_size">' +
          escapeHtml(file.size) +
          "</span>"
        : "";

      return (
        '<li class="single-post_download_item">' +
        '<a href="' +
        escapeHtml(file.url) +
        '" class="single-post_download_link" download>' +
        '<i class="fa-solid ' +
        getDownloadIcon(file.type) +
        '"></i>' +
        "<span>" +
        escapeHtml(file.title) +
        "</span>" +
        sizeHtml +
        "</a>" +
        "</li>"
      );
    })
    .join("");

  container.innerHTML =
    '<h2 class="single-post_downloads_title">فایل‌های قابل دانلود</h2>' +
    '<ul class="single-post_downloads_list">' +
    items +
    "</ul>";
}

function renderItemContent(item, elements) {
  const content = normalizeItemContent(item);
  const bodyEl = elements.body;
  const videoEl = elements.video;
  const downloadsEl = elements.downloads;

  if (bodyEl) {
    bodyEl.innerHTML =
      content.body || "<p>محتوایی برای این مطلب ثبت نشده است.</p>";
  }

  renderItemVideo(videoEl, content.video);
  renderItemDownloads(downloadsEl, content.downloads);

  return content;
}

if (typeof module !== "undefined") {
  module.exports = {
    ITEM_CONTENT_DEFAULTS,
    ITEM_VIDEO_PROVIDERS,
    ITEM_BLOCK_TYPES,
    createItemContent,
    escapeHtml,
    normalizeBlock,
    normalizeBlocks,
    blocksToHtml,
    getContentBlocks,
    normalizeItemContent,
    renderItemContent,
  };
}
