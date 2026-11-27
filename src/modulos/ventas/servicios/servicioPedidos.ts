import { obtenerRolUsuario, obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import {
  ESTATUS,
  estadoDePedido,
  sePuedeCancelar,
  sePuedeEditar,
  sePuedeIniciarReparto,
  sePuedeRegistrarPago,
  sePuedeRegistrarResultadoEntrega,
} from '@/modulos/ventas/controladores/estadosPedido'
import { fechaHoyIso } from '@/modulos/ventas/controladores/formatosPedido'
import { METODO_PAGO } from '@/modulos/ventas/controladores/metodosPago'
import {
  armarObservaciones,
  leerObservaciones,
  reemplazarNotas,
} from '@/modulos/ventas/controladores/observacionesPedido'
import {
  MENSAJE_MIXTO_PENDIENTE,
  metodoPagoDelPedido,
  type PagoEntrega,
} from '@/modulos/ventas/controladores/pagoEntrega'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'

import type {
  DatosRegistroPedido,
  EventoPedido,
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

interface EventoConsultadoAPI {
  Id: number
  FechaHora: string
  UsuarioNombre: string
  Perfil: string
  Accion: string
  EstadoAnterior: number | null
  EstadoResultante: number | null
  ValorAnterior: string | null
  ValorNuevo: string | null
  Motivo: string | null
  Origen: string
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
  FechaEntrega?: number | null
  fechaEntrega?: number | null
  Observaciones: string | null
  lineas?: LineaConsultadaAPI[]
  eventos?: EventoConsultadoAPI[]
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
  /** Motivo de la cancelación o de la entrega no realizada; va en CAMPO_MOTIVO_API. */
  motivo?: string
}

/**
 * Campo del PUT /api/pedidos/:id con el motivo de una cancelación o de una entrega no realizada.
 * La API lo guarda en la bitácora del pedido (PedidosEventosAppVentas, columna Motivo), de donde
 * lo leen el historial del detalle y Reportes.
 * TODO: confirmar con César el nombre del campo; si es otro, se cambia solo aquí.
 */
const CAMPO_MOTIVO_API = 'Motivo'

export type MotivoErrorPedidos =
  | 'sesion'
  | 'sin_permiso'
  | 'conexion'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'api'

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

  if (respuestaHttp.status === 403) {
    throw new ErrorPedidos(
      'sin_permiso',
      mensajeApi || 'No tiene permiso para consultar este pedido.',
      mensajeApi,
    )
  }

  if (respuestaHttp.status === 404) {
    throw new ErrorPedidos('no_encontrado', mensajeApi || 'No se encontró el pedido.', mensajeApi)
  }

  if (respuestaHttp.status === 400 || respuestaHttp.status === 409) {
    throw new ErrorPedidos('datos_invalidos', mensajeApi || `No se pudo ${accion}.`, mensajeApi)
  }

  if (!respuestaHttp.ok) {
    throw new ErrorPedidos('api', mensajeApi || `No se pudo ${accion}.`, mensajeApi)
  }

  return datosRespuesta
}

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

function aNumero(valor: unknown): number {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

function fechaIsoDeEntero(fecha: unknown): string {
  const texto = String(fecha)
  return /^\d{8}$/.test(texto) ? `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}` : ''
}

function fechaEntregaDe(pedido: PedidoConsultadoAPI): string | null {
  for (const campo of CAMPOS_FECHA_ENTREGA) {
    const fecha = fechaIsoDeEntero(pedido[campo])
    if (fecha) return fecha
  }
  return null
}

function camposFechaEntrega(pedido: PedidoConsultadoAPI): Partial<Record<CampoFechaEntrega, number>> {
  const campos: Partial<Record<CampoFechaEntrega, number>> = {}
  for (const campo of CAMPOS_FECHA_ENTREGA) {
    const valor = pedido[campo]
    if (valor !== undefined && valor !== null) campos[campo] = valor
  }
  return campos
}

function nombreCampoFechaEntrega(pedido: PedidoConsultadoAPI): CampoFechaEntrega {
  return CAMPOS_FECHA_ENTREGA.find((campo) => campo in pedido) ?? 'FechaEntrega'
}

function cuerpoActualizacion(actual: PedidoConsultadoAPI, cambios: CambiosPedidoAPI): PedidoActualizadoAPI {
  const { entrega, motivo, ...campos } = cambios
  return {
    ...(motivo === undefined ? {} : { [CAMPO_MOTIVO_API]: motivo }),
    IdCliente: actual.IdCliente,
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

function aEvento(evento: EventoConsultadoAPI): EventoPedido {
  return {
    id: aNumero(evento.Id),
    fechaHora: String(evento.FechaHora ?? ''),
    usuario: String(evento.UsuarioNombre ?? 'Sistema'),
    perfil: String(evento.Perfil ?? ''),
    accion: String(evento.Accion ?? ''),
    estadoAnterior: evento.EstadoAnterior == null ? null : aNumero(evento.EstadoAnterior),
    estadoResultante: evento.EstadoResultante == null ? null : aNumero(evento.EstadoResultante),
    valorAnterior: evento.ValorAnterior ?? null,
    valorNuevo: evento.ValorNuevo ?? null,
    motivo: evento.Motivo ?? null,
    origen: String(evento.Origen ?? 'web'),
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
    eventos: (pedido.eventos ?? []).map(aEvento),
  }
}

const rutaPedido = (id: number) => `/api/pedidos/${encodeURIComponent(id)}`

async function consultarPedido(id: number): Promise<PedidoConsultadoAPI> {
  const datos = await solicitar(rutaPedido(id), 'consultar el pedido')
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorPedidos('api', 'La respuesta de la API no trae un pedido válido.')
  }
  return datos as PedidoConsultadoAPI
}

function rechazo(mensaje: string): ErrorPedidos {
  return new ErrorPedidos('datos_invalidos', mensaje, mensaje)
}

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

/** Modalidad de un pedido tal como llegó de la API: IdSucursal 0 o null es recolección; si no, la de Observaciones. */
function modalidadDeConsultado(pedido: PedidoConsultadoAPI) {
  return modalidadDePedido(aNumero(pedido.IdSucursal), leerObservaciones(pedido.Observaciones ?? null).modalidad)
}

/**
 * Cancela un pedido Creado o Surtido (CU-07): lo vuelve a mandar tal como está, con Estatus 5 y el
 * motivo (va a la bitácora del pedido). Primero lo consulta, para reenviar sus datos actuales sin
 * tocarlos y para no cancelar uno que ya cambió de estado.
 *
 *   GET /api/pedidos/:id                → el pedido actual
 *   PUT /api/pedidos/:id                → el mismo pedido con Estatus 5 y el motivo
 *
 * Si ya no se puede cancelar, lanza ErrorPedidos "datos_invalidos" con el mensaje para la vista.
 */
export async function cancelarPedido(id: number, motivo: string): Promise<void> {
  const actual = await consultarPedido(id)

  const estatus = aNumero(actual.Estatus)
  if (!sePuedeCancelar(estatus)) {
    throw rechazo(`El pedido no puede cancelarse porque se encuentra ${estadoDePedido(estatus).etiqueta}.`)
  }

  await solicitar(rutaPedido(id), 'cancelar el pedido', {
    metodo: 'PUT',
    cuerpo: cuerpoActualizacion(actual, { Estatus: ESTATUS.cancelado, motivo }),
  })
}

/** Resultado de iniciar el reparto de varios pedidos. */
export interface ResultadoInicioReparto {
  /** Folios que quedaron En reparto. */
  iniciados: number[]
  /** Folios que no se pudieron pasar (p. ej. la API los rechazó a medio camino). */
  fallidos: number[]
}

/**
 * Inicia el reparto de uno o varios pedidos (CU-10 pasos 4–6): Surtido → En reparto (Estatus 3).
 * Primero consulta todos; si alguno ya no está Surtido a domicilio (otro repartidor lo tomó o
 * cambió de estado), no manda ninguno y lanza ErrorPedidos "datos_invalidos" con los folios (A2).
 * Si todos siguen Surtidos, los manda uno por uno. Quién lo tomó queda en la bitácora del pedido.
 *
 *   GET /api/pedidos/:id   (cada uno)  → el pedido actual
 *   PUT /api/pedidos/:id   (cada uno)  → el mismo pedido con Estatus 3
 */
export async function iniciarReparto(ids: number[]): Promise<ResultadoInicioReparto> {
  const actuales = await Promise.all(ids.map((id) => consultarPedido(id)))

  const tomados = actuales.filter(
    (pedido) => !sePuedeIniciarReparto(aNumero(pedido.Estatus), modalidadDeConsultado(pedido)),
  )
  if (tomados.length > 0) {
    const folios = tomados.map((pedido) => `#${aNumero(pedido.Id)}`)
    throw rechazo(
      folios.length === 1
        ? `El pedido ${folios[0]} ya fue tomado por otro repartidor.`
        : `Los pedidos ${folios.join(', ')} ya fueron tomados por otro repartidor.`,
    )
  }

  const resultado: ResultadoInicioReparto = { iniciados: [], fallidos: [] }
  for (const actual of actuales) {
    const id = aNumero(actual.Id)
    try {
      await solicitar(rutaPedido(id), 'iniciar el reparto', {
        metodo: 'PUT',
        cuerpo: cuerpoActualizacion(actual, { Estatus: ESTATUS.enReparto }),
      })
      resultado.iniciados.push(id)
    } catch (error) {
      // Sin sesión o sin conexión no tiene caso seguir con los demás.
      if (error instanceof ErrorPedidos && (error.motivo === 'sesion' || error.motivo === 'conexion')) {
        if (resultado.iniciados.length === 0) throw error
        resultado.fallidos.push(...actuales.slice(actuales.indexOf(actual)).map((pedido) => aNumero(pedido.Id)))
        return resultado
      }
      resultado.fallidos.push(id)
    }
  }
  return resultado
}

/**
 * Registra una entrega no realizada (CU-10 A3): En reparto → Surtido, con el motivo. El pedido no
 * se cancela ni tiene un estado propio: regresa a Surtido para otro intento de reparto o para que
 * se cancele. El motivo queda en la bitácora y Reportes lo cuenta como entrega no realizada.
 *
 *   GET /api/pedidos/:id                → el pedido actual
 *   PUT /api/pedidos/:id                → el mismo pedido con Estatus 2 y el motivo
 */
export async function registrarEntregaNoRealizada(id: number, motivo: string): Promise<void> {
  const actual = await consultarPedido(id)

  const estatus = aNumero(actual.Estatus)
  if (!sePuedeRegistrarResultadoEntrega(estatus)) {
    throw rechazo(`No se registró porque el pedido se encuentra ${estadoDePedido(estatus).etiqueta}.`)
  }

  await solicitar(rutaPedido(id), 'registrar la entrega no realizada', {
    metodo: 'PUT',
    cuerpo: cuerpoActualizacion(actual, { Estatus: ESTATUS.surtido, motivo }),
  })
}

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
  if (!sePuedeRegistrarPago(estatus, modalidadDeConsultado(actual))) {
    throw rechazo(
      estatus === ESTATUS.surtido
        ? 'El pago no se registró porque el pedido es a domicilio y todavía no sale a reparto.'
        : `El pago no se registró porque el pedido se encuentra ${estadoDePedido(estatus).etiqueta}.`,
    )
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

export async function obtenerPedidos(
  opciones?: number | { idCliente?: number; incluirEventos?: boolean },
): Promise<Pedido[]> {
  const esCliente = obtenerRolUsuario() === 'cliente'
  const idCliente = typeof opciones === 'number' ? opciones : opciones?.idCliente
  const incluirEventos = typeof opciones === 'object' && opciones?.incluirEventos === true

  let ruta = '/api/pedidos'
  if (esCliente) {
    ruta = '/api/pedidos/mios'
  } else {
    const parametros = new URLSearchParams()
    if (idCliente !== undefined) parametros.set('idCliente', String(idCliente))
    if (incluirEventos) parametros.set('incluirEventos', '1')
    const consulta = parametros.toString()
    if (consulta) ruta = `/api/pedidos?${consulta}`
  }

  const datos = await solicitar(ruta, 'consultar los pedidos')
  if (!Array.isArray(datos)) {
    throw new ErrorPedidos('api', 'La respuesta de la API no trae una lista de pedidos válida.')
  }
  return (datos as PedidoConsultadoAPI[]).map(aPedido)
}

export async function obtenerPedidoPorId(id: number): Promise<Pedido> {
  return aPedido(await consultarPedido(id))
}