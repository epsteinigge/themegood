const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const requiredEnv = ["DATABASE_URL", "ADMIN_PASSWORD", "JWT_SECRET"];
const missingEnvAfterDefault = requiredEnv.filter((key) => !process.env[key]);

if (missingEnvAfterDefault.length > 0) {
  const fallbackEnvFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
  dotenv.config({
    path: path.resolve(__dirname, fallbackEnvFile),
    override: false
  });
}

console.log("ENV CHECK", {
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  hasAdminPassword: !!process.env.ADMIN_PASSWORD,
  hasJwtSecret: !!process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV
});

console.log("SERVER STARTED");

const express = require("express");
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
const {
  calculateBundleTotal,
  detectBundlePricingProfile,
  getBundleOptionDisplayAdjustment,
  getCanonicalBundleSize,
  isCocoaFlavor,
  isPassionBeetrootFlavor,
  isNoSurchargeMixFlavor,
  isFreeCanSlot
} = require("./bundle-pricing");

const app = express();
const port = process.env.PORT || 3000;

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
const LOYALTY_POINTS_MIN = 0;
const LOYALTY_POINTS_MAX = 100000000;
const REFERRAL_BONUS_POINTS = 50;
const CUSTOMER_OTP_TTL_MINUTES = 5;
const CUSTOMER_OTP_MAX_ATTEMPTS = 5;
const CUSTOMER_OTP_MAX_REQUESTS_PER_10_MIN = 5;
const REFERRAL_CODE_MIN_LENGTH = 4;
const REFERRAL_CODE_MAX_LENGTH = 32;
const LOYALTY_REWARD_NAME_MAX_LENGTH = 255;
const LOYALTY_ADJUSTMENT_REASON_MAX_LENGTH = 500;
const LOYALTY_REWARD_TYPES = new Set(["fixed_discount", "free_gift"]);
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

const HOMEPAGE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const homepageVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: HOMEPAGE_VIDEO_MAX_BYTES,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(["video/mp4", "video/webm", "video/quicktime"]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only MP4, WEBM, and MOV videos are allowed"));
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

async function ensureHomepageSlideVideoColumn() {
  try {
    const tableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'homepage_slides'
      LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) return;

    await pool.query(`ALTER TABLE homepage_slides ADD COLUMN IF NOT EXISTS video_url TEXT`);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure homepage slide video column:", error);
  }
}

ensureHomepageSlideVideoColumn();

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

async function ensureLoyaltySchema() {
  try {
    const usersTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
      LIMIT 1
      `
    );

    const ordersTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'orders'
      LIMIT 1
      `
    );

    const productsTableResult = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products'
      LIMIT 1
      `
    );

    if (usersTableResult.rowCount === 0 || ordersTableResult.rowCount === 0) return;

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS lifetime_points_earned INTEGER NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS lifetime_points_redeemed INTEGER NOT NULL DEFAULT 0
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_points_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        points INTEGER NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_loyalty_points_transactions_nonnegative_points CHECK (points >= 0)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_loyalty_txn_customer
      ON loyalty_points_transactions(customer_id, created_at DESC)
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'earn'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_redeem_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'redeem'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_earn_reversal_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'earn_reversal'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_redeem_restore_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'redeem_restore'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referrer_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'referral_bonus_referrer'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referred_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'referral_bonus_referred'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referrer_reversal_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'referral_bonus_referrer_reversal'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referred_reversal_type
      ON loyalty_points_transactions(order_id, type)
      WHERE order_id IS NOT NULL AND type = 'referral_bonus_referred_reversal'
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_applied_at TIMESTAMP NULL
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_reward_granted_at TIMESTAMP NULL
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_reward_reversed_at TIMESTAMP NULL
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_reward_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_referral_code_upper
      ON users(UPPER(referral_code))
      WHERE referral_code IS NOT NULL AND referral_code <> ''
    `);
    await pool.query(`
      UPDATE users
      SET referral_code = CONCAT(
        'TG',
        UPPER(to_hex(id)),
        UPPER(SUBSTRING(md5(id::text), 1, 4))
      )
      WHERE referral_code IS NULL OR referral_code = ''
    `);

    if (productsTableResult.rowCount > 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS loyalty_rewards (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          reward_type VARCHAR(50) NOT NULL,
          points_required INTEGER NOT NULL,
          discount_value NUMERIC(10,2) NULL,
          gift_product_id INTEGER NULL REFERENCES products(id) ON DELETE RESTRICT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT ck_loyalty_rewards_type CHECK (reward_type IN ('fixed_discount', 'free_gift')),
          CONSTRAINT ck_loyalty_rewards_points_required CHECK (points_required > 0),
          CONSTRAINT ck_loyalty_rewards_value_combo CHECK (
            (reward_type = 'fixed_discount' AND discount_value IS NOT NULL AND discount_value > 0 AND gift_product_id IS NULL)
            OR
            (reward_type = 'free_gift' AND gift_product_id IS NOT NULL AND discount_value IS NULL)
          )
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active_sort
        ON loyalty_rewards(is_active, sort_order, points_required, id)
      `);

      // Keep FK semantics aligned with free_gift validation rules:
      // a gift-linked product cannot be deleted while referenced by a reward.
      await pool.query(`
        ALTER TABLE loyalty_rewards
        DROP CONSTRAINT IF EXISTS loyalty_rewards_gift_product_id_fkey
      `);
      await pool.query(`
        ALTER TABLE loyalty_rewards
        ADD CONSTRAINT loyalty_rewards_gift_product_id_fkey
        FOREIGN KEY (gift_product_id) REFERENCES products(id) ON DELETE RESTRICT
      `);

      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_reward_id INTEGER REFERENCES loyalty_rewards(id) ON DELETE SET NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_reward_type VARCHAR(50)
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_free_gift_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_redeemed_at TIMESTAMP NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_earn_reversed_at TIMESTAMP NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS loyalty_redeem_restored_at TIMESTAMP NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS referral_bonus_granted_at TIMESTAMP NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS referral_bonus_reversed_at TIMESTAMP NULL
      `);
      await pool.query(`
        ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS ck_orders_loyalty_points_nonnegative
      `);
      await pool.query(`
        ALTER TABLE orders
        ADD CONSTRAINT ck_orders_loyalty_points_nonnegative
        CHECK (COALESCE(loyalty_points_redeemed, 0) >= 0)
      `);
    }

    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure loyalty schema:", error);
  }
}

ensureLoyaltySchema();

async function ensureCustomerAuthSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_auth_otp_codes (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(32) NOT NULL,
        otp_hash VARCHAR(128) NOT NULL,
        delivery_channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_auth_otp_phone_created_at
      ON customer_auth_otp_codes(phone, created_at DESC)
    `);
    cachedSchemaCapabilities = null;
  } catch (error) {
    console.error("Failed to ensure customer auth schema:", error);
  }
}

ensureCustomerAuthSchema();

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhoneDigits(value) {
  return normalizeString(value).replace(/\D/g, "");
}

function normalizeCustomerAuthPhone(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("60")) return `+${digits}`;
  if (digits.startsWith("0")) return `+6${digits}`;
  return `+${digits}`;
}

function isValidCustomerAuthPhone(value) {
  const normalized = normalizeCustomerAuthPhone(value);
  const digits = normalizePhoneDigits(normalized);
  return Boolean(normalized) && digits.length >= 9 && digits.length <= PHONE_MAX_LENGTH;
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
      const slotLabel = normalizeString(row?.slot_label);
      const size = normalizeString(row?.size);
      const price = parseMoney(row?.price ?? 0);
      const extra = parseMoney(row?.extra ?? 0);
      const pricingNote = normalizeString(row?.pricing_note);
      const isFreeCan = normalizeBoolean(row?.is_free_can ?? false);

      if (
        !label ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(extra) ||
        extra < 0 ||
        isFreeCan === null
      ) {
        return null;
      }

      return {
        label: label.slice(0, ORDER_ITEM_NAME_MAX_LENGTH),
        slot_label: slotLabel.slice(0, ORDER_ITEM_NAME_MAX_LENGTH),
        size: size.slice(0, ORDER_ITEM_LABEL_MAX_LENGTH),
        price,
        extra,
        pricing_note: pricingNote.slice(0, ORDER_ITEM_NAME_MAX_LENGTH),
        is_free_can: Boolean(isFreeCan)
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

function resolveCustomerIdFromRequest(req = {}, options = {}) {
  const allowHeader = options.allowHeader !== false;
  const allowQuery = options.allowQuery !== false;

  const customerToken = normalizeString(req?.headers?.["x-customer-token"]) ||
    normalizeString(req?.headers?.authorization).replace(/^Bearer\s+/i, "");
  if (customerToken) {
    try {
      const decoded = jwt.verify(customerToken, process.env.JWT_SECRET);
      const fromToken = parseInteger(decoded?.customer_id ?? decoded?.id);
      if (Number.isInteger(fromToken) && fromToken > 0) return fromToken;
    } catch {
      // Ignore invalid token and continue with other resolvers.
    }
  }

  const fromUser = parseInteger(req?.user?.id);
  if (Number.isInteger(fromUser) && fromUser > 0) return fromUser;

  const fromCustomer = parseInteger(req?.customer?.id);
  if (Number.isInteger(fromCustomer) && fromCustomer > 0) return fromCustomer;

  if (allowHeader) {
    const fromHeader = parseInteger(req?.headers?.["x-customer-id"]);
    if (Number.isInteger(fromHeader) && fromHeader > 0) return fromHeader;
  }

  if (allowQuery) {
    const fromQuery = parseInteger(req?.query?.customer_id);
    if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  }

  return null;
}

function clampLoyaltyPoints(points) {
  const safe = Number.isFinite(Number(points)) ? Math.floor(Number(points)) : 0;
  if (safe < LOYALTY_POINTS_MIN) return LOYALTY_POINTS_MIN;
  return Math.min(safe, LOYALTY_POINTS_MAX);
}

function normalizeStatus(value) {
  return normalizeString(value).toLowerCase();
}

function getLoyaltyTransactionTypeLabel(type) {
  const normalized = normalizeString(type).toLowerCase();
  if (normalized === "earn") return "Earned from order";
  if (normalized === "redeem") return "Redeemed reward";
  if (normalized === "earn_reversal") return "Points reversed after refund/cancellation";
  if (normalized === "redeem_restore") return "Points restored after refund/cancellation";
  if (normalized === "admin_adjust_add") return "Bonus points added by admin";
  if (normalized === "admin_adjust_deduct") return "Points deducted by admin";
  if (normalized === "referral_bonus_referrer") return "Referral bonus earned (referrer)";
  if (normalized === "referral_bonus_referred") return "Referral bonus earned (referred customer)";
  if (normalized === "referral_bonus_referrer_reversal") return "Referral bonus reversed (referrer)";
  if (normalized === "referral_bonus_referred_reversal") return "Referral bonus reversed (referred customer)";
  return "Loyalty adjustment";
}

function normalizeReferralCode(value) {
  return normalizeString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateReferralCodeCandidate() {
  return `TG${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function generateCustomerOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCustomerOtp(phone, otp) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeCustomerAuthPhone(phone)}:${String(otp || "").trim()}:${process.env.JWT_SECRET}`)
    .digest("hex");
}

function signCustomerAuthToken(customerId) {
  return jwt.sign(
    { role: "customer", customer_id: Number(customerId) },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

async function sendCustomerWhatsappOtp(phone, otp) {
  const webhookUrl = normalizeString(process.env.WHATSAPP_OTP_WEBHOOK_URL);
  const message = `ThemeGood verification code: ${otp}. Expires in ${CUSTOMER_OTP_TTL_MINUTES} minutes.`;

  if (!webhookUrl) {
    console.info(`[OTP DEV] WhatsApp OTP for ${phone}: ${otp}`);
    return { sent: true, provider: "dev_log" };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      message,
      channel: "whatsapp"
    })
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`WhatsApp OTP delivery failed (${response.status}): ${payload}`);
  }

  return { sent: true, provider: "webhook" };
}

function buildReferralCodeFromCustomerId(customerId) {
  const id = parseInteger(customerId);
  if (!Number.isInteger(id) || id <= 0) return generateReferralCodeCandidate();
  const encodedId = id.toString(36).toUpperCase();
  const checksum = crypto
    .createHash("sha1")
    .update(String(id))
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
  return `TG${encodedId}${checksum}`;
}

async function ensureCustomerReferralCode(client, customerId) {
  const normalizedCustomerId = parseInteger(customerId);
  if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) return null;

  const userResult = await client.query(
    `
    SELECT id, referral_code
    FROM users
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedCustomerId]
  );

  if (userResult.rowCount === 0) return null;

  const existingCode = normalizeReferralCode(userResult.rows[0].referral_code);
  if (existingCode) return existingCode;

  const deterministicCode = buildReferralCodeFromCustomerId(normalizedCustomerId);
  try {
    const updateResult = await client.query(
      `
      UPDATE users
      SET referral_code = $1
      WHERE id = $2
      RETURNING referral_code
      `,
      [deterministicCode, normalizedCustomerId]
    );

    if (updateResult.rowCount > 0) {
      const savedCode = normalizeReferralCode(updateResult.rows[0].referral_code);
      if (savedCode) return savedCode;
    }
  } catch (error) {
    if (error?.code !== "23505") throw error;
  }

  // Fallback for rare collisions from legacy/manual values in older databases.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferralCodeCandidate();
    try {
      const updateResult = await client.query(
        `
        UPDATE users
        SET referral_code = $1
        WHERE id = $2
        RETURNING referral_code
        `,
        [candidate, normalizedCustomerId]
      );
      if (updateResult.rowCount > 0) {
        return normalizeReferralCode(updateResult.rows[0].referral_code) || candidate;
      }
    } catch (error) {
      if (error?.code !== "23505") throw error;
    }
  }

  throw new Error("Unable to generate a unique referral code.");
}

async function awardReferralBonusesForOrderIfEligible(client, orderId, schemaCapabilities = {}) {
  const normalizedOrderId = parseInteger(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) return { awarded: false, reason: "invalid_order_id" };
  if (!schemaCapabilities.hasUsersTable) return { awarded: false, reason: "users_table_missing" };
  if (!schemaCapabilities.hasOrderCustomerIdColumn) return { awarded: false, reason: "order_customer_id_missing" };
  if (!schemaCapabilities.hasUsersLoyaltyPointsColumns) return { awarded: false, reason: "users_loyalty_columns_missing" };
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) return { awarded: false, reason: "loyalty_txn_table_missing" };
  if (!schemaCapabilities.hasUsersReferralColumns) return { awarded: false, reason: "users_referral_columns_missing" };
  if (!schemaCapabilities.hasOrderReferralBonusColumns) return { awarded: false, reason: "order_referral_columns_missing" };

  const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
  const orderResult = await client.query(
    `
    SELECT
      id,
      customer_id,
      payment_status,
      ${deliveryStatusColumn} AS delivery_status,
      referral_bonus_granted_at,
      referral_bonus_reversed_at
    FROM orders
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedOrderId]
  );

  if (orderResult.rowCount === 0) return { awarded: false, reason: "order_not_found" };
  const order = orderResult.rows[0];
  if (!isLoyaltyAwardEligible(order)) return { awarded: false, reason: "order_not_eligible_yet" };
  if (order.referral_bonus_granted_at) return { awarded: false, reason: "already_awarded" };

  const referredCustomerId = parseInteger(order.customer_id);
  if (!Number.isInteger(referredCustomerId) || referredCustomerId <= 0) {
    return { awarded: false, reason: "guest_or_missing_customer_id" };
  }

  const referredUserResult = await client.query(
    `
    SELECT
      id,
      referred_by_user_id,
      referral_reward_granted_at,
      referral_reward_order_id
    FROM users
    WHERE id = $1
    FOR UPDATE
    `,
    [referredCustomerId]
  );

  if (referredUserResult.rowCount === 0) return { awarded: false, reason: "referred_user_not_found" };
  const referredUser = referredUserResult.rows[0];
  const referrerUserId = parseInteger(referredUser.referred_by_user_id);
  if (!Number.isInteger(referrerUserId) || referrerUserId <= 0) {
    return { awarded: false, reason: "no_referrer_assigned" };
  }
  if (referrerUserId === referredCustomerId) {
    return { awarded: false, reason: "invalid_self_referral" };
  }

  if (referredUser.referral_reward_granted_at) {
    await client.query(
      `
      UPDATE orders
      SET referral_bonus_granted_at = COALESCE(referral_bonus_granted_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      `,
      [normalizedOrderId]
    );
    return { awarded: false, reason: "already_awarded" };
  }

  const firstEligibleOrderResult = await client.query(
    `
    SELECT id
    FROM orders
    WHERE customer_id = $1
      AND LOWER(COALESCE(payment_status, '')) = 'paid'
      AND LOWER(COALESCE(${deliveryStatusColumn}, '')) = 'completed'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
    `,
    [referredCustomerId]
  );

  if (firstEligibleOrderResult.rowCount === 0) {
    return { awarded: false, reason: "no_eligible_order_found" };
  }
  if (parseInteger(firstEligibleOrderResult.rows[0].id) !== normalizedOrderId) {
    return { awarded: false, reason: "not_first_eligible_order" };
  }

  const referrerBonusInsert = await client.query(
    `
    INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
    VALUES ($1, $2, 'referral_bonus_referrer', $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING id
    `,
    [
      referrerUserId,
      normalizedOrderId,
      REFERRAL_BONUS_POINTS,
      `Referral bonus from referred customer's first eligible order #${normalizedOrderId}`
    ]
  );

  const referredBonusInsert = await client.query(
    `
    INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
    VALUES ($1, $2, 'referral_bonus_referred', $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING id
    `,
    [
      referredCustomerId,
      normalizedOrderId,
      REFERRAL_BONUS_POINTS,
      `Referral bonus for your first eligible order #${normalizedOrderId}`
    ]
  );

  if (referrerBonusInsert.rowCount === 0 && referredBonusInsert.rowCount === 0) {
    await client.query(
      `
      UPDATE users
      SET
        referral_reward_granted_at = COALESCE(referral_reward_granted_at, CURRENT_TIMESTAMP),
        referral_reward_order_id = COALESCE(referral_reward_order_id, $2)
      WHERE id = $1
      `,
      [referredCustomerId, normalizedOrderId]
    );
    await client.query(
      `
      UPDATE orders
      SET referral_bonus_granted_at = COALESCE(referral_bonus_granted_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      `,
      [normalizedOrderId]
    );
    return { awarded: false, reason: "already_awarded" };
  }

  if (referrerBonusInsert.rowCount !== referredBonusInsert.rowCount) {
    throw new Error("Referral bonus write conflict: partial insert detected.");
  }

  await client.query(
    `
    UPDATE users
    SET
      loyalty_points = COALESCE(loyalty_points, 0) + $1,
      lifetime_points_earned = COALESCE(lifetime_points_earned, 0) + $1
    WHERE id = ANY($2::int[])
    `,
    [REFERRAL_BONUS_POINTS, [referrerUserId, referredCustomerId]]
  );

  await client.query(
    `
    UPDATE users
    SET
      referral_reward_granted_at = COALESCE(referral_reward_granted_at, CURRENT_TIMESTAMP),
      referral_reward_order_id = COALESCE(referral_reward_order_id, $2),
      referral_reward_reversed_at = NULL
    WHERE id = $1
    `,
    [referredCustomerId, normalizedOrderId]
  );

  await client.query(
    `
    UPDATE orders
    SET
      referral_bonus_granted_at = COALESCE(referral_bonus_granted_at, CURRENT_TIMESTAMP),
      referral_bonus_reversed_at = NULL
    WHERE id = $1
    `,
    [normalizedOrderId]
  );

  return {
    awarded: true,
    referrerUserId,
    referredCustomerId,
    pointsAwardedEach: REFERRAL_BONUS_POINTS
  };
}

