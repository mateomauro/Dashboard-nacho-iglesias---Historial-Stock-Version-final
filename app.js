// ===== SUPABASE CONFIGURATION =====
const SUPABASE_URL = 'https://urquftsucjtqxogjjhhx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXVmdHN1Y2p0cXhvZ2pqaGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjQ3MjMsImV4cCI6MjA4NzQ0MDcyM30.GJu2UaYFqQAXMgghQY1Xag62tKecNG8hk-nzsvYKdzE';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== GLOBAL STATE =====
let chartInstance = null;
let isInitialized = false;
let sessionTimeout = null; // Temporizador para el cierre automático
const SESSION_DURATION = 60 * 60 * 1000; // 1 hora en milisegundos

// ===== AUTHENTICATION (Supabase Auth) =====
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateUIForAuth(session);
}

function updateUIForAuth(session) {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');

    if (session) {
        loginScreen.style.display = 'none';
        dashboard.style.display = 'block';

        // --- Lógica de tiempo de expiración ---
        manejarExpiracionSesion();

        if (!isInitialized) {
            initializeDashboard();
            isInitialized = true;
        }
    } else {
        loginScreen.style.display = 'flex';
        dashboard.style.display = 'none';
        isInitialized = false;

        // Limpiar temporizador y datos de sesión
        if (sessionTimeout) clearTimeout(sessionTimeout);
        localStorage.removeItem('session_start_time');

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }
}

function manejarExpiracionSesion() {
    const now = Date.now();
    let startTime = localStorage.getItem('session_start_time');

    if (!startTime) {
        startTime = now;
        localStorage.setItem('session_start_time', startTime);
    }

    const elapsed = now - parseInt(startTime);
    const remaining = SESSION_DURATION - elapsed;

    if (sessionTimeout) clearTimeout(sessionTimeout);

    if (remaining <= 0) {
        console.log("Sesión expirada");
        handleLogout();
    } else {
        // Programar el cierre de sesión para cuando se cumpla la hora
        sessionTimeout = setTimeout(() => {
            alert("Tu sesión ha expirado (1 hora de límite). Por seguridad, vuelve a iniciar sesión.");
            handleLogout();
        }, remaining);
    }
}


