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

/**
 * Perfiles que operan el reparto (CU-10): toman pedidos Surtidos a domicilio, los pasan a En
 * reparto y registran la entrega o la entrega no realizada. Según la Tabla 2 del documento, solo el
 * repartidor. Si el equipo decide que el vendedor también pueda, se agrega aquí su tipoUsuario
 * (p. ej. 'empleado') y la opción Reparto del menú en obtenerMenuNavegacion().
 */
const PERFILES_QUE_REPARTEN = ['repartidor']

export function perfilPuedeCancelar(): boolean {
  return PERFILES_QUE_CANCELAN.includes(obtenerRolUsuario())
}

export function perfilPuedeEditar(): boolean {
  return PERFILES_QUE_EDITAN.includes(obtenerRolUsuario())
}

export function perfilPuedeRegistrarPago(): boolean {
  return PERFILES_QUE_REGISTRAN_PAGO.includes(obtenerRolUsuario())
}

export function perfilPuedeRepartir(): boolean {
  return PERFILES_QUE_REPARTEN.includes(obtenerRolUsuario())
}

/** Mensaje de RF-ACC-03 cuando un perfil intenta una operación que no tiene permitida. */
export const MENSAJE_SIN_PERMISO = 'No tiene permiso para realizar esta operación.'
