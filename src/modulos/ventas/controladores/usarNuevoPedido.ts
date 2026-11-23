import { computed, watch } from 'vue'

import { usarFormularioPedido } from '@/modulos/ventas/controladores/usarFormularioPedido'
import { registrarPedido } from '@/modulos/ventas/servicios/servicioPedidos'

/**
 * Nuevo pedido: el formulario común (usarFormularioPedido) con el cliente que se elige en el
 * buscador, el aviso de descarte y el registro.
 * La fecha de entrega y el método de pago no se capturan: el pedido nace con método de pago
 * pendiente y ambos se llenan al registrar el pago, en el detalle del pedido o en el sistema
 * interno.
 * Si falla la consulta de sucursales, llama a `alFallarSucursales` para que la vista muestre el aviso.
 */
export function usarNuevoPedido(opciones: { alFallarSucursales: () => void }) {
  const formulario = usarFormularioPedido(opciones)
  const { cliente, renglones, modalidad, direccionEntrega, referencias, observaciones } = formulario

  // Al cambiar de cliente se cargan sus sucursales (o se limpian si se quitó el cliente, también
  // al reiniciar el formulario).
  watch(cliente, () => formulario.cargarSucursales())

  const hayDatosCapturados = computed(
    () =>
      cliente.value !== null ||
      renglones.value.length > 0 ||
      modalidad.value !== null ||
      direccionEntrega.value.trim() !== '' ||
      referencias.value.trim() !== '' ||
      observaciones.value.trim() !== '',
  )

  /**
   * Envía el pedido y devuelve su folio. Devuelve null sin enviar nada si ya hay un envío en
   * curso, para que el mismo pedido no se registre dos veces. Si la API falla, lanza el error.
   */
  async function registrar(): Promise<string | null> {
    const respuesta = await formulario.enviar(registrarPedido)
    return respuesta?.folio ?? null
  }

  return { ...formulario, hayDatosCapturados, registrar }
}
