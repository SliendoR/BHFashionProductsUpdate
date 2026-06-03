# Research: Subida Masiva de Productos — Google Sheets → WooCommerce (LocalWP)

**Feature**: n8n-woocommerce-sheets-sync
**Estado**: 🔍 En Investigación (Fase 1)
**Fecha**: 2026-06-02
**Restricción**: Entorno local (n8n self-hosted ↔ LocalWP)

---

## 1. Análisis de Nodos y Endpoints

### 1.1 Nodo: Google Sheets (`nodes-base.googleSheets` v4.7)

| Propiedad | Valor |
|-----------|-------|
| **Operación** | `read` (Get Rows) |
| **Credencial** | Google Sheets OAuth2 o Service Account |
| **Parámetros clave** | `documentId`, `sheetName`, `range` (ej. `A:F`) |
| **Comportamiento** | Devuelve un array de items con cada fila como objeto JSON. Los headers de la fila 1 se convierten en las keys del JSON. |

**Mapeo esperado de columnas:**

| Columna Sheets | Key JSON resultante | Campo WooCommerce API |
|----------------|--------------------|-----------------------|
| `Nombre` | `Nombre` | `name` (obligatorio) |
| `Precio` | `Precio` | `regular_price` (string) |
| `SKU` | `SKU` | `sku` |
| `Descripcion` | `Descripcion` | `description` |
| `Stock` | `Stock` | `stock_quantity` (number) |

### 1.2 Nodo Nativo: WooCommerce (`nodes-base.wooCommerce` v1)

**Hallazgo clave**: n8n tiene un nodo nativo de WooCommerce. NO necesitamos HTTP Request manual.

| Propiedad | Valor |
|-----------|-------|
| **Recurso** | `product` |
| **Operación** | `create` |
| **Campo obligatorio** | `name` (Product name) |
| **Campos adicionales (additionalFields)** | `sku`, `regularPrice`, `description`, `stockQuantity`, `manageStock`, `status`, `type`, `stockStatus` |
| **Credencial** | `wooCommerceApi` (Consumer Key + Consumer Secret + URL del sitio) |
| **typeVersion** | `1` (no versionado) |

**Campos del nodo WooCommerce disponibles para Product Create:**

| Campo n8n | Tipo | Descripción | Mapeo desde Sheets |
|-----------|------|-------------|-------------------|
| `name` | string | Nombre del producto (REQUERIDO) | `{{ $json.Nombre }}` |
| `regularPrice` | string | Precio regular | `{{ $json.Precio }}` |
| `sku` | string | Identificador único | `{{ $json.SKU }}` |
| `description` | string | Descripción del producto | `{{ $json.Descripcion }}` |
| `manageStock` | boolean | Habilitar gestión de stock | `true` (hardcoded) |
| `stockQuantity` | number | Cantidad en stock | `{{ $json.Stock }}` |
| `status` | options | Estado del producto | `draft` (por seguridad) |
| `type` | options | Tipo de producto | `simple` (default) |
| `stockStatus` | options | Estado del stock | `instock` |

### 1.3 Nodos Auxiliares

| Nodo | Propósito |
|------|-----------|
| **Schedule Trigger** | Disparar el flujo manualmente o por cron (no webhook, es entorno local) |
| **Set / Edit Fields** | Mapear y renombrar campos de Sheets al formato esperado por WooCommerce |
| **Split In Batches** | Procesar N items a la vez para evitar sobrecarga de la API local |
| **IF** | Bifurcar flujo entre éxito y error por item |

### 1.4 Decisión: Nodo Nativo WooCommerce vs. HTTP Request

| Criterio | Nodo Nativo WooCommerce | HTTP Request |
|----------|------------------------|--------------|
| Configuración | Menor (credencial + campos UI) | Mayor (URL, headers, body manual) |
| Auth | Manejada por la credencial | Manual (Basic Auth con ck/cs) |
| Manejo de errores | Integrado (continueOnFail) | Integrado (continueOnFail) |
| Compatibilidad LocalWP | ⚠️ Necesita URL accesible desde n8n | ⚠️ Misma restricción |
| Flexibilidad | Limitado a campos del nodo | Total (cualquier endpoint/field) |

**Decisión**: Usar el **nodo nativo WooCommerce** como camino principal. Es más limpio, auto-documentado, y el plugin BEAR no requiere campos exóticos que el nodo no soporte. Si se descubre una limitación en la fase de implementación, HTTP Request es el fallback inmediato.

---

## 2. Estrategia de Autenticación y Red

### 2.1 Credenciales WooCommerce en n8n

La credencial `wooCommerceApi` requiere 3 valores:

| Campo | Ejemplo | Origen |
|-------|---------|--------|
| **Consumer Key** | `ck_xxxxxxxx` | WooCommerce → Settings → REST API → Add Key |
| **Consumer Secret** | `cs_xxxxxxxx` | Misma pantalla, se muestra una sola vez |
| **WooCommerce URL** | `http://bhfashion.local` | URL del sitio LocalWP |

**Permisos requeridos**: Read/Write (para crear productos).

### 2.2 Conectividad de Red: n8n ↔ LocalWP

Este es el **riesgo técnico principal** del proyecto.

#### Escenario A: n8n y LocalWP en la misma máquina
- LocalWP expone el sitio en `http://bhfashion.local` (o similar) usando el router interno.
- n8n self-hosted (Docker o directo en Node.js) necesita resolver ese hostname.
- **Solución**: Agregar la entrada en el archivo `hosts` de la máquina:
  ```
  127.0.0.1  bhfashion.local
  ```