async function reverseReferralBonusesForOrderIfEligible(client, orderId, schemaCapabilities = {}) {
  const normalizedOrderId = parseInteger(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) return { changed: false, reason: "invalid_order_id" };
  if (!schemaCapabilities.hasUsersTable) return { changed: false, reason: "users_table_missing" };
  if (!schemaCapabilities.hasOrderCustomerIdColumn) return { changed: false, reason: "order_customer_id_missing" };
  if (!schemaCapabilities.hasUsersLoyaltyPointsColumns) return { changed: false, reason: "users_loyalty_columns_missing" };
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) return { changed: false, reason: "loyalty_txn_table_missing" };
  if (!schemaCapabilities.hasUsersReferralColumns) return { changed: false, reason: "users_referral_columns_missing" };
  if (!schemaCapabilities.hasOrderReferralBonusColumns) return { changed: false, reason: "order_referral_columns_missing" };

  const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
  const orderResult = await client.query(
    `
    SELECT
      id,
      customer_id,
      payment_status,
      ${deliveryStatusColumn} AS delivery_status,
      referral_bonus_reversed_at
    FROM orders
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedOrderId]
  );

  if (orderResult.rowCount === 0) return { changed: false, reason: "order_not_found" };
  const order = orderResult.rows[0];
  if (!isLoyaltyReversalEligible(order)) return { changed: false, reason: "order_not_reversal_eligible" };
  if (order.referral_bonus_reversed_at) return { changed: false, reason: "already_reversed" };

  const referredCustomerId = parseInteger(order.customer_id);
  if (!Number.isInteger(referredCustomerId) || referredCustomerId <= 0) {
    return { changed: false, reason: "guest_or_missing_customer_id" };
  }

  const userResult = await client.query(
    `
    SELECT id, referred_by_user_id
    FROM users
    WHERE id = $1
    FOR UPDATE
    `,
    [referredCustomerId]
  );

  if (userResult.rowCount === 0) return { changed: false, reason: "referred_user_not_found" };
  const referrerUserId = parseInteger(userResult.rows[0].referred_by_user_id);
  if (!Number.isInteger(referrerUserId) || referrerUserId <= 0) {
    return { changed: false, reason: "no_referrer_assigned" };
  }

  const referrerBonusResult = await client.query(
    `
    SELECT points
    FROM loyalty_points_transactions
    WHERE order_id = $1 AND type = 'referral_bonus_referrer'
    LIMIT 1
    `,
    [normalizedOrderId]
  );
  const referredBonusResult = await client.query(
    `
    SELECT points
    FROM loyalty_points_transactions
    WHERE order_id = $1 AND type = 'referral_bonus_referred'
    LIMIT 1
    `,
    [normalizedOrderId]
  );

  const referrerPoints = clampLoyaltyPoints(referrerBonusResult.rows[0]?.points);
  const referredPoints = clampLoyaltyPoints(referredBonusResult.rows[0]?.points);
  if (referrerPoints <= 0 && referredPoints <= 0) {
    return { changed: false, reason: "no_referral_bonus_to_reverse" };
  }

  let referrerReversed = false;
  let referredReversed = false;

  if (referrerPoints > 0) {
    const referrerReverseInsert = await client.query(
      `
      INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
      VALUES ($1, $2, 'referral_bonus_referrer_reversal', $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [
        referrerUserId,
        normalizedOrderId,
        referrerPoints,
        `Referral bonus reversed for referrer on refunded/cancelled order #${normalizedOrderId}`
      ]
    );
    if (referrerReverseInsert.rowCount > 0) {
      await client.query(
        `
        UPDATE users
        SET
          loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - $1),
          lifetime_points_earned = GREATEST(0, COALESCE(lifetime_points_earned, 0) - $1)
        WHERE id = $2
        `,
        [referrerPoints, referrerUserId]
      );
      referrerReversed = true;
    }
  }

  if (referredPoints > 0) {
    const referredReverseInsert = await client.query(
      `
      INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
      VALUES ($1, $2, 'referral_bonus_referred_reversal', $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [
        referredCustomerId,
        normalizedOrderId,
        referredPoints,
        `Referral bonus reversed for referred customer on refunded/cancelled order #${normalizedOrderId}`
      ]
    );
    if (referredReverseInsert.rowCount > 0) {
      await client.query(
        `
        UPDATE users
        SET
          loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - $1),
          lifetime_points_earned = GREATEST(0, COALESCE(lifetime_points_earned, 0) - $1),
          referral_reward_reversed_at = COALESCE(referral_reward_reversed_at, CURRENT_TIMESTAMP)
        WHERE id = $2
        `,
        [referredPoints, referredCustomerId]
      );
      referredReversed = true;
    }
  }

  await client.query(
    `
    UPDATE orders
    SET referral_bonus_reversed_at = COALESCE(referral_bonus_reversed_at, CASE WHEN EXISTS (
      SELECT 1 FROM loyalty_points_transactions
      WHERE order_id = $1
        AND type IN ('referral_bonus_referrer_reversal', 'referral_bonus_referred_reversal')
    ) THEN CURRENT_TIMESTAMP ELSE NULL END)
    WHERE id = $1
    `,
    [normalizedOrderId]
  );

  return {
    changed: referrerReversed || referredReversed,
    referrerReversed,
    referredReversed
  };
}

function toCsvCell(value) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function isLoyaltyAwardEligible(order = {}) {
  const paymentStatus = normalizeStatus(order.payment_status);
  const deliveryStatus = normalizeStatus(order.delivery_status);

  if (paymentStatus === "refunded" || deliveryStatus === "cancelled") return false;
  return paymentStatus === "paid" && deliveryStatus === "completed";
}

function isLoyaltyReversalEligible(order = {}) {
  const paymentStatus = normalizeStatus(order.payment_status);
  const deliveryStatus = normalizeStatus(order.delivery_status);
  return paymentStatus === "refunded" || deliveryStatus === "cancelled";
}

async function awardLoyaltyPointsForOrderIfEligible(client, orderId, schemaCapabilities = {}) {
  const normalizedOrderId = parseInteger(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) return { awarded: false, reason: "invalid_order_id" };
  if (!schemaCapabilities.hasUsersTable) return { awarded: false, reason: "users_table_missing" };
  if (!schemaCapabilities.hasOrderCustomerIdColumn) return { awarded: false, reason: "order_customer_id_missing" };
  if (!schemaCapabilities.hasUsersLoyaltyPointsColumns) return { awarded: false, reason: "users_loyalty_columns_missing" };
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) return { awarded: false, reason: "loyalty_txn_table_missing" };

  const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
  const shippingFeeSelect = schemaCapabilities.hasOrderShippingFeeColumn
    ? "COALESCE(shipping_fee, 0) AS shipping_fee"
    : "0::numeric AS shipping_fee";
  const deliveryFeeSelect = schemaCapabilities.hasOrderDeliveryFeeColumn
    ? "COALESCE(delivery_fee, 0) AS delivery_fee"
    : "0::numeric AS delivery_fee";

  const orderResult = await client.query(
    `
    SELECT
      id,
      customer_id,
      total_amount,
      payment_status,
      ${deliveryStatusColumn} AS delivery_status,
      ${shippingFeeSelect},
      ${deliveryFeeSelect}
    FROM orders
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedOrderId]
  );

  if (orderResult.rowCount === 0) return { awarded: false, reason: "order_not_found" };
  const order = orderResult.rows[0];

  const customerId = parseInteger(order.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) return { awarded: false, reason: "guest_or_missing_customer_id" };
  if (!isLoyaltyAwardEligible(order)) return { awarded: false, reason: "order_not_eligible_yet" };

  const eligibleSubtotal = Math.max(
    0,
    Number(order.total_amount || 0) - Number(order.shipping_fee || 0) - Number(order.delivery_fee || 0)
  );
  const pointsEarned = clampLoyaltyPoints(Math.floor(eligibleSubtotal));
  if (pointsEarned <= 0) return { awarded: false, reason: "zero_eligible_points" };

  const insertTxnResult = await client.query(
    `
    INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
    VALUES ($1, $2, 'earn', $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING id
    `,
    [customerId, normalizedOrderId, pointsEarned, `Earned from order #${normalizedOrderId}`]
  );

  if (insertTxnResult.rowCount === 0) {
    return { awarded: false, reason: "already_awarded" };
  }

  await client.query(
    `
    UPDATE users
    SET
      loyalty_points = COALESCE(loyalty_points, 0) + $1,
      lifetime_points_earned = COALESCE(lifetime_points_earned, 0) + $1
    WHERE id = $2
    `,
    [pointsEarned, customerId]
  );

  return {
    awarded: true,
    pointsEarned,
    customerId
  };
}

async function validateGiftProductAvailability(client, productId) {
  const normalizedProductId = parseInteger(productId);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) return false;

  const availabilityColumnsResult = await client.query(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
      ) AS has_is_active,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_hidden'
      ) AS has_is_hidden,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'deleted_at'
      ) AS has_deleted_at
    `
  );

  const flags = availabilityColumnsResult.rows[0] || {};
  const whereParts = ["id = $1"];
  if (flags.has_is_active) whereParts.push("is_active = TRUE");
  if (flags.has_is_hidden) whereParts.push("(is_hidden = FALSE OR is_hidden IS NULL)");
  if (flags.has_deleted_at) whereParts.push("deleted_at IS NULL");

  const productResult = await client.query(
    `
    SELECT id
    FROM products
    WHERE ${whereParts.join(" AND ")}
    LIMIT 1
    `,
    [normalizedProductId]
  );

  return productResult.rowCount > 0;
}

async function buildCheckoutLoyaltyApplication(client, schemaCapabilities = {}, options = {}) {
  const rewardId = parseInteger(options.rewardId);
  const customerId = parseInteger(options.customerId);
  const productSubtotal = parseMoney(options.productSubtotal);

  if (!Number.isInteger(rewardId) || rewardId <= 0) {
    return { value: null };
  }

  if (!schemaCapabilities.hasLoyaltyRewardsTable) {
    return { error: "Loyalty rewards storage is not ready.", status: 503 };
  }

  if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
    return { error: "User loyalty storage is not ready.", status: 503 };
  }

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { error: "Login is required to use a loyalty reward.", status: 401 };
  }

  if (!Number.isFinite(productSubtotal) || productSubtotal < 0) {
    return { error: "Product subtotal is invalid for loyalty reward application.", status: 400 };
  }

  const rewardResult = await client.query(
    `
    SELECT
      lr.id,
      lr.name,
      lr.reward_type,
      lr.points_required,
      lr.discount_value,
      lr.gift_product_id,
      p.name AS gift_product_name,
      p.image_url AS gift_product_image_url
    FROM loyalty_rewards lr
    LEFT JOIN products p ON p.id = lr.gift_product_id
    WHERE lr.id = $1
      AND lr.is_active = TRUE
    LIMIT 1
    `,
    [rewardId]
  );

  if (rewardResult.rowCount === 0) {
    return { error: "Selected loyalty reward was not found or is inactive.", status: 400 };
  }

  const reward = rewardResult.rows[0];
  const pointsRequired = clampLoyaltyPoints(reward.points_required);

  const customerResult = await client.query(
    `
    SELECT id, COALESCE(loyalty_points, 0) AS loyalty_points
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [customerId]
  );

  if (customerResult.rowCount === 0) {
    return { error: "Customer account not found.", status: 404 };
  }

  const customerPoints = clampLoyaltyPoints(customerResult.rows[0].loyalty_points);
  if (customerPoints < pointsRequired) {
    return { error: "Not enough loyalty points for this reward.", status: 400 };
  }

  if (reward.reward_type === "fixed_discount") {
    const discountValue = parseMoney(reward.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return { error: "Selected fixed discount reward is misconfigured.", status: 409 };
    }

    const appliedDiscount = Number(Math.min(discountValue, productSubtotal).toFixed(2));
    return {
      value: {
        reward_id: reward.id,
        reward_type: reward.reward_type,
        points_required: pointsRequired,
        discount_amount: appliedDiscount,
        free_gift_product_id: null,
        free_gift_product_name: null,
        free_gift_product_image_url: null
      }
    };
  }

  if (reward.reward_type === "free_gift") {
    const giftProductId = parseInteger(reward.gift_product_id);
    if (!Number.isInteger(giftProductId) || giftProductId <= 0 || !reward.gift_product_name) {
      return { error: "Selected free gift reward is misconfigured.", status: 409 };
    }

    const giftIsAvailable = await validateGiftProductAvailability(client, giftProductId);
    if (!giftIsAvailable) {
      return { error: "Selected free gift product is unavailable.", status: 409 };
    }

    return {
      value: {
        reward_id: reward.id,
        reward_type: reward.reward_type,
        points_required: pointsRequired,
        discount_amount: 0,
        free_gift_product_id: giftProductId,
        free_gift_product_name: reward.gift_product_name,
        free_gift_product_image_url: normalizeImageUrl(reward.gift_product_image_url)
      }
    };
  }

  return { error: "Selected reward type is invalid.", status: 400 };
}

