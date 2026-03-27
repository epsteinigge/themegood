require("dotenv").config();

console.log("ENV CHECK", {
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  hasAdminPassword: !!process.env.ADMIN_PASSWORD,
  hasJwtSecret: !!process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV
});

console.log("SERVER STARTED");

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const sharp = require("sharp");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

const requiredEnv = ["DATABASE_URL", "ADMIN_PASSWORD", "JWT_SECRET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`${key} is missing in environment`);
    process.exit(1);
  }
}

const PRODUCT_NAME_MIN_LENGTH = 2;
const PRODUCT_NAME_MAX_LENGTH = 120;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;
const PRODUCT_IMAGE_URL_MAX_LENGTH = 500;
const PRODUCT_VARIANT_NAME_MAX_LENGTH = 100;
const PRODUCT_IMAGES_MAX_FILES = 10;
const PRODUCT_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
let cachedSchemaCapabilities = null;
const PRODUCT_PRICE_MIN = 0;
const PRODUCT_PRICE_MAX = 10000;
const STOCK_MIN = 0;
const STOCK_MAX = 100000;
const SOLD_MIN = 0;
const SOLD_MAX = 1000000;
const FREE_GIFT_MIN_QUANTITY = 1;
const FREE_GIFT_MAX_QUANTITY = 999;
const SORT_ORDER_MIN = 0;
const SORT_ORDER_MAX = 100000;
const CUSTOMER_NAME_MIN_LENGTH = 2;
const CUSTOMER_NAME_MAX_LENGTH = 120;
const PHONE_MIN_LENGTH = 8;
const PHONE_MAX_LENGTH = 15;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 500;
const NEWSLETTER_EMAIL_MAX_LENGTH = 190;
const ORDER_ITEM_NAME_MAX_LENGTH = 160;
const ORDER_ITEM_LABEL_MAX_LENGTH = 60;
const ORDER_ITEM_QUANTITY_MIN = 1;
const ORDER_ITEM_QUANTITY_MAX = 999;
const ORDER_ITEM_PRICE_MIN = 0;
const ORDER_ITEM_PRICE_MAX = 10000;
const TOTAL_AMOUNT_MIN = 0;
const TOTAL_AMOUNT_MAX = 100000;
const ALLOWED_ORDER_STATUSES = new Set(["new", "processing", "shipped", "completed", "cancelled"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);
const ALLOWED_PRODUCT_SIZES = ["small", "medium", "large"];

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRODUCT_IMAGE_MAX_BYTES,
    files: PRODUCT_IMAGES_MAX_FILES
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
    }
  }
});

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
        childSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then((client) => {
    console.log("Connected to PostgreSQL");
    client.release();
  })
  .catch((err) => {
    console.error("PostgreSQL connection failed:", err);
  });

async function ensureProductVariantPricingColumns() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_variants'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS bundle_extra_price NUMERIC(10,2) DEFAULT 0`);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure product variant pricing columns:", error);
  }
}

ensureProductVariantPricingColumns();

async function ensureProductFeaturedColumn() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0`);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure featured product columns:", error);
  }
}

ensureProductFeaturedColumn();

async function ensureProductActiveColumn() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
    `);

    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure product active column:", error);
  }
}

ensureProductActiveColumn();

async function ensureProductSortOrderColumn() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `);

    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure product sort_order column:", error);
  }
}

ensureProductSortOrderColumn();

async function ensureProductSizePriceColumns() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_price_small NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_price_medium NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_price_large NUMERIC(10,2)`);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure product size price columns:", error);
  }
}

ensureProductSizePriceColumns();

