<script setup lang="ts">
// Reparto (CU-10, RF-REP-01 y RF-REP-02), para el perfil repartidor. Pensada también para el
// navegador del teléfono.
// - Listos para reparto: pedidos Surtidos a domicilio. Se eligen uno o varios e "Iniciar reparto"
//   los pasa a En reparto. Si otro repartidor ya tomó alguno, no se pasa ninguno y se avisa (A2).
// - En reparto: los del repartidor de la sesión. "Registrar entrega" cobra y deja el pedido
//   Entregado (igual que "Registrar entrega" de la app móvil). "No se entregó" pide el motivo y lo
//   regresa a Surtido (A3); Reportes lo cuenta como entrega no realizada.
// La lista no muestra importes (RF-REP-01); el total solo aparece al cobrar. Se actualiza cada
// minuto, salvo mientras hay una ventana abierta o un cambio en camino.

import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import AvisoVue from '@/componentes/AvisoVue.vue'
import BotonVue from '@/componentes/BotonVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import { obtenerMenuNavegacion, obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import ModalEntregaNoRealizadaVue from '@/modulos/reparto/componentes/ModalEntregaNoRealizadaVue.vue'
import { MENSAJES_REPARTO, usarReparto, type PedidoReparto } from '@/modulos/reparto/controladores/usarReparto'
import ModalRegistrarPagoVue from '@/modulos/ventas/componentes/ModalRegistrarPagoVue.vue'
import { formatearFecha, formatearKg, urlMapsDireccion } from '@/modulos/ventas/controladores/formatosPedido'
import type { PagoEntrega } from '@/modulos/ventas/controladores/pagoEntrega'
import { MENSAJE_SIN_PERMISO, perfilPuedeRepartir } from '@/modulos/ventas/controladores/permisosPedidos'
import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
import { usarActualizacionPeriodica } from '@/modulos/ventas/controladores/usarActualizacionPeriodica'
import {
  ErrorPedidos,
  iniciarReparto,
  registrarEntregaNoRealizada,
  registrarPago,
} from '@/modulos/ventas/servicios/servicioPedidos'

const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const enrutador = useRouter()

const puedeRepartir = perfilPuedeRepartir()
const reparto = reactive(usarReparto({ alVencerSesion: () => salirPorSesionVencida(enrutador) }))

const MENSAJES = {
  sinConexion: 'El cambio no se guardó por falta de conexión. Intente nuevamente.',
  errorIniciar: 'No fue posible iniciar el reparto. Intente nuevamente.',
  errorEntrega: 'No fue posible registrar la entrega. Intente nuevamente.',
  errorNoEntrega: 'No fue posible registrar la entrega no realizada. Intente nuevamente.',
  iniciados: (folios: number[]) =>
    folios.length === 1
      ? `Pedido #${folios[0]} en reparto.`
      : `${folios.length} pedidos en reparto: ${folios.map((id) => `#${id}`).join(', ')}.`,
  fallidos: (folios: number[]) =>
    `No se pudo iniciar el reparto de ${folios.map((id) => `#${id}`).join(', ')}. Intente nuevamente.`,
  entregado: (folio: string) => `Entrega registrada. El pedido ${folio} quedó Entregado.`,
  noEntregado: (folio: string) => `Entrega no realizada registrada. El pedido ${folio} regresó a Surtido.`,
}

const mensajeAviso = ref('')
const varianteAviso = ref<'error' | 'exito'>('error')

async function avisar(texto: string, variante: 'error' | 'exito') {
  mensajeAviso.value = ''
  await nextTick()
  varianteAviso.value = variante
  mensajeAviso.value = texto
}

onMounted(() => {
  if (puedeRepartir) reparto.cargar()
})

// --- Iniciar reparto (pasos 4–6) ---

const iniciando = ref(false)
const totalSeleccionados = computed(() => reparto.seleccionados.size)

async function alIniciarReparto() {
  const ids = [...reparto.seleccionados]
  if (ids.length === 0 || iniciando.value) return
  iniciando.value = true
  try {
    const resultado = await iniciarReparto(ids)
    reparto.limpiarSeleccion()
    if (resultado.fallidos.length > 0) {
      avisar(
        resultado.iniciados.length > 0
          ? `${MENSAJES.iniciados(resultado.iniciados)} ${MENSAJES.fallidos(resultado.fallidos)}`
          : MENSAJES.fallidos(resultado.fallidos),
        'error',
      )
    } else {
      avisar(MENSAJES.iniciados(resultado.iniciados), 'exito')
    }
  } catch (error) {
    await alFallarCambio(error, MENSAJES.errorIniciar)
    // A2: el flujo regresa al paso 2 con la lista actualizada.
    if (error instanceof ErrorPedidos && error.motivo === 'datos_invalidos') reparto.limpiarSeleccion()
  } finally {
    iniciando.value = false
    await reparto.cargar({ silencioso: true })
  }
}

