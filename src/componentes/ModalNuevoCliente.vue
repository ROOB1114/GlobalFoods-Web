<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import BotonVue from '@/componentes/BotonVue.vue'
import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import ChipEstadoVue from '@/componentes/ChipEstadoVue.vue'
import type { ClienteAPI } from '@/modulos/administracion/servicios/servicioClientes'
import logo from '@/recursos/logo-transparente.png'

export interface DatosFormularioCliente {
  nombre: string
  celular: string
  usuario: string
  usuarioTelegram: string
  contrasena: string
  estatus: 0 | 1
}

interface Props {
  mostrar: boolean
  clienteEditar?: ClienteAPI | null
  errorUsuarioApi?: string
  enviando?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mostrar: false,
  clienteEditar: null,
  errorUsuarioApi: '',
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  (e: 'limpiar-error-usuario'): void
  (e: 'guardar', datos: DatosFormularioCliente): void
}>()

const nombre = ref('')
const celular = ref('')
const usuario = ref('')
const usuarioTelegram = ref('')
const contrasena = ref('')
const estatus = ref<0 | 1>(1)

const errores = reactive({
  nombre: '',
  celular: '',
  usuario: '',
  usuarioTelegram: '',
  contrasena: '',
})

const contrasenaCambio = computed(() => {
  if (!props.clienteEditar) return true
  const original = props.clienteEditar.Contrasena || ''
  return contrasena.value.length > 0 && contrasena.value !== original
})

// RF-CLI-03: si no se realizó ningún cambio, el botón Guardar permanece deshabilitado.
const hayCambios = computed(() => {
  const original = props.clienteEditar
  if (!original) return true

  return (
    nombre.value.trim() !== (original.Nombre || '').trim() ||
    celular.value.trim() !== (original.Telefono || '').trim() ||
    usuario.value.trim() !== (original.Usuario || '').trim() ||
    usuarioTelegram.value.trim() !== (original.UsuarioTelegram || '').trim() ||
    estatus.value !== (original.Estatus === 0 ? 0 : 1) ||
    contrasenaCambio.value
  )
})

function limpiarErrores() {
  errores.nombre = ''
  errores.celular = ''
  errores.usuario = ''
  errores.usuarioTelegram = ''
  errores.contrasena = ''
}

function validar(): boolean {
  limpiarErrores()
  const esAlta = !props.clienteEditar
  const nombreLimpio = nombre.value.trim()
  const celularLimpio = celular.value.trim()
  const usuarioLimpio = usuario.value.trim()
  const telegramLimpio = usuarioTelegram.value.trim()

  let valido = true

  if (!nombreLimpio) {
    errores.nombre = 'Este dato es obligatorio.'
    valido = false
  } else if (nombreLimpio.length > 150) {
    errores.nombre = 'El nombre debe tener máximo 150 caracteres.'
    valido = false
  }

  if (!celularLimpio) {
    errores.celular = 'Este dato es obligatorio.'
    valido = false
  } else if (!/^\d{10}$/.test(celularLimpio)) {
    errores.celular = 'Capture un teléfono de 10 dígitos.'
    valido = false
  }

  if (!usuarioLimpio) {
    errores.usuario = 'Este dato es obligatorio.'
    valido = false
  } else if (usuarioLimpio.length < 6 || usuarioLimpio.length > 20 || /\s/.test(usuarioLimpio)) {
    errores.usuario = 'El usuario debe tener de 6 a 20 caracteres sin espacios.'
    valido = false
  }

  if (telegramLimpio.length > 32) {
    errores.usuarioTelegram = 'Máximo 32 caracteres.'
    valido = false
  }

  if (esAlta) {
    if (!contrasena.value) {
      errores.contrasena = 'Este dato es obligatorio.'
      valido = false
    } else if (contrasena.value.length < 8) {
      errores.contrasena = 'La contraseña debe tener al menos 8 caracteres.'
      valido = false
    } else if (contrasena.value.length > 40) {
      errores.contrasena = 'La contraseña debe tener máximo 40 caracteres.'
      valido = false
    }
  } else if (contrasenaCambio.value) {
    if (contrasena.value.length < 8) {
      errores.contrasena = 'La contraseña debe tener al menos 8 caracteres.'
      valido = false
    } else if (contrasena.value.length > 40) {
      errores.contrasena = 'La contraseña debe tener máximo 40 caracteres.'
      valido = false
    }
  }

  return valido
}