async function redeemLoyaltyPointsForOrderIfEligible(client, orderId, schemaCapabilities = {}) {
  const normalizedOrderId = parseInteger(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) return { redeemed: false, reason: "invalid_order_id" };
  if (!schemaCapabilities.hasUsersTable) return { redeemed: false, reason: "users_table_missing" };
  if (!schemaCapabilities.hasOrderCustomerIdColumn) return { redeemed: false, reason: "order_customer_id_missing" };
  if (!schemaCapabilities.hasUsersLoyaltyPointsColumns) return { redeemed: false, reason: "users_loyalty_columns_missing" };
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) return { redeemed: false, reason: "loyalty_txn_table_missing" };
  if (!schemaCapabilities.hasOrderLoyaltyRewardIdColumn) return { redeemed: false, reason: "order_loyalty_reward_missing" };
  if (!schemaCapabilities.hasOrderLoyaltyPointsRedeemedColumn) return { redeemed: false, reason: "order_loyalty_points_missing" };
  if (!schemaCapabilities.hasOrderLoyaltyRedeemedAtColumn) return { redeemed: false, reason: "order_loyalty_redeemed_at_missing" };

  const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
  const orderResult = await client.query(
    `
    SELECT
      id,
      customer_id,
      payment_status,
      ${deliveryStatusColumn} AS delivery_status,
      loyalty_reward_id,
      loyalty_reward_type,
      COALESCE(loyalty_points_redeemed, 0) AS loyalty_points_redeemed,
      loyalty_redeemed_at
    FROM orders
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedOrderId]
  );

  if (orderResult.rowCount === 0) return { redeemed: false, reason: "order_not_found" };
  const order = orderResult.rows[0];

  if (!isLoyaltyAwardEligible(order)) return { redeemed: false, reason: "order_not_eligible_yet" };
  if (order.loyalty_redeemed_at) return { redeemed: false, reason: "already_redeemed" };

  const rewardId = parseInteger(order.loyalty_reward_id);
  const pointsToRedeem = clampLoyaltyPoints(order.loyalty_points_redeemed);
  if (!Number.isInteger(rewardId) || rewardId <= 0 || pointsToRedeem <= 0) {
    return { redeemed: false, reason: "no_loyalty_reward_selected" };
  }

  const customerId = parseInteger(order.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { redeemed: false, reason: "guest_or_missing_customer_id" };
  }

  const existingRedeemTxn = await client.query(
    `
    SELECT id
    FROM loyalty_points_transactions
    WHERE order_id = $1 AND type = 'redeem'
    LIMIT 1
    `,
    [normalizedOrderId]
  );

  if (existingRedeemTxn.rowCount > 0) {
    await client.query(
      `
      UPDATE orders
      SET loyalty_redeemed_at = COALESCE(loyalty_redeemed_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      `,
      [normalizedOrderId]
    );
    return { redeemed: false, reason: "already_redeemed" };
  }

  const deductResult = await client.query(
    `
    UPDATE users
    SET
      loyalty_points = COALESCE(loyalty_points, 0) - $1,
      lifetime_points_redeemed = COALESCE(lifetime_points_redeemed, 0) + $1
    WHERE id = $2
      AND COALESCE(loyalty_points, 0) >= $1
    RETURNING id
    `,
    [pointsToRedeem, customerId]
  );

  if (deductResult.rowCount === 0) {
    return { redeemed: false, reason: "insufficient_points_at_commit" };
  }

  const insertTxnResult = await client.query(
    `
    INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
    VALUES ($1, $2, 'redeem', $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING id
    `,
    [
      customerId,
      normalizedOrderId,
      pointsToRedeem,
      `Redeemed ${pointsToRedeem} points on order #${normalizedOrderId} (reward #${rewardId})`
    ]
  );

  if (insertTxnResult.rowCount === 0) {
    await client.query(
      `
      UPDATE users
      SET
        loyalty_points = COALESCE(loyalty_points, 0) + $1,
        lifetime_points_redeemed = GREATEST(0, COALESCE(lifetime_points_redeemed, 0) - $1)
      WHERE id = $2
      `,
      [pointsToRedeem, customerId]
    );
    return { redeemed: false, reason: "already_redeemed" };
  }

  await client.query(
    `
    UPDATE orders
    SET loyalty_redeemed_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [normalizedOrderId]
  );

  return {
    redeemed: true,
    customerId,
    rewardId,
    pointsRedeemed: pointsToRedeem
  };
}

async function reverseLoyaltyPointsForOrderIfEligible(client, orderId, schemaCapabilities = {}) {
  const normalizedOrderId = parseInteger(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) return { changed: false, reason: "invalid_order_id" };
  if (!schemaCapabilities.hasUsersTable) return { changed: false, reason: "users_table_missing" };
  if (!schemaCapabilities.hasOrderCustomerIdColumn) return { changed: false, reason: "order_customer_id_missing" };
  if (!schemaCapabilities.hasUsersLoyaltyPointsColumns) return { changed: false, reason: "users_loyalty_columns_missing" };
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) return { changed: false, reason: "loyalty_txn_table_missing" };
  if (!schemaCapabilities.hasOrderLoyaltyEarnReversedAtColumn) return { changed: false, reason: "order_loyalty_earn_reversed_at_missing" };
  if (!schemaCapabilities.hasOrderLoyaltyRedeemRestoredAtColumn) return { changed: false, reason: "order_loyalty_redeem_restored_at_missing" };

  const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
  const orderResult = await client.query(
    `
    SELECT
      id,
      customer_id,
      payment_status,
      ${deliveryStatusColumn} AS delivery_status,
      loyalty_earn_reversed_at,
      loyalty_redeem_restored_at
    FROM orders
    WHERE id = $1
    FOR UPDATE
    `,
    [normalizedOrderId]
  );

  if (orderResult.rowCount === 0) return { changed: false, reason: "order_not_found" };
  const order = orderResult.rows[0];
  const customerId = parseInteger(order.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) return { changed: false, reason: "guest_or_missing_customer_id" };
  if (!isLoyaltyReversalEligible(order)) return { changed: false, reason: "order_not_reversal_eligible" };

  let earnReversed = false;
  let redeemRestored = false;

  if (!order.loyalty_earn_reversed_at) {
    const earnTxnResult = await client.query(
      `
      SELECT points
      FROM loyalty_points_transactions
      WHERE order_id = $1 AND type = 'earn'
      LIMIT 1
      `,
      [normalizedOrderId]
    );

    if (earnTxnResult.rowCount > 0) {
      const earnPoints = clampLoyaltyPoints(earnTxnResult.rows[0].points);
      if (earnPoints > 0) {
        const earnReversalTxnResult = await client.query(
          `
          INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
          VALUES ($1, $2, 'earn_reversal', $3, $4)
          ON CONFLICT DO NOTHING
          RETURNING id
          `,
          [customerId, normalizedOrderId, earnPoints, `Reversed earned points for order #${normalizedOrderId}`]
        );

        if (earnReversalTxnResult.rowCount > 0) {
          await client.query(
            `
            UPDATE users
            SET
              loyalty_points = COALESCE(loyalty_points, 0) - $1,
              lifetime_points_earned = GREATEST(0, COALESCE(lifetime_points_earned, 0) - $1)
            WHERE id = $2
            `,
            [earnPoints, customerId]
          );
          earnReversed = true;
        }
      }
    }

    await client.query(
      `
      UPDATE orders
      SET loyalty_earn_reversed_at = COALESCE(loyalty_earn_reversed_at, CASE WHEN EXISTS (
        SELECT 1
        FROM loyalty_points_transactions
        WHERE order_id = $1 AND type = 'earn_reversal'
      ) THEN CURRENT_TIMESTAMP ELSE NULL END)
      WHERE id = $1
      `,
      [normalizedOrderId]
    );
  }

  if (!order.loyalty_redeem_restored_at) {
    const redeemTxnResult = await client.query(
      `
      SELECT points
      FROM loyalty_points_transactions
      WHERE order_id = $1 AND type = 'redeem'
      LIMIT 1
      `,
      [normalizedOrderId]
    );

    if (redeemTxnResult.rowCount > 0) {
      const redeemedPoints = clampLoyaltyPoints(redeemTxnResult.rows[0].points);
      if (redeemedPoints > 0) {
        const restoreTxnResult = await client.query(
          `
          INSERT INTO loyalty_points_transactions (customer_id, order_id, type, points, description)
          VALUES ($1, $2, 'redeem_restore', $3, $4)
          ON CONFLICT DO NOTHING
          RETURNING id
          `,
          [customerId, normalizedOrderId, redeemedPoints, `Restored redeemed points for order #${normalizedOrderId}`]
        );

        if (restoreTxnResult.rowCount > 0) {
          await client.query(
            `
            UPDATE users
            SET
              loyalty_points = COALESCE(loyalty_points, 0) + $1,
              lifetime_points_redeemed = GREATEST(0, COALESCE(lifetime_points_redeemed, 0) - $1)
            WHERE id = $2
            `,
            [redeemedPoints, customerId]
          );
          redeemRestored = true;
        }
      }
    }

    await client.query(
      `
      UPDATE orders
      SET loyalty_redeem_restored_at = COALESCE(loyalty_redeem_restored_at, CASE WHEN EXISTS (
        SELECT 1
        FROM loyalty_points_transactions
        WHERE order_id = $1 AND type = 'redeem_restore'
      ) THEN CURRENT_TIMESTAMP ELSE NULL END)
      WHERE id = $1
      `,
      [normalizedOrderId]
    );
  }

  return {
    changed: earnReversed || redeemRestored,
    earnReversed,
    redeemRestored
  };
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

function getBundleSlotNote(profile, slotIndex, slots = [], requiredSize = "") {
  if (isFreeCanSlot(slotIndex, slots, profile)) {
    return "Free can slot. Cocoa flavour is not allowed here.";
  }

  if (profile === "five_800g_discounted") {
    return "The discounted 5th-can price is applied automatically after all flavours are selected.";
  }

  if (profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") {
    return "Final pricing updates after all paid and free can flavours are selected.";
  }

  if (profile === "two_800g_one_300g" && getCanonicalBundleSize(requiredSize) === "300g") {
    return "300g add-on pricing updates automatically when Cocoa is chosen.";
  }

  if (profile === "two_800g_one_300g" && getCanonicalBundleSize(requiredSize) === "800g") {
    return "Cocoa 800g selections update the bundle total automatically.";
  }

  return "";
}

function getBundleOptionNote(profile, option, displayAdjustment) {
  if (profile === "two_800g_one_300g" && Number.isFinite(displayAdjustment) && displayAdjustment > 0) {
    return `Adds RM ${Number(displayAdjustment).toFixed(2)} to this bundle.`;
  }

  if (profile === "five_800g_discounted" && isCocoaFlavor(option?.product_name)) {
    return "Cocoa changes the package total once all 5 cans are selected.";
  }

  if (
    (profile === "five_800g_discounted" || profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") &&
    isPassionBeetrootFlavor(option?.product_name)
  ) {
    return "Passion Beetroot gets its qualifying 5+ can bundle discount automatically.";
  }

  if (
    (profile === "six_plus_one_800g" || profile === "twelve_plus_three_800g") &&
    isNoSurchargeMixFlavor(option?.product_name)
  ) {
    return "Allowed in both paid and free-can slots.";
  }

  return "";
}

async function hasProductVariantBundleExtraPriceColumn(client = pool) {
  const result = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_variants'
      AND column_name = 'bundle_extra_price'
    LIMIT 1
    `
  );

  return result.rowCount > 0;
}

async function fetchBundleContext(bundleId, schemaCapabilities = {}, client = pool) {
  if (!Number.isInteger(bundleId) || bundleId <= 0) {
    return { error: "Bundle ID is invalid." };
  }

  if (
    !schemaCapabilities.hasBundleSlotsTable ||
    !schemaCapabilities.hasBundlePricingRulesTable ||
    !schemaCapabilities.hasProductTypeColumn
  ) {
    return { error: "Bundle schema is not available yet." };
  }

  if (!schemaCapabilities.hasProductVariantsTable) {
    return { error: "Product variants table is required for bundle pricing." };
  }

  const productResult = await client.query(
    `
    SELECT id, name, price, product_type
    FROM products
    WHERE id = $1
    LIMIT 1
    `,
    [bundleId]
  );

  if (productResult.rowCount === 0) {
    return { error: "Bundle product not found.", status: 404 };
  }

  const bundleProduct = productResult.rows[0];
  if (String(bundleProduct.product_type || "single").toLowerCase() !== "bundle") {
    return { error: "Selected product is not a bundle." };
  }

  const slotsResult = await client.query(
    `
    SELECT id, slot_label, required_size, sort_order
    FROM bundle_slots
    WHERE bundle_product_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [bundleId]
  );

  const slots = slotsResult.rows.map((slot) => ({
    ...slot,
    required_size: getCanonicalBundleSize(slot.required_size)
  }));

  if (!slots.length) {
    return { error: "Bundle slots were not found." };
  }

  const pricingRuleResult = await client.query(
    `
    SELECT pricing_type, amount, COALESCE(cocoa_extra_amount, 0) AS cocoa_extra_amount
    FROM bundle_pricing_rules
    WHERE bundle_product_id = $1
    LIMIT 1
    `,
    [bundleId]
  );

  return {
    bundleProduct,
    slots,
    pricingRule: pricingRuleResult.rows[0] || { pricing_type: "sum", amount: 0, cocoa_extra_amount: 0 },
    profile: detectBundlePricingProfile(bundleProduct.name, slots)
  };
}

