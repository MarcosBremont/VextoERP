# VextoERP

## Versionado

Este proyecto lleva su número de versión en [`version.json`](version.json)
(`{ "version": "x.y.z", "updatedAt": "YYYY-MM-DD" }`). El sidebar de la app
lo lee en tiempo real y lo muestra en la esquina inferior (`#versionBadge`
en cada página, resuelto por `applyVersionBadge()` en `js/data.js`) — no
hay que tocar HTML/JS para que se vea el número nuevo, solo actualizar el
JSON.

**Regla: cada vez que se suban cambios a este repositorio (`git push`),
antes de subir hay que:**

1. Incrementar `version` en `version.json` siguiendo semver:
   - **patch** (`1.0.0` → `1.0.1`): fixes, ajustes visuales, optimizaciones.
   - **minor** (`1.0.1` → `1.1.0`): funcionalidad nueva (un apartado, un
     campo, una integración).
   - **major** (`1.x.x` → `2.0.0`): cambios grandes o incompatibles con
     el uso normal del sistema.
2. Actualizar `updatedAt` a la fecha del cambio.
3. Incluir `version.json` en el mismo commit que el resto del cambio.
