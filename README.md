# CobroClaro - MVP de control de pagos

MVP estático para validar una oferta de control de pagos, cuotas y deudores en negocios chicos que hoy usan papel, Excel o WhatsApp.

## Qué permite probar

- Cargar clientes manualmente.
- Importar filas desde CSV.
- Ver cuotas pendientes, vencidas y pagadas.
- Registrar pagos.
- Sumar deuda mensual.
- Generar recordatorio por WhatsApp.
- Exportar cartera a CSV.
- Guardar datos en `localStorage` del navegador.

## Oferta comercial que valida

"Te ordeno tus cobros en 48 horas aunque hoy los tengas en papel, Excel o WhatsApp, y te queda un tablero mensual para saber quién pagó, quién debe y a quién reclamarle."

## Precio piloto sugerido

- Abono: $29.000 a $59.000 por mes.
- Setup inicial: $70.000 a $150.000 según cantidad de clientes y desorden de datos.

## Próximos pasos técnicos

1. Agregar autenticación.
2. Pasar datos a Supabase.
3. Crear importador real de Excel.
4. Integrar links de Mercado Pago.
5. Automatizar recordatorios por WhatsApp/email.
