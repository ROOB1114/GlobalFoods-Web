import { obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

// Qué perfiles ven cada acción sobre un pedido en la web, según la Tabla 2 del documento (matriz
// de permisos por perfil). Solo deciden si se muestra el botón o la pantalla: la API también debe
// rechazar la acción a los demás perfiles.
//
// Perfiles de la web y actores del documento:
//   'administrador' → Personal administrativo
//   'empleado'      → Asesora de ventas (así se llama ese tipo de usuario en la API)
//   'repartidor'    → Repartidor / chofer (tipo nuevo; pendiente de que la API lo acepte)
//   'cliente'       → Cliente
// Personal de almacén no tiene perfil en la web: los CU-08 y CU-09 son del sistema interno.
//
// TODO (admin): por acuerdo del equipo, 'administrador' conserva todas las acciones mientras se
// prueba; al final se decide si se le quitan las que la Tabla 2 no le da (CU-05, CU-06, CU-10, CU-11).

/** CU-05 Registrar pedido: la asesora y el cliente (este solo los suyos). */
const PERFILES_QUE_REGISTRAN_PEDIDOS = ['empleado', 'cliente', 'administrador']

/** CU-06 Modificar pedido: la asesora. */
const PERFILES_QUE_EDITAN = ['empleado', 'administrador']

/** CU-07 Cancelar pedido: la asesora y el personal administrativo. */
const PERFILES_QUE_CANCELAN = ['empleado', 'administrador']

/** CU-11 Registrar cierre comercial (en la web, "Registrar pago"): la asesora. */
const PERFILES_QUE_REGISTRAN_PAGO = ['empleado', 'administrador']

/**
 * CU-10 Registrar reparto y entrega: el repartidor (RN-08). Toma pedidos Surtidos a domicilio, los
 * pasa a En reparto y registra la entrega o la entrega no realizada. El perfil repartidor todavía
 * no existe en la API; mientras, se prueba con el administrador.
 */
const PERFILES_QUE_REPARTEN = ['repartidor', 'administrador']

export function perfilPuedeRegistrarPedido(): boolean {
  return PERFILES_QUE_REGISTRAN_PEDIDOS.includes(obtenerRolUsuario())
}

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