// --- Registrar entrega (pasos 7–10) y entrega no realizada (A3) ---

const pedidoEnVentana = ref<PedidoReparto | null>(null)
const mostrarEntrega = ref(false)
const mostrarNoEntrega = ref(false)
const enviando = ref(false)

const folioEnVentana = computed(() => (pedidoEnVentana.value ? `#${pedidoEnVentana.value.id}` : ''))

function abrirEntrega(pedido: PedidoReparto) {
  pedidoEnVentana.value = pedido
  mostrarEntrega.value = true
}

function abrirNoEntrega(pedido: PedidoReparto) {
  pedidoEnVentana.value = pedido
  mostrarNoEntrega.value = true
}

function cerrarVentanas() {
  mostrarEntrega.value = false
  mostrarNoEntrega.value = false
}

/**
 * Errores comunes. Con 400/409 (o si la consulta previa ya no lo permite, p. ej. otro repartidor
 * lo tomó) se cierra la ventana, se muestra el mensaje y se recarga. Sin conexión, la ventana se
 * queda abierta para reintentar (RF-REP-02).
 */
async function alFallarCambio(error: unknown, mensajeError: string) {
  const errorPedidos = error instanceof ErrorPedidos ? error : null
  if (errorPedidos?.motivo === 'sesion') {
    salirPorSesionVencida(enrutador)
    return
  }
  if (errorPedidos?.motivo === 'conexion') {
    avisar(MENSAJES.sinConexion, 'error')
    return
  }
  if (errorPedidos?.motivo === 'sin_permiso') {
    cerrarVentanas()
    avisar(errorPedidos.mensajeApi || MENSAJE_SIN_PERMISO, 'error')
    return
  }
  if (errorPedidos?.motivo === 'datos_invalidos') {
    cerrarVentanas()
    avisar(errorPedidos.mensajeApi || mensajeError, 'error')
    await reparto.cargar({ silencioso: true })
    return
  }
  avisar(mensajeError, 'error')
}

async function alConfirmarEntrega(pago: PagoEntrega, notas: string | null, comprobante: File | null) {
  const pedido = pedidoEnVentana.value
  if (!pedido) return
  enviando.value = true
  try {
    await registrarPago(pedido.id, pago, notas, comprobante)
    mostrarEntrega.value = false
    avisar(MENSAJES.entregado(`#${pedido.id}`), 'exito')
    await reparto.cargar({ silencioso: true })
  } catch (error) {
    await alFallarCambio(error, MENSAJES.errorEntrega)
  } finally {
    enviando.value = false
  }
}

async function alConfirmarNoEntrega(motivo: string) {
  const pedido = pedidoEnVentana.value
  if (!pedido) return
  enviando.value = true
  try {
    await registrarEntregaNoRealizada(pedido.id, motivo)
    mostrarNoEntrega.value = false
    avisar(MENSAJES.noEntregado(`#${pedido.id}`), 'exito')
    await reparto.cargar({ silencioso: true })
  } catch (error) {
    await alFallarCambio(error, MENSAJES.errorNoEntrega)
  } finally {
    enviando.value = false
  }
}

usarActualizacionPeriodica(() => {
  const ocupado = iniciando.value || enviando.value || mostrarEntrega.value || mostrarNoEntrega.value
  if (puedeRepartir && !ocupado) reparto.cargar({ silencioso: true })
})