- Si n8n corre en Docker, usar `host.docker.internal` o `--network host`.

#### Escenario B: n8n en Docker, LocalWP nativo
- n8n dentro de Docker no puede resolver `*.local` de LocalWP por defecto.
- **Solución**: Usar `extra_hosts` en `docker-compose.yml`:
  ```yaml
  extra_hosts:
    - "bhfashion.local:host-gateway"
  ```
- O alternativamente usar la IP local directa: `http://192.168.x.x:puerto`.

#### Escenario C: n8n en servidor remoto (Cloud)
- **Requiere túnel**. Opciones: Cloudflare Tunnel, ngrok, o LocalTunnel.
- Esto está **fuera del alcance** del issue actual según el contexto dado.

### 2.3 Protocolo HTTP vs HTTPS

- LocalWP genera certificados SSL autofirmados.
- El nodo WooCommerce de n8n puede fallar con `SELF_SIGNED_CERT` si se usa HTTPS.
- **Recomendación**: Usar `http://` para el entorno local. Si se requiere HTTPS, configurar la variable de entorno `NODE_TLS_REJECT_UNAUTHORIZED=0` en n8n (solo para desarrollo).

---

## 3. Análisis de Riesgos

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|--------|---------|-------------|------------|
| R1 | **SKU duplicado** — La API de WooCommerce retorna `400: invalid_product_sku` si el SKU ya existe | Medio — El item falla pero los demás continúan | Alta (en re-ejecuciones) | Configurar `continueOnFail: true` en el nodo WooCommerce. Bifurcar con nodo IF para registrar el error sin detener el batch. **Fase futura**: Pre-check con `GET /products?sku=XXX` antes de crear. |
| R2 | **Timeout de API local** — LocalWP puede responder lento o no responder | Alto — Bloquea todo el lote | Baja | Usar `Split In Batches` con tamaño de lote conservador (5-10 items). El nodo WooCommerce hereda el timeout de n8n (~5min por defecto). |
| R3 | **Resolución DNS `.local`** — n8n no puede resolver el hostname de LocalWP | Crítico — Ningún item se procesa | Media | Verificar conectividad en Fase 3 como Test Gate #1 antes de procesar datos reales. |
| R4 | **Campos vacíos en Sheets** — Filas con celdas vacías producen valores `""` o `undefined` | Bajo — Se crean productos con datos incompletos | Media | Nodo IF o Code previo para filtrar filas sin `Nombre` o `SKU`. |
| R5 | **Precio como número vs. string** — WooCommerce espera `regular_price` como string, Sheets puede enviar número | Bajo — La API lo rechaza o lo ignora | Media | Nodo Set/Code para forzar conversión a string: `String($json.Precio)`. |
| R6 | **Certificado SSL autofirmado** — Error `DEPTH_ZERO_SELF_SIGNED_CERT` | Medio — Bloquea la conexión | Baja (si usamos HTTP) | Usar `http://` en vez de `https://` para entorno local. |

### Estrategia de Tolerancia a Fallos

```
┌─────────────────┐
│  Google Sheets   │
│  (Read All Rows) │
└────────┬────────┘
         │ Array de items
         ▼
┌─────────────────┐
│  Filter: Validar │ ──→ Items sin Nombre/SKU → Descartados (log)
│  Nombre + SKU    │
└────────┬────────┘
         │ Items válidos
         ▼
┌─────────────────┐
│  Set Fields:     │
│  Mapear campos   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Split In Batches │ ──→ Lotes de 5
│    (size: 5)     │
└────────┬────────┘
         │ Por cada item
         ▼
┌──────────────────────┐
│  WooCommerce: Create │
│  (continueOnFail)    │
├──────────┬───────────┤
│  ✅ OK   │  ❌ Error │
│          │           │
│  Log OK  │  Log Fail │
└──────────┴───────────┘
```

---

## 4. Estimación de Esfuerzo

| Fase | Descripción | Tiempo Estimado |
|------|-------------|-----------------|
| **Fase 1: Research** | Investigación de nodos, endpoints, riesgos | ~30 min ✅ (Completado) |
| **Fase 2: Plan** | Diseño JSON del workflow, definición de Test Gates | ~30 min |
| **Fase 3: Implement** | Construcción del workflow JSON, configuración de nodos | ~45 min |
| **Validación** | Test Gate #1 (conectividad), Test Gate #2 (1 producto), Test Gate #3 (batch completo) | ~30 min |
| **Total Estimado** | | **~2.25h** |

### Complejidad: BAJA-MEDIA
- No hay lógica de negocio compleja (no hay dedups, no hay lookups cruzados).
- El nodo nativo WooCommerce elimina la necesidad de construir HTTP requests manuales.
- El mayor riesgo es la conectividad de red (DNS `.local`), que se resuelve con configuración, no con código.

---

## 5. Preguntas Abiertas para el GO/NO-GO

1. **¿Cuál es el hostname exacto de tu sitio LocalWP?** (ej. `bhfashion.local`, `mysite.local`)
2. **¿n8n está corriendo en Docker o directamente en Node.js en la misma máquina?**
3. **¿Ya tienes las Consumer Key/Secret de WooCommerce generadas?**
4. **¿Los productos se crearán como `draft` (borrador) o directamente como `publish` (publicados)?** Mi recomendación: `draft` para la primera ejecución, luego publicar en lote con BEAR.
5. **¿La hoja de Google Sheets ya existe? ¿Puedes confirmar los nombres exactos de las columnas?**
