import { formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { METODO_PAGO, type MetodoPagoRegistro } from '@/modulos/ventas/controladores/metodosPago'

// Pago al registrar la entrega, igual que en la app móvil: se escribe lo que se recibió en
// efectivo y lo que falte para el total pasa solo a tarjeta o transferencia. Los dos montos deben
// sumar exactamente el total; si los dos llevan algo, es pago mixto.
//
// TipoPago de la tabla PagoPedidosApp que va a tener la API: 0 pendiente, 1 efectivo, 2 tarjeta,
// 3 mixto. Mientras no exista, efectivo y tarjeta se guardan como hasta ahora, en MetodoPago del
// pedido (1 y 2), y el pago mixto no se puede guardar (PAGO_MIXTO_DISPONIBLE).

export const TIPO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  tarjeta: 2,
  mixto: 3,
} as const

export type TipoPago = (typeof TIPO_PAGO)[keyof typeof TIPO_PAGO]

export const ETIQUETAS_TIPO_PAGO: Record<TipoPago, string> = {
  [TIPO_PAGO.pendiente]: 'Pendiente',
  [TIPO_PAGO.efectivo]: 'Efectivo',
  [TIPO_PAGO.tarjeta]: 'Tarjeta o transferencia',
  [TIPO_PAGO.mixto]: 'Mixto',
}

/**
 * Cambiar a true cuando la API tenga la tabla PagoPedidosApp y registrarPago() (servicioPedidos)
 * guarde ahí los montos.
 */
export const PAGO_MIXTO_DISPONIBLE = false

export const MENSAJE_MIXTO_PENDIENTE =
  'El pago mixto se podrá guardar cuando la API tenga la tabla de pagos. Por ahora cobre todo en efectivo o todo con tarjeta o transferencia.'

/** Lo que se cobró al entregar. */
export interface PagoEntrega {
  efectivo: number
  tarjeta: number
  tipo: TipoPago
}

/** El pago listo para guardar, o el error a mostrar (uno de los dos). */
export interface RevisionPago {
  pago: PagoEntrega | null
  error: string
}

function aCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Deja solo dígitos y un punto decimal con hasta dos decimales, para los campos de monto. */
export function limpiarMonto(texto: string): string {
  let resultado = ''
  let conPunto = false
  let decimales = 0
  for (const caracter of texto) {
    if (caracter >= '0' && caracter <= '9') {
      if (!conPunto) resultado += caracter
      else if (decimales < 2) {
        resultado += caracter
        decimales++
      }
    } else if (caracter === '.' && !conPunto) {
      conPunto = true
      resultado += resultado === '' ? '0.' : '.'
    }
  }
  return resultado
}

/** Monto escrito; vacío cuenta como 0. null si no es un número con hasta dos decimales. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return 0
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null
  return Number(limpio)
}

/** Monto para un campo de captura: sin signo de pesos ni comas, con dos decimales. */
export function montoParaCampo(valor: number): string {
  return (Math.max(0, aCentavos(valor)) / 100).toFixed(2)
}

/** Al escribir el efectivo, lo que falta para el total; vacío si el efectivo no es válido. */
export function restanteParaTarjeta(total: number, textoEfectivo: string): string {
  const efectivo = leerMonto(textoEfectivo)
  if (efectivo === null) return ''
  return montoParaCampo((aCentavos(total) - aCentavos(efectivo)) / 100)
}

export function tipoDePago(efectivo: number, tarjeta: number): TipoPago {
  if (efectivo > 0 && tarjeta > 0) return TIPO_PAGO.mixto
  if (efectivo > 0) return TIPO_PAGO.efectivo
  if (tarjeta > 0) return TIPO_PAGO.tarjeta
  return TIPO_PAGO.pendiente
}

/** Revisa que los montos sean válidos y que juntos sumen exactamente el total del pedido. */
export function revisarPago(total: number, textoEfectivo: string, textoTarjeta: string): RevisionPago {
  const efectivo = leerMonto(textoEfectivo)
  if (efectivo === null) return { pago: null, error: 'Escriba un monto válido en Efectivo.' }
  const tarjeta = leerMonto(textoTarjeta)
  if (tarjeta === null) return { pago: null, error: 'Escriba un monto válido en Tarjeta o transferencia.' }

  const cobrado = aCentavos(efectivo) + aCentavos(tarjeta)
  const diferencia = aCentavos(total) - cobrado
  if (cobrado === 0) {
    return { pago: null, error: 'Escriba cuánto se cobró en efectivo o con tarjeta o transferencia.' }
  }
  if (diferencia > 0) {
    return { pago: null, error: `Faltan ${formatearMoneda(diferencia / 100)} por asignar a un método de pago.` }
  }
  if (diferencia < 0) {
    return { pago: null, error: `Los montos suman ${formatearMoneda(-diferencia / 100)} más que el total.` }
  }
  return { pago: { efectivo, tarjeta, tipo: tipoDePago(efectivo, tarjeta) }, error: '' }
}

/**
 * MetodoPago del pedido para un pago de un solo tipo. null para el mixto: ese irá a la tabla
 * PagoPedidosApp cuando exista.
 */
export function metodoPagoDelPedido(tipo: TipoPago): MetodoPagoRegistro | null {
  if (tipo === TIPO_PAGO.efectivo) return METODO_PAGO.efectivo
  if (tipo === TIPO_PAGO.tarjeta) return METODO_PAGO.creditoOTransferencia
  return null
}

// Comprobante de entrega: foto del recibo firmado por el cliente, como en la app móvil. Por ahora
// es opcional y no se envía: la API todavía no puede recibir fotos (COMPROBANTE_DISPONIBLE).

/**
 * Cambiar a true cuando la API pueda recibir la foto y registrarPago() (servicioPedidos) la
 * envíe.
 */
export const COMPROBANTE_DISPONIBLE = false

export const AVISO_COMPROBANTE_PENDIENTE = 'Por ahora es opcional: la foto se enviará cuando la API pueda recibirla.'

/** Tamaño máximo de la foto, en MB. Ajustar al que defina la API. */
export const MAXIMO_COMPROBANTE_MB = 5

/** Revisa la foto elegida; regresa el mensaje de error o '' si se puede usar. */
export function revisarComprobante(archivo: File): string {
  if (!archivo.type.startsWith('image/')) return 'El comprobante debe ser una imagen (JPG, PNG o similar).'
  if (archivo.size > MAXIMO_COMPROBANTE_MB * 1024 * 1024) {
    return `La imagen pesa más de ${MAXIMO_COMPROBANTE_MB} MB. Elija una más ligera.`
  }
  return ''
}

/** 1536000 → "1.5 MB"; 20480 → "20 KB". */
export function textoTamanoArchivo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