async function fetchBundleSelectableVariants(bundleId, bundleProduct, slots = [], schemaCapabilities = {}, client = pool) {
  const requiredSizes = [...new Set(
    (Array.isArray(slots) ? slots : [])
      .map((slot) => getCanonicalBundleSize(slot.required_size))
      .filter(Boolean)
  )];

  if (!requiredSizes.length) {
    return {
      bundleSlots: [],
      selectableVariantsBySize: {},
      profile: detectBundlePricingProfile(bundleProduct?.name || "", slots)
    };
  }

  await ensureStandardSizeVariantsForBundleSizes(requiredSizes, schemaCapabilities, client);

  const hasBundleExtraPriceColumn = await hasProductVariantBundleExtraPriceColumn(client);
  const bundleExtraPriceSelect = hasBundleExtraPriceColumn
    ? "COALESCE(pv.bundle_extra_price, 0) AS bundle_extra_price"
    : "0::numeric AS bundle_extra_price";
  const selectableProductTypeCondition = schemaCapabilities.hasProductTypeColumn
    ? "AND COALESCE(p.product_type, 'single') = 'single'"
    : "";
  const profile = detectBundlePricingProfile(bundleProduct?.name || "", slots);

  const selectableResult = await client.query(
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
      AND LOWER(REGEXP_REPLACE(COALESCE(pv.name, ''), '\\s+', '', 'g')) = ANY($2::text[])
    ORDER BY p.name ASC, pv.sort_order ASC, pv.id ASC
    `,
    [bundleId, requiredSizes.map((size) => size.toLowerCase())]
  );

  const selectableVariantsBySize = Object.fromEntries(requiredSizes.map((size) => [size, []]));

  selectableResult.rows.forEach((row) => {
    const sizeKey = getCanonicalBundleSize(row.size_name);
    if (!sizeKey || !Object.prototype.hasOwnProperty.call(selectableVariantsBySize, sizeKey)) {
      return;
    }

    const displayAdjustment = getBundleOptionDisplayAdjustment({
      profile,
      sizeName: row.size_name,
      flavorName: row.product_name,
      configuredAmount: row.bundle_extra_price
    });

    selectableVariantsBySize[sizeKey].push({
      ...row,
      size_name: sizeKey,
      // Keep server quote aligned with storefront bundle pricing previews.
      // For current bundle profiles, `displayAdjustment` carries cocoa/slot adjustments.
      bundle_extra_price: Number.isFinite(displayAdjustment) ? displayAdjustment : 0,
      bundle_display_adjustment: Number.isFinite(displayAdjustment) ? displayAdjustment : null,
      bundle_price_note: getBundleOptionNote(profile, row, displayAdjustment)
    });
  });

  const bundleSlots = slots.map((slot, index) => {
    const slotChoices = (selectableVariantsBySize[slot.required_size] || [])
      .filter((choice) => !isFreeCanSlot(index, slots, profile) || !isCocoaFlavor(choice.product_name))
      .map((choice) => ({ ...choice }));

    return {
      ...slot,
      is_free_can_slot: isFreeCanSlot(index, slots, profile),
      slot_note: getBundleSlotNote(profile, index, slots, slot.required_size),
      selectable_variants: slotChoices
    };
  });

  return { bundleSlots, selectableVariantsBySize, profile };
}

async function calculateBundlePricingQuote({
  bundleId,
  selections = [],
  promoCodeInput = "",
  schemaCapabilities = {},
  client = pool
}) {
  const context = await fetchBundleContext(bundleId, schemaCapabilities, client);
  if (context.error) {
    return context;
  }

  const { bundleProduct, slots, pricingRule, profile } = context;
  const selectableData = await fetchBundleSelectableVariants(
    bundleId,
    bundleProduct,
    slots,
    schemaCapabilities,
    client
  );
  const normalizedSelections = Array.isArray(selections) ? selections : [];

  if (normalizedSelections.length !== slots.length) {
    return { error: "Please complete all bundle selections." };
  }

  const slotMap = new Map((selectableData.bundleSlots || slots).map((slot) => [Number(slot.id), slot]));
  const orderedSelections = [];

  for (const slot of slots) {
    const item = normalizedSelections.find((entry) => parseInteger(entry?.slot_id) === Number(slot.id));
    const variantId = parseInteger(item?.variant_id);

    if (!item || !Number.isInteger(variantId) || variantId <= 0) {
      return { error: "One or more selected variants are invalid." };
    }

    orderedSelections.push({
      slot_id: Number(slot.id),
      variant_id: variantId
    });
  }
  const fallbackVariantIds = [...new Set(
    orderedSelections
      .map((item) => item.variant_id)
      .filter((variantId) => Number.isInteger(variantId) && variantId > 0)
  )];
  let fallbackVariantMap = new Map();

  if (fallbackVariantIds.length > 0) {
    const hasBundleExtraPriceColumn = await hasProductVariantBundleExtraPriceColumn(client);
    const bundleExtraPriceSelect = hasBundleExtraPriceColumn
      ? "COALESCE(pv.bundle_extra_price, 0) AS bundle_extra_price"
      : "0::numeric AS bundle_extra_price";
    const fallbackVariantResult = await client.query(
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
      [fallbackVariantIds]
    );

    fallbackVariantMap = new Map(
      fallbackVariantResult.rows.map((variant) => [Number(variant.id), variant])
    );
  }
  const pricingSelections = [];

  for (let index = 0; index < orderedSelections.length; index += 1) {
    const selection = orderedSelections[index];
    const slot = slotMap.get(selection.slot_id);
    const variantFromSlot = Array.isArray(slot?.selectable_variants)
      ? slot.selectable_variants.find((entry) => Number(entry?.id) === Number(selection.variant_id))
      : null;
    const variant = variantFromSlot || fallbackVariantMap.get(selection.variant_id);

    if (!slot || !variant) {
      return { error: "One or more selected variants do not exist." };
    }

    if (Number(variant.stock || 0) <= 0) {
      return { error: `${variant.product_name || variant.name || "Selected item"} is out of stock` };
    }

    const variantSize = variant.size_name || variant.name || variant.size || "";
    if (getCanonicalBundleSize(variantSize) !== getCanonicalBundleSize(slot.required_size)) {
      return { error: `${slot.slot_label || "This slot"} requires ${slot.required_size}.` };
    }

    pricingSelections.push({
      slot_id: selection.slot_id,
      variant_id: selection.variant_id,
      slot_label: slot.slot_label,
      label: variant.product_name,
      product_name: variant.product_name,
      size_name: variantSize,
      bundle_extra_price: Number(variant.bundle_extra_price || 0)
    });
  }

  const pricingSummary = calculateBundleTotal({
    bundleName: bundleProduct.name,
    bundlePrice: bundleProduct.price,
    slots,
    selections: pricingSelections
  });

  if (pricingSummary.validation_errors.length > 0) {
    return { error: pricingSummary.validation_errors[0] };
  }

  const subtotalBeforeRules = Number(pricingSummary.subtotal || 0);
  let productDiscount = 0;
  let promoDiscount = 0;
  let appliedPromoCode = "";

  if (schemaCapabilities.hasProductDiscountRulesTable) {
    const discountRuleResult = await client.query(
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
      const promoCodeResult = await client.query(
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
      return { error: "Promo code is invalid for this bundle." };
    }

    if (!isRuleCurrentlyActive(promoRule)) {
      return { error: "Promo code is not active right now." };
    }

    const usageLimit = promoRule.usage_limit === null ? null : Number(promoRule.usage_limit);
    const usageCount = Number(promoRule.usage_count || 0);
    if (Number.isInteger(usageLimit) && usageLimit > 0 && usageCount >= usageLimit) {
      return { error: "Promo code usage limit has been reached." };
    }

    if (total < Number(promoRule.min_order_amount || 0)) {
      return { error: `Promo code requires a minimum order of RM ${Number(promoRule.min_order_amount || 0).toFixed(2)}.` };
    }

    promoDiscount = calculateDiscountAmount(total, promoRule.discount_type, promoRule.amount);
    appliedPromoCode = promoRule.code;
    total = Math.max(0, total - promoDiscount);
  }

  return {
    success: true,
    bundle_id: bundleId,
    bundle_profile: profile,
    base_bundle_price: Number(pricingSummary.base_price || 0),
    subtotal: Number(subtotalBeforeRules.toFixed(2)),
    surcharge_total: Number(pricingSummary.surcharge_total.toFixed(2)),
    product_discount: Number(productDiscount.toFixed(2)),
    pricing_rule_adjustment: Number(pricingRuleAdjustment.toFixed(2)),
    promo_discount: Number(promoDiscount.toFixed(2)),
    total: Number(total.toFixed(2)),
    applied_promo_code: appliedPromoCode || null,
    breakdown: pricingSummary.breakdown.map((row) => ({
      ...row,
      price: Number(Number(row.price || 0).toFixed(2)),
      extra: Number(Number(row.extra || 0).toFixed(2))
    }))
  };
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
      orderItemBundleDetailsColumnResult,
      usersTableResult,
      usersLoyaltyPointsColumnResult,
      usersLifetimePointsEarnedColumnResult,
      usersLifetimePointsRedeemedColumnResult,
      loyaltyPointsTransactionsTableResult,
      loyaltyRewardsTableResult,
      orderCustomerIdColumnResult,
      orderShippingFeeColumnResult,
      orderDeliveryFeeColumnResult,
      orderLoyaltyRewardIdColumnResult,
      orderLoyaltyRewardTypeColumnResult,
      orderLoyaltyPointsRedeemedColumnResult,
      orderLoyaltyDiscountAmountColumnResult,
      orderLoyaltyFreeGiftProductIdColumnResult,
      orderLoyaltyRedeemedAtColumnResult,
      orderLoyaltyEarnReversedAtColumnResult,
      orderLoyaltyRedeemRestoredAtColumnResult,
      usersReferralCodeColumnResult,
      usersReferredByUserIdColumnResult,
      usersReferralAppliedAtColumnResult,
      usersReferralRewardGrantedAtColumnResult,
      usersReferralRewardReversedAtColumnResult,
      usersReferralRewardOrderIdColumnResult,
      orderReferralBonusGrantedAtColumnResult,
      orderReferralBonusReversedAtColumnResult
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
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'loyalty_points'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'lifetime_points_earned'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'lifetime_points_redeemed'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'loyalty_points_transactions'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'loyalty_rewards'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_fee'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_fee'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_reward_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_reward_type'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_points_redeemed'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_discount_amount'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_free_gift_product_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_redeemed_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_earn_reversed_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'loyalty_redeem_restored_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_code'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by_user_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_applied_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_granted_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_reversed_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_order_id'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'referral_bonus_granted_at'
        LIMIT 1
        `
      ),
      pool.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'referral_bonus_reversed_at'
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
      hasOrderItemBundleDetailsColumn: orderItemBundleDetailsColumnResult.rowCount > 0,
      hasUsersTable: usersTableResult.rowCount > 0,
      hasUsersLoyaltyPointsColumns:
        usersLoyaltyPointsColumnResult.rowCount > 0 &&
        usersLifetimePointsEarnedColumnResult.rowCount > 0 &&
        usersLifetimePointsRedeemedColumnResult.rowCount > 0,
      hasLoyaltyPointsTransactionsTable: loyaltyPointsTransactionsTableResult.rowCount > 0,
      hasLoyaltyRewardsTable: loyaltyRewardsTableResult.rowCount > 0,
      hasOrderCustomerIdColumn: orderCustomerIdColumnResult.rowCount > 0,
      hasOrderShippingFeeColumn: orderShippingFeeColumnResult.rowCount > 0,
      hasOrderDeliveryFeeColumn: orderDeliveryFeeColumnResult.rowCount > 0,
      hasOrderLoyaltyRewardIdColumn: orderLoyaltyRewardIdColumnResult.rowCount > 0,
      hasOrderLoyaltyRewardTypeColumn: orderLoyaltyRewardTypeColumnResult.rowCount > 0,
      hasOrderLoyaltyPointsRedeemedColumn: orderLoyaltyPointsRedeemedColumnResult.rowCount > 0,
      hasOrderLoyaltyDiscountAmountColumn: orderLoyaltyDiscountAmountColumnResult.rowCount > 0,
      hasOrderLoyaltyFreeGiftProductIdColumn: orderLoyaltyFreeGiftProductIdColumnResult.rowCount > 0,
      hasOrderLoyaltyRedeemedAtColumn: orderLoyaltyRedeemedAtColumnResult.rowCount > 0,
      hasOrderLoyaltyEarnReversedAtColumn: orderLoyaltyEarnReversedAtColumnResult.rowCount > 0,
      hasOrderLoyaltyRedeemRestoredAtColumn: orderLoyaltyRedeemRestoredAtColumnResult.rowCount > 0,
      hasUsersReferralColumns:
        usersReferralCodeColumnResult.rowCount > 0 &&
        usersReferredByUserIdColumnResult.rowCount > 0 &&
        usersReferralAppliedAtColumnResult.rowCount > 0 &&
        usersReferralRewardGrantedAtColumnResult.rowCount > 0 &&
        usersReferralRewardReversedAtColumnResult.rowCount > 0 &&
        usersReferralRewardOrderIdColumnResult.rowCount > 0,
      hasOrderReferralBonusColumns:
        orderReferralBonusGrantedAtColumnResult.rowCount > 0 &&
        orderReferralBonusReversedAtColumnResult.rowCount > 0
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
      hasOrderItemBundleDetailsColumn: false,
      hasUsersTable: false,
      hasUsersLoyaltyPointsColumns: false,
      hasLoyaltyPointsTransactionsTable: false,
      hasLoyaltyRewardsTable: false,
      hasOrderCustomerIdColumn: false,
      hasOrderShippingFeeColumn: false,
      hasOrderDeliveryFeeColumn: false,
      hasOrderLoyaltyRewardIdColumn: false,
      hasOrderLoyaltyRewardTypeColumn: false,
      hasOrderLoyaltyPointsRedeemedColumn: false,
      hasOrderLoyaltyDiscountAmountColumn: false,
      hasOrderLoyaltyFreeGiftProductIdColumn: false,
      hasOrderLoyaltyRedeemedAtColumn: false,
      hasOrderLoyaltyEarnReversedAtColumn: false,
      hasOrderLoyaltyRedeemRestoredAtColumn: false,
      hasUsersReferralColumns: false,
      hasOrderReferralBonusColumns: false
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
        AND REGEXP_REPLACE(LOWER(COALESCE(name, '')), '\\s+', '', 'g') = ANY($3::text[])
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
  const videoUrl = normalizeString(payload.video_url);
  const buttonPrimaryText = normalizeString(payload.button_primary_text || "Buy Now");
  const buttonPrimaryLink = normalizeString(payload.button_primary_link || "#products");
  const buttonSecondaryText = normalizeString(payload.button_secondary_text || "Learn More");
  const buttonSecondaryLink = normalizeString(payload.button_secondary_link || "#about");
  const sortOrder = parseInteger(payload.sort_order ?? 0);
  const isActive = normalizeBoolean(payload.is_active ?? true);

  if (requireId && (!Number.isInteger(id) || id <= 0)) {
    return { error: "Homepage slide ID is invalid." };
  }

  if (!imageUrl && !videoUrl) {
    return { error: "Either an image URL or video URL is required." };
  }

  if (imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: "Image URL must be valid." };
  }

  if (videoUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: "Video URL must be valid." };
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
      video_url: videoUrl,
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

  if (!sectionKey) {
    return { error: "Section key is required." };
  }

  if (isActive === null) {
    return { error: "Active status is invalid." };
  }

  return {
    value: {
      id: Number.isInteger(id) && id > 0 ? id : null,
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

  const normalizedItems = [];

  for (const item of items) {
    const packageLabel = normalizeString(item?.packageLabel).toLowerCase();
    const isBundleCandidate = (
      (item?.productId && Number.isInteger(Number(item.productId))) &&
      (
        packageLabel.includes("bundle") ||
        (Array.isArray(item?.bundleSelections) && item.bundleSelections.length > 0) ||
        (Array.isArray(item?.bundleBreakdown) && item.bundleBreakdown.length > 0)
      )
    );

    if (!isBundleCandidate) {
      normalizedItems.push(item);
      continue;
    }

    const productId = parseInteger(item.productId);
    const bundleSelections = Array.isArray(item.bundleSelections) ? item.bundleSelections : [];

    if (!Number.isInteger(productId) || productId <= 0 || bundleSelections.length === 0) {
      return { error: "Please complete all bundle selections before checkout." };
    }

    const pricingQuote = await calculateBundlePricingQuote({
      bundleId: productId,
      selections: bundleSelections,
      promoCodeInput: normalizeString(item.bundlePromoCode).toUpperCase(),
      schemaCapabilities,
      client
    });

    if (pricingQuote.error) {
      return { error: pricingQuote.error };
    }

    if (Math.abs(Number(item.price || 0) - Number(pricingQuote.total || 0)) > 0.01) {
      return { error: "Bundle pricing changed. Please refresh your cart before checkout." };
    }

    normalizedItems.push({
      ...item,
      price: Number(pricingQuote.total || 0),
      bundleBreakdown: Array.isArray(pricingQuote.breakdown) ? pricingQuote.breakdown : []
    });
  }

  return { value: normalizedItems };
}

function validateCheckoutPayload(payload) {
  const customerIdRaw = payload.customer_id;
  const customerId = customerIdRaw === null || customerIdRaw === undefined || customerIdRaw === ""
    ? null
    : parseInteger(customerIdRaw);
  const loyaltyRewardIdRaw = payload.loyalty_reward_id ?? payload.selected_reward_id;
  const loyaltyRewardIdsRaw = payload.loyalty_reward_ids ?? payload.selected_reward_ids;
  const loyaltyRewardId = loyaltyRewardIdRaw === null || loyaltyRewardIdRaw === undefined || loyaltyRewardIdRaw === ""
    ? null
    : parseInteger(loyaltyRewardIdRaw);
  const loyaltyRewardIds = Array.isArray(loyaltyRewardIdsRaw)
    ? loyaltyRewardIdsRaw
      .map((value) => parseInteger(value))
      .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const customerName = normalizeString(payload.customer_name);
  const phone = normalizeString(payload.phone);
  const address = normalizeString(payload.address);
  const totalAmount = parseMoney(payload.total_amount);
  const itemsResult = validateCheckoutItems(payload.items);

  if (customerIdRaw !== null && customerIdRaw !== undefined && customerIdRaw !== "") {
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return { error: "Customer ID is invalid." };
    }
  }

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

  if (Array.isArray(loyaltyRewardIdsRaw) && loyaltyRewardIdsRaw.length > 1) {
    return { error: "Only one loyalty reward can be selected per order." };
  }

  if (loyaltyRewardIds.length > 1) {
    return { error: "Only one loyalty reward can be selected per order." };
  }

  if (
    Number.isInteger(loyaltyRewardId) &&
    loyaltyRewardId > 0 &&
    loyaltyRewardIds.length === 1 &&
    loyaltyRewardIds[0] !== loyaltyRewardId
  ) {
    return { error: "Only one loyalty reward can be selected per order." };
  }

  const finalLoyaltyRewardId = Number.isInteger(loyaltyRewardId) && loyaltyRewardId > 0
    ? loyaltyRewardId
    : (loyaltyRewardIds.length === 1 ? loyaltyRewardIds[0] : null);

  if (loyaltyRewardIdRaw !== null && loyaltyRewardIdRaw !== undefined && loyaltyRewardIdRaw !== "") {
    if (!Number.isInteger(loyaltyRewardId) || loyaltyRewardId <= 0) {
      return { error: "loyalty_reward_id must be a valid positive integer." };
    }
  }

  if (itemsResult.error) {
    return itemsResult;
  }

  return {
    value: {
      customer_id: customerId,
      customer_name: customerName,
      phone,
      address,
      total_amount: totalAmount,
      items: itemsResult.value,
      loyalty_reward_id: finalLoyaltyRewardId
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

function normalizeLoyaltyRewardType(value) {
  const type = normalizeString(value).toLowerCase();
  return LOYALTY_REWARD_TYPES.has(type) ? type : "";
}

function validateLoyaltyRewardPayload(payload, options = {}) {
  const requireId = options.requireId === true;
  const rewardId = parseInteger(payload.id ?? payload.reward_id);
  const name = normalizeString(payload.name);
  const rewardType = normalizeLoyaltyRewardType(payload.reward_type);
  const pointsRequired = parseInteger(payload.points_required);
  const discountValue = parseOptionalMoney(payload.discount_value);
  const giftProductIdRaw = payload.gift_product_id;
  const giftProductId = giftProductIdRaw === null || giftProductIdRaw === undefined || giftProductIdRaw === ""
    ? null
    : parseInteger(giftProductIdRaw);
  const isActive = normalizeBoolean(payload.is_active ?? true);
  const sortOrder = parseInteger(payload.sort_order ?? 0);

  if (requireId && (!Number.isInteger(rewardId) || rewardId <= 0)) {
    return { error: "Reward ID is invalid." };
  }

  if (!name || name.length > LOYALTY_REWARD_NAME_MAX_LENGTH) {
    return { error: `Reward name must be 1-${LOYALTY_REWARD_NAME_MAX_LENGTH} characters long.` };
  }

  if (!rewardType) {
    return { error: "Reward type must be either fixed_discount or free_gift." };
  }

  if (!Number.isInteger(pointsRequired) || pointsRequired <= 0 || pointsRequired > LOYALTY_POINTS_MAX) {
    return { error: `Points required must be a whole number between 1 and ${LOYALTY_POINTS_MAX}.` };
  }

  if (giftProductIdRaw !== null && giftProductIdRaw !== undefined && giftProductIdRaw !== "") {
    if (!Number.isInteger(giftProductId) || giftProductId <= 0) {
      return { error: "Gift product ID must be a valid positive integer." };
    }
  }

  if (isActive === null) {
    return { error: "Reward active status is invalid." };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < SORT_ORDER_MIN || sortOrder > SORT_ORDER_MAX) {
    return { error: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}.` };
  }

  if (rewardType === "fixed_discount") {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return { error: "fixed_discount rewards require discount_value > 0." };
    }
    if (giftProductId !== null) {
      return { error: "fixed_discount rewards must not include gift_product_id." };
    }
  }

  if (rewardType === "free_gift") {
    if (!Number.isInteger(giftProductId) || giftProductId <= 0) {
      return { error: "free_gift rewards require gift_product_id." };
    }
    if (discountValue !== null) {
      return { error: "free_gift rewards must not include discount_value." };
    }
  }

  return {
    value: {
      id: rewardId,
      name,
      reward_type: rewardType,
      points_required: pointsRequired,
      discount_value: rewardType === "fixed_discount" ? discountValue : null,
      gift_product_id: rewardType === "free_gift" ? giftProductId : null,
      is_active: Boolean(isActive),
      sort_order: sortOrder
    }
  };
}

function validateLoyaltyRewardPreviewPayload(payload = {}) {
  const rewardId = parseInteger(payload.reward_id ?? payload.selected_reward_id);
  const selectedRewardIdsRaw = payload.reward_ids ?? payload.selected_reward_ids;
  const selectedRewardIds = Array.isArray(selectedRewardIdsRaw)
    ? selectedRewardIdsRaw
      .map((value) => parseInteger(value))
      .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const subtotalAmount = parseMoney(payload.subtotal_amount);
  const totalAmount = parseOptionalMoney(payload.total_amount);
  const shippingAmount = parseOptionalMoney(payload.shipping_amount);

  if (Array.isArray(selectedRewardIdsRaw) && selectedRewardIdsRaw.length > 1) {
    return { error: "Only one loyalty reward can be selected." };
  }

  if (selectedRewardIds.length > 1) {
    return { error: "Only one loyalty reward can be selected." };
  }

  const selectedRewardId = Number.isInteger(rewardId) && rewardId > 0
    ? rewardId
    : (selectedRewardIds.length === 1 ? selectedRewardIds[0] : NaN);

  if (
    Number.isInteger(rewardId) &&
    rewardId > 0 &&
    selectedRewardIds.length === 1 &&
    selectedRewardIds[0] !== rewardId
  ) {
    return { error: "Only one loyalty reward can be selected." };
  }

  if (!Number.isInteger(selectedRewardId) || selectedRewardId <= 0) {
    return { error: "A valid reward_id is required for preview." };
  }

  if (!Number.isFinite(subtotalAmount)) {
    return { error: "subtotal_amount must be a valid number." };
  }

  if (subtotalAmount < TOTAL_AMOUNT_MIN || subtotalAmount > TOTAL_AMOUNT_MAX) {
    return { error: `subtotal_amount must be between ${TOTAL_AMOUNT_MIN} and ${TOTAL_AMOUNT_MAX}.` };
  }

  if (Number.isFinite(totalAmount) && (totalAmount < TOTAL_AMOUNT_MIN || totalAmount > TOTAL_AMOUNT_MAX)) {
    return { error: `total_amount must be between ${TOTAL_AMOUNT_MIN} and ${TOTAL_AMOUNT_MAX}.` };
  }

  if (Number.isFinite(shippingAmount) && (shippingAmount < TOTAL_AMOUNT_MIN || shippingAmount > TOTAL_AMOUNT_MAX)) {
    return { error: `shipping_amount must be between ${TOTAL_AMOUNT_MIN} and ${TOTAL_AMOUNT_MAX}.` };
  }

  if (Number.isFinite(totalAmount) && totalAmount + 0.01 < subtotalAmount) {
    return { error: "total_amount cannot be less than subtotal_amount." };
  }

  if (Number.isFinite(totalAmount) && Number.isFinite(shippingAmount)) {
    const expectedTotal = Number((subtotalAmount + shippingAmount).toFixed(2));
    if (Math.abs(expectedTotal - totalAmount) > 0.01) {
      return { error: "total_amount must match subtotal_amount + shipping_amount." };
    }
  }

  let derivedShippingAmount = 0;
  if (Number.isFinite(shippingAmount)) {
    derivedShippingAmount = shippingAmount;
  } else if (Number.isFinite(totalAmount)) {
    derivedShippingAmount = Number((totalAmount - subtotalAmount).toFixed(2));
  }

  if (!Number.isFinite(derivedShippingAmount) || derivedShippingAmount < 0) {
    return { error: "shipping_amount is invalid for the provided subtotal/total." };
  }

  return {
    value: {
      reward_id: selectedRewardId,
      subtotal_amount: Number(subtotalAmount.toFixed(2)),
      total_amount: Number((subtotalAmount + derivedShippingAmount).toFixed(2)),
      shipping_amount: Number(derivedShippingAmount.toFixed(2))
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

async function processUploadedVideo(file) {
  const extensionMap = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };
  const extension = extensionMap[file.mimetype] || path.extname(file.originalname || "") || ".mp4";
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const outputPath = path.join(uploadDir, filename);

  await fs.promises.writeFile(outputPath, file.buffer);

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

const handleCustomerRequestOtp = async (req, res) => {
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable) {
      return res.status(503).json({ error: "Customer auth storage is not ready." });
    }

    const phoneRaw = req.body?.phone;
    if (!isValidCustomerAuthPhone(phoneRaw)) {
      return res.status(400).json({ error: "Phone number is invalid." });
    }
    const phone = normalizeCustomerAuthPhone(phoneRaw);

    await client.query("BEGIN");
    const recentCountResult = await client.query(
      `
      SELECT COUNT(*)::int AS recent_count
      FROM customer_auth_otp_codes
      WHERE phone = $1
        AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      `,
      [phone]
    );
    const recentCount = Number(recentCountResult.rows[0]?.recent_count || 0);
    if (recentCount >= CUSTOMER_OTP_MAX_REQUESTS_PER_10_MIN) {
      await client.query("ROLLBACK");
      return res.status(429).json({ error: "Too many OTP requests. Please try again later." });
    }

    const otp = generateCustomerOtpCode();
    const otpHash = hashCustomerOtp(phone, otp);
    await client.query(
      `
      INSERT INTO customer_auth_otp_codes (phone, otp_hash, delivery_channel, expires_at)
      VALUES ($1, $2, 'whatsapp', CURRENT_TIMESTAMP + INTERVAL '${CUSTOMER_OTP_TTL_MINUTES} minutes')
      `,
      [phone, otpHash]
    );

    await sendCustomerWhatsappOtp(phone, otp);
    await client.query("COMMIT");

    return res.json({
      success: true,
      channel: "whatsapp",
      expires_in_seconds: CUSTOMER_OTP_TTL_MINUTES * 60
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Request customer OTP failed:", error);
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Customer auth storage is not ready." });
    }
    return res.status(500).json({ error: "Failed to request OTP." });
  } finally {
    client.release();
  }
};

app.post("/api/customer/auth/request-otp", handleCustomerRequestOtp);
// Backward-compatible aliases for environments using older OTP paths.
app.post("/api/customer/request-otp", handleCustomerRequestOtp);
app.post("/api/customer/auth/request_otp", handleCustomerRequestOtp);

const handleCustomerVerifyOtp = async (req, res) => {
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable) {
      return res.status(503).json({ error: "Customer auth storage is not ready." });
    }

    const phoneRaw = req.body?.phone;
    const otp = normalizeString(req.body?.otp);
    const nameInput = normalizeString(req.body?.name);
    const emailInput = normalizeString(req.body?.email).toLowerCase();
    if (!isValidCustomerAuthPhone(phoneRaw)) {
      return res.status(400).json({ error: "Phone number is invalid." });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "OTP must be 6 digits." });
    }
    if (emailInput && !isValidEmail(emailInput)) {
      return res.status(400).json({ error: "Email is invalid." });
    }

    const phone = normalizeCustomerAuthPhone(phoneRaw);
    const phoneDigits = normalizePhoneDigits(phone);
    const otpHash = hashCustomerOtp(phone, otp);

    await client.query("BEGIN");
    const otpResult = await client.query(
      `
      SELECT id, otp_hash, attempt_count, expires_at, used_at
      FROM customer_auth_otp_codes
      WHERE phone = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [phone]
    );

    if (otpResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "OTP is invalid or expired." });
    }

    const otpRow = otpResult.rows[0];
    const expired = new Date(otpRow.expires_at).getTime() < Date.now();
    if (otpRow.used_at || expired || Number(otpRow.attempt_count || 0) >= CUSTOMER_OTP_MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "OTP is invalid or expired." });
    }

    if (otpRow.otp_hash !== otpHash) {
      await client.query(
        `
        UPDATE customer_auth_otp_codes
        SET attempt_count = COALESCE(attempt_count, 0) + 1
        WHERE id = $1
        `,
        [otpRow.id]
      );
      await client.query("COMMIT");
      return res.status(400).json({ error: "OTP is invalid or expired." });
    }

    await client.query(
      `
      UPDATE customer_auth_otp_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [otpRow.id]
    );

    const userColumnsResult = await client.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
        ) AS has_phone
      `
    );
    const userColumns = userColumnsResult.rows[0] || {};
    if (!userColumns.has_phone) {
      await client.query("ROLLBACK");
      return res.status(503).json({ error: "Users phone column is required for phone login." });
    }

    const userLookupResult = await client.query(
      `
      SELECT
        id,
        ${userColumns.has_name ? "COALESCE(name, '') AS name" : "''::text AS name"},
        ${userColumns.has_email ? "COALESCE(email, '') AS email" : "''::text AS email"},
        phone
      FROM users
      WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = $1
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
      `,
      [phoneDigits]
    );

    let customer = userLookupResult.rows[0] || null;
    if (!customer) {
      const fallbackName = nameInput || `Customer ${phoneDigits.slice(-4)}`;
      const insertColumns = ["phone"];
      const insertValues = [phone];
      if (userColumns.has_name) {
        insertColumns.push("name");
        insertValues.push(fallbackName);
      }
      if (userColumns.has_email) {
        insertColumns.push("email");
        insertValues.push(emailInput || null);
      }

      const insertResult = await client.query(
        `
        INSERT INTO users (${insertColumns.join(", ")})
        VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(", ")})
        RETURNING
          id,
          ${userColumns.has_name ? "COALESCE(name, '') AS name" : "''::text AS name"},
          ${userColumns.has_email ? "COALESCE(email, '') AS email" : "''::text AS email"},
          phone
        `,
        insertValues
      );
      customer = insertResult.rows[0];
    }

    if (schemaCapabilities.hasUsersReferralColumns) {
      await ensureCustomerReferralCode(client, customer.id);
    }

    await client.query("COMMIT");

    const token = signCustomerAuthToken(customer.id);
    return res.json({
      success: true,
      token,
      customer: {
        id: Number(customer.id || 0),
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || phone
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Verify customer OTP failed:", error);
    return res.status(500).json({ error: "Failed to verify OTP." });
  } finally {
    client.release();
  }
};

app.post("/api/customer/auth/verify-otp", handleCustomerVerifyOtp);
// Backward-compatible aliases for environments using older OTP paths.
app.post("/api/customer/verify-otp", handleCustomerVerifyOtp);
app.post("/api/customer/auth/verify_otp", handleCustomerVerifyOtp);

app.get("/api/customer/auth/me", async (req, res) => {
  try {
    const customerId = resolveCustomerIdFromRequest(req, { allowQuery: false, allowHeader: true });
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const userColumnsResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
        ) AS has_phone
      `
    );
    const userColumns = userColumnsResult.rows[0] || {};

    const accountResult = await pool.query(
      `
      SELECT
        id,
        ${userColumns.has_name ? "COALESCE(name, '') AS name" : "''::text AS name"},
        ${userColumns.has_email ? "COALESCE(email, '') AS email" : "''::text AS email"},
        ${userColumns.has_phone ? "COALESCE(phone, '') AS phone" : "''::text AS phone"}
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    if (accountResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer not found." });
    }

    return res.json({ customer: accountResult.rows[0] });
  } catch (error) {
    console.error("Fetch customer auth me failed:", error);
    return res.status(500).json({ error: "Failed to fetch customer session." });
  }
});

