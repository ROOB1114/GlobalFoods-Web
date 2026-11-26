<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import ModalConfirmacion from '@/componentes/ModalConfirmacion.vue'
import ModalNuevaSucursal from '@/componentes/ModalNuevaSucursal.vue'
import ModalNuevoCliente from '@/componentes/ModalNuevoCliente.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {
  actualizarClienteAPI,
  actualizarSucursalClienteAPI,
  crearSucursalClienteAPI,
  eliminarSucursalClienteAPI,
  obtenerClientePorIdAPI,
  obtenerSucursalesClienteAPI,
  type ClienteAPI,
} from '@/modulos/administracion/servicios/servicioClientes'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
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

const MENSAJE_ERROR_HISTORIAL = 'No fue posible consultar el historial. Intente nuevamente.'
const MENSAJE_RANGO_INVALIDO = 'La fecha inicial debe ser anterior a la fecha final.'
const MENSAJE_SIN_PEDIDOS = 'El cliente no tiene pedidos registrados.'

const route = useRoute()
const enrutador = useRouter()
const clienteId = Number(route.params.id)
const rolUsuario = obtenerRolUsuario()
const esCliente = rolUsuario === 'cliente'
const nombreUsuario = ref(obtenerNombreUsuario() || 'Usuario')
const itemsNavegacion = obtenerMenuNavegacion()
const SIN_DATO = '—'

const cliente = ref<ClienteAPI | null>(null)
const sucursales = ref<any[]>([])
const pedidos = ref<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref('')

// Estados específicos del historial comercial (CU-14 / RF-HIS-02)
const cargandoHistorial = ref(true)
const errorHistorial = ref('')
const fechaDesde = ref('')
const fechaHasta = ref('')
const filtroDesde = ref('')
const filtroHasta = ref('')
const errorFechas = ref('')

// Alturas dinámicas para mantener el cuadro blanco y el pie de página visibles sin scroll general
const contenedorPedidos = ref<HTMLElement | null>(null)
const altoSucursales = ref(150)
const altoPedidos = ref(240)

// Estado para el modal de editar cliente
const mostrarModalCliente = ref(false)

// Estados de modales para Sucursales
const mostrarModalSucursal = ref(false)
const sucursalSeleccionada = ref<any | null>(null)
const mostrarModalConfirmacionSucursal = ref(false)
const sucursalAEliminar = ref<any | null>(null)

// Columnas
const columnasSucursales: ColumnaTabla[] = [
  { clave: 'nombre', etiqueta: 'NOMBRE' },
  { clave: 'direccion', etiqueta: 'DIRECCIÓN' },
  { clave: 'telefono', etiqueta: 'TELÉFONO' },
  { clave: 'estado', etiqueta: 'ESTADO' },
  { clave: 'cambios', etiqueta: 'CAMBIOS', alineacion: 'centro' },
]

const columnasPedidos: ColumnaTabla[] = [
  { clave: 'folio', etiqueta: 'Folio' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'sucursal', etiqueta: 'Sucursal y modalidad' },
  { clave: 'productos', etiqueta: 'Productos y cantidades' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'metodoPago', etiqueta: 'Forma de pago' },
  { clave: 'total', etiqueta: 'Importe', alineacion: 'derecha' },
]

const obtenerNombreSucursal = (idSucursal: number) => {
  if (esSucursalRecoleccion(idSucursal)) return MODALIDADES.recoleccion.titulo
  const sucursal = sucursales.value.find((s) => s.Id === idSucursal)
  return sucursal ? `Sucursal ${sucursal.NombreSucursal}` : `Sucursal #${idSucursal}`
}

const formatearProductos = (lineas: LineaPedido[]): string[] =>
  lineas.map((linea) => `${linea.talla || 'Producto'} · ${formatearKg(linea.cantidadKg)}`)

const hayFiltroFechas = computed(() => Boolean(fechaDesde.value || fechaHasta.value))

// A2 y A3: valida el rango antes de aplicar el filtro; si es inválido, bloquea el cambio.
const aplicarFiltroFechas = () => {
  if (fechaDesde.value && fechaHasta.value && fechaDesde.value > fechaHasta.value) {
    errorFechas.value = MENSAJE_RANGO_INVALIDO
    return
  }
  errorFechas.value = ''
  filtroDesde.value = fechaDesde.value
  filtroHasta.value = fechaHasta.value
}

