<script setup lang="ts">
// Paso 3 del pedido: modalidad y, si es a domicilio, la dirección de entrega y las referencias (en
// recolección, el punto donde el cliente recoge) y observaciones.
// A domicilio, la dirección de entrega es siempre la registrada de la sucursal elegida: aquí solo
// se muestra, con su enlace a Maps. Para cambiarla se edita la sucursal del cliente.
// No se capturan fecha de entrega ni método de pago: el pedido nace con método de pago pendiente
// y ambos se llenan al registrar el pago, en el detalle del pedido o en el sistema interno.

import CampoTextoVue from '@/componentes/CampoTextoVue.vue'
import EncabezadoSeccionVue from '@/componentes/EncabezadoSeccionVue.vue'
import IconoVue from '@/componentes/IconoVue.vue'
import { MODALIDADES, urlMapsDireccion } from '@/modulos/ventas/controladores/formatosPedido'
import { PUNTO_RECOLECCION } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { IDS_CAMPOS, MAXIMO_OBSERVACIONES } from '@/modulos/ventas/controladores/usarFormularioPedido'
import type { SucursalCliente } from '@/modulos/ventas/interfaces/cliente'
import type { ModalidadEntrega } from '@/modulos/ventas/interfaces/pedido'

interface Props {
  /** Sucursal elegida (null si aún no hay); a domicilio, su dirección registrada es la de entrega. */
  sucursal: SucursalCliente | null
  errores: {
    modalidad: string
    direccion: string
  }
}

defineProps<Props>()

const modalidad = defineModel<ModalidadEntrega | null>('modalidad', { required: true })
const referencias = defineModel<string>('referencias', { required: true })
const observaciones = defineModel<string>('observaciones', { required: true })

const opciones = (Object.keys(MODALIDADES) as ModalidadEntrega[]).map((valor) => ({ valor, ...MODALIDADES[valor] }))

const ID_LEYENDA = 'pedido-modalidad-leyenda'
const ID_CONTADOR = `${IDS_CAMPOS.observaciones}-contador`
</script>

