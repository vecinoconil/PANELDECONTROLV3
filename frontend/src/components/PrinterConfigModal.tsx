/**
 * PrinterConfigModal.tsx
 * Modal de configuración de impresora térmica:
 * datos de empresa para la cabecera del ticket y logo.
 * La impresora se selecciona desde el diálogo de impresión del sistema.
 */
import { useRef, useState } from 'react'
import {
  X, Check, AlertCircle, Loader2, Printer,
  Building2, Phone, Mail, MapPin, FileDigit, Image, Trash2,
} from 'lucide-react'
import {
  loadPrinterConfig, savePrinterConfig,
  printTicket,
  type PrinterConfig, type TicketData,
} from '../utils/thermalPrinter'

interface Props {
  onClose: () => void
  /** Datos actuales del ticket de ejemplo (para imprimir test) */
  testData?: TicketData
}

export default function PrinterConfigModal({ onClose, testData }: Props) {
  const stored = loadPrinterConfig()

  const [empNombre,     setEmpNombre]     = useState(stored.emp_nombre    || '')
  const [empDireccion,  setEmpDireccion]  = useState(stored.emp_direccion || '')
  const [empCif,        setEmpCif]        = useState(stored.emp_cif       || '')
  const [empTelefono,   setEmpTelefono]   = useState(stored.emp_telefono  || '')
  const [empEmail,      setEmpEmail]      = useState(stored.emp_email     || '')
  const [empLogo,       setEmpLogo]       = useState(stored.emp_logo      || '')

  const [testPrinting,  setTestPrinting]  = useState(false)
  const [testError,     setTestError]     = useState('')
  const [testOk,        setTestOk]        = useState(false)

  const [saved,         setSaved]         = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // ── Logo ──────────────────────────────────────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setEmpLogo(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = () => {
    const cfg: Partial<PrinterConfig> = {
      emp_nombre:    empNombre.trim(),
      emp_direccion: empDireccion.trim(),
      emp_cif:       empCif.trim(),
      emp_telefono:  empTelefono.trim(),
      emp_email:     empEmail.trim(),
      emp_logo:      empLogo,
    }
    savePrinterConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Test de impresión ─────────────────────────────────────────────────────
  const handleTestPrint = async () => {
    setTestPrinting(true)
    setTestError('')
    setTestOk(false)
    const cfg: Partial<PrinterConfig> = {
      emp_nombre: empNombre, emp_direccion: empDireccion,
      emp_cif: empCif, emp_telefono: empTelefono, emp_email: empEmail, emp_logo: empLogo,
    }
    const demo: TicketData = testData ?? {
      tipodoc_label: 'Albarán',
      serie: 'A',
      numero: 1,
      fecha: new Date().toISOString(),
      cli_nombre: 'CLIENTE PRUEBA S.L.',
      lineas: [
        { descripcion: 'Artículo de prueba', unidades: '2', precio: 12.50, dto: 0,  piva: 21 },
        { descripcion: 'Otro artículo',      unidades: '1', precio:  5.00, dto: 10, piva: 10 },
      ],
      total: 30.75,
      agenteNombre: 'Agente Test',
    }
    try {
      await printTicket(demo, cfg)
      setTestOk(true)
    } catch (e: any) {
      setTestError(e.message || 'Error imprimiendo')
    } finally {
      setTestPrinting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-800">Configuración de impresora</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Datos empresa ── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Datos de empresa (cabecera del ticket)
            </h3>
            <div className="space-y-2.5">
              {/* Nombre */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Nombre empresa *</label>
                <input
                  className="input text-sm w-full"
                  placeholder="Distribuciones Solba S.L."
                  value={empNombre}
                  onChange={e => setEmpNombre(e.target.value)}
                />
              </div>
              {/* Dirección */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Dirección
                </label>
                <input
                  className="input text-sm w-full"
                  placeholder="Calle Mayor 1, 28001 Madrid"
                  value={empDireccion}
                  onChange={e => setEmpDireccion(e.target.value)}
                />
              </div>
              {/* CIF y Teléfono en fila */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                    <FileDigit className="w-3 h-3" /> CIF
                  </label>
                  <input
                    className="input text-sm w-full"
                    placeholder="B12345678"
                    value={empCif}
                    onChange={e => setEmpCif(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Teléfono
                  </label>
                  <input
                    className="input text-sm w-full"
                    placeholder="91 234 56 78"
                    value={empTelefono}
                    onChange={e => setEmpTelefono(e.target.value)}
                  />
                </div>
              </div>
              {/* Email */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </label>
                <input
                  className="input text-sm w-full"
                  type="email"
                  placeholder="info@empresa.com"
                  value={empEmail}
                  onChange={e => setEmpEmail(e.target.value)}
                />
              </div>
              {/* Logo */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                  <Image className="w-3 h-3" /> Logo (opcional, imprime en el ticket)
                </label>
                {empLogo ? (
                  <div className="flex items-center gap-2">
                    <img src={empLogo} alt="Logo" className="h-12 object-contain border border-slate-200 rounded-lg bg-white p-1" />
                    <button
                      onClick={() => setEmpLogo('')}
                      className="text-xs text-red-600 hover:text-red-700 flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Quitar
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Seleccionar imagen (PNG/JPG)
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-200 space-y-2">
          {/* Test print */}
          <button
            onClick={handleTestPrint}
            disabled={testPrinting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-40"
          >
            {testPrinting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Imprimiendo prueba...</>
              : testOk
                ? <><Check className="w-4 h-4 text-green-600" />Prueba enviada</>
                : <><Printer className="w-4 h-4" />Imprimir ticket de prueba</>
            }
          </button>
          {testError && (
            <p className="text-red-600 text-xs flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{testError}
            </p>
          )}

          {/* Guardar */}
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors flex items-center justify-center gap-2"
          >
            {saved
              ? <><Check className="w-4 h-4" />Guardado</>
              : 'Guardar configuración'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
