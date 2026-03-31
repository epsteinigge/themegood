const MIX_800G_PRICE = 103;
const MIX_300G_PWP_PRICE = 27;
const DISCOUNTED_FIFTH_MIX_PRICE = 54;
const QUALIFYING_PASSION_BEETROOT_800G_PRICE = 98;
const QUALIFYING_DISCOUNTED_FIFTH_PASSION_PRICE = 49;

function roundMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeSizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function getCanonicalBundleSize(value) {
  const normalized = normalizeSizeName(value);
  if (
    normalized === "small" ||
    normalized === "300g" ||
    normalized.includes("300g") ||
    normalized.includes("300gm")
  ) return "300g";
  if (
    normalized === "medium" ||
    normalized === "600g" ||
    normalized.includes("600g") ||
    normalized.includes("600gm")
  ) return "600g";
  if (
    normalized === "large" ||
    normalized === "800g" ||
    normalized.includes("800g") ||
    normalized.includes("800gm")
  ) return "800g";
  return String(value || "").trim();
}

function isCocoaFlavor(value) {
  return normalizeText(value).includes("cocoa");
}

function isPassionBeetrootFlavor(value) {
  const normalized = normalizeText(value);
  return normalized.includes("passion") && normalized.includes("beetroot");
}

function isNoSurchargeMixFlavor(value) {
  return Boolean(normalizeText(value)) && !isCocoaFlavor(value);
}

function detectBundlePricingProfile(bundleName = "", slots = []) {
  const sizes = (Array.isArray(slots) ? slots : [])
    .map((slot) => getCanonicalBundleSize(slot?.required_size || slot))
    .filter(Boolean);

  const count800g = sizes.filter((size) => size === "800g").length;
  const count300g = sizes.filter((size) => size === "300g").length;
  const count600g = sizes.filter((size) => size === "600g").length;

  if (sizes.length === 3 && count800g === 2 && count300g === 1 && count600g === 0) {
    return "two_800g_one_300g";
  }

  if (sizes.length === 5 && count800g === 5) {
    return "five_800g_discounted";
  }

  if (sizes.length === 7 && count800g === 7) {
    return "six_plus_one_800g";
  }

  if (sizes.length === 15 && count800g === 15) {
    return "twelve_plus_three_800g";
  }

  return "legacy";
}

function getFreeCanSlotCount(profile) {
  if (profile === "six_plus_one_800g") return 1;
  if (profile === "twelve_plus_three_800g") return 3;
  return 0;
}

function isFreeCanSlot(slotIndex, slots = [], profile = detectBundlePricingProfile("", slots)) {
  const freeCanSlotCount = getFreeCanSlotCount(profile);
  if (freeCanSlotCount <= 0) return false;
  return Number(slotIndex) >= Math.max(0, slots.length - freeCanSlotCount);
}

function validateFreeCanFlavor(flavorName) {
  if (isCocoaFlavor(flavorName)) {
    return {
      valid: false,
      error: "Free can slots cannot use Cocoa flavour."
    };
  }

  return { valid: true, error: "" };
}

