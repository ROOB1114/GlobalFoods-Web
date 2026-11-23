import { obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

// Qué perfiles ven las acciones sobre un pedido en la web. Solo deciden si se muestra el botón:
// la API también debe rechazar la acción a los demás perfiles.
// TODO: ajustar cuando el backend confirme los valores de tipoUsuario.

/**
 * Perfiles que pueden cancelar pedidos desde la web. Según la Tabla 2 del documento, en la web
 * solo cancela el personal administrativo (la asesora cancela desde la app móvil).
 */
const PERFILES_QUE_CANCELAN = ['administrador']

/** Perfiles que pueden editar un pedido Pendiente. Por ahora, los mismos que cancelan. */
const PERFILES_QUE_EDITAN = ['administrador']

/** Perfiles que pueden registrar el pago de un pedido. Por ahora, los mismos que cancelan. */
const PERFILES_QUE_REGISTRAN_PAGO = ['administrador']

export function perfilPuedeCancelar(): boolean {
  return PERFILES_QUE_CANCELAN.includes(obtenerRolUsuario())
}

export function perfilPuedeEditar(): boolean {
  return PERFILES_QUE_EDITAN.includes(obtenerRolUsuario())
}

export function perfilPuedeRegistrarPago(): boolean {
  return PERFILES_QUE_REGISTRAN_PAGO.includes(obtenerRolUsuario())
}
