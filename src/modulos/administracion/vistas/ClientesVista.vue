<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import AvisoVue from '@/componentes/AvisoVue.vue'
import BotonVue from '@/componentes/BotonVue.vue'
import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import LayoutPanelVue from '@/componentes/LayoutPanelVue.vue'
import ModalConfirmacion from '@/componentes/ModalConfirmacion.vue'
import ModalNuevoCliente, { type DatosFormularioCliente } from '@/componentes/ModalNuevoCliente.vue'
import TablaVue, { type ColumnaTabla } from '@/componentes/TablaVue.vue'
import {
  obtenerMenuNavegacion,
  obtenerNombreUsuario,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import {
  ErrorClientes,
  actualizarClienteAPI,
  cambiarEstatusClienteAPI,
  crearClienteAPI,
  eliminarClienteAPI,
  obtenerClientesAPI,
  type ClienteAPI,
} from '@/modulos/administracion/servicios/servicioClientes'
import { ESTATUS } from '@/modulos/ventas/controladores/estadosPedido'
import { obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

const nombreUsuario = obtenerNombreUsuario() || 'Usuario'
const itemsNavegacion = obtenerMenuNavegacion()
const esAdministrador = obtenerRolUsuario() === 'administrador'

const MINIMO_CARACTERES_BUSQUEDA = 3
const MAXIMO_COINCIDENCIAS = 50
const MENSAJE_ERROR_CONSULTA = 'No fue posible consultar a los clientes. Intente nuevamente.'

// Estados generales
const clientes = ref<ClienteAPI[]>([])
const cargando = ref(true)
const errorCarga = ref('')

// Estados del buscador (CU-03 / RF-CLI-01)
const textoBusqueda = ref('')
const criterioActivo = ref('')
const errorBusqueda = ref('')

// Estados de modales (CU-16, CU-17 y cambio de estatus)
const mostrarModal = ref(false)
const clienteSeleccionado = ref<ClienteAPI | null>(null)
const mostrarConfirmacionGuardado = ref(false)
const datosPendientesGuardado = ref<DatosFormularioCliente | null>(null)
const errorUsuarioApi = ref('')
const guardandoCliente = ref(false)

const mostrarModalConfirmacion = ref(false)
const clienteACambiar = ref<ClienteAPI | null>(null)
const desactivando = computed(() => clienteACambiar.value?.Estatus === 1)

// Estado para avisos emergentes
const mensajeAviso = ref('')
const varianteAviso = ref<'error' | 'exito'>('exito')

// Estado para controlar qué contraseñas están visibles (guardamos el Id)
const contrasenasVisibles = ref<number[]>([])

// Columnas según rol: RN-15 restringe contraseñas y administración de cuentas a personal administrativo
const columnasClientes = computed<ColumnaTabla[]>(() =>
  esAdministrador
    ? [
        { clave: 'nombre', etiqueta: 'NOMBRE' },
        { clave: 'usuario', etiqueta: 'USUARIO' },
        { clave: 'celular', etiqueta: 'CELULAR' },
        { clave: 'telegram', etiqueta: 'TELEGRAM' },
        { clave: 'contrasena', etiqueta: 'CONTRASEÑA' },
        { clave: 'estado', etiqueta: 'ESTADO' },
        { clave: 'cambios', etiqueta: 'CAMBIOS', alineacion: 'centro' },
      ]
    : [
        { clave: 'nombre', etiqueta: 'NOMBRE' },
        { clave: 'usuario', etiqueta: 'USUARIO' },
        { clave: 'celular', etiqueta: 'CELULAR' },
        { clave: 'telegram', etiqueta: 'TELEGRAM' },
        { clave: 'estado', etiqueta: 'ESTADO' },
      ],
)

async function avisar(texto: string, variante: 'error' | 'exito') {
  mensajeAviso.value = ''
  await nextTick()
  varianteAviso.value = variante
  mensajeAviso.value = texto
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizarTelefono(valor: string): string {
  return valor.replace(/\D/g, '')
}

// Clientes base permitidos para el rol y ordenados alfabéticamente por nombre (RF-CLI-01)
const clientesPermitidos = computed(() => {
  const base = esAdministrador
    ? clientes.value
    : clientes.value.filter((cliente) => cliente.Estatus === 1)

  return [...base].sort((a, b) =>
    a.Nombre.localeCompare(b.Nombre, 'es', { sensitivity: 'base' }),
  )
})

// Coincidencias filtradas por nombre/razón social o teléfono (máximo 50)
const clientesVisibles = computed(() => {
  const criterio = criterioActivo.value
  if (!criterio) {
    return clientesPermitidos.value.slice(0, MAXIMO_COINCIDENCIAS)
  }

  const textoNormalizado = normalizarTexto(criterio)
  const digitosCriterio = normalizarTelefono(criterio)

  return clientesPermitidos.value
    .filter((cliente) => {
      const coincideNombre = normalizarTexto(cliente.Nombre).includes(textoNormalizado)
      const coincideTelefono =
        digitosCriterio.length > 0 &&
        normalizarTelefono(cliente.Telefono || '').includes(digitosCriterio)

      return coincideNombre || coincideTelefono
    })
    .slice(0, MAXIMO_COINCIDENCIAS)
})

function ejecutarBusqueda() {
  const limpio = textoBusqueda.value.trim()

  if (limpio.length === 0) {
    errorBusqueda.value = ''
    criterioActivo.value = ''
    return
  }

  // A1. Criterio insuficiente (< 3 caracteres)
  if (limpio.length < MINIMO_CARACTERES_BUSQUEDA) {
    errorBusqueda.value = 'Capture al menos 3 caracteres para buscar.'
    return
  }

  errorBusqueda.value = ''
  criterioActivo.value = limpio
}

function alEditarBusqueda(nuevoValor: string) {
  textoBusqueda.value = nuevoValor
  const limpio = nuevoValor.trim()

  if (limpio.length === 0) {
    errorBusqueda.value = ''
    criterioActivo.value = ''
  } else if (errorBusqueda.value && limpio.length >= MINIMO_CARACTERES_BUSQUEDA) {
    errorBusqueda.value = ''
  }
}

function limpiarBusqueda() {
  textoBusqueda.value = ''
  criterioActivo.value = ''
  errorBusqueda.value = ''
}

const alternarContrasena = (id: number) => {
  const index = contrasenasVisibles.value.indexOf(id)
  if (index > -1) {
    contrasenasVisibles.value.splice(index, 1)
  } else {
    contrasenasVisibles.value.push(id)
  }
}

const cargarDatosClientes = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    clientes.value = await obtenerClientesAPI()
  } catch {
    // E1. Error de consulta
    errorCarga.value = MENSAJE_ERROR_CONSULTA
  } finally {
    cargando.value = false
  }
}

const abrirModalCrear = () => {
  clienteSeleccionado.value = null
  errorUsuarioApi.value = ''
  datosPendientesGuardado.value = null
  mostrarModal.value = true
}

const abrirModalEditar = (cli: ClienteAPI) => {
  clienteSeleccionado.value = cli
  errorUsuarioApi.value = ''
  datosPendientesGuardado.value = null
  mostrarModal.value = true
}

// CU-16 paso 6 y CU-17 (RF-CLI-03): pedir confirmación antes de crear o guardar cambios
const guardarCliente = (datos: DatosFormularioCliente) => {
  errorUsuarioApi.value = ''
  datosPendientesGuardado.value = datos
  mostrarConfirmacionGuardado.value = true
}

// Cancelar confirmación conserva el estado anterior sin guardar cambios
const cancelarConfirmacionGuardado = () => {
  if (guardandoCliente.value) return
  mostrarConfirmacionGuardado.value = false
  datosPendientesGuardado.value = null
  errorUsuarioApi.value = ''
  mostrarModal.value = false
}

const confirmarGuardadoCliente = async () => {
  const datos = datosPendientesGuardado.value
  if (!datos || guardandoCliente.value) return

  const esEdicion = Boolean(clienteSeleccionado.value)
  guardandoCliente.value = true
  errorUsuarioApi.value = ''

  try {
    if (clienteSeleccionado.value) {
      await actualizarClienteAPI(clienteSeleccionado.value.Id, {
        usuario: datos.usuario,
        contrasena: datos.contrasena || null,
        nombre: datos.nombre,
        telefono: datos.celular,
        usuarioTelegram: datos.usuarioTelegram || null,
        estatus: datos.estatus,
      } as any)
    } else {
      await crearClienteAPI({
        usuario: datos.usuario,
        contrasena: datos.contrasena,
        nombre: datos.nombre,
        telefono: datos.celular,
        usuarioTelegram: datos.usuarioTelegram || null,
        estatus: 1,
      } as any)
    }

    mostrarConfirmacionGuardado.value = false
    mostrarModal.value = false
    datosPendientesGuardado.value = null
    await cargarDatosClientes()

    await avisar(
      esEdicion
        ? 'Cliente actualizado correctamente.'
        : `Cliente ${datos.nombre} registrado correctamente.`,
      'exito',
    )
  } catch (err: unknown) {
    mostrarConfirmacionGuardado.value = false
    if (err instanceof ErrorClientes && err.codigo === 'USUARIO_DUPLICADO') {
      errorUsuarioApi.value = err.message
      return
    }
    const mensajeDefecto = esEdicion
      ? 'No fue posible guardar los cambios. Intente nuevamente.'
      : 'No fue posible registrar al cliente. Intente nuevamente.'
    const mensaje = err instanceof ErrorClientes ? err.message : mensajeDefecto
    await avisar(mensaje, 'error')
  } finally {
    guardandoCliente.value = false
  }
}

const procesandoEstatus = ref(false)
const ESTATUS_EN_PROCESO: number[] = [ESTATUS.creado, ESTATUS.surtido, ESTATUS.enReparto]

const solicitarCambioEstatus = async (cli: ClienteAPI) => {
  if (procesandoEstatus.value) return

  // CU-18 paso 4 y A1: antes de pedir confirmación, verificar que no tenga pedidos en proceso.
  if (cli.Estatus === 1) {
    procesandoEstatus.value = true
    try {
      const pedidosCliente = await obtenerPedidos(cli.Id)
      const tieneEnProceso = pedidosCliente.some((p) => ESTATUS_EN_PROCESO.includes(p.estatus))
      if (tieneEnProceso) {
        await avisar(
          'El cliente tiene pedidos en proceso. Puede darse de baja cuando se entreguen o se cancelen.',
          'error',
        )
        return
      }
    } catch {
      await avisar('No fue posible dar de baja al cliente. Intente nuevamente.', 'error')
      return
    } finally {
      procesandoEstatus.value = false
    }
  }

  clienteACambiar.value = cli
  mostrarModalConfirmacion.value = true
}

const confirmarCambioEstatus = async () => {
  if (!clienteACambiar.value || procesandoEstatus.value) return

  const esBaja = desactivando.value
  procesandoEstatus.value = true
  try {
    if (esBaja) {
      await eliminarClienteAPI(clienteACambiar.value.Id)
    } else {
      await cambiarEstatusClienteAPI(clienteACambiar.value, 1)
    }

    mostrarModalConfirmacion.value = false
    clienteACambiar.value = null
    await cargarDatosClientes()
    await avisar(
      esBaja ? 'Cliente dado de baja correctamente.' : 'Cliente actualizado correctamente.',
      'exito',
    )
  } catch (err: unknown) {
    mostrarModalConfirmacion.value = false
    const mensajeDefecto = esBaja
      ? 'No fue posible dar de baja al cliente. Intente nuevamente.'
      : 'No fue posible guardar los cambios. Intente nuevamente.'
    const mensaje = err instanceof ErrorClientes ? err.message : mensajeDefecto
    await avisar(mensaje, 'error')
  } finally {
    procesandoEstatus.value = false
  }
}

onMounted(() => {
  cargarDatosClientes()
})
</script>

<template>
  <LayoutPanelVue
    titulo="Sistema de Venta a Menudeo"
    :usuario="nombreUsuario"
    :items-navegacion="itemsNavegacion"
    item-activo="Clientes"
  >
    <div class="panel">
      <!-- Encabezado de la pantalla -->
      <div class="panel__bienvenida">
        <div>
          <h1 class="panel__titulo">Clientes</h1>
          <p class="panel__subtitulo">
            {{
              esAdministrador
                ? 'Consulta, registra, modifica y desactiva las cuentas de clientes.'
                : 'Consulta los clientes activos registrados por nombre, razón social o teléfono.'
            }}
          </p>
        </div>

        <div v-if="esAdministrador" class="panel__accion">
          <BotonVue variante="exito" @click="abrirModalCrear">
            <IconoVue nombre="mas" :tamano="16" />
            Nuevo Cliente
          </BotonVue>
        </div>
      </div>

      <!-- Buscador de clientes (CU-03 pasos 2-4 y A1) -->
      <form class="buscador" @submit.prevent="ejecutarBusqueda">
        <div class="buscador__campo">
          <CampoTextoVue
            id="buscar-cliente"
            :model-value="textoBusqueda"
            etiqueta="Buscar cliente"
            marcador="Nombre, razón social o teléfono (mínimo 3 caracteres)"
            icono="lupa"
            compacto
            autocomplete="off"
            @update:model-value="alEditarBusqueda"
          />
          <p v-if="errorBusqueda" class="buscador__error" role="alert">
            {{ errorBusqueda }}
          </p>
        </div>

        <div class="buscador__acciones">
          <BotonVue tipo="submit" variante="primario" compacto :deshabilitado="cargando">
            Buscar
          </BotonVue>
          <BotonVue
            v-if="textoBusqueda || criterioActivo"
            variante="secundario"
            compacto
            @click="limpiarBusqueda"
          >
            Limpiar
          </BotonVue>
        </div>
      </form>

      <!-- Sección de la tabla de clientes -->
      <section>
        <EncabezadoSeccionVue titulo="Clientes" icono="clientes" />

        <div v-if="cargando" class="panel__estado-carga" role="status">
          Cargando clientes...
        </div>

        <div v-else-if="errorCarga" class="panel__estado-error" role="alert">
          <p>{{ errorCarga }}</p>
          <div class="panel__reintentar">
            <BotonVue variante="secundario" compacto @click="cargarDatosClientes">
              Reintentar
            </BotonVue>
          </div>
        </div>

        <TablaVue v-else :columnas="columnasClientes">
          <!-- A2. Sin coincidencias -->
          <tr v-if="clientesVisibles.length === 0">
            <td :colspan="columnasClientes.length" class="panel__sin-resultados">
              {{
                criterioActivo
                  ? 'No se encontraron clientes con ese criterio. Si es un cliente nuevo, solicite su alta al personal administrativo.'
                  : 'No hay clientes registrados.'
              }}
            </td>
          </tr>

          <tr
            v-for="cliente in clientesVisibles"
            :key="cliente.Id"
            class="fila-clicable"
            @click="$router.push(`/detalle-cliente-vista/${cliente.Id}`)"
          >
            <td class="panel__texto-nombre">{{ cliente.Nombre }}</td>
            <td class="panel__texto-fuerte">{{ cliente.Usuario }}</td>
            <td class="panel__texto-fuerte">{{ cliente.Telefono }}</td>
            <td class="panel__texto-fuerte">{{ cliente.UsuarioTelegram || 'N/A' }}</td>

            <!-- Columna de Contraseña (solo administrador) -->
            <td v-if="esAdministrador">
              <div class="panel__password-wrap" @click.stop>
                <span class="panel__texto-pass">
                  {{ contrasenasVisibles.includes(cliente.Id) ? cliente.Contrasena : '••••••••' }}
                </span>
                <button
                  type="button"
                  class="btn-ojo"
                  title="Mostrar/Ocultar contraseña"
                  @click.stop="alternarContrasena(cliente.Id)"
                >
                  <IconoVue :nombre="contrasenasVisibles.includes(cliente.Id) ? 'ojo-cerrado' : 'ojo'" :tamano="16" />
                </button>
              </div>
            </td>

            <td>
              <ChipEstadoVue
                :estado="cliente.Estatus === 1 ? 'entregado' : 'en_preparacion'"
                :etiqueta="cliente.Estatus === 1 ? 'Activo' : 'Inactivo'"
              />
            </td>

            <td v-if="esAdministrador" class="tabla__celda--centro">
              <div class="panel__acciones-fila">
                <button
                  type="button"
                  class="btn-accion btn-accion--editar"
                  aria-label="Editar cliente"
                  @click.stop="abrirModalEditar(cliente)"
                >
                  <IconoVue nombre="lapiz" :tamano="16" />
                </button>
                <button
                  v-if="cliente.Estatus === 1"
                  type="button"
                  class="btn-accion btn-accion--eliminar"
                  aria-label="Desactivar cliente"
                  title="Desactivar cliente"
                  @click.stop="solicitarCambioEstatus(cliente)"
                >
                  <IconoVue nombre="candado" :tamano="16" />
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-accion btn-accion--editar"
                  aria-label="Reactivar cliente"
                  title="Reactivar cliente"
                  @click.stop="solicitarCambioEstatus(cliente)"
                >
                  <IconoVue nombre="check" :tamano="16" />
                </button>
              </div>
            </td>
          </tr>
        </TablaVue>
      </section>
    </div>
  </LayoutPanelVue>

  <ModalNuevoCliente
    v-if="esAdministrador"
    :mostrar="mostrarModal"
    :cliente-editar="clienteSeleccionado"
    :error-usuario-api="errorUsuarioApi"
    :enviando="guardandoCliente"
    @cerrar="mostrarModal = false"
    @limpiar-error-usuario="errorUsuarioApi = ''"
    @guardar="guardarCliente"
  />

  <ModalConfirmacion
    v-if="esAdministrador"
    :mostrar="mostrarConfirmacionGuardado"
    :titulo="clienteSeleccionado ? 'Confirmar cambios' : 'Confirmar registro'"
    :mensaje="
      clienteSeleccionado
        ? `¿Confirma los cambios del cliente ${datosPendientesGuardado?.nombre ?? ''}?`
        : `¿Confirma el registro del cliente ${datosPendientesGuardado?.nombre ?? ''}?`
    "
    :texto-boton-confirmar="clienteSeleccionado ? 'Guardar cambios' : 'Registrar'"
    icono="check"
    variante-confirmar="primario"
    @cerrar="cancelarConfirmacionGuardado"
    @confirmar="confirmarGuardadoCliente"
  />

  <ModalConfirmacion
    v-if="esAdministrador"
    :mostrar="mostrarModalConfirmacion"
    :titulo="desactivando ? 'Confirmar baja del cliente' : '¿Reactivar cliente?'"
    :mensaje="
      desactivando
        ? `¿Confirma la baja del cliente ${clienteACambiar?.Nombre ?? ''}? Ya no puede iniciar sesión.`
        : `'${clienteACambiar?.Nombre ?? ''}' volverá a estar activo y podrá iniciar sesión.`
    "
    :texto-boton-confirmar="desactivando ? 'Dar de baja' : 'Reactivar'"
    :icono="desactivando ? 'candado' : 'check'"
    :variante-confirmar="desactivando ? 'peligro' : 'primario'"
    @cerrar="mostrarModalConfirmacion = false"
    @confirmar="confirmarCambioEstatus"
  />

  <AvisoVue v-model="mensajeAviso" :variante="varianteAviso" />
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1100px;
}

