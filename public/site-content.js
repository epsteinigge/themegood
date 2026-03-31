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

function resolveSettingText(settings, settingKey, translationKey, fallbackText = "") {
  const raw = String(settings?.[settingKey] || "").trim();
  const normalized = raw.replace(/^['"]+|['"]+$/g, "").trim();
  const looksLikeKey =
    normalized === translationKey ||
    /^[a-z0-9._-]+$/i.test(normalized);

  if (!normalized || looksLikeKey) {
    if (typeof window.__themegoodT === "function") {
      if (looksLikeKey) {
        const direct = window.__themegoodT(normalized);
        if (direct && direct !== normalized) return direct;
      }

      const translated = window.__themegoodT(translationKey);
      if (translated && translated !== translationKey) return translated;
    }
    return fallbackText;
  }

  return normalized;
}

let siteTestimonials = [];
let siteFaqItems = [];
let siteSettings = {};
let shoppingCatalogPromise = null;

function getSiteTranslator() {
  return typeof window.__themegoodT === "function" ? window.__themegoodT : null;
}

function getSiteLang() {
  return String(window.__themegoodLang || "en").trim().toLowerCase() || "en";
}

function safeTranslatedValue(t, key, fallback = "") {
  if (typeof t !== "function") return fallback || "";
  const translated = t(key);
  if (!translated) return fallback || "";
  if (translated === key) return fallback || "";
  return translated;
}

function getLocalizedSettingText(settings, settingKey, translationKey, fallbackText = "") {
  const lang = getSiteLang();
  const t = getSiteTranslator();
  const raw = String(settings?.[settingKey] || "").trim();

  if (lang !== "en" && typeof t === "function") {
    const translated = safeTranslatedValue(t, translationKey, "");
    if (translated) return translated;
  }

  if (raw) return raw;
  if (typeof t === "function") return safeTranslatedValue(t, translationKey, fallbackText);
  return fallbackText;
}

function applyLocalizedStaticSettings(settings) {
  const newsletterTitle = document.querySelector(".newsletter-shell h2");
  const newsletterDesc = document.querySelector(".newsletter-shell p:not(.section-kicker)");
  const footerCopy = document.querySelector(".footer-bottom");

  if (newsletterTitle) {
    newsletterTitle.textContent = getLocalizedSettingText(
      settings,
      "newsletter_title",
      "newsletter_title",
      "Subscribe to Our Newsletter"
    );
  }

  if (newsletterDesc) {
    newsletterDesc.textContent = getLocalizedSettingText(
      settings,
      "newsletter_desc",
      "newsletter_desc",
      "Get updates about new wellness products and special offers."
    );
  }

  if (footerCopy) {
    footerCopy.textContent = resolveSettingText(
      settings,
      "footer_copy",
      "footer_copy",
      "\u00a9 2026 Theme Good Marketing. All Rights Reserved."
    );
  }
}

function localizeDynamicFaqText(lang, question, answer) {
  const q = String(question || "").trim();
  const a = String(answer || "").trim();
  if (!q) return { question: q, answer: a };
  const normalizeFaqToken = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizedQ = normalizeFaqToken(q);
  const normalizedA = normalizeFaqToken(a);

  if (lang === "zh") {
    const zhMap = [
      {
        qEn: "do you offer nationwide delivery",
        aEn: "yes we provide nationwide delivery across malaysia delivery times may vary based on your location and current courier schedules",
        q: "你们提供全国配送吗？",
        a: "是的，我们提供马来西亚全国配送。配送时效会根据您所在地区与物流安排而有所不同。"
      },
      {
        qEn: "how can i track my order",
        aEn: "after your order is confirmed you can track your order status via the track order page or the update link provided",
        q: "我该如何追踪我的订单？",
        a: "订单确认后，您可以通过订单追踪页面或我们提供的更新链接查看订单状态。"
      },
      {
        qEn: "what is your return policy",
        aEn: "returns may be considered in specific cases subject to the stated terms please contact our team for further review",
        q: "你们的退货政策是什么？",
        a: "在符合相关条件的情况下可申请退货。请联系团队，我们会根据具体情况协助处理。"
      },
      {
        qEn: "what if my item arrives damaged",
        aEn: "if your item arrives damaged please contact us as soon as possible with photo proof so we can assist with followup action",
        q: "如果我收到的商品有损坏怎么办？",
        a: "若商品到货时有损坏，请尽快联系并提供照片凭证，我们会协助您进行后续处理。"
      },
      {
        qEn: "how can i contact themegood",
        aEn: "you can contact us via whatsapp email or themegoods official social channels for any enquiries",
        q: "我该如何联系 ThemeGood？",
        a: "您可以通过 WhatsApp、电子邮件或 ThemeGood 官方社交平台联系我们。"
      },
      {
        qEn: "do you offer custom or bulk orders",
        aEn: "yes we accept custom and bulk orders please contact our team to discuss quantity pricing and delivery arrangements",
        q: "你们接受定制或批发订单吗？",
        a: "是的，我们接受定制与批发订单。请联系团队洽谈数量、价格与配送安排。"
      }
    ];

    const matched = zhMap.find((row) =>
      normalizedQ === row.qEn ||
      normalizedQ === row.qEn.replace(/orders$/, "order") ||
      normalizedA === row.aEn
    );
    return matched ? { question: matched.q, answer: matched.a } : { question: q, answer: a };
  }

  if (lang === "ms") {
    const msMap = [
      {
        qEn: "do you offer nationwide delivery",
        aEn: "yes we provide nationwide delivery across malaysia delivery times may vary based on your location and current courier schedules",
        q: "Adakah anda menawarkan penghantaran ke seluruh negara?",
        a: "Ya, kami menyediakan penghantaran ke seluruh Malaysia. Tempoh penghantaran bergantung pada lokasi anda dan jadual kurier semasa."
      },
      {
        qEn: "how can i track my order",
        aEn: "after your order is confirmed you can track your order status via the track order page or the update link provided",
        q: "Bagaimana saya boleh menjejak pesanan saya?",
        a: "Selepas pesanan disahkan, anda boleh menjejak status pesanan melalui halaman jejak pesanan atau pautan kemas kini yang diberikan."
      },
      {
        qEn: "what is your return policy",
        aEn: "returns may be considered in specific cases subject to the stated terms please contact our team for further review",
        q: "Apakah polisi pemulangan anda?",
        a: "Pemulangan boleh dipertimbangkan untuk kes tertentu mengikut syarat yang ditetapkan. Sila hubungi pasukan kami untuk semakan lanjut."
      },
      {
        qEn: "what if my item arrives damaged",
        aEn: "if your item arrives damaged please contact us as soon as possible with photo proof so we can assist with followup action",
        q: "Bagaimana jika item saya tiba dalam keadaan rosak?",
        a: "Jika item rosak semasa diterima, hubungi kami secepat mungkin dengan bukti bergambar supaya kami boleh bantu dengan tindakan susulan."
      },
      {
        qEn: "how can i contact themegood",
        aEn: "you can contact us via whatsapp email or themegoods official social channels for any enquiries",
        q: "Bagaimana saya boleh menghubungi ThemeGood?",
        a: "Anda boleh hubungi kami melalui WhatsApp, e-mel, atau saluran sosial rasmi ThemeGood untuk sebarang pertanyaan."
      },
      {
        qEn: "do you offer custom or bulk orders",
        aEn: "yes we accept custom and bulk orders please contact our team to discuss quantity pricing and delivery arrangements",
        q: "Adakah anda menerima pesanan khas atau pesanan borong?",
        a: "Ya, kami menerima pesanan khas dan borong. Sila hubungi pasukan kami untuk perbincangan kuantiti, harga, dan penghantaran."
      }
    ];

    const matched = msMap.find((row) =>
      normalizedQ === row.qEn ||
      normalizedQ === row.qEn.replace(/orders$/, "order") ||
      normalizedA === row.aEn
    );
    return matched ? { question: matched.q, answer: matched.a } : { question: q, answer: a };
  }

  return { question: q, answer: a };
}

async function loadShoppingCatalog() {
  if (!shoppingCatalogPromise) {
    shoppingCatalogPromise = Promise.all([
      fetch("/api/products"),
      fetch("/api/product-images")
    ]).then(async ([productsRes, imagesRes]) => {
      const products = await productsRes.json();
      const imagesPayload = await imagesRes.json();

      if (!productsRes.ok) {
        throw new Error(products.error || "Failed to load products");
      }

      if (!imagesRes.ok) {
        throw new Error(imagesPayload.error || "Failed to load product images");
      }

      const imagesByProductId =
        imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
          ? imagesPayload.byProductId
          : {};

      return {
        products: Array.isArray(products) ? products : [],
        imagesByProductId
      };
    }).catch((error) => {
      shoppingCatalogPromise = null;
      throw error;
    });
  }

  return shoppingCatalogPromise;
}

function renderLocalizedTestimonials(testimonials = []) {
  const testimonialsGrid = document.querySelector(".testimonials-grid");
  if (!testimonialsGrid) return;

  const t = getSiteTranslator();
  const lang = getSiteLang();

  testimonialsGrid.innerHTML = testimonials.map((item, index) => {
    const keyIndex = index + 1;
    const quote = lang === "en" || !t ? (item.quote || "") : safeTranslatedValue(t, `testimonial_quote_${keyIndex}`, item.quote || "");
    const authorName = lang === "en" || !t ? (item.author_name || "") : safeTranslatedValue(t, `testimonial_author_${keyIndex}`, item.author_name || "");
    const authorRole = lang === "en" || !t ? (item.author_role || "") : safeTranslatedValue(t, `testimonial_role_${keyIndex}`, item.author_role || "");

    return `
      <article class="testimonial-card">
        <div class="testimonial-stars" aria-label="5 star rating">★★★★★</div>
        <p class="testimonial-copy">${quote}</p>
        <div class="testimonial-author">
          <strong>${authorName}</strong>
          <span>${authorRole}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderLocalizedFaqItems(faqItems = []) {
  const faqList = document.querySelector(".faq-list");
  if (!faqList) return;

  const t = getSiteTranslator();
  const lang = getSiteLang();

  faqList.innerHTML = faqItems.map((item, index) => {
    const keyIndex = index + 1;
    const rawQuestion = lang === "en" || !t ? (item.question || "") : safeTranslatedValue(t, `faq_q${keyIndex}`, item.question || "");
    const rawAnswer = lang === "en" || !t ? (item.answer || "") : safeTranslatedValue(t, `faq_a${keyIndex}`, item.answer || "");
    const localizedFallback = localizeDynamicFaqText(lang, rawQuestion, rawAnswer);
    const question = localizedFallback.question;
    const answer = localizedFallback.answer;

    return `
      <details class="faq-item" ${index === 0 ? "open" : ""}>
        <summary>${question}</summary>
        <p>${answer}</p>
      </details>
    `;
  }).join("");

  if (typeof window.initFaqToggleCards === "function") {
    window.initFaqToggleCards(faqList);
  }
}

function resolveProductImage(product, imagesByProductId = {}) {
  const images = Array.isArray(imagesByProductId[String(product?.id)])
    ? imagesByProductId[String(product.id)]
    : Array.isArray(product?.images)
      ? product.images
      : [];

  const primary = images.find((img) => img && img.is_primary) || images[0] || null;
  const uploadedImage = normalizeProductImageUrl(primary?.image_url || "");
  if (uploadedImage && uploadedImage !== "photos/New_Theme Good Logo-02.png") {
    return uploadedImage;
  }

  const productImageMap = {
    "melon avocado": "/photos/Melon Avocado 800g.png",
    pomegranate: "/photos/Pomegranate 800g (1).png",
    bilberry: "/photos/Bilberry 800g.png",
    "passion fruit": "/photos/Passion Fruit 800g.png",
    "oat beta": "/photos/Oat Beta 800g (1).png",
    cocoa: "/photos/Cocoa800g.png"
  };
  const productName = String(product?.name || "").trim().toLowerCase();
  const mappedKey = Object.keys(productImageMap).find((key) => productName.includes(key));
  if (mappedKey) {
    return normalizeProductImageUrl(productImageMap[mappedKey]);
  }

  return normalizeProductImageUrl(
    product?.primary_image ||
    product?.image_url ||
    "/uploads/sample-product.webp"
  );
}

function getProductStartingPrice(product) {
  if (/cocoa/i.test(String(product?.name || "")) || Number(product?.id || 0) === 6) {
    return 72;
  }

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
  section.hidden = true;
  section.setAttribute("hidden", "");
  grid.innerHTML = "";

  if (title) {
    title.textContent = settings.shopping_featured_title || "Customer Favourites";
  }

  if (subtitle) {
    subtitle.textContent = settings.shopping_featured_subtitle || "Limited-time picks, top-loved products, and premium wellness essentials worth seeing first.";
  }

  try {
    const { products, imagesByProductId } = await loadShoppingCatalog();
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
      return;
    }

    section.hidden = false;
    section.removeAttribute("hidden");
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
  }
}

async function renderBestSellers(settings) {
  const section = document.getElementById("shoppingBestSellerSection");
  const grid = document.getElementById("shoppingBestSellerGrid");
  const title = document.getElementById("shoppingBestSellerTitle");
  const subtitle = document.getElementById("shoppingBestSellerSubtitle");

  if (!section || !grid) return;
  section.hidden = true;
  section.setAttribute("hidden", "");
  grid.innerHTML = "";

  if (title) {
    title.textContent = settings.shopping_best_seller_title || "Best Sellers";
  }

  if (subtitle) {
    subtitle.textContent = settings.shopping_best_seller_subtitle || "The three products shoppers reach for first, curated to stand out clearly.";
  }

  try {
    const { products, imagesByProductId } = await loadShoppingCatalog();
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
      return;
    }

    section.hidden = false;
    section.removeAttribute("hidden");
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
    siteSettings = settings;
    siteTestimonials = testimonials;
    siteFaqItems = faqItems;
    renderLocalizedTestimonials(siteTestimonials);
    renderLocalizedFaqItems(siteFaqItems);

    const testimonialsGrid = document.querySelector(".testimonials-grid");
    if (false && testimonialsGrid) {
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
    if (false && faqList) {
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

    applyLocalizedStaticSettings(settings);

    const shoppingHeroTitle = document.getElementById("shoppingHeroTitle");
    const shoppingHeroSubtitle = document.getElementById("shoppingHeroSubtitle");
    const shoppingCtaTitle = document.getElementById("shoppingCtaTitle");
    const shoppingCtaSubtitle = document.getElementById("shoppingCtaSubtitle");
    const shoppingCtaButton = document.getElementById("shoppingCtaButton");

    if (shoppingHeroTitle) {
      shoppingHeroTitle.textContent = resolveSettingText(
        settings,
        "shopping_hero_title",
        "shopping_hero_title_default",
        "Shopping"
      );
    }
    if (shoppingHeroSubtitle) {
      shoppingHeroSubtitle.textContent = resolveSettingText(
        settings,
        "shopping_hero_subtitle",
        "shopping_hero_subtitle_default",
        "Explore featured wellness blends, bundle-ready offers, and a quick-view flow that opens like a full product showcase."
      );
    }
    if (shoppingCtaTitle) {
      shoppingCtaTitle.textContent = resolveSettingText(
        settings,
        "shopping_cta_title",
        "shopping_cta_title_default",
        "Ready to Checkout?"
      );
    }
    if (shoppingCtaSubtitle) {
      shoppingCtaSubtitle.textContent = resolveSettingText(
        settings,
        "shopping_cta_subtitle",
        "shopping_cta_subtitle_default",
        "Review your cart and complete your order securely."
      );
    }
    if (shoppingCtaButton) {
      shoppingCtaButton.textContent = resolveSettingText(
        settings,
        "shopping_cta_button_text",
        "shopping_cta_button_text_default",
        "Go to Checkout"
      );
    }

    await renderShoppingHighlights(settings);
    await renderBestSellers(settings);
  } catch (error) {
    console.error("Failed to load site content:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadSiteContent);
document.addEventListener("themegood:langchange", () => {
  renderLocalizedTestimonials(siteTestimonials);
  renderLocalizedFaqItems(siteFaqItems);
  applyLocalizedStaticSettings(siteSettings);
});
