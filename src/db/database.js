require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

// Determinar el motor de base de datos según variables de entorno
const isMySQL = Boolean(
    process.env.DB_CLIENT === 'mysql' ||
    process.env.DB_HOST ||
    process.env.MYSQL_HOST
);

let pool = null;
let sqlite = null;
let clientType = 'sqlite';

if (isMySQL) {
    const mysql = require('mysql2/promise');
    clientType = 'mysql';

    const dbHost = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
    const dbUser = process.env.DB_USER || process.env.MYSQL_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
    const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'torneo';
    const dbPort = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);

    pool = mysql.createPool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        charset: 'utf8mb4'
    });

    console.log(`🔌 [BD] Conectando a MySQL (${dbHost}:${dbPort}/${dbName})...`);
    initDatabaseMySQL();
} else {
    clientType = 'sqlite';
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../../torneo.db');
    sqlite = new Database(dbPath);

    // Optimizaciones SQLite
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 10000');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('cache_size = -64000');
    sqlite.pragma('temp_store = MEMORY');

    console.log(`🔌 [BD] Modo local SQLite activo (torneo.db)`);
    initDatabaseSQLite();
}

/**
 * Consulta que retorna un arreglo de filas
 */
async function query(sql, params = []) {
    if (clientType === 'mysql') {
        const [rows] = await pool.query(sql, params);
        return rows;
    } else {
        return sqlite.prepare(sql).all(...params);
    }
}

/**
 * Consulta que retorna una única fila o null
 */
async function queryOne(sql, params = []) {
    if (clientType === 'mysql') {
        const [rows] = await pool.query(sql, params);
        return rows && rows.length > 0 ? rows[0] : null;
    } else {
        const row = sqlite.prepare(sql).get(...params);
        return row || null;
    }
}

/**
 * Consulta de acción (INSERT, UPDATE, DELETE)
 */
async function execute(sql, params = []) {
    if (clientType === 'mysql') {
        const [result] = await pool.query(sql, params);
        return {
            affectedRows: result.affectedRows,
            insertId: result.insertId
        };
    } else {
        const info = sqlite.prepare(sql).run(...params);
        return {
            affectedRows: info.changes,
            insertId: info.lastInsertRowid
        };
    }
}

/**
 * Cierre limpio de la conexión
 */
async function close() {
    if (pool) {
        await pool.end();
    }
    if (sqlite) {
        sqlite.close();
    }
}

/**
 * Inicialización de esquemas y datos iniciales para MySQL
 */
