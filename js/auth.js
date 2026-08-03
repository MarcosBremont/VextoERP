/* ============================================
   VextoERP - Autenticación (Login + Registro)
   Conectado a Firebase Firestore
   ============================================ */

/* ============ CAMBIO DE PESTAÑAS (global) ============ */
function switchTab(tab) {
  const isLogin = tab === 'login';

  // Tabs
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const panelLogin = document.getElementById('panelLogin');
  const panelRegister = document.getElementById('panelRegister');

  if (tabLogin) tabLogin.classList.toggle('active', isLogin);
  if (tabRegister) tabRegister.classList.toggle('active', !isLogin);
  if (panelLogin) panelLogin.classList.toggle('active', isLogin);
  if (panelRegister) panelRegister.classList.toggle('active', !isLogin);

  // Limpiar errores
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.classList.remove('show');
    loginError.textContent = '';
  }

  // Enfocar primer campo
  setTimeout(() => {
    if (isLogin) {
      const el = document.getElementById('username');
      if (el) el.focus();
    } else {
      const el = document.getElementById('regName');
      if (el) el.focus();
    }
  }, 100);
}

document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión activa, redirigir directamente
  redirectIfLogged();

  /* ============ TOGGLE CONTRASEÑA (todos los campos) ============ */
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target') || 'password';
      const input = document.getElementById(targetId);
      if (!input) return;
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
      btn.textContent = type === 'password' ? '👁' : '🙈';
    });
  });

  /* ============ LOGIN ============ */
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      // Validación básica
      if (!username || !password) {
        showLoginError('Por favor ingresa tu usuario y contraseña.');
        return;
      }

      // Estado de carga
      loginBtn.disabled = true;
      loginBtnText.textContent = 'Ingresando...';

      try {
        const user = await DB.validateCredentials(username, password);

        if (user) {
          DB.setSession(user);
          hideLoginError();
          showToast('¡Bienvenido, ' + user.name + '!', 'success');
          setTimeout(() => {
            window.location.href = 'facturacion.html';
          }, 400);
        } else {
          loginBtn.disabled = false;
          loginBtnText.textContent = 'Ingresar';
          showLoginError('Usuario o contraseña incorrectos. Verifica tus datos.');
        }
      } catch (err) {
        console.error('Error en login:', err);
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Ingresar';
        showLoginError('Error de conexión con Firebase. Intenta de nuevo.');
      }
    });
  }

  /* ============ REGISTRO ============ */
  const registerForm = document.getElementById('registerForm');
  const registerBtn = document.getElementById('registerBtn');
  const registerBtnText = document.getElementById('registerBtnText');

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('regName').value.trim();
      const username = document.getElementById('regUsername').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;

      // Validaciones
      if (!name) {
        showLoginError('Por favor ingresa tu nombre completo.');
        return;
      }
      if (!username || username.length < 3) {
        showLoginError('El usuario debe tener al menos 3 caracteres.');
        return;
      }
      if (!password || password.length < 6) {
        showLoginError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        showLoginError('Las contraseñas no coinciden.');
        return;
      }

      // Estado de carga
      registerBtn.disabled = true;
      registerBtnText.textContent = 'Creando cuenta...';

      try {
        const result = await DB.registerUser({ name, username, password, role: 'Vendedor' });

        if (result.success) {
          // Auto-login con el nuevo usuario
          DB.setSession(result.user);
          hideLoginError();
          showToast('¡Cuenta creada! Bienvenido, ' + result.user.name, 'success');
          setTimeout(() => {
            window.location.href = 'facturacion.html';
          }, 600);
        } else {
          registerBtn.disabled = false;
          registerBtnText.textContent = 'Crear Cuenta';
          showLoginError(result.error);
        }
      } catch (err) {
        console.error('Error en registro:', err);
        registerBtn.disabled = false;
        registerBtnText.textContent = 'Crear Cuenta';
        showLoginError('Error de conexión con Firebase. Intenta de nuevo.');
      }
    });
  }

  /* ============ FUNCIONES AUXILIARES ============ */
  function showLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.classList.add('show');
  }

  function hideLoginError() {
    if (!loginError) return;
    loginError.classList.remove('show');
    loginError.textContent = '';
  }
});