async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    const loginBtn = event.target.querySelector('button');

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Iniciando...';

        const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        errorElement.classList.remove('show');
    } catch (error) {
        errorElement.textContent = 'Error: ' + error.message;
        errorElement.classList.add('show');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Iniciar Sesión';
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

// Escuchar cambios en el estado de autenticación (login/logout/refresh)
supabaseClient.auth.onAuthStateChange((event, session) => {
    updateUIForAuth(session);
});

// ===== UI HELPERS =====
function showLoading(isInitial = false) {
    if (isInitial) {
        document.getElementById('loading-overlay').classList.add('show');
    }

    // Show skeletons
    document.querySelectorAll('.kpi-card').forEach(card => card.classList.add('loading'));
    document.querySelector('.chart-card').classList.add('loading');
    document.getElementById('no-data-message').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('show');

    // Hide skeletons
    document.querySelectorAll('.kpi-card').forEach(card => card.classList.remove('loading'));
    document.querySelector('.chart-card').classList.remove('loading');

    // Hide Informe loading
    const informeLoading = document.getElementById('informe-loading');
    if (informeLoading) informeLoading.style.display = 'none';
}

// ===== VIEW SWITCHER LOGIC =====
let activeView = 'dashboard'; // 'dashboard' | 'informe' | 'matrix'

function setupViewSwitcher() {
    const tabDashboard = document.getElementById('view-tab-dashboard');
    const tabInforme = document.getElementById('view-tab-informe');
    const tabMatrix = document.getElementById('view-tab-matrix');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewInforme = document.getElementById('view-informe');
    const viewMatrix = document.getElementById('view-matrix');

    if (!tabDashboard || !tabInforme || !tabMatrix) return;

    function switchView(target) {
        activeView = target;

        tabDashboard.classList.toggle('active', target === 'dashboard');
        tabDashboard.setAttribute('aria-selected', target === 'dashboard');
        viewDashboard.classList.toggle('active', target === 'dashboard');
        viewDashboard.style.display = target === 'dashboard' ? 'block' : 'none';

        tabInforme.classList.toggle('active', target === 'informe');
        tabInforme.setAttribute('aria-selected', target === 'informe');
        viewInforme.classList.toggle('active', target === 'informe');
        viewInforme.style.display = target === 'informe' ? 'block' : 'none';

        tabMatrix.classList.toggle('active', target === 'matrix');
        tabMatrix.setAttribute('aria-selected', target === 'matrix');
        viewMatrix.classList.toggle('active', target === 'matrix');
        viewMatrix.style.display = target === 'matrix' ? 'block' : 'none';
    }

    tabDashboard.addEventListener('click', () => switchView('dashboard'));
    tabInforme.addEventListener('click', () => switchView('informe'));
    tabMatrix.addEventListener('click', () => switchView('matrix'));
}

// ===== DATE FILTER MODE MANAGEMENT =====
let activeDateMode = 'preset'; // 'preset' | 'single' | 'range'

function switchDateMode(mode) {
    activeDateMode = mode;

    // Update pill states
    document.querySelectorAll('.date-pill').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Show/hide panels
    document.getElementById('date-panel-preset').style.display = mode === 'preset' ? '' : 'none';
    document.getElementById('date-panel-single').style.display = mode === 'single' ? '' : 'none';
    document.getElementById('date-panel-range').style.display = mode === 'range' ? '' : 'none';

    // Clear inactive inputs to avoid stale filter values
    if (mode !== 'preset') document.getElementById('filter-date').value = 'all';
    if (mode !== 'single') document.getElementById('filter-date-single').value = '';
    if (mode !== 'range') {
        document.getElementById('filter-date-from').value = '';
        document.getElementById('filter-date-to').value = '';
    }

    // Re-run the query with the current (possibly empty) date filter
    fetchFilteredData();
}

function updateActiveFiltersIndicator() {
    const campoValue = document.getElementById('filter-campo').value;
    const rodeoValue = document.getElementById('filter-rodeo').value;
    const supracategoriaValue = document.getElementById('filter-supracategoria').value;
    const categoriaValue = document.getElementById('filter-categoria').value;
    const dateFilter = document.getElementById('filter-date').value;
    const singleDate = document.getElementById('filter-date-single').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;

    const hasDateFilter = (activeDateMode === 'preset' && dateFilter !== 'all')
        || (activeDateMode === 'single' && singleDate)
        || (activeDateMode === 'range' && (dateFrom || dateTo));

    const hasActiveFilters = campoValue || rodeoValue || supracategoriaValue || categoriaValue || hasDateFilter;
    const indicator = document.getElementById('active-filters-indicator');
    const clearBtn = document.getElementById('clear-filters-btn');

    if (hasActiveFilters) {
        indicator.style.display = 'flex';
        clearBtn.disabled = false;
    } else {
        indicator.style.display = 'none';
        clearBtn.disabled = true;
    }
}

function showError(message) {
    const errorElement = document.getElementById('api-error');
    errorElement.textContent = message;
    errorElement.classList.add('show');
    setTimeout(() => {
        errorElement.classList.remove('show');
    }, 5000);
}

function hideError() {
    document.getElementById('api-error').classList.remove('show');
}

// ===== SIDE PANEL LOGIC =====
let panelState = {
    list: [],
    type: '',
    title: ''
};

function openPanel(list, type, title) {
    panelState = { list, type, title };

    document.getElementById('panel-title').textContent = title;
    document.getElementById('panel-search-input').value = '';
    const overlay = document.getElementById('side-panel-overlay');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    renderPanelList(list);
}

function closePanel() {
    const overlay = document.getElementById('side-panel-overlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

function renderPanelList(items) {
    const listElement = document.getElementById('panel-list');
    if (!listElement) return;

    listElement.innerHTML = items.map(item => `
        <li class="panel-item" data-value="${item.name}">
            <span class="item-name">${item.name}</span>
            <span class="item-count">${item.count.toLocaleString('es-AR')}</span>
        </li>
    `).join('');

    // Add click events to items to apply filter
    listElement.querySelectorAll('.panel-item').forEach(el => {
        el.addEventListener('click', () => {
            const value = el.getAttribute('data-value');
            applyPanelFilter(panelState.type, value);
            closePanel();
        });
    });
}

function filterPanelList() {
    const searchTerm = document.getElementById('panel-search-input').value.toLowerCase();
    const filtered = panelState.list.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
    );
    renderPanelList(filtered);
}

function applyPanelFilter(type, value) {
    const filterIdMap = {
        'campo': 'filter-campo',
        'rodeo': 'filter-rodeo',
        'categoria': 'filter-categoria',
        'supracategoria': 'filter-supracategoria'
    };

    const filterId = filterIdMap[type];
    const filterEl = document.getElementById(filterId);
    if (filterEl) {
        filterEl.value = value;
        // Trigger data refresh
        fetchFilteredData();
        // Visual feedback
        filterEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const parent = filterEl.parentElement;
        if (parent) {
            parent.style.boxShadow = '0 0 0 4px rgba(65, 105, 255, 0.2)';
            setTimeout(() => { parent.style.boxShadow = ''; }, 2000);
        }
    }
}

function setupPanelListeners() {
    const overlay = document.getElementById('side-panel-overlay');
    const closeBtn = document.getElementById('close-panel');
    const searchInput = document.getElementById('panel-search-input');

    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    // Close on click outside (overlay)
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePanel();
    });

    // Search input real-time filtering
    if (searchInput) searchInput.addEventListener('input', filterPanelList);
}

