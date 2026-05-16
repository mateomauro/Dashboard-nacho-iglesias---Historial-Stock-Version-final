// Envolvemos todo en DOMContentLoaded para garantizar que el DOM y los scripts CDN estén listos
document.addEventListener('DOMContentLoaded', () => {

// --- CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://fcnvjpioswuiyogjjwlp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbnZqcGlvc3d1aXlvZ2pqd2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTM0OTUsImV4cCI6MjA5NDUyOTQ5NX0.1NtMQSHYw-euiiF2Qb0PFKiaEda2J0-bf0Dg4uSDBhk';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let clients = [];
let services = [];
let receipts = [];
let currentUser = null;

let wpTemplates = {
    pending: 'Hola {nombre}, te recuerdo que tu pago por "{servicio}" (${monto}) vence el {vencimiento}. ¡Gracias!',
    overdue: 'Hola {nombre}, te escribo para recordarte que tu pago por "{servicio}" (${monto}) venció el {vencimiento}. Por favor avísame cuando puedas regularizarlo. ¡Gracias!'
};

// --- AUTENTICACIÓN ---
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');

// Crear cuenta con Google
document.getElementById('btn-google-login').addEventListener('click', async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) alert('Error al iniciar sesión con Google: ' + error.message);
});

// Listener de estado de autenticación
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        const user = session.user;
        
        // --- VERIFICAR SI EL USUARIO ESTÁ APROBADO ---
        const { data: approved } = await supabase
            .from('usuarios_aprobados')
            .select('id')
            .eq('email', user.email)
            .single();
        
        if (!approved) {
            // No aprobado: mostrar mensaje y cerrar sesión
            document.getElementById('pending-approval').style.display = 'block';
            await supabase.auth.signOut();
            return;
        }

        currentUser = user;
        loginScreen.classList.remove('active');
        mainApp.style.display = 'flex';
        document.getElementById('pending-approval').style.display = 'none';
        
        const name = user.user_metadata?.full_name || user.email.split('@')[0];
        const avatar = user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${name}&background=6366f1&color=fff`;
        
        document.querySelector('.user-name').textContent = name;
        document.querySelector('.avatar').src = avatar;

        loadData();
        loadServices();
        loadReceipts();
        loadTemplates();
    } else {
        currentUser = null;
        loginScreen.classList.add('active');
        mainApp.style.display = 'none';
        clients = []; services = []; receipts = [];
    }
});

// --- Login con Email/Contraseña ---
document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('btn-login');
    btn.textContent = 'Ingresando...';
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.textContent = 'Ingresar';
    btn.disabled = false;
    if (error) alert('Error: ' + error.message);
});

// --- Crear Cuenta con Email ---
document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || password.length < 6) return alert('Completá el email y una contraseña de al menos 6 caracteres.');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert('Error: ' + error.message);
    else alert('¡Cuenta creada! Ahora esperá que el administrador apruebe tu acceso.');
});

// --- Cerrar Sesión ---
document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) alert('Error al cerrar sesión: ' + error.message);
});


// --- BASE DE DATOS (CRUD) ---
const loadData = async () => {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('fecha_creacion', { ascending: false });

    if (error) {
        console.error('Error cargando clientes:', error);
        return;
    }

    // Auto-detección de vencidos
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let c of data) {
        // Para evitar problemas de zona horaria con las fechas
        const [year, month, day] = c.fecha_vencimiento.split('-');
        const dueDate = new Date(year, month - 1, day);
        dueDate.setHours(0,0,0,0);
        
        if (dueDate < today && c.estado !== 'vencido') {
            c.estado = 'vencido';
            await supabase.from('clientes').update({ estado: 'vencido' }).eq('id', c.id);
        }
    }

    clients = data;
    updateUI();
};


// --- UTILIDADES UI ---
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const getInitials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const translateStatus = (status) => {
    return { 'al_dia': 'Al día', 'pendiente': 'Pendiente', 'vencido': 'Vencido' }[status] || status;
};


// --- RENDERIZADO UI ---
const renderKPIs = () => {
    let collected = 0, pending = 0, overdue = 0;

    clients.forEach(client => {
        if (client.estado === 'al_dia') collected += Number(client.monto_mensual);
        if (client.estado === 'pendiente') pending += Number(client.monto_mensual);
        if (client.estado === 'vencido') overdue += Number(client.monto_mensual);
    });

    const total = collected + pending + overdue;

    document.getElementById('kpi-total').textContent = formatCurrency(total);
    document.getElementById('kpi-collected').textContent = formatCurrency(collected);
    document.getElementById('kpi-pending').textContent = formatCurrency(pending);
    document.getElementById('kpi-overdue').textContent = formatCurrency(overdue);

    document.querySelector('.collected-bar').style.width = total ? `${(collected / total) * 100}%` : '0%';
    document.querySelector('.pending-bar').style.width = total ? `${(pending / total) * 100}%` : '0%';
    document.querySelector('.overdue-bar').style.width = total ? `${(overdue / total) * 100}%` : '0%';
};

const renderTable = () => {
    const filterStatus = document.getElementById('status-filter').value;
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    const tbody = document.getElementById('clients-tbody');
    tbody.innerHTML = '';

    const filterMap = { 'paid': 'al_dia', 'pending': 'pendiente', 'overdue': 'vencido' };
    const mappedFilter = filterMap[filterStatus] || filterStatus;

    const filteredClients = clients.filter(client => {
        const matchesStatus = filterStatus === 'all' || client.estado === mappedFilter;
        const matchesSearch = client.nombre.toLowerCase().includes(searchQuery);
        return matchesStatus && matchesSearch;
    });

    if (filteredClients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 32px;">No se encontraron resultados</td></tr>`;
        return;
    }

    const statusOrder = { 'vencido': 1, 'pendiente': 2, 'al_dia': 3 };
    filteredClients.sort((a, b) => statusOrder[a.estado] - statusOrder[b.estado]);

    // Lógica para calcular días
    const getDaysData = (dueDateStr) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const [year, month, day] = dueDateStr.split('-');
        const dueDate = new Date(year, month - 1, day);
        dueDate.setHours(0,0,0,0);
        
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return { text: `Hace ${Math.abs(diffDays)} días`, css: 'overdue' };
        if (diffDays === 0) return { text: `¡Vence hoy!`, css: 'warning' };
        if (diffDays <= 5) return { text: `En ${diffDays} días`, css: 'warning' };
        return { text: `En ${diffDays} días`, css: 'ok' };
    };

    const statusNames = {
        'vencido': '🔴 Vencidos',
        'pendiente': '🟡 Pendientes de Cobro',
        'al_dia': '🟢 Cobrados (Al Día)'
    };

    let currentGroup = '';

    filteredClients.forEach(client => {
        // Insertar encabezado de grupo si cambia el estado
        if (client.estado !== currentGroup) {
            currentGroup = client.estado;
            const trHeader = document.createElement('tr');
            trHeader.className = 'group-header';
            trHeader.innerHTML = `<td colspan="6">${statusNames[currentGroup]}</td>`;
            tbody.appendChild(trHeader);
        }

        const tr = document.createElement('tr');
        const cssClass = { 'al_dia': 'paid', 'pendiente': 'pending', 'vencido': 'overdue' }[client.estado] || 'pending';

        let actionHTML = client.estado !== 'al_dia'
            ? `<button class="action-btn" onclick="openPaymentModal('${client.id}', '${client.nombre.replace(/'/g, "\\'")}', ${client.monto_mensual})">Registrar Pago</button>`
            : `<span style="color: var(--text-secondary); font-size: 13px; display: inline-block; width: 105px;">Pagado <i class="ph ph-check"></i></span>`;

        if (client.telefono) {
            let wpText = client.estado === 'vencido' ? wpTemplates.overdue : wpTemplates.pending;
            const dateStr = formatDate(client.fecha_vencimiento);
            
            // Reemplazar variables
            wpText = wpText.replace(/{nombre}/g, client.nombre)
                           .replace(/{servicio}/g, client.servicio)
                           .replace(/{monto}/g, client.monto_mensual)
                           .replace(/{vencimiento}/g, dateStr);

            const wpUrl = `https://wa.me/${client.telefono}?text=${encodeURIComponent(wpText)}`;
            actionHTML += `<a href="${wpUrl}" target="_blank" class="action-btn wp-btn" title="Enviar WhatsApp"><i class="ph ph-whatsapp-logo"></i></a>`;
        }

        actionHTML += `<button class="action-btn delete-btn" onclick="deleteClient('${client.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>`;

        const daysData = getDaysData(client.fecha_vencimiento);

        tr.innerHTML = `
            <td>
                <div class="client-cell">
                    <div class="client-avatar">${getInitials(client.nombre)}</div>
                    <div>
                        <div class="client-name">${client.nombre}</div>
                        <div class="client-email">${client.email || '-'}</div>
                    </div>
                </div>
            </td>
            <td>${client.servicio}</td>
            <td>
                <div>${formatDate(client.fecha_vencimiento)}</div>
                <div class="days-badge ${daysData.css}">${daysData.text}</div>
            </td>
            <td style="font-weight: 500;">${formatCurrency(client.monto_mensual)}</td>
            <td><span class="status-badge ${cssClass}">${translateStatus(client.estado)}</span></td>
            <td style="white-space: nowrap;">${actionHTML}</td>
        `;
        tbody.appendChild(tr);
    });
};