async function ensureBundleSchema() {
  try {
    const productsTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (productsTableResult.rowCount === 0) return;

    await pool.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'single'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundle_slots (
        id SERIAL PRIMARY KEY,
        bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        slot_label VARCHAR(100) NOT NULL,
        required_size VARCHAR(50) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundle_pricing_rules (
        id SERIAL PRIMARY KEY,
        bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        pricing_type TEXT NOT NULL DEFAULT 'sum',
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        cocoa_extra_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE bundle_pricing_rules
      ADD COLUMN IF NOT EXISTS cocoa_extra_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bundle_slots_product
      ON bundle_slots(bundle_product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bundle_pricing_rules_product
      ON bundle_pricing_rules(bundle_product_id)
    `);

    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure bundle schema:", error);
  }
}

ensureBundleSchema();

async function ensureProductPromotionSchema() {
  try {
    const productsTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (productsTableResult.rowCount === 0) return;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_discount_rules (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        discount_type TEXT NOT NULL DEFAULT 'none',
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        applies_to TEXT NOT NULL DEFAULT 'product',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        starts_at TIMESTAMP NULL,
        ends_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_promo_codes (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        code VARCHAR(64) NOT NULL,
        discount_type TEXT NOT NULL DEFAULT 'fixed',
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        applies_to TEXT NOT NULL DEFAULT 'product',
        min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        usage_limit INTEGER NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        starts_at TIMESTAMP NULL,
        ends_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'none'`);
    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0.00`);
    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'product'`);
    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP NULL`);
    await pool.query(`ALTER TABLE product_discount_rules ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP NULL`);

    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'fixed'`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0.00`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'product'`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS usage_limit INTEGER NULL`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP NULL`);
    await pool.query(`ALTER TABLE product_promo_codes ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP NULL`);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_discount_rules_product
      ON product_discount_rules(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_promo_codes_product
      ON product_promo_codes(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_promo_codes_code
      ON product_promo_codes(UPPER(code))
    `);

    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure product promotion schema:", error);
  }
}

ensureProductPromotionSchema();

async function ensureOrderItemBundleColumns() {
  try {
    const orderItemsTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'order_items'
      LIMIT 1
      `
    );

    if (orderItemsTableResult.rowCount === 0) return;

    await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_selections JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_breakdown JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_details JSONB`);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure order item bundle columns:", error);
  }
}

ensureOrderItemBundleColumns();

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhoneDigits(value) {
  return normalizeString(value).replace(/\D/g, "");
}

function parseMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN;
}

function parseOptionalMoney(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN;
}

function parseOptionalDateTime(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBundleSelections(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const slotId = parseInteger(row?.slot_id);
      const variantId = parseInteger(row?.variant_id);

      if (!Number.isInteger(slotId) || slotId <= 0 || !Number.isInteger(variantId) || variantId <= 0) {
        return null;
      }

      return {
        slot_id: slotId,
        variant_id: variantId
      };
    })
    .filter(Boolean);
}

function normalizeBundleBreakdown(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const label = normalizeString(row?.label);
      const size = normalizeString(row?.size);
      const price = parseMoney(row?.price ?? 0);
      const extra = parseMoney(row?.extra ?? 0);

      if (!label || !Number.isFinite(price) || price < 0 || !Number.isFinite(extra) || extra < 0) {
        return null;
      }

      return {
        label: label.slice(0, ORDER_ITEM_NAME_MAX_LENGTH),
        size: size.slice(0, ORDER_ITEM_LABEL_MAX_LENGTH),
        price,
        extra
      };
    })
    .filter(Boolean);
}

function parseInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return null;
}

function normalizeImageUrl(url) {
  const raw = normalizeString(url);
  if (!raw) return "/uploads/sample-product.webp";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/uploads/")) return raw;
  if (raw.startsWith("uploads/")) return `/${raw}`;
  if (raw.startsWith("public/uploads/")) return `/${raw.slice("public/".length)}`;
  return `/uploads/${raw.replace(/^\/+/, "").replace(/^uploads\//, "")}`;
}

function getPrimaryImage(product) {
  if (Array.isArray(product?.images) && product.images.length > 0) {
    const primaryImage = product.images.find(
      (img) => img && img.is_primary && img.image_url && String(img.image_url).trim() !== ""
    );
    if (primaryImage) return normalizeImageUrl(primaryImage.image_url);

    const firstValid = product.images.find(
      (img) => img && img.image_url && String(img.image_url).trim() !== ""
    );
    if (firstValid) return normalizeImageUrl(firstValid.image_url);
  }

  return normalizeImageUrl(product?.image_url);
}

function isValidPhone(phone) {
  return /^\+?[0-9\s-]{8,20}$/.test(phone) &&
    phone.replace(/\D/g, "").length >= PHONE_MIN_LENGTH &&
    phone.replace(/\D/g, "").length <= PHONE_MAX_LENGTH;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSizeOptions(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = [...new Set(rawValues
    .map((entry) => normalizeString(entry).toLowerCase())
    .filter((entry) => ALLOWED_PRODUCT_SIZES.includes(entry)))];

  return normalized.length > 0 ? normalized : [...ALLOWED_PRODUCT_SIZES];
}

function normalizeProductType(value) {
  const type = normalizeString(value).toLowerCase();
  return type === "bundle" ? "bundle" : "single";
}

function normalizeDiscountType(value, allowNone = true) {
  const type = normalizeString(value).toLowerCase();
  const allowed = allowNone ? ["none", "fixed", "percent"] : ["fixed", "percent"];
  return allowed.includes(type) ? type : "";
}

function normalizeDiscountAppliesTo(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["product", "bundle"].includes(normalized) ? normalized : "";
}

function isRuleCurrentlyActive(rule = {}) {
  if (!rule || rule.is_active === false) return false;

  const now = Date.now();
  const startTime = rule.starts_at ? new Date(rule.starts_at).getTime() : null;
  const endTime = rule.ends_at ? new Date(rule.ends_at).getTime() : null;

  if (Number.isFinite(startTime) && startTime > now) return false;
  if (Number.isFinite(endTime) && endTime < now) return false;
  return true;
}

function calculateDiscountAmount(subtotal, discountType, amount) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  const safeAmount = Math.max(0, Number(amount || 0));

  if (discountType === "percent") {
    return Number((safeSubtotal * (Math.min(100, safeAmount) / 100)).toFixed(2));
  }

  if (discountType === "fixed") {
    return Number(Math.min(safeSubtotal, safeAmount).toFixed(2));
  }

  return 0;
}

async function getGeneralPromoConfig(client = pool) {
  const result = await client.query(
    `
    SELECT setting_key, setting_value
    FROM site_settings
    WHERE setting_key IN ('promo_code_active', 'promo_code_value', 'promo_discount_percent')
    ORDER BY setting_key ASC
    `
  );

  const settings = Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
  const code = String(settings.promo_code_value || "").trim().toUpperCase();
  const percent = Number(settings.promo_discount_percent || 0);
  const active = String(settings.promo_code_active || "").toLowerCase() === "true";

  return {
    active: active && Boolean(code) && Number.isFinite(percent) && percent > 0,
    code,
    percent: Number.isFinite(percent) && percent > 0 ? percent : 0
  };
}

function getEffectiveBundleExtraPrice(productName, sizeName, configuredAmount) {
  const normalizedProductName = normalizeString(productName).toLowerCase();
  const normalizedSizeName = normalizeString(sizeName).toLowerCase();
  const parsedConfiguredAmount = Number(configuredAmount);

  if (Number.isFinite(parsedConfiguredAmount) && parsedConfiguredAmount > 0) {
    return parsedConfiguredAmount;
  }

  if (!normalizedProductName.includes("cocoa")) {
    return Number.isFinite(parsedConfiguredAmount) ? parsedConfiguredAmount : 0;
  }

  if (normalizedSizeName === "300g") return 17;
  if (normalizedSizeName === "800g") return 30;

  return Number.isFinite(parsedConfiguredAmount) ? parsedConfiguredAmount : 0;
}

function validateProductPayload(payload) {
  const productType = normalizeString(payload.product_type).toLowerCase() === "bundle" ? "bundle" : "single";

  const name = normalizeString(payload.name);
  const description = normalizeString(payload.description);
  const imageUrl = normalizeString(payload.image_url);

  const rawPrice = payload.price;
  const price = parseMoney(rawPrice);

  const sizePriceSmall = parseOptionalMoney(payload.size_price_small);
  const sizePriceMedium = parseOptionalMoney(payload.size_price_medium);
  const sizePriceLarge = parseOptionalMoney(payload.size_price_large);

  const stock = parseInteger(payload.stock ?? 0);
  const sold = parseInteger(payload.sold ?? 0);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const featuredOrder = parseInteger(payload.featured_order ?? 0);

  const sizeOptions = productType === "bundle"
    ? []
    : normalizeSizeOptions(payload.size_options);

  const freeGiftEnabled = normalizeBoolean(payload.free_gift_enabled ?? false);
  const isFeatured = normalizeBoolean(payload.is_featured ?? false);
  const freeGiftProductIdRaw = payload.free_gift_product_id;
  const freeGiftProductId = freeGiftProductIdRaw === "" || freeGiftProductIdRaw === null || freeGiftProductIdRaw === undefined
    ? null
    : parseInteger(freeGiftProductIdRaw);
  const freeGiftMinQuantity = parseInteger(payload.free_gift_min_quantity ?? 1);
  const freeGiftQuantity = parseInteger(payload.free_gift_quantity ?? 1);

  if (name.length < PRODUCT_NAME_MIN_LENGTH || name.length > PRODUCT_NAME_MAX_LENGTH) {
    return { error: `Product name must be ${PRODUCT_NAME_MIN_LENGTH}-${PRODUCT_NAME_MAX_LENGTH} characters long.` };
  }

  if (!Number.isFinite(price) || price < PRODUCT_PRICE_MIN || price > PRODUCT_PRICE_MAX) {
    return { error: `Product price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}.` };
  }

  if (
    sizePriceSmall !== null &&
    (!Number.isFinite(sizePriceSmall) || sizePriceSmall < PRODUCT_PRICE_MIN || sizePriceSmall > PRODUCT_PRICE_MAX)
  ) {
    return { error: `300g price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}, or left empty.` };
  }

  if (
    sizePriceMedium !== null &&
    (!Number.isFinite(sizePriceMedium) || sizePriceMedium < PRODUCT_PRICE_MIN || sizePriceMedium > PRODUCT_PRICE_MAX)
  ) {
    return { error: `600g price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}, or left empty.` };
  }

  if (
    sizePriceLarge !== null &&
    (!Number.isFinite(sizePriceLarge) || sizePriceLarge < PRODUCT_PRICE_MIN || sizePriceLarge > PRODUCT_PRICE_MAX)
  ) {
    return { error: `800g price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}, or left empty.` };
  }

  if (!Number.isInteger(stock) || stock < STOCK_MIN || stock > STOCK_MAX) {
    return { error: `Stock must be a whole number between ${STOCK_MIN} and ${STOCK_MAX}.` };
  }

  if (!Number.isInteger(sold) || sold < SOLD_MIN || sold > SOLD_MAX) {
    return { error: `Sold must be a whole number between ${SOLD_MIN} and ${SOLD_MAX}.` };
  }

  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return { error: `Product description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }

  if (imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: `Image URL must be ${PRODUCT_IMAGE_URL_MAX_LENGTH} characters or fewer.` };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (!Number.isInteger(featuredOrder) || featuredOrder < SORT_ORDER_MIN || featuredOrder > SORT_ORDER_MAX) {
    return { error: `Featured order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (freeGiftEnabled === null) {
    return { error: "Free gift enabled value is invalid." };
  }

  if (isFeatured === null) {
    return { error: "Featured product value is invalid." };
  }

  if (freeGiftEnabled) {
    if (!Number.isInteger(freeGiftProductId) || freeGiftProductId <= 0) {
      return { error: "Free gift product ID is invalid." };
    }

    if (!Number.isInteger(freeGiftMinQuantity) || freeGiftMinQuantity < FREE_GIFT_MIN_QUANTITY || freeGiftMinQuantity > FREE_GIFT_MAX_QUANTITY) {
      return { error: `Free gift minimum quantity must be between ${FREE_GIFT_MIN_QUANTITY} and ${FREE_GIFT_MAX_QUANTITY}.` };
    }

    if (!Number.isInteger(freeGiftQuantity) || freeGiftQuantity < FREE_GIFT_MIN_QUANTITY || freeGiftQuantity > FREE_GIFT_MAX_QUANTITY) {
      return { error: `Free gift quantity must be between ${FREE_GIFT_MIN_QUANTITY} and ${FREE_GIFT_MAX_QUANTITY}.` };
    }
  }

  return {
    value: {
      name,
      price,
      size_price_small: productType === "bundle" ? null : sizePriceSmall,
      size_price_medium: productType === "bundle" ? null : sizePriceMedium,
      size_price_large: productType === "bundle" ? null : sizePriceLarge,
      description,
      image_url: imageUrl,
      stock,
      sold,
      sort_order: sortOrder,
      is_featured: isFeatured,
      featured_order: featuredOrder,
      size_options: productType === "bundle" ? [] : sizeOptions,
      product_type: productType,
      free_gift_enabled: freeGiftEnabled,
      free_gift_product_id: freeGiftEnabled ? freeGiftProductId : null,
      free_gift_min_quantity: freeGiftEnabled ? freeGiftMinQuantity : 1,
      free_gift_quantity: freeGiftEnabled ? freeGiftQuantity : 1
    }
  };
}

function validateBundleSlotsPayload(value) {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: "Bundle slots must be an array." };

  const normalized = [];

  for (let i = 0; i < value.length; i += 1) {
    const slot = value[i] || {};
    const slotLabel = normalizeString(slot.slot_label);
    const requiredSize = normalizeString(slot.required_size).toLowerCase();

    if (!slotLabel) {
      return { error: `Bundle slot #${i + 1} is missing a label.` };
    }

    if (!requiredSize) {
      return { error: `Bundle slot #${i + 1} is missing a required size.` };
    }

    normalized.push({
      slot_label: slotLabel,
      required_size: requiredSize,
      sort_order: i
    });
  }

  return { value: normalized };
}

function validateBundlePricingRulePayload(value) {
  const pricingType = normalizeString(value?.pricing_type).toLowerCase() || "sum";
  const amount = parseMoney(value?.amount ?? 0);
  const cocoaExtraAmount = parseMoney(value?.cocoa_extra_amount ?? 0);

  if (!["sum", "sum_plus", "sum_minus"].includes(pricingType)) {
    return { error: "Bundle pricing type is invalid." };
  }

  if (!Number.isFinite(amount) || amount < 0 || amount > PRODUCT_PRICE_MAX) {
    return { error: `Bundle pricing amount must be between 0 and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isFinite(cocoaExtraAmount) || cocoaExtraAmount < 0 || cocoaExtraAmount > PRODUCT_PRICE_MAX) {
    return { error: `Cocoa surcharge must be between 0 and ${PRODUCT_PRICE_MAX}.` };
  }

  return {
    value: {
      pricing_type: pricingType,
      amount,
      cocoa_extra_amount: cocoaExtraAmount
    }
  };
}

function validateProductDiscountRulePayload(value) {
  const discountType = normalizeDiscountType(value?.discount_type, true) || "none";
  const amount = parseMoney(value?.amount ?? 0);
  const appliesTo = normalizeDiscountAppliesTo(value?.applies_to) || "product";
  const isActive = normalizeBoolean(value?.is_active ?? false);
  const startsAt = parseOptionalDateTime(value?.starts_at);
  const endsAt = parseOptionalDateTime(value?.ends_at);

  if (!Number.isFinite(amount) || amount < 0 || amount > PRODUCT_PRICE_MAX) {
    return { error: `Discount amount must be between 0 and ${PRODUCT_PRICE_MAX}.` };
  }

  if (isActive === null) {
    return { error: "Discount rule active value is invalid." };
  }

  if (value?.starts_at && !startsAt) {
    return { error: "Discount rule start date is invalid." };
  }

  if (value?.ends_at && !endsAt) {
    return { error: "Discount rule end date is invalid." };
  }

  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return { error: "Discount rule end date must be after the start date." };
  }

  if (discountType === "percent" && amount > 100) {
    return { error: "Percent discount cannot exceed 100." };
  }

  return {
    value: {
      discount_type: discountType,
      amount,
      applies_to: appliesTo,
      is_active: Boolean(isActive && discountType !== "none"),
      starts_at: startsAt,
      ends_at: endsAt
    }
  };
}

function validateProductPromoCodesPayload(value) {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: "Promo codes must be an array." };

  const normalized = [];

  for (let i = 0; i < value.length; i += 1) {
    const row = value[i] || {};
    const code = normalizeString(row.code).toUpperCase();
    const discountType = normalizeDiscountType(row.discount_type, false);
    const amount = parseMoney(row.amount ?? 0);
    const appliesTo = normalizeDiscountAppliesTo(row.applies_to) || "product";
    const minOrderAmount = parseMoney(row.min_order_amount ?? 0);
    const usageLimit = row.usage_limit === "" || row.usage_limit === null || row.usage_limit === undefined
      ? null
      : parseInteger(row.usage_limit);
    const usageCount = row.usage_count === "" || row.usage_count === null || row.usage_count === undefined
      ? 0
      : parseInteger(row.usage_count);
    const isActive = normalizeBoolean(row.is_active ?? true);
    const startsAt = parseOptionalDateTime(row.starts_at);
    const endsAt = parseOptionalDateTime(row.ends_at);

    if (!code || code.length > 64) {
      return { error: `Promo code #${i + 1} must be 1-64 characters long.` };
    }

    if (!discountType) {
      return { error: `Promo code #${i + 1} discount type is invalid.` };
    }

    if (!Number.isFinite(amount) || amount < 0 || amount > PRODUCT_PRICE_MAX) {
      return { error: `Promo code #${i + 1} amount must be between 0 and ${PRODUCT_PRICE_MAX}.` };
    }

    if (discountType === "percent" && amount > 100) {
      return { error: `Promo code #${i + 1} percent cannot exceed 100.` };
    }

    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > TOTAL_AMOUNT_MAX) {
      return { error: `Promo code #${i + 1} minimum order amount is invalid.` };
    }

    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      return { error: `Promo code #${i + 1} usage limit must be blank or a whole number above 0.` };
    }

    if (!Number.isInteger(usageCount) || usageCount < 0) {
      return { error: `Promo code #${i + 1} usage count is invalid.` };
    }

    if (isActive === null) {
      return { error: `Promo code #${i + 1} active value is invalid.` };
    }

    if (row.starts_at && !startsAt) {
      return { error: `Promo code #${i + 1} start date is invalid.` };
    }

    if (row.ends_at && !endsAt) {
      return { error: `Promo code #${i + 1} end date is invalid.` };
    }

    if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
      return { error: `Promo code #${i + 1} end date must be after the start date.` };
    }

    normalized.push({
      id: parseInteger(row.id),
      code,
      discount_type: discountType,
      amount,
      applies_to: appliesTo,
      min_order_amount: minOrderAmount,
      usage_limit: usageLimit,
      usage_count: usageCount,
      is_active: Boolean(isActive),
      starts_at: startsAt,
      ends_at: endsAt
    });
  }

  const seenCodes = new Set();
  for (const promo of normalized) {
    if (seenCodes.has(promo.code)) {
      return { error: `Promo code ${promo.code} is duplicated.` };
    }
    seenCodes.add(promo.code);
  }

  return { value: normalized };
}

async function getSchemaCapabilities() {
  if (cachedSchemaCapabilities) {
    return cachedSchemaCapabilities;
  }

  try {
    const [
      soldColumnResult,
      productImagesResult,
      productVariantsResult,
      variantDiscountAmountResult,
      variantImageUrlResult,
      variantPriceResult,
      variantStockResult,
      variantBundleExtraPriceResult,
      productSizeOptionsResult,
      productSizePriceSmallResult,
      productSizePriceMediumResult,
      productSizePriceLargeResult,
      productTypeColumnResult,
      bundleSlotsTableResult,
      bundlePricingRulesTableResult,
      productDiscountRulesTableResult,
      productPromoCodesTableResult,
      productPromoCodeUsageCountColumnResult,
      sortOrderColumnResult,
      freeGiftEnabledColumnResult,
      featuredColumnResult,
      featuredOrderColumnResult,
      freeGiftProductIdColumnResult,
      freeGiftMinQuantityColumnResult,
      freeGiftQuantityColumnResult,
      productGiftOptionsTableResult,
      orderDeliveryStatusColumnResult,
      orderTrackingNotesColumnResult,
      orderShippedAtColumnResult,
      orderDeliveredAtColumnResult,
      orderUpdatedAtColumnResult,
      orderItemBundleSelectionsColumnResult,
      orderItemBundleBreakdownColumnResult,
      orderItemBundleDetailsColumnResult
    ] = await Promise.all([
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'sold'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_images'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_variants'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'discount_amount'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'image_url'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'price'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'stock'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'bundle_extra_price'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size_options'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size_price_small'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size_price_medium'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size_price_large'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_type'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bundle_slots'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bundle_pricing_rules'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_discount_rules'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_promo_codes'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_promo_codes' AND column_name = 'usage_count'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'sort_order'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'free_gift_enabled'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_featured'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'featured_order'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'free_gift_product_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'free_gift_min_quantity'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'free_gift_quantity'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_gift_options'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_status'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_notes'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipped_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivered_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'bundle_selections'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'bundle_breakdown'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'bundle_details'
        LIMIT 1
        `
      )
    ]);

    cachedSchemaCapabilities = {
      hasProductSoldColumn: soldColumnResult.rowCount > 0,
      hasProductImagesTable: productImagesResult.rowCount > 0,
      hasProductVariantsTable: productVariantsResult.rowCount > 0,
      hasVariantDiscountAmountColumn: variantDiscountAmountResult.rowCount > 0,
      hasVariantImageUrlColumn: variantImageUrlResult.rowCount > 0,
      hasVariantPriceColumn: variantPriceResult.rowCount > 0,
      hasVariantStockColumn: variantStockResult.rowCount > 0,
      hasVariantBundleExtraPriceColumn: variantBundleExtraPriceResult.rowCount > 0,
      hasProductSizeOptionsColumn: productSizeOptionsResult.rowCount > 0,
      hasProductSizePriceSmallColumn: productSizePriceSmallResult.rowCount > 0,
      hasProductSizePriceMediumColumn: productSizePriceMediumResult.rowCount > 0,
      hasProductSizePriceLargeColumn: productSizePriceLargeResult.rowCount > 0,
      hasProductTypeColumn: productTypeColumnResult.rowCount > 0,
      hasBundleSlotsTable: bundleSlotsTableResult.rowCount > 0,
      hasBundlePricingRulesTable: bundlePricingRulesTableResult.rowCount > 0,
      hasProductDiscountRulesTable: productDiscountRulesTableResult.rowCount > 0,
      hasProductPromoCodesTable: productPromoCodesTableResult.rowCount > 0,
      hasProductPromoCodeUsageCountColumn: productPromoCodeUsageCountColumnResult.rowCount > 0,
      hasProductSortOrderColumn: sortOrderColumnResult.rowCount > 0,
      hasProductFreeGiftEnabledColumn: freeGiftEnabledColumnResult.rowCount > 0,
      hasProductIsFeaturedColumn: featuredColumnResult.rowCount > 0,
      hasProductFeaturedOrderColumn: featuredOrderColumnResult.rowCount > 0,
      hasProductFreeGiftProductIdColumn: freeGiftProductIdColumnResult.rowCount > 0,
      hasProductFreeGiftMinQuantityColumn: freeGiftMinQuantityColumnResult.rowCount > 0,
      hasProductFreeGiftQuantityColumn: freeGiftQuantityColumnResult.rowCount > 0,
      hasProductGiftOptionsTable: productGiftOptionsTableResult.rowCount > 0,
      hasOrderDeliveryStatusColumn: orderDeliveryStatusColumnResult.rowCount > 0,
      hasOrderTrackingNotesColumn: orderTrackingNotesColumnResult.rowCount > 0,
      hasOrderShippedAtColumn: orderShippedAtColumnResult.rowCount > 0,
      hasOrderDeliveredAtColumn: orderDeliveredAtColumnResult.rowCount > 0,
      hasOrderUpdatedAtColumn: orderUpdatedAtColumnResult.rowCount > 0,
      hasOrderItemBundleSelectionsColumn: orderItemBundleSelectionsColumnResult.rowCount > 0,
      hasOrderItemBundleBreakdownColumn: orderItemBundleBreakdownColumnResult.rowCount > 0,
      hasOrderItemBundleDetailsColumn: orderItemBundleDetailsColumnResult.rowCount > 0
    };
  } catch (err) {
    console.error("Schema capability check failed:", err);
    cachedSchemaCapabilities = {
      hasProductSoldColumn: false,
      hasProductImagesTable: false,
      hasProductVariantsTable: false,
      hasVariantDiscountAmountColumn: false,
      hasVariantImageUrlColumn: false,
      hasVariantPriceColumn: false,
      hasVariantStockColumn: false,
      hasVariantBundleExtraPriceColumn: false,
      hasProductSizeOptionsColumn: false,
      hasProductSizePriceSmallColumn: false,
      hasProductSizePriceMediumColumn: false,
      hasProductSizePriceLargeColumn: false,
      hasProductTypeColumn: false,
      hasBundleSlotsTable: false,
      hasBundlePricingRulesTable: false,
      hasProductDiscountRulesTable: false,
      hasProductPromoCodesTable: false,
      hasProductPromoCodeUsageCountColumn: false,
      hasProductSortOrderColumn: false,
      hasProductFreeGiftEnabledColumn: false,
      hasProductIsFeaturedColumn: false,
      hasProductFeaturedOrderColumn: false,
      hasProductFreeGiftProductIdColumn: false,
      hasProductFreeGiftMinQuantityColumn: false,
      hasProductFreeGiftQuantityColumn: false,
      hasProductGiftOptionsTable: false,
      hasOrderDeliveryStatusColumn: false,
      hasOrderTrackingNotesColumn: false,
      hasOrderShippedAtColumn: false,
      hasOrderDeliveredAtColumn: false,
      hasOrderUpdatedAtColumn: false,
      hasOrderItemBundleSelectionsColumn: false,
      hasOrderItemBundleBreakdownColumn: false,
      hasOrderItemBundleDetailsColumn: false
    };
  }

  return cachedSchemaCapabilities;
}

function validateProductVariantPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const variantId = parseInteger(payload.id ?? payload.variant_id);
  const productId = parseInteger(payload.product_id);
  const name = normalizeString(payload.name);
  const units = parseInteger(payload.units ?? 1);
  const discountPercent = parseMoney(payload.discount_percent ?? 0);
  const discountAmount = parseMoney(payload.discount_amount ?? 0);
  const price = parseMoney(payload.price);
  const bundleExtraPrice = parseMoney(payload.bundle_extra_price ?? 0);
  const stock = parseInteger(payload.stock ?? 0);
  const imageUrl = normalizeString(payload.image_url);
  const isActive = normalizeBoolean(payload.is_active ?? true);
  const sortOrder = parseInteger(payload.sort_order ?? 0);

  if (requireId && (!Number.isInteger(variantId) || variantId <= 0)) {
    return { error: "Variant ID is invalid." };
  }

  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Product ID is invalid." };
  }

  if (!name || name.length > PRODUCT_VARIANT_NAME_MAX_LENGTH) {
    return { error: `Variant name must be 1-${PRODUCT_VARIANT_NAME_MAX_LENGTH} characters long.` };
  }

  if (!Number.isInteger(units) || units < 1) {
    return { error: "Units must be a whole number of at least 1." };
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: "Discount percent must be between 0 and 100." };
  }

  if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > PRODUCT_PRICE_MAX) {
    return { error: `Discount amount must be between 0 and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isFinite(price) || price < PRODUCT_PRICE_MIN || price > PRODUCT_PRICE_MAX) {
    return { error: `Variant price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isFinite(bundleExtraPrice) || bundleExtraPrice < PRODUCT_PRICE_MIN || bundleExtraPrice > PRODUCT_PRICE_MAX) {
    return { error: `Bundle surcharge must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isInteger(stock) || stock < STOCK_MIN || stock > STOCK_MAX) {
    return { error: `Variant stock must be a whole number between ${STOCK_MIN} and ${STOCK_MAX}.` };
  }

  if (imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: `Variant image URL must be ${PRODUCT_IMAGE_URL_MAX_LENGTH} characters or fewer.` };
  }

  if (isActive === null) {
    return { error: "Variant active status is invalid." };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  return {
    value: {
      id: variantId,
      product_id: productId,
      name,
      units,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      price,
      bundle_extra_price: bundleExtraPrice,
      stock,
      image_url: imageUrl,
      is_active: isActive,
      sort_order: sortOrder
    }
  };
}

async function syncStandardSizeVariantPrices(productId, sizePrices = {}, client = pool) {
  const normalizedProductId = parseInteger(productId);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) return;

  const updates = [
    { price: sizePrices.small, aliases: ["300g", "small"] },
    { price: sizePrices.medium, aliases: ["600g", "medium"] },
    { price: sizePrices.large, aliases: ["800g", "large"] }
  ];

  for (const entry of updates) {
    if (!Number.isFinite(entry.price) || entry.price < 0) continue;

    await client.query(
      `
      UPDATE product_variants
      SET price = $1
      WHERE product_id = $2
        AND REGEXP_REPLACE(LOWER(COALESCE(name, '')), '\s+', '', 'g') = ANY($3::text[])
      `,
      [entry.price, normalizedProductId, entry.aliases]
    );
  }
}

async function ensureStandardSizeVariantsForBundleSizes(requiredSizes = [], schemaCapabilities = {}, client = pool) {
  const normalizedRequiredSizes = [...new Set(
    (Array.isArray(requiredSizes) ? requiredSizes : [])
      .map((size) => normalizeString(size).toLowerCase())
      .filter(Boolean)
  )];

  if (
    normalizedRequiredSizes.length === 0 ||
    !schemaCapabilities.hasProductVariantsTable ||
    !schemaCapabilities.hasVariantPriceColumn ||
    !schemaCapabilities.hasVariantStockColumn
  ) {
    return;
  }

  const configs = [
    { label: "300g", optionId: "small", priceKey: "size_price_small", aliases: ["300g", "small"], sortOrder: 0 },
    { label: "600g", optionId: "medium", priceKey: "size_price_medium", aliases: ["600g", "medium"], sortOrder: 1 },
    { label: "800g", optionId: "large", priceKey: "size_price_large", aliases: ["800g", "large"], sortOrder: 2 }
  ].filter((config) => normalizedRequiredSizes.includes(config.label));

  if (configs.length === 0) return;

  const productTypeCondition = schemaCapabilities.hasProductTypeColumn
    ? "AND COALESCE(product_type, 'single') = 'single'"
    : "";
  const sizeOptionsSelect = schemaCapabilities.hasProductSizeOptionsColumn
    ? "COALESCE(size_options, 'small,medium,large') AS size_options"
    : "'small,medium,large' AS size_options";
  const sizePriceSmallSelect = schemaCapabilities.hasProductSizePriceSmallColumn
    ? "size_price_small"
    : "NULL::numeric AS size_price_small";
  const sizePriceMediumSelect = schemaCapabilities.hasProductSizePriceMediumColumn
    ? "size_price_medium"
    : "NULL::numeric AS size_price_medium";
  const sizePriceLargeSelect = schemaCapabilities.hasProductSizePriceLargeColumn
    ? "size_price_large"
    : "NULL::numeric AS size_price_large";

  const productsResult = await client.query(
    `
    SELECT id, stock, ${sizeOptionsSelect}, ${sizePriceSmallSelect}, ${sizePriceMediumSelect}, ${sizePriceLargeSelect}
    FROM products
    WHERE COALESCE(is_active, true) = true
      ${productTypeCondition}
    ORDER BY id ASC
    `
  );

  const productIds = productsResult.rows
    .map((row) => parseInteger(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (productIds.length === 0) return;

  const existingVariantsResult = await client.query(
    `
    SELECT product_id, name
    FROM product_variants
    WHERE product_id = ANY($1::int[])
    `,
    [productIds]
  );

  const existingNamesByProductId = new Map();
  existingVariantsResult.rows.forEach((row) => {
    const productId = Number(row.product_id);
    const normalizedName = normalizeString(row.name).toLowerCase().replace(/\s+/g, "");
    if (!existingNamesByProductId.has(productId)) {
      existingNamesByProductId.set(productId, new Set());
    }
    if (normalizedName) {
      existingNamesByProductId.get(productId).add(normalizedName);
    }
  });

  for (const product of productsResult.rows) {
    const productId = Number(product.id);
    const enabledSizes = normalizeSizeOptions(product.size_options);
    const existingNames = existingNamesByProductId.get(productId) || new Set();

    for (const config of configs) {
      if (!enabledSizes.includes(config.optionId)) continue;

      const price = Number(product[config.priceKey]);
      if (!Number.isFinite(price) || price < 0) continue;

      const hasExistingVariant = config.aliases.some((alias) => existingNames.has(alias));
      if (hasExistingVariant) continue;

      const columns = ["product_id", "name", "units", "discount_percent", "is_active", "sort_order", "price", "stock"];
      const values = [productId, config.label, 1, 0, true, config.sortOrder, price, Number(product.stock || 0)];

      if (schemaCapabilities.hasVariantBundleExtraPriceColumn) {
        columns.push("bundle_extra_price");
        values.push(0);
      }

      await client.query(
        `
        INSERT INTO product_variants (${columns.join(", ")})
        VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
        `,
        values
      );

      existingNames.add(config.label.replace(/\s+/g, ""));
      existingNamesByProductId.set(productId, existingNames);
    }
  }
}

async function replaceBundleData(productId, bundleSlots, pricingRule, client) {
  await client.query(`DELETE FROM bundle_slots WHERE bundle_product_id = $1`, [productId]);
  await client.query(`DELETE FROM bundle_pricing_rules WHERE bundle_product_id = $1`, [productId]);

  for (const slot of bundleSlots) {
    await client.query(
      `
      INSERT INTO bundle_slots (bundle_product_id, slot_label, required_size, sort_order)
      VALUES ($1, $2, $3, $4)
      `,
      [productId, slot.slot_label, slot.required_size, slot.sort_order]
    );
  }

  await client.query(
    `
    INSERT INTO bundle_pricing_rules (bundle_product_id, pricing_type, amount, cocoa_extra_amount)
    VALUES ($1, $2, $3, $4)
    `,
    [productId, pricingRule.pricing_type, pricingRule.amount, pricingRule.cocoa_extra_amount ?? 0]
  );
}

async function replaceProductDiscountRule(productId, discountRule, client) {
  await client.query(`DELETE FROM product_discount_rules WHERE product_id = $1`, [productId]);

  if (!discountRule || discountRule.discount_type === "none") {
    return;
  }

  await client.query(
    `
    INSERT INTO product_discount_rules
      (product_id, discount_type, amount, applies_to, is_active, starts_at, ends_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      productId,
      discountRule.discount_type,
      discountRule.amount,
      discountRule.applies_to,
      discountRule.is_active,
      discountRule.starts_at,
      discountRule.ends_at
    ]
  );
}

async function replaceProductPromoCodes(productId, promoCodes, client, schemaCapabilities = {}) {
  await client.query(`DELETE FROM product_promo_codes WHERE product_id = $1`, [productId]);

  for (const promo of promoCodes) {
    const columns = [
      "product_id",
      "code",
      "discount_type",
      "amount",
      "applies_to",
      "min_order_amount",
      "usage_limit",
      "is_active",
      "starts_at",
      "ends_at"
    ];
    const values = [
      productId,
      promo.code,
      promo.discount_type,
      promo.amount,
      promo.applies_to,
      promo.min_order_amount,
      promo.usage_limit,
      promo.is_active,
      promo.starts_at,
      promo.ends_at
    ];

    if (schemaCapabilities.hasProductPromoCodeUsageCountColumn) {
      columns.push("usage_count");
      values.push(promo.usage_count);
    }

    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

    await client.query(
      `
      INSERT INTO product_promo_codes (${columns.join(", ")})
      VALUES (${placeholders})
      `,
      values
    );
  }
}

function validateProductGiftOptionPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const optionId = parseInteger(payload.id ?? payload.option_id);
  const productId = parseInteger(payload.product_id);
  const offerName = normalizeString(payload.offer_name || payload.name);
  const giftProductId = parseInteger(payload.gift_product_id);
  const minUnits = parseInteger(payload.min_units ?? payload.free_gift_min_quantity ?? 1);
  const giftQuantity = parseInteger(payload.gift_quantity ?? 1);
  const extraPrice = parseMoney(payload.extra_price ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);
  const sortOrder = parseInteger(payload.sort_order ?? 0);

  if (requireId && (!Number.isInteger(optionId) || optionId <= 0)) {
    return { error: "Gift option ID is invalid." };
  }

  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Product ID is invalid." };
  }

  if (!offerName || offerName.length > PRODUCT_VARIANT_NAME_MAX_LENGTH) {
    return { error: `Gift option name is required and must be ${PRODUCT_VARIANT_NAME_MAX_LENGTH} characters or fewer.` };
  }

  if (!Number.isInteger(giftProductId) || giftProductId <= 0) {
    return { error: "Gift product ID is invalid." };
  }

  if (!Number.isInteger(minUnits) || minUnits < FREE_GIFT_MIN_QUANTITY || minUnits > FREE_GIFT_MAX_QUANTITY) {
    return { error: `Minimum units must be between ${FREE_GIFT_MIN_QUANTITY} and ${FREE_GIFT_MAX_QUANTITY}.` };
  }

  if (!Number.isInteger(giftQuantity) || giftQuantity < FREE_GIFT_MIN_QUANTITY || giftQuantity > FREE_GIFT_MAX_QUANTITY) {
    return { error: `Gift quantity must be between ${FREE_GIFT_MIN_QUANTITY} and ${FREE_GIFT_MAX_QUANTITY}.` };
  }

  if (!Number.isFinite(extraPrice) || extraPrice < 0 || extraPrice > PRODUCT_PRICE_MAX) {
    return { error: `Gift extra price must be between 0 and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (isActive === null) {
    return { error: "Active status is invalid." };
  }

  return {
    value: {
      id: optionId,
      product_id: productId,
      offer_name: offerName,
      gift_product_id: giftProductId,
      min_units: minUnits,
      gift_quantity: giftQuantity,
      extra_price: extraPrice,
      is_active: isActive,
      sort_order: sortOrder
    }
  };
}

function validateGalleryPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const title = normalizeString(payload.title);
  const caption = normalizeString(payload.caption);
  const imageUrl = normalizeString(payload.image_url);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Gallery item ID is invalid." };
  }

  if (title.length > 150) {
    return { error: "Title must be 150 characters or fewer." };
  }

  if (caption.length > 1000) {
    return { error: "Caption must be 1000 characters or fewer." };
  }

  if (!imageUrl || imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: "Image URL is required and must be valid." };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (isActive === null) {
    return { error: "Active status is invalid." };
  }

  return {
    value: {
      id,
      title,
      caption,
      image_url: imageUrl,
      sort_order: sortOrder,
      is_active: isActive
    }
  };
}

function validateHomepageSlidePayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const title = normalizeString(payload.title);
  const subtitle = normalizeString(payload.subtitle);
  const imageUrl = normalizeString(payload.image_url);
  const buttonPrimaryText = normalizeString(payload.button_primary_text || "Buy Now");
  const buttonPrimaryLink = normalizeString(payload.button_primary_link || "#products");
  const buttonSecondaryText = normalizeString(payload.button_secondary_text || "Learn More");
  const buttonSecondaryLink = normalizeString(payload.button_secondary_link || "#about");
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Homepage slide ID is invalid." };
  }

  if (!imageUrl || imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: "Image URL is required and must be valid." };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (isActive === null) {
    return { error: "Active status is invalid." };
  }

  return {
    value: {
      id,
      title,
      subtitle,
      image_url: imageUrl,
      button_primary_text: buttonPrimaryText,
      button_primary_link: buttonPrimaryLink,
      button_secondary_text: buttonSecondaryText,
      button_secondary_link: buttonSecondaryLink,
      sort_order: sortOrder,
      is_active: isActive
    }
  };
}

function validateHomepageSectionPayload(payload) {
  const id = parseInteger(payload.id);
  const sectionKey = normalizeString(payload.section_key);
  const title = normalizeString(payload.title);
  const body = normalizeString(payload.body);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Homepage section ID is invalid." };
  }

  if (!sectionKey) {
    return { error: "Section key is required." };
  }

  if (isActive === null) {
    return { error: "Active status is invalid." };
  }

  return {
    value: {
      id,
      section_key: sectionKey,
      title,
      body,
      is_active: isActive
    }
  };
}

function validateTestimonialPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const quote = normalizeString(payload.quote);
  const authorName = normalizeString(payload.author_name);
  const authorRole = normalizeString(payload.author_role);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Testimonial ID is invalid." };
  }

  if (!quote) return { error: "Quote is required." };
  if (!authorName) return { error: "Author name is required." };
  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }
  if (isActive === null) return { error: "Active status is invalid." };

  return {
    value: {
      id,
      quote,
      author_name: authorName,
      author_role: authorRole,
      sort_order: sortOrder,
      is_active: isActive
    }
  };
}

function validateFaqPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const question = normalizeString(payload.question);
  const answer = normalizeString(payload.answer);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "FAQ ID is invalid." };
  }

  if (!question) return { error: "Question is required." };
  if (!answer) return { error: "Answer is required." };
  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }
  if (isActive === null) return { error: "Active status is invalid." };

  return {
    value: {
      id,
      question,
      answer,
      sort_order: sortOrder,
      is_active: isActive
    }
  };
}

function validateSiteSettingPayload(payload) {
  const settingKey = normalizeString(payload.setting_key);
  const settingValue = normalizeString(payload.setting_value);

  if (!settingKey) {
    return { error: "Setting key is required." };
  }

  return {
    value: {
      setting_key: settingKey,
      setting_value: settingValue
    }
  };
}

function validateAboutPillarPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const title = normalizeString(payload.title);
  const body = normalizeString(payload.body);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "About pillar ID is invalid." };
  }
  if (!title) return { error: "Title is required." };
  if (!body) return { error: "Body is required." };
  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }
  if (isActive === null) return { error: "Active status is invalid." };

  return {
    value: { id, title, body, sort_order: sortOrder, is_active: isActive }
  };
}

function validateAboutStatPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const id = parseInteger(payload.id);
  const statValue = normalizeString(payload.stat_value);
  const statLabel = normalizeString(payload.stat_label);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "About stat ID is invalid." };
  }
  if (!statValue) return { error: "Stat value is required." };
  if (!statLabel) return { error: "Stat label is required." };
  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }
  if (isActive === null) return { error: "Active status is invalid." };

  return {
    value: { id, stat_value: statValue, stat_label: statLabel, sort_order: sortOrder, is_active: isActive }
  };
}

function validateProductImagePayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const imageId = parseInteger(payload.id ?? payload.image_id);
  const productId = parseInteger(payload.product_id);
  const imageUrl = normalizeString(payload.image_url);
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isPrimary = normalizeBoolean(payload.is_primary ?? false);

  if (requireId && (!Number.isInteger(imageId) || imageId <= 0)) {
    return { error: "Image ID is invalid." };
  }

  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "Product ID is invalid." };
  }

  if (imageUrl && imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: `Image URL must be ${PRODUCT_IMAGE_URL_MAX_LENGTH} characters or fewer.` };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (isPrimary === null) {
    return { error: "Primary image status is invalid." };
  }

  return {
    value: {
      id: imageId,
      product_id: productId,
      image_url: imageUrl,
      sort_order: sortOrder,
      is_primary: isPrimary
    }
  };
}

function validateCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Checkout must include at least one item." };
  }

  if (items.length > 100) {
    return { error: "Too many checkout items." };
  }

  const normalizedItems = [];

  for (const item of items) {
    const productIdRaw = item?.productId;
    const productId = productIdRaw === "" || productIdRaw === null || productIdRaw === undefined
      ? null
      : parseInteger(productIdRaw);
    const name = normalizeString(item?.name);
    const quantity = parseInteger(item?.quantity ?? 1);
    const unitPrice = parseMoney(item?.price ?? 0);
    const sizeLabel = normalizeString(item?.sizeLabel);
    const packageLabel = normalizeString(item?.packageLabel);
    const bundlePromoCode = normalizeString(item?.bundlePromoCode).toUpperCase();
    const bundleSelections = normalizeBundleSelections(item?.bundleSelections);
    const bundleBreakdown = normalizeBundleBreakdown(item?.bundleBreakdown);

    if (!name || name.length > ORDER_ITEM_NAME_MAX_LENGTH) {
      return { error: "Each checkout item must include a valid product name." };
    }

    if (!Number.isInteger(quantity) || quantity < ORDER_ITEM_QUANTITY_MIN || quantity > ORDER_ITEM_QUANTITY_MAX) {
      return { error: `Each checkout item quantity must be between ${ORDER_ITEM_QUANTITY_MIN} and ${ORDER_ITEM_QUANTITY_MAX}.` };
    }

    if (!Number.isFinite(unitPrice) || unitPrice < ORDER_ITEM_PRICE_MIN || unitPrice > ORDER_ITEM_PRICE_MAX) {
      return { error: `Each checkout item price must be between ${ORDER_ITEM_PRICE_MIN} and ${ORDER_ITEM_PRICE_MAX}.` };
    }

    if (sizeLabel.length > ORDER_ITEM_LABEL_MAX_LENGTH || packageLabel.length > ORDER_ITEM_LABEL_MAX_LENGTH) {
      return { error: "Checkout item labels are too long." };
    }

    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
      return { error: "Checkout item product ID is invalid." };
    }

    if (bundlePromoCode.length > ORDER_ITEM_NAME_MAX_LENGTH) {
      return { error: "Checkout item promo code is too long." };
    }

    normalizedItems.push({
      productId,
      name,
      quantity,
      price: unitPrice,
      sizeLabel: sizeLabel || null,
      packageLabel: packageLabel || null,
      bundleSelections,
      bundleBreakdown,
      bundlePromoCode: bundlePromoCode || null
    });
  }

  return { value: normalizedItems };
}

async function validateBundleCheckoutItems(items, schemaCapabilities = {}, client = pool) {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    !schemaCapabilities.hasBundleSlotsTable
  ) {
    return { value: items };
  }

  const bundleCandidates = items.filter((item) => {
    const packageLabel = normalizeString(item?.packageLabel).toLowerCase();
    return (
      (item?.productId && Number.isInteger(Number(item.productId))) &&
      (
        packageLabel.includes("bundle") ||
        (Array.isArray(item?.bundleSelections) && item.bundleSelections.length > 0) ||
        (Array.isArray(item?.bundleBreakdown) && item.bundleBreakdown.length > 0)
      )
    );
  });

  if (bundleCandidates.length === 0) {
    return { value: items };
  }

  const productIds = [...new Set(
    bundleCandidates
      .map((item) => parseInteger(item.productId))
      .filter((productId) => Number.isInteger(productId) && productId > 0)
  )];

  if (productIds.length === 0) {
    return { error: "Please complete all bundle selections before checkout." };
  }

  const result = await client.query(
    `
    SELECT bundle_product_id, COUNT(*)::int AS slot_count
    FROM bundle_slots
    WHERE bundle_product_id = ANY($1::int[])
    GROUP BY bundle_product_id
    `,
    [productIds]
  );

  const slotCountByProductId = new Map(
    result.rows.map((row) => [Number(row.bundle_product_id), Number(row.slot_count || 0)])
  );

  for (const item of bundleCandidates) {
    const productId = parseInteger(item.productId);
    const requiredCount = slotCountByProductId.get(productId) || 0;
    const selectionCount = Array.isArray(item.bundleSelections) ? item.bundleSelections.length : 0;
    const breakdownCount = Array.isArray(item.bundleBreakdown) ? item.bundleBreakdown.length : 0;

    if (requiredCount <= 0 || selectionCount !== requiredCount || breakdownCount !== requiredCount) {
      return { error: "Please complete all bundle selections before checkout." };
    }
  }

  return { value: items };
}

function validateCheckoutPayload(payload) {
  const customerName = normalizeString(payload.customer_name);
  const phone = normalizeString(payload.phone);
  const address = normalizeString(payload.address);
  const totalAmount = parseMoney(payload.total_amount);
  const itemsResult = validateCheckoutItems(payload.items);

  if (customerName.length < CUSTOMER_NAME_MIN_LENGTH || customerName.length > CUSTOMER_NAME_MAX_LENGTH) {
    return { error: `Customer name must be ${CUSTOMER_NAME_MIN_LENGTH}-${CUSTOMER_NAME_MAX_LENGTH} characters long.` };
  }

  if (!isValidPhone(phone)) {
    return { error: "Phone number format is invalid." };
  }

  if (address.length < ADDRESS_MIN_LENGTH || address.length > ADDRESS_MAX_LENGTH) {
    return { error: `Address must be ${ADDRESS_MIN_LENGTH}-${ADDRESS_MAX_LENGTH} characters long.` };
  }

  if (!Number.isFinite(totalAmount) || totalAmount < TOTAL_AMOUNT_MIN || totalAmount > TOTAL_AMOUNT_MAX) {
    return { error: `Total amount must be between ${TOTAL_AMOUNT_MIN} and ${TOTAL_AMOUNT_MAX}.` };
  }

  if (itemsResult.error) {
    return itemsResult;
  }

  return {
    value: {
      customer_name: customerName,
      phone,
      address,
      total_amount: totalAmount,
      items: itemsResult.value
    }
  };
}

