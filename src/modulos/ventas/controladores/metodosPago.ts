// Método de pago del pedido (columna MetodoPago de PedidosAppVentasHdr): 0 pendiente, 1 efectivo
// y 2 crédito o transferencia. Todo pedido nuevo se crea con 0 (pendiente). Cambia a 1 o 2 al
// registrar el pago, en el sistema interno o en el detalle del pedido en la web (ver
// ModalRegistrarPagoVue y pagoEntrega.ts). La lista y el detalle lo muestran; al cancelar o editar
// se reenvía sin cambios. El 3 (mixto) es el TipoPago de la tabla PagoPedidosApp que va a tener
// la API; se muestra por si el pedido llega a traerlo.

export const METODO_PAGO = {
  pendiente: 0,
  efectivo: 1,
  creditoOTransferencia: 2,
  mixto: 3,
} as const

/** Lo que la web guarda en MetodoPago al registrar un pago de un solo tipo (ver pagoEntrega.ts). */
export type MetodoPagoRegistro = typeof METODO_PAGO.efectivo | typeof METODO_PAGO.creditoOTransferencia

const ETIQUETAS_METODO_PAGO: Record<number, string> = {
  [METODO_PAGO.pendiente]: 'Pendiente',
  [METODO_PAGO.efectivo]: 'Efectivo',
  [METODO_PAGO.creditoOTransferencia]: 'Crédito o transferencia',
  [METODO_PAGO.mixto]: 'Mixto',
}

/** Texto del método de pago; null si la API no lo trae y "Método {n}" si no es uno conocido. */
export function textoMetodoPago(metodo: number | null): string | null {
  if (metodo === null) return null
  return ETIQUETAS_METODO_PAGO[metodo] ?? `Método ${metodo}`
}
