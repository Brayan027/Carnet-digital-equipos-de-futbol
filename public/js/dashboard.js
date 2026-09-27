/**
 * Controlador Principal del Sistema de Carnets Digitales & Torneo (Mobile-First)
 */

const State = {
    user: null,
    token: localStorage.getItem('torneo_token') || null,
    masterToken: sessionStorage.getItem('torneo_master_token') || null,
    subscription: null,
    tournament: { name: 'TORNEO SAN ANTONIO', edition: '2026' },
    teams: [],
    players: [],
    users: [],
    activeTab: 'tabCarnets',
    html5QrScanner: null
};

// SVG Escudo oficial con balón de fútbol
const SHIELD_SVG = `
<svg class="carnet-shield" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 8 L85 22 V55 C85 75 50 92 50 92 C50 92 15 75 15 55 V22 Z" fill="#ffffff" stroke="#111111" stroke-width="6"/>
  <circle cx="50" cy="50" r="23" fill="#ffffff" stroke="#111111" stroke-width="4.5"/>
  <polygon points="50,41 57,46 54,54 46,54 43,46" fill="#111111"/>
  <line x1="50" y1="41" x2="50" y2="28" stroke="#111111" stroke-width="3.5"/>
  <line x1="57" y1="46" x2="69" y2="43" stroke="#111111" stroke-width="3.5"/>
  <line x1="54" y1="54" x2="63" y2="65" stroke="#111111" stroke-width="3.5"/>
  <line x1="46" y1="54" x2="37" y2="65" stroke="#111111" stroke-width="3.5"/>
  <line x1="43" y1="46" x2="31" y2="43" stroke="#111111" stroke-width="3.5"/>
</svg>`;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar estado de suscripción y bloqueo en tiempo real
    await checkSubscriptionStatus();

    // 2. Si no hay token, intentar auto-login como organizador para facilidad de uso
    if (!State.token) {
        await tryAutoLogin('organizador@torneo.com', 'admin123');
    } else {
        await fetchCurrentUser();
    }

    await loadTournament();
    await loadTeams();
    await loadPlayers();
    setupNavigation();
    setupEventHandlers();
    setupSubscriptionHandlers();
    updateUI();
});

// Auto login de conveniencia
async function tryAutoLogin(email, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            const data = await res.json();
            State.token = data.token;
            State.user = data.user;
            localStorage.setItem('torneo_token', data.token);
        }
    } catch (e) {
        console.error('Error auto-login:', e);
    }
}

async function fetchCurrentUser() {
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${State.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            State.user = data.user;
        } else {
            State.token = null;
            State.user = null;
            localStorage.removeItem('torneo_token');
        }
    } catch (e) {
        console.error(e);
    }
}

