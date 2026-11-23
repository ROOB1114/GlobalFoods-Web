# Guía operativa de Global Foods México

## 1. Propósito

Este documento sirve como guía operativa para iniciar, mantener y diagnosticar la interfaz de Global Foods México. Está pensado para el equipo de desarrollo, pruebas y soporte en entornos locales o de integración.

## 2. Alcance

El proyecto es una interfaz web desarrollada con Vue 3, Vite y TypeScript. La aplicación contiene módulos de usuarios, ventas, inventario, reparto y administración.

## 3. Requisitos del entorno

Antes de trabajar en el proyecto, asegúrate de contar con lo siguiente:

- Node.js 20 o superior
- npm 10 o superior
- Git, para control de versiones
- Editor de código con soporte para Vue/TypeScript, preferiblemente VS Code

## 4. Instalación

Desde la raíz del proyecto ejecuta:

```bash
npm install
```

Si el entorno no tiene dependencias instaladas, el comando anterior las prepara automáticamente.

## 5. Arranque en desarrollo

```bash
npm run dev
```

La aplicación queda disponible en:

- http://localhost:5173

Si el puerto está ocupado, Vite puede reasignar el puerto automáticamente o puedes ajustar la configuración en `vite.config.ts`.

## 6. Compilación y validación

Para compilar el proyecto:

```bash
npm run build
```

Para previsualizar la versión construida:

```bash
npm run preview
```

## 7. Estructura del proyecto

```text
src/
├─ inicio.ts
├─ aplicacion/
│  ├─ Aplicacion.vue
│  └─ enrutador.ts
├─ recursos/
├─ componentes/
├─ estilos/
├─ modulos/
│  ├─ autenticacion/
│  ├─ principal/
│  ├─ administracion/
│  ├─ ventas/
│  ├─ almacen/
│  └─ reparto/
└─ pruebas/
```

### Descripción por capa

- `src/aplicacion/Aplicacion.vue`: raíz de la aplicación
- `src/inicio.ts`: punto de entrada de Vue
- `src/aplicacion/enrutador.ts`: configuración de las rutas
- `src/componentes`: elementos reutilizables en toda la interfaz
- `src/modulos`: módulos funcionales del sistema
- `src/estilos/tokens.css`: tokens visuales y paleta de colores

## 8. Módulos del sistema

### Autenticación

Contiene la pantalla de inicio de sesión.

- Ruta: `/inicio-sesion`
- Vista: `src/modulos/autenticacion/vistas/InicioSesionVista.vue`
- Servicio: `src/modulos/autenticacion/servicios/servicioAutenticacion.ts`
- La dirección de la API se configura con `VITE_API_URL`; por defecto es `http://localhost:3000`.

### Principal

Incluye la vista general del sistema a partir del panel central.

- Ruta: `/panel`
- Recurso principal: `src/modulos/principal/vistas/PanelVue.vue`

### Administración

Se encarga del módulo de administración y usuarios.

- Ruta: `/usuarios`
- Vista: `src/modulos/administracion/vistas/UsuariosVista.vue`

### Ventas

Contiene la pestaña **Pedidos** (lista, detalle con cancelar y registrar pago, y edición de pedidos pendientes) y la pantalla **Nuevo pedido**: el asesor busca un cliente activo, elige la sucursal de entrega (solo a domicilio; en recolección no se pide), agrega productos del inventario, captura los datos de entrega, confirma el resumen y registra el pedido. La fecha de entrega y el método de pago no se capturan al crear: se llenan al registrar el pago, en el detalle del pedido o en el sistema interno. El pedido queda en estado Pendiente, con método de pago pendiente y un folio.

#### Pedidos (lista y detalle)

