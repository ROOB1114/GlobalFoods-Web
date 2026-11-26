  <script setup lang="ts">
  // Pantalla Editar pedido (RF-PED-02): solo un pedido Pendiente. Reutiliza las secciones, el
  // resumen y los modales de Nuevo pedido; el estado y las reglas viven en usarEditarPedido().
  // El cliente no cambia. Al guardar regresa al detalle, que avisa "Pedido actualizado
  // correctamente."; si falla, se queda aquí sin perder lo capturado.
  // Salir con cambios sin guardar (flecha, Cancelar, menú lateral o botón atrás) pide confirmar
  // que se descartan.

  import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
  import { RouterLink, onBeforeRouteLeave, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'

  import AvisoVue from '@/componentes/AvisoVue.vue'
  import BotonVue from '@/componentes/BotonVue.vue'
  import IconoVue from '@/componentes/IconoVue.vue'
  import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
  import { obtenerMenuNavegacion, obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
  import ModalAgregarProductoVue from '@/modulos/ventas/componentes/ModalAgregarProductoVue.vue'
  import ModalConfirmarPedidoVue from '@/modulos/ventas/componentes/ModalConfirmarPedidoVue.vue'
  import ModalDescartarPedidoVue from '@/modulos/ventas/componentes/ModalDescartarPedidoVue.vue'
  import ResumenPedidoVue from '@/modulos/ventas/componentes/ResumenPedidoVue.vue'
  import SeccionClienteVue from '@/modulos/ventas/componentes/SeccionClienteVue.vue'
  import SeccionEntregaVue from '@/modulos/ventas/componentes/SeccionEntregaVue.vue'
  import SeccionProductosVue from '@/modulos/ventas/componentes/SeccionProductosVue.vue'
  import SelectorSucursalVue from '@/modulos/ventas/componentes/SelectorSucursalVue.vue'
  import { salirPorSesionVencida } from '@/modulos/ventas/controladores/sesionVencida'
  import { MENSAJES_DETALLE, mensajeNoEncontrado } from '@/modulos/ventas/controladores/usarDetallePedido'
  import {
    AVISO_PEDIDO_ACTUALIZADO,
    MENSAJES_EDICION,
    usarEditarPedido,
  } from '@/modulos/ventas/controladores/usarEditarPedido'
  import { MENSAJES } from '@/modulos/ventas/controladores/usarFormularioPedido'
  import { descartarClientesEnMemoria } from '@/modulos/ventas/servicios/servicioClientesVentas'
  import { ErrorPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

  const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
  const itemsNavegacion = obtenerMenuNavegacion()

  const enrutador = useRouter()
  // La ruta solo acepta dígitos (/pedidos/:id(\d+)/editar).
  const id = Number(useRoute().params.id)
  const folio = `#${id}`
  const rutaDetalle = { name: 'detalle-pedido', params: { id } }

  const pedido = reactive(
    usarEditarPedido(id, {
      alFallarSucursales: () => avisar(MENSAJES.errorSucursales),
      alVencerSesion: alExpirarSesion,
    }),
  )

  const mostrarAgregarProducto = ref(false)
  const mostrarConfirmacion = ref(false)
  const mostrarDescartar = ref(false)
  const mensajeAviso = ref('')

  // Ruta a la que se quería ir cuando se pidió confirmar el descarte.
  let destinoPendiente: RouteLocationRaw | null = null
  // Ya se guardó o se confirmó el descarte: la salida que sigue no vuelve a preguntar.
  let salidaConfirmada = false

  onMounted(pedido.cargar)

  // La lista de clientes se guarda en memoria solo mientras esta pantalla está abierta.
  onUnmounted(descartarClientesEnMemoria)

  async function avisar(texto: string) {
    // Se vacía primero para que un mensaje repetido se vuelva a mostrar y a anunciar.
    mensajeAviso.value = ''
    await nextTick()
    mensajeAviso.value = texto
  }

  async function alGuardar() {
    const idConError = pedido.validar()
    if (idConError) {
      await nextTick()
      document.getElementById(idConError)?.focus()
      return
    }
    mostrarConfirmacion.value = true
  }

  async function alConfirmar() {
    try {
      const guardado = await pedido.guardar()
      if (!guardado) return
      salidaConfirmada = true
      mostrarConfirmacion.value = false
      // replace: "atrás" desde el detalle no regresa al formulario ya guardado.
      enrutador.replace({ ...rutaDetalle, query: { aviso: AVISO_PEDIDO_ACTUALIZADO } })
    } catch (error) {
      mostrarConfirmacion.value = false
      const errorPedidos = error instanceof ErrorPedidos ? error : null
      if (errorPedidos?.motivo === 'sesion') {
        alExpirarSesion()
        return
      }
      avisar(mensajeErrorGuardar(errorPedidos))
    }
  }

  function mensajeErrorGuardar(error: ErrorPedidos | null): string {
    if (error?.motivo === 'conexion') return MENSAJES.sinConexion
    // 400/409: la API rechazó los datos, o el pedido ya no está Pendiente; el mensaje dice por qué.
    if (error?.motivo === 'datos_invalidos' && error.mensajeApi) return error.mensajeApi
    return MENSAJES_EDICION.errorGuardar
  }

  // La API rechazó el token: se cierra la sesión y se pide entrar de nuevo, sin preguntar por
  // el descarte (con la sesión vencida, los cambios ya no se pueden guardar).
  function alExpirarSesion() {
    salidaConfirmada = true
    salirPorSesionVencida(enrutador)
  }

  function alCancelar() {
    if (!pedido.hayCambios) {
      enrutador.push(rutaDetalle)
      return
    }
    destinoPendiente = rutaDetalle
    mostrarDescartar.value = true
  }

  function alSeguirEditando() {
    destinoPendiente = null
    mostrarDescartar.value = false
  }

  function alDescartar() {
    salidaConfirmada = true
    mostrarDescartar.value = false
    enrutador.push(destinoPendiente ?? rutaDetalle)
  }

  // Cualquier salida con cambios sin guardar (menú lateral, botón atrás, cerrar sesión) pide confirmar.
  onBeforeRouteLeave((destino) => {
    if (salidaConfirmada || !pedido.hayCambios) return true
    if (pedido.enviando) return false

    destinoPendiente = destino.fullPath
    mostrarAgregarProducto.value = false
    mostrarConfirmacion.value = false
    mostrarDescartar.value = true
    return false
  })
  </script>

  <template>
    <LayoutPanelVue
      titulo="Sistema de Venta a Menudeo"
      :usuario="nombreUsuario"
      :items-navegacion="itemsNavegacion"
      item-activo="Pedidos"
    >
      <div class="editar-pedido">
        <nav class="migas" aria-label="Ruta de navegación">
          <ol class="migas__lista">
            <li><RouterLink :to="{ name: 'pedidos' }" class="migas__enlace">Pedidos</RouterLink></li>
            <li>
              <span class="migas__separador" aria-hidden="true">›</span>
              <RouterLink :to="rutaDetalle" class="migas__enlace">Pedido {{ folio }}</RouterLink>
            </li>
            <li aria-current="page">
              <span class="migas__separador" aria-hidden="true">›</span>
              Editar
            </li>
          </ol>
        </nav>

        <div class="editar-pedido__encabezado">
          <button type="button" class="btn-regresar" :aria-label="`Volver al pedido ${folio}`" @click="alCancelar">
            <IconoVue nombre="flecha-izquierda" :tamano="20" />
          </button>
          <h1 id="editar-pedido-titulo" class="editar-pedido__titulo">Editar pedido {{ folio }}</h1>
        </div>

        <p v-if="pedido.cargando" class="editar-pedido__mensaje" role="status">{{ MENSAJES_DETALLE.cargando }}</p>

        <div v-else-if="pedido.noEncontrado" class="editar-pedido__mensaje">
          <p>{{ mensajeNoEncontrado(id) }}</p>
          <RouterLink :to="{ name: 'pedidos' }" class="editar-pedido__enlace">Volver a Pedidos</RouterLink>
        </div>
        
        <div v-else-if="pedido.errorCarga" class="editar-pedido__mensaje">
          <p class="editar-pedido__error" role="alert">{{ MENSAJES_DETALLE.errorCarga }}</p>
          <div class="editar-pedido__reintentar">
            <BotonVue variante="secundario" compacto @click="pedido.cargar">Reintentar</BotonVue>
          </div>
        </div>

        <div v-else-if="pedido.estadoNoEditable" class="editar-pedido__mensaje">
          <p>{{ MENSAJES_EDICION.noEditable(pedido.estadoNoEditable) }}</p>
          <RouterLink :to="rutaDetalle" class="editar-pedido__enlace">Volver al pedido {{ folio }}</RouterLink>
        </div>

        <div v-else class="editar-pedido__rejilla">
          <form
            class="editar-pedido__formulario"
            novalidate
            aria-labelledby="editar-pedido-titulo"
            @submit.prevent
          >
            <SeccionClienteVue v-model="pedido.cliente" class="editar-pedido__tarjeta" fijo>
              <SelectorSucursalVue
                v-model="pedido.sucursal"
                :sucursales="pedido.sucursales"
                :cargando="pedido.cargandoSucursales"
                :error-consulta="pedido.errorSucursales"
                :error="pedido.errores.sucursal"
                :recoleccion="pedido.modalidad === 'recoleccion'"
                @reintentar="pedido.cargarSucursales"
              />
            </SeccionClienteVue>

            <SeccionProductosVue
              class="editar-pedido__tarjeta"
              :renglones="pedido.renglones"
              :resumen="pedido.resumen"
              :errores-cantidad="pedido.erroresCantidad"
              :error="pedido.errores.productos"
              :cargando-inventario="pedido.cargandoInventario"
              :error-inventario="pedido.errorInventario"
              @agregar="mostrarAgregarProducto = true"
              @quitar="pedido.quitarRenglon"
              @cambiar-cantidad="pedido.cambiarCantidad"
              @aumentar="pedido.aumentarCantidad"
              @disminuir="pedido.disminuirCantidad"
            />

            <SeccionEntregaVue
              v-model:modalidad="pedido.modalidad"
              v-model:observaciones="pedido.observaciones"
              class="editar-pedido__tarjeta"
              :sucursal="pedido.sucursal"
              :errores="pedido.errores"
            />
          </form>

          <ResumenPedidoVue
            class="editar-pedido__tarjeta editar-pedido__resumen"
            :resumen="pedido.resumen"
            :enviando="pedido.enviando"
            :folio-edicion="folio"
            @registrar="alGuardar"
            @cancelar="alCancelar"
          />
        </div>
      </div>
    </LayoutPanelVue>

    <ModalAgregarProductoVue
      :mostrar="mostrarAgregarProducto"
      :productos="pedido.productosInventario"
      :agregados="pedido.renglones.map((renglon) => renglon.producto.productoId)"
      @cerrar="mostrarAgregarProducto = false"
      @agregar="pedido.agregarProducto"
    />

    <ModalConfirmarPedidoVue
      :mostrar="mostrarConfirmacion"
      estado="confirmar"
      :resumen="pedido.resumen"
      :enviando="pedido.enviando"
      :folio-edicion="folio"
      @confirmar="alConfirmar"
      @corregir="mostrarConfirmacion = false"
    />

    <ModalDescartarPedidoVue
      :mostrar="mostrarDescartar"
      :folio-edicion="folio"
      @seguir="alSeguirEditando"
      @descartar="alDescartar"
    />

    <AvisoVue v-model="mensajeAviso" />
  </template>

  <style scoped>
  .editar-pedido :where(p) {
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
  .editar-pedido__enlace {
    color: var(--gf-secundario);
    font-weight: 600;
    text-decoration: none;
  }

  .migas__enlace:hover,
  .editar-pedido__enlace:hover {
    text-decoration: underline;
  }

  .editar-pedido__encabezado {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
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
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .btn-regresar:hover {
    background: var(--gf-fondo);
    border-color: var(--gf-texto-tenue);
  }

  .editar-pedido__titulo {
    margin: 0;
    color: var(--gf-texto);
    font-size: 24px;
    font-weight: 700;
  }

  .editar-pedido__mensaje {
    margin-top: 20px;
    padding: 32px 16px;
    border: 1px solid var(--gf-borde);
    border-radius: var(--gf-radio);
    color: var(--gf-texto-tenue);
    font-size: 14px;
    text-align: center;
  }

  .editar-pedido__mensaje > p + .editar-pedido__enlace {
    display: inline-block;
    margin-top: 12px;
  }

  .editar-pedido__error {
    color: var(--gf-cancelado-fg);
  }

  .editar-pedido__reintentar {
    display: inline-flex;
    margin-top: 12px;
  }

  .editar-pedido__rejilla {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 350px;
    gap: 24px;
    align-items: start;
    margin-top: 20px;
  }

  .editar-pedido__formulario {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .editar-pedido__tarjeta {
    padding: 20px;
    border: 1px solid var(--gf-borde);
    border-radius: var(--gf-radio);
    background: var(--gf-superficie);
  }

  .editar-pedido__resumen {
    position: sticky;
    top: 24px;
    max-height: calc(100dvh - 48px);
  }

  @media (max-width: 900px) {
    .editar-pedido__titulo {
      font-size: 20px;
    }

    .editar-pedido__rejilla {
      grid-template-columns: minmax(0, 1fr);
    }

    .editar-pedido__resumen {
      position: static;
      max-height: none;
    }
  }

  @media (max-width: 560px) {
    .editar-pedido__tarjeta {
      padding: 16px;
    }
  }
  </style>
