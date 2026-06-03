# Plan: Subida Masiva de Productos — Google Sheets → WooCommerce (LocalWP)

**Feature**: n8n-woocommerce-sheets-sync
**Estado**: 📐 En Planificación (Fase 2)
**Fecha**: 2026-06-02
**Basado en**: [RESEARCH.md](./RESEARCH.md)

---

## 1. Arquitectura del Workflow

```
┌──────────────────┐
│  Manual Trigger   │  ← Ejecución manual (botón "Test Workflow" en n8n)
│  (Nodo 1)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Google Sheets    │  ← Lee TODAS las filas de la hoja "Productos"
│  Read Rows        │     Credencial: Google Sheets OAuth2
│  (Nodo 2)        │     Output: Array de items [{Nombre, Precio, SKU, Descripcion, Stock}, ...]
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  IF: Validar      │  ← Filtra filas con Nombre vacío O SKU vacío
│  Nombre + SKU     │     Condición: {{ $json.Nombre }} is not empty AND {{ $json.SKU }} is not empty
│  (Nodo 3)        │
├────────┬─────────┤
│  TRUE  │  FALSE  │
│        │         │
│        │    ┌────▼────────┐
│        │    │ No Operation│ ← Filas inválidas descartadas silenciosamente
│        │    │ (Nodo 3b)   │
│        │    └─────────────┘
│        │
         ▼
┌──────────────────┐
│  Edit Fields:     │  ← Mapea nombres de columnas Sheets → campos WooCommerce
│  Mapeo de Campos  │     También fuerza tipos (Precio → string, Stock → number)
│  (Nodo 4)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Split In Batches │  ← Procesa de 5 en 5 para no saturar la API local
│  (batch size: 5)  │
│  (Nodo 5)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  WooCommerce:         │  ← resource: product, operation: create
│  Create Product       │     name: mapeado, additionalFields: sku, regularPrice,
│  (continueOnFail)     │     description, stockQuantity, manageStock=true, status=draft
│  (Nodo 6)            │
└────────┬─────────────┘
         │
         ▼
┌──────────────────┐
│  IF: ¿Error?      │  ← Detecta si el item falló (SKU duplicado, timeout, etc.)
│  (Nodo 7)        │     Condición: {{ $json.error }} is not empty
├────────┬─────────┤
│  TRUE  │  FALSE  │
│ (ERR)  │  (OK)   │
│        │         │
▼        ▼         │
┌────────┐ ┌───────▼───────┐
│Log Err │ │ Log Success   │  ← Ambos vuelven al Split In Batches para el siguiente lote
│(Nodo 8)│ │ (Nodo 9)      │
└────────┘ └───────────────┘
```

### Decisiones de Arquitectura

| Decisión | Elección | Razón |
|----------|----------|-------|
| **Trigger** | Manual Trigger (no Schedule) | Fase inicial. El usuario ejecuta cuando quiere. Se puede cambiar a Schedule/Cron después. |
| **Nodo para WooCommerce** | Nodo nativo `WooCommerce` | Más simple que HTTP Request. Auth automática. Campos tipados. |
| **Validación de datos** | Nodo IF simple | Mínimo viable. Solo filtra filas sin Nombre/SKU. No valida formato de precio. |
| **Batch size** | 5 items por lote | Conservador para API local. Evita saturar LocalWP. |
| **Status de producto** | `draft` | Confirmado por Santi. BEAR se usa después para revisar y publicar. |
| **Manejo de errores** | `continueOnFail: true` + bifurcación IF | Items fallidos no bloquean el batch. Se registran para debug. |
| **Pre-check de SKU duplicado** | NO (fuera de alcance v1) | Se maneja reactivamente: si la API retorna error 400, se registra y continúa. Fase futura: GET previo. |

---

## 2. Pasos de Implementación

### Paso 1: Scaffold del Workflow JSON
**Qué**: Crear el archivo `workflow.json` con la estructura base del workflow (metadata, nodos vacíos, conexiones).
**Archivos**: `workflow.json` (NUEVO)
**Test Gate**: El JSON es válido y parseable (`JSON.parse()` sin error).

---

