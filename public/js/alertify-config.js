/**
 * Configuración global y personalización de AlertifyJS
 * Provee modales y notificaciones elegantes acordes al diseño del sistema.
 */
(function () {
    if (typeof alertify !== 'undefined') {
        alertify.defaults.transition = 'zoom';
        alertify.defaults.theme.ok = 'ajs-button ajs-ok';
        alertify.defaults.theme.cancel = 'ajs-button ajs-cancel';
        alertify.defaults.glossary.title = '⚽ Torneo de Fútbol';
        alertify.defaults.glossary.ok = 'Aceptar';
        alertify.defaults.glossary.cancel = 'Cancelar';
        
        alertify.set('notifier', 'position', 'top-right');
        alertify.set('notifier', 'delay', 4);

        // Reemplazo transparente del alert() nativo del navegador
        window.alert = function (message) {
            if (message === undefined || message === null) return;
            const str = String(message).trim();
            if (!str) return;

            const lower = str.toLowerCase();
            const cleanStr = str.replace(/^[✓✔❌⚠️?!¡]+\s*/, '');

            if (str.startsWith('✓') || str.startsWith('✔') || lower.includes('correctamente') || lower.includes('éxito') || lower.includes('exitosamente') || lower.includes('copiado')) {
                alertify.success(cleanStr || str);
            } else if (str.startsWith('❌') || lower.includes('error') || lower.includes('inválid') || lower.includes('restringido') || lower.includes('no se pudo')) {
                alertify.error(cleanStr || str);
            } else if (str.startsWith('⚠️') || lower.includes('atención') || lower.includes('cuidado') || lower.includes('debe tener') || lower.includes('no coinciden')) {
                alertify.warning(cleanStr || str);
            } else {
                alertify.alert('Notificación', str);
            }
        };
    }
})();