const updateUI = () => {
    renderKPIs();
    renderTable();
};


// --- MODAL PAGOS ---
const paymentModal = document.getElementById('payment-modal');

window.openPaymentModal = (id, name, amount) => {
    document.getElementById('payment-client-id').value = id;
    document.getElementById('payment-amount').value = amount;
    document.getElementById('payment-client-name').textContent = name;
    document.getElementById('payment-amount-display').textContent = formatCurrency(amount);
    document.getElementById('payment-method').value = 'Efectivo';
    paymentModal.classList.add('active');
};

const closePaymentModal = () => {
    paymentModal.classList.remove('active');
    document.getElementById('payment-form').reset();
};

document.getElementById('close-payment-modal').addEventListener('click', closePaymentModal);
document.getElementById('cancel-payment').addEventListener('click', closePaymentModal);

document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('payment-client-id').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const method = document.getElementById('payment-method').value;
    
    const client = clients.find(c => c.id === id);
    if(!client) return;

    // Calcular próxima fecha de vencimiento sumando 1 mes
    const [year, month, day] = client.fecha_vencimiento.split('-');
    const currentDue = new Date(year, month - 1, day);
    currentDue.setMonth(currentDue.getMonth() + 1);
    
    const newDueDate = currentDue.getFullYear() + '-' + 
                       String(currentDue.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(currentDue.getDate()).padStart(2, '0');

    const { error: err1 } = await supabase
        .from('clientes')
        .update({ estado: 'al_dia', fecha_vencimiento: newDueDate })
        .eq('id', id);
        
    if (err1) return alert('Error al actualizar: ' + err1.message);

    await supabase.from('pagos').insert([{ 
        cliente_id: id, 
        usuario_id: currentUser.id, 
        monto_pagado: amount,
        metodo_pago: method
    }]);
    
    loadReceipts(); 
    client.estado = 'al_dia';
    client.fecha_vencimiento = newDueDate;
    updateUI();
    closePaymentModal();
});

