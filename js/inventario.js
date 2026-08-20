/* ============================================
   VextoERP - Inventario (CRUD de Productos)
   ============================================ */

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
  await renderStats();
  await renderProductsTable();

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

// Redimensiona y comprime una imagen a JPEG para que ocupe poco espacio
function resizeImageFile(file, maxSize = 500, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

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
async function openProductModal(productId = null) {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');

  form.reset();
  document.getElementById('productId').value = '';
  currentProductPhoto = null;
  await renderCategoryOptions();

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

/* ============ CATEGORÍAS ============ */

// Rellenar el <select> de categorías del formulario de producto
async function renderCategoryOptions() {
  const select = document.getElementById('productCategory');
  const currentValue = select.value;
  const categories = await DB.getCategories();

  select.innerHTML = '<option value="">Selecciona una categoría</option>' +
    categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');

  if (currentValue && categories.some(c => c.name === currentValue)) {
    select.value = currentValue;
  }
}

async function openCategoriesModal() {
  await renderCategoriesList();
  openModal('categoriesModal');
  setTimeout(() => document.getElementById('newCategoryName').focus(), 100);
}

async function renderCategoriesList() {
  const list = document.getElementById('categoryList');
  const categories = await DB.getCategories();

  if (categories.length === 0) {
    list.innerHTML = '<li class="category-list-empty">Aún no hay categorías</li>';
    return;
  }

  list.innerHTML = categories.map(c => `
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
  showToast('🗑️ Categoría eliminada');
  await renderCategoriesList();
  await renderCategoryOptions();
}

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) return;

  try {
    await DB.addCategory(name);
    input.value = '';
    showToast('✅ Categoría agregada');
    await renderCategoriesList();
    await renderCategoryOptions();
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