app.post("/api/customer/auth/logout", async (req, res) => {
  return res.json({ success: true, message: "Logged out." });
});

app.post("/api/checkout", async (req, res) => {
  console.log("NEW ORDER RECEIVED");
  console.log(req.body);

  const validation = validateCheckoutPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { customer_id, customer_name, phone, address, total_amount, items, loyalty_reward_id } = validation.value;
  const client = await pool.connect();

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const bundleValidation = await validateBundleCheckoutItems(items, schemaCapabilities, client);
    if (bundleValidation.error) {
      return res.status(400).json({ error: bundleValidation.error });
    }

    const normalizedItems = Array.isArray(bundleValidation.value) ? bundleValidation.value : items;
    const recalculatedProductSubtotal = Number(normalizedItems
      .reduce((sum, item) => sum + (Number(item.price || 0) * Math.max(1, Number(item.quantity || 1))), 0)
      .toFixed(2));

    const authenticatedCustomerId = resolveCustomerIdFromRequest(req, { allowQuery: false });
    if (Number.isInteger(loyalty_reward_id) && loyalty_reward_id > 0 && (!Number.isInteger(authenticatedCustomerId) || authenticatedCustomerId <= 0)) {
      return res.status(401).json({ error: "Login is required to use loyalty rewards at checkout." });
    }

    const effectiveCustomerId = Number.isInteger(authenticatedCustomerId) && authenticatedCustomerId > 0
      ? authenticatedCustomerId
      : customer_id;
    const loyaltyCustomerId = Number.isInteger(authenticatedCustomerId) && authenticatedCustomerId > 0
      ? authenticatedCustomerId
      : null;

    if (
      Number.isInteger(loyalty_reward_id) && loyalty_reward_id > 0 &&
      Number.isInteger(customer_id) && customer_id > 0 &&
      Number.isInteger(authenticatedCustomerId) && authenticatedCustomerId > 0 &&
      customer_id !== authenticatedCustomerId
    ) {
      return res.status(400).json({ error: "Checkout customer context is invalid for loyalty reward usage." });
    }

    let loyaltyApplication = null;
    if (Number.isInteger(loyalty_reward_id) && loyalty_reward_id > 0) {
      if (!Number.isInteger(loyaltyCustomerId) || loyaltyCustomerId <= 0) {
        return res.status(401).json({ error: "Login is required to use loyalty rewards at checkout." });
      }

      if (!schemaCapabilities.hasOrderCustomerIdColumn) {
        return res.status(503).json({ error: "Order customer loyalty linkage is not ready." });
      }

      const loyaltyColumnsReady =
        schemaCapabilities.hasOrderLoyaltyRewardIdColumn &&
        schemaCapabilities.hasOrderLoyaltyRewardTypeColumn &&
        schemaCapabilities.hasOrderLoyaltyPointsRedeemedColumn &&
        schemaCapabilities.hasOrderLoyaltyDiscountAmountColumn &&
        schemaCapabilities.hasOrderLoyaltyFreeGiftProductIdColumn &&
        schemaCapabilities.hasOrderLoyaltyRedeemedAtColumn;

      if (!loyaltyColumnsReady) {
        return res.status(503).json({ error: "Order loyalty storage is not ready." });
      }

      const loyaltyResult = await buildCheckoutLoyaltyApplication(
        client,
        schemaCapabilities,
        {
          rewardId: loyalty_reward_id,
          customerId: loyaltyCustomerId,
          productSubtotal: recalculatedProductSubtotal
        }
      );

      if (loyaltyResult.error) {
        return res.status(loyaltyResult.status || 400).json({ error: loyaltyResult.error });
      }

      loyaltyApplication = loyaltyResult.value;
    }

    const loyaltyDiscountAmount = Number(loyaltyApplication?.discount_amount || 0);
    const recalculatedTotalAmount = Number(Math.max(0, recalculatedProductSubtotal - loyaltyDiscountAmount).toFixed(2));

    if (Math.abs(recalculatedTotalAmount - Number(total_amount || 0)) > 0.01) {
      return res.status(400).json({ error: "Checkout total is out of date. Please refresh your cart before placing the order." });
    }

    await client.query("BEGIN");

    const orderColumns = ["customer_name", "phone", "address", "total_amount"];
    const orderValues = [customer_name, phone, address, recalculatedTotalAmount];
    if (schemaCapabilities.hasOrderCustomerIdColumn && Number.isInteger(effectiveCustomerId) && effectiveCustomerId > 0) {
      orderColumns.unshift("customer_id");
      orderValues.unshift(effectiveCustomerId);
    }

    if (loyaltyApplication) {
      orderColumns.push(
        "loyalty_reward_id",
        "loyalty_reward_type",
        "loyalty_points_redeemed",
        "loyalty_discount_amount",
        "loyalty_free_gift_product_id"
      );
      orderValues.push(
        loyaltyApplication.reward_id,
        loyaltyApplication.reward_type,
        loyaltyApplication.points_required,
        loyaltyApplication.discount_amount,
        loyaltyApplication.free_gift_product_id
      );
    }

    const orderResult = await client.query(
      `
      INSERT INTO orders (${orderColumns.join(", ")})
      VALUES (${orderValues.map((_, index) => `$${index + 1}`).join(", ")})
      RETURNING id
      `,
      orderValues
    );

    const orderId = orderResult.rows[0].id;

    for (const item of normalizedItems) {
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

    if (loyaltyApplication?.reward_type === "free_gift" && loyaltyApplication.free_gift_product_name) {
      const loyaltyGiftProductName = `${loyaltyApplication.free_gift_product_name} (Loyalty Reward)`;
      if (schemaCapabilities.hasOrderItemBundleDetailsColumn) {
        await client.query(
          `
          INSERT INTO order_items
          (order_id, product_name, quantity, unit_price, size_label, package_label, bundle_details)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            orderId,
            loyaltyGiftProductName,
            1,
            0,
            "",
            "Loyalty reward",
            null
          ]
        );
      } else {
        const giftColumns = ["order_id", "product_name", "quantity", "unit_price", "size_label", "package_label"];
        const giftValues = [orderId, loyaltyGiftProductName, 1, 0, "", "Loyalty reward"];

        if (schemaCapabilities.hasOrderItemBundleSelectionsColumn) {
          giftColumns.push("bundle_selections");
          giftValues.push(JSON.stringify([]));
        }

        if (schemaCapabilities.hasOrderItemBundleBreakdownColumn) {
          giftColumns.push("bundle_breakdown");
          giftValues.push(JSON.stringify([]));
        }

        await client.query(
          `
          INSERT INTO order_items
          (${giftColumns.join(", ")})
          VALUES (${giftValues.map((_, index) => `$${index + 1}`).join(", ")})
          `,
          giftValues
        );
      }
    }

    const loyaltyRedeemResult = await redeemLoyaltyPointsForOrderIfEligible(client, orderId, schemaCapabilities);
    if (loyaltyRedeemResult.reason === "insufficient_points_at_commit") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Loyalty reward redemption failed because the customer no longer has enough points."
      });
    }
    await awardLoyaltyPointsForOrderIfEligible(client, orderId, schemaCapabilities);
    await awardReferralBonusesForOrderIfEligible(client, orderId, schemaCapabilities);

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

app.get("/api/customer/account", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable) {
      return res.status(503).json({ error: "User account storage is not ready." });
    }

    const customerId = resolveCustomerIdFromRequest(req);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Customer ID is invalid." });
    }

    const loyaltyPointsSelect = schemaCapabilities.hasUsersLoyaltyPointsColumns
      ? "COALESCE(loyalty_points, 0) AS loyalty_points, COALESCE(lifetime_points_earned, 0) AS lifetime_points_earned, COALESCE(lifetime_points_redeemed, 0) AS lifetime_points_redeemed"
      : "0::integer AS loyalty_points, 0::integer AS lifetime_points_earned, 0::integer AS lifetime_points_redeemed";

    const accountResult = await pool.query(
      `
      SELECT id, ${loyaltyPointsSelect}
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    if (accountResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    res.json({ account: accountResult.rows[0] });
  } catch (error) {
    console.error("Fetch customer account failed:", error);
    res.status(500).json({ error: "Failed to fetch customer account." });
  }
});

app.get("/api/customer/referral", async (req, res) => {
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns || !schemaCapabilities.hasUsersReferralColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }

    const customerId = resolveCustomerIdFromRequest(req, { allowQuery: false });
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(401).json({ error: "Login is required." });
    }

    await client.query("BEGIN");
    const referralCode = await ensureCustomerReferralCode(client, customerId);
    if (!referralCode) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Customer account not found." });
    }

    const customerResult = await client.query(
      `
      SELECT
        id,
        referral_code,
        referred_by_user_id,
        referral_applied_at::text AS referral_applied_at,
        referral_reward_granted_at::text AS referral_reward_granted_at,
        referral_reward_reversed_at::text AS referral_reward_reversed_at,
        referral_reward_order_id
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    const summaryResult = await client.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE referral_reward_granted_at IS NOT NULL)::int AS successful_referrals_count,
        COUNT(*) FILTER (WHERE referral_reward_granted_at IS NULL)::int AS pending_referrals_count
      FROM users
      WHERE referred_by_user_id = $1
      `,
      [customerId]
    );

    await client.query("COMMIT");

    const customer = customerResult.rows[0] || {};
    const summary = summaryResult.rows[0] || {};

    return res.json({
      referral: {
        referral_code: normalizeReferralCode(customer.referral_code) || referralCode,
        referred_by_user_id: customer.referred_by_user_id ? Number(customer.referred_by_user_id) : null,
        referral_applied_at: customer.referral_applied_at || null,
        referral_reward_granted_at: customer.referral_reward_granted_at || null,
        referral_reward_reversed_at: customer.referral_reward_reversed_at || null,
        referral_reward_order_id: customer.referral_reward_order_id ? Number(customer.referral_reward_order_id) : null,
        successful_referrals_count: Number(summary.successful_referrals_count || 0),
        pending_referrals_count: Number(summary.pending_referrals_count || 0),
        referral_bonus_points: REFERRAL_BONUS_POINTS
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Fetch customer referral info failed:", error);
    if (error?.code === "42703" || isMissingRelationError(error)) {
      return res.status(503).json({ error: "Referral storage is not ready." });
    }
    return res.status(500).json({ error: "Failed to fetch referral info." });
  } finally {
    client.release();
  }
});

app.post("/api/customer/referral/apply", async (req, res) => {
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasOrderCustomerIdColumn || !schemaCapabilities.hasUsersReferralColumns) {
      return res.status(503).json({ error: "Referral storage is not ready." });
    }

    const customerId = resolveCustomerIdFromRequest(req, { allowQuery: false });
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(401).json({ error: "Login is required." });
    }

    const referralCodeInput = normalizeReferralCode(req.body?.referral_code);
    if (
      !referralCodeInput ||
      referralCodeInput.length < REFERRAL_CODE_MIN_LENGTH ||
      referralCodeInput.length > REFERRAL_CODE_MAX_LENGTH
    ) {
      return res.status(400).json({ error: "referral_code is invalid." });
    }

    await client.query("BEGIN");

    const customerResult = await client.query(
      `
      SELECT id, referral_code, referred_by_user_id
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Customer account not found." });
    }

    const customer = customerResult.rows[0];
    await ensureCustomerReferralCode(client, customerId);

    if (parseInteger(customer.referred_by_user_id) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Referral code is already applied for this customer." });
    }

    const deliveryStatusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
    const hasEligibleCompletedOrderResult = await client.query(
      `
      SELECT 1
      FROM orders
      WHERE customer_id = $1
        AND LOWER(COALESCE(payment_status, '')) = 'paid'
        AND LOWER(COALESCE(${deliveryStatusColumn}, '')) = 'completed'
      LIMIT 1
      `,
      [customerId]
    );

    if (hasEligibleCompletedOrderResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Referral code can only be applied before the first eligible completed order." });
    }

    const referrerResult = await client.query(
      `
      SELECT id, referral_code
      FROM users
      WHERE UPPER(COALESCE(referral_code, '')) = $1
      LIMIT 1
      `,
      [referralCodeInput]
    );

    if (referrerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Referral code was not found." });
    }

    const referrer = referrerResult.rows[0];
    const referrerId = parseInteger(referrer.id);
    if (!Number.isInteger(referrerId) || referrerId <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Referral code is invalid." });
    }

    if (referrerId === customerId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Self-referral is not allowed." });
    }

    await client.query(
      `
      UPDATE users
      SET
        referred_by_user_id = $1,
        referral_applied_at = COALESCE(referral_applied_at, CURRENT_TIMESTAMP)
      WHERE id = $2
      `,
      [referrerId, customerId]
    );

    await client.query("COMMIT");
    return res.json({
      success: true,
      message: "Referral code applied successfully.",
      referral: {
        referred_by_user_id: referrerId,
        referral_code: normalizeReferralCode(referrer.referral_code)
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Apply referral code failed:", error);
    if (error?.code === "42703" || isMissingRelationError(error)) {
      return res.status(503).json({ error: "Referral storage is not ready." });
    }
    return res.status(500).json({ error: "Failed to apply referral code." });
  } finally {
    client.release();
  }
});

app.get("/api/customer/loyalty-transactions", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }
    if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
      return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
    }

    const customerId = resolveCustomerIdFromRequest(req);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Customer ID is invalid." });
    }

    const limitRaw = parseInteger(req.query?.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

    const customerResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    const txResult = await pool.query(
      `
      SELECT
        id,
        customer_id,
        order_id,
        type,
        points,
        description,
        created_at::text AS created_at
      FROM loyalty_points_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [customerId, limit]
    );

    const transactions = txResult.rows.map((row) => ({
      ...row,
      type_label: getLoyaltyTransactionTypeLabel(row.type)
    }));

    res.json({ transactions });
  } catch (error) {
    console.error("Fetch customer loyalty transactions failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
    }
    res.status(500).json({ error: "Failed to fetch loyalty transactions." });
  }
});

