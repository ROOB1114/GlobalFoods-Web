<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AvisoVue from '@/componentes/AvisoVue.vue'
import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import ModalConfirmacion from '@/componentes/ModalConfirmacion.vue'
import ModalNuevaSucursal, { type DatosFormularioSucursal } from '@/componentes/ModalNuevaSucursal.vue'
import ModalNuevoCliente, { type DatosFormularioCliente } from '@/componentes/ModalNuevoCliente.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'

import {
  ErrorClientes,
  ErrorSucursales,
  actualizarClienteAPI,
  actualizarSucursalClienteAPI,
  crearSucursalClienteAPI,
  eliminarClienteAPI,
  eliminarSucursalClienteAPI,
  obtenerClientePorIdAPI,
  obtenerSucursalesClienteAPI,
  type ClienteAPI,
  type SucursalAPI,
} from '@/modulos/administracion/servicios/servicioClientes'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS, estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
import {
  MODALIDADES,
  formatearFecha,
  formatearKg,
  formatearMoneda,
} from '@/modulos/ventas/controladores/formatosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import type { LineaPedido, Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

// -----------------------------------------------------------------------------
// Constantes y configuración estática
// -----------------------------------------------------------------------------
const SIN_DATO = '—'
const ESTATUS_EN_PROCESO: readonly number[] = [ESTATUS.creado, ESTATUS.surtido, ESTATUS.enReparto]

const MENSAJES = {
  errorHistorial: 'No fue posible consultar el historial. Intente nuevamente.',
  rangoInvalido: 'La fecha inicial debe ser anterior a la fecha final.',
  sinPedidos: 'El cliente no tiene pedidos registrados.',
  errorSucursales: 'No fue posible consultar las sucursales. Intente nuevamente.',
  sinSucursales: 'No tiene sucursales registradas. Agregue una para recibir pedidos a domicilio.',
  clienteConPedidos: 'El cliente tiene pedidos en proceso. Puede darse de baja cuando se entreguen o se cancelen.',
  sucursalConPedidos: 'La sucursal tiene pedidos en proceso. Puede darse de baja cuando se entreguen o se cancelen.',
  errorGuardarCambios: 'No fue posible guardar los cambios. Intente nuevamente.',
  errorBajaCliente: 'No fue posible dar de baja al cliente. Intente nuevamente.',
  errorCrearSucursal: 'No fue posible registrar la sucursal. Intente nuevamente.',
  errorBajaSucursal: 'No fue posible dar de baja la sucursal. Intente nuevamente.',
  errorReactivarSucursal: 'No fue posible reactivar la sucursal. Intente nuevamente.',
  clienteActualizado: 'Cliente actualizado correctamente.',
  clienteDadoDeBaja: 'Cliente dado de baja correctamente.',
  sucursalActualizada: 'Sucursal actualizada correctamente.',
  sucursalDadaDeBaja: 'Sucursal dada de baja correctamente.',
  sucursalReactivada: 'Sucursal reactivada correctamente.',
} as const

const COLUMNAS_PEDIDOS: ColumnaTabla[] = [
  { clave: 'folio', etiqueta: 'Folio' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'sucursal', etiqueta: 'Sucursal y modalidad' },
  { clave: 'productos', etiqueta: 'Productos y cantidades' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'metodoPago', etiqueta: 'Forma de pago' },
  { clave: 'total', etiqueta: 'Importe', alineacion: 'derecha' },
]

// -----------------------------------------------------------------------------
// Enrutamiento, sesión y permisos
// -----------------------------------------------------------------------------
const route = useRoute()
const enrutador = useRouter()
const clienteId = Number(route.params.id)

const rolUsuario = obtenerRolUsuario()
const esAdministrador = rolUsuario === 'administrador'
const esCliente = rolUsuario === 'cliente'
const puedeEditarCliente = esAdministrador
const puedeAdministrarSucursales = esAdministrador || esCliente

const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()

// -----------------------------------------------------------------------------
// Estado reactivo
// -----------------------------------------------------------------------------
// Avisos emergentes
const mensajeAviso = ref('')
const varianteAviso = ref<'error' | 'exito'>('exito')

// Layout y alturas dinámicas de tablas
const contenedorPedidos = ref<HTMLElement | null>(null)
const altoSucursales = ref(150)
const altoPedidos = ref(240)

// Cliente (consulta, edición CU-17 y baja lógica CU-18)
const cliente = ref<ClienteAPI | null>(null)
const cargando = ref(true)
const errorCarga = ref('')

const mostrarModalCliente = ref(false)
const mostrarConfirmacionEdicion = ref(false)
const datosPendientesEdicion = ref<DatosFormularioCliente | null>(null)
const errorUsuarioApi = ref('')
const guardandoCliente = ref(false)

const mostrarConfirmacionBaja = ref(false)
const dandoDeBaja = ref(false)

