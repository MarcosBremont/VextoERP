/* ============================================
   VextoERP - Facturación (Carrito + Ventas)
   Conectado a Firebase Firestore
   ============================================ */

// Estado del carrito
let cart = [];
let allProducts = [];
let activePaymentSaleId = null;
let deleteSaleId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Proteger ruta: si no hay sesión, redirigir al login
  if (!requireAuth()) return;

  // UI común
  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  // Cargar datos
  loadBillingData();

  // Configurar campos del modal de cobro
  setupCheckoutForm();

  // Búsqueda en tiempo real
  const searchInput = document.getElementById('searchProductInput');
  searchInput.addEventListener('input', renderProductsBilling);

  // Filtros del historial de ventas
  const salesSearchInput = document.getElementById('salesSearchInput');
  const salesTypeFilter = document.getElementById('salesTypeFilter');
  const salesStatusFilter = document.getElementById('salesStatusFilter');

  salesSearchInput.addEventListener('input', renderSalesHistory);
  salesTypeFilter.addEventListener('change', renderSalesHistory);
  salesStatusFilter.addEventListener('change', renderSalesHistory);
});

function setupCheckoutForm() {
  const saleType = document.getElementById('saleType');
  if (!saleType) return;

  saleType.addEventListener('change', toggleCreditFields);
  toggleCreditFields();
}

async function setNextOrderReferencePreview() {
  const orderInput = document.getElementById('orderReference');
  if (!orderInput) return;

  try {
    const nextReference = await DB.getUpcomingOrderReference();
    orderInput.value = nextReference;
  } catch (e) {
    console.error('Error obteniendo referencia de orden:', e);
    orderInput.value = '01';
  }
}

function toggleCreditFields() {
  const saleType = document.getElementById('saleType');
  const paymentMethod = document.getElementById('paymentMethod');
  const dueDateGroup = document.getElementById('creditDueDateGroup');
  const dueDateInput = document.getElementById('creditDueDate');
  const initialPaymentGroup = document.getElementById('initialPaymentGroup');
  const initialPaymentInput = document.getElementById('initialPayment');
  const amountTenderedGroup = document.getElementById('amountTenderedGroup');
  const amountTenderedInput = document.getElementById('amountTendered');

  if (!saleType || !paymentMethod || !dueDateGroup || !dueDateInput || !initialPaymentGroup || !initialPaymentInput) {
    return;
  }

  const isCredit = saleType.value === 'Credito';

  dueDateGroup.classList.toggle('hidden', !isCredit);
  initialPaymentGroup.classList.toggle('hidden', !isCredit);
  amountTenderedGroup.classList.toggle('hidden', isCredit);
  dueDateInput.required = isCredit;

  if (isCredit) {
    paymentMethod.value = 'Crédito';
    paymentMethod.disabled = true;
    amountTenderedInput.value = '';
  } else {
    if (paymentMethod.value === 'Crédito') {
      paymentMethod.value = 'Efectivo';
    }
    paymentMethod.disabled = false;
    dueDateInput.value = '';
    initialPaymentInput.value = '0';
  }

  renderCheckoutSummary();
}

function toggleDeliveryFields() {
  const enabled = document.getElementById('deliveryEnabled').checked;
  const group = document.getElementById('deliveryFieldsGroup');
  group.classList.toggle('hidden', !enabled);
  if (!enabled) {
    document.getElementById('deliveryCost').value = '';
    document.getElementById('deliveryDestination').value = '';
  }
  renderCheckoutSummary();
}

async function resetCheckoutForm() {
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('saleNotes').value = '';
  document.getElementById('creditDueDate').value = '';
  document.getElementById('initialPayment').value = '0';
  document.getElementById('saleType').value = 'Contado';
  document.getElementById('paymentMethod').value = 'Efectivo';
  document.getElementById('saleDiscount').value = '0';
  document.getElementById('amountTendered').value = '';
  document.getElementById('deliveryEnabled').checked = false;
  document.getElementById('deliveryCost').value = '';
  document.getElementById('deliveryDestination').value = '';
  document.getElementById('deliveryFieldsGroup').classList.add('hidden');
  toggleCreditFields();
  await setNextOrderReferencePreview();
}