### Paso 2: Nodo 1 — Manual Trigger
**Qué**: Agregar el nodo `Manual Trigger` como punto de entrada.
**Configuración**:
```json
{
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "typeVersion": 1,
  "position": [0, 0]
}
```
**Test Gate**: N/A (se valida con el paso 3).

---

### Paso 3: Nodo 2 — Google Sheets (Read Rows)
**Qué**: Leer todas las filas de la hoja de productos.
**Configuración**:
```json
{
  "name": "Read Products Sheet",
  "type": "n8n-nodes-base.googleSheets",
  "typeVersion": 4.7,
  "position": [220, 0],
  "parameters": {
    "operation": "read",
    "documentId": { "mode": "url", "value": "={{$json.sheet_url}}" },
    "sheetName": { "mode": "name", "value": "Productos" },
    "range": "A:E"
  },
  "credentials": {
    "googleSheetsOAuth2Api": { "id": "PLACEHOLDER", "name": "Google Sheets" }
  }
}
```
**Nota**: `documentId` y `sheetName` se parametrizan. El usuario los configura en n8n al importar.
**Test Gate**: Ejecutar el nodo aislado → debe retornar un array con las columnas esperadas.

---

### Paso 4: Nodo 3 — IF (Validar Nombre + SKU)
**Qué**: Filtrar filas que no tengan Nombre o SKU.
**Configuración**:
```json
{
  "name": "Validate Required Fields",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [440, 0],
  "parameters": {
    "conditions": {
      "options": { "combinator": "and" },
      "conditions": [
        { "leftValue": "={{ $json.Nombre }}", "rightValue": "", "operator": { "type": "string", "operation": "isNotEmpty" } },
        { "leftValue": "={{ $json.SKU }}", "rightValue": "", "operator": { "type": "string", "operation": "isNotEmpty" } }
      ]
    }
  }
}
```
**Test Gate**: Alimentar con 3 items (1 válido, 1 sin Nombre, 1 sin SKU) → solo 1 pasa al output TRUE.

---

### Paso 5: Nodo 4 — Edit Fields (Mapeo)
**Qué**: Renombrar campos de Sheets a campos de WooCommerce y forzar tipos.
**Configuración**:
```json
{
  "name": "Map Fields for WooCommerce",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [660, 0],
  "parameters": {
    "mode": "manual",
    "duplicateItem": false,
    "assignments": {
      "assignments": [
        { "name": "productName", "value": "={{ $json.Nombre }}", "type": "string" },
        { "name": "sku", "value": "={{ $json.SKU }}", "type": "string" },
        { "name": "regularPrice", "value": "={{ String($json.Precio) }}", "type": "string" },
        { "name": "description", "value": "={{ $json.Descripcion || '' }}", "type": "string" },
        { "name": "stockQuantity", "value": "={{ Number($json.Stock) || 0 }}", "type": "number" }
      ]
    },
    "includeOtherFields": false
  }
}
```
**Nota clave**: `regularPrice` se fuerza a `String()` porque la API WooCommerce espera string. `stockQuantity` se fuerza a `Number()`.
**Test Gate**: Verificar que el output tiene exactamente 5 campos con los tipos correctos.

---

### Paso 6: Nodo 5 — Split In Batches
**Qué**: Dividir el array en lotes de 5.
**Configuración**:
```json
{
  "name": "Process in Batches",
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 3,
  "position": [880, 0],
  "parameters": {
    "batchSize": 5
  }
}
```
**Test Gate**: Alimentar con 12 items → debe generar 3 iteraciones (5+5+2).

---

