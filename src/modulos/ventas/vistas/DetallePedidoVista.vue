<script setup lang="ts">
// Detalle de un pedido: avance, cliente y entrega, y productos.
// Acciones del administrativo (ver permisosPedidos.ts):
// - "Editar pedido", solo en Pendiente: lleva a /pedidos/:id/editar.
// - "Registrar pago", en Surtido o En reparto: elige Efectivo o Transferencia y el pedido queda
//   Entregado con la fecha de entrega de hoy.
// - "Cancelar pedido", mientras no se haya entregado (Creado, Surtido o En reparto, igual que en
//   la app móvil); el pedido no se borra, queda Cancelado.
// Todavía no lleva la tarjeta "Historial del pedido" del diseño: la API no guarda los cambios de
// estado con su fecha y hora.
// Se actualiza solo cada minuto para reflejar lo que cambia el sistema interno (Surtido y, si el
// pago se registra ahí, el método de pago, la fecha de entrega y Entregado), salvo mientras está
// abierta la ventana de cancelar o la de registrar el pago.

import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import AvisoVue from '@/componentes/AvisoVue.vue'
import BotonVue from '@/componentes/BotonVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import { obtenerMenuNavegacion, obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import AvancePedidoVue from '@/modulos/ventas/componentes/AvancePedidoVue.vue'
import ModalCancelarPedidoVue from '@/modulos/ventas/componentes/ModalCancelarPedidoVue.vue'
import ModalRegistrarPagoVue from '@/modulos/ventas/componentes/ModalRegistrarPagoVue.vue'
import {
  ESTATUS,
  sePuedeCancelar,
  sePuedeEditar,
  sePuedeRegistrarPago,
} from '@/modulos/ventas/controladores/estadosPedido'
import {
  MODALIDADES,
  formatearFecha,
  formatearKg,
  formatearMoneda,
  urlMapsDireccion,
} from '@/modulos/ventas/controladores/formatosPedido'
import type { PagoEntrega } from '@/modulos/ventas/controladores/pagoEntrega'
import {
  perfilPuedeCancelar,
  perfilPuedeEditar,
  perfilPuedeRegistrarPago,
} from '@/modulos/ventas/controladores/permisosPedidos'
import { PUNTO_RECOLECCION } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarActualizacionPeriodica } from '@/modulos/ventas/controladores/usarActualizacionPeriodica'
import {
  MENSAJES_DETALLE,
  mensajeNoEncontrado,
  usarDetallePedido,
} from '@/modulos/ventas/controladores/usarDetallePedido'
import { AVISO_PEDIDO_ACTUALIZADO, MENSAJES_EDICION } from '@/modulos/ventas/controladores/usarEditarPedido'
import { ErrorPedidos, cancelarPedido, registrarPago } from '@/modulos/ventas/servicios/servicioPedidos'

const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()

const enrutador = useRouter()
const ruta = useRoute()

function regresar() {
  if (window.history.state?.back) {
    enrutador.back()
  } else {
    enrutador.push({ name: 'pedidos' })
  }
}
const rutaAnterior = typeof window.history.state?.back === 'string' ? window.history.state.back : ''

const origen: {
  itemActivo: string
  migas: { etiqueta: string; destino: RouteLocationRaw }[]
} = (() => {
  if (rutaAnterior.startsWith('/detalle-cliente-vista/')) {
    return {
      itemActivo: 'Clientes',
      migas: [
        { etiqueta: 'Clientes', destino: '/clientes' },
        { etiqueta: 'Detalle del Cliente', destino: rutaAnterior },
      ],
    }
  }

  if (rutaAnterior.startsWith('/reportes')) {
    return {
      itemActivo: 'Reportes',
      migas: [{ etiqueta: 'Reportes', destino: { name: 'reportes' } }],
    }
  }

  if (
    rutaAnterior &&
    !rutaAnterior.startsWith('/pedidos') &&
    !rutaAnterior.startsWith('/login') &&
    !rutaAnterior.startsWith('/iniciar-sesion')
  ) {
    return {
      itemActivo: 'Inicio',
      migas: [{ etiqueta: 'Inicio', destino: rutaAnterior }],
    }
  }

  return {
    itemActivo: 'Pedidos',
    migas: [{ etiqueta: 'Pedidos', destino: { name: 'pedidos' } }],
  }
})()
// La ruta solo acepta dígitos (/pedidos/:id(\d+)).
const id = Number(ruta.params.id)
const consulta = reactive(usarDetallePedido(id, { alVencerSesion: () => salirPorSesionVencida(enrutador) }))

