# Hoja de desarrollo completa - Idea 1

## Producto
Turnos + Cotizaciones + Seguimiento automatico para servicios locales (plomeros, electricistas, tecnicos de aire, etc).

## 0) Resumen rapido (para entender en 2 minutos)
- Problema: los negocios de servicios reciben consultas, mandan presupuesto, pero pierden cierres por falta de seguimiento.
- Solucion: un sistema simple que ordena leads, manda recordatorios por WhatsApp y muestra en que etapa esta cada cliente.
- Resultado que vendes: mas cierres y menos oportunidades perdidas.
- Objetivo MVP: instalar 3 pilotos pagos en 30 dias.

## 1) La idea explicada super simple
Imaginate este caso:
- Un electricista recibe 30 mensajes por semana.
- Presupuesta 18.
- Hace seguimiento solo a 7.
- Pierde 11 por desorden o falta de tiempo.

Tu producto hace 4 cosas:
1. Guarda cada consulta en un tablero.
2. Ayuda a enviar presupuesto rapido.
3. Si no responden, hace seguimiento automatico.
4. Si el cliente responde, corta el seguimiento y actualiza estado.

Es como ponerle "memoria y orden" a WhatsApp.

## 2) Cliente ideal (ICP)
Elegi 1 subnicho para arrancar (no 10):
- Tecnicos de aire acondicionado.
- Electricistas.
- Plomeros.

Criterios de cliente ideal:
- 20 a 200 consultas por mes.
- Vende por WhatsApp.
- Cobra ticket medio o alto por trabajo.
- Tiene dolor por desorden comercial.
- Puede pagar mensualidad de software si ve resultado.

## 3) Dolor real que se puede medir
Dolores concretos:
- Mensajes perdidos en chats viejos.
- Presupuestos enviados tarde.
- Seguimiento inexistente o improvisado.
- No saben su tasa de cierre real.

KPI de dolor inicial (antes del sistema):
- Presupuestos enviados por semana.
- Presupuestos sin respuesta.
- Tiempo promedio de primera respuesta.
- Tasa de cierre.

## 4) Promesa comercial clara
Promesa realista:
"Te ayudo a recuperar presupuestos que hoy se caen por falta de seguimiento, sin cambiar tu forma de vender por WhatsApp".

No prometas:
- duplicar ventas en 7 dias,
- automatizar todo sin esfuerzo,
- reemplazar al vendedor.

## 5) Alcance MVP (lo minimo vendible)
Incluye:
- Captura de lead desde formulario o WhatsApp.
- Pipeline simple: nuevo -> cotizado -> seguimiento -> ganado/perdido.
- Carga de presupuesto basico.
- Recordatorio automatico a 24h y 72h si no hubo respuesta.
- Deteccion de respuesta por webhook de WhatsApp.
- Dashboard semanal con metricas basicas.

No incluye en MVP:
- app movil nativa,
- IA avanzada,
- integraciones complejas de ERP,
- facturacion completa.

## 6) Flujo funcional end-to-end
1. Entra consulta (web o WhatsApp).
2. Se crea lead en estado nuevo.
3. Vendedor envia presupuesto (manual asistido o plantilla).
4. Estado pasa a cotizado.
5. Sistema espera respuesta.
6. Si no responde en 24h: seguimiento 1.
7. Si no responde en 72h: seguimiento 2.
8. Si responde: frena seguimiento y cambia estado a respondido.
9. Si compra: estado ganado.
10. Si no avanza: estado perdido con motivo.

## 7) Arquitectura recomendada (vibe coding, code-first)
Stack sugerido:
- Frontend: Next.js + TypeScript + Tailwind.
- Backend: Next.js API Routes o NestJS (arranca con Next API por rapidez).
- DB: Postgres (Supabase).
- Auth: Supabase Auth o Clerk.
- Automatizaciones: n8n (o Make al inicio).
- WhatsApp: Meta WhatsApp Cloud API.
- Deploy: Vercel (front/api) + Supabase (db) + n8n en Railway/Render.

Arquitectura simple:
- App web (panel) habla con API.
- API guarda todo en Postgres.
- API envia mensajes por WhatsApp Cloud API.
- Webhook de WhatsApp pega en API para eventos entrantes.
- Motor de seguimiento (cron) revisa pendientes y dispara recordatorios.

## 8) Modelo de datos (base minima)
Tablas recomendadas:
- organizations
- users
- leads
- lead_status_history
- quotes
- whatsapp_messages
- follow_up_rules
- follow_up_jobs
- activities

