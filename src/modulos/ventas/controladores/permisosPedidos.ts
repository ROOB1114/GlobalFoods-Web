import { obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

/**
 * Perfiles que pueden cancelar pedidos desde la web. Según la Tabla 2 del documento, en la web
 * solo cancela el personal administrativo (la asesora cancela desde la app móvil).
 * TODO: ajustar cuando el backend confirme los valores de tipoUsuario. La API también debe
 * rechazar la cancelación a otros perfiles; esto solo decide si se muestra el botón.
 */
const PERFILES_QUE_CANCELAN = ['administrador']

export function perfilPuedeCancelar(): boolean {
  return PERFILES_QUE_CANCELAN.includes(obtenerRolUsuario())
}