function getCheckoutData() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountPercent = Math.min(Math.max(Number(document.getElementById('saleDiscount').value || 0), 0), 100);
  const deliveryEnabled = document.getElementById('deliveryEnabled').checked;
  const deliveryCost = deliveryEnabled ? Math.max(Number(document.getElementById('deliveryCost').value || 0), 0) : 0;
  const deliveryDestination = deliveryEnabled ? document.getElementById('deliveryDestination').value.trim() : '';
  const total = Math.max(subtotal - (subtotal * discountPercent / 100), 0) + deliveryCost;

  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const saleType = document.getElementById('saleType').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  const orderReference = document.getElementById('orderReference').value.trim();
  const dueDate = document.getElementById('creditDueDate').value;
  const notes = document.getElementById('saleNotes').value.trim();
  const initialPayment = Number(document.getElementById('initialPayment').value || 0);
  const amountTendered = saleType === 'Credito' ? 0 : Number(document.getElementById('amountTendered').value || 0);

  if (saleType === 'Credito') {
    if (!dueDate) {
      showToast('Debes indicar una fecha de vencimiento para ventas a crédito', 'warning');
      return null;
    }
    if (initialPayment < 0) {
      showToast('El abono inicial no puede ser negativo', 'warning');
      return null;
    }
    if (initialPayment > total) {
      showToast('El abono inicial no puede exceder el total de la venta', 'warning');
      return null;
    }
  }

  return {
    customerName: customerName || 'Cliente general',
    customerPhone,
    saleType,
    paymentMethod,
    orderReference,
    autoOrderReference: true,
    dueDate: saleType === 'Credito' ? dueDate : null,
    initialPayment: saleType === 'Credito' ? initialPayment : total,
    notes,
    discountPercent,
    amountTendered,
    deliveryEnabled,
    deliveryCost,
    deliveryDestination
  };
}

// Cargar productos y stats desde Firebase
async function loadBillingData() {
  try {
    allProducts = await DB.getProducts();
    renderStats();
    renderProductsBilling();
    await setNextOrderReferencePreview();
    await renderSalesHistory();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al cargar datos desde Firebase', 'error');
  }
}

