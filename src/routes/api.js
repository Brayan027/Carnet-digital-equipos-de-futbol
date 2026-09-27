const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const QRCode = require('qrcode');
const db = require('../db/database');
const {
    JWT_SECRET,
    authenticateToken,
    requireSuperAdmin,
    requireOrganizerOrAdmin,
    authenticateMaster
} = require('../controllers/authMiddleware');

// Middleware para verificar suspensión por suscripción en operaciones de escritura
router.use(async (req, res, next) => {
    // Rutas y métodos excluidos del bloqueo (consultas públicas, autenticación y gestión de suscripción)
    if (
        req.path.startsWith('/subscription') ||
        req.path === '/auth/login' ||
        req.method === 'GET'
    ) {
        return next();
    }

    try {
        const sub = await db.queryOne('SELECT is_blocked, block_mode, message FROM subscription_config WHERE id = 1');
        if (sub && Number(sub.is_blocked) === 1 && sub.block_mode === 'TOTAL') {
            // Verificar si la petición proviene del Desarrollador Maestro
            const authHeader = req.headers['authorization'];
            const masterHeader = req.headers['x-master-key'];
            const token = authHeader && authHeader.split(' ')[1];

            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded && decoded.isMaster) {
                        return next();
                    }
                } catch (_) {}
            }

            if (masterHeader) {
                const config = await db.queryOne('SELECT master_key_hash FROM subscription_config WHERE id = 1');
                if (config && bcrypt.compareSync(masterHeader, config.master_key_hash)) {
                    return next();
                }
            }

            return res.status(403).json({
                error: 'El servicio se encuentra suspendido por falta de pago de suscripción.',
                subscription_blocked: true,
                message: sub.message
            });
        }
    } catch (_) {}

    next();
});

// Asegurar carpeta uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de Multer en memoria para procesar con Sharp sin I/O intermedio
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB de límite máximo
});

/**
 * Optimiza y renderiza imágenes en el servidor usando Sharp:
 * - Auto-rota según EXIF de la cámara móvil.
 * - Redimensiona al tamaño ideal (700x850 para fotos, 400x400 para logos).
 * - Convierte a formato WebP moderno de alta eficiencia con calidad 80.
 * - Elimina metadatos innecesarios ahorrando espacio en disco y memoria.
 */
async function processAndSaveImage(fileBuffer, type = 'photo') {
    if (!fileBuffer || fileBuffer.length === 0) return null;

    const isLogo = type === 'logo';
    const maxWidth = isLogo ? 400 : 700;
    const maxHeight = isLogo ? 400 : 850;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const filename = `${type}-${uniqueSuffix}.webp`;
    const outputPath = path.join(uploadDir, filename);

    try {
        let pipeline = sharp(fileBuffer).rotate();

        if (isLogo) {
            pipeline = pipeline.resize(maxWidth, maxHeight, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 },
                withoutEnlargement: true
            });
        } else {
            pipeline = pipeline.resize(maxWidth, maxHeight, {
                fit: 'cover',
                position: 'center',
                withoutEnlargement: true
            });
        }

        await pipeline
            .webp({ quality: 80, effort: 4 })
            .toFile(outputPath);

        return `/uploads/${filename}`;
    } catch (err) {
        console.error('Error procesando imagen con Sharp:', err);
        const fallbackName = `${type}-${uniqueSuffix}.jpg`;
        const fallbackPath = path.join(uploadDir, fallbackName);
        fs.writeFileSync(fallbackPath, fileBuffer);
        return `/uploads/${fallbackName}`;
    }
}

/**
 * Resuelve imagen desde archivo subido o string (Base64 / URL)
 */
async function resolveImageInput(file, bodyValue, type = 'photo') {
    if (file && file.buffer) {
        return await processAndSaveImage(file.buffer, type);
    }
    if (typeof bodyValue === 'string' && bodyValue.trim()) {
        const val = bodyValue.trim();
        if (val.startsWith('data:image/') || val.startsWith('/uploads/') || val.startsWith('http')) {
            return val;
        }
    }
    return null;
}

/**
 * Elimina imágenes reemplazadas o eliminadas para que no ocupen espacio
 */
