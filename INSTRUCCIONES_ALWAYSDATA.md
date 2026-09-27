# Guía para Montar la Base de Datos y la Aplicación en Alwaysdata

Este proyecto ya está 100% adaptado para funcionar con **MySQL** en entornos de hosting en la nube como **Alwaysdata**, manteniendo compatibilidad total con tus datos actuales.

---

## 📁 Archivos Generados para MySQL

1. **`torneo_mysql.sql`**:
   - Archivo SQL listo para importar en MySQL/MariaDB (vía phpMyAdmin o consola).
   - Contiene la estructura completa de todas las tablas (`roles`, `users`, `tournaments`, `teams`, `players`, `matches`, `match_events`, `subscription_config`).
   - **Optimizado**: Usa columnas `LONGTEXT` para fotos en Base64 y códigos QR para evitar truncamiento.
   - **Datos incluidos**: Trae todos los datos que ya tenías creados (Super Admin, Organizador, Torneo San Antonio, Equipo Real Martines y los jugadores registrados).

2. **`scripts/export_sqlite_to_mysql.js`**:
   - Script para volver a generar el dump en cualquier momento si agregas más datos en local:
     ```bash
     npm run export:mysql
     ```

3. **`src/db/database.js`**:
   - Módulo híbrido que detecta automáticamente si se configuraron credenciales de MySQL mediante variables de entorno (`DB_HOST` o `DB_CLIENT=mysql`) y utiliza un pool de conexiones `mysql2`. Si no detecta MySQL, funciona en modo local con SQLite (`torneo.db`).
   - Si creas una base de datos MySQL vacía, el sistema auto-crea las tablas e inserta los usuarios iniciales al arrancar.

4. **`.env.example`**:
   - Plantilla de variables de entorno para Alwaysdata.

---

## 🚀 Pasos para Montar en Alwaysdata

### Paso 1: Crear la Base de Datos MySQL en Alwaysdata
1. Inicia sesión en tu cuenta de **Alwaysdata**: [https://admin.alwaysdata.com](https://admin.alwaysdata.com)
2. En el menú lateral izquierdo, ve a **Bases de datos** -> **MySQL**.
3. **Crear usuario**:
   - Si no tienes un usuario creado, haz clic en **Añadir un usuario**.
   - Asigna una contraseña segura y anótala.
4. **Crear base de datos**:
   - Haz clic en **Añadir una base de datos**.
   - Nombre: por ejemplo `tuusuario_torneo`.
   - Concede permisos completos (Lectura / Escritura) al usuario que creaste.
5. Observa el nombre del **Host** que te asigna Alwaysdata (suele ser `mysql-tuusuario.alwaysdata.net`).

---

### Paso 2: Importar el archivo `torneo_mysql.sql`
1. En la misma sección de MySQL de Alwaysdata, haz clic en el enlace a **phpMyAdmin**.
2. Inicia sesión con tu usuario y contraseña de MySQL de Alwaysdata.
3. En la barra lateral izquierda de phpMyAdmin, haz clic sobre el nombre de tu base de datos recién creada (ej. `tuusuario_torneo`).
4. Haz clic en la pestaña superior **Importar** (Import).
5. En "Seleccionar archivo", elige el archivo `torneo_mysql.sql` que se encuentra en la carpeta de este proyecto.
6. Baja y haz clic en el botón **Importar** (Continuar / Go).
7. Verás los mensajes en verde confirmando la creación de todas las tablas e inserción de tus datos.

---

### Paso 3: Subir los Archivos de tu Aplicación
Puedes subir tu proyecto mediante **SSH/Git** o **FTP / SFTP**:
- Carpeta de destino habitual en Alwaysdata: `/home/tuusuario/www/` (o la carpeta de tu sitio configurado).
- Sube todo el código excepto la carpeta `node_modules` (es mejor instalar dependencias en el servidor).

---

### Paso 4: Configurar la Aplicación Node.js en Alwaysdata
1. En el panel de Alwaysdata, ve a **Sitios Web** (Web -> Sites).
2. Edita tu sitio (o añade uno nuevo):
   - **Tipo**: `Node.js`
   - **Versión de Node**: 18.x, 20.x o 22.x
   - **Directorio de la aplicación**: Ruta donde subiste los archivos (ej. `/home/tuusuario/torneo/`)
   - **Comando de inicio**: `node server.js` (o `npm start`)
3. En la sección **Variables de entorno** (Environment variables), agrega las siguientes:
   ```env
   PORT=8100
   DB_CLIENT=mysql
   DB_HOST=mysql-tuusuario.alwaysdata.net
   DB_PORT=3306
   DB_USER=tuusuario
   DB_PASSWORD=tu_contraseña_de_mysql
   DB_NAME=tuusuario_torneo
   JWT_SECRET=torneo_san_antonio_secret_key_2026_xyz
   ```
4. Guarda los cambios.

---

### Paso 5: Instalar Dependencias y Probar
En la consola SSH de Alwaysdata (o en la pestaña de comandos de la aplicación):
```bash
npm install --production
```
Reinicia el sitio en el panel de Alwaysdata y visita tu dominio (ej. `https://tuusuario.alwaysdata.net`).

¡Listo! Tu aplicación estará corriendo 100% en la nube conectada a tu base de datos MySQL en Alwaysdata.
