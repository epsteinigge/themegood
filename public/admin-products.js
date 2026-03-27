let allProducts = [];
let variantsByProductId = {};
let imagesByProductId = {};
let giftOptionsByProductId = {};
let bundleSlotsByProductId = {};
let pricingRulesByProductId = {};
let discountRulesByProductId = {};
let promoCodesByProductId = {};
const SIZE_OPTIONS = [
  { id: "small", label: "300g" },
  { id: "medium", label: "600g" },
  { id: "large", label: "800g" }
];
const SIZE_PRICE_FIELDS = [
  { id: "small", label: "300g", field: "size_price_small" },
  { id: "medium", label: "600g", field: "size_price_medium" },
  { id: "large", label: "800g", field: "size_price_large" }
];
let bundleExtraDraftBySize = {};
let promoCodeDrafts = [];
let promoCodeDraftCounter = 0;

function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("public/")) return `/${raw.slice("public".length)}`.replace(/\/{2,}/g, "/");
  return `/${raw.replace(/^\.?\//, "")}`;
}

function getAdminToken() {
  return localStorage.getItem("adminToken") || "";
}

function getAdminHeaders(extra = {}) {
  return {
    "x-admin-token": getAdminToken(),
    ...extra
  };
}

function handleUnauthorized(status) {
  if (status === 401) {
    localStorage.removeItem("adminToken");
    showToast("Your admin session expired. Please log in again.", "error");
    setTimeout(() => {
      window.location.href = "admin-login.html";
    }, 700);
    return true;
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeVariantSizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isCocoaProductName(value) {
  return /cocoa/i.test(String(value || ""));
}

function getDefaultBundleExtraPriceForSize(sizeName, productName = "") {
  const key = normalizeVariantSizeKey(sizeName);
  if (!isCocoaProductName(productName)) return 0;
  if (key === "300g") return 17;
  if (key === "800g") return 30;
  return 0;
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `${type} show`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = "";
  }, 2400);
}

function stockState(stock) {
  const value = Number(stock || 0);
  if (value <= 0) return "out";
  if (value <= 5) return "low";
  return "in";
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

function readSizeOptionsFromInputs(scope, idPrefix = "") {
  const checked = SIZE_OPTIONS.filter((size) => {
    const input = scope.querySelector(`#${idPrefix}${size.id}`);
    return Boolean(input?.checked);
  }).map((size) => size.id);

  return checked.length > 0 ? checked : SIZE_OPTIONS.map((size) => size.id);
}

function renderSizeOptionInputs(selected, idPrefix = "") {
  const active = normalizeSizeOptions(selected);
  return `
    <div class="size-option-group">
      ${SIZE_OPTIONS.map((size) => `
        <label class="size-option-chip">
          <input id="${idPrefix}${size.id}" type="checkbox" ${active.includes(size.id) ? "checked" : ""}>
          ${size.label}
        </label>
      `).join("")}
    </div>
  `;
}

function renderSizePriceInputs(product = {}, idPrefix = "") {
  return `
    <div class="inline-grid">
      ${SIZE_PRICE_FIELDS.map((size) => `
        <div class="field">
          <label for="${idPrefix}${size.id}">${size.label} Price (RM)</label>
          <input
            id="${idPrefix}${size.id}"
            type="number"
            min="0"
            step="0.01"
            value="${escapeAttr(product?.[size.field] ?? "")}"
            placeholder="${size.id === "small" ? "55.00" : ""}"
          >
        </div>
      `).join("")}
    </div>
  `;
}

function readSizePriceInputs(scope, idPrefix = "") {
  return SIZE_PRICE_FIELDS.reduce((acc, size) => {
    acc[size.field] = scope.querySelector(`#${idPrefix}${size.id}`)?.value || "";
    return acc;
  }, {});
}

function renderGiftProductOptions(selectedProductId = "", excludeProductId = null) {
  const selectedValue = String(selectedProductId || "");
  const excluded = String(excludeProductId || "");

  return `
    <option value="">Select gift product</option>
    ${allProducts
      .filter((product) => String(product.id) !== excluded)
      .map((product) => `
        <option value="${escapeAttr(product.id)}" ${String(product.id) === selectedValue ? "selected" : ""}>
          ${escapeHtml(product.name || `Product #${product.id}`)}
        </option>
      `)
      .join("")}
  `;
}

function populateAddProductGiftOptions() {
  const select = document.getElementById("freeGiftProductId");
  if (!select) return;
  const currentValue = select.value || "";
  select.innerHTML = renderGiftProductOptions(currentValue);
  if (currentValue) {
    select.value = currentValue;
  }
  syncAddProductFreeGiftFields();
}

function syncAddProductFreeGiftFields() {
  const enabled = Boolean(document.getElementById("freeGiftEnabled")?.checked);
  const productSelect = document.getElementById("freeGiftProductId");
  const minInput = document.getElementById("freeGiftMinQuantity");
  const qtyInput = document.getElementById("freeGiftQuantity");

  [productSelect, minInput, qtyInput].forEach((field) => {
    if (!field) return;
    field.disabled = !enabled;
  });
}

function syncProductFreeGiftFields(productId) {
  const enabled = Boolean(document.getElementById(`gift-enabled-${productId}`)?.checked);
  const productSelect = document.getElementById(`gift-product-${productId}`);
  const minInput = document.getElementById(`gift-min-${productId}`);
  const qtyInput = document.getElementById(`gift-qty-${productId}`);

  [productSelect, minInput, qtyInput].forEach((field) => {
    if (!field) return;
    field.disabled = !enabled;
  });
}

function syncAllProductFreeGiftFields() {
  syncAddProductFreeGiftFields();
  allProducts.forEach((product) => syncProductFreeGiftFields(product.id));
}

function updateStats(products) {
  const total = products.length;
  const inStock = products.filter((p) => stockState(p.stock) === "in").length;
  const lowStock = products.filter((p) => stockState(p.stock) === "low").length;
  const outStock = products.filter((p) => stockState(p.stock) === "out").length;

  const totalEl = document.getElementById("stat-total-products");
  const inEl = document.getElementById("stat-in-stock");
  const lowEl = document.getElementById("stat-low-stock");
  const outEl = document.getElementById("stat-out-stock");

  if (totalEl) totalEl.textContent = total;
  if (inEl) inEl.textContent = inStock;
  if (lowEl) lowEl.textContent = lowStock;
  if (outEl) outEl.textContent = outStock;
}

function setPreview(containerId, src) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const safeSrc = String(src || "").trim();

  if (!safeSrc) {
    box.innerHTML = `<div class="image-preview-placeholder">Product preview will appear here.</div>`;
    return;
  }

  box.innerHTML = `<img src="${escapeHtml(safeSrc)}" alt="Preview">`;
}