.panel__bienvenida {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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

.panel__accion {
  flex: none;
}

.buscador {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

.buscador__campo {
  flex: 1;
  min-width: 260px;
}

.buscador__error {
  margin: 6px 0 0;
  color: var(--gf-cancelado-punto);
  font-size: 13px;
}

.buscador__acciones {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 24px;
}

.panel__texto-fuerte {
  font-weight: 700;
  color: var(--gf-texto);
}

.panel__texto-nombre {
  font-weight: 600;
  color: var(--gf-texto);
}

.panel__acciones-fila {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.panel__password-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel__texto-pass {
  font-family: monospace;
  font-size: 14px;
  color: var(--gf-texto);
  min-width: 70px;
}

.btn-ojo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--gf-texto-tenue);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.btn-ojo:hover {
  color: var(--gf-texto);
  background: var(--gf-fondo);
}

.panel__estado-carga,
.panel__estado-error {
  padding: 24px;
  text-align: center;
  border: 1px solid var(--gf-borde);
  border-radius: var(--gf-radio);
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

.panel__sin-resultados {
  padding: 32px 16px;
  color: var(--gf-texto-tenue);
  text-align: center;
  white-space: normal;
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
    gap: 24px;
  }
  .panel__titulo {
    font-size: 20px;
  }
}

@media (max-width: 560px) {
  .panel__bienvenida {
    flex-direction: column;
    align-items: stretch;
  }

  .buscador__acciones {
    padding-top: 0;
  }
}
</style>