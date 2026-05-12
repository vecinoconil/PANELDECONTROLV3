/**
 * thermalPrinter.ts
 * Impresión de tickets térmicos (80 mm) vía window.print() + CSS.
 * Compatible con HTTP (sin necesidad de HTTPS).
 * En Android: usa el sistema de impresión nativo, que enruta a impresoras
 * Bluetooth Classic emparejadas (Bixolon SPP-R410, etc.).
 */

// ─── Config en localStorage ──────────────────────────────────────────────────
const STORAGE_KEY = 'autoventa_printer_cfg'

export interface PrinterConfig {
  // Datos empresa para cabecera del ticket
  emp_nombre:    string
  emp_direccion: string
  emp_cif:       string
  emp_telefono:  string
  emp_email:     string
  emp_logo:      string   // base64 data URL (vacío = sin logo)
  paper_width:   80 | 100  // ancho del papel en mm
  precargar_historial: boolean  // precargar ventas anteriores 90 días al seleccionar cliente
}

export function loadPrinterConfig(): Partial<PrinterConfig> {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

export function savePrinterConfig(cfg: Partial<PrinterConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function hasPrinterPaired(): boolean {
  return true  // Con Web Bluetooth o window.print() siempre se puede intentar
}

// ─── Tipos para el ticket ────────────────────────────────────────────────────
export interface TicketLinea {
  descripcion: string
  unidades: string | number
  gramos?: string | number
  tipo_unidad?: number
  unidad?: string
  precio: number
  dto: number
  piva: number
  talla?: string
  color?: string
  es_canon?: boolean
}

export interface TicketData {
  tipodoc_label: string
  serie: string
  numero: number
  fecha?: string | null
  cli_nombre: string
  lineas: TicketLinea[]
  total: number
  agenteNombre?: string
  firmaDataUrl?: string   // base64 firma del cliente
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Generar HTML del ticket ─────────────────────────────────────────────────
function buildTicketHtml(data: TicketData, cfg: Partial<PrinterConfig>): string {
  // ── Totales por IVA ──────────────────────────────────────────────────────
  const totalesMap: Record<number, { piva: number; base: number; cuota: number }> = {}
  for (const lin of data.lineas) {
    const uds = parseFloat(String(lin.unidades)) || 0
    if (uds === 0 && !lin.es_canon) continue
    const precioNeto = lin.precio * (1 - lin.dto / 100)
    const importe = uds * precioNeto
    const p = lin.piva
    if (!totalesMap[p]) totalesMap[p] = { piva: p, base: 0, cuota: 0 }
    totalesMap[p].base  += importe
    totalesMap[p].cuota += importe * (p / 100)
  }
  const totalesArr = Object.values(totalesMap).sort((a, b) => a.piva - b.piva)
  const totalBase  = totalesArr.reduce((s, t) => s + t.base, 0)

  // ── Líneas HTML ──────────────────────────────────────────────────────────
  const linesHtml = data.lineas.map(lin => {
    const uds = parseFloat(String(lin.unidades)) || 0
    if (uds === 0 && !lin.es_canon) return ''
    const precioNeto = lin.precio * (1 - lin.dto / 100)
    const importe    = uds * precioNeto
    let desc = lin.descripcion
    if (lin.talla || lin.color) desc += ` (${[lin.talla, lin.color].filter(Boolean).join('/')})`
    if (lin.es_canon) desc = `&nbsp;&nbsp;${esc(desc)}`
    else desc = esc(desc)

    const udsStr = uds.toLocaleString('es-ES', { maximumFractionDigits: 3 })
    const dtoHtml = lin.dto > 0
      ? `<div class="extra">&nbsp;&nbsp;Dto: ${lin.dto}%</div>`
      : ''
    const gramosHtml = (lin.tipo_unidad === 1 && lin.gramos)
      ? `<div class="extra">&nbsp;&nbsp;&rarr; ${parseFloat(String(lin.gramos)).toLocaleString('es-ES', { maximumFractionDigits: 3 })} ${esc(lin.unidad || 'kg')}</div>`
      : ''

    return `<div class="line">
  <span class="ld">${desc}</span>
  <span class="lu">${udsStr}</span>
  <span class="lp">${money(precioNeto)}</span>
  <span class="li">${money(importe)}</span>
</div>${dtoHtml}${gramosHtml}`
  }).join('\n')

  const ivaRowsHtml = totalesArr.map(t =>
    `<div class="tr"><span>IVA ${t.piva}%:</span><span>${money(t.cuota)} EUR</span></div>`
  ).join('\n')

  const cifTel = [
    cfg.emp_cif      ? `CIF: ${esc(cfg.emp_cif)}` : '',
    cfg.emp_telefono ? `Tel: ${esc(cfg.emp_telefono)}` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;&nbsp;')

  const logoHtml = cfg.emp_logo
    ? `<div style="text-align:center;margin-bottom:1mm"><img src="${cfg.emp_logo}" style="max-width:100mm;max-height:24mm" alt="Logo"></div>`
    : ''

  const firmaHtml = data.firmaDataUrl ? `
<div style="text-align:center;margin-top:3mm">
  <div style="font-weight:bold;font-size:8.5pt;margin-bottom:1mm">FIRMA DEL CLIENTE</div>
  <img src="${data.firmaDataUrl}" style="max-width:100mm;border-top:1px solid #000;padding-top:1mm" alt="Firma">
</div>` : ''

  const fechaStr  = formatDate(data.fecha)
  const docLabel  = `${data.tipodoc_label.toUpperCase()} ${data.serie}-${data.numero}`
  const agentHtml = data.agenteNombre ? `<div style="font-size:8.5pt">Agente: ${esc(data.agenteNombre)}</div>` : ''
  const S = '─'.repeat(90)

  return `<!DOCTYPE html><html lang="es">
<head>
<meta charset="UTF-8">
<title>Ticket ${esc(docLabel)}</title>
<style>
@page { size: ${(cfg.paper_width ?? 80) === 100 ? '100mm' : '80mm'} auto; margin: 2mm 3mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; width: ${(cfg.paper_width ?? 80) === 100 ? '94mm' : '74mm'}; min-height: 150mm; color: #000; background: #fff; }
.emp-n { font-size: 13pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
.emp-i { font-size: 8.5pt; text-align: center; overflow: hidden; white-space: nowrap; }
.sep   { font-size: 8.5pt; margin: 1.5mm 0; overflow: hidden; white-space: nowrap; }
.doc-row { display: flex; justify-content: space-between; font-weight: bold; margin: 1mm 0; }
.cli-row { font-weight: bold; margin: 1mm 0; }
.hdr { display: flex; font-weight: bold; font-size: 8pt; border-bottom: 1px solid #000; padding-bottom:0.5mm; margin-bottom:1mm; }
.hd  { flex: 1; }
.hu, .hp, .hi { text-align: right; flex-shrink: 0; }
.hu  { width: 20mm; }
.hp  { width: 24mm; }
.hi  { width: 24mm; }
.line  { display: flex; font-size: 8.5pt; margin-bottom: 0.5mm; align-items: flex-start; }
.ld    { flex: 1; word-break: break-word; padding-right: 1mm; }
.lu, .lp, .li { text-align: right; flex-shrink: 0; }
.lu  { width: 20mm; }
.lp  { width: 24mm; }
.li  { width: 24mm; }
.extra { font-size: 8pt; padding-left: 2mm; }
.tr    { display: flex; justify-content: space-between; font-size: 8.5pt; margin: 0.5mm 0; }
.total { display: flex; justify-content: space-between; font-size: 14pt; font-weight: bold; margin: 3mm 0 2mm; }
.footer { text-align: center; font-size: 8.5pt; margin-top: 2mm; }
</style>
</head>
<body>
${logoHtml}
<div class="emp-n">${esc(cfg.emp_nombre || '')}</div>
${cfg.emp_direccion ? `<div class="emp-i">${esc(cfg.emp_direccion)}</div>` : ''}
${cifTel ? `<div class="emp-i">${cifTel}</div>` : ''}
${cfg.emp_email ? `<div class="emp-i">${esc(cfg.emp_email)}</div>` : ''}
<div class="sep">${S}</div>
<div class="doc-row"><span>${esc(docLabel)}</span><span>${esc(fechaStr)}</span></div>
${agentHtml}
<div class="sep">${S}</div>
<div class="cli-row">Cliente: ${esc(data.cli_nombre)}</div>
<div class="sep">${S}</div>
<div class="hdr">
  <span class="hd">DESCRIPCIÓN</span>
  <span class="hu">UDS</span>
  <span class="hp">PRECIO</span>
  <span class="hi">IMPORTE</span>
</div>
${linesHtml}
<div class="sep">${S}</div>
<div class="tr"><span>Base imponible:</span><span>${money(totalBase)} EUR</span></div>
${ivaRowsHtml}
<div class="sep" style="margin-bottom:0.5mm">${S}</div>
<div class="total"><span>TOTAL:</span><span>${money(data.total)} EUR</span></div>
<div class="sep">${S}</div>
${firmaHtml}
<div class="footer">Gracias por su compra</div>
</body></html>`
}

// ─── Renderizado gráfico en canvas ──────────────────────────────────────────
/**
 * Dibuja el ticket completo en un HTMLCanvasElement de 576 píxeles de ancho
 * (72 mm × 203 DPI = 576 dots). Cada píxel del canvas = 1 punto de impresora.
 * No requiere librerías externas.
 */
async function buildTicketCanvas(
  data: TicketData,
  cfg: Partial<PrinterConfig>,
  wide = false,
): Promise<HTMLCanvasElement> {

  // wide=true  → 100 mm: 576 dots (72mm imprimible × 8 dots/mm a 203 DPI)
  // wide=false →  80 mm: 576 dots (72mm imprimible × 8 dots/mm a 203 DPI)
  //   576 = múltiplo de 8 → 72 bytes/línea exactos para GS v 0
  const W      = wide ? 736  : 576
  const MARGIN = wide ? 14   : 12    // dots de margen lateral
  const IW     = W - MARGIN * 2

  // Tamaños de fuente en dots (203 DPI)
  // Valores generosos: el antialiasing del canvas hace que los trazos sean más
  // delgados de lo esperado en la impresora; fuentes más grandes compensan esto.
  const SZ_TITLE = wide ? 56   : 44
  const SZ_BODY  = wide ? 40   : 34
  const SZ_SMALL = wide ? 32   : 28
  const SZ_TOTAL = wide ? 64   : 52

  // Anchos de columna para líneas de artículo
  const C_U = wide ? 130 : 90            // Uds
  const C_P = wide ? 160 : 110           // Precio unit
  const C_I = wide ? 160 : 110           // Importe
  const C_D = IW - C_U - C_P - C_I      // Descripción

  // ── Helpers de canvas ───────────────────────────────────────────────────
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    if (!text) return ['']
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w }
      else cur = test
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }

  function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`
  }

  function drawCentered(ctx: CanvasRenderingContext2D, text: string, y: number) {
    const w = ctx.measureText(text).width
    ctx.fillText(text, (W - w) / 2, y)
  }

  function drawRight(ctx: CanvasRenderingContext2D, text: string, rightX: number, y: number) {
    const w = ctx.measureText(text).width
    ctx.fillText(text, rightX - w, y)
  }

  // ── Primera pasada: calcular altura total ────────────────────────────────
  // Usamos un canvas temporal de 1px para medir texto
  const measure = document.createElement('canvas')
  measure.width = W; measure.height = 1
  const mctx = measure.getContext('2d')!

  let totalHeight = MARGIN

  // Logo (asíncrono)
  let logoImg: HTMLImageElement | null = null
  if (cfg.emp_logo) {
    logoImg = new Image()
    logoImg.src = cfg.emp_logo
    await new Promise<void>(r => { logoImg!.onload = () => r(); logoImg!.onerror = () => r() })
    if (logoImg.naturalWidth > 0) {
      const scale = Math.min((IW * 0.7) / logoImg.naturalWidth, 1)
      totalHeight += Math.round(logoImg.naturalHeight * scale) + 8
    } else { logoImg = null }
  }

  // Cabecera empresa
  if (cfg.emp_nombre) totalHeight += SZ_TITLE + 6
  if (cfg.emp_direccion) totalHeight += SZ_SMALL + 4
  setFont(mctx, SZ_SMALL)
  if (cfg.emp_cif || cfg.emp_telefono) totalHeight += SZ_SMALL + 4
  if (cfg.emp_email) totalHeight += SZ_SMALL + 4

  // Separador
  totalHeight += 14

  // Documento
  totalHeight += SZ_BODY + 6
  if (data.agenteNombre) totalHeight += SZ_SMALL + 4

  // Separador
  totalHeight += 14

  // Cliente
  totalHeight += SZ_BODY + 6

  // Separador
  totalHeight += 14

  // Header columnas
  totalHeight += SZ_SMALL + 8

  // Líneas de artículo
  setFont(mctx, SZ_BODY)
  for (const lin of data.lineas) {
    const uds = parseFloat(String(lin.unidades)) || 0
    if (uds === 0 && !lin.es_canon) continue
    let desc = lin.descripcion
    if (lin.talla || lin.color) desc += ` (${[lin.talla, lin.color].filter(Boolean).join('/')})`
    const lines = wrapText(mctx, desc, C_D - 4)
    totalHeight += lines.length * (SZ_BODY + 4)
    if (lin.dto > 0) totalHeight += SZ_SMALL + 3
    if (lin.tipo_unidad === 1 && lin.gramos) totalHeight += SZ_SMALL + 3
  }

  // Separador
  totalHeight += 14

  // Totales IVA
  const totalesMap: Record<number, { piva: number; base: number; cuota: number }> = {}
  for (const lin of data.lineas) {
    const uds = parseFloat(String(lin.unidades)) || 0
    if (uds === 0 && !lin.es_canon) continue
    const precioNeto = lin.precio * (1 - lin.dto / 100)
    const importe = uds * precioNeto
    const p = lin.piva
    if (!totalesMap[p]) totalesMap[p] = { piva: p, base: 0, cuota: 0 }
    totalesMap[p].base  += importe
    totalesMap[p].cuota += importe * (p / 100)
  }
  const totalesArr = Object.values(totalesMap).sort((a, b) => a.piva - b.piva)
  const totalBase  = totalesArr.reduce((s, t) => s + t.base, 0)

  totalHeight += SZ_SMALL + 4  // Base imponible
  totalHeight += totalesArr.length * (SZ_SMALL + 4)  // IVA rows

  // Separador
  totalHeight += 14

  // Total grande
  totalHeight += SZ_TOTAL + 8

  // Separador
  totalHeight += 14

  // Firma
  let firmaImg: HTMLImageElement | null = null
  if (data.firmaDataUrl) {
    firmaImg = new Image()
    firmaImg.src = data.firmaDataUrl
    await new Promise<void>(r => { firmaImg!.onload = () => r(); firmaImg!.onerror = () => r() })
    if (firmaImg.naturalWidth > 0) {
      const scale = Math.min(IW / firmaImg.naturalWidth, 1)
      totalHeight += SZ_SMALL + 6 + Math.round(firmaImg.naturalHeight * scale) + 8
    } else { firmaImg = null }
  }

  // Footer
  totalHeight += SZ_SMALL + MARGIN + 8

  // ── Segunda pasada: dibujar ──────────────────────────────────────────────
  const MIN_H   = Math.round(150 * (203 / 25.4))  // 150 mm ≈ 1200 dots
  const canvas  = document.createElement('canvas')
  canvas.width  = W
  canvas.height = Math.max(totalHeight, MIN_H)
  const ctx = canvas.getContext('2d')!

  // Fondo blanco
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = '#000000'

  let y = MARGIN

  // Logo
  if (logoImg) {
    const scale = Math.min((IW * 0.7) / logoImg.naturalWidth, 1)
    const lw = Math.round(logoImg.naturalWidth * scale)
    const lh = Math.round(logoImg.naturalHeight * scale)
    ctx.drawImage(logoImg, (W - lw) / 2, y, lw, lh)
    y += lh + 8
  }

  // Nombre empresa
  if (cfg.emp_nombre) {
    setFont(ctx, SZ_TITLE, true)
    drawCentered(ctx, cfg.emp_nombre, y + SZ_TITLE)
    y += SZ_TITLE + 6
  }

  setFont(ctx, SZ_SMALL)
  if (cfg.emp_direccion) {
    drawCentered(ctx, cfg.emp_direccion, y + SZ_SMALL)
    y += SZ_SMALL + 4
  }
  const cifTel = [
    cfg.emp_cif      ? `CIF: ${cfg.emp_cif}` : '',
    cfg.emp_telefono ? `Tel: ${cfg.emp_telefono}` : '',
  ].filter(Boolean).join('   ')
  if (cifTel) {
    drawCentered(ctx, cifTel, y + SZ_SMALL)
    y += SZ_SMALL + 4
  }
  if (cfg.emp_email) {
    drawCentered(ctx, cfg.emp_email, y + SZ_SMALL)
    y += SZ_SMALL + 4
  }

  // Separador
  y += 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.lineWidth = 1; ctx.stroke()
  y += 10

  // Documento + fecha en misma línea
  const fechaStr = formatDate(data.fecha)
  const docLabel = `${data.tipodoc_label.toUpperCase()} ${data.serie}-${data.numero}`
  setFont(ctx, SZ_BODY, true)
  ctx.fillText(docLabel, MARGIN, y + SZ_BODY)
  drawRight(ctx, fechaStr, W - MARGIN, y + SZ_BODY)
  y += SZ_BODY + 6

  if (data.agenteNombre) {
    setFont(ctx, SZ_SMALL)
    ctx.fillText(`Agente: ${data.agenteNombre}`, MARGIN, y + SZ_SMALL)
    y += SZ_SMALL + 4
  }

  // Separador
  y += 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.stroke()
  y += 10

  // Cliente
  setFont(ctx, SZ_BODY, true)
  ctx.fillText(`Cliente: ${data.cli_nombre}`, MARGIN, y + SZ_BODY)
  y += SZ_BODY + 6

  // Separador
  y += 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.stroke()
  y += 10

  // Header columnas
  setFont(ctx, SZ_SMALL, true)
  ctx.fillText('DESCRIPCIÓN', MARGIN, y + SZ_SMALL)
  drawRight(ctx, 'UDS',    MARGIN + C_D + C_U,        y + SZ_SMALL)
  drawRight(ctx, 'PRECIO', MARGIN + C_D + C_U + C_P,  y + SZ_SMALL)
  drawRight(ctx, 'IMPORTE',MARGIN + IW,                y + SZ_SMALL)
  y += SZ_SMALL + 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.lineWidth = 0.5; ctx.stroke(); ctx.lineWidth = 1
  y += 4

  // Líneas de artículo
  for (const lin of data.lineas) {
    const uds = parseFloat(String(lin.unidades)) || 0
    if (uds === 0 && !lin.es_canon) continue

    const precioNeto = lin.precio * (1 - lin.dto / 100)
    const importe    = uds * precioNeto
    const udsStr     = uds.toLocaleString('es-ES', { maximumFractionDigits: 3 })

    let desc = lin.descripcion
    if (lin.talla || lin.color) desc += ` (${[lin.talla, lin.color].filter(Boolean).join('/')})`

    setFont(ctx, SZ_BODY)
    const descLines = wrapText(ctx, desc, C_D - 4)
    for (let i = 0; i < descLines.length; i++) {
      ctx.fillText(descLines[i], MARGIN, y + SZ_BODY)
      if (i === 0) {
        drawRight(ctx, udsStr,          MARGIN + C_D + C_U,        y + SZ_BODY)
        drawRight(ctx, money(precioNeto),MARGIN + C_D + C_U + C_P, y + SZ_BODY)
        drawRight(ctx, money(importe),  MARGIN + IW,               y + SZ_BODY)
      }
      y += SZ_BODY + 4
    }

    if (lin.dto > 0) {
      setFont(ctx, SZ_SMALL)
      ctx.fillText(`  Dto: ${lin.dto}%`, MARGIN, y + SZ_SMALL)
      y += SZ_SMALL + 3
    }
    if (lin.tipo_unidad === 1 && lin.gramos) {
      setFont(ctx, SZ_SMALL)
      const gr = parseFloat(String(lin.gramos)).toLocaleString('es-ES', { maximumFractionDigits: 3 })
      ctx.fillText(`  → ${gr} ${lin.unidad || 'kg'}`, MARGIN, y + SZ_SMALL)
      y += SZ_SMALL + 3
    }
  }

  // Separador tras líneas de artículo
  y += 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.stroke()
  y += 10

  // ── Empuje: totales siempre en la parte baja del ticket (mín. ~13 cm) ──────
  const totalesH =
    (SZ_SMALL + 4) +                           // Base imponible
    totalesArr.length * (SZ_SMALL + 4) +       // filas IVA
    4 + 14 + (SZ_TOTAL + 8) + 14 +            // sep + TOTAL grande + sep
    (SZ_SMALL + MARGIN + 8)                    // footer
  const MIN_CM13 = Math.round(130 * (203 / 25.4))  // 130 mm ≈ 1040 dots
  const totalsMinY = MIN_CM13 - totalesH
  if (y < totalsMinY) y = totalsMinY

  // Totales IVA
  setFont(ctx, SZ_SMALL)
  ctx.fillText('Base imponible:', MARGIN, y + SZ_SMALL)
  drawRight(ctx, `${money(totalBase)} EUR`, W - MARGIN, y + SZ_SMALL)
  y += SZ_SMALL + 4
  for (const t of totalesArr) {
    ctx.fillText(`IVA ${t.piva}%:`, MARGIN, y + SZ_SMALL)
    drawRight(ctx, `${money(t.cuota)} EUR`, W - MARGIN, y + SZ_SMALL)
    y += SZ_SMALL + 4
  }

  // Separador
  y += 4
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1
  y += 8

  // TOTAL grande
  setFont(ctx, SZ_TOTAL, true)
  ctx.fillText('TOTAL:', MARGIN, y + SZ_TOTAL)
  drawRight(ctx, `${money(data.total)} EUR`, W - MARGIN, y + SZ_TOTAL)
  y += SZ_TOTAL + 8

  // Separador
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y)
  ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1
  y += 14

  // Firma
  if (firmaImg) {
    setFont(ctx, SZ_SMALL, true)
    drawCentered(ctx, 'FIRMA DEL CLIENTE', y + SZ_SMALL)
    y += SZ_SMALL + 6
    const scale = Math.min(IW / firmaImg.naturalWidth, 1)
    const fw = Math.round(firmaImg.naturalWidth * scale)
    const fh = Math.round(firmaImg.naturalHeight * scale)
    ctx.drawImage(firmaImg, (W - fw) / 2, y, fw, fh)
    y += fh + 8
  }

  // Footer
  setFont(ctx, SZ_SMALL)
  drawCentered(ctx, 'Gracias por su compra', y + SZ_SMALL)

  return canvas
}

// ─── Canvas → bytes ESC/POS raster (GS v 0) ─────────────────────────────────
/**
 * Convierte el canvas de 1bit a bytes ESC/POS usando el comando GS v 0.
 * Los bytes negros (luminancia < 128) se imprimen; los blancos se saltan.
 */
function canvasToEscPos(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  // GS v 0: comando raster nativo, soportado por BIXOLON SPP-R410 y similares.
  // xL/xH = bytes por línea (width debe ser múltiplo de 8).
  const widthBytes = Math.ceil(width / 8)
  const bitmapData = new Uint8Array(widthBytes * height)

  for (let row = 0; row < height; row++) {
    for (let byteCol = 0; byteCol < widthBytes; byteCol++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const col = byteCol * 8 + bit
        if (col < width) {
          const idx = (row * width + col) * 4
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          if (lum < 128) byte |= (0x80 >> bit)
        }
      }
      bitmapData[row * widthBytes + byteCol] = byte
    }
  }

  const xL = widthBytes & 0xFF
  const xH = (widthBytes >> 8) & 0xFF
  const yL = height & 0xFF
  const yH = (height >> 8) & 0xFF

  // ESC @ reset + GS v 0 imagen raster + feed + cut
  const header = new Uint8Array([0x1B, 0x40, 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
  const footer = new Uint8Array([0x1B, 0x64, 0x04, 0x1D, 0x56, 0x42, 0x00])
  const result = new Uint8Array(header.length + bitmapData.length + footer.length)
  result.set(header, 0)
  result.set(bitmapData, header.length)
  result.set(footer, header.length + bitmapData.length)
  return result
}

// ─── Toast informativo ───────────────────────────────────────────────────────
function showToast(msg: string, durationMs = 5000): void {
  const toast = document.createElement('div')
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:999999', 'background:#1e293b', 'color:#f1f5f9',
    'padding:14px 18px', 'border-radius:12px', 'font-family:system-ui,sans-serif',
    'font-size:14px', 'line-height:1.5', 'max-width:340px', 'width:calc(100% - 32px)',
    'box-shadow:0 8px 32px rgba(0,0,0,0.4)', 'text-align:center',
  ].join(';')
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => { try { document.body.removeChild(toast) } catch { /* ok */ } }, durationMs)
}

// ─── Web Bluetooth BLE — conexión directa a Bixolon (gratis) ─────────────────
//
// ARQUITECTURA:
//   requestDevice() requiere gesto de usuario Y debe ejecutarse ANTES de cualquier
//   await largo. Por eso separamos "vincular" (botón dedicado, sin awaits previos)
//   de "imprimir" (reconecta solo con getDevices + gatt.connect con timeout corto).
//
// UUIDs Bixolon SPP-R410 + compatibles:
const BLE_SERVICES = [
  '0000ae30-0000-1000-8000-00805f9b34fb',  // Bixolon propio (AE30)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // ISSC Transparent (Bixolon SPP-R series)
  '0000ffe0-0000-1000-8000-00805f9b34fb',  // HM-10 UART
  '000018f0-0000-1000-8000-00805f9b34fb',  // Bixolon legacy
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',  // Nordic UART
]
const BLE_PAIRS: [string, string][] = [
  ['0000ae30-0000-1000-8000-00805f9b34fb', '0000ae01-0000-1000-8000-00805f9b34fb'],
  // ISSC Transparent Service (Bixolon SPP-R210/R310/R410 BLE)
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
  ['0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffe1-0000-1000-8000-00805f9b34fb'],
  ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
  ['6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _bleDev:  any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _bleChar: any = null

// gatt.connect() puede tardar 20s (default Android timeout) → cortamos a 10s
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _gattConnect(dev: any): Promise<any> {
  return Promise.race([
    dev.gatt.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('GATT_TIMEOUT')), 10000),
    ),
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _charFromServer(srv: any): Promise<any> {
  // Probar UUIDs conocidos
  for (const [svc, chr] of BLE_PAIRS) {
    try {
      const service = await srv.getPrimaryService(svc)
      return await service.getCharacteristic(chr)
    } catch { /* siguiente */ }
  }
  // Fallback: enumerar todos y coger el primero escribible
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services: any[] = await srv.getPrimaryServices()
    for (const s of services) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chars: any[] = await s.getCharacteristics()
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c
      }
    }
  } catch { /* no soportado */ }
  throw new Error('BLE_NO_SERVICE')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _bleWrite(char: any, chunk: ArrayBuffer): Promise<void> {
  if (char.properties?.write && typeof char.writeValueWithResponse === 'function') {
    await char.writeValueWithResponse(chunk)
  } else if (typeof char.writeValueWithoutResponse === 'function') {
    await char.writeValueWithoutResponse(chunk)
  } else if (typeof char.writeValue === 'function') {
    await char.writeValue(chunk)
  } else {
    throw new Error('BLE_NO_WRITE')
  }
}

// ─── Vincular impresora (llamar desde onClick directo, sin awaits previos) ────
// requestDevice() necesita gesto de usuario: NO poner awaits largos antes.
// Tras seleccionar el dispositivo, conectamos GATT aquí mismo (sin timeout
// restrictivo) para que al imprimir ya esté listo.
export function connectPrinterBle(onPaired?: (deviceName: string) => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth
  if (!bt) { showToast('Web Bluetooth no disponible en este navegador'); return }
  bt.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then(async (device: any) => {
      _bleDev  = device
      _bleChar = null
      device.addEventListener('gattserverdisconnected', () => { _bleChar = null })
      const name = device.name || 'Impresora'
      showToast(`🔵 Conectando a ${name}…`)
      try {
        const srv = await device.gatt.connect()
        try {
          _bleChar = await _charFromServer(srv)
          alert(`✅ ÉXITO\n${name} conectada y lista.\nServicio encontrado. Puedes cerrar esto e imprimir.`)
        } catch (charErr) {
          // GATT conectó pero no encontró característica escribible
          alert(`⚠️ CONECTADO pero sin canal de impresión\nDispositivo: ${name}\nServicio GATT conectó pero no se encontró característica con escritura.\nError: ${charErr}\n\nEsto puede significar que el servicio BLE de impresión no está en la lista de UUIDs conocidos.`)
        }
      } catch (connErr) {
        alert(`❌ GATT FALLÓ\nDispositivo: ${name}\nNo se pudo establecer la conexión GATT BLE.\nError: ${(connErr as Error)?.message || connErr}\n\nPosible causa: la impresora no acepta BLE GATT o está ocupada.`)
      }
      onPaired?.(name)
    })
    .catch((err: Error) => {
      if (err.name !== 'NotFoundError' && err.name !== 'NotAllowedError') {
        showToast(`Error vinculando: ${err.message}`)
      }
    })
}

export function hasBleDevice(): boolean { return _bleDev !== null }
export function getBleDeviceName(): string { return _bleDev?.name || '' }

// ─── Conectar para imprimir (sin picker, solo reconectar) ────────────────────
// No llama a requestDevice. Si no hay dispositivo vinculado, lanza BLE_NO_DEVICE.
async function _connectForPrint(): Promise<unknown> {
  // 1. Reusar conexión activa
  if (_bleChar && _bleDev?.gatt?.connected) return _bleChar

  // 2. Reconectar al _bleDev ya guardado (timeout 3s)
  if (_bleDev) {
    try {
      showToast('🔵 Conectando a la impresora…', 3000)
      const srv = await _gattConnect(_bleDev)
      _bleChar = await _charFromServer(srv)
      return _bleChar
    } catch { _bleChar = null }
  }

  // 3. Recuperar dispositivos previamente autorizados por Chrome (sin picker, sin gesto)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth
  if (typeof bt?.getDevices === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const granted: any[] = await bt.getDevices()
      for (const dev of granted) {
        try {
          showToast('🔵 Conectando a la impresora…', 3000)
          const srv  = await _gattConnect(dev)   // timeout 3s → no cuelga 20s
          const char = await _charFromServer(srv)
          _bleDev = dev
          _bleChar = char
          dev.addEventListener('gattserverdisconnected', () => { _bleChar = null })
          return _bleChar
        } catch { /* probar siguiente */ }
      }
    } catch { /* getDevices no disponible */ }
  }

  // Sin dispositivo vinculado
  throw new Error('BLE_NO_DEVICE')
}

async function _sendViaBle(bytes: Uint8Array): Promise<void> {
  const char = await _connectForPrint()
  const MTU = 200
  for (let i = 0; i < bytes.length; i += MTU) {
    await _bleWrite(char, bytes.subarray(i, i + MTU).buffer as ArrayBuffer)
    if (i + MTU < bytes.length) await new Promise(r => setTimeout(r, 8))
  }
  showToast('✅ Ticket enviado a la impresora', 2500)
}

// ─── AndroidBridge (APK nativa Solba Panel) ───────────────────────────────────
// Cuando la web corre dentro de la APK, window.AndroidBridge está disponible
// con: listBluetoothDevices(), connectPrinter(address), printESCPOS(base64),
// disconnectPrinter().

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAndroidBridge(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (typeof (window as any).AndroidBridge !== 'undefined') ? (window as any).AndroidBridge : null
}

export function hasAndroidBridge(): boolean { return getAndroidBridge() !== null }

/** Devuelve lista de dispositivos BT emparejados en el Android (solo si hay APK). */
export function listBluetoothDevices(): Array<{name: string; address: string}> {
  const bridge = getAndroidBridge()
  if (!bridge) return []
  try { return JSON.parse(bridge.listBluetoothDevices()) } catch { return [] }
}

/** Conecta la impresora por MAC. Devuelve true si OK. */
export function connectPrinterNative(address: string): boolean {
  const bridge = getAndroidBridge()
  if (!bridge) return false
  const result: string = bridge.connectPrinter(address)
  return result === 'OK'
}

/** Envía bytes ESC/POS a la impresora conectada (base64). Devuelve true si OK. */
function _sendViaNative(bytes: Uint8Array): boolean {
  const bridge = getAndroidBridge()
  if (!bridge) return false
  // Convertir Uint8Array → base64
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const b64 = btoa(binary)
  const result: string = bridge.printESCPOS(b64)
  if (result === 'OK') return true
  showToast(`⚠️ Error al imprimir: ${result.replace('ERROR:', '')}`)
  return false
}

/** Muestra un selector de impresoras BT y retorna la dirección elegida (o null). */
async function _showPrinterPicker(): Promise<string | null> {
  const devices = listBluetoothDevices()
  if (devices.length === 0) {
    showToast('No hay impresoras Bluetooth emparejadas en este dispositivo')
    return null
  }
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:999999',
      'background:rgba(0,0,0,0.65)',
      'display:flex','align-items:flex-end','justify-content:center',
    ].join(';')

    const sheet = document.createElement('div')
    sheet.style.cssText = [
      'background:#fff','border-radius:16px 16px 0 0',
      'width:100%','max-width:480px',
      'padding:20px 16px 32px','box-sizing:border-box',
      'font-family:system-ui,sans-serif',
    ].join(';')

    const title = document.createElement('p')
    title.textContent = 'Selecciona la impresora'
    title.style.cssText = 'font-size:16px;font-weight:700;color:#1e293b;margin:0 0 14px'

    sheet.appendChild(title)

    devices.forEach(dev => {
      const btn = document.createElement('button')
      btn.style.cssText = [
        'display:block','width:100%','text-align:left',
        'padding:14px 16px','margin-bottom:8px',
        'border:1px solid #e2e8f0','border-radius:10px',
        'background:#f8fafc','font-size:14px','font-weight:600',
        'color:#334155','cursor:pointer',
      ].join(';')
      btn.innerHTML = `🖨️ ${dev.name}<br><span style="font-size:11px;font-weight:400;color:#94a3b8">${dev.address}</span>`
      btn.onclick = () => {
        document.body.removeChild(overlay)
        resolve(dev.address)
      }
      sheet.appendChild(btn)
    })

    const cancel = document.createElement('button')
    cancel.textContent = 'Cancelar'
    cancel.style.cssText = [
      'display:block','width:100%','padding:12px',
      'border:none','background:none','color:#64748b',
      'font-size:14px','font-weight:600','cursor:pointer','margin-top:4px',
    ].join(';')
    cancel.onclick = () => { document.body.removeChild(overlay); resolve(null) }
    sheet.appendChild(cancel)

    overlay.appendChild(sheet)
    document.body.appendChild(overlay)
  })
}

// Guardar última impresora seleccionada en localStorage
const PREF_BT_KEY = 'solba_bt_address'
function _getSavedAddress(): string { return localStorage.getItem(PREF_BT_KEY) || '' }
function _saveAddress(addr: string): void { localStorage.setItem(PREF_BT_KEY, addr) }

/** Envía bytes por la APK nativa: reconecta a la impresora guardada o muestra selector. */
async function _sendViaNativePrinter(bytes: Uint8Array): Promise<boolean> {
  let address = _getSavedAddress()
  const bridge = getAndroidBridge()
  if (!bridge) return false

  if (!address) {
    address = await _showPrinterPicker() || ''
    if (!address) return false
  }

  showToast('🖨️ Conectando a la impresora…', 4000)
  let ok = connectPrinterNative(address)
  if (!ok) {
    // Puede que la dirección guardada ya no funcione → mostrar selector
    showToast('⚠️ No se pudo conectar. Elige otra impresora.', 3000)
    address = await _showPrinterPicker() || ''
    if (!address) return false
    ok = connectPrinterNative(address)
    if (!ok) { showToast('❌ No se pudo conectar a la impresora'); return false }
  }

  _saveAddress(address)
  const sent = _sendViaNative(bytes)
  if (sent) showToast('✅ Ticket enviado a la impresora', 2500)
  return sent
}

// ─── Envío de bytes a la impresora ───────────────────────────────────────────
function sendToRawBt(bytes: Uint8Array): void {
  if (hasAndroidBridge()) {
    // Estamos dentro de la APK nativa → Bluetooth SPP directo
    _sendViaNativePrinter(bytes) // async pero no necesitamos await aquí
    return
  }
  // Fallback: descarga PNG para abrir con app externa
  showToast('📥 Instala la app Solba Panel para imprimir directamente', 5000)
}

function _sendPngFallback(canvas: HTMLCanvasElement): void {
  if (hasAndroidBridge()) {
    // Dentro de APK: usar bridge en vez de descargar
    canvas.toBlob(async blob => {
      if (!blob) return
      // Convertir blob a Uint8Array y enviar como ESC/POS raster
      const buf = await blob.arrayBuffer()
      sendToRawBt(new Uint8Array(buf))
    }, 'image/png')
    return
  }
  // Sin APK: descarga el PNG
  canvas.toBlob(blob => {
    if (!blob) { showToast('Error generando imagen del ticket'); return }
    showToast('📥 Instala la app Solba Panel para imprimir directamente', 5000)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ticket.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }, 'image/png')
}

function _sendPrnFallback(bytes: Uint8Array): void {
  if (hasAndroidBridge()) {
    _sendViaNativePrinter(bytes)
    return
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'ticket.prn'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// ─── Modal de previsualización ───────────────────────────────────────────────
/**
 * Muestra el ticket (como imagen del canvas) en un overlay fullscreen.
 * Devuelve true si el usuario pulsa "Imprimir", false si pulsa "Cancelar".
 */
function showPreviewModal(canvas: HTMLCanvasElement, onPrint?: () => void): Promise<boolean> {
  return new Promise(resolve => {
    const dataUrl = canvas.toDataURL('image/png')

    // Overlay
    const overlay = document.createElement('div')
    overlay.id = '__ticket_preview_overlay__'
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:rgba(0,0,0,0.75)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'overflow:hidden',
    ].join(';')

    // Barra superior
    const toolbar = document.createElement('div')
    toolbar.style.cssText = [
      'width:100%', 'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:12px 16px', 'background:#1e293b', 'flex-shrink:0',
      'box-sizing:border-box',
    ].join(';')

    const title = document.createElement('span')
    title.textContent = 'Vista previa del ticket'
    title.style.cssText = 'color:#f1f5f9;font-family:system-ui,sans-serif;font-size:15px;font-weight:600'

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:10px'

    const btnCancel = document.createElement('button')
    btnCancel.textContent = 'Cancelar'
    btnCancel.style.cssText = [
      'padding:8px 18px', 'border-radius:8px', 'border:1px solid #475569',
      'background:#334155', 'color:#cbd5e1', 'font-size:14px', 'font-weight:500',
      'cursor:pointer', 'font-family:system-ui,sans-serif',
    ].join(';')

    const btnPrint = document.createElement('button')
    btnPrint.textContent = '🖨️ Imprimir'
    btnPrint.style.cssText = [
      'padding:8px 18px', 'border-radius:8px', 'border:none',
      'background:#f59e0b', 'color:#1c1917', 'font-size:14px', 'font-weight:700',
      'cursor:pointer', 'font-family:system-ui,sans-serif',
    ].join(';')

    btnRow.appendChild(btnCancel)
    btnRow.appendChild(btnPrint)
    toolbar.appendChild(title)
    toolbar.appendChild(btnRow)

    // Contenedor scrollable de imagen
    const scroll = document.createElement('div')
    scroll.style.cssText = 'flex:1;overflow-y:auto;width:100%;display:flex;justify-content:center;padding:16px;box-sizing:border-box'

    const img = document.createElement('img')
    img.src = dataUrl
    // Escalar al ancho de pantalla manteniendo proporciones, máx 400px
    img.style.cssText = 'max-width:min(100%, 400px);height:auto;border:1px solid #334155;border-radius:4px;background:#fff'
    img.alt = 'Vista previa ticket'

    scroll.appendChild(img)
    overlay.appendChild(toolbar)
    overlay.appendChild(scroll)
    document.body.appendChild(overlay)

    function done(result: boolean) {
      try { document.body.removeChild(overlay) } catch { /* ignorar */ }
      resolve(result)
    }

    btnCancel.addEventListener('click', () => done(false))
    btnPrint.addEventListener('click', () => {
      // Si hay callback (Android: enviar a RawBT), llamarlo desde el clic
      if (onPrint) onPrint()
      done(true)
    })
  })
}

// ─── Imprimir ────────────────────────────────────────────────────────────────
/**
 * Muestra previsualización gráfica y, si el usuario confirma:
 *   - Android: envía ESC/POS raster a RawBT.
 *   - Desktop: window.print() con CSS.
 */
export async function printTicket(
  data: TicketData,
  cfg: Partial<PrinterConfig>,
): Promise<void> {

  const isAndroid = /android/i.test(navigator.userAgent)
  const wide = (cfg.paper_width ?? 80) === 100

  if (isAndroid) {
    const canvas = await buildTicketCanvas(data, cfg, wide)
    if (hasAndroidBridge()) {
      // APK nativa: previsualizar y enviar ESC/POS directo por Bluetooth SPP
      const bytes = canvasToEscPos(canvas)
      await showPreviewModal(canvas, () => sendToRawBt(bytes))
    } else {
      // Navegador Chrome sin APK: previsualizar y ofrecer descarga + botón instalar APK
      await showPreviewModal(canvas, () => _sendPngFallback(canvas))
    }
    return
  }

  // ── Desktop: previsualizar con canvas y luego window.print() con CSS ────
  const canvas    = await buildTicketCanvas(data, cfg, wide)
  const confirmed = await showPreviewModal(canvas)
  if (!confirmed) return

  const inner = buildTicketHtml(data, cfg)
  const bodyMatch   = inner.match(/<body>([\s\S]*)<\/body>/)
  const bodyContent = bodyMatch ? bodyMatch[1] : inner
  const styleMatch  = inner.match(/<style>([\s\S]*?)<\/style>/)
  const ticketStyle = styleMatch ? styleMatch[1] : ''

  const styleEl = document.createElement('style')
  styleEl.id = '__ticket_print_style__'
  styleEl.textContent = `
    @media print {
      body > *:not(#__ticket_print_root__) { display: none !important; }
      #__ticket_print_root__ { display: block !important; }
    }
    @media screen { #__ticket_print_root__ { display: none !important; } }
    @media print { ${ticketStyle} }
  `
  const div = document.createElement('div')
  div.id = '__ticket_print_root__'
  div.innerHTML = bodyContent

  document.head.appendChild(styleEl)
  document.body.appendChild(div)
  await new Promise<void>(r => setTimeout(r, 300))
  window.print()
  setTimeout(() => {
    try { document.head.removeChild(styleEl) } catch { /* ignorar */ }
    try { document.body.removeChild(div) } catch { /* ignorar */ }
  }, 2000)
}