SQL base (version inicial):
```sql
create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_phone_id text,
  whatsapp_business_account_id text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text,
  phone text not null,
  service_type text,
  source text not null default 'whatsapp',
  status text not null default 'nuevo',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  has_replied boolean not null default false,
  is_closed boolean not null default false,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_status_idx on leads(organization_id, status);
create index leads_org_phone_idx on leads(organization_id, phone);

create table lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  amount numeric(12,2),
  currency text not null default 'USD',
  description text,
  sent_at timestamptz,
  valid_until date,
  created_at timestamptz not null default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  message_id text,
  status text,
  body text,
  raw_payload jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table follow_up_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  delay_hours int not null,
  template_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table follow_up_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  rule_id uuid not null references follow_up_rules(id) on delete cascade,
  run_at timestamptz not null,
  status text not null default 'pending',
  executed_at timestamptz,
  skipped_reason text
);

create index follow_up_jobs_pending_idx on follow_up_jobs(status, run_at);

create table activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
```

## 9) Integracion WhatsApp (clave para tu duda)
### Que necesitas de Meta
- Cuenta Meta Business verificada.
- Numero conectado a WhatsApp Cloud API.
- Phone Number ID.
- Access Token.
- Webhook configurado con Verify Token.

### Endpoints importantes
- Envio mensaje: POST /vXX.X/{phone-number-id}/messages
- Webhook events: tu endpoint, ej /api/webhooks/whatsapp

### Como saber si respondio
Cuando llega evento inbound:
- Buscar lead por numero.
- Guardar mensaje inbound.
- Marcar has_replied=true.
- Cancelar follow_up_jobs pendientes.

### Reglas anti-errores
- Guardar message_id para evitar duplicados.
- Validar firma de webhook.
- Reintentos con backoff si falla envio.

## 10) API interna minima (backend)
Endpoints sugeridos:
- POST /api/leads
- GET /api/leads
- GET /api/leads/{id}
- PATCH /api/leads/{id}/status
- POST /api/leads/{id}/quotes
- POST /api/leads/{id}/send-message
- POST /api/webhooks/whatsapp
- POST /api/followups/run-due
- GET /api/metrics/weekly

## 11) Motor de seguimiento (logica)
Pseudocodigo:
```txt
cada 5 minutos:
  jobs = buscar follow_up_jobs pendientes con run_at <= ahora
  para cada job:
    lead = obtener lead
    si lead.is_closed = true -> skip
    si lead.has_replied = true -> skip
    enviar mensaje template por WhatsApp
    marcar job ejecutado
```

Creacion de jobs:
- Al enviar presupuesto, crear job D+1 y D+3.

Cancelacion de jobs:
- Si entra inbound o cierran venta, cancelar pendientes.

## 12) Pantallas frontend (MVP)
1. Login
2. Dashboard principal
3. Lista de leads con filtros
4. Detalle de lead (timeline + chat + quote)
5. Crear/editar presupuesto
6. Configuracion reglas de seguimiento
7. Reporte semanal

## 13) Reglas de negocio importantes
- Un lead abierto por telefono por organizacion.
- Si entra mensaje nuevo de un lead perdido, se puede reabrir.
- No enviar seguimientos fuera de horario comercial (configurable).
- No enviar seguimiento si ya hay respuesta reciente.

## 14) Seguridad minima necesaria
- Auth obligatoria.
- Multi-tenant por organization_id en todas las queries.
- Encriptar secretos (tokens API).
- Webhook signature validation.
- Logs de auditoria para cambios de estado.

## 15) Testing minimo que no debes saltear
Casos criticos:
1. Crear lead nuevo.
2. Duplicado por telefono.
3. Enviar presupuesto.
4. Crear jobs de seguimiento.
5. Ejecutar job pendiente.
6. Recibir inbound y cortar seguimientos.
7. Cambiar a ganado y cancelar jobs.
8. Reintento por fallo de API WhatsApp.
9. Filtros dashboard por estado.
10. Metricas semanales coherentes.

## 16) Metricas del producto (las que importan)
- Tiempo de primera respuesta.
- Presupuestos enviados por semana.
- % de presupuestos con seguimiento.
- % de respuesta despues de seguimiento.
- Tasa de cierre.
- Ingresos estimados recuperados.

## 17) Plan de desarrollo en 30 dias (realista)
### Semana 1: Base tecnica
- Inicializar proyecto.
- Auth + DB + CRUD leads.
- Vista pipeline basica.

### Semana 2: WhatsApp + seguimiento
- Envio de mensajes.
- Webhook inbound/status.
- Motor de jobs D+1 y D+3.

