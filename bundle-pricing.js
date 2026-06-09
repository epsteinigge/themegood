const MIX_800G_PRICE = 108;
const MIX_300G_PWP_PRICE = 27;
const TWO_CAN_800G_PRICE = 108;
const TWO_CAN_300G_PRICE = 28;
const TWO_CAN_300G_COCOA_PRICE = 36;
const COCOA_800G_BUNDLE_PRICE = 138;
const FIVE_CAN_800G_BASE_PRICE = 486;
const FIVE_CAN_DISCOUNTED_800G_PRICE = 54;
const FIVE_CAN_FIRST_COCOA_PRICE = 138;
const FIVE_CAN_ADDITIONAL_COCOA_PRICE = 128;

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

  if (sizes.length === 2 && count800g === 2 && count300g === 0 && count600g === 0) {
    return "two_800g";
  }

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
  return 0;
}

function isFreeCanSlot(slotIndex, slots = [], profile = detectBundlePricingProfile("", slots)) {
  const freeCanSlotCount = getFreeCanSlotCount(profile);
  if (freeCanSlotCount <= 0) return false;
  return Number(slotIndex) >= Math.max(0, slots.length - freeCanSlotCount);
}

function getConfiguredBundleSurcharge(selectionOrOptions = {}) {
  const rawValue = selectionOrOptions?.bundle_extra_price ?? selectionOrOptions?.configured_bundle_extra_price ?? selectionOrOptions?.configuredAmount ?? 0;
  const amount = Number(rawValue);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

function get800gBundleUnitPrice(flavorName, options = {}) {
  const price = isCocoaFlavor(flavorName) ? COCOA_800G_BUNDLE_PRICE : MIX_800G_PRICE;
  return roundMoney(price);
}

function get300gBundleUnitPrice(flavorName, options = {}) {
  return roundMoney(MIX_300G_PWP_PRICE + getConfiguredBundleSurcharge(options));
}

function getBundleBasePrice(profile, configuredPrice, slots = []) {
  const parsedConfiguredPrice = Number(configuredPrice);
  if (Number.isFinite(parsedConfiguredPrice) && parsedConfiguredPrice >= 0) {
    return roundMoney(parsedConfiguredPrice);
  }

  switch (profile) {
    case "two_800g":
      return roundMoney(TWO_CAN_800G_PRICE * 2);
    case "two_800g_one_300g":
      return roundMoney((TWO_CAN_800G_PRICE * 2) + TWO_CAN_300G_PRICE);
    case "five_800g_discounted":
      return FIVE_CAN_800G_BASE_PRICE;
    case "six_plus_one_800g":
      return roundMoney(MIX_800G_PRICE * 7);
    case "twelve_plus_three_800g":
      return roundMoney(MIX_800G_PRICE * 15);
    default:
      return 0;
  }
}

function getBundleOptionDisplayAdjustment({ profile, sizeName, flavorName, configuredAmount = 0 }) {
  const canonicalSize = getCanonicalBundleSize(sizeName);
  const parsedConfiguredAmount = Number(configuredAmount);
  if (
    profile === "two_800g_one_300g" &&
    canonicalSize === "300g" &&
    isCocoaFlavor(flavorName)
  ) {
    return roundMoney(TWO_CAN_300G_COCOA_PRICE - TWO_CAN_300G_PRICE);
  }

  if (
    (profile === "two_800g" ||
      profile === "two_800g_one_300g" ||
      profile === "five_800g_discounted" ||
      profile === "six_plus_one_800g" ||
      profile === "twelve_plus_three_800g") &&
    canonicalSize === "800g" &&
    isCocoaFlavor(flavorName)
  ) {
    return roundMoney(COCOA_800G_BUNDLE_PRICE - MIX_800G_PRICE);
  }

  if (profile === "legacy" || profile === "two_800g" || profile === "two_800g_one_300g" || profile === "five_800g_discounted" || profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") {
    return Number.isFinite(parsedConfiguredAmount) && parsedConfiguredAmount > 0
      ? roundMoney(parsedConfiguredAmount)
      : 0;
  }

  return 0;
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

  });

  let subtotal = 0;
  const breakdown = [];

  if (profile === "two_800g") {
    let surchargeTotal = 0;
    orderedSelections.forEach((selection) => {
      const surcharge = selection.isCocoa ? roundMoney(COCOA_800G_BUNDLE_PRICE - TWO_CAN_800G_PRICE) : 0;
      const linePrice = roundMoney(TWO_CAN_800G_PRICE + surcharge);

      surchargeTotal += surcharge;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: surcharge,
        pricing_note: "Paid 800g can",
        is_free_can: false
      });
    });

    subtotal = roundMoney(basePrice + surchargeTotal);
  } else if (profile === "two_800g_one_300g") {
    let surchargeTotal = 0;
    orderedSelections.forEach((selection, index) => {
      const slot = normalizedSlots[index];
      const standardPrice = selection.size === "300g" ? TWO_CAN_300G_PRICE : TWO_CAN_800G_PRICE;
      const surcharge = selection.isCocoa
        ? (selection.size === "300g"
          ? roundMoney(TWO_CAN_300G_COCOA_PRICE - TWO_CAN_300G_PRICE)
          : getConfiguredBundleSurcharge(selection))
        : 0;
      const linePrice = roundMoney(standardPrice + surcharge);

      surchargeTotal += surcharge;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: surcharge,
        pricing_note: selection.size === "300g" ? "300g PWP add-on" : "Paid 800g can",
        is_free_can: false
      });
    });

    subtotal = roundMoney(basePrice + surchargeTotal);
  } else if (profile === "five_800g_discounted") {
    let surchargeTotal = 0;
    let cocoaCount = 0;
    const discountedIndex = orderedSelections.findIndex((selection) => !selection.isCocoa);
    const resolvedDiscountedIndex = discountedIndex >= 0 ? discountedIndex : 0;
    orderedSelections.forEach((selection, index) => {
      const isDiscountedCan = index === resolvedDiscountedIndex;
      const isCocoa = selection.isCocoa;
      const cocoaPrice = cocoaCount === 0 ? FIVE_CAN_FIRST_COCOA_PRICE : FIVE_CAN_ADDITIONAL_COCOA_PRICE;
      const surcharge = isCocoa ? roundMoney(cocoaPrice - TWO_CAN_800G_PRICE) : 0;
      const baseLinePrice = isDiscountedCan ? FIVE_CAN_DISCOUNTED_800G_PRICE : TWO_CAN_800G_PRICE;
      const linePrice = roundMoney(baseLinePrice + surcharge);
      if (isCocoa) cocoaCount += 1;

      surchargeTotal += surcharge;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: surcharge,
        pricing_note: isDiscountedCan ? "Discounted 5th can" : "Paid 800g can",
        is_free_can: false
      });
    });

    subtotal = roundMoney(basePrice + surchargeTotal);
  } else if (profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") {
    orderedSelections.forEach((selection, index) => {
      const linePrice = get800gBundleUnitPrice(selection.product_name, selection);

      subtotal += linePrice;
      breakdown.push({
        slot_id: selection.slot_id,
        slot_label: selection.slot_label,
        label: selection.label,
        size: selection.size,
        price: linePrice,
        extra: Math.max(0, roundMoney(linePrice - MIX_800G_PRICE)),
        pricing_note: "Paid 800g can",
        is_free_can: false
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
  TWO_CAN_800G_PRICE,
  TWO_CAN_300G_PRICE,
  TWO_CAN_300G_COCOA_PRICE,
  FIVE_CAN_800G_BASE_PRICE,
  FIVE_CAN_DISCOUNTED_800G_PRICE,
  FIVE_CAN_FIRST_COCOA_PRICE,
  FIVE_CAN_ADDITIONAL_COCOA_PRICE,
  COCOA_800G_BUNDLE_PRICE,
  getConfiguredBundleSurcharge,
  getCanonicalBundleSize,
  isCocoaFlavor,
  isPassionBeetrootFlavor,
  isNoSurchargeMixFlavor,
  detectBundlePricingProfile,
  getFreeCanSlotCount,
  isFreeCanSlot,
  get800gBundleUnitPrice,
  get300gBundleUnitPrice,
  getBundleBasePrice,
  getBundleOptionDisplayAdjustment,
  calculateBundleTotal
};
