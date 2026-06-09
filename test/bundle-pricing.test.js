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

function resultFor(slots, entries, bundlePrice = 0) {
  return calculateBundleTotal({
    bundleName: "Test Bundle",
    bundlePrice,
    slots,
    selections: makeSelections(entries)
  });
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

runTest("2x 800g mix + mix300 = 244", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "300g" }
  ], 244), 244);
});

runTest("2x 800g mix = 216", () => {
  const slots = makeSlots(["800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" }
  ], 216), 216);
});

runTest("2x 800g mix + cocoa = 246", () => {
  const slots = makeSlots(["800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 216), 246);
});

runTest("2x 800g cocoa + cocoa = 276", () => {
  const slots = makeSlots(["800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 216), 276);
});

runTest("embedded size labels still satisfy slot size validation", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  const result = calculateBundleTotal({
    bundleName: "Test Bundle",
    bundlePrice: 244,
    slots,
    selections: [
      { slot_id: 1, product_name: "Cocoa Multigrain", label: "Cocoa Multigrain", size_name: "Cocoa Multigrain (800g)" },
      { slot_id: 2, product_name: "Bilberry Multigrain", label: "Bilberry Multigrain", size_name: "Bilberry 800g" },
      { slot_id: 3, product_name: "Pomegranate Multigrain", label: "Pomegranate Multigrain", size_name: "300gm" }
    ]
  });

  assert.equal(result.validation_errors.length, 0);
});

runTest("2x 800g mix + cocoa300 = 252", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 244), 252);
});

runTest("mix + cocoa + mix300 = 274", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "300g" }
  ], 244), 274);
});

runTest("mix + cocoa + cocoa300 = 282", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 244), 282);
});

runTest("cocoa + cocoa + mix300 = 304", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "300g" }
  ], 244), 304);
});

runTest("cocoa + cocoa + cocoa300 = 312", () => {
  const slots = makeSlots(["800g", "800g", "300g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "300g" }
  ], 244), 312);
});

runTest("5 mix = 486", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  const result = resultFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 486);
  assert.equal(result.subtotal, 486);
  assert.deepEqual(result.breakdown.map((row) => row.price), [54, 108, 108, 108, 108]);
});

runTest("4 mix + 1 cocoa = 506", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 486), 506);
});

runTest("5x mixed Cocoa discounts a non-Cocoa can", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  const result = resultFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 486);
  assert.equal(result.subtotal, 526);
  assert.deepEqual(result.breakdown.map((row) => row.price), [128, 128, 54, 108, 108]);
  assert.equal(result.breakdown[2].pricing_note, "Discounted 5th can");
});

runTest("5 cocoa = 640 with no half-price cocoa", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  const result = resultFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" }
  ], 486);
  assert.equal(result.subtotal, 640);
  assert.deepEqual(result.breakdown.map((row) => row.price), [128, 128, 128, 128, 128]);
  assert.equal(result.breakdown[0].pricing_note, "Additional Cocoa bundle price");
});

runTest("4 cocoa + 1 mix = 566", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Cocoa Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 486), 566);
});

runTest("1 passion + 4 mix = 486", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" },
    { label: "Passion Fruit Multigrain", size: "800g" }
  ], 486), 486);
});

runTest("2 passion + 3 mix = 486", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" },
    { label: "Pomegranate Multigrain", size: "800g" }
  ], 486), 486);
});

runTest("3 passion + 2 mix = 486", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" },
    { label: "Melon Avocado Multigrain", size: "800g" }
  ], 486), 486);
});

runTest("4 passion + 1 mix = 486", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g"]);
  assert.equal(subtotalFor(slots, [
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Passion Beetroot Multigrain", size: "800g" },
    { label: "Bilberry Multigrain", size: "800g" }
  ], 486), 486);
});

runTest("6+1 prices every 800g slot with no free can discount", () => {
  const slots = makeSlots(["800g", "800g", "800g", "800g", "800g", "800g", "800g"]);
  const result = calculateBundleTotal({
    bundleName: "6+1 800g",
    bundlePrice: 756,
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

  assert.equal(result.validation_errors.length, 0);
  assert.equal(result.subtotal, 786);
});

runTest("12+3 prices every 800g slot with no free can discount", () => {
  const slots = makeSlots(Array(15).fill("800g"));
  const result = calculateBundleTotal({
    bundleName: "12+3 800g",
    bundlePrice: 1620,
    slots,
    selections: makeSelections(
      Array(12).fill({ label: "Bilberry Multigrain", size: "800g" }).concat([
        { label: "Melon Avocado Multigrain", size: "800g" },
        { label: "Cocoa Multigrain", size: "800g" },
        { label: "Pomegranate Multigrain", size: "800g" }
      ])
    )
  });

  assert.equal(result.validation_errors.length, 0);
  assert.equal(result.subtotal, 1650);
});

console.log("All bundle pricing tests passed.");
