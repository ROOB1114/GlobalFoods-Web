<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import { obtenerInventarioActual, type ArticuloInventario } from '@/modulos/almacen/servicios/servicioInventario'
import { obtenerMenuNavegacion, obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS, estadoDePedido } from '@/modulos/ventas/controladores/estadosPedido'
import { formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarActualizacionPeriodica } from '@/modulos/ventas/controladores/usarActualizacionPeriodica'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()

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

const pedidosActuales = computed(() =>
  pedidos.value
    .filter((pedido) => ESTATUS_EN_CURSO.has(pedido.estatus))
    .map((pedido) => ({
      id: pedido.id,
      cliente: directorio.nombreCliente(pedido.idCliente),
      articulos: pedido.lineas.length,
      totalKg: pedido.totalKg,
      estado: estadoDePedido(pedido.estatus),
      total: pedido.total,
      fecha: pedido.fechaRegistro,
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
    inventario.value = await obtenerInventarioActual()
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

const columnasInventario: ColumnaTabla[] = [
  { clave: 'talla', etiqueta: 'Talla' },
  { clave: 'precio', etiqueta: 'Precio' },
  { clave: 'master', etiqueta: 'Master', alineacion: 'centro' },
  { clave: 'cantidadKg', etiqueta: 'Stock (kg)', alineacion: 'centro' },
]

const columnasPedidos: ColumnaTabla[] = [
  { clave: 'id', etiqueta: 'ID Pedido' },
  { clave: 'cliente', etiqueta: 'Cliente' },
  { clave: 'estado', etiqueta: 'Estado' },
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
      <section class="panel__seccion">
        <EncabezadoSeccionVue titulo="Inventario" icono="caja" />

        <TablaVue :columnas="columnasInventario" :alto-maximo="altoInventario">
          <tr v-if="cargandoInventario">
            <td colspan="4" class="panel__mensaje">Cargando inventario...</td>
          </tr>
          <tr v-else-if="errorInventario">
            <td colspan="4" class="panel__mensaje panel__error" role="alert">{{ errorInventario }}</td>
          </tr>
          <tr v-else-if="inventario.length === 0">
            <td colspan="4" class="panel__mensaje">No hay productos disponibles.</td>
          </tr>
          <tr v-for="fila in inventario" :key="fila.talla">
            <td>{{ fila.talla }}</td>
            <td>{{ formatearMoneda(fila.precio) }}</td>
            <td class="tabla__celda--centro">{{ fila.master }}</td>
            <td class="tabla__celda--centro">{{ fila.cantidadKg }}</td>
          </tr>
        </TablaVue>
      </section>

      <!-- Sección de Pedidos -->
      <section class="panel__seccion">
        <EncabezadoSeccionVue titulo="Pedidos Actuales" icono="reloj" />

        <TablaVue :columnas="columnasPedidos" :alto-maximo="altoPedidos">
          <tr v-if="cargandoPedidos">
            <td colspan="4" class="panel__mensaje">Cargando pedidos...</td>
          </tr>
          <tr v-else-if="errorPedidos">
            <td colspan="4" class="panel__mensaje">
              <p class="panel__error" role="alert">{{ errorPedidos }}</p>
              <div class="panel__reintentar">
                <BotonVue variante="secundario" compacto @click="cargarPedidos()">Reintentar</BotonVue>
              </div>
            </td>
          </tr>
          <tr v-else-if="pedidosActuales.length === 0">
            <td colspan="4" class="panel__mensaje">No hay pedidos pendientes ni en curso.</td>
          </tr>
          <tr
            v-for="pedido in pedidosActuales"
            :key="pedido.id"
            class="fila-clicable"
            @click="abrirDetallePedido(pedido.id)"
          >
            <td class="panel__id">
              <RouterLink
                :to="{ name: 'detalle-pedido', params: { id: pedido.id } }"
                class="panel__folio"
                @click.stop
              >
                #{{ pedido.id }}
              </RouterLink>
            </td>
            <td>
              <p class="panel__cliente">{{ pedido.cliente }}</p>
              <p class="panel__detalle">
                <template v-if="pedido.articulos > 0">
                  {{ pedido.articulos }} {{ pedido.articulos === 1 ? 'producto' : 'productos' }} ·
                </template>
                {{ formatearKg(pedido.totalKg) }}
              </p>
            </td>
            <td>
              <ChipEstadoVue :estado="pedido.estado.chip" :etiqueta="pedido.estado.etiqueta" />
            </td>
            <td class="tabla__celda--derecha">
              <p class="panel__total">{{ formatearMoneda(pedido.total) }}</p>
              <p class="panel__detalle panel__hace">
                <IconoVue nombre="reloj" :tamano="12" />
                {{ formatearFecha(pedido.fecha) || '—' }}
              </p>
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
  max-width: 1100px;
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
  font-weight: 500;
}

.panel__detalle {
  margin: 1px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.panel__total {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.panel__hace {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
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