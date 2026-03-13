console.log("SERVER STARTED");

const express = require("express");
const path = require("path");
const mysql = require("mysql2");

const crypto = require("crypto");
const sessions = new Map();

const app = express();
const port = 3000;

const fs = require("fs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve frontend
app.use(express.static(path.join(__dirname, "public")));

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection failed:", err);
    return;
  }
  console.log("Connected to MySQL");
});

// test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// checkout route
app.post("/api/checkout", (req, res) => {

  console.log("NEW ORDER RECEIVED");
  console.log(req.body);

  const { customer_name, phone, address, total_amount, items } = req.body;

  if (!customer_name || !phone || !address || !total_amount) {
    return res.status(400).json({
      error: "Missing required fields"
    });
  }

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

    if (!items || items.length === 0) {
      return res.json({
        message: "Order received successfully",
        orderId
      });
    }

    const itemValues = items.map(item => [
      orderId,
      item.name,
      item.quantity,
      item.price,
      item.sizeLabel || null,
      item.packageLabel || null
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

// get all orders for admin
app.get("/api/orders", (req, res) => {

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

// get items of a specific order
app.get("/api/order-items/:id", (req, res) => {

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

app.post("/api/admin-login", (req, res) => {
  const { password } = req.body;

  if (password !== "themegoodadmin123") {
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { loggedIn: true });

  res.json({ message: "Login successful", token });
});

app.get("/api/admin-check", (req, res) => {
  const token = req.headers["x-admin-token"];

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ ok: true });
});

app.post("/api/admin-logout", (req, res) => {
  const token = req.headers["x-admin-token"];

  if (token) {
    sessions.delete(token);
  }

  res.json({ message: "Logged out" });
});

app.post("/api/update-order", (req, res) => {

  const { order_id, payment_status, order_status } = req.body;

  const sql = `
    UPDATE orders
    SET payment_status = ?, order_status = ?
    WHERE id = ?
  `;

  db.query(sql, [payment_status, order_status, order_id], (err) => {

    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update order" });
    }

    res.json({ message: "Order updated successfully" });

  });

});

app.get("/api/products", (req,res)=>{
  const sql = "SELECT * FROM products ORDER BY id DESC";

  db.query(sql,(err,results)=>{
    if(err){
      return res.status(500).json({error:"Database error"});
    }

    res.json(results);
  });
});

app.post("/api/delete-product",(req,res)=>{

  const {id} = req.body;

  const sql = "DELETE FROM products WHERE id=?";

  db.query(sql,[id],(err)=>{
    if(err){
      return res.status(500).json({error:"Delete failed"});
    }

    res.json({message:"Product deleted"});
  });

});

// fallback route
app.post("/api/upload-product-image", upload.single("image"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  res.json({
    message: "Image uploaded",
    imageUrl: `/uploads/${req.file.filename}`
  });

});

app.post("/api/add-product", (req, res) => {
  const { name, price, description, image_url, stock } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const sql = `
    INSERT INTO products (name, price, description, image_url, stock)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(sql, [name, price, description || "", image_url || "", Number(stock || 0)], (err, result) => {
    if (err) {
      console.error("Insert product error:", err);
      return res.status(500).json({ error: "Failed to add product" });
    }

    res.json({
      message: "Product added",
      productId: result.insertId
    });
  });
});

app.post("/api/add-product", (req, res) => {
  const { name, price, description, image_url, stock } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const sql = `
    INSERT INTO products (name, price, description, image_url, stock)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, price, description || "", image_url || "", Number(stock || 0)],
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

// fallback route (must be last)
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.url}`
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});