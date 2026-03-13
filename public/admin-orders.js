let allOrders = [];

    function badge(type){
  return `<span class="badge badge-${type}">${type}</span>`;
}

function updateStats(orders) {
  const totalOrders = orders.length;
  const unpaidOrders = orders.filter(order => order.payment_status === "unpaid").length;
  const paidOrders = orders.filter(order => order.payment_status === "paid").length;
  const revenue = orders
    .filter(order => order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const totalEl = document.getElementById("stat-total-orders");
  const unpaidEl = document.getElementById("stat-unpaid-orders");
  const paidEl = document.getElementById("stat-paid-orders");
  const revenueEl = document.getElementById("stat-revenue");

  if (totalEl) totalEl.textContent = totalOrders;
  if (unpaidEl) unpaidEl.textContent = unpaidOrders;
  if (paidEl) paidEl.textContent = paidOrders;
  if (revenueEl) revenueEl.textContent = `RM ${revenue.toFixed(2)}`;
}

function renderOrders(orders) {
  const ordersBody = document.getElementById("ordersBody");
  if (!ordersBody) return;

  if (!Array.isArray(orders) || orders.length === 0) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="9">No orders found.</td>
      </tr>
    `;
    return;
  }

  const orderCount = document.getElementById("orderCount");
if(orderCount){
  orderCount.textContent = `Showing ${orders.length} orders`;
}

  ordersBody.innerHTML = "";

  orders.forEach(order => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${order.id}</td>
      <td>${order.customer_name}</td>
      <td>
       ${order.phone}
       <button onclick="copyPhone('${order.phone}')">📋</button>
      <a href="https://wa.me/6${order.phone.replace(/\D/g,'')}" target="_blank">💬</a>
      </td>
      <td>${order.address}</td>
      <td>RM ${Number(order.total_amount).toFixed(2)}</td>

      <td>
        <select id="payment-${order.id}">
          <option value="unpaid" ${order.payment_status === "unpaid" ? "selected" : ""}>unpaid</option>
          <option value="paid" ${order.payment_status === "paid" ? "selected" : ""}>paid</option>
          <option value="failed" ${order.payment_status === "failed" ? "selected" : ""}>failed</option>
        </select>
      </td>

<td>${badge(order.payment_status)}</td>
<td>${badge(order.order_status)}</td>

      <td>
        <select id="status-${order.id}">
          <option value="new" ${order.order_status === "new" ? "selected" : ""}>new</option>
          <option value="confirmed" ${order.order_status === "confirmed" ? "selected" : ""}>confirmed</option>
          <option value="packed" ${order.order_status === "packed" ? "selected" : ""}>packed</option>
          <option value="shipped" ${order.order_status === "shipped" ? "selected" : ""}>shipped</option>
          <option value="completed" ${order.order_status === "completed" ? "selected" : ""}>completed</option>
          <option value="cancelled" ${order.order_status === "cancelled" ? "selected" : ""}>cancelled</option>
        </select>
        <button onclick="saveOrder(${order.id})">Save</button>
      </td>

      <td>${new Date(order.created_at).toLocaleString()}</td>

<td>
  <button onclick="openOrderModal(${order.id})">View Details</button>
</td>
    `;

    ordersBody.appendChild(row);
  });
}

async function loadOrders() {
  const ordersBody = document.getElementById("ordersBody");
  if (!ordersBody) return;

  ordersBody.innerHTML = `
    <tr>
      <td colspan="9">Loading orders...</td>
    </tr>
  `;

  try {
    const response = await fetch("/api/orders");
    const orders = await response.json();

    if (!response.ok) {
      throw new Error(orders.error || "Failed to load orders");
    }

    allOrders = Array.isArray(orders) ? orders : [];

allOrders.sort((a, b) => {
  return new Date(b.created_at) - new Date(a.created_at);
});
    updateStats(allOrders);
    applyFilters();
  } catch (error) {
    console.error("Failed to load orders:", error);
    ordersBody.innerHTML = `
      <tr>
        <td colspan="9">Failed to load orders.</td>
      </tr>
    `;
  }
}

function applyFilters() {
  const searchValue = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const paymentValue = document.getElementById("paymentFilter")?.value || "";
  const statusValue = document.getElementById("statusFilter")?.value || "";

  const filtered = allOrders.filter(order => {
    const matchesSearch =
      String(order.id).toLowerCase().includes(searchValue) ||
      String(order.customer_name || "").toLowerCase().includes(searchValue) ||
      String(order.phone || "").toLowerCase().includes(searchValue);

    const matchesPayment = !paymentValue || order.payment_status === paymentValue;
    const matchesStatus = !statusValue || order.order_status === statusValue;

    return matchesSearch && matchesPayment && matchesStatus;
  });

  renderOrders(filtered);
}

