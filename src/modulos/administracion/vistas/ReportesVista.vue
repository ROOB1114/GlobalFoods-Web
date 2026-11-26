<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'

import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {
  crearOrdenCorte,
  obtenerOrdenCortePendiente,
  obtenerPedidosCortados,
  type OrdenCorte,
  type PedidoCortado,
} from '@/modulos/administracion/servicios/servicioCortes'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTADOS_FILTRO, ESTATUS, estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
import { formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { METODO_PAGO, textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const MENSAJES_RESUMEN = {
  rangoInvalido: 'La fecha inicial debe ser anterior a la fecha final.',
  maximoDoceMeses: 'Seleccione un periodo de 12 meses o menos.',
  sinRegistros: 'No hay registros en el periodo seleccionado.',
  errorConsolidar: 'No fue posible generar el resumen.',
}

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esAdministrador = obtenerRolUsuario() === 'administrador'
const SIN_DATO = '—'

const pestanaActiva = ref<'resumen' | 'corte'>('resumen')

const pedidos = shallowRef<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref(false)
const directorio = usarDirectorioPedidos()

// Estado de la pestaña Corte
const enviandoCorte = ref(false)
const ordenPendiente = ref<OrdenCorte | null>(null)
const errorCorte = ref('')
const pedidosCortados = ref<PedidoCortado[]>([])

function obtenerFechaHoyLocal(): string {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

const fechaHoy = obtenerFechaHoyLocal()

// Periodo por omisión: día actual (RF-ADM-01)
const desde = ref(fechaHoy)
const hasta = ref(fechaHoy)
const periodoDesde = ref(fechaHoy)
const periodoHasta = ref(fechaHoy)
const errorFechas = ref('')

// A3. Filtro activo por estado dentro del periodo (null = todos los estados)
const estadoSeleccionado = ref<number | null>(null)

function excedeDoceMeses(fechaInicio: string, fechaFin: string): boolean {
  const [anioI, mesI, diaI] = fechaInicio.split('-').map(Number)
  const [anioF, mesF, diaF] = fechaFin.split('-').map(Number)
  if (!anioI || !mesI || !diaI || !anioF || !mesF || !diaF) return false

  const limite = new Date(anioI + 1, mesI - 1, diaI)
  if (limite.getMonth() !== mesI - 1) limite.setDate(0)
  const fin = new Date(anioF, mesF - 1, diaF)
  return fin.getTime() > limite.getTime()
}

function aplicarPeriodo() {
  if (!desde.value || !hasta.value) {
    errorFechas.value = MENSAJES_RESUMEN.rangoInvalido
    return
  }
  if (desde.value > hasta.value) {
    errorFechas.value = MENSAJES_RESUMEN.rangoInvalido
    return
  }
  if (excedeDoceMeses(desde.value, hasta.value)) {
    errorFechas.value = MENSAJES_RESUMEN.maximoDoceMeses
    return
  }
  errorFechas.value = ''
  periodoDesde.value = desde.value
  periodoHasta.value = hasta.value
  estadoSeleccionado.value = null
}

function seleccionarHoy() {
  desde.value = fechaHoy
  hasta.value = fechaHoy
  periodoDesde.value = fechaHoy
  periodoHasta.value = fechaHoy
  errorFechas.value = ''
  estadoSeleccionado.value = null
}

const esPeriodoHoy = computed(() => periodoDesde.value === fechaHoy && periodoHasta.value === fechaHoy)

const columnasResumen: ColumnaTabla[] = [
  { clave: 'folio', etiqueta: 'Folio' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'formaPago', etiqueta: 'Forma de pago' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'total', etiqueta: 'Importe', alineacion: 'derecha' },
]

const columnasCorte: ColumnaTabla[] = [
  { clave: 'codigo', etiqueta: 'Código de venta' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'total', etiqueta: 'Total pagado', alineacion: 'derecha' },
  { clave: 'estadoCorte', etiqueta: 'Corte', alineacion: 'centro' },
]

// Pedidos cuyo registro cae dentro del periodo válido aplicado
const pedidosPeriodo = computed(() =>
  pedidos.value
    .filter((pedido) => {
      const fechaBase = (pedido.fechaRegistro || pedido.fechaEntrega || '').slice(0, 10)
      if (!fechaBase) return false
      return fechaBase >= periodoDesde.value && fechaBase <= periodoHasta.value
    })
    .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id),
)

const pedidosEntregadosPeriodo = computed(() =>
  pedidosPeriodo.value.filter((pedido) => pedido.estatus === ESTATUS.completado),
)

// Indicadores principales
const totalVendidoPeriodo = computed(() =>
  pedidosEntregadosPeriodo.value.reduce((acumulado, pedido) => acumulado + pedido.total, 0),
)

const totalKilosVendidosPeriodo = computed(() =>
  pedidosEntregadosPeriodo.value.reduce((acumulado, pedido) => acumulado + pedido.totalKg, 0),
)

const totalPedidosPeriodo = computed(() => pedidosPeriodo.value.length)

// Desglose por estado (Figura 17 y A3)
const pedidosPorEstado = computed(() => {
  const total = totalPedidosPeriodo.value
  return ESTADOS_FILTRO.map((estado) => {
    const cantidad = pedidosPeriodo.value.filter((pedido) => pedido.estatus === estado.estatus).length
    const porcentaje = total > 0 ? Math.round((cantidad / total) * 100) : 0
    return {
      ...estado,
      cantidad,
      porcentaje,
    }
  })
})

// Ventas entregadas agrupadas por forma de pago
const ventasPorFormaPago = computed(() => {
  const grupos = [
    { clave: 'efectivo', etiqueta: 'Efectivo', coincidencia: (m: number | null) => m === METODO_PAGO.efectivo },
    {
      clave: 'transferencia',
      etiqueta: 'Crédito o transferencia',
      coincidencia: (m: number | null) => m === METODO_PAGO.creditoOTransferencia,
    },
    { clave: 'mixto', etiqueta: 'Mixto', coincidencia: (m: number | null) => m === METODO_PAGO.mixto },
    {
      clave: 'pendiente',
      etiqueta: 'Pendiente / sin registrar',
      coincidencia: (m: number | null) => m === null || m === METODO_PAGO.pendiente,
    },
  ]

  return grupos.map((grupo) => {
    const lista = pedidosEntregadosPeriodo.value.filter((pedido) => grupo.coincidencia(pedido.metodoPago))
    const monto = lista.reduce((acumulado, pedido) => acumulado + pedido.total, 0)
    return {
      clave: grupo.clave,
      etiqueta: grupo.etiqueta,
      cantidad: lista.length,
      monto,
    }
  })
})

function formatearFechaHoraEvento(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor || SIN_DATO
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Cancelaciones del periodo con motivo desde PedidosEventosAppVentas
const cancelacionesPeriodo = computed(() =>
  pedidosPeriodo.value
    .filter((pedido) => pedido.estatus === ESTATUS.cancelado)
    .map((pedido) => {
      const eventoCancelacion = [...(pedido.eventos ?? [])]
        .reverse()
        .find((ev) => ev.estadoResultante === ESTATUS.cancelado || ev.accion.toLowerCase().includes('cancel'))
      const nota = leerObservaciones(pedido.observaciones).notas
      return {
        id: pedido.id,
        cliente: directorio.nombreCliente(pedido.idCliente),
        fecha: eventoCancelacion ? formatearFechaHoraEvento(eventoCancelacion.fechaHora) : formatearFecha(pedido.fechaRegistro),
        usuario: eventoCancelacion?.usuario || null,
        motivo: eventoCancelacion?.motivo || nota || 'Sin motivo especificado',
      }
    }),
)

// Entregas no realizadas registradas en PedidosEventosAppVentas para pedidos del periodo
const entregasFallidasPeriodo = computed(() => {
  const registros: {
    clave: string
    id: number
    cliente: string
    fecha: string
    usuario: string
    motivo: string
  }[] = []

  for (const pedido of pedidosPeriodo.value) {
    for (const evento of pedido.eventos ?? []) {
      const esFallida =
        (evento.estadoAnterior === ESTATUS.enReparto && evento.estadoResultante === ESTATUS.surtido) ||
        evento.accion.toLowerCase().includes('fallida') ||
        evento.accion.toLowerCase().includes('no entreg')

      if (esFallida) {
        registros.push({
          clave: `${pedido.id}-${evento.id}`,
          id: pedido.id,
          cliente: directorio.nombreCliente(pedido.idCliente),
          fecha: formatearFechaHoraEvento(evento.fechaHora),
          usuario: evento.usuario,
          motivo: evento.motivo || 'Sin motivo especificado',
        })
      }
    }
  }

  return registros
})

const totalIncidenciasPeriodo = computed(
  () => cancelacionesPeriodo.value.length + entregasFallidasPeriodo.value.length,
)

// A3. Tabla de pedidos del periodo filtrada por el estado seleccionado
const pedidosTablaResumen = computed(() => {
  const base =
    estadoSeleccionado.value === null
      ? pedidosPeriodo.value
      : pedidosPeriodo.value.filter((pedido) => pedido.estatus === estadoSeleccionado.value)

  return base.map((pedido) => ({
    id: pedido.id,
    cliente: directorio.nombreCliente(pedido.idCliente),
    fecha: pedido.fechaRegistro || pedido.fechaEntrega || '',
    estado: estadoDePedido(pedido.estatus),
    formaPago: textoMetodoPago(pedido.metodoPago) ?? SIN_DATO,
    totalKg: pedido.totalKg,
    total: pedido.total,
  }))
})

const etiquetaEstadoSeleccionado = computed(() =>
  estadoSeleccionado.value === null ? '' : estadoDePedido(estadoSeleccionado.value).etiqueta,
)

function alternarEstadoSeleccionado(estatus: number) {
  estadoSeleccionado.value = estadoSeleccionado.value === estatus ? null : estatus
}

// --- Pestaña Corte (intacta) ---
const mapaCortesPorPedido = computed(
  () => new Map(pedidosCortados.value.map((item) => [item.idPedido, item])),
)

const ventasEntregadasTodas = computed(() =>
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

const ventasHoy = computed(() =>
  ventasEntregadasTodas.value.filter((venta) => venta.fecha.slice(0, 10) === fechaHoy),
)

const ventasHoySinCorte = computed(() =>
  ventasHoy.value.filter((venta) => !mapaCortesPorPedido.value.has(venta.id)),
)

const totalDineroHoy = computed(() =>
  ventasHoySinCorte.value.reduce((acumulado, venta) => acumulado + venta.total, 0),
)

async function cargarResumen() {
  cargando.value = true
  errorCarga.value = false
  try {
    const promesasCorte = esAdministrador
      ? Promise.all([
          obtenerOrdenCortePendiente().catch(() => null),
          obtenerPedidosCortados().catch(() => []),
        ])
      : Promise.resolve([null, []] as [OrdenCorte | null, PedidoCortado[]])

    const [lista, , [pendiente, cortados]] = await Promise.all([
      obtenerPedidos({ incluirEventos: true }),
      directorio.cargarClientes(),
      promesasCorte,
    ])
    pedidos.value = lista
    ordenPendiente.value = pendiente
    pedidosCortados.value = cortados
  } catch (error) {
    pedidos.value = []
    if (error instanceof ErrorPedidos && error.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    errorCarga.value = true
  } finally {
    cargando.value = false
  }
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
  if (pedidosTablaResumen.value.length === 0) return

  const filas = pedidosTablaResumen.value.map((fila) => ({
    Folio: `#${fila.id}`,
    Cliente: fila.cliente,
    Fecha: formatearFecha(fila.fecha) || SIN_DATO,
    Estado: fila.estado.etiqueta,
    'Forma de pago': fila.formaPago,
    'Cantidad (kg)': Number(fila.totalKg.toFixed(2)),
    'Importe ($)': Number(fila.total.toFixed(2)),
  }))

  const totalKgLista = pedidosTablaResumen.value.reduce((acc, f) => acc + f.totalKg, 0)
  const totalMontoLista = pedidosTablaResumen.value.reduce((acc, f) => acc + f.total, 0)

  filas.push({
    Folio: '',
    Cliente: 'TOTAL',
    Fecha: `${pedidosTablaResumen.value.length} pedidos`,
    Estado: etiquetaEstadoSeleccionado.value || 'Todos',
    'Forma de pago': '',
    'Cantidad (kg)': Number(totalKgLista.toFixed(2)),
    'Importe ($)': Number(totalMontoLista.toFixed(2)),
  })

  const hojaPedidos = XLSX.utils.json_to_sheet(filas)
  hojaPedidos['!cols'] = [
    { wch: 12 },
    { wch: 30 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 15 },
    { wch: 16 },
  ]

  const hojaResumen = XLSX.utils.json_to_sheet([
    { Indicador: 'Periodo', Valor: `${periodoDesde.value} a ${periodoHasta.value}` },
    { Indicador: 'Total vendido (entregados)', Valor: Number(totalVendidoPeriodo.value.toFixed(2)) },
    { Indicador: 'Kilos vendidos (entregados)', Valor: Number(totalKilosVendidosPeriodo.value.toFixed(2)) },
    { Indicador: 'Número de pedidos', Valor: totalPedidosPeriodo.value },
    { Indicador: 'Entregados', Valor: pedidosEntregadosPeriodo.value.length },
    { Indicador: 'Cancelaciones', Valor: cancelacionesPeriodo.value.length },
    { Indicador: 'Entregas no realizadas', Valor: entregasFallidasPeriodo.value.length },
  ])
  hojaResumen['!cols'] = [{ wch: 30 }, { wch: 28 }]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen')
  XLSX.utils.book_append_sheet(libro, hojaPedidos, 'Pedidos')

  XLSX.writeFile(libro, `resumen-ventas_${periodoDesde.value}_a_${periodoHasta.value}.xlsx`)
}

onMounted(cargarResumen)
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
            {{ pestanaActiva === 'corte' ? 'Corte del Día' : 'Supervisión de ventas y operación' }}
          </h1>
          <p class="reportes__subtitulo">
            {{
              pestanaActiva === 'corte'
                ? 'Monitorea el efectivo y los pedidos entregados hoy para solicitar el corte.'
                : 'Monitorea las ventas del periodo, el avance de los pedidos por estado, las formas de pago y las incidencias.'
            }}
          </p>
        </div>

        <div v-if="pestanaActiva === 'resumen'" class="reportes__accion-header">
          <BotonVue
            variante="exito"
            :deshabilitado="cargando || errorCarga || !!errorFechas || pedidosTablaResumen.length === 0"
            @click="descargarExcel"
          >
            Exportar resumen
          </BotonVue>
        </div>
      </div>

      <!-- Pestañas (solo visibles para Administrador) -->
      <div v-if="esAdministrador" class="pestanas" role="tablist" aria-label="Secciones de reportes">
        <button
          type="button"
          role="tab"
          class="pestanas__boton"
          :class="{ 'pestanas__boton--activa': pestanaActiva === 'resumen' }"
          :aria-selected="pestanaActiva === 'resumen'"
          @click="pestanaActiva = 'resumen'"
        >
          Resumen de ventas y operación
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

      <!-- PESTAÑA 1: RESUMEN DE VENTAS Y OPERACIÓN (CU-15 / RF-ADM-01) -->
      <template v-if="pestanaActiva === 'resumen'">
        <div class="filtros">
          <div class="filtros__campo">
            <label for="reportes-desde" class="filtros__etiqueta">Desde</label>
            <input
              id="reportes-desde"
              v-model="desde"
              type="date"
              class="filtros__input"
              :aria-invalid="!!errorFechas"
              @change="aplicarPeriodo"
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
              @change="aplicarPeriodo"
            />
          </div>

          <div class="filtros__accion">
            <BotonVue
              variante="secundario"
              compacto
              :deshabilitado="esPeriodoHoy && !errorFechas"
              @click="seleccionarHoy"
            >
              Hoy
            </BotonVue>
          </div>
        </div>

        <!-- A1. Periodo no válido -->
        <p v-if="errorFechas" class="reportes__error-fechas" role="alert">
          {{ errorFechas }}
        </p>

        <div v-if="cargando" class="reportes__estado-caja" role="status">
          Consolidando información del periodo…
        </div>

        <!-- E1. Error al consolidar (sin mostrar indicadores parciales) -->
        <div v-else-if="errorCarga" class="reportes__estado-caja reportes__estado-caja--error" role="alert">
          <p class="reportes__error">{{ MENSAJES_RESUMEN.errorConsolidar }}</p>
          <div class="reportes__reintentar">
            <BotonVue variante="secundario" compacto @click="cargarResumen">Reintentar</BotonVue>
          </div>
        </div>

        <template v-else>
          <!-- A2. Periodo sin información -->
          <div v-if="totalPedidosPeriodo === 0" class="reportes__aviso-vacio" role="status">
            <IconoVue nombre="alerta" :tamano="18" />
            <span>{{ MENSAJES_RESUMEN.sinRegistros }}</span>
          </div>

          <!-- KPIs principales -->
          <div class="resumen">
            <div class="resumen__tarjeta resumen__tarjeta--destacada">
              <span class="resumen__etiqueta">Total vendido (entregados)</span>
              <strong class="resumen__valor resumen__valor--primario">
                {{ formatearMoneda(totalVendidoPeriodo) }}
              </strong>
              <span class="resumen__nota">{{ formatearKg(totalKilosVendidosPeriodo) }} entregados</span>
            </div>

            <div class="resumen__tarjeta">
              <span class="resumen__etiqueta">Pedidos del periodo</span>
              <strong class="resumen__valor">{{ totalPedidosPeriodo }}</strong>
              <span class="resumen__nota">
                {{ formatearFecha(periodoDesde) }} – {{ formatearFecha(periodoHasta) }}
              </span>
            </div>

            <div class="resumen__tarjeta">
              <span class="resumen__etiqueta">Entregados</span>
              <strong class="resumen__valor">{{ pedidosEntregadosPeriodo.length }}</strong>
              <span class="resumen__nota">
                {{
                  totalPedidosPeriodo > 0
                    ? `${Math.round((pedidosEntregadosPeriodo.length / totalPedidosPeriodo) * 100)}% del total`
                    : '0% del total'
                }}
              </span>
            </div>

            <div class="resumen__tarjeta">
              <span class="resumen__etiqueta">Incidencias</span>
              <strong class="resumen__valor">{{ totalIncidenciasPeriodo }}</strong>
              <span class="resumen__nota">
                {{ cancelacionesPeriodo.length }} cancel. · {{ entregasFallidasPeriodo.length }} no entreg.
              </span>
            </div>
          </div>

          <!-- Pedidos por estado (Figura 17 + A3 interactivo) -->
          <section class="tarjeta">
            <div class="tarjeta__cabecera">
              <EncabezadoSeccionVue titulo="Pedidos por estado" icono="reportes" />
              <span class="tarjeta__ayuda">Haz clic en un estado para consultar sus pedidos</span>
            </div>

            <div class="barras">
              <button
                v-for="item in pedidosPorEstado"
                :key="item.estatus"
                type="button"
                class="barra"
                :class="{ 'barra--activa': estadoSeleccionado === item.estatus }"
                :aria-pressed="estadoSeleccionado === item.estatus"
                @click="alternarEstadoSeleccionado(item.estatus)"
              >
                <div class="barra__etiqueta">
                  <ChipEstadoVue :estado="item.chip" :etiqueta="item.etiqueta" />
                </div>

                <div class="barra__pista" aria-hidden="true">
                  <div
                    class="barra__relleno"
                    :style="{
                      width: `${item.porcentaje}%`,
                      backgroundColor: item.colorPunto,
                    }"
                  ></div>
                </div>

                <div class="barra__cifras">
                  <strong>{{ item.cantidad }}</strong>
                  <span>{{ item.porcentaje }}%</span>
                </div>
              </button>
            </div>

            <div class="barras__pie">
              <span>Total de pedidos del periodo</span>
              <strong>{{ totalPedidosPeriodo }} {{ totalPedidosPeriodo === 1 ? 'pedido' : 'pedidos' }}</strong>
            </div>
          </section>

          <!-- Ventas por forma de pago + Cancelaciones y entregas no realizadas -->
          <div class="rejilla-secundaria">
            <section class="tarjeta">
              <EncabezadoSeccionVue titulo="Ventas por forma de pago" icono="caja" />

              <ul class="lista-pagos">
                <li v-for="pago in ventasPorFormaPago" :key="pago.clave" class="lista-pagos__item">
                  <div>
                    <p class="lista-pagos__nombre">{{ pago.etiqueta }}</p>
                    <p class="lista-pagos__detalle">
                      {{ pago.cantidad }} {{ pago.cantidad === 1 ? 'pedido entregado' : 'pedidos entregados' }}
                    </p>
                  </div>
                  <strong class="lista-pagos__monto">{{ formatearMoneda(pago.monto) }}</strong>
                </li>
              </ul>
            </section>

            <section class="tarjeta">
              <EncabezadoSeccionVue titulo="Cancelaciones y entregas no realizadas" icono="alerta" />

              <div class="incidencias">
                <div>
                  <h3 class="incidencias__subtitulo">
                    Cancelaciones ({{ cancelacionesPeriodo.length }})
                  </h3>
                  <p v-if="cancelacionesPeriodo.length === 0" class="incidencias__vacio">
                    Sin cancelaciones en el periodo.
                  </p>
                  <ul v-else class="incidencias__lista">
                    <li v-for="item in cancelacionesPeriodo" :key="item.id" class="incidencias__item">
                      <div class="incidencias__top">
                        <RouterLink :to="{ name: 'detalle-pedido', params: { id: item.id } }" class="reportes__folio">
                          #{{ item.id }}
                        </RouterLink>
                        <span class="incidencias__cliente">{{ item.cliente }}</span>
                        <span class="incidencias__fecha">{{ item.fecha }}</span>
                      </div>
                      <p class="incidencias__motivo">Motivo: {{ item.motivo }}</p>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 class="incidencias__subtitulo">
                    Entregas no realizadas ({{ entregasFallidasPeriodo.length }})
                  </h3>
                  <p v-if="entregasFallidasPeriodo.length === 0" class="incidencias__vacio">
                    Sin entregas no realizadas en el periodo.
                  </p>
                  <ul v-else class="incidencias__lista">
                    <li v-for="item in entregasFallidasPeriodo" :key="item.clave" class="incidencias__item">
                      <div class="incidencias__top">
                        <RouterLink :to="{ name: 'detalle-pedido', params: { id: item.id } }" class="reportes__folio">
                          #{{ item.id }}
                        </RouterLink>
                        <span class="incidencias__cliente">{{ item.cliente }}</span>
                        <span class="incidencias__fecha">{{ item.fecha }}</span>
                      </div>
                      <p class="incidencias__motivo">Motivo: {{ item.motivo }} ({{ item.usuario }})</p>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <!-- A3. Consulta de pedidos del periodo (filtrable por estado) -->
          <section class="reportes__seccion">
            <div class="tarjeta__cabecera">
              <EncabezadoSeccionVue
                :titulo="
                  etiquetaEstadoSeleccionado
                    ? `Pedidos del periodo · Estado: ${etiquetaEstadoSeleccionado}`
                    : 'Pedidos del periodo'
                "
                icono="pedidos"
              />
              <div v-if="estadoSeleccionado !== null" class="filtros__accion">
                <BotonVue variante="secundario" compacto @click="estadoSeleccionado = null">
                  Ver todos los estados
                </BotonVue>
              </div>
            </div>

            <TablaVue :columnas="columnasResumen" :alto-maximo="320">
              <tr v-if="totalPedidosPeriodo === 0">
                <td :colspan="columnasResumen.length" class="reportes__mensaje">
                  {{ MENSAJES_RESUMEN.sinRegistros }}
                </td>
              </tr>

              <tr v-else-if="pedidosTablaResumen.length === 0">
                <td :colspan="columnasResumen.length" class="reportes__mensaje">
                  No hay pedidos en estado {{ etiquetaEstadoSeleccionado }} dentro del periodo seleccionado.
                </td>
              </tr>

              <template v-else>
                <tr
                  v-for="fila in pedidosTablaResumen"
                  :key="fila.id"
                  class="fila-clicable"
                  @click="abrirDetallePedido(fila.id)"
                >
                  <td>
                    <RouterLink
                      :to="{ name: 'detalle-pedido', params: { id: fila.id } }"
                      class="reportes__folio"
                      @click.stop
                    >
                      #{{ fila.id }}
                    </RouterLink>
                  </td>
                  <td class="reportes__cliente">{{ fila.cliente }}</td>
                  <td>{{ formatearFecha(fila.fecha) || SIN_DATO }}</td>
                  <td><ChipEstadoVue :estado="fila.estado.chip" :etiqueta="fila.estado.etiqueta" /></td>
                  <td>{{ fila.formaPago }}</td>
                  <td class="tabla__celda--derecha">{{ formatearKg(fila.totalKg) }}</td>
                  <td class="tabla__celda--derecha reportes__total">{{ formatearMoneda(fila.total) }}</td>
                </tr>
              </template>
            </TablaVue>
          </section>
        </template>
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
                  <BotonVue variante="secundario" compacto @click="cargarResumen">Reintentar</BotonVue>
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

          <div class="corte__accion">
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
.reportes {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.reportes :where(p, h3) {
  margin: 0;
}

.reportes__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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

.reportes__accion-header {
  flex: none;
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

.filtros__input[aria-invalid='true'] {
  border-color: var(--gf-cancelado-punto);
}

.filtros__accion {
  flex: none;
}

.reportes__error-fechas {
  margin-top: -10px;
  color: var(--gf-cancelado-fg);
  font-size: 13px;
  font-weight: 500;
}

.reportes__estado-caja {
  padding: 32px 16px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
  color: var(--gf-texto-tenue);
  font-size: 14px;
  text-align: center;
}

.reportes__estado-caja--error {
  border-color: var(--gf-cancelado-punto);
}

.reportes__aviso-vacio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-fondo);
  color: var(--gf-texto-tenue);
  font-size: 14px;
  font-weight: 500;
}

.resumen {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.resumen__tarjeta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
}

.resumen__tarjeta--destacada {
  border-color: color-mix(in srgb, var(--gf-primario) 35%, var(--gf-borde));
}

.resumen__etiqueta {
  color: var(--gf-texto-tenue);
  font-size: 11px;
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

.resumen__nota {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.tarjeta {
  padding: 18px 20px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
}

.tarjeta__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 12px;
}

.tarjeta__cabecera :deep(> :first-child) {
  margin-bottom: 0;
}

.tarjeta__ayuda {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

/* Barras horizontales de pedidos por estado (Figura 17) */
.barras {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.barra {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 86px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.barra:hover {
  background: var(--gf-fondo);
}

.barra--activa {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-secundario) 8%, var(--gf-superficie));
}

.barra__etiqueta {
  display: flex;
  align-items: center;
}

.barra__pista {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--gf-fondo);
}

.barra__relleno {
  height: 100%;
  min-width: 0;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.barra__cifras {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: var(--gf-texto-tenue);
}

.barra__cifras strong {
  color: var(--gf-texto);
}

.barras__pie {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--gf-borde);
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.barras__pie strong {
  color: var(--gf-texto);
}

.rejilla-secundaria {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.lista-pagos {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lista-pagos__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gf-fondo);
}

.lista-pagos__nombre {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
}

.lista-pagos__detalle {
  margin-top: 2px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.lista-pagos__monto {
  color: var(--gf-primario);
  font-size: 15px;
  font-weight: 700;
}

.incidencias {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.incidencias__subtitulo {
  margin-bottom: 8px;
  color: var(--gf-texto);
  font-size: 13px;
  font-weight: 700;
}

.incidencias__vacio {
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.incidencias__lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.incidencias__item {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--gf-fondo);
  font-size: 13px;
}

.incidencias__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.incidencias__cliente {
  color: var(--gf-texto);
  font-weight: 600;
}

.incidencias__fecha {
  margin-left: auto;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.incidencias__motivo {
  margin-top: 4px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
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

/* Estilos pestaña Corte */
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

.corte__accion {
  flex: none;
}

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

@media (max-width: 960px) {
  .resumen {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rejilla-secundaria {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .resumen {
    grid-template-columns: minmax(0, 1fr);
  }

  .barra {
    grid-template-columns: 112px minmax(0, 1fr) 72px;
    gap: 8px;
  }

  .reportes__accion-header,
  .corte__accion {
    width: 100%;
  }
}
</style>