/* ============================================
   VextoERP - Facturación (Carrito + Ventas)
   Conectado a Firebase Firestore
   ============================================ */

// Estado del carrito
let cart = [];
let allProducts = [];
let allCategories = [];
let allCustomers = [];
let activeCategoryFilter = '';

// Escapa un texto para insertarlo de forma segura dentro de comillas simples de un atributo onclick
function escapeJsString(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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

// Selecciona el método de pago activo (píldoras) y actualiza el input oculto
function setPaymentMethod(method) {
  document.getElementById('paymentMethod').value = method;
  document.querySelectorAll('.payment-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
}

function toggleCreditFields() {
  const saleType = document.getElementById('saleType');
  const paymentMethod = document.getElementById('paymentMethod');
  const paymentMethodGroup = document.getElementById('paymentMethodGroup');
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
  paymentMethodGroup.classList.toggle('disabled', isCredit);

  if (isCredit) {
    setPaymentMethod('Crédito');
    amountTenderedInput.value = '';
  } else {
    if (paymentMethod.value === 'Crédito') {
      setPaymentMethod('Efectivo');
    }
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
  setPaymentMethod('Efectivo');
  document.getElementById('saleDiscount').value = '0';
  document.getElementById('amountTendered').value = '';
  document.getElementById('deliveryEnabled').checked = false;
  document.getElementById('deliveryCost').value = '';
  document.getElementById('deliveryDestination').value = '';
  document.getElementById('deliveryFieldsGroup').classList.add('hidden');
  hideCustomerSuggestions();
  toggleCreditFields();
  await setNextOrderReferencePreview();
}

/* ============ AUTOCOMPLETAR CLIENTE ============ */

// Se ejecuta al escribir en "Nombre del cliente" o "Teléfono del cliente":
// sugiere clientes ya registrados y avisa si el teléfono es de uno nuevo.
function onCustomerFieldInput() {
  const name = document.getElementById('customerName').value.trim().toLowerCase();
  const phone = document.getElementById('customerPhone').value.trim();
  const term = name || phone;

  if (term.length >= 2) {
    const phoneDigits = normalizePhoneDigits(phone);
    const matches = allCustomers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (phoneDigits && c.phoneDigits && c.phoneDigits.includes(phoneDigits))
    ).slice(0, 5);
    renderCustomerSuggestions(matches);
  } else {
    hideCustomerSuggestions();
  }

  renderCustomerStatus();
}

function renderCustomerSuggestions(matches) {
  const container = document.getElementById('customerSuggestions');
  if (matches.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = matches.map(c => `
    <div class="customer-suggestion-item" onclick="selectCustomerSuggestion('${c.id}')">
      <span class="cs-name">${escapeHtml(c.name)}</span>
      <span class="cs-phone">${escapeHtml(c.phone || '')}</span>
    </div>
  `).join('');
}

function hideCustomerSuggestions() {
  const container = document.getElementById('customerSuggestions');
  container.classList.add('hidden');
  container.innerHTML = '';
}

function selectCustomerSuggestion(customerId) {
  const customer = allCustomers.find(c => c.id === customerId);
  if (!customer) return;

  document.getElementById('customerName').value = customer.name;
  document.getElementById('customerPhone').value = customer.phone || '';
  hideCustomerSuggestions();
  renderCustomerStatus();
}

// Muestra si el teléfono ingresado ya pertenece a un cliente registrado
// o si se creará uno nuevo automáticamente al confirmar la venta.
function renderCustomerStatus() {
  const statusEl = document.getElementById('customerStatus');
  const phoneDigits = normalizePhoneDigits(document.getElementById('customerPhone').value);

  if (phoneDigits.length < 6) {
    statusEl.classList.add('hidden');
    return;
  }

  const existing = allCustomers.find(c => c.phoneDigits === phoneDigits);
  statusEl.classList.remove('hidden');

  if (existing) {
    statusEl.className = 'customer-status existing';
    statusEl.textContent = `👤 Cliente existente: ${existing.name}`;
  } else {
    statusEl.className = 'customer-status new';
    statusEl.textContent = '🆕 Se registrará como cliente nuevo al confirmar la venta';
  }
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

// Cargar productos desde Firebase
async function loadBillingData() {
  try {
    allProducts = await DB.getProducts();
    allCategories = await DB.getCategories();
    allCustomers = await DB.getCustomers();
    renderCategoryPills();
    renderProductsBilling();
    await setNextOrderReferencePreview();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al cargar datos desde Firebase', 'error');
  }
}

/* ============ FILTRO POR CATEGORÍA ============ */
function renderCategoryPills() {
  const container = document.getElementById('billingCategoryPills');
  if (!container) return;

  const categoriesInUse = allCategories.filter(c => allProducts.some(p => p.category === c.name));
  const pills = [{ name: '', label: 'Todos' }, ...categoriesInUse.map(c => ({ name: c.name, label: c.name }))];

  container.innerHTML = pills.map(p => `
    <button type="button" class="category-pill ${activeCategoryFilter === p.name ? 'active' : ''}" onclick="setCategoryFilter('${escapeJsString(p.name)}')">${escapeHtml(p.label)}</button>
  `).join('');
}

function setCategoryFilter(name) {
  activeCategoryFilter = name;
  renderCategoryPills();
  renderProductsBilling();
}

/* ============ LISTA DE PRODUCTOS (TARJETAS) ============ */
function renderProductsBilling() {
  const searchTerm = document.getElementById('searchProductInput').value.trim().toLowerCase();
  const container = document.getElementById('productListBilling');
  const emptyState = document.getElementById('billingEmptyState');

  let products = [...allProducts];

  // Filtrar por categoría activa
  if (activeCategoryFilter) {
    products = products.filter(p => p.category === activeCategoryFilter);
  }

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

    cartItems.innerHTML = cart.map(item => {
      const product = allProducts.find(p => p.id === item.productId);
      const imgContent = product && product.photo
        ? `<img src="${product.photo}" alt="${escapeHtml(item.name)}">`
        : '📦';

      return `
        <div class="cart-item">
          <div class="cart-item-img">${imgContent}</div>
          <div class="cart-item-main">
            <div class="cart-item-top">
              <span class="cart-item-name">${escapeHtml(item.name)}</span>
              <button class="cart-remove" onclick="removeFromCart('${item.productId}')" title="Quitar">✕</button>
            </div>
            <div class="cart-item-price">${formatCurrency(item.price)} / ud.</div>
            <div class="cart-item-bottom">
              <div class="cart-qty-control">
                <button onclick="decreaseQuantity('${item.productId}')" title="Disminuir">−</button>
                <span class="cart-qty">${item.quantity}</span>
                <button onclick="increaseQuantity('${item.productId}')" title="Aumentar">+</button>
              </div>
              <div class="cart-item-subtotal">${formatCurrency(item.price * item.quantity)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
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
    <div class="summary-row">
      <span>Subtotal productos:</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>
    ${discountAmount > 0 ? `
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

  const confirmBtn = document.getElementById('confirmSaleBtn');
  if (confirmBtn) {
    confirmBtn.textContent = `✅ Confirmar y Cobrar — ${formatCurrency(total)}`;
  }
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
    <div class="summary-row">
      <span>Subtotal productos:</span>
      <span>${formatCurrency(sale.subtotal || 0)}</span>
    </div>
    ${sale.discountAmount > 0 ? `
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

// Ocultar las sugerencias de cliente al hacer clic fuera de los campos relacionados
document.addEventListener('click', (e) => {
  const relatedIds = ['customerName', 'customerPhone', 'customerSuggestions'];
  if (relatedIds.some(id => e.target.closest && e.target.closest('#' + id))) return;
  hideCustomerSuggestions();
});