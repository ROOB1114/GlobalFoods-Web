<script setup lang="ts">
// Motivo de una cancelación (CU-07) o de una entrega no realizada (CU-10 A3): una opción
// obligatoria y una descripción. La lista de opciones y las reglas están en motivosPedido.ts.
// `descripcion` decide cuándo se ve el campo de texto: siempre (opcional) o solo con "Otro".

import { computed } from 'vue'

import { MAXIMO_DESCRIPCION_MOTIVO, OPCION_OTRO } from '@/modulos/ventas/controladores/motivosPedido'

interface Props {
  /** Prefijo único para los id de los campos. */
  idBase: string
  leyenda: string
  opciones: readonly string[]
  /** 'siempre': el texto se ve siempre y es opcional. 'otro': solo con "Otro", y es obligatorio. */
  descripcion: 'siempre' | 'otro'
  etiquetaDescripcion: string
  /** Mensaje de error; vacío si no hay. */
  error?: string
  deshabilitado?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
  deshabilitado: false,
})

const opcion = defineModel<string>('opcion', { default: '' })
const texto = defineModel<string>('texto', { default: '' })

const idError = computed(() => `${props.idBase}-error`)
const idTexto = computed(() => `${props.idBase}-texto`)
const idContador = computed(() => `${props.idBase}-contador`)

const mostrarTexto = computed(() => props.descripcion === 'siempre' || opcion.value === OPCION_OTRO)
const textoObligatorio = computed(() => props.descripcion === 'otro')
</script>

<template>
  <div class="motivo">
    <fieldset class="motivo__grupo" :aria-describedby="error ? idError : undefined" :aria-invalid="error ? true : undefined">
      <legend class="motivo__leyenda">
        {{ leyenda }}<span class="motivo__obligatorio" aria-hidden="true"> *</span>
      </legend>

      <div class="motivo__opciones">
        <label v-for="(nombre, indice) in opciones" :key="nombre" class="motivo__opcion">
          <input
            :id="`${idBase}-${indice}`"
            v-model="opcion"
            type="radio"
            :name="idBase"
            :value="nombre"
            :disabled="deshabilitado"
          />
          <span>{{ nombre }}</span>
        </label>
      </div>
    </fieldset>

    <!-- Falta elegir: el error va junto a las opciones; falta la descripción: junto al texto. -->
    <p v-if="error && !opcion" :id="idError" class="motivo__error" role="alert">{{ error }}</p>

    <div v-if="mostrarTexto" class="motivo__texto">
      <label class="motivo__etiqueta" :for="idTexto">
        {{ etiquetaDescripcion }}
        <span v-if="textoObligatorio" class="motivo__obligatorio" aria-hidden="true"> *</span>
        <span v-else class="motivo__opcional">(opcional)</span>
      </label>
      <textarea
        :id="idTexto"
        v-model="texto"
        class="motivo__campo"
        rows="3"
        :maxlength="MAXIMO_DESCRIPCION_MOTIVO"
        :disabled="deshabilitado"
        :aria-describedby="error ? `${idError} ${idContador}` : idContador"
      ></textarea>
      <p
        :id="idContador"
        class="motivo__contador"
        :class="{ 'motivo__contador--limite': texto.length >= MAXIMO_DESCRIPCION_MOTIVO }"
      >
        {{ texto.length }}/{{ MAXIMO_DESCRIPCION_MOTIVO }}
      </p>
    </div>

    <p v-if="error && opcion" :id="idError" class="motivo__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.motivo {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.motivo :where(p) {
  margin: 0;
}

.motivo__grupo {
  margin: 0;
  padding: 0;
  border: 0;
}

.motivo__leyenda {
  margin-bottom: 8px;
  padding: 0;
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
}

.motivo__obligatorio {
  color: var(--gf-cancelado-fg);
}

.motivo__opcional {
  color: var(--gf-texto-tenue);
  font-weight: 400;
}

.motivo__opciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.motivo__opcion {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-campo-fondo);
  color: var(--gf-texto);
  font-size: 14px;
  cursor: pointer;
}

.motivo__opcion:has(input:checked) {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-secundario) 8%, var(--gf-superficie));
}

.motivo__opcion input {
  margin: 0;
  accent-color: var(--gf-secundario);
}

.motivo__texto {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.motivo__etiqueta {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.motivo__campo {
  width: 100%;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-campo-fondo);
  color: var(--gf-texto);
  font: inherit;
  font-size: 14px;
  resize: vertical;
}

.motivo__campo:focus {
  border-color: var(--gf-secundario);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 22%, transparent);
}

.motivo__contador {
  color: var(--gf-texto-tenue);
  font-size: 12px;
  text-align: right;
}

.motivo__contador--limite {
  color: var(--gf-preparacion-fg);
  font-weight: 700;
}

.motivo__error {
  color: var(--gf-cancelado-fg);
  font-size: 13px;
  font-weight: 600;
}
</style>