// Cargar Torneo
async function loadTournament() {
    try {
        const res = await fetch('/api/tournament');
        if (res.ok) {
            const data = await res.json();
            if (data.tournament) {
                State.tournament = data.tournament;
                const headerTitle = document.getElementById('appHeaderTitle');
                if (headerTitle) headerTitle.textContent = State.tournament.name;
                const mobileHeaderTitle = document.getElementById('mobileHeaderTitle');
                if (mobileHeaderTitle) mobileHeaderTitle.textContent = State.tournament.name;
                document.getElementById('cfgTrnName').value = State.tournament.name;
                document.getElementById('cfgTrnEdition').value = State.tournament.edition || '';
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// Cargar Equipos
async function loadTeams() {
    try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        State.teams = data.teams || [];

        renderTeamsDropdowns();
        renderTeamsGrid();
    } catch (e) {
        console.error('Error cargando equipos:', e);
    }
}

// Cargar Jugadores
async function loadPlayers() {
    try {
        const teamId = document.getElementById('carnetTeamFilter').value || '';
        const res = await fetch(`/api/players?team_id=${encodeURIComponent(teamId)}`);
        const data = await res.json();
        State.players = data.players || [];

        renderCarnetsGrid();
        renderPlayersList();
        updatePendingBadge();
    } catch (e) {
        console.error('Error cargando jugadores:', e);
    }
}

// ========================================================
// 1. CARNETS DIGITALES - TARJETAS OFICIALES CON QR
// ========================================================
function renderCarnetsGrid() {
    const grid = document.getElementById('carnetsGridDisplay');
    const verifiedPlayers = State.players.filter(p => p.status === 'VERIFIED');

    if (verifiedPlayers.length === 0) {
        grid.innerHTML = `
            <div class="col-span-3 text-center py-12 text-slate-400">
                <p class="text-sm font-bold text-slate-600 mb-1">No hay carnets activos en este equipo.</p>
                <p class="text-xs">Los jugadores deben ser aprobados en la pestaña "Aprobaciones" para que su carnet esté habilitado.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = verifiedPlayers.map(p => createCarnetCardHTML(p)).join('');
}

function createCarnetCardHTML(player) {
    const trnName = State.tournament.name || 'TORNEO SAN ANTONIO';
    const photoSrc = player.photo_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    const qrSrc = player.qr_code_image || '';
    const carnetUrl = `/carnet.html?token=${player.qr_code_token}`;

    return `
        <div class="bg-white rounded-2xl border-2 border-slate-900 shadow-md overflow-hidden flex flex-col justify-between">
            <!-- Carnet idéntico a la referencia -->
            <div>
                <!-- Cabecera de mármol con escudo y nombre de torneo -->
                <div class="carnet-header">
                    ${SHIELD_SVG}
                    <div class="carnet-tournament-title">${escapeHTML(trnName)}</div>
                </div>

                <!-- Cuerpo del carnet -->
                <div class="carnet-body">
                    <div class="carnet-photo-container">
                        <img src="${photoSrc}" class="carnet-photo" alt="Foto">
                    </div>

                    <div class="carnet-info">
                        <div class="carnet-team-row">
                            <span class="carnet-team-label">EQUIPO:</span>
                            <span class="carnet-team-name">${escapeHTML(player.team_name || 'Sin Equipo')}</span>
                        </div>

                        <div class="carnet-name-block">
                            <span class="carnet-name-label">NOMBRE:</span>
                            <div class="carnet-player-name">${escapeHTML(player.full_name)}</div>
                        </div>

                        ${player.dorsal ? `<div class="text-[11px] font-bold text-slate-700">DORSAL: #${escapeHTML(player.dorsal)}</div>` : ''}
                    </div>

                    <!-- Código QR para escaneo y validación en cancha -->
                    <div class="carnet-qr-box cursor-pointer" onclick="openCarnetModal('${player.id}')" title="Toca para ver el carnet en grande">
                        ${qrSrc ? `<img src="${qrSrc}" alt="QR">` : ''}
                        <span class="carnet-qr-label">VALIDAR</span>
                    </div>
                </div>
            </div>

            <!-- Barra inferior para editar o ver carnet en pantalla -->
            <div class="bg-slate-50 border-t border-slate-200 px-3 py-2 flex items-center justify-between">
                <span class="text-[10px] font-mono font-bold text-slate-500">${player.qr_code_token}</span>
                <div class="flex items-center gap-1.5">
                    <button onclick="openEditPlayerModal('${player.id}')" class="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm transition active:scale-95" title="Editar datos del carnet">
                        <span>✏️</span>
                        <span>Editar</span>
                    </button>
                    <button onclick="openCarnetModal('${player.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm transition active:scale-95" title="Ver carnet digital">
                        <span>🪪 Ver</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ========================================================
// 2. BANDEJA DE APROBACIONES & JUGADORES
// ========================================================
function renderPlayersList() {
    const container = document.getElementById('playersListCards');
    const filterStatus = document.getElementById('playerStatusFilter').value;
    const search = document.getElementById('playerSearchInput').value.toLowerCase().trim();

    const filtered = State.players.filter(p => {
        const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
        const matchesSearch = !search || 
            p.full_name.toLowerCase().includes(search) || 
            (p.team_name && p.team_name.toLowerCase().includes(search)) ||
            (p.document_number && p.document_number.includes(search));
        return matchesStatus && matchesSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center py-10 text-slate-400 text-xs">No hay jugadores registrados en este filtro.</div>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const photoSrc = p.photo_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
        
        let statusBadge = '';
        let reviewActions = '';

        if (p.status === 'PENDING') {
            statusBadge = `<span class="bg-amber-100 text-amber-900 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-300">⚠️ PENDIENTE DE APROBACIÓN</span>`;
            reviewActions = `
                <div class="flex gap-2 pt-2 border-t border-slate-100">
                    <button onclick="updatePlayerStatus('${p.id}', 'VERIFIED')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black py-2 rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-1">
                        <span>✓</span>
                        <span>Aprobar</span>
                    </button>
                    <button onclick="openEditPlayerModal('${p.id}')" class="bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-bold py-2 px-3 rounded-xl transition flex items-center gap-1">
                        <span>✏️ Editar</span>
                    </button>
                    <button onclick="updatePlayerStatus('${p.id}', 'REJECTED')" class="bg-rose-100 text-rose-700 hover:bg-rose-200 text-xs font-bold py-2 px-3 rounded-xl transition">
                        ✕ Rechazar
                    </button>
                </div>
            `;
        } else if (p.status === 'VERIFIED') {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">✅ Aprobado / Habilitado</span>`;
            reviewActions = `
                <div class="flex justify-between items-center pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <button onclick="openCarnetModal('${p.id}')" class="text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1 cursor-pointer">
                        <span>🪪 Ver Carnet</span>
                    </button>
                    <div class="flex items-center gap-3">
                        <button onclick="openEditPlayerModal('${p.id}')" class="text-amber-600 hover:text-amber-800 font-bold flex items-center gap-1">
                            <span>✏️ Editar</span>
                        </button>
                        <button onclick="deletePlayer('${p.id}')" class="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                </div>
            `;
        } else {
            statusBadge = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">❌ Rechazado</span>`;
            reviewActions = `
                <div class="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                    <button onclick="updatePlayerStatus('${p.id}', 'VERIFIED')" class="text-emerald-600 font-bold hover:underline">Re-Aprobar</button>
                    <div class="flex items-center gap-3">
                        <button onclick="openEditPlayerModal('${p.id}')" class="text-amber-600 hover:text-amber-800 font-bold flex items-center gap-1">
                            <span>✏️ Editar</span>
                        </button>
                        <button onclick="deletePlayer('${p.id}')" class="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between space-y-3 ${p.status === 'PENDING' ? 'ring-2 ring-amber-400 bg-amber-50/20' : ''}">
                <div class="flex items-center gap-3">
                    <div class="w-16 h-20 rounded-xl bg-slate-100 border-2 border-slate-300 overflow-hidden flex-shrink-0 shadow-inner cursor-pointer hover:opacity-90 transition" onclick="openCarnetModal('${p.id}')" title="Toca para ver el carnet">
                        <img src="${photoSrc}" class="w-full h-full object-cover" alt="">
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            ${statusBadge}
                        </div>
                        <h4 class="font-extrabold text-sm text-slate-900 truncate cursor-pointer hover:text-blue-600 transition" onclick="openCarnetModal('${p.id}')" title="Toca para ver el carnet">${escapeHTML(p.full_name)}</h4>
                        <p class="text-xs text-slate-700 font-semibold truncate">🛡️ ${escapeHTML(p.team_name || 'Sin Equipo')}</p>
                        <p class="text-[11px] text-slate-500">Dorsal: <strong>#${p.dorsal || '-'}</strong> | Doc: ${p.document_number || '-'}</p>
                        ${p.rejection_reason ? `<p class="text-[10px] text-rose-600 font-semibold mt-1">Motivo: ${escapeHTML(p.rejection_reason)}</p>` : ''}
                    </div>
                </div>

                ${reviewActions}
            </div>
        `;
    }).join('');
}

async function updatePlayerStatus(playerId, newStatus) {
    let rejectionReason = null;
    if (newStatus === 'REJECTED') {
        rejectionReason = prompt('Motivo del rechazo (ej. Foto borrosa, jugador registrado en otro equipo):');
        if (rejectionReason === null) return;
    }

    try {
        const res = await fetch(`/api/players/${playerId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${State.token}`
            },
            body: JSON.stringify({ status: newStatus, rejection_reason: rejectionReason })
        });

        if (res.ok) {
            await loadPlayers();
        } else {
            const data = await res.json();
            alert(data.error || 'Error al actualizar estado.');
        }
    } catch (e) {
        alert(e.message);
    }
}

function deletePlayer(playerId) {
    alertify.confirm(
        'Eliminar Jugador',
        '¿Deseas eliminar permanentemente la ficha de este jugador? Esta acción no se puede deshacer.',
        async () => {
            try {
                const res = await fetch(`/api/players/${playerId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${State.token}` }
                });
                if (res.ok) {
                    alertify.success('Jugador eliminado correctamente.');
                    await loadPlayers();
                } else {
                    const data = await res.json();
                    alertify.error(data.error || 'No se pudo eliminar el jugador.');
                }
            } catch (e) {
                alertify.error(e.message);
            }
        },
        () => {}
    );
}

let currentModalCarnetPlayer = null;

function openCarnetModal(playerId) {
    const player = State.players.find(p => p.id === playerId || p.qr_code_token === playerId);
    if (!player) return;

    currentModalCarnetPlayer = player;
    const trnName = State.tournament.name || 'TORNEO SAN ANTONIO';
    const photoSrc = player.photo_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    const carnetUrl = `${window.location.origin}/carnet.html?token=${player.qr_code_token}`;
    const qrSrc = player.qr_code_image || `/api/qr?data=${encodeURIComponent(carnetUrl)}`;

    const titleEl = document.getElementById('modalCarnetTournament');
    if (titleEl) titleEl.textContent = trnName;

    const photoEl = document.getElementById('modalCarnetPhoto');
    if (photoEl) photoEl.src = photoSrc;

    const nameEl = document.getElementById('modalCarnetName');
    if (nameEl) nameEl.textContent = player.full_name;

    const teamEl = document.getElementById('modalCarnetTeam');
    if (teamEl) teamEl.textContent = player.team_name || 'Sin Equipo';

    const dorsalBadge = document.getElementById('modalCarnetDorsalBadge');
    if (dorsalBadge) {
        if (player.dorsal) {
            dorsalBadge.textContent = `#${player.dorsal}`;
            dorsalBadge.classList.remove('hidden');
        } else {
            dorsalBadge.classList.add('hidden');
        }
    }

    const docTypeEl = document.getElementById('modalCarnetDocType');
    if (docTypeEl) docTypeEl.textContent = player.document_type || 'CC';

    const docNumEl = document.getElementById('modalCarnetDocNumber');
    if (docNumEl) docNumEl.textContent = player.document_number || 'S/N';

    const posBlock = document.getElementById('modalCarnetPositionBlock');
    const posEl = document.getElementById('modalCarnetPosition');
    if (posBlock && posEl) {
        if (player.position) {
            posEl.textContent = player.position;
            posBlock.classList.remove('hidden');
        } else {
            posBlock.classList.add('hidden');
        }
    }

    const statusEl = document.getElementById('modalCarnetStatus');
    const statusTextEl = document.getElementById('modalCarnetStatusText');
    const statusIconEl = document.getElementById('modalCarnetStatusIcon');
    if (statusEl && statusTextEl) {
        if (player.status === 'VERIFIED') {
            statusEl.className = 'bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider py-1 text-center flex items-center justify-center gap-1 shadow-sm';
            statusTextEl.textContent = 'JUGADOR HABILITADO';
            if (statusIconEl) statusIconEl.textContent = '✓';
        } else if (player.status === 'PENDING') {
            statusEl.className = 'bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider py-1 text-center flex items-center justify-center gap-1 shadow-sm';
            statusTextEl.textContent = 'PENDIENTE DE REVISIÓN';
            if (statusIconEl) statusIconEl.textContent = '⚠️';
        } else {
            statusEl.className = 'bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider py-1 text-center flex items-center justify-center gap-1 shadow-sm';
            statusTextEl.textContent = 'RECHAZADO / NO HABILITADO';
            if (statusIconEl) statusIconEl.textContent = '✕';
        }
    }

    const qrImg = document.getElementById('modalCarnetQrImg');
    if (qrImg) qrImg.src = qrSrc;

    const tokenEl = document.getElementById('modalCarnetToken');
    if (tokenEl) tokenEl.textContent = player.qr_code_token;

    const copyText = document.getElementById('btnModalCarnetCopyText');
    if (copyText) copyText.textContent = 'Copiar Enlace';

    const modal = document.getElementById('modalViewCarnet');
    if (modal) modal.classList.remove('hidden');
}

function closeCarnetModal() {
    const modal = document.getElementById('modalViewCarnet');
    if (modal) modal.classList.add('hidden');
    currentModalCarnetPlayer = null;
}

function openEditPlayerModal(playerId) {
    const player = State.players.find(p => p.id === playerId);
    if (!player) return;

    // Poblar select de equipos
    const teamSelect = document.getElementById('editPlayerTeamSelect');
    teamSelect.innerHTML = `<option value="">(Sin Equipo)</option>` +
        State.teams.map(t => `<option value="${t.id}" ${t.id === player.team_id ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('');

    // Prellenar campos
    document.getElementById('editPlayerId').value = player.id;
    document.getElementById('editPlayerFullName').value = player.full_name || '';
    document.getElementById('editPlayerDorsal').value = player.dorsal || '';
    document.getElementById('editPlayerPosition').value = player.position || '';
    document.getElementById('editPlayerDocType').value = player.document_type || 'CC';
    document.getElementById('editPlayerDocNumber').value = player.document_number || '';
    document.getElementById('editPlayerPhone').value = player.phone || '';
    document.getElementById('editPlayerStatus').value = player.status || 'VERIFIED';

    const photoPreview = document.getElementById('editPlayerPhotoPreview');
    photoPreview.src = player.photo_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

    const photoInput = document.getElementById('editPlayerPhotoInput');
    if (photoInput) photoInput.value = '';

    document.getElementById('modalEditPlayer').classList.remove('hidden');
}

function updatePendingBadge() {
    const pendingCount = State.players.filter(p => p.status === 'PENDING').length;
    const badge = document.getElementById('pendingCountBadge');
    const alertBox = document.getElementById('pendingAlertBox');
    const alertCount = document.getElementById('pendingAlertCount');

    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.classList.remove('hidden');
        alertCount.textContent = pendingCount;
        alertBox.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        alertBox.classList.add('hidden');
    }
}

// ========================================================
// 3. GESTIÓN DE EQUIPOS
// ========================================================
function renderTeamsGrid() {
    const container = document.getElementById('teamsGridContainer');
    if (State.teams.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center py-10 text-slate-400 text-xs">No hay equipos registrados.</div>`;
        return;
    }

    container.innerHTML = State.teams.map(t => {
        const logo = t.logo_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%231e3a8a'%3E%3Cpath d='M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z'/%3E%3C/svg%3E";
        return `
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center overflow-hidden">
                        <img src="${logo}" class="w-full h-full object-contain" alt="">
                    </div>
                    <div>
                        <h4 class="font-extrabold text-sm text-slate-900">${escapeHTML(t.name)}</h4>
                        <p class="text-xs text-slate-500">${t.player_count || 0} jugadores inscritos</p>
                        ${t.delegate_name ? `<p class="text-[11px] text-slate-400">DT: ${escapeHTML(t.delegate_name)}</p>` : ''}
                    </div>
                </div>

                <div>
                    <button onclick="deleteTeam('${t.id}')" class="text-rose-600 hover:text-rose-800 text-xs font-semibold p-2">
                        ✕
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTeamsDropdowns() {
    const carnetFilter = document.getElementById('carnetTeamFilter');
    const playerModalSelect = document.getElementById('modalPlayerTeamSelect');

    const opts = `<option value="">Todos los Equipos</option>` +
        State.teams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');

    carnetFilter.innerHTML = opts;
    playerModalSelect.innerHTML = State.teams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
}

function deleteTeam(teamId) {
    alertify.confirm(
        'Eliminar Equipo',
        '¿Eliminar equipo? Los jugadores asignados quedarán sin equipo.',
        async () => {
            try {
                const res = await fetch(`/api/teams/${teamId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${State.token}` }
                });
                if (res.ok) {
                    alertify.success('Equipo eliminado.');
                    await loadTeams();
                    await loadPlayers();
                } else {
                    const data = await res.json();
                    alertify.error(data.error || 'No se pudo eliminar el equipo.');
                }
            } catch (e) {
                alertify.error(e.message);
            }
        },
        () => {}
    );
}

// ========================================================
// 4. ESCÁNER QR EN VIVO (CÁMARA DEL CELULAR EN CANCHA)
// ========================================================
function initQrScanner() {
    const btnStart = document.getElementById('btnStartScanner');
    const btnStop = document.getElementById('btnStopScanner');
    const resultBox = document.getElementById('scanResultBox');

    btnStart.addEventListener('click', async () => {
        try {
            State.html5QrScanner = new Html5Qrcode("qrReaderContainer");
            btnStart.classList.add('hidden');
            btnStop.classList.remove('hidden');
            resultBox.classList.add('hidden');

            await State.html5QrScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                async (decodedText) => {
                    handleScannedCode(decodedText);
                },
                () => {}
            );
        } catch (err) {
            alert('No se pudo acceder a la cámara: ' + err);
            btnStart.classList.remove('hidden');
            btnStop.classList.add('hidden');
        }
    });

    btnStop.addEventListener('click', async () => {
        if (State.html5QrScanner) {
            await State.html5QrScanner.stop();
            State.html5QrScanner = null;
        }
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
    });
}

async function handleScannedCode(decodedText) {
    let token = decodedText;
    if (decodedText.includes('token=')) {
        const url = new URL(decodedText, window.location.origin);
        token = url.searchParams.get('token');
    }

    const resultBox = document.getElementById('scanResultBox');
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `<p class="text-xs text-blue-600 font-bold animate-pulse">Comprobando credencial en la base de datos...</p>`;

    try {
        const res = await fetch(`/api/verify/${encodeURIComponent(token)}`);
        const data = await res.json();

        if (res.ok && data.found && data.player) {
            const p = data.player;
            const isHabilitado = p.status === 'VERIFIED';
            
            resultBox.className = `mt-4 p-4 rounded-2xl text-left border-2 shadow-lg ${isHabilitado ? 'bg-emerald-50 border-emerald-500' : 'bg-amber-50 border-amber-500'}`;
            resultBox.innerHTML = `
                <div class="flex items-center gap-3">
                    <img src="${p.photo_url || ''}" class="w-16 h-20 rounded-xl object-cover border border-slate-300 bg-white" alt="">
                    <div>
                        <span class="${isHabilitado ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'} text-[10px] font-black px-2 py-0.5 rounded-full">
                            ${isHabilitado ? '✓ JUGADOR HABILITADO' : '⚠️ PENDIENTE DE REVISIÓN'}
                        </span>
                        <h4 class="font-black text-sm text-slate-900 mt-1">${escapeHTML(p.full_name)}</h4>
                        <p class="text-xs font-bold text-slate-800">🛡️ ${escapeHTML(p.team_name)}</p>
                        <p class="text-[11px] text-slate-600">Dorsal: <strong>#${p.dorsal || '-'}</strong> | Doc: ${p.document_number || '-'}</p>
                    </div>
                </div>
            `;
        } else {
            resultBox.className = 'mt-4 p-4 rounded-2xl text-left bg-rose-50 border-2 border-rose-500';
            resultBox.innerHTML = `
                <div class="text-center text-rose-800">
                    <p class="font-black text-sm">❌ CÓDIGO NO VÁLIDO O NO REGISTRADO</p>
                    <p class="text-xs mt-1">Este carnet no corresponde a ningún jugador del torneo oficial.</p>
                </div>
            `;
        }
    } catch (e) {
        resultBox.innerHTML = `<p class="text-xs text-red-500">Error: ${e.message}</p>`;
    }
}

// ========================================================
// 5. GESTIÓN DE ROLES Y USUARIOS (SUPER ADMIN)
// ========================================================
async function loadUsers() {
    if (!State.user || State.user.role !== 'SUPER_ADMIN') {
        document.getElementById('superAdminUsersSection').classList.add('hidden');
        return;
    }

    document.getElementById('superAdminUsersSection').classList.remove('hidden');

    try {
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${State.token}` }
        });
        const data = await res.json();
        State.users = data.users || [];

        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = State.users.map(u => {
            const isSuper = u.role_name === 'SUPER_ADMIN';
            const roleBadgeClass = isSuper 
                ? 'bg-purple-100 text-purple-900 border border-purple-200' 
                : (u.role_name === 'ORGANIZADOR' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-slate-100 text-slate-700');
            const roleLabel = isSuper ? '👑 El Jefe (Super Admin)' : (u.role_name === 'ORGANIZADOR' ? '⚽ Admin del Torneo' : u.role_name);
            const phoneDisplay = u.phone ? escapeHTML(u.phone) : '<span class="text-slate-400 italic">Sin teléfono</span>';

            return `
                <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3 font-extrabold text-slate-900 text-xs">${escapeHTML(u.name)}</td>
                    <td class="p-3 font-mono text-slate-600 text-xs">${escapeHTML(u.email)}</td>
                    <td class="p-3 text-slate-700 font-medium text-xs">${phoneDisplay}</td>
                    <td class="p-3">
                        <span class="text-[10px] font-black px-2.5 py-0.5 rounded-full ${roleBadgeClass}">
                            ${roleLabel}
                        </span>
                    </td>
                    <td class="p-3">
                        <span class="${u.status === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'} text-[10px] font-black px-2 py-0.5 rounded-full border">
                            ${u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </span>
                    </td>
                    <td class="p-3 text-right">
                        <div class="flex items-center justify-end gap-1.5 flex-wrap">
                            <button onclick="shareUserCredentialsDirect('${escapeHTML(u.id)}', '${escapeHTML(u.name)}', '${escapeHTML(u.email)}', '${escapeHTML(u.phone || '')}', '${escapeHTML(u.role_name)}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-lg transition active:scale-95 flex items-center gap-1" title="Pasar credenciales por WhatsApp o copiar">
                                <span>💬</span>
                                <span>Pasar Credenciales</span>
                            </button>
                            <button onclick="openResetPasswordModal('${u.id}', '${escapeHTML(u.name)}')" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-1 rounded-lg transition active:scale-95" title="Cambiar clave">
                                🔑 Clave
                            </button>
                            ${!isSuper ? `
                                <button onclick="toggleUserStatus('${u.id}', '${u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}')" class="text-[10px] ${u.status === 'ACTIVE' ? 'text-slate-600 hover:text-slate-900 bg-slate-100' : 'text-emerald-700 hover:text-emerald-800 bg-emerald-50'} font-bold px-2 py-1 rounded-lg transition">
                                    ${u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                                </button>
                                <button onclick="deleteUserAccount('${u.id}', '${escapeHTML(u.name)}')" class="text-[10px] text-rose-500 hover:text-rose-700 font-bold p-1 rounded-lg hover:bg-rose-50 transition" title="Eliminar cuenta">
                                    ✕
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error cargando usuarios:', e);
    }
}

async function toggleUserStatus(userId, newStatus) {
    try {
        const res = await fetch(`/api/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${State.token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            await loadUsers();
        }
    } catch (e) {
        alert(e.message);
    }
}

function deleteUserAccount(userId, userName) {
    alertify.confirm(
        'Eliminar Usuario',
        `¿Estás seguro de eliminar el usuario de <b>${escapeHTML(userName)}</b>? Esta acción no se puede deshacer.`,
        async () => {
            try {
                const res = await fetch(`/api/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${State.token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    alertify.success('Usuario eliminado correctamente.');
                    await loadUsers();
                } else {
                    alertify.error(data.error || 'No se pudo eliminar el usuario.');
                }
            } catch (err) {
                alertify.error('Error de conexión: ' + err.message);
            }
        },
        () => {}
    );
}

// ========================================================
// 6. ENLACE PÚBLICO DE INSCRIPCIÓN (QR COMPARTIR)
// ========================================================
function openShareModal() {
    const registerUrl = `${window.location.origin}/registro.html`;
    document.getElementById('shareUrlText').textContent = registerUrl;

    const qrImg = document.getElementById('shareQrImage');
    // Generador local de alta velocidad, sin dependencias externas
    qrImg.src = `/api/qr?data=${encodeURIComponent(registerUrl)}`;

    document.getElementById('modalShare').classList.remove('hidden');
}

// ========================================================
// NAVEGACIÓN Y EVENTOS GENERALES
// ========================================================
function switchTab(targetId) {
    // Restricción estricta de seguridad: Solo SUPER_ADMIN (El Jefe) puede abrir el módulo de suscripción
    if (targetId === 'tabSubscription' && (!State.user || State.user.role !== 'SUPER_ADMIN')) {
        alert('Acceso restringido: Este módulo es exclusivo para el propietario y desarrollador del sistema.');
        return;
    }

    const navButtons = document.querySelectorAll('.nav-tab-btn');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.remove('hidden');

    navButtons.forEach(b => {
        const isCurrent = b.getAttribute('data-target') === targetId;
        if (isCurrent) {
            b.classList.add('active', 'bg-slate-900', 'text-white', 'shadow-sm', 'shadow-slate-900/10');
            b.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
        } else {
            b.classList.remove('active', 'bg-slate-900', 'text-white', 'shadow-sm', 'shadow-slate-900/10');
            b.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
        }
    });

    State.activeTab = targetId;

    if (targetId === 'tabAdmin') {
        loadUsers();
    } else if (targetId === 'tabSubscription') {
        if (!State.masterToken) {
            openMasterAuthModal('tabSubscription');
            return;
        }
        loadSubscriptionFullConfig();
    }
}

function openMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.getAttribute('data-target'));
            closeMobileSidebar();
        });
    });

    const btnOpen = document.getElementById('btnOpenSidebar');
    if (btnOpen) {
        btnOpen.addEventListener('click', openMobileSidebar);
    }
    const btnClose = document.getElementById('btnCloseSidebar');
    if (btnClose) {
        btnClose.addEventListener('click', closeMobileSidebar);
    }
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeMobileSidebar);
    }
}

