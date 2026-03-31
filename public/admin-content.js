const adminToken = localStorage.getItem("adminToken");
if (!adminToken) {
  window.location.href = "admin-login.html";
}

function authHeaders(extra = {}) {
  return { "x-admin-token": adminToken, ...extra };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const testimonialForm = document.getElementById("testimonialForm");
const faqForm = document.getElementById("faqForm");
const settingsForm = document.getElementById("settingsForm");
const shoppingHighlightsForm = document.getElementById("shoppingHighlightsForm");
const bestSellersForm = document.getElementById("bestSellersForm");
const shoppingPageContentForm = document.getElementById("shoppingPageContentForm");
const testimonialsList = document.getElementById("testimonialsList");
const faqList = document.getElementById("faqList");

let availableProducts = [];
let testimonialItems = [];
let faqItemsState = [];

const shoppingHighlightSlotConfig = [
  { slot: 1, productId: "shoppingFeaturedSlot1Product", labelId: "shoppingFeaturedSlot1Label" },
  { slot: 2, productId: "shoppingFeaturedSlot2Product", labelId: "shoppingFeaturedSlot2Label" },
  { slot: 3, productId: "shoppingFeaturedSlot3Product", labelId: "shoppingFeaturedSlot3Label" }
];

const bestSellerSlotConfig = [
  { slot: 1, productId: "bestSellerSlot1Product", labelId: "bestSellerSlot1Label" },
  { slot: 2, productId: "bestSellerSlot2Product", labelId: "bestSellerSlot2Label" },
  { slot: 3, productId: "bestSellerSlot3Product", labelId: "bestSellerSlot3Label" }
];

function defaultShoppingHighlightLabel(slot) {
  if (slot === 1) return "Limited Time";
  if (slot === 2) return "Customer Favourite";
  return "Best Value";
}

function defaultBestSellerLabel(slot) {
  if (slot === 1) return "Best Seller";
  if (slot === 2) return "Most Loved";
  return "Top Pick";
}

function resetTestimonialForm() {
  document.getElementById("testimonialId").value = "";
  document.getElementById("testimonialQuote").value = "";
  document.getElementById("testimonialAuthor").value = "";
  document.getElementById("testimonialRole").value = "";
  document.getElementById("testimonialSortOrder").value = "0";
  document.getElementById("testimonialIsActive").checked = true;
}

function resetFaqForm() {
  document.getElementById("faqId").value = "";
  document.getElementById("faqQuestion").value = "";
  document.getElementById("faqAnswer").value = "";
  document.getElementById("faqSortOrder").value = "0";
  document.getElementById("faqIsActive").checked = true;
}

function populateShoppingHighlightProductOptions() {
  const options = [
    `<option value="">Select a product</option>`,
    ...availableProducts.map((product) => (
      `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name || `Product #${product.id}`)}</option>`
    ))
  ].join("");

  shoppingHighlightSlotConfig.forEach(({ productId }) => {
    const select = document.getElementById(productId);
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = options;
    if (currentValue) {
      select.value = currentValue;
    }
  });

  bestSellerSlotConfig.forEach(({ productId }) => {
    const select = document.getElementById(productId);
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = options;
    if (currentValue) {
      select.value = currentValue;
    }
  });
}

async function loadSiteContentAdmin() {
  const [contentResponse, productsResponse] = await Promise.all([
    fetch("/api/admin/site-content", { headers: authHeaders() }),
    fetch("/api/products", { headers: authHeaders() })
  ]);

  const data = await contentResponse.json();
  const productsData = await productsResponse.json();

  if (!contentResponse.ok) {
    alert(data.error || "Failed to load site content");
    return;
  }

  availableProducts = Array.isArray(productsData) ? productsData : [];
  populateShoppingHighlightProductOptions();

  testimonialItems = Array.isArray(data.testimonials) ? data.testimonials : [];
  faqItemsState = Array.isArray(data.faq_items) ? data.faq_items : [];

  renderTestimonials(testimonialItems);
  renderFaq(faqItemsState);

  const settingsMap = Object.fromEntries((data.settings || []).map((item) => [item.setting_key, item.setting_value]));
  document.getElementById("contactEmail").value = settingsMap.contact_email || "";
  document.getElementById("contactPhone").value = settingsMap.contact_phone || "";
  document.getElementById("contactLocation").value = settingsMap.contact_location || "";
  document.getElementById("newsletterTitle").value = settingsMap.newsletter_title || "";
  document.getElementById("newsletterDesc").value = settingsMap.newsletter_desc || "";
  document.getElementById("footerCopy").value = settingsMap.footer_copy || "";
  document.getElementById("promoCodeActive").checked = String(settingsMap.promo_code_active || "").toLowerCase() === "true";
  document.getElementById("promoCodeValue").value = settingsMap.promo_code_value || "";
  document.getElementById("promoDiscountPercent").value = settingsMap.promo_discount_percent || "0";
  document.getElementById("shoppingFeaturedTitle").value = settingsMap.shopping_featured_title || "Customer Favourites";
  document.getElementById("shoppingFeaturedSubtitle").value = settingsMap.shopping_featured_subtitle || "Limited-time picks, top-loved products, and premium wellness essentials worth seeing first.";
  document.getElementById("bestSellerTitle").value = settingsMap.shopping_best_seller_title || "Best Sellers";
  document.getElementById("bestSellerSubtitle").value = settingsMap.shopping_best_seller_subtitle || "The three products shoppers reach for first, curated to stand out clearly.";
  document.getElementById("shoppingHeroTitleInput").value = settingsMap.shopping_hero_title || "Premium soy milk powder shopping with cleaner visuals and stronger product focus.";
  document.getElementById("shoppingHeroSubtitleInput").value = settingsMap.shopping_hero_subtitle || "Explore featured wellness blends, bundle-ready offers, and a quick-view flow that opens like a full product showcase instead of a small modal.";
  document.getElementById("shoppingCtaTitleInput").value = settingsMap.shopping_cta_title || "Ready to Checkout?";
  document.getElementById("shoppingCtaSubtitleInput").value = settingsMap.shopping_cta_subtitle || "Review your cart and complete your order securely.";
  document.getElementById("shoppingCtaButtonTextInput").value = settingsMap.shopping_cta_button_text || "Go to Checkout";

  shoppingHighlightSlotConfig.forEach(({ slot, productId, labelId }) => {
    document.getElementById(productId).value = settingsMap[`shopping_featured_slot_${slot}_product_id`] || "";
    document.getElementById(labelId).value = settingsMap[`shopping_featured_slot_${slot}_label`] || defaultShoppingHighlightLabel(slot);
  });

  bestSellerSlotConfig.forEach(({ slot, productId, labelId }) => {
    document.getElementById(productId).value = settingsMap[`shopping_best_seller_slot_${slot}_product_id`] || "";
    document.getElementById(labelId).value = settingsMap[`shopping_best_seller_slot_${slot}_label`] || defaultBestSellerLabel(slot);
  });
}

function renderTestimonials(items) {
  testimonialsList.innerHTML = items.length
    ? items.map((item) => `
      <div class="gallery-item-card">
        <div class="gallery-item-card-body">
          <h3>${escapeHtml(item.author_name || "Unnamed")}</h3>
          <p>${escapeHtml(item.quote || "")}</p>
          <div class="meta-row">
            <span class="meta-pill">${escapeHtml(item.author_role || "No role")}</span>
            <span class="meta-pill">Sort: ${Number(item.sort_order || 0)}</span>
            <span class="meta-pill ${item.is_active ? "active" : "hidden"}">${item.is_active ? "Active" : "Hidden"}</span>
          </div>
          <div class="inline-actions">
            <button type="button" class="secondary-btn js-edit-testimonial" data-id="${escapeHtml(item.id)}">Edit</button>
            <button type="button" class="secondary-btn js-delete-testimonial" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      </div>
    `).join("")
    : `<p class="empty-state">No testimonials yet.</p>`;
}

function renderFaq(items) {
  faqList.innerHTML = items.length
    ? items.map((item) => `
      <div class="gallery-item-card">
        <div class="gallery-item-card-body">
          <h3>${escapeHtml(item.question || "Untitled")}</h3>
          <p>${escapeHtml(item.answer || "")}</p>
          <div class="meta-row">
            <span class="meta-pill">Sort: ${Number(item.sort_order || 0)}</span>
            <span class="meta-pill ${item.is_active ? "active" : "hidden"}">${item.is_active ? "Active" : "Hidden"}</span>
          </div>
          <div class="inline-actions">
            <button type="button" class="secondary-btn js-edit-faq" data-id="${escapeHtml(item.id)}">Edit</button>
            <button type="button" class="secondary-btn js-delete-faq" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      </div>
    `).join("")
    : `<p class="empty-state">No FAQ items yet.</p>`;
}

function editTestimonial(item) {
  document.getElementById("testimonialId").value = item.id;
  document.getElementById("testimonialQuote").value = item.quote || "";
  document.getElementById("testimonialAuthor").value = item.author_name || "";
  document.getElementById("testimonialRole").value = item.author_role || "";
  document.getElementById("testimonialSortOrder").value = String(item.sort_order ?? 0);
  document.getElementById("testimonialIsActive").checked = Boolean(item.is_active);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editFaq(item) {
  document.getElementById("faqId").value = item.id;
  document.getElementById("faqQuestion").value = item.question || "";
  document.getElementById("faqAnswer").value = item.answer || "";
  document.getElementById("faqSortOrder").value = String(item.sort_order ?? 0);
  document.getElementById("faqIsActive").checked = Boolean(item.is_active);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTestimonial(id) {
  if (!confirm("Delete this testimonial?")) return;
  const response = await fetch("/api/delete-testimonial", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id })
  });
  const result = await response.json();
  if (!response.ok) return alert(result.error || "Failed to delete testimonial");
  loadSiteContentAdmin();
}