function getAddProductField(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

function syncProductTypeSections() {
  const productType = String(getAddProductField("product-type")?.value || "single").trim().toLowerCase();
  const singleSection = document.getElementById("single-product-section");
  const bundleSection = document.getElementById("bundle-product-section");

  if (singleSection) {
    singleSection.style.display = productType === "bundle" ? "none" : "";
  }

  if (bundleSection) {
    bundleSection.style.display = productType === "bundle" ? "" : "none";
  }

  const giftRuleCard = document.querySelector(".gift-rule-card");
  if (giftRuleCard) {
    giftRuleCard.style.opacity = productType === "bundle" ? "0.7" : "1";
  }
}

function addVariantRow(sizeName = "", price = "", stock = "", bundleExtraPrice = "") {
  const list = document.getElementById("variant-list");
  if (!list) return;

  const resolvedBundleExtra = bundleExtraPrice === "" || bundleExtraPrice === null || bundleExtraPrice === undefined
    ? readBundleExtraDraftValue(sizeName)
    : bundleExtraPrice;
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <div class="variant-grid">
      <div class="field">
        <label>Size</label>
        <input type="text" class="variant-size" placeholder="Size (e.g. 300g)" value="${escapeHtml(sizeName)}">
      </div>
      <div class="field">
        <label>Price (RM)</label>
        <input type="number" class="variant-price" step="0.01" min="0" placeholder="Price" value="${escapeHtml(price)}">
      </div>
      <div class="field">
        <label>Stock</label>
        <input type="number" class="variant-stock" min="0" step="1" placeholder="Stock" value="${escapeHtml(stock)}">
      </div>
      <div class="field">
        <label>Bundle Extra Price (RM)</label>
        <input type="number" class="variant-bundle-extra" step="0.01" min="0" placeholder="0" value="${escapeHtml(resolvedBundleExtra)}">
      </div>
    </div>
    <div class="variant-actions">
      <button type="button" class="danger-btn" onclick="this.closest('.variant-row').remove(); checkDuplicateVariants(); syncBundleExtraPricingSection();">Remove</button>
    </div>
  `;
  list.appendChild(row);

  row.querySelector(".variant-size")?.addEventListener("input", () => {
    checkDuplicateVariants();
    syncBundleExtraPricingSection();
  });
  row.querySelector(".variant-price")?.addEventListener("input", syncBundleExtraPricingSection);
  row.querySelector(".variant-bundle-extra")?.addEventListener("input", () => {
    const key = normalizeVariantSizeKey(row.querySelector(".variant-size")?.value || "");
    const amount = Number(row.querySelector(".variant-bundle-extra")?.value || 0);
    if (key) {
      bundleExtraDraftBySize[key] = Number.isFinite(amount) && amount >= 0 ? amount : 0;
    }
    syncBundleExtraPricingSection();
  });
  checkDuplicateVariants();
  syncBundleExtraPricingSection();
}

function checkDuplicateVariants() {
  const sizes = {};

  document.querySelectorAll("#variant-list .variant-row").forEach((row) => {
    const input = row.querySelector(".variant-size");
    const value = input?.value.trim().toLowerCase() || "";

    row.classList.remove("variant-duplicate");

    if (!value) return;

    if (sizes[value]) {
      row.classList.add("variant-duplicate");
      sizes[value].classList.add("variant-duplicate");
    } else {
      sizes[value] = row;
    }
  });
}

function addBundleSlotRow(slotLabel = "", requiredSize = "") {
  const list = document.getElementById("bundle-slot-list");
  if (!list) return;

  const row = document.createElement("div");
  row.className = "variant-row bundle-slot-row";
  row.innerHTML = `
    <div class="variant-grid">
      <div class="field">
        <label>Slot Label</label>
        <input type="text" class="slot-label" placeholder="e.g. Choose 800g #1" value="${escapeHtml(slotLabel)}">
      </div>
      <div class="field">
        <label>Required Size</label>
        <select class="slot-required-size">
          <option value="">Select size</option>
          <option value="300g" ${requiredSize === "300g" ? "selected" : ""}>300g</option>
          <option value="600g" ${requiredSize === "600g" ? "selected" : ""}>600g</option>
          <option value="800g" ${requiredSize === "800g" ? "selected" : ""}>800g</option>
        </select>
      </div>
    </div>
    <div class="variant-actions">
      <button type="button" class="danger-btn" onclick="this.closest('.bundle-slot-row').remove()">Remove Slot</button>
    </div>
  `;
  list.appendChild(row);
}

function seedBundleExtraDraft(variants = []) {
  bundleExtraDraftBySize = {};
  variants.forEach((variant) => {
    const key = normalizeVariantSizeKey(variant?.name || variant?.size_name || "");
    if (!key) return;
    const amount = Number(variant?.bundle_extra_price ?? 0);
    bundleExtraDraftBySize[key] = Number.isFinite(amount) ? amount : 0;
  });
}

function readBundleExtraDraftValue(sizeName) {
  const key = normalizeVariantSizeKey(sizeName);
  if (!key) return "";
  if (Object.prototype.hasOwnProperty.call(bundleExtraDraftBySize, key)) {
    return String(bundleExtraDraftBySize[key]);
  }

  const productName = getAddProductField("product-name", "name")?.value || "";
  const defaultValue = getDefaultBundleExtraPriceForSize(sizeName, productName);
  bundleExtraDraftBySize[key] = defaultValue;
  return String(defaultValue);
}

function syncBundleExtraPricingSection() {
  const host = document.getElementById("bundle-extra-pricing-list");
  if (!host) return;

  const variantRows = [...document.querySelectorAll("#variant-list .variant-row")];
  const variants = variantRows
    .map((row) => {
      const sizeName = row.querySelector(".variant-size")?.value.trim() || "";
      const bundleExtraInput = row.querySelector(".variant-bundle-extra");
      const amount = Number(bundleExtraInput?.value || readBundleExtraDraftValue(sizeName) || 0);
      if (sizeName) {
        const key = normalizeVariantSizeKey(sizeName);
        bundleExtraDraftBySize[key] = Number.isFinite(amount) && amount >= 0 ? amount : 0;
      }
      return {
        sizeName,
        key: normalizeVariantSizeKey(sizeName)
      };
    })
    .filter((row) => row.key);

  if (variants.length === 0) {
    host.innerHTML = `<p class="variant-empty">Add sizes above to configure bundle extra pricing.</p>`;
    return;
  }

  host.innerHTML = variants.map((variant) => `
    <div class="bundle-extra-row" data-size-key="${escapeAttr(variant.key)}">
      <div>
        <span class="bundle-extra-tag">${escapeHtml(variant.sizeName)}</span>
        <p class="helper" style="margin:8px 0 0;">Only charged when this size is selected in a bundle. Standard picks stay at 0.</p>
      </div>
      <div class="field">
        <label>Bundle Extra Price (RM)</label>
        <input class="js-top-bundle-extra-price" type="number" min="0" step="0.01" data-size-key="${escapeAttr(variant.key)}" value="${escapeAttr(readBundleExtraDraftValue(variant.sizeName))}">
      </div>
    </div>
  `).join("");

  host.querySelectorAll(".js-top-bundle-extra-price").forEach((input) => {
    input.addEventListener("input", () => {
      const key = normalizeVariantSizeKey(input.dataset.sizeKey || "");
      const amount = Number(input.value || 0);
      bundleExtraDraftBySize[key] = Number.isFinite(amount) && amount >= 0 ? amount : 0;
      const matchingRow = [...document.querySelectorAll("#variant-list .variant-row")].find((row) =>
        normalizeVariantSizeKey(row.querySelector(".variant-size")?.value || "") === key
      );
      const rowInput = matchingRow?.querySelector(".variant-bundle-extra");
      if (rowInput) {
        rowInput.value = String(bundleExtraDraftBySize[key]);
      }
    });
  });
}

function setDiscountRuleForm(rule = {}) {
  document.getElementById("discount-rule-type").value = rule.discount_type || "none";
  document.getElementById("discount-rule-amount").value = rule.amount ?? "0";
  document.getElementById("discount-rule-applies-to").value = rule.applies_to || "product";
  document.getElementById("discount-rule-active").checked = Boolean(rule.is_active);
  document.getElementById("discount-rule-starts-at").value = formatDateTimeLocal(rule.starts_at);
  document.getElementById("discount-rule-ends-at").value = formatDateTimeLocal(rule.ends_at);
}

function collectDiscountRule() {
  return {
    discount_type: document.getElementById("discount-rule-type")?.value || "none",
    amount: document.getElementById("discount-rule-amount")?.value || "0",
    applies_to: document.getElementById("discount-rule-applies-to")?.value || "product",
    is_active: Boolean(document.getElementById("discount-rule-active")?.checked),
    starts_at: document.getElementById("discount-rule-starts-at")?.value || "",
    ends_at: document.getElementById("discount-rule-ends-at")?.value || ""
  };
}

function normalizePromoCodeDraft(row = {}) {
  return {
    client_id: row.client_id || `promo-${Date.now()}-${promoCodeDraftCounter += 1}`,
    id: row.id || "",
    code: row.code || "",
    discount_type: row.discount_type || "fixed",
    amount: row.amount ?? "0",
    applies_to: row.applies_to || "product",
    min_order_amount: row.min_order_amount ?? "0",
    usage_limit: row.usage_limit ?? "",
    usage_count: row.usage_count ?? 0,
    is_active: row.is_active !== false,
    starts_at: formatDateTimeLocal(row.starts_at),
    ends_at: formatDateTimeLocal(row.ends_at)
  };
}

function renderPromoCodeRows() {
  const host = document.getElementById("promo-code-list");
  if (!host) return;

  if (!promoCodeDrafts.length) {
    host.innerHTML = `<p class="variant-empty">No promo codes yet. Add one below if needed.</p>`;
    return;
  }

  host.innerHTML = promoCodeDrafts.map((promo) => `
    <div class="promo-code-row" data-client-id="${escapeAttr(promo.client_id)}" data-id="${escapeAttr(promo.id)}" data-usage-count="${escapeAttr(promo.usage_count)}">
      <div class="promo-code-grid">
        <div class="field">
          <label>Promo Code</label>
          <input class="js-promo-code" value="${escapeAttr(promo.code)}" placeholder="e.g. COCOA17">
        </div>

        <div class="field">
          <label>Discount Type</label>
          <select class="js-promo-discount-type">
            <option value="fixed" ${promo.discount_type === "fixed" ? "selected" : ""}>Fixed</option>
            <option value="percent" ${promo.discount_type === "percent" ? "selected" : ""}>Percent</option>
          </select>
        </div>

        <div class="field">
          <label>Amount</label>
          <input class="js-promo-amount" type="number" min="0" step="0.01" value="${escapeAttr(promo.amount)}">
        </div>

        <div class="field">
          <label>Applies To</label>
          <select class="js-promo-applies-to">
            <option value="product" ${promo.applies_to === "product" ? "selected" : ""}>Product</option>
            <option value="bundle" ${promo.applies_to === "bundle" ? "selected" : ""}>Bundle</option>
          </select>
        </div>

        <div class="field">
          <label>Minimum Order (RM)</label>
          <input class="js-promo-min-order" type="number" min="0" step="0.01" value="${escapeAttr(promo.min_order_amount)}">
        </div>

        <div class="field">
          <label>Usage Limit</label>
          <input class="js-promo-usage-limit" type="number" min="1" step="1" value="${escapeAttr(promo.usage_limit)}" placeholder="Unlimited">
        </div>

        <div class="field">
          <label>Start Datetime</label>
          <input class="js-promo-starts-at" type="datetime-local" value="${escapeAttr(promo.starts_at)}">
        </div>

        <div class="field">
          <label>End Datetime</label>
          <input class="js-promo-ends-at" type="datetime-local" value="${escapeAttr(promo.ends_at)}">
        </div>
      </div>

      <div class="variant-actions" style="margin-top:12px;">
        <span class="meta-pill">Used: ${Number(promo.usage_count || 0)}</span>
        <label class="size-option-chip">
          <input class="js-promo-active" type="checkbox" ${promo.is_active ? "checked" : ""}>
          Active Promo
        </label>
        <button class="danger-btn js-remove-promo-code-btn" type="button" data-client-id="${escapeAttr(promo.client_id)}">Remove Promo</button>
      </div>
    </div>
  `).join("");
}

function addPromoCodeDraft(row = {}) {
  promoCodeDrafts.push(normalizePromoCodeDraft(row));
  renderPromoCodeRows();
}

function collectPromoCodes() {
  return [...document.querySelectorAll("#promo-code-list .promo-code-row")]
    .map((row) => ({
      id: row.dataset.id || "",
      code: row.querySelector(".js-promo-code")?.value.trim().toUpperCase() || "",
      discount_type: row.querySelector(".js-promo-discount-type")?.value || "fixed",
      amount: row.querySelector(".js-promo-amount")?.value || "0",
      applies_to: row.querySelector(".js-promo-applies-to")?.value || "product",
      min_order_amount: row.querySelector(".js-promo-min-order")?.value || "0",
      usage_limit: row.querySelector(".js-promo-usage-limit")?.value || "",
      usage_count: Number(row.dataset.usageCount || 0),
      is_active: Boolean(row.querySelector(".js-promo-active")?.checked),
      starts_at: row.querySelector(".js-promo-starts-at")?.value || "",
      ends_at: row.querySelector(".js-promo-ends-at")?.value || ""
    }))
    .filter((promo) => promo.code);
}

function collectVariants() {
  return [...document.querySelectorAll("#variant-list .variant-row")]
    .map((row) => {
      const sizeName = row.querySelector(".variant-size")?.value.trim() || "";
      const bundleExtraValue = row.querySelector(".variant-bundle-extra")?.value || readBundleExtraDraftValue(sizeName) || "0";
      return {
        size_name: sizeName,
        price: row.querySelector(".variant-price")?.value || "",
        stock: row.querySelector(".variant-stock")?.value || "0",
        bundle_extra_price: bundleExtraValue
      };
    })
    .filter((v) => v.size_name && v.price !== "");
}

function collectBundleSlots() {
  return [...document.querySelectorAll("#bundle-slot-list .bundle-slot-row")]
    .map((row) => ({
      slot_label: row.querySelector(".slot-label")?.value.trim() || "",
      required_size: row.querySelector(".slot-required-size")?.value.trim() || ""
    }))
    .filter((item) => item.slot_label && item.required_size);
}

function toggleProductTypeSections() {
  const type = document.getElementById("product-type").value;

  const singleSection = document.getElementById("single-product-section");
  const bundleSection = document.getElementById("bundle-product-section");
  const sizePricesSection = document.getElementById("single-size-prices-section");

  if (singleSection) {
    singleSection.style.display = type === "bundle" ? "none" : "block";
  }

  if (bundleSection) {
    bundleSection.style.display = type === "bundle" ? "block" : "none";
  }

  if (sizePricesSection) {
    sizePricesSection.style.display = type === "bundle" ? "none" : "grid";
  }

  const giftRuleCard = document.querySelector(".gift-rule-card");
  if (giftRuleCard) {
    giftRuleCard.style.opacity = type === "bundle" ? "0.7" : "1";
  }
}

async function loadAdminProductFull(productId) {
  const res = await fetch(`/api/admin/products/${Number(productId)}/full`, {
    headers: getAdminHeaders()
  });
  const data = await res.json();

  if (!res.ok) {
    if (handleUnauthorized(res.status)) {
      return null;
    }
    throw new Error(data.error || "Failed to load full product details.");
  }

  return data;
}

function setAddFormSizeOptions(selected) {
  const active = normalizeSizeOptions(selected);
  SIZE_OPTIONS.forEach((size) => {
    const input = document.getElementById(`size-${size.id}`);
    if (input) {
      input.checked = active.includes(size.id);
    }
  });
}

function resetProductForm() {
  const productIdInput = document.getElementById("product-id");
  const nameInput = getAddProductField("product-name", "name");
  const descriptionInput = getAddProductField("product-description", "description");
  const imageUrlInput = getAddProductField("product-image-url");
  const productTypeInput = getAddProductField("product-type");
  const featuredInput = document.getElementById("product-is-featured");
  const featuredOrderInput = getAddProductField("product-featured-order", "featured-order");
  const activeInput = getAddProductField("product-is-active");

  if (productIdInput) productIdInput.value = "";
  if (nameInput) nameInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (imageUrlInput) imageUrlInput.value = "";
  if (productTypeInput) productTypeInput.value = "single";
  if (featuredInput) featuredInput.checked = false;
  if (featuredOrderInput) featuredOrderInput.value = "0";
  if (activeInput) activeInput.checked = true;

  document.getElementById("price").value = "";
  document.getElementById("stock").value = "";
  document.getElementById("sold").value = "";
  document.getElementById("sortOrder").value = "0";
  setAddFormSizeOptions(SIZE_OPTIONS.map((size) => size.id));
  document.getElementById("size-price-small").value = "";
  document.getElementById("size-price-medium").value = "";
  document.getElementById("size-price-large").value = "";
  document.getElementById("freeGiftEnabled").checked = false;
  document.getElementById("freeGiftProductId").value = "";
  document.getElementById("freeGiftMinQuantity").value = "1";
  document.getElementById("freeGiftQuantity").value = "1";
  document.getElementById("imageFile").value = "";
  document.getElementById("variant-list").innerHTML = "";
  document.getElementById("bundle-slot-list").innerHTML = "";
  document.getElementById("pricing-type").value = "sum";
  document.getElementById("pricing-amount").value = "0";
  bundleExtraDraftBySize = {};
  promoCodeDrafts = [];
  setDiscountRuleForm();
  renderPromoCodeRows();

  addVariantRow();
  syncAddProductFreeGiftFields();
  toggleProductTypeSections();
  setPreview("addImagePreview", "");
  syncBundleExtraPricingSection();
}

function loadAdminProducts() {
  const host = document.getElementById("admin-product-table");
  const list = document.getElementById("productList");
  if (!host || !list) return;

  let summary = document.getElementById("admin-product-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "admin-product-summary";
    summary.style.marginBottom = "18px";
    host.insertBefore(summary, list);
  }

  summary.innerHTML = `
    <table border="1" cellpadding="8" cellspacing="0" width="100%">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Type</th>
          <th>Featured</th>
          <th>Active</th>
          <th>Variants</th>
          <th>Bundle Slots</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${allProducts.map((product) => `
          <tr>
            <td>${Number(product.id || 0)}</td>
            <td>${escapeHtml(product.name || "")}</td>
            <td>${escapeHtml(product.product_type || "single")}</td>
            <td>${product.is_featured ? "Yes" : "No"}</td>
            <td>${product.is_active === false ? "No" : "Yes"}</td>
            <td>${getVariantsForProduct(product.id).length}</td>
            <td>${Number(product.bundle_slot_count || 0)}</td>
            <td>
              <button type="button" onclick="editProduct(${Number(product.id)})">Edit</button>
              <button type="button" onclick="deleteProduct(${Number(product.id)})">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function editProduct(productId) {
  const product = allProducts.find((item) => Number(item.id) === Number(productId));
  if (!product) {
    showToast("Product not found.", "error");
    return;
  }

  document.getElementById("product-id").value = String(product.id);
  getAddProductField("product-name", "name").value = product.name || "";
  getAddProductField("product-description", "description").value = product.description || "";
  getAddProductField("product-image-url").value = product.image_url || "";
  getAddProductField("product-type").value = product.product_type || "single";
  document.getElementById("product-is-featured").checked = Boolean(product.is_featured);
  getAddProductField("product-featured-order", "featured-order").value = String(Number(product.featured_order || 0));
  getAddProductField("product-is-active").checked = product.is_active !== false;

  document.getElementById("price").value = String(product.price ?? "");
  document.getElementById("stock").value = String(Number(product.stock || 0));
  document.getElementById("sold").value = String(Number(product.sold || 0));
  document.getElementById("sortOrder").value = String(Number(product.sort_order || 0));
  setAddFormSizeOptions(product.size_options);
  document.getElementById("size-price-small").value = product.size_price_small ?? "";
  document.getElementById("size-price-medium").value = product.size_price_medium ?? "";
  document.getElementById("size-price-large").value = product.size_price_large ?? "";
  document.getElementById("freeGiftEnabled").checked = Boolean(product.free_gift_enabled);
  document.getElementById("freeGiftProductId").value = product.free_gift_product_id || "";
  document.getElementById("freeGiftMinQuantity").value = String(Number(product.free_gift_min_quantity || 1));
  document.getElementById("freeGiftQuantity").value = String(Number(product.free_gift_quantity || 1));

  document.getElementById("variant-list").innerHTML = "";
  document.getElementById("bundle-slot-list").innerHTML = "";

  try {
    const detail = await loadAdminProductFull(product.id);
    const fullProduct = detail?.product || product;
    const variants = Array.isArray(detail?.variants) ? detail.variants : getVariantsForProduct(product.id);
    const bundleSlots = Array.isArray(detail?.bundle_slots) ? detail.bundle_slots : [];
    const pricingRule = detail?.pricing_rule || { pricing_type: "sum", amount: "0" };
    const discountRule = detail?.discount_rule || {};
    const promoCodes = Array.isArray(detail?.promo_codes) ? detail.promo_codes : [];

    getAddProductField("product-name", "name").value = fullProduct.name || "";
    getAddProductField("product-description", "description").value = fullProduct.description || "";
    getAddProductField("product-image-url").value = fullProduct.image_url || "";
    getAddProductField("product-type").value = fullProduct.product_type || "single";
    document.getElementById("product-is-featured").checked = Boolean(fullProduct.is_featured);
    getAddProductField("product-featured-order", "featured-order").value = String(Number(fullProduct.featured_order || 0));
    getAddProductField("product-is-active").checked = fullProduct.is_active !== false;
    document.getElementById("price").value = String(fullProduct.price ?? "");
    document.getElementById("stock").value = String(Number(fullProduct.stock || 0));
    document.getElementById("sold").value = String(Number(fullProduct.sold || 0));
    document.getElementById("sortOrder").value = String(Number(fullProduct.sort_order || 0));
    setAddFormSizeOptions(fullProduct.size_options);
    document.getElementById("size-price-small").value = fullProduct.size_price_small ?? "";
    document.getElementById("size-price-medium").value = fullProduct.size_price_medium ?? "";
    document.getElementById("size-price-large").value = fullProduct.size_price_large ?? "";
    document.getElementById("freeGiftEnabled").checked = Boolean(fullProduct.free_gift_enabled);
    document.getElementById("freeGiftProductId").value = fullProduct.free_gift_product_id || "";
    document.getElementById("freeGiftMinQuantity").value = String(Number(fullProduct.free_gift_min_quantity || 1));
    document.getElementById("freeGiftQuantity").value = String(Number(fullProduct.free_gift_quantity || 1));

    seedBundleExtraDraft(variants);
    variants.forEach((variant) => {
      addVariantRow(
        variant.name || variant.size_name || "",
        variant.price ?? "",
        variant.stock ?? "",
        variant.bundle_extra_price ?? ""
      );
    });
    if (variants.length === 0) {
      addVariantRow();
    }

    bundleSlots.forEach((slot) => {
      addBundleSlotRow(slot.slot_label || "", slot.required_size || "");
    });

    document.getElementById("pricing-type").value = pricingRule.pricing_type || "sum";
    document.getElementById("pricing-amount").value = pricingRule.amount ?? "0";
    setDiscountRuleForm(discountRule);
    promoCodeDrafts = promoCodes.map((promo) => normalizePromoCodeDraft(promo));
    renderPromoCodeRows();
  } catch (error) {
    console.error("Load full product details failed:", error);

    const fallbackVariants = getVariantsForProduct(product.id);
    seedBundleExtraDraft(fallbackVariants);
    fallbackVariants.forEach((variant) => {
      addVariantRow(
        variant.name || variant.size_name || "",
        variant.price ?? "",
        variant.stock ?? "",
        variant.bundle_extra_price ?? ""
      );
    });
    if (fallbackVariants.length === 0) {
      addVariantRow();
    }

    document.getElementById("pricing-type").value = "sum";
    document.getElementById("pricing-amount").value = "0";
    setDiscountRuleForm();
    promoCodeDrafts = [];
    renderPromoCodeRows();
    showToast(error.message || "Failed to load bundle details.", "error");
  }

  syncAddProductFreeGiftFields();
  toggleProductTypeSections();
  setPreview("addImagePreview", product.image_url || "");
  syncBundleExtraPricingSection();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function uploadSelectedImagesForProduct(productId) {
  const fileInput = document.getElementById("imageFile");
  const files = Array.from(fileInput?.files || []);
  if (files.length === 0) return;

  const formData = new FormData();
  formData.append("product_id", String(productId));
  files.forEach((file) => {
    formData.append("images", file);
  });

  const imageRes = await fetch("/api/add-product-images", {
    method: "POST",
    headers: {
      "x-admin-token": getAdminToken()
    },
    body: formData
  });

  const imageData = await imageRes.json();
  if (!imageRes.ok) {
    if (handleUnauthorized(imageRes.status)) return;
    throw new Error(imageData.error || "Failed to upload product images");
  }
}

async function replaceProductVariantsFromForm(productId) {
  const variants = collectVariants();
  const existingVariants = getVariantsForProduct(productId);

  for (const variant of existingVariants) {
    if (!variant?.id) continue;
    const res = await fetch("/api/delete-product-variant", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id: Number(variant.id) })
    });

    const data = await res.json();
    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to delete existing size");
    }
  }

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const res = await fetch("/api/add-product-variant", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        product_id: Number(productId),
        name: variant.size_name,
        units: 1,
        discount_percent: 0,
        discount_amount: 0,
        price: Number(variant.price || 0),
        bundle_extra_price: Number(variant.bundle_extra_price || 0),
        stock: Number(variant.stock || 0),
        image_url: "",
        is_active: true,
        sort_order: index
      })
    });

    const data = await res.json();
    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to save size");
    }
  }
}

async function saveProduct() {
  const productId = document.getElementById("product-id")?.value.trim() || "";
  const productType = String(getAddProductField("product-type")?.value || "single").trim().toLowerCase();

  const payload = {
    name: getAddProductField("product-name", "name")?.value.trim() || "",
    description: getAddProductField("product-description", "description")?.value.trim() || "",
    image_url: getAddProductField("product-image-url")?.value.trim() || "",
    product_type: productType,
    price: document.getElementById("price")?.value || "",
    stock: document.getElementById("stock")?.value || "",
    sold: document.getElementById("sold")?.value || "",
    sort_order: document.getElementById("sortOrder")?.value || "0",
    is_featured: Boolean(document.getElementById("product-is-featured")?.checked),
    featured_order: getAddProductField("product-featured-order", "featured-order")?.value || "0",
    is_active: Boolean(getAddProductField("product-is-active")?.checked),
    variants: collectVariants(),
    bundle_slots: collectBundleSlots(),
    pricing_rule: {
      pricing_type: document.getElementById("pricing-type")?.value || "sum",
      amount: document.getElementById("pricing-amount")?.value || "0"
    },
    discount_rule: collectDiscountRule(),
    promo_codes: collectPromoCodes(),
    size_options: readSizeOptionsFromInputs(document, "size-"),
    ...readSizePriceInputs(document, "size-price-"),
    free_gift_enabled: Boolean(document.getElementById("freeGiftEnabled")?.checked),
    free_gift_product_id: document.getElementById("freeGiftProductId")?.value || "",
    free_gift_min_quantity: document.getElementById("freeGiftMinQuantity")?.value || "1",
    free_gift_quantity: document.getElementById("freeGiftQuantity")?.value || "1"
  };

  if (!payload.name) {
    showToast("Product name is required.", "error");
    return;
  }

  if (productType === "bundle") {
    payload.size_options = [];
    payload.size_price_small = "";
    payload.size_price_medium = "";
    payload.size_price_large = "";
    payload.variants = [];

    if (!payload.bundle_slots.length) {
      showToast("Add at least one bundle slot.", "error");
      return;
    }
  }

  try {
    if (productId) {
      const res = await fetch("/api/update-product", {
        method: "POST",
        headers: getAdminHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          id: Number(productId),
          ...payload
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (handleUnauthorized(res.status)) return;
        throw new Error(data.error || "Failed to update product.");
      }

      await uploadSelectedImagesForProduct(productId);
      if (productType !== "bundle") {
        await replaceProductVariantsFromForm(productId);
      }
    } else {
      const res = await fetch("/api/add-product", {
        method: "POST",
        headers: getAdminHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        if (handleUnauthorized(res.status)) return;
        throw new Error(data.error || "Failed to create product.");
      }

      const createdProductId = Number(data.productId || 0);
      if (!Number.isInteger(createdProductId) || createdProductId <= 0) {
        throw new Error("Product was created, but no valid product ID was returned.");
      }

      await uploadSelectedImagesForProduct(createdProductId);
      if (productType !== "bundle") {
        await replaceProductVariantsFromForm(createdProductId);
      }
    }

    showToast(productId ? "Product updated." : "Product added!", "success");
    resetProductForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error saving product", "error");
  }
}

function wireAddPreview() {
  const fileInput = document.getElementById("imageFile");
  const imageUrlInput = getAddProductField("product-image-url");

  imageUrlInput?.addEventListener("input", () => {
    if (fileInput?.files?.[0]) return;
    setPreview("addImagePreview", imageUrlInput.value);
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      setPreview("addImagePreview", imageUrlInput?.value || "");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPreview("addImagePreview", previewUrl);
  });
}

function getVariantsForProduct(productId) {
  return Array.isArray(variantsByProductId[String(productId)])
    ? variantsByProductId[String(productId)]
    : [];
}

function getImagesForProduct(productId) {
  return Array.isArray(imagesByProductId[String(productId)])
    ? imagesByProductId[String(productId)]
    : [];
}

function getGiftOptionsForProduct(productId) {
  return Array.isArray(giftOptionsByProductId[String(productId)])
    ? giftOptionsByProductId[String(productId)]
    : [];
}

function getBundleSlotsForProduct(productId) {
  return Array.isArray(bundleSlotsByProductId[String(productId)])
    ? bundleSlotsByProductId[String(productId)]
    : [];
}

function getPricingRuleForProduct(productId) {
  return pricingRulesByProductId[String(productId)] || { pricing_type: "sum", amount: 0 };
}

function getDiscountRuleForProduct(productId) {
  return discountRulesByProductId[String(productId)] || {
    discount_type: "none",
    amount: 0,
    applies_to: "product",
    is_active: false,
    starts_at: "",
    ends_at: ""
  };
}

function getPromoCodesForProduct(productId) {
  return Array.isArray(promoCodesByProductId[String(productId)])
    ? promoCodesByProductId[String(productId)]
    : [];
}

function renderExistingProductBundleSlotRows(productId) {
  const bundleSlots = getBundleSlotsForProduct(productId);

  if (!bundleSlots.length) {
    return `<p class="variant-empty">No bundle slots yet.</p>`;
  }

  return bundleSlots.map((slot, index) => `
    <div class="variant-row js-product-bundle-slot-row" data-product-id="${Number(productId)}" data-index="${index}">
      <div class="variant-grid">
        <div class="field">
          <label>Slot Label</label>
          <input class="js-product-bundle-slot-label" type="text" value="${escapeAttr(slot.slot_label || "")}" placeholder="e.g. Choose 300g #1">
        </div>
        <div class="field">
          <label>Required Size</label>
          <select class="js-product-bundle-slot-size">
            ${SIZE_OPTIONS.map((size) => `
              <option value="${size.label}" ${String(slot.required_size || "") === size.label ? "selected" : ""}>${size.label}</option>
            `).join("")}
          </select>
        </div>
      </div>
      <div class="variant-actions">
        <button class="danger-btn js-remove-product-bundle-slot-btn" type="button">Remove Slot</button>
      </div>
    </div>
  `).join("");
}

function renderProductBundleSection(product) {
  const pricingRule = getPricingRuleForProduct(product.id);
  const hidden = String(product.product_type || "single").toLowerCase() === "bundle" ? "" : "display:none;";

  return `
    <section class="variant-section" data-product-bundle-section="${Number(product.id)}" style="${hidden}">
      <div class="variant-section-head">
        <div>
          <h3>Bundle Builder</h3>
          <p>Edit bundle slots and pricing rule for this product directly from the product card.</p>
        </div>
      </div>

      <div class="variant-list" id="product-bundle-slot-list-${Number(product.id)}">
        ${renderExistingProductBundleSlotRows(product.id)}
      </div>

      <div class="variant-actions" style="margin-bottom:16px;">
        <button class="secondary-btn js-add-product-bundle-slot-btn" type="button" data-product-id="${Number(product.id)}">Add Bundle Slot</button>
      </div>

      <div class="promo-code-grid">
        <div class="field">
          <label for="product-pricing-type-${Number(product.id)}">Pricing Type</label>
          <select id="product-pricing-type-${Number(product.id)}">
            <option value="sum" ${pricingRule.pricing_type === "sum" ? "selected" : ""}>Sum of selected items</option>
            <option value="sum_plus" ${pricingRule.pricing_type === "sum_plus" ? "selected" : ""}>Sum + amount</option>
            <option value="sum_minus" ${pricingRule.pricing_type === "sum_minus" ? "selected" : ""}>Sum - amount</option>
          </select>
        </div>

        <div class="field">
          <label for="product-pricing-amount-${Number(product.id)}">Amount</label>
          <input id="product-pricing-amount-${Number(product.id)}" type="number" min="0" step="0.01" value="${escapeAttr(pricingRule.amount ?? 0)}">
        </div>
      </div>
    </section>
  `;
}

function renderProductDiscountSection(productId) {
  const rule = getDiscountRuleForProduct(productId);

  return `
    <section class="variant-section">
      <div class="variant-section-head">
        <div>
          <h3>Product Discount Rule</h3>
          <p>Save a discount directly from this product card without going back to the left form.</p>
        </div>
      </div>

      <div class="promo-code-grid">
        <div class="field">
          <label for="product-discount-type-${Number(productId)}">Discount Type</label>
          <select id="product-discount-type-${Number(productId)}">
            <option value="none" ${rule.discount_type === "none" ? "selected" : ""}>None</option>
            <option value="fixed" ${rule.discount_type === "fixed" ? "selected" : ""}>Fixed</option>
            <option value="percent" ${rule.discount_type === "percent" ? "selected" : ""}>Percent</option>
          </select>
        </div>

        <div class="field">
          <label for="product-discount-amount-${Number(productId)}">Amount</label>
          <input id="product-discount-amount-${Number(productId)}" type="number" min="0" step="0.01" value="${escapeAttr(rule.amount ?? 0)}">
        </div>

        <div class="field">
          <label for="product-discount-applies-${Number(productId)}">Applies To</label>
          <select id="product-discount-applies-${Number(productId)}">
            <option value="product" ${rule.applies_to === "product" ? "selected" : ""}>Product</option>
            <option value="bundle" ${rule.applies_to === "bundle" ? "selected" : ""}>Bundle</option>
          </select>
        </div>

        <div class="field">
          <label class="size-option-chip">
            <input id="product-discount-active-${Number(productId)}" type="checkbox" ${rule.is_active ? "checked" : ""}>
            Active Rule
          </label>
        </div>

        <div class="field">
          <label for="product-discount-start-${Number(productId)}">Start Datetime</label>
          <input id="product-discount-start-${Number(productId)}" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(rule.starts_at))}">
        </div>

        <div class="field">
          <label for="product-discount-end-${Number(productId)}">End Datetime</label>
          <input id="product-discount-end-${Number(productId)}" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(rule.ends_at))}">
        </div>
      </div>
    </section>
  `;
}

function renderExistingProductPromoRows(productId) {
  const promos = getPromoCodesForProduct(productId);

  if (!promos.length) {
    return `<p class="variant-empty">No promo codes yet.</p>`;
  }

  return promos.map((promo, index) => `
    <div class="promo-code-row js-product-promo-row" data-product-id="${Number(productId)}" data-index="${index}" data-id="${escapeAttr(promo.id || "")}" data-usage-count="${escapeAttr(promo.usage_count ?? 0)}">
      <div class="promo-code-grid">
        <div class="field">
          <label>Promo Code</label>
          <input class="js-product-promo-code" value="${escapeAttr(promo.code || "")}" placeholder="e.g. COCOA17">
        </div>

        <div class="field">
          <label>Discount Type</label>
          <select class="js-product-promo-discount-type">
            <option value="fixed" ${promo.discount_type === "fixed" ? "selected" : ""}>Fixed</option>
            <option value="percent" ${promo.discount_type === "percent" ? "selected" : ""}>Percent</option>
          </select>
        </div>

        <div class="field">
          <label>Amount</label>
          <input class="js-product-promo-amount" type="number" min="0" step="0.01" value="${escapeAttr(promo.amount ?? 0)}">
        </div>

        <div class="field">
          <label>Applies To</label>
          <select class="js-product-promo-applies-to">
            <option value="product" ${promo.applies_to === "product" ? "selected" : ""}>Product</option>
            <option value="bundle" ${promo.applies_to === "bundle" ? "selected" : ""}>Bundle</option>
          </select>
        </div>

        <div class="field">
          <label>Minimum Order (RM)</label>
          <input class="js-product-promo-min-order" type="number" min="0" step="0.01" value="${escapeAttr(promo.min_order_amount ?? 0)}">
        </div>

        <div class="field">
          <label>Usage Limit</label>
          <input class="js-product-promo-usage-limit" type="number" min="1" step="1" value="${escapeAttr(promo.usage_limit ?? "")}" placeholder="Unlimited">
        </div>

        <div class="field">
          <label>Start Datetime</label>
          <input class="js-product-promo-start" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(promo.starts_at))}">
        </div>

        <div class="field">
          <label>End Datetime</label>
          <input class="js-product-promo-end" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(promo.ends_at))}">
        </div>
      </div>

      <div class="variant-actions">
        <span class="meta-pill">Used: ${Number(promo.usage_count || 0)}</span>
        <label class="size-option-chip">
          <input class="js-product-promo-active" type="checkbox" ${promo.is_active ? "checked" : ""}>
          Active
        </label>
        <button class="danger-btn js-remove-product-promo-btn" type="button">Remove Promo</button>
      </div>
    </div>
  `).join("");
}

function renderProductPromoSection(productId) {
  return `
    <section class="variant-section">
      <div class="variant-section-head">
        <div>
          <h3>Promo Codes</h3>
          <p>Edit, add, and disable product promo codes directly inside the existing product card.</p>
        </div>
      </div>

      <div class="promo-code-list" id="product-promo-list-${Number(productId)}">
        ${renderExistingProductPromoRows(productId)}
      </div>

      <div class="variant-actions">
        <button class="secondary-btn js-add-product-promo-btn" type="button" data-product-id="${Number(productId)}">Add Promo Code</button>
      </div>
    </section>
  `;
}

function collectBundleSlotsForProductCard(productId) {
  return [...document.querySelectorAll(`#product-bundle-slot-list-${Number(productId)} .js-product-bundle-slot-row`)]
    .map((row, index) => ({
      slot_label: row.querySelector(".js-product-bundle-slot-label")?.value.trim() || "",
      required_size: row.querySelector(".js-product-bundle-slot-size")?.value || "",
      sort_order: index
    }))
    .filter((slot) => slot.slot_label && slot.required_size);
}

