// ===== SUPABASE CONFIGURATION =====
const SUPABASE_URL = 'https://urquftsucjtqxogjjhhx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXVmdHN1Y2p0cXhvZ2pqaGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjQ3MjMsImV4cCI6MjA4NzQ0MDcyM30.GJu2UaYFqQAXMgghQY1Xag62tKecNG8hk-nzsvYKdzE';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== GLOBAL STATE =====
let chartInstance = null;
let isInitialized = false; // Para evitar doble inicialización

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
        if (!isInitialized) {
            initializeDashboard();
            isInitialized = true;
        }
    } else {
        loginScreen.style.display = 'flex';
        dashboard.style.display = 'none';
        isInitialized = false;
        // Limpiar gráfico al cerrar sesión
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
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
}

function updateActiveFiltersIndicator() {
    const campoValue = document.getElementById('filter-campo').value;
    const rodeoValue = document.getElementById('filter-rodeo').value;
    const supracategoriaValue = document.getElementById('filter-supracategoria').value;
    const categoriaValue = document.getElementById('filter-categoria').value;
    const dateFilter = document.getElementById('filter-date').value;

    const hasActiveFilters = campoValue || rodeoValue || supracategoriaValue || categoriaValue || dateFilter !== 'all';
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

        const campoValue = document.getElementById('filter-campo').value;
        const rodeoValue = document.getElementById('filter-rodeo').value;
        const supracategoriaValue = document.getElementById('filter-supracategoria').value;
        const categoriaValue = document.getElementById('filter-categoria').value;
        const dateFilter = document.getElementById('filter-date').value;

        // Query Historial_Stock table
        let query = supabaseClient.from('Historial_Stock').select('*');

        // Apply filters using capitalized column names
        if (campoValue) query = query.eq('Campo', campoValue);
        if (rodeoValue) query = query.eq('Rodeo', rodeoValue);
        if (supracategoriaValue) query = query.eq('Supracategoria', supracategoriaValue);
        if (categoriaValue) query = query.eq('Categoria', categoriaValue);

        // Date Period Filtering
        if (dateFilter !== 'all') {
            const today = new Date();
            let dateFrom = new Date(today);

            if (dateFilter === '7days') {
                dateFrom.setDate(today.getDate() - 7);
            } else if (dateFilter === '30days') {
                dateFrom.setDate(today.getDate() - 30);
            } else if (dateFilter === 'thismonth') {
                dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
            }

            const fromStr = dateFrom.toISOString().split('T')[0];
            query = query.gte('Fecha', fromStr);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            document.getElementById('no-data-message').style.display = 'flex';
            updateDashboard([]);
        } else {
            document.getElementById('no-data-message').style.display = 'none';
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
    document.getElementById('filter-date').value = 'all';
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
        supracategoriasList: []
    };

    const getCounts = (key) => {
        const counts = data.reduce((acc, item) => {
            const val = item[key];
            if (val) {
                acc[val] = (acc[val] || 0) + (item.Cantidad || 0);
            }
            return acc;
        }, {});
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count); // Most populated first
    };

    return {
        stockTotal: data.reduce((sum, item) => sum + (item.Cantidad || 0), 0),
        camposCount: [...new Set(data.map(item => item.Campo))].filter(Boolean).length,
        rodeosCount: [...new Set(data.map(item => item.Rodeo))].filter(Boolean).length,
        categoriasCount: [...new Set(data.map(item => item.Categoria))].filter(Boolean).length,
        camposList: getCounts('Campo'),
        rodeosList: getCounts('Rodeo'),
        categoriasList: getCounts('Categoria'),
        supracategoriasList: getCounts('Supracategoria')
    };
}

function updateKPICards(kpis) {
    document.getElementById('kpi-stock').textContent = kpis.stockTotal.toLocaleString('es-AR');
    document.getElementById('kpi-campos').textContent = kpis.camposCount;
    document.getElementById('kpi-rodeos').textContent = kpis.rodeosCount;
    document.getElementById('kpi-categorias').textContent = kpis.categoriasCount;

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

// ===== DASHBOARD INITIALIZATION =====
function updateDashboard(data) {
    const kpis = calculateKPIs(data);
    updateKPICards(kpis);
    updateChart(data);
}

async function initializeDashboard() {
    // Initialize chart if not exists
    if (!chartInstance) {
        initChart();
    }

    // Populate filters from Supabase
    await initializeFilters();

    // Load initial data from Supabase
    await fetchFilteredData();

    // Add filter event listeners
    document.getElementById('filter-date').addEventListener('change', fetchFilteredData);
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
