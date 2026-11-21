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
// Confirma la cancelación de un pedido. Igual que en la app móvil, solo se confirma: la API
// todavía no tiene dónde guardar el motivo (RF-PED-03 lo pide); cuando lo tenga, se agrega aquí.
// El pedido no se borra: queda Cancelado. El foco inicial va a "Volver", la opción que no
// cambia nada.

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'

withDefaults(defineProps<Props>(), {
  advertencia: '',
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  (e: 'confirmar'): void
}>()
</script>

<template>
  <ModalVue
    :mostrar="mostrar"
    :titulo="`Cancelar pedido ${folio}`"
    :ancho-maximo="480"
    :cerrable="!enviando"
    @cerrar="emit('cerrar')"
  >
    <div class="cancelar">
      <p class="cancelar__pregunta">
        ¿Está seguro de que desea cancelar el pedido {{ folio }}? Esta acción no se puede deshacer.
      </p>
      <p class="cancelar__detalle">El pedido se conserva en el historial con estado Cancelado y ya no se surtirá.</p>

      <p v-if="advertencia" class="cancelar__advertencia" role="note">
        <IconoVue nombre="alerta" :tamano="18" />
        {{ advertencia }}
      </p>
    </div>

    <template #pie>
      <BotonVue variante="secundario" data-autofocus :deshabilitado="enviando" @click="emit('cerrar')">
        Volver
      </BotonVue>
      <BotonVue variante="peligro" :deshabilitado="enviando" @click="emit('confirmar')">
        {{ enviando ? 'Cancelando…' : 'Cancelar pedido' }}
      </BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.cancelar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cancelar__pregunta {
  margin: 0;
  color: var(--gf-texto);
  font-size: 14px;
  line-height: 1.5;
}

.cancelar__detalle {
  margin: 0;
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
