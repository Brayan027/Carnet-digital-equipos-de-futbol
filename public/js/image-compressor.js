/**
 * Utilidad de Optimización y Renderizado Previo de Imágenes en el Cliente
 * Permite comprimir y redimensionar fotos antes de enviarlas al servidor.
 * Reduce fotos de 5MB-15MB tomadas desde celulares a ~50KB-90KB en milisegundos.
 */
window.ImageCompressor = (function () {
    /**
     * Renderiza y comprime una imagen usando Canvas antes de subirla.
     * @param {File|Blob} file Archivo original de imagen
     * @param {Object} options Opciones de compresión
     * @returns {Promise<File>} Archivo comprimido optimizado
     */
    async function compress(file, options = {}) {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return file;
        }

        const {
            maxWidth = 800,
            maxHeight = 850,
            quality = 0.82,
            type = 'image/webp'
        } = options;

        return new Promise((resolve) => {
            const originalSizeKB = Math.round(file.size / 1024);
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                let { width, height } = img;

                // Calcular dimensiones manteniendo relación de aspecto
                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Renderizar en Canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Filtro bicúbico de alta calidad
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.drawImage(img, 0, 0, width, height);

                // Función auxiliar para exportar a Blob
                const exportBlob = (mime, q) => {
                    return new Promise((res) => {
                        canvas.toBlob((blob) => res(blob), mime, q);
                    });
                };

                // Intentar WebP primero, con fallback a JPEG
                (async () => {
                    let blob = await exportBlob(type, quality);
                    let finalMime = type;
                    let ext = type === 'image/webp' ? '.webp' : '.jpg';

                    if (!blob) {
                        finalMime = 'image/jpeg';
                        ext = '.jpg';
                        blob = await exportBlob(finalMime, quality);
                    }

                    if (!blob) {
                        return resolve(file); // Fallback al archivo original si el canvas fallara
                    }

                    const baseName = (file.name || 'foto').replace(/\.[^/.]+$/, '');
                    const compressedFile = new File([blob], `${baseName}${ext}`, {
                        type: finalMime,
                        lastModified: Date.now()
                    });

                    const compressedSizeKB = Math.round(compressedFile.size / 1024);
                    const savingPct = Math.round((1 - compressedFile.size / file.size) * 100);
                    console.log(`[ImageCompressor] Optimización: ${originalSizeKB} KB -> ${compressedSizeKB} KB (-${savingPct}%) | Dimensiones: ${width}x${height}px`);

                    compressedFile._compressionMeta = {
                        originalSizeKB,
                        compressedSizeKB,
                        savingPct,
                        width,
                        height
                    };

                    resolve(compressedFile);
                })();
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            };

            img.src = objectUrl;
        });
    }

    return { compress };
})();
