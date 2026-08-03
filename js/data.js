/* ============================================
   VextoERP - Capa de Datos y Utilidades
   Conectado a Firebase Firestore
   CON FALLBACK a localStorage si Firebase falla
   ============================================ */

/* ---------- CONSTANTES ---------- */
const STORAGE_KEYS = {
  USERS: 'vexto_users',
  PRODUCTS: 'vexto_products',
  SALES: 'vexto_sales',
  SESSION: 'vexto_session',
  SALE_NUMBER: 'vexto_sale_number'
};

// Colecciones de Firestore
const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  SALES: 'sales',
  COUNTERS: 'counters'
};

/* ---------- UTILIDADES GENERALES ---------- */

// Escapar HTML para evitar inyección XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Formatear moneda (Peso Dominicano RD$)
function formatCurrency(amount) {
  return 'RD$ ' + Number(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Formatear fecha
function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(date) {
  const d = new Date(date);
  return d.toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ' ' + d.toLocaleTimeString('es-DO', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Generar ID único
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Leer datos del localStorage con validación
function readData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Error leyendo ' + key, e);
    return fallback;
  }
}

// Guardar datos en localStorage
function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Error guardando ' + key, e);
    return false;
  }
}

// Detectar si Firebase está disponible y tiene permisos
function isFirebaseAvailable() {
  return typeof firebase !== 'undefined' && typeof db !== 'undefined';
}

/* ============================================
   BASE DE DATOS (API de datos con Firebase)
   Con fallback automático a localStorage
   ============================================ */