const columnasProductos: ColumnaTabla[] = [
  { clave: 'talla', etiqueta: 'Talla' },
  { clave: 'cantidad', etiqueta: 'Cantidad', alineacion: 'derecha' },
  { clave: 'precio', etiqueta: 'Precio por kg', alineacion: 'derecha' },
  { clave: 'subtotal', etiqueta: 'Subtotal', alineacion: 'derecha' },
]

const SIN_DATO = '—'

const folio = `#${id}`

const mensajeAviso = ref('')
const varianteAviso = ref<'error' | 'exito'>('error')

/** Muestra el aviso; si el mismo texto ya estaba, se vuelve a anunciar. */
async function avisar(texto: string, variante: 'error' | 'exito') {
  mensajeAviso.value = ''
  await nextTick()
  varianteAviso.value = variante
  mensajeAviso.value = texto
}

onMounted(() => {
  consulta.cargar()
  // ?aviso=actualizado: se llega aquí después de guardar en Editar pedido. Se quita de la
  // dirección para que no se repita al recargar.
  if (ruta.query.aviso === AVISO_PEDIDO_ACTUALIZADO) {
    avisar(MENSAJES_EDICION.exito, 'exito')
    enrutador.replace({ query: {} })
  }
})

// --- Editar pedido ---

const puedeEditar = computed(
  () => !!consulta.pedido && sePuedeEditar(consulta.pedido.estado.estatus) && perfilPuedeEditar(),
)

// --- Cancelar pedido ---

const MENSAJES_CANCELAR = {
  exito: (folio: string) => `Pedido ${folio} cancelado.`,
  sinConexion: 'El cambio no se guardó por falta de conexión. Intente nuevamente.',
  error: 'No fue posible cancelar el pedido. Intente nuevamente.',
}

const ID_BOTON_CANCELAR = 'detalle-cancelar-pedido'

const puedeCancelar = computed(
  () => !!consulta.pedido && sePuedeCancelar(consulta.pedido.estado.estatus) && perfilPuedeCancelar(),
)
const cancelado = computed(() => consulta.pedido?.estado.estatus === ESTATUS.cancelado)
/** Aviso de la ventana de cancelar según el estado; no bloquea. */
const advertenciaCancelar = computed(() => {
  const estatus = consulta.pedido?.estado.estatus
  if (estatus === ESTATUS.surtido) return 'Almacén ya surtió este pedido.'
  if (estatus === ESTATUS.enReparto) return 'Este pedido ya salió a reparto. Avise al repartidor.'
  return ''
})

const mostrarCancelar = ref(false)
const cancelando = ref(false)

// --- Registrar pago ---

const MENSAJES_PAGO = {
  exito: (folio: string) => `Pago registrado. El pedido ${folio} quedó Entregado.`,
  sinConexion: 'El pago no se guardó por falta de conexión. Intente nuevamente.',
  error: 'No fue posible registrar el pago. Intente nuevamente.',
}

const puedeRegistrarPago = computed(
  () =>
    !!consulta.pedido && sePuedeRegistrarPago(consulta.pedido.estado.estatus) && perfilPuedeRegistrarPago(),
)

const mostrarPago = ref(false)
const registrandoPago = ref(false)

// No se actualiza mientras hay una ventana abierta o un cambio en camino.
usarActualizacionPeriodica(() => {
  const ocupado = mostrarCancelar.value || cancelando.value || mostrarPago.value || registrandoPago.value
  if (!ocupado) consulta.cargar({ silencioso: true })
})

/**
 * Manejo común de los errores al cancelar y al registrar el pago. Con 400/409 la API (o la
 * consulta previa) no lo permitió, p. ej. el pedido ya cambió de estado: se cierra la ventana,
 * se muestra su mensaje y se recarga el pedido para ver su estado actual. Sin conexión u otro
 * error, la ventana se queda abierta para reintentar.
 */
