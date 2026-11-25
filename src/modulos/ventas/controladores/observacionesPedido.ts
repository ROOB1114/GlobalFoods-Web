import type { DatosRegistroPedido, ModalidadEntrega } from '@/modulos/ventas/interfaces/pedido'

// La API no tiene campo para la modalidad, así que Nuevo pedido la guarda al inicio de
// Observaciones, seguida de lo que capturó la asesora:
//   "A domicilio · Llamar antes de llegar"
//   "Recolección en congeladora · Pasa por la tarde"
// La web ya no maneja referencias. Los pedidos anteriores (y los de la app móvil) pueden traer
// "Ref: …" después de la modalidad: se deja como parte de las notas, tal cual, para no perderlo.
// armarObservaciones() escribe ese formato y leerObservaciones() lo lee; si cambia, se cambia aquí.
//
// La fecha de entrega ya no va en Observaciones: la API la regresa en su propio campo
// (FechaEntrega) cuando se registra el pago. Los pedidos anteriores y los de la app móvil sí traen
// "Entrega dd/mm/aaaa" justo después de la modalidad; la lectura lo acepta y lo ignora.
// La lectura también reconoce "Dir: {dirección}" (a domicilio, antes de las notas), aunque hoy
// Nuevo pedido no lo escribe.

const SEPARADOR = ' · '
const PREFIJO_DIRECCION = 'Dir: '
/** Lo escribían los pedidos anteriores y la app móvil; se deja en las notas. */
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
  /**
   * Lo que capturó la asesora (con las "Ref: …" de los pedidos de antes, si traen); si el texto no
   * empieza con una modalidad, el texto completo.
   */
  notas: string | null
}

export function armarObservaciones(datos: Pick<DatosRegistroPedido, 'modalidad' | 'observaciones'>): string {
  const partes = [MODALIDAD_EN_TEXTO[datos.modalidad]]
  if (datos.observaciones) partes.push(datos.observaciones)
  return partes.join(SEPARADOR)
}

/** Partes del texto de Observaciones; `fecha` y `parteDireccion` van tal como están escritas. */
interface PartesObservaciones {
  modalidad: ModalidadEntrega | null
  fecha: string | null
  parteDireccion: string | null
  notas: string
}

function separar(texto: string | null): PartesObservaciones {
  const completo = texto?.trim() ?? ''
  const [primera = '', ...resto] = completo.split(SEPARADOR)
  const modalidad = (Object.keys(MODALIDAD_EN_TEXTO) as ModalidadEntrega[]).find(
    (clave) => MODALIDAD_EN_TEXTO[clave] === primera,
  )

  if (!modalidad) return { modalidad: null, fecha: null, parteDireccion: null, notas: completo }

  const fecha = FECHA_ENTREGA_ANTERIOR.test(resto[0] ?? '') ? (resto.shift() ?? null) : null

  // Dirección y "Ref: …" solo van a domicilio, en cualquier orden, antes de las notas. La
  // dirección se separa; las referencias se quedan como texto al inicio de las notas.
  let parteDireccion: string | null = null
  const referenciasAnteriores: string[] = []
  while (modalidad === 'domicilio' && resto.length > 0) {
    const parte = resto[0] ?? ''
    if (parteDireccion === null && parte.startsWith(PREFIJO_DIRECCION)) {
      parteDireccion = parte
    } else if (parte.startsWith(PREFIJO_REFERENCIAS)) {
      referenciasAnteriores.push(parte)
    } else {
      break
    }
    resto.shift()
  }

  return { modalidad, fecha, parteDireccion, notas: [...referenciasAnteriores, ...resto].join(SEPARADOR).trim() }
}

/**
 * Separa los datos de entrega de las notas. Si el texto no empieza con una modalidad (p. ej. un
 * pedido capturado en el sistema interno), regresa todo null y el texto completo como notas.
 * Si después de la modalidad viene "Entrega dd/mm/aaaa" (pedidos anteriores y de la app), se
 * ignora. Las "Ref: …" de los pedidos de antes se quedan al inicio de las notas.
 */
export function leerObservaciones(texto: string | null): ObservacionesPedido {
  const partes = separar(texto)
  return {
    modalidad: partes.modalidad,
    direccion: partes.parteDireccion?.slice(PREFIJO_DIRECCION.length).trim() || null,
    notas: partes.notas || null,
  }
}

/**
 * Cambia solo las notas (lo que leerObservaciones() da como `notas`) y conserva lo que va antes:
 * la modalidad, "Entrega dd/mm/aaaa" y "Dir: …" de los pedidos de la app. Si el texto no empieza
 * con una modalidad, las notas son todo el texto y se reemplaza completo. Se usa al registrar el
 * pago, donde se pueden agregar observaciones (p. ej. una entrega parcial).
 */
export function reemplazarNotas(texto: string | null, notas: string): string {
  const partes = separar(texto)
  const nuevas = notas.trim()
  if (!partes.modalidad) return nuevas
  return [MODALIDAD_EN_TEXTO[partes.modalidad], partes.fecha, partes.parteDireccion, nuevas || null]
    .filter((parte): parte is string => !!parte)
    .join(SEPARADOR)
}
