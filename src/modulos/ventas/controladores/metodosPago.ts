// Método de pago del pedido (columna MetodoPago de PedidosAppVentasHdr): 0 pendiente, 1 efectivo
// y 2 tarjeta o transferencia. La asesora lo elige en Nuevo pedido (Pendiente si el cliente
// todavía no lo define) y el sistema interno lo actualiza al cobrar.

export const METODO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  tarjetaOTransferencia: 2,
} as const

/** Opciones de Nuevo pedido, en orden. */
export const OPCIONES_METODO_PAGO: { valor: number; etiqueta: string }[] = [
  { valor: METODO_PAGO.pendiente, etiqueta: 'Pendiente' },
  { valor: METODO_PAGO.efectivo, etiqueta: 'Efectivo' },
  { valor: METODO_PAGO.tarjetaOTransferencia, etiqueta: 'Tarjeta o transferencia' },
]

/** Texto del método de pago; null si la API no lo trae y "Método {n}" si no es uno conocido. */
export function textoMetodoPago(metodo: number | null): string | null {
  if (metodo === null) return null
  return OPCIONES_METODO_PAGO.find((opcion) => opcion.valor === metodo)?.etiqueta ?? `Método ${metodo}`
}