window.deleteClient = async (id) => {
    if (!confirm('¿Estás seguro de que querés eliminar a este cliente?')) return;

    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) return alert('Error al eliminar: ' + error.message);

    clients = clients.filter(c => c.id !== id);
    updateUI();
};


// --- MODAL NUEVO CLIENTE ---
const modal = document.getElementById('client-modal');

const openModal = () => {
    modal.classList.add('active');
    document.getElementById('client-date').valueAsDate = new Date();
};

const closeModal = () => {
    modal.classList.remove('active');
    document.getElementById('add-client-form').reset();
};

document.getElementById('add-client-btn').addEventListener('click', openModal);
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('cancel-client').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

document.getElementById('add-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const estadoMap = { 'paid': 'al_dia', 'pending': 'pendiente', 'overdue': 'vencido' };

    const newClientData = {
        usuario_id: currentUser.id,
        nombre: document.getElementById('client-name').value,
        telefono: document.getElementById('client-phone').value,
        servicio: document.getElementById('client-plan').value,
        monto_mensual: parseFloat(document.getElementById('client-amount').value),
        fecha_vencimiento: document.getElementById('client-date').value,
        estado: estadoMap[document.getElementById('client-status').value] || 'pendiente'
    };

    const { data, error } = await supabase.from('clientes').insert([newClientData]).select();

    if (error) return alert('Error al guardar: ' + error.message);

    if (data && data[0]) {
        clients.unshift(data[0]);
        closeModal();
        updateUI();
    }
});


