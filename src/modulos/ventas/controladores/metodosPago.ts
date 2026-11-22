// Método de pago del pedido (columna MetodoPago de PedidosAppVentasHdr): 0 pendiente, 1 efectivo
// y 2 crédito o transferencia. Todo pedido nuevo se crea con 0 (pendiente) y solo el sistema
// interno lo cambia a 1 o 2 al cobrar. La web no lo elige ni lo edita: solo lo muestra en la
// lista y en el detalle, y al cancelar lo reenvía sin cambios.

export const METODO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  creditoOTransferencia: 2,
} as const

const ETIQUETAS_METODO_PAGO: Record<number, string> = {
  [METODO_PAGO.pendiente]: 'Pendiente',
  [METODO_PAGO.efectivo]: 'Efectivo',
  [METODO_PAGO.creditoOTransferencia]: 'Crédito o transferencia',
}

/** Texto del método de pago; null si la API no lo trae y "Método {n}" si no es uno conocido. */
export function textoMetodoPago(metodo: number | null): string | null {
  if (metodo === null) return null
  return ETIQUETAS_METODO_PAGO[metodo] ?? `Método ${metodo}`
}