function collectPricingRuleForProductCard(productId) {
  return {
    pricing_type: document.getElementById(`product-pricing-type-${Number(productId)}`)?.value || "sum",
    amount: document.getElementById(`product-pricing-amount-${Number(productId)}`)?.value || "0"
  };
}

function collectDiscountRuleForProductCard(productId) {
  return {
    discount_type: document.getElementById(`product-discount-type-${Number(productId)}`)?.value || "none",
    amount: document.getElementById(`product-discount-amount-${Number(productId)}`)?.value || "0",
    applies_to: document.getElementById(`product-discount-applies-${Number(productId)}`)?.value || "product",
    is_active: Boolean(document.getElementById(`product-discount-active-${Number(productId)}`)?.checked),
    starts_at: document.getElementById(`product-discount-start-${Number(productId)}`)?.value || "",
    ends_at: document.getElementById(`product-discount-end-${Number(productId)}`)?.value || ""
  };
}

function collectPromoCodesForProductCard(productId) {
  return [...document.querySelectorAll(`#product-promo-list-${Number(productId)} .js-product-promo-row`)]
    .map((row) => ({
      id: row.dataset.id || "",
      code: row.querySelector(".js-product-promo-code")?.value.trim().toUpperCase() || "",
      discount_type: row.querySelector(".js-product-promo-discount-type")?.value || "fixed",
      amount: row.querySelector(".js-product-promo-amount")?.value || "0",
      applies_to: row.querySelector(".js-product-promo-applies-to")?.value || "product",
      min_order_amount: row.querySelector(".js-product-promo-min-order")?.value || "0",
      usage_limit: row.querySelector(".js-product-promo-usage-limit")?.value || "",
      usage_count: row.dataset.usageCount || "0",
      is_active: Boolean(row.querySelector(".js-product-promo-active")?.checked),
      starts_at: row.querySelector(".js-product-promo-start")?.value || "",
      ends_at: row.querySelector(".js-product-promo-end")?.value || ""
    }))
    .filter((promo) => promo.code);
}