### Semana 3: Cotizaciones + metricas
- Modulo de presupuestos.
- Dashboard semanal.
- Fixes de estabilidad.

### Semana 4: Piloto y cierre
- Onboarding de 3 clientes piloto.
- Ajustes por feedback real.
- Preparar plan pago mensual.

## 18) Prompt pack para vibe coding (copiar/pegar)
### Prompt 1 - Arquitectura inicial
"Actua como arquitecto de software senior. Quiero construir un SaaS multi-tenant para servicios locales con pipeline de leads, cotizaciones y seguimiento automatico por WhatsApp. Stack: Next.js + TypeScript + Postgres + Supabase + WhatsApp Cloud API. Dame estructura de carpetas, decisiones de arquitectura y backlog tecnico por prioridad."

### Prompt 2 - Schema y migraciones
"Genera schema SQL para Postgres de un CRM liviano con tablas organizations, users, leads, quotes, whatsapp_messages, follow_up_rules, follow_up_jobs, activities. Inclui indices y restricciones para multi-tenant y deduplicacion por telefono."

### Prompt 3 - API backend
"Genera endpoints REST en Next.js API Routes para crear leads, cambiar estado, enviar mensaje por WhatsApp, recibir webhook y ejecutar jobs de seguimiento. Inclui validaciones zod y manejo de errores."

### Prompt 4 - Webhook WhatsApp
"Implementa endpoint seguro para webhook de WhatsApp Cloud API. Validar verify token, procesar mensajes inbound, guardar payload y marcar lead como respondido para cancelar followups pendientes."

### Prompt 5 - Cron/job runner
"Implementa job runner que cada 5 minutos procese follow_up_jobs pendientes. Debe saltar jobs si el lead ya respondio o ya esta cerrado. Debe registrar logs de ejecucion."

### Prompt 6 - Front dashboard
"Crea UI en Next.js con tabla Kanban de leads por estado, filtros por fecha y vendedor, detalle de lead con timeline de mensajes y boton enviar seguimiento manual."

### Prompt 7 - Testing
"Genera tests de integracion para flujo completo: crear lead -> enviar presupuesto -> crear followups -> recibir respuesta inbound -> cancelar jobs."

## 19) Costos estimados de infraestructura (mensual)
Escenario inicial (3 a 10 clientes piloto):
- Dominio + email basico: USD 10 a 20
- Supabase: USD 0 a 25
- Vercel: USD 0 a 20
- n8n/worker host: USD 5 a 20
- WhatsApp API (mensajes + proveedor): USD 15 a 40

Total estimado: USD 30 a 125 por mes.

## 20) Estrategia comercial minima para conseguir clientes reales
- Lista de 50 negocios del subnicho en Google Maps.
- 10 contactos diarios por WhatsApp/llamada.
- Oferta de piloto pago corto (14 dias).
- Cierre con setup simple + mensualidad.

Meta inicial:
- 3 pilotos pagos.
- 2 clientes recurrentes en 30 dias.

## 21) Precio recomendado para empezar
- Plan inicio: USD 29/mes
- Plan pro: USD 49/mes
- Setup inicial opcional: USD 99

Estrategia:
- Entrar bajo para validar.
- Subir ticket cuando muestres recupero de cierres.

## 22) Definition of Done (MVP listo)
Tu MVP esta listo si:
- Puede capturar leads.
- Puede enviar presupuestos.
- Puede hacer seguimiento automatico.
- Detecta respuesta inbound y frena recordatorios.
- Muestra metricas semanales claras.
- Ya tiene al menos 1 cliente piloto usando en produccion.

## 23) Riesgos y mitigacion
Riesgo: spam o mala experiencia en WhatsApp.
Mitigacion: limites de envio + plantillas buenas + horarios.

Riesgo: datos desordenados por mala carga.
Mitigacion: validaciones y estados obligatorios.

Riesgo: cliente no usa el sistema.
Mitigacion: onboarding de 60-90 min + checklist de uso diario.

## 24) Roadmap post-MVP (futuro)
Version 2:
- Plantillas por rubro.
- Score de oportunidad.
- Alertas por inactividad comercial.

Version 3:
- IA para sugerir proximo mensaje.
- Prediccion de cierre.
- Integraciones con calendario y telefono.

## 25) Checklist de arranque hoy
- Elegir subnicho unico.
- Crear repo y proyecto base.
- Crear tablas base.
- Configurar WhatsApp sandbox/proveedor.
- Construir flujo minimo: lead -> presupuesto -> seguimiento.
- Agendar 5 demos con prospectos reales.

Con esta hoja ya tenes todo para empezar a construir con vibe coding sin perderte.