function textoProducto(linea: PedidoReparto['lineas'][number]): string {
  return `${linea.talla || `Producto ${linea.codigoProducto ?? ''}`.trim()} · ${formatearKg(linea.cantidadKg)}`
}
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Reparto"
  >
    <div class="reparto">
      <div>
        <h1 class="reparto__titulo">Reparto</h1>
        <p class="reparto__subtitulo">Toma los pedidos surtidos a domicilio y registra cómo salió cada entrega.</p>
        <p v-if="reparto.horaActualizacion" class="reparto__actualizado">
          Actualizado a las {{ reparto.horaActualizacion }} · se actualiza cada minuto
        </p>
      </div>

      <p v-if="!puedeRepartir" class="reparto__error" role="alert">{{ MENSAJE_SIN_PERMISO }}</p>

      <p v-else-if="reparto.cargando" class="reparto__mensaje" role="status">{{ MENSAJES_REPARTO.cargando }}</p>

      <div v-else-if="reparto.errorCarga" class="reparto__mensaje">
        <p class="reparto__error" role="alert">{{ reparto.mensajeError || MENSAJES_REPARTO.errorCarga }}</p>
        <div class="reparto__reintentar">
          <BotonVue variante="secundario" compacto @click="reparto.cargar()">Reintentar</BotonVue>
        </div>
      </div>

      <template v-else>
        <!-- Pasos 2–6: listos para reparto -->
        <section class="tarjeta" aria-labelledby="reparto-listos">
          <div class="tarjeta__encabezado">
            <EncabezadoSeccionVue id="reparto-listos" :titulo="`Listos para reparto (${reparto.listos.length})`" icono="caja" />
            <div v-if="reparto.listos.length > 0" class="tarjeta__accion">
              <BotonVue
                variante="exito"
                compacto
                :deshabilitado="totalSeleccionados === 0"
                :cargando="iniciando"
                @click="alIniciarReparto"
              >
                <IconoVue nombre="camion" :tamano="16" />
                Iniciar reparto{{ totalSeleccionados > 0 ? ` (${totalSeleccionados})` : '' }}
              </BotonVue>
            </div>
          </div>

          <p v-if="reparto.listos.length === 0" class="reparto__vacio">{{ MENSAJES_REPARTO.sinListos }}</p>

          <ul v-else class="pedidos" aria-label="Pedidos listos para reparto">
            <li v-for="pedido in reparto.listos" :key="pedido.id">
              <label class="pedido pedido--elegible" :class="{ 'pedido--elegido': reparto.seleccionados.has(pedido.id) }">
                <input
                  class="pedido__casilla"
                  type="checkbox"
                  :checked="reparto.seleccionados.has(pedido.id)"
                  :disabled="iniciando"
                  :aria-label="`Elegir el pedido #${pedido.id} de ${pedido.cliente}`"
                  @change="reparto.alternarSeleccion(pedido.id)"
                />
                <div class="pedido__cuerpo">
                  <div class="pedido__cabecera">
                    <strong class="pedido__folio">#{{ pedido.id }}</strong>
                    <span class="pedido__cliente">{{ pedido.cliente }}</span>
                    <span class="pedido__fecha">Registrado {{ formatearFecha(pedido.registrado) }}</span>
                  </div>
                  <p class="pedido__dato">{{ pedido.sucursal }}</p>
                  <p class="pedido__dato">
                    {{ pedido.direccion ?? 'Sin dirección registrada' }}
                    <a
                      v-if="pedido.direccion"
                      class="pedido__enlace"
                      :href="urlMapsDireccion(pedido.direccion)"
                      target="_blank"
                      rel="noopener"
                      @click.stop
                    >Ver en Maps</a>
                  </p>
                  <p v-if="pedido.telefono" class="pedido__dato">
                    Tel. <a class="pedido__enlace" :href="`tel:${pedido.telefono}`" @click.stop>{{ pedido.telefono }}</a>
                  </p>
                  <p class="pedido__productos">
                    {{ pedido.lineas.map(textoProducto).join(' · ') || 'Sin productos' }}
                    <span class="pedido__kg">({{ formatearKg(pedido.totalKg) }})</span>
                  </p>
                  <p v-if="pedido.notas" class="pedido__notas">{{ pedido.notas }}</p>
                </div>
              </label>
            </li>
          </ul>
        </section>

        <!-- Pasos 7–10 y A3: en reparto -->
        <section class="tarjeta" aria-labelledby="reparto-en-curso">
          <div class="tarjeta__encabezado">
            <EncabezadoSeccionVue id="reparto-en-curso" :titulo="`En reparto (${reparto.enReparto.length})`" icono="camion" />
          </div>

          <p v-if="reparto.enReparto.length === 0" class="reparto__vacio">{{ MENSAJES_REPARTO.sinEnReparto }}</p>

          <ul v-else class="pedidos" aria-label="Pedidos en reparto">
            <li v-for="pedido in reparto.enReparto" :key="pedido.id" class="pedido">
              <div class="pedido__cuerpo">
                <div class="pedido__cabecera">
                  <strong class="pedido__folio">#{{ pedido.id }}</strong>
                  <span class="pedido__cliente">{{ pedido.cliente }}</span>
                </div>
                <p class="pedido__dato">{{ pedido.sucursal }}</p>
                <p class="pedido__dato">
                  {{ pedido.direccion ?? 'Sin dirección registrada' }}
                  <a
                    v-if="pedido.direccion"
                    class="pedido__enlace"
                    :href="urlMapsDireccion(pedido.direccion)"
                    target="_blank"
                    rel="noopener"
                  >Ver en Maps</a>
                </p>
                <p v-if="pedido.telefono" class="pedido__dato">
                  Tel. <a class="pedido__enlace" :href="`tel:${pedido.telefono}`">{{ pedido.telefono }}</a>
                </p>
                <p class="pedido__productos">
                  {{ pedido.lineas.map(textoProducto).join(' · ') || 'Sin productos' }}
                  <span class="pedido__kg">({{ formatearKg(pedido.totalKg) }})</span>
                </p>
                <p v-if="pedido.notas" class="pedido__notas">{{ pedido.notas }}</p>

                <div class="pedido__acciones">
                  <BotonVue variante="exito" compacto @click="abrirEntrega(pedido)">
                    <IconoVue nombre="check" :tamano="16" />
                    Registrar entrega
                  </BotonVue>
                  <BotonVue variante="secundario" compacto @click="abrirNoEntrega(pedido)">
                    <IconoVue nombre="alerta" :tamano="16" />
                    No se entregó
                  </BotonVue>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </LayoutPanelVue>

  <ModalRegistrarPagoVue
    :mostrar="mostrarEntrega"
    modo="entrega"
    :folio="folioEnVentana"
    :total="pedidoEnVentana?.total ?? 0"
    :notas="pedidoEnVentana?.notas ?? ''"
    :enviando="enviando"
    @cerrar="mostrarEntrega = false"
    @confirmar="alConfirmarEntrega"
  />

  <ModalEntregaNoRealizadaVue
    :mostrar="mostrarNoEntrega"
    :folio="folioEnVentana"
    :enviando="enviando"
    @cerrar="mostrarNoEntrega = false"
    @confirmar="alConfirmarNoEntrega"
  />

  <AvisoVue v-model="mensajeAviso" :variante="varianteAviso" />
