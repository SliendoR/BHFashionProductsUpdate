# Sincronizador Selectivo 2.0 (Google Sheets → WooCommerce)

Esta Wiki documenta la versión 2.0 del flujo de automatización con n8n, el cual envía productos seleccionados desde Google Sheets hacia WooCommerce y reporta su estado de vuelta a la hoja de cálculo de manera robusta, atrapando errores específicos sin detener la ejecución.

---

## 1. Archivos Incluidos

- **`Code.gs`**: El script de Google Apps Script que añade la interfaz a tu Google Sheets y realiza la llamada POST al Webhook.
- **`workflow_2.0.json`**: El archivo exportado del workflow funcional de n8n con manejo de errores nativo avanzado.

---

## 2. Configuración de n8n

### Importar el Flujo
1. Abre n8n y crea un Workflow nuevo (o abre el que ya tienes).
2. Ve al menú superior derecho de la pantalla del workflow, selecciona **Import from File** y elige el archivo `workflow_2.0.json`.
3. Verás que el flujo se despliega con el nodo **Create Product in WooCommerce** separando visualmente el éxito (salida superior) del error (salida inferior).

### Credenciales a Configurar
- **Webhook**: El nodo Webhook inicial generará URLs tanto de `Test` como de `Production`.
- **Create Product in WooCommerce**: Haz doble clic en el nodo y asegúrate de seleccionar tus credenciales de WooCommerce (ej: `WooCommerce LocalWP`).
- **Update Success in Sheets** y **Update Error in Sheets**: Selecciona tus credenciales de Google Sheets API OAuth2. Además, verifica que el **Document ID** del spreadsheet en ambos nodos apunte al documento de Google Sheets correcto.

### Activar el Workflow
- En la esquina superior derecha, enciende el interruptor a **Active**. Si el flujo no está activo, n8n rechazará las peticiones al webhook de producción (Error 404).

---

## 3. Configuración de Google Sheets

1. Abre tu hoja de cálculo en Google Sheets.
2. Ve a **Extensiones > Apps Script** y pega el contenido del archivo `Code.gs`.
3. En la línea 6 del código, asegúrate de pegar la URL del webhook de producción que copiaste de n8n:
   `const WEBHOOK_URL = 'https://.../webhook/productos-sync';`
4. Guarda el proyecto y cierra el editor de Apps Script.
5. Recarga la pestaña de Google Sheets. Verás aparecer un nuevo menú llamado **WooCommerce**.

### Setup de la Hoja
1. En el menú, haz clic en **WooCommerce > ⚙️ Setup: Crear hoja y formato**.
2. Esto creará (si no existe) la pestaña "Productos" e inicializará **estrictamente** los encabezados requeridos:
   `Nombre | Precio | SKU | Descripcion | Stock | Sincronizar | Estado | Detalle Error`

> [!IMPORTANT]
> El campo `Detalle Error` es crítico en la Versión 2.0. Es allí donde n8n escribirá mensajes como "Invalid or duplicated SKU" provenientes de WooCommerce si algo falla.

---

## 4. Uso del Sistema (Versión 2.0)

1. Llena tus productos en el Excel. **El SKU debe ser único**.
2. Marca las casillas en la columna `Sincronizar` para los productos que desees exportar.
3. Haz clic en **WooCommerce > Sincronizar Marcados**.
4. ¡Listo! Observa cómo los productos se van procesando.
   - Si todo es correcto, el `Estado` cambiará a **Sincronizado**.
   - Si WooCommerce rechaza un producto, el `Estado` cambiará a **Error** y la columna `Detalle Error` mostrará el motivo exacto, mientras que el resto de los productos seguirán sincronizándose sin interrumpir el proceso.
