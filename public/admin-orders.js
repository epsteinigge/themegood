let allOrders = [];

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

function escapeAttr(value) {
  return escapeHtml(value);
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

function badge(type) {
  const safeType = String(type || "").toLowerCase();
  return `<span class="badge badge-${escapeAttr(safeType)}">${escapeHtml(safeType)}</span>`;
}

function formatPhoneForWhatsApp(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `6${digits}`;
  return digits;
}

function csvCell(value) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replace(/"/g, '""')}"`;
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

  const orderCount = document.getElementById("orderCount");
  if (orderCount) {
    orderCount.textContent = `Showing ${orders.length} order${orders.length === 1 ? "" : "s"}`;
  }

  if (!Array.isArray(orders) || orders.length === 0) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="11">No orders found.</td>
      </tr>
    `;
    return;
  }

  ordersBody.innerHTML = "";

  orders.forEach(order => {
    const row = document.createElement("tr");
    const safePhone = String(order.phone || "");
    const whatsappPhone = formatPhoneForWhatsApp(safePhone);

    row.innerHTML = `
      <td><strong>#${Number(order.id)}</strong></td>
      <td>${escapeHtml(order.customer_name)}</td>
      <td>
        <div class="mini-actions">
          <span>${escapeHtml(safePhone)}</span>
          <button class="table-btn" type="button" onclick="copyPhone(${JSON.stringify(safePhone)})">Copy</button>
          ${
            whatsappPhone
              ? `<a class="icon-link" href="https://wa.me/${encodeURIComponent(whatsappPhone)}" target="_blank" rel="noopener noreferrer" title="Open WhatsApp">💬</a>`
              : ""
          }
        </div>
      </td>
      <td>${escapeHtml(order.address)}</td>
      <td><strong>RM ${Number(order.total_amount || 0).toFixed(2)}</strong></td>
      <td>
        <div class="select-inline">
          <select id="payment-${Number(order.id)}">
            <option value="unpaid" ${order.payment_status === "unpaid" ? "selected" : ""}>unpaid</option>
            <option value="paid" ${order.payment_status === "paid" ? "selected" : ""}>paid</option>
            <option value="failed" ${order.payment_status === "failed" ? "selected" : ""}>failed</option>
          </select>
        </div>
      </td>
      <td>${badge(order.payment_status)}</td>
      <td>${badge(order.order_status)}</td>
      <td>
        <div class="select-inline">
          <select id="status-${Number(order.id)}">
            <option value="new" ${order.order_status === "new" ? "selected" : ""}>new</option>
            <option value="confirmed" ${order.order_status === "confirmed" ? "selected" : ""}>confirmed</option>
            <option value="packed" ${order.order_status === "packed" ? "selected" : ""}>packed</option>
            <option value="shipped" ${order.order_status === "shipped" ? "selected" : ""}>shipped</option>
            <option value="completed" ${order.order_status === "completed" ? "selected" : ""}>completed</option>
            <option value="cancelled" ${order.order_status === "cancelled" ? "selected" : ""}>cancelled</option>
          </select>
          <button class="table-btn save" type="button" onclick="saveOrder(${Number(order.id)})">Save</button>
        </div>
      </td>
      <td>${new Date(order.created_at).toLocaleString()}</td>
      <td>
        <button class="table-btn view" type="button" onclick="openOrderModal(${Number(order.id)})">View</button>
      </td>
    `;

    ordersBody.appendChild(row);
  });
}

