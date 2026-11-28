<script setup lang="ts">
// Pestaña Pedidos: todos los pedidos con filtros por estado, búsqueda, fechas y páginas de 10.
// Un clic en cualquier parte de la fila abre su detalle; el folio es además un enlace, para
// llegar con el teclado y abrirlo en otra pestaña. El estado y los filtros viven en usarListaPedidos().
// La lista se actualiza sola cada minuto para reflejar lo que cambia el sistema interno
// (Surtido, cobro y Entregado).

import { perfilPuedeRegistrarPedido } from '@/modulos/ventas/controladores/permisosPedidos'
import { computed, nextTick, onMounted, reactive } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'

import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import FiltrosPedidosVue from '@/modulos/ventas/componentes/FiltrosPedidosVue.vue'
import { MODALIDADES, formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarActualizacionPeriodica } from '@/modulos/ventas/controladores/usarActualizacionPeriodica'
import { IDS_LISTA, MENSAJES_LISTA, usarListaPedidos } from '@/modulos/ventas/controladores/usarListaPedidos'

// -----------------------------------------------------------------------------
// Constantes y configuración de sesión
// -----------------------------------------------------------------------------
const SIN_DATO = '—'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esCliente = obtenerRolUsuario() === 'cliente'

const TEXTOS_VISTA = esCliente
  ? {
      titulo: 'Mis pedidos',
      subtitulo: 'Consulta el estado actual y el historial de tus pedidos.',
      errorCarga: MENSAJES_LISTA.errorCargaCliente,
      sinPedidos: MENSAJES_LISTA.sinPedidosCliente,
    }
  : {
      titulo: 'Pedidos',
      subtitulo: 'Consulta todos los pedidos y revisa en qué estado va cada uno.',
      errorCarga: MENSAJES_LISTA.errorCarga,
      sinPedidos: MENSAJES_LISTA.sinPedidos,
    }

const COLUMNAS: ColumnaTabla[] = esCliente
  ? [
      { clave: 'folio', etiqueta: 'Folio' },
      { clave: 'sucursal', etiqueta: 'Sucursal / Entrega' },
      { clave: 'registrado', etiqueta: 'Registrado' },
      { clave: 'entrega', etiqueta: 'Entrega' },
      { clave: 'modalidad', etiqueta: 'Modalidad' },
      { clave: 'estado', etiqueta: 'Estado' },
      { clave: 'metodoPago', etiqueta: 'Forma de pago' },
      { clave: 'total', etiqueta: 'Importe', alineacion: 'derecha' },
    ]
  : [
      { clave: 'folio', etiqueta: 'Folio' },
      { clave: 'cliente', etiqueta: 'Cliente y sucursal' },
      { clave: 'registrado', etiqueta: 'Registrado' },
      { clave: 'entrega', etiqueta: 'Entrega' },
      { clave: 'modalidad', etiqueta: 'Modalidad' },
      { clave: 'estado', etiqueta: 'Estado' },
      { clave: 'metodoPago', etiqueta: 'Método de pago' },
      { clave: 'total', etiqueta: 'Total', alineacion: 'derecha' },
    ]

// -----------------------------------------------------------------------------
// Estado y datos reactivos
// -----------------------------------------------------------------------------
const lista = reactive(
  usarListaPedidos({
    esCliente,
    alVencerSesion: () => salirPorSesionVencida(enrutador),
  }),
)

const horaActualizacion = computed(() =>
  lista.actualizadoA ? lista.actualizadoA.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
)

// -----------------------------------------------------------------------------
// Acciones de navegación y controles
// -----------------------------------------------------------------------------
async function alLimpiar() {
  lista.limpiarFiltros()
  await nextTick()
  document.getElementById(IDS_LISTA.buscar)?.focus()
}

function alClicFila(evento: MouseEvent, id: number) {
  if (evento.target instanceof Element && evento.target.closest('a, button')) return
  if (window.getSelection()?.toString()) return

  const destino = { name: 'detalle-pedido', params: { id } }
  if (evento.ctrlKey || evento.metaKey) {
    window.open(enrutador.resolve(destino).href, '_blank', 'noopener')
    return
  }
  enrutador.push(destino)
}