function validateOrderUpdatePayload(payload) {
  const orderId = parseInteger(payload.order_id);
  const paymentStatus = normalizeString(payload.payment_status).toLowerCase();
  const deliveryStatus = normalizeString(payload.delivery_status ?? payload.order_status).toLowerCase();

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "Order ID is invalid." };
  }

  if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) {
    return { error: "Payment status is invalid." };
  }

  if (!ALLOWED_ORDER_STATUSES.has(deliveryStatus)) {
    return { error: "Delivery status is invalid." };
  }

  return {
    value: {
      order_id: orderId,
      payment_status: paymentStatus,
      delivery_status: deliveryStatus
    }
  };
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function getOptionalAdmin(req) {
  const token = req.headers["x-admin-token"];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function isMissingRelationError(err) {
  return err?.code === "42P01";
}

async function productExists(productId) {
  const result = await pool.query(
    `
    SELECT 1
    FROM products
    WHERE id = $1
    `,
    [productId]
  );

  return result.rowCount > 0;
}

async function getStoredProductImages(productId, client = pool) {
  const result = await client.query(
    `
    SELECT id, product_id, image_url, sort_order, is_primary, created_at
    FROM product_images
    WHERE product_id = $1
    ORDER BY is_primary DESC, sort_order ASC, id ASC
    `,
    [productId]
  );

  return result.rows.map((row) => ({
    ...row,
    image_url: normalizeImageUrl(row.image_url)
  }));
}

async function getPrimaryImageUrl(productId, client = pool) {
  const imageResult = await client.query(
    `
    SELECT image_url
    FROM product_images
    WHERE product_id = $1
    ORDER BY is_primary DESC, sort_order ASC, id ASC
    LIMIT 1
    `,
    [productId]
  );

  if (imageResult.rowCount > 0) {
    return imageResult.rows[0].image_url;
  }

  const productResult = await client.query(
    `
    SELECT image_url
    FROM products
    WHERE id = $1
    `,
    [productId]
  );

  return productResult.rowCount > 0 ? (productResult.rows[0].image_url || "") : "";
}

async function syncProductPrimaryImage(productId, client = pool) {
  const imageUrl = await getPrimaryImageUrl(productId, client);
  await client.query(
    `
    UPDATE products
    SET image_url = $1
    WHERE id = $2
    `,
    [imageUrl || "", productId]
  );
}

async function ensureSinglePrimaryImage(productId, preferredImageId = null, client = pool) {
  if (preferredImageId) {
    await client.query(
      `
      UPDATE product_images
      SET is_primary = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
      WHERE product_id = $1
      `,
      [productId, preferredImageId]
    );
    await syncProductPrimaryImage(productId, client);
    return;
  }

  const result = await client.query(
    `
    SELECT id
    FROM product_images
    WHERE product_id = $1
    ORDER BY is_primary DESC, sort_order ASC, id ASC
    LIMIT 1
    `,
    [productId]
  );

  if (result.rowCount > 0) {
    await client.query(
      `
      UPDATE product_images
      SET is_primary = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
      WHERE product_id = $1
      `,
      [productId, result.rows[0].id]
    );
  }

  await syncProductPrimaryImage(productId, client);
}

async function processUploadedImage(file) {
  const filename = `${Date.now()}-${crypto.randomUUID()}.webp`;
  const outputPath = path.join(uploadDir, filename);

  await sharp(file.buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outputPath);

  return `/uploads/${filename}`;
}

async function removeUploadedFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove uploaded file:", error);
    }
  }
}

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch {
    res.status(500).json({ ok: false, db: false });
  }
});

app.post("/api/newsletter-subscribe", async (req, res) => {
  const email = normalizeString(req.body?.email).toLowerCase();

  if (!email || email.length > NEWSLETTER_EMAIL_MAX_LENGTH || !isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  try {
    await pool.query(
      `
      INSERT INTO newsletter_subscribers (email)
      VALUES ($1)
      `,
      [email]
    );

    res.json({
      success: true,
      message: "Subscribed successfully."
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "This email is already subscribed." });
    }

    if (error?.code === "42P01") {
      return res.status(503).json({
        error: "Newsletter storage is not ready. Create the newsletter_subscribers table first."
      });
    }

    console.error("Newsletter subscribe failed:", error);
    res.status(500).json({ error: "Failed to save newsletter subscription." });
  }
});

app.post("/api/admin-login", adminLoginLimiter, (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (password !== adminPassword) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = jwt.sign(
    { role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    message: "Login successful",
    token
  });
});

app.get("/api/admin-check", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin-logout", (req, res) => {
  res.json({ message: "Logged out" });
});

app.post("/api/checkout", async (req, res) => {
  console.log("NEW ORDER RECEIVED");
  console.log(req.body);

  const validation = validateCheckoutPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { customer_name, phone, address, total_amount, items } = validation.value;
  const client = await pool.connect();

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const bundleValidation = await validateBundleCheckoutItems(items, schemaCapabilities, client);
    if (bundleValidation.error) {
      return res.status(400).json({ error: bundleValidation.error });
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `
      INSERT INTO orders (customer_name, phone, address, total_amount)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [customer_name, phone, address, total_amount]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      const bundleDetails = item.bundleBreakdown && item.bundleBreakdown.length
        ? item.bundleBreakdown
        : (item.bundleSelections && item.bundleSelections.length ? item.bundleSelections : null);

      if (schemaCapabilities.hasOrderItemBundleDetailsColumn) {
        await client.query(
          `
          INSERT INTO order_items
          (order_id, product_name, quantity, unit_price, size_label, package_label, bundle_details)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            orderId,
            item.name,
            item.quantity,
            item.price,
            item.sizeLabel,
            item.packageLabel,
            bundleDetails ? JSON.stringify(bundleDetails) : null
          ]
        );
      } else {
        const columns = ["order_id", "product_name", "quantity", "unit_price", "size_label", "package_label"];
        const values = [
          orderId,
          item.name,
          item.quantity,
          item.price,
          item.sizeLabel,
          item.packageLabel
        ];

        if (schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
          columns.push("bundle_selections");
          values.push(JSON.stringify(item.bundleSelections || []));
        }

        if (schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
          columns.push("bundle_breakdown");
          values.push(JSON.stringify(item.bundleBreakdown || []));
        }

        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

        await client.query(
          `
          INSERT INTO order_items
          (${columns.join(", ")})
          VALUES (${placeholders})
          `,
          values
        );
      }

      if (
        schemaCapabilities.hasProductPromoCodesTable &&
        schemaCapabilities.hasProductPromoCodeUsageCountColumn &&
        item.bundleSelections &&
        item.bundleSelections.length > 0 &&
        item.productId &&
        item.bundlePromoCode
      ) {
        await client.query(
          `
          UPDATE product_promo_codes
          SET usage_count = COALESCE(usage_count, 0) + $1
          WHERE product_id = $2
            AND UPPER(code) = $3
            AND applies_to = 'bundle'
          `,
          [Math.max(1, Number(item.quantity || 1)), item.productId, item.bundlePromoCode]
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      message: "Order received successfully",
      orderId
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Checkout failed:", err);
    res.status(500).json({ error: "Failed to save order" });
  } finally {
    client.release();
  }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const deliveryStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status"
      : "order_status AS delivery_status";
    const orderStatusAliasSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status AS order_status"
      : "order_status";
    const trackingNotesSelect = schemaCapabilities.hasOrderTrackingNotesColumn
      ? "tracking_notes"
      : "NULL::text AS tracking_notes";
    const shippedAtSelect = schemaCapabilities.hasOrderShippedAtColumn
      ? "shipped_at"
      : "NULL::timestamp AS shipped_at";
    const deliveredAtSelect = schemaCapabilities.hasOrderDeliveredAtColumn
      ? "delivered_at"
      : "NULL::timestamp AS delivered_at";
    const updatedAtSelect = schemaCapabilities.hasOrderUpdatedAtColumn
      ? "updated_at"
      : "created_at AS updated_at";

    const result = await pool.query(
      `
      SELECT
        id,
        customer_name,
        phone,
        address,
        total_amount,
        payment_status,
        ${deliveryStatusSelect},
        ${orderStatusAliasSelect},
        ${trackingNotesSelect},
        ${shippedAtSelect},
        ${deliveredAtSelect},
        ${updatedAtSelect},
        created_at
      FROM orders
      ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch orders failed:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/api/order-items/:id", requireAdmin, async (req, res) => {
  const orderId = parseInteger(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: "Order ID is invalid." });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const bundleDetailsExpressions = [];
    if (schemaCapabilities.hasOrderItemBundleDetailsColumn) {
      bundleDetailsExpressions.push("bundle_details");
    }
    if (schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
      bundleDetailsExpressions.push("bundle_breakdown");
    }
    if (schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
      bundleDetailsExpressions.push("bundle_selections");
    }

    const extraSelects = [];
    if (bundleDetailsExpressions.length > 0) {
      extraSelects.push(`COALESCE(${bundleDetailsExpressions.join(", ")}, '[]'::jsonb) AS bundle_details`);
    } else {
      extraSelects.push(`'[]'::jsonb AS bundle_details`);
    }
    if (!schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
      extraSelects.push(`'[]'::jsonb AS bundle_selections`);
    }
    if (!schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
      extraSelects.push(`'[]'::jsonb AS bundle_breakdown`);
    }
    const extraProjection = extraSelects.length ? `, ${extraSelects.join(", ")}` : "";
    const result = await pool.query(
      `
      SELECT *${extraProjection}
      FROM order_items
      WHERE order_id = $1
      `,
      [orderId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch items failed:", err);
    res.status(500).json({ error: "Failed to fetch order items" });
  }
});

app.post("/api/update-order", requireAdmin, async (req, res) => {
  const validation = validateOrderUpdatePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { order_id, payment_status, delivery_status } = validation.value;

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const statusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
    await pool.query(
      `
      UPDATE orders
      SET payment_status = $1, ${statusColumn} = $2
      WHERE id = $3
      `,
      [payment_status, delivery_status, order_id]
    );

    res.json({ message: "Order updated successfully" });
  } catch (err) {
    console.error("Update order failed:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

app.get("/api/track-order", async (req, res) => {
  try {
    const { orderId: orderIdRaw, phone: phoneRaw } = req.query;
    const orderId = parseInteger(orderIdRaw);
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const schemaCapabilities = await getSchemaCapabilities();

    if (!orderIdRaw || !phoneRaw) {
      return res.status(400).json({
        error: "Order ID and phone number are required."
      });
    }

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: "Order ID is invalid." });
    }

    if (!phoneDigits || phoneDigits.length < 8) {
      return res.status(400).json({ error: "Phone number is required to track an order." });
    }

    const deliveryStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status"
      : "order_status AS delivery_status";
    const orderStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status AS order_status"
      : "order_status";
    const trackingNotesSelect = schemaCapabilities.hasOrderTrackingNotesColumn
      ? "tracking_notes"
      : "NULL::text AS tracking_notes";
    const shippedAtSelect = schemaCapabilities.hasOrderShippedAtColumn
      ? "shipped_at"
      : "NULL::timestamp AS shipped_at";
    const deliveredAtSelect = schemaCapabilities.hasOrderDeliveredAtColumn
      ? "delivered_at"
      : "NULL::timestamp AS delivered_at";
    const updatedAtSelect = schemaCapabilities.hasOrderUpdatedAtColumn
      ? "updated_at"
      : "created_at AS updated_at";

    const orderResult = await pool.query(
      `
      SELECT
        id,
        customer_name,
        phone,
        address,
        total_amount,
        payment_status,
        ${deliveryStatusSelect},
        ${orderStatusSelect},
        ${trackingNotesSelect},
        ${shippedAtSelect},
        ${deliveredAtSelect},
        ${updatedAtSelect},
        created_at
      FROM orders
      WHERE id = $1
      `,
      [orderId]
    );

    const order = orderResult.rows[0];

    if (!order || normalizePhoneDigits(order.phone) !== phoneDigits) {
      return res.status(404).json({ error: "Order not found. Please check your order ID and phone number." });
    }

    const bundleDetailsExpressions = [];
    if (schemaCapabilities.hasOrderItemBundleDetailsColumn) {
      bundleDetailsExpressions.push("bundle_details");
    }
    if (schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
      bundleDetailsExpressions.push("bundle_breakdown");
    }
    if (schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
      bundleDetailsExpressions.push("bundle_selections");
    }

    const trackOrderExtraSelects = [];
    if (bundleDetailsExpressions.length > 0) {
      trackOrderExtraSelects.push(`COALESCE(${bundleDetailsExpressions.join(", ")}, '[]'::jsonb) AS bundle_details`);
    } else {
      trackOrderExtraSelects.push(`'[]'::jsonb AS bundle_details`);
    }
    if (schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
      trackOrderExtraSelects.push("bundle_selections");
    } else {
      trackOrderExtraSelects.push(`'[]'::jsonb AS bundle_selections`);
    }
    if (schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
      trackOrderExtraSelects.push("bundle_breakdown");
    } else {
      trackOrderExtraSelects.push(`'[]'::jsonb AS bundle_breakdown`);
    }
    const itemsResult = await pool.query(
      `
      SELECT product_name, quantity, unit_price, size_label, package_label, ${trackOrderExtraSelects.join(", ")}
      FROM order_items
      WHERE order_id = $1
      ORDER BY id ASC
      `,
      [orderId]
    );

    res.json({
      success: true,
      order: {
        ...order,
        customer_name: order.customer_name,
        phone: order.phone,
        customerName: order.customer_name,
        totalAmount: order.total_amount,
        paymentStatus: order.payment_status,
        deliveryStatus: order.delivery_status || order.order_status,
        trackingNotes: order.tracking_notes,
        shippedAt: order.shipped_at,
        deliveredAt: order.delivered_at,
        updatedAt: order.updated_at,
        createdAt: order.created_at,
        items: itemsResult.rows
      },
      items: itemsResult.rows
    });
  } catch (err) {
    console.error("Track order failed:", err);
    res.status(500).json({ error: "Failed to track order." });
  }
});

app.put("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = parseInteger(req.params.id);
    const schemaCapabilities = await getSchemaCapabilities();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Order ID is invalid." });
    }

    const paymentStatusRaw = req.body.payment_status;
    const deliveryStatusRaw = req.body.delivery_status;
    const trackingNotes = normalizeString(req.body.tracking_notes);
    const shippedAt = normalizeString(req.body.shipped_at);
    const deliveredAt = normalizeString(req.body.delivered_at);

    const updates = [];
    const values = [];

    if (paymentStatusRaw !== undefined) {
      const paymentStatus = normalizeString(paymentStatusRaw).toLowerCase();
      if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) {
        return res.status(400).json({ error: "Payment status is invalid." });
      }
      values.push(paymentStatus);
      updates.push(`payment_status = $${values.length}`);
    }

    if (deliveryStatusRaw !== undefined) {
      const deliveryStatus = normalizeString(deliveryStatusRaw).toLowerCase();
      if (!ALLOWED_ORDER_STATUSES.has(deliveryStatus)) {
        return res.status(400).json({ error: "Delivery status is invalid." });
      }

      if (schemaCapabilities.hasOrderDeliveryStatusColumn) {
        values.push(deliveryStatus);
        updates.push(`delivery_status = $${values.length}`);
      } else {
        values.push(deliveryStatus);
        updates.push(`order_status = $${values.length}`);
      }
    }

    if (schemaCapabilities.hasOrderTrackingNotesColumn && req.body.tracking_notes !== undefined) {
      values.push(trackingNotes || null);
      updates.push(`tracking_notes = $${values.length}`);
    }

    if (schemaCapabilities.hasOrderShippedAtColumn && req.body.shipped_at !== undefined) {
      values.push(shippedAt || null);
      updates.push(`shipped_at = $${values.length}`);
    }

    if (schemaCapabilities.hasOrderDeliveredAtColumn && req.body.delivered_at !== undefined) {
      values.push(deliveredAt || null);
      updates.push(`delivered_at = $${values.length}`);
    }

    if (schemaCapabilities.hasOrderUpdatedAtColumn) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid order status fields were provided." });
    }

    const deliveryStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status"
      : "order_status AS delivery_status";
    const orderStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "delivery_status AS order_status"
      : "order_status";
    const trackingNotesSelect = schemaCapabilities.hasOrderTrackingNotesColumn
      ? "tracking_notes"
      : "NULL::text AS tracking_notes";
    const shippedAtSelect = schemaCapabilities.hasOrderShippedAtColumn
      ? "shipped_at"
      : "NULL::timestamp AS shipped_at";
    const deliveredAtSelect = schemaCapabilities.hasOrderDeliveredAtColumn
      ? "delivered_at"
      : "NULL::timestamp AS delivered_at";
    const updatedAtSelect = schemaCapabilities.hasOrderUpdatedAtColumn
      ? "updated_at"
      : "created_at AS updated_at";

    values.push(id);
    const result = await pool.query(
      `
      UPDATE orders
      SET ${updates.join(", ")}
      WHERE id = $${values.length}
      RETURNING
        *,
        ${deliveryStatusSelect},
        ${orderStatusSelect},
        ${trackingNotesSelect},
        ${shippedAtSelect},
        ${deliveredAtSelect},
        ${updatedAtSelect}
      `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }

    res.json({
      success: true,
      message: "Order status updated successfully.",
      order: result.rows[0]
    });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ error: "Failed to update order status." });
  }
});

app.get("/api/gallery", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, title, caption, image_url, sort_order, is_active, created_at
      FROM gallery_items
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch gallery failed:", err);
    res.status(500).json({ error: "Failed to fetch gallery items" });
  }
});

app.get("/api/admin/gallery", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, title, caption, image_url, sort_order, is_active, created_at
      FROM gallery_items
      ORDER BY sort_order ASC, id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch admin gallery failed:", err);
    res.status(500).json({ error: "Failed to fetch gallery items" });
  }
});

app.post("/api/add-gallery-item", requireAdmin, async (req, res) => {
  const validation = validateGalleryPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { title, caption, image_url, sort_order, is_active } = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO gallery_items (title, caption, image_url, sort_order, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [title, caption, image_url, sort_order, is_active]
    );

    res.json({
      message: "Gallery item added",
      id: result.rows[0].id
    });
  } catch (err) {
    console.error("Add gallery item failed:", err);
    res.status(500).json({ error: "Failed to add gallery item" });
  }
});

app.post("/api/update-gallery-item", requireAdmin, async (req, res) => {
  const validation = validateGalleryPayload(req.body, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { id, title, caption, image_url, sort_order, is_active } = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE gallery_items
      SET title = $1,
          caption = $2,
          image_url = $3,
          sort_order = $4,
          is_active = $5
      WHERE id = $6
      `,
      [title, caption, image_url, sort_order, is_active, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Gallery item not found." });
    }

    res.json({ message: "Gallery item updated" });
  } catch (err) {
    console.error("Update gallery item failed:", err);
    res.status(500).json({ error: "Failed to update gallery item" });
  }
});

app.post("/api/delete-gallery-item", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Gallery item ID is invalid." });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM gallery_items
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Gallery item not found." });
    }

    res.json({ message: "Gallery item deleted" });
  } catch (err) {
    console.error("Delete gallery item failed:", err);
    res.status(500).json({ error: "Failed to delete gallery item" });
  }
});