- Rutas: `/pedidos` (nombre `pedidos`) y `/pedidos/:id` (nombre `detalle-pedido`; solo ids numéricos, para no chocar con `/pedidos/nuevo`). Ambas requieren sesión. Se abren desde "Pedidos" en el menú lateral.
- Vistas: `PedidosVista.vue` y `DetallePedidoVista.vue`; componentes `FiltrosPedidosVue.vue` (píldoras de estado, búsqueda con lista de clientes y fechas), `AvancePedidoVue.vue` (barra de avance), `ModalCancelarPedidoVue.vue` y `ModalRegistrarPagoVue.vue`.
- Controladores: `usarListaPedidos.ts` (carga, filtros, conteos y páginas de 10, todo en la web), `usarDetallePedido.ts`, `usarDirectorioPedidos.ts` (nombres de cliente y sucursal) y `sesionVencida.ts` (401 → inicio de sesión).
- Estados: `estadosPedido.ts` traduce el `Estatus` de la API: 1 Pendiente, 2 Surtido, 3 En reparto, 4 Entregado (completado en la API) y 5 Cancelado. Surtido lo registra el sistema interno; Entregado, el sistema interno o la web al registrar el pago. Lo que cambia en el sistema interno se refleja con la actualización de cada minuto (`usarActualizacionPeriodica.ts`). Cancelado no es paso de la barra de avance. Un número desconocido se ve como "Estado {n}". Si cambian los nombres, se ajustan solo ahí. Ahí también están las reglas de cada acción: `sePuedeCancelar()` (Creado, Surtido y En reparto), `sePuedeRegistrarPago()` (Surtido y En reparto) y `sePuedeEditar()` (solo Pendiente).
- Permisos: `permisosPedidos.ts` decide qué perfiles ven cada acción: `perfilPuedeCancelar()`, `perfilPuedeRegistrarPago()` y `perfilPuedeEditar()`. Por ahora las tres son solo para administrador. Solo deciden si se muestra el botón; la API también debe rechazar la acción a los demás perfiles.
- Observaciones: `observacionesPedido.ts` arma el texto que guarda Nuevo pedido y lo lee de vuelta: modalidad, `Ref:` y notas (p. ej. `A domicilio · Ref: portón negro · Llamar antes de llegar` o `Recolección en congeladora · Pasa por la tarde`); la lectura también reconoce `Dir:`, aunque hoy no se escribe. Ya no lleva la fecha de entrega: si un pedido anterior o de la app móvil trae `Entrega dd/mm/aaaa` después de la modalidad, se ignora. Un texto que no empieza con una modalidad se muestra completo como observaciones.
- Fecha de entrega: la API la regresa en el pedido en `FechaEntrega` (campo opcional confirmado por el backend), como entero `aaaammdd` (igual que `Fecha`) o `null`; por compatibilidad también se lee `fechaEntrega`. Se llena al registrar el pago, en la web o en el sistema interno. Si no viene, viene `null` o 0, la lista y el detalle muestran "—".
- Recolección: `puntoRecoleccion.ts` tiene el punto de recolección (nombre, enlace a Maps y coordenadas) y la regla de que `IdSucursal` 0 es recolección. Un pedido con `IdSucursal` 0 es de recolección aunque `Observaciones` no lo diga: no se busca su sucursal, la lista y el detalle muestran "Recolección en congeladora" en lugar de "Sucursal #0", y el detalle muestra el punto de recolección con "Ver en Maps".
- Datos: `GET /api/pedidos` y `GET /api/pedidos/:id` (`servicioPedidos.ts`, con el mismo manejo de 401 y límite de 10 s que el registro). El pedido solo trae `IdCliente` e `IdSucursal`: el nombre del cliente sale de `GET /api/clientes/activos` ("Cliente #Id" si está inactivo) y las sucursales se piden por cliente, solo para los de la página a la vista, una vez cada uno ("Sucursal #Id" si no se encuentra).
- Cambios con `PUT /api/pedidos/:id`: cancelar, registrar el pago y editar primero consultan el pedido con `GET /api/pedidos/:id`, revisan que siga en un estado que lo permita y lo vuelven a mandar completo, armado por una sola función (`cuerpoActualizacion()` en `servicioPedidos.ts`): lo que regresó el `GET` con los cambios encima. `MetodoPago` y la fecha de entrega se reenvían solo si el `GET` los trae, con el mismo nombre de campo con que llegaron; las líneas, tal como vienen (salvo al editar). Si el estado ya no lo permite, no se manda el `PUT` y la vista muestra el motivo.
- Cancelar: `ModalCancelarPedidoVue.vue` y `cancelarPedido()`: el mismo pedido con `Estatus` 5, como la app móvil. El botón sale en los estados de `sePuedeCancelar()` (Creado, Surtido y En reparto). Los pedidos no se borran: no se usa `DELETE /api/pedidos`. El motivo todavía no se pide porque la API no tiene dónde guardarlo.
- Registrar pago: botón "Registrar pago" del detalle, en Surtido o En reparto; `ModalRegistrarPagoVue.vue` y `registrarPago()`. El modal muestra el total, pide el método (Efectivo o Transferencia; sin elegir no deja registrar: "Seleccione el método de pago.") y avisa que el pedido quedará Entregado con la fecha de entrega de hoy. Se manda el mismo pedido con `Estatus` 4, el `MetodoPago` elegido (1 o 2) y la fecha de hoy como entero `aaaammdd`, con el mismo nombre con que la regresó el `GET` o, si no la trae, como `FechaEntrega`. Si el pedido ya no está en Surtido ni En reparto: "El pago no se registró porque el pedido se encuentra [estado]." Al terminar avisa "Pago registrado. El pedido #id quedó Entregado." y recarga el pedido. La actualización de cada minuto se pausa mientras la ventana está abierta o enviando.
- Errores de cancelar y registrar pago: con la sesión vencida, a inicio de sesión; sin conexión, "El cambio no se guardó…" o "El pago no se guardó por falta de conexión. Intente nuevamente." (la ventana sigue abierta); con 400 o 409, el mensaje de la API y se recarga el pedido; cualquier otro, "No fue posible cancelar el pedido…" o "No fue posible registrar el pago. Intente nuevamente."
- Método de pago: `metodosPago.ts` traduce `MetodoPago` (0 Pendiente, 1 Efectivo, 2 Crédito o transferencia). Todo pedido nuevo se crea con 0 (pendiente) y cambia a 1 o 2 al registrar el pago, en el detalle del pedido o en el sistema interno. Solo en el modal de pago el 2 se llama "Transferencia"; en la columna Método de pago de la lista y en el detalle se sigue viendo "Crédito o transferencia", porque el sistema interno usa el 2 también para crédito. Si la API no lo regresa, "—".
- Todavía no hay historial: la API no guarda los cambios de estado.

