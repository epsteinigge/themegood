let allProducts = [];
let productImagesByProductId = {};
let productVariantsByProductId = {};
const SIZE_OPTIONS = [
  { id: "small", label: "300g" },
  { id: "medium", label: "600g" },
  { id: "large", label: "800g" }
];

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

function resolveProductImage(product, imagesByProductId = {}) {
  const images = Array.isArray(imagesByProductId[String(product?.id)])
    ? imagesByProductId[String(product.id)]
    : Array.isArray(product?.images)
      ? product.images
      : [];

  const primary = images.find((img) => img && img.is_primary) || images[0] || null;

  return normalizeImageUrl(
    primary?.image_url ||
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

  select.innerHTML = `<option value="">All Packages</option>${packageNames
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
    container.innerHTML = `<p class="product-search-empty">No products match your search.</p>`;
    return;
  }

  products.forEach((product) => {
    const imageUrl = resolveProductImage(product, productImagesByProductId);
    const safeName = String(product.name || "").trim() || "ThemeGood Product";
    const safeDescription = String(product.description || "").trim() || "Product details coming soon.";
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

    card.innerHTML = `
      ${
        imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(safeName)}" data-fallback-src="/uploads/sample-product.webp">`
          : `<div class="image-preview-box"><div class="image-preview-placeholder">No image available</div></div>`
      }
      <h4>${escapeHtml(safeName)}</h4>
      <p>${escapeHtml(safeDescription)}</p>
      <button class="add-to-cart" type="button" ${isOutOfStock ? "disabled data-out-of-stock='true'" : ""}>${isOutOfStock ? "Out of Stock" : "Add to Cart"}</button>
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
    const productsEndpoint = isHomepageFeaturedList ? "/api/featured-products" : "/api/products";
    const [productsRes, imagesRes, variantsRes] = await Promise.all([
      fetch(productsEndpoint),
      fetch("/api/product-images"),
      fetch("/api/product-variants")
    ]);

    const productsPayload = await productsRes.json();
    const imagesPayload = await imagesRes.json();
    const variantsPayload = await variantsRes.json();

    if (!productsRes.ok) {
      throw new Error(productsPayload.error || "Failed to load products");
    }

    if (!imagesRes.ok) {
      throw new Error(imagesPayload.error || "Failed to load product images");
    }
    if (!variantsRes.ok) {
      throw new Error(variantsPayload.error || "Failed to load product variants");
    }

    allProducts = Array.isArray(productsPayload)
      ? [...productsPayload].sort(compareProductsByDisplayOrder)
      : [];
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
      container.innerHTML = `<p class="product-search-empty">Failed to load products.</p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindProductSearch();
  loadProducts();
});