// ===== FILTER LOGIC (Server-Side with Supabase) =====

async function initializeFilters() {
    try {
        showLoading(true);
        hideError();
        // Fetch unique values for all filters from Historial_Stock table
        const { data, error } = await supabaseClient.from('Historial_Stock').select('Campo, Rodeo, Supracategoria, Categoria');
        if (error) throw error;

        // Use capitalized column names
        const campos = [...new Set(data.map(item => item.Campo))].filter(Boolean).sort();
        const rodeos = [...new Set(data.map(item => item.Rodeo))].filter(Boolean).sort();
        const supracategorias = [...new Set(data.map(item => item.Supracategoria))].filter(Boolean).sort();
        const categorias = [...new Set(data.map(item => item.Categoria))].filter(Boolean).sort();

        // Populate Campo filter
        const campoSelect = document.getElementById('filter-campo');
        campoSelect.innerHTML = '<option value="">Todos los campos</option>';
        campos.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            campoSelect.appendChild(option);
        });

        // Populate Rodeo filter
        const rodeoSelect = document.getElementById('filter-rodeo');
        rodeoSelect.innerHTML = '<option value="">Todos los rodeos</option>';
        rodeos.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            rodeoSelect.appendChild(option);
        });

        // Populate Supracategoria filter
        const supracategoriaSelect = document.getElementById('filter-supracategoria');
        supracategoriaSelect.innerHTML = '<option value="">Todas las supracategorías</option>';
        supracategorias.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            supracategoriaSelect.appendChild(option);
        });

        // Populate Categoria filter
        const categoriaSelect = document.getElementById('filter-categoria');
        categoriaSelect.innerHTML = '<option value="">Todas las categorías</option>';
        categorias.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            categoriaSelect.appendChild(option);
        });

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error inicializando filtros:', error);
        showError('Error al cargar filtros del servidor.');
    }
}

async function fetchFilteredData() {
    try {
        updateActiveFiltersIndicator();
        showLoading(false);
        hideError();

        let goto_skip_preset = false;
        const campoValue = document.getElementById('filter-campo').value;
        const rodeoValue = document.getElementById('filter-rodeo').value;
        const supracategoriaValue = document.getElementById('filter-supracategoria').value;
        const categoriaValue = document.getElementById('filter-categoria').value;

        // Query Historial_Stock table
        let query = supabaseClient.from('Historial_Stock').select('*');

        // Apply filters using capitalized column names
        if (campoValue) query = query.eq('Campo', campoValue);
        if (rodeoValue) query = query.eq('Rodeo', rodeoValue);
        if (supracategoriaValue) query = query.eq('Supracategoria', supracategoriaValue);
        if (categoriaValue) query = query.eq('Categoria', categoriaValue);

        // Date Filtering — supports 3 modes
        if (activeDateMode === 'preset') {
            const dateFilter = document.getElementById('filter-date').value;
            if (dateFilter !== 'all') {
                const today = new Date();
                let dateFrom = new Date(today);

                if (dateFilter === '7days') {
                    dateFrom.setDate(today.getDate() - 7);
                } else if (dateFilter === '30days') {
                    dateFrom.setDate(today.getDate() - 30);
                } else if (dateFilter === 'thismonth') {
                    dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
                } else if (dateFilter === 'lastmonth') {
                    dateFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const dateTo = new Date(today.getFullYear(), today.getMonth(), 0);
                    query = query.gte('Fecha', dateFrom.toISOString().split('T')[0])
                        .lte('Fecha', dateTo.toISOString().split('T')[0]);
                    // skip the generic gte below
                    goto_skip_preset = true;
                } else if (dateFilter === 'thisyear') {
                    dateFrom = new Date(today.getFullYear(), 0, 1);
                }

                if (!goto_skip_preset) {
                    query = query.gte('Fecha', dateFrom.toISOString().split('T')[0]);
                }
            }
        } else if (activeDateMode === 'single') {
            const singleDate = document.getElementById('filter-date-single').value;
            if (singleDate) {
                query = query.eq('Fecha', singleDate);
            }
        } else if (activeDateMode === 'range') {
            const dateFrom = document.getElementById('filter-date-from').value;
            const dateTo = document.getElementById('filter-date-to').value;
            if (dateFrom) query = query.gte('Fecha', dateFrom);
            if (dateTo) query = query.lte('Fecha', dateTo);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            document.getElementById('no-data-message').style.display = 'flex';
            document.getElementById('informe-empty-state').style.display = 'flex';
            document.getElementById('matrix-empty-state').style.display = 'flex';
            document.querySelector('.table-responsive:not(.matrix-responsive)').style.display = 'none';
            document.querySelector('.matrix-responsive').style.display = 'none';
            updateDashboard([]);
        } else {
            document.getElementById('no-data-message').style.display = 'none';
            document.getElementById('informe-empty-state').style.display = 'none';
            document.getElementById('matrix-empty-state').style.display = 'none';
            document.querySelector('.table-responsive:not(.matrix-responsive)').style.display = 'block';
            document.querySelector('.matrix-responsive').style.display = 'block';
            updateDashboard(data);
        }

        hideLoading();

    } catch (error) {
        hideLoading();
        console.error('Error filtrando datos:', error);
        showError('Error al cargar datos filtrados.');
    }
}