function setupEventHandlers() {
    document.getElementById('carnetTeamFilter').addEventListener('change', () => {
        loadPlayers();
    });

    document.getElementById('playerStatusFilter').addEventListener('change', renderPlayersList);
    document.getElementById('playerSearchInput').addEventListener('input', renderPlayersList);

    // Botón de banner para filtrar solo pendientes
    document.getElementById('btnFilterPendingOnly').addEventListener('click', () => {
        document.getElementById('playerStatusFilter').value = 'PENDING';
        renderPlayersList();
    });

    document.getElementById('btnShareRegister').addEventListener('click', openShareModal);
    const mShareBtn = document.getElementById('btnShareRegisterMobile');
    if (mShareBtn) {
        mShareBtn.addEventListener('click', openShareModal);
    }
    document.getElementById('btnCopyShareUrl').addEventListener('click', () => {
        const text = document.getElementById('shareUrlText').textContent;
        navigator.clipboard.writeText(text);
        alert('¡Enlace de inscripción copiado al portapapeles!');
    });

    document.getElementById('btnAuthToggle').addEventListener('click', () => {
        if (State.user) {
            alertify.confirm(
                'Cerrar Sesión',
                `¿Deseas cerrar la sesión de <b>${escapeHTML(State.user.name)}</b>?`,
                () => {
                    localStorage.removeItem('torneo_token');
                    State.token = null;
                    State.user = null;
                    alertify.message('Sesión cerrada');
                    updateUI();
                },
                () => {}
            );
        } else {
            document.getElementById('modalLogin').classList.remove('hidden');
        }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                State.token = data.token;
                State.user = data.user;
                localStorage.setItem('torneo_token', data.token);
                document.getElementById('modalLogin').classList.add('hidden');
                updateUI();
                if (State.activeTab === 'tabAdmin') loadUsers();
            } else {
                alert(data.error || 'Credenciales inválidas.');
            }
        } catch (err) {
            alert('Error de conexión.');
        }
    });

    // Accesos rápidos en modal de login (El Jefe vs Admin del Torneo)
    const btnFillBoss = document.getElementById('btnFillBossCreds');
    if (btnFillBoss) {
        btnFillBoss.addEventListener('click', () => {
            document.getElementById('loginEmail').value = 'admin@torneo.com';
            document.getElementById('loginPassword').value = 'admin123';
        });
    }

    const btnFillOrg = document.getElementById('btnFillOrganizerCreds');
    if (btnFillOrg) {
        btnFillOrg.addEventListener('click', () => {
            document.getElementById('loginEmail').value = 'organizador@torneo.com';
            document.getElementById('loginPassword').value = 'admin123';
        });
    }

    // Previsualización de fotos en modales
    const teamLogoInput = document.getElementById('teamLogoInput');
    const teamLogoPlaceholder = document.getElementById('teamLogoPlaceholder');
    const teamLogoPreviewContainer = document.getElementById('teamLogoPreviewContainer');
    const teamLogoPreviewImg = document.getElementById('teamLogoPreviewImg');
    const teamLogoFileName = document.getElementById('teamLogoFileName');
    const btnRemoveTeamLogo = document.getElementById('btnRemoveTeamLogo');

    function resetTeamLogoPreview() {
        if (teamLogoInput) teamLogoInput.value = '';
        if (teamLogoPlaceholder) teamLogoPlaceholder.classList.remove('hidden');
        if (teamLogoPreviewContainer) teamLogoPreviewContainer.classList.add('hidden');
        if (teamLogoPreviewImg) teamLogoPreviewImg.src = '';
        if (teamLogoFileName) teamLogoFileName.textContent = '';
    }

    if (teamLogoInput) {
        teamLogoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (teamLogoPreviewImg) teamLogoPreviewImg.src = event.target.result;
                    if (teamLogoFileName) teamLogoFileName.textContent = file.name;
                    if (teamLogoPlaceholder) teamLogoPlaceholder.classList.add('hidden');
                    if (teamLogoPreviewContainer) teamLogoPreviewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (btnRemoveTeamLogo) {
        btnRemoveTeamLogo.addEventListener('click', (e) => {
            e.stopPropagation();
            resetTeamLogoPreview();
        });
    }

    const adminPhotoInput = document.getElementById('adminPhotoInput');
    const adminPhotoPlaceholder = document.getElementById('adminPhotoPlaceholder');
    const adminPhotoPreviewContainer = document.getElementById('adminPhotoPreviewContainer');
    const adminPhotoPreviewImg = document.getElementById('adminPhotoPreviewImg');
    const adminPhotoFileName = document.getElementById('adminPhotoFileName');
    const btnRemoveAdminPhoto = document.getElementById('btnRemoveAdminPhoto');

    function resetAdminPhotoPreview() {
        if (adminPhotoInput) adminPhotoInput.value = '';
        if (adminPhotoPlaceholder) adminPhotoPlaceholder.classList.remove('hidden');
        if (adminPhotoPreviewContainer) adminPhotoPreviewContainer.classList.add('hidden');
        if (adminPhotoPreviewImg) adminPhotoPreviewImg.src = '';
        if (adminPhotoFileName) adminPhotoFileName.textContent = '';
    }

    if (adminPhotoInput) {
        adminPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (adminPhotoPreviewImg) adminPhotoPreviewImg.src = event.target.result;
                    if (adminPhotoFileName) adminPhotoFileName.textContent = file.name;
                    if (adminPhotoPlaceholder) adminPhotoPlaceholder.classList.add('hidden');
                    if (adminPhotoPreviewContainer) adminPhotoPreviewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (btnRemoveAdminPhoto) {
        btnRemoveAdminPhoto.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAdminPhotoPreview();
        });
    }

    // Modal nuevo jugador
    document.getElementById('btnOpenNewPlayerModal').addEventListener('click', () => {
        document.getElementById('adminPlayerForm').reset();
        resetAdminPhotoPreview();
        document.getElementById('modalNewPlayer').classList.remove('hidden');
    });

    document.getElementById('adminPlayerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Optimizando foto y guardando...</span>';
        }

        const formData = new FormData(e.target);

        // Pre-comprimir foto en el navegador si fue seleccionada
        const photoFile = formData.get('photo');
        if (photoFile && photoFile.size > 0) {
            try {
                const compressed = await ImageCompressor.compress(photoFile, {
                    maxWidth: 700,
                    maxHeight: 850,
                    quality: 0.82
                });
                formData.set('photo', compressed, compressed.name || 'photo.webp');
            } catch (err) {
                console.warn('Error comprimiendo foto:', err);
            }
        }

        try {
            const res = await fetch('/api/players', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${State.token}` },
                body: formData
            });
            if (res.ok) {
                document.getElementById('modalNewPlayer').classList.add('hidden');
                resetAdminPhotoPreview();
                await loadPlayers();
            } else {
                const data = await res.json();
                alert(data.error || 'Error al guardar jugador.');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>⚽ Guardar y Habilitar Jugador</span>';
            }
        }
    });

    // Modal editar carnet / jugador
    let compressedEditPlayerPhoto = null;
    const editPhotoInput = document.getElementById('editPlayerPhotoInput');
    if (editPhotoInput) {
        editPhotoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('editPlayerPhotoPreview').src = URL.createObjectURL(file);
                try {
                    compressedEditPlayerPhoto = await ImageCompressor.compress(file, {
                        maxWidth: 700,
                        maxHeight: 850,
                        quality: 0.82
                    });
                    document.getElementById('editPlayerPhotoPreview').src = URL.createObjectURL(compressedEditPlayerPhoto);
                } catch (err) {
                    compressedEditPlayerPhoto = file;
                }
            }
        });
    }

    const editPlayerForm = document.getElementById('editPlayerForm');
    if (editPlayerForm) {
        editPlayerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const playerId = document.getElementById('editPlayerId').value;
            const submitBtn = document.getElementById('btnSubmitEditPlayer');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Optimizando y guardando...</span>';

            try {
                const formData = new FormData(e.target);

                // Si se cambió la foto, asegurar versión comprimida
                if (compressedEditPlayerPhoto) {
                    formData.set('photo', compressedEditPlayerPhoto, compressedEditPlayerPhoto.name || 'player.webp');
                } else {
                    const rawPhoto = formData.get('photo');
                    if (rawPhoto && rawPhoto.size > 0) {
                        try {
                            const comp = await ImageCompressor.compress(rawPhoto, { maxWidth: 700, maxHeight: 850, quality: 0.82 });
                            formData.set('photo', comp, comp.name || 'player.webp');
                        } catch (e) {}
                    }
                }

                const res = await fetch(`/api/players/${playerId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${State.token}` },
                    body: formData
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    document.getElementById('modalEditPlayer').classList.add('hidden');
                    compressedEditPlayerPhoto = null;
                    await loadPlayers();
                } else {
                    alert(data.error || 'Error al actualizar el carnet.');
                }
            } catch (err) {
                alert('Error de conexión: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>💾 Guardar Cambios</span>';
            }
        });
    }

    // Modal nuevo equipo
    document.getElementById('btnOpenNewTeamModal').addEventListener('click', () => {
        document.getElementById('newTeamForm').reset();
        resetTeamLogoPreview();
        document.getElementById('modalNewTeam').classList.remove('hidden');
    });

    document.getElementById('newTeamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Optimizando logo y registrando...</span>';
        }

        const formData = new FormData(e.target);

        // Pre-comprimir logo de equipo en cliente (máx 400x400)
        const logoFile = formData.get('logo');
        if (logoFile && logoFile.size > 0) {
            try {
                const compressedLogo = await ImageCompressor.compress(logoFile, {
                    maxWidth: 400,
                    maxHeight: 400,
                    quality: 0.82
                });
                formData.set('logo', compressedLogo, compressedLogo.name || 'logo.webp');
            } catch (err) {
                console.warn('Error comprimiendo logo:', err);
            }
        }

        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${State.token}` },
                body: formData
            });
            if (res.ok) {
                document.getElementById('modalNewTeam').classList.add('hidden');
                resetTeamLogoPreview();
                await loadTeams();
            } else {
                const data = await res.json();
                alert(data.error || 'Error al crear equipo.');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>🛡️ Registrar Equipo</span>';
            }
        }
    });

    // Modal nuevo usuario
    document.getElementById('btnOpenNewUserModal').addEventListener('click', () => {
        document.getElementById('newUserForm').reset();
        document.getElementById('modalNewUser').classList.remove('hidden');
    });

    document.getElementById('newUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('usrName').value.trim();
        const email = document.getElementById('usrEmail').value.trim();
        const password = document.getElementById('usrPass').value;
        const role_id = document.getElementById('usrRoleSelect').value;
        const phone = document.getElementById('usrPhone') ? document.getElementById('usrPhone').value.trim() : '';

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${State.token}`
                },
                body: JSON.stringify({ name, email, password, role_id, phone })
            });
            const data = await res.json();
            if (res.ok) {
                document.getElementById('modalNewUser').classList.add('hidden');
                await loadUsers();
                // Abrir modal para pasar las credenciales al cliente de inmediato
                const roleMap = { '1': 'EL JEFE (Super Admin)', '2': 'ADMINISTRADOR DEL TORNEO', '3': 'DELEGADO', '4': 'ARBITRO' };
                openShareCredentialsModal({
                    name,
                    email,
                    password,
                    phone,
                    role_name: roleMap[role_id] || 'ADMINISTRADOR DEL TORNEO'
                });
            } else {
                alert(data.error || 'Error al crear usuario.');
            }
        } catch (err) {
            alert(err.message);
        }
    });

    // Configuración torneo
    document.getElementById('tournamentSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('cfgTrnName').value.trim().toUpperCase();
        const edition = document.getElementById('cfgTrnEdition').value.trim();

        try {
            const res = await fetch('/api/tournament', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${State.token}`
                },
                body: JSON.stringify({ name, edition })
            });
            if (res.ok) {
                alert('Torneo actualizado correctamente.');
                await loadTournament();
                renderCarnetsGrid();
            }
        } catch (err) {
            alert(err.message);
        }
    });

    document.querySelectorAll('.modal-close-share, .modal-close-login, .modal-close-player, .modal-close-edit-player, .modal-close-team, .modal-close-user, .modal-close-carnet, .modal-close-resetpass').forEach(btn => {
        btn.addEventListener('click', () => {
            closeCarnetModal();
            closeShareCredentialsModal();
            closeResetPasswordModal();
            document.querySelectorAll('#modalShare, #modalLogin, #modalNewPlayer, #modalEditPlayer, #modalNewTeam, #modalNewUser, #modalShareCredentials, #modalResetPassword').forEach(m => m.classList.add('hidden'));
            resetTeamLogoPreview();
            resetAdminPhotoPreview();
        });
    });

    const btnCloseCredsModal = document.getElementById('btnCloseCredsModal');
    if (btnCloseCredsModal) {
        btnCloseCredsModal.addEventListener('click', closeShareCredentialsModal);
    }

    const btnCopyCreds = document.getElementById('btnCopyCreds');
    if (btnCopyCreds) {
        btnCopyCreds.addEventListener('click', () => {
            if (!currentShareCredsData) return;
            const { name, email, password, role_name } = currentShareCredsData;
            const siteUrl = window.location.origin;
            const passText = password ? `*Contraseña:* ${password}` : `*Contraseña:* (La contraseña que te fue asignada)`;
            const waText = 
`⚽ *ACCESO AL SISTEMA DE CARNETIZACIÓN & TORNEO* ⚽

Hola *${name}*, ya tienes tu cuenta habilitada para gestionar el torneo:

🌐 *Enlace del Sistema:* ${siteUrl}
👤 *Usuario / Correo:* ${email}
🔑 ${passText}
🛡️ *Rol:* ${role_name || 'ADMINISTRADOR DEL TORNEO'}

_Ingresa al enlace desde tu celular o computador para ver carnets oficiales, aprobar jugadores y registrar equipos._`;

            navigator.clipboard.writeText(waText).then(() => {
                const copyText = document.getElementById('btnCopyCredsText');
                if (copyText) {
                    copyText.textContent = '¡Copiado para WhatsApp!';
                    setTimeout(() => { copyText.textContent = 'Copiar Credenciales para WhatsApp'; }, 2200);
                }
            }).catch(() => {
                alert(waText);
            });
        });
    }

    const formResetPass = document.getElementById('formResetPassword');
    if (formResetPass) {
        formResetPass.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('resetPassUserId').value;
            const newPassword = document.getElementById('inputResetNewPass').value.trim();

            if (!newPassword || newPassword.length < 4) {
                alert('La nueva contraseña debe tener al menos 4 caracteres.');
                return;
            }

            try {
                const res = await fetch(`/api/users/${userId}/password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${State.token}`
                    },
                    body: JSON.stringify({ password: newPassword })
                });

                const data = await res.json();
                if (res.ok) {
                    closeResetPasswordModal();
                    alert('✅ Contraseña actualizada exitosamente.');

                    const targetUser = State.users.find(u => u.id === userId);
                    if (targetUser) {
                        openShareCredentialsModal({
                            name: targetUser.name,
                            email: targetUser.email,
                            password: newPassword,
                            phone: targetUser.phone,
                            role_name: targetUser.role_name === 'SUPER_ADMIN' ? 'EL JEFE (Super Admin)' : 'ADMINISTRADOR DEL TORNEO'
                        });
                    }
                } else {
                    alert('❌ Error: ' + (data.error || 'No se pudo cambiar la contraseña.'));
                }
            } catch (err) {
                alert('Error de conexión: ' + err.message);
            }
        });
    }

    const modalViewCarnet = document.getElementById('modalViewCarnet');
    if (modalViewCarnet) {
        modalViewCarnet.addEventListener('click', (e) => {
            if (e.target === modalViewCarnet) {
                closeCarnetModal();
            }
        });
    }

    const btnCarnetDownloadJpg = document.getElementById('btnModalCarnetDownloadJpg');
    if (btnCarnetDownloadJpg) {
        btnCarnetDownloadJpg.addEventListener('click', async () => {
            if (!currentModalCarnetPlayer) return;
            const card = document.getElementById('modalCarnetCardElement');
            const cleanName = (currentModalCarnetPlayer.full_name || 'Jugador').trim().replace(/\s+/g, '_');
            const cleanTeam = (currentModalCarnetPlayer.team_name || 'Torneo').trim().replace(/\s+/g, '_');
            const filename = `Carnet_${cleanName}_${cleanTeam}.jpg`;
            await CarnetDownloader.downloadAsJpg(card, filename, btnCarnetDownloadJpg);
        });
    }

    const btnCarnetEdit = document.getElementById('btnModalCarnetEdit');
    if (btnCarnetEdit) {
        btnCarnetEdit.addEventListener('click', () => {
            if (currentModalCarnetPlayer) {
                const id = currentModalCarnetPlayer.id;
                closeCarnetModal();
                openEditPlayerModal(id);
            }
        });
    }

    const btnCarnetCopy = document.getElementById('btnModalCarnetCopyLink');
    if (btnCarnetCopy) {
        btnCarnetCopy.addEventListener('click', () => {
            if (currentModalCarnetPlayer) {
                const url = `${window.location.origin}/carnet.html?token=${currentModalCarnetPlayer.qr_code_token}`;
                navigator.clipboard.writeText(url).then(() => {
                    const copyText = document.getElementById('btnModalCarnetCopyText');
                    if (copyText) {
                        copyText.textContent = '¡Enlace Copiado!';
                        setTimeout(() => { copyText.textContent = 'Copiar Enlace'; }, 2200);
                    }
                }).catch(() => {
                    alert('Enlace: ' + url);
                });
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCarnetModal();
            closeShareCredentialsModal();
            closeResetPasswordModal();
            document.querySelectorAll('#modalShare, #modalLogin, #modalNewPlayer, #modalEditPlayer, #modalNewTeam, #modalNewUser, #modalShareCredentials, #modalResetPassword').forEach(m => m.classList.add('hidden'));
        }
    });

    initQrScanner();
}

