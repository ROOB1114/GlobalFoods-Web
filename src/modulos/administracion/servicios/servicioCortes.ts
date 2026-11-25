import { obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

const BASE_API = (import.meta.env.VITE_API_URL || 'https://api.globalfoodsmexico.com').replace(/\/$/, '')

export interface OrdenCorte {
  id: number
  monto: number
  totalPedidos: number
  estatus: string
  codigo?: string
  fechaSolicitud: string
}

function mapearOrden(crudo: Record<string, unknown> | null | undefined): OrdenCorte | null {
  if (!crudo) return null
  const codigoCrudo = crudo.Codigo ?? crudo.codigo
  return {
    id: Number(crudo.Id ?? crudo.id),
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

export async function obtenerOrdenCortePendiente(): Promise<OrdenCorte | null> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/pendiente`, {
    headers: cabeceras(),
  })
  if (!respuesta.ok) throw new Error('No fue posible consultar las órdenes de corte.')
  const datos = (await respuesta.json()) as { orden?: Record<string, unknown> | null }
  return mapearOrden(datos.orden)
}

export interface PedidoCortado {
  idPedido: number
  idCorte: number
  estatus: string
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
  }))
}

export async function crearOrdenCorte(
  monto: number,
  totalPedidos: number,
  idsPedidos: number[],
): Promise<OrdenCorte> {
  const respuesta = await fetch(`${BASE_API}/api/cortes/orden`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ monto, totalPedidos, idsPedidos }),
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