function clearFilters() {
    // Reset date mode to preset
    activeDateMode = 'preset';
    document.querySelectorAll('.date-pill').forEach(btn => {
        const isActive = btn.dataset.mode === 'preset';
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    document.getElementById('date-panel-preset').style.display = '';
    document.getElementById('date-panel-single').style.display = 'none';
    document.getElementById('date-panel-range').style.display = 'none';

    // Clear all filter values
    document.getElementById('filter-date').value = 'all';
    document.getElementById('filter-date-single').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-campo').value = '';
    document.getElementById('filter-rodeo').value = '';
    document.getElementById('filter-supracategoria').value = '';
    document.getElementById('filter-categoria').value = '';

    fetchFilteredData();
}

// ===== KPI UPDATES =====
function calculateKPIs(data) {
    if (!data || data.length === 0) return {
        stockTotal: 0,
        camposCount: 0,
        rodeosCount: 0,
        categoriasCount: 0,
        camposList: [],
        rodeosList: [],
        categoriasList: [],
        supracategoriasList: [],
        latestDate: null
    };

    // Función auxiliar para normalizar la fecha a YYYY-MM-DD
    const normalizeDate = (d) => {
        if (!d) return null;
        // Si es un objeto Date o un string ISO, extraemos solo la parte de la fecha
        return d.toString().split('T')[0].split(' ')[0].trim();
    };

    // Identificar la fecha más reciente de forma segura
    const allDates = data.map(item => normalizeDate(item.Fecha)).filter(Boolean);
    const latestDate = allDates.length > 0 ? allDates.sort().reverse()[0] : null;

    // Filtrar los datos: solo tomamos los registros que coincidan exactamente con el último día
    const currentData = latestDate
        ? data.filter(item => normalizeDate(item.Fecha) === latestDate)
        : data;

    console.log(`Análisis de KPIs: Total registros: ${data.length}, Fecha detectada: ${latestDate}, Registros actuales: ${currentData.length}`);

    const getCounts = (key) => {
        const counts = currentData.reduce((acc, item) => {
            const val = item[key];
            if (val) {
                acc[val] = (acc[val] || 0) + (item.Cantidad || 0);
            }
            return acc;
        }, {});
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    };

    return {
        stockTotal: currentData.reduce((sum, item) => sum + (item.Cantidad || 0), 0),
        camposCount: [...new Set(currentData.map(item => item.Campo))].filter(Boolean).length,
        rodeosCount: [...new Set(currentData.map(item => item.Rodeo))].filter(Boolean).length,
        categoriasCount: [...new Set(currentData.map(item => item.Categoria))].filter(Boolean).length,
        camposList: getCounts('Campo'),
        rodeosList: getCounts('Rodeo'),
        categoriasList: getCounts('Categoria'),
        supracategoriasList: getCounts('Supracategoria'),
        latestDate: latestDate
    };
}

function updateKPICards(kpis) {
    document.getElementById('kpi-stock').textContent = kpis.stockTotal.toLocaleString('es-AR');
    document.getElementById('kpi-campos').textContent = kpis.camposCount;
    document.getElementById('kpi-rodeos').textContent = kpis.rodeosCount;
    document.getElementById('kpi-categorias').textContent = kpis.categoriasCount;

    // Actualizar también el badge de arriba si existe
    const viewBadge = document.querySelector('.view-badge');
    if (viewBadge && kpis.latestDate) {
        const [y, m, d] = kpis.latestDate.split('-');
        viewBadge.textContent = `Stock Actual: ${d}/${m}`;
    }

    // Helper to render summary as side panel trigger
    const renderSummary = (elementId, list, type, totalCount, displayTitle) => {
        const container = document.getElementById(elementId);
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Render top 3 only in the card
        const top3 = list.slice(0, 3);
        const itemsHtml = top3.map(item => `
            <span class="kpi-summary-item">
                ${item.name} <strong>(${item.count.toLocaleString('es-AR')})</strong>
            </span>
        `).join('');

        let subtitleHtml = `<p class="kpi-card-subtitle">Items totales: ${totalCount}</p>`;

        let html = `
            ${subtitleHtml}
            <div class="kpi-summary-list" style="margin-top: 8px;">${itemsHtml}</div>
        `;

        if (totalCount > 3) {
            html += `<a href="#" class="kpi-view-all" data-type="${type}">Ver lista completa</a>`;
        }

        container.innerHTML = html;

        const viewAllBtn = container.querySelector('.kpi-view-all');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openPanel(list, type, displayTitle);
            });
        }
    };

    renderSummary('kpi-stock-summary', kpis.supracategoriasList, 'supracategoria', kpis.supracategoriasList.length, 'Todas las Supracategorías');
    renderSummary('kpi-campos-summary', kpis.camposList, 'campo', kpis.camposCount, 'Todos los Campos');
    renderSummary('kpi-rodeos-summary', kpis.rodeosList, 'rodeo', kpis.rodeosCount, 'Todos los Rodeos');
    renderSummary('kpi-categorias-summary', kpis.categoriasList, 'categoria', kpis.categoriasCount, 'Todas las Categorías');
}

