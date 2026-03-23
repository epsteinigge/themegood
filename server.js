require("dotenv").config();

const requiredEnv = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_PORT",
  "ADMIN_PASSWORD",
  "JWT_SECRET"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`${key} is missing in environment`);
    process.exit(1);
  }
}

console.log("SERVER STARTED");

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");
const mysql = require("mysql2");
const crypto = require("crypto");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const app = express();
const port = 3000;

const PRODUCT_NAME_MIN_LENGTH = 2;
const PRODUCT_NAME_MAX_LENGTH = 120;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;
const PRODUCT_IMAGE_URL_MAX_LENGTH = 500;
const PRODUCT_PRICE_MIN = 0;
const PRODUCT_PRICE_MAX = 10000;
const STOCK_MIN = 0;
const STOCK_MAX = 100000;
const CUSTOMER_NAME_MIN_LENGTH = 2;
const CUSTOMER_NAME_MAX_LENGTH = 120;
const PHONE_MIN_LENGTH = 8;
const PHONE_MAX_LENGTH = 15;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 500;
const ORDER_ITEM_NAME_MAX_LENGTH = 160;
const ORDER_ITEM_LABEL_MAX_LENGTH = 60;
const ORDER_ITEM_QUANTITY_MIN = 1;
const ORDER_ITEM_QUANTITY_MAX = 999;
const ORDER_ITEM_PRICE_MIN = 0;
const ORDER_ITEM_PRICE_MAX = 10000;
const TOTAL_AMOUNT_MIN = 0;
const TOTAL_AMOUNT_MAX = 100000;
const ALLOWED_ORDER_STATUSES = new Set(["new", "confirmed", "packed", "shipped", "completed", "cancelled"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["unpaid", "paid", "failed"]);

// uploads folder
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024
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

// middleware
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// Compress responses
app.use(compression());

// Logging
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev")
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// MySQL connection
const db = mysql.createConnection({

  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT)

  host: "localhost",
  user: "themegood_user",
  password: "Themegood123!",
  database: "themegood"

});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection failed:", err);
    return;
  }
  console.log("Connected to MySQL");
});

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN;
}

function parseInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function isValidPhone(phone) {
  return /^\+?[0-9\s-]{8,20}$/.test(phone) && phone.replace(/\D/g, "").length >= PHONE_MIN_LENGTH && phone.replace(/\D/g, "").length <= PHONE_MAX_LENGTH;
}

function validateProductPayload(payload) {
  const name = normalizeString(payload.name);
  const description = normalizeString(payload.description);
  const imageUrl = normalizeString(payload.image_url);
  const price = parseMoney(payload.price);
  const stock = parseInteger(payload.stock ?? 0);

  if (name.length < PRODUCT_NAME_MIN_LENGTH || name.length > PRODUCT_NAME_MAX_LENGTH) {
    return { error: `Product name must be ${PRODUCT_NAME_MIN_LENGTH}-${PRODUCT_NAME_MAX_LENGTH} characters long.` };
  }

  if (!Number.isFinite(price) || price < PRODUCT_PRICE_MIN || price > PRODUCT_PRICE_MAX) {
    return { error: `Product price must be between ${PRODUCT_PRICE_MIN} and ${PRODUCT_PRICE_MAX}.` };
  }

  if (!Number.isInteger(stock) || stock < STOCK_MIN || stock > STOCK_MAX) {
    return { error: `Stock must be a whole number between ${STOCK_MIN} and ${STOCK_MAX}.` };
  }

  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return { error: `Product description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }

  if (imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return { error: `Image URL must be ${PRODUCT_IMAGE_URL_MAX_LENGTH} characters or fewer.` };
  }

  return {
    value: {
      name,
      price,
      description,
      image_url: imageUrl,
      stock
    }
  };
}

function validateCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { value: [] };
  }

  if (items.length > 100) {
    return { error: "Too many checkout items." };
  }

  const normalizedItems = [];

  for (const item of items) {
    const name = normalizeString(item?.name);
    const quantity = parseInteger(item?.quantity ?? 1);
    const unitPrice = parseMoney(item?.price ?? 0);
    const sizeLabel = normalizeString(item?.sizeLabel);
    const packageLabel = normalizeString(item?.packageLabel);

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

    normalizedItems.push({
      name,
      quantity,
      price: unitPrice,
      sizeLabel: sizeLabel || null,
      packageLabel: packageLabel || null
    });
  }

  return { value: normalizedItems };
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
  const orderStatus = normalizeString(payload.order_status).toLowerCase();

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "Order ID is invalid." };
  }

  if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) {
    return { error: "Payment status is invalid." };
  }

  if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) {
    return { error: "Order status is invalid." };
  }

  return {
    value: {
      order_id: orderId,
      payment_status: paymentStatus,
      order_status: orderStatus
    }
  };
}

// test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// =========================
// ADMIN AUTH
// =========================
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

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

// =========================
// CHECKOUT / ORDERS
// =========================
app.post("/api/checkout", (req, res) => {
  console.log("NEW ORDER RECEIVED");
  console.log(req.body);

  const validation = validateCheckoutPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { customer_name, phone, address, total_amount, items } = validation.value;

  const orderSQL = `
    INSERT INTO orders (customer_name, phone, address, total_amount)
    VALUES (?, ?, ?, ?)
  `;

  db.query(orderSQL, [customer_name, phone, address, total_amount], (err, result) => {
    if (err) {
      console.error("Order insert failed:", err);
      return res.status(500).json({ error: "Failed to save order" });
    }

    const orderId = result.insertId;

    if (!Array.isArray(items) || items.length === 0) {
      return res.json({
        message: "Order received successfully",
        orderId
      });
    }

    const itemValues = items.map((item) => [
      orderId,
      item.name,
      item.quantity,
      item.price,
      item.sizeLabel,
      item.packageLabel
    ]);

    const itemsSQL = `
      INSERT INTO order_items
      (order_id, product_name, quantity, unit_price, size_label, package_label)
      VALUES ?
    `;

    db.query(itemsSQL, [itemValues], (err2) => {
      if (err2) {
        console.error("Item insert failed:", err2);
        return res.status(500).json({
          error: "Order saved but items failed"
        });
      }

      console.log("Order saved with ID:", orderId);

      res.json({
        message: "Order received successfully",
        orderId
      });
    });
  });
});

app.get("/api/orders", requireAdmin, (req, res) => {
  const sql = `
    SELECT *
    FROM orders
    ORDER BY created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch orders failed:", err);
      return res.status(500).json({
        error: "Failed to fetch orders"
      });
    }

    res.json(results);
  });
});

