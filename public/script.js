document.addEventListener("DOMContentLoaded", () => {
  // --- Global State ---
  let cartItems = JSON.parse(localStorage.getItem("cart")) || [];
  let wishlistItems = JSON.parse(localStorage.getItem("wishlist")) || [];
  let currentProduct = null;
  let currentLang = "en";
  let cartPromo = JSON.parse(localStorage.getItem("cart_promo")) || { code: "", percent: 0 };

  const packagePlans = [
    { id: "single", label: "Single Pack", units: 1, discount: 0 },
    { id: "duo", label: "Duo Pack", units: 2, discount: 8 },
    { id: "family", label: "Family Pack", units: 4, discount: 15 }
  ];
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

  const promoCodes = {
    TG10: { percent: 10, minSubtotal: 60 },
    SAVE15: { percent: 15, minSubtotal: 120 },
    BUNDLE20: { percent: 20, minSubtotal: 200 }
  };

  const dict = {
    en: {
      language: "Language",
      quick_links: "Quick Links",
      follow_us: "Follow Us",
      home: "Home",
      products: "Products",
      shopping: "Shopping",
      gallery: "Gallery",
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
      gallery_title: "ThemeGood Gallery",
      gallery_subtitle: "Explore our product moments and wellness highlights.",
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
      gallery_title: "Galeri ThemeGood",
      gallery_subtitle: "Terokai momen produk dan sorotan kesihatan kami.",
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
      gallery_title: "ThemeGood 图库",
      gallery_subtitle: "探索我们的产品瞬间与健康亮点。",
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
  const formatMoney = (value) => {
    const amount = Number(value || 0);
    return `RM ${amount.toFixed(2)}`;
  };

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
        <button class="close-modal" aria-label="Close product details">×</button>
        <div class="modal-body">
          <img id="modal-image" alt="Product image">
          <h3 id="modal-title"></h3>
          <p id="modal-description"></p>
          <div id="modal-extra" class="modal-extra"></div>
          <div id="modal-size-options" class="modal-size-options"></div>
          <div class="modal-qty">
            <button id="modal-qty-dec" type="button" aria-label="Decrease quantity">-</button>
            <span id="modal-qty-value">1</span>
            <button id="modal-qty-inc" type="button" aria-label="Increase quantity">+</button>
          </div>
          <div id="modal-gallery" class="modal-gallery"></div>
          <div class="modal-actions">
            <button id="modal-close-action" type="button" class="btn btn-secondary">Close</button>
            <button id="modal-add-cart" class="btn">Add to Cart</button>
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
          <input id="promo-code" type="text" placeholder="Promo code (TG10)" maxlength="16">
          <button id="apply-promo" type="button">Apply</button>
          <small id="promo-status" aria-live="polite"></small>
        </div>
        <a href="checkout.html" class="btn" style="display:inline-block;text-align:center;">${t("checkout")}</a>
      `;
      document.body.appendChild(cartSidebar);
    }

    if (!document.getElementById("wishlist-sidebar")) {
      const wishlistSidebar = document.createElement("aside");
      wishlistSidebar.id = "wishlist-sidebar";
      wishlistSidebar.innerHTML = `
        <div class="wishlist-header">
          <h2>${t("your_wishlist")}</h2>
          <button id="close-wishlist" aria-label="${t("close_wishlist")}">×</button>
        </div>
        <ul id="wishlist-items"></ul>
      `;
      document.body.appendChild(wishlistSidebar);
    }

    if (!document.getElementById("wishlist-overlay")) {
      const wishlistOverlay = document.createElement("div");
      wishlistOverlay.id = "wishlist-overlay";
      document.body.appendChild(wishlistOverlay);
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
  const wishlistList = document.getElementById("wishlist-items");
  const wishlistCount = document.getElementById("wishlist-count");
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
  function saveWishlist() { localStorage.setItem("wishlist", JSON.stringify(wishlistItems)); }
  function saveCartPromo() { localStorage.setItem("cart_promo", JSON.stringify(cartPromo)); }

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
    const iconClass = buttonId === "wishlist-toggle" ? "header-action-icon is-wishlist" : "header-action-icon is-cart";

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
    if (!isCocoaProduct(productRef)) {
      return Number(fixedSizePrices[size.id] || fixedSizePrices.small || 0);
    }
    return Number(basePrice || 0) * Number(size.multiplier || 1);
  }

  function calculatePackagePrice(basePrice, pack, size = sizeOptions[0], productRef = null) {
    const sizeAdjusted = calculateSizePrice(basePrice, size, productRef);
    const subtotal = sizeAdjusted * Number(pack.units || 1);
    return subtotal * (1 - (Number(pack.discount || 0) / 100));
  }

  function getSelectedSize(card) {
    const active = card.querySelector(".size-option.is-active");
    if (active) {
      const size = sizeOptions.find(s => s.id === active.dataset.sizeId);
      if (size) return size;
    }
    const select = card.querySelector(".size-select");
    if (select) {
      const size = sizeOptions.find(s => s.id === select.value);
      if (size) return size;
    }
    return sizeOptions[0];
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
    const activeOption = card.querySelector(".package-option.is-active");
    if (!activeOption) return packagePlans[0];
    const plan = packagePlans.find(p => p.id === activeOption.dataset.packageId);
    return plan || packagePlans[0];
  }

  function getPackageOptionLabel(plan, totalPrice) {
    return `${plan.label} (${plan.units}x, ${plan.discount}% off) - ${formatMoney(totalPrice)}`;
  }

  function buildPackageSelectors(root = document) {
    const productCards = root.querySelectorAll("#products .product-card");
    const shoppingContext = document.body.classList.contains("product-page") || document.body.classList.contains("shopping-details-page");

    productCards.forEach(card => {
      const basePrice = Number(card.dataset.price || 0);
      const firstButton = card.querySelector(".add-to-cart");

      if (!card.querySelector(".size-selector-wrap")) {
        const sizeWrap = document.createElement("div");
        sizeWrap.className = "size-selector-wrap";
        const sizeLabel = document.createElement("label");
        sizeLabel.className = "package-label";
        sizeLabel.textContent = "Size";
        const optionsRow = document.createElement("div");
        optionsRow.className = "size-options-row";
        const hoverHint = document.createElement("div");
        hoverHint.className = "size-hover-price";

        const updateHoverHintToSelected = () => {
          const selectedSize = getSelectedSize(card);
          hoverHint.textContent = `${selectedSize.label}: ${formatMoney(calculateSizePrice(basePrice, selectedSize, card))}`;
        };

        sizeOptions.forEach((size, index) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "size-option";
          if (index === 0) btn.classList.add("is-active");
          btn.dataset.sizeId = size.id;
          btn.textContent = size.label;

          btn.addEventListener("mouseenter", () => {
            hoverHint.textContent = `${size.label}: ${formatMoney(calculateSizePrice(basePrice, size, card))}`;
          });
          btn.addEventListener("mouseleave", updateHoverHintToSelected);
          btn.addEventListener("focus", () => {
            hoverHint.textContent = `${size.label}: ${formatMoney(calculateSizePrice(basePrice, size, card))}`;
          });
          btn.addEventListener("blur", updateHoverHintToSelected);
          btn.addEventListener("click", () => {
            optionsRow.querySelectorAll(".size-option").forEach(el => el.classList.remove("is-active"));
            btn.classList.add("is-active");
            updateHoverHintToSelected();
            applySizeImage(card, size.id);
            refreshPricingPreview();
          });

          optionsRow.appendChild(btn);
        });

        sizeWrap.appendChild(sizeLabel);
        sizeWrap.appendChild(optionsRow);
        sizeWrap.appendChild(hoverHint);
        if (firstButton) card.insertBefore(sizeWrap, firstButton);
        else card.appendChild(sizeWrap);
        updateHoverHintToSelected();
        applySizeImage(card, sizeOptions[0].id);
      }

      if (shoppingContext && !card.querySelector(".package-selector-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "package-selector-wrap";
        const label = document.createElement("label");
        label.className = "package-label";
        label.textContent = "Package";
        const optionsRow = document.createElement("div");
        optionsRow.className = "package-options-row";

        packagePlans.forEach((plan, index) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "package-option";
          option.dataset.packageId = plan.id;
          if (index === 0) option.classList.add("is-active");

          option.addEventListener("click", () => {
            optionsRow.querySelectorAll(".package-option").forEach(el => el.classList.remove("is-active"));
            option.classList.add("is-active");
            refreshPricingPreview();
          });

          optionsRow.appendChild(option);
        });

        wrap.appendChild(label);
        wrap.appendChild(optionsRow);
        if (firstButton) card.insertBefore(wrap, firstButton);
        else card.appendChild(wrap);
      }

      if (!card.querySelector(".package-price-preview")) {
        const preview = document.createElement("div");
        preview.className = "package-price-preview";
        if (firstButton) card.insertBefore(preview, firstButton);
        else card.appendChild(preview);
      }

      const packageOptions = card.querySelectorAll(".package-option");

      function refreshPricingPreview() {
        const selectedSize = getSelectedSize(card);
        const selectedPack = getSelectedPackage(card);
        const finalPrice = calculatePackagePrice(basePrice, selectedPack, selectedSize, card);
        const preview = card.querySelector(".package-price-preview");
        if (preview) {
          const title = packageOptions.length ? "Selected total" : "Selected price";
          preview.textContent = `${title}: ${formatMoney(finalPrice)}`;
        }

        if (packageOptions.length) {
          packageOptions.forEach(opt => {
            const plan = packagePlans.find(p => p.id === opt.dataset.packageId) || packagePlans[0];
            const packPrice = calculatePackagePrice(basePrice, plan, selectedSize, card);
            opt.textContent = getPackageOptionLabel(plan, packPrice);
          });
        }
      }

      refreshPricingPreview();
    });
  }

  function translateStaticSections() {
    const setProductText = (selector, key, attr = null) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const value = t(key);
      el.textContent = value;
      if (attr) el.setAttribute(attr, value);
    };

    setText(".hero .slide-cta .btn-primary", "buy_now");
    document.querySelectorAll(".hero .slide-cta .btn-primary").forEach(btn => { btn.textContent = t("buy_now"); });
    document.querySelectorAll(".hero .slide-cta .btn-secondary").forEach(btn => { btn.textContent = t("learn_more"); });

    setText("#products .section-title", "featured_products");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(1) h4", "name_pomegranate");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(2) h4", "name_bilberry");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(3) h4", "name_melon");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(4) h4", "name_passion");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(5) h4", "name_oat");
    setProductText("body:not(.shopping-details-page) #products .product-card:nth-of-type(6) h4", "name_cocoa");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(1) p", "desc_pomegranate");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(2) p", "desc_bilberry");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(3) p", "desc_melon");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(4) p", "desc_passion");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(5) p", "desc_oat");
    setText("body:not(.shopping-details-page) #products .product-card:nth-of-type(6) p", "desc_cocoa");
    document.querySelectorAll("body:not(.shopping-details-page) #products .product-card").forEach((card, index) => {
      const nameKeys = ["name_pomegranate", "name_bilberry", "name_melon", "name_passion", "name_oat", "name_cocoa"];
      const key = nameKeys[index];
      if (key) card.dataset.name = t(key);
    });

    setProductText(".shopping-details-page #products .detail-card:nth-of-type(1) h4", "name_pomegranate");
    setProductText(".shopping-details-page #products .detail-card:nth-of-type(2) h4", "name_bilberry");
    setProductText(".shopping-details-page #products .detail-card:nth-of-type(3) h4", "name_melon");
    setProductText(".shopping-details-page #products .detail-card:nth-of-type(4) h4", "name_passion");
    setText(".shopping-details-page #products .detail-card:nth-of-type(1) > p", "details_desc_pomegranate");
    setText(".shopping-details-page #products .detail-card:nth-of-type(2) > p", "details_desc_bilberry");
    setText(".shopping-details-page #products .detail-card:nth-of-type(3) > p", "details_desc_melon");
    setText(".shopping-details-page #products .detail-card:nth-of-type(4) > p", "details_desc_passion");
    document.querySelectorAll(".shopping-details-page #products .detail-card").forEach((card, index) => {
      const nameKeys = ["name_pomegranate", "name_bilberry", "name_melon", "name_passion"];
      const key = nameKeys[index];
      if (key) card.dataset.name = t(key);
    });
    setText(".shopping-details-page #products .detail-card:nth-of-type(1) li:nth-of-type(1)", "pomegranate_b1");
    setText(".shopping-details-page #products .detail-card:nth-of-type(1) li:nth-of-type(2)", "pomegranate_b2");
    setText(".shopping-details-page #products .detail-card:nth-of-type(1) li:nth-of-type(3)", "pomegranate_b3");
    setText(".shopping-details-page #products .detail-card:nth-of-type(2) li:nth-of-type(1)", "bilberry_b1");
    setText(".shopping-details-page #products .detail-card:nth-of-type(2) li:nth-of-type(2)", "bilberry_b2");
    setText(".shopping-details-page #products .detail-card:nth-of-type(2) li:nth-of-type(3)", "bilberry_b3");
    setText(".shopping-details-page #products .detail-card:nth-of-type(3) li:nth-of-type(1)", "melon_b1");
    setText(".shopping-details-page #products .detail-card:nth-of-type(3) li:nth-of-type(2)", "melon_b2");
    setText(".shopping-details-page #products .detail-card:nth-of-type(3) li:nth-of-type(3)", "melon_b3");
    setText(".shopping-details-page #products .detail-card:nth-of-type(4) li:nth-of-type(1)", "passion_b1");
    setText(".shopping-details-page #products .detail-card:nth-of-type(4) li:nth-of-type(2)", "passion_b2");
    setText(".shopping-details-page #products .detail-card:nth-of-type(4) li:nth-of-type(3)", "passion_b3");
    document.querySelectorAll(".shopping-details-page .detail-meta span").forEach(el => { el.textContent = t("price"); });
    setText("#about h2", "about_themegood");
    setText("#about .about-lead", "about_lead");
    setText("#about .about-pillar:nth-of-type(1) h3", "who_we_are");
    setText("#about .about-pillar:nth-of-type(1) p", "who_we_are_desc");
    setText("#about .about-pillar:nth-of-type(2) h3", "perfect_recipe");
    setText("#about .about-pillar:nth-of-type(2) p", "perfect_recipe_desc");
    setText("#about .about-pillar:nth-of-type(3) h3", "suitability");
    setText("#about .about-pillar:nth-of-type(3) p", "suitability_desc");
    setText("#about .about-stat:nth-of-type(1) span", "years_foundation");
    setText("#about .about-stat:nth-of-type(2) span", "distributors_retailers");
    setText("#about .about-stat:nth-of-type(3) span", "reports_certifications");
    setText("#about .about-stat:nth-of-type(4) span", "monthly_orders");
    setText("#testimonials .section-title", "testimonials_title");
    setText("#testimonials .testimonials-intro", "testimonials_intro");
    setText("#testimonials .testimonial-card:nth-of-type(1) .testimonial-copy", "testimonial_quote_1");
    setText("#testimonials .testimonial-card:nth-of-type(2) .testimonial-copy", "testimonial_quote_2");
    setText("#testimonials .testimonial-card:nth-of-type(3) .testimonial-copy", "testimonial_quote_3");
    setText("#testimonials .testimonial-card:nth-of-type(1) strong", "testimonial_author_1");
    setText("#testimonials .testimonial-card:nth-of-type(2) strong", "testimonial_author_2");
    setText("#testimonials .testimonial-card:nth-of-type(3) strong", "testimonial_author_3");
    setText("#testimonials .testimonial-card:nth-of-type(1) span", "testimonial_role_1");
    setText("#testimonials .testimonial-card:nth-of-type(2) span", "testimonial_role_2");
    setText("#testimonials .testimonial-card:nth-of-type(3) span", "testimonial_role_3");
    setText("#faq .section-title", "faq_title");
    setText("#faq .faq-intro", "faq_intro");
    setText("#faq .faq-item:nth-of-type(1) summary", "faq_q1");
    setText("#faq .faq-item:nth-of-type(1) p", "faq_a1");
    setText("#faq .faq-item:nth-of-type(2) summary", "faq_q2");
    setText("#faq .faq-item:nth-of-type(2) p", "faq_a2");
    setText("#faq .faq-item:nth-of-type(3) summary", "faq_q3");
    setText("#faq .faq-item:nth-of-type(3) p", "faq_a3");
    setText("#faq .faq-item:nth-of-type(4) summary", "faq_q4");
    setText("#faq .faq-item:nth-of-type(4) p", "faq_a4");

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

    setText(".newsletter h2", "newsletter_title");
    setText(".newsletter p", "newsletter_desc");
    setText("#newsletter-form button", "subscribe");
    const newsletterEmail = document.getElementById("newsletter-email");
    if (newsletterEmail) newsletterEmail.setAttribute("placeholder", t("newsletter_placeholder"));

    setText(".footer-qr h4", "scan_qr");
    setText(".footer-bottom", "footer_copy");

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
    setText(".gallery-page .header-actions .btn", "shop_now");
    document.getElementById("lightboxClose")?.setAttribute("aria-label", t("close_image"));
    document.getElementById("lightboxPrev")?.setAttribute("aria-label", t("previous_image"));
    document.getElementById("lightboxNext")?.setAttribute("aria-label", t("next_image"));
    document.getElementById("zoomIn")?.setAttribute("aria-label", t("zoom_in"));
    document.getElementById("zoomOut")?.setAttribute("aria-label", t("zoom_out"));
    document.getElementById("qr-overlay-close")?.setAttribute("aria-label", t("close_image"));
  }

  function translateRuntimeUi() {
    setHeaderActionLabel("wishlist-toggle", "wishlist", "wishlist-count", "♥");
    setHeaderActionLabel("cart-toggle", "cart", "cart-count", "🛒");
    document.querySelectorAll(".add-to-cart").forEach(btn => { btn.textContent = t("add_to_cart"); });
    document.querySelectorAll(".add-to-wishlist").forEach(btn => { btn.innerHTML = `&hearts; ${t("wishlist")}`; });
    const modalCloseAction = document.getElementById("modal-close-action");
    if (modalCloseAction) modalCloseAction.textContent = t("close_details");
    document.querySelectorAll("#wishlist-items button[data-action='wishlistToCart']").forEach(btn => {
      btn.textContent = t("add_to_cart");
    });

    setText("#cart-sidebar .cart-header h2", "your_cart");
    setText("#wishlist-sidebar .wishlist-header h2", "your_wishlist");
    const closeCart = document.getElementById("close-cart");
    if (closeCart) closeCart.setAttribute("aria-label", t("close_cart"));
    const closeWishlist = document.getElementById("close-wishlist");
    if (closeWishlist) closeWishlist.setAttribute("aria-label", t("close_wishlist"));
    setText("#cart-sidebar p strong", "total");
    setText("#cart-sidebar a.btn", "checkout");
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
  const slides = document.querySelectorAll(".slide");
  const dots = document.querySelectorAll(".dot");
  let slideIndex = 0;
  function showSlide(i) {
    if (slides.length === 0) return;
    slides.forEach(slide => slide.classList.remove("active"));
    dots.forEach(dot => dot.classList.remove("active"));
    slideIndex = (i + slides.length) % slides.length;
    slides[slideIndex].classList.add("active");
    dots[slideIndex].classList.add("active");
  }
  if (document.getElementById("prevBtn")) {
    document.getElementById("prevBtn").addEventListener("click", () => showSlide(slideIndex - 1));
    document.getElementById("nextBtn").addEventListener("click", () => showSlide(slideIndex + 1));
    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => showSlide(index));
    });
    slides.forEach(slide => {
      if (!slide.dataset.slideLink) return;
      slide.style.cursor = "pointer";
      slide.addEventListener("click", e => {
        if (e.target.closest(".slide-cta, .arrow, .dots, .dot, a, button")) return;
        window.location.href = slide.dataset.slideLink;
      });
    });
    setInterval(() => showSlide(slideIndex + 1), 5000);
  }

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
        const metaParts = [item.sizeLabel, item.packageLabel].filter(Boolean);
        const packageSuffix = metaParts.length ? ` (${metaParts.join(", ")})` : "";
        li.innerHTML = `
          ${item.name}${packageSuffix} - ${formatMoney(item.price)}
          <div class="qty-controls">
            <button data-action="dec" data-index="${idx}">-</button>
            <span>${item.quantity}</span>
            <button data-action="inc" data-index="${idx}">+</button>
            <button class="remove" data-action="remove" data-index="${idx}">×</button>
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
    if (promoStatus && cartPromo.code) promoStatus.textContent = `${cartPromo.code} applied (${cartPromo.percent}% off).`;
    if (promoStatus && !cartPromo.code) promoStatus.textContent = "";
    saveCart();
    saveCartPromo();
  }
  cartList?.addEventListener("click", e => {
    const btn = e.target;
    const idx = parseInt(btn.dataset.index, 10);
    if (btn.dataset.action === "inc") cartItems[idx].quantity++;
    if (btn.dataset.action === "dec") {
      cartItems[idx].quantity--;
      if (cartItems[idx].quantity < 1) cartItems.splice(idx, 1);
    }
    if (btn.dataset.action === "remove") cartItems.splice(idx, 1);
    updateCart();
  });

  const applyPromoCode = () => {
    if (!promoInput) return;
    const code = promoInput.value.trim().toUpperCase();
    if (!code) {
      cartPromo = { code: "", percent: 0 };
      if (promoStatus) promoStatus.textContent = "Promo removed.";
      updateCart();
      return;
    }

    const rule = promoCodes[code];
    const subtotal = cartItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
    if (!rule) {
      if (promoStatus) promoStatus.textContent = "Invalid promo code.";
      return;
    }
    if (subtotal < rule.minSubtotal) {
      if (promoStatus) promoStatus.textContent = `Spend at least ${formatMoney(rule.minSubtotal)} to use ${code}.`;
      return;
    }

    cartPromo = { code, percent: rule.percent };
    if (promoStatus) promoStatus.textContent = `${code} applied (${rule.percent}% off).`;
    updateCart();
  };

  applyPromoBtn?.addEventListener("click", applyPromoCode);
  promoInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPromoCode();
    }
  });

  // --- Wishlist ---
  function updateWishlist() {
    if (wishlistList) wishlistList.innerHTML = "";
    wishlistItems.forEach((item, idx) => {
      if (wishlistList) {
        const li = document.createElement("li");
        li.innerHTML = `${item.name} <button data-action="wishlistToCart" data-index="${idx}">${t("add_to_cart")}</button>`;
        wishlistList.appendChild(li);
      }
    });
    if (wishlistCount) wishlistCount.textContent = wishlistItems.length;
    saveWishlist();
  }
  wishlistList?.addEventListener("click", e => {
    if (e.target.dataset.action === "wishlistToCart") {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = wishlistItems[idx];
      addToCartAction(item.id, item.name, item.price);
      wishlistItems.splice(idx, 1);
      updateWishlist();
    }
  });

  function addToCartAction(id, name, price, meta = {}, quantityToAdd = 1) {
    const packageId = meta.packageId || "single";
    const sizeId = meta.sizeId || "small";
    const itemKey = `${id}::${sizeId}::${packageId}`;
    const finalPrice = Number.isFinite(meta.priceOverride) ? meta.priceOverride : Number(price || 0);
    const existing = cartItems.find(i => (i.key || `${i.id}::small::single`) === itemKey);
    if (existing) existing.quantity += Math.max(1, Number(quantityToAdd || 1));
    else {
      cartItems.push({
        key: itemKey,
        id,
        name,
        price: finalPrice,
        quantity: Math.max(1, Number(quantityToAdd || 1)),
        sizeId,
        sizeLabel: meta.sizeLabel || "",
        packageId,
        packageLabel: meta.packageLabel || ""
      });
    }
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
  const fallbackGalleryById = {
    1: ["photos/Pomegranate 300g.png", "photos/Pomegranate 600g.png", "photos/Pomegranate 800g (1).png"],
    2: ["photos/Bilberry 300g.png", "photos/Bilberry 600g.png", "photos/Bilberry 800g.png"],
    3: ["photos/Melon Avocado 300g.png", "photos/Melon Avocado 600g.png", "photos/Melon Avocado 800g.png"],
    4: ["photos/Passion Fruit 300g.png", "photos/Passion Fruit 600g.png", "photos/Passion Fruit 800g.png"],
    5: ["photos/Oat Beta 300g.png", "photos/Oat Beta 600g.png", "photos/Oat Beta 800g (1).png"],
    6: ["photos/Cocoa 300g.png", "photos/Cocoa800g.png", "photos/Cocoa800g.png"]
  };

  const getProductGallery = (el) => {
    const id = Number(el.dataset.id || 0);
    const custom = (el.dataset.gallery || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const base = el.dataset.image || el.querySelector("img")?.getAttribute("src") || "";
    const hover = el.dataset.hoverImage || "";
    const fallback = fallbackGalleryById[id] || [];
    return [...new Set([base, hover, ...custom, ...fallback].filter(Boolean))];
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
    modalExtra.innerHTML = `
      <p class="modal-price-line"><strong>Price:</strong> <span class="modal-price-value">${safePrice}</span></p>
      <p class="modal-meta-line"><strong>Size:</strong> <span>${selectedSize.label}</span></p>
      <p class="modal-meta-line"><strong>Package:</strong> <span>${selectedPackage.label} (${selectedPackage.units}x, ${selectedPackage.discount}% off)</span></p>
    `;
  };

  const renderModalSizeOptions = (el, gallery, selectedPackage, basePrice) => {
    if (!modalSizeOptions) return;
    modalSizeOptions.innerHTML = "";
    sizeOptions.forEach(size => {
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

  function openProductModal(el) {
    if (!modal || !modalImage || !modalTitle || !modalDescription) return;
    const id = el.dataset.id;
    const name = el.dataset.name;
    const price = parseFloat(el.dataset.price);
    const selectedSize = getSelectedSize(el);
    const selectedPackage = getSelectedPackage(el);
    const packagePrice = calculatePackagePrice(price, selectedPackage, selectedSize, el);
    const desc = el.dataset.description || "Premium nutritional product.";
    const gallery = getProductGallery(el);
    const image = gallery[Math.min(getSizeIndex(selectedSize.id), Math.max(gallery.length - 1, 0))] || gallery[0] || el.dataset.image || el.querySelector("img")?.src || "";
    currentProduct = {
      id,
      name,
      price,
      sizeId: selectedSize.id,
      sizeLabel: selectedSize.label,
      packageId: selectedPackage.id,
      packageLabel: selectedPackage.label,
      packagePrice,
      quantity: 1
    };
    modalTitle.textContent = name;
    modalDescription.textContent = desc;
    modalImage.src = image;
    renderModalPricingInfo(selectedSize, selectedPackage, packagePrice);
    renderModalSizeOptions(el, gallery, selectedPackage, price);
    const activeSizeBtn = modalSizeOptions?.querySelector(`.modal-size-option[data-size-id="${selectedSize.id}"]`);
    if (activeSizeBtn) activeSizeBtn.classList.add("is-active");
    if (modalQtyValue) modalQtyValue.textContent = "1";
    renderModalGallery(gallery);
    modal.style.display = "flex";
    document.body.classList.add("product-modal-open");
  }
  function bindProductCardInteractions(root = document) {
    root.querySelectorAll(".product-card, .product").forEach(el => {
      if (el.dataset.productCardBound === "true") return;
      el.dataset.productCardBound = "true";

      el.addEventListener("click", e => {
        if (e.target.closest(".package-selector-wrap")) return;
        if (e.target.closest(".size-selector-wrap")) return;
        if (e.target.tagName === "BUTTON") {
          const id = el.dataset.id;
          const name = el.dataset.name;
          const basePrice = parseFloat(el.dataset.price);
          if (e.target.classList.contains("add-to-cart")) {
            const selectedSize = getSelectedSize(el);
            const selectedPackage = getSelectedPackage(el);
            const packagePrice = calculatePackagePrice(basePrice, selectedPackage, selectedSize, el);
            addToCartAction(id, name, basePrice, {
              priceOverride: packagePrice,
              sizeId: selectedSize.id,
              sizeLabel: selectedSize.label,
              packageId: selectedPackage.id,
              packageLabel: selectedPackage.label
            });
          }
          if (e.target.classList.contains("add-to-wishlist")) {
            wishlistItems.push({ id, name, price: basePrice });
            updateWishlist();
            showToast(t("added_to_wishlist_toast", { name }));
          }
          if (e.target.classList.contains("remove-wishlist")) {
            wishlistItems = wishlistItems.filter(item => item.id !== id);
            updateWishlist();
            showToast(t("removed_from_wishlist_toast", { name }));
          }
          return;
        }
        openProductModal(el);
      });
    });
  }

  window.enhanceShopProductCards = function enhanceShopProductCards(root = document) {
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
    if (currentProduct) {
      addToCartAction(currentProduct.id, currentProduct.name, currentProduct.price, {
        priceOverride: currentProduct.packagePrice,
        sizeId: currentProduct.sizeId,
        sizeLabel: currentProduct.sizeLabel,
        packageId: currentProduct.packageId,
        packageLabel: currentProduct.packageLabel
      }, currentProduct.quantity || 1);
    }
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
    document.getElementById("wishlist-sidebar")?.classList.remove("open");
    document.getElementById("cart-overlay")?.classList.remove("active");
    document.getElementById("menuOverlay")?.classList.remove("active");
    document.getElementById("wishlist-overlay")?.classList.remove("active");
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
  setupToggle("wishlist-toggle", "wishlist-sidebar", "wishlist-overlay", "close-wishlist");

  // --- Newsletter ---
  const newsletterForm = document.getElementById("newsletter-form");
  if (newsletterForm) {
    const newsletterEmailInput = document.getElementById("newsletter-email");
    const newsletterKey = "newsletter_subscribers";
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
    const readSubscribers = () => JSON.parse(localStorage.getItem(newsletterKey) || "[]");
    const writeSubscribers = list => localStorage.setItem(newsletterKey, JSON.stringify(list));

    newsletterForm.addEventListener("submit", e => {
      e.preventDefault();
      const email = (newsletterEmailInput?.value || "").trim().toLowerCase();
      if (!emailPattern.test(email)) {
        newsletterStatus.textContent = t("invalid_email");
        newsletterStatus.style.color = "#ffdfe6";
        return;
      }

      const subscribers = readSubscribers();
      if (subscribers.includes(email)) {
        newsletterStatus.textContent = t("already_subscribed");
        newsletterStatus.style.color = "#ffe4c8";
        return;
      }

      subscribers.push(email);
      writeSubscribers(subscribers);
      newsletterStatus.textContent = t("subscribed_success");
      newsletterStatus.style.color = "#d6ffe7";
      newsletterForm.reset();
      showToast(t("subscribed_toast", { email }));
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

    const isProductListingPage = document.body.classList.contains("product-page");
    const disableReveal = window.matchMedia("(max-width: 760px)").matches || !("IntersectionObserver" in window);

    if (disableReveal) {
      revealTargets.forEach(el => {
        el.classList.remove("reveal");
        el.classList.add("is-visible");
        el.style.opacity = "1";
        el.style.transform = "none";
      });
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

  // --- Init ---
  updateCart();
  updateWishlist();
  buildPackageSelectors();
  initLanguageSwitcher();
  initProductHoverSwap();
  bindProductCardInteractions();
  initRevealAnimations();
  initAboutStatsCounter();
});
