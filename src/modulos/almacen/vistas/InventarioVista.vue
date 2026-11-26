<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {
  obtenerCatalogoCliente,
  obtenerInventarioActual,
  type ArticuloInventario,
} from '@/modulos/almacen/servicios/servicioInventario'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { formatearKg, formatearMoneda } from '@/modulos/ventas/controladores/formatosPedido'

type FiltroDisponibilidad = 'todos' | 'disponibles' | 'agotados'

const enrutador = useRouter()
const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esCliente = obtenerRolUsuario() === 'cliente'

const inventario = ref<ArticuloInventario[]>([])
const cargando = ref(true)
const errorCarga = ref('')
const busqueda = ref('')
const filtroEstado = ref<FiltroDisponibilidad>('todos')

const columnas: ColumnaTabla[] = esCliente
  ? [
      { clave: 'talla', etiqueta: 'Producto / Talla' },
      { clave: 'precio', etiqueta: 'Precio' },
      { clave: 'estado', etiqueta: 'Disponibilidad', alineacion: 'centro' },
    ]
  : [
      { clave: 'talla', etiqueta: 'Producto / Talla' },
      { clave: 'codigo', etiqueta: 'Código' },
      { clave: 'precio', etiqueta: 'Precio' },
      { clave: 'master', etiqueta: 'Master', alineacion: 'centro' },
      { clave: 'cantidadKg', etiqueta: 'Disponible', alineacion: 'centro' },
      { clave: 'estado', etiqueta: 'Estado', alineacion: 'centro' },
    ]

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const totalDisponibles = computed(() =>
  inventario.value.filter((item) => item.cantidadKg > 0).length,
)

const totalAgotados = computed(() =>
  inventario.value.filter((item) => item.cantidadKg <= 0).length,
)

const inventarioFiltrado = computed(() => {
  const texto = normalizar(busqueda.value)

  return inventario.value.filter((item) => {
    if (!esCliente) {
      if (filtroEstado.value === 'disponibles' && item.cantidadKg <= 0) return false
      if (filtroEstado.value === 'agotados' && item.cantidadKg > 0) return false
    }

    if (!texto) return true
    return (
      normalizar(item.talla).includes(texto) ||
      normalizar(item.nombre).includes(texto) ||
      String(item.codigoProducto ?? '').includes(texto)
    )
  })
})

