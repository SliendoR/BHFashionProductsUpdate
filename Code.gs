// ============================================================
// Sincronizador Selectivo - Google Sheets a n8n
// ============================================================

// URL del Webhook de pruebas (Test) usando tu ngrok para el nuevo workflow
const WEBHOOK_URL = 'https://define-devotedly-elaborate.ngrok-free.dev/webhook/productos-sync';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WooCommerce')
    .addItem('Sincronizar Marcados', 'sincronizarMarcados')
    .addSeparator()
    .addItem('⚙️ Setup: Crear hoja y formato', 'setupSpreadsheet')
    .addToUi();
}

// ── SETUP AUTOMÁTICO ───────────────────────────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  let sheet = ss.getSheetByName('Productos');
  if (!sheet) {
    sheet = ss.insertSheet('Productos');
  }

  const headers = ['Nombre', 'Precio', 'SKU', 'Descripcion', 'Stock', 'Sincronizar', 'Estado', 'Detalle Error'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formato encabezados
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white');

  // Calcular filas disponibles para no exceder el límite de la hoja
  const maxRows = sheet.getMaxRows();
  const numRows = maxRows > 1 ? maxRows - 1 : 1;

  // Limpiar cualquier validación previa para evitar conflictos
  sheet.getRange(2, 6, numRows, 2).clearDataValidations();

  // Checkbox en columna Sincronizar (F -> índice 6)
  sheet.getRange(2, 6, numRows, 1).insertCheckboxes();

  // Dropdown Estado (G -> índice 7)
  const estadoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pendiente', 'Sincronizado', 'Error'])
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 7, numRows, 1).setDataValidation(estadoRule);
  
  // Colores de fondo para la columna Estado
  sheet.getRange(2, 7, numRows, 1).setBackground('#f0f0f0');

  // Auto-resize
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  ui.alert(
    '✅ Setup completo\n\n' +
    'Se ha configurado la hoja "Productos" con sus encabezados, checkboxes y selectores de Estado.\n\n' +
    'No olvides configurar tu WEBHOOK_URL en el código.'
  );
}

// ── SINCRONIZADOR ──────────────────────────────────────────
function sincronizarMarcados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Productos');
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Error: No se encontró la hoja "Productos". Ejecuta el Setup primero.');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colIndex = {};
  headers.forEach((h, i) => colIndex[h.toString().trim()] = i);

  const required = ['Nombre', 'Precio', 'SKU', 'Descripcion', 'Stock', 'Sincronizar', 'Estado', 'Detalle Error'];
  const missing = required.filter(c => colIndex[c] === undefined);
  
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('❌ Faltan estas columnas en la fila 1: ' + missing.join(', '));
    return;
  }

  const filasParaSincronizar = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sincronizar = row[colIndex['Sincronizar']];
    const estado = row[colIndex['Estado']];

    if (sincronizar === true && estado !== 'Sincronizado') {
      filasParaSincronizar.push({
        Nombre:       row[colIndex['Nombre']],
        Precio:       row[colIndex['Precio']],
        SKU:          row[colIndex['SKU']],
        Descripcion:  row[colIndex['Descripcion']],
        Stock:        row[colIndex['Stock']],
        fila_sheets:  i + 1 
      });
    }
  }

  if (filasParaSincronizar.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No hay filas con la casilla "Sincronizar" marcada (o ya están Sincronizadas).');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Sincronización',
    `¿Estás seguro de enviar ${filasParaSincronizar.length} producto(s) a WooCommerce?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const payload = {
    productos: filasParaSincronizar
  };

  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      ui.alert('✅ Petición enviada.\nn8n está procesando los productos de fondo.');
    } else {
      ui.alert('❌ Error del webhook (HTTP ' + code + '):\n' + response.getContentText());
    }
  } catch (e) {
    ui.alert('❌ Error de conexión:\n' + e.message);
  }
}
