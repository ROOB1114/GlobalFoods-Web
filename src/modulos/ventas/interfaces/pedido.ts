export type ModalidadEntrega = 'domicilio' | 'recoleccion'

/**
 * Producto que se puede vender, armado a partir del inventario actual. Al editar un pedido, sus
 * líneas también se arman así, con el precio guardado (ver usarEditarPedido).
 */
export interface ProductoVenta {
  /** Identificador del producto en la captura: String(codigoProducto). */
  productoId: string
  /**
   * Código del producto (CodigoProducto en POST y PUT /api/pedidos).
   * null si el inventario no lo trae como entero positivo: el producto se muestra como no
   * disponible y no se puede agregar.
   */
  codigoProducto: number | null
  talla: string
  /** Nombre para mostrar: la talla tal como viene del inventario, p. ej. "26/30" o "PULPO". */
  nombre: string
  presentacion: string
  precioKg: number
  disponibleKg: number
}

/** Renglón del pedido mientras se captura. */
export interface RenglonPedido {
  producto: ProductoVenta
  /**
   * Cantidad en kg tal como está escrita en el campo. Se guarda como texto para no perder
   * lo que se va escribiendo (p. ej. "2.") y para poder marcar como error un campo vacío.
   */
  cantidadCapturada: string
}

/** Producto dentro de los datos para registrar el pedido. */
export interface ProductoRegistroPedido {
  productoId: string
  codigoProducto: number
  talla: string
  cantidadKg: number
  /**
   * Precio por kg que vio la asesora al capturar; al editar, el guardado si la línea ya venía en
   * el pedido. La API lo guarda tal cual; lo ideal es que lo revalide con sus propios datos y
   * rechace el pedido si el precio cambió.
   */
  precioKg: number
  /** cantidadKg × precioKg, redondeado a centavos (el importe del renglón en el resumen). */
  importe: number
}

/**
 * Datos del pedido capturado. servicioPedidos los convierte al cuerpo de POST /api/pedidos (nuevo)
 * o de PUT /api/pedidos/:id (edición; ahí el cliente no cambia).
 */
export interface DatosRegistroPedido {
  clienteId: number
  /**
   * Sucursal del cliente a la que va el pedido (a domicilio). En recolección es 0
   * (ID_SUCURSAL_RECOLECCION, ver controladores/puntoRecoleccion.ts).
   */
  idSucursal: number
  /**
   * No lleva dirección ni referencias: a domicilio se entrega en la dirección registrada de la
   * sucursal (IdSucursal), con sus referencias, que es lo único que guarda la API.
   */
  modalidad: ModalidadEntrega
  /** null si no se capturaron. */
  observaciones: string | null
  productos: ProductoRegistroPedido[]
  /** Totales del resumen. */
  totalKg: number
  total: number
}

export interface RespuestaRegistroPedido {
  /** Folio asignado: "#" y el Id que regresa la API, p. ej. "#57". */
  folio: string
}

/** Pedido registrado, tal como lo devuelve la consulta de pedidos. */
export interface Pedido {
  id: number
  idCliente: number
  /** 0 en los pedidos de recolección (ver controladores/puntoRecoleccion.ts). */
  idSucursal: number
  /** Fecha de registro, aaaa-mm-dd (la API no guarda la hora); vacía si la API trae una fecha no válida. */
  fechaRegistro: string
  /**
   * Fecha de entrega, aaaa-mm-dd (FechaEntrega en la API). Se llena al registrar el pago, en la
   * web o en el sistema interno; null mientras no la tiene (viene null, 0 o no viene).
   */
  fechaEntrega: string | null
  totalKg: number
  total: number
  /** Ver controladores/estadosPedido.ts. */
  estatus: number
  /**
   * 0 pendiente, 1 efectivo, 2 crédito o transferencia (ver controladores/metodosPago.ts); cambia
   * al registrar el pago, en la web o en el sistema interno. null si la API no lo trae.
   */
  metodoPago: number | null
  /** Texto tal como viene; leerObservaciones() separa los datos de entrega de las notas. */
  observaciones: string
  lineas: LineaPedido[]
}

/** Producto dentro de un pedido registrado. */
export interface LineaPedido {
  id: number
  codigoProducto: number | null
  talla: string
  cantidadKg: number
  precioKg: number
  subtotal: number
}

/** Renglón ya calculado para mostrar en el resumen y en la confirmación. */
export interface RenglonResumen {
  productoId: string
  nombre: string
  /** null si la cantidad capturada no es un número válido. */
  cantidadKg: number | null
  precioKg: number
  importe: number
}

/** Datos del pedido listos para mostrar (resumen lateral y modal de confirmación). */
export interface ResumenPedido {
  cliente: string | null
  /** Nombre de la sucursal elegida; null si no hay o si es recolección (no lleva sucursal). */
  sucursal: string | null
  modalidad: ModalidadEntrega | null
  /** A domicilio, la dirección registrada de la sucursal; vacía si no tiene o en recolección. */
  direccionEntrega: string
  /** A domicilio, las referencias registradas de la sucursal; vacías si no tiene o en recolección. */
  referencias: string
  observaciones: string
  renglones: RenglonResumen[]
  totalKg: number
  total: number
}
