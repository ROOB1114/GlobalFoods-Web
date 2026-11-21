import type { EstadoPedido } from '@/componentes/ChipEstadoVue.vue'

// Traducción del Estatus de la API a lo que se ve en pantalla. Si cambian los nombres o se
// agregan estados, se ajusta solo aquí.

/**
 * Estatus de pedido que maneja la API (confirmados por el backend). Surtido y Entregado los
 * registra el sistema interno de la empresa (almacén y cobro); la web solo los muestra.
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
 * Estatus en los que un pedido se puede cancelar: mientras no se haya entregado (ni cancelado
 * ya). Es la misma regla que la app móvil, por decisión del equipo; el documento (RF-PED-03)
 * solo permitía Creado y Surtido.
 */
const ESTATUS_CANCELABLES: number[] = [ESTATUS.creado, ESTATUS.surtido, ESTATUS.enReparto]

export function sePuedeCancelar(estatus: number): boolean {
  return ESTATUS_CANCELABLES.includes(estatus)
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
