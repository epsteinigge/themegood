# Campaign banner logo correction

The user requested restoration of the old campaign image with only the Halal logo corrected.

The homepage serves `public/photos/themegood-home-banner-halal-corrected.png`. The original campaign image and the supplied `halal-icon.png` remain unchanged.

Run `node scripts/correct-home-banner-logo.cjs` to reproduce and verify the correction. It replaces the rectangle at x=1547, y=16, width=98, height=122. It copies adjacent stone background from the same original image and composites the supplied logo with its original proportions. It uses no AI generation or blur.

The script compares decoded RGB pixels and fails if any pixel outside that rectangle differs from the original banner. Product packaging, other logos, scenery, and all other text are pixel-identical to the original.

All viewport sizes display this corrected landscape image without cropping or a generated mobile variant.
