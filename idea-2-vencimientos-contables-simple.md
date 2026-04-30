# Idea 2 (simple): Control de vencimientos para estudios contables

## 1) Que es (explicado facil)
Es un sistema para estudios contables que recuerda vencimientos automaticamente y evita olvidos.

En simple: ayuda a que no se pasen fechas importantes y baja el caos operativo.

## 2) A quien se lo vendes primero
Cliente ideal para arrancar:
- Estudios contables chicos o medianos (3 a 15 personas)
- Que manejen muchas pymes
- Que hoy usen planillas + recordatorios manuales

## 3) Problema real que duele
Lo que les pasa hoy:
- se olvidan de algun vencimiento,
- piden documentacion tarde,
- se estresan en fechas pico,
- y pierden tiempo en seguimiento manual.

## 4) Que vas a construir (MVP en 21 a 30 dias)
Version minima para vender:
- Panel de clientes + tipo de obligacion.
- Calendario automatico de vencimientos.
- Recordatorios por WhatsApp y/o email (D-7, D-3, D-1).
- Semaforo por cliente: verde, amarillo, rojo.
- Alerta interna al estudio cuando falta documentacion.

## 5) Implementacion paso a paso
### Semana 1
- Hablar con 8 a 10 estudios contables.
- Detectar que vencimientos les duelen mas.
- Definir plantilla inicial de obligaciones.

### Semana 2
- Armar base de datos de clientes y obligaciones.
- Conectar automatizaciones de aviso.
- Probar flujos con 3 casos reales.

### Semana 3
- Dashboard simple para ver riesgos por cliente.
- Ajustar mensajes de recordatorio.
- Preparar demo de 10 minutos.

### Semana 4
- Instalar 2 a 3 pilotos pagos.
- Medir: menos olvidos y mas entregas a tiempo.

## 6) Costos para arrancar (mensual, estimado realista)
| Item | Costo aprox |
| --- | --- |
| Dominio + landing | USD 10 a 20 |
| Make Core (o n8n self-host) | USD 9 a 20 |
| WhatsApp API + mensajes | USD 15 a 35 |
| Herramienta de datos (Airtable/Baserow/Sheets + backups) | USD 0 a 24 |
| Google Workspace (opcional) | USD 6 |
| Total estimado | USD 34 a 105 / mes |

## 7) Precio recomendado para vender
- Plan Base: USD 59/mes (hasta X clientes)
- Plan Pro: USD 99/mes
- Setup inicial: USD 150 a 300

Con 20 clientes en plan de USD 99 => USD 1980 MRR.

## 8) Como conseguir clientes reales (sin humo)
### Metodo 1: Lista local de estudios
- Buscar 50 estudios en Google Maps y LinkedIn.
- Contactar 8 a 10 por dia.
- Objetivo: 10 reuniones de diagnostico.

### Metodo 2: Oferta concreta de piloto
- "Piloto pago de 30 dias para 20 clientes de prueba"
- Precio de entrada bajo para empezar rapido.

### Metodo 3: Nicho dentro del nicho
No vendas "para todos".
Ejemplos:
- estudios que llevan comercios,
- estudios que llevan monotributistas,
- estudios de una camara o zona puntual.

## 9) Guion simple para primer mensaje
"Hola [Nombre], estoy ayudando a estudios contables a reducir olvidos de vencimientos con recordatorios automaticos y tablero de riesgo por cliente. Te puedo mostrar en 15 min como quedaria en tu estudio con un piloto corto?"

## 10) Cuando decir GO o NO-GO
GO si en 30 a 45 dias logras:
- 2 o mas pilotos pagos,
- 1 o mas renovaciones mensuales,
- mejora real en entregas a tiempo.

NO-GO si:
- hablas con 20+ estudios y ninguno paga,
- o el uso diario es tan complejo que nadie lo mantiene.

## 11) Nota importante
Esto ayuda a ordenar y recordar, pero no reemplaza criterio contable/profesional.
El valor es operativo: menos caos, mas control, mejor seguimiento.

## 12) Que significa "vencimiento" (bien claro)
Un vencimiento es la fecha limite para presentar o pagar algo.

Ejemplos comunes (pueden variar por tipo de cliente y provincia):
- IVA mensual.
- Monotributo.
- Cargas sociales / F931.
- Ingresos Brutos (provincial).
- Regimenes informativos.

En criollo: si te pasas de esa fecha, aparecen intereses, multas o problemas operativos.

## 13) Ejemplo concreto del dolor (con numeros)
Caso realista:
- Estudio con 120 clientes pyme.
- Equipo de 4 personas.
- Hoy controlan todo en planillas + calendario manual.

Que pasa en mes pico:
- Se olvidan pedir papeles a 15 clientes a tiempo.
- 6 clientes entregan tarde.
- 2 vencimientos se atienden sobre la hora con estres total.

Resultado real:
- Horas extra del equipo.
- Clientes enojados por urgencias.
- Riesgo de recargos por presentacion/pago fuera de fecha.

Dolor que vendes: "menos caos de ultimo minuto y menos riesgo por olvidos".

## 14) Duda clave: "hay que consultar ARCA/AFIP?"
Si, ARCA (ex AFIP) es fuente oficial para obligaciones nacionales.
Pero para MVP no necesitas una mega integracion desde dia 1.

Plan simple por fases:
1. Fase MVP (rapida):
	- Cargar calendario base de obligaciones manualmente.
	- Ajustar por tipo de cliente y terminacion de CUIT.
2. Fase 2 (semi automatica):
	- Importar reglas por CSV/Google Sheet.
	- Validacion humana antes de publicar vencimientos.
3. Fase 3 (avanzada):
	- Integraciones mas profundas si hay endpoints oficiales o proveedor tercero.

Importante:
- El sistema ayuda a recordar y ejecutar.
- La decision profesional final siempre la valida el estudio contable.

## 15) Como pensarlo como desarrollador (arquitectura simple)
Tablas base:
- `clientes`
- `obligaciones`
- `vencimientos`
- `recordatorios`
- `documentacion_pendiente`
- `historial_eventos`

Flujo tecnico:
1. Cargas cliente + tipo fiscal + provincia.
2. Motor calcula proximos vencimientos.
3. Scheduler diario revisa "que vence en D-7, D-3, D-1".
4. Envia aviso por WhatsApp/email.
5. Si cliente entrega documentacion, cambia a verde.
6. Si no entrega, queda amarillo/rojo y alerta al estudio.

## 16) Futuro desarrollo (roadmap dev)
Version 1 (MVP):
- Calendario, alertas, semaforo y tablero de riesgo.

Version 2:
- Portal del cliente para subir documentacion.
- Plantillas por tipo de contribuyente.
- Auditoria de "quien hizo que y cuando".

Version 3:
- Prediccion de clientes con alto riesgo de atraso.
- Recomendacion automatica de prioridad diaria.
- Integraciones contables mas profundas.
