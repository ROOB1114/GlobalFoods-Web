// Método de pago del pedido (columna MetodoPago de PedidosAppVentasHdr): 0 pendiente, 1 efectivo
// y 2 crédito o transferencia. Todo pedido nuevo se crea con 0 (pendiente). Cambia a 1 o 2 al
// registrar el pago, en el sistema interno o en el detalle del pedido en la web (ver
// ModalRegistrarPagoVue). La lista y el detalle lo muestran; al cancelar o editar se reenvía sin
// cambios.

export const METODO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  creditoOTransferencia: 2,
} as const

/** Métodos que se pueden elegir al registrar el pago en la web. */
export type MetodoPagoRegistro = typeof METODO_PAGO.efectivo | typeof METODO_PAGO.creditoOTransferencia

/**
 * Opciones del modal de registrar pago. Solo ahí el 2 se llama "Transferencia"; en la lista y el
 * detalle se sigue viendo "Crédito o transferencia", porque el sistema interno usa el 2 también
 * para crédito.
 */
export const OPCIONES_REGISTRO_PAGO: { valor: MetodoPagoRegistro; etiqueta: string }[] = [
  { valor: METODO_PAGO.efectivo, etiqueta: 'Efectivo' },
  { valor: METODO_PAGO.creditoOTransferencia, etiqueta: 'Transferencia' },
]

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