<template>
  <section class="entrega">
    <EncabezadoSeccionVue :paso="3" titulo="Entrega" icono="camion" />

    <fieldset
      class="modalidad"
      role="radiogroup"
      :aria-labelledby="ID_LEYENDA"
      aria-required="true"
      :aria-invalid="errores.modalidad ? true : undefined"
      :aria-describedby="errores.modalidad ? IDS_CAMPOS.errorModalidad : undefined"
    >
      <legend :id="ID_LEYENDA" class="entrega__etiqueta">
        Modalidad<span class="entrega__obligatorio" aria-hidden="true"> *</span>
      </legend>

      <div class="modalidad__opciones">
        <label
          v-for="opcion in opciones"
          :key="opcion.valor"
          class="modalidad__opcion"
          :class="{
            'modalidad__opcion--activa': modalidad === opcion.valor,
            'modalidad__opcion--con-error': !!errores.modalidad,
          }"
        >
          <input
            :id="`pedido-modalidad-${opcion.valor}`"
            v-model="modalidad"
            class="modalidad__radio"
            type="radio"
            name="pedido-modalidad"
            :value="opcion.valor"
            :aria-labelledby="`pedido-modalidad-${opcion.valor}-titulo`"
            :aria-describedby="`pedido-modalidad-${opcion.valor}-descripcion`"
          />
          <span class="modalidad__icono">
            <IconoVue :nombre="opcion.icono" :tamano="18" />
          </span>
          <span class="modalidad__textos">
            <span :id="`pedido-modalidad-${opcion.valor}-titulo`" class="modalidad__titulo">{{ opcion.titulo }}</span>
            <span :id="`pedido-modalidad-${opcion.valor}-descripcion`" class="modalidad__descripcion">
              {{ opcion.descripcion }}
            </span>
          </span>
        </label>
      </div>

      <p v-if="errores.modalidad" :id="IDS_CAMPOS.errorModalidad" class="entrega__error">
        {{ errores.modalidad }}
      </p>
    </fieldset>

    <!-- Recolección: no lleva sucursal; el cliente pasa a este punto. -->
    <div v-if="modalidad === 'recoleccion'" class="entrega__campo punto">
      <p class="entrega__etiqueta">Punto de recolección</p>
      <div class="punto__detalle">
        <p class="punto__nombre">{{ PUNTO_RECOLECCION.nombre }}</p>
        <a class="punto__enlace" :href="PUNTO_RECOLECCION.urlMaps" target="_blank" rel="noopener">
          Ver en Maps<span class="visualmente-oculto"> (se abre en otra pestaña)</span>
        </a>
      </div>
    </div>

    <template v-if="modalidad === 'domicilio'">
      <!-- Solo lectura: la dirección registrada de la sucursal, como el punto de recolección. -->
      <div class="entrega__campo punto">
        <p class="entrega__etiqueta">Dirección de entrega</p>
        <p v-if="!sucursal" class="punto__aviso">Seleccione la sucursal del cliente para ver a dónde se entrega.</p>
        <div v-else class="punto__detalle" :class="{ 'punto__detalle--con-error': !!errores.direccion }">
          <div class="punto__textos">
            <p v-if="sucursal.direccion" class="punto__nombre">{{ sucursal.direccion }}</p>
            <p v-else class="punto__nombre punto__nombre--vacio">Sin dirección registrada</p>
            <p class="punto__sucursal">Sucursal {{ sucursal.nombre }}</p>
          </div>
          <a
            v-if="sucursal.direccion"
            class="punto__enlace"
            :href="urlMapsDireccion(sucursal.direccion)"
            target="_blank"
            rel="noopener"
          >
            Ver en Maps<span class="visualmente-oculto"> (se abre en otra pestaña)</span>
          </a>
        </div>
        <!-- Recibe el foco si se intenta registrar con una sucursal sin dirección. -->
        <p v-if="errores.direccion" :id="IDS_CAMPOS.errorDireccion" class="entrega__error" tabindex="-1">
          {{ errores.direccion }}
        </p>
      </div>

      <!-- CampoTextoVue pasa class al <input>; el margen va en un contenedor. -->
      <div class="entrega__campo">
        <CampoTextoVue
          :id="IDS_CAMPOS.referencias"
          v-model="referencias"
          etiqueta="Referencias"
          marcador="Entre calles, fachada o cómo identificar el lugar"
          opcional
          compacto
          autocomplete="off"
        />
      </div>
    </template>

    <div class="entrega__campo observaciones">
      <label class="entrega__etiqueta" :for="IDS_CAMPOS.observaciones">
        Observaciones <span class="observaciones__opcional">(opcional)</span>
      </label>
      <textarea
        :id="IDS_CAMPOS.observaciones"
        v-model="observaciones"
        class="observaciones__texto"
        rows="3"
        :maxlength="MAXIMO_OBSERVACIONES"
        placeholder="Indicaciones para almacén o reparto (máximo 250 caracteres)"
        :aria-describedby="ID_CONTADOR"
      ></textarea>
      <p
        :id="ID_CONTADOR"
        class="observaciones__contador"
        :class="{ 'observaciones__contador--limite': observaciones.length >= MAXIMO_OBSERVACIONES }"
      >
        {{ observaciones.length }}/{{ MAXIMO_OBSERVACIONES }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.entrega__etiqueta {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 500;
}

.entrega__obligatorio {
  color: var(--gf-cancelado-punto);
}

.entrega__error {
  margin: 6px 0 0;
  color: var(--gf-cancelado-punto);
  font-size: 13px;
}

.modalidad {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.modalidad legend {
  margin-bottom: 6px;
  padding: 0;
}

.modalidad__opciones {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.modalidad__opcion {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--gf-borde);
  border-radius: 10px;
  background: var(--gf-superficie);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.modalidad__opcion:hover {
  border-color: var(--gf-claro);
}

.modalidad__opcion--activa,
.modalidad__opcion--activa:hover {
  border-color: var(--gf-secundario);
  background: color-mix(in srgb, var(--gf-claro) 12%, var(--gf-superficie));
  box-shadow: 0 0 0 1px var(--gf-secundario);
}

.modalidad__opcion--con-error {
  border-color: var(--gf-cancelado-punto);
}

.modalidad__opcion:has(.modalidad__radio:focus-visible) {
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.modalidad__radio {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 10px 0 0;
  accent-color: var(--gf-secundario);
}

.modalidad__icono {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--gf-fondo);
  color: var(--gf-secundario);
}

.modalidad__textos {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modalidad__titulo {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 700;
}

.modalidad__descripcion {
  color: var(--gf-texto-tenue);
  font-size: 12px;
  line-height: 1.35;
}

.punto {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.punto :where(p) {
  margin: 0;
}

.punto__detalle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 10px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-fondo);
}

.punto__nombre {
  color: var(--gf-texto);
  font-size: 14px;
  font-weight: 600;
}

.punto__enlace {
  color: var(--gf-secundario);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.punto__enlace:hover {
  text-decoration: underline;
}

.punto__enlace:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--gf-secundario);
  outline-offset: 2px;
}

.punto__detalle--con-error {
  border-color: var(--gf-cancelado-punto);
}

.punto__textos {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.punto__nombre--vacio {
  color: var(--gf-texto-tenue);
  font-weight: 500;
}

.punto__sucursal,
.punto__aviso {
  color: var(--gf-texto-tenue);
  font-size: 12px;
}

.punto__aviso {
  font-size: 13px;
}

.entrega__campo {
  margin-top: 16px;
}

.observaciones {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.observaciones__opcional {
  color: var(--gf-texto-tenue);
  font-weight: 400;
}

.observaciones__texto {
  width: 100%;
  min-height: 84px;
  padding: 10px 12px;
  border: 1px solid var(--gf-borde);
  border-radius: 8px;
  background: var(--gf-campo-fondo);
  color: var(--gf-texto);
  font: inherit;
  font-size: 15px;
  resize: vertical;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.observaciones__texto::placeholder {
  color: var(--gf-texto-tenue);
  opacity: 0.8;
}

.observaciones__texto:focus {
  border-color: var(--gf-secundario);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gf-secundario) 22%, transparent);
}

.observaciones__contador {
  margin: 0;
  color: var(--gf-texto-tenue);
  font-size: 12px;
  text-align: right;
}

.observaciones__contador--limite {
  color: var(--gf-preparacion-fg);
  font-weight: 700;
}

@media (max-width: 640px) {
  .modalidad__opciones {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
