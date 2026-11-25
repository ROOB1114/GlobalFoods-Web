import { obtenerRolUsuario, obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import {
  ESTATUS,
  estadoDePedido,
  sePuedeCancelar,
  sePuedeEditar,
  sePuedeRegistrarPago,
} from '@/modulos/ventas/controladores/estadosPedido'
import { fechaHoyIso } from '@/modulos/ventas/controladores/formatosPedido'
import { METODO_PAGO } from '@/modulos/ventas/controladores/metodosPago'
import { armarObservaciones, reemplazarNotas } from '@/modulos/ventas/controladores/observacionesPedido'
import {
  MENSAJE_MIXTO_PENDIENTE,
  metodoPagoDelPedido,
  type PagoEntrega,
} from '@/modulos/ventas/controladores/pagoEntrega'
import { esSucursalRecoleccion } from '@/modulos/ventas/controladores/puntoRecoleccion'

import type {
  DatosRegistroPedido,
  LineaPedido,
  Pedido,
  ProductoRegistroPedido,
  RespuestaRegistroPedido,
} from '@/modulos/ventas/interfaces/pedido'

const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/** Si la API no responde en este tiempo, se cancela la petición. */
const LIMITE_ESPERA_MS = 10_000

/** Cuerpo de POST /api/pedidos. */
interface PedidoAPI {
  IdCliente: number
  /** null en recolección: el pedido no va a una sucursal del cliente (la API no acepta 0). */
  IdSucursal: number | null
  /** Día en que se crea el pedido, como entero aaaammdd, p. ej. 20261027. */
  Fecha: number
  TotalKG: number
  Total: number
  Estatus: number
  /** Siempre 0 (pendiente) al crear; cambia al registrar el pago (ver controladores/metodosPago.ts). */
  MetodoPago: typeof METODO_PAGO.pendiente
  Observaciones: string
  lineas: LineaPedidoAPI[]
}

interface LineaPedidoAPI {
  /** Entero positivo; la API rechaza la línea sin él. */
  CodigoProducto: number
  Talla: string
  Cantidad: number
  Precio: number
  Subtotal: number
}

/** Pedido tal como llega de GET /api/pedidos y GET /api/pedidos/:id. */
interface PedidoConsultadoAPI {
  Id: number
  IdCliente: number
  IdSucursal: number
  /** Fecha de registro como entero aaaammdd. */
  Fecha: number
  TotalKG: number
  Total: number
  Estatus: number
  /** Puede no venir si la API todavía no lo regresa. */
  MetodoPago?: number | null
  /**
   * Fecha de entrega como entero aaaammdd; se llena al registrar el pago (en la web o en el
   * sistema interno). Es opcional: null o 0 = sin fecha. El backend confirmó el nombre
   * FechaEntrega; "fechaEntrega" se sigue leyendo por compatibilidad.
   */
  FechaEntrega?: number | null
  fechaEntrega?: number | null
  Observaciones: string | null
  lineas?: LineaConsultadaAPI[]
}

/** Nombres con los que puede llegar la fecha de entrega; el primero es el confirmado. */
const CAMPOS_FECHA_ENTREGA = ['FechaEntrega', 'fechaEntrega'] as const
type CampoFechaEntrega = (typeof CAMPOS_FECHA_ENTREGA)[number]

interface LineaConsultadaAPI {
  Id: number
  CodigoProducto: number | null
  Talla: string
  Cantidad: number
  Precio: number
  Subtotal: number
}

/** Cuerpo de PUT /api/pedidos/:id: el pedido completo, no solo lo que cambia. */
interface PedidoActualizadoAPI extends Partial<Record<CampoFechaEntrega, number>> {
  IdCliente: number
  IdSucursal: number | null
  Fecha: number
  TotalKG: number
  Total: number
  Estatus: number
  /** Solo si el GET lo trae o si se está registrando el pago. */
  MetodoPago?: number
  Observaciones: string | null
  lineas: Omit<LineaConsultadaAPI, 'Id'>[]
}

/** Lo que cambia en un PUT; lo demás se reenvía tal como llegó del GET. */
interface CambiosPedidoAPI
  extends Partial<
    Pick<PedidoActualizadoAPI, 'IdSucursal' | 'TotalKG' | 'Total' | 'Estatus' | 'MetodoPago' | 'Observaciones' | 'lineas'>
  > {
  /** Nueva fecha de entrega (aaaammdd); va con el nombre con que la regresó el GET. */
  entrega?: number
}

/**
 * Por qué falló una petición de pedidos; la vista elige el mensaje según el motivo.
 * "datos_invalidos" es un 400: la API rechazó lo que se le mandó.
 */
export type MotivoErrorPedidos = 'sesion' | 'conexion' | 'no_encontrado' | 'datos_invalidos' | 'api'

export class ErrorPedidos extends Error {
  readonly motivo: MotivoErrorPedidos
  /** Texto de `{ error }` que mandó la API; vacío si no mandó ninguno. */
  readonly mensajeApi: string

  constructor(motivo: MotivoErrorPedidos, mensaje: string, mensajeApi = '') {
    super(mensaje)
    this.name = 'ErrorPedidos'
    this.motivo = motivo
    this.mensajeApi = mensajeApi
  }
}

/** El texto de `{ error }` de la API, si viene. */
function mensajeDeError(datos: unknown): string {
  return datos && typeof datos === 'object' && 'error' in datos && typeof datos.error === 'string' ? datos.error : ''
}

/**
 * Petición a la API de pedidos con el token de la sesión; regresa el JSON de la respuesta.
 * Lanza ErrorPedidos con motivo "sesion" si no hay sesión o la API responde 401, "conexion" si no
 * hay conexión o pasan 10 s sin respuesta, "no_encontrado" con 404, "datos_invalidos" con 400 y
 * "api" con cualquier otro error. Si la API manda `{ error }`, queda en `mensajeApi`.
 * `accion` completa los mensajes: "registrar el pedido", "consultar los pedidos".
 */
async function solicitar(
  ruta: string,
  accion: string,
  envio?: { metodo: 'POST' | 'PUT'; cuerpo: unknown },
): Promise<unknown> {
  const token = obtenerToken()
  if (!token) {
    throw new ErrorPedidos('sesion', 'La sesión no está activa. Inicia sesión nuevamente.')
  }

  const encabezados: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (envio) encabezados['Content-Type'] = 'application/json'

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), LIMITE_ESPERA_MS)

  let respuestaHttp: Response
  try {
    respuestaHttp = await fetch(`${URL_API.replace(/\/$/, '')}${ruta}`, {
      method: envio?.metodo ?? 'GET',
      headers: encabezados,
      body: envio ? JSON.stringify(envio.cuerpo) : undefined,
      signal: controlador.signal,
    })
  } catch {
    throw new ErrorPedidos('conexion', `No se pudo conectar con el servidor para ${accion}.`)
  } finally {
    clearTimeout(temporizador)
  }

  const datosRespuesta: unknown = await respuestaHttp.json().catch(() => null)
  const mensajeApi = mensajeDeError(datosRespuesta)

  if (respuestaHttp.status === 401) {
    throw new ErrorPedidos('sesion', mensajeApi || 'La sesión expiró.', mensajeApi)
  }

  if (respuestaHttp.status === 404) {
    throw new ErrorPedidos('no_encontrado', mensajeApi || 'No se encontró el pedido.', mensajeApi)
  }

  // 409: la API no permite el cambio, p. ej. el pedido ya cambió de estado.
  if (respuestaHttp.status === 400 || respuestaHttp.status === 409) {
    throw new ErrorPedidos('datos_invalidos', mensajeApi || `No se pudo ${accion}.`, mensajeApi)
  }

  if (!respuestaHttp.ok) {
    throw new ErrorPedidos('api', mensajeApi || `No se pudo ${accion}.`, mensajeApi)
  }

  return datosRespuesta
}

