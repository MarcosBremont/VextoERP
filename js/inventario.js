/* ============================================
   VextoERP - Inventario (CRUD de Productos)
   ============================================ */

// Productos y categorías se traen UNA vez de Firebase y se guardan aquí.
// Todo lo demás (stats, tabla, formularios, popups) lee/actualiza esta
// caché en memoria en vez de volver a consultar Firestore en cada acción.
let allProducts = [];
let allCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Proteger ruta: si no hay sesión, redirigir al login
  if (!requireAuth()) return;

  // UI común
  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  // Categorías (crear por defecto la primera vez)
  await DB.ensureDefaultCategories();

  // Cargar datos
  await loadInventoryData();

  // Búsqueda en tiempo real
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', renderProductsTable);

  // Alternar campos de stock según el checkbox "sin stock físico"
  document.getElementById('productUnlimitedStock').addEventListener('change', toggleStockFields);

  // Foto del producto
  document.getElementById('productPhotoInput').addEventListener('change', handleProductPhotoSelected);
});

/* ============ FOTO DEL PRODUCTO ============ */
let currentProductPhoto = null; // dataURL (base64) de la foto actual del formulario

async function handleProductPhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Selecciona un archivo de imagen válido', 'error');
    e.target.value = '';
    return;
  }

  try {
    currentProductPhoto = await resizeImageFile(file);
    renderProductPhotoPreview();
  } catch (err) {
    showToast('No se pudo procesar la imagen', 'error');
  } finally {
    e.target.value = '';
  }
}

function removeProductPhoto() {
  currentProductPhoto = null;
  renderProductPhotoPreview();
}

