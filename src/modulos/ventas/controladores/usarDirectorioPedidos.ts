import { onUnmounted, shallowRef } from 'vue'
import { obtenerNombreUsuario, obtenerRolUsuario } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import type { SucursalCliente } from '@/modulos/ventas/interfaces/cliente'
import {
  descartarClientesEnMemoria,
  obtenerClientesActivos,
  obtenerSucursalesCliente,
  obtenerUsuarioTelegramCliente,
} from '@/modulos/ventas/servicios/servicioClientesVentas'

/**
 * Nombres de cliente y sucursal para mostrar pedidos, que solo traen IdCliente e IdSucursal.
 * - Clientes: de GET /api/clientes/activos; uno inactivo se muestra como "Cliente #Id".
 * - Sucursales: se piden por cliente, una sola vez cada uno y en paralelo, y se guardan mientras
 *   la pantalla está abierta.
 * - Usuario de Telegram: para el detalle de un pedido, uno por cliente (GET /api/clientes/:id).
 * Si una consulta falla, la pantalla sigue: se muestran los Id y la siguiente carga lo reintenta.
 */
export function usarDirectorioPedidos() {
  const esCliente = obtenerRolUsuario() === 'cliente'
  const nombresClientes = shallowRef(new Map<number, string>())
  const sucursalesPorCliente = shallowRef(new Map<number, SucursalCliente[] | null>())
  const consultasEnCurso = new Map<number, Promise<void>>()
  const telegramPorCliente = shallowRef(new Map<number, string | null>())

  async function cargarClientes() {
    if (esCliente) return
    try {
      const clientes = await obtenerClientesActivos()
      nombresClientes.value = new Map(clientes.map((cliente) => [cliente.id, cliente.nombre]))
    } catch {
      // Sin nombres, cada pedido muestra "Cliente #Id".
    }
  }

  function guardarSucursales(idCliente: number, sucursales: SucursalCliente[] | null) {
    sucursalesPorCliente.value = new Map(sucursalesPorCliente.value).set(idCliente, sucursales)
  }

  function cargarSucursalesDe(idCliente: number): Promise<void> {
    // Ya cargadas (aunque sea una lista vacía): no se vuelven a pedir. Si falló, se reintenta.
    if (sucursalesPorCliente.value.get(idCliente)) return Promise.resolve()

    let consulta = consultasEnCurso.get(idCliente)
    if (!consulta) {
      consulta = obtenerSucursalesCliente(idCliente)
        .then((sucursales) => guardarSucursales(idCliente, sucursales))
        .catch(() => guardarSucursales(idCliente, null))
        .finally(() => consultasEnCurso.delete(idCliente))
      consultasEnCurso.set(idCliente, consulta)
    }
    return consulta
  }

  /** Pide, en paralelo, las sucursales de los clientes que todavía no se tienen. Nunca falla. */
  async function cargarSucursales(idsClientes: number[]) {
    await Promise.all([...new Set(idsClientes)].map(cargarSucursalesDe))
  }

  /**
   * Pide el usuario de Telegram del cliente si todavía no se tiene. Nunca falla: si la consulta
   * falla se queda sin dato y la siguiente carga lo reintenta. Con el rol cliente no se pide.
   */
  async function cargarTelegram(idCliente: number) {
    if (esCliente || telegramPorCliente.value.has(idCliente)) return
    try {
      const usuario = await obtenerUsuarioTelegramCliente(idCliente)
      telegramPorCliente.value = new Map(telegramPorCliente.value).set(idCliente, usuario)
    } catch {
      // Sin dato: el detalle muestra "—".
    }
  }

  /** null si no tiene (o no se pudo consultar); undefined con el rol cliente, que no lo ve. */
  function usuarioTelegram(idCliente: number): string | null | undefined {
    if (esCliente) return undefined
    return telegramPorCliente.value.get(idCliente) ?? null
  }

  function nombreCliente(idCliente: number): string {
    if (esCliente) return obtenerNombreUsuario() || `Cliente #${idCliente}`
    return nombresClientes.value.get(idCliente) ?? `Cliente #${idCliente}`
  }

  /** undefined mientras se consultan las sucursales del cliente; null si no se encontró. */
  function buscarSucursal(idCliente: number, idSucursal: number): SucursalCliente | null | undefined {
    if (!sucursalesPorCliente.value.has(idCliente)) return undefined
    return sucursalesPorCliente.value.get(idCliente)?.find((sucursal) => sucursal.id === idSucursal) ?? null
  }

  // Los clientes quedan en memoria solo mientras la pantalla está abierta.
  onUnmounted(descartarClientesEnMemoria)

  return { cargarClientes, cargarSucursales, cargarTelegram, nombreCliente, buscarSucursal, usuarioTelegram }
}
