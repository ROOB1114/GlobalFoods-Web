import { obtenerToken } from '@/modulos/autenticacion/servicios/servicioAutenticacion'

const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface ClienteAPI {
  Id: number
  Usuario: string
  Contrasena?: string
  Nombre: string
  Telefono: string
  Estatus: number
  UsuarioTelegram?: string | null
}

export interface SucursalAPI {
  Id: number
  IdCliente: number
  NombreSucursal: string
  Direccion: string
  Telefono: string
  Referencias?: string | null
  Estatus: number
}

export type CodigoErrorSucursal =
  | 'NOMBRE_DUPLICADO'
  | 'PEDIDOS_EN_PROCESO'
  | 'CLIENTE_INACTIVO'
  | 'DATOS_INVALIDOS'
  | 'SIN_PERMISO'
  | 'ERROR_API'

export class ErrorSucursales extends Error {
  readonly codigo: CodigoErrorSucursal
  readonly campo?: string

  constructor(mensaje: string, codigo: CodigoErrorSucursal = 'ERROR_API', campo?: string) {
    super(mensaje)
    this.name = 'ErrorSucursales'
    this.codigo = codigo
    this.campo = campo
  }
}

function getHeaders() {
  const token = obtenerToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function obtenerClientesAPI(): Promise<ClienteAPI[]> {
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/clientes`, { headers: getHeaders() })
  if (!res.ok) throw new Error('No fue posible consultar a los clientes. Intente nuevamente.')
  return res.json()
}

export async function crearClienteAPI(datos: Partial<ClienteAPI>): Promise<ClienteAPI> {
  let res: Response
  try {
    res = await fetch(`${URL_API.replace(/\/$/, '')}/api/clientes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(datos),
    })
  } catch {
    throw new ErrorClientes('No fue posible registrar al cliente. Intente nuevamente.', 'ERROR_API')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 409 && body?.codigo === 'USUARIO_DUPLICADO') {
      throw new ErrorClientes(
        body.error || 'El usuario ya está asignado a otro cliente.',
        'USUARIO_DUPLICADO',
        'usuario',
      )
    }
    if (res.status === 403) {
      throw new ErrorClientes('No tiene permiso para realizar esta operación.', 'SIN_PERMISO')
    }
    if (res.status === 400 && body?.error) {
      throw new ErrorClientes(body.error, 'DATOS_INVALIDOS', body.campo)
    }
    throw new ErrorClientes('No fue posible registrar al cliente. Intente nuevamente.', 'ERROR_API')
  }

  return body
}

export async function actualizarClienteAPI(id: number, datos: Partial<ClienteAPI>): Promise<ClienteAPI> {
  let res: Response
  try {
    res = await fetch(`${URL_API.replace(/\/$/, '')}/api/clientes/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(datos),
    })
  } catch {
    throw new ErrorClientes('No fue posible guardar los cambios. Intente nuevamente.', 'ERROR_API')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 409 && body?.codigo === 'USUARIO_DUPLICADO') {
      throw new ErrorClientes(
        body.error || 'El usuario ya está asignado a otro cliente.',
        'USUARIO_DUPLICADO',
        'usuario',
      )
    }
    if (res.status === 409 && body?.codigo === 'PEDIDOS_EN_PROCESO') {
      throw new ErrorClientes(
        body.error || 'El cliente tiene pedidos en proceso. Puede darse de baja cuando se entreguen o se cancelen.',
        'PEDIDOS_EN_PROCESO',
      )
    }
    if (res.status === 403) {
      throw new ErrorClientes('No tiene permiso para realizar esta operación.', 'SIN_PERMISO')
    }
    if (res.status === 400 && body?.error) {
      throw new ErrorClientes(body.error, 'DATOS_INVALIDOS', body.campo)
    }
    throw new ErrorClientes('No fue posible guardar los cambios. Intente nuevamente.', 'ERROR_API')
  }

  return body
}
/**
 * Activa (1) o desactiva (0) un cliente. Los clientes no se borran: sus pedidos y sucursales
 * los siguen usando, y uno inactivo ya no sale en GET /api/clientes/activos (Nuevo pedido).
 * Manda los mismos datos que la edición (PUT /api/clientes/:id), cambiando solo el estatus.
 */
export async function cambiarEstatusClienteAPI(cliente: ClienteAPI, estatus: 0 | 1): Promise<ClienteAPI> {
  return actualizarClienteAPI(cliente.Id, {
    usuario: cliente.Usuario,
    contrasena: cliente.Contrasena,
    nombre: cliente.Nombre,
    telefono: cliente.Telefono,
    usuarioTelegram: cliente.UsuarioTelegram ?? null,
    estatus,
  } as unknown as Partial<ClienteAPI>)
}

/** Ya no se usa en la pantalla de Clientes: en lugar de borrar se desactiva (cambiarEstatusClienteAPI). */
/** Baja lógica del cliente (CU-18 / RN-17): cambia estatus a Inactivo, cierra sesiones y conserva historial. */
export async function eliminarClienteAPI(id: number): Promise<ClienteAPI> {
  let res: Response
  try {
    res = await fetch(`${URL_API.replace(/\/$/, '')}/api/clientes/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
  } catch {
    throw new ErrorClientes('No fue posible dar de baja al cliente. Intente nuevamente.', 'ERROR_API')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 409 && body?.codigo === 'PEDIDOS_EN_PROCESO') {
      throw new ErrorClientes(
        body.error || 'El cliente tiene pedidos en proceso. Puede darse de baja cuando se entreguen o se cancelen.',
        'PEDIDOS_EN_PROCESO',
      )
    }
    if (res.status === 403) {
      throw new ErrorClientes('No tiene permiso para realizar esta operación.', 'SIN_PERMISO')
    }
    throw new ErrorClientes('No fue posible dar de baja al cliente. Intente nuevamente.', 'ERROR_API')
  }

  return body
}

