<script setup lang="ts">
// Barra superior del panel: logo, título de la pantalla, usuario y control de inactividad.

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import BotonVue from '@/componentes/BotonVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import ModalVue from '@/componentes/ModalVue.vue'
import {
  cerrarSesion,
  obtenerIdUsuarioSesion,
  obtenerRolUsuario,
} from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import logo from '@/recursos/logo-transparente.png'

interface Props {
  titulo: string
  /** Nombre del usuario; */
  usuario: string
}

const props = defineProps<Props>()
const enrutador = useRouter()

// Iniciales de las dos primeras palabras del nombre.
const iniciales = computed(() =>
  props.usuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase(),
)

const esCliente = obtenerRolUsuario() === 'cliente'
const idClienteSesion = esCliente ? obtenerIdUsuarioSesion() : null

function irAPerfil(): void {
  if (!idClienteSesion) return
  enrutador.push({ name: 'detalle-cliente', params: { id: idClienteSesion } })
}

// Modal de confirmación de cierre de sesión (CU-02 / RF-ACC-02)
const mostrarModalCerrarSesion = ref(false)

function solicitarCerrarSesion(): void {
  mostrarModalCerrarSesion.value = true
}

function cancelarCerrarSesion(): void {
  // Flujo alterno A1: conserva la sesión activa
  mostrarModalCerrarSesion.value = false
}

function confirmarCerrarSesion(): void {
  mostrarModalCerrarSesion.value = false
  cerrarSesion()
  enrutador.replace({ path: '/inicio-sesion', query: { sesion: 'cerrada' } })
}

// Cierre automático por inactividad: 30 minutos en web (RF-ACC-02)
const TIEMPO_INACTIVIDAD_MS = 30 * 60 * 1000
const INTERVALO_REVISION_MS = 15_000
const EVENTOS_ACTIVIDAD = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointermove'] as const

let ultimaActividad = Date.now()
let temporizadorInactividad: ReturnType<typeof setInterval> | null = null

function registrarActividad(): void {
  ultimaActividad = Date.now()
}

function revisarInactividad(): void {
  if (Date.now() - ultimaActividad >= TIEMPO_INACTIVIDAD_MS) {
    mostrarModalCerrarSesion.value = false
    cerrarSesion()
    enrutador.replace({ path: '/inicio-sesion', query: { sesion: 'expirada' } })
  }
}

function alCambiarVisibilidad(): void {
  if (document.visibilityState === 'visible') {
    revisarInactividad()
  }
}

onMounted(() => {
  ultimaActividad = Date.now()
  for (const evento of EVENTOS_ACTIVIDAD) {
    window.addEventListener(evento, registrarActividad, { passive: true })
  }
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  temporizadorInactividad = setInterval(revisarInactividad, INTERVALO_REVISION_MS)
})

onUnmounted(() => {
  for (const evento of EVENTOS_ACTIVIDAD) {
    window.removeEventListener(evento, registrarActividad)
  }
  document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  if (temporizadorInactividad) clearInterval(temporizadorInactividad)
})
</script>

<template>
  <header class="encabezado">
    <div class="encabezado__marca">
      <img :src="logo" alt="Global Foods México" class="encabezado__logo" />
    </div>

    <span class="encabezado__separador" aria-hidden="true"></span>

    <p class="encabezado__titulo">{{ titulo }}</p>

    <div class="encabezado__usuario">
      <button
        v-if="esCliente && idClienteSesion"
        type="button"
        class="encabezado__perfil"
        title="Ver mi perfil"
        @click="irAPerfil"
      >
        <span class="encabezado__avatar" aria-hidden="true">{{ iniciales }}</span>
        <span class="encabezado__nombre">{{ usuario }}</span>
      </button>

      <template v-else>
        <span class="encabezado__avatar" aria-hidden="true">{{ iniciales }}</span>
        <p class="encabezado__nombre">{{ usuario }}</p>
      </template>

      <BotonVue
        variante="secundario"
        solo-icono
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        @click="solicitarCerrarSesion"
      >
        <IconoVue nombre="salir" :tamano="18" />
      </BotonVue>
    </div>
  </header>

  <ModalVue
    :mostrar="mostrarModalCerrarSesion"
    titulo="¿Desea cerrar sesión?"
    :ancho-maximo="420"
    @cerrar="cancelarCerrarSesion"
  >
    <p class="modal-cierre__texto">
      Se cerrará tu sesión actual en este dispositivo y tendrás que ingresar nuevamente para continuar.
    </p>

    <template #pie>
      <BotonVue variante="secundario" @click="cancelarCerrarSesion">
        Cancelar
      </BotonVue>
      <BotonVue variante="primario" @click="confirmarCerrarSesion">
        Cerrar sesión
      </BotonVue>
    </template>
  </ModalVue>
</template>

<style scoped>
.encabezado {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 60px;
  padding: 0 28px;
  background: var(--gf-primario);
  color: var(--gf-superficie);
}

.encabezado__marca {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 3px;
  border-radius: 6px;
  background: var(--gf-superficie);
}

.encabezado__perfil {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.encabezado__perfil:hover {
  background: color-mix(in srgb, var(--gf-superficie) 14%, transparent);
}

.encabezado__logo {
  display: block;
  max-width: 100%;
  max-height: 100%;
}

.encabezado__separador {
  flex: none;
  width: 1px;
  height: 28px;
  background: color-mix(in srgb, var(--gf-superficie) 18%, transparent);
}

.encabezado__titulo {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 18px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.encabezado__usuario {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
}

.encabezado__avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--gf-secundario);
  font-size: 13px;
  font-weight: 700;
}

.encabezado__nombre {
  margin: 0 8px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.modal-cierre__texto {
  margin: 0;
  color: var(--gf-texto-tenue);
  font-size: 14px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .encabezado {
    gap: 12px;
    height: 56px;
    padding: 0 16px;
  }

  .encabezado__separador,
  .encabezado__nombre {
    display: none;
  }

  .encabezado__titulo {
    font-size: 16px;
  }
}
</style>