app.get("/api/homepage", async (req, res) => {
  try {
    const slides = await pool.query(`
      SELECT *
      FROM homepage_slides
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);

    const sections = await pool.query(`
      SELECT *
      FROM homepage_sections
      WHERE is_active = TRUE
    `);

    res.json({
      slides: slides.rows || [],
      sections: sections.rows || []
    });
  } catch (err) {
    console.error("Fetch homepage failed:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.get("/api/admin/homepage", requireAdmin, async (req, res) => {
  try {
    const [slidesResult, sectionsResult] = await Promise.all([
      pool.query(`
        SELECT *
        FROM homepage_slides
        ORDER BY sort_order ASC, id ASC
      `),
      pool.query(`
        SELECT *
        FROM homepage_sections
        ORDER BY id ASC
      `)
    ]);

    res.json({
      slides: slidesResult.rows,
      sections: sectionsResult.rows
    });
  } catch (err) {
    console.error("Fetch admin homepage failed:", err);
    res.status(500).json({ error: "Failed to fetch homepage content" });
  }
});

app.post("/api/add-homepage-slide", requireAdmin, async (req, res) => {
  const validation = validateHomepageSlidePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const slide = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO homepage_slides (
        title, subtitle, image_url,
        button_primary_text, button_primary_link,
        button_secondary_text, button_secondary_link,
        sort_order, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
      `,
      [
        slide.title,
        slide.subtitle,
        slide.image_url,
        slide.button_primary_text,
        slide.button_primary_link,
        slide.button_secondary_text,
        slide.button_secondary_link,
        slide.sort_order,
        slide.is_active
      ]
    );

    res.json({ message: "Homepage slide added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add homepage slide failed:", err);
    res.status(500).json({ error: "Failed to add homepage slide" });
  }
});

app.post("/api/update-homepage-slide", requireAdmin, async (req, res) => {
  const validation = validateHomepageSlidePayload(req.body, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const slide = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE homepage_slides
      SET title = $1,
          subtitle = $2,
          image_url = $3,
          button_primary_text = $4,
          button_primary_link = $5,
          button_secondary_text = $6,
          button_secondary_link = $7,
          sort_order = $8,
          is_active = $9
      WHERE id = $10
      `,
      [
        slide.title,
        slide.subtitle,
        slide.image_url,
        slide.button_primary_text,
        slide.button_primary_link,
        slide.button_secondary_text,
        slide.button_secondary_link,
        slide.sort_order,
        slide.is_active,
        slide.id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Homepage slide not found." });
    }

    res.json({ message: "Homepage slide updated" });
  } catch (err) {
    console.error("Update homepage slide failed:", err);
    res.status(500).json({ error: "Failed to update homepage slide" });
  }
});

app.post("/api/delete-homepage-slide", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Homepage slide ID is invalid." });
  }

  try {
    const result = await pool.query(
      `DELETE FROM homepage_slides WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Homepage slide not found." });
    }

    res.json({ message: "Homepage slide deleted" });
  } catch (err) {
    console.error("Delete homepage slide failed:", err);
    res.status(500).json({ error: "Failed to delete homepage slide" });
  }
});

app.post("/api/update-homepage-section", requireAdmin, async (req, res) => {
  const validation = validateHomepageSectionPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const section = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE homepage_sections
      SET title = $1,
          body = $2,
          is_active = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND section_key = $5
      `,
      [section.title, section.body, section.is_active, section.id, section.section_key]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Homepage section not found." });
    }

    res.json({ message: "Homepage section updated" });
  } catch (err) {
    console.error("Update homepage section failed:", err);
    res.status(500).json({ error: "Failed to update homepage section" });
  }
});

app.get("/api/site-content", async (req, res) => {
  try {
    const [testimonialsResult, faqResult, settingsResult] = await Promise.all([
      pool.query(`
        SELECT *
        FROM testimonials
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
      `),
      pool.query(`
        SELECT *
        FROM faq_items
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
      `),
      pool.query(`
        SELECT setting_key, setting_value
        FROM site_settings
        ORDER BY setting_key ASC
      `)
    ]);

    res.json({
      testimonials: testimonialsResult.rows,
      faq_items: faqResult.rows,
      settings: settingsResult.rows
    });
  } catch (err) {
    console.error("Fetch site content failed:", err);
    res.status(500).json({ error: "Failed to fetch site content" });
  }
});

app.get("/api/promo-settings", async (req, res) => {
  try {
    const promoConfig = await getGeneralPromoConfig();
    res.json(promoConfig);
  } catch (err) {
    console.error("Fetch promo settings failed:", err);
    res.status(500).json({ error: "Failed to fetch promo settings" });
  }
});

app.get("/api/admin/site-content", requireAdmin, async (req, res) => {
  try {
    const [testimonialsResult, faqResult, settingsResult] = await Promise.all([
      pool.query(`SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT * FROM faq_items ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT setting_key, setting_value FROM site_settings ORDER BY setting_key ASC`)
    ]);

    res.json({
      testimonials: testimonialsResult.rows,
      faq_items: faqResult.rows,
      settings: settingsResult.rows
    });
  } catch (err) {
    console.error("Fetch admin site content failed:", err);
    res.status(500).json({ error: "Failed to fetch site content" });
  }
});

app.post("/api/add-testimonial", requireAdmin, async (req, res) => {
  const validation = validateTestimonialPayload(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO testimonials (quote, author_name, author_role, sort_order, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [item.quote, item.author_name, item.author_role, item.sort_order, item.is_active]
    );

    res.json({ message: "Testimonial added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add testimonial failed:", err);
    res.status(500).json({ error: "Failed to add testimonial" });
  }
});

app.post("/api/update-testimonial", requireAdmin, async (req, res) => {
  const validation = validateTestimonialPayload(req.body, { requireId: true });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE testimonials
      SET quote = $1,
          author_name = $2,
          author_role = $3,
          sort_order = $4,
          is_active = $5
      WHERE id = $6
      `,
      [item.quote, item.author_name, item.author_role, item.sort_order, item.is_active, item.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Testimonial not found." });
    }

    res.json({ message: "Testimonial updated" });
  } catch (err) {
    console.error("Update testimonial failed:", err);
    res.status(500).json({ error: "Failed to update testimonial" });
  }
});

app.post("/api/delete-testimonial", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Testimonial ID is invalid." });
  }

  try {
    const result = await pool.query(`DELETE FROM testimonials WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Testimonial not found." });
    }

    res.json({ message: "Testimonial deleted" });
  } catch (err) {
    console.error("Delete testimonial failed:", err);
    res.status(500).json({ error: "Failed to delete testimonial" });
  }
});

app.post("/api/add-faq-item", requireAdmin, async (req, res) => {
  const validation = validateFaqPayload(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO faq_items (question, answer, sort_order, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [item.question, item.answer, item.sort_order, item.is_active]
    );

    res.json({ message: "FAQ item added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add FAQ item failed:", err);
    res.status(500).json({ error: "Failed to add FAQ item" });
  }
});

app.post("/api/update-faq-item", requireAdmin, async (req, res) => {
  const validation = validateFaqPayload(req.body, { requireId: true });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE faq_items
      SET question = $1,
          answer = $2,
          sort_order = $3,
          is_active = $4
      WHERE id = $5
      `,
      [item.question, item.answer, item.sort_order, item.is_active, item.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "FAQ item not found." });
    }

    res.json({ message: "FAQ item updated" });
  } catch (err) {
    console.error("Update FAQ item failed:", err);
    res.status(500).json({ error: "Failed to update FAQ item" });
  }
});

app.post("/api/delete-faq-item", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "FAQ item ID is invalid." });
  }

  try {
    const result = await pool.query(`DELETE FROM faq_items WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "FAQ item not found." });
    }

    res.json({ message: "FAQ item deleted" });
  } catch (err) {
    console.error("Delete FAQ item failed:", err);
    res.status(500).json({ error: "Failed to delete FAQ item" });
  }
});

app.post("/api/update-site-setting", requireAdmin, async (req, res) => {
  const validation = validateSiteSettingPayload(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    await pool.query(
      `
      INSERT INTO site_settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = CURRENT_TIMESTAMP
      `,
      [item.setting_key, item.setting_value]
    );

    res.json({ message: "Site setting updated" });
  } catch (err) {
    console.error("Update site setting failed:", err);
    res.status(500).json({ error: "Failed to update site setting" });
  }
});

app.get("/api/about-content", async (req, res) => {
  try {
    const [pillarsResult, statsResult] = await Promise.all([
      pool.query(`
        SELECT *
        FROM about_pillars
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
      `),
      pool.query(`
        SELECT *
        FROM about_stats
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
      `)
    ]);

    res.json({
      pillars: pillarsResult.rows,
      stats: statsResult.rows
    });
  } catch (err) {
    console.error("Fetch about content failed:", err);
    res.status(500).json({ error: "Failed to fetch about content" });
  }
});

app.get("/api/admin/about-content", requireAdmin, async (req, res) => {
  try {
    const [pillarsResult, statsResult] = await Promise.all([
      pool.query(`SELECT * FROM about_pillars ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT * FROM about_stats ORDER BY sort_order ASC, id ASC`)
    ]);

    res.json({
      pillars: pillarsResult.rows,
      stats: statsResult.rows
    });
  } catch (err) {
    console.error("Fetch admin about content failed:", err);
    res.status(500).json({ error: "Failed to fetch about content" });
  }
});

app.post("/api/add-about-pillar", requireAdmin, async (req, res) => {
  const validation = validateAboutPillarPayload(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO about_pillars (title, body, sort_order, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [item.title, item.body, item.sort_order, item.is_active]
    );

    res.json({ message: "About pillar added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add about pillar failed:", err);
    res.status(500).json({ error: "Failed to add about pillar" });
  }
});

app.post("/api/update-about-pillar", requireAdmin, async (req, res) => {
  const validation = validateAboutPillarPayload(req.body, { requireId: true });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE about_pillars
      SET title = $1, body = $2, sort_order = $3, is_active = $4
      WHERE id = $5
      `,
      [item.title, item.body, item.sort_order, item.is_active, item.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "About pillar not found." });
    }

    res.json({ message: "About pillar updated" });
  } catch (err) {
    console.error("Update about pillar failed:", err);
    res.status(500).json({ error: "Failed to update about pillar" });
  }
});

