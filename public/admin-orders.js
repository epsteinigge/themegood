let allOrders = [];
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

function parseOrderDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDateLabel(date) {
  return date.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatMalaysiaDateTime(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function getTimelineRange() {
  const preset = document.getElementById("timelinePreset")?.value || "all";
  const monthValue = document.getElementById("monthFilter")?.value || "";
  const dateFromValue = document.getElementById("dateFromFilter")?.value || "";
  const dateToValue = document.getElementById("dateToFilter")?.value || "";
  const now = new Date();

  let start = null;
  let end = null;
  let label = "Showing all-time order data.";

  if (preset === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    label = `Showing orders for ${now.toLocaleDateString("en-MY", { timeZone: MALAYSIA_TIME_ZONE, month: "long", year: "numeric" })}.`;
  } else if (preset === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    label = `Showing orders for ${start.toLocaleDateString("en-MY", { timeZone: MALAYSIA_TIME_ZONE, month: "long", year: "numeric" })}.`;
  } else if (preset === "last_7_days") {
    end = endOfDay(now);
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    label = `Showing the last 7 days: ${formatDateLabel(start)} to ${formatDateLabel(end)}.`;
  } else if (preset === "last_30_days") {
    end = endOfDay(now);
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    label = `Showing the last 30 days: ${formatDateLabel(start)} to ${formatDateLabel(end)}.`;
  } else if (preset === "this_year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    label = `Showing orders for ${now.getFullYear()}.`;
  } else if (preset === "month" && monthValue) {
    const [year, month] = monthValue.split("-").map(Number);
    if (Number.isInteger(year) && Number.isInteger(month)) {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0, 23, 59, 59, 999);
      label = `Showing orders for ${start.toLocaleDateString("en-MY", { timeZone: MALAYSIA_TIME_ZONE, month: "long", year: "numeric" })}.`;
    }
  } else if (preset === "custom") {
    if (dateFromValue) {
      start = startOfDay(new Date(dateFromValue));
    }
    if (dateToValue) {
      end = endOfDay(new Date(dateToValue));
    }

    if (start && end) {
      label = `Showing orders from ${formatDateLabel(start)} to ${formatDateLabel(end)}.`;
    } else if (start) {
      label = `Showing orders from ${formatDateLabel(start)} onward.`;
    } else if (end) {
      label = `Showing orders up to ${formatDateLabel(end)}.`;
    }
  }

  return { preset, start, end, label };
}

function orderMatchesTimeline(order, range) {
  const orderDate = parseOrderDate(order?.created_at);
  if (!orderDate) return false;
  if (range.start && orderDate < range.start) return false;
  if (range.end && orderDate > range.end) return false;
  return true;
}

function getFilteredOrders() {
  const searchValue = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const paymentValue = (document.getElementById("paymentFilter")?.value || "").trim().toLowerCase();
  const statusValue = (document.getElementById("statusFilter")?.value || "").trim().toLowerCase();
  const timelineRange = getTimelineRange();

  const filtered = allOrders.filter(order => {
    const matchesSearch =
      !searchValue ||
      String(order.id || "").toLowerCase().includes(searchValue) ||
      String(order.customer_name || "").toLowerCase().includes(searchValue) ||
      String(order.phone || "").toLowerCase().includes(searchValue) ||
      String(order.address || "").toLowerCase().includes(searchValue);

    const matchesPayment = !paymentValue || String(order.payment_status || "").toLowerCase() === paymentValue;
    const matchesStatus = !statusValue || String(order.order_status || "").toLowerCase() === statusValue;
    const matchesTimeline = orderMatchesTimeline(order, timelineRange);

    return matchesSearch && matchesPayment && matchesStatus && matchesTimeline;
  });

  return {
    filtered,
    timelineRange
  };
}

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

async function updateOrderTracking(orderId, updates) {
  const response = await fetch(`/api/admin/orders/${orderId}/status`, {
    method: "PUT",
    headers: getAdminHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(updates)
  });

  const result = await response.json();

  if (!response.ok) {
    if (handleUnauthorized(response.status)) return null;
    throw new Error(result.error || "Failed to update order");
  }

  return result.order || null;
}

function parsePackageUnits(packageLabel) {
  const match = String(packageLabel || "").match(/(\d+)\s*x/i);
  const units = Number(match?.[1] || 0);
  return Number.isInteger(units) && units > 0 ? units : 1;
}

function formatOrderItemPackage(item) {
  const quantity = Math.max(1, Number(item?.quantity || 1));
  const packageLabel = String(item?.package_label || "").trim();
  const sizeLabel = String(item?.size_label || "").trim();
  const bundleDetails = Array.isArray(item?.bundle_details) ? item.bundle_details : [];

  const parts = [`Ordered: ${quantity}`];

  if (packageLabel) {
    const unitsPerPack = parsePackageUnits(packageLabel);
    const totalUnits = quantity * unitsPerPack;
    parts.push(`Package: ${packageLabel}`);

    if (unitsPerPack > 1) {
      parts.push(`Total units from package: ${totalUnits}`);
    }
  }

  if (sizeLabel) {
    parts.push(`Size: ${sizeLabel}`);
  }

  if (bundleDetails.length > 0) {
    const bundleText = bundleDetails.map((row) => {
      if (row?.label) {
        const label = String(row.label || "").trim();
        const size = String(row.size || "").trim();
        const extra = Number(row.extra || 0);
        return `${label}${size ? ` (${size})` : ""}${extra > 0 ? ` (+RM ${extra.toFixed(2)})` : ""}`;
      }

      return `Slot ${Number(row?.slot_id || 0)}: Variant ${Number(row?.variant_id || 0)}`;
    }).join(" • ");

    if (bundleText) {
      parts.push(`Bundle: ${bundleText}`);
    }
  }

  parts.push(`Unit price: RM ${Number(item?.unit_price || 0).toFixed(2)}`);
  return parts.join(" | ");
}

function updateStats(orders) {
  const totalOrders = orders.length;
  const unpaidOrders = orders.filter(order => order.payment_status === "pending").length;
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
          <button class="table-btn js-copy-phone" type="button" data-phone="${escapeAttr(safePhone)}">Copy</button>
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
            <option value="pending" ${order.payment_status === "pending" ? "selected" : ""}>pending</option>
            <option value="paid" ${order.payment_status === "paid" ? "selected" : ""}>paid</option>
            <option value="failed" ${order.payment_status === "failed" ? "selected" : ""}>failed</option>
            <option value="refunded" ${order.payment_status === "refunded" ? "selected" : ""}>refunded</option>
          </select>
        </div>
      </td>
      <td>${badge(order.payment_status)}</td>
      <td>${badge(order.order_status)}</td>
      <td>
        <div class="select-inline">
          <select id="status-${Number(order.id)}">
            <option value="new" ${order.order_status === "new" ? "selected" : ""}>new</option>
            <option value="processing" ${order.order_status === "processing" ? "selected" : ""}>processing</option>
            <option value="shipped" ${order.order_status === "shipped" ? "selected" : ""}>shipped</option>
            <option value="completed" ${order.order_status === "completed" ? "selected" : ""}>completed</option>
            <option value="cancelled" ${order.order_status === "cancelled" ? "selected" : ""}>cancelled</option>
          </select>
          <button class="table-btn save js-save-order" type="button" data-order-id="${Number(order.id)}">Save</button>
        </div>
      </td>
      <td>${formatMalaysiaDateTime(order.created_at)}</td>
      <td>
        <button class="table-btn view js-view-order" type="button" data-order-id="${Number(order.id)}">View</button>
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
  const { filtered, timelineRange } = getFilteredOrders();
  const timelineSummary = document.getElementById("timelineSummary");

  if (timelineSummary) {
    timelineSummary.textContent = timelineRange.label;
  }

  updateStats(filtered);
  renderOrders(filtered);
}

function clearFilters() {
  const searchInput = document.getElementById("searchInput");
  const paymentFilter = document.getElementById("paymentFilter");
  const statusFilter = document.getElementById("statusFilter");
  const timelinePreset = document.getElementById("timelinePreset");
  const monthFilter = document.getElementById("monthFilter");
  const dateFromFilter = document.getElementById("dateFromFilter");
  const dateToFilter = document.getElementById("dateToFilter");

  if (searchInput) searchInput.value = "";
  if (paymentFilter) paymentFilter.value = "";
  if (statusFilter) statusFilter.value = "";
  if (timelinePreset) timelinePreset.value = "all";
  if (monthFilter) monthFilter.value = "";
  if (dateFromFilter) dateFromFilter.value = "";
  if (dateToFilter) dateToFilter.value = "";

  applyFilters();
}

function resetTimeline() {
  const timelinePreset = document.getElementById("timelinePreset");
  const monthFilter = document.getElementById("monthFilter");
  const dateFromFilter = document.getElementById("dateFromFilter");
  const dateToFilter = document.getElementById("dateToFilter");

  if (timelinePreset) timelinePreset.value = "all";
  if (monthFilter) monthFilter.value = "";
  if (dateFromFilter) dateFromFilter.value = "";
  if (dateToFilter) dateToFilter.value = "";

  applyFilters();
}

function syncTimelineInputs() {
  const timelinePreset = document.getElementById("timelinePreset");
  const monthFilter = document.getElementById("monthFilter");
  const dateFromFilter = document.getElementById("dateFromFilter");
  const dateToFilter = document.getElementById("dateToFilter");
  const preset = timelinePreset?.value || "all";

  if (monthFilter) {
    monthFilter.disabled = preset !== "month";
  }

  const customEnabled = preset === "custom";
  if (dateFromFilter) dateFromFilter.disabled = !customEnabled;
  if (dateToFilter) dateToFilter.disabled = !customEnabled;
}

async function saveOrder(orderId) {
  const paymentSelect = document.getElementById(`payment-${orderId}`);
  const statusSelect = document.getElementById(`status-${orderId}`);

  if (!paymentSelect || !statusSelect) return;

  const paymentStatus = paymentSelect.value;
  const orderStatus = statusSelect.value;

  try {
    const updatedOrder = await updateOrderTracking(orderId, {
      payment_status: paymentStatus,
      delivery_status: orderStatus
    });

    const target = allOrders.find(order => Number(order.id) === Number(orderId));
    if (target) {
      target.payment_status = paymentStatus;
      target.order_status = orderStatus;
      target.delivery_status = updatedOrder?.delivery_status || orderStatus;
      target.updated_at = updatedOrder?.updated_at || target.updated_at;
    }

    updateStats(allOrders);
    applyFilters();
    showToast(`Order #${orderId} updated.`, "success");
  } catch (error) {
    console.error("Failed to update order:", error);
    showToast(error.message || "Failed to update order", "error");
  }
}

async function saveTrackingNote(orderId) {
  const textarea = document.getElementById(`tracking-note-${orderId}`);
  if (!textarea) return;

  const noteValue = textarea.value.trim();

  try {
    const updatedOrder = await updateOrderTracking(orderId, {
      tracking_notes: noteValue
    });

    const target = allOrders.find(order => Number(order.id) === Number(orderId));
    if (target) {
      target.tracking_notes = updatedOrder?.tracking_notes ?? noteValue;
      target.updated_at = updatedOrder?.updated_at || target.updated_at;
    }

    showToast(`Tracking note saved for order #${orderId}.`, "success");
  } catch (error) {
    console.error("Failed to save tracking note:", error);
    showToast(error.message || "Failed to save tracking note", "error");
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
          <p><strong>Date:</strong> ${formatMalaysiaDateTime(order.created_at)} (Malaysia Time)</p>
        </div>
      </div>

      <div class="detail-items">
        <h3>Items</h3>
        ${
          Array.isArray(items) && items.length > 0
            ? items.map(item => `
              <div class="detail-item">
                <p><strong>${escapeHtml(item.product_name)}</strong></p>
                <p>${escapeHtml(formatOrderItemPackage(item))}</p>
              </div>
            `).join("")
            : "<p>No items found.</p>"
        }
      </div>

      <div class="detail-note-box">
        <h3>Tracking Notes</h3>
        <textarea id="tracking-note-${Number(order.id)}" placeholder="Add a customer-facing progress note, such as payment received, packed, or courier handoff.">${escapeHtml(order.tracking_notes || "")}</textarea>
        <div class="detail-note-actions">
          <span class="detail-note-help">Customers can see this note on the Track Order page.</span>
          <button class="table-btn save js-save-tracking-note" type="button" data-order-id="${Number(order.id)}">Save Note</button>
        </div>
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
  try {
    await fetch("/api/admin-logout", {
      method: "POST",
      headers: {
        "x-admin-token": localStorage.getItem("adminToken") || ""
      }
    });
  } catch (error) {
    console.error("Logout request failed:", error);
  } finally {
    localStorage.removeItem("adminToken");
    window.location.href = "admin-login.html";
  }
}

function exportOrders() {
  const { filtered } = getFilteredOrders();
  let csv = "Order ID,Customer,Phone,Address,Total,Payment Status,Order Status,Date\n";

  filtered.forEach(order => {
    csv += [
      csvCell(order.id),
      csvCell(order.customer_name),
      csvCell(order.phone),
      csvCell(order.address),
      csvCell(order.total_amount),
      csvCell(order.payment_status),
      csvCell(order.order_status),
      csvCell(formatMalaysiaDateTime(order.created_at))
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "orders-filtered.csv";
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

window.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnTop = document.getElementById("logoutBtnTop");
  const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
  const exportOrdersBtn = document.getElementById("exportOrdersBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");
  const orderModalOverlay = document.getElementById("orderModalOverlay");
  const orderModalCloseBtn = document.getElementById("orderModalCloseBtn");
  const searchInput = document.getElementById("searchInput");
  const paymentFilter = document.getElementById("paymentFilter");
  const statusFilter = document.getElementById("statusFilter");
  const timelinePreset = document.getElementById("timelinePreset");
  const monthFilter = document.getElementById("monthFilter");
  const dateFromFilter = document.getElementById("dateFromFilter");
  const dateToFilter = document.getElementById("dateToFilter");
  const resetTimelineBtn = document.getElementById("resetTimelineBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutAdmin);
  }

  if (logoutBtnTop) {
    logoutBtnTop.addEventListener("click", logoutAdmin);
  }

  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener("click", loadOrders);
  }

  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener("click", exportOrders);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", clearFilters);
  }

  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", applyFilters);
  }

  if (resetTimelineBtn) {
    resetTimelineBtn.addEventListener("click", resetTimeline);
  }

  if (orderModalOverlay) {
    orderModalOverlay.addEventListener("click", closeOrderModal);
  }

  if (orderModalCloseBtn) {
    orderModalCloseBtn.addEventListener("click", closeOrderModal);
  }

  searchInput?.addEventListener("input", applyFilters);
  paymentFilter?.addEventListener("change", applyFilters);
  statusFilter?.addEventListener("change", applyFilters);
  timelinePreset?.addEventListener("change", () => {
    syncTimelineInputs();
    applyFilters();
  });
  monthFilter?.addEventListener("change", () => {
    if (timelinePreset) timelinePreset.value = "month";
    syncTimelineInputs();
    applyFilters();
  });
  dateFromFilter?.addEventListener("change", () => {
    if (timelinePreset) timelinePreset.value = "custom";
    syncTimelineInputs();
    applyFilters();
  });
  dateToFilter?.addEventListener("change", () => {
    if (timelinePreset) timelinePreset.value = "custom";
    syncTimelineInputs();
    applyFilters();
  });

  document.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".js-copy-phone");
    if (copyBtn) {
      copyPhone(copyBtn.dataset.phone || "");
      return;
    }

    const saveBtn = event.target.closest(".js-save-order");
    if (saveBtn) {
      const orderId = Number(saveBtn.dataset.orderId);
      if (orderId) {
        saveOrder(orderId);
      }
      return;
    }

    const viewBtn = event.target.closest(".js-view-order");
    if (viewBtn) {
      const orderId = Number(viewBtn.dataset.orderId);
      if (orderId) {
        openOrderModal(orderId);
      }
      return;
    }

    const saveTrackingNoteBtn = event.target.closest(".js-save-tracking-note");
    if (saveTrackingNoteBtn) {
      const orderId = Number(saveTrackingNoteBtn.dataset.orderId);
      if (orderId) {
        saveTrackingNote(orderId);
      }
    }
  });

  syncTimelineInputs();
  loadOrders();
  setInterval(loadOrders, 10000);
});