#### Editar pedido

- Ruta: `/pedidos/:id/editar` (nombre `editar-pedido`, solo ids numéricos, requiere sesión). Se abre con "Editar pedido" en el encabezado del detalle, que sale solo en Pendiente (`sePuedeEditar()`) y para los perfiles de `perfilPuedeEditar()`. El menú lateral marca "Pedidos" y la ruta de navegación es Pedidos › Pedido #id › Editar.
- Vista: `EditarPedidoVista.vue`. Reutiliza las secciones, el resumen y los modales de Nuevo pedido (`SeccionClienteVue` con `fijo`; `ResumenPedidoVue`, `ModalConfirmarPedidoVue` y `ModalDescartarPedidoVue` con `folio-edicion`).
- Estado y reglas: `usarEditarPedido.ts`, sobre `usarFormularioPedido.ts`, la lógica que comparte con Nuevo pedido (inventario, sucursales, renglones, validaciones, totales, entrega y envío). Las validaciones y los mensajes son los mismos.
- Al abrir carga el pedido con `obtenerPedidoPorId()` y llena el formulario: el cliente se muestra fijo (no se puede cambiar), la modalidad sale de `modalidadDePedido()`, las referencias y notas de `leerObservaciones()` y los productos con su cantidad. La sucursal del pedido se elige cuando llegan las sucursales activas del cliente; si ya no está activa, se elige como en Nuevo pedido.
- Se puede cambiar: productos y cantidades, modalidad, sucursal, dirección y referencias, y observaciones.
- Precio por kg: las líneas que ya traía el pedido conservan el precio con que se guardaron; los productos que se agregan toman el precio actual del inventario. Si se quita una línea y se vuelve a agregar, entra como producto nuevo.
- Disponibilidad: en una línea que ya traía el pedido, el límite es lo disponible en inventario o la cantidad que ya tenía, lo que sea mayor (esos kg tal vez ya los cuenta este mismo pedido). Si el producto ya no está en el inventario, la línea se queda con sus datos guardados, dice "Ya no está en el inventario" y no se puede aumentar.
- Si el pedido ya no está en Pendiente no se muestra el formulario: "El pedido ya no puede modificarse porque se encuentra [estado]." con un enlace al detalle. Si no existe, el mismo mensaje que el detalle.
- Guardar: confirma con "¿Guardar los cambios del pedido #id por $total?" y llama a `actualizarPedido()`: consulta el pedido y, si sigue Pendiente, manda el `PUT` con `IdSucursal`, `TotalKG`, `Total`, `Observaciones` (con `armarObservaciones()`) y `lineas` nuevos; `IdCliente`, `Fecha`, `Estatus`, `MetodoPago` y la fecha de entrega van tal como llegaron. Si ya no está Pendiente: "El pedido cambió a [estado] mientras lo editaba; los cambios no se guardaron."
- Resultado: si sale bien, regresa al detalle (con `?aviso=actualizado`, que el detalle quita de la dirección) y muestra "Pedido actualizado correctamente." Si falla, "No fue posible guardar los cambios. Intente nuevamente." (o el mensaje de la API con 400/409) y se queda en la pantalla sin perder lo capturado. Sin conexión o con la sesión vencida, igual que Nuevo pedido.
- Salir con cambios sin guardar (flecha, Cancelar, menú lateral o botón atrás) pide confirmar con "¿Descartar los cambios?".

