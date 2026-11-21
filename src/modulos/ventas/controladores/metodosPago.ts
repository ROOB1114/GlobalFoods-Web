// Método de pago del pedido (columna MetodoPago de PedidosAppVentasHdr). Lo registra el sistema
// interno de la empresa al cobrar, y ahí mismo el pedido pasa a Entregado; la web solo lo muestra.
// Al crear un pedido se manda 0 (pendiente).

export const METODO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  creditoOTransferencia: 2,
} as const

const TEXTO_METODO_PAGO: Record<number, string> = {
  [METODO_PAGO.pendiente]: 'Pendiente',
  [METODO_PAGO.efectivo]: 'Efectivo',
  [METODO_PAGO.creditoOTransferencia]: 'Crédito o transferencia',
}

/** Texto del método de pago; null si la API no lo trae y "Método {n}" si no es uno conocido. */
export function textoMetodoPago(metodo: number | null): string | null {
  if (metodo === null) return null
  return TEXTO_METODO_PAGO[metodo] ?? `Método ${metodo}`
}