function createExistingProductBundleSlotRow(productId, slot = {}) {
  const row = document.createElement("div");
  row.className = "variant-row js-product-bundle-slot-row";
  row.dataset.productId = String(Number(productId));
  row.innerHTML = `
    <div class="variant-grid">
      <div class="field">
        <label>Slot Label</label>
        <input class="js-product-bundle-slot-label" type="text" value="${escapeAttr(slot.slot_label || "")}" placeholder="e.g. Choose 300g #1">
      </div>
      <div class="field">
        <label>Required Size</label>
        <select class="js-product-bundle-slot-size">
          ${SIZE_OPTIONS.map((size) => `
            <option value="${size.label}" ${String(slot.required_size || "") === size.label ? "selected" : ""}>${size.label}</option>
          `).join("")}
        </select>
      </div>
    </div>
    <div class="variant-actions">
      <button class="danger-btn js-remove-product-bundle-slot-btn" type="button">Remove Slot</button>
    </div>
  `;
  return row;
}

function createExistingProductPromoRow(productId, promo = {}) {
  const row = document.createElement("div");
  row.className = "promo-code-row js-product-promo-row";
  row.dataset.productId = String(Number(productId));
  row.dataset.id = promo.id || "";
  row.dataset.usageCount = String(promo.usage_count ?? 0);
  row.innerHTML = `
    <div class="promo-code-grid">
      <div class="field">
        <label>Promo Code</label>
        <input class="js-product-promo-code" value="${escapeAttr(promo.code || "")}" placeholder="e.g. COCOA17">
      </div>

      <div class="field">
        <label>Discount Type</label>
        <select class="js-product-promo-discount-type">
          <option value="fixed" ${promo.discount_type === "percent" ? "" : "selected"}>Fixed</option>
          <option value="percent" ${promo.discount_type === "percent" ? "selected" : ""}>Percent</option>
        </select>
      </div>

      <div class="field">
        <label>Amount</label>
        <input class="js-product-promo-amount" type="number" min="0" step="0.01" value="${escapeAttr(promo.amount ?? 0)}">
      </div>

      <div class="field">
        <label>Applies To</label>
        <select class="js-product-promo-applies-to">
          <option value="product" ${promo.applies_to === "bundle" ? "" : "selected"}>Product</option>
          <option value="bundle" ${promo.applies_to === "bundle" ? "selected" : ""}>Bundle</option>
        </select>
      </div>

      <div class="field">
        <label>Minimum Order (RM)</label>
        <input class="js-product-promo-min-order" type="number" min="0" step="0.01" value="${escapeAttr(promo.min_order_amount ?? 0)}">
      </div>

      <div class="field">
        <label>Usage Limit</label>
        <input class="js-product-promo-usage-limit" type="number" min="1" step="1" value="${escapeAttr(promo.usage_limit ?? "")}" placeholder="Unlimited">
      </div>

      <div class="field">
        <label>Start Datetime</label>
        <input class="js-product-promo-start" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(promo.starts_at))}">
      </div>

      <div class="field">
        <label>End Datetime</label>
        <input class="js-product-promo-end" type="datetime-local" value="${escapeAttr(formatDateTimeLocal(promo.ends_at))}">
      </div>
    </div>

    <div class="variant-actions">
      <span class="meta-pill">Used: ${Number(promo.usage_count || 0)}</span>
      <label class="size-option-chip">
        <input class="js-product-promo-active" type="checkbox" ${promo.is_active === false ? "" : "checked"}>
        Active
      </label>
      <button class="danger-btn js-remove-product-promo-btn" type="button">Remove Promo</button>
    </div>
  `;
  return row;
}

function syncExistingProductTypeSections(productId) {
  const type = String(document.getElementById(`product-type-${Number(productId)}`)?.value || "single").trim().toLowerCase();
  const bundleSection = document.querySelector(`[data-product-bundle-section="${Number(productId)}"]`);
  if (bundleSection) {
    bundleSection.style.display = type === "bundle" ? "" : "none";
  }
}