async function alFallarCambio(
  error: unknown,
  mensajes: { sinConexion: string; error: string },
  cerrarVentana: () => void,
) {
  const errorPedidos = error instanceof ErrorPedidos ? error : null
  if (errorPedidos?.motivo === 'sesion') {
    salirPorSesionVencida(enrutador)
    return
  }
  if (errorPedidos?.motivo === 'conexion') {
    avisar(mensajes.sinConexion, 'error')
    return
  }
  if (errorPedidos?.motivo === 'datos_invalidos') {
    cerrarVentana()
    avisar(errorPedidos.mensajeApi || mensajes.error, 'error')
    await consulta.cargar({ silencioso: true })
    return
  }
  avisar(mensajes.error, 'error')
}

async function alConfirmarCancelacion() {
  cancelando.value = true
  try {
    await cancelarPedido(id)
    mostrarCancelar.value = false
    avisar(MENSAJES_CANCELAR.exito(folio), 'exito')
    await consulta.cargar({ silencioso: true })
  } catch (error) {
    await alFallarCambio(error, MENSAJES_CANCELAR, () => (mostrarCancelar.value = false))
  } finally {
    cancelando.value = false
  }
}

async function alConfirmarPago(pago: PagoEntrega, notas: string | null, comprobante: File | null) {
  registrandoPago.value = true
  try {
    await registrarPago(id, pago, notas, comprobante)
    mostrarPago.value = false
    avisar(MENSAJES_PAGO.exito(folio), 'exito')
    await consulta.cargar({ silencioso: true })
  } catch (error) {
    await alFallarCambio(error, MENSAJES_PAGO, () => (mostrarPago.value = false))
  } finally {
    registrandoPago.value = false
  }
}
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    :item-activo="origen.itemActivo"
  >
    <div class="detalle">
      <nav class="migas" aria-label="Ruta de navegación">
        <ol class="migas__lista">
          <li v-for="(miga, indice) in origen.migas" :key="miga.etiqueta">
            <span v-if="indice > 0" class="migas__separador" aria-hidden="true">›</span>
            <RouterLink :to="miga.destino" class="migas__enlace">{{ miga.etiqueta }}</RouterLink>
          </li>
          <li aria-current="page">
            <span class="migas__separador" aria-hidden="true">›</span>
            Pedido #{{ id }}
          </li>
        </ol>
      </nav>

      <div class="detalle__encabezado">
        <button type="button" class="btn-regresar" aria-label="Volver" @click="regresar">
          <IconoVue nombre="flecha-izquierda" :tamano="20" />
        </button>
        <h1 class="detalle__titulo">Pedido #{{ id }}</h1>
        <ChipEstadoVue v-if="consulta.pedido" :estado="consulta.pedido.estado.chip" :etiqueta="consulta.pedido.estado.etiqueta" />
        <div v-if="puedeEditar || puedeRegistrarPago || puedeCancelar" class="detalle__acciones">
          <BotonVue
            v-if="puedeEditar"
            variante="secundario"
            compacto
            @click="enrutador.push({ name: 'editar-pedido', params: { id } })"
          >
            <IconoVue nombre="lapiz" :tamano="16" />
            Editar pedido
          </BotonVue>
          <BotonVue v-if="puedeRegistrarPago" variante="exito" compacto @click="mostrarPago = true">
            <IconoVue nombre="check" :tamano="16" />
            Registrar pago
          </BotonVue>
          <BotonVue
            v-if="puedeCancelar"
            :id="ID_BOTON_CANCELAR"
            variante="peligro"
            compacto
            @click="mostrarCancelar = true"
          >
            Cancelar pedido
          </BotonVue>
        </div>
      </div>

      <p v-if="consulta.pedido" class="detalle__subtitulo">
        Registrado el {{ formatearFecha(consulta.pedido.registrado) || SIN_DATO }}.
      </p>

      <p v-if="consulta.cargando" class="detalle__mensaje" role="status">{{ MENSAJES_DETALLE.cargando }}</p>

      <div v-else-if="consulta.noEncontrado" class="detalle__mensaje">
        <p>{{ mensajeNoEncontrado(id) }}</p>
        <RouterLink :to="{ name: 'pedidos' }" class="detalle__enlace">Volver a Pedidos</RouterLink>
      </div>

      <div v-else-if="consulta.errorCarga" class="detalle__mensaje">
        <p class="detalle__error" role="alert">{{ MENSAJES_DETALLE.errorCarga }}</p>
        <div class="detalle__reintentar">
          <BotonVue variante="secundario" compacto @click="consulta.cargar">Reintentar</BotonVue>
        </div>
      </div>

      <template v-else-if="consulta.pedido">
        <p v-if="cancelado" class="detalle__cancelado">
          <IconoVue nombre="alerta" :tamano="18" />
          Este pedido fue cancelado. Ya no aparece en las listas de almacén ni de reparto.
        </p>
        <AvancePedidoVue v-else :estatus="consulta.pedido.estado.estatus" />

        <section class="tarjeta">
          <EncabezadoSeccionVue titulo="Cliente y entrega" icono="clientes" />

          <dl class="datos">
            <div class="datos__dato">
              <dt>Cliente</dt>
              <dd class="datos__fuerte">{{ consulta.pedido.cliente }}</dd>
            </div>
            <div class="datos__dato">
              <dt>Sucursal</dt>
              <dd>{{ consulta.pedido.sucursal }}</dd>
            </div>
            <div v-if="consulta.pedido.modalidad === 'recoleccion'" class="datos__dato">
              <dt>Punto de recolección</dt>
              <dd>
                {{ PUNTO_RECOLECCION.nombre }}
                <a class="detalle__enlace datos__mapa" :href="PUNTO_RECOLECCION.urlMaps" target="_blank" rel="noopener">
                  Ver en Maps<span class="visualmente-oculto"> (se abre en otra pestaña)</span>
                </a>
              </dd>
            </div>
            <div v-else class="datos__dato">
              <dt>Dirección de entrega</dt>
              <dd>
                <template v-if="consulta.pedido.direccionEntrega">
                  {{ consulta.pedido.direccionEntrega }}
                  <a
                    class="detalle__enlace datos__mapa"
                    :href="urlMapsDireccion(consulta.pedido.direccionEntrega)"
                    target="_blank"
                    rel="noopener"
                  >
                    Ver en Maps<span class="visualmente-oculto"> (se abre en otra pestaña)</span>
                  </a>
                </template>
                <template v-else>{{ SIN_DATO }}</template>
              </dd>
            </div>
            <div class="datos__dato">
              <dt>Teléfono de la sucursal</dt>
              <dd>{{ consulta.pedido.telefonoSucursal ?? SIN_DATO }}</dd>
            </div>
            <div class="datos__dato">
              <dt>Modalidad</dt>
              <dd>
                <span v-if="consulta.pedido.modalidad" class="datos__icono">
                  <IconoVue :nombre="MODALIDADES[consulta.pedido.modalidad].icono" :tamano="16" />
                  {{ MODALIDADES[consulta.pedido.modalidad].etiquetaCorta }}
                </span>
                <template v-else>{{ SIN_DATO }}</template>
              </dd>
            </div>
            <div class="datos__dato">
              <dt>Fecha de entrega</dt>
              <dd>
                <span v-if="consulta.pedido.fechaEntrega" class="datos__icono">
                  <IconoVue nombre="calendario" :tamano="16" />
                  {{ formatearFecha(consulta.pedido.fechaEntrega) }}
                </span>
                <template v-else>{{ SIN_DATO }}</template>
              </dd>
            </div>
            <div class="datos__dato">
              <dt>Método de pago</dt>
              <dd>{{ consulta.pedido.metodoPago ?? SIN_DATO }}</dd>
            </div>
            <div v-if="consulta.pedido.usuarioTelegram !== undefined" class="datos__dato">
              <dt>Usuario de Telegram</dt>
              <dd>{{ consulta.pedido.usuarioTelegram ?? SIN_DATO }}</dd>
            </div>
            <div class="datos__dato datos__dato--ancho">
              <dt>Observaciones</dt>
              <dd :class="{ datos__notas: consulta.pedido.notas }">{{ consulta.pedido.notas ?? SIN_DATO }}</dd>
            </div>
          </dl>
        </section>

        <section class="tarjeta">
          <EncabezadoSeccionVue titulo="Productos" icono="caja" />

          <TablaVue :columnas="columnasProductos">
            <tr v-for="(linea, indice) in consulta.pedido.lineas" :key="indice">
              <td class="productos__talla">{{ linea.talla || SIN_DATO }}</td>
              <td class="tabla__celda--derecha">{{ formatearKg(linea.cantidadKg) }}</td>
              <td class="tabla__celda--derecha">{{ formatearMoneda(linea.precioKg) }}</td>
              <td class="tabla__celda--derecha">{{ formatearMoneda(linea.subtotal) }}</td>
            </tr>
            <tr v-if="consulta.pedido.lineas.length === 0">
              <td :colspan="columnasProductos.length" class="productos__vacio">Este pedido no tiene productos.</td>
            </tr>
            <tr class="productos__total">
              <td>Total</td>
              <td class="tabla__celda--derecha">{{ formatearKg(consulta.pedido.totalKg) }}</td>
              <td></td>
              <td class="tabla__celda--derecha productos__importe">{{ formatearMoneda(consulta.pedido.total) }}</td>
            </tr>
          </TablaVue>
        </section>
      </template>
    </div>
  </LayoutPanelVue>

  <ModalCancelarPedidoVue
    :mostrar="mostrarCancelar"
    :folio="folio"
    :advertencia="advertenciaCancelar"
    :enviando="cancelando"
    @cerrar="mostrarCancelar = false"
    @confirmar="alConfirmarCancelacion"
  />

  <ModalRegistrarPagoVue
    :mostrar="mostrarPago"
    :folio="folio"
    :total="consulta.pedido?.total ?? 0"
    :notas="consulta.pedido?.notas ?? ''"
    :enviando="registrandoPago"
    @cerrar="mostrarPago = false"
    @confirmar="alConfirmarPago"
  />

  <AvisoVue v-model="mensajeAviso" :variante="varianteAviso" />
