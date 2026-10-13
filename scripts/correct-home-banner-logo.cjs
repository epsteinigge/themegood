// Replace only the incorrect certification area using the existing original logo.
// No generation, blur, repainting, or edits to product artwork are used.
const assert = require('node:assert/strict');
const path = require('node:path');
const sharp = require('sharp');

const photos = path.join(__dirname, '..', 'public', 'photos');
const source = path.join(photos, 'themegood-home-banner-real-packaging.png');
const output = path.join(photos, 'themegood-home-banner-halal-corrected.png');
const region = { left: 1547, top: 16, width: 98, height: 122 };

async function main() {
  // Copy an unobstructed piece of the same original stone background.
  const strip = await sharp(source)
    .extract({ left: region.left + region.width, top: region.top, width: 27, height: region.height })
    .raw().toBuffer();
  const backgroundPixels = Buffer.alloc(region.width * region.height * 3);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      strip.copy(backgroundPixels, (y * region.width + x) * 3,
        (y * 27 + x % 27) * 3, (y * 27 + x % 27) * 3 + 3);
    }
  }
  const background = await sharp(backgroundPixels, {
    raw: { width: region.width, height: region.height, channels: 3 }
  }).png().toBuffer();
  const { data: logo, info } = await sharp(path.join(photos, 'halal-icon.png'))
    .trim().resize({ width: region.width - 8, height: region.height - 4, fit: 'inside' })
    .png().toBuffer({ resolveWithObject: true });
  const replacement = await sharp(background).composite([{
    input: logo,
    left: Math.floor((region.width - info.width) / 2),
    top: Math.floor((region.height - info.height) / 2)
  }]).png().toBuffer();
  await sharp(source).composite([{ input: replacement, left: region.left, top: region.top }])
    .removeAlpha().png().toFile(output);

  const before = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(after.info.width, before.info.width);
  assert.equal(after.info.height, before.info.height);
  let changed = 0;
  for (let y = 0; y < before.info.height; y++) {
    for (let x = 0; x < before.info.width; x++) {
      const offset = (y * before.info.width + x) * 3;
      const differs = !before.data.subarray(offset, offset + 3).equals(after.data.subarray(offset, offset + 3));
      if (!differs) continue;
      assert.ok(x >= region.left && x < region.left + region.width &&
        y >= region.top && y < region.top + region.height, 'Artwork outside the logo area changed');
      changed++;
    }
  }
  assert.ok(changed > 0, 'Certification replacement was not applied');
  console.log(`Verified: ${changed} pixels changed, all inside the certification area; all other artwork is pixel-identical.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
