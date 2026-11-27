import { computed, ref, shallowRef, watch } from 'vue'

import { estadoDePedido, type EstadoPantalla } from '@/modulos/ventas/controladores/estadosPedido'
import { MODALIDADES, normalizarTexto } from '@/modulos/ventas/controladores/formatosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { ModalidadEntrega, Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

// -----------------------------------------------------------------------------
// Constantes y tipos públicos
// -----------------------------------------------------------------------------
export const PEDIDOS_POR_PAGINA = 10

export const MENSAJES_LISTA = {
  cargando: 'Cargando pedidos…',
  errorCarga: 'No fue posible cargar los pedidos. Intente nuevamente.',
  errorCargaCliente: 'No fue posible consultar sus pedidos. Intente nuevamente.',
  sinResultados: 'No hay pedidos con esos filtros.',
  sinPedidos: 'Todavía no hay pedidos registrados.',
  sinPedidosCliente: 'Aún no tiene pedidos registrados.',
  rangoFechas: 'La fecha inicial debe ser anterior a la fecha final.',
} as const

export const IDS_LISTA = {
  buscar: 'pedidos-buscar',
  desde: 'pedidos-desde',
  hasta: 'pedidos-hasta',
  anterior: 'pedidos-pagina-anterior',
  siguiente: 'pedidos-pagina-siguiente',
} as const

/** Pedidos por estatus, con la búsqueda y las fechas ya aplicadas (el filtro de estado no). */
export interface ConteosPedidos {
  /** Incluye los de estatus desconocido, que no tienen píldora propia. */
  todos: number
  porEstatus: Record<number, number>
}

/** Cliente que aparece en los pedidos, con cuántos tiene; son las opciones del buscador. */
export interface ClienteConPedidos {
  id: number
  nombre: string
  pedidos: number
}

/** Renglón de la tabla, ya resuelto para pintarlo. */
export interface FilaPedido {
  id: number
  cliente: string
  /**
   * "Sucursal Las Quintas"; "Sucursal #3" si no se encontró; "Sucursal …" mientras se consulta;
   * "Recolección en congeladora" si es IdSucursal 0.
   */
  sucursal: string
  /** aaaa-mm-dd */
  registrado: string
  /** aaaa-mm-dd, de la API; null mientras no se registra el pago. */
  fechaEntrega: string | null
  /** IdSucursal 0 es recolección; si no, la que diga Observaciones. */
  modalidad: ModalidadEntrega | null
  /** "Pendiente", "Efectivo" o "Tarjeta o transferencia"; null si la API no lo trae. */
  metodoPago: string | null
  estado: EstadoPantalla
  total: number
  totalKg: number
}

export interface OpcionesListaPedidos {
  alVencerSesion: () => void
  /** Activa el modo cliente (CU-23 / RF-HIS-03): no consulta el directorio global de clientes. */
  esCliente?: boolean
}

