<script lang="ts">
export interface Props {
  mostrar: boolean
  /** "#12" */
  folio: string
  /** Total del pedido. */
  total: number
  /** Mientras se envía, los botones se deshabilitan y el diálogo no se cierra. */
  enviando?: boolean
}
</script>

<script setup lang="ts">
// Registra el pago de un pedido surtido o en reparto: se elige el método (Efectivo o
// Transferencia) y el pedido queda Entregado con la fecha de entrega de hoy.
// Cada vez que se abre empieza sin método; sin elegir uno no deja registrar. El foco inicial va
// a la primera opción.

import { nextTick, ref, watch } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'
import { formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { OPCIONES_REGISTRO_PAGO, type MetodoPagoRegistro } from '@/modulos/ventas/controladores/metodosPago'

const props = withDefaults(defineProps<Props>(), {
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  (e: 'confirmar', metodoPago: MetodoPagoRegistro): void
}>()

const MENSAJES_PAGO = {
  metodoRequerido: 'Seleccione el método de pago.',
  aviso: 'El pedido quedará como Entregado con fecha de entrega de hoy.',
}

const NOMBRE_GRUPO = 'pago-metodo'
const ID_LEYENDA = 'pago-metodo-leyenda'
const ID_ERROR = 'pago-metodo-error'

const metodo = ref<MetodoPagoRegistro | null>(null)
const error = ref('')

watch(
  () => props.mostrar,
  (visible) => {
    if (!visible) return
    metodo.value = null
    error.value = ''
  },
)

watch(metodo, (elegido) => {
  if (elegido !== null) error.value = ''
})

async function registrar() {
  if (metodo.value === null) {
    error.value = MENSAJES_PAGO.metodoRequerido
    await nextTick()
    document.querySelector<HTMLInputElement>(`input[name="${NOMBRE_GRUPO}"]`)?.focus()
    return
  }
  emit('confirmar', metodo.value)
}
</script>

<template>
  <ModalVue
    :mostrar="mostrar"
    :titulo="`Registrar pago del pedido ${folio}`"
    :ancho-maximo="480"
    :cerrable="!enviando"
    @cerrar="emit('cerrar')"
  >
    <div class="pago">
      <p class="pago__total">
        <span>Total del pedido</span>
        <strong>{{ formatearMoneda(total) }}</strong>
      </p>

      <fieldset
        class="pago__metodos"
        role="radiogroup"
        :aria-labelledby="ID_LEYENDA"
        aria-required="true"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? ID_ERROR : undefined"
      >
        <legend :id="ID_LEYENDA" class="pago__etiqueta">
          Método de pago<span class="pago__obligatorio" aria-hidden="true"> *</span>
        </legend>

        <div class="pago__opciones">
          <label
            v-for="(opcion, indice) in OPCIONES_REGISTRO_PAGO"
            :key="opcion.valor"
            class="pago__opcion"
            :class="{ 'pago__opcion--activa': metodo === opcion.valor, 'pago__opcion--con-error': !!error }"
          >
            <input
              v-model="metodo"
              class="pago__radio"
              type="radio"
              :name="NOMBRE_GRUPO"
              :value="opcion.valor"
              :disabled="enviando"
              :data-autofocus="indice === 0 ? '' : undefined"
            />
            {{ opcion.etiqueta }}
          </label>
        </div>

        <p v-if="error" :id="ID_ERROR" class="pago__error">{{ error }}</p>
      </fieldset>

      <p class="pago__aviso" role="note">
        <IconoVue nombre="calendario" :tamano="18" />
        {{ MENSAJES_PAGO.aviso }}
      </p>
    </div>

    <template #pie>
      <BotonVue variante="secundario" :deshabilitado="enviando" @click="emit('cerrar')">Cancelar</BotonVue>
      <BotonVue variante="exito" :deshabilitado="enviando" @click="registrar">
        {{ enviando ? 'Registrando…' : 'Registrar pago' }}
      </BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.pago {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pago :where(p) {
  margin: 0;
}

.pago__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--gf-fondo);
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
}

.pago__total strong {
  color: var(--gf-primario);
  font-size: 22px;
}

.pago__metodos {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.pago__etiqueta {
  margin-bottom: 6px;
  padding: 0;
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.pago__obligatorio {
  color: var(--gf-cancelado-punto);
}

.pago__opciones {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pago__opcion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--gf-borde);
  border-radius: 10px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.pago__opcion:hover {
  border-color: var(--gf-claro);
}

.pago__opcion--activa,
.pago__opcion--activa:hover {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-claro) 12%, var(--gf-superficie));
  box-shadow: 0 0 0 1px var(--gf-secundario);
}

.pago__opcion--con-error {
  border-color: var(--gf-cancelado-punto);
}

.pago__opcion:has(.pago__radio:focus-visible) {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.pago__radio {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--gf-secundario);
}

.pago__error {
  margin-top: 6px;
  color: var(--gf-cancelado-punto);
  font-size: 13px;
}

.pago__aviso {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gf-entregado-bg);
  color: var(--gf-entregado-fg);
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 420px) {
  .pago__opciones {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
