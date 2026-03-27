function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadGallery() {
  const grid = document.getElementById("galleryGrid");
  if (!grid) return [];

  try {
    const response = await fetch("/api/gallery");
    const items = await response.json();

    if (!response.ok) {
      throw new Error(items.error || "Failed to load gallery");
    }

    grid.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      grid.innerHTML = `<p class="empty-state">No gallery items yet.</p>`;
      return [];
    }

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "gallery-card gallery-item";
      card.innerHTML = `
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || "Gallery image")}">
        <h3>${escapeHtml(item.title || "")}</h3>
        <p>${escapeHtml(item.caption || "")}</p>
      `;
      grid.appendChild(card);
    });

    return Array.from(grid.querySelectorAll(".gallery-item img"));
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<p class="empty-state">Failed to load gallery.</p>`;
    return [];
  }
}

function initGalleryLightbox(items) {
  const translate = (key, vars = {}) => {
    if (typeof window.__themegoodT === "function") return window.__themegoodT(key, vars);
    return key;
  };

  const lightbox = document.getElementById("galleryLightbox");
  const image = document.getElementById("lightboxImage");
  const prevBtn = document.getElementById("lightboxPrev");
  const nextBtn = document.getElementById("lightboxNext");
  const closeBtn = document.getElementById("lightboxClose");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const zoomLabel = document.getElementById("zoomLevel");
  const stage = document.getElementById("lightboxStage");

  if (!lightbox || !image || !prevBtn || !nextBtn || !closeBtn || !zoomInBtn || !zoomOutBtn || !zoomLabel || !stage) {
    return;
  }

  let currentIndex = 0;
  let zoom = 1;
  const minZoom = 0.6;
  const maxZoom = 3;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let activePointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  function clampPan() {
    const stageRect = stage.getBoundingClientRect();
    const imageWidth = stageRect.width * zoom;
    const imageHeight = stageRect.height * zoom;
    const maxOffsetX = Math.max(0, (imageWidth - stageRect.width) / 2);
    const maxOffsetY = Math.max(0, (imageHeight - stageRect.height) / 2);
    panX = Math.max(-maxOffsetX, Math.min(maxOffsetX, panX));
    panY = Math.max(-maxOffsetY, Math.min(maxOffsetY, panY));
  }

  function resetPan() {
    panX = 0;
    panY = 0;
  }

  function render() {
    if (!items.length) return;
    image.src = items[currentIndex].src;
    image.alt = items[currentIndex].alt || translate("gallery");
    if (zoom <= 1) resetPan();
    clampPan();
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    stage.classList.toggle("is-zoomed", zoom > 1);
    stage.classList.toggle("is-dragging", isDragging);
  }

  function openLightbox(index) {
    if (!items.length) return;
    currentIndex = index;
    zoom = 1;
    resetPan();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    render();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  function showNext(step) {
    if (!items.length) return;
    currentIndex = (currentIndex + step + items.length) % items.length;
    zoom = 1;
    resetPan();
    render();
  }

  function adjustZoom(delta) {
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
    render();
  }

  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== activePointerId) return;
    panX = dragOriginX + (e.clientX - dragStartX);
    panY = dragOriginY + (e.clientY - dragStartY);
    clampPan();
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function stopDragging() {
    isDragging = false;
    activePointerId = null;
    stage.classList.remove("is-dragging");
  }

  items.forEach((img, idx) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openLightbox(idx));
  });

  prevBtn.addEventListener("click", () => showNext(-1));
  nextBtn.addEventListener("click", () => showNext(1));
  closeBtn.addEventListener("click", closeLightbox);
  zoomInBtn.addEventListener("click", () => adjustZoom(0.2));
  zoomOutBtn.addEventListener("click", () => adjustZoom(-0.2));

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target === stage) closeLightbox();
  });

  image.addEventListener("pointerdown", (e) => {
    if (zoom <= 1) return;
    isDragging = true;
    activePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginX = panX;
    dragOriginY = panY;
    stage.classList.add("is-dragging");
    image.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  image.addEventListener("pointermove", onPointerMove);
  image.addEventListener("pointerup", stopDragging);
  image.addEventListener("pointercancel", stopDragging);
  image.addEventListener("lostpointercapture", stopDragging);

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") showNext(1);
    if (e.key === "ArrowLeft") showNext(-1);
    if (e.key === "+" || e.key === "=") adjustZoom(0.2);
    if (e.key === "-") adjustZoom(-0.2);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const items = await loadGallery();
  initGalleryLightbox(items);
});