function renderImageRows(product) {
  const images = getImagesForProduct(product.id);

  if (images.length === 0) {
    const fallback = normalizeImageUrl(product.image_url);
    if (fallback) {
      return `
        <div class="image-card image-card-fallback">
          <img src="${escapeAttr(fallback)}" alt="${escapeAttr(product.name || "Product image")}" class="image-thumb">
          <div class="image-card-body">
            <p class="image-card-note">Using legacy primary image from <code>products.image_url</code>.</p>
            <div class="field">
              <label>Image URL</label>
              <input value="${escapeAttr(fallback)}" readonly>
            </div>
          </div>
        </div>
      `;
    }

    return `<p class="variant-empty">No product images yet. Upload one or more images below.</p>`;
  }

  return images.map((image) => `
    <div class="image-card" data-image-id="${Number(image.id)}" data-product-id="${Number(product.id)}">
      <img src="${escapeAttr(normalizeImageUrl(image.image_url))}" alt="${escapeAttr(product.name || "Product image")}" class="image-thumb">

      <div class="image-card-body">
        <div class="image-pill-row">
          <span class="meta-pill ${image.is_primary ? "image-primary-pill" : ""}">
            ${image.is_primary ? "Primary Image" : "Gallery Image"}
          </span>
        </div>

        <div class="field">
          <label>Image URL</label>
          <input class="js-image-url" value="${escapeAttr(normalizeImageUrl(image.image_url || ""))}" placeholder="/uploads/example.webp">
        </div>

        <div class="inline-grid image-inline-grid">
          <div class="field">
            <label>Sort Order</label>
            <input class="js-image-sort-order" type="number" min="0" step="1" value="${Number(image.sort_order || 0)}">
          </div>
        </div>

        <div class="image-actions">
          <button class="secondary-btn js-save-image-btn" type="button" data-product-id="${Number(product.id)}" data-image-id="${Number(image.id)}">Save Image</button>
          <button class="secondary-btn js-set-primary-image-btn" type="button" data-product-id="${Number(product.id)}" data-image-id="${Number(image.id)}">Set Primary</button>
          <button class="danger-btn js-delete-image-btn" type="button" data-product-id="${Number(product.id)}" data-image-id="${Number(image.id)}">Delete Image</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderImageUploadForm(productId) {
  return `
    <div class="image-upload-card" data-product-id="${Number(productId)}">
      <div class="field">
        <label>Upload New Images</label>
        <input class="js-product-image-files" type="file" accept="image/jpeg,image/png,image/webp" multiple>
        <div class="helper">Upload up to 10 files. JPG, PNG, and WEBP up to 50MB each are optimized on the server.</div>
      </div>

      <div class="image-actions">
        <button class="primary-btn js-upload-images-btn" type="button" data-product-id="${Number(productId)}">Upload Images</button>
      </div>
    </div>
  `;
}

function renderVariantRows(productId) {
  const variants = getVariantsForProduct(productId);

  if (variants.length === 0) {
    return `<p class="variant-empty">No size options yet. Add the first size below.</p>`;
  }

  return variants.map((variant) => `
    <div class="variant-row" data-variant-id="${Number(variant.id)}" data-product-id="${Number(productId)}">
      <div class="variant-grid">
        <div class="field">
          <label>Size Name</label>
          <input class="js-variant-name" value="${escapeAttr(variant.name || "")}" placeholder="e.g. Small">
        </div>

        <div class="field">
          <label>Price (RM)</label>
          <input class="js-variant-price" type="number" min="0" step="0.01" value="${Number(variant.price || 0)}">
          <div class="helper">Standard bundle choices use this normal product price.</div>
        </div>

        <div class="field">
          <label>Bundle Extra Price (RM)</label>
          <input class="js-variant-bundle-extra-price" type="number" min="0" step="0.01" value="${Number(variant.bundle_extra_price || 0)}">
          <div class="helper">Set extra charge for premium picks like Cocoa. Leave 0 for standard choices.</div>
        </div>

        <div class="field">
          <label>Stock</label>
          <input class="js-variant-stock" type="number" min="0" step="1" value="${Number(variant.stock || 0)}">
        </div>

        <div class="field">
          <label>Variant Image URL</label>
          <input class="js-variant-image-url" value="${escapeAttr(variant.image_url || "")}" placeholder="/uploads/variant-image.webp">
        </div>

        <div class="field">
          <label>Upload Variant Image</label>
          <input class="js-variant-image-file" type="file" accept="image/jpeg,image/png,image/webp">
          <div class="helper">Optional. Uploading a file replaces the variant image URL on save.</div>
        </div>

        <div class="field">
          <label>Sort Order</label>
          <input class="js-variant-sort" type="number" min="0" step="1" value="${Number(variant.sort_order || 0)}">
        </div>

        <label class="variant-toggle">
          <input class="js-variant-active" type="checkbox" ${variant.is_active ? "checked" : ""}>
          <span>Active</span>
        </label>
      </div>

      <div class="variant-actions">
        ${variant.image_url ? `<img src="${escapeAttr(normalizeImageUrl(variant.image_url))}" alt="${escapeAttr(variant.name || "Variant image")}" class="variant-image-preview">` : ""}
        <button class="secondary-btn js-save-variant-btn" type="button" data-product-id="${Number(productId)}" data-variant-id="${Number(variant.id)}">Save Size</button>
        <button class="danger-btn js-delete-variant-btn" type="button" data-product-id="${Number(productId)}" data-variant-id="${Number(variant.id)}">Delete Size</button>
      </div>
    </div>
  `).join("");
}

function renderVariantAddForm(productId) {
  return `
    <div class="variant-add-card" data-product-id="${Number(productId)}">
      <div class="variant-add-grid">
        <div class="field">
          <label>New Size Name</label>
          <input class="js-new-variant-name" placeholder="e.g. Small">
        </div>

        <div class="field">
          <label>Price (RM)</label>
          <input class="js-new-variant-price" type="number" min="0" step="0.01" value="0">
          <div class="helper">Base price stays standard unless you add a surcharge below.</div>
        </div>

        <div class="field">
          <label>Bundle Extra Price (RM)</label>
          <input class="js-new-variant-bundle-extra-price" type="number" min="0" step="0.01" value="0">
        </div>

        <div class="field">
          <label>Stock</label>
          <input class="js-new-variant-stock" type="number" min="0" step="1" value="0">
        </div>

        <div class="field">
          <label>Variant Image URL</label>
          <input class="js-new-variant-image-url" placeholder="/uploads/variant-image.webp">
        </div>

        <div class="field">
          <label>Upload Variant Image</label>
          <input class="js-new-variant-image-file" type="file" accept="image/jpeg,image/png,image/webp">
        </div>

        <div class="field">
          <label>Sort Order</label>
          <input class="js-new-variant-sort" type="number" min="0" step="1" value="0">
        </div>

        <label class="variant-toggle">
          <input class="js-new-variant-active" type="checkbox" checked>
          <span>Active</span>
        </label>
      </div>

      <div class="variant-actions">
        <button class="primary-btn js-add-variant-btn" type="button" data-product-id="${Number(productId)}">Add Size</button>
      </div>
    </div>
  `;
}

function renderGiftOfferRows(product) {
  const giftOptions = getGiftOptionsForProduct(product.id);

  if (giftOptions.length === 0) {
    return `<p class="variant-empty">No gift offers yet. Add a customizable offer below.</p>`;
  }

  return giftOptions.map((option) => `
    <div class="variant-row" data-gift-option-id="${Number(option.id)}" data-product-id="${Number(product.id)}">
      <div class="variant-grid">
        <div class="field">
          <label>Offer Name</label>
          <input class="js-gift-offer-name" value="${escapeAttr(option.offer_name || "")}" placeholder="e.g. Free shaker with Family Pack">
        </div>

        <div class="field">
          <label>Gift Product</label>
          <select class="js-gift-offer-product">
            ${renderGiftProductOptions(String(option.gift_product_id || ""), product.id)}
          </select>
        </div>

        <div class="field">
          <label>Minimum Bought Units</label>
          <input class="js-gift-offer-min-units" type="number" min="1" step="1" value="${Number(option.min_units || 1)}">
        </div>

        <div class="field">
          <label>Gift Quantity</label>
          <input class="js-gift-offer-quantity" type="number" min="1" step="1" value="${Number(option.gift_quantity || 1)}">
        </div>

        <div class="field">
          <label>Gift Add-on Price (RM)</label>
          <input class="js-gift-offer-price" type="number" min="0" step="0.01" value="${Number(option.extra_price || 0)}">
          <div class="helper">Use 0 for a fully free gift, or set a price for an optional paid gift add-on.</div>
        </div>

        <div class="field">
          <label>Sort Order</label>
          <input class="js-gift-offer-sort" type="number" min="0" step="1" value="${Number(option.sort_order || 0)}">
        </div>

        <label class="variant-toggle">
          <input class="js-gift-offer-active" type="checkbox" ${option.is_active ? "checked" : ""}>
          <span>Active</span>
        </label>
      </div>

      <div class="variant-actions">
        <button class="secondary-btn js-save-gift-offer-btn" type="button" data-product-id="${Number(product.id)}" data-gift-option-id="${Number(option.id)}">Save Offer</button>
        <button class="danger-btn js-delete-gift-offer-btn" type="button" data-product-id="${Number(product.id)}" data-gift-option-id="${Number(option.id)}">Delete Offer</button>
      </div>
    </div>
  `).join("");
}

function renderGiftOfferAddForm(productId) {
  return `
    <div class="variant-add-card" data-product-id="${Number(productId)}">
      <div class="variant-add-grid">
        <div class="field">
          <label>New Offer Name</label>
          <input class="js-new-gift-offer-name" placeholder="e.g. Add 1 shaker for RM 4.90">
        </div>

        <div class="field">
          <label>Gift Product</label>
          <select class="js-new-gift-offer-product">
            ${renderGiftProductOptions("", productId)}
          </select>
        </div>

        <div class="field">
          <label>Minimum Bought Units</label>
          <input class="js-new-gift-offer-min-units" type="number" min="1" step="1" value="1">
        </div>

        <div class="field">
          <label>Gift Quantity</label>
          <input class="js-new-gift-offer-quantity" type="number" min="1" step="1" value="1">
        </div>

        <div class="field">
          <label>Gift Add-on Price (RM)</label>
          <input class="js-new-gift-offer-price" type="number" min="0" step="0.01" value="0">
        </div>

        <div class="field">
          <label>Sort Order</label>
          <input class="js-new-gift-offer-sort" type="number" min="0" step="1" value="0">
        </div>

        <label class="variant-toggle">
          <input class="js-new-gift-offer-active" type="checkbox" checked>
          <span>Active</span>
        </label>
      </div>

      <div class="variant-actions">
        <button class="primary-btn js-add-gift-offer-btn" type="button" data-product-id="${Number(productId)}">Add Gift Offer</button>
      </div>
    </div>
  `;
}

function renderProducts(products) {
  const list = document.getElementById("productList");
  const count = document.getElementById("productCount");
  if (!list) return;

  if (count) {
    count.textContent = `Showing ${products.length} product${products.length === 1 ? "" : "s"}`;
  }

  list.innerHTML = "";

  if (!Array.isArray(products) || products.length === 0) {
    list.innerHTML = `<p class="empty-state">No products found.</p>`;
    return;
  }

  products.forEach((product) => {
    const div = document.createElement("div");
    div.className = "product-item";

    const images = getImagesForProduct(product.id);
    const primaryImage = images.find((image) => image.is_primary) || images[0] || null;
    const displayImage = normalizeImageUrl(primaryImage?.image_url || product.image_url || "");

    const stock = Number(product.stock || 0);
    const sold = Number(product.sold || 0);
    const sortOrder = Number(product.sort_order || 0);
    const featuredOrder = Number(product.featured_order || 0);
    const sizeOptions = normalizeSizeOptions(product.size_options);
    const isFeatured = Boolean(product.is_featured);
    const productType = String(product.product_type || "single").toLowerCase();
    const isActive = product.is_active !== false;
    const freeGiftEnabled = Boolean(product.free_gift_enabled);
    const freeGiftProductId = product.free_gift_product_id ? String(product.free_gift_product_id) : "";
    const freeGiftMinQuantity = Number(product.free_gift_min_quantity || 1);
    const freeGiftQuantity = Number(product.free_gift_quantity || 1);
    const stockKey = stockState(stock);
    const stockLabel =
      stockKey === "out" ? "Out of Stock" :
      stockKey === "low" ? "Low Stock" :
      "In Stock";

    const stockClass =
      stockKey === "out" ? "stock-out" :
      stockKey === "low" ? "stock-low" :
      "stock-ok";

    div.innerHTML = `
      <div class="product-item-grid">
        <div class="product-thumb-wrap">
          ${
            images.length > 0
              ? `
                <div class="product-image-grid">
                  ${images.map((img) => `
                    <img
                      src="${escapeHtml(normalizeImageUrl(img.image_url))}"
                      alt="${escapeHtml(product.name || "Product image")}"
                      class="product-thumb-small ${img.is_primary ? "primary-image" : ""}"
                    >
                  `).join("")}
                </div>
              `
              : displayImage
                ? `<img src="${escapeHtml(displayImage)}" alt="${escapeHtml(product.name)}" class="product-thumb">`
                : `<div class="image-preview-box"><div class="image-preview-placeholder">No image</div></div>`
          }

          <div class="product-meta">
            <span class="meta-pill">ID #${Number(product.id)}</span>
            <span class="meta-pill">RM ${Number(product.price || 0).toFixed(2)}</span>
            <span class="meta-pill ${stockClass}">${stockLabel}: ${stock}</span>
            <span class="meta-pill">Sold: ${sold}</span>
            <span class="meta-pill">Order: ${sortOrder}</span>
            <span class="meta-pill">Featured Order: ${featuredOrder}</span>
            <span class="meta-pill ${isFeatured ? "image-primary-pill" : ""}">${isFeatured ? "Featured" : "Normal"}</span>
          </div>
        </div>

        <div>
          <div class="field">
            <label for="name-${product.id}">Product Name</label>
            <input id="name-${product.id}" value="${escapeAttr(product.name || "")}" placeholder="Product name">
          </div>

          <div class="inline-grid">
            <div class="field">
              <label for="product-type-${product.id}">Product Type</label>
              <select id="product-type-${product.id}" class="js-product-type-select" data-product-id="${Number(product.id)}">
                <option value="single" ${productType === "bundle" ? "" : "selected"}>Single Product</option>
                <option value="bundle" ${productType === "bundle" ? "selected" : ""}>Bundle / Custom Package</option>
              </select>
            </div>

            <div class="field">
              <label class="size-option-chip" style="margin-top:30px;">
                <input id="active-${product.id}" type="checkbox" ${isActive ? "checked" : ""}>
                Active
              </label>
            </div>
          </div>

          <div class="inline-grid">
            <div class="field">
              <label for="price-${product.id}">Base Price (RM)</label>
              <input id="price-${product.id}" type="number" step="0.01" min="0" value="${Number(product.price || 0)}" placeholder="Price">
            </div>

            <div class="field">
              <label for="stock-${product.id}">Stock</label>
              <input id="stock-${product.id}" type="number" min="0" value="${Number(product.stock || 0)}" placeholder="Stock">
            </div>
          </div>

          <div class="field">
            <label for="sold-${product.id}">Sold</label>
            <input id="sold-${product.id}" type="number" min="0" value="${Number(product.sold || 0)}" placeholder="Sold">
          </div>

          <div class="field">
            <label for="sort-order-${product.id}">Sort Order</label>
            <input id="sort-order-${product.id}" type="number" min="0" step="1" value="${sortOrder}" placeholder="0">
          </div>

          <div class="field">
            <label>Available Sizes</label>
            ${renderSizeOptionInputs(sizeOptions, `size-${product.id}-`)}
            <div class="helper">Choose which size options this product should show to shoppers.</div>
          </div>

          <div class="field">
            <label>Size Prices</label>
            ${renderSizePriceInputs(product, `size-price-${product.id}-`)}
            <div class="helper">These are the admin-managed prices used for 300g, 600g, and 800g on the storefront.</div>
          </div>

          <div class="field">
            <label class="size-option-chip">
              <input id="featured-${product.id}" type="checkbox" ${isFeatured ? "checked" : ""}>
              Featured product
            </label>
          </div>

          <div class="field">
            <label for="featured-order-${product.id}">Featured Order</label>
            <input id="featured-order-${product.id}" type="number" min="0" step="1" value="${featuredOrder}" placeholder="0">
          </div>

          <div class="field">
            <label for="image-${product.id}">Primary Image URL Fallback</label>
            <input id="image-${product.id}" value="${escapeAttr(product.image_url || "")}" placeholder="Primary image URL fallback">
            <div class="helper">Kept for backward compatibility. The primary gallery image will sync this automatically.</div>
          </div>

          <div class="field">
            <label for="desc-${product.id}">Description</label>
            <textarea id="desc-${product.id}" placeholder="Description">${escapeHtml(product.description || "")}</textarea>
          </div>

          <section class="gift-rule-card">
            <div class="gift-rule-head">
              <div>
                <h3>Quick Auto Gift Rule</h3>
                <p>Legacy quick rule. For multiple customizable gift choices and paid add-on gifts, use Gift Offers below.</p>
              </div>
            </div>

            <div class="field">
              <label class="size-option-chip">
                <input id="gift-enabled-${product.id}" type="checkbox" ${freeGiftEnabled ? "checked" : ""}>
                Enable Free Gift
              </label>
            </div>

            <div class="field">
              <label for="gift-product-${product.id}">Gift Product</label>
              <select id="gift-product-${product.id}">
                ${renderGiftProductOptions(freeGiftProductId, product.id)}
              </select>
            </div>

            <div class="inline-grid">
              <div class="field">
                <label for="gift-min-${product.id}">Minimum Bought Units</label>
                <input id="gift-min-${product.id}" type="number" min="1" step="1" value="${freeGiftMinQuantity}">
              </div>

              <div class="field">
                <label for="gift-qty-${product.id}">Gift Quantity</label>
                <input id="gift-qty-${product.id}" type="number" min="1" step="1" value="${freeGiftQuantity}">
              </div>
            </div>
          </section>

          ${renderProductBundleSection(product)}

          ${renderProductDiscountSection(product.id)}

          ${renderProductPromoSection(product.id)}

          <div class="product-actions">
            <button class="primary-btn product-save-btn" type="button" data-product-id="${Number(product.id)}">Save Changes</button>
            <button class="danger-btn product-delete-btn" type="button" data-product-id="${Number(product.id)}">Delete</button>
          </div>

          <section class="variant-section">
            <div class="variant-section-head">
              <div>
                <h3>Gift Offers</h3>
                <p>Create multiple gift choices for this product. Offers can be fully free or paid add-on gifts, and package units are counted toward the threshold.</p>
              </div>
            </div>

            <div class="variant-list">
              ${renderGiftOfferRows(product)}
            </div>

            ${renderGiftOfferAddForm(product.id)}
          </section>

          <section class="variant-section">
            <div class="variant-section-head">
              <div>
                <h3>Images</h3>
                <p>Upload multiple optimized product images, set the primary image, and control order.</p>
              </div>
            </div>

            <div class="image-list">
              ${renderImageRows(product)}
            </div>

            ${renderImageUploadForm(product.id)}
          </section>

          <section class="variant-section">
            <div class="variant-section-head">
              <div>
                <h3>Sizes</h3>
                <p>Manage size-specific prices, stock, images, visibility, and display order.</p>
              </div>
            </div>

            <div class="variant-list">
              ${renderVariantRows(product.id)}
            </div>

            ${renderVariantAddForm(product.id)}
          </section>
        </div>
      </div>
    `;

    list.appendChild(div);
  });
}

function applyProductFilters() {
  const search = (document.getElementById("productSearchInput")?.value || "").trim().toLowerCase();
  const sort = document.getElementById("productSortSelect")?.value || "newest";
  const stockFilter = document.getElementById("productStockFilter")?.value || "";

  const filtered = [...allProducts].filter((product) => {
    const haystack = [
      product.name,
      product.description,
      product.price,
      product.stock,
      product.sold,
      product.sort_order,
      product.id
    ].join(" ").toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const key = stockState(product.stock);
    const matchesStock = !stockFilter || key === stockFilter;

    return matchesSearch && matchesStock;
  });

  filtered.sort((a, b) => {
    switch (sort) {
      case "sort-order":
        return Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(b.id || 0) - Number(a.id || 0);
      case "oldest":
        return Number(a.id) - Number(b.id);
      case "name-asc":
        return String(a.name || "").localeCompare(String(b.name || ""));
      case "name-desc":
        return String(b.name || "").localeCompare(String(a.name || ""));
      case "price-asc":
        return Number(a.price || 0) - Number(b.price || 0);
      case "price-desc":
        return Number(b.price || 0) - Number(a.price || 0);
      case "stock-asc":
        return Number(a.stock || 0) - Number(b.stock || 0);
      case "stock-desc":
        return Number(b.stock || 0) - Number(a.stock || 0);
      case "newest":
      default:
        return Number(b.id) - Number(a.id);
    }
  });

  renderProducts(filtered);
  syncAllProductFreeGiftFields();
}

async function logoutAdmin() {
  try {
    await fetch("/api/admin-logout", {
      method: "POST",
      headers: {
        "x-admin-token": localStorage.getItem("adminToken") || ""
      }
    });
  } catch (error) {
    console.error("Logout request failed:", error);
  } finally {
    localStorage.removeItem("adminToken");
    window.location.href = "admin-login.html";
  }
}

async function loadVariantsForProducts(products) {
  const results = await Promise.allSettled(products.map(async (product) => {
    const response = await fetch(`/api/product-variants/${Number(product.id)}`, {
      headers: getAdminHeaders()
    });

    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) {
        throw new Error("Unauthorized");
      }
      throw new Error(payload.error || `Failed to load variants for product #${product.id}`);
    }

    return [String(product.id), Array.isArray(payload) ? payload : []];
  }));

  const nextMap = {};
  let failedCount = 0;

  results.forEach((result, index) => {
    const productId = String(products[index]?.id || "");
    if (!productId) return;

    if (result.status === "fulfilled") {
      nextMap[productId] = result.value[1];
      return;
    }

    failedCount += 1;
    nextMap[productId] = [];
    console.error(`Failed to load variants for product #${productId}:`, result.reason);
  });

  variantsByProductId = nextMap;
  return { failedCount };
}

