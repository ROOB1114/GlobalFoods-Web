import { computed, ref, shallowRef } from 'vue'

import { estadoDePedido, type EstadoPantalla } from '@/modulos/ventas/controladores/estadosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { LineaPedido, ModalidadEntrega, Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidoPorId } from '@/modulos/ventas/servicios/servicioPedidos'

export const MENSAJES_DETALLE = {
  cargando: 'Cargando pedido…',
  errorCarga: 'No fue posible consultar el pedido. Intente nuevamente.',
}

export function mensajeNoEncontrado(id: number): string {
  return `No existe un pedido con el folio #${id}.`
}

/** Pedido listo para pintar el detalle. Lo que no exista va en null. */
export interface DetallePedido {
  id: number
  estado: EstadoPantalla
  /** aaaa-mm-dd */
  registrado: string
  cliente: string
  sucursal: string
  direccionEntrega: string | null
  telefonoSucursal: string | null
  modalidad: ModalidadEntrega | null
  /** aaaa-mm-dd */
  fechaEntrega: string | null
  referencias: string | null
  /** Lo que capturó la asesora (lo que queda después de leer el formato de Observaciones). */
  notas: string | null
  /** "Pendiente", "Efectivo" o "Crédito o transferencia"; null si la API no lo trae. */
  metodoPago: string | null
  lineas: LineaPedido[]
  totalKg: number
  total: number
}

/**
 * Consulta de un pedido para su detalle, con los nombres de cliente y sucursal. Distingue el
 * pedido que no existe (404) de los demás errores; con 401 llama a `alVencerSesion`.
 */
export function usarDetallePedido(id: number, opciones: { alVencerSesion: () => void }) {
  const encontrado = shallowRef<Pedido | null>(null)
  const cargando = ref(true)
  const noEncontrado = ref(false)
  const errorCarga = ref(false)
  const directorio = usarDirectorioPedidos()

  /**
   * Pide el pedido a la API. Con `silencioso` (la actualización de cada minuto, o después de
   * cancelar) se sigue viendo el pedido mientras llega la respuesta y, si falla, se queda como
   * estaba. Si ya hay una carga visible en curso, la silenciosa no hace nada.
   */
  async function cargar(opcionesCarga: { silencioso?: boolean } = {}) {
    const silencioso = opcionesCarga.silencioso === true
    if (silencioso && cargando.value) return
    if (!silencioso) {
      cargando.value = true
      noEncontrado.value = false
      errorCarga.value = false
    }
    try {
      const [pedido] = await Promise.all([obtenerPedidoPorId(id), directorio.cargarClientes()])
      await directorio.cargarSucursales([pedido.idCliente])
      encontrado.value = pedido
    } catch (error) {
      const motivo = error instanceof ErrorPedidos ? error.motivo : null
      if (motivo === 'sesion') {
        opciones.alVencerSesion()
        return
      }
      if (silencioso) return
      if (motivo === 'no_encontrado') noEncontrado.value = true
      else errorCarga.value = true
    } finally {
      if (!silencioso) cargando.value = false
    }
  }

  const pedido = computed<DetallePedido | null>(() => {
    const actual = encontrado.value
    if (!actual) return null

    const entrega = leerObservaciones(actual.observaciones)
    const sucursal = directorio.buscarSucursal(actual.idCliente, actual.idSucursal)
    // La de "Dir:" si viene en Observaciones; si no, la de la sucursal. En recolección no hay entrega.
    const direccionEntrega =
      entrega.modalidad === 'recoleccion' ? null : (entrega.direccion ?? sucursal?.direccion ?? null)

    return {
      id: actual.id,
      estado: estadoDePedido(actual.estatus),
      registrado: actual.fechaRegistro,
      cliente: directorio.nombreCliente(actual.idCliente),
      sucursal: sucursal?.nombre ?? `Sucursal #${actual.idSucursal}`,
      direccionEntrega,
      telefonoSucursal: sucursal?.telefono ?? null,
      modalidad: entrega.modalidad,
      fechaEntrega: entrega.fechaEntrega,
      referencias: entrega.referencias,
      notas: entrega.notas,
      metodoPago: textoMetodoPago(actual.metodoPago),
      lineas: actual.lineas,
      totalKg: actual.totalKg,
      total: actual.total,
    }
  })

  return { cargando, noEncontrado, errorCarga, pedido, cargar }
}
