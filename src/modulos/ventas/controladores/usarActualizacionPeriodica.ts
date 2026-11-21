import { onMounted, onUnmounted } from 'vue'

export const INTERVALO_ACTUALIZACION_MS = 60_000
/** Al regresar a la pestaña se actualiza solo si pasó al menos este tiempo desde la última vez. */
const ESPERA_MINIMA_AL_VOLVER_MS = 15_000

/**
 * Llama a `actualizar` cada minuto mientras la pantalla está abierta y la pestaña del navegador
 * está a la vista, y también al regresar a la pestaña. Así se reflejan sin recargar los cambios
 * que se hacen en el sistema interno: almacén marca Surtido y, al cobrar, el pedido pasa a
 * Entregado con su método de pago.
 */
export function usarActualizacionPeriodica(actualizar: () => void, intervaloMs = INTERVALO_ACTUALIZACION_MS) {
  let temporizador: ReturnType<typeof setInterval> | undefined
  let ultima = Date.now()

  function ejecutar() {
    ultima = Date.now()
    actualizar()
  }

  function detener() {
    clearInterval(temporizador)
    temporizador = undefined
  }

  function iniciar() {
    detener()
    temporizador = setInterval(() => {
      if (document.visibilityState === 'visible') ejecutar()
    }, intervaloMs)
  }

  function alCambiarVisibilidad() {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - ultima >= ESPERA_MINIMA_AL_VOLVER_MS) ejecutar()
    iniciar()
  }

  onMounted(() => {
    iniciar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
  })

  onUnmounted(() => {
    detener()
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  })
}