app.post("/api/delete-about-pillar", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "About pillar ID is invalid." });
  }

  try {
    const result = await pool.query(`DELETE FROM about_pillars WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "About pillar not found." });
    }

    res.json({ message: "About pillar deleted" });
  } catch (err) {
    console.error("Delete about pillar failed:", err);
    res.status(500).json({ error: "Failed to delete about pillar" });
  }
});

app.post("/api/add-about-stat", requireAdmin, async (req, res) => {
  const validation = validateAboutStatPayload(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      INSERT INTO about_stats (stat_value, stat_label, sort_order, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [item.stat_value, item.stat_label, item.sort_order, item.is_active]
    );

    res.json({ message: "About stat added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add about stat failed:", err);
    res.status(500).json({ error: "Failed to add about stat" });
  }
});

app.post("/api/update-about-stat", requireAdmin, async (req, res) => {
  const validation = validateAboutStatPayload(req.body, { requireId: true });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const item = validation.value;

  try {
    const result = await pool.query(
      `
      UPDATE about_stats
      SET stat_value = $1, stat_label = $2, sort_order = $3, is_active = $4
      WHERE id = $5
      `,
      [item.stat_value, item.stat_label, item.sort_order, item.is_active, item.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "About stat not found." });
    }

    res.json({ message: "About stat updated" });
  } catch (err) {
    console.error("Update about stat failed:", err);
    res.status(500).json({ error: "Failed to update about stat" });
  }
});

app.post("/api/delete-about-stat", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "About stat ID is invalid." });
  }

  try {
    const result = await pool.query(`DELETE FROM about_stats WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "About stat not found." });
    }

    res.json({ message: "About stat deleted" });
  } catch (err) {
    console.error("Delete about stat failed:", err);
    res.status(500).json({ error: "Failed to delete about stat" });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const productTypeSelect = schemaCapabilities.hasProductTypeColumn
      ? "COALESCE(product_type, 'single') AS product_type"
      : "'single' AS product_type";
    const soldSelect = schemaCapabilities.hasProductSoldColumn
      ? "COALESCE(sold, 0) AS sold"
      : "0 AS sold";
    const sortOrderSelect = schemaCapabilities.hasProductSortOrderColumn
      ? "COALESCE(sort_order, 0) AS sort_order"
      : "0 AS sort_order";
    const sizeOptionsSelect = schemaCapabilities.hasProductSizeOptionsColumn
      ? "COALESCE(size_options, 'small,medium,large') AS size_options"
      : "'small,medium,large' AS size_options";
    const sizePriceSmallSelect = schemaCapabilities.hasProductSizePriceSmallColumn
      ? "size_price_small"
      : "NULL::numeric AS size_price_small";
    const sizePriceMediumSelect = schemaCapabilities.hasProductSizePriceMediumColumn
      ? "size_price_medium"
      : "NULL::numeric AS size_price_medium";
    const sizePriceLargeSelect = schemaCapabilities.hasProductSizePriceLargeColumn
      ? "size_price_large"
      : "NULL::numeric AS size_price_large";
    const freeGiftEnabledSelect = schemaCapabilities.hasProductFreeGiftEnabledColumn
      ? "COALESCE(free_gift_enabled, false) AS free_gift_enabled"
      : "false AS free_gift_enabled";
    const isFeaturedSelect = schemaCapabilities.hasProductIsFeaturedColumn
      ? "COALESCE(is_featured, false) AS is_featured"
      : "false AS is_featured";
    const featuredOrderSelect = schemaCapabilities.hasProductFeaturedOrderColumn
      ? "COALESCE(featured_order, 0) AS featured_order"
      : "0 AS featured_order";
    const freeGiftProductIdSelect = schemaCapabilities.hasProductFreeGiftProductIdColumn
      ? "free_gift_product_id"
      : "NULL::integer AS free_gift_product_id";
    const freeGiftMinQuantitySelect = schemaCapabilities.hasProductFreeGiftMinQuantityColumn
      ? "COALESCE(free_gift_min_quantity, 1) AS free_gift_min_quantity"
      : "1 AS free_gift_min_quantity";
    const freeGiftQuantitySelect = schemaCapabilities.hasProductFreeGiftQuantityColumn
      ? "COALESCE(free_gift_quantity, 1) AS free_gift_quantity"
      : "1 AS free_gift_quantity";
    const bundleSlotCountSelect = schemaCapabilities.hasBundleSlotsTable
      ? `(SELECT COUNT(*)::int FROM bundle_slots bs WHERE bs.bundle_product_id = products.id) AS bundle_slot_count`
      : "0 AS bundle_slot_count";

    const result = await pool.query(
      `
      SELECT id, name, price, description, image_url, stock, COALESCE(is_active, true) AS is_active, ${productTypeSelect}, ${soldSelect}, ${sortOrderSelect}, ${isFeaturedSelect}, ${featuredOrderSelect}, ${sizeOptionsSelect},
             ${sizePriceSmallSelect}, ${sizePriceMediumSelect}, ${sizePriceLargeSelect},
             ${freeGiftEnabledSelect}, ${freeGiftProductIdSelect}, ${freeGiftMinQuantitySelect}, ${freeGiftQuantitySelect},
             ${bundleSlotCountSelect}
      FROM products
      ORDER BY ${schemaCapabilities.hasProductSortOrderColumn ? "sort_order ASC, id DESC" : "id DESC"}
      `
    );
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const imagesByProductId = {};

    if (schemaCapabilities.hasProductImagesTable && rows.length > 0) {
      const productIds = rows
        .map((row) => parseInteger(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (productIds.length > 0) {
        const imageResult = await pool.query(
          `
          SELECT id, product_id, image_url, sort_order, is_primary, created_at
          FROM product_images
          WHERE product_id = ANY($1::int[])
          ORDER BY product_id ASC, is_primary DESC, sort_order ASC, id ASC
          `,
          [productIds]
        );

        imageResult.rows.forEach((image) => {
          const key = String(image.product_id);
          if (!imagesByProductId[key]) {
            imagesByProductId[key] = [];
          }
          imagesByProductId[key].push({
            ...image,
            image_url: normalizeImageUrl(image.image_url)
          });
        });
      }
    }

    const products = rows.map((product) => ({
      ...product,
      images: Array.isArray(imagesByProductId[String(product.id)])
        ? imagesByProductId[String(product.id)].map((img) => ({
          ...img,
          image_url: normalizeImageUrl(img.image_url)
        }))
        : []
    }));

    res.json(
      products.map((product) => ({
        ...product,
        image_url: normalizeImageUrl(product.image_url),
        primary_image: getPrimaryImage(product),
        images: Array.isArray(product.images)
          ? product.images.map((img) => ({
            ...img,
            image_url: normalizeImageUrl(img.image_url)
          }))
          : []
      }))
    );
  } catch (err) {
    console.error("Fetch products failed:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/admin/products/:id/full", requireAdmin, async (req, res) => {
  const productId = parseInteger(req.params.id ?? req.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid." });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const productTypeSelect = schemaCapabilities.hasProductTypeColumn
      ? "COALESCE(product_type, 'single') AS product_type"
      : "'single' AS product_type";
    const soldSelect = schemaCapabilities.hasProductSoldColumn
      ? "COALESCE(sold, 0) AS sold"
      : "0 AS sold";
    const sortOrderSelect = schemaCapabilities.hasProductSortOrderColumn
      ? "COALESCE(sort_order, 0) AS sort_order"
      : "0 AS sort_order";
    const sizeOptionsSelect = schemaCapabilities.hasProductSizeOptionsColumn
      ? "COALESCE(size_options, 'small,medium,large') AS size_options"
      : "'small,medium,large' AS size_options";
    const sizePriceSmallSelect = schemaCapabilities.hasProductSizePriceSmallColumn
      ? "size_price_small"
      : "NULL::numeric AS size_price_small";
    const sizePriceMediumSelect = schemaCapabilities.hasProductSizePriceMediumColumn
      ? "size_price_medium"
      : "NULL::numeric AS size_price_medium";
    const sizePriceLargeSelect = schemaCapabilities.hasProductSizePriceLargeColumn
      ? "size_price_large"
      : "NULL::numeric AS size_price_large";
    const freeGiftEnabledSelect = schemaCapabilities.hasProductFreeGiftEnabledColumn
      ? "COALESCE(free_gift_enabled, false) AS free_gift_enabled"
      : "false AS free_gift_enabled";
    const isFeaturedSelect = schemaCapabilities.hasProductIsFeaturedColumn
      ? "COALESCE(is_featured, false) AS is_featured"
      : "false AS is_featured";
    const featuredOrderSelect = schemaCapabilities.hasProductFeaturedOrderColumn
      ? "COALESCE(featured_order, 0) AS featured_order"
      : "0 AS featured_order";
    const freeGiftProductIdSelect = schemaCapabilities.hasProductFreeGiftProductIdColumn
      ? "free_gift_product_id"
      : "NULL::integer AS free_gift_product_id";
    const freeGiftMinQuantitySelect = schemaCapabilities.hasProductFreeGiftMinQuantityColumn
      ? "COALESCE(free_gift_min_quantity, 1) AS free_gift_min_quantity"
      : "1 AS free_gift_min_quantity";
    const freeGiftQuantitySelect = schemaCapabilities.hasProductFreeGiftQuantityColumn
      ? "COALESCE(free_gift_quantity, 1) AS free_gift_quantity"
      : "1 AS free_gift_quantity";

    const productResult = await pool.query(
      `
      SELECT id, name, price, description, image_url, stock, ${productTypeSelect}, ${soldSelect}, ${sortOrderSelect}, ${isFeaturedSelect}, ${featuredOrderSelect}, ${sizeOptionsSelect},
             ${sizePriceSmallSelect}, ${sizePriceMediumSelect}, ${sizePriceLargeSelect},
             ${freeGiftEnabledSelect}, ${freeGiftProductIdSelect}, ${freeGiftMinQuantitySelect}, ${freeGiftQuantitySelect},
             COALESCE(is_active, true) AS is_active
      FROM products
      WHERE id = $1
      LIMIT 1
      `,
      [productId]
    );

    if (productResult.rowCount === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    const product = {
      ...productResult.rows[0],
      image_url: normalizeImageUrl(productResult.rows[0].image_url)
    };

    let variants = [];
    if (schemaCapabilities.hasProductVariantsTable) {
      const variantsResult = await pool.query(
        `
        SELECT *
        FROM product_variants
        WHERE product_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [productId]
      );
      variants = variantsResult.rows;
    }

    let images = [];
    if (schemaCapabilities.hasProductImagesTable) {
      const imageResult = await pool.query(
        `
        SELECT *
        FROM product_images
        WHERE product_id = $1
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        `,
        [productId]
      );
      images = imageResult.rows.map((image) => ({
        ...image,
        image_url: normalizeImageUrl(image.image_url)
      }));
    }

    let gift_options = [];
    if (schemaCapabilities.hasProductGiftOptionsTable) {
      const giftResult = await pool.query(
        `
        SELECT *
        FROM product_gift_options
        WHERE product_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [productId]
      );
      gift_options = giftResult.rows;
    }

    let bundle_slots = [];
    if (schemaCapabilities.hasBundleSlotsTable) {
      const bundleSlotsResult = await pool.query(
        `
        SELECT *
        FROM bundle_slots
        WHERE bundle_product_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [productId]
      );
      bundle_slots = bundleSlotsResult.rows;
    }

    let pricing_rule = { pricing_type: "sum", amount: 0, cocoa_extra_amount: 0 };
    if (schemaCapabilities.hasBundlePricingRulesTable) {
      const pricingRuleResult = await pool.query(
        `
        SELECT pricing_type, amount, COALESCE(cocoa_extra_amount, 0) AS cocoa_extra_amount
        FROM bundle_pricing_rules
        WHERE bundle_product_id = $1
        LIMIT 1
        `,
        [productId]
      );

      if (pricingRuleResult.rowCount > 0) {
        pricing_rule = pricingRuleResult.rows[0];
      }
    }

    let discount_rule = {
      discount_type: "none",
      amount: 0,
      applies_to: "product",
      is_active: false,
      starts_at: null,
      ends_at: null
    };
    if (schemaCapabilities.hasProductDiscountRulesTable) {
      const discountRuleResult = await pool.query(
        `
        SELECT discount_type, amount, applies_to, is_active, starts_at, ends_at
        FROM product_discount_rules
        WHERE product_id = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [productId]
      );

      if (discountRuleResult.rowCount > 0) {
        discount_rule = discountRuleResult.rows[0];
      }
    }

    let promo_codes = [];
    if (schemaCapabilities.hasProductPromoCodesTable) {
      const promoCodeSelect = schemaCapabilities.hasProductPromoCodeUsageCountColumn
        ? "COALESCE(usage_count, 0) AS usage_count"
        : "0 AS usage_count";
      const promoCodesResult = await pool.query(
        `
        SELECT id, code, discount_type, amount, applies_to, min_order_amount, usage_limit,
               ${promoCodeSelect}, is_active, starts_at, ends_at
        FROM product_promo_codes
        WHERE product_id = $1
        ORDER BY id ASC
        `,
        [productId]
      );

      promo_codes = promoCodesResult.rows;
    }

    return res.json({
      product,
      variants,
      images,
      gift_options,
      bundle_slots,
      pricing_rule,
      discount_rule,
      promo_codes
    });
  } catch (err) {
    console.error("Fetch full admin product failed:", err);
    return res.status(500).json({ error: "Failed to load full product details." });
  }
});

app.get("/api/featured-products", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductIsFeaturedColumn) {
      return res.json([]);
    }

    const productTypeSelect = schemaCapabilities.hasProductTypeColumn
      ? "COALESCE(product_type, 'single') AS product_type"
      : "'single' AS product_type";
    const soldSelect = schemaCapabilities.hasProductSoldColumn
      ? "COALESCE(sold, 0) AS sold"
      : "0 AS sold";
    const sortOrderSelect = schemaCapabilities.hasProductSortOrderColumn
      ? "COALESCE(sort_order, 0) AS sort_order"
      : "0 AS sort_order";
    const sizeOptionsSelect = schemaCapabilities.hasProductSizeOptionsColumn
      ? "COALESCE(size_options, 'small,medium,large') AS size_options"
      : "'small,medium,large' AS size_options";
    const sizePriceSmallSelect = schemaCapabilities.hasProductSizePriceSmallColumn
      ? "size_price_small"
      : "NULL::numeric AS size_price_small";
    const sizePriceMediumSelect = schemaCapabilities.hasProductSizePriceMediumColumn
      ? "size_price_medium"
      : "NULL::numeric AS size_price_medium";
    const sizePriceLargeSelect = schemaCapabilities.hasProductSizePriceLargeColumn
      ? "size_price_large"
      : "NULL::numeric AS size_price_large";
    const freeGiftEnabledSelect = schemaCapabilities.hasProductFreeGiftEnabledColumn
      ? "COALESCE(free_gift_enabled, false) AS free_gift_enabled"
      : "false AS free_gift_enabled";
    const freeGiftProductIdSelect = schemaCapabilities.hasProductFreeGiftProductIdColumn
      ? "free_gift_product_id"
      : "NULL::integer AS free_gift_product_id";
    const freeGiftMinQuantitySelect = schemaCapabilities.hasProductFreeGiftMinQuantityColumn
      ? "COALESCE(free_gift_min_quantity, 1) AS free_gift_min_quantity"
      : "1 AS free_gift_min_quantity";
    const freeGiftQuantitySelect = schemaCapabilities.hasProductFreeGiftQuantityColumn
      ? "COALESCE(free_gift_quantity, 1) AS free_gift_quantity"
      : "1 AS free_gift_quantity";

    const result = await pool.query(
      `
      SELECT id, name, price, description, image_url, stock, ${productTypeSelect}, ${soldSelect}, ${sortOrderSelect},
             COALESCE(is_featured, false) AS is_featured, COALESCE(featured_order, 0) AS featured_order, ${sizeOptionsSelect},
             ${sizePriceSmallSelect}, ${sizePriceMediumSelect}, ${sizePriceLargeSelect},
             ${freeGiftEnabledSelect}, ${freeGiftProductIdSelect}, ${freeGiftMinQuantitySelect}, ${freeGiftQuantitySelect}
      FROM products
      WHERE COALESCE(is_featured, false) = true
      ORDER BY COALESCE(featured_order, 0) ASC, ${schemaCapabilities.hasProductSortOrderColumn ? "sort_order ASC, id DESC" : "id DESC"}
      LIMIT 8
      `
    );

    res.json(result.rows.map((product) => ({
      ...product,
      image_url: normalizeImageUrl(product.image_url)
    })));
  } catch (err) {
    console.error("Fetch featured products failed:", err);
    res.status(500).json({ error: "Failed to load featured products" });
  }
});

app.get("/api/product-images", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductImagesTable) {
      return res.json({ byProductId: {}, items: [] });
    }

    const result = await pool.query(
      `
      SELECT id, product_id, image_url, sort_order, is_primary, created_at
      FROM product_images
      ORDER BY product_id ASC, is_primary DESC, sort_order ASC, id ASC
      `
    );

    const byProductId = {};
    result.rows.forEach((row) => {
      const key = String(row.product_id);
      if (!byProductId[key]) {
        byProductId[key] = [];
      }
      byProductId[key].push({
        ...row,
        image_url: normalizeImageUrl(row.image_url)
      });
    });

    res.json({
      byProductId,
      items: result.rows.map((row) => ({
        ...row,
        image_url: normalizeImageUrl(row.image_url)
      }))
    });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json({ byProductId: {}, items: [] });
    }
    console.error("Fetch public product images failed:", err);
    res.status(500).json({ error: "Failed to fetch product images" });
  }
});

app.get("/api/product-images/:productId", requireAdmin, async (req, res) => {
  const productId = parseInteger(req.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid." });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductImagesTable) {
      return res.json([]);
    }

    if (!(await productExists(productId))) {
      return res.status(404).json({ error: "Product not found." });
    }

    const rows = await getStoredProductImages(productId);
    res.json(rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json([]);
    }
    console.error("Fetch admin product images failed:", err);
    res.status(500).json({ error: "Failed to fetch product images" });
  }
});

app.get("/api/products/:productId/images", async (req, res) => {
  const productId = parseInteger(req.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid." });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductImagesTable) {
      return res.json([]);
    }

    if (!(await productExists(productId))) {
      return res.status(404).json({ error: "Product not found." });
    }

    const rows = await getStoredProductImages(productId);
    res.json(rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json([]);
    }
    console.error("Fetch product images alias failed:", err);
    res.status(500).json({ error: "Failed to fetch product images" });
  }
});

app.get("/api/product-variants/:productId", async (req, res) => {
  const productId = Number(req.params.productId);
  const admin = getOptionalAdmin(req);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Invalid product ID" });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductVariantsTable) {
      return res.json([]);
    }

    const result = await pool.query(
      `
      SELECT *
      FROM product_variants
      WHERE product_id = $1
        AND ($2::boolean = true OR is_active = true)
      ORDER BY sort_order ASC, id ASC
      `,
      [productId, Boolean(admin)]
    );

    res.json(result.rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json([]);
    }
    console.error("Fetch product variants failed:", err);
    res.status(500).json({ error: "Failed to fetch product variants" });
  }
});

app.get("/api/products/:productId/variants", async (req, res) => {
  const productId = Number(req.params.productId);
  const admin = getOptionalAdmin(req);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Invalid product ID" });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductVariantsTable) {
      return res.json([]);
    }

    const result = await pool.query(
      `
      SELECT *
      FROM product_variants
      WHERE product_id = $1
        AND ($2::boolean = true OR is_active = true)
      ORDER BY sort_order ASC, id ASC
      `,
      [productId, Boolean(admin)]
    );

    res.json(result.rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json([]);
    }
    console.error("Fetch product variants alias failed:", err);
    res.status(500).json({ error: "Failed to fetch product variants" });
  }
});

app.get("/api/product-variants", async (req, res) => {
  const admin = getOptionalAdmin(req);

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasProductVariantsTable) {
      return res.json([]);
    }

    const result = await pool.query(
      `
      SELECT *
      FROM product_variants
      WHERE ($1::boolean = true OR is_active = true)
      ORDER BY product_id ASC, sort_order ASC, id ASC
      `,
      [Boolean(admin)]
    );

    res.json(result.rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json([]);
    }
    console.error("Fetch all product variants failed:", err);
    res.status(500).json({ error: "Failed to fetch product variants" });
  }
});

app.get("/api/product-gift-options/:productId", async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductGiftOptionsTable) {
    return res.json([]);
  }

  const productId = parseInteger(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Invalid product ID" });
  }

  const admin = getOptionalAdmin(req);

  try {
    const result = await pool.query(
      `
      SELECT id, product_id, offer_name, gift_product_id, min_units, gift_quantity, extra_price, is_active, sort_order, created_at
      FROM product_gift_options
      WHERE product_id = $1
        ${admin ? "" : "AND is_active = TRUE"}
      ORDER BY sort_order ASC, id ASC
      `,
      [productId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch product gift options failed:", err);
    res.status(500).json({ error: "Failed to fetch product gift options" });
  }
});

app.get("/api/product-gift-options", async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductGiftOptionsTable) {
    return res.json([]);
  }

  const admin = getOptionalAdmin(req);

  try {
    const result = await pool.query(
      `
      SELECT id, product_id, offer_name, gift_product_id, min_units, gift_quantity, extra_price, is_active, sort_order, created_at
      FROM product_gift_options
      ${admin ? "" : "WHERE is_active = TRUE"}
      ORDER BY product_id ASC, sort_order ASC, id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch all product gift options failed:", err);
    res.status(500).json({ error: "Failed to fetch product gift options" });
  }
});

app.post("/api/add-product-gift-option", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductGiftOptionsTable) {
    return res.status(503).json({ error: "Product gift options table is not available" });
  }

  const validation = validateProductGiftOptionPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const option = validation.value;

  try {
    if (option.gift_product_id === option.product_id) {
      return res.status(400).json({ error: "A product cannot gift itself." });
    }

    if (!(await productExists(option.product_id))) {
      return res.status(404).json({ error: "Product not found." });
    }

    if (!(await productExists(option.gift_product_id))) {
      return res.status(404).json({ error: "Gift product not found." });
    }

    const result = await pool.query(
      `
      INSERT INTO product_gift_options (
        product_id, offer_name, gift_product_id, min_units,
        gift_quantity, extra_price, is_active, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        option.product_id,
        option.offer_name,
        option.gift_product_id,
        option.min_units,
        option.gift_quantity,
        option.extra_price,
        option.is_active,
        option.sort_order
      ]
    );

    res.json({ message: "Gift option added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add product gift option failed:", err);
    res.status(500).json({ error: "Failed to add product gift option" });
  }
});

app.post("/api/update-product-gift-option", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductGiftOptionsTable) {
    return res.status(503).json({ error: "Product gift options table is not available" });
  }

  const validation = validateProductGiftOptionPayload(req.body, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const option = validation.value;

  try {
    if (option.gift_product_id === option.product_id) {
      return res.status(400).json({ error: "A product cannot gift itself." });
    }

    if (!(await productExists(option.product_id))) {
      return res.status(404).json({ error: "Product not found." });
    }

    if (!(await productExists(option.gift_product_id))) {
      return res.status(404).json({ error: "Gift product not found." });
    }

    const result = await pool.query(
      `
      UPDATE product_gift_options
      SET offer_name = $1,
          gift_product_id = $2,
          min_units = $3,
          gift_quantity = $4,
          extra_price = $5,
          is_active = $6,
          sort_order = $7
      WHERE id = $8 AND product_id = $9
      `,
      [
        option.offer_name,
        option.gift_product_id,
        option.min_units,
        option.gift_quantity,
        option.extra_price,
        option.is_active,
        option.sort_order,
        option.id,
        option.product_id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Gift option not found." });
    }

    res.json({ message: "Gift option updated" });
  } catch (err) {
    console.error("Update product gift option failed:", err);
    res.status(500).json({ error: "Failed to update product gift option" });
  }
});

