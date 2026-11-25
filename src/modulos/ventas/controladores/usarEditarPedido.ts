import { computed, nextTick, ref } from 'vue'

import { estadoDePedido, sePuedeEditar } from '@/modulos/ventas/controladores/estadosPedido'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { PRESENTACION_PRODUCTO, usarFormularioPedido } from '@/modulos/ventas/controladores/usarFormularioPedido'
import type { Cliente } from '@/modulos/ventas/interfaces/cliente'
import type { LineaPedido, Pedido, ProductoVenta, RenglonPedido } from '@/modulos/ventas/interfaces/pedido'
import { obtenerClientesActivos } from '@/modulos/ventas/servicios/servicioClientesVentas'
import { ErrorPedidos, actualizarPedido, obtenerPedidoPorId } from '@/modulos/ventas/servicios/servicioPedidos'

export const MENSAJES_EDICION = {
  noEditable: (estado: string) => `El pedido ya no puede modificarse porque se encuentra ${estado}.`,
  errorGuardar: 'No fue posible guardar los cambios. Intente nuevamente.',
  exito: 'Pedido actualizado correctamente.',
}

/**
 * Al guardar se regresa al detalle con ?aviso=actualizado; el detalle muestra MENSAJES_EDICION.exito
 * y lo quita de la dirección.
 */
export const AVISO_PEDIDO_ACTUALIZADO = 'actualizado'

/** Va debajo del nombre, en lugar de "Venta por kg", cuando el producto ya no está en el inventario. */
export const PRESENTACION_SIN_INVENTARIO = 'Ya no está en el inventario'

/**
 * Renglón para una línea que ya traía el pedido. Conserva el precio con que se guardó. Su límite
 * es lo disponible en el inventario o la cantidad que ya tenía la línea, lo que sea mayor: esos
 * kg tal vez ya los está contando este mismo pedido. Si el producto ya no está en el inventario
 * (o no se pudo consultar, `inventario` null), la línea se queda con sus datos guardados y no se
 * puede aumentar.
 * `productoId` es el código, igual que en Nuevo pedido; si falta o se repite, el Id de la línea.
 */
function renglonDeLinea(linea: LineaPedido, inventario: ProductoVenta[] | null, usados: Set<string>): RenglonPedido {
  const { codigoProducto } = linea
  const enInventario =
    codigoProducto === null ? undefined : inventario?.find((producto) => producto.codigoProducto === codigoProducto)
  const porCodigo = codigoProducto === null ? '' : String(codigoProducto)
  const productoId = porCodigo && !usados.has(porCodigo) ? porCodigo : `linea-${linea.id}`
  usados.add(productoId)

  return {
    producto: {
      productoId,
      codigoProducto,
      talla: enInventario?.talla ?? linea.talla,
      nombre: enInventario?.nombre ?? linea.talla,
      presentacion: enInventario || inventario === null ? PRESENTACION_PRODUCTO : PRESENTACION_SIN_INVENTARIO,
      precioKg: linea.precioKg,
      disponibleKg: Math.max(enInventario?.disponibleKg ?? 0, linea.cantidadKg),
    },
    cantidadCapturada: String(linea.cantidadKg),
  }
}

/** Cliente del pedido para mostrarlo; "Cliente #Id" si ya no está activo o no se pudo consultar. */
function clienteDelPedido(idCliente: number, activos: Cliente[]): Cliente {
  return (
    activos.find((cliente) => cliente.id === idCliente) ?? {
      id: idCliente,
      nombre: `Cliente #${idCliente}`,
      telefono: null,
    }
  )
}

/**
 * Editar pedido (RF-PED-02): carga un pedido Pendiente en el formulario común
 * (usarFormularioPedido) y guarda los cambios con actualizarPedido(). Se pueden cambiar productos
 * y cantidades, modalidad, sucursal (a domicilio, su dirección registrada es la de entrega) y
 * observaciones; el cliente no. Si un pedido de antes traía "Ref: …", aparece en las observaciones.
 * Si el pedido ya no está Pendiente, el formulario no se llena y `estadoNoEditable` dice en qué
 * estado está. Distingue el pedido que no existe (404) de los demás errores; con 401 llama a
 * `alVencerSesion`. Si falla la consulta de sucursales, llama a `alFallarSucursales`.
 */
