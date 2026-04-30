# Nota tecnica - AFIP/ARCA y vencimientos

Fecha de verificacion: 21/04/2026

## Conclusion corta
No se ve un Web Service oficial (API publica tipo JSON/XML) en el catalogo de AFIP/ARCA para consultar "agenda de vencimientos" como servicio de negocio.

## Que si existe
- Portal de vencimientos: https://www.afip.gob.ar/vencimientos/
- Agenda completa (SETI): https://seti.afip.gob.ar/av/seleccionVencimientos.do
- Catalogo oficial de WS (sin servicio de vencimientos): https://www.afip.gob.ar/ws/documentacion/catalogo.asp

## Hallazgos tecnicos
1. La agenda de vencimientos funciona con formularios web y endpoints .do (server-side HTML), por ejemplo:
   - /av/seleccionVencimientos.do
   - /av/viewVencimientos.do
2. La respuesta obtenida es HTML (grillas, links normativos), no se detecto salida oficial JSON/XML/CSV/XLS publica en la pagina consultada.
3. En el catalogo de Web Services no aparecen servicios con keywords de agenda/calendario/vencimientos.

## Entonces, se puede automatizar o hay que hacerlo manual?
No es "si o si manual", pero tampoco hay una API oficial directa y limpia para esto.

Opciones reales:
- Opcion A (MVP recomendado): carga manual asistida por el estudio + reglas por CUIT/regimen.
- Opcion B (semi-automatica): consumir/scrapear agenda web (con monitoreo por cambios de HTML).
- Opcion C (hibrida): calendario base manual + validacion humana + actualizacion periodica.

## Recomendacion practica para tu producto
1. Arrancar con enfoque hibrido (manual + validacion humana).
2. Guardar todo en tu propia base de reglas de vencimientos.
3. Agregar importacion automatica mas adelante como modulo opcional.

## Nota legal/operativa
Como los vencimientos pueden variar por norma, impuesto, tipo de contribuyente y terminacion CUIT, conviene siempre mantener validacion profesional del estudio antes de notificar clientes.
