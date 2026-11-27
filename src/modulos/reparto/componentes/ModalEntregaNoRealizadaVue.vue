<script lang="ts">
export interface Props {
  mostrar: boolean
  /** "#12" */
  folio: string
  /** Mientras se envía, los botones se deshabilitan y el diálogo no se cierra. */
  enviando?: boolean
}
</script>

<script setup lang="ts">
// Entrega no realizada (CU-10 A3, RF-REP-02): el repartidor elige el motivo (obligatorio) y puede
// agregar observaciones. El pedido regresa de En reparto a Surtido; no se cancela. El motivo
// queda en la bitácora y Reportes lo cuenta como entrega no realizada (CU-15).

import { nextTick, ref, watch } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'
import CampoMotivoVue from '@/modulos/ventas/componentes/CampoMotivoVue.vue'
import {
  MENSAJES_MOTIVO,
  MOTIVOS_NO_ENTREGA,
  revisarMotivo,
  textoMotivo,
} from '@/modulos/ventas/controladores/motivosPedido'

const props = withDefaults(defineProps<Props>(), {
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  /** `motivo`: la opción elegida y, si se escribieron, las observaciones ("Cliente ausente: …"). */
  (e: 'confirmar', motivo: string): void
}>()

const ID_MOTIVO = 'no-entrega-motivo'

const opcion = ref('')
const observaciones = ref('')
const error = ref('')

watch(
  () => props.mostrar,
  (visible) => {
    if (!visible) return
    opcion.value = ''
    observaciones.value = ''
    error.value = ''
  },
)

watch(opcion, () => {
  if (error.value) error.value = revisar()
})

function revisar(): string {
  return revisarMotivo(opcion.value, observaciones.value, { requerido: MENSAJES_MOTIVO.noEntregaRequerida })
}

async function confirmar() {
  error.value = revisar()
  if (error.value) {
    await nextTick()
    document.getElementById(`${ID_MOTIVO}-0`)?.focus()
    return
  }
  emit('confirmar', textoMotivo(opcion.value, observaciones.value))
}
</script>

<template>
  <ModalVue
    :mostrar="mostrar"
    :titulo="`No se entregó el pedido ${folio}`"
    :ancho-maximo="520"
    :cerrable="!enviando"
    @cerrar="emit('cerrar')"
  >
    <div class="no-entrega">
      <CampoMotivoVue
        v-model:opcion="opcion"
        v-model:texto="observaciones"
        :id-base="ID_MOTIVO"
        leyenda="¿Por qué no se entregó?"
        :opciones="MOTIVOS_NO_ENTREGA"
        descripcion="siempre"
        etiqueta-descripcion="Observaciones"
        :error="error"
        :deshabilitado="enviando"
      />

      <p class="no-entrega__aviso" role="note">
        <IconoVue nombre="alerta" :tamano="18" />
        El pedido regresará a Surtido para un nuevo reparto o para que se cancele.
      </p>
    </div>

    <template #pie>
      <BotonVue variante="secundario" data-autofocus :deshabilitado="enviando" @click="emit('cerrar')">
        Volver
      </BotonVue>
      <BotonVue variante="peligro" :deshabilitado="enviando" @click="confirmar">
        {{ enviando ? 'Registrando…' : 'Registrar no entrega' }}
      </BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.no-entrega {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.no-entrega__aviso {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gf-pendiente-bg);
  color: var(--gf-pendiente-fg);
  font-size: 13px;
  font-weight: 600;
}
</style>
