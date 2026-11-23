<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import { obtenerMenuNavegacion, obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS } from '@/modulos/ventas/controladores/estadosPedido'
import { formatearFecha, formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const SIN_DATO = '—'

const pedidos = shallowRef<Pedido[]>([])
const cargando = ref(true)
const errorCarga = ref(false)
const directorio = usarDirectorioPedidos()

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
    if (desde.value && venta.fecha < desde.value) return false
    if (hasta.value && venta.fecha > hasta.value) return false
    return true
  })
})

const totalKilos = computed(() =>
  ventasFiltradas.value.reduce((acumulado, venta) => acumulado + venta.totalKg, 0),
)

const totalDinero = computed(() =>
  ventasFiltradas.value.reduce((acumulado, venta) => acumulado + venta.total, 0),
)

async function cargarVentas() {
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
          <h1 class="reportes__titulo">Reportes de Ventas</h1>
          <p class="reportes__subtitulo">
            Consulta las ventas concluidas (pedidos entregados) y los totales generados por rango de fechas.
          </p>
        </div>
      </div>

      <!-- Filtros de fecha -->
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

      <!-- Tabla de ventas -->
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

      <!-- Resumen de totales -->
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
    </div>
  </LayoutPanelVue>
</template>

<style scoped>
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

@media (max-width: 720px) {
  .resumen {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>