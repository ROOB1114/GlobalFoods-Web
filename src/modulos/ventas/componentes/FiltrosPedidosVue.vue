<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import BotonVue from '@/componentes/BotonVue.vue'
import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import { ESTADOS_FILTRO } from '@/modulos/ventas/controladores/estadosPedido'
import { filtrarClientes, indexarClientes } from '@/modulos/ventas/controladores/usarBuscadorClientes'
import {
  IDS_LISTA,
  type ClienteConPedidos,
  type ConteosPedidos,
} from '@/modulos/ventas/controladores/usarListaPedidos'
import type { Cliente } from '@/modulos/ventas/interfaces/cliente'

// -----------------------------------------------------------------------------
// Props, eventos y modelos
// -----------------------------------------------------------------------------
interface Props {
  conteos: ConteosPedidos
  /** Clientes que tienen pedidos: opciones del buscador (solo personal). */
  clientes?: ClienteConPedidos[]
  /** Oculta el selector desplegable de clientes (CU-23 / RF-HIS-03). */
  soloCliente?: boolean
  /** Error del rango de fechas; se pinta debajo de Desde. */
  errorFechas?: string
  /** Habilita "Limpiar filtros". */
  hayFiltros?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  clientes: () => [],
  soloCliente: false,
  errorFechas: '',
  hayFiltros: false,
})

const emit = defineEmits<{
  (e: 'limpiar'): void
}>()

const estatus = defineModel<number | null>('estatus', { required: true })
const criterio = defineModel<string>('criterio', { required: true })
const idCliente = defineModel<number | null>('idCliente', { default: null })
const desde = defineModel<string>('desde', { required: true })
const hasta = defineModel<string>('hasta', { required: true })

// -----------------------------------------------------------------------------
// Constantes y estado local del buscador de clientes
// -----------------------------------------------------------------------------
const ID_LISTA_CLIENTES = 'pedidos-buscar-clientes'
const idOpcion = (indice: number) => `pedidos-buscar-cliente-${indice}`

const abierta = ref(false)
const indiceActivo = ref(-1)

// -----------------------------------------------------------------------------
// Propiedades computadas
// -----------------------------------------------------------------------------
const marcadorBusqueda = computed(() =>
  props.soloCliente ? 'Folio o sucursal de entrega' : 'Folio o nombre del cliente',
)

const indiceClientes = computed(() =>
  props.soloCliente
    ? []
    : indexarClientes(props.clientes.map(({ id, nombre }) => ({ id, nombre, telefono: null }))),
)

const pedidosPorCliente = computed(() => new Map(props.clientes.map(({ id, pedidos }) => [id, pedidos])))

const opciones = computed(() =>
  props.soloCliente ? [] : filtrarClientes(indiceClientes.value, idCliente.value === null ? criterio.value : ''),
)

const listaAbierta = computed(() => !props.soloCliente && abierta.value && opciones.value.length > 0)

const opcionParaEnter = computed<Cliente | undefined>(() => {
  if (!listaAbierta.value) return undefined
  if (indiceActivo.value >= 0) return opciones.value[indiceActivo.value]
  return opciones.value.length === 1 ? opciones.value[0] : undefined
})

// -----------------------------------------------------------------------------
// Acciones y eventos
// -----------------------------------------------------------------------------
function alternar(valor: number) {
  estatus.value = estatus.value === valor ? null : valor
}

function textoPedidos(id: number): string {
  const total = pedidosPorCliente.value.get(id) ?? 0
  return total === 1 ? '1 pedido' : `${total} pedidos`
}

function abrirLista() {
  if (props.soloCliente) return
  abierta.value = true
}

function cerrarLista() {
  abierta.value = false
  indiceActivo.value = -1
}

function alEscribir() {
  if (props.soloCliente) return
  idCliente.value = null
  abierta.value = true
  indiceActivo.value = -1
}

function elegir(opcion: Cliente) {
  criterio.value = opcion.nombre
  idCliente.value = opcion.id
  cerrarLista()
}

function moverActivo(paso: 1 | -1) {
  if (props.soloCliente) return
  abierta.value = true
  const total = opciones.value.length
  if (total === 0) return
  if (indiceActivo.value === -1) {
    indiceActivo.value = paso === 1 ? 0 : total - 1
    return
  }
  indiceActivo.value = (indiceActivo.value + paso + total) % total
}

function alPresionarTecla(evento: KeyboardEvent) {
  if (props.soloCliente) return
  switch (evento.key) {
    case 'ArrowDown':
      evento.preventDefault()
      moverActivo(1)
      break
    case 'ArrowUp':
      evento.preventDefault()
      moverActivo(-1)
      break
    case 'Enter': {
      const elegido = opcionParaEnter.value
      if (elegido) {
        evento.preventDefault()
        elegir(elegido)
      }
      break
    }
    case 'Escape':
      if (listaAbierta.value) {
        evento.preventDefault()
        cerrarLista()
      }
      break
  }
}

watch(indiceActivo, (indice) => {
  if (indice >= 0) nextTick(() => document.getElementById(idOpcion(indice))?.scrollIntoView({ block: 'nearest' }))
})
</script>