// Add click listeners to cards (scroll to filters)
function setupCardClicks() {
    const cards = [
        { id: 'card-stock', filter: 'filter-supracategoria' },
        { id: 'card-campos', filter: 'filter-campo' },
        { id: 'card-rodeos', filter: 'filter-rodeo' },
        { id: 'card-categorias', filter: 'filter-categoria' }
    ];

    cards.forEach(card => {
        const el = document.getElementById(card.id);
        if (el) {
            el.addEventListener('click', (e) => {
                // If the user clicked inside kpi-view-all, it's already handled
                if (e.target.closest('.kpi-view-all')) return;

                const filterEl = document.getElementById(card.filter);
                if (filterEl) {
                    filterEl.focus();
                    filterEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const parent = filterEl.parentElement;
                    if (parent) {
                        parent.style.boxShadow = '0 0 0 4px rgba(30, 64, 175, 0.18)';
                        setTimeout(() => { if (parent) parent.style.boxShadow = ''; }, 2000);
                    }
                }
            });
        }
    });
}

// ===== CHART LOGIC =====
function initChart() {
    const ctx = document.getElementById('stock-chart').getContext('2d');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Stock Total',
                data: [],
                borderColor: '#1E40AF',
                backgroundColor: 'rgba(30, 64, 175, 0.07)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBackgroundColor: '#F59E0B',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1E3A8A',
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: {
                        size: 13,
                        family: 'Fira Code',
                        weight: '600'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Fira Sans'
                    },
                    callbacks: {
                        label: function (context) {
                            return 'Stock: ' + context.parsed.y.toLocaleString('es-AR');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(30, 64, 175, 0.06)'
                    },
                    ticks: {
                        color: '#475569',
                        font: {
                            size: 11,
                            family: 'Fira Sans'
                        },
                        callback: function (value) {
                            if (value >= 1000) return value / 1000 + 'k';
                            return value;
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8,
                        color: '#475569',
                        font: {
                            size: 11,
                            family: 'Fira Sans'
                        }
                    }
                }
            }
        }
    });
}

function updateChart(data) {
    if (!data || data.length === 0) {
        if (chartInstance) {
            chartInstance.data.labels = [];
            chartInstance.data.datasets[0].data = [];
            chartInstance.update();
        }
        return;
    }

    // Group data by Fecha and sum Cantidads
    const groupedData = data.reduce((acc, item) => {
        const fecha = item.Fecha;
        if (!acc[fecha]) {
            acc[fecha] = 0;
        }
        acc[fecha] += (item.Cantidad || 0);
        return acc;
    }, {});

    // Sort by Fecha
    const sortedDates = Object.keys(groupedData).sort();
    const quantities = sortedDates.map(date => groupedData[date]);

    // Format dates for chart labels
    const formattedLabels = sortedDates.map(date => {
        const [y, m, d] = date.split('-');
        return `${d}/${m}`;
    });

    // Update chart
    if (chartInstance) {
        chartInstance.data.labels = formattedLabels;
        chartInstance.data.datasets[0].data = quantities;
        chartInstance.update();
    }
}

// ===== INFORME TABLE LOGIC =====
function formatFecha(fechaISO) {
    if (!fechaISO) return '-';
    // Format YYYY-MM-DD string to DD/MM/YYYY local representation cleanly
    const parts = fechaISO.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return fechaISO;
}