const DB = {
  /* ============ USUARIOS ============ */
  async getUsers() {
    if (isFirebaseAvailable()) {
      try {
        const snapshot = await db.collection(COLLECTIONS.USERS).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }
    return readData(STORAGE_KEYS.USERS, []);
  },

  // Crear usuario por defecto si no existe (admin / admin123)
  async ensureDefaultUser() {
    if (isFirebaseAvailable()) {
      try {
        const snapshot = await db.collection(COLLECTIONS.USERS).get();
        if (snapshot.empty) {
          await db.collection(COLLECTIONS.USERS).add({
            name: 'Administrador',
            username: 'admin',
            password: 'admin123',
            role: 'Administrador',
            createdAt: new Date().toISOString()
          });
          console.log('✅ Usuario admin creado en Firebase');
        }
        return;
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const users = await this.getUsers();
    if (users.length === 0) {
      users.push({
        id: generateId(),
        name: 'Administrador',
        username: 'admin',
        password: 'admin123',
        role: 'Administrador',
        createdAt: new Date().toISOString()
      });
      saveData(STORAGE_KEYS.USERS, users);
      console.log('✅ Usuario admin creado en localStorage');
    }
  },

  async validateCredentials(username, password) {
    if (isFirebaseAvailable()) {
      try {
        const snapshot = await db.collection(COLLECTIONS.USERS)
          .where('username', '==', username.toLowerCase())
          .get();

        if (!snapshot.empty) {
          const user = snapshot.docs[0].data();
          if (user.password === password) {
            return { id: snapshot.docs[0].id, ...user };
          }
        }
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const users = await this.getUsers();
    return users.find(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
    ) || null;
  },

  // Registrar un nuevo usuario
  async registerUser(userData) {
    const username = userData.username.trim().toLowerCase();

    // Verificar duplicado
    if (isFirebaseAvailable()) {
      try {
        const existing = await db.collection(COLLECTIONS.USERS)
          .where('username', '==', username)
          .get();

        if (!existing.empty) {
          return { success: false, error: 'El nombre de usuario ya está registrado' };
        }

        // Crear en Firebase
        const docRef = await db.collection(COLLECTIONS.USERS).add({
          name: userData.name.trim(),
          username: username,
          password: userData.password,
          role: userData.role || 'Vendedor',
          createdAt: new Date().toISOString()
        });

        return {
          success: true,
          user: {
            id: docRef.id,
            name: userData.name.trim(),
            username: username,
            role: userData.role || 'Vendedor'
          }
        };
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const users = await this.getUsers();
    if (users.find(u => u.username.toLowerCase() === username)) {
      return { success: false, error: 'El nombre de usuario ya está registrado' };
    }

    const newUser = {
      id: generateId(),
      name: userData.name.trim(),
      username: username,
      password: userData.password,
      role: userData.role || 'Vendedor',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveData(STORAGE_KEYS.USERS, users);

    return {
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role
      }
    };
  },

  /* ============ SESIÓN ============ */
  getSession() {
    return readData(STORAGE_KEYS.SESSION, null);
  },

  setSession(user) {
    const sessionUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role
    };
    return saveData(STORAGE_KEYS.SESSION, sessionUser);
  },

  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  },

  /* ============ PRODUCTOS / INVENTARIO ============ */
  async getProducts() {
    if (isFirebaseAvailable()) {
      try {
        const snapshot = await db.collection(COLLECTIONS.PRODUCTS)
          .orderBy('createdAt', 'desc')
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }
    return readData(STORAGE_KEYS.PRODUCTS, []);
  },

  async addProduct(productData) {
    const newProduct = {
      id: generateId(),
      name: productData.name.trim(),
      description: (productData.description || '').trim(),
      category: productData.category.trim(),
      price: parseFloat(productData.price) || 0,
      cost: productData.cost ? parseFloat(productData.cost) : null,
      stock: parseInt(productData.stock, 10) || 0,
      minStock: parseInt(productData.minStock, 10) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseAvailable()) {
      try {
        const { id, ...data } = newProduct;
        const docRef = await db.collection(COLLECTIONS.PRODUCTS).add(data);
        return { id: docRef.id, ...data };
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const products = await this.getProducts();
    products.push(newProduct);
    saveData(STORAGE_KEYS.PRODUCTS, products);
    return newProduct;
  },

  async updateProduct(id, productData) {
    const updatedData = {
      name: productData.name.trim(),
      description: (productData.description || '').trim(),
      category: productData.category.trim(),
      price: parseFloat(productData.price) || 0,
      cost: productData.cost ? parseFloat(productData.cost) : null,
      stock: parseInt(productData.stock, 10) || 0,
      minStock: parseInt(productData.minStock, 10) || 0,
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseAvailable()) {
      try {
        await db.collection(COLLECTIONS.PRODUCTS).doc(id).update(updatedData);
        return { id, ...updatedData };
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const products = await this.getProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return null;
    products[index] = { ...products[index], ...updatedData };
    saveData(STORAGE_KEYS.PRODUCTS, products);
    return products[index];
  },

  async deleteProduct(id) {
    if (isFirebaseAvailable()) {
      try {
        await db.collection(COLLECTIONS.PRODUCTS).doc(id).delete();
        return true;
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const products = await this.getProducts();
    const filtered = products.filter(p => p.id !== id);
    saveData(STORAGE_KEYS.PRODUCTS, filtered);
    return true;
  },

  // Descontar stock (al vender)
  async decreaseStock(productId, quantity) {
    if (isFirebaseAvailable()) {
      try {
        const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(productId);

        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(productRef);
          if (!doc.exists) {
            throw new Error('Producto no encontrado');
          }
          const product = doc.data();
          if (product.stock < quantity) {
            throw new Error('Stock insuficiente');
          }
          transaction.update(productRef, {
            stock: product.stock - quantity,
            updatedAt: new Date().toISOString()
          });
        });

        return { success: true };
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const products = await this.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return { success: false, error: 'Producto no encontrado' };
    if (product.stock < quantity) return { success: false, error: 'Stock insuficiente' };

    product.stock -= quantity;
    product.updatedAt = new Date().toISOString();
    saveData(STORAGE_KEYS.PRODUCTS, products);
    return { success: true };
  },

  async getLowStockProducts() {
    const products = await this.getProducts();
    return products.filter(p => p.stock <= p.minStock);
  },

  async getTotalProducts() {
    const products = await this.getProducts();
    return products.length;
  },

  async getTotalUnits() {
    const products = await this.getProducts();
    return products.reduce((sum, p) => sum + p.stock, 0);
  },

  async getInventoryValue() {
    const products = await this.getProducts();
    return products.reduce((sum, p) => sum + (p.stock * (p.cost || p.price || 0)), 0);
  },

  getStockStatus(stock, minStock) {
    if (stock <= 0) return { text: 'Sin stock', cls: 'badge-danger' };
    if (stock <= minStock) return { text: 'Stock bajo', cls: 'badge-warning' };
    return { text: 'Disponible', cls: 'badge-success' };
  },

  /* ============ VENTAS / FACTURACIÓN ============ */
  async getSales() {
    if (isFirebaseAvailable()) {
      try {
        const snapshot = await db.collection(COLLECTIONS.SALES)
          .orderBy('date', 'desc')
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }
    return readData(STORAGE_KEYS.SALES, []);
  },

  async getNextSaleNumber() {
    if (isFirebaseAvailable()) {
      try {
        const counterRef = db.collection(COLLECTIONS.COUNTERS).doc('saleNumber');
        const result = await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(counterRef);
          const current = doc.exists ? doc.data().value : 0;
          const next = current + 1;
          transaction.set(counterRef, { value: next });
          return next;
        });
        return String(result).padStart(4, '0');
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const current = readData(STORAGE_KEYS.SALE_NUMBER, 1);
    const next = current;
    saveData(STORAGE_KEYS.SALE_NUMBER, current + 1);
    return String(next).padStart(4, '0');
  },

  // Registrar una venta (con descuento de stock)
  async registerSale(cartItems, options = {}) {
    if (!cartItems || cartItems.length === 0) {
      return { success: false, error: 'El carrito está vacío' };
    }

    // Validar stock primero
    const products = await this.getProducts();
    for (const item of cartItems) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        return { success: false, error: 'Producto no encontrado: ' + item.name };
      }
      if (product.stock < item.quantity) {
        return {
          success: false,
          error: 'Stock insuficiente para: ' + item.name +
                 ' (disponible: ' + product.stock + ', solicitado: ' + item.quantity + ')'
        };
      }
    }

    // Descontar stock de todos
    for (const item of cartItems) {
      await this.decreaseStock(item.productId, item.quantity);
    }

    // Crear registro de venta
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const session = this.getSession();

    const saleType = options.saleType === 'Credito' ? 'Credito' : 'Contado';
    const requestedInitialPayment = Number(options.initialPayment || 0);
    const paidAmount = saleType === 'Credito'
      ? Math.min(Math.max(requestedInitialPayment, 0), total)
      : total;
    const pendingBalance = Math.max(total - paidAmount, 0);

    const saleData = {
      id: generateId(),
      number: await this.getNextSaleNumber(),
      items: cartItems.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity
      })),
      total,
      paymentMethod: saleType === 'Credito' ? 'Crédito' : (options.paymentMethod || 'Efectivo'),
      saleType,
      customerName: (options.customerName || '').trim() || 'Cliente general',
      customerPhone: (options.customerPhone || '').trim(),
      orderReference: (options.orderReference || '').trim(),
      dueDate: saleType === 'Credito' ? (options.dueDate || null) : null,
      notes: (options.notes || '').trim(),
      paidAmount,
      pendingBalance,
      paymentStatus: pendingBalance > 0 ? 'Pendiente' : 'Pagada',
      date: new Date().toISOString(),
      sellerId: session ? session.id : null,
      sellerName: session ? session.name : '—'
    };

    // Guardar en Firebase o localStorage
    if (isFirebaseAvailable()) {
      try {
        const { id, ...data } = saleData;
        const docRef = await db.collection(COLLECTIONS.SALES).add(data);
        return { success: true, sale: { id: docRef.id, ...data } };
      } catch (e) {
        console.warn('Firebase bloqueado, usando localStorage:', e.message);
      }
    }

    // Fallback: localStorage
    const sales = await this.getSales();
    sales.push(saleData);
    saveData(STORAGE_KEYS.SALES, sales);
    return { success: true, sale: saleData };
  },

  async getTotalSales() {
    const sales = await this.getSales();
    return {
      count: sales.length,
      total: sales.reduce((sum, s) => sum + s.total, 0)
    };
  },

  async getTodaySales() {
    const sales = await this.getSales();
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
    return {
      count: todaySales.length,
      total: todaySales.reduce((sum, s) => sum + s.total, 0)
    };
  }
};

/* ---------- UTILIDADES UI ---------- */

// Sistema de notificaciones (toast)
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠'
  };

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toast);

  // Auto-remover después de 3.5 segundos
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Abrir modal
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

// Cerrar modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Esc para cerrar modales
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// Cerrar modal al hacer clic fuera
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

/* ---------- PROTECCIÓN DE RUTAS ---------- */

// Verificar autenticación
function requireAuth() {
  const session = DB.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// Si ya está logueado, ir al panel
function redirectIfLogged() {
  const session = DB.getSession();
  if (session && window.location.pathname.endsWith('index.html')) {
    window.location.href = 'facturacion.html';
  }
}

// Cerrar sesión
function logout() {
  DB.clearSession();
  window.location.href = 'index.html';
}

// Mostrar info el usuario en la sidebar
function renderSidebarUser() {
  const session = DB.getSession();
  if (!session) return;

  document.querySelectorAll('.user-name').forEach(el => el.textContent = session.name);
  document.querySelectorAll('.user-role').forEach(el => el.textContent = session.role);
  document.querySelectorAll('.user-avatar').forEach(el => {
    el.textContent = session.name.charAt(0).toUpperCase();
  });
}

// Fecha actual en la topbar
function renderTopbarDate() {
  const today = new Date().toLocaleDateString('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  document.querySelectorAll('.topbar-date').forEach(el => {
    el.textContent = today.charAt(0).toUpperCase() + today.slice(1);
  });
}

// Menú móvil
function setupMobileMenu() {
  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
  });

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.remove('open');
    });
  });
}

