/* ============================================
   VextoERP - Mi Perfil (datos de la cuenta propia)
   ============================================ */

let currentProfilePhoto = null; // dataURL (base64) de la foto actual del formulario

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  const session = DB.getSession();
  document.getElementById('profileName').value = session.name;
  document.getElementById('profileUsername').value = session.username;
  currentProfilePhoto = session.photo || null;
  renderProfilePhotoPreview();

  document.getElementById('profilePhotoInput').addEventListener('change', handleProfilePhotoSelected);
});

/* ============ FOTO DE PERFIL ============ */
async function handleProfilePhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Selecciona un archivo de imagen válido', 'error');
    e.target.value = '';
    return;
  }

  try {
    currentProfilePhoto = await resizeImageFile(file, 300, 0.8);
    renderProfilePhotoPreview();
  } catch (err) {
    showToast('No se pudo procesar la imagen', 'error');
  } finally {
    e.target.value = '';
  }
}

function removeProfilePhoto() {
  currentProfilePhoto = null;
  renderProfilePhotoPreview();
}

function renderProfilePhotoPreview() {
  const img = document.getElementById('profilePhotoImg');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('removeProfilePhotoBtn');

  if (currentProfilePhoto) {
    img.src = currentProfilePhoto;
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

/* ============ GUARDAR DATOS ============ */
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const session = DB.getSession();
  const name = document.getElementById('profileName').value.trim();
  const username = document.getElementById('profileUsername').value.trim();

  if (!name) {
    showToast('El nombre es obligatorio', 'error');
    return;
  }
  if (!username || username.length < 3) {
    showToast('El usuario debe tener al menos 3 caracteres', 'error');
    return;
  }

  try {
    const updated = await DB.updateProfile(session.id, { name, username, photo: currentProfilePhoto });
    DB.setSession({ ...session, ...updated });
    renderSidebarUser();
    showToast('✅ Perfil actualizado correctamente');
  } catch (err) {
    showToast(err.message || 'No se pudo guardar el perfil', 'error');
  }
});

/* ============ CAMBIAR CONTRASEÑA ============ */
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const session = DB.getSession();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  if (!currentPassword) {
    showToast('Ingresa tu contraseña actual', 'error');
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }
  if (newPassword !== confirmNewPassword) {
    showToast('Las contraseñas nuevas no coinciden', 'error');
    return;
  }

  const result = await DB.changePassword(session.id, currentPassword, newPassword);
  if (!result.success) {
    showToast(result.error || 'No se pudo cambiar la contraseña', 'error');
    return;
  }

  document.getElementById('passwordForm').reset();
  showToast('✅ Contraseña actualizada correctamente');
});