function updateInformeTable(data) {
    const tbody = document.getElementById('informe-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    // Sort by Date descending (most recent first)
    const sortedData = [...data].sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    let html = '';
    sortedData.forEach(item => {
        const cantidadStr = (item.Cantidad || 0).toLocaleString('es-AR');
        html += `
            <tr>
                <td class="date-cell">${formatFecha(item.Fecha)}</td>
                <td>${item.Campo || '-'}</td>
                <td>${item.Rodeo || '-'}</td>
                <td>${item.Supracategoria || '-'}</td>
                <td>${item.Categoria || '-'}</td>
                <td class="qty-cell">${cantidadStr}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Convert data to CSV format
function convertToCSV(objArray) {
    if (!objArray || objArray.length === 0) return '';

    // Fix headers
    const headers = ['Fecha', 'Campo', 'Rodeo', 'Supracategoría', 'Categoría', 'Cantidad'];
    const keys = ['Fecha', 'Campo', 'Rodeo', 'Supracategoria', 'Categoria', 'Cantidad'];

    let str = headers.join(',') + '\r\n';

    // Sort by Date descending
    const sortedData = [...objArray].sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    for (let i = 0; i < sortedData.length; i++) {
        let line = '';
        for (let index in keys) {
            if (line != '') line += ',';

            const value = sortedData[i][keys[index]];
            // Enclose in quotes if it contains a comma or newline to avoid breaking CSV
            let valueStr = value ? String(value) : '';
            if (valueStr.includes(',') || valueStr.includes('\n')) {
                valueStr = `"${valueStr}"`;
            }
            line += valueStr;
        }
        str += line + '\r\n';
    }
    return str;
}

function initExportCSVButton() {
    const btn = document.getElementById('btn-export-csv');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (!window.currentFilteredData || window.currentFilteredData.length === 0) {
            alert('No hay datos para exportar con los filtros actuales.');
            return;
        }

        const csvString = convertToCSV(window.currentFilteredData);
        if (!csvString) return;

        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        let filename = 'Informe_Stock_' + formatFecha(new Date().toISOString()).replace(/\//g, '-') + '.csv';

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function initExportMatrixExcelButton() {
    const btn = document.getElementById('btn-export-matrix-xls');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const table = document.getElementById('matrix-table');
        if (!table) return;

        // Use ExcelJS to create a real .xlsx file
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock');

        // Styles
        const headerSupraStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA9D18E' } },
            font: { bold: true, color: { argb: 'FF1A4214' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const headerCatStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } },
            font: { size: 10, color: { argb: 'FF2E5926' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const rowTotalGeneralStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF29A59' } },
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const rowTotalCampoStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
            font: { bold: true },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const rowTotalRodeoStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } },
            font: { bold: true },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const colTotalesStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
            font: { bold: true },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const normalCellStyle = {
            alignment: { horizontal: 'center' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const stickyCellStyle = {
            alignment: { horizontal: 'left' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Prepare the grid
        const rows = table.querySelectorAll('tr');
        rows.forEach((tr, rowIndex) => {
            const excelRow = worksheet.getRow(rowIndex + 1);
            let colOffset = 1;

            tr.querySelectorAll('th, td').forEach((cell) => {
                const colspan = parseInt(cell.getAttribute('colspan') || 1);
                const rowspan = parseInt(cell.getAttribute('rowspan') || 1);

                while (excelRow.getCell(colOffset).value !== null && excelRow.getCell(colOffset).value !== undefined) {
                    colOffset++;
                }

                const excelCell = excelRow.getCell(colOffset);
                excelCell.value = cell.innerText.trim();

                let style = normalCellStyle;
                if (tr.classList.contains('header-supra')) style = headerSupraStyle;
                else if (tr.classList.contains('header-cat')) style = headerCatStyle;
                else if (tr.classList.contains('row-total-general')) style = rowTotalGeneralStyle;
                else if (tr.classList.contains('row-total-campo')) style = rowTotalCampoStyle;
                else if (tr.classList.contains('row-total-rodeo')) style = rowTotalRodeoStyle;
                else if (cell.classList.contains('col-totales')) style = colTotalesStyle;
                else if (cell.classList.contains('col-sticky')) style = stickyCellStyle;

                excelCell.style = JSON.parse(JSON.stringify(style));

                if (colspan > 1 || rowspan > 1) {
                    worksheet.mergeCells(rowIndex + 1, colOffset, rowIndex + rowspan, colOffset + colspan - 1);
                    for (let r = rowIndex + 1; r <= rowIndex + rowspan; r++) {
                        for (let c = colOffset; c <= colOffset + colspan - 1; c++) {
                            worksheet.getRow(r).getCell(c).style = JSON.parse(JSON.stringify(style));
                        }
                    }
                }

                colOffset += colspan;
            });
        });

        worksheet.getColumn(1).width = 15;
        worksheet.getColumn(2).width = 25;
        worksheet.getColumn(3).width = 12;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = 'Matriz_Stock_' + new Date().toISOString().split('T')[0] + '.xlsx';
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    });
}

// ===== MATRIX TABLE LOGIC =====
const MATRIX_STRUCTURE = {
    "RECRIA": ['Tro Indif', 'Tro', 'Tra', 'Tro Pie', 'Vaq repo'],
    "VIENTRES": ['Vaq 1er 15', 'Vaq 1er 20', 'Vaq 2do 15', 'Vaq 2do 20', 'Vaca 3er', 'Vaca Gen', 'CUT'],
    "TOROS": ['Toro', 'Torito'],
    "INVERNADA": ['Vaca Venta', 'MEJ', 'Novillo', 'Novillito', 'Vaq Venta']
};

function updateMatrixTable(data) {
    const matrixTable = document.getElementById('matrix-table');
    if (!matrixTable) return;

    const tbody = document.getElementById('matrix-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    // 0. Resolve Active Filters for Columns
    const filterSupra = document.getElementById('filter-supracategoria').value;
    const filterCat = document.getElementById('filter-categoria').value;

    // 1. Identify which columns to show
    let visibleStructure = {};
    Object.keys(MATRIX_STRUCTURE).forEach(supra => {
        if (!filterSupra || filterSupra === supra) {
            const cats = MATRIX_STRUCTURE[supra].filter(c => !filterCat || filterCat === c);
            if (cats.length > 0) {
                visibleStructure[supra] = cats;
            }
        }
    });

    const ALL_VISIBLE_CATS = Object.values(visibleStructure).flat();

    // 2. Build Dynamic THEAD
    let theadHtml = `
        <tr class="header-supra">
            <th rowspan="2" class="col-sticky col-campo">Campo</th>
            <th rowspan="2" class="col-sticky col-rodeo">Rodeo</th>
            <th rowspan="2" class="col-totales">TOTALES</th>
            ${Object.keys(visibleStructure).map(supra => `
                <th colspan="${visibleStructure[supra].length}" class="group-${supra.toLowerCase()}">${supra}</th>
            `).join('')}
        </tr>
        <tr class="header-cat">
            ${Object.keys(visibleStructure).flatMap(supra =>
        visibleStructure[supra].map(cat => `<th class="sub-cat group-${supra.toLowerCase()}">${cat}</th>`)
    ).join('')}
        </tr>
    `;

    // Replace actual thead content
    let existingThead = matrixTable.querySelector('thead');
    if (existingThead) existingThead.innerHTML = theadHtml;

    // 3. Filtering Data for Latest Snapshot
    let maxDateStr = data[0].Fecha;
    let maxDate = new Date(maxDateStr);
    data.forEach(item => {
        const d = new Date(item.Fecha);
        if (d > maxDate) {
            maxDate = d;
            maxDateStr = item.Fecha;
        }
    });

    const latestData = data.filter(item => item.Fecha === maxDateStr);

    // Header Totals Injection
    const totalAnimales = latestData.reduce((sum, item) => sum + (item.Cantidad || 0), 0);
    const uniqueRodeos = new Set(latestData.map(item => item.Rodeo));
    const totalRodeos = uniqueRodeos.size;
    const totalsHeader = document.querySelector('.header-supra .col-totales');
    if (totalsHeader) totalsHeader.innerHTML = `TOTALES`;

    // 4. Transform Data to Matrix
    const matrix = {};
    const generalTotals = { Total: 0 };
    ALL_VISIBLE_CATS.forEach(c => generalTotals[c] = 0);

    latestData.forEach(row => {
        const campo = (row.Campo || 'Sin Campo').trim();
        const rodeo = (row.Rodeo || 'Sin Rodeo').trim();
        const cat = (row.Categoria || '').trim();
        const cant = Number(row.Cantidad) || 0;

        if (!matrix[campo]) {
            matrix[campo] = { totalCampo: 0, rodeos: {}, campoTotals: {} };
            ALL_VISIBLE_CATS.forEach(c => matrix[campo].campoTotals[c] = 0);
        }
        if (!matrix[campo].rodeos[rodeo]) {
            matrix[campo].rodeos[rodeo] = { Total: 0 };
            ALL_VISIBLE_CATS.forEach(c => matrix[campo].rodeos[rodeo][c] = 0);
        }

        // Match category ignoring case
        const matchedColumn = ALL_VISIBLE_CATS.find(c => c.toLowerCase() === cat.toLowerCase());

        if (matchedColumn) {
            matrix[campo].rodeos[rodeo][matchedColumn] += cant;
            matrix[campo].rodeos[rodeo].Total += cant;
            matrix[campo].campoTotals[matchedColumn] += cant;
            matrix[campo].totalCampo += cant;
            generalTotals[matchedColumn] += cant;
            generalTotals.Total += cant;
        }
    });

    // 5. Build Dynamic TBODY
    let html = '';

    // Row: General
    html += `<tr class="row-total-general">`;
    html += `<th colspan="2" class="col-sticky col-campo" style="text-align: right; padding-right: 12px;">General</th>`;
    html += `<td class="col-totales">${generalTotals.Total.toLocaleString('es-AR')}</td>`;
    ALL_VISIBLE_CATS.forEach(col => {
        const val = generalTotals[col];
        html += `<td>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
    });
    html += `</tr>`;

    // Campos & Rodeos
    const sortedCampos = Object.keys(matrix).sort();
    sortedCampos.forEach(campoName => {
        const campoData = matrix[campoName];
        const sortedRodeos = Object.keys(campoData.rodeos).sort();
        let isFirstRodeo = true;

        sortedRodeos.forEach(rodeoName => {
            const rodeoData = campoData.rodeos[rodeoName];
            html += `<tr>`;
            if (isFirstRodeo) {
                html += `<td class="col-sticky col-campo"><strong>${campoName}</strong></td>`;
                isFirstRodeo = false;
            } else {
                html += `<td class="col-sticky col-campo"></td>`;
            }
            html += `<td class="col-sticky col-rodeo">${rodeoName}</td>`;
            html += `<td class="col-totales">${rodeoData.Total > 0 ? rodeoData.Total.toLocaleString('es-AR') : ''}</td>`;
            ALL_VISIBLE_CATS.forEach(col => {
                const val = rodeoData[col];
                html += `<td>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
            });
            html += `</tr>`;
        });

        // Totals per Campo
        if (sortedRodeos.length > 0) {
            html += `<tr class="row-total-campo">`;
            html += `<td class="col-sticky col-campo"></td>`;
            html += `<td class="col-sticky col-rodeo" style="text-align: right; padding-right: 12px;"><strong>Total</strong></td>`;
            html += `<td class="col-totales">${campoData.totalCampo > 0 ? campoData.totalCampo.toLocaleString('es-AR') : ''}</td>`;
            ALL_VISIBLE_CATS.forEach(col => {
                const val = campoData.campoTotals[col];
                html += `<td>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
            });
            html += `</tr>`;
        }
    });

    tbody.innerHTML = html;
}

// ===== DASHBOARD INITIALIZATION =====
function updateDashboard(data) {
    // Store data globally for CSV export
    window.currentFilteredData = data;

    const kpis = calculateKPIs(data);
    updateKPICards(kpis);
    updateChart(data);
    updateInformeTable(data);
    updateMatrixTable(data);
}

function initFullscreenMatrixButton() {
    const btn = document.getElementById('btn-fullscreen-matrix');
    const container = document.getElementById('view-matrix');
    const textSpan = btn ? btn.querySelector('.fullscreen-text') : null;

    if (!btn || !container) return;

    btn.addEventListener('click', () => {
        const isFullscreen = container.classList.toggle('fullscreen-mode');

        // Toggle body class to lock scroll
        document.body.classList.toggle('fullscreen-active', isFullscreen);

        if (textSpan) {
            textSpan.textContent = isFullscreen ? 'Salir de Pantalla' : 'Pantalla Completa';
        }
    });
}

async function initializeDashboard() {
    // Setup View Tabs
    setupViewSwitcher();
    initExportCSVButton();
    initExportMatrixExcelButton();
    initFullscreenMatrixButton();

    // Initialize chart if not exists
    if (!chartInstance) {
        initChart();
    }

    // Populate filters from Supabase
    await initializeFilters();

    // Load initial data from Supabase
    await fetchFilteredData();

    // Date filter — preset mode events
    document.getElementById('filter-date').addEventListener('change', fetchFilteredData);
    // Date filter — single date
    document.getElementById('filter-date-single').addEventListener('change', fetchFilteredData);
    // Date filter — range
    document.getElementById('filter-date-from').addEventListener('change', fetchFilteredData);
    document.getElementById('filter-date-to').addEventListener('change', fetchFilteredData);
    // Date mode pills
    document.querySelectorAll('.date-pill').forEach(btn => {
        btn.addEventListener('click', () => switchDateMode(btn.dataset.mode));
    });
    // Other filters
    document.getElementById('filter-campo').addEventListener('change', fetchFilteredData);
    document.getElementById('filter-rodeo').addEventListener('change', fetchFilteredData);
    document.getElementById('filter-supracategoria').addEventListener('change', fetchFilteredData);
    document.getElementById('filter-categoria').addEventListener('change', fetchFilteredData);
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

    // Setup KPI card clicks
    setupCardClicks();

    // Setup Side Panel listeners
    setupPanelListeners();
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Check authentication on load
    checkAuth();
});