// Filtros y búsqueda
document.getElementById('status-filter').addEventListener('change', renderTable);
document.getElementById('search-input').addEventListener('input', renderTable);

// --- CONFIGURACIÓN DE SERVICIOS ---
const loadServices = async () => {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('servicios')
        .select('*')
        .order('fecha_creacion', { ascending: true });

    if (error) {
        console.error('Error cargando servicios:', error);
        return;
    }
    
    services = data || [];
    renderServicesUI();
};

const renderServicesUI = () => {
    // Render Lista en Configuración
    const list = document.getElementById('services-list');
    list.innerHTML = '';
    services.forEach(srv => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);';
        li.innerHTML = `
            <span>${srv.nombre}</span>
            <button class="action-btn delete-btn" onclick="deleteService('${srv.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
        `;
        list.appendChild(li);
    });

    // Render Select en Formulario Nuevo Cliente
    const select = document.getElementById('client-plan');
    select.innerHTML = '<option value="">Seleccioná un servicio...</option>';
    services.forEach(srv => {
        const opt = document.createElement('option');
        opt.value = srv.nombre;
        opt.textContent = srv.nombre;
        select.appendChild(opt);
    });
};

document.getElementById('btn-add-service').addEventListener('click', async () => {
    const input = document.getElementById('new-service-input');
    const val = input.value.trim();
    if (!val) return;
    
    // Evitar duplicados
    if (services.find(s => s.nombre.toLowerCase() === val.toLowerCase())) {
        return alert('Este servicio ya existe');
    }
    
    const btn = document.getElementById('btn-add-service');
    btn.textContent = '...';
    
    const { data, error } = await supabase
        .from('servicios')
        .insert([{ usuario_id: currentUser.id, nombre: val }])
        .select();
        
    btn.textContent = 'Agregar';

    if (error) return alert('Error al guardar servicio: ' + error.message);
    
    if (data && data[0]) {
        services.push(data[0]);
        renderServicesUI();
        input.value = '';
    }
});

window.deleteService = async (id) => {
    if(!confirm('¿Eliminar este servicio? (No afectará a los clientes ya cargados)')) return;
    
    const { error } = await supabase.from('servicios').delete().eq('id', id);
    if (error) return alert('Error al eliminar: ' + error.message);
    
    services = services.filter(s => s.id !== id);
    renderServicesUI();
};

// --- CONFIGURACIÓN DE WHATSAPP ---
window.lastFocusedTextarea = null;

window.insertTag = (tag) => {
    if(!window.lastFocusedTextarea) {
        window.lastFocusedTextarea = document.getElementById('wp-template-pending');
    }
    
    const txtArea = window.lastFocusedTextarea;
    const start = txtArea.selectionStart;
    const end = txtArea.selectionEnd;
    const text = txtArea.value;
    
    txtArea.value = text.substring(0, start) + tag + text.substring(end);
    txtArea.focus();
    txtArea.selectionStart = txtArea.selectionEnd = start + tag.length;
};

const loadTemplates = async () => {
    if(!currentUser) return;
    
    const { data, error } = await supabase
        .from('configuraciones')
        .select('*')
        .eq('usuario_id', currentUser.id)
        .single();
        
    if (data) {
        if(data.wp_pendiente) wpTemplates.pending = data.wp_pendiente;
        if(data.wp_vencido) wpTemplates.overdue = data.wp_vencido;
    }
    
    document.getElementById('wp-template-pending').value = wpTemplates.pending;
    document.getElementById('wp-template-overdue').value = wpTemplates.overdue;
};

