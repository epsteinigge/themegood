const adminToken = localStorage.getItem("adminToken");

if (!adminToken) {
  window.location.href = "admin-login.html";
}

const galleryIdInput = document.getElementById("galleryId");
const galleryTitleInput = document.getElementById("galleryTitle");
const galleryCaptionInput = document.getElementById("galleryCaption");
const galleryImageFileInput = document.getElementById("galleryImageFile");
const galleryImageUrlInput = document.getElementById("galleryImageUrl");
const gallerySortOrderInput = document.getElementById("gallerySortOrder");
const galleryIsActiveInput = document.getElementById("galleryIsActive");
const galleryForm = document.getElementById("galleryForm");
const galleryItemsList = document.getElementById("galleryItemsList");
const uploadGalleryImageBtn = document.getElementById("uploadGalleryImageBtn");
const resetGalleryBtn = document.getElementById("resetGalleryBtn");
const adminLogoutLink = document.getElementById("adminLogoutLink");
const logoutBtnTop = document.getElementById("logoutBtnTop");
const refreshGalleryBtn = document.getElementById("refreshGalleryBtn");
const saveGalleryBtn = document.getElementById("saveGalleryBtn");
const imageOverlay = document.getElementById("imageOverlay");
const imageOverlayImg = document.getElementById("imageOverlayImg");
const imageOverlayClose = document.getElementById("imageOverlayClose");

let currentGalleryItems = [];

function authHeaders(extra = {}) {
  return {
    "x-admin-token": adminToken,
    ...extra
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetGalleryForm() {
  galleryIdInput.value = "";
  galleryTitleInput.value = "";
  galleryCaptionInput.value = "";
  galleryImageFileInput.value = "";
  galleryImageUrlInput.value = "";
  gallerySortOrderInput.value = "0";
  galleryIsActiveInput.checked = true;
  if (saveGalleryBtn) {
    saveGalleryBtn.textContent = "Save Gallery Item";
  }
}

async function loadGalleryItems() {
  try {
    const response = await fetch("/api/admin/gallery", {
      headers: authHeaders()
    });

    const items = await response.json();

    if (!response.ok) {
      throw new Error(items.error || "Failed to load gallery items");
    }

    galleryItemsList.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      galleryItemsList.innerHTML = `<p>No gallery items yet.</p>`;
      currentGalleryItems = [];
      return;
    }

    currentGalleryItems = items;

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "admin-list-card";
      card.innerHTML = `
        <div class="admin-list-card-image">
          ${
            item.image_url
              ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || "Gallery image")}" data-action="preview-image" data-image-url="${escapeHtml(item.image_url)}" data-image-title="${escapeHtml(item.title || "Gallery image")}">`
              : `<div class="image-preview-placeholder">No image</div>`
          }
        </div>
        <div class="admin-list-card-body">
          <h3>${escapeHtml(item.title || "Untitled")}</h3>
          <p>${escapeHtml(item.caption || "")}</p>
          <p><strong>Sort Order:</strong> ${Number(item.sort_order || 0)}</p>
          <p><strong>Status:</strong> ${item.is_active ? "Active" : "Hidden"}</p>
          <div class="admin-inline-actions">
            <button type="button" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `;

      galleryItemsList.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    galleryItemsList.innerHTML = `<p>Failed to load gallery items.</p>`;
    currentGalleryItems = [];
  }
}

function editGalleryItem(id) {
  const item = currentGalleryItems.find((entry) => Number(entry.id) === Number(id));
  if (!item) return;

  galleryIdInput.value = item.id;
  galleryTitleInput.value = item.title || "";
  galleryCaptionInput.value = item.caption || "";
  galleryImageUrlInput.value = item.image_url || "";
  gallerySortOrderInput.value = String(item.sort_order ?? 0);
  galleryIsActiveInput.checked = Boolean(item.is_active);
  if (saveGalleryBtn) {
    saveGalleryBtn.textContent = "Update Gallery Item";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openImageOverlay(imageUrl, imageTitle) {
  if (!imageOverlay || !imageOverlayImg || !imageUrl) return;

  imageOverlayImg.src = imageUrl;
  imageOverlayImg.alt = imageTitle || "Gallery preview";
  imageOverlay.classList.add("is-open");
  imageOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeImageOverlay() {
  if (!imageOverlay || !imageOverlayImg) return;

  imageOverlay.classList.remove("is-open");
  imageOverlay.setAttribute("aria-hidden", "true");
  imageOverlayImg.src = "";
  imageOverlayImg.alt = "Gallery preview";
  document.body.style.overflow = "";
}

async function deleteGalleryItem(id) {
  if (!confirm("Delete this gallery item?")) return;

  try {
    const response = await fetch("/api/delete-gallery-item", {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to delete gallery item");
    }

    await loadGalleryItems();
    resetGalleryForm();
  } catch (error) {
    alert(error.message);
  }
}

uploadGalleryImageBtn.addEventListener("click", async () => {
  const file = galleryImageFileInput.files?.[0];
  if (!file) {
    alert("Please choose an image first.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await fetch("/api/upload-gallery-image", {
      method: "POST",
      headers: {
        "x-admin-token": adminToken
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to upload image");
    }

    galleryImageUrlInput.value = result.image_url || "";
    alert("Image uploaded successfully.");
  } catch (error) {
    alert(error.message);
  }
});

galleryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    id: galleryIdInput.value ? Number(galleryIdInput.value) : undefined,
    title: galleryTitleInput.value.trim(),
    caption: galleryCaptionInput.value.trim(),
    image_url: galleryImageUrlInput.value.trim(),
    sort_order: Number(gallerySortOrderInput.value || 0),
    is_active: galleryIsActiveInput.checked
  };

  const isEditing = Boolean(payload.id);
  const endpoint = isEditing ? "/api/update-gallery-item" : "/api/add-gallery-item";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to save gallery item");
    }

    resetGalleryForm();
    await loadGalleryItems();
  } catch (error) {
    alert(error.message);
  }
});

resetGalleryBtn.addEventListener("click", resetGalleryForm);

galleryItemsList?.addEventListener("click", (event) => {
  const previewImg = event.target.closest("img[data-action='preview-image']");
  if (previewImg) {
    openImageOverlay(previewImg.dataset.imageUrl, previewImg.dataset.imageTitle);
    return;
  }

  const editBtn = event.target.closest("button[data-action='edit']");
  if (editBtn) {
    editGalleryItem(Number(editBtn.dataset.id));
    return;
  }

  const deleteBtn = event.target.closest("button[data-action='delete']");
  if (deleteBtn) {
    deleteGalleryItem(Number(deleteBtn.dataset.id));
  }
});

imageOverlayClose?.addEventListener("click", closeImageOverlay);
imageOverlay?.addEventListener("click", (event) => {
  if (event.target === imageOverlay) {
    closeImageOverlay();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageOverlay?.classList.contains("is-open")) {
    closeImageOverlay();
  }
});

function logoutAdmin() {
  localStorage.removeItem("adminToken");
  window.location.href = "admin-login.html";
}

adminLogoutLink?.addEventListener("click", logoutAdmin);
logoutBtnTop?.addEventListener("click", logoutAdmin);
refreshGalleryBtn?.addEventListener("click", loadGalleryItems);

loadGalleryItems();
