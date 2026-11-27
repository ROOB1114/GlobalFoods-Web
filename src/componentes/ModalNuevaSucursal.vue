<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import BotonVue from '@/componentes/BotonVue.vue'
import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import type { SucursalAPI } from '@/modulos/administracion/servicios/servicioClientes'
import logo from '@/recursos/logo-transparente.png'

export interface DatosFormularioSucursal {
  nombreSucursal: string
  direccion: string
  telefono: string
  referencias: string
}

interface Props {
  mostrar: boolean
  sucursalEditar?: SucursalAPI | null
  errorNombreApi?: string
  enviando?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mostrar: false,
  sucursalEditar: null,
  errorNombreApi: '',
  enviando: false,
})

const emit = defineEmits<{
  (e: 'cerrar'): void
  (e: 'limpiar-error-nombre'): void
  (e: 'guardar', datos: DatosFormularioSucursal): void
}>()

const nombreSucursal = ref('')
const direccion = ref('')
const telefono = ref('')
const referencias = ref('')

const errores = reactive({
  nombreSucursal: '',
  direccion: '',
  telefono: '',
  referencias: '',
})

function limpiarErrores() {
  errores.nombreSucursal = ''
  errores.direccion = ''
  errores.telefono = ''
  errores.referencias = ''
}

function validar(): boolean {
  limpiarErrores()
  const nombreLimpio = nombreSucursal.value.trim()
  const direccionLimpia = direccion.value.trim()
  const telefonoLimpio = telefono.value.trim()
  const referenciasLimpias = referencias.value.trim()

  let valido = true

  if (!nombreLimpio) {
    errores.nombreSucursal = 'Este dato es obligatorio.'
    valido = false
  } else if (nombreLimpio.length > 100) {
    errores.nombreSucursal = 'El nombre de la sucursal debe tener máximo 100 caracteres.'
    valido = false
  }

  if (!direccionLimpia) {
    errores.direccion = 'Este dato es obligatorio.'
    valido = false
  } else if (direccionLimpia.length > 255) {
    errores.direccion = 'La dirección debe tener máximo 255 caracteres.'
    valido = false
  }

  if (!telefonoLimpio) {
    errores.telefono = 'Este dato es obligatorio.'
    valido = false
  } else if (!/^\d{10}$/.test(telefonoLimpio)) {
    errores.telefono = 'Capture un teléfono de 10 dígitos.'
    valido = false
  }

  if (referenciasLimpias.length > 250) {
    errores.referencias = 'Las referencias deben tener máximo 250 caracteres.'
    valido = false
  }

  return valido
}

const handleGuardar = () => {
  if (props.enviando) return
  if (!validar()) return

  emit('guardar', {
    nombreSucursal: nombreSucursal.value.trim(),
    direccion: direccion.value.trim(),
    telefono: telefono.value.trim(),
    referencias: referencias.value.trim(),
  })
}

watch(nombreSucursal, () => {
  if (errores.nombreSucursal) errores.nombreSucursal = ''
  if (props.errorNombreApi) emit('limpiar-error-nombre')
})

watch(direccion, () => {
  if (errores.direccion) errores.direccion = ''
})

watch(telefono, () => {
  if (errores.telefono) errores.telefono = ''
})

watch(referencias, () => {
  if (errores.referencias) errores.referencias = ''
})

watch(
  [() => props.sucursalEditar, () => props.mostrar],
  ([nuevaSucursal, estaVisible]) => {
    if (!estaVisible) return
    limpiarErrores()
    if (nuevaSucursal) {
      nombreSucursal.value = nuevaSucursal.NombreSucursal || ''
      direccion.value = nuevaSucursal.Direccion || ''
      telefono.value = nuevaSucursal.Telefono || ''
      referencias.value = nuevaSucursal.Referencias || ''
    } else {
      nombreSucursal.value = ''
      direccion.value = ''
      telefono.value = ''
      referencias.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="mostrar" class="overlay" @click.self="!enviando && emit('cerrar')">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-sucursal-titulo">
        <div class="modal__encabezado">
          <img :src="logo" alt="Global Foods México" class="modal__logo" />
          <div>
            <h2 id="modal-sucursal-titulo" class="modal__titulo">
              {{ sucursalEditar ? 'Modificar sucursal' : 'Nueva sucursal' }}
            </h2>
            <p class="modal__subtitulo">
              {{
                sucursalEditar
                  ? 'Los pedidos ya registrados conservarán la dirección con la que fueron capturados.'
                  : 'Registra un lugar de entrega para recibir pedidos a domicilio.'
              }}
            </p>
          </div>
        </div>

        <form class="modal__form" novalidate @submit.prevent="handleGuardar">
          <div class="modal__campo">
            <CampoTextoVue
              id="sucursal-nombre"
              v-model="nombreSucursal"
              etiqueta="Nombre de la sucursal *"
              marcador="Ej. Sucursal Centro"
              autocomplete="off"
              :deshabilitado="enviando"
            />
            <p v-if="errores.nombreSucursal || errorNombreApi" class="modal__error" role="alert">
              {{ errores.nombreSucursal || errorNombreApi }}
            </p>
          </div>

          <div class="modal__campo">
            <CampoTextoVue
              id="sucursal-direccion"
              v-model="direccion"
              etiqueta="Dirección (calle y número, colonia y ciudad) *"
              marcador="Ej. Calle Río Humaya #123, Col. Las Quintas, Culiacán, Sin."
              autocomplete="off"
              :deshabilitado="enviando"
            />
            <p v-if="errores.direccion" class="modal__error" role="alert">{{ errores.direccion }}</p>
          </div>

          <div class="modal__campo">
            <CampoTextoVue
              id="sucursal-telefono"
              v-model="telefono"
              etiqueta="Teléfono (10 dígitos) *"
              tipo="tel"
              marcador="6671234567"
              autocomplete="off"
              :deshabilitado="enviando"
            />
            <p v-if="errores.telefono" class="modal__error" role="alert">{{ errores.telefono }}</p>
          </div>

          <div class="modal__campo">
            <div class="modal__etiqueta-fila">
              <label for="sucursal-referencias" class="modal__etiqueta">Referencias (opcional)</label>
              <span class="modal__contador">{{ referencias.length }}/250</span>
            </div>
            <textarea
              id="sucursal-referencias"
              v-model="referencias"
              rows="2"
              maxlength="250"
              class="modal__textarea"
              placeholder="Entre calles, color de fachada, puerta de servicio..."
              :disabled="enviando"
            ></textarea>
            <p v-if="errores.referencias" class="modal__error" role="alert">{{ errores.referencias }}</p>
          </div>

          <div class="modal__acciones">
            <BotonVue variante="secundario" :deshabilitado="enviando" @click="emit('cerrar')">
              Cancelar
            </BotonVue>
            <BotonVue tipo="submit" variante="exito" :deshabilitado="enviando">
              {{
                enviando
                  ? 'Guardando…'
                  : sucursalEditar
                    ? 'Guardar cambios'
                    : 'Guardar sucursal'
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
  max-width: 520px;
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

.modal__campo {
  display: flex;
  flex-direction: column;
}

.modal__etiqueta-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.modal__etiqueta {
  color: var(--gf-texto);
  font-size: 13px;
  font-weight: 600;
}

.modal__contador {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.modal__textarea {
  padding: 10px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-superficie);
  color: var(--gf-texto);
  font: inherit;
  font-size: 14px;
  resize: vertical;
}

.modal__textarea:focus {
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

  .modal__acciones {
    flex-direction: column-reverse;
  }

  .modal__acciones > :deep(*) {
    width: 100%;
  }
}
</style>