let currentShareCredsData = null;

function openShareCredentialsModal({ name, email, password, phone, role_name }) {
    currentShareCredsData = { name, email, password, phone, role_name };

    const siteUrl = window.location.origin;
    const roleTitle = role_name || 'ADMINISTRADOR DEL TORNEO';

    const credRoleBadge = document.getElementById('credRoleBadge');
    if (credRoleBadge) credRoleBadge.textContent = roleTitle;

    const credName = document.getElementById('credName');
    if (credName) credName.textContent = name;

    const credUrl = document.getElementById('credUrl');
    if (credUrl) credUrl.textContent = siteUrl;

    const credEmail = document.getElementById('credEmail');
    if (credEmail) credEmail.textContent = email;

    const credPassword = document.getElementById('credPassword');
    if (credPassword) credPassword.textContent = password || '(Contraseña actual asignada)';

    const btnCopyText = document.getElementById('btnCopyCredsText');
    if (btnCopyText) btnCopyText.textContent = 'Copiar Credenciales para WhatsApp';

    // Preparar mensaje y enlace de WhatsApp
    const passText = password ? `*Contraseña:* ${password}` : `*Contraseña:* (La contraseña que te fue asignada)`;
    const waMessage = 
`⚽ *ACCESO AL SISTEMA DE CARNETIZACIÓN & TORNEO* ⚽

Hola *${name}*, ya tienes tu cuenta habilitada para gestionar el torneo:

🌐 *Enlace del Sistema:* ${siteUrl}
👤 *Usuario / Correo:* ${email}
🔑 ${passText}
🛡️ *Rol:* ${roleTitle}

_Ingresa al enlace desde tu celular o computador para ver carnets oficiales, aprobar jugadores y registrar equipos._`;

    const waBtn = document.getElementById('btnSendCredsWhatsapp');
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (waBtn) {
        if (cleanPhone) {
            waBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;
            waBtn.classList.remove('hidden');
        } else {
            waBtn.classList.add('hidden');
        }
    }

    const modal = document.getElementById('modalShareCredentials');
    if (modal) modal.classList.remove('hidden');
}