async function initDatabaseMySQL() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT NOT NULL,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255) DEFAULT NULL,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) NOT NULL,
                role_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(50) DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'ACTIVE',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_users_role_id (role_id),
                KEY idx_users_email (email),
                CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tournaments (
                id VARCHAR(50) NOT NULL,
                owner_id VARCHAR(50) DEFAULT NULL,
                name VARCHAR(150) NOT NULL,
                edition VARCHAR(50) DEFAULT NULL,
                logo_url LONGTEXT DEFAULT NULL,
                header_style VARCHAR(50) DEFAULT 'marble',
                show_dorsal TINYINT(1) DEFAULT 0,
                show_dni TINYINT(1) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'ACTIVE',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_tournaments_owner (owner_id),
                CONSTRAINT fk_tournaments_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id VARCHAR(50) NOT NULL,
                tournament_id VARCHAR(50) NOT NULL,
                name VARCHAR(150) NOT NULL,
                short_name VARCHAR(50) DEFAULT NULL,
                logo_url LONGTEXT DEFAULT NULL,
                delegate_name VARCHAR(100) DEFAULT NULL,
                delegate_phone VARCHAR(50) DEFAULT NULL,
                color VARCHAR(30) DEFAULT '#1e3a8a',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_teams_tournament (tournament_id),
                CONSTRAINT fk_teams_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id VARCHAR(50) NOT NULL,
                tournament_id VARCHAR(50) NOT NULL,
                team_id VARCHAR(50) DEFAULT NULL,
                full_name VARCHAR(150) NOT NULL,
                document_type VARCHAR(20) DEFAULT 'CC',
                document_number VARCHAR(50) DEFAULT NULL,
                dorsal VARCHAR(10) DEFAULT NULL,
                position VARCHAR(50) DEFAULT NULL,
                birth_date VARCHAR(50) DEFAULT NULL,
                phone VARCHAR(50) DEFAULT NULL,
                photo_url LONGTEXT DEFAULT NULL,
                qr_code_token VARCHAR(100) NOT NULL UNIQUE,
                qr_code_image LONGTEXT DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'VERIFIED',
                rejection_reason TEXT DEFAULT NULL,
                verified_at DATETIME DEFAULT NULL,
                verified_by VARCHAR(50) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_players_token (qr_code_token),
                KEY idx_players_team (team_id),
                KEY idx_players_status (status),
                KEY idx_players_tournament (tournament_id),
                CONSTRAINT fk_players_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_players_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_players_verifier FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS matches (
                id VARCHAR(50) NOT NULL,
                tournament_id VARCHAR(50) NOT NULL,
                home_team_id VARCHAR(50) DEFAULT NULL,
                away_team_id VARCHAR(50) DEFAULT NULL,
                match_date DATETIME DEFAULT NULL,
                field_name VARCHAR(100) DEFAULT NULL,
                home_score INT DEFAULT 0,
                away_score INT DEFAULT 0,
                status VARCHAR(50) DEFAULT 'SCHEDULED',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_matches_tournament (tournament_id),
                KEY idx_matches_home (home_team_id),
                KEY idx_matches_away (away_team_id),
                CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_matches_home FOREIGN KEY (home_team_id) REFERENCES teams (id) ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_matches_away FOREIGN KEY (away_team_id) REFERENCES teams (id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS match_events (
                id VARCHAR(50) NOT NULL,
                match_id VARCHAR(50) NOT NULL,
                player_id VARCHAR(50) DEFAULT NULL,
                team_id VARCHAR(50) DEFAULT NULL,
                event_type VARCHAR(50) NOT NULL,
                minute INT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_match_events_match (match_id),
                KEY idx_match_events_player (player_id),
                KEY idx_match_events_team (team_id),
                CONSTRAINT fk_match_events_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_match_events_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_match_events_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscription_config (
                id INT NOT NULL,
                is_blocked TINYINT(1) DEFAULT 0,
                block_mode VARCHAR(20) DEFAULT 'TOTAL',
                title VARCHAR(255) DEFAULT 'Suscripción Pendiente de Pago',
                message TEXT DEFAULT NULL,
                contact_phone VARCHAR(50) DEFAULT NULL,
                payment_info TEXT DEFAULT NULL,
                master_key_hash VARCHAR(255) NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Roles iniciales
        await pool.query(`INSERT IGNORE INTO roles (id, name, description) VALUES 
            (1, 'SUPER_ADMIN', 'Super Administrador con control total del sistema y gestión de usuarios'),
            (2, 'ORGANIZADOR', 'Dueño de Torneo/App: gestiona equipos, jugadores y carnetización'),
            (3, 'DELEGADO', 'Delegado/Capitán de equipo: inscribe jugadores de su equipo'),
            (4, 'ARBITRO', 'Veedor o árbitro: escanea y valida credenciales en cancha')
        `);

        // Configuración de suscripción inicial
        const [subRows] = await pool.query(`SELECT COUNT(*) as count FROM subscription_config`);
        if (subRows[0].count === 0) {
            const masterKeyHash = bcrypt.hashSync('admin2026', 10);
            await pool.query(`
                INSERT INTO subscription_config (id, is_blocked, block_mode, title, message, contact_phone, payment_info, master_key_hash)
                VALUES (1, 0, 'TOTAL', 'Suscripción Pendiente de Pago', 'El acceso al sistema se encuentra temporalmente suspendido por concepto de suscripción.', '', '', ?)
            `, [masterKeyHash]);
        }

        // Si la tabla users está vacía, crear los usuarios por defecto
        const [userCountRows] = await pool.query(`SELECT COUNT(*) as count FROM users`);
        if (userCountRows[0].count === 0) {
            const adminPassHash = bcrypt.hashSync('admin123', 10);
            await pool.query(`
                INSERT INTO users (id, role_id, name, email, password_hash, phone, status)
                VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
            `, ['usr_superadmin', 1, 'Super Administrador', 'admin@torneo.com', adminPassHash, '3001234567']);

            await pool.query(`
                INSERT INTO users (id, role_id, name, email, password_hash, phone, status)
                VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
            `, ['usr_organizador', 2, 'Organizador San Antonio', 'organizador@torneo.com', adminPassHash, '3007654321']);

            await pool.query(`
                INSERT INTO tournaments (id, owner_id, name, edition, header_style, show_dorsal, show_dni, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `, ['trn_san_antonio', 'usr_organizador', 'TORNEO SAN ANTONIO', '2026', 'marble', 0, 0]);

            await pool.query(`
                INSERT INTO teams (id, tournament_id, name, short_name, color, delegate_name, delegate_phone)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, ['team_real_martines', 'trn_san_antonio', 'Real Martines', 'RMA', '#1e3a8a', 'Carlos Martínez', '3109876543']);
        }

        console.log(`✅ [BD] MySQL inicializado y verificado correctamente.`);
    } catch (err) {
        console.error('⚠️ [BD] Error al verificar/inicializar tablas en MySQL:', err.message);
    }
}

/**
 * Inicialización de esquemas y datos iniciales para SQLite
 */
function initDatabaseSQLite() {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            role_id INTEGER NOT NULL REFERENCES roles(id),
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournaments (
            id TEXT PRIMARY KEY,
            owner_id TEXT REFERENCES users(id),
            name TEXT NOT NULL,
            edition TEXT,
            logo_url TEXT,
            header_style TEXT DEFAULT 'marble',
            show_dorsal INTEGER DEFAULT 0,
            show_dni INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            short_name TEXT,
            logo_url TEXT,
            delegate_name TEXT,
            delegate_phone TEXT,
            color TEXT DEFAULT '#1e3a8a',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
            full_name TEXT NOT NULL,
            document_type TEXT DEFAULT 'CC',
            document_number TEXT,
            dorsal TEXT,
            position TEXT,
            birth_date TEXT,
            phone TEXT,
            photo_url TEXT,
            qr_code_token TEXT UNIQUE NOT NULL,
            qr_code_image TEXT,
            status TEXT DEFAULT 'VERIFIED',
            rejection_reason TEXT,
            verified_at DATETIME,
            verified_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS matches (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            home_team_id TEXT REFERENCES teams(id),
            away_team_id TEXT REFERENCES teams(id),
            match_date DATETIME,
            field_name TEXT,
            home_score INTEGER DEFAULT 0,
            away_score INTEGER DEFAULT 0,
            status TEXT DEFAULT 'SCHEDULED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS match_events (
            id TEXT PRIMARY KEY,
            match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            player_id TEXT REFERENCES players(id),
            team_id TEXT REFERENCES teams(id),
            event_type TEXT NOT NULL,
            minute INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subscription_config (
            id INTEGER PRIMARY KEY,
            is_blocked INTEGER DEFAULT 0,
            block_mode TEXT DEFAULT 'TOTAL',
            title TEXT DEFAULT 'Suscripción Pendiente de Pago',
            message TEXT DEFAULT NULL,
            contact_phone TEXT DEFAULT NULL,
            payment_info TEXT DEFAULT NULL,
            master_key_hash TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_players_token ON players(qr_code_token);
        CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
        CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
        CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Configuración de suscripción inicial (SQLite)
    const subCount = sqlite.prepare(`SELECT COUNT(*) as count FROM subscription_config`).get().count;
    if (subCount === 0) {
        const masterKeyHash = bcrypt.hashSync('admin2026', 10);
        sqlite.prepare(`
            INSERT INTO subscription_config (id, is_blocked, block_mode, title, message, contact_phone, payment_info, master_key_hash)
            VALUES (1, 0, 'TOTAL', 'Suscripción Pendiente de Pago', 'El acceso al sistema se encuentra temporalmente suspendido por concepto de suscripción.', '', '', ?)
        `).run(masterKeyHash);
    }

    // Insertar Roles
    const insertRole = sqlite.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`);
    insertRole.run(1, 'SUPER_ADMIN', 'Super Administrador con control total del sistema y gestión de usuarios');
    insertRole.run(2, 'ORGANIZADOR', 'Dueño de Torneo/App: gestiona equipos, jugadores y carnetización');
    insertRole.run(3, 'DELEGADO', 'Delegado/Capitán de equipo: inscribe jugadores de su equipo');
    insertRole.run(4, 'ARBITRO', 'Veedor o árbitro: escanea y valida credenciales en cancha');

    const userCount = sqlite.prepare(`SELECT COUNT(*) as count FROM users`).get().count;
    if (userCount === 0) {
        const adminPassHash = bcrypt.hashSync('admin123', 10);
        sqlite.prepare(`
            INSERT INTO users (id, role_id, name, email, password_hash, phone, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run('usr_superadmin', 1, 'Super Administrador', 'admin@torneo.com', adminPassHash, '3001234567');

        sqlite.prepare(`
            INSERT INTO users (id, role_id, name, email, password_hash, phone, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run('usr_organizador', 2, 'Organizador San Antonio', 'organizador@torneo.com', adminPassHash, '3007654321');

        sqlite.prepare(`
            INSERT INTO tournaments (id, owner_id, name, edition, header_style, show_dorsal, show_dni, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run('trn_san_antonio', 'usr_organizador', 'TORNEO SAN ANTONIO', '2026', 'marble', 0, 0);

        sqlite.prepare(`
            INSERT INTO teams (id, tournament_id, name, short_name, color, delegate_name, delegate_phone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('team_real_martines', 'trn_san_antonio', 'Real Martines', 'RMA', '#1e3a8a', 'Carlos Martínez', '3109876543');
    }
}

module.exports = {
    prepare: (sql) => sqlite ? sqlite.prepare(sql) : null,
    exec: (sql) => sqlite ? sqlite.exec(sql) : null,
    pragma: (str) => sqlite ? sqlite.pragma(str) : null,
    query,
    queryOne,
    execute,
    close,
    clientType: () => clientType,
    isMySQL: () => clientType === 'mysql',
    sqlite
};
