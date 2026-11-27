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
  obtenerOrdenesCortePendientes,
  obtenerPedidosCortados,
  obtenerVendedoresCorte,
  type OrdenCorte,
  type PedidoCortado,
  type VendedorCorte,
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

// -----------------------------------------------------------------------------
// Constantes y configuración estática
// -----------------------------------------------------------------------------
const SIN_DATO = '—'

const MENSAJES_RESUMEN = {
  rangoInvalido: 'La fecha inicial debe ser anterior a la fecha final.',
  maximoDoceMeses: 'Seleccione un periodo de 12 meses o menos.',
  sinRegistros: 'No hay registros en el periodo seleccionado.',
  errorConsolidar: 'No fue posible generar el resumen.',
} as const

const COLUMNAS_RESUMEN: ColumnaTabla[] = [
  { clave: 'folio', etiqueta: 'Folio' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'formaPago', etiqueta: 'Forma de pago' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'total', etiqueta: 'Importe', alineacion: 'derecha' },
]

const COLUMNAS_CORTE: ColumnaTabla[] = [
  { clave: 'codigo', etiqueta: 'Código de venta' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'total', etiqueta: 'Total pagado', alineacion: 'derecha' },
  { clave: 'estadoCorte', etiqueta: 'Corte', alineacion: 'centro' },
]

function obtenerFechaHoyLocal(): string {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

const fechaHoy = obtenerFechaHoyLocal()

// -----------------------------------------------------------------------------
// Enrutamiento y sesión
// -----------------------------------------------------------------------------
const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esAdministrador = obtenerRolUsuario() === 'administrador'

// -----------------------------------------------------------------------------
// Estado reactivo
// -----------------------------------------------------------------------------
const pestanaActiva = ref<'resumen' | 'corte'>('resumen')

const pedidos = shallowRef<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref(false)
const directorio = usarDirectorioPedidos()

// Filtros del Resumen (CU-15)
const desde = ref(fechaHoy)
const hasta = ref(fechaHoy)
const periodoDesde = ref(fechaHoy)
const periodoHasta = ref(fechaHoy)
const errorFechas = ref('')
const estadoSeleccionado = ref<number | null>(null)

// Estado de la pestaña Corte (por vendedor y en paralelo)
const vendedoresCorte = ref<VendedorCorte[]>([])
const idVendedorSeleccionado = ref<number | null>(null)
const ordenesPendientes = ref<OrdenCorte[]>([])
const pedidosCortados = ref<PedidoCortado[]>([])
const enviandoCorte = ref(false)
const errorCorte = ref('')

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function excedeDoceMeses(fechaInicio: string, fechaFin: string): boolean {
  const [anioI, mesI, diaI] = fechaInicio.split('-').map(Number)
  const [anioF, mesF, diaF] = fechaFin.split('-').map(Number)
  if (!anioI || !mesI || !diaI || !anioF || !mesF || !diaF) return false

  const limite = new Date(anioI + 1, mesI - 1, diaI)
  if (limite.getMonth() !== mesI - 1) limite.setDate(0)
  const fin = new Date(anioF, mesF - 1, diaF)
  return fin.getTime() > limite.getTime()
}

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

/** Atribuye un pedido entregado al usuario que registró el cobro y entrega (EstadoResultante = 4). */
function obtenerResponsableEntrega(pedido: Pedido): { idUsuario: number | null; nombre: string } | null {
  const eventos = pedido.eventos ?? []
  for (let i = eventos.length - 1; i >= 0; i -= 1) {
    const evento = eventos[i]
    if (evento && evento.estadoResultante === ESTATUS.completado) {
      return { idUsuario: evento.idUsuario, nombre: evento.usuario }
    }
  }
  return null
}

function abrirDetallePedido(id: number) {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

// -----------------------------------------------------------------------------
// Propiedades computadas · Resumen (CU-15)
// -----------------------------------------------------------------------------
const esPeriodoHoy = computed(() => periodoDesde.value === fechaHoy && periodoHasta.value === fechaHoy)

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

const totalVendidoPeriodo = computed(() =>
  pedidosEntregadosPeriodo.value.reduce((acumulado, pedido) => acumulado + pedido.total, 0),
)

const totalKilosVendidosPeriodo = computed(() =>
  pedidosEntregadosPeriodo.value.reduce((acumulado, pedido) => acumulado + pedido.totalKg, 0),
)

const totalPedidosPeriodo = computed(() => pedidosPeriodo.value.length)

const pedidosPorEstado = computed(() => {
  const total = totalPedidosPeriodo.value
  return ESTADOS_FILTRO.map((estado) => {
    const cantidad = pedidosPeriodo.value.filter((pedido) => pedido.estatus === estado.estatus).length
    const porcentaje = total > 0 ? Math.round((cantidad / total) * 100) : 0
    return { ...estado, cantidad, porcentaje }
  })
})

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
        fecha: eventoCancelacion
          ? formatearFechaHoraEvento(eventoCancelacion.fechaHora)
          : formatearFecha(pedido.fechaRegistro),
        usuario: eventoCancelacion?.usuario || null,
        motivo: eventoCancelacion?.motivo || nota || 'Sin motivo especificado',
      }
    }),
)

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

