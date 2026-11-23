<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {obtenerCatalogoCliente, obtenerInventarioActual, type ArticuloInventario} from '@/modulos/almacen/servicios/servicioInventario'
import {obtenerMenuNavegacion, obtenerNombreUsuario, obtenerRolUsuario} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS, estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
import { MODALIDADES, formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { textoMetodoPago } from '@/modulos/ventas/controladores/metodosPago'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarActualizacionPeriodica } from '@/modulos/ventas/controladores/usarActualizacionPeriodica'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esCliente = obtenerRolUsuario() === 'cliente'
const SIN_DATO = '—'

// --- Inventario ---
const inventario = ref<ArticuloInventario[]>([])
const cargandoInventario = ref(true)
const errorInventario = ref('')

// --- Pedidos actuales ---
const pedidos = shallowRef<Pedido[]>([])
const cargandoPedidos = ref(true)
const errorPedidos = ref('')
const directorio = usarDirectorioPedidos()

const ESTATUS_EN_CURSO = new Set<number>([ESTATUS.creado, ESTATUS.surtido, ESTATUS.enReparto])

function textoSucursal(pedido: Pedido): string {
  if (esSucursalRecoleccion(pedido.idSucursal)) return MODALIDADES.recoleccion.titulo
  const sucursal = directorio.buscarSucursal(pedido.idCliente, pedido.idSucursal)
  if (sucursal === undefined) return 'Sucursal …'
  return sucursal ? `Sucursal ${sucursal.nombre}` : `Sucursal #${pedido.idSucursal}`
}

const pedidosActuales = computed(() =>
  pedidos.value
    .filter((pedido) => ESTATUS_EN_CURSO.has(pedido.estatus))
    .map((pedido) => ({
      id: pedido.id,
      cliente: directorio.nombreCliente(pedido.idCliente),
      sucursal: textoSucursal(pedido),
      registrado: pedido.fechaRegistro,
      fechaEntrega: pedido.fechaEntrega,
      modalidad: modalidadDePedido(pedido.idSucursal, leerObservaciones(pedido.observaciones).modalidad),
      estado: estadoDePedido(pedido.estatus),
      metodoPago: textoMetodoPago(pedido.metodoPago),
      total: pedido.total,
      totalKg: pedido.totalKg,
    })),
)

// Alturas dinámicas para las tablas
const altoInventario = ref(250)
const altoPedidos = ref(200)

const actualizarAlturas = () => {
  if (window.innerHeight < 820) {
    altoInventario.value = 180
    altoPedidos.value = 160
  } else {
    altoInventario.value = 260
    altoPedidos.value = 200
  }
}

async function cargarInventario() {
  cargandoInventario.value = true
  errorInventario.value = ''
  try {
    inventario.value = esCliente
      ? await obtenerCatalogoCliente()
      : await obtenerInventarioActual()
  } catch (errorCapturado) {
    errorInventario.value =
      errorCapturado instanceof Error ? errorCapturado.message : 'No se pudo cargar el inventario.'
  } finally {
    cargandoInventario.value = false
  }
}

async function cargarPedidos(opciones: { silencioso?: boolean } = {}) {
  const silencioso = opciones.silencioso === true
  if (silencioso && cargandoPedidos.value) return
  if (!silencioso) {
    cargandoPedidos.value = true
    errorPedidos.value = ''
  }
  try {
    const [lista] = await Promise.all([obtenerPedidos(), directorio.cargarClientes()])
    pedidos.value = [...lista].sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id)
    errorPedidos.value = ''

    const idsClientesEnCurso = pedidos.value
      .filter((pedido) => ESTATUS_EN_CURSO.has(pedido.estatus) && !esSucursalRecoleccion(pedido.idSucursal))
      .map((pedido) => pedido.idCliente)
    await directorio.cargarSucursales(idsClientesEnCurso)
  } catch (errorCapturado) {
    if (errorCapturado instanceof ErrorPedidos && errorCapturado.motivo === 'sesion') {
      salirPorSesionVencida(enrutador)
      return
    }
    if (!silencioso) {
      errorPedidos.value = 'No fue posible cargar los pedidos actuales.'
    }
  } finally {
    if (!silencioso) cargandoPedidos.value = false
  }
}

function abrirDetallePedido(id: number) {
  enrutador.push({ name: 'detalle-pedido', params: { id } })
}

onMounted(() => {
  actualizarAlturas()
  window.addEventListener('resize', actualizarAlturas)
  cargarInventario()
  cargarPedidos()
})

onUnmounted(() => {
  window.removeEventListener('resize', actualizarAlturas)
})

usarActualizacionPeriodica(() => cargarPedidos({ silencioso: true }))

const columnasInventario: ColumnaTabla[] = esCliente
  ? [
      { clave: 'talla', etiqueta: 'Talla' },
      { clave: 'precio', etiqueta: 'Precio' },
    ]
  : [
      { clave: 'talla', etiqueta: 'Talla' },
      { clave: 'precio', etiqueta: 'Precio' },
      { clave: 'master', etiqueta: 'Master', alineacion: 'centro' },
      { clave: 'cantidadKg', etiqueta: 'Stock (kg)', alineacion: 'centro' },
    ]

