import type { ModalidadEntrega } from '@/modulos/ventas/interfaces/pedido'

// Los pedidos de recolección en congeladora no van a una sucursal del cliente: se registran con
// IdSucursal 0 y el cliente pasa por ellos a este punto. Un pedido con IdSucursal 0 es de
// recolección aunque Observaciones no lo diga.

export const ID_SUCURSAL_RECOLECCION = 0

export const PUNTO_RECOLECCION = {
  nombre: 'Proceso Conservación y Comercio (Global Foods)',
  urlMaps: 'https://maps.app.goo.gl/WLanuAZFHbqhmmWRA',
  latitud: 24.7135797,
  longitud: -107.4420242,
} as const

export function esSucursalRecoleccion(idSucursal: number): boolean {
  return idSucursal === ID_SUCURSAL_RECOLECCION
}

/** Modalidad de un pedido registrado: IdSucursal 0 manda; si no, la que diga Observaciones. */
export function modalidadDePedido(
  idSucursal: number,
  modalidadObservaciones: ModalidadEntrega | null,
): ModalidadEntrega | null {
  return esSucursalRecoleccion(idSucursal) ? 'recoleccion' : modalidadObservaciones
}
