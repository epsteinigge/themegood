let allProducts = [];
let productImagesByProductId = {};
let productVariantsByProductId = {};
const SIZE_OPTIONS = [
  { id: "small", label: "300g" },
  { id: "medium", label: "600g" },
  { id: "large", label: "800g" }
];
const PRODUCT_SIZE_IMAGE_MAP = {
  "melon avocado": {
    small: "/photos/Melon Avocado 300g.png",
    medium: "/photos/Melon Avocado 600g.png",
    large: "/photos/Melon Avocado 800g.png"
  },
  pomegranate: {
    small: "/photos/Pomegranate 300g.png",
    medium: "/photos/Pomegranate 600g.png",
    large: "/photos/Pomegranate 800g (1).png"
  },
  bilberry: {
    small: "/photos/Bilberry 300g.png",
    medium: "/photos/Bilberry 600g.png",
    large: "/photos/Bilberry 800g.png"
  },
  "passion fruit": {
    small: "/photos/Passion Fruit 300g.png",
    medium: "/photos/Passion Fruit 600g.png",
    large: "/photos/Passion Fruit 800g.png"
  },
  "oat beta": {
    small: "/photos/Oat Beta 300g.png",
    medium: "/photos/Oat Beta 600g.png",
    large: "/photos/Oat Beta 800g (1).png"
  },
  cocoa: {
    small: "/photos/Cocoa 300g.png",
    large: "/photos/Cocoa800g.png"
  }
};

function getProductImageMapKey(productName = "") {
  const normalized = String(productName || "").trim().toLowerCase();
  if (!normalized) return "";
  return Object.keys(PRODUCT_SIZE_IMAGE_MAP).find((key) => normalized.includes(key)) || "";
}

function getMappedProductImage(product, preferredSize = "large") {
  const key = getProductImageMapKey(product?.name || "");
  if (!key) return "";
  return normalizeImageUrl(PRODUCT_SIZE_IMAGE_MAP[key]?.[preferredSize] || "");
}

