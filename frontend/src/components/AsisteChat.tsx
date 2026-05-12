import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client'

interface Mensaje {
  rol: 'usuario' | 'asistente' | 'error'
  texto: string
}

const SUGERENCIAS = [
  '¿Qué se vendió más ayer?',
  '¿Cuáles son los 5 clientes con más ventas este mes?',
  '¿Qué clientes tienen cobros pendientes?',
  '¿Cuál es el artículo más rentable?',
  '¿Cuánto hemos facturado hoy?',
]

export default function AsisteChat() {
  const [abierto, setAbierto] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { rol: 'asistente', texto: '¡Hola! Soy tu asistente de SOLBA. Puedes preguntarme sobre ventas, clientes, artículos o cobros pendientes.' }
  ])
  const [cargando, setCargando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, cargando])

  useEffect(() => {
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [abierto])

  const enviar = async (texto?: string) => {
    const q = (texto ?? pregunta).trim()
    if (!q || cargando) return
    setPregunta('')
    setMensajes(prev => [...prev, { rol: 'usuario', texto: q }])
    setCargando(true)
    try {
      const { data } = await api.post('/api/asistente/chat', { pregunta: q })
      setMensajes(prev => [...prev, { rol: 'asistente', texto: data.respuesta }])
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Error al conectar con el asistente.'
      setMensajes(prev => [...prev, { rol: 'error', texto: msg }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 shadow-lg flex items-center justify-center transition-all duration-200"
        title="Asistente IA"
      >
        {abierto ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          /* Ícono de chat/IA */
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.953 9.953 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14H7v-2h4v2zm6 0h-4v-2h4v2zm0-4H7V8h10v4z"/>
          </svg>
        )}
      </button>

      {/* Ventana de chat */}
      {abierto && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          style={{ height: '520px' }}>
          {/* Cabecera */}
          <div className="bg-green-500 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Asistente SOLBA</p>
              <p className="text-green-100 text-xs">Powered by GPT-4o mini</p>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-900">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.rol === 'usuario'
                    ? 'bg-green-500 text-white rounded-br-sm'
                    : m.rol === 'error'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-bl-sm'
                    : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
                }`}>
                  {m.texto}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Sugerencias (solo al inicio) */}
          {mensajes.length === 1 && (
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Sugerencias:</p>
              <div className="flex flex-wrap gap-1">
                {SUGERENCIAS.map((s, i) => (
                  <button key={i} onClick={() => enviar(s)}
                    className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-green-50 hover:border-green-300 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder="Escribe tu pregunta..."
              disabled={cargando}
              className="flex-1 text-sm rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 dark:text-white disabled:opacity-50"
            />
            <button
              onClick={() => enviar()}
              disabled={!pregunta.trim() || cargando}
              className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