app.get("/api/admin/customers/loyalty", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }

    const search = normalizeString(req.query?.search).toLowerCase();
    const limitRaw = parseInteger(req.query?.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const offsetRaw = parseInteger(req.query?.offset);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const usersColumnsResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
        ) AS has_phone,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_code'
        ) AS has_referral_code,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by_user_id'
        ) AS has_referred_by_user_id,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_granted_at'
        ) AS has_referral_reward_granted_at
      `
    );
    const usersColumns = usersColumnsResult.rows[0] || {};
    const nameSelect = usersColumns.has_name ? "COALESCE(u.name, '') AS name" : "''::text AS name";
    const phoneSelect = usersColumns.has_phone ? "COALESCE(u.phone, '') AS phone" : "''::text AS phone";
    const emailSelect = usersColumns.has_email ? "COALESCE(u.email, '') AS email" : "''::text AS email";
    const referralCodeSelect = usersColumns.has_referral_code
      ? "COALESCE(u.referral_code, '') AS referral_code"
      : "''::text AS referral_code";
    const referredBySelect = usersColumns.has_referred_by_user_id
      ? "u.referred_by_user_id"
      : "NULL::int AS referred_by_user_id";
    const referredByNameSelect = (usersColumns.has_referred_by_user_id && usersColumns.has_name)
      ? "COALESCE(rb.name, '') AS referred_by_name"
      : "''::text AS referred_by_name";
    const referralGrantedAtSelect = usersColumns.has_referral_reward_granted_at
      ? "u.referral_reward_granted_at::text AS referral_reward_granted_at"
      : "NULL::text AS referral_reward_granted_at";
    const successfulReferralsSelect = usersColumns.has_referred_by_user_id && usersColumns.has_referral_reward_granted_at
      ? `(
          SELECT COUNT(*)::int
          FROM users ru
          WHERE ru.referred_by_user_id = u.id
            AND ru.referral_reward_granted_at IS NOT NULL
        ) AS successful_referrals_count`
      : "0::int AS successful_referrals_count";
    const pendingReferralsSelect = usersColumns.has_referred_by_user_id && usersColumns.has_referral_reward_granted_at
      ? `(
          SELECT COUNT(*)::int
          FROM users ru
          WHERE ru.referred_by_user_id = u.id
            AND ru.referral_reward_granted_at IS NULL
        ) AS pending_referrals_count`
      : "0::int AS pending_referrals_count";
    const referredByJoin = usersColumns.has_referred_by_user_id
      ? "LEFT JOIN users rb ON rb.id = u.referred_by_user_id"
      : "";
    const searchPredicates = ["CAST(u.id AS text) ILIKE $2"];
    if (usersColumns.has_name) searchPredicates.push("COALESCE(u.name, '') ILIKE $2");
    if (usersColumns.has_phone) searchPredicates.push("COALESCE(u.phone, '') ILIKE $2");
    if (usersColumns.has_email) searchPredicates.push("COALESCE(u.email, '') ILIKE $2");

    const usersResult = await pool.query(
      `
      SELECT
        u.id,
        ${nameSelect},
        ${phoneSelect},
        ${emailSelect},
        ${referralCodeSelect},
        ${referredBySelect},
        ${referralGrantedAtSelect},
        ${referredByNameSelect},
        COALESCE(u.loyalty_points, 0) AS loyalty_points,
        COALESCE(u.lifetime_points_earned, 0) AS lifetime_points_earned,
        COALESCE(u.lifetime_points_redeemed, 0) AS lifetime_points_redeemed,
        ${successfulReferralsSelect},
        ${pendingReferralsSelect}
      FROM users u
      ${referredByJoin}
      WHERE
        $1 = ''
        OR (${searchPredicates.join(" OR ")})
      ORDER BY u.id DESC
      LIMIT $3
      OFFSET $4
      `,
      [search, `%${search}%`, limit, offset]
    );

    res.json({ customers: usersResult.rows });
  } catch (error) {
    console.error("Fetch admin customer loyalty list failed:", error);
    res.status(500).json({ error: "Failed to fetch customer loyalty list." });
  }
});

app.get("/api/admin/customers/:id/loyalty-transactions", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }
    if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
      return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
    }

    const customerId = parseInteger(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Customer ID is invalid." });
    }

    const limitRaw = parseInteger(req.query?.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const usersColumnsResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
        ) AS has_phone,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_code'
        ) AS has_referral_code,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by_user_id'
        ) AS has_referred_by_user_id,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_applied_at'
        ) AS has_referral_applied_at,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_granted_at'
        ) AS has_referral_reward_granted_at,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referral_reward_reversed_at'
        ) AS has_referral_reward_reversed_at
      `
    );
    const usersColumns = usersColumnsResult.rows[0] || {};
    const nameSelect = usersColumns.has_name ? "COALESCE(name, '') AS name" : "''::text AS name";
    const phoneSelect = usersColumns.has_phone ? "COALESCE(phone, '') AS phone" : "''::text AS phone";
    const emailSelect = usersColumns.has_email ? "COALESCE(email, '') AS email" : "''::text AS email";
    const referralCodeSelect = usersColumns.has_referral_code
      ? "COALESCE(referral_code, '') AS referral_code"
      : "''::text AS referral_code";
    const referredBySelect = usersColumns.has_referred_by_user_id
      ? "referred_by_user_id"
      : "NULL::int AS referred_by_user_id";
    const referralAppliedAtSelect = usersColumns.has_referral_applied_at
      ? "referral_applied_at::text AS referral_applied_at"
      : "NULL::text AS referral_applied_at";
    const referralRewardGrantedAtSelect = usersColumns.has_referral_reward_granted_at
      ? "referral_reward_granted_at::text AS referral_reward_granted_at"
      : "NULL::text AS referral_reward_granted_at";
    const referralRewardReversedAtSelect = usersColumns.has_referral_reward_reversed_at
      ? "referral_reward_reversed_at::text AS referral_reward_reversed_at"
      : "NULL::text AS referral_reward_reversed_at";

    const customerResult = await pool.query(
      `
      SELECT
        id,
        ${nameSelect},
        ${phoneSelect},
        ${emailSelect},
        ${referralCodeSelect},
        ${referredBySelect},
        ${referralAppliedAtSelect},
        ${referralRewardGrantedAtSelect},
        ${referralRewardReversedAtSelect},
        COALESCE(loyalty_points, 0) AS loyalty_points,
        COALESCE(lifetime_points_earned, 0) AS lifetime_points_earned,
        COALESCE(lifetime_points_redeemed, 0) AS lifetime_points_redeemed
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer not found." });
    }
    const customer = customerResult.rows[0];

    let referredBy = null;
    const referredById = parseInteger(customer.referred_by_user_id);
    if (Number.isInteger(referredById) && referredById > 0) {
      const referredByNameSelect = usersColumns.has_name ? "COALESCE(name, '') AS name" : "''::text AS name";
      const referredByEmailSelect = usersColumns.has_email ? "COALESCE(email, '') AS email" : "''::text AS email";
      const referredByResult = await pool.query(
        `
        SELECT
          id,
          ${referredByNameSelect},
          ${referredByEmailSelect}
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [referredById]
      );
      if (referredByResult.rowCount > 0) {
        referredBy = {
          id: Number(referredByResult.rows[0].id || 0),
          name: referredByResult.rows[0].name || "",
          email: referredByResult.rows[0].email || ""
        };
      }
    }

    const referralSummaryResult = usersColumns.has_referred_by_user_id && usersColumns.has_referral_reward_granted_at
      ? await pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE referral_reward_granted_at IS NOT NULL)::int AS successful_referrals_count,
          COUNT(*) FILTER (WHERE referral_reward_granted_at IS NULL)::int AS pending_referrals_count
        FROM users
        WHERE referred_by_user_id = $1
        `,
        [customerId]
      )
      : { rows: [{ successful_referrals_count: 0, pending_referrals_count: 0 }] };

    const txResult = await pool.query(
      `
      SELECT
        id,
        customer_id,
        order_id,
        type,
        points,
        description,
        created_at::text AS created_at
      FROM loyalty_points_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [customerId, limit]
    );

    const transactions = txResult.rows.map((row) => ({
      ...row,
      type_label: getLoyaltyTransactionTypeLabel(row.type)
    }));

    res.json({
      customer: {
        ...customer,
        referred_by: referredBy
      },
      referral_summary: {
        successful_referrals_count: Number(referralSummaryResult.rows[0]?.successful_referrals_count || 0),
        pending_referrals_count: Number(referralSummaryResult.rows[0]?.pending_referrals_count || 0),
        referral_bonus_points: REFERRAL_BONUS_POINTS
      },
      transactions
    });
  } catch (error) {
    console.error("Fetch admin customer loyalty transactions failed:", error);
    res.status(500).json({ error: "Failed to fetch customer loyalty transactions." });
  }
});

