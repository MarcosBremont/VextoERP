/* ============================================
   VextoERP - Mi Equipo (miembros del negocio)
   ============================================ */

let teamMembers = [];
let removeTeamMemberId = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  // Solo el dueño del negocio administra el equipo
  const session = DB.getSession();
  if (!isBusinessOwner(session)) {
    showToast('No tienes permiso para acceder a esta sección', 'error');
    window.location.href = 'facturacion.html';
    return;
  }

  renderSidebarUser();
  renderTopbarDate();
  setupMobileMenu();

  document.getElementById('businessCodeInput').value = session.businessId;

  await loadTeamData();
});

async function loadTeamData() {
  try {
    teamMembers = await DB.getTeamMembers();
    renderTeamTable();
  } catch (e) {
    console.error('Error cargando el equipo:', e);
    showToast('No se pudo cargar el equipo', 'error');
  }
}

function renderTeamTable() {
  const tbody = document.getElementById('teamTableBody');
  const session = DB.getSession();

  tbody.innerHTML = teamMembers.map(member => {
    const isOwner = member.id === session.businessId;
    const isSelf = member.id === session.id;

    return `
      <tr>
        <td>
          <div class="product-main">${escapeHtml(member.name)}${isSelf ? ' <span style="color:var(--gray-400); font-weight:400;">(tú)</span>' : ''}</div>
        </td>
        <td>${escapeHtml(member.username)}</td>
        <td><span class="badge ${isOwner ? 'badge-indigo' : 'badge-success'}">${escapeHtml(member.role)}</span></td>
        <td>${member.createdAt ? formatDate(member.createdAt) : '—'}</td>
        <td>
          <div class="actions-cell">
            ${isOwner
              ? '<span style="color:var(--gray-300); font-size:0.8rem;">Dueño del negocio</span>'
              : `<button class="btn-icon delete-btn" onclick="openRemoveTeamMemberModal('${member.id}')" title="Quitar acceso">🗑️</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function copyBusinessCode() {
  const input = document.getElementById('businessCodeInput');
  input.select();
  navigator.clipboard.writeText(input.value)
    .then(() => showToast('✅ Código copiado al portapapeles'))
    .catch(() => showToast('No se pudo copiar automáticamente, selecciónalo y cópialo', 'warning'));
}

function openRemoveTeamMemberModal(memberId) {
  removeTeamMemberId = memberId;
  const member = teamMembers.find(m => m.id === memberId);
  document.getElementById('removeTeamMemberName').textContent = member ? member.name : 'este miembro';
  openModal('removeTeamMemberModal');
}

async function confirmRemoveTeamMember() {
  if (!removeTeamMemberId) return;

  const result = await DB.removeTeamMember(removeTeamMemberId);
  removeTeamMemberId = null;
  closeModal('removeTeamMemberModal');

  if (!result.success) {
    showToast(result.error || 'No se pudo quitar el acceso', 'error');
    return;
  }

  showToast('🗑️ Acceso revocado');
  await loadTeamData();
}
