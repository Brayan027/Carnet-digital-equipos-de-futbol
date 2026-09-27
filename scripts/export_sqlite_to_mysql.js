const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../torneo.db');
if (!fs.existsSync(dbPath)) {
    console.error('No se encontró el archivo torneo.db');
    process.exit(1);
}

const sqlite = new Database(dbPath);

function escapeSqlValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'boolean') return val ? '1' : '0';
    // Escapar strings para MySQL
    const str = String(val)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\0/g, '\\0')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
    return `'${str}'`;
}

function generateDump() {
    let sql = `-- ==============================================================================
-- SISTEMA DE TORNEO Y CARNETIZACIÓN DE FÚTBOL
-- DUMP COMPLETO PARA MYSQL / MARIADB (OPTIMIZADO PARA ALWAYSDATA)
-- ==============================================================================
-- Instrucciones para Alwaysdata:
-- 1. En el panel de Alwaysdata, ve a 'Bases de datos' -> 'MySQL'.
-- 2. Abre phpMyAdmin o la consola de MySQL.
-- 3. Selecciona tu base de datos y haz clic en 'Importar', seleccionando este archivo .sql.
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

-- ==============================================================================
-- TABLA: roles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`roles\` (
  \`id\` INT NOT NULL,
  \`name\` VARCHAR(50) NOT NULL UNIQUE,
  \`description\` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: users
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`role_id\` INT NOT NULL,
  \`name\` VARCHAR(100) NOT NULL,
  \`email\` VARCHAR(150) NOT NULL UNIQUE,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`phone\` VARCHAR(50) DEFAULT NULL,
  \`status\` VARCHAR(20) DEFAULT 'ACTIVE',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_users_role_id\` (\`role_id\`),
  KEY \`idx_users_email\` (\`email\`),
  CONSTRAINT \`fk_users_role\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`id\`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: tournaments
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`tournaments\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`owner_id\` VARCHAR(50) DEFAULT NULL,
  \`name\` VARCHAR(150) NOT NULL,
  \`edition\` VARCHAR(50) DEFAULT NULL,
  \`logo_url\` LONGTEXT DEFAULT NULL,
  \`header_style\` VARCHAR(50) DEFAULT 'marble',
  \`show_dorsal\` TINYINT(1) DEFAULT 0,
  \`show_dni\` TINYINT(1) DEFAULT 0,
  \`status\` VARCHAR(20) DEFAULT 'ACTIVE',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_tournaments_owner\` (\`owner_id\`),
  CONSTRAINT \`fk_tournaments_owner\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: teams
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`teams\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`tournament_id\` VARCHAR(50) NOT NULL,
  \`name\` VARCHAR(150) NOT NULL,
  \`short_name\` VARCHAR(50) DEFAULT NULL,
  \`logo_url\` LONGTEXT DEFAULT NULL,
  \`delegate_name\` VARCHAR(100) DEFAULT NULL,
  \`delegate_phone\` VARCHAR(50) DEFAULT NULL,
  \`color\` VARCHAR(30) DEFAULT '#1e3a8a',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_teams_tournament\` (\`tournament_id\`),
  CONSTRAINT \`fk_teams_tournament\` FOREIGN KEY (\`tournament_id\`) REFERENCES \`tournaments\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: players
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`players\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`tournament_id\` VARCHAR(50) NOT NULL,
  \`team_id\` VARCHAR(50) DEFAULT NULL,
  \`full_name\` VARCHAR(150) NOT NULL,
  \`document_type\` VARCHAR(20) DEFAULT 'CC',
  \`document_number\` VARCHAR(50) DEFAULT NULL,
  \`dorsal\` VARCHAR(10) DEFAULT NULL,
  \`position\` VARCHAR(50) DEFAULT NULL,
  \`birth_date\` VARCHAR(50) DEFAULT NULL,
  \`phone\` VARCHAR(50) DEFAULT NULL,
  \`photo_url\` LONGTEXT DEFAULT NULL,
  \`qr_code_token\` VARCHAR(100) NOT NULL UNIQUE,
  \`qr_code_image\` LONGTEXT DEFAULT NULL,
  \`status\` VARCHAR(20) DEFAULT 'VERIFIED',
  \`rejection_reason\` TEXT DEFAULT NULL,
  \`verified_at\` DATETIME DEFAULT NULL,
  \`verified_by\` VARCHAR(50) DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_players_token\` (\`qr_code_token\`),
  KEY \`idx_players_team\` (\`team_id\`),
  KEY \`idx_players_status\` (\`status\`),
  KEY \`idx_players_tournament\` (\`tournament_id\`),
  CONSTRAINT \`fk_players_tournament\` FOREIGN KEY (\`tournament_id\`) REFERENCES \`tournaments\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_players_team\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_players_verifier\` FOREIGN KEY (\`verified_by\` ) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: matches
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`matches\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`tournament_id\` VARCHAR(50) NOT NULL,
  \`home_team_id\` VARCHAR(50) DEFAULT NULL,
  \`away_team_id\` VARCHAR(50) DEFAULT NULL,
  \`match_date\` DATETIME DEFAULT NULL,
  \`field_name\` VARCHAR(100) DEFAULT NULL,
  \`home_score\` INT DEFAULT 0,
  \`away_score\` INT DEFAULT 0,
  \`status\` VARCHAR(50) DEFAULT 'SCHEDULED',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_matches_tournament\` (\`tournament_id\`),
  KEY \`idx_matches_home\` (\`home_team_id\`),
  KEY \`idx_matches_away\` (\`away_team_id\`),
  CONSTRAINT \`fk_matches_tournament\` FOREIGN KEY (\`tournament_id\`) REFERENCES \`tournaments\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_matches_home\` FOREIGN KEY (\`home_team_id\`) REFERENCES \`teams\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_matches_away\` FOREIGN KEY (\`away_team_id\`) REFERENCES \`teams\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: match_events
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`match_events\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`match_id\` VARCHAR(50) NOT NULL,
  \`player_id\` VARCHAR(50) DEFAULT NULL,
  \`team_id\` VARCHAR(50) DEFAULT NULL,
  \`event_type\` VARCHAR(50) NOT NULL,
  \`minute\` INT DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_match_events_match\` (\`match_id\`),
  KEY \`idx_match_events_player\` (\`player_id\`),
  KEY \`idx_match_events_team\` (\`team_id\`),
  CONSTRAINT \`fk_match_events_match\` FOREIGN KEY (\`match_id\`) REFERENCES \`matches\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_match_events_player\` FOREIGN KEY (\`player_id\`) REFERENCES \`players\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_match_events_team\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- TABLA: subscription_config
-- ==============================================================================
CREATE TABLE IF NOT EXISTS \`subscription_config\` (
  \`id\` INT NOT NULL,
  \`is_blocked\` TINYINT(1) DEFAULT 0,
  \`block_mode\` VARCHAR(20) DEFAULT 'TOTAL',
  \`title\` VARCHAR(255) DEFAULT 'Suscripción Pendiente de Pago',
  \`message\` TEXT DEFAULT NULL,
  \`contact_phone\` VARCHAR(50) DEFAULT NULL,
  \`payment_info\` TEXT DEFAULT NULL,
  \`master_key_hash\` VARCHAR(255) NOT NULL,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- INSERCIÓN DE DATOS EXISTENTES
-- ==============================================================================
`;

    const tables = ['roles', 'users', 'tournaments', 'teams', 'players', 'matches', 'match_events', 'subscription_config'];
    for (const tableName of tables) {
        let rows = [];
        try {
            rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
        } catch (_) {
            continue;
        }

        if (rows.length > 0) {
            sql += `\n-- Datos para la tabla: ${tableName}\n`;
            const cols = Object.keys(rows[0]);
            const colList = cols.map(c => `\`${c}\``).join(', ');
            for (const r of rows) {
                const valList = cols.map(c => escapeSqlValue(r[c])).join(', ');
                sql += `INSERT INTO \`${tableName}\` (${colList}) VALUES (${valList}) ON DUPLICATE KEY UPDATE \`id\`=\`id\`;\n`;
            }
        }
    }

    sql += `\nSET FOREIGN_KEY_CHECKS = 1;\n`;
    return sql;
}

const dumpSql = generateDump();
const outputPath = path.join(__dirname, '../torneo_mysql.sql');
fs.writeFileSync(outputPath, dumpSql, 'utf8');
console.log(`Dump MySQL generado exitosamente en: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB)`);