app.post("/api/delete-product-gift-option", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductGiftOptionsTable) {
    return res.status(503).json({ error: "Product gift options table is not available" });
  }

  const id = parseInteger(req.body.id ?? req.body.option_id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Gift option ID is invalid." });
  }

  try {
    const result = await pool.query(`DELETE FROM product_gift_options WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Gift option not found." });
    }

    res.json({ message: "Gift option deleted" });
  } catch (err) {
    console.error("Delete product gift option failed:", err);
    res.status(500).json({ error: "Failed to delete product gift option" });
  }
});

app.post("/api/add-product-variant", requireAdmin, async (req, res) => {
  await ensureProductVariantPricingColumns();
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductVariantsTable) {
    return res.status(503).json({ error: "Product variants table is not available" });
  }

  const validation = validateProductVariantPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const variant = validation.value;
  if (variant.discount_amount > 0 && !schemaCapabilities.hasVariantDiscountAmountColumn) {
    return res.status(400).json({ error: "product_variants.discount_amount column is missing" });
  }
  if (variant.image_url && !schemaCapabilities.hasVariantImageUrlColumn) {
    return res.status(400).json({ error: "product_variants.image_url column is missing" });
  }
  if (!schemaCapabilities.hasVariantPriceColumn || !schemaCapabilities.hasVariantStockColumn) {
    return res.status(400).json({ error: "product_variants price/stock columns are missing" });
  }

  try {
    const columns = ["product_id", "name", "units", "discount_percent", "is_active", "sort_order", "price", "stock"];
    const values = [
      variant.product_id,
      variant.name,
      variant.units,
      variant.discount_percent,
      variant.is_active,
      variant.sort_order,
      variant.price,
      variant.stock
    ];

    if (schemaCapabilities.hasVariantBundleExtraPriceColumn) {
      columns.push("bundle_extra_price");
      values.push(variant.bundle_extra_price);
    }

    if (schemaCapabilities.hasVariantDiscountAmountColumn) {
      columns.push("discount_amount");
      values.push(variant.discount_amount);
    }

    if (schemaCapabilities.hasVariantImageUrlColumn) {
      columns.push("image_url");
      values.push(variant.image_url);
    }

    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `
      INSERT INTO product_variants (${columns.join(", ")})
      VALUES (${placeholders})
      RETURNING id
      `,
      values
    );

    res.json({ message: "Variant added", id: result.rows[0].id });
  } catch (err) {
    console.error("Add product variant failed:", err);
    res.status(500).json({ error: "Failed to add product variant" });
  }
});

app.post("/api/update-product-variant", requireAdmin, async (req, res) => {
  await ensureProductVariantPricingColumns();
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductVariantsTable) {
    return res.status(503).json({ error: "Product variants table is not available" });
  }

  const validation = validateProductVariantPayload(req.body, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const variant = validation.value;
  if (variant.discount_amount > 0 && !schemaCapabilities.hasVariantDiscountAmountColumn) {
    return res.status(400).json({ error: "product_variants.discount_amount column is missing" });
  }
  if (variant.image_url && !schemaCapabilities.hasVariantImageUrlColumn) {
    return res.status(400).json({ error: "product_variants.image_url column is missing" });
  }
  if (!schemaCapabilities.hasVariantPriceColumn || !schemaCapabilities.hasVariantStockColumn) {
    return res.status(400).json({ error: "product_variants price/stock columns are missing" });
  }

  try {
    const assignments = [
      "name = $1",
      "units = $2",
      "discount_percent = $3",
      "is_active = $4",
      "sort_order = $5",
      "price = $6",
      "stock = $7"
    ];
    const values = [
      variant.name,
      variant.units,
      variant.discount_percent,
      variant.is_active,
      variant.sort_order,
      variant.price,
      variant.stock
    ];

    if (schemaCapabilities.hasVariantBundleExtraPriceColumn) {
      assignments.push(`bundle_extra_price = $${values.length + 1}`);
      values.push(variant.bundle_extra_price);
    }

    if (schemaCapabilities.hasVariantDiscountAmountColumn) {
      assignments.push(`discount_amount = $${values.length + 1}`);
      values.push(variant.discount_amount);
    }

    if (schemaCapabilities.hasVariantImageUrlColumn) {
      assignments.push(`image_url = $${values.length + 1}`);
      values.push(variant.image_url);
    }

    values.push(variant.id);

    await pool.query(
      `
      UPDATE product_variants
      SET ${assignments.join(", ")}
      WHERE id = $${values.length}
      `,
      values
    );

    res.json({ message: "Variant updated" });
  } catch (err) {
    console.error("Update product variant failed:", err);
    res.status(500).json({ error: "Failed to update product variant" });
  }
});

app.post("/api/delete-product-variant", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductVariantsTable) {
    return res.status(503).json({ error: "Product variants table is not available" });
  }

  const id = Number(req.body.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid variant ID" });
  }

  try {
    await pool.query(`DELETE FROM product_variants WHERE id = $1`, [id]);
    res.json({ message: "Variant deleted" });
  } catch (err) {
    console.error("Delete product variant failed:", err);
    res.status(500).json({ error: "Failed to delete product variant" });
  }
});

app.post("/api/add-product-images", requireAdmin, upload.array("images", PRODUCT_IMAGES_MAX_FILES), async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  const productId = parseInteger(req.body.product_id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid." });
  }

  if (!Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: "No images uploaded." });
  }

  const client = await pool.connect();
  const createdImageUrls = [];

  try {
    if (!schemaCapabilities.hasProductImagesTable) {
      return res.status(503).json({ error: "Product images table is not available" });
    }

    if (!(await productExists(productId))) {
      return res.status(404).json({ error: "Product not found." });
    }

    await client.query("BEGIN");

    const countResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM product_images
      WHERE product_id = $1
      `,
      [productId]
    );
    const existingCount = countResult.rows[0]?.count || 0;

    const maxSortResult = await client.query(
      `
      SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order
      FROM product_images
      WHERE product_id = $1
      `,
      [productId]
    );
    let nextSortOrder = Number(maxSortResult.rows[0]?.max_sort_order ?? -1) + 1;

    const insertedImages = [];
    for (let index = 0; index < req.files.length; index += 1) {
      const imageUrl = await processUploadedImage(req.files[index]);
      createdImageUrls.push(imageUrl);
      const shouldBePrimary = existingCount === 0 && index === 0;

      const insertResult = await client.query(
        `
        INSERT INTO product_images (product_id, image_url, sort_order, is_primary)
        VALUES ($1, $2, $3, $4)
        RETURNING id, product_id, image_url, sort_order, is_primary, created_at
        `,
        [productId, imageUrl, nextSortOrder, shouldBePrimary]
      );

      insertedImages.push(insertResult.rows[0]);
      nextSortOrder += 1;
    }

    await ensureSinglePrimaryImage(productId, null, client);
    await client.query("COMMIT");

    res.json({
      message: "Images uploaded",
      images: insertedImages
    });
  } catch (err) {
    await client.query("ROLLBACK");
    await Promise.all(createdImageUrls.map((imageUrl) => removeUploadedFile(imageUrl)));
    console.error("Add product images failed:", err);
    res.status(500).json({ error: "Failed to add product images" });
  } finally {
    client.release();
  }
});

app.post("/api/update-product-image", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductImagesTable) {
    return res.status(503).json({ error: "Product images table is not available" });
  }

  const validation = validateProductImagePayload(req.body, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const image = validation.value;

  try {
    if (!(await productExists(image.product_id))) {
      return res.status(404).json({ error: "Product not found." });
    }

    const result = await pool.query(
      `
      UPDATE product_images
      SET image_url = CASE WHEN $1 <> '' THEN $1 ELSE image_url END,
          sort_order = $2
      WHERE id = $3 AND product_id = $4
      RETURNING id, product_id, image_url, sort_order, is_primary, created_at
      `,
      [image.image_url, image.sort_order, image.id, image.product_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product image not found." });
    }

    await ensureSinglePrimaryImage(image.product_id);

    res.json({
      message: "Product image updated",
      image: result.rows[0]
    });
  } catch (err) {
    console.error("Update product image failed:", err);
    res.status(500).json({ error: "Failed to update product image" });
  }
});

app.post("/api/delete-product-image", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductImagesTable) {
    return res.status(503).json({ error: "Product images table is not available" });
  }

  const imageId = parseInteger(req.body.id ?? req.body.image_id);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).json({ error: "Image ID is invalid." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const deleteResult = await client.query(
      `
      DELETE FROM product_images
      WHERE id = $1
      RETURNING id, product_id, image_url
      `,
      [imageId]
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product image not found." });
    }

    const deletedImage = deleteResult.rows[0];
    await ensureSinglePrimaryImage(deletedImage.product_id, null, client);
    await client.query("COMMIT");
    await removeUploadedFile(deletedImage.image_url);

    res.json({ message: "Product image deleted" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete product image failed:", err);
    res.status(500).json({ error: "Failed to delete product image" });
  } finally {
    client.release();
  }
});

app.post("/api/upload-gallery-image", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageUrl = await processUploadedImage(req.file);
    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error("Upload gallery image failed:", err);
    res.status(500).json({ error: "Failed to upload gallery image" });
  }
});

app.post("/api/upload-homepage-slide-image", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageUrl = await processUploadedImage(req.file);
    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error("Upload homepage slide image failed:", err);
    res.status(500).json({ error: "Failed to upload homepage slide image" });
  }
});

app.post("/api/upload", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageUrl = await processUploadedImage(req.file);
    res.json({ url: imageUrl });
  } catch (err) {
    console.error("Upload product image failed:", err);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

app.post("/api/set-primary-product-image", requireAdmin, async (req, res) => {
  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasProductImagesTable) {
    return res.status(503).json({ error: "Product images table is not available" });
  }

  const imageId = parseInteger(req.body.id ?? req.body.image_id);
  const productId = parseInteger(req.body.product_id);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).json({ error: "Image ID is invalid." });
  }

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid." });
  }

  const client = await pool.connect();

  try {
    if (!(await productExists(productId))) {
      return res.status(404).json({ error: "Product not found." });
    }

    await client.query("BEGIN");

    const imageResult = await client.query(
      `
      SELECT id
      FROM product_images
      WHERE id = $1 AND product_id = $2
      `,
      [imageId, productId]
    );

    if (imageResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product image not found." });
    }

    await ensureSinglePrimaryImage(productId, imageId, client);
    await client.query("COMMIT");

    res.json({ message: "Primary product image updated" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Set primary product image failed:", err);
    res.status(500).json({ error: "Failed to set primary product image" });
  } finally {
    client.release();
  }
});

app.post("/api/upload-product-variant-image", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  try {
    const imageUrl = await processUploadedImage(req.file);
    res.json({
      message: "Variant image uploaded",
      image_url: imageUrl
    });
  } catch (err) {
    console.error("Upload product variant image failed:", err);
    res.status(500).json({ error: "Failed to upload variant image" });
  }
});