// Sucursales (CU-19 a CU-22 y reactivación por administrador)
const sucursales = ref<SucursalAPI[]>([])
const cargandoSucursales = ref(true)
const errorSucursales = ref('')

const mostrarModalSucursal = ref(false)
const sucursalSeleccionada = ref<SucursalAPI | null>(null)
const errorNombreSucursalApi = ref('')
const guardandoSucursal = ref(false)

const mostrarModalConfirmacionSucursal = ref(false)
const sucursalACambiar = ref<SucursalAPI | null>(null)
const cambiandoEstatusSucursal = ref(false)

// Historial comercial de pedidos (CU-14 / RF-HIS-02)
const pedidos = ref<Pedido[]>([])
const cargandoHistorial = ref(true)
const errorHistorial = ref('')
const fechaDesde = ref('')
const fechaHasta = ref('')
const filtroDesde = ref('')
const filtroHasta = ref('')
const errorFechas = ref('')

// -----------------------------------------------------------------------------
// Propiedades computadas
// -----------------------------------------------------------------------------
// CU-20 / RF-SUC-02: columna Estado solo para personal; el cliente solo ve sus sucursales activas
const columnasSucursales = computed<ColumnaTabla[]>(() => {
  const columnas: ColumnaTabla[] = [
    { clave: 'nombre', etiqueta: 'NOMBRE' },
    { clave: 'direccion', etiqueta: 'DIRECCIÓN' },
    { clave: 'telefono', etiqueta: 'TELÉFONO' },
  ]
  if (!esCliente) columnas.push({ clave: 'estado', etiqueta: 'ESTADO' })
  if (puedeAdministrarSucursales) columnas.push({ clave: 'cambios', etiqueta: 'CAMBIOS', alineacion: 'centro' })
  return columnas
})

const sucursalesOrdenadas = computed(() =>
  [...sucursales.value].sort((a, b) =>
    a.NombreSucursal.localeCompare(b.NombreSucursal, 'es', { sensitivity: 'base' }),
  ),
)

const desactivandoSucursal = computed(() => sucursalACambiar.value?.Estatus === 1)

const hayFiltroFechas = computed(() => Boolean(fechaDesde.value || fechaHasta.value))

const pedidosFiltrados = computed(() =>
  pedidos.value.filter((ped) => {
    if (filtroDesde.value && (!ped.fechaRegistro || ped.fechaRegistro < filtroDesde.value)) {
      return false
    }
    if (filtroHasta.value && (!ped.fechaRegistro || ped.fechaRegistro > filtroHasta.value)) {
      return false
    }
    return true
  }),
)

const filasPedidos = computed(() =>
  pedidosFiltrados.value.map((ped) => ({
    id: ped.id,
    sucursal: obtenerNombreSucursal(ped.idSucursal),
    registrado: ped.fechaRegistro,
    fechaEntrega: ped.fechaEntrega,
    modalidad: modalidadDePedido(ped.idSucursal, leerObservaciones(ped.observaciones).modalidad),
    productos: formatearProductos(ped.lineas),
    estado: estadoDePedido(ped.estatus),
    metodoPago: textoMetodoPago(ped.metodoPago),
    total: ped.total,
    totalKg: ped.totalKg,
  })),
)

// -----------------------------------------------------------------------------
// Utilidades y helpers
// -----------------------------------------------------------------------------
async function avisar(texto: string, variante: 'error' | 'exito') {
  mensajeAviso.value = ''
  await nextTick()
  varianteAviso.value = variante
  mensajeAviso.value = texto
}

function obtenerNombreSucursal(idSucursal: number): string {
  if (esSucursalRecoleccion(idSucursal)) return MODALIDADES.recoleccion.titulo
  const sucursal = sucursales.value.find((s) => s.Id === idSucursal)
  return sucursal ? `Sucursal ${sucursal.NombreSucursal}` : `Sucursal #${idSucursal}`
}

function formatearProductos(lineas: LineaPedido[]): string[] {
  return lineas.map((linea) => `${linea.talla || 'Producto'} · ${formatearKg(linea.cantidadKg)}`)
}

function actualizarAlturas() {
  altoSucursales.value = window.innerHeight < 820 ? 125 : 150

  // Reserva espacio para el padding inferior de la tarjeta blanca y el pie de página
  const margenInferior = window.innerWidth <= 560 ? 96 : 112
  const top = contenedorPedidos.value?.getBoundingClientRect().top

  if (typeof top === 'number' && top > 0) {
    const disponible = Math.floor(window.innerHeight - top - margenInferior)
    altoPedidos.value = Math.max(190, disponible)
  } else {
    altoPedidos.value = window.innerHeight < 820 ? 190 : 250
  }
}