function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("public/")) return `/${raw.slice("public".length)}`.replace(/\/{2,}/g, "/");
  return `/${raw.replace(/^\.?\//, "")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTranslator() {
  return typeof window.__themegoodT === "function"
    ? window.__themegoodT
    : (key, vars = {}) => String(key).replace(/\{(\w+)\}/g, (_, token) => (vars[token] ?? ""));
}

const SHOP_UI_COPY = {
  en: {
    all_packages: "All Packages",
    no_products_match_search: "No products match your search.",
    add_to_cart: "Add to Cart",
    out_of_stock: "Out of Stock",
    failed_to_load_products: "Failed to load products.",
    no_image_available: "No image available"
  },
  ms: {
    all_packages: "Semua Pakej",
    no_products_match_search: "Tiada produk sepadan dengan carian anda.",
    add_to_cart: "Tambah ke Troli",
    out_of_stock: "Stok Habis",
    failed_to_load_products: "Gagal memuatkan produk.",
    no_image_available: "Tiada imej tersedia"
  },
  zh: {
    all_packages: "\u6240\u6709\u5305\u88c5",
    no_products_match_search: "\u6ca1\u6709\u7b26\u5408\u60a8\u641c\u7d22\u6761\u4ef6\u7684\u4ea7\u54c1\u3002",
    add_to_cart: "\u52a0\u5165\u8d2d\u7269\u8f66",
    out_of_stock: "\u7f3a\u8d27",
    failed_to_load_products: "\u52a0\u8f7d\u4ea7\u54c1\u5931\u8d25\u3002",
    no_image_available: "\u6682\u65e0\u56fe\u7247"
  }
};

function getCurrentLang() {
  const selected = String(window.__themegoodLang || localStorage.getItem("site_lang") || "en").toLowerCase();
  return SHOP_UI_COPY[selected] ? selected : "en";
}

function getUiText(key, vars = {}) {
  const t = getTranslator();
  const translated = t(key, vars);
  if (translated && translated !== key) return translated;
  const lang = getCurrentLang();
  const fallback = SHOP_UI_COPY[lang]?.[key] ?? SHOP_UI_COPY.en[key] ?? key;
  return String(fallback).replace(/\{(\w+)\}/g, (_, token) => (vars[token] ?? ""));
}

function getProductTranslationKeys(productName = "") {
  const normalized = String(productName || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("pomegranate")) {
    return { name: "name_pomegranate", desc: "desc_pomegranate" };
  }
  if (normalized.includes("bilberry")) {
    return { name: "name_bilberry", desc: "desc_bilberry" };
  }
  if (normalized.includes("melon avocado")) {
    return { name: "name_melon", desc: "desc_melon" };
  }
  if (normalized.includes("passion")) {
    return { name: "name_passion", desc: "desc_passion" };
  }
  if (normalized.includes("oat beta")) {
    return { name: "name_oat", desc: "desc_oat" };
  }
  if (normalized.includes("cocoa")) {
    return { name: "name_cocoa", desc: "desc_cocoa" };
  }

  return null;
}

function getTranslatedProductContent(product) {
  const fallbackName = String(product?.name || "").trim() || "ThemeGood Product";
  const fallbackDescription = String(product?.description || "").trim() || "Product details coming soon.";
  const keys = getProductTranslationKeys(fallbackName);
  const t = getTranslator();

  if (!keys) {
    return {
      name: fallbackName,
      description: fallbackDescription
    };
  }

  return {
    name: t(keys.name) || fallbackName,
    description: t(keys.desc) || fallbackDescription
  };
}

function resolveProductImage(product, imagesByProductId = {}) {
  const images = Array.isArray(imagesByProductId[String(product?.id)])
    ? imagesByProductId[String(product.id)]
    : Array.isArray(product?.images)
      ? product.images
      : [];

  const primary = images.find((img) => img && img.is_primary) || images[0] || null;
  const uploadedImage = normalizeImageUrl(primary?.image_url || "");
  if (uploadedImage) {
    return uploadedImage;
  }

  const variants = getVariantsForProduct(product?.id);
  const firstVariantImage = normalizeImageUrl(
    variants.find((variant) => String(variant?.image_url || "").trim())?.image_url || ""
  );
  if (firstVariantImage) {
    return firstVariantImage;
  }

  const mappedLargeImage = getMappedProductImage(product, "large");
  if (mappedLargeImage) return mappedLargeImage;

  return normalizeImageUrl(
    product?.primary_image ||
    product?.image_url ||
    "/uploads/sample-product.webp"
  );
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

function getRenderContainer() {
  return document.getElementById("products-grid") || document.getElementById("productGrid") || document.getElementById("productList");
}

function getSearchQuery() {
  const input = document.getElementById("productSearchInput");
  return (input?.value || "").trim().toLowerCase();
}

function getSelectedSizeFilter() {
  return (document.getElementById("productSizeFilter")?.value || "").trim().toLowerCase();
}

function getSelectedPackageFilter() {
  return (document.getElementById("productPackageFilter")?.value || "").trim().toLowerCase();
}

function syncPackageFilterDefaultLabel() {
  const select = document.getElementById("productPackageFilter");
  if (!select) return;
  const firstOption = select.querySelector('option[value=""]');
  if (firstOption) {
    firstOption.textContent = getUiText("all_packages");
  }
}

function normalizeSizeOptions(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  const normalized = [...new Set(rawValues
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => SIZE_OPTIONS.some((size) => size.id === entry)))];

  return normalized.length > 0 ? normalized : SIZE_OPTIONS.map((size) => size.id);
}

function getVariantsForProduct(productId) {
  return Array.isArray(productVariantsByProductId[String(productId)])
    ? productVariantsByProductId[String(productId)]
    : [];
}

function compareProductsByDisplayOrder(a, b) {
  return Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
    Number(a?.id || 0) - Number(b?.id || 0);
}

function matchesProduct(product, query) {
  if (!query) return true;
  const haystack = [
    product.name,
    product.description,
    product.price
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function matchesSize(product, sizeId) {
  if (!sizeId) return true;
  return normalizeSizeOptions(product.size_options).includes(sizeId);
}

function matchesPackage(product, packageName) {
  if (!packageName) return true;
  return getVariantsForProduct(product.id)
    .some((variant) => String(variant.name || "").trim().toLowerCase() === packageName);
}

function populatePackageFilter(products) {
  const select = document.getElementById("productPackageFilter");
  if (!select) return;

  const currentValue = select.value || "";
  const packageNames = [...new Set(products.flatMap((product) =>
    getVariantsForProduct(product.id).map((variant) => String(variant.name || "").trim()).filter(Boolean)
  ))].sort((a, b) => a.localeCompare(b));

  select.innerHTML = `<option value="">${escapeHtml(getUiText("all_packages"))}</option>${packageNames
    .map((name) => `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`)
    .join("")}`;

  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function renderProducts(products) {
  const container = getRenderContainer();
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(products) || products.length === 0) {
    container.innerHTML = `<p class="product-search-empty">${escapeHtml(getUiText("no_products_match_search"))}</p>`;
    return;
  }

  products.forEach((product) => {
    const imageUrl = resolveProductImage(product, productImagesByProductId);
    const translatedContent = getTranslatedProductContent(product);
    const safeName = translatedContent.name;
    const safeDescription = translatedContent.description;
    const productType = String(product.product_type || "single").trim().toLowerCase();

    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = String(product.id);
    card.dataset.name = safeName;
    card.dataset.price = String(product.price || 0);
    card.dataset.description = safeDescription;
    card.dataset.image = imageUrl;
    card.dataset.stock = String(Number(product.stock || 0));
    card.dataset.productType = productType;
    card.dataset.sizeOptions = normalizeSizeOptions(product.size_options).join(",");
    card.dataset.sizePriceSmall = product.size_price_small ?? "";
    card.dataset.sizePriceMedium = product.size_price_medium ?? "";
    card.dataset.sizePriceLarge = product.size_price_large ?? "";
    card.dataset.freeGiftEnabled = product.free_gift_enabled ? "true" : "false";
    card.dataset.freeGiftProductId = String(product.free_gift_product_id || "");
    card.dataset.freeGiftMinQuantity = String(Number(product.free_gift_min_quantity || 1));
    card.dataset.freeGiftQuantity = String(Number(product.free_gift_quantity || 1));

    const stock = Number(product.stock || 0);
    const isBundle = productType === "bundle";
    const isOutOfStock = !isBundle && stock <= 0;

    const certificationsHtml = isBundle
      ? ""
      : `
        <div class="product-certifications" aria-label="Product certifications">
          <span class="product-cert-badge is-halal">
            <img src="/photos/halal-icon.png" alt="Halal certified" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
          </span>
          <span class="product-cert-badge is-vegetarian">
            <img src="/photos/vegetarian-icon.png" alt="Suitable for Vegetarian" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
          </span>
        </div>
      `;

    card.innerHTML = `
      <div class="product-image-box">
        ${
          imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(safeName)}" data-fallback-src="/uploads/sample-product.webp">`
            : `<div class="image-preview-box"><div class="image-preview-placeholder">${escapeHtml(getUiText("no_image_available"))}</div></div>`
        }
        ${certificationsHtml}
      </div>
      <h4>${escapeHtml(safeName)}</h4>
      <p>${escapeHtml(safeDescription)}</p>
      <button class="add-to-cart" type="button" ${isOutOfStock ? "disabled data-out-of-stock='true'" : ""}>${isOutOfStock ? escapeHtml(getUiText("out_of_stock")) : escapeHtml(getUiText("add_to_cart"))}</button>
    `;

    container.appendChild(card);
  });

  if (typeof window.enhanceShopProductCards === "function") {
    window.enhanceShopProductCards(document);
  }

  applyImageFallback(container);
}

function applyProductSearch() {
  const query = getSearchQuery();
  const sizeFilter = getSelectedSizeFilter();
  const packageFilter = getSelectedPackageFilter();
  const filtered = allProducts.filter((product) =>
    matchesProduct(product, query) &&
    matchesSize(product, sizeFilter) &&
    matchesPackage(product, packageFilter)
  );
  renderProducts(filtered);
}

function bindProductSearch() {
  const input = document.getElementById("productSearchInput");
  const button = document.getElementById("productSearchButton");
  const sizeFilter = document.getElementById("productSizeFilter");
  const packageFilter = document.getElementById("productPackageFilter");
  const clearBtn = document.getElementById("clearShoppingFiltersBtn");
  if (!input || !button) return;

  button.addEventListener("click", applyProductSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyProductSearch();
  });
  input.addEventListener("input", applyProductSearch);
  sizeFilter?.addEventListener("change", applyProductSearch);
  packageFilter?.addEventListener("change", applyProductSearch);
  clearBtn?.addEventListener("click", () => {
    input.value = "";
    if (sizeFilter) sizeFilter.value = "";
    if (packageFilter) packageFilter.value = "";
    applyProductSearch();
  });
}

async function loadProducts() {
  try {
    const isHomepageFeaturedList = Boolean(document.getElementById("productList")) && !document.body.classList.contains("product-page");
    const [productsRes, imagesRes, variantsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/product-images"),
      fetch("/api/product-variants")
    ]);

    const productsPayload = await productsRes.json();
    const imagesPayload = await imagesRes.json();
    const variantsPayload = await variantsRes.json();

    if (!productsRes.ok) {
      throw new Error(productsPayload.error || getUiText("failed_to_load_products"));
    }

    if (!imagesRes.ok) {
      throw new Error(imagesPayload.error || "Failed to load product images");
    }
    if (!variantsRes.ok) {
      throw new Error(variantsPayload.error || "Failed to load product variants");
    }

    const normalizedProducts = Array.isArray(productsPayload)
      ? [...productsPayload].sort(compareProductsByDisplayOrder)
      : [];

    allProducts = isHomepageFeaturedList
      ? normalizedProducts
          .filter((product) => Boolean(product?.is_featured))
          .sort((a, b) =>
            Number(a?.featured_order || 0) - Number(b?.featured_order || 0) ||
            compareProductsByDisplayOrder(a, b)
          )
      : normalizedProducts;
    productImagesByProductId =
      imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
        ? Object.fromEntries(
            Object.entries(imagesPayload.byProductId).map(([productId, images]) => [
              productId,
              Array.isArray(images)
                ? images.map((image) => ({
                    ...image,
                    image_url: normalizeImageUrl(image.image_url)
                  }))
                : []
            ])
          )
        : {};

    productVariantsByProductId = Array.isArray(variantsPayload)
      ? variantsPayload.reduce((acc, variant) => {
          const key = String(variant.product_id);
          if (!acc[key]) acc[key] = [];
          acc[key].push(variant);
          return acc;
        }, {})
      : {};

    populatePackageFilter(allProducts);
    applyProductSearch();
  } catch (error) {
    console.error("Error loading products:", error);
    const container = getRenderContainer();
    if (container) {
      container.innerHTML = `<p class="product-search-empty">${escapeHtml(getUiText("failed_to_load_products"))}</p>`;
    }
  }
}

document.addEventListener("themegood:langchange", () => {
  syncPackageFilterDefaultLabel();
  if (!Array.isArray(allProducts) || allProducts.length === 0) return;
  applyProductSearch();
});

document.addEventListener("DOMContentLoaded", () => {
  syncPackageFilterDefaultLabel();
  bindProductSearch();
  loadProducts();
});