#### Nuevo pedido

- Ruta: `/pedidos/nuevo` (nombre `nuevo-pedido`, requiere sesión). Se abre con el botón "Nuevo pedido" de Inicio (`?desde=inicio`) o de Pedidos (`?desde=pedidos`). `NuevoPedidoVista.vue` lee `desde` para regresar a esa pantalla con la flecha, Cancelar, Descartar y el botón posterior al registro ("Ir al inicio" o "Ir a Pedidos"), y para marcar el origen en la ruta de navegación y en el menú lateral. Sin `desde` o con otro valor, regresa a Pedidos.
- Vista: `src/modulos/ventas/vistas/NuevoPedidoVista.vue`
- Componentes: `src/modulos/ventas/componentes/` (secciones Cliente, con el selector de sucursal, Productos y Entrega, resumen lateral y modales Agregar producto, Confirmar pedido y Descartar pedido)
- Estado y validaciones: `src/modulos/ventas/controladores/usarNuevoPedido.ts` (cliente, aviso de descarte y registro), sobre `usarFormularioPedido.ts` (formulario, compartido con Editar pedido), y `usarBuscadorClientes.ts` (búsqueda de clientes)
- Tipos: `src/modulos/ventas/interfaces/cliente.ts` y `pedido.ts`
- Servicios:
  - Productos: reales, de `GET /api/inventario/actual` (`src/modulos/almacen/servicios/servicioInventario.ts`).
  - Clientes: reales, de `GET /api/clientes/activos` (`servicioClientesVentas.ts`). La lista se pide una vez al abrir el buscador, se guarda en memoria mientras la pantalla está abierta y se muestra completa, por nombre. Al escribir se filtra en el navegador desde la primera letra (primero los que empiezan con lo escrito, después los que lo contienen). Hoy la API solo trae `Id` y `Nombre`; si agrega `Telefono`, también se busca y se muestra sin más cambios. No usar `GET /api/clientes`: regresa contraseñas.
  - Sucursales: reales, de `GET /api/sucursales-clientes?idCliente={id}` (`servicioClientesVentas.ts`). Solo se muestran las activas (`Estatus` 1).
  - Registro: real, con `POST /api/pedidos` (`servicioPedidos.ts`). Se envía con `Estatus` 1 (creado), `MetodoPago` siempre en 0 (pendiente; no se elige en la pantalla), `Fecha` del día en que se crea como entero `aaaammdd` e `IdSucursal` de la sucursal elegida (a domicilio) o 0 (recolección); el folio es `#` y el `Id` que regresa la API. No se envía fecha de entrega. Como la API no tiene campos para modalidad ni referencias, van al inicio de `Observaciones`, seguidas de lo que capturó la asesora (p. ej. `A domicilio · Ref: portón negro · Llamar antes de llegar` o `Recolección en congeladora · Pasa por la tarde`). Las líneas llevan `CodigoProducto`, `Talla`, `Cantidad`, `Precio` y `Subtotal`.

Avisos del registro: si la API responde 401, se cierra la sesión y se pasa a inicio de sesión con "Su sesión expiró. Inicie sesión nuevamente."; si no hay conexión o pasan 10 segundos sin respuesta, se cancela y aparece "No es posible conectar con el servidor. Intente más tarde."; cualquier otro error muestra "No fue posible registrar el pedido. Intente nuevamente." El mensaje exacto de la API se ve en la respuesta de la petición, en la pestaña Red.