### Paso 7: Nodo 6 — WooCommerce Create Product
**Qué**: Crear el producto en WooCommerce con los campos mapeados.
**Configuración**:
```json
{
  "name": "Create Product in WooCommerce",
  "type": "n8n-nodes-base.wooCommerce",
  "typeVersion": 1,
  "position": [1100, 0],
  "parameters": {
    "resource": "product",
    "operation": "create",
    "name": "={{ $json.productName }}",
    "additionalFields": {
      "sku": "={{ $json.sku }}",
      "regularPrice": "={{ $json.regularPrice }}",
      "description": "={{ $json.description }}",
      "manageStock": true,
      "stockQuantity": "={{ $json.stockQuantity }}",
      "status": "draft",
      "type": "simple"
    }
  },
  "credentials": {
    "wooCommerceApi": { "id": "PLACEHOLDER", "name": "WooCommerce Local" }
  },
  "continueOnFail": true
}
```
**Test Gate #1 (Conectividad)**: Ejecutar con 1 producto de prueba → debe retornar `201 Created` con el `id` del producto.
**Test Gate #2 (SKU duplicado)**: Ejecutar de nuevo el mismo producto → debe retornar error 400 pero NO detener la ejecución (continueOnFail).
**Test Gate #3 (Batch)**: Ejecutar con 5 productos → todos deben crearse como draft en WooCommerce.

---

### Paso 8: Nodos 7-9 — Bifurcación Error/Éxito
**Qué**: Separar items exitosos de fallidos para logging.
**Configuración del IF**:
```json
{
  "name": "Check for Errors",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [1320, 0],
  "parameters": {
    "conditions": {
      "conditions": [
        { "leftValue": "={{ $json.error }}", "rightValue": "", "operator": { "type": "string", "operation": "isNotEmpty" } }
      ]
    }
  }
}
```
**Nodos de logging**: Dos nodos `No Operation` (o `Set`) que simplemente reciben los items para inspección visual en la ejecución de n8n.
**Test Gate**: Verificar que un batch con 1 item bueno y 1 SKU duplicado bifurca correctamente: 1 al path OK, 1 al path Error.

---

## 3. Conexiones entre Nodos

```
Manual Trigger → Read Products Sheet → Validate Required Fields
  ├── TRUE  → Map Fields for WooCommerce → Process in Batches → Create Product in WooCommerce → Check for Errors
  │                                              ↑                                                    │
  │                                              └────────────────────────────────────────────────────┘
  │                                                        (loop back)                    ├── TRUE (Error) → Log Error
  │                                                                                       └── FALSE (OK)  → Log Success
  └── FALSE → (No Operation / descartados)
```

---

## 4. Credenciales Requeridas (configuración manual en n8n)

| Credencial | Tipo | Campos |
|-----------|------|--------|
| **Google Sheets** | `googleSheetsOAuth2Api` | Client ID, Client Secret, Redirect URI (configurados en Google Cloud Console) |
| **WooCommerce Local** | `wooCommerceApi` | Consumer Key (`ck_...`), Consumer Secret (`cs_...`), Site URL (`http://tudominio.local`) |

> ⚠️ Estas credenciales NO se incluyen en el JSON del workflow. Se configuran manualmente en n8n después de importar.

---

## 5. Archivo Entregable

Un único archivo: **`workflow.json`**

- Se importa en n8n via **Settings → Import from File**.
- Después de importar, el usuario configura las 2 credenciales y ajusta `documentId`/`sheetName` del Google Sheets.
- Se ejecuta manualmente con el botón "Test Workflow".

---

## 6. Resumen de Test Gates

| # | Test Gate | Qué valida | Criterio de éxito |
|---|-----------|------------|-------------------|
| TG-1 | JSON válido | El archivo se parsea sin error | `JSON.parse(workflow)` no lanza excepción |
| TG-2 | Import en n8n | n8n acepta el workflow | No hay errores rojos al importar |
| TG-3 | Google Sheets lee | El nodo retorna filas | Array con ≥1 item con campos esperados |
| TG-4 | Filtro funciona | Items sin Nombre/SKU se descartan | Items inválidos van al path FALSE |
| TG-5 | Mapeo correcto | Campos renombrados y tipados | `regularPrice` es string, `stockQuantity` es number |
| TG-6 | Conectividad WooCommerce | n8n alcanza la API local | Respuesta HTTP (cualquier código, no timeout) |
| TG-7 | Crear 1 producto | Producto creado como draft | Respuesta 201 + producto visible en WP Admin |
| TG-8 | SKU duplicado no rompe | Error manejado sin detener batch | Item va al path Error, los demás continúan |
| TG-9 | Batch completo | N productos creados | Todos los items válidos aparecen en WooCommerce como draft |
