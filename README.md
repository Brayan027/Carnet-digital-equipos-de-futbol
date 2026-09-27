# ⚽ Carnet Digital & Sistema de Gestión de Torneos de Fútbol

Plataforma web integral para la administración, digitalización, control disciplinario y carnetización en tiempo real de torneos de fútbol y ligas deportivas. Diseñada con arquitectura modular de alto rendimiento, soporte multi-base de datos (SQLite / MySQL) y validación en campo mediante escaneo QR.

---

## 📌 Tabla de Contenidos
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Funcionalidades Principales](#-funcionalidades-principales)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Seguridad y Control de Acceso (RBAC)](#-seguridad-y-control-de-acceso-rbac)
- [Pipeline de Procesamiento Multimedia](#-pipeline-de-procesamiento-multimedia)
- [Motor de Base de Datos Híbrido](#-motor-de-base-de-datos-híbrido)
- [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
- [Variables de Entorno](#-variables-de-entorno)
- [Despliegue en Producción (Alwaysdata / VPS)](#-despliegue-en-producción-alwaysdata--vps)
- [Endpoints de la API REST](#-endpoints-de-la-api-rest)

---

## 🏛 Arquitectura del Sistema

El sistema implementa una arquitectura desacoplada basada en servicios RESTful y cliente web responsivo optimizado para dispositivos móviles:

```
┌─────────────────────────────────────────────────────────────┐
│                       Cliente Web                           │
│     Tailwind CSS · HTML5 QR Scanner · html2canvas · Alertify│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON / Multipart
┌──────────────────────────────▼──────────────────────────────┐
│                    API Gateway / Express 5                  │
│   Rate Limiter · Gzip/Brotli · JWT Auth · Subscription Lock │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼──────────────┐
│     Multimedia & Sharp      ││     Capa de Datos Híbrida   │
│ EXIF Rotate · WebP · Resize ││  SQLite (WAL) ⇄ MySQL Pool  │
└─────────────────────────────┘└─────────────────────────────┘
```

---

## 🚀 Funcionalidades Principales

### 1. Carnetización Digital Deportiva
- **Generación Dinámica de Carnets**: Renderizado en tiempo real con datos del jugador, dorsal, equipo, categoría, vigencia y código QR único de autenticación.
- **Exportación en Alta Calidad**: Descarga de carnets individuales y masivos en formato PNG/JPG o PDF listo para imprimir mediante `html2canvas`.
- **Diseño Deportivo y Adaptable**: Plantillas estilizadas con soporte para fotos en alta definición y escudos de clubes.

### 2. Verificación en Campo mediante Código QR
- **Escaneo con Cámara Móvil**: Módulo dedicado (`verificar.html`) impulsado por `html5-qrcode` para lectura instantánea a pie de cancha.
- **Control Disciplinario en Tiempo Real**: Validación inmediata del estado del jugador (Habilitado, Sancionado por acumulación de amarillas, Suspendido por tarjeta roja directa o Inactivo).
- **Prevención de Suplantación**: Encriptación y firma de datos de carnet vinculados directamente a la base de datos oficial.

### 3. Gestión Integral de Torneos y Fixture
- **Administración de Campeonatos**: Creación de torneos con fechas, reglamento, categorías y fases.
- **Gestión de Equipos y Plantillas**: Registro de clubes con escudo oficial, cuerpo técnico y nómina de jugadores.
- **Actas de Juego y Planillaje Digital**: Registro minuto a minuto de goles, tarjetas amarillas/rojas, autogoles, sustituciones y designación del jugador del partido (MVP).
- **Tablas de Posiciones y Estadísticas**: Cálculo automático de puntos, partidos jugados, diferencia de goles y tabla de goleadores.

### 4. Portal Público de Inscripción
- **Auto-registro de Deportistas**: Formulario público (`registro.html`) para que los jugadores o delegados registren su ficha técnica sin ingresar al panel administrativo.
- **Compresión del Lado del Cliente**: Script integrado (`image-compressor.js`) que optimiza las fotos en el navegador del usuario antes de subirlas, reduciendo la carga del servidor.
- **Flujo de Aprobación**: Los registros quedan en estado pendiente hasta ser validados y aprobados por los organizadores del torneo.

### 5. Control de Licenciamiento y Suscripción (SaaS Ready)
- **Mecanismo de Bloqueo / Suspensión**: Middleware global para restringir operaciones de escritura ante vencimiento de suscripción.
- **Bypass de Emergencia**: Soporte para llave maestra (`x-master-key`) y token de Desarrollador Maestro (`isMaster`) para labores de mantenimiento y soporte.

---

## 🛠 Stack Tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| **Runtime** | Node.js (v18+) | Entorno de ejecución asíncrono y orientado a eventos |
| **Framework Web** | Express 5.x | Enrutamiento HTTP de última generación y middleware pipeline |
| **Bases de Datos** | SQLite 3 (`better-sqlite3`) / MySQL 8.x (`mysql2`) | Almacenamiento relacional híbrido (local y nube) |
| **Procesamiento Gráfico** | Sharp 0.35+ | Optimización, conversión a WebP y redimensionamiento |
| **Códigos QR** | QRCode 1.5+ | Generación algorítmica de códigos QR criptográficos |
| **Seguridad** | JSON Web Tokens (`jsonwebtoken`) & BcryptJS | Autenticación stateless y cifrado de contraseñas |
| **Rendimiento** | Compression & Express-Rate-Limit | Compresión Gzip/Brotli y mitigación de ataques DoS |
| **Manejo de Archivos** | Multer 2.x (Memory Storage) | Carga en RAM sin escrituras intermedias en disco |
| **Frontend** | Vanilla JS (ES6+), Tailwind CSS, AlertifyJS | Interfaz moderna, reactiva y ligera sin sobrecarga de frameworks |
| **Lector QR** | HTML5-QRCode | Reconocimiento de códigos bidimensionales en navegadores móviles |

---

## 📂 Estructura del Proyecto

```text
├── public/                     # Frontend estático y módulos de usuario
│   ├── css/                    # Hojas de estilo y temas Alertify
│   ├── js/
│   │   ├── alertify-config.js  # Notificaciones toast configuradas
│   │   ├── carnet-downloader.js# Módulo de captura y exportación gráfica
│   │   ├── dashboard.js        # Lógica central del panel administrativo
│   │   ├── html2canvas.min.js  # Motor de renderizado HTML a Canvas
│   │   └── image-compressor.js # Compresor cliente de imágenes
│   ├── buscar.html             # Buscador rápido de deportistas
│   ├── carnet.html             # Visualizador interactivo de carnet digital
│   ├── index.html              # Panel de administración principal (Dashboard)
│   ├── registro.html           # Portal público de inscripción
│   └── verificar.html          # Lector QR para árbitros y delegados
├── scripts/
│   └── export_sqlite_to_mysql.js # Script de migración de datos SQLite a MySQL
├── src/
│   ├── controllers/
│   │   └── authMiddleware.js   # Guards de autenticación, roles y llave maestra
│   ├── db/
│   │   └── database.js         # Capa agnóstica de conexión SQLite/MySQL
│   └── routes/
│       └── api.js              # Controlador principal y rutas RESTful
├── uploads/                    # Almacenamiento local de fotografías y logos (WebP)
├── .env.example                # Plantilla de variables de entorno
├── .gitignore                  # Reglas de exclusión de control de versiones
├── INSTRUCCIONES_ALWAYSDATA.md # Manual técnico para despliegue en Alwaysdata
├── iniciar.bat                 # Script de arranque rápido para Windows
├── package.json                # Metadatos del proyecto y dependencias
├── server.js                   # Punto de entrada HTTP y configuración del servidor
├── torneo.db                   # Base de datos SQLite local pre-configurada
└── torneo_mysql.sql            # Dump estructurado con esquema y datos para MySQL
```

---

## 🔐 Seguridad y Control de Acceso (RBAC)

El sistema opera bajo un esquema estricto de roles:

- **SUPER_ADMIN**: Control total del sistema, gestión de organizadores, configuración de suscripciones y parámetros globales.
- **ORGANIZADOR**: Creación y administración de torneos, aprobación de jugadores, generación de fixture y actas arbitrales.
- **DELEGADO / PLANILLERO**: Consulta de nóminas, actas de partido y verificación de credenciales en cancha.
- **PÚBLICO GENERAL**: Acceso exclusivo a verificación de carnets y portal de inscripción.

### Características de Seguridad:
1. **Hashing de Contraseñas**: Cifrado con `bcryptjs` usando factor de coste configurable.
2. **Tokens Stateless**: Firmados mediante `HS256` con caducidad programada.
3. **Rate Limiting**:
   - `/api`: Máximo 1,500 peticiones por ventana de 10 minutos por IP.
   - `/api/players/public-register`: Máximo 120 inscripciones por ventana de 15 minutos por IP para evitar spam automatizado.
4. **Protección Contra Inyecciones**: Consultas preparadas parametrizadas en SQLite y MySQL.

---

## 🖼 Pipeline de Procesamiento Multimedia

El tratamiento de imágenes utiliza **Sharp** y buffer en memoria con las siguientes características técnicas:

1. **Auto-Orientación EXIF**: Corrige automáticamente la rotación de fotografías tomadas desde teléfonos Android e iOS.
2. **Formato WebP de Alta Eficiencia**: Convierte formatos JPEG/PNG a WebP con factor de calidad 80, reduciendo el peso de las imágenes entre 70% y 85% sin degradación visual perceptible.
3. **Normalización Dimensional**:
   - **Fotos de Jugadores**: Máximo 700x850 px (relación de aspecto para carnet).
   - **Logos de Clubes**: Máximo 400x400 px con canal alfa transparente preservado.
4. **Almacenamiento Eficiente**: Nombres de archivo únicos basados en timestamps y valores pseudo-aleatorios criptográficos para evitar colisiones.

---

## 🗄 Motor de Base de Datos Híbrido

El módulo [`src/db/database.js`](src/db/database.js) implementa una interfaz unificada que conmuta automáticamente:

- **Modo SQLite (Desarrollo / Servidores Locales)**:
  - Utiliza `better-sqlite3` con modo **WAL** (`Write-Ahead Logging`).
  - `foreign_keys = ON`, `busy_timeout = 10000`, `synchronous = NORMAL`.
  - Cache en memoria extendida de 64MB (`cache_size = -64000`).
- **Modo MySQL (Producción / Hosting en la Nube)**:
  - Se activa al definir `DB_CLIENT=mysql` o configurar las variables de entorno `DB_HOST`.
  - Implementa un pool de conexiones `mysql2/promise` con `connectionLimit: 15` y reconexión automática resiliente.

---

## 💻 Instalación y Puesta en Marcha

### Prerrequisitos
- **Node.js** v18.0.0 o superior instalado.
- **npm** v9.0.0 o superior.

### 1. Clonar el Repositorio
```bash
git clone https://github.com/Brayan027/Carnet-digital-equipos-de-futbol.git
cd Carnet-digital-equipos-de-futbol
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Entorno
Copia el archivo de ejemplo para configurar tus variables locales:
```bash
cp .env.example .env
```

### 4. Iniciar el Servidor
```bash
# Modo producción / estándar
npm start

# En Windows también puedes hacer doble clic en:
iniciar.bat
```

La aplicación estará accesible en:
- Panel Administrativo: `http://localhost:3050`
- Verificación QR: `http://localhost:3050/verificar.html`
- Registro Público: `http://localhost:3050/registro.html`

---

## ⚙️ Variables de Entorno

| Variable | Tipo | Requerido | Descripción |
|---|---|---|---|
| `PORT` | Entero | Opcional | Puerto de escucha HTTP (Por defecto: `3050`) |
| `DB_CLIENT` | String | Opcional | `sqlite` (por defecto) o `mysql` |
| `DB_HOST` | String | MySQL | Host o dirección del servidor MySQL |
| `DB_PORT` | Entero | MySQL | Puerto del servidor MySQL (Por defecto: `3306`) |
| `DB_USER` | String | MySQL | Usuario con privilegios en la base de datos |
| `DB_PASSWORD`| String | MySQL | Contraseña del usuario MySQL |
| `DB_NAME` | String | MySQL | Nombre del esquema o base de datos |
| `JWT_SECRET` | String | **Recomendado** | Llave criptográfica para firma de sesiones JWT |

---

## 🌐 Despliegue en Producción (Alwaysdata / VPS)

El proyecto incluye instrucciones detalladas y archivos optimizados para despliegues en la nube:

1. **Importar la Base de Datos**:
   Importa [`torneo_mysql.sql`](torneo_mysql.sql) directamente en phpMyAdmin o vía consola:
   ```bash
   mysql -u tu_usuario -p tu_base_datos < torneo_mysql.sql
   ```
2. **Exportación Continua (Opcional)**:
   Si realizas cambios en local con SQLite y deseas sincronizarlos con MySQL:
   ```bash
   npm run export:mysql
   ```
3. **Consulta la Guía Completa**:
   Revisa [`INSTRUCCIONES_ALWAYSDATA.md`](INSTRUCCIONES_ALWAYSDATA.md) para detalles paso a paso sobre Node.js Site en Alwaysdata y SSL.

---

## 📡 Endpoints de la API REST

### Autenticación y Perfil
- `POST /api/auth/login`: Autenticación y emisión de JWT.
- `GET /api/auth/me`: Datos del usuario autenticado actual.
- `PUT /api/auth/profile`: Actualización de perfil y credenciales.

### Torneos y Equipos
- `GET /api/tournaments`: Listado de torneos activos.
- `POST /api/tournaments`: Creación de torneo (Admin).
- `GET /api/teams`: Obtención de clubes y plantillas.
- `POST /api/teams`: Registro de equipo con carga de escudo multipart.

### Jugadores y Carnetización
- `GET /api/players`: Consulta con filtros por equipo, categoría y estado.
- `POST /api/players`: Registro administrativo de jugador con foto.
- `POST /api/players/public-register`: Registro público sin autenticación.
- `GET /api/players/:id/carnet`: Obtención de datos compilados para renderizado de carnet.
- `GET /api/verify/:code`: Verificación pública de código QR.

### Partidos y Eventos
- `GET /api/matches`: Calendario y fixture de partidos.
- `POST /api/matches`: Programación de encuentros deportivos.
- `POST /api/matches/:id/events`: Registro de incidencias (goles, tarjetas, faltas).
- `PUT /api/matches/:id/finish`: Cierre oficial de acta de partido y cálculo de posiciones.

---

## 📄 Licencia

Este proyecto está bajo la Licencia ISC. Desarrollado con estándares de calidad para optimizar la logística deportiva en torneos profesionales y comunitarios.
