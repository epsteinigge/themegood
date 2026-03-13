async function loadProducts() {
  const list = document.getElementById("productList");
  if (!list) return;

  try {
    const res = await fetch("/api/products");
    const products = await res.json();

    list.innerHTML = "";

    if (!Array.isArray(products) || products.length === 0) {
      list.innerHTML = "<p>No products found.</p>";
      return;
    }

    products.forEach(product => {
      const div = document.createElement("div");
      div.className = "product-item";

      div.innerHTML = `
        <div class="product-item-grid">
          <div>
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-thumb">` : ""}
          </div>
          <div>
            <div class="field">
              <label for="name-${product.id}">Product name</label>
              <input id="name-${product.id}" value="${product.name || ""}" placeholder="Product name">
            </div>
            <div class="field">
              <label for="price-${product.id}">Price</label>
              <input id="price-${product.id}" type="number" value="${product.price || 0}" placeholder="Price">
            </div>
            <div class="field">
              <label for="stock-${product.id}">Stock</label>
              <input id="stock-${product.id}" type="number" value="${product.stock || 0}" placeholder="Stock">
            </div>
            <div class="field">
              <label for="image-${product.id}">Image URL</label>
              <input id="image-${product.id}" value="${product.image_url || ""}" placeholder="Image URL">
            </div>
            <div class="field">
              <label for="desc-${product.id}">Description</label>
              <textarea id="desc-${product.id}" placeholder="Description">${product.description || ""}</textarea>
            </div>
            <div class="product-actions">
              <button class="primary-btn" onclick="updateProduct(${product.id})">Save Changes</button>
              <button class="danger-btn" onclick="deleteProduct(${product.id})">Delete</button>
            </div>
          </div>
        </div>
      `;

      list.appendChild(div);
    });
  } catch (error) {
    console.error("Failed to load products:", error);
    alert("Failed to load products");
  }
}

async function addProduct() {
  const name = document.getElementById("name")?.value.trim();
  const price = document.getElementById("price")?.value;
  const description = document.getElementById("description")?.value.trim();
  const stock = document.getElementById("stock")?.value;
  const imageFile = document.getElementById("imageFile")?.files?.[0];
  const imageUrlText = document.getElementById("image")?.value.trim();

  try {
    let imageUrl = imageUrlText || "";

    if (imageFile) {
      const formData = new FormData();
      formData.append("image", imageFile);

      const uploadRes = await fetch("/api/upload-product-image", {
        method: "POST",
        body: formData
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Image upload failed");
      }

      imageUrl = uploadData.imageUrl;
    }

    const res = await fetch("/api/add-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
      throw new Error(data.error || "Failed to add product");
    }

    alert("Product added!");

    if (document.getElementById("name")) document.getElementById("name").value = "";
    if (document.getElementById("price")) document.getElementById("price").value = "";
    if (document.getElementById("description")) document.getElementById("description").value = "";
    if (document.getElementById("stock")) document.getElementById("stock").value = "";
    if (document.getElementById("image")) document.getElementById("image").value = "";
    if (document.getElementById("imageFile")) document.getElementById("imageFile").value = "";

    loadProducts();
  } catch (err) {
    console.error("Add product failed:", err);
    alert("Failed: " + err.message);
  }
}

async function updateProduct(id) {
  const name = document.getElementById(`name-${id}`)?.value.trim();
  const price = document.getElementById(`price-${id}`)?.value;
  const description = document.getElementById(`desc-${id}`)?.value.trim();
  const stock = document.getElementById(`stock-${id}`)?.value;
  const image_url = document.getElementById(`image-${id}`)?.value.trim();

  try {
    const res = await fetch("/api/update-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
      throw new Error(data.error || "Update failed");
    }

    alert("Product updated");
    loadProducts();
  } catch (error) {
    console.error("Update product failed:", error);
    alert("Failed: " + error.message);
  }
}

async function deleteProduct(id) {
  const ok = confirm("Delete this product?");
  if (!ok) return;

  try {
    const res = await fetch("/api/delete-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Delete failed");
    }

    alert("Product deleted");
    loadProducts();
  } catch (error) {
    console.error("Delete product failed:", error);
    alert("Failed: " + error.message);
  }
}

window.addEventListener("DOMContentLoaded", loadProducts);