function closeShareCredentialsModal() {
    const modal = document.getElementById('modalShareCredentials');
    if (modal) modal.classList.add('hidden');
    currentShareCredsData = null;
}

function shareUserCredentialsDirect(id, name, email, phone, role_name) {
    const roleMap = {
        'SUPER_ADMIN': 'EL JEFE (Super Admin)',
        'ORGANIZADOR': 'ADMINISTRADOR DEL TORNEO',
        'ARBITRO': 'ARBITRO / VEEDOR',
        'DELEGADO': 'DELEGADO DE EQUIPO'
    };
    const roleTitle = roleMap[role_name] || role_name;

    openShareCredentialsModal({
        name,
        email,
        password: '',
        phone,
        role_name: roleTitle
    });
}

function openResetPasswordModal(userId, userName) {
    const modal = document.getElementById('modalResetPassword');
    const idInput = document.getElementById('resetPassUserId');
    const nameLabel = document.getElementById('resetPassUserName');
    const passInput = document.getElementById('inputResetNewPass');

    if (idInput) idInput.value = userId;
    if (nameLabel) nameLabel.textContent = userName;
    if (passInput) passInput.value = '';
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => { if (passInput) passInput.focus(); }, 100);
}

function closeResetPasswordModal() {
    const modal = document.getElementById('modalResetPassword');
    if (modal) modal.classList.add('hidden');
}

