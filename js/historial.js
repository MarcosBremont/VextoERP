/* ============================================
   VextoERP - Historial de Ventas
   Conectado a Firebase Firestore
   ============================================ */

let allProducts = [];
let allSales = [];
let activePaymentSaleId = null;
let deleteSaleId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Proteger ruta: si no hay sesión, redirigir al login
  if (!requireAuth()) return;

  // UI común
  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  // Prellenar la búsqueda si venimos de un enlace "Ver ventas" (ej. desde Clientes)
  const presetQuery = new URLSearchParams(window.location.search).get('q');
  if (presetQuery) {
    document.getElementById('salesSearchInput').value = presetQuery;
  }

  // Cargar datos
  await loadHistoryData();

  // Filtros del historial de ventas
  document.getElementById('salesSearchInput').addEventListener('input', renderSalesHistory);
  document.getElementById('salesTypeFilter').addEventListener('change', renderSalesHistory);
  document.getElementById('salesStatusFilter').addEventListener('change', renderSalesHistory);
});

// Trae productos y ventas UNA vez desde Firebase y los deja en memoria
// (allProducts/allSales). El resto de la pantalla (stats, tabla, popups)
// lee de esa caché en lugar de volver a consultar Firestore en cada acción.
async function loadHistoryData() {
  try {
    allProducts = await DB.getProducts();
    allSales = await DB.getSales();
    renderStats();
    renderSalesHistory();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al cargar datos desde Firebase', 'error');
  }
}

/* ============ STATS CARDS ============ */
function renderStats() {
  try {
    const today = new Date().toDateString();
    const todaySalesList = allSales.filter(s => new Date(s.date).toDateString() === today);
    const todaySales = {
      count: todaySalesList.length,
      total: todaySalesList.reduce((sum, s) => sum + s.total, 0)
    };
    const totalSales = {
      count: allSales.length,
      total: allSales.reduce((sum, s) => sum + s.total, 0)
    };
    const lowStock = allProducts.filter(p => !p.unlimitedStock && p.stock <= p.minStock).length;

    const stats = [
      {
        icon: '💰',
        iconClass: 'green',
        value: formatCurrency(todaySales.total),
        label: 'Ventas de hoy'
      },
      {
        icon: '🧾',
        iconClass: 'indigo',
        value: todaySales.count,
        label: 'Ventas realizadas hoy'
      },
      {
        icon: '📈',
        iconClass: 'amber',
        value: formatCurrency(totalSales.total),
        label: 'Ventas totales'
      },
      {
        icon: '⚠️',
        iconClass: 'gray',
        value: lowStock,
        label: 'Productos con stock bajo'
      }
    ];

    document.getElementById('statsGrid').innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-icon ${s.iconClass}">${s.icon}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error renderizando stats:', e);
  }
}

