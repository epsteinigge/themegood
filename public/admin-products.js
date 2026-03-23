let allProducts = [];

function getAdminToken() {
  return localStorage.getItem("adminToken") || "";
}

function getAdminHeaders(extra = {}) {
  return {
    "x-admin-token": getAdminToken(),
    ...extra
  };
}

function handleUnauthorized(status) {
  if (status === 401) {
    localStorage.removeItem("adminToken");
    showToast("Your admin session expired. Please log in again.", "error");
    setTimeout(() => {
      window.location.href = "admin-login.html";
    }, 700);
    return true;
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `${type} show`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = "";
  }, 2400);
}

function stockState(stock) {
  const value = Number(stock || 0);
  if (value <= 0) return "out";
  if (value <= 5) return "low";
  return "in";
}

function updateStats(products) {
  const total = products.length;
  const inStock = products.filter(p => stockState(p.stock) === "in").length;
  const lowStock = products.filter(p => stockState(p.stock) === "low").length;
  const outStock = products.filter(p => stockState(p.stock) === "out").length;

  const totalEl = document.getElementById("stat-total-products");
  const inEl = document.getElementById("stat-in-stock");
  const lowEl = document.getElementById("stat-low-stock");
  const outEl = document.getElementById("stat-out-stock");

  if (totalEl) totalEl.textContent = total;
  if (inEl) inEl.textContent = inStock;
  if (lowEl) lowEl.textContent = lowStock;
  if (outEl) outEl.textContent = outStock;
}

function setPreview(containerId, src) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const safeSrc = String(src || "").trim();

  if (!safeSrc) {
    box.innerHTML = `<div class="image-preview-placeholder">Product preview will appear here.</div>`;
    return;
  }

  box.innerHTML = `<img src="${escapeHtml(safeSrc)}" alt="Preview">`;
}

function wireAddPreview() {
  const urlInput = document.getElementById("image");
  const fileInput = document.getElementById("imageFile");

  urlInput?.addEventListener("input", () => {
    if (fileInput?.files?.[0]) return;
    setPreview("addImagePreview", urlInput.value);
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      setPreview("addImagePreview", urlInput?.value || "");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPreview("addImagePreview", previewUrl);
  });
}

