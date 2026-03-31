document.addEventListener("DOMContentLoaded", async () => {
  // --- Global State ---
  let cartItems = JSON.parse(localStorage.getItem("cart")) || [];
  let currentProduct = null;
  let currentLang = "en";
  let cartPromo = JSON.parse(localStorage.getItem("cart_promo")) || { code: "", percent: 0 };
  let promoConfig = { active: false, code: "", percent: 0 };
  localStorage.removeItem("wishlist");

  let productImagesByProductId = {};
  let productImagesLoadPromise = null;
  let productVariantsByProductId = {};
  let productVariantsLoadPromise = null;
  let productGiftOptionsByProductId = {};
  let productGiftOptionsLoadPromise = null;
  let storefrontProductsById = {};
  let storefrontProductsLoadPromise = null;
  const sizeOptions = [
    { id: "small", label: "300g", multiplier: 1 },
    { id: "medium", label: "600g", multiplier: 1.8 },
    { id: "large", label: "800g", multiplier: 2.4 }
  ];
  const fixedSizePrices = {
    small: 55,
    medium: 105,
    large: 108
  };
  const cocoaSizePrices = {
    small: 72,
    large: 138
  };
  const cocoaSizeImages = {
    small: "/photos/Cocoa 300g.png",
    large: "/photos/Cocoa800g.png"
  };
  const productSizeImageMap = {
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
  const sizePriceDatasetKeys = {
    small: "sizePriceSmall",
    medium: "sizePriceMedium",
    large: "sizePriceLarge"
  };

  function getProductId(productRef) {
    const value = typeof productRef === "object" && productRef !== null
      ? productRef.dataset?.id ?? productRef.id
      : productRef;
    const productId = Number(value || 0);
    return Number.isInteger(productId) && productId > 0 ? productId : 0;
  }

  function normalizeImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("public/")) return `/${raw.slice("public".length)}`.replace(/\/{2,}/g, "/");
    return `/${raw.replace(/^\.?\//, "")}`;
  }

  function getStoredImagesForProduct(productRef) {
    return productImagesByProductId[String(getProductId(productRef))] || [];
  }

  function getManagedSizePrice(productRef, sizeId) {
    if (!productRef || !sizeId) return null;

    const datasetKey = sizePriceDatasetKeys[sizeId];
    const rawValue =
      (datasetKey && productRef?.dataset ? productRef.dataset[datasetKey] : undefined) ??
      productRef?.[`size_price_${sizeId}`] ??
      productRef?.[datasetKey];
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") {
      return null;
    }
    const amount = Number(rawValue);

    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function isOutOfStock(el) {
    const isBundle = (el?.dataset?.productType || "").toLowerCase() === "bundle";

    // Bundles should NOT be treated as out of stock
    if (isBundle) return false;

    const variants = getVariantsForProduct(el);
    const selectedVariant = getSelectedPackage(el);
    if (selectedVariant && variants.some((variant) => variant.hasDirectPrice)) {
      return Number(selectedVariant.stock || 0) <= 0;
    }
    return Number(el?.dataset?.stock || el?.stock || 0) <= 0;
  }

  function getVariantSizeInfo(variant) {
    const rawName = String(variant?.name || "").trim();
    const normalized = rawName.toLowerCase();
    const matched = sizeOptions.find((size) =>
      normalized === size.id ||
      normalized === size.label.toLowerCase() ||
      normalized.includes(size.label.toLowerCase())
    );

    if (matched) return matched;

    return {
      id: String(variant?.id || rawName || "variant"),
      label: rawName || "Option",
      multiplier: 1
    };
  }

  function normalizeSizeId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    const matched = sizeOptions.find((size) =>
      raw === size.id ||
      raw === size.label.toLowerCase() ||
      raw.includes(size.label.toLowerCase())
    );
    return matched?.id || raw;
  }

  function getCocoaForcedPrice(sizeId) {
    if (!sizeId) return null;
    const value = cocoaSizePrices[sizeId];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function getCocoaForcedImage(sizeId) {
    if (!sizeId) return "";
    return normalizeImageUrl(cocoaSizeImages[sizeId] || "");
  }

  function isCocoaProductById(productId) {
    const id = Number(productId || 0);
    if (id === 6) return true;
    const productName = String(storefrontProductsById[String(id)]?.name || "");
    return /cocoa/i.test(productName);
  }

  function getProductImageMapKey(productName = "") {
    const normalized = String(productName || "").trim().toLowerCase();
    if (!normalized) return "";
    return Object.keys(productSizeImageMap).find((key) => normalized.includes(key)) || "";
  }

  function getProductNameFromRef(productRef) {
    if (!productRef) return "";
    if (typeof productRef === "string") return productRef;
    const id = getProductId(productRef);
    return String(
      productRef?.dataset?.name ||
      productRef?.name ||
      storefrontProductsById[String(id)]?.name ||
      ""
    );
  }

  function getMappedSizeImageForProduct(productRef, sizeId) {
    const normalizedSizeId = normalizeSizeId(sizeId);
    if (!normalizedSizeId) return "";
    const productName = getProductNameFromRef(productRef);
    const mapKey = getProductImageMapKey(productName);
    if (!mapKey) return "";
    return normalizeImageUrl(productSizeImageMap[mapKey]?.[normalizedSizeId] || "");
  }

  function normalizeVariant(rawVariant, fallbackProductId = 0) {
    const productId = getProductId(rawVariant?.product_id) || getProductId(fallbackProductId);
    const normalizedSizeId =
      normalizeSizeId(rawVariant?.name || "") ||
      inferSizeIdFromImageUrl(rawVariant?.image_url || rawVariant?.imageUrl || "");
    const variantId = rawVariant?.id ?? `default-${productId || 0}`;
    const directPriceRaw = rawVariant?.price ?? rawVariant?.variant_price;
    const directPrice = Number(directPriceRaw);
    const hasDirectPrice = directPriceRaw !== undefined && directPriceRaw !== null && String(directPriceRaw).trim() !== "" && Number.isFinite(directPrice);
    const isCocoaVariant = isCocoaProductById(productId);
    const cocoaForcedPrice = isCocoaVariant ? getCocoaForcedPrice(normalizedSizeId) : null;
    const cocoaForcedImage = isCocoaVariant ? getCocoaForcedImage(normalizedSizeId) : "";
    return {
      id: String(variantId),
      productId,
      name: String(rawVariant?.name || "Single Pack"),
      units: Math.max(1, Number(rawVariant?.units || 1)),
      discountPercent: Math.min(100, Math.max(0, Number(rawVariant?.discount_percent ?? rawVariant?.discount ?? 0))),
      discountAmount: Math.max(0, Number(rawVariant?.discount_amount ?? rawVariant?.discountAmount ?? 0)),
      price: cocoaForcedPrice !== null ? cocoaForcedPrice : (hasDirectPrice ? Math.max(0, directPrice) : null),
      stock: Math.max(0, Number(rawVariant?.stock ?? 0)),
      hasDirectPrice: cocoaForcedPrice !== null ? true : hasDirectPrice,
      imageUrl: cocoaForcedImage || normalizeImageUrl(rawVariant?.image_url || rawVariant?.imageUrl || ""),
      isActive: rawVariant?.is_active !== false,
      sortOrder: Number(rawVariant?.sort_order || 0)
    };
  }

  function getDefaultVariant(productRef = null) {
    return normalizeVariant(
      {
        id: `default-${getProductId(productRef) || 0}`,
        name: "Default",
        units: 1,
        discount_percent: 0,
        discount_amount: 0,
        price: Number(productRef?.dataset?.price || productRef?.price || 0),
        stock: Number(productRef?.dataset?.stock || productRef?.stock || 0),
        is_active: true,
        sort_order: 0
      },
      productRef
    );
  }

  function getVariantsForProduct(productRef) {
    const productId = getProductId(productRef);
    const variants = productVariantsByProductId[String(productId)] || [];
    const baseVariants = variants.length > 0 ? variants : [getDefaultVariant(productRef)];

    if (!isCocoaProduct(productRef)) {
      return baseVariants;
    }

    return baseVariants.map((variant) => {
      const sizeId =
        normalizeSizeId(variant?.name || "") ||
        inferSizeIdFromImageUrl(variant?.imageUrl || "");
      const forcedPrice = getCocoaForcedPrice(sizeId);
      const forcedImage = getCocoaForcedImage(sizeId);
      if (forcedPrice === null && !forcedImage) return variant;

      return {
        ...variant,
        price: forcedPrice !== null ? forcedPrice : variant.price,
        hasDirectPrice: forcedPrice !== null ? true : variant.hasDirectPrice,
        imageUrl: forcedImage || variant.imageUrl
      };
    });
  }

  function normalizeGiftOffer(rawOffer) {
    return {
      id: String(rawOffer?.id || ""),
      productId: getProductId(rawOffer?.product_id),
      offerName: String(rawOffer?.offer_name || rawOffer?.name || "Gift Offer").trim(),
      giftProductId: getProductId(rawOffer?.gift_product_id),
      minUnits: Math.max(1, Number(rawOffer?.min_units || 1)),
      giftQuantity: Math.max(1, Number(rawOffer?.gift_quantity || 1)),
      extraPrice: Math.max(0, Number(rawOffer?.extra_price || 0)),
      isActive: rawOffer?.is_active !== false,
      sortOrder: Number(rawOffer?.sort_order || 0)
    };
  }

  function getGiftOptionsForProduct(productRef) {
    const productId = getProductId(productRef);
    return productGiftOptionsByProductId[String(productId)] || [];
  }

  function getAllowedSizes(productRef) {
    const variants = getVariantsForProduct(productRef);
    const directPriceVariants = variants.filter((variant) => variant.hasDirectPrice);
    if (directPriceVariants.length > 0) {
      return directPriceVariants.map((variant) => getVariantSizeInfo(variant));
    }

    const raw = String(productRef?.dataset?.sizeOptions || "").trim();
    const selected = raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => sizeOptions.some((size) => size.id === entry));

    const resolved = selected.length > 0
      ? sizeOptions.filter((size) => selected.includes(size.id))
      : sizeOptions;

    return resolved.length > 0 ? resolved : [sizeOptions[0]];
  }

  async function loadStorefrontProductsCatalog() {
    try {
      const response = await fetch("/api/products");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || t("failed_to_load_products"));
      }

      storefrontProductsById = Object.fromEntries(
        (Array.isArray(payload) ? payload : []).map((product) => [String(product.id), product])
      );
      return storefrontProductsById;
    } catch (error) {
      console.error("Failed to load storefront products:", error);
      storefrontProductsById = {};
      return storefrontProductsById;
    }
  }

  function ensureStorefrontProductsLoaded() {
    if (!storefrontProductsLoadPromise) {
      storefrontProductsLoadPromise = loadStorefrontProductsCatalog();
    }
    return storefrontProductsLoadPromise;
  }

  async function loadProductVariants() {
    try {
      const response = await fetch("/api/product-variants");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load product variants");
      }

      const nextMap = {};
      if (Array.isArray(payload)) {
        payload.forEach((variant) => {
          const productId = String(getProductId(variant?.product_id));
          if (!productId || productId === "0") return;
          if (!nextMap[productId]) {
            nextMap[productId] = [];
          }
          nextMap[productId].push(normalizeVariant(variant, productId));
        });
      } else {
        const grouped = payload?.byProductId && typeof payload.byProductId === "object"
          ? payload.byProductId
          : {};

        Object.entries(grouped).forEach(([productId, variants]) => {
          nextMap[String(productId)] = Array.isArray(variants)
            ? variants.map((variant) => normalizeVariant(variant, productId))
            : [];
        });
      }

      productVariantsByProductId = nextMap;
      return nextMap;
    } catch (error) {
      console.error("Failed to load storefront variants:", error);
      productVariantsByProductId = {};
      return productVariantsByProductId;
    }
  }

  function ensureProductVariantsLoaded() {
    if (!productVariantsLoadPromise) {
      productVariantsLoadPromise = loadProductVariants();
    }
    return productVariantsLoadPromise;
  }

  async function loadProductGiftOptions() {
    try {
      const response = await fetch("/api/product-gift-options");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load product gift options");
      }

      const nextMap = {};
      if (Array.isArray(payload)) {
        payload.forEach((offer) => {
          const normalized = normalizeGiftOffer(offer);
          const productId = String(normalized.productId);
          if (!productId || productId === "0") return;
          if (!nextMap[productId]) {
            nextMap[productId] = [];
          }
          nextMap[productId].push(normalized);
        });
      }

      productGiftOptionsByProductId = nextMap;
      return nextMap;
    } catch (error) {
      console.error("Failed to load storefront gift options:", error);
      productGiftOptionsByProductId = {};
      return productGiftOptionsByProductId;
    }
  }

  function ensureProductGiftOptionsLoaded() {
    if (!productGiftOptionsLoadPromise) {
      productGiftOptionsLoadPromise = loadProductGiftOptions();
    }
    return productGiftOptionsLoadPromise;
  }

  async function loadProductImages() {
    try {
      const response = await fetch("/api/product-images");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load product images");
      }

      productImagesByProductId = payload?.byProductId && typeof payload.byProductId === "object"
        ? Object.fromEntries(
          Object.entries(payload.byProductId).map(([productId, images]) => [
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

      return productImagesByProductId;
    } catch (error) {
      console.error("Failed to load storefront product images:", error);
      productImagesByProductId = {};
      return productImagesByProductId;
    }
  }

  function ensureProductImagesLoaded() {
    if (!productImagesLoadPromise) {
      productImagesLoadPromise = loadProductImages();
    }
    return productImagesLoadPromise;
  }

  const dict = {
    en: {
      language: "Language",
      quick_links: "Quick Links",
      follow_us: "Follow Us",
      home: "Home",
      products: "Products",
      shopping: "Shop",
      gallery: "Gallery",
      track_order: "Track Order",
      about: "About",
      flavours: "Flavours",
      bundles: "Bundles",
      testimonials: "Testimonials",
      faq: "FAQ",
      contact_us: "Contact Us",
      checkout: "Checkout",
      wishlist: "Wishlist",
      cart: "Cart",
      buy_now: "Buy Now",
      learn_more: "Learn More",
      featured_products: "Featured Products",
      name_pomegranate: "Pomegranate Multigrain",
      name_bilberry: "Bilberry Multigrain",
      name_melon: "Melon Avocado Multigrain",
      name_passion: "Passion Fruit Multigrain",
      name_oat: "Oat Beta Glucan Multigrain",
      name_cocoa: "Cocoa Multigrain",
      add_to_cart: "Add to Cart",
      close_details: "Close",
      price: "Price",
      your_cart: "Your Cart",
      your_wishlist: "Your Wishlist",
      close_cart: "Close cart",
      close_wishlist: "Close wishlist",
      open_navigation: "Open navigation",
      previous_slide: "Previous slide",
      next_slide: "Next slide",
      slide_navigation: "Slide navigation",
      total: "Total:",
      discount: "Discount",
      back_to_top: "Back to top",
      about_themegood: "About ThemeGood",
      about_lead: "Quality and natural wellness nutrition for modern lifestyles.",
      hero_slide1_title: "Premium wellness nutrition for modern lifestyles.",
      hero_slide1_support: "Discover a cleaner, more elevated way to explore ThemeGood products online.",
      hero_slide1_primary: "Buy Now",
      hero_slide1_secondary: "Learn More",
      hero_slide2_title: "Built for families, refined for daily life.",
      hero_slide2_support: "Balanced formulas and practical sizing for homes that care about better nutrition.",
      hero_slide2_primary: "Explore Flavours",
      hero_slide2_secondary: "View Bundles",
      hero_slide3_title: "Trusted quality, inside every serving.",
      hero_slide3_support: "Consistent taste, reliable wellness ingredients, and premium presentation in every pack.",
      hero_slide3_primary: "Shop Now",
      hero_slide3_secondary: "Contact Us",
      hero_slide4_title: "Nourishing daily wellness for stronger family routines.",
      hero_slide4_support: "Discover thoughtful blends designed for comfort, consistency, and modern living.",
      hero_slide4_primary: "Buy Now",
      hero_slide4_secondary: "Learn More",
      hero_bar1_title: "Healthy Soy Nutrition",
      hero_bar1_desc: "Balanced flavour-forward wellness for families and professionals.",
      hero_bar2_title: "Bundle-Ready Offers",
      hero_bar2_desc: "Premium quick pricing logic, easy selection flow, and flexible combinations.",
      hero_bar3_title: "Daily Wellness Focus",
      hero_bar3_desc: "Designed for practical routines with gentle, enjoyable nutrition support.",
      about_title_new: "Made for families, crafted with care.",
      about_lead_new: "ThemeGood combines practical nutrition science with polished product presentation for a calmer daily routine.",
      about_card1_title: "Carefully Chosen Ingredients",
      about_card1_desc: "Every blend is built around ingredients selected for taste, comfort, and everyday wellness support.",
      about_card2_title: "Practical Everyday Sizing",
      about_card2_desc: "Linked 300g, 600g, and 800g options make refills and household planning simple.",
      about_card3_title: "Premium Experience",
      about_card3_desc: "From flavour stories to packaging, every detail is shaped to feel refined and credible.",
      signature_kicker: "Signature Experience",
      signature_title: "Calmer premium story.",
      signature_desc: "Elegant typography and warm tones make the collection feel refined.",
      signature_button: "Browse Collection",
      signature_badge: "Premium wellness, presented with clarity.",
      flavour_collection: "Flavour Collection",
      flavour_collection_title: "Flavour collection with personality",
      flavour_collection_intro: "Explore curated flavour stories designed for daily wellness and premium presentation.",
      flavour_pomegranate_title: "Pomegranate",
      flavour_pomegranate_heading: "Rich, polished, and easy to position as the hero flavour for everyday vitality.",
      flavour_pomegranate_desc: "Bright berry notes with a smooth finish for an uplifting daily routine.",
      flavour_pomegranate_cta: "View options",
      flavour_bilberry_title: "Bilberry",
      flavour_bilberry_heading: "Calm, refined visuals for a flavour story that feels thoughtful and premium.",
      flavour_bilberry_desc: "A richer profile with deep fruit character and balanced sweetness.",
      flavour_bilberry_cta: "View options",
      flavour_passion_title: "Passion Fruit",
      flavour_passion_heading: "Brighter, more energetic flavour positioning without losing visual restraint.",
      flavour_passion_desc: "Tropical aroma and refreshing taste for lively everyday enjoyment.",
      flavour_passion_cta: "View options",
      featured_products_title: "Choose your daily wellness blend",
      featured_products_intro: "Switch between sizes and formats while keeping each product story consistent.",
      bundles_title: "Build premium bundles in minutes",
      bundles_desc: "Choose your combinations, see transparent base pricing, and add custom bundles confidently.",
      bundles_cta_primary: "Build Bundle",
      bundles_cta_secondary: "View Bundle Guide",
      who_we_are: "Who We Are",
      who_we_are_desc: "ThemeGood develops nutrient-rich wellness drinks using carefully selected natural ingredients and balanced formulas.",
      perfect_recipe: "Perfect Recipe",
      perfect_recipe_desc: "Our blends are focused on fibre, vitamins, minerals, and everyday digestive support with practical nutrition science.",
      suitability: "Suitability",
      suitability_desc: "Designed for adults, seniors, and families looking for a convenient daily wellness option with a gentle nutrition profile.",
      years_foundation: "Years Foundation",
      distributors_retailers: "Distributors & Retailers",
      reports_certifications: "Reports & Certifications",
      monthly_orders: "Monthly Orders",
      testimonials_title: "What Our Customers Say",
      testimonials_intro: "Real feedback from customers who add ThemeGood to their daily wellness routine.",
      faq_title: "Frequently Asked Questions",
      faq_intro: "Quick answers about product sizes, ordering, delivery, and daily use.",
      faq_q1: "How do I choose between 300g, 600g, and 800g?",
      faq_a1: "The 300g size is suitable for trying a product, 600g offers a practical refill size, and 800g is ideal for regular household use.",
      faq_q2: "Can I order directly from the website?",
      faq_a2: "You can review products here and also connect with our official marketplace stores through Lazada and Shopee for convenient checkout.",
      faq_q3: "How should I enjoy ThemeGood multigrain products?",
      faq_a3: "Prepare according to the recommended serving method and enjoy as part of your daily routine, whether in the morning or as a nourishing drink during the day.",
      faq_q4: "How can I contact ThemeGood for product questions?",
      faq_a4: "You can reach us through the contact section, social channels, or WhatsApp for more information about products and ordering support.",
      testimonial_quote_1: "The Pomegranate blend is smooth, easy to prepare, and has become part of my morning routine.",
      testimonial_quote_2: "My parents enjoy the Bilberry and Oat Beta options. The size choices are practical and convenient.",
      testimonial_quote_3: "The Passion Fruit flavour stands out. Ordering online is easy and the product presentation feels premium.",
      testimonial_author_1: "Ms. Lim",
      testimonial_author_2: "Mr. Gan",
      testimonial_author_3: "Ms. Aina",
      testimonial_role_1: "Working Professional",
      testimonial_role_2: "Family Buyer",
      testimonial_role_3: "Repeat Customer",
      desc_pomegranate: "Provides female hormones to reduce menopausal discomfort and prevents prostate cancer.",
      desc_bilberry: "Helps with sleep and fatigue support & dry eye syndrome.",
      desc_melon: "Maintain optimal skin hydration and helps with arthritis.",
      desc_passion: "Soothes the nervous system and helps with detoxification to help with skin beautifying.",
      details_desc_pomegranate: "Provides female hormones to reduce menopausal discomfort and prevents prostate cancer.",
      details_desc_bilberry: "Helps with sleep and fatigue support & dry eye syndrome.",
      details_desc_melon: "Maintain optimal skin hydration and helps with arthritis.",
      details_desc_passion: "Soothes the nervous system and helps with detoxification to help with skin beautifying.",
      desc_oat: "Helps with reducing cholesterol and controls blood sugar levels.",
      desc_cocoa: "Strengthens respiratory system and immune system.",
      pomegranate_b1: "High fibre support",
      pomegranate_b2: "Daily digestive balance",
      pomegranate_b3: "Easy mix wellness drink",
      bilberry_b1: "Eye wellness support",
      bilberry_b2: "Antioxidant-rich profile",
      bilberry_b3: "Suitable for daily intake",
      melon_b1: "Balanced fruit nutrients",
      melon_b2: "Gentle daily formula",
      melon_b3: "Great for active routines",
      passion_b1: "Multigrain nutrition profile",
      passion_b2: "Satiety-friendly blend",
      passion_b3: "Tropical flavour finish",
      email: "Email:",
      phone: "Phone:",
      location: "Location:",
      find_our_shop: "Find Our Shop",
      shop_map_label: "ThemeGood Wellness Nutrition",
      shop_map_address: "14, Jalan Tokong, Taman Hoover, 31650 Ipoh, Perak, Malaysia",
      hours_label: "Hours:",
      hours_value: "Monday-Sunday, 8:00 AM-5:00 PM",
      open_in_google_maps: "Open in Google Maps",
      shop_location: "ThemeGood Shop Location",
      newsletter: "Newsletter",
      newsletter_title: "Subscribe to Our Newsletter",
      newsletter_desc: "Get updates about new wellness products and special offers.",
      newsletter_placeholder: "Enter your email",
      subscribe: "Subscribe",
      scan_qr: "Scan QR",
      shopping_title: "Shopping",
      shopping_subtitle: "Premium wellness nutrition formulated for modern daily routines.",
      shopping_hero_title_default: "Shopping",
      shopping_hero_subtitle_default: "Explore featured wellness blends, bundle-ready offers, and a quick-view flow that opens like a full product showcase.",
      shopping_cta_title_default: "Ready to Checkout?",
      shopping_cta_subtitle_default: "Review your cart and complete your order securely.",
      shopping_cta_button_text_default: "Go to Checkout",
      shop_themegood: "Shop ThemeGood",
      best_sellers: "Best Sellers",
      curated_picks: "Curated Picks",
      shopping_best_seller_subtitle: "The three products shoppers reach for first, curated to stand out clearly.",
      filter_products: "Filter Products",
      search: "Search",
      search_products_placeholder: "Search products by keyword",
      size: "Size",
      all_sizes: "All Sizes",
      package: "Package",
      all_packages: "All Packages",
      clear_filters: "Clear Filters",
      shopping_details_title: "Shopping Details",
      shopping_details_subtitle: "Discover complete product information, key benefits, and nutrition highlights before checkout.",
      ready_to_checkout: "Ready to Checkout?",
      checkout_cta_desc: "Review your cart and complete your order securely.",
      checkout_cta_desc_details: "Items are saved to cart instantly. Review and complete your order anytime.",
      go_to_checkout: "Go to Checkout",
      secure_checkout: "Secure Checkout",
      review_order_payment: "Review your order and complete payment.",
      order_summary: "Order Summary",
      subtotal: "Subtotal",
      continue_shopping: "Continue Shopping",
      payment_details: "Payment Details",
      full_name: "Full Name",
      address: "Address",
      secure_order: "Secure Order",
      fast_review: "Fast Review",
      instant_confirmation: "Instant Confirmation",
      checkout_details: "Checkout Details",
      place_order: "Place Order",
      card_number: "Card Number",
      expiry_date: "Expiry Date",
      cvv: "CVV",
      pay_now: "Pay Now",
      footer_tagline: "ThemeGood Marketing",
      footer_copy: "© 2026 ThemeGood. All Rights Reserved.",
      empty_cart: "Your cart is empty.",
      empty_cart_before_checkout: "Your cart is empty. Please add products before checkout.",
      payment_success: "Payment submitted successfully.",
      invalid_email: "Please enter a valid email address.",
      already_subscribed: "This email is already subscribed.",
      subscribed_success: "Subscribed successfully. Thank you!",
      subscribed_toast: "Subscribed: {email}",
      added_to_cart_toast: "{name} added to cart!",
      added_to_wishlist_toast: "{name} added to wishlist!",
      removed_from_wishlist_toast: "{name} removed from wishlist.",
      promo_code_placeholder: "Promo code",
      promo_removed: "Promo removed.",
      promo_unavailable: "Promo code is no longer available.",
      no_active_promo: "No active promo code right now.",
      invalid_promo_code: "Invalid promo code.",
      bundle_empty: "No bundle slots available.",
      bundle_select_item: "Select item",
      bundle_premium_note: "Some choices add a premium surcharge.",
      bundle_standard_note: "All choices in this slot are standard price.",
      bundle_build_title: "Build Your Bundle",
      bundle_build_sub: "Choose your preferred items for each slot.",
      bundle_complete_all: "Complete all selections",
      bundle_price_unavailable: "Price unavailable",
      bundle_savings: "Bundle savings: {amount}",
      add_bundle_to_cart: "Add Bundle to Cart",
      custom_bundle: "Custom Bundle",
      choose_size: "Choose Size",
      pricing_rule_label: "Pricing Rule",
      bundle_total_label: "Bundle Total",
      no_bundle_slots_configured: "No bundle slots are configured yet.",
      loading_product: "Loading product...",
      product_not_found: "Product not found.",
      failed_to_load_products: "Failed to load products.",
      failed_to_place_order: "Failed to place order.",
      failed_to_load_promo: "Failed to load promo settings.",
      promo_applied: "{code} applied ({percent}% off).",
      apply: "Apply",
      selected_item: "Selected item",
      bundle_recommended: "Recommended",
      selection_fallback: "Selection #{slotId}: Variant #{variantId}",
      product_label: "Product",
      bundle_product_label: "Bundle Product",
      size_label: "Size",
      no_image_available: "No image available",
      product_details_coming_soon: "Product details coming soon.",
      more_product_details_coming_soon: "More product details coming soon.",
      bundle_promo_code: "Bundle Promo Code",
      bundle_apply_promo: "Apply Promo",
      bundle_surcharge_total: "Surcharge total",
      bundle_product_discount: "Product discount",
      bundle_pricing_adjustment: "Pricing rule adjustment",
      bundle_promo_discount: "Promo discount",
      bundle_final_total: "Final total",
      bundle_promo_applied: "Promo {code} applied.",
      bundle_base_price: "Bundle base price",
      bundle_included: "Included",
      gallery_title: "ThemeGood Gallery",
      gallery_subtitle: "Explore our product moments and wellness highlights.",
      out_of_stock: "Out of Stock",
      shop_now: "Shop Now",
      close_image: "Close image",
      previous_image: "Previous image",
      next_image: "Next image",
      zoom_in: "Zoom in",
      zoom_out: "Zoom out",
      facebook: "Facebook",
      instagram: "Instagram",
      whatsapp: "WhatsApp"
    },
    ms: {
      language: "Bahasa",
      quick_links: "Pautan Pantas",
      follow_us: "Ikuti Kami",
      home: "Utama",
      products: "Produk",
      shopping: "Kedai",
      gallery: "Galeri",
      track_order: "Jejak Pesanan",
      about: "Tentang Kami",
      flavours: "Perisa",
      bundles: "Bundle",
      testimonials: "Testimoni",
      faq: "Soalan Lazim",
      contact_us: "Hubungi Kami",
      checkout: "Bayaran",
      wishlist: "Senarai Hajat",
      cart: "Troli",
      buy_now: "Beli Sekarang",
      learn_more: "Ketahui Lagi",
      featured_products: "Produk Pilihan",
      name_pomegranate: "Multigrain Delima",
      name_bilberry: "Multigrain Bilberry",
      name_melon: "Multigrain Melon Avocado",
      name_passion: "Multigrain Buah Markisa",
      name_oat: "Multigrain Oat Beta Glukan",
      name_cocoa: "Multigrain Koko",
      add_to_cart: "Tambah ke Troli",
      close_details: "Tutup",
      price: "Harga",
      your_cart: "Troli Anda",
      your_wishlist: "Senarai Hajat Anda",
      close_cart: "Tutup troli",
      close_wishlist: "Tutup senarai hajat",
      open_navigation: "Buka navigasi",
      previous_slide: "Slaid sebelumnya",
      next_slide: "Slaid seterusnya",
      slide_navigation: "Navigasi slaid",
      total: "Jumlah:",
      discount: "Diskaun",
      back_to_top: "Kembali ke atas",
      about_themegood: "Tentang ThemeGood",
      about_lead: "Pemakanan kesihatan semula jadi berkualiti untuk gaya hidup moden.",
      hero_slide1_title: "Pemakanan kesihatan premium untuk gaya hidup moden.",
      hero_slide1_support: "Terokai cara yang lebih bersih dan lebih premium untuk membeli produk ThemeGood secara dalam talian.",
      hero_slide1_primary: "Beli Sekarang",
      hero_slide1_secondary: "Ketahui Lagi",
      hero_slide2_title: "Dibina untuk keluarga, diperhalus untuk rutin harian.",
      hero_slide2_support: "Formula seimbang dan pilihan saiz praktikal untuk keluarga yang mementingkan pemakanan lebih baik.",
      hero_slide2_primary: "Terokai Perisa",
      hero_slide2_secondary: "Lihat Bundle",
      hero_slide3_title: "Kualiti dipercayai dalam setiap hidangan.",
      hero_slide3_support: "Rasa yang konsisten, bahan kesihatan yang boleh dipercayai, dan persembahan premium dalam setiap pek.",
      hero_slide3_primary: "Beli Sekarang",
      hero_slide3_secondary: "Hubungi Kami",
      hero_slide4_title: "Nutrisi harian berkhasiat untuk rutin keluarga yang lebih kuat.",
      hero_slide4_support: "Temui campuran yang dirumus teliti untuk keselesaan, konsistensi, dan kehidupan moden.",
      hero_slide4_primary: "Beli Sekarang",
      hero_slide4_secondary: "Ketahui Lagi",
      hero_bar1_title: "Nutrisi Soya Sihat",
      hero_bar1_desc: "Keseimbangan rasa dan kesihatan untuk keluarga serta golongan profesional.",
      hero_bar2_title: "Tawaran Mesra Bundle",
      hero_bar2_desc: "Logik harga premium yang cepat, aliran pilihan mudah, dan kombinasi fleksibel.",
      hero_bar3_title: "Fokus Kesihatan Harian",
      hero_bar3_desc: "Direka untuk rutin praktikal dengan sokongan nutrisi yang lembut dan menyenangkan.",
      about_title_new: "Dicipta untuk keluarga, diolah dengan teliti.",
      about_lead_new: "ThemeGood menggabungkan sains pemakanan praktikal dengan persembahan produk yang kemas untuk rutin harian yang lebih tenang.",
      about_card1_title: "Bahan Dipilih Dengan Teliti",
      about_card1_desc: "Setiap campuran dibina dengan bahan yang dipilih untuk rasa, keselesaan, dan sokongan kesihatan harian.",
      about_card2_title: "Saiz Harian Yang Praktikal",
      about_card2_desc: "Pilihan 300g, 600g, dan 800g yang saling berkait memudahkan isian semula dan perancangan keluarga.",
      about_card3_title: "Pengalaman Premium",
      about_card3_desc: "Daripada cerita perisa hingga pembungkusan, setiap perincian dibentuk agar kelihatan kemas dan meyakinkan.",
      signature_kicker: "Pengalaman Signature",
      signature_title: "Cerita premium yang lebih tenang.",
      signature_desc: "Tipografi elegan dan tona hangat menjadikan koleksi ini terasa lebih halus.",
      signature_button: "Lihat Koleksi",
      signature_badge: "Kesihatan premium, dipersembahkan dengan jelas.",
      flavour_collection: "Koleksi Perisa",
      flavour_collection_title: "Koleksi perisa yang berkarakter",
      flavour_collection_intro: "Terokai pilihan cerita perisa yang direka untuk kesihatan harian dan persembahan premium.",
      flavour_pomegranate_title: "Pomegranate",
      flavour_pomegranate_heading: "Kaya, kemas, dan mudah dijadikan perisa utama untuk rutin harian yang lebih bertenaga.",
      flavour_pomegranate_desc: "Nota beri yang cerah dengan kemasan lembut untuk rutin harian yang menyegarkan.",
      flavour_pomegranate_cta: "Lihat pilihan",
      flavour_bilberry_title: "Bilberry",
      flavour_bilberry_heading: "Visual yang tenang dan halus untuk cerita perisa yang terasa premium dan meyakinkan.",
      flavour_bilberry_desc: "Profil lebih kaya dengan karakter buah mendalam dan kemanisan seimbang.",
      flavour_bilberry_cta: "Lihat pilihan",
      flavour_passion_title: "Passion Fruit",
      flavour_passion_heading: "Posisi perisa yang lebih cerah dan bertenaga tanpa kehilangan kekemasan visual.",
      flavour_passion_desc: "Aroma tropika dan rasa menyegarkan untuk nikmat harian yang lebih bertenaga.",
      flavour_passion_cta: "Lihat pilihan",
      featured_products_title: "Pilih campuran kesihatan harian anda",
      featured_products_intro: "Tukar antara saiz dan format sambil mengekalkan cerita produk yang konsisten.",
      bundles_title: "Bina bundle premium dalam beberapa minit",
      bundles_desc: "Pilih kombinasi, lihat harga asas yang telus, dan tambah bundle tersuai dengan yakin.",
      bundles_cta_primary: "Bina Bundle",
      bundles_cta_secondary: "Lihat Panduan Bundle",
      who_we_are: "Siapa Kami",
      who_we_are_desc: "ThemeGood membangunkan minuman kesihatan berkhasiat menggunakan bahan semula jadi terpilih dan formula seimbang.",
      perfect_recipe: "Resipi Sempurna",
      perfect_recipe_desc: "Campuran kami memberi tumpuan kepada serat, vitamin, mineral, dan sokongan pencernaan harian dengan sains pemakanan praktikal.",
      suitability: "Kesesuaian",
      suitability_desc: "Direka untuk dewasa, warga emas, dan keluarga yang mahukan pilihan kesihatan harian yang mudah dengan profil pemakanan lembut.",
      years_foundation: "Tahun Penubuhan",
      distributors_retailers: "Pengedar & Peruncit",
      reports_certifications: "Laporan & Pensijilan",
      monthly_orders: "Pesanan Bulanan",
      testimonials_title: "Apa Kata Pelanggan Kami",
      testimonials_intro: "Maklum balas sebenar daripada pelanggan yang menjadikan ThemeGood sebahagian daripada rutin kesihatan harian mereka.",
      faq_title: "Soalan Lazim",
      faq_intro: "Jawapan ringkas tentang saiz produk, pesanan, penghantaran, dan cara pengambilan harian.",
      faq_q1: "Bagaimana saya memilih antara 300g, 600g, dan 800g?",
      faq_a1: "Saiz 300g sesuai untuk mencuba produk, 600g sesuai sebagai saiz isian semula, dan 800g ideal untuk kegunaan isi rumah yang kerap.",
      faq_q2: "Bolehkah saya membuat pesanan terus dari laman web ini?",
      faq_a2: "Anda boleh melihat produk di sini dan juga membuat pembelian melalui kedai rasmi kami di Lazada dan Shopee untuk proses checkout yang lebih mudah.",
      faq_q3: "Bagaimanakah cara menikmati produk multigrain ThemeGood?",
      faq_a3: "Sediakan mengikut cara hidangan yang disyorkan dan nikmatinya sebagai sebahagian daripada rutin harian anda, sama ada pada waktu pagi atau sebagai minuman berkhasiat sepanjang hari.",
      faq_q4: "Bagaimana saya boleh menghubungi ThemeGood untuk pertanyaan produk?",
      faq_a4: "Anda boleh menghubungi kami melalui bahagian hubungan, saluran sosial, atau WhatsApp untuk maklumat lanjut tentang produk dan bantuan pesanan.",
      faq_q5: "Adakah anda menawarkan penghantaran ke seluruh negara?",
      faq_a5: "Ya, kami menyediakan penghantaran ke seluruh Malaysia. Tempoh penghantaran bergantung pada lokasi anda dan jadual kurier semasa.",
      faq_q6: "Bagaimana saya boleh menjejak pesanan saya?",
      faq_a6: "Selepas pesanan disahkan, anda boleh menjejak status pesanan melalui halaman jejak pesanan atau pautan kemas kini yang diberikan.",
      faq_q7: "Apakah polisi pemulangan anda?",
      faq_a7: "Pemulangan boleh dipertimbangkan untuk kes tertentu mengikut syarat yang ditetapkan. Sila hubungi pasukan kami untuk semakan lanjut.",
      faq_q8: "Bagaimana jika item saya tiba dalam keadaan rosak?",
      faq_a8: "Jika item rosak semasa diterima, hubungi kami secepat mungkin dengan bukti bergambar supaya kami boleh bantu dengan tindakan susulan.",
      faq_q9: "Bagaimana saya boleh menghubungi ThemeGood?",
      faq_a9: "Anda boleh hubungi kami melalui WhatsApp, e-mel, atau saluran sosial rasmi ThemeGood untuk sebarang pertanyaan.",
      faq_q10: "Adakah anda menerima pesanan khas atau pesanan borong?",
      faq_a10: "Ya, kami menerima pesanan khas dan borong. Sila hubungi pasukan kami untuk perbincangan kuantiti, harga, dan penghantaran.",
      testimonial_quote_1: "Campuran Pomegranate ini lembut, mudah disediakan, dan sudah menjadi sebahagian daripada rutin pagi saya.",
      testimonial_quote_2: "Ibu bapa saya menyukai pilihan Bilberry dan Oat Beta. Pilihan saiznya juga sangat praktikal dan mudah.",
      testimonial_quote_3: "Rasa Passion Fruit memang menonjol. Tempahan dalam talian mudah dan persembahan produknya terasa premium.",
      testimonial_author_1: "Cik Lim",
      testimonial_author_2: "Encik Gan",
      testimonial_author_3: "Cik Aina",
      testimonial_role_1: "Profesional Bekerja",
      testimonial_role_2: "Pembeli Keluarga",
      testimonial_role_3: "Pelanggan Tetap",
      desc_pomegranate: "Membantu menambah hormon wanita dan mengurangkan ketidakselesaan ketika haid serta menopaus.",
      desc_bilberry: "Membantu tidur, mengurangkan keletihan dan menapis cahaya biru.",
      desc_melon: "Membantu mengekalkan kelembapan kulit dan memperbaiki masalah artritis.",
      desc_passion: "Membantu menyahtoksik, mencantikkan kulit dan melegakan sistem saraf.",
      details_desc_pomegranate: "Membantu menambah hormon wanita dan mengurangkan ketidakselesaan ketika haid serta menopaus.",
      details_desc_bilberry: "Membantu tidur, mengurangkan keletihan dan menapis cahaya biru.",
      details_desc_melon: "Membantu mengekalkan kelembapan kulit dan memperbaiki masalah artritis.",
      details_desc_passion: "Membantu menyahtoksik, mencantikkan kulit dan melegakan sistem saraf.",
      desc_oat: "Oat beta-glukan membantu menurunkan jumlah kolesterol dan paras gula dalam darah.",
      desc_cocoa: "Ditambah dengan Tiger Milk Mushroom dan kale untuk menguatkan sistem pernafasan dan imuniti.",
      pomegranate_b1: "Sokongan serat tinggi",
      pomegranate_b2: "Keseimbangan pencernaan harian",
      pomegranate_b3: "Minuman kesihatan mudah bancuh",
      bilberry_b1: "Sokongan kesihatan mata",
      bilberry_b2: "Profil kaya antioksidan",
      bilberry_b3: "Sesuai untuk pengambilan harian",
      melon_b1: "Nutrien buah seimbang",
      melon_b2: "Formula harian yang lembut",
      melon_b3: "Sesuai untuk rutin aktif",
      passion_b1: "Profil nutrisi multigrain",
      passion_b2: "Campuran mesra rasa kenyang",
      passion_b3: "Kemasan rasa tropika",
      email: "E-mel:",
      phone: "Telefon:",
      location: "Lokasi:",
      find_our_shop: "Cari Kedai Kami",
      shop_map_label: "ThemeGood Wellness Nutrition",
      shop_map_address: "14, Jalan Tokong, Taman Hoover, 31650 Ipoh, Perak, Malaysia",
      hours_label: "Waktu:",
      hours_value: "Isnin-Ahad, 8:00 AM-5:00 PM",
      open_in_google_maps: "Buka di Google Maps",
      shop_location: "Lokasi Kedai ThemeGood",
      newsletter: "Surat Berita",
      newsletter_title: "Langgan Surat Berita Kami",
      newsletter_desc: "Dapatkan kemas kini produk kesihatan baharu dan tawaran istimewa.",
      newsletter_placeholder: "Masukkan e-mel anda",
      subscribe: "Langgan",
      scan_qr: "Imbas QR",
      shopping_title: "Membeli-belah",
      shopping_subtitle: "Pemakanan kesihatan premium yang diformulasikan untuk rutin harian moden.",
      shopping_hero_title_default: "Membeli-belah",
      shopping_hero_subtitle_default: "Terokai campuran kesihatan pilihan, tawaran bundle, dan aliran pratonton pantas seperti paparan produk penuh.",
      shopping_cta_title_default: "Sedia untuk Bayaran?",
      shopping_cta_subtitle_default: "Semak troli anda dan selesaikan pesanan dengan selamat.",
      shopping_cta_button_text_default: "Pergi ke Bayaran",
      shop_themegood: "Beli ThemeGood",
      best_sellers: "Paling Laris",
      curated_picks: "Pilihan Terpilih",
      shopping_best_seller_subtitle: "Tiga produk yang paling banyak dipilih, disusun untuk menonjol dengan jelas.",
      filter_products: "Tapis Produk",
      search: "Cari",
      search_products_placeholder: "Cari produk mengikut kata kunci",
      size: "Saiz",
      all_sizes: "Semua Saiz",
      package: "Pakej",
      all_packages: "Semua Pakej",
      clear_filters: "Kosongkan Penapis",
      shopping_details_title: "Butiran Membeli-belah",
      shopping_details_subtitle: "Temui maklumat produk lengkap, manfaat utama, dan sorotan nutrisi sebelum bayaran.",
      ready_to_checkout: "Sedia untuk Bayaran?",
      checkout_cta_desc: "Semak troli anda dan selesaikan pesanan dengan selamat.",
      checkout_cta_desc_details: "Item disimpan ke troli serta-merta. Semak dan lengkapkan pesanan anda pada bila-bila masa.",
      go_to_checkout: "Pergi ke Bayaran",
      secure_checkout: "Bayaran Selamat",
      review_order_payment: "Semak pesanan anda dan lengkapkan pembayaran.",
      order_summary: "Ringkasan Pesanan",
      subtotal: "Subjumlah",
      continue_shopping: "Teruskan Membeli-belah",
      payment_details: "Butiran Pembayaran",
      full_name: "Nama Penuh",
      address: "Alamat",
      secure_order: "Pesanan Selamat",
      fast_review: "Semakan Pantas",
      instant_confirmation: "Pengesahan Segera",
      checkout_details: "Butiran Checkout",
      place_order: "Buat Pesanan",
      card_number: "Nombor Kad",
      expiry_date: "Tarikh Luput",
      cvv: "CVV",
      pay_now: "Bayar Sekarang",
      footer_tagline: "ThemeGood Marketing",
      footer_copy: "© 2026 ThemeGood. Hak Cipta Terpelihara.",
      empty_cart: "Troli anda kosong.",
      empty_cart_before_checkout: "Troli anda kosong. Sila tambah produk sebelum bayaran.",
      payment_success: "Pembayaran berjaya dihantar.",
      invalid_email: "Sila masukkan alamat e-mel yang sah.",
      already_subscribed: "E-mel ini sudah dilanggan.",
      subscribed_success: "Berjaya dilanggan. Terima kasih!",
      subscribed_toast: "Dilanggani: {email}",
      added_to_cart_toast: "{name} ditambah ke troli!",
      added_to_wishlist_toast: "{name} ditambah ke senarai hajat!",
      removed_from_wishlist_toast: "{name} dikeluarkan dari senarai hajat.",
      promo_code_placeholder: "Kod promo",
      promo_removed: "Kod promo dibuang.",
      promo_unavailable: "Kod promo tidak lagi tersedia.",
      no_active_promo: "Tiada kod promo aktif sekarang.",
      invalid_promo_code: "Kod promo tidak sah.",
      bundle_empty: "Tiada slot bundle tersedia.",
      bundle_select_item: "Pilih item",
      bundle_premium_note: "Sesetengah pilihan menambah surcaj premium.",
      bundle_standard_note: "Semua pilihan dalam slot ini menggunakan harga standard.",
      bundle_build_title: "Bina Bundle Anda",
      bundle_build_sub: "Pilih item pilihan anda untuk setiap slot.",
      bundle_complete_all: "Lengkapkan semua pilihan",
      bundle_price_unavailable: "Harga tidak tersedia",
      bundle_savings: "Penjimatan bundle: {amount}",
      add_bundle_to_cart: "Tambah Bundle ke Troli",
      custom_bundle: "Bundle Tersuai",
      choose_size: "Pilih Saiz",
      pricing_rule_label: "Peraturan Harga",
      bundle_total_label: "Jumlah Bundle",
      no_bundle_slots_configured: "Tiada slot bundle dikonfigurasikan lagi.",
      loading_product: "Memuatkan produk...",
      product_not_found: "Produk tidak ditemui.",
      failed_to_load_products: "Gagal memuatkan produk.",
      failed_to_place_order: "Gagal membuat pesanan.",
      failed_to_load_promo: "Gagal memuatkan tetapan promo.",
      promo_applied: "{code} digunakan ({percent}% diskaun).",
      apply: "Guna",
      selected_item: "Item dipilih",
      bundle_recommended: "Disyorkan",
      selection_fallback: "Pilihan #{slotId}: Varian #{variantId}",
      product_label: "Produk",
      bundle_product_label: "Produk Bundle",
      size_label: "Saiz",
      no_image_available: "Tiada imej tersedia",
      product_details_coming_soon: "Butiran produk akan datang.",
      more_product_details_coming_soon: "Lebih banyak butiran produk akan datang.",
      bundle_promo_code: "Kod Promo Bundle",
      bundle_apply_promo: "Guna Promo",
      bundle_surcharge_total: "Jumlah surcaj",
      bundle_product_discount: "Diskaun produk",
      bundle_pricing_adjustment: "Pelarasan peraturan harga",
      bundle_promo_discount: "Diskaun promo",
      bundle_final_total: "Jumlah akhir",
      bundle_promo_applied: "Promo {code} digunakan.",
      bundle_base_price: "Harga asas bundle",
      bundle_included: "Termasuk",
      gallery_title: "Galeri ThemeGood",
      gallery_subtitle: "Terokai momen produk dan sorotan kesihatan kami.",
      out_of_stock: "Stok Habis",
      shop_now: "Beli Sekarang",
      close_image: "Tutup imej",
      previous_image: "Imej sebelumnya",
      next_image: "Imej seterusnya",
      zoom_in: "Zum masuk",
      zoom_out: "Zum keluar",
      facebook: "Facebook",
      instagram: "Instagram",
      whatsapp: "WhatsApp"
    },
    zh: {
      language: "语言",
      quick_links: "快速链接",
      follow_us: "关注我们",
      home: "首页",
      products: "产品",
      shopping: "商店",
      gallery: "图库",
      track_order: "追踪订单",
      about: "关于我们",
      flavours: "口味",
      bundles: "套餐",
      testimonials: "顾客评价",
      faq: "常见问题",
      contact_us: "联系我们",
      checkout: "结账",
      wishlist: "愿望清单",
      cart: "购物车",
      buy_now: "立即购买",
      learn_more: "了解更多",
      featured_products: "精选产品",
      name_pomegranate: "红石榴营养谷粮",
      name_bilberry: "黑果越橘营养谷粮",
      name_melon: "蜜瓜鳄梨营养谷粮",
      name_passion: "百香果营养谷粮",
      name_oat: "燕麦B葡聚糖 大豆分离蛋白",
      name_cocoa: "可可营养谷粮",
      add_to_cart: "加入购物车",
      close_details: "关闭",
      price: "价格",
      your_cart: "您的购物车",
      your_wishlist: "您的愿望清单",
      close_cart: "关闭购物车",
      close_wishlist: "关闭愿望清单",
      open_navigation: "打开导航",
      previous_slide: "上一张幻灯片",
      next_slide: "下一张幻灯片",
      slide_navigation: "幻灯片导航",
      total: "总计:",
      discount: "折扣",
      back_to_top: "返回顶部",
      about_themegood: "关于 ThemeGood",
      about_lead: "为现代生活打造的优质天然健康营养。",
      hero_slide1_title: "为现代生活方式打造的高端健康营养。",
      hero_slide1_support: "用更清晰、更高质感的方式在线探索 ThemeGood 产品。",
      hero_slide1_primary: "立即购买",
      hero_slide1_secondary: "了解更多",
      hero_slide2_title: "为家庭而设，为日常而精修。",
      hero_slide2_support: "均衡配方与实用规格，满足重视营养品质的家庭需求。",
      hero_slide2_primary: "探索口味",
      hero_slide2_secondary: "查看套餐",
      hero_slide3_title: "每一份都值得信赖的品质。",
      hero_slide3_support: "稳定口感、可靠营养原料与高质感包装呈现。",
      hero_slide3_primary: "立即选购",
      hero_slide3_secondary: "联系我们",
      hero_slide4_title: "为更有活力的家庭节奏提供每日营养支持。",
      hero_slide4_support: "探索为舒适感、一致性与现代生活而精心打造的配方组合。",
      hero_slide4_primary: "立即购买",
      hero_slide4_secondary: "了解更多",
      hero_bar1_title: "健康大豆营养",
      hero_bar1_desc: "为家庭与专业人士准备的风味与营养平衡方案。",
      hero_bar2_title: "套餐友好优惠",
      hero_bar2_desc: "快速透明定价、轻松选择流程与灵活组合方式。",
      hero_bar3_title: "聚焦日常健康",
      hero_bar3_desc: "为实用日常而设计，营养支持更温和、更易坚持。",
      about_title_new: "为家庭而作，细节用心打磨。",
      about_lead_new: "ThemeGood 将实用营养科学与精致产品呈现结合，带来更从容的每日健康体验。",
      about_card1_title: "严选配料",
      about_card1_desc: "每一款配方都围绕口感、舒适度与日常健康支持而设计。",
      about_card2_title: "实用规格",
      about_card2_desc: "300g、600g、800g 规格联动，补货与家庭规划更轻松。",
      about_card3_title: "高端体验",
      about_card3_desc: "从口味故事到包装呈现，每个细节都更精致、更可信。",
      signature_kicker: "品牌体验",
      signature_title: "更沉稳的高端故事。",
      signature_desc: "优雅字体与暖色调让整个系列更显精致。",
      signature_button: "浏览系列",
      signature_badge: "高端健康，清晰呈现。",
      flavour_collection: "口味系列",
      flavour_collection_title: "更有个性的口味系列",
      flavour_collection_intro: "探索为日常健康与高端呈现而打造的精选口味故事。",
      flavour_pomegranate_title: "红石榴",
      flavour_pomegranate_heading: "浓郁细致，适合作为日常活力主打口味来呈现。",
      flavour_pomegranate_desc: "明亮果香与顺滑尾韵，适合提振日常状态。",
      flavour_pomegranate_cta: "查看选项",
      flavour_bilberry_title: "黑果越橘",
      flavour_bilberry_heading: "沉稳而精致的视觉表达，让这款口味故事更显高级感。",
      flavour_bilberry_desc: "更浓郁的果味层次，甜感均衡不腻。",
      flavour_bilberry_cta: "查看选项",
      flavour_passion_title: "百香果",
      flavour_passion_heading: "更明亮、更有活力的口味定位，同时保持克制的视觉风格。",
      flavour_passion_desc: "热带香气与清新口感，日常饮用更有活力。",
      flavour_passion_cta: "查看选项",
      featured_products_title: "选择你的日常健康配方",
      featured_products_intro: "可在不同规格与包装间切换，同时保持一致的产品故事体验。",
      bundles_title: "几分钟完成高端套餐搭配",
      bundles_desc: "自由组合、透明查看基础价格，并自信添加自定义套餐。",
      bundles_cta_primary: "搭配套餐",
      bundles_cta_secondary: "查看套餐指南",
      who_we_are: "我们是谁",
      who_we_are_desc: "ThemeGood 采用精选天然原料与均衡配方，研发营养丰富的健康饮品。",
      perfect_recipe: "理想配方",
      perfect_recipe_desc: "我们的配方聚焦膳食纤维、维生素、矿物质，以及日常消化支持。",
      suitability: "适用人群",
      suitability_desc: "适合成人、长者与家庭，满足便捷日常健康营养需求。",
      years_foundation: "成立年数",
      distributors_retailers: "经销商与零售商",
      reports_certifications: "报告与认证",
      monthly_orders: "月订单量",
      testimonials_title: "顾客怎么说",
      testimonials_intro: "来自把 ThemeGood 纳入日常健康习惯的真实顾客反馈。",
      faq_title: "常见问题",
      faq_intro: "关于产品规格、下单、配送和日常饮用方式的快速解答。",
      faq_q1: "我应该如何选择 300g、600g 和 800g？",
      faq_a1: "300g 适合初次尝试，600g 适合作为日常补充装，800g 则更适合经常饮用的家庭使用。",
      faq_q2: "我可以直接在网站上下单吗？",
      faq_a2: "您可以在这里查看产品，也可以通过我们的 Lazada 和 Shopee 官方店铺完成更方便的结账流程。",
      faq_q3: "ThemeGood 营养谷粮产品应如何饮用？",
      faq_a3: "请按照建议的冲调方式准备，并将其作为日常习惯的一部分，不论是早晨饮用还是白天作为营养补充都可以。",
      faq_q4: "如果我有产品问题，要如何联系 ThemeGood？",
      faq_a4: "您可以通过联系我们页面、社交平台或 WhatsApp 与我们联系，获取更多产品和下单协助信息。",
      faq_q5: "你们提供全国配送吗？",
      faq_a5: "是的，我们提供马来西亚全国配送。配送时效会根据您所在地区与物流安排而有所不同。",
      faq_q6: "我该如何追踪我的订单？",
      faq_a6: "订单确认后，您可以通过订单追踪页面或我们提供的更新链接查看订单状态。",
      faq_q7: "你们的退货政策是什么？",
      faq_a7: "在符合相关条件的情况下可申请退货。请联系团队，我们会根据具体情况协助处理。",
      faq_q8: "如果我收到的商品有损坏怎么办？",
      faq_a8: "若商品到货时有损坏，请尽快联系并提供照片凭证，我们会协助您进行后续处理。",
      faq_q9: "我该如何联系 ThemeGood？",
      faq_a9: "您可以通过 WhatsApp、电子邮件或 ThemeGood 官方社交平台联系我们。",
      faq_q10: "你们接受定制或批发订单吗？",
      faq_a10: "是的，我们接受定制与批发订单。请联系团队洽谈数量、价格与配送安排。",
      testimonial_quote_1: "石榴配方口感顺滑、冲泡方便，已经成为我每天早上的固定选择。",
      testimonial_quote_2: "我父母很喜欢 Bilberry 和 Oat Beta，规格选择也很实用方便。",
      testimonial_quote_3: "Passion Fruit 的风味很突出，线上下单简单，产品呈现也很有品质感。",
      testimonial_author_1: "林女士",
      testimonial_author_2: "颜先生",
      testimonial_author_3: "艾娜女士",
      testimonial_role_1: "上班族",
      testimonial_role_2: "家庭采购者",
      testimonial_role_3: "回购顾客",
      desc_pomegranate: "补充女性荷尔蒙,降低生理期及更年期不适",
      desc_bilberry: "助眠防疲劳和过滤蓝光",
      desc_melon: "保持皮肤水分充足和改善关节炎",
      desc_passion: "排毒养颜 有效舒缓神经系统",
      details_desc_pomegranate: "补充女性荷尔蒙,降低生理期及更年期不适",
      details_desc_bilberry: "助眠防疲劳和过滤蓝光",
      details_desc_melon: "保持皮肤水分充足和改善关节炎",
      details_desc_passion: "排毒养颜 有效舒缓神经系统",
      desc_oat: "燕麦β葡聚糖有助于降低总胆固醇和血糖水平",
      desc_cocoa: "附加虎乳芝及羽衣甘蓝 增强呼吸与免疫系统",
      pomegranate_b1: "高纤维支持",
      pomegranate_b2: "日常消化平衡",
      pomegranate_b3: "易冲调健康饮品",
      bilberry_b1: "眼部健康支持",
      bilberry_b2: "富含抗氧化成分",
      bilberry_b3: "适合每日摄入",
      melon_b1: "均衡水果营养",
      melon_b2: "温和日常配方",
      melon_b3: "适合活跃生活",
      passion_b1: "多谷物营养结构",
      passion_b2: "更具饱腹友好性",
      passion_b3: "热带风味收尾",
      email: "邮箱:",
      phone: "电话:",
      location: "地址:",
      find_our_shop: "查找门店",
      shop_map_label: "ThemeGood Wellness Nutrition",
      shop_map_address: "14, Jalan Tokong, Taman Hoover, 31650 Ipoh, Perak, Malaysia",
      hours_label: "营业时间:",
      hours_value: "周一至周日，上午8:00-下午5:00",
      open_in_google_maps: "在 Google 地图打开",
      shop_location: "ThemeGood 门店位置",
      newsletter: "新闻通讯",
      newsletter_title: "订阅我们的新闻通讯",
      newsletter_desc: "获取新品与特别优惠的最新信息。",
      newsletter_placeholder: "输入您的邮箱",
      subscribe: "订阅",
      scan_qr: "扫码",
      shopping_title: "购物",
      shopping_subtitle: "为现代日常生活打造的高端健康营养配方。",
      shopping_hero_title_default: "购物",
      shopping_hero_subtitle_default: "探索精选健康配方、套餐优惠，以及像完整产品展示一样的快速预览流程。",
      shopping_cta_title_default: "准备结账？",
      shopping_cta_subtitle_default: "查看购物车并安全完成下单。",
      shopping_cta_button_text_default: "前往结账",
      shop_themegood: "选购 ThemeGood",
      best_sellers: "热销产品",
      curated_picks: "精选推荐",
      shopping_best_seller_subtitle: "精选三款最受欢迎的产品，呈现更清晰。",
      filter_products: "筛选产品",
      search: "搜索",
      search_products_placeholder: "按关键词搜索产品",
      size: "规格",
      all_sizes: "所有规格",
      package: "包装",
      all_packages: "所有包装",
      clear_filters: "清除筛选",
      shopping_details_title: "购物详情",
      shopping_details_subtitle: "在结账前了解完整产品信息、核心功效与营养亮点。",
      ready_to_checkout: "准备结账？",
      checkout_cta_desc: "查看购物车并安全完成下单。",
      checkout_cta_desc_details: "商品会即时保存到购物车，您可随时查看并完成下单。",
      go_to_checkout: "前往结账",
      secure_checkout: "安全结账",
      review_order_payment: "查看订单并完成付款。",
      order_summary: "订单摘要",
      subtotal: "小计",
      continue_shopping: "继续购物",
      payment_details: "支付信息",
      full_name: "姓名",
      address: "地址",
      secure_order: "安全下单",
      fast_review: "快速审核",
      instant_confirmation: "即时确认",
      checkout_details: "结账详情",
      place_order: "提交订单",
      card_number: "卡号",
      expiry_date: "到期日",
      cvv: "CVV",
      pay_now: "立即支付",
      footer_tagline: "ThemeGood Marketing",
      footer_copy: "© 2026 ThemeGood. 保留所有权利。",
      empty_cart: "您的购物车为空。",
      empty_cart_before_checkout: "您的购物车为空。请先添加产品再结账。",
      payment_success: "付款提交成功。",
      invalid_email: "请输入有效的邮箱地址。",
      already_subscribed: "该邮箱已订阅。",
      subscribed_success: "订阅成功，感谢您！",
      subscribed_toast: "已订阅: {email}",
      added_to_cart_toast: "{name} 已加入购物车！",
      added_to_wishlist_toast: "{name} 已加入愿望清单！",
      removed_from_wishlist_toast: "{name} 已从愿望清单移除。",
      promo_code_placeholder: "优惠码",
      promo_removed: "优惠码已移除。",
      promo_unavailable: "该优惠码已不可用。",
      no_active_promo: "当前没有可用优惠码。",
      invalid_promo_code: "优惠码无效。",
      bundle_empty: "暂无可用套餐槽位。",
      bundle_select_item: "选择项目",
      bundle_premium_note: "部分选择会增加额外费用。",
      bundle_standard_note: "此槽位中的所有选择均为标准价格。",
      bundle_build_title: "搭配您的套餐",
      bundle_build_sub: "为每个槽位选择您喜欢的项目。",
      bundle_complete_all: "请完成所有选择",
      bundle_price_unavailable: "价格暂不可用",
      bundle_savings: "套餐优惠：{amount}",
      add_bundle_to_cart: "加入套餐到购物车",
      custom_bundle: "自定义套餐",
      choose_size: "选择规格",
      pricing_rule_label: "价格规则",
      bundle_total_label: "套餐总价",
      no_bundle_slots_configured: "尚未设置套餐槽位。",
      loading_product: "正在加载产品...",
      product_not_found: "未找到产品。",
      failed_to_load_products: "加载产品失败。",
      failed_to_place_order: "下单失败。",
      failed_to_load_promo: "加载优惠设置失败。",
      promo_applied: "{code} 已应用（优惠 {percent}%）。",
      apply: "使用",
      selected_item: "已选项目",
      bundle_recommended: "推荐",
      selection_fallback: "选择 #{slotId}: 变体 #{variantId}",
      product_label: "产品",
      bundle_product_label: "套餐产品",
      size_label: "规格",
      no_image_available: "暂无图片",
      product_details_coming_soon: "产品详情即将更新。",
      more_product_details_coming_soon: "更多产品详情即将更新。",
      bundle_promo_code: "套餐优惠码",
      bundle_apply_promo: "使用优惠码",
      bundle_surcharge_total: "加价总额",
      bundle_product_discount: "产品折扣",
      bundle_pricing_adjustment: "价格规则调整",
      bundle_promo_discount: "优惠码折扣",
      bundle_final_total: "最终总价",
      bundle_promo_applied: "优惠码 {code} 已应用。",
      bundle_base_price: "套餐基础价",
      bundle_included: "已包含",
      gallery_title: "ThemeGood 图库",
      gallery_subtitle: "探索我们的产品瞬间与健康亮点。",
      out_of_stock: "缺货",
      shop_now: "立即选购",
      close_image: "关闭图片",
      previous_image: "上一张图片",
      next_image: "下一张图片",
      zoom_in: "放大",
      zoom_out: "缩小",
      facebook: "Facebook",
      instagram: "Instagram",
      whatsapp: "WhatsApp"
    }
  };

  const getLang = () => {
    const saved = localStorage.getItem("site_lang") || "en";
    return dict[saved] ? saved : "en";
  };

  const t = (key, vars = {}, lang = currentLang) => {
    const selected = dict[lang] ? lang : "en";
    const template = dict[selected][key] || dict.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, token) => (vars[token] ?? ""));
  };
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const formatMoney = (value) => {
    const amount = Number(value || 0);
    return `RM ${amount.toFixed(2)}`;
  };
  const formatSignedMoney = (value) => {
    const amount = Number(value || 0);
    const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    return `${sign}${formatMoney(Math.abs(amount))}`;
  };
  function formatBundleBreakdownLine(row = {}) {
    const rowPrice = Number(row.price || 0);
    const rowExtra = Number(row.extra || 0);
    const mainLabel = `${row.label || t("selected_item")}${row.size ? ` (${row.size})` : ""}`;
    const prefix = row.slot_label ? `${row.slot_label}: ` : "";
    const parts = [`${prefix}${mainLabel}`];

    if (row.pricing_note) {
      parts.push(row.pricing_note);
    }

    if (row.is_free_can) {
      parts.push("Free can");
    } else if (rowPrice > 0) {
      parts.push(formatMoney(rowPrice));
    } else if (rowExtra > 0) {
      parts.push(`+${formatMoney(rowExtra)}`);
    }

    return parts.join(" - ");
  }
  function getBundleBreakdownRowValueHtml(row = {}) {
    const rowPrice = Number(row.price || 0);
    const rowExtra = Number(row.extra || 0);

    if (row.is_free_can) {
      return `<strong class="bundle-extra-pill">Free can</strong>`;
    }

    if (rowPrice > 0) {
      return formatMoney(rowPrice);
    }

    if (rowExtra > 0) {
      return `<strong class="bundle-extra-pill">+${formatMoney(rowExtra)}</strong>`;
    }

    return t("bundle_included");
  }
  function normalizeLegacyBundlePricingNote(note = "") {
    const raw = String(note || "").trim();
    if (!raw) return "";
    if (/adds?\s*rm\s*\d+/i.test(raw)) return "";
    return raw;
  }
  function clearCurrentBundlePricingState() {
    if (!currentProduct?.isBundle) return;
    currentProduct.bundleSelections = [];
    currentProduct.bundleBreakdown = [];
    currentProduct.packagePrice = 0;
    currentProduct.bundlePromoCode = "";
  }
  function formatBundleSelectionSummary(bundleSelections = [], bundleBreakdown = []) {
    if (!Array.isArray(bundleSelections) || bundleSelections.length === 0) return "";

    if (Array.isArray(bundleBreakdown) && bundleBreakdown.length > 0) {
      return bundleBreakdown
        .map((row) => formatBundleBreakdownLine(row))
        .join(" • ");
    }

    return bundleSelections
      .map((row) => t("selection_fallback", { slotId: row.slot_id, variantId: row.variant_id }))
      .join(" • ");
  }

  currentLang = getLang();
  window.__themegoodLang = currentLang;
  window.__themegoodT = (key, vars = {}) => t(key, vars, currentLang);

  function ensureProductModal() {
    if (document.getElementById("product-modal")) return;
    const modal = document.createElement("div");
    modal.id = "product-modal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true" aria-label="${t("product_label")}">
        <button class="close-modal" aria-label="${t("close_details")}">×</button>
        <div class="modal-body">
          <div class="modal-visual-column">
            <div class="modal-image-shell">
              <img id="modal-image" alt="${t("product_label")}">
              <div class="product-certifications modal-certifications image-corner-certifications" aria-label="Product certifications">
                <span class="product-cert-badge is-halal">
                  <img src="/photos/halal-icon.png" alt="Halal certified" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
                </span>
                <span class="product-cert-badge is-vegetarian">
                  <img src="/photos/vegetarian-icon.png" alt="Suitable for Vegetarian" style="display:block !important;width:auto !important;height:50px !important;min-height:0 !important;max-height:50px !important;max-width:none !important;object-fit:contain !important;padding:0 !important;margin:0 !important;background:transparent !important;border-radius:0 !important;">
                </span>
              </div>
            </div>
            <div id="modal-gallery" class="modal-gallery"></div>
          </div>
          <div class="modal-detail-column">
            <div class="modal-copy-top">
              <p class="modal-kicker">ThemeGood Collection</p>
              <h3 id="modal-title"></h3>
              <p id="modal-description"></p>
            </div>
            <div id="modal-extra" class="modal-extra"></div>
            <div id="modal-size-options" class="modal-size-options"></div>
            <div class="modal-purchase-bar">
              <div class="modal-qty">
                <button id="modal-qty-dec" type="button" aria-label="-">-</button>
                <span id="modal-qty-value">1</span>
                <button id="modal-qty-inc" type="button" aria-label="+">+</button>
              </div>
              <div class="modal-actions">
                <button id="modal-close-action" type="button" class="btn btn-secondary">Close</button>
                <button id="modal-add-cart" class="btn">${t("add_to_cart")}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function ensureQrOverlay() {
    if (document.getElementById("qr-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "qr-overlay";
    overlay.className = "qr-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="qr-overlay-panel" role="dialog" aria-modal="true" aria-label="QR code preview">
        <button id="qr-overlay-close" class="qr-overlay-close" type="button" aria-label="Close image">×</button>
        <img id="qr-overlay-image" src="" alt="ThemeGood QR code">
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // --- Ensure Sidebar Markup Exists ---
  function ensureCommercePanels() {
    if (!document.getElementById("cart-sidebar")) {
      const cartSidebar = document.createElement("aside");
      cartSidebar.id = "cart-sidebar";
      cartSidebar.innerHTML = `
        <div class="cart-header">
          <h2>${t("your_cart")}</h2>
          <button id="close-cart" aria-label="${t("close_cart")}">×</button>
        </div>
        <ul id="cart-items"></ul>
        <div class="cart-summary">
          <p><strong>Subtotal:</strong> <span id="cart-subtotal">RM 0.00</span></p>
          <p><strong>Discount:</strong> <span id="cart-discount">-RM 0.00</span></p>
          <p><strong>${t("total")}</strong> <span id="cart-total">RM 0.00</span></p>
        </div>
        <div class="promo-box">
          <input id="promo-code" type="text" placeholder="${t("promo_code_placeholder")}" maxlength="32">
          <button id="apply-promo" type="button">${t("apply")}</button>
          <small id="promo-status" aria-live="polite"></small>
        </div>
        <a href="checkout.html" class="btn" style="display:inline-block;text-align:center;">${t("checkout")}</a>
      `;
      document.body.appendChild(cartSidebar);
    }

    if (!document.getElementById("cart-overlay")) {
      const cartOverlay = document.createElement("div");
      cartOverlay.id = "cart-overlay";
      document.body.appendChild(cartOverlay);
    }
  }

  ensureProductModal();
  ensureQrOverlay();
  ensureCommercePanels();
  // --- UI Elements ---
  const modal = document.getElementById("product-modal");
  const modalImage = document.getElementById("modal-image");
  const modalTitle = document.getElementById("modal-title");
  const modalDescription = document.getElementById("modal-description");
  const modalExtra = document.getElementById("modal-extra");
  const modalSizeOptions = document.getElementById("modal-size-options");
  const modalQtyDec = document.getElementById("modal-qty-dec");
  const modalQtyInc = document.getElementById("modal-qty-inc");
  const modalQtyValue = document.getElementById("modal-qty-value");
  const modalGallery = document.getElementById("modal-gallery");
  const qrOverlay = document.getElementById("qr-overlay");
  const qrOverlayImage = document.getElementById("qr-overlay-image");
  const cartList = document.getElementById("cart-items");
  const cartSubtotal = document.getElementById("cart-subtotal");
  const cartDiscount = document.getElementById("cart-discount");
  const cartTotal = document.getElementById("cart-total");
  const cartCount = document.getElementById("cart-count");
  const promoInput = document.getElementById("promo-code");
  const applyPromoBtn = document.getElementById("apply-promo");
  const promoStatus = document.getElementById("promo-status");
  const toastContainer = document.getElementById("toast-container");

  // --- Utility Functions ---
  function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
  function saveCart() { localStorage.setItem("cart", JSON.stringify(cartItems)); }
  function saveCartPromo() { localStorage.setItem("cart_promo", JSON.stringify(cartPromo)); }

  async function loadPromoConfig() {
    try {
      const response = await fetch("/api/promo-settings");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || t("failed_to_load_promo"));
      }

      promoConfig = {
        active: Boolean(payload.active),
        code: String(payload.code || "").trim().toUpperCase(),
        percent: Number(payload.percent || 0)
      };
    } catch (error) {
      console.error(error);
      promoConfig = { active: false, code: "", percent: 0 };
    }

    if (cartPromo.code) {
      if (!promoConfig.active || cartPromo.code !== promoConfig.code) {
        cartPromo = { code: "", percent: 0 };
        if (promoStatus) promoStatus.textContent = t("promo_unavailable");
      } else {
        cartPromo.percent = promoConfig.percent;
      }
      saveCartPromo();
    }
  }

  function setText(selector, key) {
    const el = document.querySelector(selector);
    if (el) el.textContent = t(key);
  }

  function setHeaderActionLabel(buttonId, key, countId, iconText) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    const count = document.getElementById(countId);
    if (!count) return;
    const label = t(key);
    const iconClass = "header-action-icon is-cart";

    button.setAttribute("aria-label", label);
    button.innerHTML = `
      <span class="${iconClass}" aria-hidden="true">${iconText}</span>
      <span class="header-action-label">${label}</span>
    `;
    button.appendChild(count);
  }

  function isCocoaProduct(productRef) {
    if (!productRef) return false;
    if (typeof productRef === "string") return /cocoa/i.test(productRef);
    if (typeof productRef === "number") return isCocoaProductById(productRef);
    const id = Number(productRef.dataset?.id || productRef.id || 0);
    const name = productRef.dataset?.name || productRef.name || "";
    return isCocoaProductById(id) || /cocoa/i.test(name);
  }

  function calculateSizePrice(basePrice, size = sizeOptions[0], productRef = null) {
    if (isCocoaProduct(productRef) && size?.id && cocoaSizePrices[size.id] !== undefined) {
      return Number(cocoaSizePrices[size.id]);
    }

    const managedSizePrice = getManagedSizePrice(productRef, size?.id);
    if (managedSizePrice !== null) {
      return managedSizePrice;
    }

    if (!isCocoaProduct(productRef)) {
      return Number(fixedSizePrices[size.id] || fixedSizePrices.small || 0);
    }
    return Number(basePrice || 0) * Number(size.multiplier || 1);
  }

  function calculatePackagePrice(basePrice, pack, size = sizeOptions[0], productRef = null) {
    if (pack?.hasDirectPrice && Number.isFinite(pack.price)) {
      return Math.max(0, Number(pack.price));
    }
    const sizeAdjusted = calculateSizePrice(basePrice, size, productRef);
    const subtotal = sizeAdjusted * Number(pack.units || 1);
    const percentDiscount = Math.min(100, Math.max(0, Number(pack.discountPercent || 0)));
    const fixedDiscount = Math.max(0, Number(pack.discountAmount || 0));
    const discountedSubtotal = subtotal * (1 - (percentDiscount / 100));
    return Math.max(0, discountedSubtotal - fixedDiscount);
  }

  function getSelectedSize(card) {
    const selectedPackage = getSelectedPackage(card);
    if (selectedPackage?.hasDirectPrice) {
      return getVariantSizeInfo(selectedPackage);
    }

    const allowedSizes = getAllowedSizes(card);
    const purchaseOptionSelect = card.querySelector(".purchase-option-select");
    if (purchaseOptionSelect) {
      const selectedValue = String(purchaseOptionSelect.value || "");
      const [sizeId] = selectedValue.split("::");
      const size = allowedSizes.find((entry) => entry.id === sizeId);
      if (size) return size;
    }
    const active = card.querySelector(".size-option.is-active");
    if (active) {
      const size = allowedSizes.find(s => s.id === active.dataset.sizeId);
      if (size) return size;
    }
    const select = card.querySelector(".size-select");
    if (select) {
      const size = allowedSizes.find(s => s.id === select.value);
      if (size) return size;
    }
    return allowedSizes[0];
  }

  function isBundleProduct(productRef) {
    const productId = String(getProductId(productRef));
    const catalogProductType = storefrontProductsById[productId]?.product_type;
    return String(productRef?.dataset?.productType || productRef?.product_type || catalogProductType || "").toLowerCase() === "bundle";
  }

  async function fetchBundleDefinition(productId) {
    console.log("[bundle] fetchBundleDefinition:start", { productId });
    const response = await fetch(`/api/products/${productId}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || t("product_not_found"));
    }

    const bundleSlots = Array.isArray(payload?.bundle_slots) ? payload.bundle_slots : [];
    const variantsBySize = payload?.selectable_variants_by_size || {};
    console.log("[bundle] fetchBundleDefinition:result", {
      productId,
      productType: String(payload?.product?.product_type || payload?.product_type || "").toLowerCase(),
      bundleSlotsCount: bundleSlots.length,
      slotSelectableCounts: bundleSlots.map((slot) => ({
        slotId: slot?.id,
        slotLabel: slot?.slot_label,
        choices: Array.isArray(slot?.selectable_variants) ? slot.selectable_variants.length : 0,
        freeCan: Boolean(slot?.is_free_can_slot)
      })),
      selectableVariantSizeKeys: Object.keys(variantsBySize),
      selectableVariantCountsBySize: Object.fromEntries(
        Object.entries(variantsBySize).map(([size, items]) => [size, Array.isArray(items) ? items.length : 0])
      )
    });

    if (!bundleSlots.length) {
      console.warn("[bundle] fetchBundleDefinition: bundle_slots is empty", { productId, payload });
    }

    return payload;
  }

  function renderBundleSelectors(bundleData) {
    const slots = Array.isArray(bundleData?.bundle_slots) ? bundleData.bundle_slots : [];
    const variantsBySize = bundleData?.selectable_variants_by_size || {};

    console.log("[bundle] renderBundleSelectors", {
      bundleSlotsCount: slots.length,
      slotSelectableCounts: slots.map((slot) => ({
        slotId: slot?.id,
        slotLabel: slot?.slot_label,
        choices: Array.isArray(slot?.selectable_variants) ? slot.selectable_variants.length : null
      })),
      selectableVariantSizeKeys: Object.keys(variantsBySize),
      selectableVariantCountsBySize: Object.fromEntries(
        Object.entries(variantsBySize).map(([size, items]) => [size, Array.isArray(items) ? items.length : 0])
      )
    });

    if (!slots.length) {
      console.warn("[bundle] renderBundleSelectors: bundle_slots is empty", { bundleData });
      return `<p class="bundle-empty">No bundle slots available.</p>`;
    }

    return `
      <div class="bundle-selector-stack">
        ${slots.map((slot) => {
          const requiredSize = String(slot.required_size || "").trim();
          const normalizedRequiredSize = requiredSize.toLowerCase();
          const choices = Array.isArray(slot.selectable_variants)
            ? slot.selectable_variants
            : (Array.isArray(variantsBySize[requiredSize])
              ? variantsBySize[requiredSize]
              : (Array.isArray(variantsBySize[normalizedRequiredSize]) ? variantsBySize[normalizedRequiredSize] : []));

          if (!choices.length) {
            console.warn("[bundle] renderBundleSelectors: no selectable variants for required size", {
              slotId: slot.id,
              slotLabel: slot.slot_label,
              requiredSize,
              availableSizeKeys: Object.keys(variantsBySize)
            });
          }

          return `
            <div class="bundle-slot-picker" data-slot-id="${slot.id}">
              <label class="bundle-slot-label">${slot.slot_label}</label>
              ${slot.slot_note ? `<p class="bundle-slot-help">${escapeHtml(slot.slot_note)}</p>` : ""}
              <select class="bundle-slot-select" data-slot-id="${slot.id}">
                <option value="">Select ${requiredSize}</option>
                ${choices.map((choice) => {
                  const extra = Number(choice.bundle_display_adjustment ?? 0);
                  return `
                  <option
                    value="${choice.id}"
                    data-price="${Number(choice.price || 0)}"
                    data-extra="${extra}"
                    data-name="${escapeHtml(choice.product_name || "")}"
                    data-size="${escapeHtml(choice.size_name || "")}"
                    data-pricing-note="${escapeHtml(choice.bundle_price_note || "")}"
                    data-free-can="${slot.is_free_can_slot ? "true" : "false"}"
                  >
                    ${escapeHtml(choice.product_name || "")}
                    (${escapeHtml(choice.size_name || "")})
                  </option>
                `;
              }).join("")}
            </select>
          </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function autoSelectRecommendedBundleOptions() {
    return;
  }

  function getBundleSelectionsFromModal() {
    return [...document.querySelectorAll(".bundle-slot-select")]
      .filter((select) => select.value)
      .map((select) => ({
        slot_id: Number(select.dataset.slotId),
        variant_id: Number(select.value)
      }));
  }

  function getBundleBreakdownFromModal() {
    const selectCount = document.querySelectorAll(".bundle-slot-select").length;
    if (
      currentProduct?.isBundle &&
      Array.isArray(currentProduct.bundleBreakdown) &&
      currentProduct.bundleBreakdown.length === selectCount
    ) {
      return currentProduct.bundleBreakdown.map((row) => ({ ...row }));
    }

    return [...document.querySelectorAll(".bundle-slot-select")]
      .filter((select) => select.value)
      .map((select) => {
        const option = select.options[select.selectedIndex];
        return {
          slot_label: select.closest(".bundle-slot-picker")?.querySelector(".bundle-slot-label")?.textContent?.trim() || "",
          label: option?.dataset?.name || t("selected_item"),
          size: option?.dataset?.size || "",
          price: Number(option?.dataset?.price || 0),
          extra: Number(option?.dataset?.extra || 0),
          pricing_note: option?.dataset?.pricingNote || "",
          is_free_can: option?.dataset?.freeCan === "true"
        };
      });
  }

  function buildBundleBreakdownRowsFromSelects(selects = []) {
    const sizes = selects.map((select) => String(select.options[select.selectedIndex]?.dataset?.size || "").trim().toLowerCase());
    const isTwoPlusOneBundle = sizes.length === 3
      && sizes.filter((size) => size === "800g").length === 2
      && sizes.filter((size) => size === "300g").length === 1;
    const isFiveCanBundle = sizes.length === 5
      && sizes.every((size) => size === "800g");

    const rows = selects.map((select) => {
      const option = select.options[select.selectedIndex];
      const label = option?.dataset?.name || t("selected_item");
      const size = option?.dataset?.size || "";
      const normalizedSize = String(size).toLowerCase();
      const isCocoa = /cocoa/i.test(String(label));
      const isPassionBeetroot = /passion/i.test(String(label)) && /beetroot/i.test(String(label));
      let price = Number(option?.dataset?.price || 0);
      let extra = Number(option?.dataset?.extra || 0);
      const pricingNote = normalizeLegacyBundlePricingNote(option?.dataset?.pricingNote || "");

      if (isTwoPlusOneBundle) {
        if (normalizedSize === "800g") {
          if (isCocoa) {
            price = 128;
            extra = 0;
          } else {
            price = 103 + extra;
            extra = 0;
          }
        } else if (normalizedSize === "300g") {
          price = 27 + (isCocoa ? 0 : extra);
          extra = 0;
        }
      }

      return {
        slot_label: select.closest(".bundle-slot-picker")?.querySelector(".bundle-slot-label")?.textContent?.trim() || "",
        label,
        size,
        price,
        extra,
        isCocoa,
        isPassionBeetroot,
        pricing_note: pricingNote,
        is_free_can: option?.dataset?.freeCan === "true"
      };
    });

    if (isFiveCanBundle) {
      const discountedIndex = (() => {
        const plainMixIndex = rows.findIndex((row) => !row.isCocoa && !row.isPassionBeetroot);
        if (plainMixIndex >= 0) return plainMixIndex;
        const nonCocoaIndex = rows.findIndex((row) => !row.isCocoa);
        if (nonCocoaIndex >= 0) return nonCocoaIndex;
        return rows.length > 0 ? 0 : -1;
      })();

      return rows.map((row, index) => {
        const discounted = index === discountedIndex;
        let resolvedPrice = 103 + Number(row.extra || 0);

        if (row.isCocoa) {
          resolvedPrice = 128;
        } else if (row.isPassionBeetroot && !row.isCocoa) {
          resolvedPrice = discounted ? 49 : 98;
        } else if (discounted) {
          resolvedPrice = 54 + Number(row.extra || 0);
        }

        return {
          ...row,
          price: resolvedPrice,
          extra: 0,
          pricing_note: row.isCocoa ? "" : (discounted ? "Discounted 5th can" : row.pricing_note)
        };
      });
    }

    return rows;
  }

  function getPreviewBundleTotalFromRows(rows = []) {
    return Number((Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.price || 0), 0).toFixed(2));
  }

  function isTwoPlusOneBundleBreakdown(rows = []) {
    const sizes = (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.size || "").trim().toLowerCase());
    return sizes.length === 3
      && sizes.filter((size) => size === "800g").length === 2
      && sizes.filter((size) => size === "300g").length === 1;
  }

  function isFiveCanBundleBreakdown(rows = []) {
    const sizes = (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.size || "").trim().toLowerCase());
    return sizes.length === 5 && sizes.every((size) => size === "800g");
  }

  function resolveBundleDisplayTotals(rows = [], totals = {}) {
    const previewTotal = getPreviewBundleTotalFromRows(rows);

    if ((isTwoPlusOneBundleBreakdown(rows) || isFiveCanBundleBreakdown(rows)) && previewTotal > 0) {
      return {
        baseBundlePrice: previewTotal,
        subtotal: previewTotal,
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

  function renderFullBundleBreakdownPreview(breakdownEl, rows = [], totals = {}) {
    if (!breakdownEl) return;

    const selectedRows = Array.isArray(rows) ? rows : [];
    const resolvedTotals = resolveBundleDisplayTotals(selectedRows, totals);
    const baseBundlePrice = Number(resolvedTotals.baseBundlePrice || 0);
    const subtotal = Number(resolvedTotals.subtotal || 0);
    const surchargeTotal = Number(resolvedTotals.surchargeTotal ?? Math.max(0, subtotal - baseBundlePrice));
    const productDiscount = Number(totals.productDiscount || 0);
    const pricingRuleAdjustment = Number(totals.pricingRuleAdjustment || 0);
    const promoDiscount = Number(totals.promoDiscount || 0);
    const finalTotal = Number(
      resolvedTotals.finalTotal
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
            <span>${getBundleBreakdownRowValueHtml(row)}</span>
          </div>
        `).join("")}
        <div class="bundle-breakdown-row">
          <span>${t("bundle_base_price")}</span>
          <span>${formatMoney(baseBundlePrice)}</span>
        </div>
        <div class="bundle-breakdown-row">
          <span>${t("bundle_surcharge_total")}</span>
          <span>${formatSignedMoney(surchargeTotal)}</span>
        </div>
        <div class="bundle-breakdown-row">
          <span>${t("bundle_product_discount")}</span>
          <span>${formatSignedMoney(-productDiscount)}</span>
        </div>
        <div class="bundle-breakdown-row">
          <span>${t("bundle_pricing_adjustment")}</span>
          <span>${formatSignedMoney(pricingRuleAdjustment)}</span>
        </div>
        <div class="bundle-breakdown-row">
          <span>${t("bundle_promo_discount")}</span>
          <span>${formatSignedMoney(-promoDiscount)}</span>
        </div>
        <div class="bundle-breakdown-row">
          <span><strong>${t("bundle_final_total")}</strong></span>
          <span><strong>${formatMoney(finalTotal)}</strong></span>
        </div>
      </div>
    `;
  }

  function renderPartialBundleBreakdown(breakdownEl, rows = [], note = "Select the remaining flavours to see the final total.") {
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
            <span>${getBundleBreakdownRowValueHtml(row)}</span>
          </div>
        `).join("")}
        <div class="bundle-breakdown-row">
          <span>${escapeHtml(note)}</span>
          <span>${formatMoney(selectedSubtotal)}</span>
        </div>
      </div>
    `;
  }

  async function updateBundleModalPrice(bundleId) {
    const totalEl = document.getElementById("modal-bundle-total");
    const breakdownEl = document.getElementById("modal-bundle-breakdown");
    const savingsEl = document.getElementById("modal-bundle-savings");
    const promoInputEl = document.getElementById("modal-bundle-promo-code");
    const promoStatusEl = document.getElementById("modal-bundle-promo-status");
    const modalAddCartBtn = document.getElementById("modal-add-cart");

    if (!totalEl) return;

    const selects = [...document.querySelectorAll(".bundle-slot-select")];
    const selections = getBundleSelectionsFromModal();
    const baseBundlePrice = Number(currentProduct?.price || currentProduct?.packagePrice || 0);

    if (selects.length === 0) {
      totalEl.textContent = formatMoney(0);
      if (breakdownEl) breakdownEl.innerHTML = "";
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
      if (modalAddCartBtn) modalAddCartBtn.disabled = true;
      clearCurrentBundlePricingState();
      return;
    }

    if (selections.length !== selects.length) {
      totalEl.textContent = t("bundle_complete_all");
      renderPartialBundleBreakdown(
        breakdownEl,
        buildBundleBreakdownRowsFromSelects(selects.filter((select) => select.value))
      );
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
      if (modalAddCartBtn) modalAddCartBtn.disabled = true;
      clearCurrentBundlePricingState();
      return;
    }

    const promoCode = String(promoInputEl?.value || "").trim().toUpperCase();

    const response = await fetch(`/api/bundles/${bundleId}/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ selections, promo_code: promoCode })
    });

    const payload = await response.json();

    if (!response.ok) {
      if (promoCode) {
        if (promoStatusEl) promoStatusEl.textContent = payload.error || t("bundle_price_unavailable");

        const fallbackResponse = await fetch(`/api/bundles/${bundleId}/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ selections })
        });
        const fallbackPayload = await fallbackResponse.json();

        if (!fallbackResponse.ok) {
          const selectedRows = buildBundleBreakdownRowsFromSelects(selects);
          const previewTotal = getPreviewBundleTotalFromRows(selectedRows);
          totalEl.textContent = formatMoney(previewTotal);
          renderFullBundleBreakdownPreview(breakdownEl, selectedRows, {
            baseBundlePrice,
            subtotal: previewTotal,
            surchargeTotal: Math.max(0, previewTotal - baseBundlePrice),
            finalTotal: previewTotal
          });
          if (savingsEl) savingsEl.textContent = "";
          if (promoStatusEl) promoStatusEl.textContent = payload.error || fallbackPayload.error || "";
          if (modalAddCartBtn) modalAddCartBtn.disabled = previewTotal <= 0;
          if (currentProduct) {
            currentProduct.bundleSelections = selections;
            currentProduct.bundleBreakdown = selectedRows;
            currentProduct.packagePrice = previewTotal;
            currentProduct.bundlePromoCode = "";
          }
          return;
        }

        return updateBundleModalPriceFromPayload(fallbackPayload, selections, selects, {
          totalEl,
          breakdownEl,
          savingsEl,
          promoStatusEl,
          appliedPromoCode: "",
          modalAddCartBtn
        });
      }

      const selectedRows = buildBundleBreakdownRowsFromSelects(selects);
      const previewTotal = getPreviewBundleTotalFromRows(selectedRows);
      totalEl.textContent = formatMoney(previewTotal);
      renderFullBundleBreakdownPreview(breakdownEl, selectedRows, {
        baseBundlePrice,
        subtotal: previewTotal,
        surchargeTotal: Math.max(0, previewTotal - baseBundlePrice),
        finalTotal: previewTotal
      });
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
      if (modalAddCartBtn) modalAddCartBtn.disabled = previewTotal <= 0;
      if (currentProduct) {
        currentProduct.bundleSelections = selections;
        currentProduct.bundleBreakdown = selectedRows;
        currentProduct.packagePrice = previewTotal;
        currentProduct.bundlePromoCode = "";
      }
      return;
    }

    updateBundleModalPriceFromPayload(payload, selections, selects, {
      totalEl,
      breakdownEl,
      savingsEl,
      promoStatusEl,
      appliedPromoCode: payload.applied_promo_code || promoCode,
      modalAddCartBtn
    });
  }

  function updateBundleModalPriceFromPayload(payload, selections, selects, ui) {
    const { totalEl, breakdownEl, savingsEl, promoStatusEl, appliedPromoCode, modalAddCartBtn } = ui;
    const payloadResolvedTotal = Number.isFinite(Number(payload?.total))
      ? Number(payload.total)
      : Number(payload?.subtotal || 0);
    const subtotal = Number(payload.subtotal || 0);
    const surchargeTotal = Number(payload.surcharge_total || 0);
    const productDiscount = Number(payload.product_discount || 0);
    const promoDiscount = Number(payload.promo_discount || 0);
    const pricingRuleAdjustment = Number(payload.pricing_rule_adjustment || 0);
    const baseBundlePrice = Number(payload.base_bundle_price ?? Math.max(0, subtotal - surchargeTotal));
    const fallbackRows = buildBundleBreakdownRowsFromSelects(selects);
    const payloadRows = Array.isArray(payload.breakdown) && payload.breakdown.length === selects.length
      ? payload.breakdown.map((row) => ({ ...row }))
      : [];
    const selectedRows = payloadRows.length === selects.length ? payloadRows : fallbackRows;
    const displayTotals = resolveBundleDisplayTotals(selectedRows, {
      baseBundlePrice,
      subtotal,
      surchargeTotal,
      finalTotal: payloadResolvedTotal
    });
    const resolvedTotal = Number(displayTotals.finalTotal || payloadResolvedTotal);
    totalEl.textContent = formatMoney(resolvedTotal);

    if (breakdownEl) {
      renderFullBundleBreakdownPreview(breakdownEl, selectedRows, {
        baseBundlePrice: displayTotals.baseBundlePrice,
        subtotal: displayTotals.subtotal,
        surchargeTotal: displayTotals.surchargeTotal,
        productDiscount,
        pricingRuleAdjustment,
        promoDiscount,
        finalTotal: resolvedTotal
      });
    }

    const total = resolvedTotal;
    const savings = subtotal - total;

    if (savingsEl) {
      if (savings > 0) {
        savingsEl.textContent = t("bundle_savings", { amount: formatMoney(savings) });
        savingsEl.style.display = "";
      } else {
        savingsEl.textContent = "";
        savingsEl.style.display = "none";
      }
    }

    if (promoStatusEl) {
      promoStatusEl.textContent = appliedPromoCode
        ? t("bundle_promo_applied", { code: appliedPromoCode })
        : "";
    }

    if (modalAddCartBtn) {
      modalAddCartBtn.disabled = false;
    }

    if (currentProduct) {
      currentProduct.bundleSelections = selections;
      currentProduct.packagePrice = total;
      currentProduct.bundleBreakdown = selectedRows;
      currentProduct.bundlePromoCode = appliedPromoCode || "";
    }
  }

  function getSizeIndex(sizeId) {
    const index = sizeOptions.findIndex(s => s.id === sizeId);
    return index >= 0 ? index : 0;
  }

  function inferSizeIdFromImageUrl(imageUrl) {
    const normalizedImageUrl = normalizeImageUrl(imageUrl).toLowerCase();
    if (!normalizedImageUrl) return "";
    if (normalizedImageUrl.includes("300g")) return "small";
    if (normalizedImageUrl.includes("600g")) return "medium";
    if (normalizedImageUrl.includes("800g")) return "large";
    return "";
  }

  function getComparableImagePath(imageUrl) {
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

  function getComparableImageName(imageUrl) {
    const path = getComparableImagePath(imageUrl);
    if (!path) return "";
    const filename = String(path.split("/").pop() || "");
    return filename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/gi, "");
  }

  function getFallbackGalleryImageForSize(productRef, sizeId) {
    const stored = getStoredImagesForProduct(productRef)
      .map((image) => normalizeImageUrl(image.image_url))
      .filter(Boolean);
    const custom = String(productRef?.dataset?.gallery || "")
      .split(",")
      .map((entry) => normalizeImageUrl(entry.trim()))
      .filter(Boolean);
    const gallery = [...new Set([...stored, ...custom])];
    if (gallery.length === 0) return "";
    const filenameMatched = gallery.find((src) => inferSizeIdFromImageUrl(src) === sizeId);
    if (filenameMatched) return filenameMatched;
    const idx = Math.min(getSizeIndex(sizeId), gallery.length - 1);
    return gallery[idx] || gallery[0] || "";
  }

  function getVariantImageForSize(productRef, sizeId) {
    const normalizedSizeId = normalizeSizeId(sizeId);
    if (!normalizedSizeId) return "";
    const mappedImage = getMappedSizeImageForProduct(productRef, normalizedSizeId);
    if (mappedImage) return mappedImage;
    if (isCocoaProduct(productRef)) {
      const cocoaImage = getCocoaForcedImage(normalizedSizeId);
      if (cocoaImage) return cocoaImage;
    }

    const variants = getVariantsForProduct(productRef);
    const exactVariant = variants.find((variant) => {
      if (normalizeSizeId(variant?.name) !== normalizedSizeId) return false;
      const variantImageUrl = normalizeImageUrl(variant?.imageUrl || "");
      if (!variantImageUrl) return false;
      const inferredImageSizeId = inferSizeIdFromImageUrl(variantImageUrl);
      return !inferredImageSizeId || inferredImageSizeId === normalizedSizeId;
    });

    if (exactVariant?.imageUrl) {
      return normalizeImageUrl(exactVariant.imageUrl);
    }

    const galleryMatchedImage = getFallbackGalleryImageForSize(productRef, normalizedSizeId);
    if (galleryMatchedImage) return galleryMatchedImage;

    const looseVariant = variants.find((variant) =>
      normalizeSizeId(variant?.name) === normalizedSizeId && String(variant?.imageUrl || "").trim()
    );
    return normalizeImageUrl(looseVariant?.imageUrl || "");
  }

  function getVariantForSize(productRef, sizeId) {
    const normalizedSizeId = normalizeSizeId(sizeId);
    if (!normalizedSizeId) return null;

    return getVariantsForProduct(productRef).find((variant) =>
      normalizeSizeId(variant?.name) === normalizedSizeId
    ) || null;
  }

  function getSizeIdForImage(productRef, imageUrl) {
    const imagePath = getComparableImagePath(imageUrl);
    const imageName = getComparableImageName(imageUrl);
    if (!imagePath && !imageName) return "";

    const directVariant = getVariantsForProduct(productRef).find((variant) =>
      getComparableImagePath(variant?.imageUrl || "") === imagePath ||
      (imageName && getComparableImageName(variant?.imageUrl || "") === imageName)
    );
    if (directVariant) {
      return getVariantSizeInfo(directVariant).id;
    }

    const matchedSize = getAllowedSizes(productRef).find((size) =>
      getComparableImagePath(getVariantImageForSize(productRef, size.id)) === imagePath ||
      (imageName && getComparableImageName(getVariantImageForSize(productRef, size.id)) === imageName)
    );
    if (matchedSize?.id) return matchedSize.id;

    return inferSizeIdFromImageUrl(imagePath || imageName || imageUrl);
  }

  function syncCardSelectionFromImage(card, imageUrl) {
    const comboSelect = card?.querySelector(".purchase-option-select");
    if (!comboSelect) return false;

    const sizeId = getSizeIdForImage(card, imageUrl);
    if (!sizeId) return false;

    const directPriceVariants = getVariantsForProduct(card).filter((variant) => variant.hasDirectPrice);
    let nextValue = "";

    if (directPriceVariants.length > 0) {
      const matchedVariant = directPriceVariants.find((variant) => normalizeSizeId(variant?.name) === sizeId);
      nextValue = matchedVariant ? `direct::${matchedVariant.id}` : "";
    } else {
      const selectedPackage = getSelectedPackage(card);
      const preferredValue = `${sizeId}::${selectedPackage?.id || ""}`;
      nextValue =
        [...comboSelect.options].find((option) => option.value === preferredValue)?.value ||
        [...comboSelect.options].find((option) => option.value.startsWith(`${sizeId}::`))?.value ||
        "";
    }

    if (!nextValue || comboSelect.value === nextValue) return false;
    comboSelect.value = nextValue;
    comboSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applySizeImage(card, sizeId) {
    const imageEl = card.querySelector("img");
    if (!imageEl) return;
    const variantImage = getVariantImageForSize(card, sizeId);
    if (variantImage) {
      imageEl.src = variantImage;
      card.dataset.image = variantImage;
      card.dataset.currentBaseImage = variantImage;
      return;
    }
    const gallery = getProductGallery(card);
    if (gallery.length === 0) return;
    const idx = Math.min(getSizeIndex(sizeId), gallery.length - 1);
    const nextImage = gallery[idx] || gallery[0];
    if (!nextImage) return;
    imageEl.src = nextImage;
    card.dataset.image = nextImage;
    card.dataset.currentBaseImage = nextImage;
  }

  function getSelectedPackage(card) {
    const variants = getVariantsForProduct(card);
    const purchaseOptionSelect = card.querySelector(".purchase-option-select");
    if (purchaseOptionSelect) {
      const selectedValue = String(purchaseOptionSelect.value || "");
      const [, packageId] = selectedValue.split("::");
      const plan = variants.find((variant) => String(variant.id) === packageId);
      if (plan) return plan;
    }
    const activeOption = card.querySelector(".package-option.is-active");
    if (!activeOption) return variants[0];
    const plan = variants.find((variant) => variant.id === activeOption.dataset.packageId);
    return plan || variants[0];
  }

  function getPackageDiscountLabel(plan) {
    const parts = [`${Math.max(1, Number(plan.units || 1))}x`];
    const percentDiscount = Math.max(0, Number(plan.discountPercent || 0));
    const fixedDiscount = Math.max(0, Number(plan.discountAmount || 0));

    if (percentDiscount > 0) {
      parts.push(`${percentDiscount}% off`);
    }
    if (fixedDiscount > 0) {
      parts.push(`${formatMoney(fixedDiscount)} off`);
    }
    if (parts.length === 1) {
      parts.push("standard");
    }

    return parts.join(", ");
  }

  function getPackageOptionLabel(plan, totalPrice) {
    return `${plan.name} (${getPackageDiscountLabel(plan)}) - ${formatMoney(totalPrice)}`;
  }

  function getGiftOfferOptionLabel(offer) {
    const priceLabel = Number(offer.extraPrice || 0) > 0
      ? `+ ${formatMoney(offer.extraPrice)}`
      : "Free";
    return `${offer.offerName} (${offer.giftQuantity} gift, min ${offer.minUnits} units, ${priceLabel})`;
  }

  function getSelectedGiftOffer(card) {
    const offers = getGiftOptionsForProduct(card);
    const select = card.querySelector(".gift-offer-select");
    const selectedValue = String(select?.value || "");
    if (!selectedValue) return null;
    return offers.find((offer) => String(offer.id) === selectedValue) || null;
  }

  function applyVariantImage(card, selectedPackage, selectedSize) {
    const imageEl = card.querySelector("img");
    if (!imageEl) return;

    const variantImageUrl = String(selectedPackage?.imageUrl || "").trim();
    if (variantImageUrl) {
      imageEl.src = variantImageUrl;
      card.dataset.image = variantImageUrl;
      card.dataset.currentBaseImage = variantImageUrl;
      return;
    }

    applySizeImage(card, selectedSize.id);
  }

  function closeAllThemedSelectMenus() {
    document.querySelectorAll(".tg-select.is-open").forEach((menu) => {
      menu.classList.remove("is-open");
      const trigger = menu.querySelector(".tg-select-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  function ensureThemedSelectGlobalHandlers() {
    if (document.body.dataset.tgSelectGlobalBound === "true") return;
    document.body.dataset.tgSelectGlobalBound = "true";

    document.addEventListener("click", (event) => {
      if (event.target.closest(".tg-select")) return;
      closeAllThemedSelectMenus();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeAllThemedSelectMenus();
    });
  }

  function enhanceThemedOptionSelect(select) {
    if (!select) return;

    if (!select.id) {
      const random = Math.random().toString(36).slice(2, 9);
      select.id = `tg-select-${random}`;
    }

    let customShell = select.parentElement?.querySelector(`.tg-select[data-for="${select.id}"]`);
    if (!customShell) {
      customShell = document.createElement("div");
      customShell.className = "tg-select";
      customShell.dataset.for = select.id;

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "tg-select-trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");

      const menu = document.createElement("div");
      menu.className = "tg-select-menu";
      menu.setAttribute("role", "listbox");

      customShell.appendChild(trigger);
      customShell.appendChild(menu);
      select.insertAdjacentElement("afterend", customShell);

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = customShell.classList.contains("is-open");
        closeAllThemedSelectMenus();
        if (!isOpen) {
          customShell.classList.add("is-open");
          trigger.setAttribute("aria-expanded", "true");
        }
      });

      menu.addEventListener("click", (event) => {
        const optionButton = event.target.closest("button[data-value]");
        if (!optionButton) return;
        const nextValue = String(optionButton.dataset.value || "");
        if (select.value !== nextValue) {
          select.value = nextValue;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (select.dataset.tgRenderUi) {
          select.dataset.tgRenderUi = "pending";
        }
        closeAllThemedSelectMenus();
      });
    }

    const trigger = customShell.querySelector(".tg-select-trigger");
    const menu = customShell.querySelector(".tg-select-menu");
    if (!trigger || !menu) return;

    const render = () => {
      const options = [...select.options];
      const selectedOption = options.find((option) => option.value === select.value) || options[0];
      trigger.textContent = selectedOption?.textContent?.trim() || "";

      menu.innerHTML = options.map((option) => {
        const value = String(option.value || "");
        const label = option.textContent || "";
        const isSelected = value === String(select.value || "");
        return `
          <button type="button" class="tg-select-option ${isSelected ? "is-active" : ""}" role="option" aria-selected="${isSelected ? "true" : "false"}" data-value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </button>
        `;
      }).join("");
    };

    if (select.dataset.tgSelectBound !== "true") {
      select.dataset.tgSelectBound = "true";
      select.classList.add("tg-native-select");
      select.addEventListener("change", render);
    }

    render();
  }

  function enhanceThemedOptionSelects(root = document) {
    ensureThemedSelectGlobalHandlers();
    root.querySelectorAll("#products .purchase-option-select").forEach((select) => {
      enhanceThemedOptionSelect(select);
    });
  }

  function buildPackageSelectors(root = document) {
    const productCards = root.querySelectorAll("#products .product-card");

    productCards.forEach(card => {
      if (isBundleProduct(card)) {
        card.querySelector(".purchase-option-wrap")?.remove();
        card.querySelector(".gift-offer-wrap")?.remove();
        card.querySelector(".size-selector-wrap")?.remove();
        card.querySelector(".package-selector-wrap")?.remove();
        let preview = card.querySelector(".package-price-preview");
        if (!preview) {
          preview = document.createElement("div");
          preview.className = "package-price-preview";
          const firstButton = card.querySelector(".add-to-cart");
          if (firstButton) card.insertBefore(preview, firstButton);
          else card.appendChild(preview);
        }
        preview.textContent = `${t("bundle_base_price")}: ${formatMoney(Number(card.dataset.price || 0))}`;
        return;
      }

      const basePrice = Number(card.dataset.price || 0);
      const firstButton = card.querySelector(".add-to-cart");
      const allowedSizes = getAllowedSizes(card);
      const variants = getVariantsForProduct(card);
      const directPriceVariants = variants.filter((variant) => variant.hasDirectPrice);
      const usesDirectVariantPricing = directPriceVariants.length > 0;
      let comboWrap = card.querySelector(".purchase-option-wrap");
      let comboSelect = comboWrap?.querySelector(".purchase-option-select");
      const previousValue = comboSelect?.value || "";

      card.querySelector(".size-selector-wrap")?.remove();
      card.querySelector(".package-selector-wrap")?.remove();

      if (!comboWrap) {
        comboWrap = document.createElement("div");
        comboWrap.className = "purchase-option-wrap";
        const label = document.createElement("label");
        label.className = "package-label";
        label.textContent = "Options";
        comboSelect = document.createElement("select");
        comboSelect.className = "purchase-option-select";
        comboWrap.appendChild(label);
        comboWrap.appendChild(comboSelect);

        comboSelect.addEventListener("change", () => {
          const selectedSize = getSelectedSize(card);
          const selectedPack = getSelectedPackage(card);
          applyVariantImage(card, selectedPack, selectedSize);
          refreshPricingPreview();
        });

        if (firstButton) card.insertBefore(comboWrap, firstButton);
        else card.appendChild(comboWrap);
      }

      if (comboSelect) {
        comboSelect.innerHTML = "";

        if (usesDirectVariantPricing) {
          directPriceVariants.forEach((plan) => {
            const option = document.createElement("option");
            option.value = `direct::${plan.id}`;
            option.textContent = `${plan.name} - ${formatMoney(plan.price || 0)}`;
            comboSelect.appendChild(option);
          });
        } else {
          allowedSizes.forEach((size) => {
            variants.forEach((plan) => {
              const option = document.createElement("option");
              option.value = `${size.id}::${plan.id}`;
              option.textContent = `${size.label} - ${plan.name}`;
              comboSelect.appendChild(option);
            });
          });
        }

        if ([...comboSelect.options].some((option) => option.value === previousValue)) {
          comboSelect.value = previousValue;
        } else if (comboSelect.options.length > 0) {
          comboSelect.selectedIndex = 0;
        }
      }

      if (!card.querySelector(".package-price-preview")) {
        const preview = document.createElement("div");
        preview.className = "package-price-preview";
        if (firstButton) card.insertBefore(preview, firstButton);
        else card.appendChild(preview);
      }

      const giftOffers = getGiftOptionsForProduct(card).filter((offer) => offer.isActive !== false);
      let giftWrap = card.querySelector(".gift-offer-wrap");
      let giftSelect = giftWrap?.querySelector(".gift-offer-select");
      const previousGiftValue = giftSelect?.value || "";

      if (giftOffers.length > 0) {
        if (!giftWrap) {
          giftWrap = document.createElement("div");
          giftWrap.className = "purchase-option-wrap gift-offer-wrap";
          const giftLabel = document.createElement("label");
          giftLabel.className = "package-label";
          giftLabel.textContent = "Gift Offer";
          giftSelect = document.createElement("select");
          giftSelect.className = "purchase-option-select gift-offer-select";
          giftWrap.appendChild(giftLabel);
          giftWrap.appendChild(giftSelect);

          if (firstButton) card.insertBefore(giftWrap, firstButton);
          else card.appendChild(giftWrap);
        }

        if (giftSelect) {
          giftSelect.innerHTML = `<option value="">No gift add-on</option>`;
          giftOffers.forEach((offer) => {
            const option = document.createElement("option");
            option.value = String(offer.id);
            option.textContent = getGiftOfferOptionLabel(offer);
            giftSelect.appendChild(option);
          });

          if ([...giftSelect.options].some((option) => option.value === previousGiftValue)) {
            giftSelect.value = previousGiftValue;
          }
        }
      } else {
        giftWrap?.remove();
      }

      function refreshPricingPreview() {
        const selectedSize = getSelectedSize(card);
        const selectedPack = getSelectedPackage(card);
        applyVariantImage(card, selectedPack, selectedSize);
        const finalPrice = calculatePackagePrice(basePrice, selectedPack, selectedSize, card);
        const addToCartBtn = card.querySelector(".add-to-cart");
        if (addToCartBtn && usesDirectVariantPricing) {
          const unavailable = Number(selectedPack?.stock || 0) <= 0;
          addToCartBtn.disabled = unavailable;
          addToCartBtn.textContent = unavailable ? t("out_of_stock") : t("add_to_cart");
        }
        const selectedGiftOffer = getSelectedGiftOffer(card);
        const preview = card.querySelector(".package-price-preview");
        if (preview) {
          const giftText = selectedGiftOffer
            ? ` | Gift: ${selectedGiftOffer.offerName}${selectedGiftOffer.extraPrice > 0 ? ` (+${formatMoney(selectedGiftOffer.extraPrice)})` : " (Free)"}` 
            : "";
          preview.textContent = usesDirectVariantPricing
            ? `Selected size: ${selectedPack.name} | ${formatMoney(finalPrice)}${giftText}`
            : `Selected total: ${selectedSize.label} - ${selectedPack.name} | ${formatMoney(finalPrice)}${giftText}`;
        }
      }

      applyVariantImage(card, getSelectedPackage(card), getSelectedSize(card));
      refreshPricingPreview();
      giftSelect?.addEventListener("change", refreshPricingPreview);
      enhanceThemedOptionSelects(card);

      const productImage = card.querySelector("img");
      if (productImage && productImage.dataset.sizeSyncBound !== "true") {
        productImage.dataset.sizeSyncBound = "true";
        productImage.addEventListener("click", () => {
          syncCardSelectionFromImage(card, productImage.src);
        });
      }
    });
  }

  function applyProductImagesToCards(root = document) {
    root.querySelectorAll(".product-card, .product").forEach((card) => {
      const imageRows = getStoredImagesForProduct(card);
      if (!Array.isArray(imageRows) || imageRows.length === 0) return;

      const galleryItems = imageRows.map((image) => image.image_url).filter(Boolean);
      if (galleryItems.length === 0) return;

      const primaryRow = imageRows.find((image) => image?.is_primary && image.image_url) || imageRows[0];
      const primaryImage = normalizeImageUrl(primaryRow?.image_url || galleryItems[0]);
      const hoverRow = imageRows.find((image) => image?.id !== primaryRow?.id && image.image_url) || primaryRow;
      const hoverImage = normalizeImageUrl(hoverRow?.image_url || primaryImage);
      card.dataset.image = primaryImage;
      card.dataset.currentBaseImage = primaryImage;
      card.dataset.hoverImage = hoverImage;
      card.dataset.gallery = galleryItems.join(", ");

      const img = card.querySelector("img");
      if (img) {
        img.src = primaryImage;
      }
    });
  }

  function syncProductCardPurchaseStacks(root = document) {
    root.querySelectorAll("#products .product-card, #products .detail-card").forEach((card) => {
      const purchaseNodes = [...card.children].filter((node) =>
        node.matches?.(
          ".purchase-option-wrap, .gift-offer-wrap, .package-price-preview, .detail-meta, .add-to-cart, .add-to-wishlist"
        )
      );

      const existingStack = card.querySelector(".product-card-purchase-stack");
      if (purchaseNodes.length === 0) {
        existingStack?.remove();
        return;
      }

      let stack = existingStack;
      if (!stack) {
        stack = document.createElement("div");
        stack.className = "product-card-purchase-stack";
      }

      const firstPurchaseNode = purchaseNodes[0];
      if (stack.parentElement !== card) {
        card.insertBefore(stack, firstPurchaseNode);
      }

      purchaseNodes.forEach((node) => {
        if (node.parentElement !== stack) {
          stack.appendChild(node);
        }
      });
    });
  }

  function translateStaticSections() {
    const heroSlides = document.querySelectorAll(".home-page .hero .slide");
    if (heroSlides.length >= 1) {
      const heroConfig = [
        {
          title: "hero_slide1_title",
          support: "hero_slide1_support",
          primary: "hero_slide1_primary",
          secondary: "hero_slide1_secondary"
        },
        {
          title: "hero_slide2_title",
          support: "hero_slide2_support",
          primary: "hero_slide2_primary",
          secondary: "hero_slide2_secondary"
        },
        {
          title: "hero_slide3_title",
          support: "hero_slide3_support",
          primary: "hero_slide3_primary",
          secondary: "hero_slide3_secondary"
        },
        {
          title: "hero_slide4_title",
          support: "hero_slide4_support",
          primary: "hero_slide4_primary",
          secondary: "hero_slide4_secondary"
        }
      ];

      heroSlides.forEach((slide, index) => {
        const cfg = heroConfig[index];
        if (!cfg) return;
        const heading = slide.querySelector("h1, h2");
        const support = slide.querySelector(".hero-support");
        const primary = slide.querySelector(".btn-primary");
        const secondary = slide.querySelector(".btn-secondary");
        if (heading) heading.textContent = t(cfg.title);
        if (support) support.textContent = t(cfg.support);
        if (primary) primary.textContent = t(cfg.primary);
        if (secondary) secondary.textContent = t(cfg.secondary);
      });
    }

    const homeHeroBottom = document.querySelectorAll(".home-page .hero-bottom-bar > div");
    if (homeHeroBottom.length >= 3) {
      const bottomCfg = [
        ["hero_bar1_title", "hero_bar1_desc"],
        ["hero_bar2_title", "hero_bar2_desc"],
        ["hero_bar3_title", "hero_bar3_desc"]
      ];
      homeHeroBottom.forEach((block, index) => {
        const cfg = bottomCfg[index];
        if (!cfg) return;
        const strong = block.querySelector("strong");
        const span = block.querySelector("span");
        if (strong) strong.textContent = t(cfg[0]);
        if (span) span.textContent = t(cfg[1]);
      });
    }

    setText(".home-page #about .section-kicker", "about_themegood");
    setText(".home-page #about .section-title", "about_title_new");
    setText(".home-page #about .about-lead", "about_lead_new");
    const aboutPointCards = document.querySelectorAll(".home-page #about .brand-story-points article");
    if (aboutPointCards.length >= 3) {
      const aboutCfg = [
        ["about_card1_title", "about_card1_desc"],
        ["about_card2_title", "about_card2_desc"],
        ["about_card3_title", "about_card3_desc"]
      ];
      aboutPointCards.forEach((card, index) => {
        const cfg = aboutCfg[index];
        if (!cfg) return;
        const strong = card.querySelector("strong");
        const p = card.querySelector("p");
        if (strong) strong.textContent = t(cfg[0]);
        if (p) p.textContent = t(cfg[1]);
      });
    }

    setText(".home-page .wide-banner-copy .section-kicker", "signature_kicker");
    setText(".home-page .wide-banner-copy h2", "signature_title");
    setText(".home-page .wide-banner-copy p:not(.section-kicker)", "signature_desc");
    setText(".home-page .wide-banner-copy .btn", "signature_button");
    setText(".home-page .wide-banner-badge", "signature_badge");

    setText(".home-page #flavours .section-kicker", "flavour_collection");
    setText(".home-page #flavours .section-title", "flavour_collection_title");
    setText(".home-page #flavours .section-intro", "flavour_collection_intro");
    const flavourCards = document.querySelectorAll(".home-page .editorial-flavour");
    if (flavourCards.length >= 3) {
      const flavourCfg = [
        ["flavour_pomegranate_title", "flavour_pomegranate_heading", "flavour_pomegranate_desc", "flavour_pomegranate_cta"],
        ["flavour_bilberry_title", "flavour_bilberry_heading", "flavour_bilberry_desc", "flavour_bilberry_cta"],
        ["flavour_passion_title", "flavour_passion_heading", "flavour_passion_desc", "flavour_passion_cta"]
      ];
      flavourCards.forEach((card, index) => {
        const cfg = flavourCfg[index];
        if (!cfg) return;
        const kicker = card.querySelector(".section-kicker");
        const h3 = card.querySelector("h3");
        const p = card.querySelector(".editorial-flavour-copy > p:not(.section-kicker)");
        const a = card.querySelector(".text-link");
        if (kicker) kicker.textContent = t(cfg[0]);
        if (h3) h3.textContent = t(cfg[1]);
        if (p) p.textContent = t(cfg[2]);
        if (a) a.textContent = t(cfg[3]);
      });
    }

    setText(".home-page #products .section-kicker", "featured_products");
    setText(".home-page #products .section-title", "featured_products_title");
    setText(".home-page #products .section-intro", "featured_products_intro");

    setText(".home-page #bundles .section-kicker", "bundles");
    setText(".home-page #bundles .section-title", "bundles_title");
    setText(".home-page #bundles .bundles-story-copy > p:not(.section-kicker)", "bundles_desc");
    const bundlesButtons = document.querySelectorAll(".home-page #bundles .bundles-story-actions .btn");
    if (bundlesButtons[0]) bundlesButtons[0].textContent = t("bundles_cta_primary");
    if (bundlesButtons[1]) bundlesButtons[1].textContent = t("bundles_cta_secondary");
    setText(".home-page #testimonials .section-kicker", "testimonials");
    setText(".home-page #testimonials .section-title", "testimonials_title");
    setText(".home-page #testimonials .testimonials-intro", "testimonials_intro");
    const testimonialCards = document.querySelectorAll(".home-page #testimonials .testimonial-card");
    testimonialCards.forEach((card, index) => {
      const quote = card.querySelector(".testimonial-copy");
      const author = card.querySelector(".testimonial-author strong");
      const role = card.querySelector(".testimonial-author span");
      const keyIndex = index + 1;
      if (quote) quote.textContent = t(`testimonial_quote_${keyIndex}`);
      if (author) author.textContent = t(`testimonial_author_${keyIndex}`);
      if (role) role.textContent = t(`testimonial_role_${keyIndex}`);
    });
    setText(".home-page #faq .section-kicker", "faq");
    setText(".home-page #faq .section-title", "faq_title");
    setText(".home-page #faq .faq-intro", "faq_intro");
    setText(".home-page #contact .section-kicker", "contact_us");

    document.querySelectorAll(".shopping-details-page .detail-meta span").forEach(el => { el.textContent = t("price"); });

    setText("#contact h2", "contact_us");
    setText("#contact .contact-info p:nth-of-type(1) strong", "email");
    setText("#contact .contact-info p:nth-of-type(2) strong", "phone");
    setText("#contact .contact-info p:nth-of-type(3) strong", "location");
    document.querySelectorAll("#contact .contact-social a").forEach((link, idx) => {
      const keys = ["facebook", "instagram", "whatsapp"];
      const key = keys[idx];
      if (!key) return;
      const icon = link.querySelector("i");
      const iconMarkup = icon ? icon.outerHTML : "";
      link.innerHTML = `${iconMarkup} ${t(key)}`.trim();
    });
    setText(".shop-map h3", "find_our_shop");
    setText(".shop-map .shop-map-label", "shop_map_label");
    setText(".shop-map .shop-map-address", "shop_map_address");
    const shopMapAddress = document.querySelector(".shop-map .shop-map-address");
    if (shopMapAddress) {
      const hasAddress = shopMapAddress.textContent.trim().length > 0;
      shopMapAddress.style.display = hasAddress ? "" : "none";
    }
    const mapMeta = document.querySelectorAll(".shop-map .shop-map-meta p");
    if (mapMeta[3]) mapMeta[3].innerHTML = `<strong>${t("hours_label")}</strong> ${t("hours_value")}`;
    setText(".shop-map .shop-map-link", "open_in_google_maps");
    setText(".newsletter .section-kicker", "newsletter");
    setText("#newsletter-form button", "subscribe");
    const newsletterEmail = document.getElementById("newsletter-email");
    if (newsletterEmail) newsletterEmail.setAttribute("placeholder", t("newsletter_placeholder"));

    setText(".footer-qr h4", "scan_qr");

    setText(".products-hero .section-title", "shopping_title");
    setText(".product-page .products-hero p", "shopping_subtitle");
    setText("#shoppingHeroTitle", "shopping_hero_title_default");
    setText("#shoppingHeroSubtitle", "shopping_hero_subtitle_default");
    setText(".shopping-details-page .products-hero .section-title", "shopping_details_title");
    setText(".shopping-details-page .products-hero p", "shopping_details_subtitle");

    setText(".product-cta h2", "ready_to_checkout");
    setText(".product-page .product-cta .section-kicker", "checkout");
    setText(".shopping-details-page .product-cta .section-kicker", "checkout");
    setText("#shoppingCtaTitle", "shopping_cta_title_default");
    setText("#shoppingCtaSubtitle", "shopping_cta_subtitle_default");
    setText("#shoppingCtaButton", "shopping_cta_button_text_default");
    const ctaDesc = document.querySelector(".product-page .product-cta p");
    if (ctaDesc) ctaDesc.textContent = t("checkout_cta_desc");
    const ctaDescDetails = document.querySelector(".shopping-details-page .product-cta p");
    if (ctaDescDetails) ctaDescDetails.textContent = t("checkout_cta_desc_details");
    document.querySelectorAll(".product-cta .btn").forEach(btn => { btn.textContent = t("go_to_checkout"); });

    setText(".checkout-hero .section-title", "secure_checkout");
    setText(".checkout-hero p", "review_order_payment");
    setText(".checkout-summary h2", "order_summary");
    setText(".checkout-total-row:nth-of-type(1) span", "subtotal");
    setText(".checkout-total-row:nth-of-type(2) span", "discount");
    setText(".checkout-total-row:nth-of-type(3) span", "total");
    setText(".checkout-link", "continue_shopping");
    setText(".checkout-payment h2", "payment_details");
    document.querySelector("label[for='name']")?.replaceChildren(t("full_name"));
    document.querySelector("label[for='email']")?.replaceChildren(t("email"));
    document.querySelector("label[for='card']")?.replaceChildren(t("card_number"));
    document.querySelector("label[for='expiry']")?.replaceChildren(t("expiry_date"));
    document.querySelector("label[for='cvv']")?.replaceChildren(t("cvv"));
    const payNowBtn = document.querySelector("#payment-form button[type='submit']");
    if (payNowBtn) payNowBtn.textContent = t("pay_now");

    setText(".gallery-hero .section-title", "gallery_title");
    setText(".gallery-hero p", "gallery_subtitle");
    document.getElementById("lightboxClose")?.setAttribute("aria-label", t("close_image"));
    document.getElementById("lightboxPrev")?.setAttribute("aria-label", t("previous_image"));
    document.getElementById("lightboxNext")?.setAttribute("aria-label", t("next_image"));
    document.getElementById("zoomIn")?.setAttribute("aria-label", t("zoom_in"));
    document.getElementById("zoomOut")?.setAttribute("aria-label", t("zoom_out"));
    document.getElementById("qr-overlay-close")?.setAttribute("aria-label", t("close_image"));
  }

  function translateRuntimeUi() {
    setHeaderActionLabel("cart-toggle", "cart", "cart-count", "🛒");
    document.querySelectorAll(".add-to-cart").forEach(btn => {
      const productCard = btn.closest(".product-card, .product");
      const unavailable = btn.disabled || btn.dataset.outOfStock === "true" || isOutOfStock(productCard);
      btn.textContent = unavailable ? t("out_of_stock") : t("add_to_cart");
      btn.disabled = unavailable;
      if (unavailable) {
        btn.dataset.outOfStock = "true";
      }
    });
    const modalCloseAction = document.getElementById("modal-close-action");
    if (modalCloseAction) modalCloseAction.textContent = t("close_details");
    const modalCloseButton = document.querySelector("#product-modal .close-modal");
    if (modalCloseButton) modalCloseButton.setAttribute("aria-label", t("close_details"));
    const modalImageEl = document.getElementById("modal-image");
    if (modalImageEl) modalImageEl.setAttribute("alt", t("product_label"));
    const modalAddCart = document.getElementById("modal-add-cart");
    if (modalAddCart) {
      modalAddCart.textContent = currentProduct?.isBundle ? t("add_bundle_to_cart") : t("add_to_cart");
    }

    setText("#cart-sidebar .cart-header h2", "your_cart");
    const closeCart = document.getElementById("close-cart");
    if (closeCart) closeCart.setAttribute("aria-label", t("close_cart"));
    const cartSummaryLabels = document.querySelectorAll("#cart-sidebar .cart-summary p strong");
    if (cartSummaryLabels[0]) cartSummaryLabels[0].textContent = `${t("subtotal")}:`;
    if (cartSummaryLabels[1]) cartSummaryLabels[1].textContent = `${t("discount")}:`;
    if (cartSummaryLabels[2]) cartSummaryLabels[2].textContent = t("total");
    setText("#cart-sidebar a.btn", "checkout");
    if (promoInput) promoInput.setAttribute("placeholder", t("promo_code_placeholder"));
    if (applyPromoBtn) applyPromoBtn.textContent = t("apply");
    const backToTop = document.getElementById("backToTop");
    if (backToTop) backToTop.setAttribute("aria-label", t("back_to_top"));
    const hamburger = document.getElementById("hamburgerBtn");
    if (hamburger) hamburger.setAttribute("aria-label", t("open_navigation"));
    const prevBtn = document.getElementById("prevBtn");
    if (prevBtn) prevBtn.setAttribute("aria-label", t("previous_slide"));
    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn) nextBtn.setAttribute("aria-label", t("next_slide"));
    const dots = document.querySelector(".dots");
    if (dots) dots.setAttribute("aria-label", t("slide_navigation"));
    const mapFrame = document.querySelector(".shop-map iframe");
    if (mapFrame) mapFrame.setAttribute("title", t("shop_location"));
  }

  function initFaqToggleCards(root = document) {
    root.querySelectorAll(".faq-item").forEach((item) => {
      if (item.dataset.faqCardBound === "true") return;
      item.dataset.faqCardBound = "true";

      item.addEventListener("click", (event) => {
        if (event.target.closest("a, button, input, textarea, select")) return;
        const summary = item.querySelector("summary");
        if (!summary) return;

        if (event.target === summary || summary.contains(event.target)) {
          return;
        }

        event.preventDefault();
        item.open = !item.open;
      });
    });
  }

  window.initFaqToggleCards = initFaqToggleCards;

  // --- Language Switcher (Header/Footer) ---
  function initLanguageSwitcher() {
    const switches = document.querySelectorAll(".js-lang-switch");
    if (switches.length === 0) return;
    const langUiLabel = { en: "EN", ms: "BM", zh: "\u4e2d\u6587" };

    const closeAllLangMenus = () => {
      document.querySelectorAll(".lang-switch.premium-open").forEach(el => {
        el.classList.remove("premium-open");
        const trigger = el.querySelector(".lang-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
    };

    const syncPremiumSwitchUi = (selected) => {
      switches.forEach(sel => {
        const shell = sel.closest(".lang-switch");
        if (!shell) return;
        const triggerText = shell.querySelector(".lang-trigger-text");
        if (triggerText) {
          triggerText.textContent = (langUiLabel[selected] || selected.toUpperCase()).trim();
        }
        shell.querySelectorAll(".lang-option").forEach(btn => {
          btn.classList.toggle("is-active", btn.dataset.lang === selected);
        });
      });
    };

    const buildPremiumSwitcher = (sel) => {
      if (sel.dataset.premiumReady === "true") return;
      const shell = sel.closest(".lang-switch");
      if (!shell) return;
      sel.dataset.premiumReady = "true";
      shell.classList.add("lang-switch-premium");
      sel.classList.add("lang-native-hidden");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "lang-trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = `<span class="lang-trigger-text">${(langUiLabel[sel.value] || "EN").trim()}</span><i class="fa fa-chevron-down" aria-hidden="true"></i>`;

      const menu = document.createElement("div");
      menu.className = "lang-menu";
      menu.setAttribute("role", "listbox");

      Array.from(sel.options).forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lang-option";
        btn.dataset.lang = opt.value;
        btn.setAttribute("role", "option");
        btn.textContent = (langUiLabel[opt.value] || opt.value.toUpperCase()).trim();
        btn.addEventListener("click", () => {
          applyLang(opt.value);
          closeAllLangMenus();
        });
        menu.appendChild(btn);
      });

      trigger.addEventListener("click", e => {
        e.preventDefault();
        const open = shell.classList.contains("premium-open");
        closeAllLangMenus();
        if (!open) {
          shell.classList.add("premium-open");
          trigger.setAttribute("aria-expanded", "true");
        }
      });

      shell.appendChild(trigger);
      shell.appendChild(menu);
    };

    const applyLang = (lang) => {
      const selected = dict[lang] ? lang : "en";
      currentLang = selected;
      localStorage.setItem("site_lang", selected);
      document.documentElement.lang = selected;
      if (document.body) document.body.setAttribute("data-site-lang", selected);
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.dataset.i18n;
        const translated = dict[selected][key];
        if (translated) el.textContent = translated;
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        const translated = dict[selected][key];
        if (translated) el.setAttribute("placeholder", translated);
      });
      document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
        const key = el.dataset.i18nAriaLabel;
        const translated = dict[selected][key];
        if (translated) el.setAttribute("aria-label", translated);
      });
      translateStaticSections();
      translateRuntimeUi();
      if (typeof updateCart === "function") updateCart();
      if (modal && modal.style.display === "flex" && currentProduct?.id) {
        const activeProduct = document.querySelector(`.product-card[data-id="${currentProduct.id}"], .product[data-id="${currentProduct.id}"]`);
        if (activeProduct) {
          openProductModal(activeProduct);
        }
      }
      switches.forEach(sel => { sel.value = selected; });
      syncPremiumSwitchUi(selected);
      window.__themegoodLang = selected;
      window.__themegoodT = (key, vars = {}) => t(key, vars, selected);
      document.dispatchEvent(new CustomEvent("themegood:langchange", { detail: { lang: selected } }));
    };

    const saved = getLang();
    switches.forEach(sel => buildPremiumSwitcher(sel));
    document.addEventListener("click", e => {
      if (!e.target.closest(".lang-switch")) closeAllLangMenus();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeAllLangMenus();
    });
    switches.forEach(sel => {
      sel.value = saved;
      sel.addEventListener("change", () => applyLang(sel.value));
    });
    applyLang(saved);
  }

  // --- Slider Logic ---
  let slideIndex = 0;
  let sliderIntervalId = null;

  function initHomepageSlider() {
    const hero = document.querySelector(".hero");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    if (!hero || !prevBtn || !nextBtn) return;

    const slides = Array.from(hero.querySelectorAll(".slide"));
    const dots = Array.from(hero.querySelectorAll(".dot"));
    if (slides.length === 0) return;

    const showSlide = (i) => {
      const total = slides.length;
      if (total === 0) return;
      slideIndex = (i + total) % total;
      slides.forEach((slide, index) => {
        const isActive = index === slideIndex;
        slide.classList.toggle("active", isActive);
        slide.setAttribute("aria-hidden", isActive ? "false" : "true");
        const video = slide.querySelector("video");
        if (video) {
          if (isActive) {
            const playAttempt = video.play();
            if (playAttempt && typeof playAttempt.catch === "function") {
              playAttempt.catch(() => {});
            }
          } else {
            video.pause();
            try {
              video.currentTime = 0;
            } catch (error) {
              console.debug("Unable to reset hero video time:", error);
            }
          }
        }
      });
      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === slideIndex);
      });
    };

    const restartSliderTimer = () => {
      if (sliderIntervalId) {
        clearInterval(sliderIntervalId);
      }
      sliderIntervalId = setInterval(() => showSlide(slideIndex + 1), 5000);
    };

    const showSlideAndRestartTimer = (i) => {
      showSlide(i);
      restartSliderTimer();
    };

    prevBtn.onclick = () => showSlideAndRestartTimer(slideIndex - 1);
    nextBtn.onclick = () => showSlideAndRestartTimer(slideIndex + 1);

    dots.forEach((dot, index) => {
      dot.onclick = () => showSlideAndRestartTimer(index);
    });

    slides.forEach((slide) => {
      if (!slide.dataset.slideLink) {
        slide.onclick = null;
        slide.style.cursor = "";
        return;
      }
      slide.style.cursor = "pointer";
      slide.onclick = (e) => {
        if (e.target.closest(".slide-cta, .arrow, .dots, .dot, a, button")) return;
        window.location.href = slide.dataset.slideLink;
      };
    });

    showSlide(slideIndex);

    restartSliderTimer();
  }

  window.initHomepageSlider = initHomepageSlider;
  initHomepageSlider();

  // --- Hamburger Menu ---
  const siteHeader = document.querySelector("header.site-header, body > header");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const navMenu = document.getElementById("navMenu");
  const overlay = document.getElementById("menuOverlay");
  const headerActions = document.querySelector(".header-actions");
  const langSwitch = headerActions?.querySelector(".lang-switch");
  const homepageHero = document.querySelector(".home-page .hero");

  function syncHeaderState() {
    if (!siteHeader) return;
    const isHomepage = document.body.classList.contains("home-page") && Boolean(homepageHero);
    if (!isHomepage) {
      siteHeader.classList.add("is-solid");
      siteHeader.classList.remove("is-transparent");
      return;
    }

    const threshold = Math.max(80, (homepageHero.offsetHeight || 0) - 160);
    const isSolid = window.scrollY > threshold * 0.15;
    siteHeader.classList.toggle("is-solid", isSolid);
    siteHeader.classList.toggle("is-transparent", !isSolid);
  }

  function syncMobileHeaderLayout() {
    if (!navMenu || !headerActions || !langSwitch) return;

    const isMobile = window.matchMedia("(max-width: 760px)").matches;

    if (isMobile) {
      langSwitch.classList.add("mobile-nav-utility");
      if (langSwitch.parentElement !== navMenu) {
        navMenu.appendChild(langSwitch);
      }
      return;
    }

    langSwitch.classList.remove("mobile-nav-utility");
    if (langSwitch.parentElement !== headerActions) {
      headerActions.appendChild(langSwitch);
    }
  }

  syncMobileHeaderLayout();
  syncHeaderState();
  window.addEventListener("resize", syncMobileHeaderLayout);
  window.addEventListener("resize", syncHeaderState);
  window.addEventListener("scroll", syncHeaderState, { passive: true });

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("open");
      overlay.classList.toggle("active");
      document.body.classList.toggle("no-scroll");
      hamburgerBtn.setAttribute("aria-expanded", isOpen);
      const icon = hamburgerBtn.querySelector("i");
      icon.classList.toggle("fa-bars", !isOpen);
      icon.classList.toggle("fa-times", isOpen);
    });

    overlay?.addEventListener("click", () => {
      navMenu.classList.remove("open");
      overlay.classList.remove("active");
      document.body.classList.remove("no-scroll");
      hamburgerBtn.setAttribute("aria-expanded", "false");
      const icon = hamburgerBtn.querySelector("i");
      icon.classList.add("fa-bars");
      icon.classList.remove("fa-times");
    });

    document.querySelectorAll("#navMenu a").forEach(link => {
      link.addEventListener("click", () => {
        navMenu.classList.remove("open");
        overlay.classList.remove("active");
        document.body.classList.remove("no-scroll");
        hamburgerBtn.setAttribute("aria-expanded", "false");
        const icon = hamburgerBtn.querySelector("i");
        icon.classList.add("fa-bars");
        icon.classList.remove("fa-times");
      });
    });
  }

  // --- Cart ---
  function updateCart() {
    if (cartList) cartList.innerHTML = "";
    let subtotal = 0, count = 0;
    cartItems.forEach((item, idx) => {
      if (cartList) {
        const li = document.createElement("li");
        li.className = "cart-item";
        const bundleSummary = item.packageId === "bundle"
          ? formatBundleSelectionSummary(item.bundleSelections, item.bundleBreakdown)
          : "";

        const metaParts = [];
        if (item.sizeLabel) metaParts.push(item.sizeLabel);
        if (item.packageLabel && item.packageLabel !== "bundle") metaParts.push(item.packageLabel);
        if (item.giftOfferLabel) metaParts.push(item.giftOfferLabel);
        if (bundleSummary) metaParts.push(bundleSummary);

        const metaHtml = metaParts.length
          ? `<div class="cart-item-meta">${escapeHtml(metaParts.join(" • "))}</div>`
          : "";
        const itemTotal = Number(item.price || 0) * Number(item.quantity || 1);
        const controlsMarkup = item.isFreeGift
          ? `<div class="qty-controls"><span>${item.quantity}</span></div>`
          : `
          <div class="qty-controls">
            <button data-action="dec" data-index="${idx}">-</button>
            <span>${item.quantity}</span>
            <button data-action="inc" data-index="${idx}">+</button>
            <button class="remove" data-action="remove" data-index="${idx}">×</button>
          </div>`;
        li.innerHTML = `
          <div class="cart-item-main">
            <strong>${escapeHtml(item.name || "")}</strong>
            ${metaHtml}
            <div class="cart-item-price">${formatMoney(item.price || 0)} × ${Number(item.quantity || 1)}</div>
          </div>
          <div class="cart-item-side">
            <div class="cart-item-total">${formatMoney(itemTotal)}</div>
            ${controlsMarkup}
          </div>`;
        cartList.appendChild(li);
      }
      subtotal += item.price * item.quantity;
      count += item.quantity;
    });

    const promoPercent = Number(cartPromo.percent || 0);
    const discountValue = subtotal * (promoPercent / 100);
    const finalTotal = Math.max(0, subtotal - discountValue);

    if (cartSubtotal) cartSubtotal.textContent = formatMoney(subtotal);
    if (cartDiscount) cartDiscount.textContent = `-${formatMoney(discountValue)}`;
    if (cartTotal) cartTotal.textContent = formatMoney(finalTotal);
    if (cartCount) cartCount.textContent = count;
    if (promoInput) promoInput.value = cartPromo.code || "";
    if (promoStatus && cartPromo.code) promoStatus.textContent = t("promo_applied", { code: cartPromo.code, percent: cartPromo.percent });
    if (promoStatus && !cartPromo.code) promoStatus.textContent = "";
    saveCart();
    saveCartPromo();
  }
  cartList?.addEventListener("click", e => {
    const btn = e.target;
    const idx = parseInt(btn.dataset.index, 10);
    if (!Number.isInteger(idx) || !cartItems[idx]) return;
    if (cartItems[idx].isFreeGift) return;
    if (btn.dataset.action === "inc") cartItems[idx].quantity++;
    if (btn.dataset.action === "dec") {
      cartItems[idx].quantity--;
      if (cartItems[idx].quantity < 1) cartItems.splice(idx, 1);
    }
    if (btn.dataset.action === "remove") cartItems.splice(idx, 1);
    syncFreeGiftItems().then(updateCart);
  });

  const applyPromoCode = () => {
    if (!promoInput) return;
    const code = promoInput.value.trim().toUpperCase();
    if (!code) {
      cartPromo = { code: "", percent: 0 };
      if (promoStatus) promoStatus.textContent = t("promo_removed");
      updateCart();
      return;
    }

    if (!promoConfig.active || !promoConfig.code || !promoConfig.percent) {
      if (promoStatus) promoStatus.textContent = t("no_active_promo");
      return;
    }

    if (code !== promoConfig.code) {
      if (promoStatus) promoStatus.textContent = t("invalid_promo_code");
      return;
    }

    cartPromo = { code, percent: promoConfig.percent };
    if (promoStatus) promoStatus.textContent = t("promo_applied", { code, percent: promoConfig.percent });
    updateCart();
  };

  applyPromoBtn?.addEventListener("click", applyPromoCode);
  promoInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPromoCode();
    }
  });

  await loadPromoConfig();

  function getFreeGiftRule(meta = {}) {
    const enabled = meta.freeGiftEnabled === true || meta.freeGiftEnabled === "true";
    const giftProductId = Number(meta.freeGiftProductId || 0);
    const minQuantity = Number(meta.freeGiftMinQuantity || 1);
    const giftQuantity = Number(meta.freeGiftQuantity || 1);

    if (!enabled || !Number.isInteger(giftProductId) || giftProductId <= 0) {
      return null;
    }

    return {
      enabled: true,
      giftProductId,
      minQuantity: Number.isInteger(minQuantity) && minQuantity > 0 ? minQuantity : 1,
      giftQuantity: Number.isInteger(giftQuantity) && giftQuantity > 0 ? giftQuantity : 1
    };
  }

  function getSelectedGiftRule(meta = {}) {
    const offer = meta.giftOffer;
    if (!offer || typeof offer !== "object") return null;

    const giftProductId = Number(offer.giftProductId || 0);
    const minUnits = Number(offer.minUnits || 1);
    const giftQuantity = Number(offer.giftQuantity || 1);
    const extraPrice = Math.max(0, Number(offer.extraPrice || 0));

    if (!Number.isInteger(giftProductId) || giftProductId <= 0) {
      return null;
    }

    return {
      offerId: String(offer.id || ""),
      offerName: String(offer.offerName || "Gift Offer").trim(),
      giftProductId,
      minQuantity: Number.isInteger(minUnits) && minUnits > 0 ? minUnits : 1,
      giftQuantity: Number.isInteger(giftQuantity) && giftQuantity > 0 ? giftQuantity : 1,
      extraPrice
    };
  }

  function getEffectiveBoughtQuantity(item) {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const packageUnits = Math.max(1, Number(item.packageUnits || 1));
    return quantity * packageUnits;
  }

  async function syncFreeGiftItems() {
    await ensureStorefrontProductsLoaded();

    const qualifyingMap = new Map();

    cartItems.forEach((item) => {
      if (item.isFreeGift) return;
      const rule = getSelectedGiftRule(item) || getFreeGiftRule(item.freeGiftRule || item);
      if (!rule) return;

      const triggerProductId = Number(item.id || 0);
      if (!Number.isInteger(triggerProductId) || triggerProductId <= 0) return;

      const key = `${triggerProductId}::${rule.giftProductId}::${rule.offerId || "legacy"}`;
      const existing = qualifyingMap.get(key) || {
        triggerProductId,
        triggerProductName: item.name || "",
        offerId: String(rule.offerId || ""),
        offerName: String(rule.offerName || "").trim(),
        giftProductId: rule.giftProductId,
        minQuantity: rule.minQuantity,
        giftQuantity: rule.giftQuantity,
        extraPrice: Math.max(0, Number(rule.extraPrice || 0)),
        boughtQuantity: 0
      };

      existing.boughtQuantity += getEffectiveBoughtQuantity(item);
      qualifyingMap.set(key, existing);
    });

    const nonGiftItems = cartItems.filter((item) => !item.isFreeGift);
    const syncedGiftItems = [];

    qualifyingMap.forEach((entry) => {
      const giftProduct = storefrontProductsById[String(entry.giftProductId)];
      if (!giftProduct || Number(giftProduct.stock || 0) <= 0) return;

      const multiplier = Math.floor(entry.boughtQuantity / entry.minQuantity);
      const desiredQuantity = multiplier * entry.giftQuantity;
      if (desiredQuantity <= 0) return;

      syncedGiftItems.push({
        key: `gift::${entry.triggerProductId}::${entry.giftProductId}::${entry.offerId || "legacy"}`,
        id: entry.giftProductId,
        name: giftProduct.name || "Free Gift",
        price: Math.max(0, Number(entry.extraPrice || 0)),
        quantity: desiredQuantity,
        sizeId: "",
        sizeLabel: "",
        packageId: `gift-${entry.triggerProductId}-${entry.giftProductId}`,
        packageLabel: entry.offerName
          ? `${entry.offerName}${entry.extraPrice > 0 ? ` (+${formatMoney(entry.extraPrice)})` : " (Gift)"}`
          : `Free Gift with ${entry.triggerProductName || "purchase"}`,
        isFreeGift: true,
        triggerProductId: entry.triggerProductId
      });
    });

    cartItems = [...nonGiftItems, ...syncedGiftItems];
  }

  async function addToCartAction(id, name, price, meta = {}, quantityToAdd = 1) {
    const fallbackVariant = getDefaultVariant(id);
    const packageId = String(meta.packageId || fallbackVariant.id);
    const packageUnits = Math.max(1, Number(meta.packageUnits || fallbackVariant.units || 1));
    const sizeId = meta.sizeId || "small";
    const giftOfferRule = getSelectedGiftRule(meta);
    const giftOfferKey = giftOfferRule?.offerId ? `::gift-${giftOfferRule.offerId}` : "";
    const itemKey = `${id}::${sizeId}::${packageId}${giftOfferKey}`;
    const finalPrice = Number.isFinite(meta.priceOverride) ? meta.priceOverride : Number(price || 0);
    const existing = cartItems.find((i) => {
      const existingPackageId = String(i.packageId || getDefaultVariant(i.id).id);
      const existingSizeId = i.sizeId || "small";
      return (i.key || `${i.id}::${existingSizeId}::${existingPackageId}`) === itemKey;
    });
    if (existing) existing.quantity += Math.max(1, Number(quantityToAdd || 1));
    else {
      cartItems.push({
        key: itemKey,
        id,
        name,
        price: finalPrice,
        quantity: Math.max(1, Number(quantityToAdd || 1)),
        packageUnits,
        sizeId,
        sizeLabel: meta.sizeLabel || "",
        packageId,
        packageLabel: meta.packageLabel || "",
        giftOffer: giftOfferRule,
        giftOfferLabel: giftOfferRule ? giftOfferRule.offerName : "",
        freeGiftRule: getFreeGiftRule(meta)
      });
    }
    await syncFreeGiftItems();
    updateCart();
    showToast(t("added_to_cart_toast", { name }));
  }

  function initProductHoverSwap(root = document) {
    root.querySelectorAll(".product-card[data-hover-image]").forEach(card => {
      if (card.dataset.hoverSwapInit === "true") return;
      const img = card.querySelector("img");
      if (!img) return;
      const baseImage = card.dataset.image || img.getAttribute("src");
      const hoverImage = card.dataset.hoverImage;
      if (!baseImage || !hoverImage) return;

      card.dataset.hoverSwapInit = "true";
      card.dataset.image = baseImage;
      card.dataset.currentBaseImage = baseImage;
      [baseImage, hoverImage].forEach(src => {
        const preload = new Image();
        preload.src = src;
        if (src === hoverImage) {
          preload.onerror = () => { card.dataset.hoverImage = ""; };
        }
      });

      const showHover = () => {
        if (!card.dataset.hoverImage) return;
        if (img.src.endsWith(card.dataset.hoverImage)) return;
        img.src = card.dataset.hoverImage;
      };
      const showBase = () => {
        const nextBase = card.dataset.currentBaseImage || card.dataset.image || baseImage;
        if (img.src.endsWith(nextBase)) return;
        img.src = nextBase;
      };

      card.addEventListener("pointerenter", showHover);
      card.addEventListener("pointerleave", showBase);
      card.addEventListener("focusin", showHover);
      card.addEventListener("focusout", showBase);
    });
  }

  // --- Product Modal ---
  const getProductGallery = (el) => {
    const stored = getStoredImagesForProduct(el)
      .map((image) => normalizeImageUrl(image.image_url))
      .filter(Boolean);
    if (stored.length > 0) {
      return [...new Set(stored)];
    }

    const variantImages = getVariantsForProduct(el)
      .map((variant) => normalizeImageUrl(variant?.imageUrl || ""))
      .filter(Boolean);
    const custom = (el.dataset.gallery || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const base = normalizeImageUrl(el.dataset.image || el.querySelector("img")?.getAttribute("src") || "");
    const hover = normalizeImageUrl(el.dataset.hoverImage || "");
    return [...new Set([base, hover, ...variantImages, ...custom, ...stored].filter(Boolean))];
  };

  const setActiveModalGalleryImage = (imageUrl) => {
    if (!modalGallery) return;
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    modalGallery.querySelectorAll("img.thumb").forEach((thumb) => {
      thumb.classList.toggle("is-active", normalizeImageUrl(thumb.src) === normalizedImageUrl);
    });
  };

  const renderModalGallery = (images, onImageSelect = null) => {
    if (!modalGallery || !modalImage) return;
    modalGallery.innerHTML = "";
    images.forEach((entry, idx) => {
      const src = typeof entry === "string" ? entry : String(entry?.src || "");
      if (!src) return;
      const linkedSizeId = typeof entry === "object" ? String(entry?.sizeId || "") : "";
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = src;
      thumb.alt = `Product photo ${idx + 1}`;
      if (linkedSizeId) {
        thumb.dataset.sizeId = linkedSizeId;
      }
      thumb.addEventListener("click", () => {
        modalImage.src = src;
        setActiveModalGalleryImage(src);
        if (typeof onImageSelect === "function") {
          onImageSelect({ src, sizeId: linkedSizeId, index: idx });
        }
      });
      modalGallery.appendChild(thumb);
    });
    setActiveModalGalleryImage(modalImage.src);
  };

  const renderModalPricingInfo = (selectedSize, selectedPackage, packagePrice) => {
    if (!modalExtra) return;
    const safePrice = Number.isFinite(packagePrice) ? formatMoney(packagePrice) : "RM 0.00";
    const packageLine = selectedPackage?.hasDirectPrice
      ? `<p class="modal-meta-line"><strong>Size Option:</strong> <span>${selectedPackage.name}</span></p>`
      : `<p class="modal-meta-line"><strong>Package:</strong> <span>${selectedPackage.name} (${getPackageDiscountLabel(selectedPackage)})</span></p>`;
    modalExtra.innerHTML = `
      <p class="modal-price-line"><strong>Price:</strong> <span class="modal-price-value">${safePrice}</span></p>
      <p class="modal-meta-line"><strong>Size:</strong> <span>${selectedSize.label}</span></p>
      ${packageLine}
    `;
  };

  const renderModalSizeOptions = (el, gallery, selectedPackage, basePrice) => {
    if (!modalSizeOptions) return;
    modalSizeOptions.innerHTML = "";
    const variants = getVariantsForProduct(el);
    const directPriceVariants = variants.filter((variant) => variant.hasDirectPrice);

    if (directPriceVariants.length > 0) {
      directPriceVariants.forEach((variant) => {
        const sizeInfo = getVariantSizeInfo(variant);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "modal-size-option";
        btn.dataset.sizeId = sizeInfo.id;
        btn.dataset.variantId = variant.id;
        btn.textContent = `${variant.name} - ${formatMoney(variant.price || 0)}`;
        btn.addEventListener("click", () => {
          modalSizeOptions.querySelectorAll(".modal-size-option").forEach(x => x.classList.remove("is-active"));
          btn.classList.add("is-active");
          const nextImage = normalizeImageUrl(variant.imageUrl || "") || getVariantImageForSize(el, sizeInfo.id);
          if (modalImage && nextImage) {
            modalImage.src = nextImage;
            setActiveModalGalleryImage(nextImage);
          }
          currentProduct.sizeId = sizeInfo.id;
          currentProduct.sizeLabel = sizeInfo.label;
          currentProduct.packageId = variant.id;
          currentProduct.packageLabel = variant.name;
          currentProduct.packageUnits = 1;
          currentProduct.packagePrice = Math.max(0, Number(variant.price || 0));
          currentProduct.stock = Number(variant.stock || 0);
          renderModalPricingInfo(sizeInfo, variant, currentProduct.packagePrice);
        });
        modalSizeOptions.appendChild(btn);
      });
      return;
    }

    getAllowedSizes(el).forEach(size => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-size-option";
      btn.dataset.sizeId = size.id;
      const sizedPrice = calculatePackagePrice(basePrice, selectedPackage, size, el);
      btn.textContent = `${size.label} - ${formatMoney(sizedPrice)}`;
        btn.addEventListener("click", () => {
          modalSizeOptions.querySelectorAll(".modal-size-option").forEach(x => x.classList.remove("is-active"));
          btn.classList.add("is-active");
          const nextImage = getVariantImageForSize(el, size.id) || gallery[Math.min(getSizeIndex(size.id), Math.max(gallery.length - 1, 0))];
          if (modalImage && nextImage) {
            modalImage.src = nextImage;
            setActiveModalGalleryImage(nextImage);
          }
          currentProduct.sizeId = size.id;
        currentProduct.sizeLabel = size.label;
        currentProduct.packagePrice = sizedPrice;
        renderModalPricingInfo(size, selectedPackage, sizedPrice);
      });
      modalSizeOptions.appendChild(btn);
    });
  };

  async function openProductModal(el) {
    if (!modal || !modalImage || !modalTitle || !modalDescription) return;

    const id = Number(el.dataset.id || 0);
    const name = el.dataset.name || "";
    const desc = el.dataset.description || "Premium nutritional product.";
    const image = el.dataset.image || el.querySelector("img")?.src || "";
    const gallery = getProductGallery(el);

    modalTitle.textContent = name;
    modalDescription.textContent = desc;
    modalImage.src = image;

    const modalExtra = document.getElementById("modal-extra");
    const modalSizeOptions = document.getElementById("modal-size-options");
    const modalQtyValue = document.getElementById("modal-qty-value");
    const modalAddCartBtn = document.getElementById("modal-add-cart");
    const modalCertifications = modal.querySelector(".modal-certifications");

    if (modalQtyValue) modalQtyValue.textContent = "1";

    const catalogProductType = storefrontProductsById[String(id)]?.product_type;
    const initialProductType = String(el.dataset.productType || el?.product_type || catalogProductType || "").toLowerCase();
    let productType = initialProductType;
    let prefetchedBundleData = null;

    if (productType !== "bundle" && id > 0) {
      try {
        const bundleProbe = await fetchBundleDefinition(id);
        const probeType = String(bundleProbe?.product?.product_type || "").toLowerCase();
        const hasBundleSlots = Array.isArray(bundleProbe?.bundle_slots) && bundleProbe.bundle_slots.length > 0;

        if (probeType === "bundle" || hasBundleSlots) {
          productType = "bundle";
          prefetchedBundleData = bundleProbe;
          console.log("[bundle] openProductModal:bundle:probe-promoted", {
            productId: id,
            initialProductType,
            probeType,
            hasBundleSlots
          });
        }
      } catch (error) {
        console.warn("[bundle] openProductModal:bundle:probe-failed", {
          productId: id,
          initialProductType,
          error: error?.message || error
        });
      }
    }

    if (productType === "bundle") {
      if (modalCertifications) {
        modalCertifications.style.display = "none";
      }
      try {
        console.log("[bundle] openProductModal:bundle:start", {
          productId: id,
          productType,
          productName: name
        });
        const bundleData = prefetchedBundleData || await fetchBundleDefinition(id);
        console.log("[bundle] openProductModal:bundle:data", {
          productId: id,
          bundleSlotsCount: Array.isArray(bundleData?.bundle_slots) ? bundleData.bundle_slots.length : 0,
          slotSelectableCounts: Array.isArray(bundleData?.bundle_slots)
            ? bundleData.bundle_slots.map((slot) => ({
              slotId: slot?.id,
              slotLabel: slot?.slot_label,
              choices: Array.isArray(slot?.selectable_variants) ? slot.selectable_variants.length : 0,
              freeCan: Boolean(slot?.is_free_can_slot)
            }))
            : [],
          selectableVariantSizeKeys: Object.keys(bundleData?.selectable_variants_by_size || {})
        });

        currentProduct = {
          id,
          name,
          price: Number(bundleData?.product?.price || 0),
          stock: 9999,
          sizeId: "",
          sizeLabel: "",
          packageId: "bundle",
          packageLabel: t("custom_bundle"),
          packageUnits: 1,
          packagePrice: Number(bundleData?.product?.price || 0),
          quantity: 1,
          isBundle: true,
          bundleSelections: []
        };

        if (modalExtra) {
          modalExtra.innerHTML = `
            <div class="bundle-modal-box">
              <div class="bundle-modal-head">
                <div>
                  <strong>${t("bundle_build_title")}</strong>
                  <p class="bundle-modal-sub">${t("bundle_build_sub")}</p>
                </div>
                <span id="modal-bundle-total">${formatMoney(0)}</span>
              </div>

              <div id="modal-bundle-savings" class="bundle-savings-badge" style="display:none;"></div>

              ${renderBundleSelectors(bundleData)}

              <div class="promo-box bundle-modal-promo-box">
                <input id="modal-bundle-promo-code" type="text" placeholder="${t("bundle_promo_code")}" maxlength="32">
                <button id="modal-bundle-promo-apply" type="button">${t("bundle_apply_promo")}</button>
              </div>
              <small id="modal-bundle-promo-status" aria-live="polite"></small>

              <div id="modal-bundle-breakdown" class="bundle-breakdown-box"></div>
            </div>
          `;
        }

        if (modalSizeOptions) {
          modalSizeOptions.innerHTML = "";
        }

        document.querySelectorAll(".bundle-slot-select").forEach((select) => {
          select.addEventListener("change", () => {
            updateBundleModalPrice(id);
          });
        });

        document.getElementById("modal-bundle-promo-apply")?.addEventListener("click", () => {
          updateBundleModalPrice(id);
        });
        document.getElementById("modal-bundle-promo-code")?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateBundleModalPrice(id);
          }
        });

        updateBundleModalPrice(id);

        if (modalAddCartBtn) {
          modalAddCartBtn.disabled = true;
          modalAddCartBtn.textContent = t("add_bundle_to_cart");
        }

        renderModalGallery(gallery);

        modal.style.display = "flex";
        document.body.classList.add("product-modal-open");
        return;
      } catch (error) {
        console.error(error);
        showToast(error.message || t("product_not_found"));
        return;
      }
    }

    const price = parseFloat(el.dataset.price || 0);
    if (modalCertifications) {
      modalCertifications.style.display = "inline-flex";
    }
    const selectedSize = getSelectedSize(el);
    const selectedPackage = getSelectedPackage(el);
    const packagePrice = calculatePackagePrice(price, selectedPackage, selectedSize, el);
    const modalProductImage =
      normalizeImageUrl(selectedPackage.imageUrl || "") ||
      getVariantImageForSize(el, selectedSize.id) ||
      gallery[Math.min(getSizeIndex(selectedSize.id), Math.max(gallery.length - 1, 0))] ||
      gallery[0] ||
      image;

    const sizeLinkedGallery = (() => {
      const bySize = getAllowedSizes(el).map((size) => ({
        src: normalizeImageUrl(getVariantImageForSize(el, size.id)),
        sizeId: size.id
      })).filter((row) => row.src);

      const unique = [];
      const seen = new Set();

      bySize.forEach((row) => {
        const key = normalizeImageUrl(row.src);
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push(row);
      });

      gallery.forEach((src) => {
        const key = normalizeImageUrl(src);
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push({
          src: key,
          sizeId: ""
        });
      });

      return unique;
    })();

    currentProduct = {
      id,
      name,
      price,
      stock: selectedPackage?.hasDirectPrice ? Number(selectedPackage.stock || 0) : Number(el.dataset.stock || 0),
      sizeId: selectedSize.id,
      sizeLabel: selectedSize.label,
      packageId: selectedPackage.id,
      packageLabel: selectedPackage.name,
      packageUnits: selectedPackage?.hasDirectPrice ? 1 : Math.max(1, Number(selectedPackage.units || 1)),
      giftOffer: getSelectedGiftOffer(el),
      packagePrice,
      freeGiftEnabled: el.dataset.freeGiftEnabled === "true",
      freeGiftProductId: Number(el.dataset.freeGiftProductId || 0),
      freeGiftMinQuantity: Number(el.dataset.freeGiftMinQuantity || 1),
      freeGiftQuantity: Number(el.dataset.freeGiftQuantity || 1),
      quantity: 1,
      isBundle: false
    };

    modalImage.src = modalProductImage;
    renderModalPricingInfo(selectedSize, selectedPackage, packagePrice);
    renderModalSizeOptions(el, gallery, selectedPackage, price);
    renderModalGallery(sizeLinkedGallery, ({ src, sizeId: linkedSizeId }) => {
      const sizeId = linkedSizeId || getSizeIdForImage(el, src);
      if (!sizeId || !modalSizeOptions) return;
      const sizeButton = modalSizeOptions.querySelector(`.modal-size-option[data-size-id="${sizeId}"]`);
      sizeButton?.click();
    });

    const activeSizeBtn = modalSizeOptions?.querySelector(`.modal-size-option[data-size-id="${selectedSize.id}"]`);
    if (activeSizeBtn) activeSizeBtn.classList.add("is-active");
    setActiveModalGalleryImage(modalProductImage);

    if (modalAddCartBtn) {
      const isBundle = (el.dataset.productType || "").toLowerCase() === "bundle";

      if (isBundle) {
        modalAddCartBtn.disabled = false;
      } else {
        const unavailable = isOutOfStock(el);
        modalAddCartBtn.disabled = unavailable;
      }

      modalAddCartBtn.textContent = modalAddCartBtn.disabled ? t("out_of_stock") : t("add_to_cart");
    }

    modal.style.display = "flex";
    document.body.classList.add("product-modal-open");
  }
  function bindProductCardInteractions(root = document) {
    root.querySelectorAll(".product-card, .product").forEach(el => {
      if (el.dataset.productCardBound === "true") return;
      el.dataset.productCardBound = "true";

      el.addEventListener("click", e => {
        if (e.target.closest(".purchase-option-wrap")) return;
        if (e.target.closest(".gift-offer-wrap")) return;
        if (e.target.closest(".package-selector-wrap")) return;
        if (e.target.closest(".size-selector-wrap")) return;
        if (e.target.closest(".package-price-preview")) return;
        if (e.target.closest("select, input, label")) return;
        if (e.target.tagName === "BUTTON") {
          const id = el.dataset.id;
          const name = el.dataset.name;
          const basePrice = parseFloat(el.dataset.price);
          if (e.target.classList.contains("add-to-cart")) {
            if (isOutOfStock(el) && !isBundleProduct(el)) {
              showToast(t("out_of_stock"), "error");
              return;
            }

            if (isBundleProduct(el)) {
              openProductModal(el);
              return;
            }

            const selectedSize = getSelectedSize(el);
            const selectedPackage = getSelectedPackage(el);
            const packagePrice = calculatePackagePrice(basePrice, selectedPackage, selectedSize, el);
            addToCartAction(id, name, basePrice, {
              priceOverride: packagePrice,
              sizeId: selectedSize.id,
              sizeLabel: selectedSize.label,
              packageId: selectedPackage.id,
              packageLabel: selectedPackage.name,
              packageUnits: Math.max(1, Number(selectedPackage.units || 1)),
              giftOffer: getSelectedGiftOffer(el),
              freeGiftEnabled: el.dataset.freeGiftEnabled === "true",
              freeGiftProductId: Number(el.dataset.freeGiftProductId || 0),
              freeGiftMinQuantity: Number(el.dataset.freeGiftMinQuantity || 1),
              freeGiftQuantity: Number(el.dataset.freeGiftQuantity || 1)
            });
          }
          return;
        }
        openProductModal(el);
      });
    });
  }

  window.enhanceShopProductCards = async function enhanceShopProductCards(root = document) {
    await ensureStorefrontProductsLoaded();
    await ensureProductImagesLoaded();
    await ensureProductVariantsLoaded();
    await ensureProductGiftOptionsLoaded();
    applyProductImagesToCards(root);
    buildPackageSelectors(root);
    syncProductCardPurchaseStacks(root);
    initProductHoverSwap(root);
    bindProductCardInteractions(root);
  };
  const closeProductModal = () => {
    if (!modal) return;
    modal.style.display = "none";
    document.body.classList.remove("product-modal-open");
  };

  const closeQrOverlay = () => {
    if (!qrOverlay) return;
    qrOverlay.classList.remove("open");
    qrOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("qr-overlay-open");
  };

  document.querySelectorAll(".footer-qr img").forEach(img => {
    img.setAttribute("tabindex", "0");
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", "Open QR code");
    img.addEventListener("click", () => {
      if (!qrOverlay || !qrOverlayImage) return;
      qrOverlayImage.src = img.currentSrc || img.src;
      qrOverlayImage.alt = img.alt || "ThemeGood QR code";
      qrOverlay.classList.add("open");
      qrOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("qr-overlay-open");
    });
    img.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      img.click();
    });
  });

  document.getElementById("qr-overlay-close")?.addEventListener("click", closeQrOverlay);
  qrOverlay?.addEventListener("click", e => {
    if (e.target === qrOverlay) closeQrOverlay();
  });

  document.getElementById("modal-add-cart")?.addEventListener("click", () => {
    if (!currentProduct) return;

    if (currentProduct.isBundle) {
      const selections = getBundleSelectionsFromModal();
      const breakdown = Array.isArray(currentProduct.bundleBreakdown)
        ? currentProduct.bundleBreakdown.map((row) => ({ ...row }))
        : getBundleBreakdownFromModal();
      const requiredCount = document.querySelectorAll(".bundle-slot-select").length;

      if (
        requiredCount <= 0 ||
        selections.length !== requiredCount ||
        breakdown.length !== requiredCount ||
        Number(currentProduct.packagePrice || 0) <= 0
      ) {
        showToast(t("bundle_complete_all"));
        return;
      }

      currentProduct.bundleSelections = selections;
      currentProduct.bundleBreakdown = breakdown;

      cartItems.push({
        id: String(currentProduct.id),
        name: currentProduct.name,
        price: Number(currentProduct.packagePrice || 0),
        quantity: Number(currentProduct.quantity || 1),
        sizeId: "",
        sizeLabel: "",
        packageId: "bundle",
        packageLabel: t("custom_bundle"),
        packageUnits: 1,
        bundleSelections: selections,
        bundleBreakdown: breakdown,
        bundlePromoCode: currentProduct.bundlePromoCode || ""
      });

      updateCart();
      saveCart();
      showToast(t("added_to_cart_toast", { name: currentProduct.name }));
      closeProductModal();
      return;
    }

    if (Number(currentProduct.stock || 0) <= 0) {
      showToast(t("out_of_stock"), "error");
      closeProductModal();
      return;
    }

    addToCartAction(currentProduct.id, currentProduct.name, currentProduct.price, {
      priceOverride: currentProduct.packagePrice,
      sizeId: currentProduct.sizeId,
      sizeLabel: currentProduct.sizeLabel,
      packageId: currentProduct.packageId,
      packageLabel: currentProduct.packageLabel,
      packageUnits: currentProduct.packageUnits,
      giftOffer: currentProduct.giftOffer,
      freeGiftEnabled: currentProduct.freeGiftEnabled,
      freeGiftProductId: currentProduct.freeGiftProductId,
      freeGiftMinQuantity: currentProduct.freeGiftMinQuantity,
      freeGiftQuantity: currentProduct.freeGiftQuantity
    });

    closeProductModal();
  });
  document.getElementById("modal-close-action")?.addEventListener("click", closeProductModal);
  modalQtyDec?.addEventListener("click", () => {
    if (!currentProduct) return;
    currentProduct.quantity = Math.max(1, Number(currentProduct.quantity || 1) - 1);
    if (modalQtyValue) modalQtyValue.textContent = String(currentProduct.quantity);
  });
  modalQtyInc?.addEventListener("click", () => {
    if (!currentProduct) return;
    currentProduct.quantity = Math.min(99, Number(currentProduct.quantity || 1) + 1);
    if (modalQtyValue) modalQtyValue.textContent = String(currentProduct.quantity);
  });
  document.querySelector(".close-modal")?.addEventListener("click", closeProductModal);
  window.addEventListener("click", e => { if (e.target === modal) closeProductModal(); });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal?.style.display === "flex") closeProductModal();
    if (e.key === "Escape" && qrOverlay?.classList.contains("open")) closeQrOverlay();
    if (e.key === "Escape" && document.getElementById("cart-sidebar")?.classList.contains("open")) closeCommercePanels();
  });

  // --- Sidebar Toggles ---
  const closeCommercePanels = () => {
    document.getElementById("cart-sidebar")?.classList.remove("open");
    document.getElementById("cart-overlay")?.classList.remove("active");
    document.getElementById("menuOverlay")?.classList.remove("active");
    document.body.classList.remove("cart-open");
  };

  const setupToggle = (btnId, sidebarId, overlayId, closeId) => {
    const btn = document.getElementById(btnId);
    const sidebar = document.getElementById(sidebarId);
    const overlay = document.getElementById(overlayId);
    const close = document.getElementById(closeId);
    const openPanel = () => {
      if (!sidebar || !overlay) return;
      closeCommercePanels();
      sidebar.classList.add("open");
      overlay.classList.add("active");
      document.body.classList.add("cart-open");
    };
    const closePanel = () => {
      if (!sidebar || !overlay) return;
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      document.body.classList.remove("cart-open");
    };
    const toggle = () => {
      if (!sidebar) return;
      if (sidebar.classList.contains("open")) closePanel();
      else openPanel();
    };
    btn?.addEventListener("click", toggle);
    close?.addEventListener("click", closePanel);
    overlay?.addEventListener("click", e => {
      if (e.target === overlay) closePanel();
    });
  };
  setupToggle("cart-toggle", "cart-sidebar", "cart-overlay", "close-cart");

  // --- Newsletter ---
  const newsletterForm = document.getElementById("newsletter-form");
  if (newsletterForm) {
    const newsletterEmailInput = document.getElementById("newsletter-email");
    let newsletterStatus = document.getElementById("newsletter-status");
    if (!newsletterStatus) {
      newsletterStatus = document.createElement("p");
      newsletterStatus.id = "newsletter-status";
      newsletterStatus.setAttribute("aria-live", "polite");
      newsletterStatus.style.marginTop = "10px";
      newsletterStatus.style.fontWeight = "600";
      newsletterForm.insertAdjacentElement("afterend", newsletterStatus);
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    newsletterForm.addEventListener("submit", async e => {
      e.preventDefault();
      const email = (newsletterEmailInput?.value || "").trim().toLowerCase();
      if (!emailPattern.test(email)) {
        newsletterStatus.textContent = t("invalid_email");
        newsletterStatus.style.color = "#ffdfe6";
        return;
      }

      try {
        const response = await fetch("/api/newsletter-subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 409) {
            newsletterStatus.textContent = t("already_subscribed");
            newsletterStatus.style.color = "#ffe4c8";
            return;
          }

          throw new Error(result.error || "Failed to subscribe.");
        }

        newsletterStatus.textContent = t("subscribed_success");
        newsletterStatus.style.color = "#d6ffe7";
        newsletterForm.reset();
        showToast(t("subscribed_toast", { email }));
      } catch (error) {
        console.error("Newsletter subscribe failed:", error);
        newsletterStatus.textContent = error.message || "Failed to subscribe.";
        newsletterStatus.style.color = "#ffdfe6";
      }
    });
  }

  // --- Back to Top ---
  const backToTop = document.getElementById("backToTop");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 400) backToTop.style.display = "block";
      else backToTop.style.display = "none";
    });
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // --- Lightweight Scroll Reveal ---
  function initRevealAnimations() {
    const revealTargets = document.querySelectorAll(
      "header, #home.hero, #products, #about, #contact, .newsletter, footer, .product-card, .contact-info, .contact-social"
    );
    if (revealTargets.length === 0) return;

    const revealAll = () => {
      revealTargets.forEach(el => {
        el.classList.remove("reveal");
        el.classList.add("is-visible");
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    };

    const isProductListingPage = document.body.classList.contains("product-page");
    const disableReveal = window.matchMedia("(max-width: 760px)").matches || !("IntersectionObserver" in window);

    if (disableReveal) {
      revealAll();
      return;
    }

    revealTargets.forEach((el, index) => {
      if (isProductListingPage && (el.id === "products" || el.classList.contains("product-card"))) {
        el.classList.remove("reveal");
        el.classList.add("is-visible");
        return;
      }

      el.classList.add("reveal");
      if (el.classList.contains("product-card")) {
        el.style.animationDelay = `${Math.min(index * 40, 260)}ms`;
      }
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    revealTargets.forEach(el => observer.observe(el));

    // Fail open so content never stays hidden if a reveal target misses observation.
    window.setTimeout(() => {
      const hiddenTargets = Array.from(revealTargets).filter((el) => !el.classList.contains("is-visible"));
      if (hiddenTargets.length === 0) return;
      revealAll();
    }, 900);
  }

  // --- About Stats Count Animation ---
  function initAboutStatsCounter() {
    const statNumbers = document.querySelectorAll("#about .about-stat strong");
    if (statNumbers.length === 0) return;

    const parseTarget = (rawText) => {
      const trimmed = (rawText || "").trim();
      const match = trimmed.match(/^(\d+)(.*)$/);
      if (!match) return null;
      return {
        value: parseInt(match[1], 10),
        suffix: match[2] || ""
      };
    };

    statNumbers.forEach(el => {
      if (!el.dataset.targetText) el.dataset.targetText = el.textContent.trim();
      el.dataset.animated = "false";
      el.textContent = "0";
    });

    const animateOne = (el) => {
      if (el.dataset.animated === "true") return;
      const target = parseTarget(el.dataset.targetText || el.textContent);
      if (!target) return;

      const duration = 1000;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(target.value * eased);
        el.textContent = `${current}${target.suffix}`;

        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }

        el.textContent = `${target.value}${target.suffix}`;
        el.dataset.animated = "true";
      };

      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateOne(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => observer.observe(el));
  }

  window.initAboutStatsCounter = initAboutStatsCounter;

  function initContactHoverCards() {
    document.querySelectorAll(".contact-nav").forEach((contactNav) => {
      if (contactNav.dataset.hoverBound === "true") return;
      contactNav.dataset.hoverBound = "true";

      contactNav.addEventListener("mouseenter", () => {
        contactNav.classList.add("is-open");
      });

      contactNav.addEventListener("mouseleave", () => {
        contactNav.classList.remove("is-open");
      });

      contactNav.addEventListener("focusin", () => {
        contactNav.classList.add("is-open");
      });

      contactNav.addEventListener("focusout", (event) => {
        const next = event.relatedTarget;
        if (!next || !contactNav.contains(next)) {
          contactNav.classList.remove("is-open");
        }
      });
    });
  }

  // --- Init ---
  await ensureStorefrontProductsLoaded();
  await syncFreeGiftItems();
  updateCart();
  await ensureProductImagesLoaded();
  await ensureProductVariantsLoaded();
  await ensureProductGiftOptionsLoaded();
  applyProductImagesToCards();
  buildPackageSelectors();
  initLanguageSwitcher();
  initProductHoverSwap();
  bindProductCardInteractions();
  initRevealAnimations();
  initAboutStatsCounter();
  initFaqToggleCards();
  initContactHoverCards();
});
