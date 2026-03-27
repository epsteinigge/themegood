const adminToken = localStorage.getItem("adminToken");

if (!adminToken) {
  window.location.href = "admin-login.html";
}

const slideIdInput = document.getElementById("slideId");
const slideTitleInput = document.getElementById("slideTitle");
const slideSubtitleInput = document.getElementById("slideSubtitle");
const slideImageFileInput = document.getElementById("slideImageFile");
const slideImageUrlInput = document.getElementById("slideImageUrl");
const slidePrimaryTextInput = document.getElementById("slidePrimaryText");
const slidePrimaryLinkInput = document.getElementById("slidePrimaryLink");
const slideSecondaryTextInput = document.getElementById("slideSecondaryText");
const slideSecondaryLinkInput = document.getElementById("slideSecondaryLink");
const slideSortOrderInput = document.getElementById("slideSortOrder");
const slideIsActiveInput = document.getElementById("slideIsActive");
const slideForm = document.getElementById("slideForm");
const homepageSlidesList = document.getElementById("homepageSlidesList");
const homepageSectionsList = document.getElementById("homepageSectionsList");
const uploadSlideImageBtn = document.getElementById("uploadSlideImageBtn");
const resetSlideBtn = document.getElementById("resetSlideBtn");
const logoutBtn = document.getElementById("logoutBtn");
const slideImageOverlay = document.getElementById("slideImageOverlay");
const slideImageOverlayImg = document.getElementById("slideImageOverlayImg");
const slideImageOverlayClose = document.getElementById("slideImageOverlayClose");

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

function resetSlideForm() {
  slideIdInput.value = "";
  slideTitleInput.value = "";
  slideSubtitleInput.value = "";
  slideImageFileInput.value = "";
  slideImageUrlInput.value = "";
  slidePrimaryTextInput.value = "Buy Now";
  slidePrimaryLinkInput.value = "#products";
  slideSecondaryTextInput.value = "Learn More";
  slideSecondaryLinkInput.value = "#about";
  slideSortOrderInput.value = "0";
  slideIsActiveInput.checked = true;
}

async function loadHomepageAdmin() {
  try {
    const response = await fetch("/api/admin/homepage", {
      headers: authHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load homepage admin data");
    }

    renderSlides(Array.isArray(data.slides) ? data.slides : []);
    renderSections(Array.isArray(data.sections) ? data.sections : []);
  } catch (error) {
    console.error(error);
    homepageSlidesList.innerHTML = `<p>Failed to load slides.</p>`;
    homepageSectionsList.innerHTML = `<p>Failed to load sections.</p>`;
  }
}

function renderSlides(slides) {
  homepageSlidesList.innerHTML = "";

  if (!slides.length) {
    homepageSlidesList.innerHTML = `<p>No homepage slides yet.</p>`;
    return;
  }

  slides.forEach((slide) => {
    const card = document.createElement("div");
    card.className = "admin-list-card";
    card.innerHTML = `
      <div class="admin-list-card-image">
        ${
          slide.image_url
            ? `<img src="${escapeHtml(slide.image_url)}" alt="${escapeHtml(slide.title || "Slide image")}" data-action="preview-slide-image" data-image-url="${escapeHtml(slide.image_url)}" data-image-title="${escapeHtml(slide.title || "Slide image")}">`
            : `<div class="image-preview-placeholder">No image</div>`
        }
      </div>
      <div class="admin-list-card-body">
        <h3>${escapeHtml(slide.title || "Untitled Slide")}</h3>
        <p>${escapeHtml(slide.subtitle || "")}</p>
        <p><strong>Primary:</strong> ${escapeHtml(slide.button_primary_text || "")} → ${escapeHtml(slide.button_primary_link || "")}</p>
        <p><strong>Secondary:</strong> ${escapeHtml(slide.button_secondary_text || "")} → ${escapeHtml(slide.button_secondary_link || "")}</p>
        <p><strong>Sort Order:</strong> ${Number(slide.sort_order || 0)}</p>
        <p><strong>Status:</strong> ${slide.is_active ? "Active" : "Hidden"}</p>
        <div class="admin-inline-actions">
          <button type="button" data-action="edit-slide" data-id="${slide.id}">Edit</button>
          <button type="button" data-action="delete-slide" data-id="${slide.id}">Delete</button>
        </div>
      </div>
    `;
    homepageSlidesList.appendChild(card);
  });

  homepageSlidesList.querySelectorAll("[data-action='edit-slide']").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await fetch("/api/admin/homepage", { headers: authHeaders() });
      const data = await response.json();
      const slide = (data.slides || []).find((item) => Number(item.id) === Number(button.dataset.id));
      if (!slide) return;

      slideIdInput.value = slide.id;
      slideTitleInput.value = slide.title || "";
      slideSubtitleInput.value = slide.subtitle || "";
      slideImageUrlInput.value = slide.image_url || "";
      slidePrimaryTextInput.value = slide.button_primary_text || "Buy Now";
      slidePrimaryLinkInput.value = slide.button_primary_link || "#products";
      slideSecondaryTextInput.value = slide.button_secondary_text || "Learn More";
      slideSecondaryLinkInput.value = slide.button_secondary_link || "#about";
      slideSortOrderInput.value = String(slide.sort_order ?? 0);
      slideIsActiveInput.checked = Boolean(slide.is_active);

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  homepageSlidesList.querySelectorAll("[data-action='delete-slide']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this homepage slide?")) return;

      const response = await fetch("/api/delete-homepage-slide", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: Number(button.dataset.id) })
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Failed to delete homepage slide");
        return;
      }

      await loadHomepageAdmin();
      resetSlideForm();
    });
  });
}

