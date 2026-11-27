import { computed, ref, shallowRef } from 'vue'

import { obtenerNombreUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import { ESTATUS, sePuedeIniciarReparto } from '@/modulos/ventas/controladores/estadosPedido'
import { normalizarTexto } from '@/modulos/ventas/controladores/formatosPedido'
import { leerObservaciones } from '@/modulos/ventas/controladores/observacionesPedido'
import { esSucursalRecoleccion, modalidadDePedido } from '@/modulos/ventas/controladores/puntoRecoleccion'
import { usarDirectorioPedidos } from '@/modulos/ventas/controladores/usarDirectorioPedidos'
import type { LineaPedido, Pedido } from '@/modulos/ventas/interfaces/pedido'
import { ErrorPedidos, obtenerPedidos } from '@/modulos/ventas/servicios/servicioPedidos'

export const MENSAJES_REPARTO = {
  cargando: 'Cargando pedidos…',
  errorCarga: 'No fue posible cargar los pedidos. Intente nuevamente.',
  sinPermiso: 'Su perfil no tiene permiso para consultar los pedidos. Pida al administrador que lo revise.',
  sinConexion: 'No es posible conectar con el servidor. Intente más tarde.',
  sinListos: 'No hay pedidos listos para reparto.',
  sinEnReparto: 'No tienes pedidos en reparto.',
}

/** Pedido como lo ve el repartidor (RF-REP-01): sin importes en la lista ni historial comercial. */
export interface PedidoReparto {
  id: number
  cliente: string
  sucursal: string
  /** Teléfono de la sucursal; null si no tiene o no se pudo consultar. */
  telefono: string | null
  /** Dirección de entrega; null si no se conoce. */
  direccion: string | null
  /** Lo que capturó la asesora en Observaciones (sin la modalidad). */
  notas: string | null
  lineas: LineaPedido[]
  totalKg: number
  /** Solo se usa para cobrar al registrar la entrega; la lista no lo muestra. */
  total: number
  /** aaaa-mm-dd */
  registrado: string
  /** Quién lo pasó a En reparto, según la bitácora; null si no se sabe. */
  tomadoPor: string | null
}

const porAntiguedad = (a: Pedido, b: Pedido) => a.fechaRegistro.localeCompare(b.fechaRegistro) || a.id - b.id

/** Usuario del último evento que dejó el pedido En reparto; null si la bitácora no lo trae. */
function quienLoTomo(pedido: Pedido): string | null {
  const evento = [...pedido.eventos]
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora) || b.id - a.id)
    .find((actual) => actual.estadoResultante === ESTATUS.enReparto)
  return evento?.usuario?.trim() || null
}

/**
 * Pantalla de Reparto (CU-10): pedidos Surtidos a domicilio que nadie ha tomado (paso 2) y los
 * pedidos En reparto del repartidor de la sesión. Quién tomó cada pedido se sabe por la bitácora
 * (el usuario del evento que lo pasó a En reparto); si la bitácora no lo dice, se muestra.
 * TODO: la bitácora trae el nombre del usuario, no su Id; si César agrega el Id, comparar por Id.
 * Con 401 llama a `alVencerSesion`.
 */