</template>

<style scoped>
.detalle {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1100px;
}

.detalle :where(p, dl, dd) {
  margin: 0;
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
  color: var(--gf-texto-tenue);
}

.migas__enlace,
.detalle__enlace {
  color: var(--gf-secundario);
  font-weight: 600;
  text-decoration: none;
}

.migas__enlace:hover,
.detalle__enlace:hover {
  text-decoration: underline;
}

.detalle__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.btn-regresar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--gf-borde);
  border-radius: 50%;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.btn-regresar:hover {
  border-color: var(--gf-texto-tenue);
  background: var(--gf-fondo);
}

.btn-regresar:focus-visible {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.detalle__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 24px;
  font-weight: 700;
}

.detalle__subtitulo {
  margin-top: -8px;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

/* En columnas: BotonVue ocupa todo el ancho, y así cada uno mide lo que su texto. */
.detalle__acciones {
  display: grid;
  grid-auto-flow: column;
  gap: 8px;
  margin-left: auto;
}

.detalle__cancelado {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--gf-cancelado-punto);
  border-radius: var(--gf-radio);
  background: var(--gf-cancelado-bg);
  color: var(--gf-cancelado-fg);
  font-size: 14px;
  font-weight: 600;
}

.detalle__mensaje {
  padding: 32px 16px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio);
  color: var(--gf-texto-tenue);
  font-size: 14px;
  text-align: center;
}