function openSlideImageOverlay(imageUrl, imageTitle) {
  if (!slideImageOverlay || !slideImageOverlayImg || !imageUrl) return;

  slideImageOverlayImg.src = imageUrl;
  slideImageOverlayImg.alt = imageTitle || "Homepage slide preview";
  slideImageOverlay.classList.add("is-open");
  slideImageOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSlideImageOverlay() {
  if (!slideImageOverlay || !slideImageOverlayImg) return;

  slideImageOverlay.classList.remove("is-open");
  slideImageOverlay.setAttribute("aria-hidden", "true");
  slideImageOverlayImg.src = "";
  slideImageOverlayImg.alt = "Homepage slide preview";
  document.body.style.overflow = "";
}

function renderSections(sections) {
  homepageSectionsList.innerHTML = "";

  if (!sections.length) {
    homepageSectionsList.innerHTML = `<p>No homepage sections yet.</p>`;
    return;
  }

  sections.forEach((section) => {
    const wrapper = document.createElement("form");
    wrapper.className = "admin-list-card section-card";
    wrapper.innerHTML = `
      <div class="section-card-head">
        <div>
          <div class="section-key-badge">${escapeHtml(section.section_key)}</div>
          <p class="section-card-copy">Control the public homepage text for this section.</p>
        </div>
      </div>
      <div class="section-card-fields">
        <div class="form-row">
          <label>Section Title</label>
          <input type="text" name="title" value="${escapeHtml(section.title || "")}">
        </div>

        <div class="form-row">
          <label>Section Body</label>
          <textarea name="body" rows="5">${escapeHtml(section.body || "")}</textarea>
        </div>

        <div class="form-row checkbox-row">
          <label>
            <input type="checkbox" name="is_active" ${section.is_active ? "checked" : ""}>
            Active
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="section-save-btn">Save Section</button>
        </div>
      </div>
    `;

    wrapper.addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        id: section.id,
        section_key: section.section_key,
        title: wrapper.querySelector("[name='title']").value.trim(),
        body: wrapper.querySelector("[name='body']").value.trim(),
        is_active: wrapper.querySelector("[name='is_active']").checked
      };

      const response = await fetch("/api/update-homepage-section", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Failed to update homepage section");
        return;
      }

      alert("Section updated.");
    });

    homepageSectionsList.appendChild(wrapper);
  });
}

uploadSlideImageBtn.addEventListener("click", async () => {
  const file = slideImageFileInput.files?.[0];
  if (!file) {
    alert("Please choose an image first.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("/api/upload-homepage-slide-image", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken
    },
    body: formData
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error || "Failed to upload image");
    return;
  }

  slideImageUrlInput.value = result.image_url || "";
  alert("Image uploaded successfully.");
});

slideForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    id: slideIdInput.value ? Number(slideIdInput.value) : undefined,
    title: slideTitleInput.value.trim(),
    subtitle: slideSubtitleInput.value.trim(),
    image_url: slideImageUrlInput.value.trim(),
    button_primary_text: slidePrimaryTextInput.value.trim(),
    button_primary_link: slidePrimaryLinkInput.value.trim(),
    button_secondary_text: slideSecondaryTextInput.value.trim(),
    button_secondary_link: slideSecondaryLinkInput.value.trim(),
    sort_order: Number(slideSortOrderInput.value || 0),
    is_active: slideIsActiveInput.checked
  };

  const endpoint = payload.id ? "/api/update-homepage-slide" : "/api/add-homepage-slide";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error || "Failed to save slide");
    return;
  }

  resetSlideForm();
  await loadHomepageAdmin();
});

resetSlideBtn.addEventListener("click", resetSlideForm);

homepageSlidesList?.addEventListener("click", (event) => {
  const previewImg = event.target.closest("img[data-action='preview-slide-image']");
  if (previewImg) {
    openSlideImageOverlay(previewImg.dataset.imageUrl, previewImg.dataset.imageTitle);
  }
});

slideImageOverlayClose?.addEventListener("click", closeSlideImageOverlay);
slideImageOverlay?.addEventListener("click", (event) => {
  if (event.target === slideImageOverlay) {
    closeSlideImageOverlay();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && slideImageOverlay?.classList.contains("is-open")) {
    closeSlideImageOverlay();
  }
});

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("adminToken");
  window.location.href = "admin-login.html";
});

loadHomepageAdmin();
