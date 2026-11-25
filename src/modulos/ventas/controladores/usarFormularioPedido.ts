import { computed, ref } from 'vue'

import {
  obtenerCatalogoCliente,
  obtenerInventarioActual,
  type ArticuloInventario,
} from '@/modulos/almacen/servicios/servicioInventario'
import {
  obtenerIdUsuarioSesion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { formatearNumero } from '@/modulos/ventas/controladores/formatosPedido'
import { ID_SUCURSAL_RECOLECCION } from '@/modulos/ventas/controladores/puntoRecoleccion'
import type { Cliente, SucursalCliente } from '@/modulos/ventas/interfaces/cliente'
import type {
  DatosRegistroPedido,
  ModalidadEntrega,
  ProductoRegistroPedido,
  ProductoVenta,
  RenglonPedido,
  RenglonResumen,
  ResumenPedido,
} from '@/modulos/ventas/interfaces/pedido'
import { obtenerSucursalesActivas } from '@/modulos/ventas/servicios/servicioClientesVentas'


// Lo que comparten Nuevo pedido y Editar pedido: mensajes, ids de campos, reglas de cantidad y
// el estado del formulario (usarFormularioPedido). Cada pantalla pone lo suyo encima:
// usarNuevoPedido (buscar el cliente y registrar) y usarEditarPedido (cargar el pedido y guardar).

// TODO: el inventario no trae nombre ni presentación del producto, solo la talla (p. ej. "26/30"
// o "PULPO"); por ahora solo se indica que se vende por kg.
export const PRESENTACION_PRODUCTO = 'Venta por kg'

export const MAXIMO_OBSERVACIONES = 250

export const MENSAJES = {
  clienteRequerido: 'Seleccione un cliente.',
  sucursalRequerida: 'Seleccione una sucursal.',
  sinSucursales: 'Este cliente no tiene sucursales registradas.',
  productosRequeridos: 'Agregue al menos un producto al pedido.',
  cantidadInvalida: 'La cantidad debe ser mayor que cero.',
  modalidadRequerida: 'Seleccione la modalidad de entrega.',
  sucursalSinDireccion:
    'La sucursal no tiene dirección registrada. Regístrela en las sucursales del cliente para entregar a domicilio.',
  inventarioNoDisponible: 'No es posible confirmar la disponibilidad en este momento.',
  errorBusquedaClientes: 'No fue posible consultar los clientes. Intente nuevamente.',
  errorSucursales: 'No fue posible consultar las sucursales. Intente nuevamente.',
  errorRegistro: 'No fue posible registrar el pedido. Intente nuevamente.',
  sinConexion: 'No es posible conectar con el servidor. Intente más tarde.',
}

export function mensajeExcedeDisponible(producto: ProductoVenta): string {
  return `Solo hay ${formatearNumero(producto.disponibleKg)} kg disponibles de ${producto.nombre}. Ajuste la cantidad.`
}

/** Ids de los campos: enlazan etiquetas y mensajes, y sirven para llevar el foco al primer error. */
export const IDS_CAMPOS = {
  cliente: 'pedido-cliente',
  sucursal: 'pedido-sucursal',
  /** Mensaje de la sucursal; recibe el foco cuando no hay lista para elegir. */
  errorSucursal: 'pedido-sucursal-error',
  agregarProducto: 'pedido-agregar-producto',
  errorProductos: 'pedido-productos-error',
  modalidad: 'pedido-modalidad-domicilio',
  errorModalidad: 'pedido-modalidad-error',
  /** Aviso de sucursal sin dirección (a domicilio); recibe el foco si se intenta enviar así. */
  errorDireccion: 'pedido-direccion-error',
  observaciones: 'pedido-observaciones',
}

export function idCampoCantidad(productoId: string): string {
  return `pedido-cantidad-${productoId.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

/**
 * `indice` (posición en el inventario) solo se usa para dar un productoId único a los artículos
 * sin código, que se muestran como no disponibles.
 */
export function aProductoVenta(articulo: ArticuloInventario, indice: number): ProductoVenta {
  const { codigoProducto } = articulo
  return {
    productoId: codigoProducto !== null ? String(codigoProducto) : `sin-codigo-${indice}`,
    codigoProducto,
    talla: articulo.talla,
    // El inventario no trae nombre: se muestra la talla tal cual.
    nombre: articulo.talla.trim(),
    presentacion: PRESENTACION_PRODUCTO,
    precioKg: articulo.precio,
    disponibleKg: articulo.cantidadKg,
  }
}

/** Sin código de producto la API rechaza el pedido; esos productos no se pueden agregar. */
export const tieneCodigoProducto = (producto: ProductoVenta) => producto.codigoProducto !== null

export const estaAgotado = (producto: ProductoVenta) =>
  obtenerRolUsuario() === 'cliente' ? false : producto.disponibleKg <= 0

const redondear = (valor: number) => Math.round(valor * 100) / 100

/** Lo escrito en el campo de cantidad, como número; null si está vacío o no es un número. */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}

/** Deja en el campo de cantidad solo dígitos, separador decimal y signo, con máximo 2 decimales. */
export function limpiarCantidad(texto: string): string {
  const soloValidos = texto.replace(/[^\d.,-]/g, '')
  return soloValidos.match(/^-?\d*([.,]\d{0,2})?/)?.[0] ?? ''
}

export function puedeDisminuir(renglon: RenglonPedido): boolean {
  const cantidad = leerCantidad(renglon.cantidadCapturada)
  return cantidad !== null && cantidad > 1
}

export function puedeAumentar(renglon: RenglonPedido): boolean {
  if (obtenerRolUsuario() === 'cliente') return true
  const cantidad = leerCantidad(renglon.cantidadCapturada)
  return cantidad === null || cantidad < renglon.producto.disponibleKg
}

/** Cantidad utilizable para totales: número mayor que cero, o null. */
function cantidadValida(renglon: RenglonPedido): number | null {
  const cantidad = leerCantidad(renglon.cantidadCapturada)
  return cantidad !== null && cantidad > 0 ? cantidad : null
}

/**
 * Estado y reglas del formulario de un pedido, comunes a Nuevo pedido y Editar pedido:
 * inventario, cliente y sucursal, renglones, entrega, validaciones, totales y envío. Las vistas
 * solo lo pintan y reaccionan a sus resultados.
 * La sucursal solo se pide a domicilio; en recolección el pedido va con IdSucursal 0.
 * A domicilio, la dirección de entrega es siempre la registrada de la sucursal: no se captura
 * otra (la API no tiene dónde guardarla).
 * Aquí no se capturan fecha de entrega ni método de pago: se llenan al registrar el pago (en el
 * detalle del pedido o en el sistema interno).
 * Las sucursales no se cargan solas al cambiar el cliente: cada pantalla llama a
 * cargarSucursales() cuando corresponde.
 * Si falla la consulta de sucursales, llama a `alFallarSucursales` para que la vista muestre el aviso.
 */
export function usarFormularioPedido(opciones: { alFallarSucursales: () => void }) {
  // Inventario (productos que se pueden agregar)
  const productosInventario = ref<ProductoVenta[]>([])
  const cargandoInventario = ref(true)
  const errorInventario = ref(false)

  // Sucursales activas del cliente elegido
  const sucursales = ref<SucursalCliente[]>([])
  const cargandoSucursales = ref(false)
  const errorSucursales = ref(false)
  // Cada consulta lleva un número; si llega la respuesta de una vieja (otro cliente), se descarta.
  let consultaSucursales = 0

  const esCliente = obtenerRolUsuario() === 'cliente'
  const idClienteSesion = esCliente ? obtenerIdUsuarioSesion() : null

  function crearClienteSesion(): Cliente | null {
    if (!esCliente || !idClienteSesion) return null
    return {
      id: idClienteSesion,
      nombre: obtenerNombreUsuario() || `Cliente #${idClienteSesion}`,
      telefono: '',
    }
  }

  // Formulario
  const cliente = ref<Cliente | null>(null)
  const sucursal = ref<SucursalCliente | null>(null)
  const renglones = ref<RenglonPedido[]>([])
  const modalidad = ref<ModalidadEntrega | null>(null)
  const observaciones = ref('')

  /** Los errores (salvo el de disponibilidad) se muestran a partir del primer intento de enviar. */
  const intentoEnviar = ref(false)
  const enviando = ref(false)

  async function cargarInventario() {
    cargandoInventario.value = true
    errorInventario.value = false
    try {
      const lista = esCliente ? await obtenerCatalogoCliente() : await obtenerInventarioActual()
      productosInventario.value = lista.map(aProductoVenta)
      if (esCliente && cliente.value) {
        cargarSucursales()
      }
    } catch {
      productosInventario.value = []
      errorInventario.value = true
    } finally {
      cargandoInventario.value = false
    }
  }

  /**
   * Carga las sucursales activas del cliente elegido. Queda seleccionada la de
   * `idSucursalPorElegir` (la del pedido que se edita) si está entre ellas; si no, y el cliente
   * tiene una sola, esa.
   */
  async function cargarSucursales(idSucursalPorElegir?: number) {
    const clienteActual = cliente.value
    consultaSucursales += 1
    const numero = consultaSucursales
    sucursal.value = null
    sucursales.value = []
    errorSucursales.value = false
    cargandoSucursales.value = clienteActual !== null
    if (!clienteActual) return

    try {
      const activas = await obtenerSucursalesActivas(clienteActual.id)
      if (numero !== consultaSucursales) return
      sucursales.value = activas
      const delPedido = activas.find((opcion) => opcion.id === idSucursalPorElegir)
      sucursal.value = delPedido ?? (activas.length === 1 ? (activas[0] ?? null) : null)
    } catch {
      if (numero !== consultaSucursales) return
      errorSucursales.value = true
      opciones.alFallarSucursales()
    } finally {
      if (numero === consultaSucursales) cargandoSucursales.value = false
    }
  }

  // Renglones

  function buscarRenglon(productoId: string) {
    return renglones.value.find((renglon) => renglon.producto.productoId === productoId)
  }

  function agregarProducto(producto: ProductoVenta) {
    if (!tieneCodigoProducto(producto) || estaAgotado(producto) || buscarRenglon(producto.productoId)) return
    renglones.value.push({ producto, cantidadCapturada: '1' })
  }

  function quitarRenglon(productoId: string) {
    renglones.value = renglones.value.filter((renglon) => renglon.producto.productoId !== productoId)
  }

  function cambiarCantidad(productoId: string, texto: string) {
    const renglon = buscarRenglon(productoId)
    if (renglon) renglon.cantidadCapturada = texto
  }

  function aumentarCantidad(productoId: string) {
    const renglon = buscarRenglon(productoId)
    if (!renglon || !puedeAumentar(renglon)) return
    const actual = leerCantidad(renglon.cantidadCapturada)
    const siguiente = actual === null || actual < 1 ? 1 : actual + 1
    const nuevoValor = esCliente ? siguiente : Math.min(siguiente, renglon.producto.disponibleKg)
    renglon.cantidadCapturada = String(redondear(nuevoValor))
  }

  function disminuirCantidad(productoId: string) {
    const renglon = buscarRenglon(productoId)
    if (!renglon || !puedeDisminuir(renglon)) return
    const actual = leerCantidad(renglon.cantidadCapturada) ?? 1
    renglon.cantidadCapturada = String(redondear(Math.max(actual - 1, 1)))
  }

  // Errores

  function calcularErrores() {
    const domicilio = modalidad.value === 'domicilio'

    // La sucursal solo se pide a domicilio. Sin cliente, el error que cuenta es el del cliente.
    let mensajeSucursal = ''
    if (domicilio && cliente.value && !sucursal.value) {
      // Si la consulta ya respondió sin sucursales activas, no hay cuál elegir.
      const sinSucursales = !cargandoSucursales.value && !errorSucursales.value && sucursales.value.length === 0
      mensajeSucursal = sinSucursales ? MENSAJES.sinSucursales : MENSAJES.sucursalRequerida
    }

    return {
      cliente: cliente.value ? '' : MENSAJES.clienteRequerido,
      sucursal: mensajeSucursal,
      productos: renglones.value.length > 0 ? '' : MENSAJES.productosRequeridos,
      modalidad: modalidad.value ? '' : MENSAJES.modalidadRequerida,
      // Si falta la sucursal, ya lo dice su propio error; aquí solo la que no tiene dirección.
      direccion: domicilio && sucursal.value && !sucursal.value.direccion ? MENSAJES.sucursalSinDireccion : '',
    }
  }

  type ErroresPedido = ReturnType<typeof calcularErrores>
  const SIN_ERRORES: ErroresPedido = {
    cliente: '',
    sucursal: '',
    productos: '',
    modalidad: '',
    direccion: '',
  }

  const errores = computed<ErroresPedido>(() => (intentoEnviar.value ? calcularErrores() : SIN_ERRORES))

  /** Error de cantidad por producto. El de disponibilidad aparece al instante; el resto, tras intentar enviar. */
 const erroresCantidad = computed<Record<string, string>>(() => {
    const resultado: Record<string, string> = {}
    for (const renglon of renglones.value) {
      const cantidad = leerCantidad(renglon.cantidadCapturada)
      const id = renglon.producto.productoId
      if (!esCliente && cantidad !== null && cantidad > renglon.producto.disponibleKg) {
        resultado[id] = mensajeExcedeDisponible(renglon.producto)
      } else if (intentoEnviar.value && (cantidad === null || cantidad <= 0)) {
        resultado[id] = MENSAJES.cantidadInvalida
      }
    }
    return resultado
  })

  /**
   * Marca el intento de enviar (para que se vean los errores) y devuelve el id del primer
   * campo con error, en el orden de la pantalla; null si todo es válido.
   */
  function validar(): string | null {
    intentoEnviar.value = true
    const encontrados = calcularErrores()

    if (encontrados.cliente) return IDS_CAMPOS.cliente
    if (encontrados.sucursal) {
      // La lista para elegir solo aparece cuando hay varias sucursales; si no, el foco va al mensaje.
      return sucursales.value.length > 1 ? IDS_CAMPOS.sucursal : IDS_CAMPOS.errorSucursal
    }
    if (encontrados.productos) {
      // Si "Agregar producto" está deshabilitado no puede recibir el foco; va al mensaje.
      const agregarDeshabilitado = cargandoInventario.value || errorInventario.value
      return agregarDeshabilitado ? IDS_CAMPOS.errorProductos : IDS_CAMPOS.agregarProducto
    }
    const renglonConError = renglones.value.find((renglon) => erroresCantidad.value[renglon.producto.productoId])
    if (renglonConError) return idCampoCantidad(renglonConError.producto.productoId)
    if (encontrados.modalidad) return IDS_CAMPOS.modalidad
    if (encontrados.direccion) return IDS_CAMPOS.errorDireccion
    return null
  }

  // Totales y resumen

  function aRenglonResumen(renglon: RenglonPedido): RenglonResumen {
    const cantidadKg = cantidadValida(renglon)
    return {
      productoId: renglon.producto.productoId,
      nombre: renglon.producto.nombre,
      cantidadKg,
      precioKg: renglon.producto.precioKg,
      importe: cantidadKg === null ? 0 : redondear(cantidadKg * renglon.producto.precioKg),
    }
  }

  const renglonesResumen = computed<RenglonResumen[]>(() => renglones.value.map(aRenglonResumen))

  const totalKg = computed(() =>
    redondear(renglonesResumen.value.reduce((suma, renglon) => suma + (renglon.cantidadKg ?? 0), 0)),
  )

  const total = computed(() =>
    redondear(renglonesResumen.value.reduce((suma, renglon) => suma + renglon.importe, 0)),
  )

  const resumen = computed<ResumenPedido>(() => ({
    cliente: cliente.value?.nombre ?? null,
    // En recolección no se manda la sucursal elegida, así que tampoco se muestra.
    sucursal: modalidad.value === 'recoleccion' ? null : (sucursal.value?.nombre ?? null),
    modalidad: modalidad.value,
    // A domicilio se entrega en la dirección registrada de la sucursal.
    direccionEntrega: modalidad.value === 'domicilio' ? (sucursal.value?.direccion ?? '') : '',
    observaciones: observaciones.value.trim(),
    renglones: renglonesResumen.value,
    totalKg: totalKg.value,
    total: total.value,
  }))

  // Envío

  /** Renglón para enviar; importe con el mismo cálculo que el resumen que vio la asesora. */
  function aProductoRegistro(renglon: RenglonPedido): ProductoRegistroPedido {
    const { codigoProducto, talla, nombre } = renglon.producto
    // agregarProducto() no deja agregar productos sin código, así que no debería pasar.
    if (codigoProducto === null) {
      throw new Error(`${nombre} no tiene código de producto.`)
    }
    const { productoId, cantidadKg, precioKg, importe } = aRenglonResumen(renglon)
    return { productoId, codigoProducto, talla, cantidadKg: cantidadKg ?? 0, precioKg, importe }
  }

  /** Lo capturado, listo para el servicio. Lanza error si el formulario no es válido. */
  function datosCapturados(): DatosRegistroPedido {
    const clienteActual = cliente.value
    const modalidadActual = modalidad.value
    // A domicilio, la sucursal elegida; en recolección no se pide y va la 0.
    const idSucursal = modalidadActual === 'recoleccion' ? ID_SUCURSAL_RECOLECCION : sucursal.value?.id
    if (validar() !== null || !clienteActual || !modalidadActual || idSucursal === undefined) {
      throw new Error('El pedido tiene datos incompletos.')
    }

    const domicilio = modalidadActual === 'domicilio'
    return {
      clienteId: clienteActual.id,
      idSucursal,
      modalidad: modalidadActual,
      observaciones: observaciones.value.trim() || null,
      productos: renglones.value.map(aProductoRegistro),
      // Los totales salen del resumen, para que coincidan con lo que vio la asesora.
      totalKg: totalKg.value,
      total: total.value,
    }
  }

  /**
   * Manda lo capturado con `guardar` (registrar o actualizar) y devuelve su resultado. Devuelve
   * null sin enviar nada si ya hay un envío en curso, para que no se mande dos veces. Si la API
   * falla, lanza el error.
   */
  async function enviar<T>(guardar: (datos: DatosRegistroPedido) => Promise<T>): Promise<T | null> {
    if (enviando.value) return null
    const datos = datosCapturados()

    enviando.value = true
    try {
      return await guardar(datos)
    } finally {
      enviando.value = false
    }
  }

  /** Deja el formulario vacío (Nuevo pedido, después de registrar; su watch de cliente limpia la sucursal). */
  function reiniciar() {
    cliente.value = crearClienteSesion()
    renglones.value = []
    modalidad.value = null
    observaciones.value = ''
    intentoEnviar.value = false
    if (esCliente && cliente.value) cargarSucursales()
  }
  return {
    productosInventario,
    cargandoInventario,
    errorInventario,
    cliente,
    sucursal,
    sucursales,
    cargandoSucursales,
    errorSucursales,
    renglones,
    modalidad,
    observaciones,
    enviando,
    errores,
    erroresCantidad,
    resumen,
    cargarInventario,
    cargarSucursales,
    agregarProducto,
    quitarRenglon,
    cambiarCantidad,
    aumentarCantidad,
    disminuirCantidad,
    validar,
    enviar,
    reiniciar,
  }
}