app.get("/api/order-items/:id", requireAdmin, (req, res) => {
  const orderId = req.params.id;

  const sql = `
    SELECT *
    FROM order_items
    WHERE order_id = ?
  `;

  db.query(sql, [orderId], (err, results) => {
    if (err) {
      console.error("Fetch items failed:", err);
      return res.status(500).json({
        error: "Failed to fetch order items"
      });
    }

    res.json(results);
  });
});

app.post("/api/update-order", requireAdmin, (req, res) => {
  const validation = validateOrderUpdatePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { order_id, payment_status, order_status } = validation.value;

  const sql = `
    UPDATE orders
    SET payment_status = ?, order_status = ?
    WHERE id = ?
  `;

  db.query(sql, [payment_status, order_status, order_id], (err) => {
    if (err) {
      console.error("Update order failed:", err);
      return res.status(500).json({ error: "Failed to update order" });
    }

    res.json({ message: "Order updated successfully" });
  });
});

// =========================
// PRODUCTS
// =========================

// public storefront still needs this one open
app.get("/api/products", (req, res) => {
  const sql = "SELECT * FROM products ORDER BY id DESC";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch products failed:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

app.post("/api/upload-product-image", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  res.json({
    message: "Image uploaded",
    imageUrl: `/uploads/${req.file.filename}`
  });
});

app.post("/api/add-product", requireAdmin, (req, res) => {
  const validation = validateProductPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { name, price, description, image_url, stock } = validation.value;

  const sql = `
    INSERT INTO products (name, price, description, image_url, stock)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, price, description, image_url, stock],
    (err, result) => {
      if (err) {
        console.error("Insert product error:", err);
        return res.status(500).json({ error: "Failed to add product" });
      }

      res.json({
        message: "Product added",
        productId: result.insertId
      });
    }
  );
});

app.post("/api/update-product", requireAdmin, (req, res) => {
  const productId = parseInteger(req.body.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "Product ID is invalid" });
  }

  const validation = validateProductPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { name, price, description, image_url, stock } = validation.value;

  const sql = `
    UPDATE products
    SET name = ?, price = ?, description = ?, image_url = ?, stock = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [name, price, description, image_url, stock, productId],
    (err) => {
      if (err) {
        console.error("Update product failed:", err);
        return res.status(500).json({ error: "Update failed" });
      }

      res.json({ message: "Product updated" });
    }
  );
});

app.post("/api/delete-product", requireAdmin, (req, res) => {
  const { id } = req.body;

  db.query("DELETE FROM products WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("Delete product failed:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({ message: "Product deleted" });
  });
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

// fallback route - keep this LAST
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.url}`
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