async function loadOrders() {
  const ordersBody = document.getElementById("ordersBody");
  if (ordersBody) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="11">Loading orders.</td>
      </tr>
    `;
  }

  try {
    const response = await fetch("/api/orders", {
      headers: getAdminHeaders()
    });

    const orders = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(orders.error || "Failed to load orders");
    }

    allOrders = Array.isArray(orders) ? orders : [];
    allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    updateStats(allOrders);
    applyFilters();
  } catch (error) {
    console.error("Failed to load orders:", error);
    if (ordersBody) {
      ordersBody.innerHTML = `
        <tr>
          <td colspan="11">Failed to load orders.</td>
        </tr>
      `;
    }
    showToast(error.message || "Failed to load orders", "error");
  }
}

function applyFilters() {
  const searchValue = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const paymentValue = (document.getElementById("paymentFilter")?.value || "").trim().toLowerCase();
  const statusValue = (document.getElementById("statusFilter")?.value || "").trim().toLowerCase();

  const filtered = allOrders.filter(order => {
    const matchesSearch =
      !searchValue ||
      String(order.id || "").toLowerCase().includes(searchValue) ||
      String(order.customer_name || "").toLowerCase().includes(searchValue) ||
      String(order.phone || "").toLowerCase().includes(searchValue) ||
      String(order.address || "").toLowerCase().includes(searchValue);

    const matchesPayment = !paymentValue || String(order.payment_status || "").toLowerCase() === paymentValue;
    const matchesStatus = !statusValue || String(order.order_status || "").toLowerCase() === statusValue;

    return matchesSearch && matchesPayment && matchesStatus;
  });

  renderOrders(filtered);
}

function clearFilters() {
  const searchInput = document.getElementById("searchInput");
  const paymentFilter = document.getElementById("paymentFilter");
  const statusFilter = document.getElementById("statusFilter");

  if (searchInput) searchInput.value = "";
  if (paymentFilter) paymentFilter.value = "";
  if (statusFilter) statusFilter.value = "";

  applyFilters();
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
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        order_id: orderId,
        payment_status: paymentStatus,
        order_status: orderStatus
      })
    });

    const result = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(result.error || "Failed to update order");
    }

    const target = allOrders.find(order => Number(order.id) === Number(orderId));
    if (target) {
      target.payment_status = paymentStatus;
      target.order_status = orderStatus;
    }

    updateStats(allOrders);
    applyFilters();
    showToast(`Order #${orderId} updated.`, "success");
  } catch (error) {
    console.error("Failed to update order:", error);
    showToast(error.message || "Failed to update order", "error");
  }
}

async function openOrderModal(orderId) {
  const modal = document.getElementById("orderModal");
  const modalBody = document.getElementById("orderModalBody");

  if (!modal || !modalBody) return;

  modal.style.display = "block";
  modalBody.innerHTML = "Loading order details.";

  try {
    const order = allOrders.find(o => Number(o.id) === Number(orderId));

    if (!order) {
      modalBody.innerHTML = "Order not found.";
      return;
    }

    const response = await fetch(`/api/order-items/${orderId}`, {
      headers: getAdminHeaders()
    });

    const items = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(items.error || "Failed to load order items");
    }

    modalBody.innerHTML = `
      <h2 style="margin-top:0;">Order #${Number(order.id)}</h2>

      <div class="detail-grid">
        <div class="detail-card">
          <h3>Customer Info</h3>
          <p><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(order.phone)}</p>
          <p><strong>Address:</strong> ${escapeHtml(order.address)}</p>
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
                <p><strong>${escapeHtml(item.product_name)}</strong></p>
                <p>
                  Qty: ${Number(item.quantity || 0)}
                  | Price: RM ${Number(item.unit_price || 0).toFixed(2)}
                  ${item.size_label ? `| Size: ${escapeHtml(item.size_label)}` : ""}
                  ${item.package_label ? `| Package: ${escapeHtml(item.package_label)}` : ""}
                </p>
              </div>
            `).join("")
            : "<p>No items found.</p>"
        }
      </div>

      <div class="detail-total">
        Total: RM ${Number(order.total_amount || 0).toFixed(2)}
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

function exportOrders() {
  let csv = "Order ID,Customer,Phone,Address,Total,Payment Status,Order Status,Date\n";

  allOrders.forEach(order => {
    csv += [
      csvCell(order.id),
      csvCell(order.customer_name),
      csvCell(order.phone),
      csvCell(order.address),
      csvCell(order.total_amount),
      csvCell(order.payment_status),
      csvCell(order.order_status),
      csvCell(order.created_at)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "orders.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("Orders exported to CSV.", "info");
}

function copyPhone(phone) {
  navigator.clipboard.writeText(String(phone || ""));
  showToast(`Phone copied: ${phone}`, "info");
}

document.getElementById("searchInput")?.addEventListener("input", applyFilters);
document.getElementById("paymentFilter")?.addEventListener("change", applyFilters);
document.getElementById("statusFilter")?.addEventListener("change", applyFilters);

window.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  setInterval(loadOrders, 900000);
});