function abrirDetallePedido(id: number) {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

// -----------------------------------------------------------------------------
// Carga de datos (API)
// -----------------------------------------------------------------------------
async function cargarSucursales() {
  cargandoSucursales.value = true
  errorSucursales.value = ''
  try {
    sucursales.value = await obtenerSucursalesClienteAPI(clienteId, esAdministrador)
  } catch (err: unknown) {
    sucursales.value = []
    errorSucursales.value = err instanceof ErrorSucursales ? err.message : MENSAJES.errorSucursales
  } finally {
    cargandoSucursales.value = false
    await nextTick()
    actualizarAlturas()
  }
}

async function cargarHistorial() {
  cargandoHistorial.value = true
  errorHistorial.value = ''
  try {
    const lista = await obtenerPedidos(clienteId)
    pedidos.value = lista
      .filter((pedido) => pedido.idCliente === clienteId)
      .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id)
  } catch (err: unknown) {
    pedidos.value = []
    if (err instanceof ErrorPedidos && err.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    errorHistorial.value = MENSAJES.errorHistorial
  } finally {
    cargandoHistorial.value = false
    await nextTick()
    actualizarAlturas()
  }
}

async function cargarDatos() {
  if (!clienteId || Number.isNaN(clienteId)) {
    errorCarga.value = 'ID de cliente inválido.'
    cargando.value = false
    return
  }

  cargando.value = true
  errorCarga.value = ''

  const [resCliente] = await Promise.allSettled([
    obtenerClientePorIdAPI(clienteId),
    cargarSucursales(),
    cargarHistorial(),
  ])

  if (resCliente.status === 'fulfilled') {
    cliente.value = resCliente.value
  } else {
    cliente.value = null
    errorCarga.value = MENSAJES.errorHistorial
  }

  cargando.value = false
  await nextTick()
  actualizarAlturas()
}

// -----------------------------------------------------------------------------
// Filtros del historial comercial (CU-14 A2 y A3)
// -----------------------------------------------------------------------------
function aplicarFiltroFechas() {
  if (fechaDesde.value && fechaHasta.value && fechaDesde.value > fechaHasta.value) {
    errorFechas.value = MENSAJES.rangoInvalido
    return
  }
  errorFechas.value = ''
  filtroDesde.value = fechaDesde.value
  filtroHasta.value = fechaHasta.value
}

function limpiarFiltroFechas() {
  fechaDesde.value = ''
  fechaHasta.value = ''
  filtroDesde.value = ''
  filtroHasta.value = ''
  errorFechas.value = ''
}

// -----------------------------------------------------------------------------
// Acciones del cliente: edición (CU-17) y baja lógica (CU-18)
// -----------------------------------------------------------------------------
function abrirModalEditarCliente() {
  if (!puedeEditarCliente) return
  errorUsuarioApi.value = ''
  datosPendientesEdicion.value = null
  mostrarModalCliente.value = true
}

function guardarCliente(datos: DatosFormularioCliente) {
  if (!puedeEditarCliente) return
  errorUsuarioApi.value = ''
  datosPendientesEdicion.value = datos
  mostrarConfirmacionEdicion.value = true
}

function cancelarConfirmacionEdicion() {
  if (guardandoCliente.value) return
  mostrarConfirmacionEdicion.value = false
  datosPendientesEdicion.value = null
  errorUsuarioApi.value = ''
  mostrarModalCliente.value = false
}

async function confirmarEdicionCliente() {
  const datos = datosPendientesEdicion.value
  if (!puedeEditarCliente || !datos || guardandoCliente.value) return

  guardandoCliente.value = true
  errorUsuarioApi.value = ''
  try {
    await actualizarClienteAPI(clienteId, {
      usuario: datos.usuario,
      contrasena: datos.contrasena || null,
      nombre: datos.nombre,
      telefono: datos.celular,
      usuarioTelegram: datos.usuarioTelegram || null,
      estatus: datos.estatus,
    } as any)

    mostrarConfirmacionEdicion.value = false
    mostrarModalCliente.value = false
    datosPendientesEdicion.value = null
    await cargarDatos()
    await avisar(MENSAJES.clienteActualizado, 'exito')
  } catch (err: unknown) {
    mostrarConfirmacionEdicion.value = false
    if (err instanceof ErrorClientes && err.codigo === 'USUARIO_DUPLICADO') {
      errorUsuarioApi.value = err.message
      return
    }
    const mensaje = err instanceof ErrorClientes ? err.message : MENSAJES.errorGuardarCambios
    await avisar(mensaje, 'error')
  } finally {
    guardandoCliente.value = false
  }
}

async function solicitarBajaCliente() {
  if (!puedeEditarCliente || !cliente.value || cliente.value.Estatus !== 1 || dandoDeBaja.value) return

  dandoDeBaja.value = true
  try {
    const pedidosActuales = await obtenerPedidos(clienteId)
    const tieneEnProceso = pedidosActuales.some((p) => ESTATUS_EN_PROCESO.includes(p.estatus))
    if (tieneEnProceso) {
      await avisar(MENSAJES.clienteConPedidos, 'error')
      return
    }
    mostrarConfirmacionBaja.value = true
  } catch {
    await avisar(MENSAJES.errorBajaCliente, 'error')
  } finally {
    dandoDeBaja.value = false
  }
}

async function confirmarBajaCliente() {
  if (!puedeEditarCliente || !cliente.value || dandoDeBaja.value) return

  dandoDeBaja.value = true
  try {
    await eliminarClienteAPI(clienteId)
    mostrarConfirmacionBaja.value = false
    await cargarDatos()
    await avisar(MENSAJES.clienteDadoDeBaja, 'exito')
  } catch (err: unknown) {
    mostrarConfirmacionBaja.value = false
    const mensaje = err instanceof ErrorClientes ? err.message : MENSAJES.errorBajaCliente
    await avisar(mensaje, 'error')
  } finally {
    dandoDeBaja.value = false
  }
}

// -----------------------------------------------------------------------------
// Acciones de sucursales (CU-19 a CU-22 y reactivación)
// -----------------------------------------------------------------------------
function abrirModalCrearSucursal() {
  if (!puedeAdministrarSucursales || cliente.value?.Estatus !== 1) return
  sucursalSeleccionada.value = null
  errorNombreSucursalApi.value = ''
  mostrarModalSucursal.value = true
}

function abrirModalEditarSucursal(sucursal: SucursalAPI) {
  if (!puedeAdministrarSucursales) return
  sucursalSeleccionada.value = sucursal
  errorNombreSucursalApi.value = ''
  mostrarModalSucursal.value = true
}

async function guardarSucursal(datos: DatosFormularioSucursal) {
  if (!puedeAdministrarSucursales || guardandoSucursal.value) return

  const esEdicion = Boolean(sucursalSeleccionada.value)
  guardandoSucursal.value = true
  errorNombreSucursalApi.value = ''

  try {
    const payload = {
      idCliente: clienteId,
      NombreSucursal: datos.nombreSucursal,
      Direccion: datos.direccion,
      Telefono: datos.telefono,
      Referencias: datos.referencias || null,
    }

    if (sucursalSeleccionada.value) {
      await actualizarSucursalClienteAPI(sucursalSeleccionada.value.Id, {
        ...payload,
        Estatus: sucursalSeleccionada.value.Estatus,
      })
    } else {
      await crearSucursalClienteAPI(payload)
    }

    mostrarModalSucursal.value = false
    await cargarSucursales()
    await avisar(
      esEdicion
        ? MENSAJES.sucursalActualizada
        : `Sucursal ${datos.nombreSucursal} registrada correctamente.`,
      'exito',
    )
  } catch (err: unknown) {
    if (err instanceof ErrorSucursales && err.codigo === 'NOMBRE_DUPLICADO') {
      errorNombreSucursalApi.value = err.message
      return
    }
    const mensajeDefecto = esEdicion ? MENSAJES.errorGuardarCambios : MENSAJES.errorCrearSucursal
    const mensaje = err instanceof ErrorSucursales ? err.message : mensajeDefecto
    await avisar(mensaje, 'error')
  } finally {
    guardandoSucursal.value = false
  }
}

async function solicitarCambioEstatusSucursal(sucursal: SucursalAPI) {
  if (cambiandoEstatusSucursal.value) return

  const esBaja = sucursal.Estatus === 1
  if (esBaja && !puedeAdministrarSucursales) return
  if (!esBaja && !esAdministrador) return

  // CU-22 paso 4 y A1: verificar pedidos en proceso antes de pedir confirmación de baja
  if (esBaja) {
    cambiandoEstatusSucursal.value = true
    try {
      const pedidosActuales = await obtenerPedidos(clienteId)
      const tieneEnProceso = pedidosActuales.some(
        (p) => p.idSucursal === sucursal.Id && ESTATUS_EN_PROCESO.includes(p.estatus),
      )
      if (tieneEnProceso) {
        await avisar(MENSAJES.sucursalConPedidos, 'error')
        return
      }
    } catch {
      await avisar(MENSAJES.errorBajaSucursal, 'error')
      return
    } finally {
      cambiandoEstatusSucursal.value = false
    }
  }

  sucursalACambiar.value = sucursal
  mostrarModalConfirmacionSucursal.value = true
}

async function confirmarCambioEstatusSucursal() {
  const sucursal = sucursalACambiar.value
  if (!sucursal || cambiandoEstatusSucursal.value) return

  const esBaja = desactivandoSucursal.value
  if (esBaja && !puedeAdministrarSucursales) return
  if (!esBaja && !esAdministrador) return

  cambiandoEstatusSucursal.value = true
  try {
    if (esBaja) {
      await eliminarSucursalClienteAPI(sucursal.Id)
    } else {
      await actualizarSucursalClienteAPI(sucursal.Id, {
        idCliente: clienteId,
        NombreSucursal: sucursal.NombreSucursal,
        Direccion: sucursal.Direccion,
        Telefono: sucursal.Telefono,
        Referencias: sucursal.Referencias ?? null,
        Estatus: 1,
      })
    }

    mostrarModalConfirmacionSucursal.value = false
    sucursalACambiar.value = null
    await cargarSucursales()
    await avisar(esBaja ? MENSAJES.sucursalDadaDeBaja : MENSAJES.sucursalReactivada, 'exito')
  } catch (err: unknown) {
    mostrarModalConfirmacionSucursal.value = false
    const mensajeDefecto = esBaja ? MENSAJES.errorBajaSucursal : MENSAJES.errorReactivarSucursal
    const mensaje = err instanceof ErrorSucursales ? err.message : mensajeDefecto
    await avisar(mensaje, 'error')
  } finally {
    cambiandoEstatusSucursal.value = false
  }
}

// -----------------------------------------------------------------------------
// Observadores y ciclo de vida
// -----------------------------------------------------------------------------
watch([errorFechas, () => sucursales.value.length, () => filasPedidos.value.length], async () => {
  await nextTick()
  actualizarAlturas()
})

onMounted(async () => {
  await nextTick()
  actualizarAlturas()
  window.addEventListener('resize', actualizarAlturas)
  cargarDatos()
})

onUnmounted(() => {
  window.removeEventListener('resize', actualizarAlturas)
})
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    :item-activo="esCliente ? '' : 'Clientes'"
  >
    <div class="panel">
      <!-- Encabezado y navegación de regreso -->
      <div class="panel__bienvenida">
        <div>
          <div class="panel__encabezado-volver">
            <RouterLink :to="esCliente ? '/panel' : '/clientes'" class="btn-volver" aria-label="Volver a clientes">
              <IconoVue nombre="flecha-izquierda" :tamano="20" />
            </RouterLink>
            <h1 class="panel__titulo">Detalle del Cliente</h1>
          </div>
          <p class="panel__subtitulo">Monitorea el historial comercial de pedidos y las sucursales de este cliente.</p>
        </div>
      </div>

      <div v-if="cargando" class="panel__estado-carga" role="status">Cargando información del cliente...</div>

      <div v-else-if="errorCarga" class="panel__estado-error" role="alert">
        <p>{{ errorCarga }}</p>
        <div class="panel__reintentar">
          <BotonVue variante="secundario" compacto @click="cargarDatos">Reintentar</BotonVue>
        </div>
      </div>

      <template v-else-if="cliente">
        <!-- Tarjeta de datos del cliente -->
        <div class="tarjeta-cliente">
          <div class="tarjeta-cliente__encabezado">
            <h2 class="tarjeta-cliente__nombre">{{ cliente.Nombre }}</h2>
            <div v-if="puedeEditarCliente" class="tarjeta-cliente__acciones">
              <button
                type="button"
                class="btn-accion btn-accion--editar"
                aria-label="Editar cliente"
                title="Editar cliente"
                @click="abrirModalEditarCliente"
              >
                <IconoVue nombre="lapiz" :tamano="16" />
              </button>
              <button
                v-if="cliente.Estatus === 1"
                type="button"
                class="btn-accion btn-accion--eliminar"
                aria-label="Dar de baja cliente"
                title="Dar de baja cliente"
                @click="solicitarBajaCliente"
              >
                <IconoVue nombre="candado" :tamano="16" />
              </button>
            </div>
          </div>

          <div class="tarjeta-cliente__tabla-wrap">
            <table class="tarjeta-cliente__tabla">
              <thead>
                <tr>
                  <th>USUARIO</th>
                  <th>TELÉFONO</th>
                  <th>TELEGRAM</th>
                  <th>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="panel__texto-fuerte">{{ cliente.Usuario }}</td>
                  <td class="panel__texto-fuerte">{{ cliente.Telefono || 'N/A' }}</td>
                  <td class="panel__texto-fuerte">{{ cliente.UsuarioTelegram || 'N/A' }}</td>
                  <td>
                    <ChipEstadoVue
                      :estado="cliente.Estatus === 1 ? 'entregado' : 'en_preparacion'"
                      :etiqueta="cliente.Estatus === 1 ? 'Activo' : 'Inactivo'"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sección de sucursales (CU-19 a CU-22) -->
        <section class="panel__seccion">
          <EncabezadoSeccionVue titulo="Sucursales" icono="usuario">
            <BotonVue
              v-if="puedeAdministrarSucursales"
              variante="exito"
              compacto
              :deshabilitado="cliente.Estatus !== 1"
              @click="abrirModalCrearSucursal"
            >
              <IconoVue nombre="mas" :tamano="16" />
              Nueva Sucursal
            </BotonVue>
          </EncabezadoSeccionVue>

          <div v-if="cargandoSucursales" class="panel__estado-carga" role="status">
            Cargando sucursales...
          </div>

          <div v-else-if="errorSucursales" class="panel__estado-error" role="alert">
            <p>{{ errorSucursales }}</p>
            <div class="panel__reintentar">
              <BotonVue variante="secundario" compacto @click="cargarSucursales">Reintentar</BotonVue>
            </div>
          </div>

          <div v-else-if="sucursalesOrdenadas.length > 0" class="tabla-encabezado-fijo">
            <TablaVue :columnas="columnasSucursales" :alto-maximo="altoSucursales">
              <tr v-for="suc in sucursalesOrdenadas" :key="suc.Id">
                <td class="panel__texto-nombre">{{ suc.NombreSucursal }}</td>
                <td>
                  <p class="panel__texto-nombre">{{ suc.Direccion }}</p>
                  <p v-if="suc.Referencias" class="panel__detalle">Ref.: {{ suc.Referencias }}</p>
                </td>
                <td class="panel__texto-fuerte">{{ suc.Telefono || 'N/A' }}</td>
                <td v-if="!esCliente">
                  <ChipEstadoVue
                    :estado="suc.Estatus === 1 ? 'entregado' : 'en_preparacion'"
                    :etiqueta="suc.Estatus === 1 ? 'Activa' : 'Inactiva'"
                  />
                </td>
                <td v-if="puedeAdministrarSucursales" class="tabla__celda--centro">
                  <div class="panel__acciones-fila">
                    <button
                      type="button"
                      class="btn-accion btn-accion--editar"
                      aria-label="Editar sucursal"
                      title="Editar sucursal"
                      @click="abrirModalEditarSucursal(suc)"
                    >
                      <IconoVue nombre="lapiz" :tamano="16" />
                    </button>
                    <button
                      v-if="suc.Estatus === 1"
                      type="button"
                      class="btn-accion btn-accion--eliminar"
                      aria-label="Dar de baja sucursal"
                      title="Dar de baja sucursal"
                      @click="solicitarCambioEstatusSucursal(suc)"
                    >
                      <IconoVue nombre="basura" :tamano="16" />
                    </button>
                    <button
                      v-else-if="esAdministrador"
                      type="button"
                      class="btn-accion btn-accion--editar"
                      aria-label="Reactivar sucursal"
                      title="Reactivar sucursal"
                      @click="solicitarCambioEstatusSucursal(suc)"
                    >
                      <IconoVue nombre="check" :tamano="16" />
                    </button>
                  </div>
                </td>
              </tr>
            </TablaVue>
          </div>

          <div v-else class="panel__estado-vacio">
            <p>{{ MENSAJES.sinSucursales }}</p>
            <div v-if="puedeAdministrarSucursales && cliente.Estatus === 1" class="panel__reintentar">
              <BotonVue variante="exito" compacto @click="abrirModalCrearSucursal">
                <IconoVue nombre="mas" :tamano="16" />
                Registrar sucursal
              </BotonVue>
            </div>
          </div>
        </section>

        <!-- Sección de historial comercial de pedidos (CU-14 / RF-HIS-02) -->
        <section class="panel__seccion">
          <div class="historial__cabecera">
            <EncabezadoSeccionVue titulo="Historial de Pedidos" icono="reloj" />

            <!-- Filtro por rango de fechas en línea (A2 y A3) -->
            <div v-if="!cargandoHistorial && !errorHistorial && pedidos.length > 0" class="filtros-historial__campos">
              <label class="filtro-fecha" for="historial-fecha-desde">
                <span>Desde</span>
                <input
                  id="historial-fecha-desde"
                  v-model="fechaDesde"
                  type="date"
                  class="filtro-fecha__entrada"
                  :aria-invalid="!!errorFechas || undefined"
                  @change="aplicarFiltroFechas"
                />
              </label>

              <label class="filtro-fecha" for="historial-fecha-hasta">
                <span>Hasta</span>
                <input
                  id="historial-fecha-hasta"
                  v-model="fechaHasta"
                  type="date"
                  class="filtro-fecha__entrada"
                  :aria-invalid="!!errorFechas || undefined"
                  @change="aplicarFiltroFechas"
                />
              </label>

              <div v-if="hayFiltroFechas" class="filtros-historial__limpiar">
                <BotonVue variante="secundario" compacto @click="limpiarFiltroFechas">
                  Limpiar fechas
                </BotonVue>
              </div>
            </div>
          </div>

          <p v-if="errorFechas" class="filtros-historial__error" role="alert">
            {{ errorFechas }}
          </p>

          <div ref="contenedorPedidos" class="tabla-encabezado-fijo">
            <div v-if="cargandoHistorial" class="panel__estado-carga" role="status">
              Cargando historial de pedidos...
            </div>

            <!-- E1. Error de consulta -->
            <div v-else-if="errorHistorial" class="panel__estado-error" role="alert">
              <p>{{ errorHistorial }}</p>
              <div class="panel__reintentar">
                <BotonVue variante="secundario" compacto @click="cargarHistorial">Reintentar</BotonVue>
              </div>
            </div>

            <!-- A1. Cliente sin pedidos -->
            <div v-else-if="pedidos.length === 0" class="panel__estado-vacio">
              <p>{{ MENSAJES.sinPedidos }}</p>
            </div>

            <!-- Rango sin coincidencias -->
            <div v-else-if="filasPedidos.length === 0" class="panel__estado-vacio">
              <p>No se encontraron pedidos en el rango de fechas seleccionado.</p>
            </div>

            <TablaVue v-else :columnas="COLUMNAS_PEDIDOS" :alto-maximo="altoPedidos">
              <tr
                v-for="fila in filasPedidos"
                :key="fila.id"
                class="fila-clicable"
                @click="abrirDetallePedido(fila.id)"
              >
                <td class="panel__id">
                  <RouterLink
                    :to="{ name: 'detalle-pedido', params: { id: fila.id } }"
                    class="panel__folio"
                    @click.stop
                  >
                    #{{ fila.id }}
                  </RouterLink>
                </td>
                <td>
                  <p class="panel__texto-nombre">{{ formatearFecha(fila.registrado) || SIN_DATO }}</p>
                  <p v-if="fila.fechaEntrega" class="panel__detalle">
                    Entrega: {{ formatearFecha(fila.fechaEntrega) }}
                  </p>
                </td>
                <td>
                  <p class="panel__texto-nombre">{{ fila.sucursal }}</p>
                  <p v-if="fila.modalidad" class="panel__detalle panel__modalidad">
                    <IconoVue :nombre="MODALIDADES[fila.modalidad].icono" :tamano="14" />
                    {{ MODALIDADES[fila.modalidad].etiquetaCorta }}
                  </p>
                </td>
                <td>
                  <ul v-if="fila.productos.length > 0" class="lista-productos">
                    <li v-for="(prod, indice) in fila.productos" :key="indice">{{ prod }}</li>
                  </ul>
                  <span v-else class="panel__detalle">{{ formatearKg(fila.totalKg) }}</span>
                </td>
                <td>
                  <ChipEstadoVue :estado="fila.estado.chip" :etiqueta="fila.estado.etiqueta" />
                </td>
                <td>{{ fila.metodoPago ?? SIN_DATO }}</td>
                <td class="tabla__celda--derecha">
                  <p class="panel__total">{{ formatearMoneda(fila.total) }}</p>
                  <p class="panel__detalle">{{ formatearKg(fila.totalKg) }}</p>
                </td>
              </tr>
            </TablaVue>
          </div>
        </section>
      </template>
    </div>
  </LayoutPanelVue>

  <!-- Modales del cliente (CU-17 y CU-18) -->
  <ModalNuevoCliente
    v-if="puedeEditarCliente"
    :mostrar="mostrarModalCliente"
    :cliente-editar="cliente"
    :error-usuario-api="errorUsuarioApi"
    :enviando="guardandoCliente"
    @cerrar="mostrarModalCliente = false"
    @limpiar-error-usuario="errorUsuarioApi = ''"
    @guardar="guardarCliente"
  />

  <ModalConfirmacion
    v-if="puedeEditarCliente"
    :mostrar="mostrarConfirmacionEdicion"
    titulo="Confirmar cambios"
    :mensaje="`¿Confirma los cambios del cliente ${datosPendientesEdicion?.nombre ?? ''}?`"
    texto-boton-confirmar="Guardar cambios"
    icono="check"
    variante-confirmar="primario"
    @cerrar="cancelarConfirmacionEdicion"
    @confirmar="confirmarEdicionCliente"
  />

  <ModalConfirmacion
    v-if="puedeEditarCliente"
    :mostrar="mostrarConfirmacionBaja"
    titulo="Confirmar baja del cliente"
    :mensaje="`¿Confirma la baja del cliente ${cliente?.Nombre ?? ''}? Ya no puede iniciar sesión.`"
    texto-boton-confirmar="Dar de baja"
    icono="candado"
    variante-confirmar="peligro"
    @cerrar="mostrarConfirmacionBaja = false"
    @confirmar="confirmarBajaCliente"
  />

  <!-- Modales de sucursales (CU-19 a CU-22 y reactivación) -->
  <ModalNuevaSucursal
    v-if="puedeAdministrarSucursales"
    :mostrar="mostrarModalSucursal"
    :sucursal-editar="sucursalSeleccionada"
    :error-nombre-api="errorNombreSucursalApi"
    :enviando="guardandoSucursal"
    @cerrar="mostrarModalSucursal = false"
    @limpiar-error-nombre="errorNombreSucursalApi = ''"
    @guardar="guardarSucursal"
  />

  <ModalConfirmacion
    v-if="puedeAdministrarSucursales"
    :mostrar="mostrarModalConfirmacionSucursal"
    :titulo="desactivandoSucursal ? 'Confirmar baja de sucursal' : 'Confirmar reactivación de sucursal'"
    :mensaje="
      desactivandoSucursal
        ? `¿Confirma la baja de la sucursal ${sucursalACambiar?.NombreSucursal ?? ''}?`
        : `¿Confirma reactivar la sucursal ${sucursalACambiar?.NombreSucursal ?? ''}? Volverá a estar disponible para pedidos a domicilio.`
    "
    :texto-boton-confirmar="desactivandoSucursal ? 'Dar de baja' : 'Reactivar'"
    :icono="desactivandoSucursal ? 'candado' : 'check'"
    :variante-confirmar="desactivandoSucursal ? 'peligro' : 'primario'"
    @cerrar="mostrarModalConfirmacionSucursal = false"
    @confirmar="confirmarCambioEstatusSucursal"
  />

  <AvisoVue v-model="mensajeAviso" :variante="varianteAviso" />
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel__seccion {
  display: flex;
  flex-direction: column;
}

.panel__encabezado-volver {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-volver {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gf-texto);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.btn-volver:hover {
  opacity: 0.7;
}

.panel__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 22px;
  font-weight: 700;
}

.panel__subtitulo {
  margin: 2px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.panel__estado-carga,
.panel__estado-error,
.panel__estado-vacio {
  padding: 20px;
  text-align: center;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
  font-size: 14px;
}

.panel__estado-error {
  color: var(--gf-cancelado-fg);
  border-color: var(--gf-cancelado-punto);
}

.panel__estado-error p,
.panel__estado-vacio p {
  margin: 0;
}

.panel__reintentar {
  display: inline-flex;
  margin-top: 12px;
}

.panel__estado-vacio {
  color: var(--gf-texto-tenue);
  border-style: dashed;
}

.tarjeta-cliente {
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
  padding: 14px 18px;
}

.tarjeta-cliente__encabezado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.tarjeta-cliente__nombre {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--gf-texto);
}

.tarjeta-cliente__acciones {
  display: flex;
  gap: 8px;
}

.tarjeta-cliente__tabla-wrap {
  overflow-x: auto;
}

.tarjeta-cliente__tabla {
  width: 100%;
  border-collapse: collapse;
}

.tarjeta-cliente__tabla th {
  padding: 6px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--gf-texto-tenue);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--gf-fondo);
}