function getConfiguredBundleSurcharge(selectionOrOptions = {}) {
  const rawValue = selectionOrOptions?.bundle_extra_price ?? selectionOrOptions?.configured_bundle_extra_price ?? selectionOrOptions?.configuredAmount ?? 0;
  const amount = Number(rawValue);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

function get800gBundleUnitPrice(flavorName, options = {}) {
  const qualifiesForPassionDiscount = Boolean(options.qualifiesForPassionDiscount);
  let price = MIX_800G_PRICE;

  if (qualifiesForPassionDiscount && isPassionBeetrootFlavor(flavorName) && !isCocoaFlavor(flavorName)) {
    price = QUALIFYING_PASSION_BEETROOT_800G_PRICE;
  }

  return roundMoney(price + getConfiguredBundleSurcharge(options));
}

function get300gBundleUnitPrice(flavorName, options = {}) {
  return roundMoney(MIX_300G_PWP_PRICE + getConfiguredBundleSurcharge(options));
}

function getDiscountedFifthCanPrice(flavorName, options = {}) {
  const qualifiesForPassionDiscount = Boolean(options.qualifiesForPassionDiscount);
  let price = DISCOUNTED_FIFTH_MIX_PRICE;

  if (qualifiesForPassionDiscount && isPassionBeetrootFlavor(flavorName) && !isCocoaFlavor(flavorName)) {
    price = QUALIFYING_DISCOUNTED_FIFTH_PASSION_PRICE;
  }

  return roundMoney(price + getConfiguredBundleSurcharge(options));
}

function getBundleBasePrice(profile, configuredPrice, slots = []) {
  const parsedConfiguredPrice = Number(configuredPrice);
  if (Number.isFinite(parsedConfiguredPrice) && parsedConfiguredPrice >= 0) {
    return roundMoney(parsedConfiguredPrice);
  }

  switch (profile) {
    case "two_800g_one_300g":
      return roundMoney((MIX_800G_PRICE * 2) + MIX_300G_PWP_PRICE);
    case "five_800g_discounted":
      return roundMoney((MIX_800G_PRICE * 4) + DISCOUNTED_FIFTH_MIX_PRICE);
    case "six_plus_one_800g":
      return roundMoney(MIX_800G_PRICE * 6);
    case "twelve_plus_three_800g":
      return roundMoney(MIX_800G_PRICE * 12);
    default:
      return 0;
  }
}

function getBundleOptionDisplayAdjustment({ profile, sizeName, flavorName, configuredAmount = 0 }) {
  const canonicalSize = getCanonicalBundleSize(sizeName);
  const parsedConfiguredAmount = Number(configuredAmount);
  if (profile === "legacy" || profile === "two_800g_one_300g" || profile === "five_800g_discounted" || profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") {
    return Number.isFinite(parsedConfiguredAmount) && parsedConfiguredAmount > 0
      ? roundMoney(parsedConfiguredAmount)
      : 0;
  }

  return 0;
}

function findDiscountedFifthCanIndex(selections = []) {
  const plainMixIndex = selections.findIndex(
    (selection) => !selection.isCocoa && !selection.isPassionBeetroot
  );
  if (plainMixIndex >= 0) return plainMixIndex;

  const nonCocoaIndex = selections.findIndex((selection) => !selection.isCocoa);
  if (nonCocoaIndex >= 0) return nonCocoaIndex;

  return selections.length > 0 ? 0 : -1;
}

function buildSelectionRow(slot, selection, slotIndex) {
  const label = String(selection?.label || selection?.product_name || "").trim();
  const size = getCanonicalBundleSize(selection?.size_name || selection?.size || slot?.required_size || "");
  const bundleExtraPrice = roundMoney(selection?.bundle_extra_price || selection?.configured_bundle_extra_price || 0);

  return {
    slot_id: Number(slot?.id || selection?.slot_id || slotIndex + 1),
    slot_label: String(slot?.slot_label || selection?.slot_label || `Slot ${slotIndex + 1}`).trim(),
    label,
    product_name: label,
    size,
    bundle_extra_price: bundleExtraPrice,
    isCocoa: isCocoaFlavor(label),
    isPassionBeetroot: isPassionBeetrootFlavor(label)
  };
}

function calculateBundleTotal({ bundleName = "", bundlePrice = 0, slots = [], selections = [] } = {}) {
  const normalizedSlots = (Array.isArray(slots) ? slots : []).map((slot, index) => ({
    ...slot,
    required_size: getCanonicalBundleSize(slot?.required_size || ""),
    __index: index
  }));

  let profile = detectBundlePricingProfile(bundleName, normalizedSlots);
  const basePrice = getBundleBasePrice(profile, bundlePrice, normalizedSlots);
  const orderedSelections = normalizedSlots.map((slot, index) => {
    const matchingSelection = (Array.isArray(selections) ? selections : []).find((selection) => {
      const slotId = Number(selection?.slot_id);
      return Number.isFinite(slotId) && slotId > 0 && slotId === Number(slot.id);
    }) || selections[index] || {};

    return buildSelectionRow(slot, matchingSelection, index);
  });

  if (profile === "legacy") {
    const derivedProfile = detectBundlePricingProfile(
      bundleName,
      orderedSelections.map((selection) => selection.size)
    );
    if (derivedProfile !== "legacy") {
      profile = derivedProfile;
    }
  }

  const validationErrors = [];
  orderedSelections.forEach((selection, index) => {
    const slot = normalizedSlots[index];
    if (slot?.required_size && selection.size && slot.required_size !== selection.size) {
      validationErrors.push(`${slot.slot_label || `Slot ${index + 1}`} requires ${slot.required_size}.`);
    }

    if (isFreeCanSlot(index, normalizedSlots, profile)) {
      const validation = validateFreeCanFlavor(selection.product_name);
      if (!validation.valid) {
        validationErrors.push(`${slot.slot_label || `Slot ${index + 1}`}: ${validation.error}`);
      }
    }
  });

  const qualifiesForPassionDiscount = orderedSelections.filter((selection) => selection.size === "800g").length >= 5;
  let subtotal = 0;
  const breakdown = [];

  if (profile === "two_800g_one_300g") {
    orderedSelections.forEach((selection, index) => {
      const slot = normalizedSlots[index];
      const standardPrice = selection.size === "300g" ? MIX_300G_PWP_PRICE : MIX_800G_PRICE;
      const linePrice = selection.size === "300g"
        ? get300gBundleUnitPrice(selection.product_name, selection)
        : get800gBundleUnitPrice(selection.product_name, selection);

      subtotal += linePrice;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: Math.max(0, roundMoney(linePrice - standardPrice)),
        pricing_note: selection.size === "300g" ? "300g PWP add-on" : "Paid 800g can",
        is_free_can: false
      });
    });
  } else if (profile === "five_800g_discounted") {
    const discountedIndex = findDiscountedFifthCanIndex(orderedSelections);

    orderedSelections.forEach((selection, index) => {
      const isDiscountedFifthCan = index === discountedIndex;
      const standardPrice = isDiscountedFifthCan ? DISCOUNTED_FIFTH_MIX_PRICE : MIX_800G_PRICE;
      const linePrice = isDiscountedFifthCan
        ? getDiscountedFifthCanPrice(selection.product_name, { ...selection, qualifiesForPassionDiscount })
        : get800gBundleUnitPrice(selection.product_name, { ...selection, qualifiesForPassionDiscount });

      subtotal += linePrice;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: Math.max(0, roundMoney(linePrice - standardPrice)),
        pricing_note: isDiscountedFifthCan
          ? "Discounted 5th can"
          : (selection.isPassionBeetroot
            ? "Passion Beetroot 5+ bundle discount applied"
            : "Paid 800g can"),
        is_free_can: false
      });
    });
  } else if (profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") {
    orderedSelections.forEach((selection, index) => {
      const freeCan = isFreeCanSlot(index, normalizedSlots, profile);
      const linePrice = freeCan
        ? 0
        : get800gBundleUnitPrice(selection.product_name, { ...selection, qualifiesForPassionDiscount });

      subtotal += linePrice;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: freeCan ? 0 : Math.max(0, roundMoney(linePrice - MIX_800G_PRICE)),
        pricing_note: freeCan
          ? "Free can"
          : (selection.isPassionBeetroot
            ? "Passion Beetroot 5+ bundle discount applied"
            : "Paid 800g can"),
        is_free_can: freeCan
      });
    });
  } else {
    orderedSelections.forEach((selection) => {
      subtotal += selection.bundle_extra_price;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: 0,
        extra: selection.bundle_extra_price,
        pricing_note: selection.bundle_extra_price > 0 ? "Bundle surcharge" : "Included in base bundle price",
        is_free_can: false
      });
    });

    subtotal = roundMoney(basePrice + subtotal);
  }

  const roundedSubtotal = roundMoney(subtotal);

  return {
    profile,
    base_price: basePrice,
    subtotal: roundedSubtotal,
    surcharge_total: roundMoney(roundedSubtotal - basePrice),
    breakdown,
    validation_errors: validationErrors,
    free_can_slot_count: getFreeCanSlotCount(profile)
  };
}

module.exports = {
  MIX_800G_PRICE,
  MIX_300G_PWP_PRICE,
  DISCOUNTED_FIFTH_MIX_PRICE,
  QUALIFYING_PASSION_BEETROOT_800G_PRICE,
  QUALIFYING_DISCOUNTED_FIFTH_PASSION_PRICE,
  getConfiguredBundleSurcharge,
  getCanonicalBundleSize,
  isCocoaFlavor,
  isPassionBeetrootFlavor,
  isNoSurchargeMixFlavor,
  detectBundlePricingProfile,
  getFreeCanSlotCount,
  isFreeCanSlot,
  validateFreeCanFlavor,
  get800gBundleUnitPrice,
  get300gBundleUnitPrice,
  getDiscountedFifthCanPrice,
  getBundleBasePrice,
  getBundleOptionDisplayAdjustment,
  calculateBundleTotal
};
