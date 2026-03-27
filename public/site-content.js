function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeProductImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "photos/New_Theme Good Logo-02.png";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("public/")) return `/${raw.slice("public/".length)}`;
  if (raw.startsWith("uploads/") || raw.startsWith("photos/")) return `/${raw}`;
  return `/${raw}`;
}

function resolveProductImage(product, imagesByProductId = {}) {
  const images = Array.isArray(imagesByProductId[String(product?.id)])
    ? imagesByProductId[String(product.id)]
    : Array.isArray(product?.images)
      ? product.images
      : [];

  const primary = images.find((img) => img && img.is_primary) || images[0] || null;

  return normalizeProductImageUrl(
    primary?.image_url ||
    product?.primary_image ||
    product?.image_url ||
    "/uploads/sample-product.webp"
  );
}

function getProductStartingPrice(product) {
  const rawValue = product?.size_price_small;
  if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "") {
    const sizePrice = Number(rawValue);
    if (Number.isFinite(sizePrice) && sizePrice >= 0) {
      return sizePrice;
    }
  }
  return Number(product?.price || 0);
}

function applyImageFallback(root = document) {
  root.querySelectorAll("img[data-fallback-src]").forEach((img) => {
    if (img.dataset.fallbackBound === "true") return;
    img.dataset.fallbackBound = "true";
    img.addEventListener("error", () => {
      const fallbackSrc = img.dataset.fallbackSrc || "/uploads/177422878655-Pomegranate-300g.webp";
      if (img.dataset.fallbackApplied === "true") return;
      img.dataset.fallbackApplied = "true";
      img.src = fallbackSrc;
    });
  });
}

function bindShoppingFeatureModalTriggers(root) {
  if (!root || root.dataset.modalTriggerBound === "true") return;
  root.dataset.modalTriggerBound = "true";
  root.addEventListener("click", (event) => {
    const trigger = event.target.closest(".shopping-featured-card, .shopping-featured-image-link, .shopping-featured-btn");
    if (!trigger) return;

    event.preventDefault();
    const featureCard = event.target.closest(".shopping-featured-card");
    const productId = String(featureCard?.dataset.productId || "").trim();
    if (!productId) return;

    const selector = `#products .product-card[data-id="${CSS.escape(productId)}"]`;
    const productCard = document.querySelector(selector);
    if (productCard) {
      productCard.click();
      return;
    }

    window.location.href = `shopping-details.html?id=${encodeURIComponent(productId)}`;
  });
}

async function renderShoppingHighlights(settings) {
  const section = document.getElementById("shoppingFeaturedSection");
  const grid = document.getElementById("shoppingFeaturedGrid");
  const title = document.getElementById("shoppingFeaturedTitle");
  const subtitle = document.getElementById("shoppingFeaturedSubtitle");

  if (!section || !grid) return;

  if (title) {
    title.textContent = settings.shopping_featured_title || "Customer Favourites";
  }

  if (subtitle) {
    subtitle.textContent = settings.shopping_featured_subtitle || "Limited-time picks, top-loved products, and premium wellness essentials worth seeing first.";
  }

  try {
    const [productsRes, imagesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/product-images")
    ]);
    const products = await productsRes.json();
    const imagesPayload = await imagesRes.json();
    if (!productsRes.ok) throw new Error(products.error || "Failed to load products");
    if (!imagesRes.ok) throw new Error(imagesPayload.error || "Failed to load product images");

    const imagesByProductId =
      imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
        ? imagesPayload.byProductId
        : {};

    const productMap = new Map((Array.isArray(products) ? products : []).map((product) => [String(product.id), product]));
    const slots = [1, 2, 3]
      .map((slot) => {
        const productId = String(settings[`shopping_featured_slot_${slot}_product_id`] || "");
        const product = productMap.get(productId);
        if (!product) return null;
        return {
          product,
          label: settings[`shopping_featured_slot_${slot}_label`] || (slot === 1 ? "Limited Time" : slot === 2 ? "Customer Favourite" : "Best Value")
        };
      })
      .filter(Boolean);

    if (!slots.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "";
    grid.innerHTML = slots.map(({ product, label }) => `
      <article class="shopping-featured-card" data-product-id="${escapeHtml(String(product.id || ""))}">
        <span class="shopping-featured-label">${escapeHtml(label)}</span>
        <a class="shopping-featured-image-link" href="#">
          <img src="${escapeHtml(resolveProductImage(product, imagesByProductId))}" alt="${escapeHtml(product.name || "Featured product")}" data-fallback-src="/uploads/sample-product.webp">
        </a>
        <div class="shopping-featured-body">
          <h3>${escapeHtml(product.name || "ThemeGood Product")}</h3>
          <p>${escapeHtml(product.description || "Premium wellness support, selected to stand out first on the shopping page.")}</p>
          <div class="shopping-featured-meta">
            <strong>RM ${getProductStartingPrice(product).toFixed(2)}</strong>
            <span>${Number(product.stock || 0) > 0 ? "Ready to order" : "Out of stock"}</span>
          </div>
          <a class="btn shopping-featured-btn" href="#">View Product</a>
        </div>
      </article>
    `).join("");
    bindShoppingFeatureModalTriggers(grid);
    applyImageFallback(grid);
  } catch (error) {
    console.error("Failed to load shopping highlights:", error);
    section.style.display = "none";
  }
}

