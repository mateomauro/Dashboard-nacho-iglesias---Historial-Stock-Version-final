# Idea 1 (simple): Turnos + Cotizaciones + Seguimiento para servicios locales

## 1) Que es (explicado facil)
Es un sistema que ayuda a negocios de servicios (plomero, electricista, aire acondicionado, etc.) a:
- no perder mensajes,
- enviar presupuestos mas rapido,
- y recordar seguimiento automaticamente.

Pensalo como un "asistente" que trabaja 24/7.

## 2) A quien se lo vendes primero
Empeza por 1 solo subnicho en tu ciudad (no a todos juntos):
- Plomeros
- Electricistas
- Tecnicos de aire acondicionado

Regla simple: elegi el rubro que mas usa WhatsApp para vender.

## 3) Problema real que duele
Hoy muchos negocios pierden plata porque:
- los mensajes quedan enterrados en WhatsApp,
- se olvidan de mandar presupuesto,
- no hacen seguimiento,
- y el cliente termina contratando a otro.

## 4) Que vas a construir (MVP en 14 a 21 dias)
Version minima para vender YA:
- Formulario o boton de contacto (web o WhatsApp).
- Tablero simple de leads (nuevo, cotizado, en seguimiento, cerrado).
- Plantilla de cotizacion rapida.
- Recordatorio automatico a las 24h y 72h si no respondio.
- Resumen semanal (cuantos presupuestos se enviaron y cuantos cerraron).

No hace falta app compleja al inicio.

## 5) Implementacion paso a paso
### Semana 1
- Hablar con 10 negocios del subnicho.
- Confirmar el dolor principal (que es lo que mas pierden).
- Armar prototipo simple (tablero + flujo de mensajes).

### Semana 2
- Conectar automatizaciones (Make o n8n).
- Probar envio de recordatorios y estados.
- Preparar demo de 5 minutos.

### Semana 3
- Instalar 3 pilotos pagos.
- Medir resultados reales (respuestas, cotizaciones, cierres).
- Ajustar lo que no funcione.

## 6) Costos para arrancar (mensual, estimado realista)
| Item | Costo aprox |
| --- | --- |
| Dominio + landing | USD 10 a 20 |
| Make Core (o n8n self-host) | USD 9 a 20 |
| WhatsApp API (proveedor oficial) | USD 15 a 35 |
| Base de datos simple (Airtable/Notion/Baserow) | USD 0 a 12 |
| Total estimado | USD 34 a 87 / mes |

## 7) Precio recomendado para vender
- Plan Base: USD 29/mes
- Plan Pro: USD 49/mes
- Setup inicial (una sola vez): USD 99

Con 10 clientes en plan de USD 49 => USD 490 MRR.

## 8) Como conseguir clientes reales (sin humo)
### Metodo 1: Prospeccion local directa
- Sacar lista de 50 negocios de Google Maps.
- Contactar 10 por dia por WhatsApp o llamada.
- Objetivo: agendar demo de 15 minutos.

### Metodo 2: Oferta de piloto pago
No regales todo. Mejor:
- "Piloto de 14 dias por USD 30-50"
- Si no ven mejora, no siguen.

### Metodo 3: Alianzas
- Hablar con agencias de marketing locales o freelancers que ya les llevan leads.
- Ellos te pueden referir clientes.

## 9) Guion simple para primer mensaje
"Hola [Nombre], vi su negocio en Google. Estoy ayudando a [rubro] a no perder presupuestos por falta de seguimiento en WhatsApp. Hice un sistema simple que ordena contactos y manda recordatorios automaticos. Te muestro en 15 min y ves si te sirve?"

## 10) Cuando decir GO o NO-GO
GO si en 30 dias logras:
- 3 pilotos pagos,
- 2 clientes activos mensuales,
- y el onboarding tarda menos de 90 minutos por cliente.

NO-GO si:
- hablas con 30 negocios y nadie paga,
- o todos dicen que ya lo resuelven bien.

## 11) Ejemplo concreto del dolor (con numeros)
Caso realista:
- "Juan Electricidad" recibe 30 consultas por WhatsApp por semana.
- Llega a enviar 18 presupuestos.
- Como no hace seguimiento ordenado, 8 quedan sin respuesta.
- De esas 8, podria haber cerrado 2 trabajos.
- Ticket promedio por trabajo: USD 120.

Perdida estimada por semana: 2 x 120 = USD 240.
Perdida estimada por mes: USD 960.

Ese es el dolor que vendes: "No te falta trabajo, se te escapan cierres por desorden".

## 12) Duda clave: "como se si un cliente respondio por WhatsApp?"
Respuesta corta: con webhook de WhatsApp API oficial.

Como funciona simple:
- Vos mandas un mensaje (presupuesto o seguimiento).
- WhatsApp te manda eventos al webhook:
	- enviado,
	- entregado,
	- leido,
	- mensaje entrante del cliente.
- Si entra mensaje del cliente, marcas `respondido = si` y cancelas recordatorios automaticos.

Logica minima:
1. Envias presupuesto -> estado `esperando_respuesta`.
2. Si en 24h no entro mensaje -> recordatorio 1.
3. Si en 72h no entro mensaje -> recordatorio 2.
4. Si entra mensaje en cualquier momento -> estado `respondido` + se frena el flujo.

## 13) Como pensarlo como desarrollador (arquitectura simple)
Componentes base:
- Front: landing + mini panel de leads.
- Backend: API para crear lead, actualizar estado y disparar mensajes.
- DB: tablas `leads`, `mensajes`, `seguimientos`.
- Automatizador: Make/n8n o worker propio con cron.
- Canal: WhatsApp Cloud API + webhook.

Flujo tecnico:
1. Entra lead (form o WhatsApp).
2. Se guarda en DB (`estado = nuevo`).
3. Se envia presupuesto.
4. Motor de seguimiento revisa "sin respuesta".
5. Webhook actualiza respuestas en tiempo real.
6. Dashboard muestra conversion por etapa.

## 14) Futuro desarrollo (roadmap dev)
Version 1 (MVP):
- WhatsApp + pipeline + recordatorios.

Version 2:
- Score de leads (caliente, tibio, frio).
- Plantillas por rubro (plomero, electricista, HVAC).
- Reportes de conversion por vendedor.

Version 3:
- Integracion con llamadas y calendario tecnico.
- Recomendacion de proximo mensaje con IA.
- Prediccion de cierre por cliente.
