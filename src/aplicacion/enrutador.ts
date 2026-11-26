import { createRouter, createWebHistory } from 'vue-router'

import InicioSesionVista from '@/modulos/autenticacion/vistas/InicioSesionVista.vue'
import PanelVue from '@/modulos/principal/vistas/PanelVue.vue'
import UsuariosVista from '@/modulos/administracion/vistas/UsuariosVista.vue'
import { esRolReportes, haySesion } from '@/modulos/autenticacion/servicios/servicioAutenticacion'
import ClientesVista from '@/modulos/administracion/vistas/ClientesVista.vue'
import DetalleClienteVista from '@/modulos/administracion/vistas/DetalleClienteVista.vue'
import NuevoPedidoVista from '@/modulos/ventas/vistas/NuevoPedidoVista.vue'
import PedidosVista from '@/modulos/ventas/vistas/PedidosVista.vue'
import DetallePedidoVista from '@/modulos/ventas/vistas/DetallePedidoVista.vue'
import EditarPedidoVista from '@/modulos/ventas/vistas/EditarPedidoVista.vue'
import ReportesVista from '@/modulos/administracion/vistas/ReportesVista.vue'
import InventarioVista from '@/modulos/almacen/vistas/InventarioVista.vue'

const enrutador = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/inicio-sesion',
    },
    {
      path: '/inicio-sesion',
      name: 'inicio-sesion',
      component: InicioSesionVista,
    },
    {
      path: '/panel',
      name: 'panel',
      component: PanelVue,
      meta: { requiereAutenticacion: true },
    },
    {
      path: '/usuarios',
      name: 'usuarios',
      component: UsuariosVista,
      meta: { requiereAutenticacion: true },
    },
    {
      path: '/pedidos',
      name: 'pedidos',
      component: PedidosVista,
      meta: { requiereAutenticacion: true },
    },
    {
      path: '/pedidos/nuevo',
      name: 'nuevo-pedido',
      component: NuevoPedidoVista,
      meta: { requiereAutenticacion: true },
    },
    {
      // Solo números, para que no choque con /pedidos/nuevo.
      path: '/pedidos/:id(\\d+)',
      name: 'detalle-pedido',
      component: DetallePedidoVista,
      meta: { requiereAutenticacion: true },
    },
    {
      path: '/pedidos/:id(\\d+)/editar',
      name: 'editar-pedido',
      component: EditarPedidoVista,
      meta: { requiereAutenticacion: true },
    },
    {
      path: '/clientes',
      name: 'clientes',
      component: ClientesVista
    },
    {
      path: '/detalle-cliente-vista/:id',
      name: 'detalle-cliente',
      component: DetalleClienteVista
    },
    {
      path: '/reportes',
      name: 'reportes',
      component: ReportesVista,
      meta: { requiereAutenticacion: true }
    },
    {
      path: '/inventario',
      name: 'inventario',
      component: InventarioVista,
      meta: { requiereAutenticacion: true },
    },
  ],
})

enrutador.beforeEach((destino) => {
  const requiereAutenticacion = destino.matched.some((registro) => registro.meta.requiereAutenticacion)

  if (requiereAutenticacion && !haySesion()) {
    return '/inicio-sesion'
  }

  if (destino.path === '/inicio-sesion' && haySesion()) {
    return esRolReportes() ? '/reportes' : '/panel'
  }

  if (haySesion() && esRolReportes() && destino.name !== 'reportes' && destino.name !== 'detalle-pedido') {
    return '/reportes'
  }
})

export default enrutador