Para probar los avisos de error, bloquea la petición en la pestaña Red de las herramientas del navegador (clic derecho → "Bloquear URL de solicitud") sobre `clientes/activos`, `sucursales-clientes` o `api/pedidos`. Si la API no está corriendo, la sección Productos muestra "No es posible confirmar la disponibilidad en este momento." y no deja agregar productos.

Si hay datos capturados, salir de la pantalla por el menú lateral, el botón atrás del navegador o "Cancelar" pide confirmar que se descartan. Recargar la página o cerrar la pestaña no pide confirmación.

### Almacén y reparto

Están diseñados para alojar las pantallas de cada área del negocio. Actualmente el proyecto ya define la estructura base y los módulos visuales principales, y está listo para ampliarse con lógica real de negocio.

## 9. Rutas actuales

El enrutador usa historial HTML5 configurado con Vue Router:

- `/` → redirige a `/inicio-sesion`
- `/inicio-sesion`
- `/panel`
- `/usuarios`
- `/pedidos`
- `/pedidos/nuevo`
- `/pedidos/:id` (solo números)
- `/pedidos/:id/editar` (solo números)

## 10. Convenciones de desarrollo

### Nomenclatura

- Los archivos de componentes terminan con `Vue` para mantener consistencia.
- Las vistas se ubican dentro de `vistas/` en cada módulo.
- Los aliases de importación usan `@` apuntando a `src`.

### Estilos

- La hoja de estilos principal debe mantenerse en `src/estilos/tokens.css`.
- Preferir `scoped` para estilos específicos de componentes.
- Reutilizar componentes existentes de `src/componentes` antes de crear nuevos.

### TypeScript

- Mantén los tipos en interfaces y modelos del dominio.
- Evita valores duros cuando ya exista un componente o constante reutilizable.

## 11. Flujo de trabajo recomendado

1. Abrir el proyecto en VS Code.
2. Ejecutar `npm install` si es la primera vez.
3. Lanzar `npm run dev`.
4. Trabajar dentro del módulo correspondiente.
5. Reutilizar UI y componentes compartidos.
6. Ejecutar `npm run build` antes de cerrar tareas o entregar cambios.

## 12. Diagnóstico y resolución de problemas

### Error: dependencias no instaladas

```bash
npm install
```

### Error: Vite no inicia

Verifica:

- que Node.js esté instalado correctamente
- que el puerto 5173 no esté ocupado
- que no haya errores en la configuración de Vite

### Error de compilación TypeScript

Ejecuta:

```bash
npm run build
```

Revisa los mensajes de Vue y TypeScript. En la mayoría de los casos se debe a:

- imports incorrectos
- tipos sin definir
- rutas de alias mal configuradas
- archivos de componentes con errores de sintaxis

### Componentes no se renderizan

Verifica:

- que la ruta esté registrada en `src/aplicacion/enrutador.ts`
- que el componente exista en la ruta importada
- que el alias `@` esté correctamente resuelto por Vite

## 13. Buenas prácticas para mantenimiento

- Mantener la documentación actualizada después de cada cambio importante.
- Documentar nuevas rutas, módulos y props de componentes.
- Respetar el sistema de tokens visuales del proyecto.
- Priorizar consistencia de UI sobre soluciones aisladas.
- Hacer pruebas manuales de navegación y pantallas principales antes de cerrar una tarea.

## 14. Recomendaciones de mejora

A futuro, se recomienda:

- integrar un backend real con servicios API y manejo de errores
- añadir autenticación con tokens o sesiones
- crear una capa de servicios para cada módulo
- agregar pruebas unitarias y de integración
- definir estándares de estado y carga para cada módulo

## 15. Contacto / responsables

El proyecto es desarrollado por el equipo de Global Foods México del curso académico actual. Para cambios de arquitectura, revisión de UI o coordinación de entregas, se recomienda comunicar los cambios dentro del equipo en la misma rama o issue de trabajo.

## 16. Resumen rápido

Comandos clave:

```bash
npm install
npm run dev
npm run build
npm run preview
```

Si algo falla, revisa primero:

- dependencias
- rutas
- configuración de Vite
- compilación con TypeScript
- estado de la ejecución local