async function loadImagesForProducts(products) {
  const results = await Promise.allSettled(products.map(async (product) => {
    const response = await fetch(`/api/product-images/${Number(product.id)}`, {
      headers: getAdminHeaders()
    });

    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) {
        throw new Error("Unauthorized");
      }
      throw new Error(payload.error || `Failed to load images for product #${product.id}`);
    }

    return [String(product.id), Array.isArray(payload) ? payload : []];
  }));

  const nextMap = {};
  let failedCount = 0;

  results.forEach((result, index) => {
    const productId = String(products[index]?.id || "");
    if (!productId) return;

    if (result.status === "fulfilled") {
      nextMap[productId] = result.value[1];
      return;
    }

    failedCount += 1;
    nextMap[productId] = [];
    console.error(`Failed to load images for product #${productId}:`, result.reason);
  });

  imagesByProductId = nextMap;
  return { failedCount };
}

async function loadGiftOptionsForProducts(products) {
  const results = await Promise.allSettled(products.map(async (product) => {
    const response = await fetch(`/api/product-gift-options/${Number(product.id)}`, {
      headers: getAdminHeaders()
    });

    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) {
        throw new Error("Unauthorized");
      }
      throw new Error(payload.error || `Failed to load gift offers for product #${product.id}`);
    }

    return [String(product.id), Array.isArray(payload) ? payload : []];
  }));

  const nextMap = {};
  let failedCount = 0;

  results.forEach((result, index) => {
    const productId = String(products[index]?.id || "");
    if (!productId) return;

    if (result.status === "fulfilled") {
      nextMap[productId] = result.value[1];
      return;
    }

    failedCount += 1;
    nextMap[productId] = [];
    console.error(`Failed to load gift offers for product #${productId}:`, result.reason);
  });

  giftOptionsByProductId = nextMap;
  return { failedCount };
}

async function loadExtendedProductDetails(products) {
  const results = await Promise.allSettled(products.map((product) => loadAdminProductFull(product.id)));

  const nextBundleSlots = {};
  const nextPricingRules = {};
  const nextDiscountRules = {};
  const nextPromoCodes = {};
  let failedCount = 0;

  results.forEach((result, index) => {
    const product = products[index];
    const productId = String(product?.id || "");
    if (!productId) return;

    if (result.status !== "fulfilled" || !result.value) {
      failedCount += 1;
      nextBundleSlots[productId] = [];
      nextPricingRules[productId] = { pricing_type: "sum", amount: 0 };
      nextDiscountRules[productId] = {
        discount_type: "none",
        amount: 0,
        applies_to: "product",
        is_active: false,
        starts_at: "",
        ends_at: ""
      };
      nextPromoCodes[productId] = [];
      return;
    }

    const detail = result.value;
    nextBundleSlots[productId] = Array.isArray(detail.bundle_slots) ? detail.bundle_slots : [];
    nextPricingRules[productId] = detail.pricing_rule || { pricing_type: "sum", amount: 0 };
    nextDiscountRules[productId] = detail.discount_rule || {
      discount_type: "none",
      amount: 0,
      applies_to: "product",
      is_active: false,
      starts_at: "",
      ends_at: ""
    };
    nextPromoCodes[productId] = Array.isArray(detail.promo_codes) ? detail.promo_codes : [];
  });

  bundleSlotsByProductId = nextBundleSlots;
  pricingRulesByProductId = nextPricingRules;
  discountRulesByProductId = nextDiscountRules;
  promoCodesByProductId = nextPromoCodes;
  return { failedCount };
}