async function cargarInventario() {
  cargando.value = true
  errorCarga.value = ''
  try {
    inventario.value = esCliente
      ? await obtenerCatalogoCliente()
      : await obtenerInventarioActual({ incluirAgotados: true })
  } catch (errorCapturado) {
    inventario.value = []
    errorCarga.value =
      errorCapturado instanceof Error
        ? errorCapturado.message
        : 'No es posible confirmar la disponibilidad en este momento.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargarInventario)
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Inicio"
  >
    <div class="inventario">
      <nav class="migas" aria-label="Ruta de navegación">
        <ol class="migas__lista">
          <li><RouterLink :to="{ name: 'panel' }" class="migas__enlace">Inicio</RouterLink></li>
          <li aria-current="page">
            <span class="migas__separador" aria-hidden="true">›</span>
            {{ esCliente ? 'Catálogo de productos' : 'Todo el inventario' }}
          </li>
        </ol>
      </nav>

      <div class="inventario__cabecera">
        <div class="inventario__titulo-bloque">
          <button
            type="button"
            class="btn-regresar"
            aria-label="Volver al inicio"
            @click="enrutador.push({ name: 'panel' })"
          >
            <IconoVue nombre="flecha-izquierda" :tamano="20" />
          </button>
          <div>
            <h1 class="inventario__titulo">
              {{ esCliente ? 'Catálogo de Productos' : 'Inventario completo' }}
            </h1>
            <p class="inventario__subtitulo">
              Consulta los productos activos del canal de menudeo y su disponibilidad actual.
            </p>
          </div>
        </div>

        <BotonVue
          variante="exito"
          :deshabilitado="cargando || !!errorCarga"
          @click="enrutador.push({ name: 'nuevo-pedido', query: { desde: 'inicio' } })"
        >
          <IconoVue nombre="mas" :tamano="16" />
          Nuevo Pedido
        </BotonVue>
      </div>

      <!-- E1. Disponibilidad no disponible -->
      <div v-if="errorCarga" class="inventario__alerta" role="alert">
        <div class="inventario__alerta-texto">
          <IconoVue nombre="alerta" :tamano="18" />
          <span>{{ errorCarga }}</span>
        </div>
        <BotonVue variante="secundario" compacto @click="cargarInventario">Reintentar</BotonVue>
      </div>

      <!-- Buscador y filtros -->
      <div class="inventario__controles">
        <div class="inventario__buscador">
          <CampoTextoVue
            id="inventario-buscar-producto"
            v-model="busqueda"
            etiqueta="Buscar producto"
            marcador="Talla, nombre o código (ej. 21/25)"
            icono="lupa"
            compacto
            autocomplete="off"
            :deshabilitado="cargando || !!errorCarga"
          />
        </div>

        <div v-if="!esCliente" class="inventario__filtros" role="group" aria-label="Filtrar por disponibilidad">
          <button
            type="button"
            class="filtro-chip"
            :class="{ 'filtro-chip--activo': filtroEstado === 'todos' }"
            @click="filtroEstado = 'todos'"
          >
            Todos ({{ inventario.length }})
          </button>
          <button
            type="button"
            class="filtro-chip"
            :class="{ 'filtro-chip--activo': filtroEstado === 'disponibles' }"
            @click="filtroEstado = 'disponibles'"
          >
            Disponibles ({{ totalDisponibles }})
          </button>
          <button
            type="button"
            class="filtro-chip"
            :class="{ 'filtro-chip--activo': filtroEstado === 'agotados' }"
            @click="filtroEstado = 'agotados'"
          >
            Agotados ({{ totalAgotados }})
          </button>
        </div>
      </div>

      <section>
        <EncabezadoSeccionVue titulo="Productos activos" icono="caja" />

        <TablaVue :columnas="columnas">
          <tr v-if="cargando">
            <td :colspan="columnas.length" class="inventario__mensaje" role="status">
              Cargando inventario…
            </td>
          </tr>

          <tr v-else-if="errorCarga">
            <td :colspan="columnas.length" class="inventario__mensaje">
              No se muestra la disponibilidad mientras persista el error de conexión.
            </td>
          </tr>

          <!-- A1. Sin coincidencias -->
          <tr v-else-if="inventarioFiltrado.length === 0">
            <td :colspan="columnas.length" class="inventario__mensaje">
              {{
                inventario.length
                  ? 'No se encontraron productos con ese criterio.'
                  : 'No hay productos activos en el catálogo.'
              }}
            </td>
          </tr>

          <tr
            v-for="fila in inventarioFiltrado"
            :key="`${fila.codigoProducto ?? fila.talla}-${fila.master}`"
            :class="{ 'fila-agotada': !esCliente && fila.cantidadKg <= 0 }"
          >
            <td>
              <p class="inventario__talla">{{ fila.talla || fila.nombre }}</p>
              <p v-if="fila.nombre && fila.nombre !== fila.talla" class="inventario__detalle">
                {{ fila.nombre }}
              </p>
              <p v-if="!esCliente && fila.cantidadKg <= 0" class="inventario__nota-agotado">
                Agotado — no puede agregarse a un pedido.
              </p>
            </td>

            <td v-if="!esCliente">{{ fila.codigoProducto ?? '—' }}</td>

            <td>
              <span class="inventario__precio">{{ formatearMoneda(fila.precio) }}</span>
              <span class="inventario__unidad"> / {{ fila.unidadMedida }}</span>
            </td>

            <td v-if="!esCliente" class="tabla__celda--centro">
              {{ fila.cantidadKg > 0 ? fila.master : '—' }}
            </td>

            <td v-if="!esCliente" class="tabla__celda--centro">
              {{ formatearKg(fila.cantidadKg) }}
            </td>

            <td class="tabla__celda--centro">
              <ChipEstadoVue
                :estado="esCliente || fila.cantidadKg > 0 ? 'entregado' : 'cancelado'"
                :etiqueta="esCliente || fila.cantidadKg > 0 ? 'Disponible' : 'Agotado'"
              />
            </td>
          </tr>
        </TablaVue>
      </section>
    </div>
  </LayoutPanelVue>
</template>

<style scoped>
.inventario {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.migas__lista {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  color: var(--gf-texto-tenue);
  font-size: 13px;
  list-style: none;
}

.migas__lista li[aria-current='page'] {
  color: var(--gf-texto);
}

.migas__separador {
  margin-right: 8px;
}

.migas__enlace {
  color: var(--gf-secundario);
  font-weight: 600;
  text-decoration: none;
}

.migas__enlace:hover {
  text-decoration: underline;
}

.inventario__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.inventario__titulo-bloque {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-regresar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  cursor: pointer;
}

.btn-regresar:hover {
  background: var(--gf-fondo);
}

.inventario__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 24px;
  font-weight: 700;
}

.inventario__subtitulo {
  margin: 4px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.inventario__alerta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--gf-preparacion-punto) 45%, transparent);
  border-radius: 8px;
  background: var(--gf-preparacion-bg);
  color: var(--gf-preparacion-fg);
  font-size: 14px;
  font-weight: 500;
}

.inventario__alerta-texto {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inventario__controles {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
}

.inventario__buscador {
  flex: 1;
  min-width: 260px;
  max-width: 440px;
}

.inventario__filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filtro-chip {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--gf-borde);
  border-radius: 999px;
  background: var(--gf-superficie);
  color: var(--gf-texto-tenue);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.filtro-chip:hover {
  background: var(--gf-fondo);
  color: var(--gf-texto);
}

.filtro-chip--activo {
  border-color: var(--gf-primario);
  background: var(--gf-primario);
  color: var(--gf-superficie);
}

.filtro-chip--activo:hover {
  background: var(--gf-primario);
  color: var(--gf-superficie);
}

.inventario__mensaje {
  padding: 28px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
}

.inventario__talla {
  margin: 0;
  color: var(--gf-texto);
  font-weight: 700;
}

.inventario__detalle {
  margin: 2px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.inventario__nota-agotado {
  margin: 4px 0 0;
  color: var(--gf-cancelado-fg);
  font-size: 12px;
  font-weight: 500;
}

.inventario__precio {
  font-weight: 600;
}

.inventario__unidad {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.fila-agotada {
  opacity: 0.78;
}
</style>