async function alCambiarPagina(paso: 1 | -1) {
  lista.cambiarPagina(paso)
  await nextTick()
  const presionado = document.getElementById(paso === 1 ? IDS_LISTA.siguiente : IDS_LISTA.anterior)
  if (presionado instanceof HTMLButtonElement && presionado.disabled) {
    document.getElementById(paso === 1 ? IDS_LISTA.anterior : IDS_LISTA.siguiente)?.focus()
  }
}

// CU-05: "Nuevo pedido" solo para los perfiles que registran pedidos (Tabla 2).
const puedeRegistrarPedido = perfilPuedeRegistrarPedido()
// -----------------------------------------------------------------------------
// Ciclo de vida
// -----------------------------------------------------------------------------
onMounted(lista.cargar)
usarActualizacionPeriodica(() => lista.cargar({ silencioso: true }))
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Pedidos"
  >
    <div class="pedidos">
      <div class="pedidos__encabezado">
        <div>
          <h1 class="pedidos__titulo">{{ TEXTOS_VISTA.titulo }}</h1>
          <p class="pedidos__subtitulo">{{ TEXTOS_VISTA.subtitulo }}</p>
          <p v-if="horaActualizacion" class="pedidos__actualizado">
            Actualizado a las {{ horaActualizacion }} · se actualiza cada minuto
          </p>
        </div>

        <div v-if="puedeRegistrarPedido" class="pedidos__accion">
          <BotonVue variante="exito" @click="enrutador.push({ name: 'nuevo-pedido', query: { desde: 'pedidos' } })">
            <IconoVue nombre="mas" :tamano="16" />
            Nuevo pedido
          </BotonVue>
        </div>
      </div>

      <FiltrosPedidosVue
        v-model:estatus="lista.estatus"
        v-model:criterio="lista.criterio"
        v-model:id-cliente="lista.idCliente"
        v-model:desde="lista.desde"
        v-model:hasta="lista.hasta"
        :conteos="lista.conteos"
        :clientes="lista.clientesConPedidos"
        :solo-cliente="esCliente"
        :error-fechas="lista.errorFechas"
        :hay-filtros="lista.hayFiltros"
        @limpiar="alLimpiar"
      />

      <TablaVue :columnas="COLUMNAS">
        <tr v-if="lista.cargando">
          <td :colspan="COLUMNAS.length" class="pedidos__mensaje">
            <p role="status">{{ MENSAJES_LISTA.cargando }}</p>
          </td>
        </tr>

        <tr v-else-if="lista.errorCarga">
          <td :colspan="COLUMNAS.length" class="pedidos__mensaje">
            <p class="pedidos__error" role="alert">{{ TEXTOS_VISTA.errorCarga }}</p>
            <div class="pedidos__reintentar">
              <BotonVue variante="secundario" compacto @click="lista.cargar">Reintentar</BotonVue>
            </div>
          </td>
        </tr>

        <tr v-else-if="!lista.hayPedidos">
          <td :colspan="COLUMNAS.length" class="pedidos__mensaje">{{ TEXTOS_VISTA.sinPedidos }}</td>
        </tr>

        <tr v-else-if="lista.totalFiltrados === 0">
          <td :colspan="COLUMNAS.length" class="pedidos__mensaje">{{ MENSAJES_LISTA.sinResultados }}</td>
        </tr>

        <template v-else>
          <tr
            v-for="fila in lista.filasPagina"
            :key="fila.id"
            class="pedidos__fila"
            @click="alClicFila($event, fila.id)"
          >
            <td>
              <RouterLink :to="{ name: 'detalle-pedido', params: { id: fila.id } }" class="pedidos__folio">
                #{{ fila.id }}
              </RouterLink>
            </td>
            <td>
              <template v-if="esCliente">
                <p class="pedidos__cliente">{{ fila.sucursal }}</p>
              </template>
              <template v-else>
                <p class="pedidos__cliente">{{ fila.cliente }}</p>
                <p class="pedidos__detalle">{{ fila.sucursal }}</p>
              </template>
            </td>
            <td>{{ formatearFecha(fila.registrado) || SIN_DATO }}</td>
            <td>{{ fila.fechaEntrega ? formatearFecha(fila.fechaEntrega) : SIN_DATO }}</td>
            <td>
              <span v-if="fila.modalidad" class="pedidos__modalidad">
                <IconoVue :nombre="MODALIDADES[fila.modalidad].icono" :tamano="16" />
                {{ MODALIDADES[fila.modalidad].etiquetaCorta }}
              </span>
              <template v-else>{{ SIN_DATO }}</template>
            </td>
            <td><ChipEstadoVue :estado="fila.estado.chip" :etiqueta="fila.estado.etiqueta" /></td>
            <td>{{ fila.metodoPago ?? SIN_DATO }}</td>
            <td class="tabla__celda--derecha">
              <p class="pedidos__total">{{ formatearMoneda(fila.total) }}</p>
              <p class="pedidos__detalle">{{ formatearKg(fila.totalKg) }}</p>
            </td>
          </tr>
        </template>
      </TablaVue>

      <div v-if="!lista.cargando && !lista.errorCarga && lista.totalFiltrados > 0" class="paginacion">
        <p class="paginacion__resumen" role="status">
          Mostrando {{ lista.filasPagina.length }} de {{ lista.totalFiltrados }}
          {{ lista.totalFiltrados === 1 ? 'pedido' : 'pedidos' }}
        </p>

        <div class="paginacion__controles">
          <div class="paginacion__boton">
            <BotonVue
              :id="IDS_LISTA.anterior"
              variante="secundario"
              compacto
              :deshabilitado="lista.paginaActual === 1"
              @click="alCambiarPagina(-1)"
            >
              Anterior
            </BotonVue>
          </div>
          <span class="paginacion__pagina">Página {{ lista.paginaActual }} de {{ lista.totalPaginas }}</span>
          <div class="paginacion__boton">
            <BotonVue
              :id="IDS_LISTA.siguiente"
              variante="secundario"
              compacto
              :deshabilitado="lista.paginaActual === lista.totalPaginas"
              @click="alCambiarPagina(1)"
            >
              Siguiente
            </BotonVue>
          </div>
        </div>
      </div>
    </div>
  </LayoutPanelVue>