function renderProductPhotoPreview() {
  const img = document.getElementById('productPhotoImg');
  const placeholder = document.getElementById('productPhotoPlaceholder');
  const removeBtn = document.getElementById('removePhotoBtn');

  if (currentProductPhoto) {
    img.src = currentProductPhoto;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    img.src = '';
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
}

// Mostrar/ocultar y (des)requerir los campos de stock del formulario
function toggleStockFields() {
  const unlimited = document.getElementById('productUnlimitedStock').checked;
  const group = document.getElementById('stockFieldsGroup');
  const stockInput = document.getElementById('productStock');

  group.classList.toggle('hidden', unlimited);
  stockInput.required = !unlimited;
}

async function loadInventoryData() {
  try {
    allProducts = await DB.getProducts();
    allCategories = await DB.getCategories();
    renderStats();
    renderProductsTable();
  } catch (e) {
    console.error('Error cargando el inventario:', e);
    showToast('Error al cargar datos desde Firebase', 'error');
  }
}

/* ============ STATS CARDS ============ */
function renderStats() {
  const lowStockCount = allProducts.filter(p => !p.unlimitedStock && p.stock <= p.minStock).length;
  const totalUnits = allProducts.reduce((sum, p) => sum + (p.unlimitedStock ? 0 : p.stock), 0);
  const inventoryValue = allProducts.reduce((sum, p) => sum + (p.unlimitedStock ? 0 : p.stock * (p.cost || p.price || 0)), 0);

  const stats = [
    {
      icon: '🏷️',
      iconClass: 'indigo',
      value: allProducts.length,
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
      value: lowStockCount,
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
function renderProductsTable() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const tbody = document.getElementById('productsTableBody');
  const emptyState = document.getElementById('emptyState');

  let products = [...allProducts];

  // Filtrar por búsqueda
  if (searchTerm) {
    products = products.filter(p =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.category || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm)
    );
  }

  // Ordenar: primero los de menor stock (los de stock ilimitado van al final)
  products.sort((a, b) => {
    const stockA = a.unlimitedStock ? Infinity : a.stock;
    const stockB = b.unlimitedStock ? Infinity : b.stock;
    return stockA - stockB;
  });

  const table = document.querySelector('.data-table');
  if (products.length === 0) {
    table.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }

  table.style.display = '';
  emptyState.classList.add('hidden');

  tbody.innerHTML = products.map(product => {
    const status = DB.getStockStatus(product.stock, product.minStock, product.unlimitedStock);
    const initials = getInitials(product.name);
    const badgeClass = status.cls === 'badge-danger' ? 'gray' : status.cls === 'badge-warning' ? 'amber' : 'green';
    const badgeContent = product.photo
      ? `<img src="${product.photo}" alt="${escapeHtml(product.name)}">`
      : initials;

    return `
      <tr>
        <td>
          <div class="product-name-cell">
            <div class="product-badge ${badgeClass}">${badgeContent}</div>
            <div>
              <div class="product-main">${escapeHtml(product.name)}</div>
              ${product.description ? `<div class="product-category">${escapeHtml(product.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="badge badge-indigo">${escapeHtml(product.category || '—')}</span></td>
        <td><strong>${formatCurrency(product.price)}</strong></td>
        <td>
          ${product.unlimitedStock
            ? '<strong>♾️ Ilimitado</strong>'
            : `<strong>${product.stock} </strong><span style="font-size:0.75rem; color:var(--gray-400);">uds.</span>`}
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
function openProductModal(productId = null) {
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');

  form.reset();
  document.getElementById('productId').value = '';
  currentProductPhoto = null;
  renderCategoryOptions();
  document.getElementById('inlineCategoryAdd').classList.add('hidden');

  if (productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    title.textContent = '✏️ Editar Producto';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCost').value = product.cost || '';
    document.getElementById('productUnlimitedStock').checked = !!product.unlimitedStock;
    document.getElementById('productStock').value = product.unlimitedStock ? '' : product.stock;
    document.getElementById('productMinStock').value = product.unlimitedStock ? 0 : (product.minStock || 0);
    currentProductPhoto = product.photo || null;
  } else {
    title.textContent = '➕ Nuevo Producto';
  }

  renderProductPhotoPreview();
  toggleStockFields();
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
  const unlimitedStock = document.getElementById('productUnlimitedStock').checked;
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
  if (!unlimitedStock && (isNaN(stock) || stock < 0)) {
    showToast('Ingresa una cantidad de stock válida', 'error');
    return;
  }

  const productData = { name, description, category, price, cost, unlimitedStock, stock, minStock: minStock || 0, photo: currentProductPhoto };

  // Se actualiza la caché local con el resultado, sin volver a descargar
  // todo el inventario de Firebase.
  if (productId) {
    const updated = await DB.updateProduct(productId, productData);
    const index = allProducts.findIndex(p => p.id === productId);
    if (index !== -1) allProducts[index] = updated;
    showToast('✅ Producto actualizado correctamente');
  } else {
    const created = await DB.addProduct(productData);
    allProducts.push(created);
    showToast('✅ Producto agregado al inventario');
  }

  closeModal('productModal');
  renderStats();
  renderProductsTable();
});

/* ============ ELIMINAR PRODUCTO ============ */
let deleteProductId = null;

function openDeleteModal(productId) {
  deleteProductId = productId;
  const product = allProducts.find(p => p.id === productId);
  if (product) {
    document.getElementById('deleteProductName').textContent = product.name;
  }
  openModal('deleteModal');
}

async function confirmDeleteProduct() {
  if (!deleteProductId) return;

  await DB.deleteProduct(deleteProductId);
  allProducts = allProducts.filter(p => p.id !== deleteProductId);
  deleteProductId = null;
  closeModal('deleteModal');
  showToast('🗑️ Producto eliminado');

  renderStats();
  renderProductsTable();
}

/* ============ CATEGORÍAS ============ */

// Rellenar el <select> de categorías del formulario de producto
function renderCategoryOptions() {
  const select = document.getElementById('productCategory');
  const currentValue = select.value;

  select.innerHTML = '<option value="">Selecciona una categoría</option>' +
    allCategories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');

  if (currentValue && allCategories.some(c => c.name === currentValue)) {
    select.value = currentValue;
  }
}

// Alterna el campo para agregar una categoría sin salir del modal de producto
function toggleInlineCategoryInput() {
  const row = document.getElementById('inlineCategoryAdd');
  row.classList.toggle('hidden');
  if (!row.classList.contains('hidden')) {
    const input = document.getElementById('inlineCategoryName');
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
}

async function addInlineCategory() {
  const input = document.getElementById('inlineCategoryName');
  const name = input.value.trim();
  if (!name) {
    showToast('Escribe un nombre para la categoría', 'warning');
    return;
  }

  try {
    const created = await DB.addCategory(name);
    allCategories.push(created);
    allCategories.sort((a, b) => a.name.localeCompare(b.name));
    renderCategoryOptions();
    document.getElementById('productCategory').value = created.name;
    document.getElementById('inlineCategoryAdd').classList.add('hidden');
    showToast('✅ Categoría agregada');
  } catch (err) {
    showToast(err.message || 'No se pudo agregar la categoría', 'error');
  }
}

function openCategoriesModal() {
  renderCategoriesList();
  openModal('categoriesModal');
  setTimeout(() => document.getElementById('newCategoryName').focus(), 100);
}

function renderCategoriesList() {
  const list = document.getElementById('categoryList');

  if (allCategories.length === 0) {
    list.innerHTML = '<li class="category-list-empty">Aún no hay categorías</li>';
    return;
  }

  list.innerHTML = allCategories.map(c => `
    <li class="category-list-item">
      <span>${escapeHtml(c.name)}</span>
      <button type="button" class="btn-icon delete-btn" onclick="deleteCategory('${c.id}')" title="Eliminar categoría">🗑️</button>
    </li>
  `).join('');
}

async function deleteCategory(categoryId) {
  if (!confirm('¿Eliminar esta categoría? Los productos que ya la usan conservarán el nombre, pero no podrás volver a seleccionarla.')) {
    return;
  }

  await DB.deleteCategory(categoryId);
  allCategories = allCategories.filter(c => c.id !== categoryId);
  showToast('🗑️ Categoría eliminada');
  renderCategoriesList();
  renderCategoryOptions();
}

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) return;

  try {
    const created = await DB.addCategory(name);
    allCategories.push(created);
    allCategories.sort((a, b) => a.name.localeCompare(b.name));
    input.value = '';
    showToast('✅ Categoría agregada');
    renderCategoriesList();
    renderCategoryOptions();
  } catch (err) {
    showToast(err.message || 'No se pudo agregar la categoría', 'error');
  }
});

/* ============ UTILIDADES ============ */
function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}