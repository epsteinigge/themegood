let allOrders = [];
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let currentAdjustCustomerId = null;

function parseOrderDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const hasTimezone = /(?:Z|[+\-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.replace(" ", "T");
  const parsed = new Date(hasTimezone ? normalized : `${normalized}Z`);
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
  const parsed = value instanceof Date ? value : parseOrderDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "-";
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

async function exportLoyaltyTransactionsCsv(customerId = null) {
  const query = Number.isInteger(Number(customerId)) && Number(customerId) > 0
    ? `?customer_id=${encodeURIComponent(String(Number(customerId)))}`
    : "";
  const response = await fetch(`/api/admin/loyalty-transactions/export.csv${query}`, {
    headers: getAdminHeaders()
  });

  if (!response.ok) {
    if (handleUnauthorized(response.status)) return;
    let errorMessage = "Failed to export loyalty CSV";
    try {
      const payload = await response.json();
      errorMessage = payload.error || errorMessage;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = filenameMatch?.[1] || (customerId ? `loyalty-transactions-customer-${customerId}.csv` : "loyalty-transactions-all.csv");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function formatLoyaltyOrderSummary(order) {
  const rewardId = Number(order?.loyalty_reward_id || 0);
  const rewardType = String(order?.loyalty_reward_type || "").trim();
  const pointsRedeemed = Number(order?.loyalty_points_redeemed || 0);
  const discountAmount = Number(order?.loyalty_discount_amount || 0);
  const freeGiftName = String(order?.loyalty_free_gift_product_name || "").trim();
  const parts = [];

  if (!rewardId || !rewardType) {
    return '<span style="color:#6b7280;">None</span>';
  }

  parts.push(`<div><strong>#${rewardId}</strong> ${escapeHtml(rewardType)}</div>`);
  if (pointsRedeemed > 0) parts.push(`<div>Points: ${pointsRedeemed}</div>`);
  if (discountAmount > 0) parts.push(`<div>Discount: RM ${discountAmount.toFixed(2)}</div>`);
  if (freeGiftName) parts.push(`<div>Gift: ${escapeHtml(freeGiftName)}</div>`);

  if (order?.loyalty_redeemed_at) {
    parts.push(`<div>Redeemed: ${escapeHtml(formatMalaysiaDateTime(order.loyalty_redeemed_at))}</div>`);
  }
  if (order?.loyalty_earn_reversed_at) {
    parts.push(`<div>Earn Reversed: ${escapeHtml(formatMalaysiaDateTime(order.loyalty_earn_reversed_at))}</div>`);
  }
  if (order?.loyalty_redeem_restored_at) {
    parts.push(`<div>Redeem Restored: ${escapeHtml(formatMalaysiaDateTime(order.loyalty_redeem_restored_at))}</div>`);
  }

  return `<div style="display:grid;gap:4px;font-size:12px;">${parts.join("")}</div>`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function renderLoyaltyStats(stats = {}) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatInteger(value);
  };

  setText("loyalty-stat-issued", stats.total_points_issued);
  setText("loyalty-stat-redeemed", stats.total_points_redeemed);
  setText("loyalty-stat-reversed", stats.total_points_reversed);
  setText("loyalty-stat-restored", stats.total_points_restored);
  setText("loyalty-stat-manual-added", stats.total_manual_points_added);
  setText("loyalty-stat-manual-deducted", stats.total_manual_points_deducted);
  setText("loyalty-stat-referred-customers", stats.total_referred_customers);
  setText("loyalty-stat-successful-referrals", stats.successful_referrals_count);
  setText("loyalty-stat-pending-referrals", stats.pending_referrals_count);
  setText(
    "loyalty-stat-referral-issued",
    Number(stats.total_referral_points_referrer || 0) + Number(stats.total_referral_points_referred || 0)
  );
  setText("loyalty-stat-liability", stats.active_points_liability);
  setText("loyalty-stat-customers", stats.total_loyalty_customers);

  const rewardsContainer = document.getElementById("loyaltyTopRewardsList");
  const rewards = Array.isArray(stats.most_redeemed_rewards) ? stats.most_redeemed_rewards : [];
  if (rewardsContainer) {
    rewardsContainer.innerHTML = rewards.length
      ? rewards.map((reward) => `
          <div style="padding:8px 0;border-bottom:1px solid #eef2f6;">
            <strong>${escapeHtml(reward.reward_name || `Reward #${Number(reward.reward_id || 0)}`)}</strong>
            <div style="color:#6b7280;">Redemptions: ${formatInteger(reward.redemption_count)}</div>
          </div>
        `).join("")
      : "<div style='color:#6b7280;'>No reward redemptions yet.</div>";
  }

  const customersContainer = document.getElementById("loyaltyTopCustomersList");
  const customers = Array.isArray(stats.top_customers_by_points_balance) ? stats.top_customers_by_points_balance : [];
  if (customersContainer) {
    customersContainer.innerHTML = customers.length
      ? customers.map((customer) => `
          <div style="padding:8px 0;border-bottom:1px solid #eef2f6;">
            <strong>#${Number(customer.customer_id || 0)} ${escapeHtml(customer.customer_name || "")}</strong>
            <div style="color:#6b7280;">${escapeHtml(customer.customer_email || "-")}</div>
            <div>Points: ${formatInteger(customer.loyalty_points)}</div>
          </div>
        `).join("")
      : "<div style='color:#6b7280;'>No customer balances available.</div>";
  }

  const activityContainer = document.getElementById("loyaltyRecentActivityList");
  const activity = Array.isArray(stats.recent_loyalty_activity) ? stats.recent_loyalty_activity : [];
  if (activityContainer) {
    activityContainer.innerHTML = activity.length
      ? activity.map((tx) => `
          <div class="detail-item">
            <p><strong>${escapeHtml(tx.type_label || tx.type || "")}</strong> | ${formatInteger(tx.points)} points | ${escapeHtml(formatMalaysiaDateTime(tx.created_at))}</p>
            <p>Customer: #${Number(tx.customer_id || 0)} ${escapeHtml(tx.customer_name || "")} (${escapeHtml(tx.customer_email || "-")})</p>
            <p>Order: ${tx.order_id ? `#${Number(tx.order_id)}` : "-"}</p>
            <p style="color:#6b7280;">Type: ${escapeHtml(tx.type || "-")}</p>
            <p>${escapeHtml(tx.description || "-")}</p>
          </div>
        `).join("")
      : "<div style='color:#6b7280;'>No recent loyalty activity.</div>";
  }
}

async function loadLoyaltyStats() {
  try {
    const response = await fetch("/api/admin/loyalty/stats", {
      headers: getAdminHeaders()
    });
    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(payload.error || "Failed to load loyalty stats");
    }

    renderLoyaltyStats(payload.stats || {});
  } catch (error) {
    console.error("Failed to load loyalty stats:", error);
    showToast(error.message || "Failed to load loyalty stats", "error");
  }
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
        <td colspan="12">No orders found.</td>
      </tr>
    `;
    return;
  }

  ordersBody.innerHTML = "";

  orders.forEach(order => {
    const row = document.createElement("tr");
    row.className = "js-order-row";
    row.dataset.orderId = String(Number(order.id));
    const safePhone = String(order.phone || "");
    const whatsappPhone = formatPhoneForWhatsApp(safePhone);

    row.innerHTML = `
      <td>
        <strong>#${Number(order.id)}</strong>
        <button class="table-btn mobile-view-trigger js-view-order" type="button" data-order-id="${Number(order.id)}">View</button>
      </td>
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
      <td>${formatLoyaltyOrderSummary(order)}</td>
      <td>${formatMalaysiaDateTime(order.created_at)}</td>
      <td>
        <div class="select-inline">
          <button class="table-btn view js-view-order" type="button" data-order-id="${Number(order.id)}">View</button>
          <button class="table-btn delete js-delete-order" type="button" data-order-id="${Number(order.id)}">Delete</button>
        </div>
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
          <td colspan="12">Loading orders.</td>
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
    allOrders.sort((a, b) => {
      const aTime = parseOrderDate(a.created_at)?.getTime() || 0;
      const bTime = parseOrderDate(b.created_at)?.getTime() || 0;
      return bTime - aTime;
    });

    applyFilters();
  } catch (error) {
    console.error("Failed to load orders:", error);
    if (ordersBody) {
      ordersBody.innerHTML = `
        <tr>
          <td colspan="12">Failed to load orders.</td>
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
        <h3>Loyalty Summary</h3>
        <div class="detail-item">
          <p><strong>Reward:</strong> ${order.loyalty_reward_id ? `#${Number(order.loyalty_reward_id)} ${escapeHtml(order.loyalty_reward_name || order.loyalty_reward_type || "")}` : "None"}</p>
          <p><strong>Type:</strong> ${escapeHtml(order.loyalty_reward_type || "-")}</p>
          <p><strong>Points Redeemed:</strong> ${Number(order.loyalty_points_redeemed || 0)}</p>
          <p><strong>Discount Amount:</strong> RM ${Number(order.loyalty_discount_amount || 0).toFixed(2)}</p>
          <p><strong>Free Gift:</strong> ${escapeHtml(order.loyalty_free_gift_product_name || "-")}</p>
          <p><strong>Redeemed At:</strong> ${escapeHtml(order.loyalty_redeemed_at ? formatMalaysiaDateTime(order.loyalty_redeemed_at) : "-")}</p>
          <p><strong>Earn Reversed At:</strong> ${escapeHtml(order.loyalty_earn_reversed_at ? formatMalaysiaDateTime(order.loyalty_earn_reversed_at) : "-")}</p>
          <p><strong>Redeem Restored At:</strong> ${escapeHtml(order.loyalty_redeem_restored_at ? formatMalaysiaDateTime(order.loyalty_redeem_restored_at) : "-")}</p>
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

async function deleteOrder(orderId) {
  const target = allOrders.find(order => Number(order.id) === Number(orderId));
  const customerName = target?.customer_name ? ` (${target.customer_name})` : "";
  const confirmed = window.confirm(
    `Delete order #${orderId}${customerName}? This action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: "DELETE",
      headers: getAdminHeaders()
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(payload.error || "Failed to delete order");
    }

    allOrders = allOrders.filter(order => Number(order.id) !== Number(orderId));
    applyFilters();
    showToast(`Order #${orderId} deleted.`, "success");
  } catch (error) {
    console.error("Failed to delete order:", error);
    showToast(error.message || "Failed to delete order", "error");
  }
}

async function loadLoyaltyCustomers() {
  const loyaltyBody = document.getElementById("loyaltyCustomersBody");
  const loyaltySearchInput = document.getElementById("loyaltySearchInput");
  if (!loyaltyBody) return;

  loyaltyBody.innerHTML = `<tr><td colspan="7">Loading loyalty customers.</td></tr>`;

  try {
    const search = String(loyaltySearchInput?.value || "").trim();
    const response = await fetch(`/api/admin/customers/loyalty?search=${encodeURIComponent(search)}&limit=50`, {
      headers: getAdminHeaders()
    });
    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(payload.error || "Failed to load customer loyalty list");
    }

    const customers = Array.isArray(payload.customers) ? payload.customers : [];
    if (customers.length === 0) {
      loyaltyBody.innerHTML = `<tr><td colspan="7">No customers found.</td></tr>`;
      return;
    }

    loyaltyBody.innerHTML = customers.map((customer) => `
      <tr>
        <td><strong>#${Number(customer.id)}</strong> ${escapeHtml(customer.name || "")}</td>
        <td>
          <div>${escapeHtml(customer.phone || "-")}</div>
          <div style="color:#6b7280;font-size:12px;">${escapeHtml(customer.email || "-")}</div>
        </td>
        <td><strong>${Number(customer.loyalty_points || 0)}</strong></td>
        <td>${Number(customer.lifetime_points_earned || 0)}</td>
        <td>${Number(customer.lifetime_points_redeemed || 0)}</td>
        <td>
          <div style="font-size:12px;line-height:1.5;">
            <div><strong>Code:</strong> ${escapeHtml(customer.referral_code || "-")}</div>
            <div><strong>Referred By:</strong> ${customer.referred_by_user_id ? `#${Number(customer.referred_by_user_id)} ${escapeHtml(customer.referred_by_name || "")}` : "-"}</div>
            <div><strong>Success/Pending:</strong> ${Number(customer.successful_referrals_count || 0)} / ${Number(customer.pending_referrals_count || 0)}</div>
          </div>
        </td>
        <td>
          <div class="mini-actions">
            <button class="table-btn view js-view-customer-loyalty" type="button" data-customer-id="${Number(customer.id)}">View History</button>
            <button class="table-btn save js-adjust-points" type="button" data-customer-id="${Number(customer.id)}">Adjust Points</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (error) {
    console.error("Failed to load loyalty customers:", error);
    loyaltyBody.innerHTML = `<tr><td colspan="7">Failed to load customer loyalty list.</td></tr>`;
    showToast(error.message || "Failed to load customer loyalty list", "error");
  }
}

async function openCustomerLoyaltyModal(customerId) {
  const modal = document.getElementById("orderModal");
  const modalBody = document.getElementById("orderModalBody");
  if (!modal || !modalBody) return;

  modal.style.display = "block";
  modalBody.innerHTML = "Loading customer loyalty history.";

  try {
    const response = await fetch(`/api/admin/customers/${customerId}/loyalty-transactions?limit=100`, {
      headers: getAdminHeaders()
    });
    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(payload.error || "Failed to load customer loyalty history");
    }

    const customer = payload.customer || {};
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

    modalBody.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
        <h2 style="margin-top:0;">Customer Loyalty #${Number(customer.id || customerId)}</h2>
        <button class="secondary-btn js-export-customer-loyalty-csv" type="button" data-customer-id="${Number(customer.id || customerId)}">Export CSV</button>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <h3>Customer</h3>
          <p><strong>Name:</strong> ${escapeHtml(customer.name || "-")}</p>
          <p><strong>Phone:</strong> ${escapeHtml(customer.phone || "-")}</p>
          <p><strong>Email:</strong> ${escapeHtml(customer.email || "-")}</p>
          <p><strong>Referral Code:</strong> ${escapeHtml(customer.referral_code || "-")}</p>
          <p><strong>Referred By:</strong> ${
            customer.referred_by?.id
              ? `#${Number(customer.referred_by.id)} ${escapeHtml(customer.referred_by.name || "")} (${escapeHtml(customer.referred_by.email || "-")})`
              : "-"
          }</p>
        </div>
        <div class="detail-card">
          <h3>Balances</h3>
          <p><strong>Current Points:</strong> ${Number(customer.loyalty_points || 0)}</p>
          <p><strong>Lifetime Earned:</strong> ${Number(customer.lifetime_points_earned || 0)}</p>
          <p><strong>Lifetime Redeemed:</strong> ${Number(customer.lifetime_points_redeemed || 0)}</p>
          <p><strong>Referral Applied At:</strong> ${escapeHtml(customer.referral_applied_at ? formatMalaysiaDateTime(customer.referral_applied_at) : "-")}</p>
          <p><strong>Referral Bonus Granted At:</strong> ${escapeHtml(customer.referral_reward_granted_at ? formatMalaysiaDateTime(customer.referral_reward_granted_at) : "-")}</p>
          <p><strong>Referral Bonus Reversed At:</strong> ${escapeHtml(customer.referral_reward_reversed_at ? formatMalaysiaDateTime(customer.referral_reward_reversed_at) : "-")}</p>
          <p><strong>Referrals (Success/Pending):</strong> ${Number(payload.referral_summary?.successful_referrals_count || 0)} / ${Number(payload.referral_summary?.pending_referrals_count || 0)}</p>
        </div>
      </div>

      <div class="detail-items">
        <h3>Recent Loyalty Transactions</h3>
        ${
          transactions.length > 0
            ? transactions.map((tx) => `
              <div class="detail-item">
                <p><strong>${escapeHtml(String(tx.type_label || tx.type || ""))}</strong> | ${Number(tx.points || 0)} points | ${escapeHtml(formatMalaysiaDateTime(tx.created_at))}</p>
                <p>Order: ${tx.order_id ? `#${Number(tx.order_id)}` : "-"}</p>
                <p>Type code: ${escapeHtml(String(tx.type || "-"))}</p>
                <p>${escapeHtml(tx.description || "-")}</p>
              </div>
            `).join("")
            : "<p>No loyalty transactions found.</p>"
        }
      </div>
    `;
  } catch (error) {
    console.error("Failed to load customer loyalty modal:", error);
    modalBody.innerHTML = "Failed to load customer loyalty history.";
  }
}

function openAdjustPointsModal(customerId) {
  const modal = document.getElementById("adjustPointsModal");
  const customerIdInput = document.getElementById("adjustCustomerId");
  const pointsInput = document.getElementById("adjustPoints");
  const reasonInput = document.getElementById("adjustReason");
  const typeInput = document.getElementById("adjustType");

  if (!modal || !customerIdInput || !pointsInput || !reasonInput || !typeInput) return;
  currentAdjustCustomerId = Number(customerId);
  customerIdInput.value = String(currentAdjustCustomerId || "");
  pointsInput.value = "";
  reasonInput.value = "";
  typeInput.value = "add";
  modal.style.display = "block";
}

function closeAdjustPointsModal() {
  const modal = document.getElementById("adjustPointsModal");
  if (modal) modal.style.display = "none";
  currentAdjustCustomerId = null;
}

async function submitAdjustPointsForm(event) {
  event.preventDefault();

  const customerId = Number(document.getElementById("adjustCustomerId")?.value || 0);
  const adjustmentType = String(document.getElementById("adjustType")?.value || "").trim().toLowerCase();
  const points = Number(document.getElementById("adjustPoints")?.value || 0);
  const reason = String(document.getElementById("adjustReason")?.value || "").trim();

  if (!Number.isInteger(customerId) || customerId <= 0) {
    showToast("Customer ID is invalid.", "error");
    return;
  }
  if (!["add", "deduct"].includes(adjustmentType)) {
    showToast("Adjustment type is invalid.", "error");
    return;
  }
  if (!Number.isInteger(points) || points <= 0) {
    showToast("Points must be a positive integer.", "error");
    return;
  }
  if (!reason) {
    showToast("Reason is required.", "error");
    return;
  }

  try {
    const response = await fetch("/api/admin/customers/loyalty-adjustments", {
      method: "POST",
      headers: getAdminHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        customer_id: customerId,
        adjustment_type: adjustmentType,
        points,
        reason
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      if (handleUnauthorized(response.status)) return;
      throw new Error(payload.error || "Failed to adjust points");
    }

    showToast("Loyalty points adjusted.", "success");
    closeAdjustPointsModal();
    await loadLoyaltyCustomers();
    await loadLoyaltyStats();
    await openCustomerLoyaltyModal(customerId);
  } catch (error) {
    console.error("Failed to submit loyalty adjustment:", error);
    showToast(error.message || "Failed to adjust points", "error");
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
  const loyaltySearchBtn = document.getElementById("loyaltySearchBtn");
  const loyaltySearchInput = document.getElementById("loyaltySearchInput");
  const loyaltyExportAllBtn = document.getElementById("loyaltyExportAllBtn");
  const adjustPointsModalOverlay = document.getElementById("adjustPointsModalOverlay");
  const adjustPointsModalCloseBtn = document.getElementById("adjustPointsModalCloseBtn");
  const adjustPointsForm = document.getElementById("adjustPointsForm");
  const refreshLoyaltyStatsBtn = document.getElementById("refreshLoyaltyStatsBtn");

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
  if (loyaltySearchBtn) {
    loyaltySearchBtn.addEventListener("click", loadLoyaltyCustomers);
  }
  if (loyaltyExportAllBtn) {
    loyaltyExportAllBtn.addEventListener("click", async () => {
      try {
        await exportLoyaltyTransactionsCsv(null);
        showToast("Loyalty CSV exported.", "success");
      } catch (error) {
        console.error("Failed to export all loyalty CSV:", error);
        showToast(error.message || "Failed to export loyalty CSV", "error");
      }
    });
  }
  loyaltySearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadLoyaltyCustomers();
    }
  });

  if (orderModalOverlay) {
    orderModalOverlay.addEventListener("click", closeOrderModal);
  }

  if (orderModalCloseBtn) {
    orderModalCloseBtn.addEventListener("click", closeOrderModal);
  }
  if (adjustPointsModalOverlay) {
    adjustPointsModalOverlay.addEventListener("click", closeAdjustPointsModal);
  }
  if (adjustPointsModalCloseBtn) {
    adjustPointsModalCloseBtn.addEventListener("click", closeAdjustPointsModal);
  }
  if (adjustPointsForm) {
    adjustPointsForm.addEventListener("submit", submitAdjustPointsForm);
  }
  if (refreshLoyaltyStatsBtn) {
    refreshLoyaltyStatsBtn.addEventListener("click", loadLoyaltyStats);
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

    const deleteBtn = event.target.closest(".js-delete-order");
    if (deleteBtn) {
      const orderId = Number(deleteBtn.dataset.orderId);
      if (orderId) {
        deleteOrder(orderId);
      }
      return;
    }

    const mobileRow = event.target.closest(".js-order-row");
    if (
      mobileRow &&
      window.matchMedia("(max-width: 760px)").matches &&
      !event.target.closest("button, a, select, textarea, input, label")
    ) {
      const orderId = Number(mobileRow.dataset.orderId);
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
      return;
    }

    const customerLoyaltyBtn = event.target.closest(".js-view-customer-loyalty");
    if (customerLoyaltyBtn) {
      const customerId = Number(customerLoyaltyBtn.dataset.customerId);
      if (customerId) {
        openCustomerLoyaltyModal(customerId);
      }
      return;
    }

    const adjustPointsBtn = event.target.closest(".js-adjust-points");
    if (adjustPointsBtn) {
      const customerId = Number(adjustPointsBtn.dataset.customerId);
      if (customerId) {
        openAdjustPointsModal(customerId);
      }
      return;
    }

    const exportCustomerCsvBtn = event.target.closest(".js-export-customer-loyalty-csv");
    if (exportCustomerCsvBtn) {
      const customerId = Number(exportCustomerCsvBtn.dataset.customerId);
      if (customerId) {
        exportLoyaltyTransactionsCsv(customerId)
          .then(() => showToast(`Loyalty CSV exported for customer #${customerId}.`, "success"))
          .catch((error) => {
            console.error("Failed to export customer loyalty CSV:", error);
            showToast(error.message || "Failed to export loyalty CSV", "error");
          });
      }
    }
  });

  syncTimelineInputs();
  loadOrders();
  loadLoyaltyCustomers();
  loadLoyaltyStats();
  setInterval(loadOrders, AUTO_REFRESH_INTERVAL_MS);
  setInterval(loadLoyaltyStats, AUTO_REFRESH_INTERVAL_MS);
});