const limpiarFiltroFechas = () => {
  fechaDesde.value = ''
  fechaHasta.value = ''
  filtroDesde.value = ''
  filtroHasta.value = ''
  errorFechas.value = ''
}

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

const actualizarAlturas = () => {
  altoSucursales.value = window.innerHeight < 820 ? 125 : 150

  // Reserva espacio para el padding inferior de la tarjeta blanca + pie de página azul.
  const margenInferior = window.innerWidth <= 560 ? 96 : 112
  const top = contenedorPedidos.value?.getBoundingClientRect().top

  if (typeof top === 'number' && top > 0) {
    const disponible = Math.floor(window.innerHeight - top - margenInferior)
    altoPedidos.value = Math.max(190, disponible)
  } else {
    altoPedidos.value = window.innerHeight < 820 ? 190 : 250
  }
}

const abrirDetallePedido = (id: number) => {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

const cargarHistorial = async () => {
  cargandoHistorial.value = true
  errorHistorial.value = ''
  try {
    const lista = await obtenerPedidos(clienteId)
    pedidos.value = lista
      .filter((pedido) => pedido.idCliente === clienteId)
      .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id)
  } catch (err: any) {
    pedidos.value = []
    if (err instanceof ErrorPedidos && err.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    errorHistorial.value = MENSAJE_ERROR_HISTORIAL
  } finally {
    cargandoHistorial.value = false
    await nextTick()
    actualizarAlturas()
  }
}

const cargarDatos = async () => {
  if (!clienteId || isNaN(clienteId)) {
    errorCarga.value = 'ID de cliente inválido.'
    cargando.value = false
    return
  }
  cargando.value = true
  errorCarga.value = ''

  const [resCliente, resSucursales] = await Promise.allSettled([
    obtenerClientePorIdAPI(clienteId),
    obtenerSucursalesClienteAPI(clienteId),
    cargarHistorial(),
  ])

  if (resCliente.status === 'fulfilled') {
    cliente.value = resCliente.value
    sucursales.value = resSucursales.status === 'fulfilled' ? resSucursales.value : []
  } else {
    cliente.value = null
    errorCarga.value = MENSAJE_ERROR_HISTORIAL
  }

  cargando.value = false
  await nextTick()
  actualizarAlturas()
}

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

// -------- Lógica de Edición del Cliente --------
const abrirModalEditarCliente = () => {
  mostrarModalCliente.value = true
}

const guardarCliente = async (datos: {
  nombre: string
  celular: string
  usuario: string
  usuarioTelegram: string
  contrasena: string
}) => {
  try {
    const payload = {
      usuario: datos.usuario,
      contrasena: datos.contrasena,
      nombre: datos.nombre,
      telefono: datos.celular,
      usuarioTelegram: datos.usuarioTelegram || null,
      estatus: cliente.value?.Estatus ?? 1,
    }

    await actualizarClienteAPI(clienteId, payload as any)
    if (esCliente && datos.nombre) {
      localStorage.setItem('nombreUsuario', datos.nombre)
      nombreUsuario.value = datos.nombre
    }
    mostrarModalCliente.value = false
    await cargarDatos()
  } catch (err: any) {
    alert(err.message || 'Error al guardar el cliente')
  }
}

// -------- Lógica del CRUD de Sucursales --------
const abrirModalCrearSucursal = () => {
  sucursalSeleccionada.value = null
  mostrarModalSucursal.value = true
}

const abrirModalEditarSucursal = (sucursal: any) => {
  sucursalSeleccionada.value = sucursal
  mostrarModalSucursal.value = true
}

const solicitarEliminarSucursal = (sucursal: any) => {
  sucursalAEliminar.value = sucursal
  mostrarModalConfirmacionSucursal.value = true
}

const guardarSucursal = async (datos: { nombreSucursal: string; direccion: string; telefono: string }) => {
  try {
    const payload = {
      idCliente: clienteId,
      NombreSucursal: datos.nombreSucursal,
      Direccion: datos.direccion,
      Telefono: datos.telefono,
      Estatus: 1,
    }

    if (sucursalSeleccionada.value) {
      await actualizarSucursalClienteAPI(sucursalSeleccionada.value.Id, payload)
    } else {
      await crearSucursalClienteAPI(payload)
    }
    mostrarModalSucursal.value = false
    await cargarDatos()
  } catch (err: any) {
    alert(err.message || 'Error al guardar la sucursal')
  }
}

const confirmarEliminacionSucursal = async () => {
  if (!sucursalAEliminar.value) return
  try {
    await eliminarSucursalClienteAPI(sucursalAEliminar.value.Id)
    mostrarModalConfirmacionSucursal.value = false
    sucursalAEliminar.value = null
    await cargarDatos()
  } catch (err: any) {
    alert(err.message || 'Error al eliminar la sucursal')
  }
}
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    :item-activo="esCliente ? '' : 'Clientes'"
  >
    <div class="panel">
      <!-- Encabezado y volver -->
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
        <!-- Tarjeta del cliente -->
        <div class="tarjeta-cliente">
          <div class="tarjeta-cliente__encabezado">
            <h2 class="tarjeta-cliente__nombre">{{ cliente.Nombre }}</h2>
            <div class="tarjeta-cliente__acciones">
              <button
                type="button"
                class="btn-accion btn-accion--editar"
                aria-label="Editar cliente"
                @click="abrirModalEditarCliente"
              >
                <IconoVue nombre="lapiz" :tamano="16" />
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

        <!-- SECCIÓN SUCURSALES -->
        <section class="panel__seccion">
          <EncabezadoSeccionVue titulo="Sucursales" icono="usuario">
            <BotonVue variante="exito" compacto @click="abrirModalCrearSucursal">
              <IconoVue nombre="mas" :tamano="16" />
              Nueva Sucursal
            </BotonVue>
          </EncabezadoSeccionVue>

          <div v-if="sucursales.length > 0" class="tabla-encabezado-fijo">
            <TablaVue :columnas="columnasSucursales" :alto-maximo="altoSucursales">
              <tr v-for="suc in sucursales" :key="suc.Id">
                <td class="panel__texto-nombre">{{ suc.NombreSucursal }}</td>
                <td>{{ suc.Direccion }}</td>
                <td class="panel__texto-fuerte">{{ suc.Telefono || 'N/A' }}</td>
                <td>
                  <ChipEstadoVue
                    :estado="suc.Estatus === 1 ? 'entregado' : 'en_preparacion'"
                    :etiqueta="suc.Estatus === 1 ? 'Activa' : 'Inactiva'"
                  />
                </td>
                <td class="tabla__celda--centro">
                  <div class="panel__acciones-fila">
                    <button type="button" class="btn-accion btn-accion--editar" @click="abrirModalEditarSucursal(suc)">
                      <IconoVue nombre="lapiz" :tamano="16" />
                    </button>
                    <button
                      type="button"
                      class="btn-accion btn-accion--eliminar"
                      @click="solicitarEliminarSucursal(suc)"
                    >
                      <IconoVue nombre="basura" :tamano="16" />
                    </button>
                  </div>
                </td>
              </tr>
            </TablaVue>
          </div>
          <div v-else class="panel__estado-vacio">
            Este cliente no tiene sucursales registradas.
          </div>
        </section>

        <!-- SECCIÓN HISTORIAL COMERCIAL DE PEDIDOS (CU-14 / RF-HIS-02) -->
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
              {{ MENSAJE_SIN_PEDIDOS }}
            </div>

            <!-- Rango sin coincidencias -->
            <div v-else-if="filasPedidos.length === 0" class="panel__estado-vacio">
              No se encontraron pedidos en el rango de fechas seleccionado.
            </div>

            <TablaVue v-else :columnas="columnasPedidos" :alto-maximo="altoPedidos">
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

  <!-- Modal Editar Cliente -->
  <ModalNuevoCliente
    :mostrar="mostrarModalCliente"
    :cliente-editar="cliente"
    @cerrar="mostrarModalCliente = false"
    @guardar="guardarCliente"
  />

  <!-- Modales Sucursales -->
  <ModalNuevaSucursal
    :mostrar="mostrarModalSucursal"
    :sucursal-editar="sucursalSeleccionada"
    @cerrar="mostrarModalSucursal = false"
    @guardar="guardarSucursal"
  />

  <ModalConfirmacion
    :mostrar="mostrarModalConfirmacionSucursal"
    titulo="¿Eliminar sucursal?"
    :mensaje="`¿Estás seguro de que deseas eliminar la sucursal '${sucursalAEliminar?.NombreSucursal}'?`"
    texto-boton-confirmar="Eliminar"
    @cerrar="mostrarModalConfirmacionSucursal = false"
    @confirmar="confirmarEliminacionSucursal"
  />
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

.panel__estado-error p {
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