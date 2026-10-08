const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { calculateBundleTotal, getBundleOptionDisplayAdjustment } = require("../bundle-pricing");

// Execute the storefront pricing functions with select elements shaped like the DOM.
function loadFunctions(file, names, context) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  for (const name of names) {
    const match = new RegExp(`(^[ \\t]*)function ${name}\\(`, "m").exec(source);
    assert.ok(match, `Missing ${name}`);
    const nextFunction = source.indexOf(`\n${match[1]}function `, match.index + match[0].length);
    assert.ok(nextFunction > match.index);
    vm.runInContext(source.slice(match.index, nextFunction), context);
  }
}

const modal = vm.createContext({ t: (key) => key });
loadFunctions("public/script.js", [
  "normalizeLegacyBundlePricingNote", "buildBundleBreakdownRowsFromSelects",
  "isFiveCanBundleBreakdown", "normalizeFiveCanBundleBreakdown"
], modal);
const detail = vm.createContext({ detailT: (key, fallback) => fallback });
loadFunctions("public/shopping-details.js", [
  "normalizeDetailLegacyBundlePricingNote", "isBundleCocoaLabel",
  "buildDetailBundleBreakdownRowsFromSelects", "isDetailFiveCanBreakdown",
  "normalizeDetailFiveCanBundleBreakdown"
], detail);

function check(entries, basePrice, expected) {
  const slots = entries.map(([label, size], index) => ({ id: index + 1, required_size: size }));
  const selections = entries.map(([label, size], index) => ({
    slot_id: index + 1, label, size_name: size,
    bundle_extra_price: /cocoa/i.test(label) ? (size === "300g" ? 17 : 30) : 0
  }));
  const quote = calculateBundleTotal({ bundlePrice: basePrice, slots, selections });
  assert.equal(quote.subtotal, expected);
  assert.deepEqual(quote.validation_errors, []);
  for (const row of quote.breakdown.filter((row) => /matcha/i.test(row.label))) {
    assert.equal(row.price, row.size === "300g" ? 79 : 168);
  }
  const selects = entries.map(([label, size]) => ({
    selectedIndex: 0,
    options: [{ dataset: {
      name: label, size, price: size === "300g" ? 79 : 168,
      choiceLabel: label, choiceSize: size, choicePrice: size === "300g" ? 79 : 168
    } }],
    closest: () => ({ querySelector: () => ({ textContent: "Slot" }) })
  }));
  const modalRows = modal.buildBundleBreakdownRowsFromSelects(selects);
  const detailRows = detail.buildDetailBundleBreakdownRowsFromSelects(selects);
  for (const rows of [modalRows, detailRows,
    modal.normalizeFiveCanBundleBreakdown(quote.breakdown),
    detail.normalizeDetailFiveCanBundleBreakdown(quote.breakdown)]) {
    assert.equal(rows.reduce((sum, row) => sum + row.price, 0), expected);
  }
}

check([["Matcha", "800g"], ["Bilberry", "800g"]], 216, 276);
check([["Matcha", "800g"], ["Matcha", "800g"]], 216, 336);
check([["Matcha", "800g"], ["Cocoa", "800g"], ["Matcha", "300g"]], 244, 385);
check([["Bilberry", "800g"], ["Bilberry", "800g"], ["Matcha", "300g"]], 244, 295);
check(Array.from({ length: 5 }, () => ["Matcha", "800g"]), 486, 840);
check([["Matcha", "800g"], ...Array.from({ length: 4 }, () => ["Bilberry", "800g"])], 486, 546);
check([["Matcha", "800g"], ...Array.from({ length: 4 }, () => ["Cocoa", "800g"])], 486, 690);
check([["Matcha", "800g"], ["Cocoa", "800g"], ...Array.from({ length: 3 }, () => ["Bilberry", "800g"])], 486, 576);
assert.equal(getBundleOptionDisplayAdjustment({ profile: "two_800g_one_300g", sizeName: "300g", flavorName: "Matcha" }), 51);
assert.equal(getBundleOptionDisplayAdjustment({ profile: "two_800g", sizeName: "800g", flavorName: "Matcha" }), 60);
for (const count of [7, 15]) {
  const slots = Array.from({ length: count }, (_, index) => ({ id: index + 1, required_size: "800g" }));
  const selections = slots.map((slot) => ({ slot_id: slot.id, label: "Matcha", size_name: "800g" }));
  assert.equal(calculateBundleTotal({ slots, selections }).subtotal, count * 168);
}
console.log("Matcha prices agree across server, shop modal and product detail.");
