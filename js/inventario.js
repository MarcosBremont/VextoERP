/* ============================================
   VextoERP - Inventario (CRUD de Productos)
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  // Proteger ruta: si no hay sesión, redirigir al login
  if (!requireAuth()) return;

  // Inicializar datos de ejemplo en la primera visita
  await seedSampleData();

  // UI común
  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  // Cargar datos
  await renderStats();
  await renderProductsTable();

  // Búsqueda en tiempo real
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', renderProductsTable);
});

/* ============ STATS CARDS ============ */
async function renderStats() {
  const products = await DB.getProducts();
  const lowStock = await DB.getLowStockProducts();
  const totalUnits = await DB.getTotalUnits();
  const inventoryValue = await DB.getInventoryValue();

  const stats = [
    {
      icon: '🏷️',
      iconClass: 'indigo',
      value: products.length,
      label: 'Productos registrados'
    },
    {
      icon: '📦',
      iconClass: 'green',
      value: totalUnits,
      label: 'Unidades en stock'
    },
    {
      icon: '⚠️',
      iconClass: 'amber',
      value: lowStock.length,
      label: 'Productos con stock bajo'
    },
    {
      icon: '💰',
      iconClass: 'gray',
      value: formatCurrency(inventoryValue),
      label: 'Valor del inventario'
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

/* ============ TABLA DE PRODUCTOS ============ */
async function renderProductsTable() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const tbody = document.getElementById('productsTableBody');
  const emptyState = document.getElementById('emptyState');

  let products = await DB.getProducts();

  // Filtrar por búsqueda
  if (searchTerm) {
    products = products.filter(p =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.category || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm)
    );
  }

  // Ordenar: primero los de menor stock
  products.sort((a, b) => a.stock - b.stock);

  const table = document.querySelector('.data-table');
  if (products.length === 0) {
    table.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }

  table.style.display = '';
  emptyState.classList.add('hidden');

  tbody.innerHTML = products.map(product => {
    const status = DB.getStockStatus(product.stock, product.minStock);
    const initials = getInitials(product.name);
    const badgeClass = status.cls === 'badge-danger' ? 'gray' : status.cls === 'badge-warning' ? 'amber' : 'green';

    return `
      <tr>
        <td>
          <div class="product-name-cell">
            <div class="product-badge ${badgeClass}">${initials}</div>
            <div>
              <div class="product-main">${escapeHtml(product.name)}</div>
              ${product.description ? `<div class="product-category">${escapeHtml(product.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="badge badge-indigo">${escapeHtml(product.category || '—')}</span></td>
        <td><strong>${formatCurrency(product.price)}</strong></td>
        <td>
          <strong>${product.stock} </strong>
          <span style="font-size:0.75rem; color:var(--gray-400);">uds.</span>
        </td>
        <td><span class="badge ${status.cls}">${status.text}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon edit-btn" onclick="editProduct('${product.id}')" title="Editar">
              ✏️
            </button>
            <button class="btn-icon delete-btn" onclick="openDeleteModal('${product.id}')" title="Eliminar">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============ NUEVO / EDITAR PRODUCTO ============ */
async function openProductModal(productId = null) {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');

  form.reset();
  document.getElementById('productId').value = '';

  if (productId) {
    const product = (await DB.getProducts()).find(p => p.id === productId);
    if (!product) return;

    title.textContent = '✏️ Editar Producto';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCost').value = product.cost || '';
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productMinStock').value = product.minStock || 0;
  } else {
    title.textContent = '➕ Nuevo Producto';
  }

  openModal('productModal');
  setTimeout(() => document.getElementById('productName').focus(), 100);
}

function editProduct(productId) {
  openProductModal(productId);
}

// Guardar (crear o editar)
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const productId = document.getElementById('productId').value;
  const name = document.getElementById('productName').value.trim();
  const description = document.getElementById('productDescription').value;
  const category = document.getElementById('productCategory').value;
  const price = parseFloat(document.getElementById('productPrice').value);
  const cost = document.getElementById('productCost').value ? parseFloat(document.getElementById('productCost').value) : null;
  const stock = parseInt(document.getElementById('productStock').value, 10);
  const minStock = parseInt(document.getElementById('productMinStock').value, 10);

  // Validaciones
  if (!name) {
    showToast('El nombre del producto es obligatorio', 'error');
    return;
  }
  if (!category) {
    showToast('Selecciona una categoría', 'error');
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast('Ingresa un precio de venta válido', 'error');
    return;
  }
  if (isNaN(stock) || stock < 0) {
    showToast('Ingresa una cantidad de stock válida', 'error');
    return;
  }

  const productData = { name, description, category, price, cost, stock, minStock: minStock || 0 };

  if (productId) {
    await DB.updateProduct(productId, productData);
    showToast('✅ Producto actualizado correctamente');
  } else {
    await DB.addProduct(productData);
    showToast('✅ Producto agregado al inventario');
  }

  closeModal('productModal');
  await renderStats();
  await renderProductsTable();
});

/* ============ ELIMINAR PRODUCTO ============ */
let deleteProductId = null;

async function openDeleteModal(productId) {
  deleteProductId = productId;
  const product = (await DB.getProducts()).find(p => p.id === productId);
  if (product) {
    document.getElementById('deleteProductName').textContent = product.name;
  }
  openModal('deleteModal');
}

async function confirmDeleteProduct() {
  if (!deleteProductId) return;

  await DB.deleteProduct(deleteProductId);
  deleteProductId = null;
  closeModal('deleteModal');
  showToast('🗑️ Producto eliminado');

  await renderStats();
  await renderProductsTable();
}

/* ============ UTILIDADES ============ */
function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}