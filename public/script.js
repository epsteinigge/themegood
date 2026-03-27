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

  function normalizeVariant(rawVariant, fallbackProductId = 0) {
    const productId = getProductId(rawVariant?.product_id) || getProductId(fallbackProductId);
    const variantId = rawVariant?.id ?? `default-${productId || 0}`;
    const directPriceRaw = rawVariant?.price ?? rawVariant?.variant_price;
    const directPrice = Number(directPriceRaw);
    const hasDirectPrice = directPriceRaw !== undefined && directPriceRaw !== null && String(directPriceRaw).trim() !== "" && Number.isFinite(directPrice);
    return {
      id: String(variantId),
      productId,
      name: String(rawVariant?.name || "Single Pack"),
      units: Math.max(1, Number(rawVariant?.units || 1)),
      discountPercent: Math.min(100, Math.max(0, Number(rawVariant?.discount_percent ?? rawVariant?.discount ?? 0))),
      discountAmount: Math.max(0, Number(rawVariant?.discount_amount ?? rawVariant?.discountAmount ?? 0)),
      price: hasDirectPrice ? Math.max(0, directPrice) : null,
      stock: Math.max(0, Number(rawVariant?.stock ?? 0)),
      hasDirectPrice,
      imageUrl: normalizeImageUrl(rawVariant?.image_url || rawVariant?.imageUrl || ""),
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
    return variants.length > 0 ? variants : [getDefaultVariant(productRef)];
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
      shopping: "Shopping",
      gallery: "Gallery",
      track_order: "Track Order",
      about: "About",
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
      shop_location: "ThemeGood Shop Location",
      newsletter_title: "Subscribe to Our Newsletter",
      newsletter_desc: "Get updates about new wellness products and special offers.",
      newsletter_placeholder: "Enter your email",
      subscribe: "Subscribe",
      scan_qr: "Scan QR",
      shopping_title: "Shopping",
      shopping_subtitle: "Premium wellness nutrition formulated for modern daily routines.",
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
      shopping: "Beli-belah",
      gallery: "Galeri",
      track_order: "Jejak Pesanan",
      about: "Tentang Kami",
      testimonials: "Testimoni",
      faq: "Soalan Lazim",
      contact_us: "Hubungi Kami",
      checkout: "Bayaran",
      wishlist: "Senarai Hajat",
      cart: "Troli",
      buy_now: "Beli Sekarang",
      learn_more: "Ketahui Lagi",
      featured_products: "Produk Pilihan",
      name_pomegranate: "Pomegranate Multigrain",
      name_bilberry: "Bilberry Multigrain",
      name_melon: "Melon Avocado Multigrain",
      name_passion: "Passion Fruit Multigrain",
      name_oat: "Oat Beta Glucan Multigrain",
      name_cocoa: "Cocoa Multigrain",
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
      shop_location: "Lokasi Kedai ThemeGood",
      newsletter_title: "Langgan Surat Berita Kami",
      newsletter_desc: "Dapatkan kemas kini produk kesihatan baharu dan tawaran istimewa.",
      newsletter_placeholder: "Masukkan e-mel anda",
      subscribe: "Langgan",
      scan_qr: "Imbas QR",
      shopping_title: "Membeli-belah",
      shopping_subtitle: "Pemakanan kesihatan premium yang diformulasikan untuk rutin harian moden.",
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
      shopping: "购物",
      gallery: "图库",
      track_order: "追踪订单",
      about: "关于我们",
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
      shop_location: "ThemeGood 门店位置",
      newsletter_title: "订阅我们的新闻通讯",
      newsletter_desc: "获取新品与特别优惠的最新信息。",
      newsletter_placeholder: "输入您的邮箱",
      subscribe: "订阅",
      scan_qr: "扫码",
      shopping_title: "购物",
      shopping_subtitle: "为现代日常生活打造的高端健康营养配方。",
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
  function formatBundleSelectionSummary(bundleSelections = [], bundleBreakdown = []) {
    if (!Array.isArray(bundleSelections) || bundleSelections.length === 0) return "";

    if (Array.isArray(bundleBreakdown) && bundleBreakdown.length > 0) {
      return bundleBreakdown
        .map((row) => {
          const extraText = Number(row.extra || 0) > 0 ? ` (+RM ${Number(row.extra).toFixed(2)})` : "";
          return `${row.label}${row.size ? ` (${row.size})` : ""}${extraText}`;
        })
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
      <div class="modal-content">
        <button class="close-modal" aria-label="${t("close_details")}">×</button>
        <div class="modal-body">
          <img id="modal-image" alt="${t("product_label")}">
          <h3 id="modal-title"></h3>
          <p id="modal-description"></p>
          <div id="modal-extra" class="modal-extra"></div>
          <div id="modal-size-options" class="modal-size-options"></div>
          <div class="modal-qty">
            <button id="modal-qty-dec" type="button" aria-label="-">-</button>
            <span id="modal-qty-value">1</span>
            <button id="modal-qty-inc" type="button" aria-label="+">+</button>
          </div>
          <div id="modal-gallery" class="modal-gallery"></div>
          <div class="modal-actions">
            <button id="modal-close-action" type="button" class="btn btn-secondary">Close</button>
            <button id="modal-add-cart" class="btn">${t("add_to_cart")}</button>
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
    const id = Number(productRef.dataset?.id || productRef.id || 0);
    const name = productRef.dataset?.name || productRef.name || "";
    return id === 6 || /cocoa/i.test(name);
  }

  function calculateSizePrice(basePrice, size = sizeOptions[0], productRef = null) {
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
          const choices = Array.isArray(variantsBySize[requiredSize])
            ? variantsBySize[requiredSize]
            : (Array.isArray(variantsBySize[normalizedRequiredSize]) ? variantsBySize[normalizedRequiredSize] : []);

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
              <select class="bundle-slot-select" data-slot-id="${slot.id}">
                <option value="">Select ${requiredSize}</option>
                ${choices.map((choice) => {
                  const extra = Number(choice.bundle_extra_price || 0);
                  return `
                    <option
                      value="${choice.id}"
                      data-price="${Number(choice.price || 0)}"
                      data-extra="${extra}"
                      data-name="${escapeHtml(choice.product_name || "")}"
                    >
                      ${escapeHtml(choice.product_name || "")}
                      (${escapeHtml(choice.size_name || "")})
                      ${extra > 0 ? ` (+RM ${extra.toFixed(2)})` : ""}
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
    document.querySelectorAll(".bundle-slot-select").forEach((select) => {
      if (select.value) return;

      const recommendedOption = [...select.options].find(
        (option) => option.dataset.recommended === "true"
      );

      if (recommendedOption) {
        select.value = recommendedOption.value;
      } else if (select.options.length > 1) {
        select.selectedIndex = 1;
      }
    });
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
    return [...document.querySelectorAll(".bundle-slot-select")]
      .filter((select) => select.value)
      .map((select) => {
        const option = select.options[select.selectedIndex];
        return {
          label: option?.dataset?.name || t("selected_item"),
          size: option?.dataset?.size || "",
          extra: Number(option?.dataset?.extra || 0)
        };
      });
  }

  async function updateBundleModalPrice(bundleId) {
    const totalEl = document.getElementById("modal-bundle-total");
    const breakdownEl = document.getElementById("modal-bundle-breakdown");
    const savingsEl = document.getElementById("modal-bundle-savings");
    const promoInputEl = document.getElementById("modal-bundle-promo-code");
    const promoStatusEl = document.getElementById("modal-bundle-promo-status");

    if (!totalEl) return;

    const selects = [...document.querySelectorAll(".bundle-slot-select")];
    const selections = getBundleSelectionsFromModal();

    if (selects.length === 0) {
      totalEl.textContent = formatMoney(0);
      if (breakdownEl) breakdownEl.innerHTML = "";
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
      return;
    }

    if (selections.length !== selects.length) {
      totalEl.textContent = t("bundle_complete_all");
      if (breakdownEl) breakdownEl.innerHTML = "";
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
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
          totalEl.textContent = fallbackPayload.error || t("bundle_price_unavailable");
          if (breakdownEl) breakdownEl.innerHTML = "";
          if (savingsEl) savingsEl.textContent = "";
          return;
        }

        return updateBundleModalPriceFromPayload(fallbackPayload, selections, selects, {
          totalEl,
          breakdownEl,
          savingsEl,
          promoStatusEl,
          appliedPromoCode: ""
        });
      }

      totalEl.textContent = payload.error || t("bundle_price_unavailable");
      if (breakdownEl) breakdownEl.innerHTML = "";
      if (savingsEl) savingsEl.textContent = "";
      if (promoStatusEl) promoStatusEl.textContent = "";
      return;
    }

    updateBundleModalPriceFromPayload(payload, selections, selects, {
      totalEl,
      breakdownEl,
      savingsEl,
      promoStatusEl,
      appliedPromoCode: payload.applied_promo_code || promoCode
    });
  }

  function updateBundleModalPriceFromPayload(payload, selections, selects, ui) {
    const { totalEl, breakdownEl, savingsEl, promoStatusEl, appliedPromoCode } = ui;
    totalEl.textContent = formatMoney(payload.total || 0);
    const subtotal = Number(payload.subtotal || 0);
    const surchargeTotal = Number(payload.surcharge_total || 0);
    const productDiscount = Number(payload.product_discount || 0);
    const promoDiscount = Number(payload.promo_discount || 0);
    const pricingRuleAdjustment = Number(payload.pricing_rule_adjustment || 0);
    const baseBundlePrice = Math.max(0, subtotal - surchargeTotal);

    const selectedRows = selects.map((select) => {
      const option = select.options[select.selectedIndex];
      return {
        label: option?.dataset?.name || t("selected_item"),
        size: option?.dataset?.size || "",
        extra: Number(option?.dataset?.extra || 0)
      };
    });

    if (breakdownEl) {
      breakdownEl.innerHTML = `
        <div class="bundle-breakdown-list">
          ${selectedRows.map((row) => `
            <div class="bundle-breakdown-row">
              <span>${escapeHtml(row.label)}${row.size ? ` (${escapeHtml(row.size)})` : ""}</span>
              <span>
                ${row.extra > 0 ? `<strong class="bundle-extra-pill">+${formatMoney(row.extra)}</strong>` : t("bundle_included")}
              </span>
            </div>
          `).join("")}
          <div class="bundle-breakdown-row">
            <span>${t("bundle_base_price")}</span>
            <span>${formatMoney(baseBundlePrice)}</span>
          </div>
          <div class="bundle-breakdown-row">
            <span>${t("bundle_surcharge_total")}</span>
            <span>${formatMoney(surchargeTotal)}</span>
          </div>
          <div class="bundle-breakdown-row">
            <span>${t("bundle_product_discount")}</span>
            <span>-${formatMoney(productDiscount)}</span>
          </div>
          <div class="bundle-breakdown-row">
            <span>${t("bundle_pricing_adjustment")}</span>
            <span>${pricingRuleAdjustment >= 0 ? "+" : "-"}${formatMoney(Math.abs(pricingRuleAdjustment))}</span>
          </div>
          <div class="bundle-breakdown-row">
            <span>${t("bundle_promo_discount")}</span>
            <span>-${formatMoney(promoDiscount)}</span>
          </div>
          <div class="bundle-breakdown-row">
            <span><strong>${t("bundle_final_total")}</strong></span>
            <span><strong>${formatMoney(payload.total || 0)}</strong></span>
          </div>
        </div>
      `;
    }

    const total = Number(payload.total || 0);
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

  function applySizeImage(card, sizeId) {
    const imageEl = card.querySelector("img");
    if (!imageEl) return;
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

  function buildPackageSelectors(root = document) {
    const productCards = root.querySelectorAll("#products .product-card");

    productCards.forEach(card => {
      if (isBundleProduct(card)) {
        card.querySelector(".purchase-option-wrap")?.remove();
        card.querySelector(".gift-offer-wrap")?.remove();
        card.querySelector(".size-selector-wrap")?.remove();
        card.querySelector(".package-selector-wrap")?.remove();
        card.querySelector(".package-price-preview")?.remove();
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

  function translateStaticSections() {
    setText(".hero .slide-cta .btn-primary", "buy_now");
    document.querySelectorAll(".hero .slide-cta .btn-primary").forEach(btn => { btn.textContent = t("buy_now"); });
    document.querySelectorAll(".hero .slide-cta .btn-secondary").forEach(btn => { btn.textContent = t("learn_more"); });

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
    setText("#newsletter-form button", "subscribe");
    const newsletterEmail = document.getElementById("newsletter-email");
    if (newsletterEmail) newsletterEmail.setAttribute("placeholder", t("newsletter_placeholder"));

    setText(".footer-qr h4", "scan_qr");

    setText(".products-hero .section-title", "shopping_title");
    setText(".product-page .products-hero p", "shopping_subtitle");
    setText(".shopping-details-page .products-hero .section-title", "shopping_details_title");
    setText(".shopping-details-page .products-hero p", "shopping_details_subtitle");

    setText(".product-cta h2", "ready_to_checkout");
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
        slide.classList.toggle("active", index === slideIndex);
      });
      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === slideIndex);
      });
    };

    prevBtn.onclick = () => showSlide(slideIndex - 1);
    nextBtn.onclick = () => showSlide(slideIndex + 1);

    dots.forEach((dot, index) => {
      dot.onclick = () => showSlide(index);
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

    if (sliderIntervalId) {
      clearInterval(sliderIntervalId);
    }
    sliderIntervalId = setInterval(() => showSlide(slideIndex + 1), 5000);
  }

  window.initHomepageSlider = initHomepageSlider;
  initHomepageSlider();

  // --- Hamburger Menu ---
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const navMenu = document.getElementById("navMenu");
  const overlay = document.getElementById("menuOverlay");
  const headerActions = document.querySelector(".header-actions");
  const langSwitch = headerActions?.querySelector(".lang-switch");

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
  window.addEventListener("resize", syncMobileHeaderLayout);

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
    const custom = (el.dataset.gallery || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const base = normalizeImageUrl(el.dataset.image || el.querySelector("img")?.getAttribute("src") || "");
    const hover = normalizeImageUrl(el.dataset.hoverImage || "");
    const stored = getStoredImagesForProduct(el)
      .map((image) => normalizeImageUrl(image.image_url))
      .filter(Boolean);
    return [...new Set([base, hover, ...custom, ...stored].filter(Boolean))];
  };

  const renderModalGallery = (images) => {
    if (!modalGallery || !modalImage) return;
    modalGallery.innerHTML = "";
    images.forEach((src, idx) => {
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = src;
      thumb.alt = `Product photo ${idx + 1}`;
      thumb.addEventListener("click", () => {
        modalImage.src = src;
      });
      modalGallery.appendChild(thumb);
    });
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
          const idx = Math.min(getSizeIndex(sizeInfo.id), Math.max(gallery.length - 1, 0));
          if (modalImage && gallery[idx]) modalImage.src = gallery[idx];
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
        const idx = Math.min(getSizeIndex(size.id), Math.max(gallery.length - 1, 0));
        if (modalImage && gallery[idx]) modalImage.src = gallery[idx];
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

    if (modalQtyValue) modalQtyValue.textContent = "1";
    renderModalGallery(gallery);

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
          selectableVariantSizeKeys: Object.keys(bundleData?.selectable_variants_by_size || {})
        });

        currentProduct = {
          id,
          name,
          price: 0,
          stock: 9999,
          sizeId: "",
          sizeLabel: "",
          packageId: "bundle",
          packageLabel: t("custom_bundle"),
          packageUnits: 1,
          packagePrice: 0,
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

              <div class="promo-box bundle-modal-promo-box">
                <input id="modal-bundle-promo-code" type="text" placeholder="${t("bundle_promo_code")}" maxlength="32">
                <button id="modal-bundle-promo-apply" type="button">${t("bundle_apply_promo")}</button>
              </div>
              <small id="modal-bundle-promo-status" aria-live="polite"></small>

              ${renderBundleSelectors(bundleData)}

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

        autoSelectRecommendedBundleOptions();
        updateBundleModalPrice(id);

        if (modalAddCartBtn) {
          modalAddCartBtn.disabled = false;
          modalAddCartBtn.textContent = t("add_bundle_to_cart");
        }

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
    const selectedSize = getSelectedSize(el);
    const selectedPackage = getSelectedPackage(el);
    const packagePrice = calculatePackagePrice(price, selectedPackage, selectedSize, el);
    const modalProductImage = selectedPackage.imageUrl || gallery[Math.min(getSizeIndex(selectedSize.id), Math.max(gallery.length - 1, 0))] || gallery[0] || image;

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

    const activeSizeBtn = modalSizeOptions?.querySelector(`.modal-size-option[data-size-id="${selectedSize.id}"]`);
    if (activeSizeBtn) activeSizeBtn.classList.add("is-active");

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
      const breakdown = getBundleBreakdownFromModal();
      const requiredCount = document.querySelectorAll(".bundle-slot-select").length;

      if (requiredCount <= 0 || selections.length !== requiredCount || breakdown.length !== requiredCount) {
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
      showToast(`${currentProduct.name} added to cart!`);
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
  });

  // --- Sidebar Toggles ---
  const closeCommercePanels = () => {
    document.getElementById("cart-sidebar")?.classList.remove("open");
    document.getElementById("cart-overlay")?.classList.remove("active");
    document.getElementById("menuOverlay")?.classList.remove("active");
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
    };
    const closePanel = () => {
      if (!sidebar || !overlay) return;
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
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
});
