import { obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

const BASE_API = (import.meta.env.VITE_API_URL || 'https://api.globalfoodsmexico.com').replace(/\/$/, '')

export interface VendedorCorte {
  id: number
  usuario: string
  nombre: string
  tipoUsuario: string
}

export interface OrdenCorte {
  id: number
  idVendedor: number | null
  nombreVendedor?: string
  monto: number
  totalPedidos: number
  estatus: string
  codigo?: string
  fechaSolicitud: string
}

export interface PedidoCortado {
  idPedido: number
  idCorte: number
  estatus: string
  idVendedor: number | null
}

function mapearOrden(crudo: Record<string, unknown> | null | undefined): OrdenCorte | null {
  if (!crudo) return null
  const codigoCrudo = crudo.Codigo ?? crudo.codigo
  const idVendedorCrudo = crudo.IdVendedor ?? crudo.idVendedor
  const nombreVendedorCrudo = crudo.NombreVendedor ?? crudo.nombreVendedor
  return {
    id: Number(crudo.Id ?? crudo.id),
    idVendedor: idVendedorCrudo == null ? null : Number(idVendedorCrudo),
    nombreVendedor: nombreVendedorCrudo ? String(nombreVendedorCrudo).trim() : undefined,
    monto: Number(crudo.Monto ?? crudo.monto),
    totalPedidos: Number(crudo.TotalPedidos ?? crudo.totalPedidos),
    estatus: String(crudo.Estatus ?? crudo.estatus ?? 'Pendiente'),
    codigo: codigoCrudo ? String(codigoCrudo).trim() : undefined,
    fechaSolicitud: String(crudo.FechaSolicitud ?? crudo.fechaSolicitud ?? ''),
  }
}

function cabeceras(): HeadersInit {
  const token = obtenerToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function obtenerVendedoresCorte(): Promise<VendedorCorte[]> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/vendedores`, {
    headers: cabeceras(),
  })
  if (!respuesta.ok) throw new Error('No fue posible consultar los vendedores.')
  const datos = (await respuesta.json()) as { vendedores?: Record<string, unknown>[] }
  return (datos.vendedores ?? []).map((item) => ({
    id: Number(item.Id ?? item.id),
    usuario: String(item.Usuario ?? item.usuario ?? ''),
    nombre: String(item.Nombre ?? item.nombre ?? item.Usuario ?? item.usuario ?? ''),
    tipoUsuario: String(item.TipoUsuario ?? item.tipoUsuario ?? ''),
  }))
}

/** Para BannerCorteVue (vendedor): trae solo su orden pendiente; para admin acepta filtro opcional. */
export async function obtenerOrdenCortePendiente(idVendedor?: number): Promise<OrdenCorte | null> {
  const consulta = idVendedor ? `?idVendedor=${encodeURIComponent(idVendedor)}` : ''
  const respuesta = await fetch(`${BASE_API}/api/cortes/pendiente${consulta}`, {
    headers: cabeceras(),
  })
  if (!respuesta.ok) throw new Error('No fue posible consultar las órdenes de corte.')
  const datos = (await respuesta.json()) as { orden?: Record<string, unknown> | null }
  return mapearOrden(datos.orden)
}

/** Para administrador (ReportesVista): obtiene todas las órdenes de corte pendientes en paralelo. */
export async function obtenerOrdenesCortePendientes(): Promise<OrdenCorte[]> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/pendiente`, {
    headers: cabeceras(),
  })
  if (!respuesta.ok) throw new Error('No fue posible consultar las órdenes de corte.')
  const datos = (await respuesta.json()) as {
    orden?: Record<string, unknown> | null
    ordenes?: Record<string, unknown>[]
  }

  if (Array.isArray(datos.ordenes)) {
    return datos.ordenes
      .map((item) => mapearOrden(item))
      .filter((item): item is OrdenCorte => item !== null)
  }

  const unica = mapearOrden(datos.orden)
  return unica ? [unica] : []
}

export async function obtenerPedidosCortados(): Promise<PedidoCortado[]> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/pedidos-cortados`, {
    headers: cabeceras(),
  })
  if (!respuesta.ok) throw new Error('No fue posible consultar los pedidos incluidos en cortes.')
  const datos = (await respuesta.json()) as { pedidos?: Record<string, unknown>[] }
  return (datos.pedidos ?? []).map((item) => ({
    idPedido: Number(item.IdPedido ?? item.idPedido),
    idCorte: Number(item.IdCorte ?? item.idCorte),
    estatus: String(item.Estatus ?? item.estatus ?? 'Pendiente'),
    idVendedor: item.IdVendedor == null && item.idVendedor == null ? null : Number(item.IdVendedor ?? item.idVendedor),
  }))
}

export async function crearOrdenCorte(
  idVendedor: number,
  monto: number,
  totalPedidos: number,
  idsPedidos: number[],
): Promise<OrdenCorte> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/orden`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ idVendedor, monto, totalPedidos, idsPedidos }),
  })
  const datos = (await respuesta.json().catch(() => ({}))) as {
    error?: string
    orden?: Record<string, unknown>
  }
  if (!respuesta.ok) {
    throw new Error(datos.error || 'No fue posible enviar la orden de corte.')
  }
  const orden = mapearOrden(datos.orden)
  if (!orden) throw new Error('Respuesta inválida del servidor.')
  return orden
}

export async function confirmarOrdenCorte(id: number, codigo: string): Promise<void> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/${id}/confirmar`, {
    method: 'PUT',
    headers: cabeceras(),
    body: JSON.stringify({ codigo }),
  })
  if (!respuesta.ok) {
    const datos = (await respuesta.json().catch(() => ({}))) as { error?: string }
    throw new Error(datos.error || 'No fue posible confirmar la orden de corte.')
  }
}