app.get("/api/admin/loyalty/stats", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }
    if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
      return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
    }

    const usersColumnsResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email
      `
    );
    const usersColumns = usersColumnsResult.rows[0] || {};
    const userNameSelect = usersColumns.has_name ? "COALESCE(u.name, '') AS customer_name" : "''::text AS customer_name";
    const userEmailSelect = usersColumns.has_email ? "COALESCE(u.email, '') AS customer_email" : "''::text AS customer_email";

    const totalsPromise = pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) AS total_points_issued,
        COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0) AS total_points_redeemed,
        COALESCE(SUM(CASE WHEN type = 'earn_reversal' THEN points ELSE 0 END), 0) AS total_points_reversed,
        COALESCE(SUM(CASE WHEN type = 'redeem_restore' THEN points ELSE 0 END), 0) AS total_points_restored,
        COALESCE(SUM(CASE WHEN type = 'admin_adjust_add' THEN points ELSE 0 END), 0) AS total_manual_points_added,
        COALESCE(SUM(CASE WHEN type = 'admin_adjust_deduct' THEN points ELSE 0 END), 0) AS total_manual_points_deducted,
        COALESCE(SUM(CASE WHEN type = 'referral_bonus_referrer' THEN points ELSE 0 END), 0) AS total_referral_points_referrer,
        COALESCE(SUM(CASE WHEN type = 'referral_bonus_referred' THEN points ELSE 0 END), 0) AS total_referral_points_referred,
        COALESCE(SUM(CASE WHEN type = 'referral_bonus_referrer_reversal' THEN points ELSE 0 END), 0) AS total_referral_points_referrer_reversed,
        COALESCE(SUM(CASE WHEN type = 'referral_bonus_referred_reversal' THEN points ELSE 0 END), 0) AS total_referral_points_referred_reversed,
        COALESCE(SUM(CASE WHEN type = 'redeem' THEN 1 ELSE 0 END), 0) AS total_reward_redemptions
      FROM loyalty_points_transactions
      `
    );

    const liabilityPromise = pool.query(
      `
      SELECT COALESCE(SUM(COALESCE(loyalty_points, 0)), 0) AS active_points_liability
      FROM users
      `
    );

    const loyaltyCustomersPromise = pool.query(
      `
      SELECT COUNT(*)::int AS total_loyalty_customers
      FROM users u
      WHERE
        COALESCE(u.loyalty_points, 0) > 0
        OR EXISTS (
          SELECT 1
          FROM loyalty_points_transactions tx
          WHERE tx.customer_id = u.id
        )
      `
    );

    const topCustomersPromise = pool.query(
      `
      SELECT
        u.id AS customer_id,
        ${userNameSelect},
        ${userEmailSelect},
        COALESCE(u.loyalty_points, 0) AS loyalty_points
      FROM users u
      WHERE COALESCE(u.loyalty_points, 0) > 0
      ORDER BY COALESCE(u.loyalty_points, 0) DESC, u.id ASC
      LIMIT 10
      `
    );

    const recentActivityPromise = pool.query(
      `
      SELECT
        tx.id AS transaction_id,
        tx.customer_id,
        ${userNameSelect},
        ${userEmailSelect},
        tx.order_id,
        tx.type,
        tx.points,
        tx.description,
        tx.created_at::text AS created_at
      FROM loyalty_points_transactions tx
      LEFT JOIN users u ON u.id = tx.customer_id
      ORDER BY tx.created_at DESC, tx.id DESC
      LIMIT 20
      `
    );

    const mostRedeemedRewardsPromise = (
      schemaCapabilities.hasOrderLoyaltyRewardIdColumn && schemaCapabilities.hasLoyaltyRewardsTable
    )
      ? pool.query(
        `
        SELECT
          o.loyalty_reward_id AS reward_id,
          COALESCE(lr.name, CONCAT('Reward #', o.loyalty_reward_id::text)) AS reward_name,
          COUNT(*)::int AS redemption_count
        FROM loyalty_points_transactions tx
        INNER JOIN orders o ON o.id = tx.order_id
        LEFT JOIN loyalty_rewards lr ON lr.id = o.loyalty_reward_id
        WHERE tx.type = 'redeem'
          AND o.loyalty_reward_id IS NOT NULL
        GROUP BY o.loyalty_reward_id, COALESCE(lr.name, CONCAT('Reward #', o.loyalty_reward_id::text))
        ORDER BY COUNT(*) DESC, o.loyalty_reward_id ASC
        LIMIT 10
        `
      )
      : Promise.resolve({ rows: [] });

    const referralCountsPromise = schemaCapabilities.hasUsersReferralColumns
      ? pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE referred_by_user_id IS NOT NULL)::int AS total_referred_customers,
          COUNT(*) FILTER (WHERE referral_reward_granted_at IS NOT NULL)::int AS successful_referrals_count,
          COUNT(*) FILTER (WHERE referred_by_user_id IS NOT NULL AND referral_reward_granted_at IS NULL)::int AS pending_referrals_count
        FROM users
        `
      )
      : Promise.resolve({
        rows: [{
          total_referred_customers: 0,
          successful_referrals_count: 0,
          pending_referrals_count: 0
        }]
      });

    const [
      totalsResult,
      liabilityResult,
      loyaltyCustomersResult,
      topCustomersResult,
      recentActivityResult,
      mostRedeemedRewardsResult,
      referralCountsResult
    ] = await Promise.all([
      totalsPromise,
      liabilityPromise,
      loyaltyCustomersPromise,
      topCustomersPromise,
      recentActivityPromise,
      mostRedeemedRewardsPromise,
      referralCountsPromise
    ]);

    const totals = totalsResult.rows[0] || {};
    const stats = {
      total_points_issued: Number(totals.total_points_issued || 0),
      total_points_redeemed: Number(totals.total_points_redeemed || 0),
      total_points_reversed: Number(totals.total_points_reversed || 0),
      total_points_restored: Number(totals.total_points_restored || 0),
      total_manual_points_added: Number(totals.total_manual_points_added || 0),
      total_manual_points_deducted: Number(totals.total_manual_points_deducted || 0),
      total_referral_points_referrer: Number(totals.total_referral_points_referrer || 0),
      total_referral_points_referred: Number(totals.total_referral_points_referred || 0),
      total_referral_points_referrer_reversed: Number(totals.total_referral_points_referrer_reversed || 0),
      total_referral_points_referred_reversed: Number(totals.total_referral_points_referred_reversed || 0),
      active_points_liability: Number(liabilityResult.rows[0]?.active_points_liability || 0),
      total_loyalty_customers: Number(loyaltyCustomersResult.rows[0]?.total_loyalty_customers || 0),
      total_referred_customers: Number(referralCountsResult.rows[0]?.total_referred_customers || 0),
      successful_referrals_count: Number(referralCountsResult.rows[0]?.successful_referrals_count || 0),
      pending_referrals_count: Number(referralCountsResult.rows[0]?.pending_referrals_count || 0),
      total_reward_redemptions: Number(totals.total_reward_redemptions || 0),
      most_redeemed_rewards: (mostRedeemedRewardsResult.rows || []).map((row) => ({
        reward_id: Number(row.reward_id || 0),
        reward_name: row.reward_name || "",
        redemption_count: Number(row.redemption_count || 0)
      })),
      top_customers_by_points_balance: (topCustomersResult.rows || []).map((row) => ({
        customer_id: Number(row.customer_id || 0),
        customer_name: row.customer_name || "",
        customer_email: row.customer_email || "",
        loyalty_points: Number(row.loyalty_points || 0)
      })),
      recent_loyalty_activity: (recentActivityResult.rows || []).map((row) => ({
        transaction_id: Number(row.transaction_id || 0),
        customer_id: Number(row.customer_id || 0),
        customer_name: row.customer_name || "",
        customer_email: row.customer_email || "",
        order_id: row.order_id === null || row.order_id === undefined ? null : Number(row.order_id),
        type: row.type || "",
        type_label: getLoyaltyTransactionTypeLabel(row.type),
        points: Number(row.points || 0),
        description: row.description || "",
        created_at: row.created_at || ""
      }))
    };

    return res.json({ stats });
  } catch (error) {
    console.error("Fetch admin loyalty stats failed:", error);
    return res.status(500).json({ error: "Failed to fetch loyalty stats." });
  }
});

app.get("/api/admin/loyalty-transactions/export.csv", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
      return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
    }

    const customerIdRaw = req.query?.customer_id;
    const customerId = customerIdRaw === null || customerIdRaw === undefined || customerIdRaw === ""
      ? null
      : parseInteger(customerIdRaw);

    if (customerIdRaw !== null && customerIdRaw !== undefined && customerIdRaw !== "") {
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({ error: "customer_id is invalid." });
      }
    }

    const usersColumnsResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
        ) AS has_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) AS has_email
      `
    );
    const usersColumns = usersColumnsResult.rows[0] || {};
    const nameSelect = usersColumns.has_name ? "COALESCE(u.name, '') AS customer_name" : "''::text AS customer_name";
    const emailSelect = usersColumns.has_email ? "COALESCE(u.email, '') AS customer_email" : "''::text AS customer_email";

    const exportLimitRaw = parseInteger(req.query?.limit);
    const exportLimit = Number.isInteger(exportLimitRaw) && exportLimitRaw > 0 ? Math.min(exportLimitRaw, 50000) : 10000;

    const txResult = await pool.query(
      `
      SELECT
        tx.id AS transaction_id,
        tx.customer_id,
        ${nameSelect},
        ${emailSelect},
        tx.order_id,
        tx.type,
        tx.points,
        tx.description,
        tx.created_at::text AS created_at
      FROM loyalty_points_transactions tx
      LEFT JOIN users u ON u.id = tx.customer_id
      WHERE ($1::int IS NULL OR tx.customer_id = $1)
      ORDER BY tx.created_at DESC, tx.id DESC
      LIMIT $2
      `,
      [customerId, exportLimit]
    );

    const headers = [
      "transaction_id",
      "customer_id",
      "customer_name",
      "customer_email",
      "order_id",
      "type",
      "type_label",
      "points",
      "description",
      "created_at"
    ];

    const rows = txResult.rows.map((row) => ([
      row.transaction_id,
      row.customer_id,
      row.customer_name || "",
      row.customer_email || "",
      row.order_id ?? "",
      row.type || "",
      getLoyaltyTransactionTypeLabel(row.type),
      row.points ?? 0,
      row.description || "",
      row.created_at || ""
    ]));

    const csvBody = [
      headers.map((h) => toCsvCell(h)).join(","),
      ...rows.map((values) => values.map((value) => toCsvCell(value)).join(","))
    ].join("\n");
    const csvWithBom = `\uFEFF${csvBody}`;

    const filename = Number.isInteger(customerId) && customerId > 0
      ? `loyalty-transactions-customer-${customerId}.csv`
      : "loyalty-transactions-all.csv";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    return res.status(200).send(csvWithBom);
  } catch (error) {
    console.error("Export loyalty transactions CSV failed:", error);
    return res.status(500).json({ error: "Failed to export loyalty transactions CSV." });
  }
});