async function toggleItems(orderId, button) {
  const box = document.getElementById(`items-${orderId}`);
  if (!box) return;

  if (box.style.display === "block") {
    box.style.display = "none";
    button.textContent = "View Items";
    return;
  }

  box.style.display = "block";
  box.innerHTML = "Loading items...";

  try {
    const response = await fetch(`/api/order-items/${orderId}`);
    const items = await response.json();

    if (!response.ok) {
      throw new Error(items.error || "Failed to load items");
    }

    if (!Array.isArray(items) || items.length === 0) {
      box.innerHTML = "No items found.";
      button.textContent = "Hide Items";
      return;
    }

    box.innerHTML = items.map(item => `
      <div>
        <strong>${item.product_name}</strong><br>
        Qty: ${item.quantity} |
        RM ${Number(item.unit_price).toFixed(2)}
        ${item.size_label ? `| Size: ${item.size_label}` : ""}
        ${item.package_label ? `| Package: ${item.package_label}` : ""}
      </div>
      <hr>
    `).join("");

    button.textContent = "Hide Items";
  } catch (error) {
    console.error("Failed to load items:", error);
    box.innerHTML = "Failed to load items.";
  }
}

async function saveOrder(orderId) {
  const paymentSelect = document.getElementById(`payment-${orderId}`);
  const statusSelect = document.getElementById(`status-${orderId}`);

  if (!paymentSelect || !statusSelect) return;

  const paymentStatus = paymentSelect.value;
  const orderStatus = statusSelect.value;

  try {
    const response = await fetch("/api/update-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        order_id: orderId,
        payment_status: paymentStatus,
        order_status: orderStatus
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to update order");
    }

    alert("Order updated successfully");

    const target = allOrders.find(order => order.id === orderId);
    if (target) {
      target.payment_status = paymentStatus;
      target.order_status = orderStatus;
      updateStats(allOrders);
      applyFilters();
    }
  } catch (error) {
    console.error("Failed to update order:", error);
    alert("Failed to update order");
  }
}
async function openOrderModal(orderId) {
  const modal = document.getElementById("orderModal");
  const modalBody = document.getElementById("orderModalBody");

  if (!modal || !modalBody) return;

  modal.style.display = "block";
  modalBody.innerHTML = "Loading order details...";

  try {
    const order = allOrders.find(o => Number(o.id) === Number(orderId));

    if (!order) {
      modalBody.innerHTML = "Order not found.";
      return;
    }

    const response = await fetch(`/api/order-items/${orderId}`);
    const items = await response.json();

    if (!response.ok) {
      throw new Error(items.error || "Failed to load order items");
    }

    modalBody.innerHTML = `
      <h2 style="margin-top:0;">Order #${order.id}</h2>

      <div class="detail-grid">
        <div class="detail-card">
          <h3>Customer Info</h3>
          <p><strong>Name:</strong> ${order.customer_name}</p>
          <p><strong>Phone:</strong> ${order.phone}</p>
          <p><strong>Address:</strong> ${order.address}</p>
        </div>

        <div class="detail-card">
          <h3>Order Info</h3>
          <p><strong>Payment:</strong> ${badge(order.payment_status)}</p>
          <p><strong>Status:</strong> ${badge(order.order_status)}</p>
          <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
        </div>
      </div>

      <div class="detail-items">
        <h3>Items</h3>
        ${
          Array.isArray(items) && items.length > 0
            ? items.map(item => `
              <div class="detail-item">
                <p><strong>${item.product_name}</strong></p>
                <p>
                  Qty: ${item.quantity}
                  | Price: RM ${Number(item.unit_price).toFixed(2)}
                  ${item.size_label ? `| Size: ${item.size_label}` : ""}
                  ${item.package_label ? `| Package: ${item.package_label}` : ""}
                </p>
              </div>
            `).join("")
            : "<p>No items found.</p>"
        }
      </div>

      <div class="detail-total">
        Total: RM ${Number(order.total_amount).toFixed(2)}
      </div>
    `;
  } catch (error) {
    console.error("Failed to open modal:", error);
    modalBody.innerHTML = "Failed to load order details.";
  }
}

function closeOrderModal() {
  const modal = document.getElementById("orderModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function logoutAdmin() {
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("adminToken");
  window.location.href = "admin-login.html";
}

  document.getElementById("searchInput")?.addEventListener("input", applyFilters);
  document.getElementById("paymentFilter")?.addEventListener("change", applyFilters);
  document.getElementById("statusFilter")?.addEventListener("change", applyFilters);
;

function exportOrders(){
  let csv = "Order ID,Customer,Phone,Address,Total,Payment Status,Order Status,Date\n";

  allOrders.forEach(order=>{
    csv += `${order.id},${order.customer_name},${order.phone},${order.address},${order.total_amount},${order.payment_status},${order.order_status},${order.created_at}\n`;
  });

  const blob = new Blob([csv],{type:"text/csv"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "orders.csv";
  a.click();
}

function copyPhone(phone){
  navigator.clipboard.writeText(phone);
  alert("Phone copied: " + phone);
}

window.addEventListener("DOMContentLoaded", () => {
  loadOrders();

  setInterval(loadOrders, 10000);
});