const handleGuardar = () => {
  if (props.enviando || !hayCambios.value) return
  if (!validar()) return

  emit('guardar', {
    nombre: nombre.value.trim(),
    celular: celular.value.trim(),
    usuario: usuario.value.trim(),
    usuarioTelegram: usuarioTelegram.value.trim(),
    contrasena: props.clienteEditar ? (contrasenaCambio.value ? contrasena.value : '') : contrasena.value,
    estatus: props.clienteEditar ? estatus.value : 1,
  })
}

watch(usuario, () => {
  if (errores.usuario) errores.usuario = ''
  if (props.errorUsuarioApi) emit('limpiar-error-usuario')
})

watch(nombre, () => {
  if (errores.nombre) errores.nombre = ''
})

watch(celular, () => {
  if (errores.celular) errores.celular = ''
})

watch(contrasena, () => {
  if (errores.contrasena) errores.contrasena = ''
})

watch(
  [() => props.clienteEditar, () => props.mostrar],
  ([nuevoCliente, estaVisible]) => {
    if (!estaVisible) return
    limpiarErrores()
    if (nuevoCliente) {
      nombre.value = nuevoCliente.Nombre || ''
      celular.value = nuevoCliente.Telefono || ''
      usuario.value = nuevoCliente.Usuario || ''
      usuarioTelegram.value = nuevoCliente.UsuarioTelegram || ''
      contrasena.value = nuevoCliente.Contrasena || ''
      estatus.value = nuevoCliente.Estatus === 0 ? 0 : 1
    } else {
      nombre.value = ''
      celular.value = ''
      usuario.value = ''
      usuarioTelegram.value = ''
      contrasena.value = ''
      estatus.value = 1
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="mostrar" class="overlay" @click.self="!enviando && emit('cerrar')">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-cliente-titulo">
        <div class="modal__encabezado">
          <img :src="logo" alt="Global Foods México" class="modal__logo" />
          <div>
            <h2 id="modal-cliente-titulo" class="modal__titulo">
              {{ clienteEditar ? 'Modificar cliente' : 'Nuevo cliente' }}
            </h2>
            <p class="modal__subtitulo">
              {{
                clienteEditar
                  ? 'Actualiza los datos de contacto, estatus o restablece la contraseña del cliente.'
                  : 'Registra los datos del cliente y asigna el usuario con el que entrará a la aplicación.'
              }}
            </p>
          </div>
        </div>

        <form class="modal__form" novalidate @submit.prevent="handleGuardar">
          <div class="modal__campo">
            <CampoTextoVue
              id="cliente-nombre"
              v-model="nombre"
              etiqueta="Nombre o razón social *"
              marcador="Ej. Pescados y Mariscos La Bahía"
              autocomplete="off"
              :deshabilitado="enviando"
            />
            <p v-if="errores.nombre" class="modal__error" role="alert">{{ errores.nombre }}</p>
          </div>

          <div class="modal__fila">
            <div class="modal__campo">
              <CampoTextoVue
                id="cliente-celular"
                v-model="celular"
                etiqueta="Celular (10 dígitos) *"
                tipo="tel"
                marcador="6671234567"
                autocomplete="off"
                :deshabilitado="enviando"
              />
              <p v-if="errores.celular" class="modal__error" role="alert">{{ errores.celular }}</p>
            </div>

            <div v-if="clienteEditar" class="modal__estado-inicial">
              <label for="cliente-estatus" class="modal__etiqueta">Estado</label>
              <select
                id="cliente-estatus"
                v-model.number="estatus"
                class="modal__select"
                :disabled="enviando"
              >
                <option :value="1">Activo</option>
                <option :value="0">Inactivo</option>
              </select>
            </div>

            <div v-else class="modal__estado-inicial">
              <span class="modal__etiqueta">Estado inicial</span>
              <div class="modal__estado-chip">
                <ChipEstadoVue estado="entregado" etiqueta="Activo" />
              </div>
            </div>
          </div>

          <div class="modal__fila">
            <div class="modal__campo">
              <CampoTextoVue
                id="cliente-usuario"
                v-model="usuario"
                etiqueta="Usuario *"
                tipo="text"
                marcador="6 a 20 caracteres sin espacios"
                autocomplete="off"
                :deshabilitado="enviando"
              />
              <p v-if="errores.usuario || errorUsuarioApi" class="modal__error" role="alert">
                {{ errores.usuario || errorUsuarioApi }}
              </p>
            </div>

            <div class="modal__campo">
              <CampoTextoVue
                id="cliente-contrasena"
                v-model="contrasena"
                :etiqueta="clienteEditar ? 'Contraseña (restablecer)' : 'Contraseña *'"
                tipo="text"
                icono="candado"
                marcador="Mínimo 8 caracteres"
                autocomplete="new-password"
                :deshabilitado="enviando"
              />
              <p v-if="errores.contrasena" class="modal__error" role="alert">{{ errores.contrasena }}</p>
              <p v-else-if="clienteEditar && contrasenaCambio" class="modal__aviso-sesion">
                Al guardar, se cerrarán las sesiones activas del cliente.
              </p>
            </div>
          </div>

          <div class="modal__campo">
            <CampoTextoVue
              id="cliente-telegram"
              v-model="usuarioTelegram"
              etiqueta="Usuario de Telegram (opcional)"
              tipo="text"
              marcador="Ej. usuario_telegram"
              autocomplete="off"
              :deshabilitado="enviando"
            />
            <p v-if="errores.usuarioTelegram" class="modal__error" role="alert">{{ errores.usuarioTelegram }}</p>
          </div>

          <p class="modal__nota">
            El cliente no puede crear ni eliminar usuarios; solo el personal administrativo.
          </p>

          <div class="modal__acciones">
            <BotonVue variante="secundario" :deshabilitado="enviando" @click="emit('cerrar')">
              Cancelar
            </BotonVue>
            <BotonVue tipo="submit" variante="exito" :deshabilitado="enviando || !hayCambios">
              {{
                enviando
                  ? 'Guardando…'
                  : clienteEditar
                    ? 'Guardar cambios'
                    : 'Registrar cliente'
              }}
            </BotonVue>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  padding: 16px;
}

.modal {
  width: 100%;
  max-width: 560px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 24px 28px;
  border-radius: 16px;
  background: var(--gf-superficie);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
}

.modal__encabezado {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.modal__logo {
  flex: none;
  height: 40px;
  object-fit: contain;
}

.modal__titulo {
  margin: 0;
  color: var(--gf-texto);
  font-size: 20px;
  font-weight: 700;
}

.modal__subtitulo {
  margin: 4px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 13px;
}

.modal__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal__fila {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.modal__campo {
  display: flex;
  flex-direction: column;
}

.modal__etiqueta {
  color: var(--gf-texto);
  font-size: 13px;
  font-weight: 600;
}

.modal__estado-inicial {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal__estado-chip {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-fondo);
}

.modal__select {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 14px;
}

.modal__select:focus {
  border-color: var(--gf-secundario);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 20%, transparent);
}

.modal__error {
  margin: 5px 0 0;
  color: var(--gf-cancelado-punto);
  font-size: 12.5px;
  font-weight: 500;
}

.modal__aviso-sesion {
  margin: 5px 0 0;
  color: var(--gf-secundario);
  font-size: 12px;
  font-weight: 500;
}

.modal__nota {
  margin: 2px 0 0;
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.modal__acciones {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.modal__acciones > :deep(*) {
  width: auto;
}

@media (max-width: 560px) {
  .modal {
    padding: 20px;
  }

  .modal__fila {
    grid-template-columns: minmax(0, 1fr);
  }

  .modal__acciones {
    flex-direction: column-reverse;
  }

  .modal__acciones > :deep(*) {
    width: 100%;
  }
}
</style>