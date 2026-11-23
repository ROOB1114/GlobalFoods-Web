import type { DatosRegistroPedido, ModalidadEntrega } from '@/modulos/ventas/interfaces/pedido'

// La API no tiene campos para modalidad ni referencias, así que Nuevo pedido los guarda al inicio
// de Observaciones, seguidos de lo que capturó la asesora:
//   "A domicilio · Ref: portón negro · Llamar antes de llegar"
//   "Recolección en congeladora · Pasa por la tarde"
// armarObservaciones() escribe ese formato y leerObservaciones() lo lee; si cambia, se cambia aquí.
//
// La fecha de entrega ya no va en Observaciones: la API la regresa en su propio campo
// (FechaEntrega) cuando se registra el pago. Los pedidos anteriores y los de la app móvil sí traen
// "Entrega dd/mm/aaaa" justo después de la modalidad; la lectura lo acepta y lo ignora.
// La lectura también reconoce "Dir: {dirección}" (a domicilio, antes de las notas), aunque hoy
// Nuevo pedido no lo escribe.

const SEPARADOR = ' · '
const PREFIJO_DIRECCION = 'Dir: '
const PREFIJO_REFERENCIAS = 'Ref: '
/** Lo escribían los pedidos anteriores y la app móvil; se salta al leer. */
const FECHA_ENTREGA_ANTERIOR = /^Entrega \d{2}\/\d{2}\/\d{4}$/

const MODALIDAD_EN_TEXTO: Record<ModalidadEntrega, string> = {
  domicilio: 'A domicilio',
  recoleccion: 'Recolección en congeladora',
}

/** Datos de entrega que un pedido guarda en Observaciones. */
export interface ObservacionesPedido {
  modalidad: ModalidadEntrega | null
  /** Solo si el texto trae "Dir: …"; si no, null. */
  direccion: string | null
  referencias: string | null
  /** Lo que capturó la asesora; si el texto no empieza con una modalidad, el texto completo. */
  notas: string | null
}

export function armarObservaciones(
  datos: Pick<DatosRegistroPedido, 'modalidad' | 'referencias' | 'observaciones'>,
): string {
  const partes = [MODALIDAD_EN_TEXTO[datos.modalidad]]
  if (datos.modalidad === 'domicilio' && datos.referencias) partes.push(`${PREFIJO_REFERENCIAS}${datos.referencias}`)
  if (datos.observaciones) partes.push(datos.observaciones)
  return partes.join(SEPARADOR)
}

/**
 * Separa los datos de entrega de las notas. Si el texto no empieza con una modalidad (p. ej. un
 * pedido capturado en el sistema interno), regresa todo null y el texto completo como notas.
 * Si después de la modalidad viene "Entrega dd/mm/aaaa" (pedidos anteriores y de la app), se
 * ignora. Si unas referencias traen " · ", lo que sigue de ellas se lee como notas.
 */
export function leerObservaciones(texto: string | null): ObservacionesPedido {
  const completo = texto?.trim() ?? ''
  const [primera = '', ...resto] = completo.split(SEPARADOR)
  const modalidad = (Object.keys(MODALIDAD_EN_TEXTO) as ModalidadEntrega[]).find(
    (clave) => MODALIDAD_EN_TEXTO[clave] === primera,
  )

  if (!modalidad) {
    return { modalidad: null, direccion: null, referencias: null, notas: completo || null }
  }

  if (FECHA_ENTREGA_ANTERIOR.test(resto[0] ?? '')) resto.shift()

  // Dirección y referencias solo van a domicilio, en cualquier orden, antes de las notas.
  let direccion: string | null = null
  let referencias: string | null = null
  while (modalidad === 'domicilio' && resto.length > 0) {
    const parte = resto[0] ?? ''
    if (direccion === null && parte.startsWith(PREFIJO_DIRECCION)) {
      direccion = parte.slice(PREFIJO_DIRECCION.length).trim()
    } else if (referencias === null && parte.startsWith(PREFIJO_REFERENCIAS)) {
      referencias = parte.slice(PREFIJO_REFERENCIAS.length).trim()
    } else {
      break
    }
    resto.shift()
  }

  return {
    modalidad,
    direccion: direccion || null,
    referencias: referencias || null,
    notas: resto.join(SEPARADOR).trim() || null,
  }
}