export function usarEditarPedido(
  id: number,
  opciones: { alFallarSucursales: () => void; alVencerSesion: () => void },
) {
  const formulario = usarFormularioPedido(opciones)
  const { sucursal, modalidad, observaciones, renglones } = formulario

  const cargando = ref(true)
  const noEncontrado = ref(false)
  const errorCarga = ref(false)
  /** Etiqueta del estado ("Surtido", "Cancelado"…) si el pedido ya no se puede editar; vacío si sí. */
  const estadoNoEditable = ref('')

  /** Sucursal con la que se guardó el pedido; se vuelve a elegir si se reintenta la consulta. */
  let idSucursalPedido: number | undefined

  // Cambios sin guardar: lo capturado se compara con cómo quedó el formulario al cargar.
  const firma = computed(() =>
    JSON.stringify([
      sucursal.value?.id ?? null,
      modalidad.value,
      observaciones.value.trim(),
      renglones.value.map((renglon) => [renglon.producto.productoId, renglon.cantidadCapturada.trim()]),
    ]),
  )
  const firmaInicial = ref<string | null>(null)
  const hayCambios = computed(() => firmaInicial.value !== null && firma.value !== firmaInicial.value)

  function llenarFormulario(pedido: Pedido, clientes: Cliente[]) {
    const entrega = leerObservaciones(pedido.observaciones)
    const inventario = formulario.errorInventario.value ? null : formulario.productosInventario.value
    const usados = new Set<string>()

    idSucursalPedido = pedido.idSucursal
    formulario.cliente.value = clienteDelPedido(pedido.idCliente, clientes)
    modalidad.value = modalidadDePedido(pedido.idSucursal, entrega.modalidad)
    observaciones.value = entrega.notas ?? ''
    renglones.value = pedido.lineas.map((linea) => renglonDeLinea(linea, inventario, usados))
  }

  async function cargar() {
    cargando.value = true
    noEncontrado.value = false
    errorCarga.value = false
    estadoNoEditable.value = ''
    firmaInicial.value = null
    try {
      const [pedido, clientes] = await Promise.all([
        obtenerPedidoPorId(id),
        // Sin la lista de clientes, el cliente se muestra como "Cliente #Id".
        obtenerClientesActivos().catch(() => []),
        formulario.cargarInventario(),
      ])

      if (!sePuedeEditar(pedido.estatus)) {
        estadoNoEditable.value = estadoDePedido(pedido.estatus).etiqueta
        return
      }

      llenarFormulario(pedido, clientes)
      // La sucursal del pedido se elige cuando llegan las del cliente; el watch de sucursal
      // propone su dirección en el siguiente ciclo, y hasta entonces se toma la firma inicial.
      await formulario.cargarSucursales(idSucursalPedido)
      await nextTick()
      firmaInicial.value = firma.value
    } catch (error) {
      const motivo = error instanceof ErrorPedidos ? error.motivo : null
      if (motivo === 'sesion') {
        opciones.alVencerSesion()
        return
      }
      if (motivo === 'no_encontrado') noEncontrado.value = true
      else errorCarga.value = true
    } finally {
      cargando.value = false
    }
  }

  /** Reintenta la consulta de sucursales y vuelve a elegir la del pedido. */
  async function cargarSucursales() {
    const sinCambios = !hayCambios.value
    await formulario.cargarSucursales(idSucursalPedido)
    await nextTick()
    // Si no se había cambiado nada, la sucursal que llega no cuenta como cambio.
    if (sinCambios) firmaInicial.value = firma.value
  }

  /**
   * Guarda los cambios. Devuelve false sin enviar nada si ya hay un envío en curso; si la API
   * falla, lanza el error.
   */
  async function guardar(): Promise<boolean> {
    const guardado = await formulario.enviar(async (datos) => {
      await actualizarPedido(id, datos)
      return true
    })
    return guardado === true
  }

  return {
    ...formulario,
    cargarSucursales,
    cargando,
    noEncontrado,
    errorCarga,
    estadoNoEditable,
    hayCambios,
    cargar,
    guardar,
  }
}
