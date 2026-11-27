// Motivos que se piden al cancelar un pedido (CU-07, RF-PED-03) y al registrar una entrega no
// realizada (CU-10 A3, RF-REP-02). El texto viaja a la API y queda en la bitácora del pedido
// (PedidosEventosAppVentas), de donde lo leen el historial del detalle y el reporte de
// supervisión (CU-15: cancelaciones y entregas no realizadas con sus motivos).

/** Máximo de la descripción cuando el motivo es "Otro" (RF-PED-03). */
export const MAXIMO_DESCRIPCION_MOTIVO = 250

export const OPCION_OTRO = 'Otro'

/** RF-PED-03. */
export const MOTIVOS_CANCELACION = [
  'El cliente desistió',
  'Producto no disponible',
  'Datos incorrectos',
  'Entrega no realizada',
  OPCION_OTRO,
] as const

/** RF-REP-02 / CU-10 A3. */
export const MOTIVOS_NO_ENTREGA = [
  'Cliente ausente',
  'Dirección incorrecta',
  'Cliente rechazó el pedido',
  OPCION_OTRO,
] as const

export const MENSAJES_MOTIVO = {
  cancelacionRequerida: 'Seleccione el motivo de la cancelación.',
  cancelacionOtroSinDescripcion: 'Describa el motivo de la cancelación.',
  noEntregaRequerida: 'Seleccione el motivo por el que no se entregó.',
}

/**
 * Texto del motivo que se guarda: la opción elegida y, si se escribió, la descripción
 * ("Otro: el cliente cambió de domicilio", "Cliente ausente: no abrió nadie").
 */
export function textoMotivo(opcion: string, descripcion: string): string {
  const detalle = descripcion.trim()
  return detalle ? `${opcion}: ${detalle}` : opcion
}

/**
 * Revisa el motivo capturado. Devuelve '' si está completo o el mensaje a mostrar: falta la
 * opción o, si se pasa `otroSinDescripcion`, la opción es "Otro" y no trae descripción (al
 * cancelar sí se exige, RF-PED-03; en la entrega no realizada la descripción es opcional, RF-REP-02).
 */
export function revisarMotivo(
  opcion: string,
  descripcion: string,
  mensajes: { requerido: string; otroSinDescripcion?: string },
): string {
  if (!opcion) return mensajes.requerido
  if (mensajes.otroSinDescripcion && opcion === OPCION_OTRO && !descripcion.trim()) {
    return mensajes.otroSinDescripcion
  }
  return ''
}