// -----------------------------------------------------------------------------
// Composable principal
// -----------------------------------------------------------------------------
export function usarListaPedidos(opciones: OpcionesListaPedidos) {
  const esCliente = opciones.esCliente === true

  // Estado de carga y datos
  const pedidos = shallowRef<Pedido[]>([])
  const cargando = ref(true)
  const errorCarga = ref(false)
  const actualizadoA = ref<Date | null>(null)
  const directorio = usarDirectorioPedidos()
  let cargaVigente = 0

  // Filtros y paginación
  const estatus = ref<number | null>(null)
  const criterio = ref('')
  const idCliente = ref<number | null>(null)
  const desde = ref('')
  const hasta = ref('')
  const pagina = ref(1)

  // Helpers internos
  function textoSucursal(pedido: Pedido): string {
    if (esSucursalRecoleccion(pedido.idSucursal)) return MODALIDADES.recoleccion.titulo
    if (pedido.nombreSucursal) return `Sucursal ${pedido.nombreSucursal}`
    const sucursal = directorio.buscarSucursal(pedido.idCliente, pedido.idSucursal)
    if (sucursal === undefined) return 'Sucursal …'
    return sucursal ? `Sucursal ${sucursal.nombre}` : `Sucursal #${pedido.idSucursal}`
  }

  // Derivados
  const pedidosResueltos = computed(() =>
    pedidos.value.map((pedido) => {
      const cliente = esCliente ? '' : directorio.nombreCliente(pedido.idCliente)
      const sucursal = textoSucursal(pedido)
      return {
        pedido,
        cliente,
        clienteNormalizado: normalizarTexto(cliente),
        sucursal,
        sucursalNormalizada: normalizarTexto(sucursal),
        estado: estadoDePedido(pedido.estatus),
        modalidad: modalidadDePedido(pedido.idSucursal, leerObservaciones(pedido.observaciones).modalidad),
      }
    }),
  )

  const errorFechas = computed(() =>
    desde.value && hasta.value && desde.value > hasta.value ? MENSAJES_LISTA.rangoFechas : '',
  )

  const clientesConPedidos = computed<ClienteConPedidos[]>(() => {
    if (esCliente) return []
    const porCliente = new Map<number, ClienteConPedidos>()
    for (const { pedido, cliente } of pedidosResueltos.value) {
      const registro = porCliente.get(pedido.idCliente)
      if (registro) registro.pedidos += 1
      else porCliente.set(pedido.idCliente, { id: pedido.idCliente, nombre: cliente, pedidos: 1 })
    }
    return [...porCliente.values()]
  })

  const porBusquedaYFechas = computed(() => {
    const texto = normalizarTexto(criterio.value)
    const folio = texto.replace(/^#/, '')
    const buscaFolio = /^\d+$/.test(folio)
    const aplicaFechas = !errorFechas.value

    return pedidosResueltos.value.filter(({ pedido, clienteNormalizado, sucursalNormalizada }) => {
      if (!esCliente && idCliente.value !== null) {
        if (pedido.idCliente !== idCliente.value) return false
      } else if (texto) {
        const coincideFolio = buscaFolio && String(pedido.id).includes(folio)
        const coincideTexto = esCliente
          ? sucursalNormalizada.includes(texto)
          : clienteNormalizado.includes(texto)
        if (!coincideFolio && !coincideTexto) return false
      }

      if (aplicaFechas && desde.value && pedido.fechaRegistro < desde.value) return false
      if (aplicaFechas && hasta.value && pedido.fechaRegistro > hasta.value) return false
      return true
    })
  })

  const conteos = computed<ConteosPedidos>(() => {
    const porEstatus: Record<number, number> = {}
    for (const { pedido } of porBusquedaYFechas.value) {
      porEstatus[pedido.estatus] = (porEstatus[pedido.estatus] ?? 0) + 1
    }
    return { todos: porBusquedaYFechas.value.length, porEstatus }
  })

  const filtrados = computed(() =>
    estatus.value === null
      ? porBusquedaYFechas.value
      : porBusquedaYFechas.value.filter(({ pedido }) => pedido.estatus === estatus.value),
  )

  const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / PEDIDOS_POR_PAGINA)))
  const paginaActual = computed(() => Math.min(pagina.value, totalPaginas.value))

  const enPagina = computed(() =>
    filtrados.value.slice((paginaActual.value - 1) * PEDIDOS_POR_PAGINA, paginaActual.value * PEDIDOS_POR_PAGINA),
  )

  // Solo consulta sucursales por separado si el pedido no trae ya NombreSucursal y no es recolección
  const idsClientesPagina = computed(() =>
    enPagina.value
      .filter(({ pedido }) => !esSucursalRecoleccion(pedido.idSucursal) && !pedido.nombreSucursal)
      .map(({ pedido }) => pedido.idCliente),
  )

  const filasPagina = computed<FilaPedido[]>(() =>
    enPagina.value.map(({ pedido, cliente, sucursal, estado, modalidad }) => ({
      id: pedido.id,
      cliente,
      sucursal,
      registrado: pedido.fechaRegistro,
      fechaEntrega: pedido.fechaEntrega,
      modalidad,
      metodoPago: textoMetodoPago(pedido.metodoPago),
      estado,
      total: pedido.total,
      totalKg: pedido.totalKg,
    })),
  )

  const hayFiltros = computed(
    () =>
      estatus.value !== null ||
      criterio.value.trim() !== '' ||
      (!esCliente && idCliente.value !== null) ||
      desde.value !== '' ||
      hasta.value !== '',
  )

  // Observadores
  watch(idsClientesPagina, (ids) => {
    if (ids.length > 0) directorio.cargarSucursales(ids)
  })

  watch([estatus, criterio, idCliente, desde, hasta], () => {
    pagina.value = 1
  })

  // Acciones
  async function cargar(opcionesCarga: { silencioso?: boolean } = {}) {
    const silencioso = opcionesCarga.silencioso === true
    if (silencioso && cargando.value) return

    cargaVigente += 1
    const numero = cargaVigente

    if (!silencioso) {
      cargando.value = true
      errorCarga.value = false
    }

    try {
      const lista = esCliente
        ? await obtenerPedidos()
        : (await Promise.all([obtenerPedidos(), directorio.cargarClientes()]))[0]

      if (numero !== cargaVigente) return

      pedidos.value = [...lista].sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id)
      errorCarga.value = false
      actualizadoA.value = new Date()

      if (idsClientesPagina.value.length > 0) {
        await directorio.cargarSucursales(idsClientesPagina.value)
      }
    } catch (error) {
      if (numero !== cargaVigente) return
      if (error instanceof ErrorPedidos && error.motivo === 'sesion') {
        opciones.alVencerSesion()
        return
      }
      if (!silencioso) {
        // E1: no presentar información parcial si falla la consulta
        pedidos.value = []
        errorCarga.value = true
      }
    } finally {
      if (numero === cargaVigente && !silencioso) cargando.value = false
    }
  }

  function limpiarFiltros() {
    estatus.value = null
    criterio.value = ''
    idCliente.value = null
    desde.value = ''
    hasta.value = ''
  }

  function cambiarPagina(paso: 1 | -1) {
    pagina.value = Math.min(Math.max(paginaActual.value + paso, 1), totalPaginas.value)
  }

  return {
    cargando,
    errorCarga,
    actualizadoA,
    hayPedidos: computed(() => pedidos.value.length > 0),
    estatus,
    criterio,
    idCliente,
    clientesConPedidos,
    desde,
    hasta,
    errorFechas,
    hayFiltros,
    conteos,
    totalFiltrados: computed(() => filtrados.value.length),
    filasPagina,
    paginaActual,
    totalPaginas,
    cargar,
    limpiarFiltros,
    cambiarPagina,
  }
}