document.getElementById('btn-save-templates').addEventListener('click', async () => {
    wpTemplates.pending = document.getElementById('wp-template-pending').value;
    wpTemplates.overdue = document.getElementById('wp-template-overdue').value;
    
    const btn = document.getElementById('btn-save-templates');
    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    
    const { error } = await supabase.from('configuraciones').upsert({
        usuario_id: currentUser.id,
        wp_pendiente: wpTemplates.pending,
        wp_vencido: wpTemplates.overdue
    });
    
    if (error) {
        alert('Error al guardar en base de datos: ' + error.message);
        btn.textContent = originalText;
        return;
    }
    
    btn.textContent = '¡Guardado en la Nube!';
    btn.style.background = '#10b981';
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
});

// --- RECIBOS (HISTORIAL) ---
const loadReceipts = async () => {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('pagos')
        .select(`
            id, monto_pagado, fecha_pago, metodo_pago,
            clientes (nombre, servicio)
        `)
        .order('fecha_pago', { ascending: false });

    if (error) {
        console.error('Error cargando recibos:', error);
        return;
    }

    receipts = data || [];
    renderReceiptsTable();
};

const renderReceiptsTable = () => {
    const tbody = document.getElementById('receipts-tbody');
    const search = document.getElementById('search-receipts').value.toLowerCase();
    tbody.innerHTML = '';
    
    // Filtrar por búsqueda
    const filtered = receipts.filter(r => {
        const clientName = r.clientes?.nombre || '';
        return clientName.toLowerCase().includes(search);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 32px;">No hay pagos registrados.</td></tr>`;
        return;
    }

    filtered.forEach(r => {
        const tr = document.createElement('tr');
        
        // Formatear fecha y hora
        const dateObj = new Date(r.fecha_pago);
        const dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit' });
        
        const clientName = r.clientes?.nombre || 'Cliente Eliminado';
        const clientService = r.clientes?.servicio || '-';
        
        const methodIcons = {
            'Efectivo': '💵 Efectivo',
            'Transferencia': '🏦 Transferencia',
            'Tarjeta': '💳 Tarjeta'
        };
        const methodDisplay = methodIcons[r.metodo_pago] || r.metodo_pago || 'Efectivo';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500; color: var(--text-primary);">${dateStr}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${timeStr} hs</div>
            </td>
            <td>
                <div class="client-cell">
                    <div class="client-avatar">${getInitials(clientName)}</div>
                    <div class="client-name">${clientName}</div>
                </div>
            </td>
            <td>${clientService}</td>
            <td>
                <span style="font-size: 13px; color: var(--text-secondary); background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px;">${methodDisplay}</span>
            </td>
            <td style="font-weight: 600; color: #10b981;">+ ${formatCurrency(r.monto_pagado)}</td>
        `;
        tbody.appendChild(tr);
    });
};

document.getElementById('search-receipts').addEventListener('input', renderReceiptsTable);


// Mes actual en header
const options = { month: 'long', year: 'numeric' };
const dateStr = new Date().toLocaleDateString('es-ES', options);
document.getElementById('current-month').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

// --- NAVEGACIÓN SIDEBAR ---
const navItems = document.querySelectorAll('.main-nav .nav-item[data-target]');
const appViews = document.querySelectorAll('.app-view');
const pageTitle = document.getElementById('page-title');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        // Ignorar el botón de cerrar sesión (se maneja arriba)
        if (item.id === 'btn-logout') return;
        
        e.preventDefault();
        
        // Ocultar todos
        navItems.forEach(nav => nav.classList.remove('active'));
        appViews.forEach(view => view.style.display = 'none');
        
        // Mostrar el seleccionado
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).style.display = 'block';
        
        // Cambiar título
        if(targetId === 'view-dashboard') pageTitle.textContent = 'Dashboard';
        if(targetId === 'view-clientes') pageTitle.textContent = 'Gestión de Clientes';
        if(targetId === 'view-recibos') pageTitle.textContent = 'Recibos (Historial)';
    });
});

// Filtros desde Dashboard
window.goToFilteredClients = (statusValue) => {
    document.getElementById('nav-clientes').click();
    document.getElementById('status-filter').value = statusValue;
    renderTable();
};

}); // Fin DOMContentLoaded