.detalle__mensaje > p + .detalle__enlace {
  display: inline-block;
  margin-top: 12px;
}

.detalle__error {
  color: var(--gf-cancelado-fg);
}

.detalle__reintentar {
  display: inline-flex;
  margin-top: 12px;
}

.tarjeta {
  padding: 20px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio);
  background: var(--gf-superficie);
}

.datos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}

.datos__dato--ancho {
  grid-column: 1 / -1;
}

.datos__dato dt {
  margin-bottom: 4px;
  color: var(--gf-texto-tenue);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.datos__dato dd {
  color: var(--gf-texto);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.datos__fuerte {
  font-weight: 700;
}

.datos__icono {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.datos__mapa {
  display: block;
  width: fit-content;
  margin-top: 4px;
  font-size: 13px;
}

.datos__mapa:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.datos .datos__notas {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gf-fondo);
}

.productos__talla {
  font-weight: 600;
}

/* .tarjeta delante para ganarle a los estilos de las celdas de TablaVue. */
.tarjeta .productos__vacio {
  padding: 24px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
}

.tarjeta .productos__total td {
  background: var(--gf-fondo);
  font-weight: 700;
}

.productos__importe {
  color: var(--gf-primario);
  font-size: 16px;
}

@media (max-width: 640px) {
  .detalle__titulo {
    font-size: 20px;
  }

  .datos {
    grid-template-columns: minmax(0, 1fr);
  }

  .tarjeta {
    padding: 16px;
  }
}
</style>