</template>

<style scoped>
.reparto {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1100px;
}

.reparto :where(p, ul) {
  margin: 0;
}

.reparto__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 24px;
  font-weight: 700;
}

.reparto__subtitulo {
  margin-top: 6px;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.reparto__actualizado {
  margin-top: 4px;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.reparto__mensaje {
  padding: 32px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
}

.reparto__error {
  color: var(--gf-cancelado-fg);
}

.reparto__reintentar {
  display: inline-flex;
  margin-top: 12px;
}

.reparto__vacio {
  padding: 20px 4px 4px;
  color: var(--gf-texto-tenue);
  font-size: 14px;
}

.tarjeta {
  padding: 20px;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio);
  background: var(--gf-superficie);
}

.tarjeta__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tarjeta__accion {
  display: grid;
  margin-left: auto;
}

.pedidos {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 0;
  list-style: none;
}

.pedido {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--gf-borde);
  border-radius: 10px;
  background: var(--gf-superficie);
}

.pedido--elegible {
  cursor: pointer;
}

.pedido--elegido {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-secundario) 6%, var(--gf-superficie));
}

.pedido__casilla {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
  accent-color: var(--gf-secundario);
}

.pedido__cuerpo {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pedido__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.pedido__folio {
  color: var(--gf-primario);
  font-size: 15px;
}

.pedido__cliente {
  color: var(--gf-texto);
  font-size: 15px;
  font-weight: 600;
}

.pedido__fecha {
  margin-left: auto;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.pedido__dato {
  color: var(--gf-texto);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.pedido__enlace {
  margin-left: 6px;
  color: var(--gf-secundario);
  font-weight: 600;
}

.pedido__productos {
  margin-top: 4px;
  color: var(--gf-texto);
  font-size: 13px;
}

.pedido__kg {
  color: var(--gf-texto-tenue);
}

.pedido__notas {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--gf-fondo);
  color: var(--gf-texto);
  font-size: 13px;
}

.pedido__acciones {
  display: grid;
  grid-auto-flow: column;
  justify-content: start;
  gap: 8px;
  margin-top: 8px;
}

@media (max-width: 600px) {
  .tarjeta {
    padding: 16px;
  }

  .pedido__fecha {
    margin-left: 0;
    width: 100%;
  }

  .tarjeta__accion {
    width: 100%;
  }

  .pedido__acciones {
    grid-auto-flow: row;
    justify-content: stretch;
  }
}
</style>
