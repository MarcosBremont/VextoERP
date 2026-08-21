/* ============================================
   VextoERP - Clientes (directorio + cuentas por cobrar)
   ============================================ */

let allCustomers = [];
let allSales = [];
let deleteCustomerId = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  await loadCustomersData();

  document.getElementById('searchInput').addEventListener('input', renderCustomersTable);
});

async function loadCustomersData() {
  try {
    allCustomers = await DB.getCustomers();
    allSales = await DB.getSales();
    renderStats();
    renderCustomersTable();
  } catch (e) {
    console.error('Error cargando clientes:', e);
    showToast('Error al cargar los clientes', 'error');
  }
}

// Compra, saldo pendiente y última fecha de compra de un cliente, a partir
// de las ventas que quedaron vinculadas a su id (por teléfono, al facturar).
function getCustomerStats(customerId) {
  const customerSales = allSales.filter(s => s.customerId === customerId);
  const totalSpent = customerSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const pendingBalance = customerSales.reduce((sum, s) => sum + Number(s.pendingBalance || 0), 0);
  const lastPurchase = customerSales.reduce((latest, s) => {
    const d = s.date ? new Date(s.date) : null;
    if (!d) return latest;
    return (!latest || d > latest) ? d : latest;
  }, null);

  return { count: customerSales.length, totalSpent, pendingBalance, lastPurchase };
}

/* ============ STATS CARDS ============ */
function renderStats() {
  const withDebt = allCustomers.filter(c => getCustomerStats(c.id).pendingBalance > 0);
  const totalPending = withDebt.reduce((sum, c) => sum + getCustomerStats(c.id).pendingBalance, 0);
  const totalSpent = allCustomers.reduce((sum, c) => sum + getCustomerStats(c.id).totalSpent, 0);

  const stats = [
    {
      icon: '👥',
      iconClass: 'indigo',
      value: allCustomers.length,
      label: 'Clientes registrados'
    },
    {
      icon: '⚠️',
      iconClass: 'amber',
      value: withDebt.length,
      label: 'Clientes con saldo pendiente'
    },
    {
      icon: '💸',
      iconClass: 'gray',
      value: formatCurrency(totalPending),
      label: 'Total por cobrar'
    },
    {
      icon: '💰',
      iconClass: 'green',
      value: formatCurrency(totalSpent),
      label: 'Total comprado (histórico)'
    }
  ];

  document.getElementById('statsGrid').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon ${s.iconClass}">${s.icon}</div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

/* ============ TABLA DE CLIENTES ============ */
function renderCustomersTable() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const tbody = document.getElementById('customersTableBody');
  const emptyState = document.getElementById('emptyState');

  let customers = [...allCustomers];

  if (searchTerm) {
    customers = customers.filter(c =>
      (c.name || '').toLowerCase().includes(searchTerm) ||
      (c.phone || '').toLowerCase().includes(searchTerm)
    );
  }

  const table = document.querySelector('.data-table');
  if (customers.length === 0) {
    table.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }

  table.style.display = '';
  emptyState.classList.add('hidden');

  tbody.innerHTML = customers.map(customer => {
    const stats = getCustomerStats(customer.id);
    const initials = getInitials(customer.name);
    const badgeClass = stats.pendingBalance > 0 ? 'amber' : 'green';
    const lastPurchaseText = stats.lastPurchase ? formatDate(stats.lastPurchase) : '—';
    const historyLink = customer.phone
      ? `historial.html?q=${encodeURIComponent(customer.phone)}`
      : `historial.html?q=${encodeURIComponent(customer.name)}`;

    return `
      <tr>
        <td>
          <div class="product-name-cell">
            <div class="product-badge ${badgeClass}">${initials}</div>
            <div>
              <div class="product-main">${escapeHtml(customer.name)}</div>
              ${customer.email ? `<div class="product-category">${escapeHtml(customer.email)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${escapeHtml(customer.phone || '—')}</td>
        <td>
          <a href="${historyLink}" style="color:var(--primary); font-weight:600; text-decoration:none;">
            ${stats.count} venta${stats.count === 1 ? '' : 's'}
          </a>
        </td>
        <td><strong>${formatCurrency(stats.totalSpent)}</strong></td>
        <td>
          ${stats.pendingBalance > 0
            ? `<span class="badge badge-warning">${formatCurrency(stats.pendingBalance)}</span>`
            : `<span class="badge badge-success">Al día</span>`}
        </td>
        <td>${lastPurchaseText}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon edit-btn" onclick="editCustomer('${customer.id}')" title="Editar">
              ✏️
            </button>
            <button class="btn-icon delete-btn" onclick="openDeleteModal('${customer.id}')" title="Eliminar">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============ NUEVO / EDITAR CLIENTE ============ */
function openCustomerModal(customerId = null) {
  const form = document.getElementById('customerForm');
  const title = document.getElementById('modalTitle');

  form.reset();
  document.getElementById('customerId').value = '';

  if (customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) return;

    title.textContent = '✏️ Editar Cliente';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('customerFormName').value = customer.name;
    document.getElementById('customerFormPhone').value = customer.phone || '';
    document.getElementById('customerFormEmail').value = customer.email || '';
    document.getElementById('customerFormAddress').value = customer.address || '';
    document.getElementById('customerFormNotes').value = customer.notes || '';
  } else {
    title.textContent = '➕ Nuevo Cliente';
  }

  openModal('customerModal');
  setTimeout(() => document.getElementById('customerFormName').focus(), 100);
}

function editCustomer(customerId) {
  openCustomerModal(customerId);
}

// Guardar (crear o editar)
document.getElementById('customerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const customerId = document.getElementById('customerId').value;
  const name = document.getElementById('customerFormName').value.trim();
  const phone = document.getElementById('customerFormPhone').value.trim();
  const email = document.getElementById('customerFormEmail').value.trim();
  const address = document.getElementById('customerFormAddress').value.trim();
  const notes = document.getElementById('customerFormNotes').value.trim();

  if (!name) {
    showToast('El nombre del cliente es obligatorio', 'error');
    return;
  }

  try {
    const customerData = { name, phone, email, address, notes };
    if (customerId) {
      await DB.updateCustomer(customerId, customerData);
      showToast('✅ Cliente actualizado correctamente');
    } else {
      await DB.addCustomer(customerData);
      showToast('✅ Cliente agregado');
    }

    closeModal('customerModal');
    await loadCustomersData();
  } catch (err) {
    showToast(err.message || 'No se pudo guardar el cliente', 'error');
  }
});

/* ============ ELIMINAR CLIENTE ============ */
function openDeleteModal(customerId) {
  deleteCustomerId = customerId;
  const customer = allCustomers.find(c => c.id === customerId);
  if (customer) {
    document.getElementById('deleteCustomerName').textContent = customer.name;
  }
  openModal('deleteCustomerModal');
}

async function confirmDeleteCustomer() {
  if (!deleteCustomerId) return;

  await DB.deleteCustomer(deleteCustomerId);
  deleteCustomerId = null;
  closeModal('deleteCustomerModal');
  showToast('🗑️ Cliente eliminado');

  await loadCustomersData();
}

/* ============ UTILIDADES ============ */
function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