async function deleteFaq(id) {
  if (!confirm("Delete this FAQ item?")) return;
  const response = await fetch("/api/delete-faq-item", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id })
  });
  const result = await response.json();
  if (!response.ok) return alert(result.error || "Failed to delete FAQ");
  loadSiteContentAdmin();
}

testimonialForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    id: document.getElementById("testimonialId").value ? Number(document.getElementById("testimonialId").value) : undefined,
    quote: document.getElementById("testimonialQuote").value.trim(),
    author_name: document.getElementById("testimonialAuthor").value.trim(),
    author_role: document.getElementById("testimonialRole").value.trim(),
    sort_order: Number(document.getElementById("testimonialSortOrder").value || 0),
    is_active: document.getElementById("testimonialIsActive").checked
  };

  const endpoint = payload.id ? "/api/update-testimonial" : "/api/add-testimonial";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) return alert(result.error || "Failed to save testimonial");

  resetTestimonialForm();
  loadSiteContentAdmin();
});

faqForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    id: document.getElementById("faqId").value ? Number(document.getElementById("faqId").value) : undefined,
    question: document.getElementById("faqQuestion").value.trim(),
    answer: document.getElementById("faqAnswer").value.trim(),
    sort_order: Number(document.getElementById("faqSortOrder").value || 0),
    is_active: document.getElementById("faqIsActive").checked
  };

  const endpoint = payload.id ? "/api/update-faq-item" : "/api/add-faq-item";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) return alert(result.error || "Failed to save FAQ");

  resetFaqForm();
  loadSiteContentAdmin();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = [
    ["contact_email", document.getElementById("contactEmail").value.trim()],
    ["contact_phone", document.getElementById("contactPhone").value.trim()],
    ["contact_location", document.getElementById("contactLocation").value.trim()],
    ["newsletter_title", document.getElementById("newsletterTitle").value.trim()],
    ["newsletter_desc", document.getElementById("newsletterDesc").value.trim()],
    ["footer_copy", document.getElementById("footerCopy").value.trim()],
    ["promo_code_active", document.getElementById("promoCodeActive").checked ? "true" : "false"],
    ["promo_code_value", document.getElementById("promoCodeValue").value.trim().toUpperCase()],
    ["promo_discount_percent", document.getElementById("promoDiscountPercent").value.trim() || "0"]
  ];

  for (const [setting_key, setting_value] of settings) {
    const response = await fetch("/api/update-site-setting", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ setting_key, setting_value })
    });
    const result = await response.json();
    if (!response.ok) return alert(result.error || `Failed to save ${setting_key}`);
  }

  alert("Settings updated.");
});

shoppingHighlightsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = [
    ["shopping_featured_title", document.getElementById("shoppingFeaturedTitle").value.trim()],
    ["shopping_featured_subtitle", document.getElementById("shoppingFeaturedSubtitle").value.trim()]
  ];

  shoppingHighlightSlotConfig.forEach(({ slot, productId, labelId }) => {
    settings.push([`shopping_featured_slot_${slot}_product_id`, document.getElementById(productId).value.trim()]);
    settings.push([`shopping_featured_slot_${slot}_label`, document.getElementById(labelId).value.trim() || defaultShoppingHighlightLabel(slot)]);
  });

  for (const [setting_key, setting_value] of settings) {
    const response = await fetch("/api/update-site-setting", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ setting_key, setting_value })
    });
    const result = await response.json();
    if (!response.ok) return alert(result.error || `Failed to save ${setting_key}`);
  }

  alert("Shopping highlights updated.");
});

bestSellersForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = [
    ["shopping_best_seller_title", document.getElementById("bestSellerTitle").value.trim()],
    ["shopping_best_seller_subtitle", document.getElementById("bestSellerSubtitle").value.trim()]
  ];

  bestSellerSlotConfig.forEach(({ slot, productId, labelId }) => {
    settings.push([`shopping_best_seller_slot_${slot}_product_id`, document.getElementById(productId).value.trim()]);
    settings.push([`shopping_best_seller_slot_${slot}_label`, document.getElementById(labelId).value.trim() || defaultBestSellerLabel(slot)]);
  });

  for (const [setting_key, setting_value] of settings) {
    const response = await fetch("/api/update-site-setting", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ setting_key, setting_value })
    });
    const result = await response.json();
    if (!response.ok) return alert(result.error || `Failed to save ${setting_key}`);
  }

  alert("Best sellers updated.");
});

shoppingPageContentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = [
    ["shopping_hero_title", document.getElementById("shoppingHeroTitleInput").value.trim()],
    ["shopping_hero_subtitle", document.getElementById("shoppingHeroSubtitleInput").value.trim()],
    ["shopping_cta_title", document.getElementById("shoppingCtaTitleInput").value.trim()],
    ["shopping_cta_subtitle", document.getElementById("shoppingCtaSubtitleInput").value.trim()],
    ["shopping_cta_button_text", document.getElementById("shoppingCtaButtonTextInput").value.trim()]
  ];

  for (const [setting_key, setting_value] of settings) {
    const response = await fetch("/api/update-site-setting", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ setting_key, setting_value })
    });
    const result = await response.json();
    if (!response.ok) return alert(result.error || `Failed to save ${setting_key}`);
  }

  alert("Shopping page hero and CTA updated.");
});

document.getElementById("resetTestimonialBtn").addEventListener("click", resetTestimonialForm);
document.getElementById("resetFaqBtn").addEventListener("click", resetFaqForm);
const logoutHandler = () => {
  localStorage.removeItem("adminToken");
  window.location.href = "admin-login.html";
};
document.getElementById("logoutBtn")?.addEventListener("click", logoutHandler);
document.getElementById("logoutBtnTop")?.addEventListener("click", logoutHandler);

document.addEventListener("click", (event) => {
  const editTestimonialBtn = event.target.closest(".js-edit-testimonial");
  if (editTestimonialBtn) {
    const id = Number(editTestimonialBtn.dataset.id);
    const item = testimonialItems.find((entry) => Number(entry.id) === id);
    if (item) {
      editTestimonial(item);
    }
    return;
  }

  const deleteTestimonialBtn = event.target.closest(".js-delete-testimonial");
  if (deleteTestimonialBtn) {
    const id = Number(deleteTestimonialBtn.dataset.id);
    if (id) {
      deleteTestimonial(id);
    }
    return;
  }

  const editFaqBtn = event.target.closest(".js-edit-faq");
  if (editFaqBtn) {
    const id = Number(editFaqBtn.dataset.id);
    const item = faqItemsState.find((entry) => Number(entry.id) === id);
    if (item) {
      editFaq(item);
    }
    return;
  }

  const deleteFaqBtn = event.target.closest(".js-delete-faq");
  if (deleteFaqBtn) {
    const id = Number(deleteFaqBtn.dataset.id);
    if (id) {
      deleteFaq(id);
    }
  }
});

loadSiteContentAdmin();