/** Fecha de hoy como entero aaaammdd, p. ej. 20261027. */
function fechaHoyEntero(): number {
  return Number(fechaHoyIso().replace(/-/g, ''))
}

function aLineaPedidoAPI(producto: ProductoRegistroPedido): LineaPedidoAPI {
  return {
    CodigoProducto: producto.codigoProducto,
    Talla: producto.talla,
    Cantidad: producto.cantidadKg,
    Precio: producto.precioKg,
    Subtotal: producto.importe,
  }
}

/**
 * IdSucursal como lo pide la API: null en recolección. En la web la recolección se maneja como 0
 * (ver puntoRecoleccion.ts), pero la API responde "IdSucursal debe ser un entero positivo o null".
 */
function idSucursalParaApi(idSucursal: number): number | null {
  return esSucursalRecoleccion(idSucursal) ? null : idSucursal
}

function aPedidoAPI(datos: DatosRegistroPedido): PedidoAPI {
  return {
    IdCliente: datos.clienteId,
    IdSucursal: idSucursalParaApi(datos.idSucursal),
    Fecha: fechaHoyEntero(),
    TotalKG: datos.totalKg,
    Total: datos.total,
    Estatus: ESTATUS.creado,
    MetodoPago: METODO_PAGO.pendiente,
    Observaciones: armarObservaciones(datos),
    lineas: datos.productos.map(aLineaPedidoAPI),
  }
}