async function renderSalesHistory() {
  const tbody = document.getElementById('salesHistoryBody');
  const tableWrap = document.getElementById('salesHistoryTableWrap');
  const emptyState = document.getElementById('salesHistoryEmptyState');

  if (!tbody || !tableWrap || !emptyState) return;

  const searchTerm = (document.getElementById('salesSearchInput').value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('salesTypeFilter').value;
  const statusFilter = document.getElementById('salesStatusFilter').value;

  let sales = await DB.getSales();

  sales = sales
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

async function openCreditPaymentModal(saleId) {
  const sales = await DB.getSales();
  const sale = sales.find(item => item.id === saleId);

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

  closeCreditPaymentModal();
  showToast('✅ Abono registrado correctamente', 'success');
  await renderSalesHistory();
  await renderStats();
}

/* ============ ELIMINAR VENTA ============ */
async function openDeleteSaleModal(saleId) {
  deleteSaleId = saleId;
  const sales = await DB.getSales();
  const sale = sales.find(s => s.id === saleId);

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
  await loadBillingData();
}

/* ============ STATS CARDS ============ */
async function renderStats() {
  try {
    const todaySales = await DB.getTodaySales();
    const totalSales = await DB.getTotalSales();
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

/* ============ LISTA DE PRODUCTOS (TARJETAS) ============ */
function renderProductsBilling() {
  const searchTerm = document.getElementById('searchProductInput').value.trim().toLowerCase();
  const container = document.getElementById('productListBilling');
  const emptyState = document.getElementById('billingEmptyState');

  let products = [...allProducts];

  // Filtrar por búsqueda
  if (searchTerm) {
    products = products.filter(p =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.category || '').toLowerCase().includes(searchTerm)
    );
  }

  // Ordenar: sin stock al final, luego por stock bajo primero (ilimitado cuenta como con stock)
  products.sort((a, b) => {
    const stockA = a.unlimitedStock ? Infinity : a.stock;
    const stockB = b.unlimitedStock ? Infinity : b.stock;
    if (stockA <= 0 && stockB > 0) return 1;
    if (stockA > 0 && stockB <= 0) return -1;
    return stockA - stockB;
  });

  if (products.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = products.map(product => {
    const outOfStock = !product.unlimitedStock && product.stock <= 0;
    const inCart = cart.find(item => item.productId === product.id);
    const selected = inCart ? 'selected' : '';
    const disabled = outOfStock ? 'disabled' : '';
    const iconContent = product.photo
      ? `<img src="${product.photo}" alt="${escapeHtml(product.name)}">`
      : '📦';

    return `
      <div class="billing-product-card ${selected} ${disabled}"
           onclick="addToCart('${product.id}')">
        <div class="bp-icon">${iconContent}</div>
        <div class="bp-name">${escapeHtml(product.name)}</div>
        <div class="bp-price">${formatCurrency(product.price)}</div>
        <div class="bp-stock">
          ${product.unlimitedStock ? '♾️ Ilimitado' : (outOfStock ? '❌ Sin stock' : `${product.stock} disponibles`)}
          ${inCart ? ` · En carrito: ${inCart.quantity}` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ============ CARRITO DE COMPRAS ============ */
function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  if (!product.unlimitedStock && product.stock <= 0) {
    showToast('Este producto no tiene stock disponible', 'warning');
    return;
  }

  const existing = cart.find(item => item.productId === productId);

  if (existing) {
    // Verificar que no exceda el stock
    if (!product.unlimitedStock && existing.quantity >= product.stock) {
      showToast('No hay más unidades disponibles de este producto', 'warning');
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  showToast('Producto agregado al carrito: ' + product.name, 'success');
  renderCart();
  renderProductsBilling();
}

function increaseQuantity(productId) {
  const product = allProducts.find(p => p.id === productId);
  const item = cart.find(i => i.productId === productId);
  if (!item || !product) return;

  if (!product.unlimitedStock && item.quantity >= product.stock) {
    showToast('No hay más unidades disponibles', 'warning');
    return;
  }

  item.quantity++;
  renderCart();
  renderProductsBilling();
}

function decreaseQuantity(productId) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;

  item.quantity--;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.productId !== productId);
  }

  renderCart();
  renderProductsBilling();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.productId !== productId);
  showToast('Producto eliminado del carrito', 'warning');
  renderCart();
  renderProductsBilling();
}

function clearCart() {
  cart = [];
  renderCart();
  renderProductsBilling();
}

/* ============ RENDER DEL CARRITO ============ */
function renderCart() {
  const cartEmpty = document.getElementById('cartEmpty');
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // Mostrar/ocultar estado vacío
  if (cart.length === 0) {
    cartEmpty.classList.remove('hidden');
    cartItems.classList.add('hidden');
    cartItems.innerHTML = '';
  } else {
    cartEmpty.classList.add('hidden');
    cartItems.classList.remove('hidden');

    cartItems.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">${formatCurrency(item.price)} / ud.</div>
        </div>
        <div class="cart-qty-control">
          <button onclick="decreaseQuantity('${item.productId}')" title="Disminuir">−</button>
          <span class="cart-qty">${item.quantity}</span>
          <button onclick="increaseQuantity('${item.productId}')" title="Aumentar">+</button>
        </div>
        <div class="cart-item-subtotal">${formatCurrency(item.price * item.quantity)}</div>
        <button class="cart-remove" onclick="removeFromCart('${item.productId}')" title="Quitar">✕</button>
      </div>
    `).join('');
  }

  // Totales
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  cartCount.textContent = totalItems;
  cartTotal.textContent = formatCurrency(total);
  checkoutBtn.disabled = cart.length === 0;
}

/* ============ COBRO / CONFIRMAR VENTA ============ */
async function openCheckoutModal() {
  if (cart.length === 0) return;

  await resetCheckoutForm();
  renderCheckoutSummary();

  openModal('checkoutModal');
}

// Aplica un porcentaje de descuento predefinido y refresca el resumen
function setDiscount(percent) {
  document.getElementById('saleDiscount').value = percent;
  renderCheckoutSummary();
}

// Recalcula y pinta el resumen de la venta (con descuento si aplica)
function renderCheckoutSummary() {
  const summary = document.getElementById('checkoutSummary');
  const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const discountPercent = Math.min(Math.max(Number(document.getElementById('saleDiscount').value || 0), 0), 100);
  const discountAmount = subtotal * discountPercent / 100;
  const deliveryEnabled = document.getElementById('deliveryEnabled').checked;
  const deliveryCost = deliveryEnabled ? Math.max(Number(document.getElementById('deliveryCost').value || 0), 0) : 0;
  const total = Math.max(subtotal - discountAmount, 0) + deliveryCost;

  const isCredit = document.getElementById('saleType').value === 'Credito';
  const amountTendered = Number(document.getElementById('amountTendered').value || 0);
  const change = amountTendered - total;

  summary.innerHTML = `
    <div class="summary-row">
      <span>Artículos:</span>
      <span>${cart.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    <div class="summary-row">
      <span>Productos distintos:</span>
      <span>${cart.length}</span>
    </div>
    ${discountAmount > 0 ? `
      <div class="summary-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(subtotal)}</span>
      </div>
      <div class="summary-row discount-row">
        <span>Descuento (${discountPercent}%):</span>
        <span>-${formatCurrency(discountAmount)}</span>
      </div>
    ` : ''}
    ${deliveryCost > 0 ? `
      <div class="summary-row">
        <span>🚚 Delivery:</span>
        <span>+${formatCurrency(deliveryCost)}</span>
      </div>
    ` : ''}
    <div class="summary-row total">
      <span>TOTAL A COBRAR:</span>
      <span>${formatCurrency(total)}</span>
    </div>
    ${!isCredit && amountTendered > 0 ? (
      change >= 0
        ? `<div class="summary-row change-row"><span>Cambio a devolver:</span><span>${formatCurrency(change)}</span></div>`
        : `<div class="summary-row discount-row"><span>Falta por pagar:</span><span>${formatCurrency(-change)}</span></div>`
    ) : ''}
  `;
}

async function confirmSale() {
  const checkoutData = getCheckoutData();
  if (!checkoutData) return;

  const result = await DB.registerSale(cart, checkoutData);

  if (!result.success) {
    showToast(result.error, 'error');
    return;
  }

  const sale = result.sale;

  // Mostrar modal de éxito con detalles
  const summary = document.getElementById('successSummary');
  summary.innerHTML = `
    <div class="summary-row">
      <span>Comprobante N°:</span>
      <span><strong>${sale.number}</strong></span>
    </div>
    <div class="summary-row">
      <span>Fecha:</span>
      <span>${formatDateTime(sale.date)}</span>
    </div>
    <div class="summary-row">
      <span>Vendedor:</span>
      <span>${escapeHtml(sale.sellerName)}</span>
    </div>
    <div class="summary-row">
      <span>Método de pago:</span>
      <span>${escapeHtml(sale.paymentMethod)}</span>
    </div>
    <div class="summary-row">
      <span>Cliente:</span>
      <span>${escapeHtml(sale.customerName || 'Cliente general')}</span>
    </div>
    <div class="summary-row">
      <span>Tipo de venta:</span>
      <span>${sale.saleType === 'Credito' ? 'A crédito' : 'Al contado'}</span>
    </div>
    ${sale.orderReference ? `
      <div class="summary-row">
        <span>Referencia:</span>
        <span>${escapeHtml(sale.orderReference)}</span>
      </div>
    ` : ''}
    ${sale.saleType === 'Credito' ? `
      <div class="summary-row">
        <span>Vence:</span>
        <span>${sale.dueDate ? formatDateTime(sale.dueDate + 'T00:00:00') : '—'}</span>
      </div>
      <div class="summary-row">
        <span>Abono:</span>
        <span>${formatCurrency(sale.paidAmount || 0)}</span>
      </div>
      <div class="summary-row">
        <span>Saldo pendiente:</span>
        <span>${formatCurrency(sale.pendingBalance || 0)}</span>
      </div>
    ` : ''}
    ${sale.notes ? `
      <div class="summary-row">
        <span>Notas:</span>
        <span>${escapeHtml(sale.notes)}</span>
      </div>
    ` : ''}
    <div class="summary-row" style="border-top:1px solid var(--gray-200); margin-top:6px; padding-top:6px;">
      <span>Artículos vendidos:</span>
      <span>${cart.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    ${sale.discountAmount > 0 ? `
      <div class="summary-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(sale.subtotal || 0)}</span>
      </div>
      <div class="summary-row discount-row">
        <span>Descuento (${sale.discountPercent || 0}%):</span>
        <span>-${formatCurrency(sale.discountAmount)}</span>
      </div>
    ` : ''}
    ${sale.deliveryEnabled && sale.deliveryCost > 0 ? `
      <div class="summary-row">
        <span>🚚 Delivery${sale.deliveryDestination ? ' (' + escapeHtml(sale.deliveryDestination) + ')' : ''}:</span>
        <span>+${formatCurrency(sale.deliveryCost)}</span>
      </div>
    ` : ''}
    <div class="summary-row total">
      <span>TOTAL:</span>
      <span>${formatCurrency(sale.total)}</span>
    </div>
    ${sale.amountTendered ? `
      <div class="summary-row">
        <span>Paga con:</span>
        <span>${formatCurrency(sale.amountTendered)}</span>
      </div>
      <div class="summary-row change-row">
        <span>Cambio entregado:</span>
        <span>${formatCurrency(sale.changeDue || 0)}</span>
      </div>
    ` : ''}
  `;

  // Cerrar modal de confirmación y abrir el de éxito
  closeModal('checkoutModal');
  openModal('successModal');

  // Limpiar carrito
  cart = [];
  renderCart();
  renderProductsBilling();

  // Recargar datos desde Firebase
  await loadBillingData();
}

function closeSaleSuccess() {
  closeModal('successModal');
}