function updateUI() {
    const roleBadge = document.getElementById('userRoleBadge');
    const userNameHeader = document.getElementById('userNameHeader');
    const authBtn = document.getElementById('btnAuthToggle');
    const navSubscription = document.getElementById('btnNavSubscription');
    const superAdminUsersSection = document.getElementById('superAdminUsersSection');

    const isSuperAdmin = State.user && State.user.role === 'SUPER_ADMIN';

    if (State.user) {
        if (userNameHeader) userNameHeader.textContent = State.user.name;
        if (roleBadge) {
            if (isSuperAdmin) {
                roleBadge.textContent = '👑 EL JEFE (SUPER ADMIN)';
                roleBadge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200';
            } else if (State.user.role === 'ORGANIZADOR') {
                roleBadge.textContent = '⚽ ADMIN DEL TORNEO';
                roleBadge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200';
            } else {
                roleBadge.textContent = State.user.role;
                roleBadge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200';
            }
        }
        if (authBtn) {
            authBtn.textContent = 'Cerrar Sesión';
            authBtn.className = 'w-full bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2';
        }
    } else {
        if (roleBadge) {
            roleBadge.textContent = 'INVITADO';
            roleBadge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200';
        }
        if (userNameHeader) userNameHeader.textContent = '';
        if (authBtn) {
            authBtn.textContent = 'Iniciar Sesión';
            authBtn.className = 'w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2';
        }
    }

    // Reglas de visibilidad por rol:
    // 1. El botón de Suscripción ("Solo Mí") SOLO es visible para El Jefe (SUPER_ADMIN)
    if (navSubscription) {
        if (isSuperAdmin) {
            navSubscription.classList.remove('hidden');
        } else {
            navSubscription.classList.add('hidden');
            if (State.activeTab === 'tabSubscription') {
                switchTab('tabCarnets');
            }
        }
    }

    // 2. La sección de Gestión de Usuarios y Creación de Cuentas SOLO es visible para El Jefe (SUPER_ADMIN)
    if (superAdminUsersSection) {
        if (isSuperAdmin) {
            superAdminUsersSection.classList.remove('hidden');
        } else {
            superAdminUsersSection.classList.add('hidden');
        }
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ========================================================
// MÓDULO EXCLUSIVO: CONTROL DE SUSCRIPCIÓN & LICENCIA (SOLO PARA MÍ)
// ========================================================

let pendingMasterTab = 'tabSubscription';

async function checkSubscriptionStatus() {
    try {
        const res = await fetch('/api/subscription/status');
        if (!res.ok) return;
        const sub = await res.json();
        State.subscription = sub;

        const blockScreen = document.getElementById('subscriptionBlockScreen');
        const warnBanner = document.getElementById('subscriptionWarningBanner');
        const trnHeader = document.getElementById('blockTrnHeaderName');
        if (trnHeader && State.tournament && State.tournament.name) {
            trnHeader.textContent = State.tournament.name;
        }

        if (sub.is_blocked === 1) {
            // Actualizar datos del aviso de suspensión
            const titleEl = document.getElementById('blockScreenTitle');
            if (titleEl) titleEl.textContent = sub.title || 'Suscripción Pendiente de Pago';

            const msgEl = document.getElementById('blockScreenMessage');
            if (msgEl) msgEl.textContent = sub.message || 'El servicio se encuentra temporalmente suspendido por falta de pago.';

            // Datos de pago
            const paymentBox = document.getElementById('blockScreenPaymentBox');
            const paymentDetails = document.getElementById('blockScreenPaymentDetails');
            if (paymentBox && paymentDetails) {
                if (sub.payment_info && sub.payment_info.trim()) {
                    paymentDetails.textContent = sub.payment_info.trim();
                    paymentBox.classList.remove('hidden');
                } else {
                    paymentBox.classList.add('hidden');
                }
            }

            // WhatsApp link
            const waBtn = document.getElementById('btnBlockScreenWhatsapp');
            const waWarnBtn = document.getElementById('btnSubWarnWhatsapp');
            const cleanPhone = (sub.contact_phone || '').replace(/\D/g, '');
            const waUrl = cleanPhone 
                ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hola, me comunico para realizar el pago de la suscripción del sistema del torneo.')}`
                : '#';

            if (waBtn) {
                if (cleanPhone) {
                    waBtn.href = waUrl;
                    waBtn.parentElement.classList.remove('hidden');
                } else {
                    waBtn.parentElement.classList.add('hidden');
                }
            }

            if (sub.block_mode === 'TOTAL') {
                if (warnBanner) warnBanner.classList.add('hidden');
                // Si el desarrollador tiene token maestro activo en esta sesión, no le bloqueamos la vista
                if (!State.masterToken) {
                    if (blockScreen) blockScreen.classList.remove('hidden');
                } else {
                    if (blockScreen) blockScreen.classList.add('hidden');
                }
            } else if (sub.block_mode === 'WARNING') {
                if (blockScreen) blockScreen.classList.add('hidden');
                if (warnBanner) {
                    const warnTitle = document.getElementById('subWarnTitle');
                    const warnMsg = document.getElementById('subWarnMsg');
                    if (warnTitle) warnTitle.textContent = sub.title || 'AVISO DE SUSCRIPCIÓN';
                    if (warnMsg) warnMsg.textContent = sub.message || 'Por favor regularice el pago de su suscripción.';

                    if (waWarnBtn) {
                        if (cleanPhone) {
                            waWarnBtn.href = waUrl;
                            waWarnBtn.classList.remove('hidden');
                        } else {
                            waWarnBtn.classList.add('hidden');
                        }
                    }
                    warnBanner.classList.remove('hidden');
                }
            }
        } else {
            // Servicio Activo / Al Día
            if (blockScreen) blockScreen.classList.add('hidden');
            if (warnBanner) warnBanner.classList.add('hidden');
        }

        // Si ya estamos en la pestaña de suscripción, refrescar su UI
        if (State.activeTab === 'tabSubscription' && State.masterToken) {
            renderSubscriptionModuleUI();
        }
    } catch (e) {
        console.error('Error verificando estado de suscripción:', e);
    }
}

function openMasterAuthModal(returnTab = 'tabSubscription') {
    pendingMasterTab = returnTab;
    const modal = document.getElementById('modalMasterAuth');
    const inputKey = document.getElementById('inputMasterKeyAuth');
    const errBox = document.getElementById('masterAuthError');
    if (errBox) errBox.classList.add('hidden');
    if (inputKey) {
        inputKey.value = '';
        inputKey.type = 'password';
    }
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => { if (inputKey) inputKey.focus(); }, 100);
}

function closeMasterAuthModal() {
    const modal = document.getElementById('modalMasterAuth');
    if (modal) modal.classList.add('hidden');
}

async function loadSubscriptionFullConfig() {
    try {
        const res = await fetch('/api/subscription/full', {
            headers: { 'Authorization': `Bearer ${State.masterToken}` }
        });
        if (!res.ok) {
            // Token inválido o expirado
            State.masterToken = null;
            sessionStorage.removeItem('torneo_master_token');
            openMasterAuthModal('tabSubscription');
            return;
        }
        const data = await res.json();
        if (data.subscription) {
            State.subscription = data.subscription;
            renderSubscriptionModuleUI();
        }
    } catch (e) {
        console.error('Error cargando configuración completa:', e);
    }
}

function renderSubscriptionModuleUI() {
    if (!State.subscription) return;
    const sub = State.subscription;

    const badgeHeader = document.getElementById('subStatusBadgeHeader');
    const textHeader = document.getElementById('subStatusTextHeader');
    const iconBox = document.getElementById('subToggleIconBox');
    const stateLabel = document.getElementById('subStateLabel');
    const stateDesc = document.getElementById('subStateDesc');
    const btnToggle = document.getElementById('btnToggleSubscriptionState');

    if (sub.is_blocked === 1) {
        if (badgeHeader) {
            badgeHeader.className = 'w-full sm:w-auto text-center px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center gap-2';
        }
        if (textHeader) textHeader.textContent = 'SISTEMA SUSPENDIDO';
        if (iconBox) {
            iconBox.className = 'w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center text-2xl shadow-sm flex-shrink-0';
            iconBox.textContent = '🛑';
        }
        if (stateLabel) stateLabel.textContent = 'Servicio Suspendido (Bloqueado por Pago)';
        if (stateDesc) stateDesc.textContent = 'El acceso a la plataforma está bloqueado para los usuarios.';
        if (btnToggle) {
            btnToggle.className = 'w-full sm:w-auto px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20';
            btnToggle.innerHTML = '<span>✅ Habilitar / Reactivar Servicio</span>';
        }
    } else {
        if (badgeHeader) {
            badgeHeader.className = 'w-full sm:w-auto text-center px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center gap-2';
        }
        if (textHeader) textHeader.textContent = 'SISTEMA ACTIVO';
        if (iconBox) {
            iconBox.className = 'w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl shadow-sm flex-shrink-0';
            iconBox.textContent = '✅';
        }
        if (stateLabel) stateLabel.textContent = 'Servicio Habilitado (Al Día)';
        if (stateDesc) stateDesc.textContent = 'El cliente y los usuarios pueden acceder normalmente a los carnets y funciones.';
        if (btnToggle) {
            btnToggle.className = 'w-full sm:w-auto px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20';
            btnToggle.innerHTML = '<span>🛑 Suspender por Falta de Pago</span>';
        }
    }

    // Modo de bloqueo
    if (sub.block_mode === 'WARNING') {
        const radWarn = document.getElementById('modeBlockWarning');
        if (radWarn) radWarn.checked = true;
    } else {
        const radTotal = document.getElementById('modeBlockTotal');
        if (radTotal) radTotal.checked = true;
    }

    // Rellenar campos del formulario
    const inputTitle = document.getElementById('subInputTitle');
    if (inputTitle && sub.title !== undefined) inputTitle.value = sub.title;

    const inputMsg = document.getElementById('subInputMessage');
    if (inputMsg && sub.message !== undefined) inputMsg.value = sub.message;

    const inputPhone = document.getElementById('subInputPhone');
    if (inputPhone && sub.contact_phone !== undefined) inputPhone.value = sub.contact_phone;

    const inputPay = document.getElementById('subInputPaymentInfo');
    if (inputPay && sub.payment_info !== undefined) inputPay.value = sub.payment_info;
}

async function updateSubscriptionSettings(payload) {
    if (!State.masterToken) {
        openMasterAuthModal('tabSubscription');
        return;
    }

    try {
        const res = await fetch('/api/subscription/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${State.masterToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            State.subscription = { ...State.subscription, ...data.subscription };
            renderSubscriptionModuleUI();
            await checkSubscriptionStatus();
            alert('✅ ' + (data.message || 'Configuración guardada exitosamente.'));
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo guardar la configuración.'));
        }
    } catch (e) {
        console.error(e);
        alert('❌ Error de conexión al guardar.');
    }
}

function setupSubscriptionHandlers() {
    // 1. Botón en el sidebar para acceder al módulo
    const navBtn = document.getElementById('btnNavSubscription');
    if (navBtn) {
        navBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!State.masterToken) {
                openMasterAuthModal('tabSubscription');
            } else {
                switchTab('tabSubscription');
            }
            closeMobileSidebar();
        });
    }

    // 2. Botón discreto en la pantalla de bloqueo
    const blockMasterBtn = document.getElementById('btnOpenMasterFromBlock');
    if (blockMasterBtn) {
        blockMasterBtn.addEventListener('click', () => {
            openMasterAuthModal('tabSubscription');
        });
    }

    // 3. Modal de autenticación maestra
    const btnCloseModal = document.getElementById('btnCloseMasterModal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', closeMasterAuthModal);
    }

    const btnToggleEye = document.getElementById('btnToggleShowMasterKey');
    if (btnToggleEye) {
        btnToggleEye.addEventListener('click', () => {
            const inp = document.getElementById('inputMasterKeyAuth');
            if (inp) {
                inp.type = inp.type === 'password' ? 'text' : 'password';
            }
        });
    }

    const formMaster = document.getElementById('formMasterAuth');
    if (formMaster) {
        formMaster.addEventListener('submit', async (e) => {
            e.preventDefault();
            const keyInput = document.getElementById('inputMasterKeyAuth');
            const errBox = document.getElementById('masterAuthError');
            const masterKey = keyInput ? keyInput.value.trim() : '';

            if (!masterKey) return;

            try {
                const res = await fetch('/api/subscription/verify-master', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ master_key: masterKey })
                });

                const data = await res.json();
                if (res.ok && data.master_token) {
                    State.masterToken = data.master_token;
                    sessionStorage.setItem('torneo_master_token', data.master_token);
                    closeMasterAuthModal();

                    // Ocultar pantalla de bloqueo si estaba visible
                    const blockScreen = document.getElementById('subscriptionBlockScreen');
                    if (blockScreen) blockScreen.classList.add('hidden');

                    // Cambiar a la pestaña de suscripción
                    switchTab(pendingMasterTab || 'tabSubscription');
                    await loadSubscriptionFullConfig();
                } else {
                    if (errBox) {
                        errBox.textContent = data.error || 'Clave Maestra incorrecta';
                        errBox.classList.remove('hidden');
                    }
                }
            } catch (err) {
                if (errBox) {
                    errBox.textContent = 'Error de conexión';
                    errBox.classList.remove('hidden');
                }
            }
        });
    }

    // 4. Interruptor de estado (Suspender / Habilitar)
    const btnToggleState = document.getElementById('btnToggleSubscriptionState');
    if (btnToggleState) {
        btnToggleState.addEventListener('click', () => {
            const isCurrentlyBlocked = State.subscription && State.subscription.is_blocked === 1;
            const newStatus = isCurrentlyBlocked ? 0 : 1;
            const actionText = newStatus === 1 ? '¿Deseas suspender el acceso al sistema por falta de pago?' : '¿Deseas reactivar el acceso al sistema para todos los usuarios?';

            alertify.confirm(
                'Estado del Sistema',
                actionText,
                async () => {
                    await updateSubscriptionSettings({ is_blocked: newStatus });
                },
                () => {}
            );
        });
    }

    // 5. Formulario de configuración de textos y medios de pago
    const formSettings = document.getElementById('formSubscriptionSettings');
    if (formSettings) {
        formSettings.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('subInputTitle').value.trim();
            const message = document.getElementById('subInputMessage').value.trim();
            const contact_phone = document.getElementById('subInputPhone').value.trim();
            const payment_info = document.getElementById('subInputPaymentInfo').value.trim();
            const modeEl = document.querySelector('input[name="sub_block_mode"]:checked');
            const block_mode = modeEl ? modeEl.value : 'TOTAL';

            await updateSubscriptionSettings({
                title,
                message,
                contact_phone,
                payment_info,
                block_mode
            });
        });
    }

    // 6. Vista previa de pantalla de bloqueo
    const btnPreview = document.getElementById('btnPreviewBlockScreen');
    if (btnPreview) {
        btnPreview.addEventListener('click', () => {
            const blockScreen = document.getElementById('subscriptionBlockScreen');
            if (!blockScreen) return;

            // Actualizar datos con lo que está actualmente escrito en los inputs
            const title = document.getElementById('subInputTitle').value.trim();
            const message = document.getElementById('subInputMessage').value.trim();
            const contact_phone = document.getElementById('subInputPhone').value.trim();
            const payment_info = document.getElementById('subInputPaymentInfo').value.trim();

            document.getElementById('blockScreenTitle').textContent = title || 'Suscripción Pendiente de Pago';
            document.getElementById('blockScreenMessage').textContent = message || 'El servicio se encuentra suspendido.';

            const paymentBox = document.getElementById('blockScreenPaymentBox');
            const paymentDetails = document.getElementById('blockScreenPaymentDetails');
            if (payment_info) {
                paymentDetails.textContent = payment_info;
                paymentBox.classList.remove('hidden');
            } else {
                paymentBox.classList.add('hidden');
            }

            const waBtn = document.getElementById('btnBlockScreenWhatsapp');
            const cleanPhone = contact_phone.replace(/\D/g, '');
            if (cleanPhone) {
                waBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hola, me comunico para pagar la suscripción.')}`;
                waBtn.parentElement.classList.remove('hidden');
            } else {
                waBtn.parentElement.classList.add('hidden');
            }

            // Mostrar botón temporal flotante para cerrar vista previa
            let closePreviewBtn = document.getElementById('btnClosePreviewTemp');
            if (!closePreviewBtn) {
                closePreviewBtn = document.createElement('button');
                closePreviewBtn.id = 'btnClosePreviewTemp';
                closePreviewBtn.className = 'fixed top-4 right-4 z-[100001] bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-2xl';
                closePreviewBtn.textContent = '✕ Cerrar Vista Previa';
                closePreviewBtn.onclick = () => {
                    blockScreen.classList.add('hidden');
                    closePreviewBtn.remove();
                };
                document.body.appendChild(closePreviewBtn);
            }

            blockScreen.classList.remove('hidden');
        });
    }

    // 7. Formulario para cambiar la clave maestra
    const formKey = document.getElementById('formChangeMasterKey');
    if (formKey) {
        formKey.addEventListener('submit', (e) => {
            e.preventDefault();
            const newKey = document.getElementById('inputNewMasterKey').value;
            const confirmKey = document.getElementById('inputConfirmMasterKey').value;

            if (newKey !== confirmKey) {
                alertify.error('Las claves no coinciden. Por favor verifícalas.');
                return;
            }

            if (newKey.length < 4) {
                alertify.warning('La clave debe tener al menos 4 caracteres.');
                return;
            }

            alertify.confirm(
                'Clave Maestra',
                '¿Confirmas que deseas cambiar tu Clave Maestra de Desarrollador?',
                async () => {
                    await updateSubscriptionSettings({ new_master_key: newKey });
                    document.getElementById('inputNewMasterKey').value = '';
                    document.getElementById('inputConfirmMasterKey').value = '';
                },
                () => {}
            );
        });
    }

    // 8. Botón para cerrar sesión de la clave maestra
    const btnLock = document.getElementById('btnLockMasterSession');
    if (btnLock) {
        btnLock.addEventListener('click', () => {
            alertify.confirm(
                'Módulo Maestro',
                '¿Cerrar sesión del Módulo Maestro? Se volverá a solicitar la Clave Maestra para ingresar.',
                () => {
                    State.masterToken = null;
                    sessionStorage.removeItem('torneo_master_token');
                    switchTab('tabCarnets');
                    checkSubscriptionStatus();
                    alertify.message('Módulo maestro bloqueado');
                },
                () => {}
            );
        });
    }
}

