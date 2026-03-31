let detailProducts = [];
let detailImagesByProductId = {};
let detailVariantsByProductId = {};
let detailBundlePricingState = null;
const DETAIL_SIZE_OPTIONS = [
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

function formatMoney(value) {
  const amount = Number(value || 0);
  return `RM ${amount.toFixed(2)}`;
}

function formatPrice(value) {
  return formatMoney(value);
}

function formatSignedMoney(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(amount))}`;
}

function getDetailBundleBreakdownRowValueHtml(row) {
  if (row?.is_free_can) {
    return `<strong class="bundle-extra-pill">Free can</strong>`;
  }

  const price = Number(row?.price || 0);
  const extra = Number(row?.extra || 0);
  if (price > 0) return formatPrice(price);
  if (extra > 0) return `<strong class="bundle-extra-pill">+${formatPrice(extra)}</strong>`;
  return escapeHtml(detailT("bundle_included", "Included"));
}
function normalizeDetailLegacyBundlePricingNote(note = "") {
  const raw = String(note || "").trim();
  if (!raw) return "";
  if (/adds?\s*rm\s*\d+/i.test(raw)) return "";
  return raw;
}

function isBundleCocoaLabel(label) {
  return /cocoa/i.test(String(label || ""));
}

function isDetailCocoaProduct(product) {
  const id = Number(product?.id || 0);
  const name = String(product?.name || "");
  return id === 6 || /cocoa/i.test(name);
}

function getDetailCocoaForcedPrice(sizeId = "") {
  const normalized = normalizeDetailSizeId(sizeId);
  if (normalized === "small") return 72;
  if (normalized === "large") return 138;
  return null;
}

function getDetailCocoaPreferredImage(sizeId = "") {
  const normalized = normalizeDetailSizeId(sizeId);
  if (normalized === "small") return normalizeImageUrl("/photos/Cocoa 300g.png");
  if (normalized === "large") return normalizeImageUrl("/photos/Cocoa800g.png");
  return "";
}

const DETAIL_PRODUCT_SIZE_IMAGE_MAP = {
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

function getDetailImageMapKey(productName = "") {
  const normalized = String(productName || "").trim().toLowerCase();
  if (!normalized) return "";
  return Object.keys(DETAIL_PRODUCT_SIZE_IMAGE_MAP).find((key) => normalized.includes(key)) || "";
}

function getDetailMappedSizeImage(product, sizeId = "") {
  const normalizedSizeId = normalizeDetailSizeId(sizeId);
  if (!normalizedSizeId) return "";
  const key = getDetailImageMapKey(product?.name || "");
  if (!key) return "";
  return normalizeImageUrl(DETAIL_PRODUCT_SIZE_IMAGE_MAP[key]?.[normalizedSizeId] || "");
}

function isBundlePassionBeetrootLabel(label) {
  const normalized = String(label || "").toLowerCase();
  return normalized.includes("passion") && normalized.includes("beetroot");
}

function getQualifying800gBundlePrice(label, qualifiesForPassionDiscount) {
  if (qualifiesForPassionDiscount && isBundlePassionBeetrootLabel(label) && !isBundleCocoaLabel(label)) {
    return 98;
  }
  return 103;
}

function getDiscountedFifthBundlePrice(label, qualifiesForPassionDiscount) {
  if (qualifiesForPassionDiscount && isBundlePassionBeetrootLabel(label) && !isBundleCocoaLabel(label)) {
    return 49;
  }
  return 54;
}

function findDiscountedFifthIndex(rows = []) {
  const plainMixIndex = rows.findIndex((row) => !isBundleCocoaLabel(row?.label) && !isBundlePassionBeetrootLabel(row?.label));
  if (plainMixIndex >= 0) return plainMixIndex;

  const nonCocoaIndex = rows.findIndex((row) => !isBundleCocoaLabel(row?.label));
  if (nonCocoaIndex >= 0) return nonCocoaIndex;

  return rows.length > 0 ? 0 : -1;
}

function buildDetailBundleBreakdownRowsFromSelects(selects = []) {
  const sizes = selects.map((select) => String(select.options[select.selectedIndex]?.dataset?.choiceSize || "").trim().toLowerCase());
  const isTwoPlusOneBundle = sizes.length === 3
    && sizes.filter((size) => size === "800g").length === 2
    && sizes.filter((size) => size === "300g").length === 1;
  const isFiveCanBundle = sizes.length === 5
    && sizes.every((size) => size === "800g");

  const rows = selects.map((select) => {
    const option = select.options[select.selectedIndex];
    const label = option?.dataset.choiceLabel || detailT("selected_item", "Selected item");
    const size = option?.dataset.choiceSize || "";
    const normalizedSize = String(size).toLowerCase();
    const isCocoa = isBundleCocoaLabel(label);
    let price = Number(option?.dataset.choicePrice || 0);
    let extra = Number(option?.dataset.extra || 0);
    const pricingNote = normalizeDetailLegacyBundlePricingNote(option?.dataset.pricingNote || "");

    if (isTwoPlusOneBundle) {
      if (normalizedSize === "800g") {
        if (isCocoa) {
          price = 128;
          extra = 0;
        } else {
          price = getQualifying800gBundlePrice(label, false) + extra;
          extra = 0;
        }
      } else if (normalizedSize === "300g") {
        price = 27 + (isCocoa ? 0 : extra);
        extra = 0;
      }
    }

    return {
      slot_label: select.closest(".bundle-slot-block")?.querySelector(".bundle-slot-label")?.textContent?.trim() || "",
      label,
      size,
      price,
      extra,
      pricing_note: pricingNote,
      is_free_can: option?.dataset.freeCan === "true"
    };
  });

  if (isFiveCanBundle) {
    const discountedIndex = findDiscountedFifthIndex(rows);
    const qualifiesForPassionDiscount = true;

    return rows.map((row, index) => {
      const discounted = index === discountedIndex;
      return {
        ...row,
        price: isBundleCocoaLabel(row.label)
          ? 128
          : (discounted
            ? getDiscountedFifthBundlePrice(row.label, qualifiesForPassionDiscount) + Number(row.extra || 0)
            : getQualifying800gBundlePrice(row.label, qualifiesForPassionDiscount) + Number(row.extra || 0)),
        extra: 0,
        pricing_note: isBundleCocoaLabel(row.label) ? "" : (discounted ? "Discounted 5th can" : row.pricing_note)
      };
    });
  }

  return rows;
}

function renderDetailPartialBundleBreakdown(breakdownEl, rows = [], note = "Select the remaining flavours to see the final total.") {
  if (!breakdownEl) return;

  const selectedRows = (Array.isArray(rows) ? rows : []).filter((row) => row && row.label);
  if (selectedRows.length === 0) {
    breakdownEl.innerHTML = `<div class="bundle-breakdown-list"><div class="bundle-breakdown-row"><span>${escapeHtml(note)}</span></div></div>`;
    return;
  }

  const selectedSubtotal = selectedRows.reduce((sum, row) => sum + Number(row.price || 0), 0);
  breakdownEl.innerHTML = `
    <div class="bundle-breakdown-list">
      ${selectedRows.map((row) => `
        <div class="bundle-breakdown-row">
          <span>
            ${row.slot_label ? `<strong>${escapeHtml(row.slot_label)}:</strong> ` : ""}
            ${escapeHtml(row.label)}${row.size ? ` (${escapeHtml(row.size)})` : ""}
            ${row.pricing_note ? `<small class="bundle-breakdown-note">${escapeHtml(row.pricing_note)}</small>` : ""}
          </span>
          <span>${getDetailBundleBreakdownRowValueHtml(row)}</span>
        </div>
      `).join("")}
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(note)}</span>
        <span>${formatPrice(selectedSubtotal)}</span>
      </div>
    </div>
  `;
}

function getDetailPreviewBundleTotalFromRows(rows = []) {
  return Number((Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.price || 0), 0).toFixed(2));
}

function isDetailTwoPlusOneBreakdown(rows = []) {
  const sizes = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.size || "").trim().toLowerCase());
  return sizes.length === 3
    && sizes.filter((size) => size === "800g").length === 2
    && sizes.filter((size) => size === "300g").length === 1;
}

function isDetailFiveCanBreakdown(rows = []) {
  const sizes = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.size || "").trim().toLowerCase());
  return sizes.length === 5 && sizes.every((size) => size === "800g");
}

function resolveDetailBundleDisplayTotals(rows = [], totals = {}) {
  const previewTotal = getDetailPreviewBundleTotalFromRows(rows);

  if ((isDetailTwoPlusOneBreakdown(rows) || isDetailFiveCanBreakdown(rows)) && previewTotal > 0) {
    return {
      subtotal: previewTotal,
      baseBundlePrice: previewTotal,
      surchargeTotal: 0,
      finalTotal: previewTotal
    };
  }

  return {
    baseBundlePrice: Number(totals.baseBundlePrice || 0),
    subtotal: Number(totals.subtotal || previewTotal || 0),
    surchargeTotal: Number(totals.surchargeTotal || 0),
    finalTotal: Number(totals.finalTotal || previewTotal || 0)
  };
}

function renderDetailFullBundleBreakdownPreview(breakdownEl, rows = [], totals = {}) {
  if (!breakdownEl) return;

  const selectedRows = Array.isArray(rows) ? rows : [];
  const baseBundlePrice = Number(totals.baseBundlePrice || 0);
  const subtotal = Number(totals.subtotal || 0);
  const surchargeTotal = Number(totals.surchargeTotal ?? Math.max(0, subtotal - baseBundlePrice));
  const productDiscount = Number(totals.productDiscount || 0);
  const pricingRuleAdjustment = Number(totals.pricingRuleAdjustment || 0);
  const promoDiscount = Number(totals.promoDiscount || 0);
  const finalTotal = Number(
    totals.finalTotal
    ?? Math.max(0, subtotal - productDiscount + pricingRuleAdjustment - promoDiscount)
  );

  breakdownEl.innerHTML = `
    <div class="bundle-breakdown-list">
      ${selectedRows.map((row) => `
        <div class="bundle-breakdown-row">
          <span>
            ${row.slot_label ? `<strong>${escapeHtml(row.slot_label)}:</strong> ` : ""}
            ${escapeHtml(row.label)}${row.size ? ` (${escapeHtml(row.size)})` : ""}
            ${row.pricing_note ? `<small class="bundle-breakdown-note">${escapeHtml(row.pricing_note)}</small>` : ""}
          </span>
          <span>${getDetailBundleBreakdownRowValueHtml(row)}</span>
        </div>
      `).join("")}
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(detailT("bundle_base_price", "Bundle base price"))}</span>
        <span>${formatPrice(baseBundlePrice)}</span>
      </div>
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(detailT("bundle_surcharge_total", "Surcharge total"))}</span>
        <span>${formatSignedMoney(surchargeTotal)}</span>
      </div>
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(detailT("bundle_product_discount", "Product discount"))}</span>
        <span>${formatSignedMoney(-productDiscount)}</span>
      </div>
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(detailT("bundle_pricing_adjustment", "Pricing rule adjustment"))}</span>
        <span>${formatSignedMoney(pricingRuleAdjustment)}</span>
      </div>
      <div class="bundle-breakdown-row">
        <span>${escapeHtml(detailT("bundle_promo_discount", "Promo discount"))}</span>
        <span>${formatSignedMoney(-promoDiscount)}</span>
      </div>
      <div class="bundle-breakdown-row">
        <span><strong>${escapeHtml(detailT("bundle_final_total", "Final total"))}</strong></span>
        <span><strong>${formatPrice(finalTotal)}</strong></span>
      </div>
    </div>
  `;
}

function formatSoldCount(value) {
  const amount = Math.max(0, Number(value || 0));
  return Number.isFinite(amount) ? amount.toLocaleString() : "0";
}

function detailT(key, fallback, vars = {}) {
  if (typeof window.__themegoodT === "function") {
    return window.__themegoodT(key, vars);
  }
  return fallback;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function renderDetailSoldPill(product) {
  return `
    <div class="detail-stats">
      <span class="detail-stat-pill">${escapeHtml(detailT("sold_label", "Sold"))}: ${escapeHtml(formatSoldCount(product?.sold))}</span>
    </div>
  `;
}

function normalizeDetailSizeOptions(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  const normalized = [...new Set(rawValues
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => DETAIL_SIZE_OPTIONS.some((size) => size.id === entry)))];

  return normalized.length > 0 ? normalized : DETAIL_SIZE_OPTIONS.map((size) => size.id);
}

function getDetailManagedSizePrice(product, sizeId) {
  if (isDetailCocoaProduct(product)) {
    if (sizeId === "small") return 72;
    if (sizeId === "large") return 138;
  }

  const rawValue = product?.[`size_price_${sizeId}`];
  if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "") {
    const amount = Number(rawValue);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return Number(product?.price || 0);
}

function buildDetailSizeVariants(product) {
  return normalizeDetailSizeOptions(product?.size_options).map((sizeId) => {
    const size = DETAIL_SIZE_OPTIONS.find((entry) => entry.id === sizeId) || { id: sizeId, label: sizeId };
    return normalizeDetailVariant(
      {
        id: `size-${product.id}-${size.id}`,
        name: size.label,
        price: getDetailManagedSizePrice(product, size.id),
        stock: Number(product?.stock || 0)
      },
      product
    );
  });
}

function normalizeDetailVariant(variant, product) {
  const variantName = String(variant?.name || "Default").trim() || "Default";
  const inferredSizeId = normalizeDetailSizeId(variantName) || inferDetailSizeIdFromImageUrl(variant?.image_url || variant?.imageUrl || "");
  const forcedCocoaPrice = isDetailCocoaProduct(product) ? getDetailCocoaForcedPrice(inferredSizeId) : null;
  const price = forcedCocoaPrice !== null
    ? forcedCocoaPrice
    : Number(variant?.price ?? product?.price ?? 0);
  const stock = Number(variant?.stock ?? product?.stock ?? 0);
  const forcedMappedImage = getDetailMappedSizeImage(product, inferredSizeId);
  const forcedCocoaImage = isDetailCocoaProduct(product) ? getDetailCocoaPreferredImage(inferredSizeId) : "";
  return {
    id: String(variant?.id ?? ""),
    name: variantName,
    price: Number.isFinite(price) ? price : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    image_url: forcedMappedImage || forcedCocoaImage || normalizeImageUrl(variant?.image_url || variant?.imageUrl || "")
  };
}

function inferDetailSizeIdFromImageUrl(imageUrl = "") {
  const normalizedImageUrl = normalizeImageUrl(imageUrl).toLowerCase();
  if (!normalizedImageUrl) return "";
  if (normalizedImageUrl.includes("300g")) return "small";
  if (normalizedImageUrl.includes("600g")) return "medium";
  if (normalizedImageUrl.includes("800g")) return "large";
  return "";
}

function getDetailComparableImagePath(imageUrl = "") {
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  if (!normalizedImageUrl) return "";

  try {
    const parsed = new URL(normalizedImageUrl, window.location.origin);
    return decodeURIComponent(parsed.pathname || "")
      .replace(/\\/g, "/")
      .toLowerCase();
  } catch (_) {
    return decodeURIComponent(String(normalizedImageUrl).split(/[?#]/)[0] || "")
      .replace(/\\/g, "/")
      .toLowerCase();
  }
}

function getDetailComparableImageName(imageUrl = "") {
  const path = getDetailComparableImagePath(imageUrl);
  if (!path) return "";
  const filename = String(path.split("/").pop() || "");
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "");
}

function getDetailSizeIndex(sizeName = "") {
  const normalizedSizeId = getDetailSizeId(sizeName);
  const index = DETAIL_SIZE_OPTIONS.findIndex((size) => size.id === normalizedSizeId);
  return index >= 0 ? index : 0;
}

function getDetailFallbackImageForSize(product, sizeName = "") {
  const images = Array.isArray(detailImagesByProductId[String(product?.id)])
    ? detailImagesByProductId[String(product.id)]
    : [];
  const gallery = images
    .map((image) => normalizeImageUrl(image?.image_url || ""))
    .filter(Boolean);
  if (gallery.length === 0) {
    return normalizeImageUrl(product?.image_url || product?.primary_image || "");
  }
  const normalizedSizeId = normalizeDetailSizeId(sizeName);
  const filenameMatched = gallery.find((src) => inferDetailSizeIdFromImageUrl(src) === normalizedSizeId);
  if (filenameMatched) return filenameMatched;
  const idx = Math.min(getDetailSizeIndex(sizeName), gallery.length - 1);
  return gallery[idx] || gallery[0] || "";
}

function normalizeDetailSizeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const matched = DETAIL_SIZE_OPTIONS.find((size) =>
    raw === size.id ||
    raw === size.label.toLowerCase() ||
    raw.includes(size.label.toLowerCase())
  );
  return matched?.id || raw;
}

function getDetailVariantImageForSize(product, variants = [], sizeName = "") {
  const normalizedSizeId = normalizeDetailSizeId(sizeName);
  if (!normalizedSizeId) return "";
  const mappedImage = getDetailMappedSizeImage(product, normalizedSizeId);
  if (mappedImage) return mappedImage;
  if (isDetailCocoaProduct(product)) {
    const cocoaImage = getDetailCocoaPreferredImage(normalizedSizeId);
    if (cocoaImage) return cocoaImage;
  }

  const matched = (Array.isArray(variants) ? variants : [])
    .map((variant) => normalizeDetailVariant(variant, product))
    .find((variant) =>
      normalizeDetailSizeId(variant.name) === normalizedSizeId &&
      String(variant.image_url || "").trim() &&
      (!inferDetailSizeIdFromImageUrl(variant.image_url || "") || inferDetailSizeIdFromImageUrl(variant.image_url || "") === normalizedSizeId)
    );

  if (matched?.image_url) return matched.image_url;

  const galleryMatchedImage = getDetailFallbackImageForSize(product, normalizedSizeId);
  if (galleryMatchedImage) return galleryMatchedImage;

  const looseMatched = (Array.isArray(variants) ? variants : [])
    .map((variant) => normalizeDetailVariant(variant, product))
    .find((variant) =>
      normalizeDetailSizeId(variant.name) === normalizedSizeId && String(variant.image_url || "").trim()
    );

  return looseMatched?.image_url || "";
}

function getDetailSizeId(value) {
  return normalizeDetailSizeId(value);
}

function getDetailSizeIdForImage(product, variants = [], imageUrl = "") {
  const imagePath = getDetailComparableImagePath(imageUrl);
  const imageName = getDetailComparableImageName(imageUrl);
  if (!imagePath && !imageName) return "";

  const matched = (Array.isArray(variants) ? variants : [])
    .map((variant) => normalizeDetailVariant(variant, product))
    .find((variant) => {
      const variantPath = getDetailComparableImagePath(variant.image_url || "");
      const variantName = getDetailComparableImageName(variant.image_url || "");
      return (
        variantPath === imagePath ||
        (imageName && variantName === imageName)
      );
    });

  if (matched) return getDetailSizeId(matched.name);

  return inferDetailSizeIdFromImageUrl(imagePath || imageName || imageUrl);
}

function getDetailBenefits(product, variants) {
  const benefits = [];

  if (product.description) benefits.push(product.description);

  variants.slice(0, 3).forEach((variant) => {
    const bits = [];
    if (variant.name) bits.push(variant.name);
    if (Number(variant.units || 0) > 1) bits.push(`${variant.units} units`);
    if (Number(variant.discount_percent || 0) > 0) bits.push(`${Number(variant.discount_percent)}% off`);
    if (Number(variant.discount_amount || 0) > 0) bits.push(`RM ${Number(variant.discount_amount).toFixed(2)} off`);
    if (bits.length) benefits.push(bits.join(" • "));
  });

  return benefits.slice(0, 3);
}

function getAnchorId(product) {
  const safe = String(product.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `product-${safe || product.id}`;
}

function buildFallbackSingleVariants(product, variants = []) {
  const normalizedVariants = variants
    .map((variant) => ({
      id: String(variant?.id ?? ""),
      size_name: String(variant?.size_name || variant?.name || "").trim(),
      price: Number(variant?.price ?? 0),
      stock: Number(variant?.stock ?? product?.stock ?? 0),
      image_url: normalizeImageUrl(variant?.image_url || variant?.imageUrl || "")
    }))
    .filter((variant) => variant.id && variant.size_name);

  if (normalizedVariants.length > 0) {
    return normalizedVariants;
  }

  return buildDetailSizeVariants(product).map((variant) => ({
    id: String(variant.id),
    size_name: String(variant.name || "Size").trim(),
    price: Number(variant.price || 0),
    stock: Number(variant.stock || product?.stock || 0),
    image_url: normalizeImageUrl(variant.image_url || "")
  }));
}

function syncDetailCartBadge() {
  const cartItems = JSON.parse(localStorage.getItem("cart") || "[]");
  const totalQuantity = cartItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
  const cartCount = document.getElementById("cart-count");
  if (cartCount) {
    cartCount.textContent = String(totalQuantity);
  }
}

function addDetailItemToCart(item) {
  const cartItems = JSON.parse(localStorage.getItem("cart") || "[]");
  const key = String(item.key || `${item.id}::${item.sizeLabel || ""}::${item.packageLabel || ""}`);
  const existing = cartItems.find((entry) => String(entry.key || `${entry.id}::${entry.sizeLabel || ""}::${entry.packageLabel || ""}`) === key);

  if (existing) {
    existing.quantity = Math.max(1, Number(existing.quantity || 1)) + Math.max(1, Number(item.quantity || 1));
  } else {
    cartItems.push({
      key,
      id: Number(item.id || 0),
      name: String(item.name || "Product").trim(),
      price: Math.max(0, Number(item.price || 0)),
      quantity: Math.max(1, Number(item.quantity || 1)),
      sizeLabel: item.sizeLabel || "",
      packageLabel: item.packageLabel || "",
      bundleSelections: Array.isArray(item.bundleSelections) ? item.bundleSelections : [],
      bundleBreakdown: Array.isArray(item.bundleBreakdown) ? item.bundleBreakdown : [],
      bundlePromoCode: item.bundlePromoCode || ""
    });
  }

  localStorage.setItem("cart", JSON.stringify(cartItems));
  syncDetailCartBadge();
}

async function fetchProductDetailPayload(productId) {
  try {
    const response = await fetch(`/api/products/${Number(productId)}`);
    const payload = await response.json();
    if (response.ok && payload && typeof payload === "object" && payload.product) {
      return payload;
    }
  } catch (error) {
    console.warn("Direct product detail endpoint unavailable, falling back to catalogue endpoints.", error);
  }

  const [productsRes, imagesRes, variantsRes] = await Promise.all([
    fetch("/api/products"),
    fetch("/api/product-images"),
    fetch("/api/product-variants")
  ]);

  const productsPayload = await productsRes.json();
  const imagesPayload = await imagesRes.json();
  const variantsPayload = await variantsRes.json();

  if (!productsRes.ok) {
    throw new Error(productsPayload.error || detailT("failed_to_load_products", "Failed to load products."));
  }
  if (!imagesRes.ok) {
    throw new Error(imagesPayload.error || "Failed to load product images");
  }
  if (!variantsRes.ok) {
    throw new Error(variantsPayload.error || "Failed to load product variants");
  }

  const product = (Array.isArray(productsPayload) ? productsPayload : []).find((entry) => Number(entry?.id) === Number(productId));
  if (!product) {
    throw new Error(detailT("product_not_found", "Product not found."));
  }

  const imagesByProductId =
    imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
      ? imagesPayload.byProductId
      : {};

  const productImages = Array.isArray(imagesByProductId[String(productId)])
    ? imagesByProductId[String(productId)]
    : [];

  const primaryImage =
    productImages.find((img) => img?.is_primary)?.image_url ||
    productImages[0]?.image_url ||
    product.primary_image ||
    product.image_url ||
    "";

  const variants = Array.isArray(variantsPayload)
    ? variantsPayload.filter((variant) => Number(variant?.product_id) === Number(productId))
    : Array.isArray(variantsPayload?.byProductId?.[String(productId)])
      ? variantsPayload.byProductId[String(productId)]
      : [];

  return {
    product: {
      ...product,
      image_url: normalizeImageUrl(primaryImage || product.image_url || "")
    },
    variants,
    bundle_slots: [],
    pricing_rule: { pricing_type: "sum", amount: 0 },
    selectable_variants_by_size: {}
  };
}

async function loadProductDetail(productId) {
  const mount = document.getElementById("product-detail") || document.getElementById("detailGrid");
  if (!mount) return;

  mount.innerHTML = `<p class="empty-state">${escapeHtml(detailT("loading_product", "Loading product..."))}</p>`;

  try {
    const data = await fetchProductDetailPayload(productId);
    const { product, variants, bundle_slots, pricing_rule, selectable_variants_by_size } = data;

    if (!product) {
      mount.innerHTML = `<p class="empty-state">${escapeHtml(detailT("product_not_found", "Product not found."))}</p>`;
      return;
    }

    if (product.product_type === "bundle") {
      renderBundleProduct(product, bundle_slots, pricing_rule, selectable_variants_by_size);
    } else {
      renderSingleProduct(product, variants);
    }
  } catch (error) {
    console.error("Failed to load product detail:", error);
    mount.innerHTML = `<p class="empty-state">${escapeHtml(error.message || detailT("product_not_found", "Product not found."))}</p>`;
  }
}

function renderSingleProduct(product, variants) {
  const mount = document.getElementById("product-detail") || document.getElementById("detailGrid");
  if (!mount) return;

  const safeProduct = {
    ...product,
    image_url: normalizeImageUrl(product?.image_url || product?.primary_image || "")
  };
  const selectableVariants = buildFallbackSingleVariants(safeProduct, variants);
  const initialImageUrl = selectableVariants[0]?.image_url || safeProduct.image_url;
  const variantOptions = selectableVariants.map((variant) => `
    <option
      value="${escapeAttr(variant.id)}"
      data-price="${escapeAttr(variant.price)}"
      data-stock="${escapeAttr(variant.stock)}"
      data-size-name="${escapeAttr(variant.size_name)}"
      data-image-url="${escapeAttr(variant.image_url || "")}"
    >
      ${escapeHtml(variant.size_name)} - ${formatPrice(variant.price)}
    </option>
  `).join("");

  mount.innerHTML = `
    <div class="product-view">
      ${initialImageUrl ? `<img id="single-product-image" src="${escapeAttr(initialImageUrl)}" alt="${escapeAttr(safeProduct.name || detailT("product_label", "Product"))}">` : ""}
      <div class="product-view-body">
        <h1>${escapeHtml(safeProduct.name || detailT("product_label", "Product"))}</h1>
        <p>${escapeHtml(safeProduct.description || "")}</p>
        ${renderDetailSoldPill(safeProduct)}

        <label for="single-variant-select">${escapeHtml(detailT("choose_size", "Choose Size"))}</label>
        <select id="single-variant-select">
          ${variantOptions}
        </select>

        <p>${escapeHtml(detailT("price", "Price"))}: <strong id="single-product-price"></strong></p>
        <button type="button" id="single-add-to-cart-btn">${escapeHtml(detailT("add_to_cart", "Add to Cart"))}</button>
      </div>
    </div>
  `;

  const select = document.getElementById("single-variant-select");
  const priceEl = document.getElementById("single-product-price");
  const addButton = document.getElementById("single-add-to-cart-btn");
  const imageEl = document.getElementById("single-product-image");

  function updatePrice() {
    const option = select?.options?.[select.selectedIndex];
    if (!priceEl) return;
    priceEl.textContent = formatPrice(option?.dataset.price || 0);
    if (imageEl) {
      const nextImage =
        normalizeImageUrl(option?.dataset.imageUrl || "") ||
        getDetailVariantImageForSize(safeProduct, variants, option?.dataset.sizeName || "") ||
        safeProduct.image_url;
      if (nextImage) imageEl.src = nextImage;
    }

    if (addButton) {
      const stock = Number(option?.dataset.stock || 0);
      addButton.disabled = stock <= 0;
      addButton.textContent = stock <= 0
        ? detailT("out_of_stock", "Out of Stock")
        : detailT("add_to_cart", "Add to Cart");
    }
  }

  select?.addEventListener("change", updatePrice);
  addButton?.addEventListener("click", () => {
    const option = select?.options?.[select.selectedIndex];
    if (!option) return;

    addDetailItemToCart({
      key: `${safeProduct.id}::${option.value}`,
      id: safeProduct.id,
      name: safeProduct.name,
      price: Number(option.dataset.price || 0),
      quantity: 1,
      sizeLabel: option.dataset.sizeName || "",
      packageLabel: ""
    });
  });

  updatePrice();
}

function renderBundleProduct(product, bundleSlots, pricingRule, selectableVariantsBySize) {
  const mount = document.getElementById("product-detail") || document.getElementById("detailGrid");
  if (!mount) return;
  detailBundlePricingState = null;

  const slotHtml = (bundleSlots || []).map((slot) => {
    const choices = Array.isArray(slot.selectable_variants)
      ? slot.selectable_variants
      : (selectableVariantsBySize?.[slot.required_size] || []);

    return `
      <div class="bundle-slot-block" data-slot-id="${escapeAttr(slot.id)}">
        <div class="bundle-slot-head">
          <label class="bundle-slot-label">${escapeHtml(slot.slot_label || detailT("bundle_product_label", "Bundle Product"))}</label>
          ${slot.required_size ? `<span class="bundle-slot-size">${escapeHtml(slot.required_size)}</span>` : ""}
        </div>
        ${slot.slot_note ? `<div class="bundle-slot-note">${escapeHtml(slot.slot_note)}</div>` : ""}
        <select class="bundle-slot-select" data-slot-id="${escapeAttr(slot.id)}">
          <option value="">${escapeHtml(detailT("bundle_select_item", "Select item"))}</option>
          ${choices.map((choice) => {
            const extra = Number(choice.bundle_display_adjustment ?? 0);

            return `
              <option
                value="${escapeAttr(choice.id)}"
                data-extra="${escapeAttr(extra)}"
                data-choice-label="${escapeAttr(choice.product_name)}"
                data-choice-size="${escapeAttr(choice.size_name || "")}"
                data-choice-price="${escapeAttr(Number(choice.price || 0))}"
                data-pricing-note="${escapeAttr(choice.bundle_price_note || "")}"
                data-free-can="${slot.is_free_can_slot ? "true" : "false"}"
              >
                ${escapeHtml(choice.product_name)}${choice.size_name ? ` (${escapeHtml(choice.size_name)})` : ""}
              </option>
            `;
          }).join("")}
        </select>
      </div>
    `;
  }).join("");

  mount.innerHTML = `
    <div class="product-view">
      ${product.image_url ? `<img src="${escapeAttr(normalizeImageUrl(product.image_url))}" alt="${escapeAttr(product.name || detailT("bundle_product_label", "Bundle Product"))}">` : ""}
      <div class="product-view-body">
        <h1>${escapeHtml(product.name || detailT("bundle_product_label", "Bundle Product"))}</h1>
        <p>${escapeHtml(product.description || "")}</p>
        ${renderDetailSoldPill(product)}

        <div id="bundle-slot-wrapper" data-pricing-type="${escapeAttr(pricingRule?.pricing_type || "sum")}" data-pricing-amount="${escapeAttr(pricingRule?.amount || 0)}">
          ${slotHtml || `<p>${escapeHtml(detailT("no_bundle_slots_configured", "No bundle slots are configured yet."))}</p>`}
        </div>

        <div class="promo-box bundle-modal-promo-box">
          <input id="detail-bundle-promo-code" type="text" placeholder="${escapeHtml(detailT("bundle_promo_code", "Bundle Promo Code"))}" maxlength="32">
          <button type="button" id="detail-bundle-promo-apply">${escapeHtml(detailT("bundle_apply_promo", "Apply Promo"))}</button>
        </div>
        <small id="detail-bundle-promo-status" aria-live="polite"></small>

        <p>${escapeHtml(detailT("bundle_total_label", "Bundle Total"))}: <strong id="bundle-total" data-base-price="${escapeAttr(Number(product.price || 0))}">RM 0.00</strong></p>
        <div id="bundle-savings-badge" class="bundle-savings-badge" style="display:none;"></div>
        <div id="bundle-breakdown" class="bundle-breakdown-box"></div>

        <button type="button" id="bundle-add-to-cart-btn" disabled>${escapeHtml(detailT("add_bundle_to_cart", "Add Bundle to Cart"))}</button>
      </div>
    </div>
  `;

  const selects = [...document.querySelectorAll(".bundle-slot-select")];
  selects.forEach((select) => {
    select.addEventListener("change", () => {
      updateBundlePrice(product.id);
    });
  });

  document.getElementById("detail-bundle-promo-apply")?.addEventListener("click", () => {
    updateBundlePrice(product.id);
  });
  document.getElementById("detail-bundle-promo-code")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateBundlePrice(product.id);
    }
  });

  document.getElementById("bundle-add-to-cart-btn")?.addEventListener("click", async () => {
    const total = Number(document.getElementById("bundle-total")?.dataset.total || 0);
    const promoCode = String(document.getElementById("detail-bundle-promo-code")?.value || "").trim().toUpperCase();
    const selections = selects.map((select) => ({
      slot_id: Number(select.dataset.slotId),
      variant_id: Number(select.value)
    }));
    const breakdown = Array.isArray(detailBundlePricingState?.breakdown)
      ? detailBundlePricingState.breakdown.map((row) => ({ ...row }))
      : [];
    const selectedLabels = breakdown.map((row) => `${row.label}${row.size ? ` (${row.size})` : ""}`);

    if (selects.some((select) => !select.value) || breakdown.length !== selects.length || total <= 0) {
      const bundleTotal = document.getElementById("bundle-total");
      if (bundleTotal) {
        bundleTotal.textContent = detailT("bundle_complete_all", "Please complete all selections");
      }
      return;
    }

    addDetailItemToCart({
      key: `bundle::${product.id}::${selectedLabels.join("|")}`,
      id: product.id,
      name: product.name,
      price: total,
      quantity: 1,
      sizeLabel: "",
      packageLabel: detailT("custom_bundle", "Custom Bundle"),
      bundleSelections: selections,
      bundleBreakdown: breakdown,
      bundlePromoCode: promoCode || ""
    });
  });

  updateBundlePrice(product.id);
}

async function updateBundlePrice(bundleId) {
  const totalEl = document.getElementById("bundle-total");
  const breakdownEl = document.getElementById("bundle-breakdown");
  const savingsEl = document.getElementById("bundle-savings-badge");
  const promoInput = document.getElementById("detail-bundle-promo-code");
  const promoStatus = document.getElementById("detail-bundle-promo-status");
  const addButton = document.getElementById("bundle-add-to-cart-btn");
  const selects = [...document.querySelectorAll(".bundle-slot-select")];
  const baseBundlePrice = Number(totalEl?.dataset?.basePrice || 0);
  if (!totalEl || selects.length === 0) return;

  const selections = selects
    .filter((select) => select.value)
    .map((select) => ({
      slot_id: Number(select.dataset.slotId),
      variant_id: Number(select.value)
    }));

  if (selections.length !== selects.length) {
    totalEl.textContent = detailT("bundle_complete_all", "Please complete all selections");
    totalEl.dataset.total = "0";
    renderDetailPartialBundleBreakdown(
      breakdownEl,
      buildDetailBundleBreakdownRowsFromSelects(selects.filter((select) => select.value))
    );
    if (savingsEl) savingsEl.style.display = "none";
    if (promoStatus) promoStatus.textContent = "";
    if (addButton) addButton.disabled = true;
    detailBundlePricingState = null;
    return;
  }

  const promoCode = String(promoInput?.value || "").trim().toUpperCase();

  try {
    const res = await fetch(`/api/bundles/${bundleId}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections, promo_code: promoCode })
    });

    const data = await res.json();

    if (res.ok) {
      const resolvedTotal = Number.isFinite(Number(data?.total))
        ? Number(data.total)
        : Number(data?.subtotal || 0);
      totalEl.textContent = formatPrice(resolvedTotal);
      totalEl.dataset.total = String(resolvedTotal);
      const selectedRows = Array.isArray(data.breakdown) && data.breakdown.length === selects.length
        ? data.breakdown.map((row) => ({ ...row }))
        : buildDetailBundleBreakdownRowsFromSelects(selects);
      const fallbackRows = buildDetailBundleBreakdownRowsFromSelects(selects);
      const usesFixedBundleRules = isDetailTwoPlusOneBreakdown(fallbackRows) || isDetailFiveCanBreakdown(fallbackRows);
      const effectiveRows = usesFixedBundleRules ? fallbackRows : selectedRows;

      if (breakdownEl) {
        const quotedSubtotal = Number(data.subtotal || 0);
        const quotedSurchargeTotal = Number(data.surcharge_total || 0);
        const baseBundlePrice = Number(data.base_bundle_price ?? Math.max(0, quotedSubtotal - quotedSurchargeTotal));
        const productDiscount = Number(data.product_discount || 0);
        const promoDiscount = Number(data.promo_discount || 0);
        const pricingRuleAdjustment = Number(data.pricing_rule_adjustment || 0);
        const displayTotals = resolveDetailBundleDisplayTotals(effectiveRows, {
          baseBundlePrice,
          subtotal: quotedSubtotal,
          surchargeTotal: quotedSurchargeTotal,
          finalTotal: resolvedTotal
        });

        const effectiveBaseBundlePrice = Number(displayTotals.baseBundlePrice || baseBundlePrice);
        const effectiveTotal = Number(displayTotals.finalTotal || resolvedTotal);
        totalEl.textContent = formatPrice(effectiveTotal);
        totalEl.dataset.total = String(effectiveTotal);
        renderDetailFullBundleBreakdownPreview(breakdownEl, effectiveRows, {
          baseBundlePrice: effectiveBaseBundlePrice,
          subtotal: displayTotals.subtotal,
          surchargeTotal: displayTotals.surchargeTotal,
          productDiscount,
          pricingRuleAdjustment,
          promoDiscount,
          finalTotal: effectiveTotal
        });

        detailBundlePricingState = {
          total: effectiveTotal,
          breakdown: effectiveRows,
          selections,
          promoCode: data.applied_promo_code || promoCode
        };
      } else {
        detailBundlePricingState = {
          total: resolvedTotal,
          breakdown: effectiveRows,
          selections,
          promoCode: data.applied_promo_code || promoCode
        };
      }

      if (savingsEl) {
        const savings = Number(data.subtotal || 0) - Number(data.total || 0);
        if (savings > 0) {
          savingsEl.textContent = detailT("bundle_savings", "Bundle savings: {amount}", { amount: formatPrice(savings) });
          savingsEl.style.display = "";
        } else {
          savingsEl.textContent = "";
          savingsEl.style.display = "none";
        }
      }

      if (promoStatus) {
        promoStatus.textContent = data.applied_promo_code
          ? detailT("bundle_promo_applied", "Promo {code} applied.", { code: data.applied_promo_code })
          : "";
      }
      if (addButton) addButton.disabled = false;
      return;
    }

    const selectedRows = buildDetailBundleBreakdownRowsFromSelects(selects);
    const previewTotal = getDetailPreviewBundleTotalFromRows(selectedRows);
    totalEl.textContent = formatPrice(previewTotal || baseBundlePrice);
    totalEl.dataset.total = String(previewTotal || baseBundlePrice);
    if (promoStatus) promoStatus.textContent = "";
    if (promoCode && promoStatus) {
      promoStatus.textContent = data.error || detailT("bundle_price_unavailable", "Price unavailable");
    }
    if (breakdownEl) {
      renderDetailFullBundleBreakdownPreview(breakdownEl, selectedRows, {
        baseBundlePrice,
        subtotal: previewTotal,
        surchargeTotal: Math.max(0, previewTotal - baseBundlePrice),
        finalTotal: previewTotal || baseBundlePrice
      });
    }
    if (addButton) addButton.disabled = (previewTotal || baseBundlePrice) <= 0;
    detailBundlePricingState = {
      total: previewTotal || baseBundlePrice,
      breakdown: selectedRows,
      selections,
      promoCode: ""
    };
    return;
  } catch (error) {
    console.warn("Bundle pricing endpoint unavailable, using client-side fallback.", error);
  }
  const selectedRows = buildDetailBundleBreakdownRowsFromSelects(selects);
  const previewTotal = getDetailPreviewBundleTotalFromRows(selectedRows);
  totalEl.textContent = formatPrice(previewTotal || baseBundlePrice);
  totalEl.dataset.total = String(previewTotal || baseBundlePrice);
  if (promoStatus) promoStatus.textContent = "";
  if (breakdownEl) {
    renderDetailFullBundleBreakdownPreview(breakdownEl, selectedRows, {
      baseBundlePrice,
      subtotal: previewTotal,
      surchargeTotal: Math.max(0, previewTotal - baseBundlePrice),
      finalTotal: previewTotal || baseBundlePrice
    });
  }
  if (savingsEl) savingsEl.style.display = "none";
  if (addButton) addButton.disabled = (previewTotal || baseBundlePrice) <= 0;
  detailBundlePricingState = {
    total: previewTotal || baseBundlePrice,
    breakdown: selectedRows,
    selections,
    promoCode: ""
  };
}