/** Número de la API (puede llegar como texto, p. ej. un decimal); 0 si no es un número. */
function aNumero(valor: unknown): number {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

/** 20261027 → "2026-10-27"; vacío si no es una fecha aaaammdd (también con null, 0 o sin valor). */
function fechaIsoDeEntero(fecha: unknown): string {
  const texto = String(fecha)
  return /^\d{8}$/.test(texto) ? `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}` : ''
}

/** Fecha de entrega como aaaa-mm-dd, venga como "FechaEntrega" o "fechaEntrega"; null si no trae. */
function fechaEntregaDe(pedido: PedidoConsultadoAPI): string | null {
  for (const campo of CAMPOS_FECHA_ENTREGA) {
    const fecha = fechaIsoDeEntero(pedido[campo])
    if (fecha) return fecha
  }
  return null
}

/**
 * La fecha de entrega tal como llegó y con el mismo nombre, para reenviarla sin cambios.
 * Vacío si la API no la trae o viene null (igual que MetodoPago).
 */
function camposFechaEntrega(pedido: PedidoConsultadoAPI): Partial<Record<CampoFechaEntrega, number>> {
  const campos: Partial<Record<CampoFechaEntrega, number>> = {}
  for (const campo of CAMPOS_FECHA_ENTREGA) {
    const valor = pedido[campo]
    if (valor !== undefined && valor !== null) campos[campo] = valor
  }
  return campos
}

/** Nombre con que el GET regresó la fecha de entrega (aunque venga null); si no la trae, FechaEntrega. */
function nombreCampoFechaEntrega(pedido: PedidoConsultadoAPI): CampoFechaEntrega {
  return CAMPOS_FECHA_ENTREGA.find((campo) => campo in pedido) ?? 'FechaEntrega'
}

/**
 * Cuerpo del PUT: el pedido tal como lo regresó el GET, con `cambios` encima. Lo usan cancelar,
 * registrar el pago y editar. MetodoPago y la fecha de entrega se reenvían solo si el GET los
 * trae, con el mismo nombre de campo, para no cambiarlos; las líneas, tal como vienen.
 */
function cuerpoActualizacion(actual: PedidoConsultadoAPI, cambios: CambiosPedidoAPI): PedidoActualizadoAPI {
  const { entrega, ...campos } = cambios
  return {
    IdCliente: actual.IdCliente,
    // Un pedido viejo de recolección puede venir con 0; se reenvía como null para que la API lo acepte.
    IdSucursal: idSucursalParaApi(aNumero(actual.IdSucursal)),
    Fecha: actual.Fecha,
    TotalKG: actual.TotalKG,
    Total: actual.Total,
    Estatus: actual.Estatus,
    ...(actual.MetodoPago === undefined || actual.MetodoPago === null ? {} : { MetodoPago: actual.MetodoPago }),
    ...(entrega === undefined ? camposFechaEntrega(actual) : { [nombreCampoFechaEntrega(actual)]: entrega }),
    Observaciones: actual.Observaciones,
    lineas: (actual.lineas ?? []).map((linea) => ({
      CodigoProducto: linea.CodigoProducto,
      Talla: linea.Talla,
      Cantidad: linea.Cantidad,
      Precio: linea.Precio,
      Subtotal: linea.Subtotal,
    })),
    ...campos,
  }
}

function aLinea(linea: LineaConsultadaAPI): LineaPedido {
  return {
    id: aNumero(linea.Id),
    codigoProducto: linea.CodigoProducto ?? null,
    talla: String(linea.Talla ?? '').trim(),
    cantidadKg: aNumero(linea.Cantidad),
    precioKg: aNumero(linea.Precio),
    subtotal: aNumero(linea.Subtotal),
  }
}

function aPedido(pedido: PedidoConsultadoAPI): Pedido {
  return {
    id: aNumero(pedido.Id),
    idCliente: aNumero(pedido.IdCliente),
    idSucursal: aNumero(pedido.IdSucursal),
    fechaRegistro: fechaIsoDeEntero(pedido.Fecha),
    fechaEntrega: fechaEntregaDe(pedido),
    totalKg: aNumero(pedido.TotalKG),
    total: aNumero(pedido.Total),
    estatus: aNumero(pedido.Estatus),
    metodoPago: pedido.MetodoPago === undefined || pedido.MetodoPago === null ? null : aNumero(pedido.MetodoPago),
    observaciones: pedido.Observaciones ?? '',
    lineas: (pedido.lineas ?? []).map(aLinea),
  }
}

const rutaPedido = (id: number) => `/api/pedidos/${encodeURIComponent(id)}`

/**
 * El pedido tal como lo regresa la API, sin convertir; sirve para mostrarlo y para reenviarlo
 * en un PUT. Si no existe, lanza ErrorPedidos con motivo "no_encontrado".
 *
 *   GET /api/pedidos/:id
 *   200 → PedidoConsultadoAPI
 *   404 → { error: string }
 */
async function consultarPedido(id: number): Promise<PedidoConsultadoAPI> {
  const datos = await solicitar(rutaPedido(id), 'consultar el pedido')
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorPedidos('api', 'La respuesta de la API no trae un pedido válido.')
  }
  return datos as PedidoConsultadoAPI
}

