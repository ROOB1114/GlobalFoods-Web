<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { actualizarClienteAPI, actualizarSucursalClienteAPI, crearSucursalClienteAPI, eliminarSucursalClienteAPI, 
obtenerClientePorIdAPI, obtenerSucursalesClienteAPI,
 type ClienteAPI,
} from '@/modulos/administracion/servicios/servicioClientes'
import { obtenerMenuNavegacion, obtenerNombreUsuario,
  obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
import { MODALIDADES, formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const route = useRoute()
const enrutador = useRouter()
const clienteId = Number(route.params.id)
const esCliente = obtenerRolUsuario() === 'cliente'
const nombreUsuario = ref(obtenerNombreUsuario() || 'Usuario')
const itemsNavegacion = obtenerMenuNavegacion()
const SIN_DATO = '—'

const cliente = ref<ClienteAPI | null>(null)
const sucursales = ref<any[]>([])
const pedidos = ref<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref('')

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
  { clave: 'sucursal', etiqueta: 'Sucursal' },
  { clave: 'registrado', etiqueta: 'Registrado' },
  { clave: 'entrega', etiqueta: 'Entrega' },
  { clave: 'modalidad', etiqueta: 'Modalidad' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'metodoPago', etiqueta: 'Método de pago' },
  { clave: 'total', etiqueta: 'Total', alineacion: 'derecha' },
]

const obtenerNombreSucursal = (idSucursal: number) => {
  if (esSucursalRecoleccion(idSucursal)) return MODALIDADES.recoleccion.titulo
  const sucursal = sucursales.value.find(s => s.Id === idSucursal)
  return sucursal ? `Sucursal ${sucursal.NombreSucursal}` : `Sucursal #${idSucursal}`
}

const filasPedidos = computed(() =>
  pedidos.value.map((ped) => ({
    id: ped.id,
    sucursal: obtenerNombreSucursal(ped.idSucursal),
    registrado: ped.fechaRegistro,
    fechaEntrega: ped.fechaEntrega,
    modalidad: modalidadDePedido(ped.idSucursal, leerObservaciones(ped.observaciones).modalidad),
    estado: estadoDePedido(ped.estatus),
    metodoPago: textoMetodoPago(ped.metodoPago),
    total: ped.total,
    totalKg: ped.totalKg,
  })),
)

const abrirDetallePedido = (id: number) => {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

const cargarDatos = async () => {
  if (!clienteId || isNaN(clienteId)) {
    errorCarga.value = 'ID de cliente inválido.'
    cargando.value = false
    return
  }
  cargando.value = true
  errorCarga.value = ''
  try {
    const [datosCliente, datosSucursales, todosLosPedidos] = await Promise.all([
      obtenerClientePorIdAPI(clienteId),
      obtenerSucursalesClienteAPI(clienteId),
      obtenerPedidos(),
    ])
    cliente.value = datosCliente
    sucursales.value = datosSucursales
    pedidos.value = todosLosPedidos
      .filter((pedido) => pedido.idCliente === clienteId)
      .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id)
  } catch (err: any) {
    if (err instanceof ErrorPedidos && err.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    errorCarga.value = err.message || 'Error al cargar los datos del cliente.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => cargarDatos())

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

const guardarSucursal = async (datos: {
  nombreSucursal: string
  direccion: string
  referencias: string
  telefono: string
}) => {
  try {
    // Referencias: se mandan si se capturaron, o al editar una sucursal que ya las trae (para
    // poder borrarlas). Así, mientras la API no tenga la columna, crear sin referencias sigue igual.
    const apiTieneReferencias = !!sucursalSeleccionada.value && 'Referencias' in sucursalSeleccionada.value
    const payload = {
      idCliente: clienteId,
      NombreSucursal: datos.nombreSucursal,
      Direccion: datos.direccion,
      Telefono: datos.telefono,
      Estatus: 1,
      ...(datos.referencias || apiTieneReferencias ? { Referencias: datos.referencias || null } : {}),
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
          <p class="panel__subtitulo">Monitorea el historial de pedidos y sucursales de este cliente.</p>
        </div>
      </div>

      <div v-if="cargando" class="panel__estado-carga">Cargando información del cliente...</div>
      <div v-else-if="errorCarga" class="panel__estado-error">{{ errorCarga }}</div>

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
        <section>
          <EncabezadoSeccionVue titulo="Sucursales" icono="usuario">
            <BotonVue variante="exito" @click="abrirModalCrearSucursal">
              <IconoVue nombre="mas" :tamano="16" />
              Nueva Sucursal
            </BotonVue>
          </EncabezadoSeccionVue>

          <div v-if="sucursales.length > 0" class="tabla-scroll tabla-scroll--sucursales">
            <TablaVue :columnas="columnasSucursales">
              <tr v-for="suc in sucursales" :key="suc.Id">
                <td class="panel__texto-nombre">{{ suc.NombreSucursal }}</td>
                <td>
                  {{ suc.Direccion }}
                  <span v-if="suc.Referencias" class="sucursal__referencias">Ref: {{ suc.Referencias }}</span>
                </td>
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
                    <button type="button" class="btn-accion btn-accion--eliminar" @click="solicitarEliminarSucursal(suc)">
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

        <!-- SECCIÓN PEDIDOS -->
        <section>
          <EncabezadoSeccionVue titulo="Historial de Pedidos" icono="reloj" />
          <div v-if="filasPedidos.length > 0" class="tabla-scroll tabla-scroll--pedidos">
            <TablaVue :columnas="columnasPedidos">
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
                <td class="panel__texto-nombre">{{ fila.sucursal }}</td>
                <td>{{ formatearFecha(fila.registrado) || SIN_DATO }}</td>
                <td>{{ fila.fechaEntrega ? formatearFecha(fila.fechaEntrega) : SIN_DATO }}</td>
                <td>
                  <span v-if="fila.modalidad" class="panel__modalidad">
                    <IconoVue :nombre="MODALIDADES[fila.modalidad].icono" :tamano="16" />
                    {{ MODALIDADES[fila.modalidad].etiquetaCorta }}
                  </span>
                  <template v-else>{{ SIN_DATO }}</template>
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
          <div v-else class="panel__estado-vacio">Este cliente no tiene pedidos registrados.</div>
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
  gap: 32px;
}

.panel__encabezado-volver {
  display: flex;
  align-items: center;
  gap: 12px;
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
  font-size: 24px;
  font-weight: 700;
}

.panel__subtitulo {
  margin: 6px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.panel__estado-carga,
.panel__estado-error,
.panel__estado-vacio {
  padding: 24px;
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

.panel__estado-vacio {
  color: var(--gf-texto-tenue);
  border-style: dashed;
}

.tarjeta-cliente {
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio, 8px);
  background: var(--gf-superficie);
  padding: 20px 24px;
}

.tarjeta-cliente__encabezado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.tarjeta-cliente__nombre {
  margin: 0;
  font-size: 20px;
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
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--gf-texto-tenue);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--gf-fondo);
}

.tarjeta-cliente__tabla td {
  padding: 12px;
  vertical-align: middle;
}

.tabla-scroll {
  overflow-y: auto;
  border-radius: var(--gf-radio, 8px);
}

.tabla-scroll--sucursales {
  max-height: 220px;
}

.tabla-scroll--pedidos {
  max-height: 205px;
}

.tabla-scroll :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--gf-fondo);
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
  font-weight: 600;
  color: var(--gf-texto);
}

.sucursal__referencias {
  display: block;
  margin-top: 2px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.panel__modalidad {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.panel__total {
  margin: 0;
  font-size: 15px;
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
  .panel {
    gap: 28px;
  }
  .panel__titulo {
    font-size: 20px;
  }
}
</style>