async function renderBestSellers(settings) {
  const section = document.getElementById("shoppingBestSellerSection");
  const grid = document.getElementById("shoppingBestSellerGrid");
  const title = document.getElementById("shoppingBestSellerTitle");
  const subtitle = document.getElementById("shoppingBestSellerSubtitle");

  if (!section || !grid) return;

  if (title) {
    title.textContent = settings.shopping_best_seller_title || "Best Sellers";
  }

  if (subtitle) {
    subtitle.textContent = settings.shopping_best_seller_subtitle || "The three products shoppers reach for first, curated to stand out clearly.";
  }

  try {
    const [productsRes, imagesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/product-images")
    ]);
    const products = await productsRes.json();
    const imagesPayload = await imagesRes.json();
    if (!productsRes.ok) throw new Error(products.error || "Failed to load products");
    if (!imagesRes.ok) throw new Error(imagesPayload.error || "Failed to load product images");

    const imagesByProductId =
      imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
        ? imagesPayload.byProductId
        : {};

    const productMap = new Map((Array.isArray(products) ? products : []).map((product) => [String(product.id), product]));
    const slots = [1, 2, 3]
      .map((slot) => {
        const productId = String(settings[`shopping_best_seller_slot_${slot}_product_id`] || "");
        const product = productMap.get(productId);
        if (!product) return null;
        return {
          product,
          label: settings[`shopping_best_seller_slot_${slot}_label`] || (slot === 1 ? "Best Seller" : slot === 2 ? "Most Loved" : "Top Pick")
        };
      })
      .filter(Boolean);

    if (!slots.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "";
    grid.innerHTML = slots.map(({ product, label }) => `
      <article class="shopping-featured-card" data-product-id="${escapeHtml(String(product.id || ""))}">
        <span class="shopping-featured-label">${escapeHtml(label)}</span>
        <a class="shopping-featured-image-link" href="#">
          <img src="${escapeHtml(resolveProductImage(product, imagesByProductId))}" alt="${escapeHtml(product.name || "Best seller product")}" data-fallback-src="/uploads/sample-product.webp">
        </a>
        <div class="shopping-featured-body">
          <h3>${escapeHtml(product.name || "ThemeGood Product")}</h3>
          <p>${escapeHtml(product.description || "A standout product selected to be seen first on the shopping page.")}</p>
          <div class="shopping-featured-meta">
            <strong>RM ${getProductStartingPrice(product).toFixed(2)}</strong>
            <span>${Number(product.stock || 0) > 0 ? "Ready to order" : "Out of stock"}</span>
          </div>
          <a class="btn shopping-featured-btn" href="#">View Product</a>
        </div>
      </article>
    `).join("");
    bindShoppingFeatureModalTriggers(grid);
    applyImageFallback(grid);
  } catch (error) {
    console.error("Failed to load best sellers:", error);
    section.style.display = "none";
  }
}

async function loadSiteContent() {
  try {
    const response = await fetch("/api/site-content");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load site content");

    const testimonials = Array.isArray(payload.testimonials) ? payload.testimonials : [];
    const faqItems = Array.isArray(payload.faq_items) ? payload.faq_items : [];
    const settings = Object.fromEntries((payload.settings || []).map((item) => [item.setting_key, item.setting_value]));

    const testimonialsGrid = document.querySelector(".testimonials-grid");
    if (testimonialsGrid) {
      testimonialsGrid.innerHTML = testimonials.map((item) => `
        <article class="testimonial-card">
          <div class="testimonial-stars" aria-label="5 star rating">★★★★★</div>
          <p class="testimonial-copy">${item.quote || ""}</p>
          <div class="testimonial-author">
            <strong>${item.author_name || ""}</strong>
            <span>${item.author_role || ""}</span>
          </div>
        </article>
      `).join("");
    }

    const faqList = document.querySelector(".faq-list");
    if (faqList) {
      faqList.innerHTML = faqItems.map((item, index) => `
        <details class="faq-item" ${index === 0 ? "open" : ""}>
          <summary>${item.question || ""}</summary>
          <p>${item.answer || ""}</p>
        </details>
      `).join("");

      if (typeof window.initFaqToggleCards === "function") {
        window.initFaqToggleCards(faqList);
      }
    }

    const emailLink = document.querySelector("#contact .contact-info p:nth-of-type(1) a");
    const phoneLink = document.querySelector("#contact .contact-info p:nth-of-type(2) a");
    const locationLink = document.querySelector("#contact .contact-info p:nth-of-type(3) a");
    const newsletterTitle = document.querySelector(".newsletter h2");
    const newsletterDesc = document.querySelector(".newsletter p");
    const footerCopy = document.querySelector(".footer-bottom");

    if (emailLink && settings.contact_email) {
      emailLink.textContent = settings.contact_email;
      emailLink.href = `mailto:${settings.contact_email}`;
    }

    if (phoneLink && settings.contact_phone) {
      phoneLink.textContent = settings.contact_phone;
      phoneLink.href = `tel:${settings.contact_phone.replace(/\s+/g, "")}`;
    }

    if (locationLink && settings.contact_location) {
      locationLink.textContent = settings.contact_location;
    }

    if (newsletterTitle && settings.newsletter_title) {
      newsletterTitle.textContent = settings.newsletter_title;
    }

    if (newsletterDesc && settings.newsletter_desc) {
      newsletterDesc.textContent = settings.newsletter_desc;
    }

    if (footerCopy && settings.footer_copy) {
      footerCopy.textContent = settings.footer_copy;
    }

    await renderShoppingHighlights(settings);
    await renderBestSellers(settings);
  } catch (error) {
    console.error("Failed to load site content:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadSiteContent);
