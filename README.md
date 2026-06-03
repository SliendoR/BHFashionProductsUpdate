# Automatización: Google Sheets → WooCommerce (n8n)

Este repositorio contiene los archivos necesarios para importar y sincronizar catálogos de productos masivamente desde Google Sheets hacia WooCommerce utilizando n8n.

## Archivos Principales

* `workflow-v2.json`: El workflow actualizado para importar a n8n. Utiliza un Webhook para recibir los datos y actualiza las celdas automáticamente al terminar.
* `Code.gs`: El script (Google Apps Script) que debes pegar en el editor de secuencias de comandos de tu hoja de Google Sheets.
* `workflow.json`: Versión inicial (obsoleta, basada en lectura por lotes en lugar de webhook).

---

## 🚀 Guía de Configuración Rápida para el Cliente

Para que la automatización funcione, es indispensable conectar tu tienda WooCommerce de manera segura con n8n. Sigue estos pasos:

### 1. Generar Credenciales en WooCommerce
1. Entra al panel de administrador de tu WordPress (ej. `tusitio.com/wp-admin`).
2. Ve al menú lateral: **WooCommerce** -> **Ajustes** (Settings) -> Pestaña **Avanzado** (Advanced) -> **API REST**.
3. Haz clic en el botón **Añadir clave** (Add key).
4. Llena los datos:
   * **Descripción**: Ponle un nombre fácil de reconocer, ej. `Automatización n8n`.
   * **Usuario**: Selecciona a tu usuario Administrador.
   * **Permisos**: ⚠️ **CRÍTICO:** Cambia a **Lectura/Escritura** (Read/Write), de lo contrario no podremos crear productos.
5. Haz clic en **Generar clave de API**.
6. 🚨 **Guarda estos datos inmediatamente**: WooCommerce te mostrará una **Clave de cliente** (Consumer Key, que empieza por `ck_...`) y una **Clave secreta de cliente** (Consumer Secret, que empieza por `cs_...`). Cópialas a un bloc de notas seguro, porque la clave secreta *no se volverá a mostrar nunca más*.

### 2. Configurar Credenciales en n8n
1. Importa el archivo `workflow-v2.json` en tu n8n local o remoto.
2. Haz doble clic en cualquiera de los nodos que dicen **WooCommerce**.
3. Despliega la opción **Credential for WooCommerce API** y selecciona **Create New** (Crear nueva).
4. Pega los datos que sacaste de WooCommerce:
   * **Consumer Key**: `ck_...`
   * **Consumer Secret**: `cs_...`
   * **URL**: La dirección base de tu tienda (ej. `https://tutienda.com` o `http://bhfashion.local`).
5. Dale a **Save** (Guardar).

### 3. Configurar Google Sheets
1. En tu hoja de **Productos**, ve al menú superior: **Extensiones** -> **Apps Script**.
2. Pega todo el código del archivo `Code.gs` de este repositorio.
3. En la línea que dice `const WEBHOOK_URL = 'TU_WEBHOOK_URL_AQUI';`, pega la URL de prueba o producción del nodo **Webhook** de n8n. Si trabajas localmente, asegúrate de estar usando un túnel (`ngrok`).
4. Guarda (ícono de disquete) y cierra esa pestaña.
5. ¡Listo! Verás un nuevo menú **WooCommerce** en tu hoja.

---

> **Nota para desarrollo local:** Si la tienda WooCommerce está en LocalWP y n8n corre de forma nativa, la URL suele ser `http://tudominio.local`. Si n8n rechaza la conexión por problemas de SSL, asegúrate de que usas `http://` en lugar de `https://` para el entorno de pruebas local.