async function loadProducts() {
  const list = document.getElementById("productList");
  if (list) {
    list.innerHTML = `<p class="empty-state">Loading products...</p>`;
  }

  try {
    const res = await fetch("/api/products");
    const products = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(products.error || "Failed to load products");
    }

    allProducts = Array.isArray(products) ? products : [];
    const [variantLoad, imageLoad, giftOptionLoad, detailLoad] = await Promise.all([
      loadVariantsForProducts(allProducts),
      loadImagesForProducts(allProducts),
      loadGiftOptionsForProducts(allProducts),
      loadExtendedProductDetails(allProducts)
    ]);
    updateStats(allProducts);
    populateAddProductGiftOptions();
    applyProductFilters();
    loadAdminProducts();

    const failedLoads =
      Number(variantLoad?.failedCount || 0) +
      Number(imageLoad?.failedCount || 0) +
      Number(giftOptionLoad?.failedCount || 0) +
      Number(detailLoad?.failedCount || 0);
    if (failedLoads > 0) {
      showToast("Products loaded, but some images, variants, bundle rules, or promos could not be fetched.", "info");
    }
  } catch (error) {
    console.error("Failed to load products:", error);
    if (list) {
      list.innerHTML = `<p class="empty-state">Failed to load products.</p>`;
    }
    showToast(error.message || "Failed to load products", "error");
  }
}

async function addProduct() {
  try {
    const token = localStorage.getItem("adminToken") || "";
    const fileInput = getAddProductField("imageFile");
    const files = Array.from(fileInput?.files || []);
    const name = getAddProductField("product-name", "name")?.value || "";
    const price = document.getElementById("price")?.value || "";
    const stock = document.getElementById("stock")?.value || "";
    const sold = document.getElementById("sold")?.value || "";
    const description = getAddProductField("product-description", "description")?.value || "";
    const sort_order = document.getElementById("sortOrder")?.value || "0";
    const size_options = readSizeOptionsFromInputs(document, "size-");
    const sizePrices = readSizePriceInputs(document, "size-price-");
    const is_featured = Boolean(document.getElementById("product-is-featured")?.checked);
    const featured_order = getAddProductField("product-featured-order", "featured-order")?.value || "0";
    const image_url = getAddProductField("product-image-url")?.value || "";
    const product_type = getAddProductField("product-type")?.value || "single";
    const is_active = Boolean(getAddProductField("product-is-active")?.checked);
    const free_gift_enabled = Boolean(document.getElementById("freeGiftEnabled")?.checked);
    const free_gift_product_id = document.getElementById("freeGiftProductId")?.value || "";
    const free_gift_min_quantity = document.getElementById("freeGiftMinQuantity")?.value || "1";
    const free_gift_quantity = document.getElementById("freeGiftQuantity")?.value || "1";

    const createRes = await fetch("/api/add-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token
      },
      body: JSON.stringify({
        name,
        price,
        stock,
        sold,
        description,
        image_url,
        sort_order,
        product_type,
        is_featured,
        featured_order,
        is_active,
        size_options,
        ...sizePrices,
        free_gift_enabled,
        free_gift_product_id,
        free_gift_min_quantity,
        free_gift_quantity
      })
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      if (handleUnauthorized(createRes.status)) return;
      throw new Error(createData.error || "Failed to add product");
    }

    const productId = Number(createData.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("Product was created, but no valid product ID was returned.");
    }

    if (files.length > 0) {
      const formData = new FormData();
      formData.append("product_id", String(productId));

      files.forEach((file) => {
        formData.append("images", file);
      });

      const imageRes = await fetch("/api/add-product-images", {
        method: "POST",
        headers: {
          "x-admin-token": token
        },
        body: formData
      });

      const imageData = await imageRes.json();

      if (!imageRes.ok) {
        if (handleUnauthorized(imageRes.status)) return;
        throw new Error(imageData.error || "Product created, but failed to upload images");
      }
    }

    getAddProductField("product-id").value = "";
    getAddProductField("product-name", "name").value = "";
    document.getElementById("price").value = "";
    getAddProductField("product-description", "description").value = "";
    document.getElementById("stock").value = "";
    document.getElementById("sold").value = "";
    document.getElementById("sortOrder").value = "0";
    document.getElementById("size-small").checked = true;
    document.getElementById("size-medium").checked = true;
    document.getElementById("size-large").checked = true;
    document.getElementById("size-price-small").value = "";
    document.getElementById("size-price-medium").value = "";
    document.getElementById("size-price-large").value = "";
    document.getElementById("product-is-featured").checked = false;
    getAddProductField("product-featured-order", "featured-order").value = "0";
    getAddProductField("product-image-url").value = "";
    getAddProductField("product-type").value = "single";
    getAddProductField("product-is-active").checked = true;
    document.getElementById("freeGiftEnabled").checked = false;
    document.getElementById("freeGiftProductId").value = "";
    document.getElementById("freeGiftMinQuantity").value = "1";
    document.getElementById("freeGiftQuantity").value = "1";
    document.getElementById("imageFile").value = "";
    document.getElementById("variant-list").innerHTML = "";
    document.getElementById("bundle-slot-list").innerHTML = "";
    document.getElementById("pricing-type").value = "sum";
    document.getElementById("pricing-amount").value = "0";
    setPreview("addImagePreview", "");
    syncAddProductFreeGiftFields();
    syncProductTypeSections();

    showToast("Product added!", "success");
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error adding product", "error");
  }
}

async function updateProduct(id) {
  const name = document.getElementById(`name-${id}`)?.value.trim();
  const product_type = document.getElementById(`product-type-${id}`)?.value || "single";
  const is_active = Boolean(document.getElementById(`active-${id}`)?.checked);
  const price = document.getElementById(`price-${id}`)?.value;
  const description = document.getElementById(`desc-${id}`)?.value.trim();
  const stock = document.getElementById(`stock-${id}`)?.value;
  const sold = document.getElementById(`sold-${id}`)?.value;
  const sort_order = document.getElementById(`sort-order-${id}`)?.value || "0";
  const size_options = readSizeOptionsFromInputs(document, `size-${id}-`);
  const sizePrices = readSizePriceInputs(document, `size-price-${id}-`);
  const is_featured = Boolean(document.getElementById(`featured-${id}`)?.checked);
  const featured_order = document.getElementById(`featured-order-${id}`)?.value || "0";
  const image_url = document.getElementById(`image-${id}`)?.value.trim();
  const free_gift_enabled = Boolean(document.getElementById(`gift-enabled-${id}`)?.checked);
  const free_gift_product_id = document.getElementById(`gift-product-${id}`)?.value || "";
  const free_gift_min_quantity = document.getElementById(`gift-min-${id}`)?.value || "1";
  const free_gift_quantity = document.getElementById(`gift-qty-${id}`)?.value || "1";
  const bundle_slots = collectBundleSlotsForProductCard(id);
  const pricing_rule = collectPricingRuleForProductCard(id);
  const discount_rule = collectDiscountRuleForProductCard(id);
  const promo_codes = collectPromoCodesForProductCard(id);

  if (!name) {
    showToast("Product name cannot be empty.", "error");
    return;
  }

  try {
    const res = await fetch("/api/update-product", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        id,
        name,
        product_type,
        is_active,
        price,
        description,
        image_url,
        stock,
        sold,
        sort_order,
        is_featured,
        featured_order,
        size_options,
        ...sizePrices,
        bundle_slots,
        pricing_rule,
        discount_rule,
        promo_codes,
        free_gift_enabled,
        free_gift_product_id,
        free_gift_min_quantity,
        free_gift_quantity
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Update failed");
    }

    showToast("Product updated.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Update product failed:", error);
    showToast(error.message || "Failed to update product", "error");
  }
}

async function deleteProduct(id) {
  const ok = confirm("Delete this product?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Delete failed");
    }

    showToast("Product deleted.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Delete product failed:", error);
    showToast(error.message || "Failed to delete product", "error");
  }
}

function readGiftOfferPayload(container, productId, giftOptionId = null) {
  const offer_name = container.querySelector(".js-gift-offer-name, .js-new-gift-offer-name")?.value.trim() || "";
  const gift_product_id = container.querySelector(".js-gift-offer-product, .js-new-gift-offer-product")?.value || "";
  const min_units = container.querySelector(".js-gift-offer-min-units, .js-new-gift-offer-min-units")?.value || "1";
  const gift_quantity = container.querySelector(".js-gift-offer-quantity, .js-new-gift-offer-quantity")?.value || "1";
  const extra_price = container.querySelector(".js-gift-offer-price, .js-new-gift-offer-price")?.value || "0";
  const sort_order = container.querySelector(".js-gift-offer-sort, .js-new-gift-offer-sort")?.value || "0";
  const is_active = Boolean(container.querySelector(".js-gift-offer-active, .js-new-gift-offer-active")?.checked);

  return {
    id: giftOptionId ? Number(giftOptionId) : undefined,
    product_id: Number(productId),
    offer_name,
    gift_product_id,
    min_units,
    gift_quantity,
    extra_price,
    sort_order,
    is_active
  };
}

async function addGiftOffer(productId, container) {
  try {
    const payload = readGiftOfferPayload(container, productId);

    const res = await fetch("/api/add-product-gift-option", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to add gift offer");
    }

    showToast("Gift offer added.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Add gift offer failed:", error);
    showToast(error.message || "Failed to add gift offer", "error");
  }
}

async function updateGiftOffer(productId, giftOptionId, container) {
  try {
    const payload = readGiftOfferPayload(container, productId, giftOptionId);

    const res = await fetch("/api/update-product-gift-option", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to update gift offer");
    }

    showToast("Gift offer updated.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Update gift offer failed:", error);
    showToast(error.message || "Failed to update gift offer", "error");
  }
}

async function deleteGiftOffer(giftOptionId) {
  const ok = confirm("Delete this gift offer?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product-gift-option", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id: Number(giftOptionId) })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to delete gift offer");
    }

    showToast("Gift offer deleted.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Delete gift offer failed:", error);
    showToast(error.message || "Failed to delete gift offer", "error");
  }
}

async function uploadVariantImageIfNeeded(container, fileSelector) {
  const fileInput = container.querySelector(fileSelector);
  const file = fileInput?.files?.[0];

  if (!file) {
    return null;
  }

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/api/upload-product-variant-image", {
    method: "POST",
    headers: getAdminHeaders(),
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    if (handleUnauthorized(res.status)) return null;
    throw new Error(data.error || "Failed to upload variant image");
  }

  return String(data.image_url || "").trim();
}

async function readVariantPayload(container, productId, options = {}) {
  const variantId = Number(options.variantId || 0);
  const name = container.querySelector(options.nameSelector)?.value.trim() || "";
  const price = Number(container.querySelector(options.priceSelector)?.value || 0);
  const bundleExtraPrice = Number(container.querySelector(options.bundleExtraPriceSelector)?.value || 0);
  const stock = Number(container.querySelector(options.stockSelector)?.value || 0);
  let imageUrl = container.querySelector(options.imageUrlSelector)?.value.trim() || "";
  const sortOrder = Number(container.querySelector(options.sortSelector)?.value || 0);
  const isActive = Boolean(container.querySelector(options.activeSelector)?.checked);

  if (!name) {
    throw new Error("Size name cannot be empty.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Size price must be 0 or greater.");
  }

  if (!Number.isFinite(bundleExtraPrice) || bundleExtraPrice < 0) {
    throw new Error("Bundle surcharge must be 0 or greater.");
  }

  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Size stock must be a whole number of 0 or greater.");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error("Size sort order must be 0 or greater.");
  }

  const uploadedImageUrl = await uploadVariantImageIfNeeded(container, options.imageFileSelector);
  if (uploadedImageUrl) {
    imageUrl = uploadedImageUrl;
    const imageUrlInput = container.querySelector(options.imageUrlSelector);
    if (imageUrlInput) {
      imageUrlInput.value = uploadedImageUrl;
    }
  }

  const payload = {
    product_id: Number(productId),
    name,
    units: 1,
    discount_percent: 0,
    discount_amount: 0,
    price,
    bundle_extra_price: bundleExtraPrice,
    stock,
    image_url: imageUrl,
    is_active: isActive,
    sort_order: sortOrder
  };

  if (variantId) {
    payload.id = variantId;
  }

  return payload;
}

async function addVariant(productId, container) {
  try {
    const payload = await readVariantPayload(container, productId, {
      nameSelector: ".js-new-variant-name",
      priceSelector: ".js-new-variant-price",
      bundleExtraPriceSelector: ".js-new-variant-bundle-extra-price",
      stockSelector: ".js-new-variant-stock",
      imageUrlSelector: ".js-new-variant-image-url",
      imageFileSelector: ".js-new-variant-image-file",
      sortSelector: ".js-new-variant-sort",
      activeSelector: ".js-new-variant-active"
    });

    const res = await fetch("/api/add-product-variant", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to add variant");
    }

    showToast("Size added.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Add variant failed:", error);
    showToast(error.message || "Failed to add size", "error");
  }
}

