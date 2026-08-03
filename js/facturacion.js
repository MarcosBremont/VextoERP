/* ============================================
   VextoERP - Facturación (Carrito + Ventas)
   Conectado a Firebase Firestore
   ============================================ */

// Estado del carrito
let cart = [];
let allProducts = [];

document.addEventListener('DOMContentLoaded', () => {
  // Proteger ruta: si no hay sesión, redirigir al login
  if (!requireAuth()) return;

  // UI común
  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  // Cargar datos
  loadBillingData();

  // Búsqueda en tiempo real
  const searchInput = document.getElementById('searchProductInput');
  searchInput.addEventListener('input', renderProductsBilling);
});

// Cargar productos y stats desde Firebase
async function loadBillingData() {
  try {
    allProducts = await DB.getProducts();
    renderStats();
    renderProductsBilling();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al cargar datos desde Firebase', 'error');
  }
}

/* ============ STATS CARDS ============ */
async function renderStats() {
  try {
    const todaySales = await DB.getTodaySales();
    const totalSales = await DB.getTotalSales();
    const lowStock = allProducts.filter(p => p.stock <= p.minStock).length;

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

  // Ordenar: sin stock al final, luego por stock bajo primero
  products.sort((a, b) => {
    if (a.stock <= 0 && b.stock > 0) return 1;
    if (a.stock > 0 && b.stock <= 0) return -1;
    return a.stock - b.stock;
  });

  if (products.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = products.map(product => {
    const outOfStock = product.stock <= 0;
    const inCart = cart.find(item => item.productId === product.id);
    const selected = inCart ? 'selected' : '';
    const disabled = outOfStock ? 'disabled' : '';

    return `
      <div class="billing-product-card ${selected} ${disabled}"
           onclick="addToCart('${product.id}')">
        <div class="bp-icon">📦</div>
        <div class="bp-name">${escapeHtml(product.name)}</div>
        <div class="bp-price">${formatCurrency(product.price)}</div>
        <div class="bp-stock">
          ${outOfStock ? '❌ Sin stock' : `${product.stock} disponibles`}
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
  if (product.stock <= 0) {
    showToast('Este producto no tiene stock disponible', 'warning');
    return;
  }

  const existing = cart.find(item => item.productId === productId);

  if (existing) {
    // Verificar que no exceda el stock
    if (existing.quantity >= product.stock) {
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

  if (item.quantity >= product.stock) {
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
function openCheckoutModal() {
  if (cart.length === 0) return;

  const summary = document.getElementById('checkoutSummary');
  summary.innerHTML = `
    <div class="summary-row">
      <span>Artículos:</span>
      <span>${cart.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    <div class="summary-row">
      <span>Productos distintos:</span>
      <span>${cart.length}</span>
    </div>
    <div class="summary-row total">
      <span>TOTAL A COBRAR:</span>
      <span>${formatCurrency(cart.reduce((s, i) => s + (i.price * i.quantity), 0))}</span>
    </div>
  `;

  // Resetear método de pago
  document.getElementById('paymentMethod').value = 'Efectivo';

  openModal('checkoutModal');
}

async function confirmSale() {
  const paymentMethod = document.getElementById('paymentMethod').value;
  const result = await DB.registerSale(cart, { paymentMethod });

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
    <div class="summary-row" style="border-top:1px solid var(--gray-200); margin-top:6px; padding-top:6px;">
      <span>Artículos vendidos:</span>
      <span>${cart.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    <div class="summary-row total">
      <span>TOTAL:</span>
      <span>${formatCurrency(sale.total)}</span>
    </div>
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