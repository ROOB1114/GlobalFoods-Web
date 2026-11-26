import { obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const MENSAJE_NO_DISPONIBLE = 'No es posible confirmar la disponibilidad en este momento.'

export interface ArticuloInventario {
  /** Código del producto como número. null si la API no lo manda como entero positivo. */
  codigoProducto: number | null
  nombre: string
  talla: string
  unidadMedida: string
  precio: number
  master: number
  cantidadKg: number
}

interface ArticuloInventarioAPI {
  codigoProducto?: string | number | null
  nombre?: string | null
  talla: string
  unidadMedida?: string | null
  precio: number
  master?: number
  cantidadKg?: number
}

function aCodigoProducto(valor: unknown): number | null {
  const texto = typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : ''
  if (!/^\d+$/.test(texto)) return null
  const codigo = Number(texto)
  return Number.isSafeInteger(codigo) && codigo > 0 ? codigo : null
}

function aArticulo(articulo: ArticuloInventarioAPI): ArticuloInventario {
  return {
    codigoProducto: aCodigoProducto(articulo.codigoProducto),
    nombre: String(articulo.nombre ?? '').trim(),
    talla: String(articulo.talla ?? '').trim(),
    unidadMedida: String(articulo.unidadMedida ?? 'KG').trim().toLowerCase() || 'kg',
    precio: Number(articulo.precio ?? 0),
    master: Number(articulo.master ?? 0),
    cantidadKg: Number(articulo.cantidadKg ?? 0),
  }
}

export async function obtenerInventarioActual(
  opciones: { incluirAgotados?: boolean } = {},
): Promise<ArticuloInventario[]> {
  const token = obtenerToken()
  if (!token) {
    throw new Error('La sesión no está activa. Inicia sesión nuevamente.')
  }

  const consulta = opciones.incluirAgotados ? '?incluirAgotados=1' : ''
  let respuestaHttp: Response
  try {
    respuestaHttp = await fetch(`${URL_API.replace(/\/$/, '')}/api/inventario/actual${consulta}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error(MENSAJE_NO_DISPONIBLE)
  }

  const datosRespuesta = (await respuestaHttp.json().catch(() => null)) as
    | ArticuloInventarioAPI[]
    | { error?: string }
    | null

  if (!respuestaHttp.ok) {
    throw new Error(MENSAJE_NO_DISPONIBLE)
  }

  if (!Array.isArray(datosRespuesta)) {
    throw new Error(MENSAJE_NO_DISPONIBLE)
  }

  return datosRespuesta.map(aArticulo)
}

export async function obtenerCatalogoCliente(): Promise<ArticuloInventario[]> {
  const token = obtenerToken()
  if (!token) {
    throw new Error('La sesión no está activa. Inicia sesión nuevamente.')
  }

  let respuestaHttp: Response
  try {
    respuestaHttp = await fetch(`${URL_API.replace(/\/$/, '')}/api/inventario/catalogo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error(MENSAJE_NO_DISPONIBLE)
  }

  const datosRespuesta = (await respuestaHttp.json().catch(() => null)) as
    | ArticuloInventarioAPI[]
    | { error?: string }
    | null

  if (!respuestaHttp.ok || !Array.isArray(datosRespuesta)) {
    throw new Error(MENSAJE_NO_DISPONIBLE)
  }

  return datosRespuesta.map((articulo) =>
    aArticulo({
      ...articulo,
      master: 0,
      cantidadKg: 0,
    }),
  )
}