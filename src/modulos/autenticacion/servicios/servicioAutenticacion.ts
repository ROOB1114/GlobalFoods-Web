import type { ItemNavegacion } from '@/componentes/BarraLateralVue.vue'

const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface RespuestaInicioSesion {
  tokenType: string
  accessToken: string
  expiresIn: number
  nombre: string
  tipoUsuario: string // <-- Agregado para recibir el rol
}

export async function iniciarSesionUsuario(
  usuario: string,
  contrasena: string,
): Promise<RespuestaInicioSesion> {
  let respuestaHttp: Response

  try {
    respuestaHttp = await fetch(`${URL_API.replace(/\/$/, '')}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usuario, contrasena }),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que la API esté activa.')
  }

  const datosRespuesta = await respuestaHttp.json().catch(() => ({})) as Partial<RespuestaInicioSesion> & {
    error?: string
  }

  if (!respuestaHttp.ok) {
    throw new Error(datosRespuesta.error || 'No se pudo iniciar sesión.')
  }

  if (typeof datosRespuesta.accessToken !== 'string' || !datosRespuesta.accessToken) {
    throw new Error('La respuesta de la API no contiene un token válido.')
  }

  if (typeof datosRespuesta.nombre !== 'string' || !datosRespuesta.nombre) {
    throw new Error('La respuesta de la API no contiene el nombre del usuario.')
  }

  // Validamos que el backend nos envíe el rol
  if (typeof datosRespuesta.tipoUsuario !== 'string' || !datosRespuesta.tipoUsuario) {
    throw new Error('La respuesta de la API no contiene el tipo de usuario (rol).')
  }

  return datosRespuesta as RespuestaInicioSesion
}

// Actualizamos la función para recibir y guardar el rol
export function guardarToken(tokenAcceso: string, nombreUsuario: string, tipoUsuario: string): void {
  localStorage.setItem('token', tokenAcceso)
  localStorage.setItem('nombreUsuario', nombreUsuario)
  localStorage.setItem('rolUsuario', tipoUsuario)
}

export function obtenerToken(): string | null {
  return localStorage.getItem('token')
}

export function obtenerNombreUsuario(): string | null {
  return localStorage.getItem('nombreUsuario')
}

// <-- NUEVAS FUNCIONES PARA LOS ROLES Y EL MENÚ -->

export function obtenerRolUsuario(): string {
  // Convertimos a minúsculas para que 'Administrador' o 'ADMIN' funcionen igual
  return (localStorage.getItem('rolUsuario') || 'administrador').toLowerCase()
}

export function esRolReportes(): boolean {
  const rol = obtenerRolUsuario()
  return rol === 'reporte' || rol === 'reportes'
}

/** Repartidor (CU-10): solo ve la pantalla de Reparto. */
export function esRolRepartidor(): boolean {
  return obtenerRolUsuario() === 'repartidor'
}

export function obtenerIdUsuarioSesion(): number | null {
  const token = obtenerToken()
  if (!token) return null
  try {
    const partePayload = token.split('.')[1]
    if (!partePayload) return null
    const base64 = partePayload.replace(/-/g, '+').replace(/_/g, '/')
    const relleno = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(relleno)) as { userId?: number; sub?: string }
    const id = Number(payload.userId ?? payload.sub)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function obtenerMenuNavegacion(): ItemNavegacion[] {
  const rol = obtenerRolUsuario()

  const menuCompleto: ItemNavegacion[] = [
    { etiqueta: 'Inicio', icono: 'inicio', ruta: '/panel' },
    { etiqueta: 'Pedidos', icono: 'pedidos', ruta: '/pedidos' },
    { etiqueta: 'Clientes', icono: 'clientes', ruta: '/clientes' },
    { etiqueta: 'Reportes', icono: 'reportes', ruta: '/reportes' },
    { etiqueta: 'Usuarios', icono: 'usuario', ruta: '/usuarios' }
  ]

  if (rol === 'repartidor') {
    return [{ etiqueta: 'Reparto', icono: 'camion', ruta: '/reparto' }]
  }

  if (rol === 'administrador') {
    // TODO (perfiles): Reparto va aquí solo para probarlo con la API real; según la Tabla 2 es del
    // perfil repartidor (ver permisosPedidos.ts).
    const [inicio, pedidos, ...resto] = menuCompleto
    return [inicio!, pedidos!, { etiqueta: 'Reparto', icono: 'camion', ruta: '/reparto' }, ...resto]
  }

  if (rol === 'cliente') {
    return menuCompleto.filter(item => ['Inicio', 'Pedidos'].includes(item.etiqueta))
  }

  if (rol === 'empleado') {
    return menuCompleto.filter(item => ['Inicio', 'Pedidos', 'Clientes', 'Reportes'].includes(item.etiqueta))
  }

  if (rol === 'reporte' || rol === 'reportes') {
    return menuCompleto.filter(item => ['Reportes'].includes(item.etiqueta))
  }

  // Si es administrador, retorna todo
  return menuCompleto
}

export function cerrarSesion(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('nombreUsuario')
  localStorage.removeItem('rolUsuario') // Limpiamos el rol al salir
}

export function haySesion(): boolean {
  return !!obtenerToken()
}