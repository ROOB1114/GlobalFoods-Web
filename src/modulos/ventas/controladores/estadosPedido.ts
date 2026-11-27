import type { EstadoPedido } from '@/componentes/ChipEstadoVue.vue'
import type { ModalidadEntrega } from '@/modulos/ventas/interfaces/pedido'

// Traducción del Estatus de la API a lo que se ve en pantalla. Si cambian los nombres o se
// agregan estados, se ajusta solo aquí.

/**
 * Estatus de pedido que maneja la API (confirmados por el backend). Surtido lo registra el
 * sistema interno (almacén). Entregado queda al registrar el pago, en el sistema interno o en
 * el detalle del pedido en la web.
 */
export const ESTATUS = {
  creado: 1,
  surtido: 2,
  enReparto: 3,
  completado: 4,
  cancelado: 5,
} as const

/** Cómo se muestra un estatus. */
export interface EstadoPantalla {
  estatus: number
  /** Texto del estado; va en la prop `etiqueta` de ChipEstadoVue. */
  etiqueta: string
  /** Estilo (colores) de ChipEstadoVue. */
  chip: EstadoPedido
  /** Color del punto en los filtros y en la barra de avance. */
  colorPunto: string
}

/** Estados del proceso, en orden: son los pasos de la barra de avance. */
export const ESTADOS_PEDIDO: EstadoPantalla[] = [
  { estatus: ESTATUS.creado, etiqueta: 'Pendiente', chip: 'pendiente', colorPunto: 'var(--gf-pendiente-punto)' },
  { estatus: ESTATUS.surtido, etiqueta: 'Surtido', chip: 'listo', colorPunto: 'var(--gf-listo-punto)' },
  { estatus: ESTATUS.enReparto, etiqueta: 'En reparto', chip: 'en_reparto', colorPunto: 'var(--gf-reparto-punto)' },
  { estatus: ESTATUS.completado, etiqueta: 'Entregado', chip: 'entregado', colorPunto: 'var(--gf-entregado-punto)' },
]

/** Cancelado no es un paso del proceso: se pinta aparte de la barra de avance. */
export const ESTADO_CANCELADO: EstadoPantalla = {
  estatus: ESTATUS.cancelado,
  etiqueta: 'Cancelado',
  chip: 'cancelado',
  colorPunto: 'var(--gf-cancelado-punto)',
}

/** Todos los estados: las píldoras de filtro de la lista de pedidos. */
export const ESTADOS_FILTRO: EstadoPantalla[] = [...ESTADOS_PEDIDO, ESTADO_CANCELADO]

/**
 * Estatus en los que un pedido se puede cancelar: Creado o Surtido (CU-07, RN-09 y Tabla 1 del
 * documento). Un pedido En reparto no se cancela: si la entrega falla, el repartidor lo regresa a
 * Surtido (CU-10 A3) y ahí ya se puede cancelar.
 */
const ESTATUS_CANCELABLES: number[] = [ESTATUS.creado, ESTATUS.surtido]

export function sePuedeCancelar(estatus: number): boolean {
  return ESTATUS_CANCELABLES.includes(estatus)
}

/** Solo se edita un pedido Pendiente (Creado): almacén todavía no lo surte (RF-PED-02). */
const ESTATUS_EDITABLES: number[] = [ESTATUS.creado]

export function sePuedeEditar(estatus: number): boolean {
  return ESTATUS_EDITABLES.includes(estatus)
}

/**
 * El pago se registra al entregar; al registrarlo, el pedido queda Entregado. Según la Tabla 1 del
 * documento, de Surtido solo pasa directo a Entregado un pedido de recolección (lo recoge el
 * cliente en la congeladora); uno a domicilio tiene que salir antes a reparto. `modalidad` null
 * (pedidos viejos que no la dicen) cuenta como a domicilio.
 */
export function sePuedeRegistrarPago(estatus: number, modalidad: ModalidadEntrega | null): boolean {
  if (estatus === ESTATUS.enReparto) return true
  return estatus === ESTATUS.surtido && modalidad === 'recoleccion'
}

/** El repartidor solo toma pedidos Surtidos a domicilio (CU-10 paso 2, RN-08). */
export function sePuedeIniciarReparto(estatus: number, modalidad: ModalidadEntrega | null): boolean {
  return estatus === ESTATUS.surtido && modalidad !== 'recoleccion'
}

/** La entrega (realizada o no) se registra sobre un pedido En reparto (CU-10 pasos 7–10 y A3). */
export function sePuedeRegistrarResultadoEntrega(estatus: number): boolean {
  return estatus === ESTATUS.enReparto
}

/** Estado de pantalla de un estatus. Uno desconocido se muestra como "Estado {n}" con el estilo de pendiente. */
export function estadoDePedido(estatus: number): EstadoPantalla {
  return (
    ESTADOS_FILTRO.find((estado) => estado.estatus === estatus) ?? {
      estatus,
      etiqueta: `Estado ${estatus}`,
      chip: 'pendiente',
      colorPunto: 'var(--gf-pendiente-punto)',
    }
  )
}
