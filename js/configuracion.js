/* ============================================
   VextoERP - Configuración de Empresa
   ============================================ */

let currentCompanyLogo = null; // dataURL (base64) del logo actual del formulario

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  // Solo el dueño del negocio puede personalizar la cuenta compartida
  if (!isBusinessOwner(DB.getSession())) {
    showToast('No tienes permiso para acceder a esta sección', 'error');
    window.location.href = 'facturacion.html';
    return;
  }

  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  document.getElementById('companyLogoInput').addEventListener('change', handleCompanyLogoSelected);

  await loadCompanySettings();
});

async function loadCompanySettings() {
  try {
    const settings = await DB.getCompanySettings();
    if (settings) {
      document.getElementById('businessName').value = settings.businessName || '';
      document.getElementById('businessTaxId').value = settings.taxId || '';
      document.getElementById('businessPhone').value = settings.phone || '';
      document.getElementById('businessAddress').value = settings.address || '';
      document.getElementById('businessEmail').value = settings.email || '';
      document.getElementById('receiptFooter').value = settings.receiptFooter || '';
      currentCompanyLogo = settings.logo || null;
    }
    renderCompanyLogoPreview();
  } catch (e) {
    console.error('Error cargando la configuración:', e);
    showToast('No se pudo cargar la configuración de la empresa', 'error');
  }
}

/* ============ LOGO DEL NEGOCIO ============ */
async function handleCompanyLogoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Selecciona un archivo de imagen válido', 'error');
    e.target.value = '';
    return;
  }

  try {
    currentCompanyLogo = await resizeImageFile(file, 400, 0.8);
    renderCompanyLogoPreview();
  } catch (err) {
    showToast('No se pudo procesar la imagen', 'error');
  } finally {
    e.target.value = '';
  }
}

function removeCompanyLogo() {
  currentCompanyLogo = null;
  renderCompanyLogoPreview();
}

function renderCompanyLogoPreview() {
  const img = document.getElementById('companyLogoImg');
  const placeholder = document.getElementById('companyLogoPlaceholder');
  const removeBtn = document.getElementById('removeLogoBtn');

  if (currentCompanyLogo) {
    img.src = currentCompanyLogo;
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

/* ============ GUARDAR ============ */
document.getElementById('companyForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const businessName = document.getElementById('businessName').value.trim();
  if (!businessName) {
    showToast('El nombre del negocio es obligatorio', 'error');
    return;
  }

  const settingsData = {
    businessName,
    taxId: document.getElementById('businessTaxId').value.trim(),
    phone: document.getElementById('businessPhone').value.trim(),
    address: document.getElementById('businessAddress').value.trim(),
    email: document.getElementById('businessEmail').value.trim(),
    receiptFooter: document.getElementById('receiptFooter').value.trim(),
    logo: currentCompanyLogo
  };

  try {
    await DB.saveCompanySettings(settingsData);
    showToast('✅ Configuración guardada correctamente');
    await applyCompanyBranding();
  } catch (err) {
    showToast(err.message || 'No se pudo guardar la configuración', 'error');
  }
});
