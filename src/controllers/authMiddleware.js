const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'torneo_san_antonio_secret_key_2026_xyz';

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No autorizado. Se requiere inicio de sesión.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.queryOne(`
            SELECT u.id, u.name, u.email, u.phone, u.status, r.name as role_name, r.id as role_id
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = ? AND u.status = 'ACTIVE'
        `, [decoded.id]);

        if (!user) {
            return res.status(403).json({ error: 'Usuario no encontrado o inactivo.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Sesión inválida o expirada.' });
    }
}

function requireSuperAdmin(req, res, next) {
    if (req.user && req.user.role_name === 'SUPER_ADMIN') {
        return next();
    }
    return res.status(403).json({ error: 'Acceso restringido: Se requiere rol de Super Administrador.' });
}

function requireOrganizerOrAdmin(req, res, next) {
    if (req.user && (req.user.role_name === 'SUPER_ADMIN' || req.user.role_name === 'ORGANIZADOR')) {
        return next();
    }
    return res.status(403).json({ error: 'Acceso restringido: Se requiere rol de Organizador o Super Administrador.' });
}

async function authenticateMaster(req, res, next) {
    const authHeader = req.headers['authorization'];
    const masterHeader = req.headers['x-master-key'];
    const token = authHeader && authHeader.split(' ')[1];

    // Verificar si se pasó el token maestro JWT
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.isMaster) {
                req.isMaster = true;
                return next();
            }
        } catch (_) {}
    }

    // O verificar si se envió la clave maestra directamente en header x-master-key o body
    const masterKeyInput = masterHeader || (req.body && req.body.master_key);
    if (masterKeyInput) {
        try {
            const config = await db.queryOne('SELECT master_key_hash FROM subscription_config WHERE id = 1');
            if (config) {
                const bcrypt = require('bcryptjs');
                if (bcrypt.compareSync(masterKeyInput, config.master_key_hash)) {
                    req.isMaster = true;
                    return next();
                }
            }
        } catch (_) {}
    }

    return res.status(403).json({ error: 'Acceso no autorizado: Se requiere la Clave Maestra de Desarrollador.' });
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    requireSuperAdmin,
    requireOrganizerOrAdmin,
    authenticateMaster
};
