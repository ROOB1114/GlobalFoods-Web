<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'

import BotonVue from '@/componentes/BotonVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS } from '@/modulos/ventas/controladores/estadosPedido'
import { formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'
import { crearOrdenCorte, obtenerOrdenCortePendiente, obtenerPedidosCortados, type OrdenCorte,type PedidoCortado,} from '@/modulos/administracion/servicios/servicioCortes'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esAdministrador = obtenerRolUsuario() === 'administrador'
const SIN_DATO = '—'

const pestanaActiva = ref<'ventas' | 'corte'>('ventas')

const pedidos = shallowRef<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref(false)
const directorio = usarDirectorioPedidos()

// Estado de la orden de corte (se conectará al endpoint del backend)
const enviandoCorte = ref(false)
const mensajeCorte = ref('')
const ordenPendiente = ref<OrdenCorte | null>(null)
const errorCorte = ref('')

// Filtros de rango de fechas (aaaa-mm-dd)
const desde = ref('')
const hasta = ref('')

const columnas: ColumnaTabla[] = [
  { clave: 'codigo', etiqueta: 'Código de venta' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'total', etiqueta: 'Total pagado', alineacion: 'derecha' },
]

const pedidosCortados = ref<PedidoCortado[]>([])

const columnasCorte: ColumnaTabla[] = [
  ...columnas,
  { clave: 'estadoCorte', etiqueta: 'Corte', alineacion: 'centro' },
]

const mapaCortesPorPedido = computed(
  () => new Map(pedidosCortados.value.map((item) => [item.idPedido, item])),
)

function obtenerFechaHoyLocal(): string {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

const fechaHoy = obtenerFechaHoyLocal()

const errorFechas = computed(() =>
  desde.value && hasta.value && desde.value > hasta.value
    ? 'La fecha inicial debe ser anterior o igual a la fecha final.'
    : '',
)

const hayFiltros = computed(() => desde.value !== '' || hasta.value !== '')

const ventasEntregadas = computed(() =>
  pedidos.value
    .filter((pedido) => pedido.estatus === ESTATUS.completado)
    .map((pedido) => ({
      id: pedido.id,
      cliente: directorio.nombreCliente(pedido.idCliente),
      fecha: pedido.fechaEntrega || pedido.fechaRegistro,
      totalKg: pedido.totalKg,
      total: pedido.total,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id),
)

const ventasFiltradas = computed(() => {
  if (errorFechas.value) return ventasEntregadas.value

  return ventasEntregadas.value.filter((venta) => {
    const fechaSola = venta.fecha.slice(0, 10)
    if (desde.value && fechaSola < desde.value) return false
    if (hasta.value && fechaSola > hasta.value) return false
    return true
  })
})

const totalKilos = computed(() =>
  ventasFiltradas.value.reduce((acumulado, venta) => acumulado + venta.totalKg, 0),
)

const totalDinero = computed(() =>
  ventasFiltradas.value.reduce((acumulado, venta) => acumulado + venta.total, 0),
)

// Pedidos entregados del día actual para la pestaña de Corte
const ventasHoy = computed(() =>
  ventasEntregadas.value.filter((venta) => venta.fecha.slice(0, 10) === fechaHoy),
)

const ventasHoySinCorte = computed(() =>
  ventasHoy.value.filter((venta) => !mapaCortesPorPedido.value.has(venta.id)),
)

const totalDineroHoy = computed(() =>
  ventasHoySinCorte.value.reduce((acumulado, venta) => acumulado + venta.total, 0),
)

async function cargarVentas() {
  if (esAdministrador) {
  ordenPendiente.value = await obtenerOrdenCortePendiente().catch(() => null)
}
if (esAdministrador) {
  const [pendiente, cortados] = await Promise.all([
    obtenerOrdenCortePendiente().catch(() => null),
    obtenerPedidosCortados().catch(() => []),
  ])
  ordenPendiente.value = pendiente
  pedidosCortados.value = cortados
}
  cargando.value = true
  errorCarga.value = false
  try {
    const [lista] = await Promise.all([obtenerPedidos(), directorio.cargarClientes()])
    pedidos.value = lista
  } catch (error) {
    if (error instanceof ErrorPedidos && error.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    errorCarga.value = true
  } finally {
    cargando.value = false
  }
}

function limpiarFiltros() {
  desde.value = ''
  hasta.value = ''
}

function abrirDetallePedido(id: number) {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

async function darOrdenDeCorte() {
  if (ventasHoySinCorte.value.length === 0 || enviandoCorte.value || ordenPendiente.value) return

  const confirmado = window.confirm(
    `¿Enviar orden de corte al empleado por ${formatearMoneda(totalDineroHoy.value)} (${ventasHoySinCorte.value.length} pedidos sin corte)?`,
  )
  if (!confirmado) return

  enviandoCorte.value = true
  errorCorte.value = ''
  try {
    const idsPedidos = ventasHoySinCorte.value.map((venta) => venta.id)
    const nuevaOrden = await crearOrdenCorte(totalDineroHoy.value, idsPedidos.length, idsPedidos)
    ordenPendiente.value = nuevaOrden
    pedidosCortados.value = [
      ...pedidosCortados.value,
      ...idsPedidos.map((idPedido) => ({
        idPedido,
        idCorte: nuevaOrden.id,
        estatus: nuevaOrden.estatus,
      })),
    ]
  } catch (error) {
    errorCorte.value = error instanceof Error ? error.message : 'No fue posible enviar la orden de corte.'
  } finally {
    enviandoCorte.value = false
  }
}

function descargarExcel() {
  if (ventasFiltradas.value.length === 0) return

  const filas = ventasFiltradas.value.map((venta) => ({
    'Código de venta': `#${venta.id}`,
    Cliente: venta.cliente,
    Fecha: formatearFecha(venta.fecha) || SIN_DATO,
    'Cantidad (kg)': Number(venta.totalKg.toFixed(2)),
    'Total pagado ($)': Number(venta.total.toFixed(2)),
  }))

  filas.push({
    'Código de venta': '',
    Cliente: 'TOTAL',
    Fecha: `${ventasFiltradas.value.length} ventas`,
    'Cantidad (kg)': Number(totalKilos.value.toFixed(2)),
    'Total pagado ($)': Number(totalDinero.value.toFixed(2)),
  })

  const hoja = XLSX.utils.json_to_sheet(filas)

  hoja['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 16 },
    { wch: 15 },
    { wch: 18 },
  ]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Ventas')

  const sufijoFechas =
    desde.value && hasta.value
      ? `${desde.value}_a_${hasta.value}`
      : desde.value
        ? `desde_${desde.value}`
        : hasta.value
          ? `hasta_${hasta.value}`
          : 'todas'

  XLSX.writeFile(libro, `reporte-ventas_${sufijoFechas}.xlsx`)
}

onMounted(cargarVentas)
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Reportes"
  >
    <div class="reportes">
      <div class="reportes__encabezado">
        <div>
          <h1 class="reportes__titulo">
            {{ pestanaActiva === 'corte' ? 'Corte del Día' : 'Reportes de Ventas' }}
          </h1>
          <p class="reportes__subtitulo">
            {{
              pestanaActiva === 'corte'
                ? 'Monitorea el efectivo y los pedidos entregados hoy para solicitar el corte.'
                : 'Consulta las ventas concluidas (pedidos entregados) y los totales generados por rango de fechas.'
            }}
          </p>
        </div>
      </div>

      <!-- Pestañas (solo visibles para Administrador) -->
      <div v-if="esAdministrador" class="pestanas" role="tablist" aria-label="Secciones de reportes">
        <button
          type="button"
          role="tab"
          class="pestanas__boton"
          :class="{ 'pestanas__boton--activa': pestanaActiva === 'ventas' }"
          :aria-selected="pestanaActiva === 'ventas'"
          @click="pestanaActiva = 'ventas'"
        >
          Reportes de ventas
        </button>

        <button
          type="button"
          role="tab"
          class="pestanas__boton"
          :class="{ 'pestanas__boton--activa': pestanaActiva === 'corte' }"
          :aria-selected="pestanaActiva === 'corte'"
          @click="pestanaActiva = 'corte'"
        >
          Corte
        </button>
      </div>

      <!-- PESTAÑA 1: REPORTES DE VENTAS -->
      <template v-if="pestanaActiva === 'ventas'">
        <div class="filtros">
          <div class="filtros__campo">
            <label for="reportes-desde" class="filtros__etiqueta">Desde</label>
            <input
              id="reportes-desde"
              v-model="desde"
              type="date"
              class="filtros__input"
              :aria-invalid="!!errorFechas"
            />
          </div>

          <div class="filtros__campo">
            <label for="reportes-hasta" class="filtros__etiqueta">Hasta</label>
            <input
              id="reportes-hasta"
              v-model="hasta"
              type="date"
              class="filtros__input"
              :aria-invalid="!!errorFechas"
            />
          </div>

          <div class="filtros__accion">
            <BotonVue
              variante="secundario"
              compacto
              :deshabilitado="!hayFiltros"
              @click="limpiarFiltros"
            >
              Limpiar filtros
            </BotonVue>
          </div>
        </div>

        <p v-if="errorFechas" class="reportes__error-fechas" role="alert">
          {{ errorFechas }}
        </p>

        <section class="reportes__seccion">
          <EncabezadoSeccionVue titulo="Ventas Entregadas" icono="reportes" />

          <TablaVue :columnas="columnas" :alto-maximo="360">
            <tr v-if="cargando">
              <td :colspan="columnas.length" class="reportes__mensaje">
                <p role="status">Cargando ventas…</p>
              </td>
            </tr>

            <tr v-else-if="errorCarga">
              <td :colspan="columnas.length" class="reportes__mensaje">
                <p class="reportes__error" role="alert">No fue posible cargar las ventas. Intente nuevamente.</p>
                <div class="reportes__reintentar">
                  <BotonVue variante="secundario" compacto @click="cargarVentas">Reintentar</BotonVue>
                </div>
              </td>
            </tr>

            <tr v-else-if="ventasEntregadas.length === 0">
              <td :colspan="columnas.length" class="reportes__mensaje">
                Todavía no hay ventas entregadas registradas.
              </td>
            </tr>

            <tr v-else-if="ventasFiltradas.length === 0">
              <td :colspan="columnas.length" class="reportes__mensaje">
                No hay ventas entregadas en el rango de fechas seleccionado.
              </td>
            </tr>

            <template v-else>
              <tr
                v-for="venta in ventasFiltradas"
                :key="venta.id"
                class="fila-clicable"
                @click="abrirDetallePedido(venta.id)"
              >
                <td>
                  <RouterLink
                    :to="{ name: 'detalle-pedido', params: { id: venta.id } }"
                    class="reportes__folio"
                    @click.stop
                  >
                    #{{ venta.id }}
                  </RouterLink>
                </td>
                <td class="reportes__cliente">{{ venta.cliente }}</td>
                <td>{{ formatearFecha(venta.fecha) || SIN_DATO }}</td>
                <td class="tabla__celda--derecha">{{ formatearKg(venta.totalKg) }}</td>
                <td class="tabla__celda--derecha reportes__total">{{ formatearMoneda(venta.total) }}</td>
              </tr>
            </template>
          </TablaVue>
        </section>

        <div v-if="!cargando && !errorCarga" class="resumen">
          <div class="resumen__tarjeta">
            <span class="resumen__etiqueta">Ventas en el rango</span>
            <strong class="resumen__valor">{{ ventasFiltradas.length }}</strong>
          </div>

          <div class="resumen__tarjeta">
            <span class="resumen__etiqueta">Total de kilos</span>
            <strong class="resumen__valor">{{ formatearKg(totalKilos) }}</strong>
          </div>

          <div class="resumen__tarjeta resumen__tarjeta--destacada">
            <span class="resumen__etiqueta">Total pagado</span>
            <strong class="resumen__valor resumen__valor--primario">{{ formatearMoneda(totalDinero) }}</strong>
          </div>
        </div>

        <BotonVue
          variante="primario"
          :deshabilitado="cargando || errorCarga || !!errorFechas || ventasFiltradas.length === 0"
          @click="descargarExcel"
        >
          Descargar Excel
        </BotonVue>
      </template>

      <!-- PESTAÑA 2: CORTE (solo Administrador) -->
      <template v-else-if="esAdministrador && pestanaActiva === 'corte'">
        <section class="reportes__seccion">
          <EncabezadoSeccionVue
            :titulo="`Pedidos entregados hoy (${formatearFecha(fechaHoy)})`"
            icono="pedidos"
          />

          <TablaVue :columnas="columnasCorte" :alto-maximo="360">
            <tr v-if="cargando">
              <td :colspan="columnasCorte.length" class="reportes__mensaje">
                <p role="status">Cargando pedidos del día…</p>
              </td>
            </tr>

            <tr v-else-if="errorCarga">
              <td :colspan="columnasCorte.length" class="reportes__mensaje">
                <p class="reportes__error" role="alert">No fue posible cargar los pedidos. Intente nuevamente.</p>
                <div class="reportes__reintentar">
                  <BotonVue variante="secundario" compacto @click="cargarVentas">Reintentar</BotonVue>
                </div>
              </td>
            </tr>

            <tr v-else-if="ventasHoy.length === 0">
              <td :colspan="columnasCorte.length" class="reportes__mensaje">
                Aún no hay pedidos entregados el día de hoy.
              </td>
            </tr>

            <template v-else>
              <tr
                v-for="venta in ventasHoy"
                :key="venta.id"
                class="fila-clicable"
                :class="{ 'fila-cortada': mapaCortesPorPedido.has(venta.id) }"
                @click="abrirDetallePedido(venta.id)"
              >
                <td>
                  <RouterLink
                    :to="{ name: 'detalle-pedido', params: { id: venta.id } }"
                    class="reportes__folio"
                    @click.stop
                  >
                    #{{ venta.id }}
                  </RouterLink>
                </td>
                <td class="reportes__cliente">{{ venta.cliente }}</td>
                <td>{{ formatearFecha(venta.fecha) || SIN_DATO }}</td>
                <td class="tabla__celda--derecha">{{ formatearKg(venta.totalKg) }}</td>
                <td class="tabla__celda--derecha reportes__total">{{ formatearMoneda(venta.total) }}</td>
                <td class="tabla__celda--centro">
                  <span
                    v-if="mapaCortesPorPedido.get(venta.id)?.estatus === 'Confirmado'"
                    class="etiqueta-corte etiqueta-corte--confirmado"
                  >
                    Cortado (#{{ mapaCortesPorPedido.get(venta.id)?.idCorte }})
                  </span>
                  <span
                    v-else-if="mapaCortesPorPedido.has(venta.id)"
                    class="etiqueta-corte etiqueta-corte--pendiente"
                  >
                    En corte (#{{ mapaCortesPorPedido.get(venta.id)?.idCorte }})
                  </span>
                  <span v-else class="etiqueta-corte etiqueta-corte--sin-corte">
                    Sin corte
                  </span>
                </td>
              </tr>
            </template>
          </TablaVue>
        </section>

        <div v-if="!cargando && !errorCarga" class="corte__pie">
          <div class="resumen__tarjeta resumen__tarjeta--destacada corte__total">
            <span class="resumen__etiqueta">
              Pendiente de corte hoy ({{ ventasHoySinCorte.length }} de {{ ventasHoy.length }} pedidos)
            </span>
            <strong class="resumen__valor resumen__valor--primario">{{ formatearMoneda(totalDineroHoy) }}</strong>
          </div>

          <BotonVue
            variante="primario"
            :deshabilitado="enviandoCorte || ventasHoySinCorte.length === 0 || !!ordenPendiente"
            @click="darOrdenDeCorte"
          >
            {{
              ordenPendiente
                ? 'Orden de corte pendiente'
                : enviandoCorte
                  ? 'Enviando orden…'
                  : 'Dar orden de corte'
            }}
          </BotonVue>
        </div>

        <div v-if="ordenPendiente" class="corte__codigo-caja" role="status">
          <div>
            <p class="corte__codigo-titulo">Orden de corte pendiente de entrega</p>
            <p class="corte__codigo-subtitulo">
              Proporciona este código al empleado cuando reciba o entregue el corte de
              <strong>{{ formatearMoneda(ordenPendiente.monto) }}</strong>.
            </p>
          </div>
          <div class="corte__codigo-valor" aria-label="Código de confirmación de 4 dígitos">
            {{ ordenPendiente.codigo }}
          </div>
        </div>

        <p v-if="errorCorte" class="reportes__error" role="alert">{{ errorCorte }}</p>
      </template>
    </div>
  </LayoutPanelVue>
</template>

<style scoped>
.corte__codigo-caja {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--gf-entregado-punto, #16a34a);
  border-radius: 10px;
  background: var(--gf-entregado-bg, #f0fdf4);
  color: var(--gf-entregado-fg, #166534);
}

.corte__codigo-titulo {
  font-size: 15px;
  font-weight: 700;
}

.corte__codigo-subtitulo {
  margin-top: 4px;
  font-size: 13px;
}

.corte__codigo-valor {
  padding: 10px 18px;
  border: 1px dashed var(--gf-entregado-punto, #16a34a);
  border-radius: 8px;
  background: var(--gf-superficie, #ffffff);
  color: var(--gf-primario);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.25em;
  text-indent: 0.25em;
}

.fila-cortada {
  opacity: 0.72;
}

.etiqueta-corte {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.etiqueta-corte--confirmado {
  background: var(--gf-entregado-bg, #f0fdf4);
  color: var(--gf-entregado-fg, #166534);
}

.etiqueta-corte--pendiente {
  background: var(--gf-preparacion-bg, #fffbeb);
  color: var(--gf-preparacion-fg, #92400e);
}

.etiqueta-corte--sin-corte {
  background: var(--gf-fondo);
  color: var(--gf-texto-tenue);
}

.reportes {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.reportes :where(p) {
  margin: 0;
}

.reportes__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 24px;
  font-weight: 700;
}

.reportes__subtitulo {
  margin-top: 6px;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.reportes__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pestanas {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--gf-borde);
}

.pestanas__boton {
  position: relative;
  padding: 10px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--gf-texto-tenue);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.pestanas__boton:hover {
  color: var(--gf-texto);
}

.pestanas__boton--activa {
  border-bottom-color: var(--gf-primario);
  color: var(--gf-primario);
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.filtros__campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filtros__etiqueta {
  color: var(--gf-texto);
  font-size: 13px;
  font-weight: 600;
}

.filtros__input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 14px;
}

.filtros__input:focus {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 1px;
}

.filtros__accion {
  flex: none;
}

.reportes__error-fechas {
  margin-top: -8px;
  color: var(--gf-cancelado-fg);
  font-size: 13px;
}

.reportes__seccion {
  display: flex;
  flex-direction: column;
}

.reportes .reportes__mensaje {
  padding: 32px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
  white-space: normal;
}

.reportes__error {
  color: var(--gf-cancelado-fg);
}

.reportes__reintentar {
  display: inline-flex;
  margin-top: 12px;
}

.reportes__folio {
  color: var(--gf-primario);
  font-weight: 700;
  text-decoration: none;
}

.reportes__folio:hover {
  text-decoration: underline;
}

.reportes__cliente {
  color: var(--gf-texto);
  font-weight: 600;
}

.reportes__total {
  color: var(--gf-texto);
  font-weight: 700;
}

.fila-clicable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.fila-clicable:hover {
  background-color: var(--gf-fondo);
}

.resumen {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.resumen__tarjeta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-fondo);
}

.resumen__tarjeta--destacada {
  border-color: color-mix(in srgb, var(--gf-primario) 30%, var(--gf-borde));
  background: var(--gf-superficie);
}

.resumen__etiqueta {
  color: var(--gf-texto-tenue);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.resumen__valor {
  color: var(--gf-texto);
  font-size: 22px;
  font-weight: 700;
}

.resumen__valor--primario {
  color: var(--gf-primario);
}

.corte__pie {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.corte__total {
  flex: 1;
  min-width: 240px;
}

.corte__aviso {
  padding: 12px 16px;
  border: 1px solid var(--gf-entregado-punto, #16a34a);
  border-radius: 8px;
  background: var(--gf-entregado-bg, #f0fdf4);
  color: var(--gf-entregado-fg, #166534);
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 720px) {
  .resumen {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>