function renderProducts(products) {
  const list = document.getElementById("productList");
  const count = document.getElementById("productCount");
  if (!list) return;

  if (count) {
    count.textContent = `Showing ${products.length} product${products.length === 1 ? "" : "s"}`;
  }

  list.innerHTML = "";

  if (!Array.isArray(products) || products.length === 0) {
    list.innerHTML = `<p class="empty-state">No products found.</p>`;
    return;
  }

  products.forEach(product => {
    const div = document.createElement("div");
    div.className = "product-item";

    const stock = Number(product.stock || 0);
    const stockKey = stockState(stock);
    const stockLabel =
      stockKey === "out" ? "Out of Stock" :
      stockKey === "low" ? "Low Stock" :
      "In Stock";

    const stockClass =
      stockKey === "out" ? "stock-out" :
      stockKey === "low" ? "stock-low" :
      "stock-ok";

    div.innerHTML = `
      <div class="product-item-grid">
        <div class="product-thumb-wrap">
          ${
            product.image_url
              ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" class="product-thumb">`
              : `<div class="image-preview-box"><div class="image-preview-placeholder">No image</div></div>`
          }

          <div class="product-meta">
            <span class="meta-pill">ID #${Number(product.id)}</span>
            <span class="meta-pill">RM ${Number(product.price || 0).toFixed(2)}</span>
            <span class="meta-pill ${stockClass}">${stockLabel}: ${stock}</span>
          </div>
        </div>

        <div>
          <div class="field">
            <label for="name-${product.id}">Product Name</label>
            <input id="name-${product.id}" value="${escapeHtml(product.name || "")}" placeholder="Product name">
          </div>

          <div class="inline-grid">
            <div class="field">
              <label for="price-${product.id}">Price (RM)</label>
              <input id="price-${product.id}" type="number" step="0.01" min="0" value="${Number(product.price || 0)}" placeholder="Price">
            </div>

            <div class="field">
              <label for="stock-${product.id}">Stock</label>
              <input id="stock-${product.id}" type="number" min="0" value="${Number(product.stock || 0)}" placeholder="Stock">
            </div>
          </div>

          <div class="field">
            <label for="image-${product.id}">Image URL</label>
            <input id="image-${product.id}" value="${escapeHtml(product.image_url || "")}" placeholder="Image URL">
          </div>

          <div class="field">
            <label for="desc-${product.id}">Description</label>
            <textarea id="desc-${product.id}" placeholder="Description">${escapeHtml(product.description || "")}</textarea>
          </div>

          <div class="product-actions">
            <button class="primary-btn" type="button" onclick="updateProduct(${Number(product.id)})">Save Changes</button>
            <button class="danger-btn" type="button" onclick="deleteProduct(${Number(product.id)})">Delete</button>
          </div>
        </div>
      </div>
    `;

    list.appendChild(div);
  });
}

function applyProductFilters() {
  const search = (document.getElementById("productSearchInput")?.value || "").trim().toLowerCase();
  const sort = document.getElementById("productSortSelect")?.value || "newest";
  const stockFilter = document.getElementById("productStockFilter")?.value || "";

  let filtered = [...allProducts].filter(product => {
    const haystack = [
      product.name,
      product.description,
      product.price,
      product.stock,
      product.id
    ].join(" ").toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const key = stockState(product.stock);
    const matchesStock = !stockFilter || key === stockFilter;

    return matchesSearch && matchesStock;
  });

  filtered.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return Number(a.id) - Number(b.id);
      case "name-asc":
        return String(a.name || "").localeCompare(String(b.name || ""));
      case "name-desc":
        return String(b.name || "").localeCompare(String(a.name || ""));
      case "price-asc":
        return Number(a.price || 0) - Number(b.price || 0);
      case "price-desc":
        return Number(b.price || 0) - Number(a.price || 0);
      case "stock-asc":
        return Number(a.stock || 0) - Number(b.stock || 0);
      case "stock-desc":
        return Number(b.stock || 0) - Number(a.stock || 0);
      case "newest":
      default:
        return Number(b.id) - Number(a.id);
    }
  });

  renderProducts(filtered);
}

async function logoutAdmin() {
  const token = getAdminToken();

  try {
    if (token) {
      await fetch("/api/admin-logout", {
        method: "POST",
        headers: getAdminHeaders()
      });
    }
  } catch (error) {
    console.error("Logout request failed:", error);
  } finally {
    localStorage.removeItem("adminToken");
    window.location.href = "admin-login.html";
  }
}

async function loadProducts() {
  const list = document.getElementById("productList");
  if (list) {
    list.innerHTML = `<p class="empty-state">Loading products...</p>`;
  }

  try {
    const res = await fetch("/api/products");
    const products = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(products.error || "Failed to load products");
    }

    allProducts = Array.isArray(products) ? products : [];
    updateStats(allProducts);
    applyProductFilters();
  } catch (error) {
    console.error("Failed to load products:", error);
    if (list) {
      list.innerHTML = `<p class="empty-state">Failed to load products.</p>`;
    }
    showToast(error.message || "Failed to load products", "error");
  }
}

async function addProduct() {
  const name = document.getElementById("name")?.value.trim();
  const price = document.getElementById("price")?.value;
  const description = document.getElementById("description")?.value.trim();
  const stock = document.getElementById("stock")?.value;
  const imageFile = document.getElementById("imageFile")?.files?.[0];
  const imageUrlText = document.getElementById("image")?.value.trim();

  if (!name) {
    showToast("Please enter a product name.", "error");
    return;
  }

  if (price === "" || price === null || price === undefined) {
    showToast("Please enter a price.", "error");
    return;
  }

  try {
    let imageUrl = imageUrlText || "";

    if (imageFile) {
      const formData = new FormData();
      formData.append("image", imageFile);

      const uploadRes = await fetch("/api/upload-product-image", {
        method: "POST",
        headers: getAdminHeaders(),
        body: formData
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        if (handleUnauthorized(uploadRes.status)) return;
        throw new Error(uploadData.error || "Image upload failed");
      }

      imageUrl = uploadData.imageUrl;
    }

    const res = await fetch("/api/add-product", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        name,
        price,
        description,
        image_url: imageUrl,
        stock
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Failed to add product");
    }

    document.getElementById("name").value = "";
    document.getElementById("price").value = "";
    document.getElementById("description").value = "";
    document.getElementById("stock").value = "";
    document.getElementById("image").value = "";
    document.getElementById("imageFile").value = "";
    setPreview("addImagePreview", "");

    showToast("Product added successfully.", "success");
    loadProducts();
  } catch (err) {
    console.error("Add product failed:", err);
    showToast(err.message || "Failed to add product", "error");
  }
}

async function updateProduct(id) {
  const name = document.getElementById(`name-${id}`)?.value.trim();
  const price = document.getElementById(`price-${id}`)?.value;
  const description = document.getElementById(`desc-${id}`)?.value.trim();
  const stock = document.getElementById(`stock-${id}`)?.value;
  const image_url = document.getElementById(`image-${id}`)?.value.trim();

  if (!name) {
    showToast("Product name cannot be empty.", "error");
    return;
  }

  try {
    const res = await fetch("/api/update-product", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        id,
        name,
        price,
        description,
        image_url,
        stock
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Update failed");
    }

    showToast("Product updated.", "success");
    loadProducts();
  } catch (error) {
    console.error("Update product failed:", error);
    showToast(error.message || "Failed to update product", "error");
  }
}

async function deleteProduct(id) {
  const ok = confirm("Delete this product?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ id })
    });

    const data = await res.json();

    if (!res.ok) {
      if (handleUnauthorized(res.status)) return;
      throw new Error(data.error || "Delete failed");
    }

    showToast("Product deleted.", "success");
    loadProducts();
  } catch (error) {
    console.error("Delete product failed:", error);
    showToast(error.message || "Failed to delete product", "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  wireAddPreview();
  document.getElementById("productSearchInput")?.addEventListener("input", applyProductFilters);
  document.getElementById("productSortSelect")?.addEventListener("change", applyProductFilters);
  document.getElementById("productStockFilter")?.addEventListener("change", applyProductFilters);
  loadProducts();
});