function deleteOldUploadFile(fileUrl) {
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return;
    try {
        const fullPath = path.join(__dirname, '../../', fileUrl);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    } catch (e) {
        console.warn('No se pudo borrar archivo viejo:', e.message);
    }
}

// Función auxiliar para generar QR
async function generatePlayerQR(token, hostUrl) {
    const targetUrl = hostUrl ? `${hostUrl}/verificar.html?token=${token}` : token;
    return await QRCode.toDataURL(targetUrl, {
        width: 200,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });
}

// ========================================================
// 1. AUTENTICACIÓN Y ROLES
// ========================================================

// Iniciar Sesión
router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos.' });
    }

    try {
        const user = await db.queryOne(`
            SELECT u.id, u.name, u.email, u.password_hash, u.status, r.name as role_name, r.id as role_id
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = ?
        `, [email.trim().toLowerCase()]);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Tu cuenta está inactiva.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role_name,
                role_id: user.role_id
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener perfil actual
router.get('/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// ========================================================
// 2. GESTIÓN DE USUARIOS (SOLO SUPER ADMIN)
// ========================================================

// Listar usuarios
router.get('/users', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const users = await db.query(`
            SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, r.name as role_name, r.id as role_id, r.description as role_description
            FROM users u
            JOIN roles r ON u.role_id = r.id
            ORDER BY u.created_at DESC
        `);
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar roles disponibles
router.get('/roles', authenticateToken, async (req, res) => {
    try {
        const roles = await db.query(`SELECT * FROM roles ORDER BY id ASC`);
        res.json({ roles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear usuario y asignar rol (Super Admin o Dueño asignando delegados)
router.post('/users', authenticateToken, requireSuperAdmin, async (req, res) => {
    const { name, email, password, role_id, phone } = req.body;
    if (!name || !email || !password || !role_id) {
        return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse.' });
    }

    try {
        const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const passHash = bcrypt.hashSync(password, 10);

        await db.execute(`
            INSERT INTO users (id, role_id, name, email, password_hash, phone, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [userId, role_id, name.trim(), email.trim().toLowerCase(), passHash, phone || null]);

        res.json({ success: true, message: 'Usuario creado exitosamente.', userId });
    } catch (err) {
        if (
            err.code === 'ER_DUP_ENTRY' ||
            (err.message && err.message.includes('UNIQUE constraint failed: users.email')) ||
            (err.message && err.message.includes('Duplicate entry'))
        ) {
            return res.status(400).json({ error: 'Ya existe un usuario con este correo electrónico.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Modificar rol o estado de usuario
router.put('/users/:id/role', authenticateToken, requireSuperAdmin, async (req, res) => {
    const { role_id, status } = req.body;
    const { id } = req.params;

    try {
        if (role_id) {
            await db.execute(`UPDATE users SET role_id = ? WHERE id = ?`, [role_id, id]);
        }
        if (status) {
            await db.execute(`UPDATE users SET status = ? WHERE id = ?`, [status, id]);
        }
        res.json({ success: true, message: 'Usuario actualizado correctamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cambiar contraseña de usuario (Solo Super Admin / El Jefe)
router.put('/users/:id/password', authenticateToken, requireSuperAdmin, async (req, res) => {
    const { password } = req.body;
    const { id } = req.params;
    if (!password || password.toString().trim().length < 4) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }
    try {
        const passHash = bcrypt.hashSync(password.toString().trim(), 10);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passHash, id]);
        res.json({ success: true, message: 'Contraseña actualizada exitosamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar usuario (Solo Super Admin / El Jefe)
router.delete('/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    if (id === 'usr_superadmin') {
        return res.status(400).json({ error: 'No se puede eliminar la cuenta principal del Super Administrador.' });
    }
    try {
        await db.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'Usuario eliminado correctamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================================
// 3. TORNEO Y CONFIGURACIÓN
// ========================================================

// Obtener detalles del torneo activo
router.get('/tournament', async (req, res) => {
    try {
        const tournament = await db.queryOne(`SELECT * FROM tournaments LIMIT 1`);
        if (!tournament) {
            return res.status(404).json({ error: 'No hay torneo configurado.' });
        }
        res.json({ tournament });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar torneo (Nombre, cabecera, logo)
router.put('/tournament', authenticateToken, requireOrganizerOrAdmin, upload.single('logo'), async (req, res) => {
    const { name, edition, header_style, show_dorsal, show_dni, logo } = req.body;

    try {
        const tournament = await db.queryOne(`SELECT id, logo_url FROM tournaments LIMIT 1`);
        if (!tournament) {
            return res.status(404).json({ error: 'No hay torneo configurado.' });
        }

        let logoUrl = tournament.logo_url;
        const newLogoUrl = await resolveImageInput(req.file, logo, 'logo');
        if (newLogoUrl) {
            if (logoUrl && logoUrl !== newLogoUrl) {
                deleteOldUploadFile(logoUrl);
            }
            logoUrl = newLogoUrl;
        }

        await db.execute(`
            UPDATE tournaments SET
                name = COALESCE(?, name),
                edition = COALESCE(?, edition),
                header_style = COALESCE(?, header_style),
                show_dorsal = COALESCE(?, show_dorsal),
                show_dni = COALESCE(?, show_dni),
                logo_url = ?
            WHERE id = ?
        `, [
            name ? name.toUpperCase() : null,
            edition || null,
            header_style || null,
            show_dorsal !== undefined ? (show_dorsal ? 1 : 0) : null,
            show_dni !== undefined ? (show_dni ? 1 : 0) : null,
            logoUrl,
            tournament.id
        ]);

        res.json({ success: true, message: 'Torneo actualizado exitosamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================================
// 4. EQUIPOS (TEAMS)
// ========================================================

// Listar equipos (público / para el formulario móvil)
router.get('/teams', async (req, res) => {
    try {
        const tournament = await db.queryOne(`SELECT id FROM tournaments LIMIT 1`);
        if (!tournament) return res.json({ teams: [] });

        const teams = await db.query(`
            SELECT t.*, COUNT(p.id) as player_count
            FROM teams t
            LEFT JOIN players p ON t.id = p.team_id
            WHERE t.tournament_id = ?
            GROUP BY t.id
            ORDER BY t.name ASC
        `, [tournament.id]);

        res.json({ teams });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear equipo (Dueño de Torneo / Admin)
router.post('/teams', authenticateToken, requireOrganizerOrAdmin, upload.single('logo'), async (req, res) => {
    const { name, short_name, color, delegate_name, delegate_phone, logo } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre del equipo es obligatorio.' });

    try {
        const tournament = await db.queryOne(`SELECT id FROM tournaments LIMIT 1`);
        if (!tournament) return res.status(400).json({ error: 'No hay torneo configurado.' });

        const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const logoUrl = await resolveImageInput(req.file, logo, 'logo');

        await db.execute(`
            INSERT INTO teams (id, tournament_id, name, short_name, logo_url, color, delegate_name, delegate_phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [teamId, tournament.id, name.trim(), short_name || null, logoUrl, color || '#1e3a8a', delegate_name || null, delegate_phone || null]);

        res.json({ success: true, message: 'Equipo registrado con éxito.', teamId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar equipo
router.put('/teams/:id', authenticateToken, requireOrganizerOrAdmin, upload.single('logo'), async (req, res) => {
    const { id } = req.params;
    const { name, short_name, color, delegate_name, delegate_phone, logo } = req.body;

    try {
        const current = await db.queryOne(`SELECT logo_url FROM teams WHERE id = ?`, [id]);
        if (!current) {
            return res.status(404).json({ error: 'Equipo no encontrado.' });
        }

        let logoUrl = current.logo_url;
        const newLogoUrl = await resolveImageInput(req.file, logo, 'logo');
        if (newLogoUrl) {
            if (logoUrl && logoUrl !== newLogoUrl) {
                deleteOldUploadFile(logoUrl);
            }
            logoUrl = newLogoUrl;
        }

        await db.execute(`
            UPDATE teams SET
                name = COALESCE(?, name),
                short_name = COALESCE(?, short_name),
                color = COALESCE(?, color),
                delegate_name = COALESCE(?, delegate_name),
                delegate_phone = COALESCE(?, delegate_phone),
                logo_url = ?
            WHERE id = ?
        `, [name || null, short_name || null, color || null, delegate_name || null, delegate_phone || null, logoUrl, id]);

        res.json({ success: true, message: 'Equipo actualizado.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar equipo
router.delete('/teams/:id', authenticateToken, requireOrganizerOrAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute(`DELETE FROM teams WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Equipo eliminado correctamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================================
// 5. JUGADORES (PLAYERS) & APROBACIÓN
// ========================================================

// Listar jugadores (con filtros de equipo y estado de verificación)
router.get('/players', async (req, res) => {
    const { team_id, status, search } = req.query;

    let sql = `
        SELECT p.*, t.name as team_name, t.logo_url as team_logo, t.color as team_color,
               trn.name as tournament_name, trn.edition as tournament_edition, trn.logo_url as tournament_logo
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN tournaments trn ON p.tournament_id = trn.id
        WHERE 1=1
    `;
    const params = [];

    if (team_id) {
        sql += ` AND p.team_id = ?`;
        params.push(team_id);
    }
    if (status && status !== 'ALL') {
        sql += ` AND p.status = ?`;
        params.push(status);
    }
    if (search) {
        sql += ` AND (p.full_name LIKE ? OR p.document_number LIKE ? OR t.name LIKE ?)`;
        const q = `%${search}%`;
        params.push(q, q, q);
    }

    sql += ` ORDER BY t.name ASC, p.full_name ASC`;

    try {
        const players = await db.query(sql, params);
        res.json({ players });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// BUSCADOR PÚBLICO DE CARNETS (Búsqueda inmediata por cédula o nombre para descarga rápida)
router.get('/players/search-public', async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Ingresa un número de cédula o nombre para buscar.' });
    }

    const term = q.trim();
    const queryWild = `%${term}%`;

    try {
        const players = await db.query(`
            SELECT p.id, p.full_name, p.document_type, p.document_number, p.dorsal, p.position,
                   p.phone, p.photo_url, p.qr_code_token, p.qr_code_image, p.status, p.rejection_reason, p.created_at,
                   t.name as team_name, t.logo_url as team_logo, t.color as team_color,
                   trn.name as tournament_name, trn.edition as tournament_edition, trn.logo_url as tournament_logo
            FROM players p
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN tournaments trn ON p.tournament_id = trn.id
            WHERE p.document_number = ? 
               OR p.document_number LIKE ? 
               OR p.full_name LIKE ?
            ORDER BY 
               CASE WHEN p.document_number = ? THEN 1
                    WHEN p.document_number LIKE ? THEN 2
                    WHEN p.full_name LIKE ? THEN 3
                    ELSE 4 END,
               p.full_name ASC
            LIMIT 25
        `, [term, queryWild, queryWild, term, `${term}%`, `${term}%`]);

        res.json({
            success: true,
            total: players.length,
            players
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registro Administrativo de Jugador (con aprobación inmediata)
router.post('/players', authenticateToken, requireOrganizerOrAdmin, upload.single('photo'), async (req, res) => {
    const { full_name, team_id, document_type, document_number, dorsal, position, phone, photo } = req.body;
    if (!full_name || !team_id) {
        return res.status(400).json({ error: 'Nombre del jugador y equipo son obligatorios.' });
    }

    try {
        const tournament = await db.queryOne(`SELECT id FROM tournaments LIMIT 1`);
        if (!tournament) return res.status(400).json({ error: 'No hay torneo configurado.' });

        const playerId = 'ply_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const photoUrl = await resolveImageInput(req.file, photo, 'photo');

        // Generar Token QR único
        const token = `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const qrDataUrl = await generatePlayerQR(token, hostUrl);

        await db.execute(`
            INSERT INTO players (
                id, tournament_id, team_id, full_name, document_type, document_number,
                dorsal, position, phone, photo_url, qr_code_token, qr_code_image,
                status, verified_at, verified_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', CURRENT_TIMESTAMP, ?)
        `, [
            playerId, tournament.id, team_id, full_name.trim(), document_type || 'CC',
            document_number || null, dorsal || null, position || null, phone || null,
            photoUrl, token, qrDataUrl, req.user.id
        ]);

        res.json({ success: true, message: 'Jugador registrado y habilitado.', playerId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// REGISTRO PÚBLICO MÓVIL (Cualquier jugador o capitán llena el formulario desde su celular)
router.post('/players/public-register', upload.single('photo'), async (req, res) => {
    const { full_name, team_id, document_type, document_number, dorsal, position, phone, photo } = req.body;
    if (!full_name || !team_id) {
        return res.status(400).json({ error: 'Nombre completo y equipo son obligatorios.' });
    }

    try {
        const tournament = await db.queryOne(`SELECT id, name, logo_url FROM tournaments LIMIT 1`);
        if (!tournament) return res.status(400).json({ error: 'No hay torneo configurado.' });

        const playerId = 'ply_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const photoUrl = await resolveImageInput(req.file, photo, 'photo');

        // Token QR único
        const token = `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const qrDataUrl = await generatePlayerQR(token, hostUrl);

        await db.execute(`
            INSERT INTO players (
                id, tournament_id, team_id, full_name, document_type, document_number,
                dorsal, position, phone, photo_url, qr_code_token, qr_code_image,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `, [
            playerId, tournament.id, team_id, full_name.trim(), document_type || 'CC',
            document_number || null, dorsal || null, position || null, phone || null,
            photoUrl, token, qrDataUrl
        ]);

        const team = await db.queryOne(`SELECT name, logo_url FROM teams WHERE id = ?`, [team_id]);

        const player = {
            id: playerId,
            tournament_id: tournament.id,
            tournament_name: tournament.name || 'Torneo de Fútbol',
            team_id,
            team_name: team ? team.name : 'Sin Equipo',
            full_name: full_name.trim(),
            document_type: document_type || 'CC',
            document_number: document_number || null,
            dorsal: dorsal || null,
            position: position || null,
            phone: phone || null,
            photo_url: photoUrl,
            qr_code_token: token,
            qr_code_image: qrDataUrl,
            status: 'PENDING'
        };

        res.json({
            success: true,
            message: '¡Registro enviado con éxito! Los organizadores revisarán y aprobarán tus datos en breve.',
            token,
            player
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener un jugador por ID
router.get('/players/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const player = await db.queryOne(`
            SELECT p.*, t.name as team_name, t.logo_url as team_logo, t.color as team_color,
                   trn.name as tournament_name, trn.edition as tournament_edition, trn.logo_url as tournament_logo
            FROM players p
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN tournaments trn ON p.tournament_id = trn.id
            WHERE p.id = ?
        `, [id]);

        if (!player) {
            return res.status(404).json({ error: 'Jugador no encontrado.' });
        }

        res.json({ player });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Función compartida para actualizar datos de un carnet / jugador
async function updatePlayerData(playerId, body, file) {
    const existing = await db.queryOne('SELECT * FROM players WHERE id = ?', [playerId]);
    if (!existing) {
        return { error: 'Jugador no encontrado.', status: 404 };
    }

    const payload = body || {};
    const {
        full_name,
        team_id,
        document_type,
        document_number,
        dorsal,
        position,
        phone,
        status,
        rejection_reason,
        photo
    } = payload;

    let photoUrl = existing.photo_url;
    const newPhotoUrl = await resolveImageInput(file, photo, 'photo');
    if (newPhotoUrl) {
        if (photoUrl && photoUrl !== newPhotoUrl) {
            deleteOldUploadFile(photoUrl);
        }
        photoUrl = newPhotoUrl;
    }

    const newFullName = (full_name !== undefined && full_name.trim() !== '') ? full_name.trim() : existing.full_name;
    const newTeamId = (team_id !== undefined) ? (team_id === '' ? null : team_id) : existing.team_id;
    const newDocType = (document_type !== undefined && document_type.trim() !== '') ? document_type.trim() : existing.document_type;
    const newDocNumber = (document_number !== undefined) ? (document_number.trim() === '' ? null : document_number.trim()) : existing.document_number;
    const newDorsal = (dorsal !== undefined) ? (dorsal.toString().trim() === '' ? null : dorsal.toString().trim()) : existing.dorsal;
    const newPosition = (position !== undefined) ? (position.trim() === '' ? null : position.trim()) : existing.position;
    const newPhone = (phone !== undefined) ? (phone.trim() === '' ? null : phone.trim()) : existing.phone;
    const newStatus = (status && ['VERIFIED', 'PENDING', 'REJECTED'].includes(status)) ? status : existing.status;
    const newRejectionReason = (rejection_reason !== undefined) ? rejection_reason : existing.rejection_reason;

    await db.execute(`
        UPDATE players SET
            full_name = ?,
            team_id = ?,
            document_type = ?,
            document_number = ?,
            dorsal = ?,
            position = ?,
            phone = ?,
            photo_url = ?,
            status = ?,
            rejection_reason = ?,
            verified_at = CASE 
                WHEN ? = 'VERIFIED' AND (status != 'VERIFIED' OR verified_at IS NULL) THEN CURRENT_TIMESTAMP 
                ELSE verified_at 
            END
        WHERE id = ?
    `, [
        newFullName,
        newTeamId,
        newDocType,
        newDocNumber,
        newDorsal,
        newPosition,
        newPhone,
        photoUrl,
        newStatus,
        newRejectionReason,
        newStatus,
        playerId
    ]);

    const updated = await db.queryOne(`
        SELECT p.*, t.name as team_name, t.logo_url as team_logo, t.color as team_color,
               trn.name as tournament_name, trn.edition as tournament_edition, trn.logo_url as tournament_logo
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN tournaments trn ON p.tournament_id = trn.id
        WHERE p.id = ?
    `, [playerId]);

    return { success: true, player: updated };
}

// Editar datos del carnet / jugador por ID
router.put('/players/:id', upload.single('photo'), async (req, res) => {
    try {
        const result = await updatePlayerData(req.params.id, req.body, req.file);
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json({
            success: true,
            message: 'Datos del carnet actualizados exitosamente.',
            player: result.player
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar datos del carnet / jugador por Token QR
router.put('/players/token/:token', upload.single('photo'), async (req, res) => {
    try {
        const existing = await db.queryOne('SELECT id FROM players WHERE qr_code_token = ?', [req.params.token]);
        if (!existing) {
            return res.status(404).json({ error: 'Carnet no encontrado para este código QR.' });
        }
        const result = await updatePlayerData(existing.id, req.body, req.file);
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json({
            success: true,
            message: 'Datos del carnet actualizados exitosamente.',
            player: result.player
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aprobar o Rechazar Jugador (Dueño de Torneo / Admin)
router.put('/players/:id/status', authenticateToken, requireOrganizerOrAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(status)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    try {
        await db.execute(`
            UPDATE players SET
                status = ?,
                rejection_reason = ?,
                verified_at = CASE WHEN ? = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE verified_at END,
                verified_by = ?
            WHERE id = ?
        `, [status, rejection_reason || null, status, req.user.id, id]);

        res.json({ success: true, message: `Jugador marcado como ${status}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar jugador (y limpiar su foto de uploads si existe)
router.delete('/players/:id', authenticateToken, requireOrganizerOrAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const player = await db.queryOne(`SELECT photo_url FROM players WHERE id = ?`, [id]);
        if (player && player.photo_url) {
            deleteOldUploadFile(player.photo_url);
        }
        await db.execute(`DELETE FROM players WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Jugador eliminado.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================================
// 6. VERIFICACIÓN PÚBLICA DE QR (AL ESCANEAR CON CELULAR)
// ========================================================
router.get('/verify/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const player = await db.queryOne(`
            SELECT p.id, p.full_name, p.document_type, p.document_number, p.dorsal, p.position,
                   p.photo_url, p.status, p.rejection_reason, p.verified_at,
                   t.name as team_name, t.logo_url as team_logo,
                   trn.name as tournament_name, trn.edition as tournament_edition, trn.logo_url as tournament_logo
            FROM players p
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN tournaments trn ON p.tournament_id = trn.id
            WHERE p.qr_code_token = ?
        `, [token]);

        if (!player) {
            return res.status(404).json({
                found: false,
                error: 'Carnet o código QR no registrado en el sistema oficial del torneo.'
            });
        }

        res.json({
            found: true,
            player
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================================
// 7. GENERADOR LOCAL DE CÓDIGOS QR (Sin dependencias externas)
// ========================================================
router.get('/qr', async (req, res) => {
    const data = req.query.data || req.query.text;
    if (!data) {
        return res.status(400).send('Parámetro data requerido');
    }

    try {
        const qrBuffer = await QRCode.toBuffer(data, {
            width: 260,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.send(qrBuffer);
    } catch (err) {
        res.status(500).send('Error generando QR');
    }
});

// ========================================================
// 8. CONTROL MAESTRO DE SUSCRIPCIÓN & LICENCIA
// ========================================================

// Consultar estado de suscripción (Público, para verificar si se bloquea la vista)
router.get('/subscription/status', async (req, res) => {
    try {
        const config = await db.queryOne(`
            SELECT is_blocked, block_mode, title, message, contact_phone, payment_info, updated_at
            FROM subscription_config WHERE id = 1
        `);

        if (!config) {
            return res.json({
                is_blocked: 0,
                block_mode: 'TOTAL',
                title: 'Suscripción Pendiente de Pago',
                message: 'El servicio se encuentra temporalmente suspendido por falta de pago.',
                contact_phone: '',
                payment_info: ''
            });
        }

        res.json({
            is_blocked: Number(config.is_blocked),
            block_mode: config.block_mode || 'TOTAL',
            title: config.title || 'Suscripción Pendiente de Pago',
            message: config.message || '',
            contact_phone: config.contact_phone || '',
            payment_info: config.payment_info || '',
            updated_at: config.updated_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Validar Clave Maestra de Desarrollador
router.post('/subscription/verify-master', async (req, res) => {
    const { master_key } = req.body;
    if (!master_key) {
        return res.status(400).json({ error: 'Debes ingresar la Clave Maestra.' });
    }

    try {
        const config = await db.queryOne('SELECT master_key_hash FROM subscription_config WHERE id = 1');
        if (!config || !bcrypt.compareSync(master_key.toString().trim(), config.master_key_hash)) {
            return res.status(401).json({ error: 'Clave Maestra incorrecta. Acceso restringido.' });
        }

        // Generar token JWT con permisos exclusivos de desarrollador maestro
        const masterToken = jwt.sign(
            { role: 'MASTER_DEV', isMaster: true },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Acceso maestro validado exitosamente.',
            master_token: masterToken
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener configuración completa (Solo para el desarrollador autenticado)
router.get('/subscription/full', authenticateMaster, async (req, res) => {
    try {
        const config = await db.queryOne(`
            SELECT is_blocked, block_mode, title, message, contact_phone, payment_info, updated_at
            FROM subscription_config WHERE id = 1
        `);
        res.json({ success: true, subscription: config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar o cambiar estado de suscripción, mensaje, bloqueo o cambiar clave maestra
router.put('/subscription/settings', authenticateMaster, async (req, res) => {
    const {
        is_blocked,
        block_mode,
        title,
        message,
        contact_phone,
        payment_info,
        new_master_key
    } = req.body;

    try {
        const current = await db.queryOne('SELECT * FROM subscription_config WHERE id = 1');
        if (!current) {
            return res.status(404).json({ error: 'Configuración no encontrada.' });
        }

        let newHash = current.master_key_hash;
        if (new_master_key && new_master_key.toString().trim().length >= 4) {
            newHash = bcrypt.hashSync(new_master_key.toString().trim(), 10);
        }

        const updatedIsBlocked = (is_blocked !== undefined) ? (is_blocked ? 1 : 0) : current.is_blocked;
        const updatedMode = (block_mode && ['TOTAL', 'WARNING'].includes(block_mode)) ? block_mode : current.block_mode;
        const updatedTitle = (title !== undefined && title.trim() !== '') ? title.trim() : current.title;
        const updatedMessage = (message !== undefined && message.trim() !== '') ? message.trim() : current.message;
        const updatedPhone = (contact_phone !== undefined) ? contact_phone.trim() : current.contact_phone;
        const updatedPaymentInfo = (payment_info !== undefined) ? payment_info.trim() : current.payment_info;

        await db.execute(`
            UPDATE subscription_config SET
                is_blocked = ?,
                block_mode = ?,
                title = ?,
                message = ?,
                contact_phone = ?,
                payment_info = ?,
                master_key_hash = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [
            updatedIsBlocked,
            updatedMode,
            updatedTitle,
            updatedMessage,
            updatedPhone,
            updatedPaymentInfo,
            newHash
        ]);

        res.json({
            success: true,
            message: 'Configuración de suscripción guardada exitosamente.',
            subscription: {
                is_blocked: updatedIsBlocked,
                block_mode: updatedMode,
                title: updatedTitle,
                message: updatedMessage,
                contact_phone: updatedPhone,
                payment_info: updatedPaymentInfo
            },
            key_changed: Boolean(new_master_key && new_master_key.toString().trim().length >= 4)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