/* ============ TABLA DE HISTORIAL ============ */
function renderSalesHistory() {
  const tbody = document.getElementById('salesHistoryBody');
  const tableWrap = document.getElementById('salesHistoryTableWrap');
  const emptyState = document.getElementById('salesHistoryEmptyState');

  if (!tbody || !tableWrap || !emptyState) return;

  const searchTerm = (document.getElementById('salesSearchInput').value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('salesTypeFilter').value;
  const statusFilter = document.getElementById('salesStatusFilter').value;

  let sales = allSales
    .map(sale => {
      const normalizedSaleType = sale.saleType || (sale.paymentMethod === 'Crédito' ? 'Credito' : 'Contado');
      const pendingBalance = Number(sale.pendingBalance || 0);
      const normalizedStatus = sale.paymentStatus || (pendingBalance > 0 ? 'Pendiente' : 'Pagada');

      return {
        ...sale,
        saleType: normalizedSaleType,
        pendingBalance,
        paymentStatus: normalizedStatus,
        customerName: sale.customerName || 'Cliente general'
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (searchTerm) {
    sales = sales.filter(sale => {
      const productNames = (sale.items || [])
        .map(item => (item.name || '').toLowerCase())
        .join(' ');

      return (sale.number || '').toLowerCase().includes(searchTerm) ||
             (sale.customerName || '').toLowerCase().includes(searchTerm) ||
             (sale.customerPhone || '').toLowerCase().includes(searchTerm) ||
             productNames.includes(searchTerm);
    });
  }

  if (typeFilter) {
    sales = sales.filter(sale => sale.saleType === typeFilter);
  }

  if (statusFilter) {
    sales = sales.filter(sale => sale.paymentStatus === statusFilter);
  }

  if (sales.length === 0) {
    tbody.innerHTML = '';
    tableWrap.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  tableWrap.classList.remove('hidden');
  emptyState.classList.add('hidden');

  tbody.innerHTML = sales.map(sale => {
    const typeBadgeClass = sale.saleType === 'Credito' ? 'badge-warning' : 'badge-success';
    const statusBadgeClass = sale.paymentStatus === 'Pendiente' ? 'badge-danger' : 'badge-success';
    const saleItems = sale.items || [];
    const hasPendingCredit = sale.saleType === 'Credito' && Number(sale.pendingBalance || 0) > 0;
    const productsPreview = saleItems.slice(0, 2).map(item => {
      const qty = Number(item.quantity || 0);
      return `${qty}x ${escapeHtml(item.name || 'Producto')}`;
    }).join('<br>');
    const extraItems = saleItems.length > 2
      ? `<div class="sale-meta">+${saleItems.length - 2} producto(s) más</div>`
      : '';

    return `
      <tr>
        <td>
          <div class="sale-ref">#${escapeHtml(sale.number || '—')}</div>
          ${sale.orderReference ? `<div class="sale-meta">Ref: ${escapeHtml(sale.orderReference)}</div>` : ''}
        </td>
        <td>${sale.date ? formatDateTime(sale.date) : '—'}</td>
        <td>${escapeHtml(sale.customerName || 'Cliente general')}</td>
        <td>
          <div class="sale-products">${productsPreview || '—'}</div>
          ${extraItems}
        </td>
        <td><span class="badge ${typeBadgeClass}">${sale.saleType === 'Credito' ? 'A crédito' : 'Al contado'}</span></td>
        <td>${escapeHtml(sale.paymentMethod || 'Efectivo')}</td>
        <td><span class="badge ${statusBadgeClass}">${escapeHtml(sale.paymentStatus)}</span></td>
        <td>
          <strong>${formatCurrency(sale.total || 0)}</strong>
          ${sale.discountAmount > 0 ? `<div class="sale-meta">-${sale.discountPercent}% dcto.</div>` : ''}
          ${sale.deliveryEnabled && sale.deliveryCost > 0 ? `<div class="sale-meta">🚚 +${formatCurrency(sale.deliveryCost)}${sale.deliveryDestination ? ' · ' + escapeHtml(sale.deliveryDestination) : ''}</div>` : ''}
        </td>
        <td>${formatCurrency(sale.pendingBalance || 0)}</td>
        <td>
          <div class="actions-cell">
            ${hasPendingCredit
              ? `<button class="btn btn-outline btn-sm sales-action-btn" onclick="openCreditPaymentModal('${sale.id}')">💵 Abonar</button>`
              : ''}
            <button class="btn-icon delete-btn" onclick="openDeleteSaleModal('${sale.id}')" title="Eliminar venta">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============ ABONOS A CRÉDITO ============ */
function openCreditPaymentModal(saleId) {
  const sale = allSales.find(item => item.id === saleId);

  if (!sale) {
    showToast('No se encontró la venta seleccionada', 'error');
    return;
  }

  const pendingBalance = Number(sale.pendingBalance || 0);
  if (pendingBalance <= 0 || sale.saleType !== 'Credito') {
    showToast('Esta venta no tiene saldo pendiente', 'warning');
    return;
  }

  activePaymentSaleId = sale.id;

  document.getElementById('creditPaymentSummary').innerHTML = `
    <div class="summary-row">
      <span>Comprobante:</span>
      <span>#${escapeHtml(sale.number || '—')}</span>
    </div>
    <div class="summary-row">
      <span>Cliente:</span>
      <span>${escapeHtml(sale.customerName || 'Cliente general')}</span>
    </div>
    <div class="summary-row">
      <span>Total venta:</span>
      <span>${formatCurrency(sale.total || 0)}</span>
    </div>
    <div class="summary-row total">
      <span>Saldo pendiente:</span>
      <span>${formatCurrency(pendingBalance)}</span>
    </div>
  `;

  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentAmount').max = pendingBalance.toFixed(2);
  document.getElementById('paymentNote').value = '';

  openModal('creditPaymentModal');
  setTimeout(() => document.getElementById('paymentAmount').focus(), 100);
}

function closeCreditPaymentModal() {
  activePaymentSaleId = null;
  closeModal('creditPaymentModal');
}

async function confirmCreditPayment() {
  if (!activePaymentSaleId) {
    showToast('No hay una venta seleccionada para abonar', 'error');
    return;
  }

  const amount = Number(document.getElementById('paymentAmount').value || 0);
  const note = document.getElementById('paymentNote').value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Ingresa un monto de abono válido', 'warning');
    return;
  }

  const result = await DB.registerCreditPayment(activePaymentSaleId, { amount, note });
  if (!result.success) {
    showToast(result.error || 'No se pudo registrar el abono', 'error');
    return;
  }

  // Actualiza la venta en la caché local con el resultado del abono,
  // sin volver a descargar todo el historial de Firebase.
  const index = allSales.findIndex(s => s.id === activePaymentSaleId);
  if (index !== -1) {
    allSales[index] = result.sale;
  }

  closeCreditPaymentModal();
  showToast('✅ Abono registrado correctamente', 'success');
  renderSalesHistory();
  renderStats();
}

/* ============ ELIMINAR VENTA ============ */
function openDeleteSaleModal(saleId) {
  deleteSaleId = saleId;
  const sale = allSales.find(s => s.id === saleId);

  document.getElementById('deleteSaleRef').textContent = sale ? `#${sale.number || '—'}` : 'esta venta';
  openModal('deleteSaleModal');
}

async function confirmDeleteSale() {
  if (!deleteSaleId) return;

  const result = await DB.deleteSale(deleteSaleId);
  deleteSaleId = null;
  closeModal('deleteSaleModal');

  if (!result.success) {
    showToast(result.error || 'No se pudo eliminar la venta', 'error');
    return;
  }

  showToast('🗑️ Venta eliminada y stock restaurado', 'success');
  await loadHistoryData();
}