/* ---------- SEMBRAR DATOS DE EJEMPLO ---------- */
// Añadir productos de ejemplo si el inventario está vacío (primera visita)
async function seedSampleData() {
  const products = await DB.getProducts();
  if (products.length > 0) return;

  const sampleProducts = [
    { name: 'Crema Hidratante', description: 'Hidratación profunda 24h', category: 'Cuidado Personal', price: 12.50, cost: 6.00, stock: 50, minStock: 10 },
    { name: 'Shampoo Volumen', description: 'Para cabello fino', category: 'Cabello', price: 8.90, cost: 4.00, stock: 30, minStock: 15 },
    { name: 'Jabón de Manos', description: 'Con aloe vera', category: 'Higiene', price: 3.50, cost: 1.50, stock: 100, minStock: 20 },
    { name: 'Loción Tanante', description: 'Protección solar SPF 30', category: 'Cuidado Personal', price: 15.00, cost: 8.00, stock: 5, minStock: 10 },
    { name: 'Perfume Aventura', description: 'Fragancia masculina', category: 'Fragancias', price: 25.00, cost: 12.00, stock: 0, minStock: 5 }
  ];

  for (const product of sampleProducts) {
    await DB.addProduct(product);
  }
  console.log('✅ Datos de ejemplo cargados en el inventario');
}

/* ---------- INIT ---------- */
// Asegurar usuario por defecto al cargar cualquier página
DB.ensureDefaultUser();