/**
 * CarnetDownloader - Motor oficial de descarga y renderizado de Carnets en JPG
 * Permite descargar credenciales deportivas en alta definición (2.5x retina)
 * y compartirlas de manera instantánea en dispositivos móviles y de escritorio.
 */

const CarnetDownloader = {
    DEFAULT_PHOTO: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E",

    /**
     * Espera a que todas las imágenes dentro de un contenedor estén completamente cargadas
     */
    async preloadImages(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        const promises = imgs.map(img => {
            if (img.complete && img.naturalWidth !== 0) {
                return Promise.resolve();
            }
            return new Promise(resolve => {
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve();
                img.onerror = () => resolve();
                // Timeout de seguridad en caso de fallo de red
                setTimeout(resolve, 3500);
            });
        });
        await Promise.all(promises);
    },

    /**
     * Descarga cualquier elemento HTML de carnet como archivo de imagen JPG en alta resolución
     * @param {HTMLElement} element - Elemento DOM del carnet
     * @param {string} fileName - Nombre del archivo a descargar
     * @param {HTMLElement|null} triggerBtn - Botón que activó la acción (para feedback visual)
     */
    async downloadAsJpg(element, fileName = 'Carnet_Oficial.jpg', triggerBtn = null) {
        if (!element) {
            alert('No se encontró el elemento del carnet para exportar.');
            return;
        }

        // Si no está disponible html2canvas, avisar
        if (typeof html2canvas !== 'function') {
            alert('El módulo de generación de imagen (html2canvas) aún se está cargando. Por favor intenta de nuevo en unos segundos.');
            return;
        }

        let originalBtnHtml = '';
        if (triggerBtn) {
            originalBtnHtml = triggerBtn.innerHTML;
            triggerBtn.disabled = true;
            triggerBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Generando JPG...</span>
            `;
        }

        try {
            // Asegurar que imágenes como foto y QR estén listas
            await this.preloadImages(element);

            // Generar canvas con escala 2.5x para máxima nitidez de texto y código QR
            const canvas = await html2canvas(element, {
                scale: 2.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                imageTimeout: 5000,
                onclone: (clonedDoc) => {
                    // Si el clon tiene bordes o sombras especiales, garantizar visibilidad
                    const clonedEl = clonedDoc.querySelector(`[data-carnet-clone-id="${element.getAttribute('data-carnet-clone-id')}"]`) || clonedDoc.body;
                    if (clonedEl) {
                        clonedEl.style.transform = 'none';
                    }
                }
            });

            // Convertir canvas a JPEG de alta fidelidad (calidad 92%)
            const cleanFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

            if (canvas.toBlob) {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        this.fallbackDataUrlDownload(canvas, cleanFileName);
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.style.display = 'none';
                    link.href = url;
                    link.download = cleanFileName.endsWith('.jpg') ? cleanFileName : `${cleanFileName}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }, 20000);
                }, 'image/jpeg', 0.92);
            } else {
                this.fallbackDataUrlDownload(canvas, cleanFileName);
            }

            this.showGlobalToast('¡Carnet JPG descargado con éxito!');
        } catch (err) {
            console.error('Error generando JPG del carnet:', err);
            alert('Ocurrió un inconveniente al generar la imagen: ' + (err.message || 'Error desconocido'));
        } finally {
            if (triggerBtn) {
                triggerBtn.disabled = false;
                triggerBtn.innerHTML = originalBtnHtml;
            }
        }
    },

    fallbackDataUrlDownload(canvas, cleanFileName) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = dataUrl;
        link.download = cleanFileName.endsWith('.jpg') ? cleanFileName : `${cleanFileName}.jpg`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 1000);
    },

    /**
     * Construye el HTML completo y estilizado del Carnet Oficial para visualización y descarga
     */
    renderCardHtml(player, uniqueId = 'carnetCard') {
        const p = player || {};
        const tournamentName = p.tournament_name || 'TORNEO DE FÚTBOL';
        const teamName = p.team_name || 'Sin Equipo';
        const playerName = p.full_name || 'Jugador Oficial';
        const docType = p.document_type || 'CC';
        const docNumber = p.document_number || 'S/N';
        const dorsal = p.dorsal ? `#${p.dorsal}` : '';
        const position = p.position || '';
        const token = p.qr_code_token || 'TOKEN-OFICIAL';
        const photoSrc = p.photo_url || this.DEFAULT_PHOTO;

        // URL del QR oficial local
        const host = window.location.origin;
        const verifyUrl = `${host}/verificar.html?token=${encodeURIComponent(token)}`;
        const qrSrc = p.qr_code_image || `/api/qr?data=${encodeURIComponent(verifyUrl)}`;

        // Estilos según estado
        let statusClass = 'bg-emerald-600';
        let statusText = 'JUGADOR OFICIAL Y HABILITADO';
        let statusIcon = '✓';

        if (p.status === 'PENDING') {
            statusClass = 'bg-amber-500';
            statusText = 'EN REVISIÓN (PENDIENTE DE APROBACIÓN)';
            statusIcon = '⚠️';
        } else if (p.status === 'REJECTED') {
            statusClass = 'bg-rose-600';
            statusText = 'RECHAZADO / NO HABILITADO';
            statusIcon = '❌';
        }

        return `
            <div id="${uniqueId}" data-carnet-clone-id="${uniqueId}" class="bg-white text-slate-900 rounded-3xl shadow-xl overflow-hidden border-2 border-slate-900 relative max-w-sm w-full mx-auto select-none">
                <!-- Cabecera Oficial con Textura Mármol -->
                <div class="carnet-header !h-14 !px-4 bg-slate-100 border-b-2 border-slate-900 flex items-center gap-3">
                    <div class="carnet-shield !w-9 !h-9 flex-shrink-0">
                        <svg viewBox="0 0 100 100" fill="none">
                            <path d="M50 8 L85 22 V55 C85 75 50 92 50 92 C50 92 15 75 15 55 V22 Z" fill="#ffffff" stroke="#0f172a" stroke-width="6"/>
                            <circle cx="50" cy="50" r="22" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
                            <polygon points="50,42 56,46 54,53 46,53 44,46" fill="#0f172a"/>
                        </svg>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="carnet-tournament-title !text-base font-black text-slate-900 truncate tracking-wide">${this.escapeHTML(tournamentName)}</div>
                        <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block -mt-0.5">CREDENCIAL DIGITAL OFICIAL</span>
                    </div>
                </div>

                <!-- Franja de Estado -->
                <div class="${statusClass} text-white text-[11px] font-black uppercase tracking-wider py-1.5 px-3 text-center flex items-center justify-center gap-1.5 shadow-sm">
                    <span>${statusIcon}</span>
                    <span>${statusText}</span>
                </div>

                <!-- Contenido Principal: Foto + Información + QR -->
                <div class="p-5 space-y-4 bg-white">
                    <div class="flex gap-4 items-center">
                        <!-- Foto con Dorsal -->
                        <div class="w-24 h-28 flex-shrink-0 bg-slate-50 border-2 border-slate-900 rounded-2xl overflow-hidden shadow-md relative">
                            <img class="w-full h-full object-cover" src="${photoSrc}" alt="${this.escapeHTML(playerName)}" crossorigin="anonymous">
                            ${dorsal ? `<span class="absolute bottom-1 right-1 bg-slate-900 text-white text-xs font-black px-2 py-0.5 rounded-lg shadow">${dorsal}</span>` : ''}
                        </div>

                        <!-- Datos del Jugador -->
                        <div class="flex-1 space-y-1.5 min-w-0">
                            <div>
                                <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide block">EQUIPO</span>
                                <h3 class="text-base font-black text-slate-900 leading-tight truncate">${this.escapeHTML(teamName)}</h3>
                            </div>
                            <div>
                                <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide block">NOMBRE</span>
                                <h2 class="text-lg font-black text-slate-900 leading-tight break-words">${this.escapeHTML(playerName)}</h2>
                            </div>
                            <div class="text-[11px] text-slate-600 font-semibold flex items-center gap-2">
                                <span><strong class="text-slate-900 font-black">${this.escapeHTML(docType)}:</strong> ${this.escapeHTML(docNumber)}</span>
                                ${position ? `<span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-700">${this.escapeHTML(position)}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Código QR Oficial -->
                    <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center space-y-2">
                        <span class="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                            CÓDIGO QR PARA VALIDACIÓN EN CANCHA
                        </span>
                        <div class="w-36 h-36 mx-auto bg-white p-2 border-2 border-slate-900 rounded-2xl shadow-sm flex items-center justify-center">
                            <img class="w-full h-full object-contain" src="${qrSrc}" alt="QR Verificación" crossorigin="anonymous">
                        </div>
                        <p class="text-[10px] text-slate-500 leading-tight">
                            Escanea para verificar autenticidad en tiempo real en la cancha.
                        </p>
                    </div>
                </div>

                <!-- Pie de Seguridad con Token Oficial -->
                <div class="bg-slate-50 px-5 py-2.5 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span>TOKEN: <strong class="text-slate-800 font-bold">${this.escapeHTML(token)}</strong></span>
                    <span class="text-emerald-700 font-extrabold tracking-wide">DIGITAL PASS</span>
                </div>
            </div>
        `;
    },

    /**
     * Muestra notificación flotante elegante
     */
    showGlobalToast(message) {
        if (typeof alertify !== 'undefined') {
            alertify.success(message);
            return;
        }
        let toast = document.getElementById('carnetDownloaderToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'carnetDownloaderToast';
            toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 transition-all duration-300 transform opacity-0 pointer-events-none';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span>📸</span> <span>${this.escapeHTML(message)}</span>`;
        toast.classList.remove('opacity-0', 'pointer-events-none');
        toast.classList.add('opacity-100', 'translate-y-2');

        setTimeout(() => {
            toast.classList.remove('opacity-100', 'translate-y-2');
            toast.classList.add('opacity-0', 'pointer-events-none');
        }, 3200);
    },

    escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
};

window.CarnetDownloader = CarnetDownloader;