export async function obtenerClientePorIdAPI(id: number): Promise<ClienteAPI> {
  const token = obtenerToken()
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/clientes/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Error al obtener el cliente')
  return res.json()
}

export async function obtenerSucursalesClienteAPI(
  idCliente: number,
  incluirInactivas = false,
): Promise<SucursalAPI[]> {
  const token = obtenerToken()
  const consulta = incluirInactivas ? '?incluirInactivas=1' : ''
  let res: Response
  try {
    res = await fetch(`${URL_API.replace(/\/$/, '')}/api/sucursales-clientes${consulta}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Id-Cliente': String(idCliente),
      },
    })
  } catch {
    throw new ErrorSucursales('No fue posible consultar las sucursales. Intente nuevamente.', 'ERROR_API')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 403) {
      throw new ErrorSucursales(
        body?.error || 'No tiene permiso para consultar sucursales de otro cliente.',
        'SIN_PERMISO',
      )
    }
    throw new ErrorSucursales('No fue posible consultar las sucursales. Intente nuevamente.', 'ERROR_API')
  }

  return Array.isArray(body) ? body : []
}

export async function obtenerPedidosClienteAPI(idCliente: number): Promise<any[]> {
  const token = obtenerToken()
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/pedidos`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return []
  const todosLosPedidos = await res.json()
  return todosLosPedidos.filter((pedido: any) => pedido.IdCliente === idCliente)
}

// --- NUEVAS FUNCIONES DEL CRUD DE SUCURSALES ---

// --- FUNCIONES DEL CRUD DE SUCURSALES (ACTUALIZADAS CON getHeaders) ---

export async function crearSucursalClienteAPI(datos: any): Promise<any> {
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/sucursales-clientes`, {
    method: 'POST',
    headers: getHeaders(), 
    body: JSON.stringify(datos)
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error || 'Error al crear la sucursal')
  }
  return res.json()
}

export async function actualizarSucursalClienteAPI(id: number, datos: any): Promise<any> {
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/sucursales-clientes/${id}`, {
    method: 'PUT',
    headers: getHeaders(), 
    body: JSON.stringify(datos)
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error || 'Error al actualizar la sucursal')
  }
  return res.json()
}

export async function eliminarSucursalClienteAPI(id: number): Promise<boolean> {
  const res = await fetch(`${URL_API.replace(/\/$/, '')}/api/sucursales-clientes/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error || 'Error al eliminar sucursal')
  }
  return true
}

export type CodigoErrorCliente =
  | 'USUARIO_DUPLICADO'
  | 'PEDIDOS_EN_PROCESO'
  | 'DATOS_INVALIDOS'
  | 'SIN_PERMISO'
  | 'ERROR_API'

export class ErrorClientes extends Error {
  readonly codigo: CodigoErrorCliente
  readonly campo?: string

  constructor(mensaje: string, codigo: CodigoErrorCliente = 'ERROR_API', campo?: string) {
    super(mensaje)
    this.name = 'ErrorClientes'
    this.codigo = codigo
    this.campo = campo
  }
}