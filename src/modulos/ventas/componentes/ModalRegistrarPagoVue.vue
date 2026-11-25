<script lang="ts">
export interface Props {
  mostrar: boolean
  /** "#12" */
  folio: string
  /** Total del pedido. */
  total: number
  /** Observaciones actuales del pedido (solo el texto libre, sin la modalidad). */
  notas?: string
  /** Mientras se envía, los botones se deshabilitan y el diálogo no se cierra. */
  enviando?: boolean
}
</script>

<script setup lang="ts">
// Registra el pago de un pedido surtido o en reparto, como "Registrar entrega" de la app móvil:
// se escribe lo que se recibió en efectivo y lo que falte se pasa solo a tarjeta o transferencia;
// los dos montos deben sumar el total. El pedido queda Entregado con la fecha de entrega de hoy.
// Debajo va el comprobante de entrega (foto del recibo firmado; opcional y todavía no se envía, ver
// pagoEntrega.ts) y se pueden editar las observaciones (p. ej. para anotar una entrega parcial);
// estas solo se mandan si cambiaron.
// El pago mixto (efectivo y tarjeta juntos) todavía no se puede guardar: espera la tabla
// PagoPedidosApp de la API (ver pagoEntrega.ts).
// Al abrir, el efectivo trae el total completo y el foco va a ese campo.

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'
import { formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import {
  AVISO_COMPROBANTE_PENDIENTE,
  COMPROBANTE_DISPONIBLE,
  ETIQUETAS_TIPO_PAGO,
  MENSAJE_MIXTO_PENDIENTE,
  PAGO_MIXTO_DISPONIBLE,
  TIPO_PAGO,
  limpiarMonto,
  montoParaCampo,
  restanteParaTarjeta,
  revisarComprobante,
  revisarPago,
  textoTamanoArchivo,
  type PagoEntrega,
} from '@/modulos/ventas/controladores/pagoEntrega'
import { MAXIMO_OBSERVACIONES } from '@/modulos/ventas/controladores/usarFormularioPedido'

const props = withDefaults(defineProps<Props>(), {
  notas: '',
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  /** `notas` es null si no se cambiaron; `comprobante`, si no se eligió foto. */
  (e: 'confirmar', pago: PagoEntrega, notas: string | null, comprobante: File | null): void
}>()

const AVISO = 'El pedido quedará como Entregado con fecha de entrega de hoy.'

const ID_EFECTIVO = 'pago-efectivo'
const ID_TARJETA = 'pago-tarjeta'
const ID_ESTADO = 'pago-estado'
const ID_NOTAS = 'pago-observaciones'
const ID_CONTADOR = `${ID_NOTAS}-contador`
const ID_COMPROBANTE = 'pago-comprobante'
const ID_COMPROBANTE_AYUDA = `${ID_COMPROBANTE}-ayuda`
const ID_COMPROBANTE_ERROR = `${ID_COMPROBANTE}-error`

const efectivo = ref('')
const tarjeta = ref('')
const notas = ref('')
/** Se muestra el error de los montos hasta que se intenta registrar. */
const intentoRegistrar = ref(false)

const entradaComprobante = ref<HTMLInputElement | null>(null)
const comprobante = ref<File | null>(null)
/** URL temporal para la vista previa; se libera al cambiar o quitar la foto y al cerrar. */
const vistaPrevia = ref('')
const errorComprobante = ref('')
/** Mientras se arrastra un archivo sobre la zona. */
const arrastrando = ref(false)

function liberarVistaPrevia() {
  if (vistaPrevia.value) URL.revokeObjectURL(vistaPrevia.value)
  vistaPrevia.value = ''
}

function quitarComprobante() {
  liberarVistaPrevia()
  comprobante.value = null
  errorComprobante.value = ''
  if (entradaComprobante.value) entradaComprobante.value.value = ''
}

function usarArchivo(archivo: File | undefined) {
  if (!archivo) return
  const error = revisarComprobante(archivo)
  if (error) {
    errorComprobante.value = error
    return
  }
  liberarVistaPrevia()
  comprobante.value = archivo
  vistaPrevia.value = URL.createObjectURL(archivo)
  errorComprobante.value = ''
}

function alElegirArchivo(evento: Event) {
  const entrada = evento.target as HTMLInputElement
  usarArchivo(entrada.files?.[0])
  // Se limpia para que volver a elegir la misma foto también dispare el cambio.
  entrada.value = ''
}

function alSoltarArchivo(evento: DragEvent) {
  arrastrando.value = false
  if (props.enviando) return
  usarArchivo(evento.dataTransfer?.files?.[0])
}

function elegirComprobante() {
  entradaComprobante.value?.click()
}

onBeforeUnmount(liberarVistaPrevia)

watch(
  () => props.mostrar,
  (visible) => {
    if (!visible) {
      quitarComprobante()
      return
    }
    quitarComprobante()
    efectivo.value = montoParaCampo(props.total)
    tarjeta.value = montoParaCampo(0)
    notas.value = props.notas.slice(0, MAXIMO_OBSERVACIONES)
    intentoRegistrar.value = false
  },
)

const revision = computed(() => revisarPago(props.total, efectivo.value, tarjeta.value))
const mixtoPendiente = computed(() => revision.value.pago?.tipo === TIPO_PAGO.mixto && !PAGO_MIXTO_DISPONIBLE)
const mostrarError = computed(() => !!revision.value.error && intentoRegistrar.value)

function alEscribirEfectivo(evento: Event) {
  const texto = limpiarMonto((evento.target as HTMLInputElement).value)
  efectivo.value = texto
  // Lo que falta para el total se pasa solo a tarjeta o transferencia.
  tarjeta.value = restanteParaTarjeta(props.total, texto)
}

function alEscribirTarjeta(evento: Event) {
  tarjeta.value = limpiarMonto((evento.target as HTMLInputElement).value)
}

/** Al salir del campo, el monto queda con dos decimales (vacío se queda vacío: cuenta como 0). */
function alSalirMonto(campo: 'efectivo' | 'tarjeta') {
  const valor = campo === 'efectivo' ? efectivo : tarjeta
  const texto = valor.value.trim().replace(/\.$/, '')
  if (texto !== '') valor.value = montoParaCampo(Number(texto))
}

async function registrar() {
  intentoRegistrar.value = true
  const pago = revision.value.pago
  if (!pago) {
    await nextTick()
    document.getElementById(ID_EFECTIVO)?.focus()
    return
  }
  if (mixtoPendiente.value) return
  const cambiadas = notas.value.trim() !== props.notas.trim()
  emit('confirmar', pago, cambiadas ? notas.value.trim() : null, comprobante.value)
}
</script>

<template>
  <ModalVue
    :mostrar="mostrar"
    :titulo="`Registrar pago del pedido ${folio}`"
    :ancho-maximo="520"
    :cerrable="!enviando"
    @cerrar="emit('cerrar')"
  >
    <div class="pago">
      <p class="pago__total">
        <span>Total a cobrar</span>
        <strong>{{ formatearMoneda(total) }}</strong>
      </p>

      <fieldset class="pago__montos" :aria-describedby="ID_ESTADO">
        <legend class="pago__titulo">¿Cómo pagó el cliente?</legend>
        <p class="pago__ayuda">Escriba lo que recibió en efectivo; lo que falte se pasa solo a tarjeta o transferencia.</p>

        <div class="pago__campos">
          <div class="monto">
            <label class="monto__etiqueta" :for="ID_EFECTIVO">Efectivo</label>
            <div class="monto__caja" :class="{ 'monto__caja--con-error': mostrarError }">
              <span class="monto__signo" aria-hidden="true">$</span>
              <input
                :id="ID_EFECTIVO"
                class="monto__entrada"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :value="efectivo"
                :disabled="enviando"
                :aria-invalid="mostrarError ? true : undefined"
                data-autofocus
                @input="alEscribirEfectivo"
                @blur="alSalirMonto('efectivo')"
              />
            </div>
          </div>

          <div class="monto">
            <label class="monto__etiqueta" :for="ID_TARJETA">Tarjeta o transferencia</label>
            <div class="monto__caja" :class="{ 'monto__caja--con-error': mostrarError }">
              <span class="monto__signo" aria-hidden="true">$</span>
              <input
                :id="ID_TARJETA"
                class="monto__entrada"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :value="tarjeta"
                :disabled="enviando"
                :aria-invalid="mostrarError ? true : undefined"
                @input="alEscribirTarjeta"
                @blur="alSalirMonto('tarjeta')"
              />
            </div>
          </div>
        </div>

        <p
          :id="ID_ESTADO"
          class="pago__estado"
          :class="{
            'pago__estado--ok': !!revision.pago,
            'pago__estado--error': mostrarError,
          }"
          aria-live="polite"
        >
          <template v-if="revision.pago">
            <IconoVue nombre="check" :tamano="16" />
            Cuadra con el total · Pago: {{ ETIQUETAS_TIPO_PAGO[revision.pago.tipo] }}
          </template>
          <template v-else>{{ revision.error }}</template>
        </p>

        <p v-if="mixtoPendiente" class="pago__pendiente" role="note">
          <IconoVue nombre="alerta" :tamano="18" />
          {{ MENSAJE_MIXTO_PENDIENTE }}
        </p>
      </fieldset>

      <div class="comprobante">
        <p :id="ID_COMPROBANTE" class="comprobante__titulo">
          Comprobante de entrega <span class="notas__opcional">(opcional)</span>
        </p>
        <p :id="ID_COMPROBANTE_AYUDA" class="pago__ayuda">Foto del recibo firmado por el cliente.</p>

        <input
          ref="entradaComprobante"
          class="visualmente-oculto"
          type="file"
          accept="image/*"
          tabindex="-1"
          aria-hidden="true"
          @change="alElegirArchivo"
        />

        <div
          v-if="!comprobante"
          class="comprobante__zona"
          :class="{ 'comprobante__zona--arrastrando': arrastrando, 'comprobante__zona--con-error': !!errorComprobante }"
          @dragover.prevent="arrastrando = true"
          @dragleave="arrastrando = false"
          @drop.prevent="alSoltarArchivo"
        >
          <IconoVue nombre="imagen" :tamano="22" />
          <span class="comprobante__texto">Arrastre la foto aquí o</span>
          <button
            type="button"
            class="comprobante__boton"
            :disabled="enviando"
            :aria-describedby="errorComprobante ? `${ID_COMPROBANTE_AYUDA} ${ID_COMPROBANTE_ERROR}` : ID_COMPROBANTE_AYUDA"
            @click="elegirComprobante"
          >
            Elegir imagen<span class="visualmente-oculto"> del comprobante</span>
          </button>
        </div>

        <div v-else class="comprobante__elegido">
          <img v-if="vistaPrevia" class="comprobante__miniatura" :src="vistaPrevia" alt="Vista previa del comprobante" />
          <div class="comprobante__datos">
            <p class="comprobante__nombre">{{ comprobante.name }}</p>
            <p class="comprobante__tamano">{{ textoTamanoArchivo(comprobante.size) }}</p>
          </div>
          <div class="comprobante__acciones">
            <button type="button" class="comprobante__boton" :disabled="enviando" @click="elegirComprobante">
              Cambiar<span class="visualmente-oculto"> comprobante</span>
            </button>
            <button
              type="button"
              class="comprobante__boton comprobante__boton--quitar"
              :disabled="enviando"
              @click="quitarComprobante"
            >
              Quitar<span class="visualmente-oculto"> comprobante</span>
            </button>
          </div>
        </div>

        <p v-if="errorComprobante" :id="ID_COMPROBANTE_ERROR" class="comprobante__error" role="alert">
          {{ errorComprobante }}
        </p>
        <p v-if="!COMPROBANTE_DISPONIBLE" class="comprobante__nota">{{ AVISO_COMPROBANTE_PENDIENTE }}</p>
      </div>

      <div class="notas">
        <label class="notas__etiqueta" :for="ID_NOTAS">
          Observaciones <span class="notas__opcional">(opcional)</span>
        </label>
        <textarea
          :id="ID_NOTAS"
          v-model="notas"
          class="notas__texto"
          rows="3"
          :maxlength="MAXIMO_OBSERVACIONES"
          :disabled="enviando"
          placeholder="Por ejemplo, si la entrega fue parcial (máximo 250 caracteres)"
          :aria-describedby="ID_CONTADOR"
        ></textarea>
        <p
          :id="ID_CONTADOR"
          class="notas__contador"
          :class="{ 'notas__contador--limite': notas.length >= MAXIMO_OBSERVACIONES }"
        >
          {{ notas.length }}/{{ MAXIMO_OBSERVACIONES }}
        </p>
      </div>

      <p class="pago__aviso" role="note">
        <IconoVue nombre="calendario" :tamano="18" />
        {{ AVISO }}
      </p>
    </div>

    <template #pie>
      <BotonVue variante="secundario" :deshabilitado="enviando" @click="emit('cerrar')">Cancelar</BotonVue>
      <BotonVue variante="exito" :deshabilitado="enviando || mixtoPendiente" @click="registrar">
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

.pago__montos {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.pago__titulo {
  margin-bottom: 2px;
  padding: 0;
  color: var(--gf-texto);
  font-size: 15px;
  font-weight: 700;
}

.pago__ayuda {
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.pago__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.monto {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.monto__etiqueta {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.monto__caja {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-campo-fondo);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.monto__caja:focus-within {
  border-color: var(--gf-secundario);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 22%, transparent);
}

.monto__caja--con-error {
  border-color: var(--gf-cancelado-punto);
}

.monto__caja:has(.monto__entrada:disabled) {
  opacity: 0.6;
}

.monto__signo {
  color: var(--gf-texto-tenue);
  font-size: 16px;
  font-weight: 600;
}

.monto__entrada {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gf-texto);
  font: inherit;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.pago__estado {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.pago__estado--ok {
  color: var(--gf-entregado-fg);
  font-weight: 600;
}

.pago__estado--error {
  color: var(--gf-cancelado-punto);
}

.pago__pendiente {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gf-preparacion-bg);
  color: var(--gf-preparacion-fg);
  font-size: 13px;
  font-weight: 600;
}

.comprobante {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comprobante__titulo {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.comprobante__zona {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 1px dashed var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-fondo);
  color: var(--gf-texto-tenue);
  font-size: 13px;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.comprobante__zona--arrastrando {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-claro) 12%, var(--gf-superficie));
}

.comprobante__zona--con-error {
  border-color: var(--gf-cancelado-punto);
}

.comprobante__boton {
  padding: 6px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-secundario);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.comprobante__boton:hover:not(:disabled) {
  border-color: var(--gf-secundario);
}

.comprobante__boton:focus-visible {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.comprobante__boton:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.comprobante__boton--quitar {
  color: var(--gf-cancelado-punto);
}

.comprobante__elegido {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-fondo);
}

.comprobante__miniatura {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--gf-superficie);
}

.comprobante__datos {
  flex: 1 1 140px;
  min-width: 0;
}

.comprobante__nombre {
  overflow: hidden;
  color: var(--gf-texto);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comprobante__tamano,
.comprobante__nota {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.comprobante__acciones {
  display: flex;
  gap: 8px;
}

.comprobante__error {
  color: var(--gf-cancelado-punto);
  font-size: 13px;
}

.notas {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notas__etiqueta {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.notas__opcional {
  color: var(--gf-texto-tenue);
  font-weight: 400;
}

.notas__texto {
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
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.notas__texto::placeholder {
  color: var(--gf-texto-tenue);
  opacity: 0.8;
}

.notas__texto:focus {
  border-color: var(--gf-secundario);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 22%, transparent);
}

.notas__contador {
  color: var(--gf-texto-tenue);
  font-size: 12px;
  text-align: right;
}

.notas__contador--limite {
  color: var(--gf-preparacion-fg);
  font-weight: 700;
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
  .pago__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