app.post("/api/admin/customers/loyalty-adjustments", requireAdmin, async (req, res) => {
  const customerId = parseInteger(req.body?.customer_id);
  const adjustmentType = normalizeString(req.body?.adjustment_type).toLowerCase();
  const points = parseInteger(req.body?.points);
  const reason = normalizeString(req.body?.reason);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ error: "customer_id is invalid." });
  }

  if (!["add", "deduct"].includes(adjustmentType)) {
    return res.status(400).json({ error: "adjustment_type must be either add or deduct." });
  }

  if (!Number.isInteger(points) || points <= 0 || points > LOYALTY_POINTS_MAX) {
    return res.status(400).json({ error: `points must be a whole number between 1 and ${LOYALTY_POINTS_MAX}.` });
  }

  if (!reason || reason.length > LOYALTY_ADJUSTMENT_REASON_MAX_LENGTH) {
    return res.status(400).json({ error: `reason must be 1-${LOYALTY_ADJUSTMENT_REASON_MAX_LENGTH} characters long.` });
  }

  const schemaCapabilities = await getSchemaCapabilities();
  if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
    return res.status(503).json({ error: "User loyalty storage is not ready." });
  }
  if (!schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
    return res.status(503).json({ error: "Loyalty transactions storage is not ready." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customerResult = await client.query(
      `
      SELECT
        id,
        COALESCE(loyalty_points, 0) AS loyalty_points,
        COALESCE(lifetime_points_earned, 0) AS lifetime_points_earned,
        COALESCE(lifetime_points_redeemed, 0) AS lifetime_points_redeemed
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Customer not found." });
    }

    const currentPoints = clampLoyaltyPoints(customerResult.rows[0].loyalty_points);
    if (adjustmentType === "deduct" && currentPoints < points) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Deduction would make loyalty_points negative." });
    }

    if (adjustmentType === "add") {
      await client.query(
        `
        UPDATE users
        SET loyalty_points = COALESCE(loyalty_points, 0) + $1
        WHERE id = $2
        `,
        [points, customerId]
      );
      // Business decision: manual bonus/ops adjustments should not change
      // lifetime_points_earned, which is reserved for real order-earned points.
    } else {
      await client.query(
        `
        UPDATE users
        SET loyalty_points = COALESCE(loyalty_points, 0) - $1
        WHERE id = $2
        `,
        [points, customerId]
      );
      // Intentional: manual deductions do not touch lifetime_points_redeemed.
    }

    const transactionType = adjustmentType === "add" ? "admin_adjust_add" : "admin_adjust_deduct";
    const transactionDescription = `${adjustmentType === "add" ? "Admin added" : "Admin deducted"} ${points} points: ${reason}`;
    const insertTxnResult = await client.query(
      `
      INSERT INTO loyalty_points_transactions
      (customer_id, order_id, type, points, description)
      VALUES ($1, NULL, $2, $3, $4)
      RETURNING id, customer_id, order_id, type, points, description, created_at::text AS created_at
      `,
      [customerId, transactionType, points, transactionDescription]
    );

    const updatedCustomerResult = await client.query(
      `
      SELECT
        id,
        COALESCE(loyalty_points, 0) AS loyalty_points,
        COALESCE(lifetime_points_earned, 0) AS lifetime_points_earned,
        COALESCE(lifetime_points_redeemed, 0) AS lifetime_points_redeemed
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    await client.query("COMMIT");
    const transaction = {
      ...insertTxnResult.rows[0],
      type_label: getLoyaltyTransactionTypeLabel(insertTxnResult.rows[0]?.type)
    };
    return res.json({
      message: "Loyalty points adjusted successfully.",
      customer: updatedCustomerResult.rows[0],
      transaction
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin loyalty adjustment failed:", error);
    return res.status(500).json({ error: "Failed to adjust loyalty points." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/loyalty-rewards", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    const result = await pool.query(
      `
      SELECT
        lr.id,
        lr.name,
        lr.reward_type,
        lr.points_required,
        lr.discount_value,
        lr.gift_product_id,
        p.name AS gift_product_name,
        lr.is_active,
        lr.sort_order,
        lr.created_at,
        lr.updated_at
      FROM loyalty_rewards lr
      LEFT JOIN products p ON p.id = lr.gift_product_id
      ORDER BY lr.sort_order ASC, lr.points_required ASC, lr.id ASC
      `
    );

    res.json({ rewards: result.rows });
  } catch (error) {
    console.error("Fetch admin loyalty rewards failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }
    res.status(500).json({ error: "Failed to fetch loyalty rewards." });
  }
});

app.post("/api/admin/loyalty-rewards", requireAdmin, async (req, res) => {
  const validation = validateLoyaltyRewardPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const reward = validation.value;
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    await client.query("BEGIN");

    if (reward.reward_type === "free_gift") {
      const productResult = await client.query(
        `
        SELECT id
        FROM products
        WHERE id = $1
        LIMIT 1
        `,
        [reward.gift_product_id]
      );

      if (productResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Gift product does not exist." });
      }
    }

    const insertResult = await client.query(
      `
      INSERT INTO loyalty_rewards
        (name, reward_type, points_required, discount_value, gift_product_id, is_active, sort_order, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING
        id,
        name,
        reward_type,
        points_required,
        discount_value,
        gift_product_id,
        is_active,
        sort_order,
        created_at,
        updated_at
      `,
      [
        reward.name,
        reward.reward_type,
        reward.points_required,
        reward.discount_value,
        reward.gift_product_id,
        reward.is_active,
        reward.sort_order
      ]
    );

    await client.query("COMMIT");
    res.status(201).json({
      message: "Loyalty reward created.",
      reward: insertResult.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create loyalty reward failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }
    res.status(500).json({ error: "Failed to create loyalty reward." });
  } finally {
    client.release();
  }
});

app.put("/api/admin/loyalty-rewards/:id", requireAdmin, async (req, res) => {
  const rewardId = parseInteger(req.params.id);
  if (!Number.isInteger(rewardId) || rewardId <= 0) {
    return res.status(400).json({ error: "Reward ID is invalid." });
  }

  const validation = validateLoyaltyRewardPayload({ ...req.body, id: rewardId }, { requireId: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const reward = validation.value;
  const client = await pool.connect();
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    await client.query("BEGIN");

    if (reward.reward_type === "free_gift") {
      const productResult = await client.query(
        `
        SELECT id
        FROM products
        WHERE id = $1
        LIMIT 1
        `,
        [reward.gift_product_id]
      );

      if (productResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Gift product does not exist." });
      }
    }

    const updateResult = await client.query(
      `
      UPDATE loyalty_rewards
      SET
        name = $1,
        reward_type = $2,
        points_required = $3,
        discount_value = $4,
        gift_product_id = $5,
        is_active = $6,
        sort_order = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING
        id,
        name,
        reward_type,
        points_required,
        discount_value,
        gift_product_id,
        is_active,
        sort_order,
        created_at,
        updated_at
      `,
      [
        reward.name,
        reward.reward_type,
        reward.points_required,
        reward.discount_value,
        reward.gift_product_id,
        reward.is_active,
        reward.sort_order,
        reward.id
      ]
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Loyalty reward not found." });
    }

    await client.query("COMMIT");
    res.json({
      message: "Loyalty reward updated.",
      reward: updateResult.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update loyalty reward failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }
    res.status(500).json({ error: "Failed to update loyalty reward." });
  } finally {
    client.release();
  }
});

app.delete("/api/admin/loyalty-rewards/:id", requireAdmin, async (req, res) => {
  const rewardId = parseInteger(req.params.id);
  if (!Number.isInteger(rewardId) || rewardId <= 0) {
    return res.status(400).json({ error: "Reward ID is invalid." });
  }

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    const result = await pool.query(
      `
      DELETE FROM loyalty_rewards
      WHERE id = $1
      RETURNING id
      `,
      [rewardId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Loyalty reward not found." });
    }

    res.json({ message: "Loyalty reward deleted." });
  } catch (error) {
    console.error("Delete loyalty reward failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }
    res.status(500).json({ error: "Failed to delete loyalty reward." });
  }
});

app.get("/api/loyalty-rewards", async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    const result = await pool.query(
      `
      SELECT
        lr.id,
        lr.name,
        lr.reward_type,
        lr.points_required,
        lr.discount_value,
        p.name AS gift_product_name,
        p.image_url AS gift_product_image_url
      FROM loyalty_rewards lr
      LEFT JOIN products p ON p.id = lr.gift_product_id
      WHERE lr.is_active = TRUE
      ORDER BY lr.sort_order ASC, lr.points_required ASC, lr.id ASC
      `
    );

    res.json({ rewards: result.rows });
  } catch (error) {
    console.error("Fetch loyalty rewards failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }
    res.status(500).json({ error: "Failed to fetch loyalty rewards." });
  }
});

app.post("/api/checkout/loyalty-reward-preview", async (req, res) => {
  const customerId = resolveCustomerIdFromRequest(req, { allowQuery: false });
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(401).json({ error: "Login is required to preview loyalty rewards." });
  }

  const validation = validateLoyaltyRewardPreviewPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const {
    reward_id: rewardId,
    subtotal_amount: subtotalAmount,
    total_amount: totalAmount,
    shipping_amount: shippingAmount
  } = validation.value;

  try {
    const schemaCapabilities = await getSchemaCapabilities();
    if (!schemaCapabilities.hasUsersTable || !schemaCapabilities.hasUsersLoyaltyPointsColumns) {
      return res.status(503).json({ error: "User loyalty storage is not ready." });
    }
    if (!schemaCapabilities.hasLoyaltyRewardsTable) {
      return res.status(503).json({ error: "Loyalty rewards storage is not ready." });
    }

    const customerResult = await pool.query(
      `
      SELECT id, COALESCE(loyalty_points, 0) AS loyalty_points
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    const rewardResult = await pool.query(
      `
      SELECT
        lr.id,
        lr.name,
        lr.reward_type,
        lr.points_required,
        lr.discount_value,
        lr.gift_product_id,
        p.name AS gift_product_name,
        p.image_url AS gift_product_image_url
      FROM loyalty_rewards lr
      LEFT JOIN products p ON p.id = lr.gift_product_id
      WHERE lr.id = $1
        AND lr.is_active = TRUE
      LIMIT 1
      `,
      [rewardId]
    );

    if (rewardResult.rowCount === 0) {
      return res.status(404).json({ error: "Selected loyalty reward was not found or is inactive." });
    }

    const customerPoints = clampLoyaltyPoints(customerResult.rows[0].loyalty_points);
    const reward = rewardResult.rows[0];
    const pointsRequired = clampLoyaltyPoints(reward.points_required);
    if (customerPoints < pointsRequired) {
      return res.status(400).json({ error: "Not enough loyalty points for this reward." });
    }

    const originalSubtotal = Number(subtotalAmount.toFixed(2));
    const originalShipping = Number(shippingAmount.toFixed(2));
    const originalTotal = Number(totalAmount.toFixed(2));

    let discountPreview = null;
    let giftPreview = null;
    let adjustedSubtotal = originalSubtotal;
    let adjustedTotal = Number((adjustedSubtotal + originalShipping).toFixed(2));

    if (reward.reward_type === "fixed_discount") {
      const requestedDiscount = parseOptionalMoney(reward.discount_value);
      const discountValue = Number.isFinite(requestedDiscount) ? requestedDiscount : 0;
      const maxDiscount = Math.max(0, originalSubtotal);
      const appliedDiscount = Math.min(discountValue, maxDiscount);
      adjustedSubtotal = Number(Math.max(0, originalSubtotal - appliedDiscount).toFixed(2));
      adjustedTotal = Number((adjustedSubtotal + originalShipping).toFixed(2));
      discountPreview = {
        discount_amount: Number(appliedDiscount.toFixed(2)),
        original_subtotal: Number(originalSubtotal.toFixed(2)),
        adjusted_subtotal: adjustedSubtotal,
        shipping_amount: Number(originalShipping.toFixed(2)),
        original_total: Number(originalTotal.toFixed(2)),
        adjusted_total: adjustedTotal
      };
    } else if (reward.reward_type === "free_gift") {
      const giftProductId = parseInteger(reward.gift_product_id);
      if (!Number.isInteger(giftProductId) || giftProductId <= 0 || !reward.gift_product_name) {
        return res.status(409).json({ error: "Selected free gift reward is misconfigured." });
      }

      const giftValidityColumnsResult = await pool.query(
        `
        SELECT
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
          ) AS has_is_active,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_hidden'
          ) AS has_is_hidden,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'deleted_at'
          ) AS has_deleted_at
        `
      );

      const giftValidityFlags = giftValidityColumnsResult.rows[0] || {};
      const validityWhere = ["id = $1"];
      if (giftValidityFlags.has_is_active) validityWhere.push("is_active = TRUE");
      if (giftValidityFlags.has_is_hidden) validityWhere.push("(is_hidden = FALSE OR is_hidden IS NULL)");
      if (giftValidityFlags.has_deleted_at) validityWhere.push("deleted_at IS NULL");

      const validGiftProductResult = await pool.query(
        `
        SELECT id
        FROM products
        WHERE ${validityWhere.join(" AND ")}
        LIMIT 1
        `,
        [giftProductId]
      );

      if (validGiftProductResult.rowCount === 0) {
        return res.status(409).json({ error: "Selected free gift product is unavailable." });
      }

      giftPreview = {
        product_name: reward.gift_product_name,
        product_image_url: normalizeImageUrl(reward.gift_product_image_url)
      };
    } else {
      return res.status(400).json({ error: "Selected reward type is invalid." });
    }

    return res.json({
      preview: {
        customer_points: customerPoints,
        selected_reward: {
          id: reward.id,
          name: reward.name,
          reward_type: reward.reward_type,
          points_required: pointsRequired,
          discount_value: reward.reward_type === "fixed_discount"
            ? Number((parseOptionalMoney(reward.discount_value) || 0).toFixed(2))
            : null
        },
        points_required: pointsRequired,
        discount_preview: discountPreview,
        gift_preview: giftPreview,
        shipping_amount: Number(originalShipping.toFixed(2)),
        preview_subtotal: Number(adjustedSubtotal.toFixed(2)),
        preview_total: Number(adjustedTotal.toFixed(2))
      }
    });
  } catch (error) {
    console.error("Loyalty reward preview failed:", error);
    if (isMissingRelationError(error)) {
      return res.status(503).json({ error: "Loyalty preview storage is not ready." });
    }
    return res.status(500).json({ error: "Failed to preview loyalty reward." });
  }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    const schemaCapabilities = await getSchemaCapabilities();
    const deliveryStatusSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "o.delivery_status"
      : "o.order_status AS delivery_status";
    const orderStatusAliasSelect = schemaCapabilities.hasOrderDeliveryStatusColumn
      ? "o.delivery_status AS order_status"
      : "o.order_status";
    const trackingNotesSelect = schemaCapabilities.hasOrderTrackingNotesColumn
      ? "o.tracking_notes"
      : "NULL::text AS tracking_notes";
    // Return raw text for timestamp-without-time-zone fields so the frontend
    // can parse consistently (avoids implicit server-local timezone shifts).
    const shippedAtSelect = schemaCapabilities.hasOrderShippedAtColumn
      ? "o.shipped_at::text AS shipped_at"
      : "NULL::text AS shipped_at";
    const deliveredAtSelect = schemaCapabilities.hasOrderDeliveredAtColumn
      ? "o.delivered_at::text AS delivered_at"
      : "NULL::text AS delivered_at";
    const updatedAtSelect = schemaCapabilities.hasOrderUpdatedAtColumn
      ? "o.updated_at::text AS updated_at"
      : "o.created_at::text AS updated_at";
    const loyaltyRewardIdSelect = schemaCapabilities.hasOrderLoyaltyRewardIdColumn
      ? "o.loyalty_reward_id"
      : "NULL::integer AS loyalty_reward_id";
    const loyaltyRewardTypeSelect = schemaCapabilities.hasOrderLoyaltyRewardTypeColumn
      ? "o.loyalty_reward_type"
      : "NULL::text AS loyalty_reward_type";
    const loyaltyPointsRedeemedSelect = schemaCapabilities.hasOrderLoyaltyPointsRedeemedColumn
      ? "COALESCE(o.loyalty_points_redeemed, 0) AS loyalty_points_redeemed"
      : "0::integer AS loyalty_points_redeemed";
    const loyaltyDiscountAmountSelect = schemaCapabilities.hasOrderLoyaltyDiscountAmountColumn
      ? "COALESCE(o.loyalty_discount_amount, 0)::numeric(10,2) AS loyalty_discount_amount"
      : "0::numeric(10,2) AS loyalty_discount_amount";
    const loyaltyGiftProductIdSelect = schemaCapabilities.hasOrderLoyaltyFreeGiftProductIdColumn
      ? "o.loyalty_free_gift_product_id"
      : "NULL::integer AS loyalty_free_gift_product_id";
    const loyaltyRedeemedAtSelect = schemaCapabilities.hasOrderLoyaltyRedeemedAtColumn
      ? "o.loyalty_redeemed_at::text AS loyalty_redeemed_at"
      : "NULL::text AS loyalty_redeemed_at";
    const loyaltyEarnReversedAtSelect = schemaCapabilities.hasOrderLoyaltyEarnReversedAtColumn
      ? "o.loyalty_earn_reversed_at::text AS loyalty_earn_reversed_at"
      : "NULL::text AS loyalty_earn_reversed_at";
    const loyaltyRedeemRestoredAtSelect = schemaCapabilities.hasOrderLoyaltyRedeemRestoredAtColumn
      ? "o.loyalty_redeem_restored_at::text AS loyalty_redeem_restored_at"
      : "NULL::text AS loyalty_redeem_restored_at";
    const rewardJoinEnabled = schemaCapabilities.hasLoyaltyRewardsTable && schemaCapabilities.hasOrderLoyaltyRewardIdColumn;
    const rewardNameSelect = rewardJoinEnabled
      ? "lr.name AS loyalty_reward_name"
      : "NULL::text AS loyalty_reward_name";
    const rewardJoin = rewardJoinEnabled
      ? "LEFT JOIN loyalty_rewards lr ON lr.id = o.loyalty_reward_id"
      : "";
    const giftSummarySelect = schemaCapabilities.hasOrderLoyaltyFreeGiftProductIdColumn
      ? "gp.name AS loyalty_free_gift_product_name, gp.image_url AS loyalty_free_gift_product_image_url"
      : "NULL::text AS loyalty_free_gift_product_name, NULL::text AS loyalty_free_gift_product_image_url";
    const giftJoin = schemaCapabilities.hasOrderLoyaltyFreeGiftProductIdColumn
      ? "LEFT JOIN products gp ON gp.id = o.loyalty_free_gift_product_id"
      : "";

    const result = await pool.query(
      `
      SELECT
        o.id,
        o.customer_name,
        o.phone,
        o.address,
        o.total_amount,
        o.payment_status,
        ${deliveryStatusSelect},
        ${orderStatusAliasSelect},
        ${trackingNotesSelect},
        ${shippedAtSelect},
        ${deliveredAtSelect},
        ${updatedAtSelect},
        ${loyaltyRewardIdSelect},
        ${loyaltyRewardTypeSelect},
        ${loyaltyPointsRedeemedSelect},
        ${loyaltyDiscountAmountSelect},
        ${loyaltyGiftProductIdSelect},
        ${loyaltyRedeemedAtSelect},
        ${loyaltyEarnReversedAtSelect},
        ${loyaltyRedeemRestoredAtSelect},
        ${rewardNameSelect},
        ${giftSummarySelect},
        o.created_at::text AS created_at
      FROM orders o
      ${rewardJoin}
      ${giftJoin}
      ORDER BY o.created_at DESC
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

app.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const orderId = parseInteger(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: "Order ID is invalid." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schemaCapabilities = await getSchemaCapabilities();

    const orderResult = await client.query(
      `
      SELECT id
      FROM orders
      WHERE id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    const deletedItemsResult = await client.query(
      `
      DELETE FROM order_items
      WHERE order_id = $1
      `,
      [orderId]
    );

    if (schemaCapabilities.hasLoyaltyPointsTransactionsTable) {
      await client.query(
        `
        UPDATE loyalty_points_transactions
        SET order_id = NULL
        WHERE order_id = $1
        `,
        [orderId]
      );
    }

    if (schemaCapabilities.hasUsersReferralColumns) {
      await client.query(
        `
        UPDATE users
        SET referral_reward_order_id = NULL
        WHERE referral_reward_order_id = $1
        `,
        [orderId]
      );
    }

    await client.query(
      `
      DELETE FROM orders
      WHERE id = $1
      `,
      [orderId]
    );

    await client.query("COMMIT");
    return res.json({
      message: "Order deleted successfully.",
      deleted_order_id: orderId,
      deleted_order_items: deletedItemsResult.rowCount || 0
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete order failed:", error);
    return res.status(500).json({ error: "Failed to delete order." });
  } finally {
    client.release();
  }
});

app.post("/api/update-order", requireAdmin, async (req, res) => {
  const validation = validateOrderUpdatePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { order_id, payment_status, delivery_status } = validation.value;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const schemaCapabilities = await getSchemaCapabilities();
    const statusColumn = schemaCapabilities.hasOrderDeliveryStatusColumn ? "delivery_status" : "order_status";
    const updateResult = await client.query(
      `
      UPDATE orders
      SET payment_status = $1, ${statusColumn} = $2
      WHERE id = $3
      RETURNING id
      `,
      [payment_status, delivery_status, order_id]
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    const loyaltyRedeemResult = await redeemLoyaltyPointsForOrderIfEligible(client, order_id, schemaCapabilities);
    if (loyaltyRedeemResult.reason === "insufficient_points_at_commit") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Loyalty reward redemption failed because the customer no longer has enough points."
      });
    }

    await awardLoyaltyPointsForOrderIfEligible(client, order_id, schemaCapabilities);
    await awardReferralBonusesForOrderIfEligible(client, order_id, schemaCapabilities);
    await reverseLoyaltyPointsForOrderIfEligible(client, order_id, schemaCapabilities);
    await reverseReferralBonusesForOrderIfEligible(client, order_id, schemaCapabilities);

    await client.query("COMMIT");
    res.json({ message: "Order updated successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update order failed:", err);
    res.status(500).json({ error: "Failed to update order" });
  } finally {
    client.release();
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
      ? "shipped_at::text AS shipped_at"
      : "NULL::text AS shipped_at";
    const deliveredAtSelect = schemaCapabilities.hasOrderDeliveredAtColumn
      ? "delivered_at::text AS delivered_at"
      : "NULL::text AS delivered_at";
    const updatedAtSelect = schemaCapabilities.hasOrderUpdatedAtColumn
      ? "updated_at::text AS updated_at"
      : "created_at::text AS updated_at";

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
        created_at::text AS created_at
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
  const client = await pool.connect();
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

    await client.query("BEGIN");
    values.push(id);
    const result = await client.query(
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
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    const loyaltyRedeemResult = await redeemLoyaltyPointsForOrderIfEligible(client, id, schemaCapabilities);
    if (loyaltyRedeemResult.reason === "insufficient_points_at_commit") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Loyalty reward redemption failed because the customer no longer has enough points."
      });
    }

    await awardLoyaltyPointsForOrderIfEligible(client, id, schemaCapabilities);
    await awardReferralBonusesForOrderIfEligible(client, id, schemaCapabilities);
    await reverseLoyaltyPointsForOrderIfEligible(client, id, schemaCapabilities);
    await reverseReferralBonusesForOrderIfEligible(client, id, schemaCapabilities);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Order status updated successfully.",
      order: result.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update order status error:", error);
    res.status(500).json({ error: "Failed to update order status." });
  } finally {
    client.release();
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

    const defaultSections = [
      { section_key: "about", title: "About ThemeGood", body: "Edit the About section headline and lead paragraph." },
      { section_key: "signature_experience", title: "Signature Experience", body: "Edit the Signature Experience title and body." },
      { section_key: "flavour_collection", title: "Flavour Collection", body: "Edit the Flavour Collection heading and intro." },
      { section_key: "featured_products", title: "Featured Products", body: "Edit the Featured Products heading and intro." },
      { section_key: "bundles", title: "Bundles", body: "Edit the Bundles heading and paragraph." },
      { section_key: "testimonials", title: "Testimonials", body: "Edit the Testimonials heading and intro." },
      { section_key: "faq", title: "FAQ", body: "Edit the FAQ heading and intro." }
    ];

    const existingByKey = new Map(
      (sectionsResult.rows || []).map((section) => [
        String(section.section_key || "").trim().toLowerCase(),
        section
      ])
    );

    const mergedSections = [];

    defaultSections.forEach((defaults) => {
      const key = String(defaults.section_key || "").trim().toLowerCase();
      const existing = existingByKey.get(key);

      if (existing) {
        mergedSections.push(existing);
        existingByKey.delete(key);
        return;
      }

      mergedSections.push({
        id: null,
        section_key: defaults.section_key,
        title: defaults.title,
        body: defaults.body,
        is_active: true
      });
    });

    existingByKey.forEach((section) => mergedSections.push(section));

    res.json({
      slides: slidesResult.rows,
      sections: mergedSections
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
        title, subtitle, image_url, video_url,
        button_primary_text, button_primary_link,
        button_secondary_text, button_secondary_link,
        sort_order, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
      `,
      [
        slide.title,
        slide.subtitle,
        slide.image_url,
        slide.video_url,
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
          video_url = $4,
          button_primary_text = $5,
          button_primary_link = $6,
          button_secondary_text = $7,
          button_secondary_link = $8,
          sort_order = $9,
          is_active = $10
      WHERE id = $11
      `,
      [
        slide.title,
        slide.subtitle,
        slide.image_url,
        slide.video_url,
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
    let result = { rowCount: 0 };

    if (Number.isInteger(section.id) && section.id > 0) {
      result = await pool.query(
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
    }

    if (result.rowCount === 0) {
      result = await pool.query(
        `
        UPDATE homepage_sections
        SET title = $1,
            body = $2,
            is_active = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(section_key) = LOWER($4)
        `,
        [section.title, section.body, section.is_active, section.section_key]
      );
    }

    if (result.rowCount === 0) {
      await pool.query(
        `
        INSERT INTO homepage_sections (section_key, title, body, is_active)
        VALUES ($1, $2, $3, $4)
        `,
        [section.section_key, section.title, section.body, section.is_active]
      );
    }

    res.json({ message: "Homepage section saved" });
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

app.post("/api/upload-homepage-slide-video", requireAdmin, homepageVideoUpload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video uploaded." });
  }

  try {
    const videoUrl = await processUploadedVideo(req.file);
    res.json({ video_url: videoUrl });
  } catch (err) {
    console.error("Upload homepage slide video failed:", err);
    res.status(500).json({ error: "Failed to upload homepage slide video" });
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
    let bundlePricingProfile = "legacy";

    if (
      String(product.product_type || "single").toLowerCase() === "bundle" &&
      schemaCapabilities.hasBundleSlotsTable &&
      schemaCapabilities.hasBundlePricingRulesTable
    ) {
      const bundleContext = await fetchBundleContext(productId, schemaCapabilities, pool);
      if (!bundleContext.error) {
        pricingRule = bundleContext.pricingRule;
        const selectableData = await fetchBundleSelectableVariants(
          productId,
          product,
          bundleContext.slots,
          schemaCapabilities,
          pool
        );

        bundleSlots = selectableData.bundleSlots;
        selectableVariantsBySize = selectableData.selectableVariantsBySize;
        bundlePricingProfile = selectableData.profile;
      }
    }

    return res.json({
      product,
      variants,
      bundle_slots: bundleSlots,
      pricing_rule: pricingRule,
      selectable_variants_by_size: selectableVariantsBySize,
      bundle_pricing_profile: bundlePricingProfile
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
    const quote = await calculateBundlePricingQuote({
      bundleId,
      selections,
      promoCodeInput,
      schemaCapabilities,
      client: pool
    });

    if (quote.error) {
      return res.status(quote.status || 400).json({ error: quote.error });
    }

    return res.json(quote);
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
