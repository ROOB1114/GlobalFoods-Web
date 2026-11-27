<script lang="ts">
export interface Props {
  mostrar: boolean
  /** "#12" */
  folio: string
  /** Aviso según el estado (p. ej. si almacén ya lo surtió); vacío si no hay. No bloquea. */
  advertencia?: string
  /** Mientras se envía, los botones se deshabilitan y el diálogo no se cierra. */
  enviando?: boolean
}
</script>

<script setup lang="ts">
// Cancela un pedido (CU-07, RF-PED-03): pide el motivo (obligatorio; si es "Otro", también la
// descripción) y confirma. El motivo va a la bitácora del pedido y lo muestra Reportes. El pedido
// no se borra: queda Cancelado. El foco inicial va a "Volver", la opción que no cambia nada.

import { nextTick, ref, watch } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'
import CampoMotivoVue from '@/modulos/ventas/componentes/CampoMotivoVue.vue'
import {
  MENSAJES_MOTIVO,
  MOTIVOS_CANCELACION,
  OPCION_OTRO,
  revisarMotivo,
  textoMotivo,
} from '@/modulos/ventas/controladores/motivosPedido'

const props = withDefaults(defineProps<Props>(), {
  advertencia: '',
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  /** `motivo`: la opción elegida y, si se escribió, la descripción ("Otro: …"). */
  (e: 'confirmar', motivo: string): void
}>()

const ID_MOTIVO = 'cancelar-motivo'

const opcion = ref('')
const descripcion = ref('')
const error = ref('')

// Cada vez que se abre, empieza vacío.
watch(
  () => props.mostrar,
  (visible) => {
    if (!visible) return
    opcion.value = ''
    descripcion.value = ''
    error.value = ''
  },
)

// Al corregir, el error se quita.
watch([opcion, descripcion], () => {
  if (error.value) error.value = revisar()
})

function revisar(): string {
  return revisarMotivo(opcion.value, descripcion.value, {
    requerido: MENSAJES_MOTIVO.cancelacionRequerida,
    otroSinDescripcion: MENSAJES_MOTIVO.cancelacionOtroSinDescripcion,
  })
}

async function confirmar() {
  error.value = revisar()
  if (error.value) {
    await nextTick()
    const campo = opcion.value ? `${ID_MOTIVO}-texto` : `${ID_MOTIVO}-0`
    document.getElementById(campo)?.focus()
    return
  }
  // Solo "Otro" lleva descripción (RF-PED-03).
  emit('confirmar', textoMotivo(opcion.value, opcion.value === OPCION_OTRO ? descripcion.value : ''))
}
</script>

<template>
  <ModalVue
    :mostrar="mostrar"
    :titulo="`Cancelar pedido ${folio}`"
    :ancho-maximo="520"
    :cerrable="!enviando"
    @cerrar="emit('cerrar')"
  >
    <div class="cancelar">
      <CampoMotivoVue
        v-model:opcion="opcion"
        v-model:texto="descripcion"
        :id-base="ID_MOTIVO"
        leyenda="Motivo de la cancelación"
        :opciones="MOTIVOS_CANCELACION"
        descripcion="otro"
        etiqueta-descripcion="Describa el motivo"
        :error="error"
        :deshabilitado="enviando"
      />

      <p v-if="advertencia" class="cancelar__advertencia" role="note">
        <IconoVue nombre="alerta" :tamano="18" />
        {{ advertencia }}
      </p>

      <p class="cancelar__pregunta">
        ¿Está seguro de que desea cancelar el pedido {{ folio }}? Esta acción no se puede deshacer.
      </p>
      <p class="cancelar__detalle">El pedido se conserva en el historial con estado Cancelado y ya no se surtirá.</p>
    </div>

    <template #pie>
      <BotonVue variante="secundario" data-autofocus :deshabilitado="enviando" @click="emit('cerrar')">
        Volver
      </BotonVue>
      <BotonVue variante="peligro" :deshabilitado="enviando" @click="confirmar">
        {{ enviando ? 'Cancelando…' : 'Cancelar pedido' }}
      </BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.cancelar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cancelar__pregunta {
  margin: 0;
  color: var(--gf-texto);
  font-size: 14px;
  line-height: 1.5;
}

.cancelar__detalle {
  margin: -8px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 13px;
  line-height: 1.5;
}

.cancelar__advertencia {
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
