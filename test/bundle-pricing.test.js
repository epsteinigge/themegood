const assert = require("node:assert/strict");

const { calculateBundleTotal } = require("../bundle-pricing");

function makeSlots(sizes) {
  return sizes.map((size, index) => ({
    id: index + 1,
    slot_label: `Slot ${index + 1}`,
    required_size: size
  }));
}

function makeSelections(entries) {
  return entries.map((entry, index) => ({
    slot_id: index + 1,
    product_name: entry.label,
    label: entry.label,
    size_name: entry.size,
    bundle_extra_price: /cocoa/i.test(String(entry.label || ""))
      ? (String(entry.size || "").toLowerCase() === "300g" ? 17 : 30)
      : 0
  }));
}

function subtotalFor(slots, entries, bundlePrice = 0) {
  return calculateBundleTotal({
    bundleName: "Test Bundle",
    bundlePrice,
    slots,
    selections: makeSelections(entries)
  }).subtotal;
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("2x 800g mix + mix300 = 233", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "300g" }
  ], 233), 233);
});

runTest("embedded size labels still satisfy slot size validation", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  const result = calculateBundleTotal({
    bundleName: "Test Bundle",
    bundlePrice: 233,
    slots,
    selections: [
      { slot_id: 1, product_name: "Cocoa Multigrain", label: "Cocoa Multigrain", size_name: "Cocoa Multigrain (800g)" },
      { slot_id: 2, product_name: "Bilberry Multigrain", label: "Bilberry Multigrain", size_name: "Bilberry 800g" },
      { slot_id: 3, product_name: "Pomegranate Multigrain", label: "Pomegranate Multigrain", size_name: "300gm" }
    ]
  });

  assert.equal(result.validation_errors.length, 0);
});

runTest("2x 800g mix + cocoa300 = 250", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 233), 250);
});

runTest("mix + cocoa + mix300 = 263", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "300g" }
  ], 233), 263);
});

runTest("mix + cocoa + cocoa300 = 280", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 233), 280);
});

runTest("cocoa + cocoa + mix300 = 293", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "300g" }
  ], 233), 293);
});

runTest("cocoa + cocoa + cocoa300 = 310", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 233), 310);
});

runTest("5 mix = 466", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 466), 466);
});

runTest("4 mix + 1 cocoa = 496", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 466), 496);
});

runTest("5 cocoa = 616", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 466), 616);
});

runTest("4 cocoa + 1 mix = 586", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 466), 586);
});

runTest("1 passion + 4 mix = 461", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" }
  ], 466), 461);
});

runTest("2 passion + 3 mix = 456", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" }
  ], 466), 456);
});

runTest("3 passion + 2 mix = 451", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" }
  ], 466), 451);
});

runTest("4 passion + 1 mix = 446", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 466), 446);
});

runTest("cocoa cannot be selected as a free can in 6+1", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g", "800g", "800g"]);
  const result = calculateBundleTotal({
    bundleName: "6+1 800g",
    bundlePrice: 618,
    slots,
    selections: makeSelections([
      { label: "Bilberry Multigrain", size: "800g" },
      { label: "Melon Avocado Multigrain", size: "800g" },
      { label: "Pomegranate Multigrain", size: "800g" },
      { label: "Passion Fruit Multigrain", size: "800g" },
      { label: "Bilberry Multigrain", size: "800g" },
      { label: "Melon Avocado Multigrain", size: "800g" },
      { label: "Cocoa Multigrain", size: "800g" }
    ])
  });

  assert.ok(result.validation_errors.some((error) => error.includes("Free can slots cannot use Cocoa flavour")));
});

runTest("cocoa cannot be selected as a free can in 12+3", () => {
  const slots = makeSlots(Array(15).fill("800g"));
  const result = calculateBundleTotal({
    bundleName: "12+3 800g",
    bundlePrice: 1236,
    slots,
    selections: makeSelections(
      Array(12).fill({ label: "Bilberry Multigrain", size: "800g" }).concat([
        { label: "Melon Avocado Multigrain", size: "800g" },
        { label: "Cocoa Multigrain", size: "800g" },
        { label: "Pomegranate Multigrain", size: "800g" }
      ])
    )
  });

  assert.ok(result.validation_errors.some((error) => error.includes("Free can slots cannot use Cocoa flavour")));
});

console.log("All bundle pricing tests passed.");