.tarjeta-cliente__tabla td {
  padding: 8px 10px;
  vertical-align: middle;
}

/* Cabecera del historial con fechas en la misma fila para ahorrar altura */
.historial__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.historial__cabecera :deep(> :first-child) {
  margin-bottom: 0;
}

.filtros-historial__campos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filtro-fecha {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
  font-weight: 600;
}

.filtro-fecha__entrada {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 13px;
}

.filtro-fecha__entrada:focus {
  border-color: var(--gf-secundario);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 20%, transparent);
}

.filtro-fecha__entrada[aria-invalid='true'] {
  border-color: var(--gf-cancelado-punto);
}

.filtros-historial__limpiar {
  flex: none;
}

.filtros-historial__error {
  margin: 0 0 8px;
  color: var(--gf-cancelado-punto);
  font-size: 13px;
  font-weight: 500;
}

/* Mantiene fijos los encabezados de columna al scrollear dentro de TablaVue */
.tabla-encabezado-fijo :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--gf-fondo);
}

.lista-productos {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gf-texto);
}

.panel__id {
  font-weight: 700;
  color: var(--gf-texto);
}

.panel__folio {
  color: var(--gf-primario);
  font-weight: 700;
  text-decoration: none;
}

.panel__folio:hover {
  text-decoration: underline;
}

.panel__texto-fuerte {
  font-weight: 700;
  color: var(--gf-texto);
}

.panel__texto-nombre {
  margin: 0;
  font-weight: 600;
  color: var(--gf-texto);
}

.panel__modalidad {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.panel__total {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.panel__detalle {
  margin: 2px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.panel__acciones-fila {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-accion {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.btn-accion--editar {
  background: var(--gf-borde);
  color: var(--gf-texto-tenue);
}

.btn-accion--editar:hover {
  background: color-mix(in srgb, var(--gf-borde) 80%, var(--gf-texto));
}

.btn-accion--eliminar {
  background: var(--gf-cancelado-bg);
  color: var(--gf-cancelado-fg);
}

.btn-accion--eliminar:hover {
  background: color-mix(in srgb, var(--gf-cancelado-bg) 80%, var(--gf-cancelado-fg));
}

.fila-clicable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.fila-clicable:hover {
  background-color: var(--gf-fondo);
}

@media (max-width: 900px) {
  .panel__titulo {
    font-size: 19px;
  }
}

@media (max-width: 640px) {
  .historial__cabecera {
    flex-direction: column;
    align-items: stretch;
  }

  .filtro-fecha {
    flex: 1;
    justify-content: space-between;
  }
}
</style>