/** ErrorPedidos "datos_invalidos" con un mensaje para la vista (va también en `mensajeApi`). */
function rechazo(mensaje: string): ErrorPedidos {
  return new ErrorPedidos('datos_invalidos', mensaje, mensaje)
}

/**
 * Registra un pedido nuevo (Estatus 1) y devuelve su folio: "#" y el Id que asigna la API.
 *
 *   POST /api/pedidos
 *   Authorization: Bearer <token>
 *   Cuerpo: PedidoAPI
 *   201 → el pedido creado, con su Id
 *   400/401/403/500 → { error: string }
 */
export async function registrarPedido(datos: DatosRegistroPedido): Promise<RespuestaRegistroPedido> {
  const creado = (await solicitar('/api/pedidos', 'registrar el pedido', {
    metodo: 'POST',
    cuerpo: aPedidoAPI(datos),
  })) as { Id?: number } | null

  if (creado?.Id === undefined || creado.Id === null) {
    throw new ErrorPedidos('api', 'La respuesta de la API no trae el Id del pedido.')
  }

  return { folio: `#${creado.Id}` }
}

/**
 * Cancela un pedido (baja lógica): lo vuelve a mandar tal como está, con Estatus 5. Es lo mismo
 * que hace la app móvil; la API no tiene una ruta aparte para cancelar ni dónde guardar el motivo.
 * Primero lo consulta, para reenviar sus datos actuales sin tocarlos (fecha, método de pago,
 * fecha de entrega, observaciones y líneas tal como vienen) y para no cancelar uno que ya se
 * entregó o se canceló.
 *
 *   GET /api/pedidos/:id                → el pedido actual
 *   PUT /api/pedidos/:id                → el mismo pedido con Estatus 5
 *   Authorization: Bearer <token>
 *
 * Si ya no se puede cancelar, lanza ErrorPedidos "datos_invalidos" con el mensaje para la vista.
 */
export async function cancelarPedido(id: number): Promise<void> {
  const actual = await consultarPedido(id)

  const estatus = aNumero(actual.Estatus)
  if (!sePuedeCancelar(estatus)) {
    throw rechazo(`El pedido no puede cancelarse porque se encuentra ${estadoDePedido(estatus).etiqueta}.`)
  }

  await solicitar(rutaPedido(id), 'cancelar el pedido', {
    metodo: 'PUT',
    cuerpo: cuerpoActualizacion(actual, { Estatus: ESTATUS.cancelado }),
  })
}