async function updateVariant(productId, variantId, container) {
  try {
    const payload = await readVariantPayload(container, productId, {
      variantId,
      nameSelector: ".js-variant-name",
      priceSelector: ".js-variant-price",
      bundleExtraPriceSelector: ".js-variant-bundle-extra-price",
      stockSelector: ".js-variant-stock",
      imageUrlSelector: ".js-variant-image-url",
      imageFileSelector: ".js-variant-image-file",
      sortSelector: ".js-variant-sort",
      activeSelector: ".js-variant-active"
    });

    const res = await fetch("/api/update-product-variant", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to update variant");
    }

    showToast("Size updated.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Update variant failed:", error);
    showToast(error.message || "Failed to update size", "error");
  }
}

async function deleteVariant(variantId) {
  const ok = confirm("Delete this variant?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product-variant", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id: variantId })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to delete variant");
    }

    showToast("Size deleted.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Delete variant failed:", error);
    showToast(error.message || "Failed to delete size", "error");
  }
}

function readImagePayload(container, productId, imageId) {
  const imageUrl = container.querySelector(".js-image-url")?.value.trim() || "";
  const sortOrder = Number(container.querySelector(".js-image-sort-order")?.value || 0);

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error("Image sort order must be 0 or greater.");
  }

  return {
    id: Number(imageId),
    product_id: Number(productId),
    image_url: imageUrl,
    sort_order: sortOrder
  };
}

async function uploadProductImages(productId, container) {
  try {
    const files = Array.from(container.querySelector(".js-product-image-files")?.files || []);
    if (files.length === 0) {
      throw new Error("Please choose one or more images to upload.");
    }

    const formData = new FormData();
    formData.append("product_id", String(productId));
    files.forEach((file) => {
      formData.append("images", file);
    });

    const res = await fetch("/api/add-product-images", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to upload product images");
    }

    showToast("Product images uploaded.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Upload product images failed:", error);
    showToast(error.message || "Failed to upload product images", "error");
  }
}

async function updateProductImage(productId, imageId, container) {
  try {
    const payload = readImagePayload(container, productId, imageId);

    const res = await fetch("/api/update-product-image", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to update product image");
    }

    showToast("Product image updated.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Update product image failed:", error);
    showToast(error.message || "Failed to update product image", "error");
  }
}

async function setPrimaryProductImage(productId, imageId) {
  try {
    const res = await fetch("/api/set-primary-product-image", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        product_id: Number(productId),
        id: Number(imageId)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to set primary image");
    }

    showToast("Primary image updated.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Set primary image failed:", error);
    showToast(error.message || "Failed to set primary image", "error");
  }
}

async function deleteProductImage(imageId) {
  const ok = confirm("Delete this product image?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product-image", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id: Number(imageId) })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to delete product image");
    }

    showToast("Product image deleted.", "success");
    await loadProducts();
  } catch (error) {
    console.error("Delete product image failed:", error);
    showToast(error.message || "Failed to delete product image", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnTop = document.getElementById("logoutBtnTop");
  const addProductBtn = document.getElementById("addProductBtn");
  const addVariantRowBtn = document.getElementById("addVariantRowBtn");
  const addBundleSlotRowBtn = document.getElementById("addBundleSlotRowBtn");
  const addPromoCodeRowBtn = document.getElementById("addPromoCodeRowBtn");
  const variantPresetButtons = document.querySelectorAll(".variant-preset-btn");
  const productTypeInput = document.getElementById("product-type");
  const productNameInput = getAddProductField("product-name", "name");
  const refreshProductsBtn = document.getElementById("refreshProductsBtn");
  const productList = document.getElementById("productList");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutAdmin);
  }

  if (logoutBtnTop) {
    logoutBtnTop.addEventListener("click", logoutAdmin);
  }

  if (addProductBtn) {
    addProductBtn.addEventListener("click", saveProduct);
  }

  if (addVariantRowBtn) {
    addVariantRowBtn.addEventListener("click", () => addVariantRow());
  }

  variantPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const size = String(button.dataset.size || "").trim();
      const exists = [...document.querySelectorAll(".variant-size")]
        .some((input) => input.value.trim().toLowerCase() === size.toLowerCase());

      if (exists) {
        alert(`${size} already exists`);
        return;
      }

      addVariantRow(size, "", "");
    });
  });

  if (addBundleSlotRowBtn) {
    addBundleSlotRowBtn.addEventListener("click", () => addBundleSlotRow());
  }

  if (addPromoCodeRowBtn) {
    addPromoCodeRowBtn.addEventListener("click", () => addPromoCodeDraft());
  }

  if (productTypeInput) {
    productTypeInput.addEventListener("change", toggleProductTypeSections);
  }

  if (productNameInput) {
    productNameInput.addEventListener("input", syncBundleExtraPricingSection);
  }

  if (refreshProductsBtn) {
    refreshProductsBtn.addEventListener("click", loadProducts);
  }

  document.getElementById("freeGiftEnabled")?.addEventListener("change", syncAddProductFreeGiftFields);

  productList?.addEventListener("click", (event) => {
    const saveBtn = event.target.closest(".product-save-btn");
    if (saveBtn) {
      const productId = Number(saveBtn.dataset.productId);
      if (productId) {
        updateProduct(productId);
      }
      return;
    }

    const deleteBtn = event.target.closest(".product-delete-btn");
    if (deleteBtn) {
      const productId = Number(deleteBtn.dataset.productId);
      if (productId) {
        deleteProduct(productId);
      }
      return;
    }

    const addGiftOfferBtn = event.target.closest(".js-add-gift-offer-btn");
    if (addGiftOfferBtn) {
      const productId = Number(addGiftOfferBtn.dataset.productId);
      const container = addGiftOfferBtn.closest(".variant-add-card");
      if (productId && container) {
        addGiftOffer(productId, container);
      }
      return;
    }

    const addProductBundleSlotBtn = event.target.closest(".js-add-product-bundle-slot-btn");
    if (addProductBundleSlotBtn) {
      const productId = Number(addProductBundleSlotBtn.dataset.productId);
      const host = document.getElementById(`product-bundle-slot-list-${productId}`);
      if (productId && host) {
        const emptyState = host.querySelector(".variant-empty");
        if (emptyState) emptyState.remove();
        host.appendChild(createExistingProductBundleSlotRow(productId));
      }
      return;
    }

    const removeProductBundleSlotBtn = event.target.closest(".js-remove-product-bundle-slot-btn");
    if (removeProductBundleSlotBtn) {
      const row = removeProductBundleSlotBtn.closest(".js-product-bundle-slot-row");
      const productId = Number(row?.dataset.productId || 0);
      row?.remove();
      const host = document.getElementById(`product-bundle-slot-list-${productId}`);
      if (productId && host && !host.querySelector(".js-product-bundle-slot-row")) {
        host.innerHTML = `<p class="variant-empty">No bundle slots yet.</p>`;
      }
      return;
    }

    const addProductPromoBtn = event.target.closest(".js-add-product-promo-btn");
    if (addProductPromoBtn) {
      const productId = Number(addProductPromoBtn.dataset.productId);
      const host = document.getElementById(`product-promo-list-${productId}`);
      if (productId && host) {
        const emptyState = host.querySelector(".variant-empty");
        if (emptyState) emptyState.remove();
        host.appendChild(createExistingProductPromoRow(productId, { is_active: true }));
      }
      return;
    }

    const removeProductPromoBtn = event.target.closest(".js-remove-product-promo-btn");
    if (removeProductPromoBtn) {
      const row = removeProductPromoBtn.closest(".js-product-promo-row");
      const productId = Number(row?.dataset.productId || 0);
      row?.remove();
      const host = document.getElementById(`product-promo-list-${productId}`);
      if (productId && host && !host.querySelector(".js-product-promo-row")) {
        host.innerHTML = `<p class="variant-empty">No promo codes yet.</p>`;
      }
      return;
    }

    const removePromoBtn = event.target.closest(".js-remove-promo-code-btn");
    if (removePromoBtn) {
      const clientId = String(removePromoBtn.dataset.clientId || "");
      promoCodeDrafts = promoCodeDrafts.filter((promo) => promo.client_id !== clientId);
      renderPromoCodeRows();
      return;
    }

    const saveGiftOfferBtn = event.target.closest(".js-save-gift-offer-btn");
    if (saveGiftOfferBtn) {
      const productId = Number(saveGiftOfferBtn.dataset.productId);
      const giftOptionId = Number(saveGiftOfferBtn.dataset.giftOptionId);
      const container = saveGiftOfferBtn.closest(".variant-row");
      if (productId && giftOptionId && container) {
        updateGiftOffer(productId, giftOptionId, container);
      }
      return;
    }

    const deleteGiftOfferBtn = event.target.closest(".js-delete-gift-offer-btn");
    if (deleteGiftOfferBtn) {
      const giftOptionId = Number(deleteGiftOfferBtn.dataset.giftOptionId);
      if (giftOptionId) {
        deleteGiftOffer(giftOptionId);
      }
      return;
    }

    const uploadImagesBtn = event.target.closest(".js-upload-images-btn");
    if (uploadImagesBtn) {
      const productId = Number(uploadImagesBtn.dataset.productId);
      const container = uploadImagesBtn.closest(".image-upload-card");
      if (productId && container) {
        uploadProductImages(productId, container);
      }
      return;
    }

    const saveImageBtn = event.target.closest(".js-save-image-btn");
    if (saveImageBtn) {
      const productId = Number(saveImageBtn.dataset.productId);
      const imageId = Number(saveImageBtn.dataset.imageId);
      const container = saveImageBtn.closest(".image-card");
      if (productId && imageId && container) {
        updateProductImage(productId, imageId, container);
      }
      return;
    }

    const setPrimaryBtn = event.target.closest(".js-set-primary-image-btn");
    if (setPrimaryBtn) {
      const productId = Number(setPrimaryBtn.dataset.productId);
      const imageId = Number(setPrimaryBtn.dataset.imageId);
      if (productId && imageId) {
        setPrimaryProductImage(productId, imageId);
      }
      return;
    }

    const deleteImageBtn = event.target.closest(".js-delete-image-btn");
    if (deleteImageBtn) {
      const imageId = Number(deleteImageBtn.dataset.imageId);
      if (imageId) {
        deleteProductImage(imageId);
      }
      return;
    }

    const addVariantBtn = event.target.closest(".js-add-variant-btn");
    if (addVariantBtn) {
      const productId = Number(addVariantBtn.dataset.productId);
      const container = addVariantBtn.closest(".variant-add-card");
      if (productId && container) {
        addVariant(productId, container);
      }
      return;
    }

    const saveVariantBtn = event.target.closest(".js-save-variant-btn");
    if (saveVariantBtn) {
      const productId = Number(saveVariantBtn.dataset.productId);
      const variantId = Number(saveVariantBtn.dataset.variantId);
      const container = saveVariantBtn.closest(".variant-row");
      if (productId && variantId && container) {
        updateVariant(productId, variantId, container);
      }
      return;
    }

    const deleteVariantBtn = event.target.closest(".js-delete-variant-btn");
    if (deleteVariantBtn) {
      const variantId = Number(deleteVariantBtn.dataset.variantId);
      if (variantId) {
        deleteVariant(variantId);
      }
      return;
    }

    const freeGiftToggle = event.target.closest('input[id^="gift-enabled-"]');
    if (freeGiftToggle) {
      const productId = Number(String(freeGiftToggle.id).replace("gift-enabled-", ""));
      if (productId) {
        syncProductFreeGiftFields(productId);
      }
      return;
    }

    const productTypeSelect = event.target.closest(".js-product-type-select");
    if (productTypeSelect) {
      const productId = Number(productTypeSelect.dataset.productId);
      if (productId) {
        syncExistingProductTypeSections(productId);
      }
    }
  });

  productList?.addEventListener("change", (event) => {
    const freeGiftToggle = event.target.closest('input[id^="gift-enabled-"]');
    if (freeGiftToggle) {
      const productId = Number(String(freeGiftToggle.id).replace("gift-enabled-", ""));
      if (productId) {
        syncProductFreeGiftFields(productId);
      }
      return;
    }

    const productTypeSelect = event.target.closest(".js-product-type-select");
    if (productTypeSelect) {
      const productId = Number(productTypeSelect.dataset.productId);
      if (productId) {
        syncExistingProductTypeSections(productId);
      }
    }
  });

  wireAddPreview();
  document.getElementById("productSearchInput")?.addEventListener("input", applyProductFilters);
  document.getElementById("productSortSelect")?.addEventListener("change", applyProductFilters);
  document.getElementById("productStockFilter")?.addEventListener("change", applyProductFilters);
  resetProductForm();
  syncAddProductFreeGiftFields();
  toggleProductTypeSections();
  loadProducts();
});

window.addVariantRow = addVariantRow;
window.addBundleSlotRow = addBundleSlotRow;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.loadAdminProducts = loadAdminProducts;