<template>
  <div class="filtros">
    <div class="estados" role="group" aria-label="Filtrar por estado">
      <button type="button" class="estados__boton" :aria-pressed="estatus === null" @click="estatus = null">
        Todos
        <span class="estados__conteo">{{ conteos.todos }}</span>
      </button>
      <button
        v-for="estado in ESTADOS_FILTRO"
        :key="estado.estatus"
        type="button"
        class="estados__boton"
        :aria-pressed="estatus === estado.estatus"
        @click="alternar(estado.estatus)"
      >
        <span class="estados__punto" :style="{ background: estado.colorPunto }" aria-hidden="true"></span>
        {{ estado.etiqueta }}
        <span class="estados__conteo">{{ conteos.porEstatus[estado.estatus] ?? 0 }}</span>
      </button>
    </div>

    <div class="campos">
      <div class="campos__busqueda buscador">
        <CampoTextoVue
          :id="IDS_LISTA.buscar"
          v-model="criterio"
          etiqueta="Buscar"
          :marcador="marcadorBusqueda"
          icono="lupa"
          compacto
          autocomplete="off"
          :role="soloCliente ? undefined : 'combobox'"
          :aria-autocomplete="soloCliente ? undefined : 'list'"
          :aria-expanded="soloCliente ? undefined : listaAbierta"
          :aria-controls="soloCliente ? undefined : ID_LISTA_CLIENTES"
          :aria-activedescendant="!soloCliente && indiceActivo >= 0 ? idOpcion(indiceActivo) : undefined"
          @keydown="alPresionarTecla"
          @input="alEscribir"
          @click="abrirLista"
          @blur="cerrarLista"
        />

        <ul
          v-if="!soloCliente"
          v-show="listaAbierta"
          :id="ID_LISTA_CLIENTES"
          class="buscador__lista"
          role="listbox"
          aria-label="Clientes con pedidos"
        >
          <!-- mousedown.prevent: el campo no pierde el foco antes del clic. -->
          <li
            v-for="(opcion, indice) in opciones"
            :id="idOpcion(indice)"
            :key="opcion.id"
            class="buscador__opcion"
            :class="{ 'buscador__opcion--activa': indice === indiceActivo }"
            role="option"
            :aria-selected="indice === indiceActivo"
            @mousedown.prevent
            @mousemove="indiceActivo = indice"
            @click="elegir(opcion)"
          >
            <span class="buscador__nombre">{{ opcion.nombre }}</span>
            <span class="buscador__detalle">{{ textoPedidos(opcion.id) }}</span>
          </li>
        </ul>
      </div>

      <CampoTextoVue
        :id="IDS_LISTA.desde"
        v-model="desde"
        etiqueta="Desde"
        tipo="date"
        compacto
        :max="hasta || undefined"
        :error="errorFechas"
      />

      <CampoTextoVue
        :id="IDS_LISTA.hasta"
        v-model="hasta"
        etiqueta="Hasta"
        tipo="date"
        compacto
        :min="desde || undefined"
      />

      <div class="campos__accion">
        <!-- Ocupa el alto de una etiqueta para que el botón quede a la altura de los campos. -->
        <span class="campos__hueco" aria-hidden="true">Limpiar</span>
        <BotonVue variante="secundario" :deshabilitado="!hayFiltros" @click="emit('limpiar')">Limpiar filtros</BotonVue>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.estados {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.estados__boton {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px 0 14px;
  border: 1px solid var(--gf-borde);
  border-radius: 999px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.estados__boton:hover {
  border-color: var(--gf-claro);
}

.estados__boton:focus-visible {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.estados__boton[aria-pressed='true'] {
  border-color: var(--gf-primario);
  background: var(--gf-primario);
  color: var(--gf-superficie);
}

.estados__punto {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.estados__conteo {
  min-width: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--gf-fondo);
  color: var(--gf-texto-tenue);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.estados__boton[aria-pressed='true'] .estados__conteo {
  background: color-mix(in srgb, var(--gf-superficie) 20%, transparent);
  color: var(--gf-superficie);
}

.campos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px 170px auto;
  gap: 12px 16px;
  align-items: start;
}

.buscador {
  position: relative;
}

.buscador__lista {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 5;
  max-height: 280px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--gf-primario) 14%, transparent);
  list-style: none;
}

.buscador__opcion {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.buscador__opcion--activa {
  background: color-mix(in srgb, var(--gf-claro) 22%, var(--gf-superficie));
}

.buscador__nombre {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
}

.buscador__detalle {
  flex: none;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.campos__accion {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Mismas medidas que la etiqueta compacta de CampoTextoVue. */
.campos__hueco {
  visibility: hidden;
  font-size: 14px;
  font-weight: 500;
}

@media (max-width: 900px) {
  .campos {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .campos__busqueda,
  .campos__accion {
    grid-column: 1 / -1;
  }

  .campos__hueco {
    display: none;
  }
}

@media (max-width: 480px) {
  .campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>