export function usarReparto(opciones: { alVencerSesion: () => void }) {
  const pedidos = shallowRef<Pedido[]>([])
  const cargando = ref(true)
  const errorCarga = ref(false)
  /** Por qué no se cargaron los pedidos (permiso, conexión o lo que diga la API). */
  const mensajeError = ref('')
  const horaActualizacion = ref('')
  const seleccionados = ref(new Set<number>())
  const directorio = usarDirectorioPedidos()
  const nombreSesion = normalizarTexto(obtenerNombreUsuario() ?? '')

  function modalidad(pedido: Pedido) {
    return modalidadDePedido(pedido.idSucursal, leerObservaciones(pedido.observaciones).modalidad)
  }

  function aPedidoReparto(pedido: Pedido): PedidoReparto {
    const entrega = leerObservaciones(pedido.observaciones)
    const sucursal = esSucursalRecoleccion(pedido.idSucursal)
      ? null
      : directorio.buscarSucursal(pedido.idCliente, pedido.idSucursal)
    return {
      id: pedido.id,
      cliente: directorio.nombreCliente(pedido.idCliente),
      sucursal: sucursal?.nombre ?? `Sucursal #${pedido.idSucursal}`,
      telefono: sucursal?.telefono ?? null,
      direccion: entrega.direccion ?? sucursal?.direccion ?? null,
      notas: entrega.notas,
      lineas: pedido.lineas,
      totalKg: pedido.totalKg,
      total: pedido.total,
      registrado: pedido.fechaRegistro,
      tomadoPor: quienLoTomo(pedido),
    }
  }

  /** Pasos 2–3: Surtidos a domicilio, del más antiguo al más reciente. */
  const listos = computed(() =>
    pedidos.value
      .filter((pedido) => sePuedeIniciarReparto(pedido.estatus, modalidad(pedido)))
      .sort(porAntiguedad)
      .map(aPedidoReparto),
  )

  /** En reparto del repartidor de la sesión (RF-REP-01: los que tiene asignados). */
  const enReparto = computed(() =>
    pedidos.value
      .filter((pedido) => pedido.estatus === ESTATUS.enReparto)
      .sort(porAntiguedad)
      .map(aPedidoReparto)
      .filter((pedido) => !pedido.tomadoPor || !nombreSesion || normalizarTexto(pedido.tomadoPor) === nombreSesion),
  )

  /**
   * Carga los pedidos con su bitácora. Con `silencioso` (la actualización de cada minuto o después
   * de un cambio) se sigue viendo la lista mientras llega la respuesta y, si falla, se queda como
   * estaba.
   */
  async function cargar(opcionesCarga: { silencioso?: boolean } = {}) {
    const silencioso = opcionesCarga.silencioso === true
    if (silencioso && cargando.value) return
    if (!silencioso) {
      cargando.value = true
      errorCarga.value = false
    }
    try {
      const [todos] = await Promise.all([obtenerPedidos({ incluirEventos: true }), directorio.cargarClientes()])
      const delReparto = todos.filter(
        (pedido) => pedido.estatus === ESTATUS.enReparto || sePuedeIniciarReparto(pedido.estatus, modalidad(pedido)),
      )
      await directorio.cargarSucursales(delReparto.map((pedido) => pedido.idCliente))
      pedidos.value = delReparto
      errorCarga.value = false
      horaActualizacion.value = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

      // Si un pedido seleccionado ya no está listo (otro lo tomó), se quita de la selección.
      const disponibles = new Set(listos.value.map((pedido) => pedido.id))
      seleccionados.value = new Set([...seleccionados.value].filter((id) => disponibles.has(id)))
    } catch (error) {
      if (error instanceof ErrorPedidos && error.motivo === 'sesion') {
        opciones.alVencerSesion()
        return
      }
      if (!silencioso) {
        errorCarga.value = true
        mensajeError.value = mensajeDeCarga(error)
      }
    } finally {
      if (!silencioso) cargando.value = false
    }
  }

  function mensajeDeCarga(error: unknown): string {
    if (!(error instanceof ErrorPedidos)) return MENSAJES_REPARTO.errorCarga
    if (error.motivo === 'sin_permiso') return MENSAJES_REPARTO.sinPermiso
    if (error.motivo === 'conexion') return MENSAJES_REPARTO.sinConexion
    // Lo que respondió la API ayuda a saber qué falló (p. ej. un 500 o un 400).
    return error.mensajeApi ? `${MENSAJES_REPARTO.errorCarga} (${error.mensajeApi})` : MENSAJES_REPARTO.errorCarga
  }

  function alternarSeleccion(id: number) {
    const nuevos = new Set(seleccionados.value)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    seleccionados.value = nuevos
  }

  function limpiarSeleccion() {
    seleccionados.value = new Set()
  }

  return {
    cargando,
    errorCarga,
    mensajeError,
    horaActualizacion,
    listos,
    enReparto,
    seleccionados,
    cargar,
    alternarSeleccion,
    limpiarSeleccion,
  }
}
