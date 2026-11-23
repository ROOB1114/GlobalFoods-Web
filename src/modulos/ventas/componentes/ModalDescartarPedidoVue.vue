<script setup lang="ts">
// Confirma que se quieren descartar los datos capturados antes de salir de Nuevo pedido, o los
// cambios sin guardar antes de salir de Editar pedido (`folioEdicion`).
// El foco inicial va a "Seguir capturando" (o "Seguir editando"), la opción que no pierde nada.

import { computed } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'

interface Props {
  mostrar: boolean
  /** Folio del pedido que se edita, p. ej. "#12"; vacío en un pedido nuevo. */
  folioEdicion?: string
}

const props = withDefaults(defineProps<Props>(), {
  folioEdicion: '',
})

const emit = defineEmits<{
  (e: 'seguir'): void
  (e: 'descartar'): void
}>()

const TEXTOS = {
  nuevo: {
    titulo: '¿Descartar el pedido?',
    texto: () => 'Si sale de esta pantalla se perderán el cliente, los productos y los datos de entrega que capturó.',
    seguir: 'Seguir capturando',
    descartar: 'Descartar pedido',
  },
  edicion: {
    titulo: '¿Descartar los cambios?',
    texto: (folio: string) =>
      `Si sale de esta pantalla se perderán los cambios que hizo al pedido ${folio}. El pedido se queda como estaba.`,
    seguir: 'Seguir editando',
    descartar: 'Descartar cambios',
  },
}

const textos = computed(() => (props.folioEdicion ? TEXTOS.edicion : TEXTOS.nuevo))
</script>

<template>
  <ModalVue :mostrar="mostrar" :titulo="textos.titulo" :ancho-maximo="440" @cerrar="emit('seguir')">
    <p class="descartar__texto">{{ textos.texto(folioEdicion) }}</p>

    <template #pie>
      <BotonVue variante="secundario" data-autofocus @click="emit('seguir')">{{ textos.seguir }}</BotonVue>
      <BotonVue variante="primario" @click="emit('descartar')">{{ textos.descartar }}</BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.descartar__texto {
  margin: 0;
  color: var(--gf-texto);
  font-size: 14px;
  line-height: 1.5;
}
</style>