app.post("/api/add-product", requireAdmin, async (req, res) => {
  const validation = validateProductPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const productType = normalizeProductType(req.body.product_type);
  const bundleSlotsValidation = validateBundleSlotsPayload(req.body.bundle_slots);
  if (bundleSlotsValidation.error) {
    return res.status(400).json({ error: bundleSlotsValidation.error });
  }

  const pricingRuleValidation = validateBundlePricingRulePayload(req.body.pricing_rule);
  if (pricingRuleValidation.error) {
    return res.status(400).json({ error: pricingRuleValidation.error });
  }
  const discountRuleValidation = validateProductDiscountRulePayload(req.body.discount_rule);
  if (discountRuleValidation.error) {
    return res.status(400).json({ error: discountRuleValidation.error });
  }
  const promoCodesValidation = validateProductPromoCodesPayload(req.body.promo_codes);
  if (promoCodesValidation.error) {
    return res.status(400).json({ error: promoCodesValidation.error });
  }

  const bundleSlots = bundleSlotsValidation.value;
  const pricingRule = pricingRuleValidation.value;
  const discountRule = discountRuleValidation.value;
  const promoCodes = promoCodesValidation.value;

  const {
    name,
    price,
    size_price_small,
    size_price_medium,
    size_price_large,
    description,
    image_url,
    stock,
    sold,
    sort_order,
    is_featured,
    featured_order,
    size_options,
    free_gift_enabled,
    free_gift_product_id,
    free_gift_min_quantity,
    free_gift_quantity
  } = validation.value;

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (productType === "bundle") {
      if (
        !schemaCapabilities.hasProductTypeColumn ||
        !schemaCapabilities.hasBundleSlotsTable ||
        !schemaCapabilities.hasBundlePricingRulesTable
      ) {
        return res.status(400).json({
          error: "Bundle save needs matching server support before it can be stored."
        });
      }

      if (bundleSlots.length === 0) {
        return res.status(400).json({ error: "Bundle products need at least one bundle slot." });
      }
    }

    if (!schemaCapabilities.hasProductDiscountRulesTable || !schemaCapabilities.hasProductPromoCodesTable) {
      return res.status(400).json({ error: "Product promotion tables are missing from the database." });
    }

    if (
      free_gift_enabled &&
      (
        !schemaCapabilities.hasProductFreeGiftEnabledColumn ||
        !schemaCapabilities.hasProductFreeGiftProductIdColumn ||
        !schemaCapabilities.hasProductFreeGiftMinQuantityColumn ||
        !schemaCapabilities.hasProductFreeGiftQuantityColumn
      )
    ) {
      return res.status(400).json({ error: "Free gift product columns are missing from the products table." });
    }

    if (free_gift_enabled) {
      if (!(await productExists(free_gift_product_id))) {
        return res.status(404).json({ error: "Selected free gift product was not found." });
      }
    }

    const columns = ["name", "price", "description", "image_url", "stock"];
    const values = [name, price, description, image_url, stock];

    if (schemaCapabilities.hasProductSizePriceSmallColumn) {
      columns.push("size_price_small");
      values.push(size_price_small);
    }

    if (schemaCapabilities.hasProductSizePriceMediumColumn) {
      columns.push("size_price_medium");
      values.push(size_price_medium);
    }

    if (schemaCapabilities.hasProductSizePriceLargeColumn) {
      columns.push("size_price_large");
      values.push(size_price_large);
    }

    if (schemaCapabilities.hasProductTypeColumn) {
      columns.push("product_type");
      values.push(productType);
    }

    if (schemaCapabilities.hasProductSoldColumn) {
      columns.push("sold");
      values.push(sold);
    }

    if (schemaCapabilities.hasProductSortOrderColumn) {
      columns.push("sort_order");
      values.push(sort_order);
    }

    if (schemaCapabilities.hasProductIsFeaturedColumn) {
      columns.push("is_featured");
      values.push(is_featured);
    }

    if (schemaCapabilities.hasProductFeaturedOrderColumn) {
      columns.push("featured_order");
      values.push(featured_order);
    }

    if (schemaCapabilities.hasProductSizeOptionsColumn) {
      columns.push("size_options");
      values.push(size_options.join(","));
    }

    if (schemaCapabilities.hasProductFreeGiftEnabledColumn) {
      columns.push("free_gift_enabled");
      values.push(free_gift_enabled);
    }

    if (schemaCapabilities.hasProductFreeGiftProductIdColumn) {
      columns.push("free_gift_product_id");
      values.push(free_gift_product_id);
    }

    if (schemaCapabilities.hasProductFreeGiftMinQuantityColumn) {
      columns.push("free_gift_min_quantity");
      values.push(free_gift_min_quantity);
    }

    if (schemaCapabilities.hasProductFreeGiftQuantityColumn) {
      columns.push("free_gift_quantity");
      values.push(free_gift_quantity);
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const result = await client.query(
        `
        INSERT INTO products (${columns.join(", ")})
        VALUES (${placeholders})
        RETURNING id
        `,
        values
      );

      const createdProductId = result.rows[0].id;

      if (schemaCapabilities.hasProductVariantsTable && schemaCapabilities.hasVariantPriceColumn) {
        await syncStandardSizeVariantPrices(
          createdProductId,
          {
            small: size_price_small,
            medium: size_price_medium,
            large: size_price_large
          },
          client
        );
      }

      if (productType === "bundle") {
        await replaceBundleData(createdProductId, bundleSlots, pricingRule, client);
      }
      await replaceProductDiscountRule(createdProductId, discountRule, client);
      await replaceProductPromoCodes(createdProductId, promoCodes, client, schemaCapabilities);

      await client.query("COMMIT");

      res.json({
        message: "Product added",
        productId: createdProductId
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Insert product error:", err);
      res.status(500).json({ error: "Failed to add product" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Insert product error:", err);
    res.status(500).json({ error: "Failed to add product" });
  }
});

app.post("/api/update-product", requireAdmin, async (req, res) => {
  const productId = parseInteger(req.body.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid" });
  }

  const validation = validateProductPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const productType = normalizeProductType(req.body.product_type);
  const bundleSlotsValidation = validateBundleSlotsPayload(req.body.bundle_slots);
  if (bundleSlotsValidation.error) {
    return res.status(400).json({ error: bundleSlotsValidation.error });
  }

  const pricingRuleValidation = validateBundlePricingRulePayload(req.body.pricing_rule);
  if (pricingRuleValidation.error) {
    return res.status(400).json({ error: pricingRuleValidation.error });
  }
  const discountRuleValidation = validateProductDiscountRulePayload(req.body.discount_rule);
  if (discountRuleValidation.error) {
    return res.status(400).json({ error: discountRuleValidation.error });
  }
  const promoCodesValidation = validateProductPromoCodesPayload(req.body.promo_codes);
  if (promoCodesValidation.error) {
    return res.status(400).json({ error: promoCodesValidation.error });
  }

  const bundleSlots = bundleSlotsValidation.value;
  const pricingRule = pricingRuleValidation.value;
  const discountRule = discountRuleValidation.value;
  const promoCodes = promoCodesValidation.value;

  const {
    name,
    price,
    size_price_small,
    size_price_medium,
    size_price_large,
    description,
    image_url,
    stock,
    sold,
    sort_order,
    is_featured,
    featured_order,
    size_options,
    free_gift_enabled,
    free_gift_product_id,
    free_gift_min_quantity,
    free_gift_quantity
  } = validation.value;

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (productType === "bundle") {
      if (
        !schemaCapabilities.hasProductTypeColumn ||
        !schemaCapabilities.hasBundleSlotsTable ||
        !schemaCapabilities.hasBundlePricingRulesTable
      ) {
        return res.status(400).json({
          error: "Bundle save needs matching server support before it can be stored."
        });
      }

      if (bundleSlots.length === 0) {
        return res.status(400).json({ error: "Bundle products need at least one bundle slot." });
      }
    }

    if (!schemaCapabilities.hasProductDiscountRulesTable || !schemaCapabilities.hasProductPromoCodesTable) {
      return res.status(400).json({ error: "Product promotion tables are missing from the database." });
    }

    if (
      free_gift_enabled &&
      (
        !schemaCapabilities.hasProductFreeGiftEnabledColumn ||
        !schemaCapabilities.hasProductFreeGiftProductIdColumn ||
        !schemaCapabilities.hasProductFreeGiftMinQuantityColumn ||
        !schemaCapabilities.hasProductFreeGiftQuantityColumn
      )
    ) {
      return res.status(400).json({ error: "Free gift product columns are missing from the products table." });
    }

    if (free_gift_enabled) {
      if (free_gift_product_id === productId) {
        return res.status(400).json({ error: "A product cannot gift itself." });
      }

      if (!(await productExists(free_gift_product_id))) {
        return res.status(404).json({ error: "Selected free gift product was not found." });
      }
    }

    const assignments = [
      "name = $1",
      "price = $2",
      "description = $3",
      "image_url = $4",
      "stock = $5"
    ];
    const values = [name, price, description, image_url, stock];

    if (schemaCapabilities.hasProductSizePriceSmallColumn) {
      assignments.push(`size_price_small = $${values.length + 1}`);
      values.push(size_price_small);
    }

    if (schemaCapabilities.hasProductSizePriceMediumColumn) {
      assignments.push(`size_price_medium = $${values.length + 1}`);
      values.push(size_price_medium);
    }

    if (schemaCapabilities.hasProductSizePriceLargeColumn) {
      assignments.push(`size_price_large = $${values.length + 1}`);
      values.push(size_price_large);
    }

    if (schemaCapabilities.hasProductTypeColumn) {
      assignments.push(`product_type = $${values.length + 1}`);
      values.push(productType);
    }

    if (schemaCapabilities.hasProductSoldColumn) {
      assignments.push(`sold = $${values.length + 1}`);
      values.push(sold);
    }

    if (schemaCapabilities.hasProductSortOrderColumn) {
      assignments.push(`sort_order = $${values.length + 1}`);
      values.push(sort_order);
    }

    if (schemaCapabilities.hasProductIsFeaturedColumn) {
      assignments.push(`is_featured = $${values.length + 1}`);
      values.push(is_featured);
    }

    if (schemaCapabilities.hasProductFeaturedOrderColumn) {
      assignments.push(`featured_order = $${values.length + 1}`);
      values.push(featured_order);
    }

    if (schemaCapabilities.hasProductSizeOptionsColumn) {
      assignments.push(`size_options = $${values.length + 1}`);
      values.push(size_options.join(","));
    }

    if (schemaCapabilities.hasProductFreeGiftEnabledColumn) {
      assignments.push(`free_gift_enabled = $${values.length + 1}`);
      values.push(free_gift_enabled);
    }

    if (schemaCapabilities.hasProductFreeGiftProductIdColumn) {
      assignments.push(`free_gift_product_id = $${values.length + 1}`);
      values.push(free_gift_product_id);
    }

    if (schemaCapabilities.hasProductFreeGiftMinQuantityColumn) {
      assignments.push(`free_gift_min_quantity = $${values.length + 1}`);
      values.push(free_gift_min_quantity);
    }

    if (schemaCapabilities.hasProductFreeGiftQuantityColumn) {
      assignments.push(`free_gift_quantity = $${values.length + 1}`);
      values.push(free_gift_quantity);
    }

    values.push(productId);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        UPDATE products
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
        `,
        values
      );

      if (schemaCapabilities.hasProductVariantsTable && schemaCapabilities.hasVariantPriceColumn) {
        await syncStandardSizeVariantPrices(
          productId,
          {
            small: size_price_small,
            medium: size_price_medium,
            large: size_price_large
          },
          client
        );
      }

      if (productType === "bundle") {
        await replaceBundleData(productId, bundleSlots, pricingRule, client);
      } else if (schemaCapabilities.hasBundleSlotsTable && schemaCapabilities.hasBundlePricingRulesTable) {
        await client.query(`DELETE FROM bundle_slots WHERE bundle_product_id = $1`, [productId]);
        await client.query(`DELETE FROM bundle_pricing_rules WHERE bundle_product_id = $1`, [productId]);
      }
      await replaceProductDiscountRule(productId, discountRule, client);
      await replaceProductPromoCodes(productId, promoCodes, client, schemaCapabilities);

      await client.query("COMMIT");

      res.json({ message: "Product updated" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Update product failed:", err);
      res.status(500).json({ error: "Update failed" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Update product failed:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

app.post("/api/delete-product", requireAdmin, async (req, res) => {
  const id = parseInteger(req.body.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Product ID is invalid" });
  }

  try {
    await pool.query("DELETE FROM products WHERE id = $1", [id]);
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Delete product failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const productId = parseInteger(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "Product ID is invalid." });
    }

    const schemaCapabilities = await getSchemaCapabilities();
    const productTypeSelect = schemaCapabilities.hasProductTypeColumn
      ? "COALESCE(product_type, 'single') AS product_type"
      : "'single' AS product_type";
    const soldSelect = schemaCapabilities.hasProductSoldColumn
      ? "COALESCE(sold, 0) AS sold"
      : "0 AS sold";
    const sortOrderSelect = schemaCapabilities.hasProductSortOrderColumn
      ? "COALESCE(sort_order, 0) AS sort_order"
      : "0 AS sort_order";
    const sizeOptionsSelect = schemaCapabilities.hasProductSizeOptionsColumn
      ? "COALESCE(size_options, 'small,medium,large') AS size_options"
      : "'small,medium,large' AS size_options";
    const sizePriceSmallSelect = schemaCapabilities.hasProductSizePriceSmallColumn
      ? "size_price_small"
      : "NULL::numeric AS size_price_small";
    const sizePriceMediumSelect = schemaCapabilities.hasProductSizePriceMediumColumn
      ? "size_price_medium"
      : "NULL::numeric AS size_price_medium";
    const sizePriceLargeSelect = schemaCapabilities.hasProductSizePriceLargeColumn
      ? "size_price_large"
      : "NULL::numeric AS size_price_large";
    const isFeaturedSelect = schemaCapabilities.hasProductIsFeaturedColumn
      ? "COALESCE(is_featured, false) AS is_featured"
      : "false AS is_featured";
    const featuredOrderSelect = schemaCapabilities.hasProductFeaturedOrderColumn
      ? "COALESCE(featured_order, 0) AS featured_order"
      : "0 AS featured_order";
    const freeGiftEnabledSelect = schemaCapabilities.hasProductFreeGiftEnabledColumn
      ? "COALESCE(free_gift_enabled, false) AS free_gift_enabled"
      : "false AS free_gift_enabled";
    const freeGiftProductIdSelect = schemaCapabilities.hasProductFreeGiftProductIdColumn
      ? "free_gift_product_id"
      : "NULL::integer AS free_gift_product_id";
    const freeGiftMinQuantitySelect = schemaCapabilities.hasProductFreeGiftMinQuantityColumn
      ? "COALESCE(free_gift_min_quantity, 1) AS free_gift_min_quantity"
      : "1 AS free_gift_min_quantity";
    const freeGiftQuantitySelect = schemaCapabilities.hasProductFreeGiftQuantityColumn
      ? "COALESCE(free_gift_quantity, 1) AS free_gift_quantity"
      : "1 AS free_gift_quantity";

    const productResult = await pool.query(
      `
      SELECT id, name, price, description, image_url, stock, COALESCE(is_active, true) AS is_active,
             ${productTypeSelect}, ${soldSelect}, ${sortOrderSelect}, ${isFeaturedSelect}, ${featuredOrderSelect},
             ${sizeOptionsSelect}, ${sizePriceSmallSelect}, ${sizePriceMediumSelect}, ${sizePriceLargeSelect},
             ${freeGiftEnabledSelect}, ${freeGiftProductIdSelect}, ${freeGiftMinQuantitySelect}, ${freeGiftQuantitySelect}
      FROM products
      WHERE id = $1
      LIMIT 1
      `,
      [productId]
    );

    if (productResult.rowCount === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    const product = {
      ...productResult.rows[0],
      image_url: normalizeImageUrl(productResult.rows[0].image_url)
    };

    let variants = [];
    if (schemaCapabilities.hasProductVariantsTable) {
      const variantsResult = await pool.query(
        `
        SELECT *
        FROM product_variants
        WHERE product_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [productId]
      );
      variants = variantsResult.rows;
    }

    let bundleSlots = [];
    let pricingRule = { pricing_type: "sum", amount: 0, cocoa_extra_amount: 0 };
    let selectableVariantsBySize = {};

    if (
      String(product.product_type || "single").toLowerCase() === "bundle" &&
      schemaCapabilities.hasBundleSlotsTable &&
      schemaCapabilities.hasBundlePricingRulesTable
    ) {
      const slotsResult = await pool.query(
        `
        SELECT id, bundle_product_id, slot_label, required_size, sort_order
        FROM bundle_slots
        WHERE bundle_product_id = $1
        ORDER BY sort_order ASC, id ASC
        `,
        [productId]
      );

      bundleSlots = slotsResult.rows;

      const pricingResult = await pool.query(
        `
        SELECT pricing_type, amount, COALESCE(cocoa_extra_amount, 0) AS cocoa_extra_amount
        FROM bundle_pricing_rules
        WHERE bundle_product_id = $1
        LIMIT 1
        `,
        [productId]
      );

      if (pricingResult.rowCount > 0) {
        pricingRule = pricingResult.rows[0];
      }

      if (schemaCapabilities.hasProductVariantsTable && bundleSlots.length > 0) {
        const requiredSizes = [...new Set(
          bundleSlots
            .map((slot) => normalizeString(slot.required_size).toLowerCase())
            .filter(Boolean)
        )];

        if (requiredSizes.length > 0) {
          await ensureStandardSizeVariantsForBundleSizes(requiredSizes, schemaCapabilities, pool);

          const bundleExtraPriceColumnResult = await pool.query(
            `
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'product_variants'
              AND column_name = 'bundle_extra_price'
            LIMIT 1
            `
          );

          const bundleExtraPriceSelect = bundleExtraPriceColumnResult.rowCount > 0
            ? "COALESCE(pv.bundle_extra_price, 0) AS bundle_extra_price"
            : "0::numeric AS bundle_extra_price";
          const selectableProductTypeCondition = schemaCapabilities.hasProductTypeColumn
            ? "AND COALESCE(p.product_type, 'single') = 'single'"
            : "";
          const requiredSizeLookup = new Map(requiredSizes.map((size) => [size, size]));

          const selectableResult = await pool.query(
            `
            SELECT
              pv.id,
              pv.product_id,
              pv.name AS size_name,
              pv.price,
              pv.stock,
              ${bundleExtraPriceSelect},
              p.name AS product_name
            FROM product_variants pv
            INNER JOIN products p ON p.id = pv.product_id
            WHERE p.id <> $1
              ${selectableProductTypeCondition}
              AND LOWER(TRIM(pv.name)) = ANY(
                SELECT LOWER(TRIM(value))
                FROM unnest($2::text[]) AS value
              )
            ORDER BY p.name ASC, pv.sort_order ASC, pv.id ASC
            `,
            [productId, requiredSizes]
          );

          selectableVariantsBySize = Object.fromEntries(requiredSizes.map((size) => [size, []]));

          selectableResult.rows.forEach((row) => {
            const normalizedSizeKey = normalizeString(row.size_name).toLowerCase();
            const exactSizeKey = requiredSizeLookup.get(normalizedSizeKey);
            if (!exactSizeKey) return;
            const effectiveBundleExtraPrice = getEffectiveBundleExtraPrice(
              row.product_name,
              row.size_name,
              row.bundle_extra_price
            );

            selectableVariantsBySize[exactSizeKey].push({
              ...row,
              size_name: normalizeString(row.size_name),
              bundle_extra_price: effectiveBundleExtraPrice
            });
          });
        }
      }
    }

    return res.json({
      product,
      variants,
      bundle_slots: bundleSlots,
      pricing_rule: pricingRule,
      selectable_variants_by_size: selectableVariantsBySize
    });
  } catch (error) {
    console.error("Fetch product detail failed:", error);
    return res.status(500).json({ error: "Failed to load product details." });
  }
});

app.post("/api/bundles/:id/calculate", async (req, res) => {
  try {
    const bundleId = parseInteger(req.params.id);
    const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
    const promoCodeInput = normalizeString(req.body?.promo_code).toUpperCase();
    const schemaCapabilities = await getSchemaCapabilities();

    if (!Number.isInteger(bundleId) || bundleId <= 0) {
      return res.status(400).json({ error: "Bundle ID is invalid." });
    }

    if (
      !schemaCapabilities.hasBundleSlotsTable ||
      !schemaCapabilities.hasBundlePricingRulesTable ||
      !schemaCapabilities.hasProductTypeColumn
    ) {
      return res.status(400).json({ error: "Bundle schema is not available yet." });
    }

    if (!schemaCapabilities.hasProductVariantsTable) {
      return res.status(400).json({ error: "Product variants table is required for bundle pricing." });
    }

    const productResult = await pool.query(
      `
      SELECT id, name, price, product_type
      FROM products
      WHERE id = $1
      LIMIT 1
      `,
      [bundleId]
    );

    if (productResult.rowCount === 0) {
      return res.status(404).json({ error: "Bundle product not found." });
    }

    const bundleProduct = productResult.rows[0];

    if (String(bundleProduct.product_type || "single").toLowerCase() !== "bundle") {
      return res.status(400).json({ error: "Selected product is not a bundle." });
    }

    const slotsResult = await pool.query(
      `
      SELECT id, slot_label, required_size, sort_order
      FROM bundle_slots
      WHERE bundle_product_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [bundleId]
    );

    const slots = slotsResult.rows;
    if (!slots.length) {
      return res.status(400).json({ error: "Bundle slots were not found." });
    }

    if (selections.length !== slots.length) {
      return res.status(400).json({ error: "Please complete all bundle selections." });
    }

    const slotMap = new Map(slots.map((slot) => [Number(slot.id), slot]));
    const variantIds = selections
      .map((item) => parseInteger(item.variant_id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (variantIds.length !== selections.length) {
      return res.status(400).json({ error: "One or more selected variants are invalid." });
    }

    const bundleExtraPriceColumnResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'product_variants'
        AND column_name = 'bundle_extra_price'
      LIMIT 1
      `
    );

    const bundleExtraPriceSelect = bundleExtraPriceColumnResult.rowCount > 0
      ? "COALESCE(pv.bundle_extra_price, 0) AS bundle_extra_price"
      : "0::numeric AS bundle_extra_price";

    const variantResult = await pool.query(
      `
      SELECT
        pv.id,
        pv.product_id,
        pv.name,
        p.name AS product_name,
        pv.price,
        pv.stock,
        ${bundleExtraPriceSelect}
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ANY($1::int[])
      `,
      [variantIds]
    );

    if (variantResult.rowCount !== variantIds.length) {
      return res.status(400).json({ error: "One or more selected variants do not exist." });
    }

    const variantMap = new Map(variantResult.rows.map((variant) => [Number(variant.id), variant]));

    const pricingRuleResult = await pool.query(
      `
      SELECT pricing_type, amount, COALESCE(cocoa_extra_amount, 0) AS cocoa_extra_amount
      FROM bundle_pricing_rules
      WHERE bundle_product_id = $1
      LIMIT 1
      `,
      [bundleId]
    );

    const pricingRule = pricingRuleResult.rows[0] || { pricing_type: "sum", amount: 0, cocoa_extra_amount: 0 };
    const baseBundlePrice = Number(bundleProduct.price || 0);
    let surchargeTotal = 0;

    for (const item of selections) {
      const slotId = parseInteger(item.slot_id);
      const variantId = parseInteger(item.variant_id);

      const slot = slotMap.get(slotId);
      const variant = variantMap.get(variantId);

      if (!slot || !variant) {
        return res.status(400).json({ error: "Invalid slot or variant selection." });
      }

      if (Number(variant.stock || 0) <= 0) {
        return res.status(400).json({ error: `${variant.name} is out of stock` });
      }

      surchargeTotal += getEffectiveBundleExtraPrice(
        variant.product_name,
        variant.name,
        variant.bundle_extra_price
      );
    }

    const subtotalBeforeRules = Number((baseBundlePrice + surchargeTotal).toFixed(2));
    let productDiscount = 0;
    let promoDiscount = 0;
    let appliedPromoCode = "";

    if (schemaCapabilities.hasProductDiscountRulesTable) {
      const discountRuleResult = await pool.query(
        `
        SELECT discount_type, amount, applies_to, is_active, starts_at, ends_at
        FROM product_discount_rules
        WHERE product_id = $1 AND applies_to = 'bundle'
        ORDER BY is_active DESC, id DESC
        LIMIT 1
        `,
        [bundleId]
      );

      if (discountRuleResult.rowCount > 0) {
        const discountRule = discountRuleResult.rows[0];
        if (isRuleCurrentlyActive(discountRule)) {
          productDiscount = calculateDiscountAmount(
            subtotalBeforeRules,
            discountRule.discount_type,
            discountRule.amount
          );
        }
      }
    }

    let total = Math.max(0, subtotalBeforeRules - productDiscount);
    let pricingRuleAdjustment = 0;

    const amount = Number(pricingRule.amount || 0);

    if (pricingRule.pricing_type === "sum_plus") {
      pricingRuleAdjustment = amount;
      total += amount;
    } else if (pricingRule.pricing_type === "sum_minus") {
      pricingRuleAdjustment = -amount;
      total -= amount;
    }

    total = Math.max(0, total);

    if (promoCodeInput) {
      let promoRule = null;

      if (schemaCapabilities.hasProductPromoCodesTable) {
        const usageCountSelect = schemaCapabilities.hasProductPromoCodeUsageCountColumn
          ? "COALESCE(usage_count, 0) AS usage_count"
          : "0 AS usage_count";
        const promoCodeResult = await pool.query(
          `
          SELECT id, code, discount_type, amount, applies_to, min_order_amount, usage_limit,
                 ${usageCountSelect}, is_active, starts_at, ends_at
          FROM product_promo_codes
          WHERE product_id = $1
            AND UPPER(code) = $2
            AND applies_to = 'bundle'
          ORDER BY id DESC
          LIMIT 1
          `,
          [bundleId, promoCodeInput]
        );

        if (promoCodeResult.rowCount > 0) {
          promoRule = promoCodeResult.rows[0];
        }
      }

      if (!promoRule) {
        const generalPromoConfig = await getGeneralPromoConfig();
        if (generalPromoConfig.active && generalPromoConfig.code === promoCodeInput) {
          promoRule = {
            code: generalPromoConfig.code,
            discount_type: "percent",
            amount: generalPromoConfig.percent,
            min_order_amount: 0,
            usage_limit: null,
            usage_count: 0,
            is_active: true,
            starts_at: null,
            ends_at: null
          };
        }
      }

      if (!promoRule) {
        return res.status(400).json({ error: "Promo code is invalid for this bundle." });
      }

      if (!isRuleCurrentlyActive(promoRule)) {
        return res.status(400).json({ error: "Promo code is not active right now." });
      }

      const usageLimit = promoRule.usage_limit === null ? null : Number(promoRule.usage_limit);
      const usageCount = Number(promoRule.usage_count || 0);
      if (Number.isInteger(usageLimit) && usageLimit > 0 && usageCount >= usageLimit) {
        return res.status(400).json({ error: "Promo code usage limit has been reached." });
      }

      if (total < Number(promoRule.min_order_amount || 0)) {
        return res.status(400).json({ error: `Promo code requires a minimum order of RM ${Number(promoRule.min_order_amount || 0).toFixed(2)}.` });
      }

      promoDiscount = calculateDiscountAmount(total, promoRule.discount_type, promoRule.amount);
      appliedPromoCode = promoRule.code;
      total = Math.max(0, total - promoDiscount);
    }

    if (total < 0) total = 0;

    return res.json({
      success: true,
      bundle_id: bundleId,
      subtotal: Number(subtotalBeforeRules.toFixed(2)),
      surcharge_total: Number(surchargeTotal.toFixed(2)),
      product_discount: Number(productDiscount.toFixed(2)),
      pricing_rule_adjustment: Number(pricingRuleAdjustment.toFixed(2)),
      promo_discount: Number(promoDiscount.toFixed(2)),
      total: Number(total.toFixed(2)),
      applied_promo_code: appliedPromoCode || null
    });
  } catch (error) {
    console.error("Bundle calculate failed:", error);
    return res.status(500).json({ error: "Failed to calculate bundle price." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed" });
  }

  next();
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: `Route not found: ${req.method} ${req.url}`
    });
  }

  if (req.accepts("html")) {
    return res.status(404).type("html").send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Page Not Found</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #172033; }
          a { color: #b32038; }
        </style>
      </head>
      <body>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <p><a href="/index.html">Go back to the homepage</a></p>
      </body>
      </html>
    `);
  }

  return res.status(404).type("text/plain").send("Not found");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