</template>

<style scoped>
.pedidos {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pedidos :where(p) {
  margin: 0;
}

.pedidos__encabezado {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pedidos__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 24px;
  font-weight: 700;
}

.pedidos__actualizado {
  margin-top: 4px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.pedidos__subtitulo {
  margin-top: 6px;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.pedidos__accion {
  flex: none;
}

.pedidos .pedidos__mensaje {
  padding: 32px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
  white-space: normal;
}

.pedidos__error {
  color: var(--gf-cancelado-fg);
}

.pedidos__reintentar {
  display: inline-flex;
  margin-top: 12px;
}

.pedidos__fila {
  cursor: pointer;
}

.pedidos__fila > td {
  transition: background-color 0.15s ease;
}

.pedidos__fila:hover > td {
  background: color-mix(in srgb, var(--gf-claro) 12%, var(--gf-superficie));
}

.pedidos__folio {
  color: var(--gf-primario);
  font-weight: 700;
  text-decoration: none;
}

.pedidos__folio:hover {
  text-decoration: underline;
}

.pedidos__folio:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.pedidos__cliente {
  color: var(--gf-texto);
  font-weight: 600;
}

.pedidos__detalle {
  margin-top: 2px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.pedidos__modalidad {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pedidos__total {
  color: var(--gf-texto);
  font-weight: 700;
}

.paginacion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.paginacion__resumen,
.paginacion__pagina {
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.paginacion__controles {
  display: flex;
  align-items: center;
  gap: 12px;
}

.paginacion__boton {
  flex: none;
}

@media (max-width: 560px) {
  .pedidos__encabezado {
    flex-direction: column;
  }

  .pedidos__accion {
    width: 100%;
  }

  .paginacion__controles {
    justify-content: space-between;
    width: 100%;
  }
}
</style>