// -----------------------------------------------------------------------------
// Propiedades computadas · Corte por vendedor (paralelo)
// -----------------------------------------------------------------------------
const mapaCortesPorPedido = computed(
  () => new Map(pedidosCortados.value.map((item) => [item.idPedido, item])),
)

const mapaOrdenPendientePorVendedor = computed(() => {
  const mapa = new Map<number, OrdenCorte>()
  for (const orden of ordenesPendientes.value) {
    if (orden.idVendedor !== null) mapa.set(orden.idVendedor, orden)
  }
  return mapa
})

const ventasEntregadasHoyTodas = computed(() =>
  pedidos.value
    .filter((pedido) => {
      if (pedido.estatus !== ESTATUS.completado) return false
      const fecha = pedido.fechaEntrega || pedido.fechaRegistro
      return fecha.slice(0, 10) === fechaHoy
    })
    .map((pedido) => {
      const responsable = obtenerResponsableEntrega(pedido)
      return {
        id: pedido.id,
        cliente: directorio.nombreCliente(pedido.idCliente),
        fecha: pedido.fechaEntrega || pedido.fechaRegistro,
        totalKg: pedido.totalKg,
        total: pedido.total,
        idVendedor: responsable?.idUsuario ?? null,
        nombreVendedor: responsable?.nombre ?? null,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id),
)

const opcionesVendedores = computed(() =>
  vendedoresCorte.value.map((vendedor) => {
    const ventasVendedor = ventasEntregadasHoyTodas.value.filter((v) => v.idVendedor === vendedor.id)
    const sinCorte = ventasVendedor.filter((v) => !mapaCortesPorPedido.value.has(v.id))
    const montoPendiente = sinCorte.reduce((acc, v) => acc + v.total, 0)
    const tieneOrdenPendiente = mapaOrdenPendientePorVendedor.value.has(vendedor.id)

    let detalle = 'Sin entregas hoy'
    if (tieneOrdenPendiente) {
      detalle = 'Orden pendiente'
    } else if (sinCorte.length > 0) {
      detalle = `${sinCorte.length} sin corte · ${formatearMoneda(montoPendiente)}`
    } else if (ventasVendedor.length > 0) {
      detalle = `${ventasVendedor.length} cortados`
    }

    return {
      ...vendedor,
      etiqueta: `${vendedor.nombre} (${detalle})`,
    }
  }),
)

const vendedorSeleccionado = computed(
  () => vendedoresCorte.value.find((v) => v.id === idVendedorSeleccionado.value) ?? null,
)

const ventasHoyVendedor = computed(() => {
  if (idVendedorSeleccionado.value === null) return []
  return ventasEntregadasHoyTodas.value.filter((venta) => venta.idVendedor === idVendedorSeleccionado.value)
})

const ventasHoySinCorte = computed(() =>
  ventasHoyVendedor.value.filter((venta) => !mapaCortesPorPedido.value.has(venta.id)),
)

const totalDineroVendedor = computed(() =>
  ventasHoySinCorte.value.reduce((acumulado, venta) => acumulado + venta.total, 0),
)

const ordenPendienteVendedor = computed(() =>
  idVendedorSeleccionado.value === null
    ? null
    : mapaOrdenPendientePorVendedor.value.get(idVendedorSeleccionado.value) ?? null,
)

const idsVendedoresActivos = computed(() => new Set(vendedoresCorte.value.map((v) => v.id)))

const ventasHoySinVendedorAsignado = computed(() =>
  ventasEntregadasHoyTodas.value.filter(
    (v) => v.idVendedor === null || !idsVendedoresActivos.value.has(v.idVendedor),
  ),
)

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
function aplicarPeriodo() {
  if (!desde.value || !hasta.value || desde.value > hasta.value) {
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

function alternarEstadoSeleccionado(estatus: number) {
  estadoSeleccionado.value = estadoSeleccionado.value === estatus ? null : estatus
}

function seleccionarVendedor(idVendedor: number) {
  errorCorte.value = ''
  idVendedorSeleccionado.value = idVendedor
}

async function cargarResumen() {
  cargando.value = true
  errorCarga.value = false
  errorCorte.value = ''
  try {
    const promesasCorte = esAdministrador
      ? Promise.all([
          obtenerVendedoresCorte().catch(() => []),
          obtenerOrdenesCortePendientes().catch(() => []),
          obtenerPedidosCortados().catch(() => []),
        ])
      : Promise.resolve([[], [], []] as [VendedorCorte[], OrdenCorte[], PedidoCortado[]])

    const [lista, , [vendedores, pendientes, cortados]] = await Promise.all([
      obtenerPedidos({ incluirEventos: true }),
      directorio.cargarClientes(),
      promesasCorte,
    ])

    pedidos.value = lista
    vendedoresCorte.value = vendedores
    ordenesPendientes.value = pendientes
    pedidosCortados.value = cortados

    if (
      idVendedorSeleccionado.value !== null &&
      !vendedores.some((v) => v.id === idVendedorSeleccionado.value)
    ) {
      idVendedorSeleccionado.value = null
    }
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

async function darOrdenDeCorte() {
  const vendedor = vendedorSeleccionado.value
  if (!vendedor || ventasHoySinCorte.value.length === 0 || enviandoCorte.value || ordenPendienteVendedor.value) {
    return
  }

  const confirmado = window.confirm(
    `¿Enviar orden de corte a ${vendedor.nombre} por ${formatearMoneda(totalDineroVendedor.value)} (${ventasHoySinCorte.value.length} pedidos sin corte)?`,
  )
  if (!confirmado) return

  enviandoCorte.value = true
  errorCorte.value = ''
  try {
    const idsPedidos = ventasHoySinCorte.value.map((venta) => venta.id)
    const nuevaOrden = await crearOrdenCorte(
      vendedor.id,
      totalDineroVendedor.value,
      idsPedidos.length,
      idsPedidos,
    )
    ordenesPendientes.value = [
      nuevaOrden,
      ...ordenesPendientes.value.filter((o) => o.idVendedor !== vendedor.id),
    ]
    pedidosCortados.value = [
      ...pedidosCortados.value,
      ...idsPedidos.map((idPedido) => ({
        idPedido,
        idCorte: nuevaOrden.id,
        estatus: nuevaOrden.estatus,
        idVendedor: vendedor.id,
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

// -----------------------------------------------------------------------------
// Ciclo de vida
// -----------------------------------------------------------------------------
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
            {{ pestanaActiva === 'corte' ? 'Corte del Día por Vendedor' : 'Supervisión de ventas y operación' }}
          </h1>
          <p class="reportes__subtitulo">
            {{
              pestanaActiva === 'corte'
                ? 'Selecciona un vendedor para revisar los pedidos que cobró hoy y enviarle su orden de corte individual.'
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

        <div v-else-if="esAdministrador" class="reportes__accion-header">
          <BotonVue variante="secundario" compacto :deshabilitado="cargando" @click="cargarResumen">
            Actualizar cortes
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
          <span v-if="ordenesPendientes.length > 0" class="pestanas__insignia">
            {{ ordenesPendientes.length }}
          </span>
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

        <p v-if="errorFechas" class="reportes__error-fechas" role="alert">
          {{ errorFechas }}
        </p>

        <div v-if="cargando" class="reportes__estado-caja" role="status">
          Consolidando información del periodo…
        </div>

        <div v-else-if="errorCarga" class="reportes__estado-caja reportes__estado-caja--error" role="alert">
          <p class="reportes__error">{{ MENSAJES_RESUMEN.errorConsolidar }}</p>
          <div class="reportes__reintentar">
            <BotonVue variante="secundario" compacto @click="cargarResumen">Reintentar</BotonVue>
          </div>
        </div>

        <template v-else>
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

          <!-- Pedidos por estado -->
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

          <!-- Ventas por forma de pago + Incidencias -->
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

          <!-- Tabla de pedidos del periodo -->
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

            <TablaVue :columnas="COLUMNAS_RESUMEN" :alto-maximo="320">
              <tr v-if="totalPedidosPeriodo === 0">
                <td :colspan="COLUMNAS_RESUMEN.length" class="reportes__mensaje">
                  {{ MENSAJES_RESUMEN.sinRegistros }}
                </td>
              </tr>

              <tr v-else-if="pedidosTablaResumen.length === 0">
                <td :colspan="COLUMNAS_RESUMEN.length" class="reportes__mensaje">
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

      <!-- PESTAÑA 2: CORTE POR VENDEDOR (solo Administrador, soporta cortes paralelos) -->
      <template v-else-if="esAdministrador && pestanaActiva === 'corte'">
        <!-- Selector de vendedor -->
        <div class="corte__selector-barra">
          <div class="filtros__campo corte__selector-campo">
            <label for="corte-vendedor" class="filtros__etiqueta">Vendedor para corte</label>
            <select
              id="corte-vendedor"
              v-model="idVendedorSeleccionado"
              class="filtros__input"
              :disabled="cargando || vendedoresCorte.length === 0"
              @change="errorCorte = ''"
            >
              <option :value="null">— Selecciona un vendedor —</option>
              <option v-for="vendedor in opcionesVendedores" :key="vendedor.id" :value="vendedor.id">
                {{ vendedor.etiqueta }}
              </option>
            </select>
          </div>
        </div>

        <!-- Resumen rápido de órdenes de corte pendientes en paralelo -->
        <section v-if="ordenesPendientes.length > 0" class="corte__paralelas" aria-label="Cortes pendientes activos">
          <p class="corte__paralelas-titulo">
            Órdenes de corte pendientes ({{ ordenesPendientes.length }})
          </p>
          <div class="corte__paralelas-lista">
            <button
              v-for="orden in ordenesPendientes"
              :key="orden.id"
              type="button"
              class="corte__chip-pendiente"
              :class="{ 'corte__chip-pendiente--activo': orden.idVendedor === idVendedorSeleccionado }"
              @click="orden.idVendedor !== null && seleccionarVendedor(orden.idVendedor)"
            >
              <span class="corte__chip-nombre">{{ orden.nombreVendedor || `Vendedor #${orden.idVendedor}` }}</span>
              <span class="corte__chip-monto">{{ formatearMoneda(orden.monto) }}</span>
              <span v-if="orden.codigo" class="corte__chip-codigo">Código: {{ orden.codigo }}</span>
            </button>
          </div>
        </section>

        <section class="reportes__seccion">
          <EncabezadoSeccionVue
            :titulo="
              vendedorSeleccionado
                ? `Pedidos cobrados hoy por ${vendedorSeleccionado.nombre} (${formatearFecha(fechaHoy)})`
                : `Pedidos entregados hoy (${formatearFecha(fechaHoy)})`
            "
            icono="pedidos"
          />

          <TablaVue :columnas="COLUMNAS_CORTE" :alto-maximo="360">
            <tr v-if="cargando">
              <td :colspan="COLUMNAS_CORTE.length" class="reportes__mensaje">
                <p role="status">Cargando pedidos del día…</p>
              </td>
            </tr>

            <tr v-else-if="errorCarga">
              <td :colspan="COLUMNAS_CORTE.length" class="reportes__mensaje">
                <p class="reportes__error" role="alert">No fue posible cargar los pedidos. Intente nuevamente.</p>
                <div class="reportes__reintentar">
                  <BotonVue variante="secundario" compacto @click="cargarResumen">Reintentar</BotonVue>
                </div>
              </td>
            </tr>

            <tr v-else-if="vendedoresCorte.length === 0">
              <td :colspan="COLUMNAS_CORTE.length" class="reportes__mensaje">
                No hay vendedores activos registrados para realizar corte.
              </td>
            </tr>

            <tr v-else-if="!vendedorSeleccionado">
              <td :colspan="COLUMNAS_CORTE.length" class="reportes__mensaje">
                Selecciona un vendedor arriba para consultar únicamente los pedidos que cobró y entregó hoy.
              </td>
            </tr>

            <tr v-else-if="ventasHoyVendedor.length === 0">
              <td :colspan="COLUMNAS_CORTE.length" class="reportes__mensaje">
                {{ vendedorSeleccionado.nombre }} no tiene pedidos entregados el día de hoy.
              </td>
            </tr>

            <template v-else>
              <tr
                v-for="venta in ventasHoyVendedor"
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

        <!-- Totales y botón de orden de corte para el vendedor seleccionado -->
        <div v-if="!cargando && !errorCarga && vendedorSeleccionado" class="corte__pie">
          <div class="resumen__tarjeta resumen__tarjeta--destacada corte__total">
            <span class="resumen__etiqueta">
              Pendiente de corte · {{ vendedorSeleccionado.nombre }} ({{ ventasHoySinCorte.length }} de
              {{ ventasHoyVendedor.length }} pedidos)
            </span>
            <strong class="resumen__valor resumen__valor--primario">{{ formatearMoneda(totalDineroVendedor) }}</strong>
          </div>

          <div class="corte__accion">
            <BotonVue
              variante="primario"
              :deshabilitado="enviandoCorte || ventasHoySinCorte.length === 0 || !!ordenPendienteVendedor"
              @click="darOrdenDeCorte"
            >
              {{
                ordenPendienteVendedor
                  ? 'Orden de corte pendiente'
                  : enviandoCorte
                    ? 'Enviando orden…'
                    : `Dar orden de corte a ${vendedorSeleccionado.nombre}`
              }}
            </BotonVue>
          </div>
        </div>

        <!-- Código exclusivo para el vendedor seleccionado -->
        <div v-if="ordenPendienteVendedor" class="corte__codigo-caja" role="status">
          <div>
            <p class="corte__codigo-titulo">
              Orden de corte pendiente · {{ ordenPendienteVendedor.nombreVendedor || vendedorSeleccionado?.nombre }}
            </p>
            <p class="corte__codigo-subtitulo">
              Proporciona este código exclusivo a
              <strong>{{ ordenPendienteVendedor.nombreVendedor || vendedorSeleccionado?.nombre }}</strong>
              para confirmar el corte de <strong>{{ formatearMoneda(ordenPendienteVendedor.monto) }}</strong>.
              No funcionará en la cuenta de otro vendedor.
            </p>
          </div>
          <div class="corte__codigo-valor" aria-label="Código de confirmación de 4 dígitos">
            {{ ordenPendienteVendedor.codigo }}
          </div>
        </div>

        <p v-if="errorCorte" class="reportes__error" role="alert">{{ errorCorte }}</p>

        <p v-if="!cargando && !errorCarga && ventasHoySinVendedorAsignado.length > 0" class="corte__nota-otros">
          Nota: hay {{ ventasHoySinVendedorAsignado.length }}
          {{ ventasHoySinVendedorAsignado.length === 1 ? 'pedido entregado hoy' : 'pedidos entregados hoy' }}
          cuyo cobro fue registrado por administración o sin vendedor asignado.
        </p>
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.pestanas__insignia {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--gf-primario);
  color: var(--gf-superficie);
  font-size: 11px;
  font-weight: 700;
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

/* Barras horizontales de pedidos por estado */
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

/* Estilos pestaña Corte por vendedor */
.corte__selector-barra {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.corte__selector-campo {
  min-width: min(100%, 360px);
}

.corte__paralelas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--gf-borde);
  border-radius: 10px;
  background: var(--gf-fondo);
}

.corte__paralelas-titulo {
  color: var(--gf-texto-tenue);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.corte__paralelas-lista {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.corte__chip-pendiente {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.corte__chip-pendiente:hover {
  border-color: var(--gf-secundario);
}

.corte__chip-pendiente--activo {
  border-color: var(--gf-primario);
  background: color-mix(in srgb, var(--gf-primario) 8%, var(--gf-superficie));
}

.corte__chip-nombre {
  font-weight: 700;
}

.corte__chip-monto {
  color: var(--gf-primario);
  font-weight: 700;
}

.corte__chip-codigo {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--gf-entregado-bg, #f0fdf4);
  color: var(--gf-entregado-fg, #166534);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
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

.corte__nota-otros {
  color: var(--gf-texto-tenue);
  font-size: 12.5px;
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