/**
 * Registra el pago de un pedido surtido o en reparto: lo vuelve a mandar como está, pero
 * Entregado (Estatus 4), con el método de pago y con la fecha de entrega de hoy. Si `notas` no es
 * null, también cambia el texto libre de Observaciones (conserva la modalidad que va antes; ver
 * reemplazarNotas()). Igual que al cancelar, primero lo consulta para reenviar sus datos actuales
 * y para no registrar el pago de uno que ya cambió de estado.
 *
 *   GET /api/pedidos/:id                → el pedido actual
 *   PUT /api/pedidos/:id                → el mismo pedido con Estatus 4, MetodoPago, FechaEntrega
 *                                         y, si cambiaron, Observaciones
 *   Authorization: Bearer <token>
 *
 * Efectivo o tarjeta solos van en MetodoPago (1 o 2). El pago mixto se rechaza por ahora.
 * TODO: cuando la API tenga la tabla PagoPedidosApp (TipoPago 0 pendiente, 1 efectivo, 2 tarjeta,
 * 3 mixto), guardar ahí `pago` con sus montos y activar PAGO_MIXTO_DISPONIBLE en pagoEntrega.ts.
 * TODO: `comprobante` (foto del recibo firmado, opcional) todavía no se envía: la API no puede
 * recibir fotos. Cuando César defina cómo (endpoint, formato, tamaño máximo), enviarlo aquí y
 * activar COMPROBANTE_DISPONIBLE en pagoEntrega.ts.
 *
 * Si ya no está en Surtido ni En reparto, o el pago es mixto, lanza ErrorPedidos
 * "datos_invalidos" con el mensaje para la vista.
 */
export async function registrarPago(
  id: number,
  pago: PagoEntrega,
  notas: string | null = null,
  comprobante: File | null = null,
): Promise<void> {
  const metodoPago = metodoPagoDelPedido(pago.tipo)
  if (metodoPago === null) throw rechazo(MENSAJE_MIXTO_PENDIENTE)

  const actual = await consultarPedido(id)

  const estatus = aNumero(actual.Estatus)
  if (!sePuedeRegistrarPago(estatus)) {
    throw rechazo(`El pago no se registró porque el pedido se encuentra ${estadoDePedido(estatus).etiqueta}.`)
  }

  await solicitar(rutaPedido(id), 'registrar el pago', {
    metodo: 'PUT',
    cuerpo: cuerpoActualizacion(actual, {
      Estatus: ESTATUS.completado,
      MetodoPago: metodoPago,
      entrega: fechaHoyEntero(),
      ...(notas === null ? {} : { Observaciones: reemplazarNotas(actual.Observaciones ?? null, notas) }),
    }),
  })
}

/**
 * Guarda los cambios de un pedido Pendiente: sucursal, totales, observaciones (con la modalidad,
 * ver armarObservaciones()) y líneas. IdCliente, Fecha, Estatus, MetodoPago
 * y la fecha de entrega se reenvían tal como llegaron. `datos.clienteId` no se usa: el cliente
 * de un pedido no cambia.
 *
 *   GET /api/pedidos/:id                → el pedido actual
 *   PUT /api/pedidos/:id                → el pedido con los cambios
 *   Authorization: Bearer <token>
 *
 * Si el pedido ya no está Pendiente, lanza ErrorPedidos "datos_invalidos" con el mensaje para
 * la vista.
 */
export async function actualizarPedido(id: number, datos: DatosRegistroPedido): Promise<void> {
  const actual = await consultarPedido(id)

  const estatus = aNumero(actual.Estatus)
  if (!sePuedeEditar(estatus)) {
    throw rechazo(
      `El pedido cambió a ${estadoDePedido(estatus).etiqueta} mientras lo editaba; los cambios no se guardaron.`,
    )
  }

  await solicitar(rutaPedido(id), 'guardar los cambios del pedido', {
    metodo: 'PUT',
    cuerpo: cuerpoActualizacion(actual, {
      IdSucursal: idSucursalParaApi(datos.idSucursal),
      TotalKG: datos.totalKg,
      Total: datos.total,
      Observaciones: armarObservaciones(datos),
      lineas: datos.productos.map(aLineaPedidoAPI),
    }),
  })
}

/**
 * Todos los pedidos, con sus líneas, en el orden en que los regresa la API.
 *
 *   GET /api/pedidos
 *   200 → PedidoConsultadoAPI[]
 */
export async function obtenerPedidos(): Promise<Pedido[]> {
  const ruta = obtenerRolUsuario() === 'cliente' ? '/api/pedidos/mios' : '/api/pedidos'
  const datos = await solicitar(ruta, 'consultar los pedidos')
  if (!Array.isArray(datos)) {
    throw new ErrorPedidos('api', 'La respuesta de la API no trae una lista de pedidos válida.')
  }
  return (datos as PedidoConsultadoAPI[]).map(aPedido)
}

/**
 * Un pedido con sus líneas. Si no existe, lanza ErrorPedidos con motivo "no_encontrado".
 *
 *   GET /api/pedidos/:id
 *   200 → PedidoConsultadoAPI
 *   404 → { error: string }
 */
export async function obtenerPedidoPorId(id: number): Promise<Pedido> {
  return aPedido(await consultarPedido(id))
}
