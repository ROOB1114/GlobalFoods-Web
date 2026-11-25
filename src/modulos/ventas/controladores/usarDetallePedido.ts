import { computed, ref, shallowRef } from 'vue'

import { estadoDePedido, type EstadoPantalla } from '@/modulos/ventas/controladores/estadosPedido'
import { MODALIDADES } from '@/modulos/ventas/controladores/formatosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
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
  /** Usuario de Telegram del cliente; null si no tiene; undefined con el rol cliente (no se muestra). */
  usuarioTelegram: string | null | undefined
  /** Nombre de la sucursal; "Recolección en congeladora" si es IdSucursal 0. */
  sucursal: string
  /** null en recolección: ahí la vista muestra el punto de recolección. */
  direccionEntrega: string | null
  telefonoSucursal: string | null
  /** IdSucursal 0 es recolección; si no, la que diga Observaciones. */
  modalidad: ModalidadEntrega | null
  /** aaaa-mm-dd, de la API; null mientras no se registra el pago (en la web o en el sistema interno). */
  fechaEntrega: string | null
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
   * cancelar o registrar el pago) se sigue viendo el pedido mientras llega la respuesta y, si
   * falla, se queda como estaba. Si ya hay una carga visible en curso, la silenciosa no hace nada.
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
      await Promise.all([
        // Recolección (IdSucursal 0) no tiene sucursal que buscar.
        esSucursalRecoleccion(pedido.idSucursal) ? undefined : directorio.cargarSucursales([pedido.idCliente]),
        directorio.cargarTelegram(pedido.idCliente),
      ])
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
    const sinSucursal = esSucursalRecoleccion(actual.idSucursal)
    const sucursal = sinSucursal ? null : directorio.buscarSucursal(actual.idCliente, actual.idSucursal)
    const modalidad = modalidadDePedido(actual.idSucursal, entrega.modalidad)
    // La de "Dir:" si viene en Observaciones; si no, la de la sucursal. En recolección no hay entrega.
    const direccionEntrega =
      modalidad === 'recoleccion' ? null : (entrega.direccion ?? sucursal?.direccion ?? null)

    return {
      id: actual.id,
      estado: estadoDePedido(actual.estatus),
      registrado: actual.fechaRegistro,
      cliente: directorio.nombreCliente(actual.idCliente),
      usuarioTelegram: directorio.usuarioTelegram(actual.idCliente),
      sucursal: sinSucursal ? MODALIDADES.recoleccion.titulo : (sucursal?.nombre ?? `Sucursal #${actual.idSucursal}`),
      direccionEntrega,
      telefonoSucursal: sucursal?.telefono ?? null,
      modalidad,
      fechaEntrega: actual.fechaEntrega,
      notas: entrega.notas,
      metodoPago: textoMetodoPago(actual.metodoPago),
      lineas: actual.lineas,
      totalKg: actual.totalKg,
      total: actual.total,
    }
  })

  return { cargando, noEncontrado, errorCarga, pedido, cargar }
}
