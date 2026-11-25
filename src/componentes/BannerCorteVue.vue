<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import {
  confirmarOrdenCorte,
  obtenerOrdenCortePendiente,
  type OrdenCorte,
} from '@/modulos/administracion/servicios/servicioCortes'
import { obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'

const esEmpleado = obtenerRolUsuario() === 'empleado'
const ordenPendiente = ref<OrdenCorte | null>(null)
const codigoConfirmacion = ref('')
const confirmando = ref(false)
const errorConfirmacion = ref('')

let temporizador: ReturnType<typeof setInterval> | null = null

async function revisarOrden() {
  if (!esEmpleado) return
  try {
    const nuevaOrden = await obtenerOrdenCortePendiente()
    if (nuevaOrden?.id !== ordenPendiente.value?.id) {
      codigoConfirmacion.value = ''
      errorConfirmacion.value = ''
    }
    ordenPendiente.value = nuevaOrden
  } catch {
    // No interrumpimos la vista actual si falla una revisión periódica.
  }
}

function alEscribirCodigo(evento: Event) {
  const input = evento.target as HTMLInputElement
  const soloDigitos = input.value.replace(/\D/g, '').slice(0, 4)
  codigoConfirmacion.value = soloDigitos
  if (input.value !== soloDigitos) input.value = soloDigitos
  if (errorConfirmacion.value) errorConfirmacion.value = ''
}

async function confirmar() {
  if (!ordenPendiente.value || confirmando.value) return
  if (codigoConfirmacion.value.length !== 4) {
    errorConfirmacion.value = 'Ingresa los 4 dígitos del código.'
    return
  }

  confirmando.value = true
  errorConfirmacion.value = ''
  try {
    await confirmarOrdenCorte(ordenPendiente.value.id, codigoConfirmacion.value)
    ordenPendiente.value = null
    codigoConfirmacion.value = ''
  } catch (error) {
    errorConfirmacion.value = error instanceof Error ? error.message : 'No se pudo confirmar el corte.'
  } finally {
    confirmando.value = false
  }
}

onMounted(() => {
  if (!esEmpleado) return
  revisarOrden()
  temporizador = setInterval(revisarOrden, 30_000)
})

onUnmounted(() => {
  if (temporizador) clearInterval(temporizador)
})
</script>

<template>
  <div v-if="ordenPendiente" class="banner-corte" role="alert">
    <div class="banner-corte__info">
      <IconoVue nombre="alerta" :tamano="20" class="banner-corte__icono" />
      <div>
        <p class="banner-corte__titulo">Orden de corte solicitada por administración</p>
        <p class="banner-corte__detalle">
          Se solicitó realizar corte por
          <strong>{{ formatearMoneda(ordenPendiente.monto) }}</strong>
          ({{ ordenPendiente.totalPedidos }} pedidos entregados). Ingresa el código de 4 dígitos para confirmar.
        </p>
        <p v-if="errorConfirmacion" class="banner-corte__error">{{ errorConfirmacion }}</p>
      </div>
    </div>

    <form class="banner-corte__accion" @submit.prevent="confirmar">
      <input
        :value="codigoConfirmacion"
        type="text"
        inputmode="numeric"
        maxlength="4"
        placeholder="0000"
        autocomplete="off"
        aria-label="Código de 4 dígitos para confirmar corte"
        class="banner-corte__input"
        @input="alEscribirCodigo"
      />
      <BotonVue
        tipo="submit"
        variante="primario"
        compacto
        :deshabilitado="confirmando || codigoConfirmacion.length !== 4"
      >
        {{ confirmando ? 'Confirmando…' : 'Corte entregado' }}
      </BotonVue>
    </form>
  </div>
</template>

<style scoped>
.banner-corte {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--gf-preparacion-punto, #d97706) 50%, transparent);
  border-radius: 10px;
  background: var(--gf-preparacion-bg, #fffbeb);
  color: var(--gf-preparacion-fg, #92400e);
}

.banner-corte__info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 240px;
}

.banner-corte__icono {
  flex: none;
  margin-top: 2px;
}

.banner-corte__titulo {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.banner-corte__detalle {
  margin: 4px 0 0;
  font-size: 13px;
}

.banner-corte__error {
  margin: 6px 0 0;
  color: var(--gf-cancelado-fg, #b91c1c);
  font-size: 12px;
  font-weight: 600;
}

.banner-corte__accion {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.banner-corte__input {
  width: 84px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie, #ffffff);
  color: var(--gf-texto);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-align: center;
}

.banner-corte__input:focus {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 1px;
}
</style>