function renderDetailProducts(products) {
  const grid =
    document.getElementById("detailGrid") ||
    document.getElementById("product-detail");
  if (!grid) return;

  grid.innerHTML = "";

  if (!Array.isArray(products) || products.length === 0) {
    grid.innerHTML = `<p class="empty-state">${escapeHtml(detailT("product_details_coming_soon", "Product details coming soon."))}</p>`;
    return;
  }

  products.forEach((product) => {
    const images = detailImagesByProductId[String(product.id)] || [];
    const variants = detailVariantsByProductId[String(product.id)] || [];

    const galleryItems = images
      .map((img) => normalizeImageUrl(img.image_url))
      .filter(Boolean);

    const primaryImage =
      images.find((img) => img.is_primary)?.image_url ||
      images[0]?.image_url ||
      product.primary_image ||
      product.image_url ||
      "";

    const imageUrl = normalizeImageUrl(primaryImage);
    const hoverImage = normalizeImageUrl(images[1]?.image_url || primaryImage || "");
    const gallery = galleryItems.length ? galleryItems.join(", ") : imageUrl;

    const benefits = getDetailBenefits(product, variants);
    const normalizedVariants = variants
      .map((variant) => normalizeDetailVariant(variant, product))
      .filter((variant) => variant.id);
    const directPriceVariants = normalizedVariants.filter((variant) => Number.isFinite(variant.price));
    const selectableVariants = directPriceVariants.length ? directPriceVariants : buildDetailSizeVariants(product);
    const initialVariant = selectableVariants[0];
    const initialVariantImage = initialVariant?.image_url || getDetailVariantImageForSize(product, variants, initialVariant?.name || "");
    const priceText = formatMoney(initialVariant.price);

    const article = document.createElement("article");
    article.id = getAnchorId(product);
    article.className = "detail-card product-card";
    article.dataset.id = String(product.id);
    article.dataset.name = product.name || "";
    article.dataset.price = String(initialVariant.price || product.price || 0);
    article.dataset.description = product.description || "";
    article.dataset.image = initialVariantImage || imageUrl;
    article.dataset.hoverImage = hoverImage;
    article.dataset.gallery = gallery;
    article.dataset.sizeOptions = String(product.size_options || "small,medium,large");
    article.dataset.sizePriceSmall = product.size_price_small ?? "";
    article.dataset.sizePriceMedium = product.size_price_medium ?? "";
    article.dataset.sizePriceLarge = product.size_price_large ?? "";
    article.dataset.stock = String(Number(initialVariant.stock || product.stock || 0));
    article.dataset.freeGiftEnabled = product.free_gift_enabled ? "true" : "false";
    article.dataset.freeGiftProductId = String(product.free_gift_product_id || "");
    article.dataset.freeGiftMinQuantity = String(Number(product.free_gift_min_quantity || 1));
    article.dataset.freeGiftQuantity = String(Number(product.free_gift_quantity || 1));

    const stock = Number(initialVariant.stock || product.stock || 0);
    const isOutOfStock = stock <= 0;

    article.innerHTML = `
      <div class="product-image-box">
        ${
          (initialVariantImage || imageUrl)
            ? `<img src="${escapeHtml(initialVariantImage || imageUrl)}" alt="${escapeHtml(product.name || detailT("product_label", "Product"))}">`
            : `<div class="image-preview-box"><div class="image-preview-placeholder">${escapeHtml(detailT("no_image_available", "No image available"))}</div></div>`
        }
        <div class="product-certifications" aria-label="${escapeHtml(detailT("product_certifications", "Product certifications"))}">
          <span class="product-cert-badge is-halal">
            <img src="/photos/halal-icon.png" alt="${escapeHtml(detailT("halal_label", "Halal certified"))}" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
          </span>
          <span class="product-cert-badge is-vegetarian">
            <img src="/photos/vegetarian-icon.png" alt="${escapeHtml(detailT("vegetarian_label", "Suitable for Vegetarian"))}" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
          </span>
        </div>
      </div>
      <h4>${escapeHtml(product.name || detailT("product_label", "Product"))}</h4>
      <p>${escapeHtml(product.description || detailT("product_details_coming_soon", "Product details coming soon."))}</p>
      <ul>
        ${
          benefits.length
            ? benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
            : `<li>${escapeHtml(detailT("more_product_details_coming_soon", "More product details coming soon."))}</li>`
        }
      </ul>
      ${renderDetailSoldPill(product)}
      <div class="detail-meta">
        <label for="product-size-${Number(product.id)}">${escapeHtml(detailT("size_label", "Size"))}</label>
        <select id="product-size-${Number(product.id)}" class="detail-size-select purchase-option-select">
          ${selectableVariants.map((variant) => `
            <option
              value="direct::${escapeHtml(variant.id)}"
              data-price="${escapeHtml(String(variant.price))}"
              data-stock="${escapeHtml(String(variant.stock))}"
              data-size-name="${escapeHtml(String(variant.name || ""))}"
              data-image-url="${escapeHtml(String(variant.image_url || ""))}"
            >
              ${escapeHtml(`${variant.name} - RM ${variant.price.toFixed(2)}`)}
            </option>
          `).join("")}
        </select>
        <strong id="product-price-${Number(product.id)}" class="detail-price-value">${escapeHtml(priceText)}</strong>
      </div>
      <button class="add-to-cart" type="button" ${isOutOfStock ? "disabled data-out-of-stock='true'" : ""}>${isOutOfStock ? escapeHtml(detailT("out_of_stock", "Out of Stock")) : escapeHtml(detailT("add_to_cart", "Add to Cart"))}</button>
    `;

    grid.appendChild(article);
  });

  if (typeof window.enhanceShopProductCards === "function") {
    window.enhanceShopProductCards(document);
  }

  document.querySelectorAll(".detail-card").forEach((card) => {
    const select = card.querySelector(".detail-size-select");
    const priceEl = card.querySelector(".detail-price-value");
    const addToCartBtn = card.querySelector(".add-to-cart");
    const imageEl = card.querySelector("img");
    if (!select || !priceEl) return;

    const syncVariantUi = () => {
      const selected = select.options[select.selectedIndex];
      const price = Number(selected?.dataset.price || 0);
      const stock = Number(selected?.dataset.stock || 0);
      priceEl.textContent = `RM ${price.toFixed(2)}`;
      card.dataset.price = String(price);
      card.dataset.stock = String(stock);
      if (imageEl) {
        const nextImage =
          normalizeImageUrl(selected?.dataset.imageUrl || "") ||
          getDetailVariantImageForSize(
            {
              id: Number(card.dataset.id || 0),
              image_url: card.dataset.image || ""
            },
            detailVariantsByProductId[String(card.dataset.id || "")] || [],
            selected?.dataset.sizeName || ""
          ) ||
          card.dataset.image;
        if (nextImage) imageEl.src = nextImage;
      }
      if (addToCartBtn) {
        const unavailable = stock <= 0;
        addToCartBtn.disabled = unavailable;
        addToCartBtn.textContent = unavailable
          ? detailT("out_of_stock", "Out of Stock")
          : detailT("add_to_cart", "Add to Cart");
        if (unavailable) addToCartBtn.setAttribute("data-out-of-stock", "true");
        else addToCartBtn.removeAttribute("data-out-of-stock");
      }
    };

    syncVariantUi();
    select.addEventListener("change", syncVariantUi);
    imageEl?.addEventListener("click", () => {
      const variants = detailVariantsByProductId[String(card.dataset.id || "")] || [];
      const sizeId = getDetailSizeIdForImage(
        {
          id: Number(card.dataset.id || 0),
          image_url: card.dataset.image || ""
        },
        variants,
        imageEl.src
      );
      if (!sizeId) return;
      const nextOption = [...select.options].find((option) =>
        getDetailSizeId(option.dataset.sizeName || "") === sizeId
      );
      if (!nextOption || select.value === nextOption.value) return;
      select.value = nextOption.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  const hash = window.location.hash;
  if (hash) {
    const target = document.querySelector(hash);
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }
}

async function loadShoppingDetailsProducts() {
  try {
    const [productsRes, imagesRes, variantsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/product-images"),
      fetch("/api/product-variants")
    ]);

    const productsPayload = await productsRes.json();
    const imagesPayload = await imagesRes.json();
    const variantsPayload = await variantsRes.json();

    if (!productsRes.ok) {
      throw new Error(productsPayload.error || detailT("failed_to_load_products", "Failed to load products."));
    }
    if (!imagesRes.ok) {
      throw new Error(imagesPayload.error || "Failed to load product images");
    }
    if (!variantsRes.ok) {
      throw new Error(variantsPayload.error || "Failed to load product variants");
    }

    detailProducts = Array.isArray(productsPayload) ? productsPayload : [];

    detailImagesByProductId =
      imagesPayload?.byProductId && typeof imagesPayload.byProductId === "object"
        ? imagesPayload.byProductId
        : {};

    if (Array.isArray(variantsPayload)) {
      detailVariantsByProductId = variantsPayload.reduce((acc, variant) => {
        const key = String(variant.product_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(variant);
        return acc;
      }, {});
    } else {
      detailVariantsByProductId =
        variantsPayload?.byProductId && typeof variantsPayload.byProductId === "object"
          ? variantsPayload.byProductId
          : {};
    }

    renderDetailProducts(detailProducts);
  } catch (error) {
    console.error("Failed to load shopping details products:", error);
    const grid =
      document.getElementById("detailGrid") ||
      document.getElementById("product-detail");
    if (grid) {
      grid.innerHTML = `<p class="empty-state">${escapeHtml(detailT("failed_to_load_products", "Failed to load products."))}</p>`;
    }
  }
}

function getRequestedProductId() {
  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get("id"));
  return Number.isInteger(productId) && productId > 0 ? productId : 0;
}

async function initShoppingDetailsPage() {
  syncDetailCartBadge();
  const productId = getRequestedProductId();
  if (productId) {
    await loadProductDetail(productId);
    return;
  }

  await loadShoppingDetailsProducts();
}

document.addEventListener("DOMContentLoaded", initShoppingDetailsPage);
document.addEventListener("themegood:langchange", () => {
  const productId = getRequestedProductId();
  if (productId) {
    loadProductDetail(productId);
    return;
  }
  renderDetailProducts(detailProducts);
});

window.loadProductDetail = loadProductDetail;
