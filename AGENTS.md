# AGENTS

Referencia original sin modificar:
- `C:\Users\Usuario\Documents\EMMA\control_facturacion_onlinevalles_v44.html`

Arquitectura activa:
- `C:\Users\Usuario\Documents\EMMA\frontend`
  Frontend est?tico actual.
- `C:\Users\Usuario\Documents\EMMA\backend`
  API Node/Express + acceso MySQL.

Frontend:
- `C:\Users\Usuario\Documents\EMMA\frontend\index.html`
  Entrada principal servida por Express.
- `C:\Users\Usuario\Documents\EMMA\frontend\assets\styles.css`
  Estilos extra?dos del monolito y mantenidos visualmente iguales.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\00-api-storage.js`
  Adaptador de persistencia `window.storage` hacia `/api/storage/*` y cliente de sesi?n con token.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\01-core.js`
  Estado global, autenticaci?n con token y sesi?n persistida, clientes, cobros y render base.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\02-invoices-v27-v31.js`
  Facturas base y vista de clientes ligada a facturaci?n.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\03-invoices-v32-v36.js`
  Packs, recurrencia y edici?n r?pida de facturas.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\04-invoices-v37-v39.js`
  Cobros pendientes, vista ampliada y ajustes finales.
- `C:\Users\Usuario\Documents\EMMA\frontend\js\05-init.js`
  Arranque con restauraci?n de sesi?n desde localStorage.

Backend:
- `C:\Users\Usuario\Documents\EMMA\backend\src\server.js`
  Arranque HTTP.
- `C:\Users\Usuario\Documents\EMMA\backend\src\app.js`
  Express + est?ticos + rutas API.
- `C:\Users\Usuario\Documents\EMMA\backend\src\routes\api.js`
  Endpoints `/api`, con rutas p?blicas de auth y middleware Bearer para datos protegidos.
- `C:\Users\Usuario\Documents\EMMA\backend\src\services\auth-service.js`
  Hash legado compatible, emisi?n y validaci?n de token firmado.
- `C:\Users\Usuario\Documents\EMMA\backend\src\services\storage-service.js`
  Traducci?n entre el formato legado del frontend y las tablas MySQL.
- `C:\Users\Usuario\Documents\EMMA\backend\src\db\schema.sql`
  Esquema MySQL base.
- `C:\Users\Usuario\Documents\EMMA\backend\scripts\init-db.js`
  Crea la base y aplica el esquema.

Persistencia actual:
- Usuarios: tabla `users`
- Comerciales: tabla `commercials`
- Clientes: tabla `clients`
- Servicios por cliente: tabla `client_services`
- Cobros mensuales: tabla `payments`
- Estado por servicio y mes: tabla `payment_service_statuses`
- Facturas: tabla `invoices`
- Clientes eliminados: tabla `deleted_client_snapshots`
- Ajustes ligeros como ?ltimo responsable: tabla `app_settings`
- Clave de alta de administradores: variable `ADMIN_REGISTRATION_KEY` en `.env`, validada solo en backend
- Secreto de sesi?n/token: variable `SESSION_SECRET` en `.env`

Decisiones importantes del formato:
- El frontend sigue usando casi el mismo contrato de datos que antes, pero ahora lo obtiene por API.
- La API expone rutas de recurso y tambi?n rutas de compatibilidad `/api/storage/:key` para no reescribir toda la UI de una vez.
- El login y el registro ya se validan en backend.
- La sesi?n del frontend persiste en `localStorage` mediante token Bearer.
- Todas las rutas de datos bajo `/api` requieren token Bearer, salvo `/api/health` y las rutas p?blicas de auth.
- La clave de admin ya no debe hardcodearse en frontend; la validaci?n vive en backend usando `ADMIN_REGISTRATION_KEY`.

Reglas de trabajo:
- No editar el archivo original salvo que se pida expl?citamente.
- Si el cambio es visual, tocar primero `frontend\assets\styles.css`.
- Si el cambio es funcional en UI, tocar el bloque JS correspondiente en `frontend\js`.
- Si el cambio es de persistencia o autenticaci?n, tocar primero `backend\src\services\storage-service.js` o `backend\src\services\auth-service.js` y luego la ruta afectada.
- Si cambia el modelo de datos, actualizar tambi?n `backend\src\db\schema.sql` y este archivo.