const columnasPedidos: ColumnaTabla[] = [
  { clave: 'folio', etiqueta: 'Folio' },
  { clave: 'cliente', etiqueta: 'Cliente y sucursal' },
  { clave: 'registrado', etiqueta: 'Registrado' },
  { clave: 'entrega', etiqueta: 'Entrega' },
  { clave: 'modalidad', etiqueta: 'Modalidad' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'metodoPago', etiqueta: 'Método de pago' },
  { clave: 'total', etiqueta: 'Total', alineacion: 'derecha' },
]
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Inicio"
  >
    <div class="panel">
      <!-- Encabezado del panel -->
      <div class="panel__bienvenida">
        <div>
          <h1 class="panel__titulo">Bienvenido de vuelta, {{ nombreUsuario }}</h1>
          <p class="panel__subtitulo">
            Monitorea el inventario y gestiona los pedidos recientes de hoy.
          </p>
        </div>

        <div class="panel__accion">
          <BotonVue variante="exito" @click="enrutador.push({ name: 'nuevo-pedido' })">
            <IconoVue nombre="mas" :tamano="16" />
            Nuevo Pedido
          </BotonVue>
        </div>
      </div>

      <!-- Sección de Inventario -->
      <!-- Sección de Inventario -->
      <section class="panel__seccion">
        <EncabezadoSeccionVue :titulo="esCliente ? 'Catálogo de Productos' : 'Inventario'" icono="caja" />

        <TablaVue :columnas="columnasInventario" :alto-maximo="altoInventario">
          <tr v-if="cargandoInventario">
            <td :colspan="columnasInventario.length" class="panel__mensaje">
              {{ esCliente ? 'Cargando catálogo...' : 'Cargando inventario...' }}
            </td>
          </tr>
          <tr v-else-if="errorInventario">
            <td :colspan="columnasInventario.length" class="panel__mensaje panel__error" role="alert">
              {{ errorInventario }}
            </td>
          </tr>
          <tr v-else-if="inventario.length === 0">
            <td :colspan="columnasInventario.length" class="panel__mensaje">No hay productos disponibles.</td>
          </tr>
          <tr v-for="fila in inventario" :key="fila.talla">
            <td>{{ fila.talla }}</td>
            <td>{{ formatearMoneda(fila.precio) }}</td>
            <td v-if="!esCliente" class="tabla__celda--centro">{{ fila.master }}</td>
            <td v-if="!esCliente" class="tabla__celda--centro">{{ fila.cantidadKg }}</td>
          </tr>
        </TablaVue>
      </section>

      <!-- Sección de Pedidos -->
      <section class="panel__seccion">
        <EncabezadoSeccionVue titulo="Pedidos Actuales" icono="reloj" />

        <TablaVue :columnas="columnasPedidos" :alto-maximo="altoPedidos">
          <tr v-if="cargandoPedidos">
            <td :colspan="columnasPedidos.length" class="panel__mensaje">Cargando pedidos...</td>
          </tr>
          <tr v-else-if="errorPedidos">
            <td :colspan="columnasPedidos.length" class="panel__mensaje">
              <p class="panel__error" role="alert">{{ errorPedidos }}</p>
              <div class="panel__reintentar">
                <BotonVue variante="secundario" compacto @click="cargarPedidos()">Reintentar</BotonVue>
              </div>
            </td>
          </tr>
          <tr v-else-if="pedidosActuales.length === 0">
            <td :colspan="columnasPedidos.length" class="panel__mensaje">No hay pedidos pendientes ni en curso.</td>
          </tr>
          <tr
            v-for="fila in pedidosActuales"
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
              <p class="panel__cliente">{{ fila.cliente }}</p>
              <p class="panel__detalle">{{ fila.sucursal }}</p>
            </td>
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
      </section>
    </div>
  </LayoutPanelVue>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel__bienvenida {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 2px;
}

.panel__seccion {
  display: flex;
  flex-direction: column;
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

.panel__accion {
  flex: none;
}

.panel__mensaje {
  padding: 20px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
}

.panel__error {
  margin: 0;
  color: var(--gf-cancelado-fg);
}

.panel__reintentar {
  display: inline-flex;
  margin-top: 10px;
}

.panel__id {
  font-weight: 700;
}

.panel__folio {
  color: var(--gf-primario);
  font-weight: 700;
  text-decoration: none;
}

.panel__folio:hover {
  text-decoration: underline;
}

.panel__cliente {
  margin: 0;
  color: var(--gf-texto);
  font-weight: 600;
}

.panel__detalle {
  margin: 2px 0 0;
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
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 700;
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
    font-size: 18px;
  }
}

@media (max-width: 560px) {
  .panel__bienvenida {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>