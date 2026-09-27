const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./src/routes/api');
const db = require('./src/db/database');

const app = express();
const PORT = process.env.PORT || 3050;

// Configurar trust proxy para proxies o túneles locales si se usan
app.set('trust proxy', 1);

// 1. Compresión HTTP Gzip/Brotli de alto rendimiento (reduce ancho de banda en 80%)
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// 2. CORS y parsing
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 3. Rate Limiters para proteger concurrencia y evitar caídas por saturación
const apiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 1500, // hasta 1500 consultas por IP en 10 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Por favor espera un momento.' }
});
app.use('/api', apiLimiter);

const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 120, // hasta 120 inscripciones por IP en 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite temporal de inscripciones alcanzado desde este dispositivo.' }
});
app.use('/api/players/public-register', registerLimiter);

// 4. Servir archivos estáticos del frontend con caché optimizada
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

// Fotos y logos en uploads con caché de navegador prolongada
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d',
    immutable: true,
    etag: true
}));

// 5. Rutas de API
app.use('/api', apiRoutes);

// 6. Rutas amigables para móvil y carnets
app.get('/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/registro.html'));
});

app.get('/carnet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/carnet.html'));
});

app.get('/carnet/:token', (req, res) => {
    res.redirect(`/carnet.html?token=${req.params.token}`);
});

app.get('/c/:token', (req, res) => {
    res.redirect(`/carnet.html?token=${req.params.token}`);
});

app.get('/v/:token', (req, res) => {
    res.redirect(`/verificar.html?token=${req.params.token}`);
});

// Función para obtener la IP local de la máquina (para conectarse desde el celular por Wi-Fi)
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let candidate = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
                    return iface.address;
                }
                if (!iface.address.startsWith('169.254.')) {
                    candidate = iface.address;
                }
            }
        }
    }
    return candidate;
}

const localIp = getLocalIpAddress();

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================================`);
    console.log(` ⚽ SISTEMA DE CARNETIZACIÓN Y TORNEO DE FÚTBOL INICIADO`);
    console.log(` ⚡ MODO MULTI-USUARIO CONCURRENTE & RENDERIZADO WEB COMPRIMIDO`);
    console.log(`==================================================================`);
    console.log(` 💻 Panel Administrador (Local): http://localhost:${PORT}`);
    console.log(` 📱 Acceso Celular / Móvil (Wi-Fi): http://${localIp}:${PORT}`);
    console.log(` 📝 Registro Público de Jugadores: http://${localIp}:${PORT}/registro`);
    console.log(`==================================================================`);
    console.log(` 🔑 Usuarios creados por defecto:`);
    console.log(`    - Super Admin: admin@torneo.com | clave: admin123`);
    console.log(`    - Organizador: organizador@torneo.com | clave: admin123`);
    console.log(`==================================================================`);
});

// Optimización de sockets y timeouts para múltiples conexiones concurrentes
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Manejo robusto de errores para evitar caídas del proceso ante imprevistos
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Error No Capturado]:', err.message || err);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Promesa Rechazada]:', reason);
});

// Cierre ordenado para mantener la integridad de la base de datos
process.on('SIGINT', async () => {
    console.log('\nCerrando servidor y base de datos con seguridad...');
    try { await db.close(); } catch (e) {}
    process.exit(0);
});

module.exports = { app, server };
