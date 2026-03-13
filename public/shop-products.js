const productMediaById = {
  1: {
    hoverImage: "photos/Pomegranate 600g.png",
    gallery: [
      "photos/Pomegranate 300g.png",
      "photos/Pomegranate 600g.png",
      "photos/Pomegranate 800g (1).png"
    ]
  },
  2: {
    hoverImage: "photos/Bilberry 600g.png",
    gallery: [
      "photos/Bilberry 300g.png",
      "photos/Bilberry 600g.png",
      "photos/Bilberry 800g.png"
    ]
  },
  3: {
    hoverImage: "photos/Melon Avocado 600g.png",
    gallery: [
      "photos/Melon Avocado 300g.png",
      "photos/Melon Avocado 600g.png",
      "photos/Melon Avocado 800g.png"
    ]
  },
  4: {
    hoverImage: "photos/Passion Fruit 600g.png",
    gallery: [
      "photos/Passion Fruit 300g.png",
      "photos/Passion Fruit 600g.png",
      "photos/Passion Fruit 800g.png"
    ]
  },
  5: {
    hoverImage: "photos/Oat Beta 600g.png",
    gallery: [
      "photos/Oat Beta 300g.png",
      "photos/Oat Beta 600g.png",
      "photos/Oat Beta 800g (1).png"
    ]
  },
  6: {
    hoverImage: "photos/Cocoa800g.png",
    gallery: [
      "photos/Cocoa 300g.png",
      "photos/Cocoa800g.png",
      "photos/Cocoa800g.png"
    ]
  }
};

let allProducts = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSearchQuery() {
  const input = document.getElementById("productSearchInput");
  return (input?.value || "").trim().toLowerCase();
}

function matchesProduct(product, query) {
  if (!query) return true;
  const haystack = [
    product.name,
    product.description,
    product.price
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function renderProducts(products) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!Array.isArray(products) || products.length === 0) {
    grid.innerHTML = "<p class=\"product-search-empty\">No products match your search.</p>";
    return;
  }

  products.forEach(product => {
    const card = document.createElement("div");
    const media = productMediaById[product.id] || {};
    const imageUrl = product.image_url || media.gallery?.[0] || "";
    const hoverImage = media.hoverImage || imageUrl;
    const gallery = Array.isArray(media.gallery) && media.gallery.length
      ? media.gallery.join(", ")
      : imageUrl;

    card.className = "product-card";
    card.dataset.id = product.id;
    card.dataset.name = product.name || "";
    card.dataset.price = product.price || 0;
    card.dataset.description = product.description || "";
    card.dataset.image = imageUrl;
    card.dataset.hoverImage = hoverImage;
    card.dataset.gallery = gallery;

    card.innerHTML = `
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}">
      <h4>${escapeHtml(product.name)}</h4>
      <p>${escapeHtml(product.description || "")}</p>
      <button class="add-to-cart" type="button">Add to Cart</button>
    `;

    grid.appendChild(card);
  });

  if (typeof window.enhanceShopProductCards === "function") {
    window.enhanceShopProductCards(document);
  }
}

function applyProductSearch() {
  const query = getSearchQuery();
  const filteredProducts = allProducts.filter(product => matchesProduct(product, query));
  renderProducts(filteredProducts);
}

function bindProductSearch() {
  const input = document.getElementById("productSearchInput");
  const button = document.getElementById("productSearchButton");
  if (!input || !button) return;

  button.addEventListener("click", applyProductSearch);
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyProductSearch();
  });
}

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    const products = await res.json();

    if (!Array.isArray(products) || products.length === 0) {
      allProducts = [];
      renderProducts([]);
      return;
    }

    allProducts = products;
    applyProductSearch();
  } catch (error) {
    console.error("Failed to load products:", error);
    const grid = document.getElementById("productGrid");
    if (grid) {
      grid.innerHTML = "<p class=\"product-search-empty\">Failed to load products.</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindProductSearch();
  loadProducts();
});
