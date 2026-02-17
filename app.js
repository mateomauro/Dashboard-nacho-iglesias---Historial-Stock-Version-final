// ===== SUPABASE CONFIGURATION =====
const SUPABASE_URL = 'https://jvbafefldxyylmaknuhg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2YmFmZWZsZHh5eWxtYWtudWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MzE2NTUsImV4cCI6MjA4NjUwNzY1NX0.O2boJMcYTaNzXjHpYpbmytYMlFpeD-u00HVid9vfZmU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== GLOBAL STATE =====
let chartInstance = null;
const VALID_EMAIL = 'Iglesiasaym@gmail.com';
const VALID_PASSWORD = 'admin';

// ===== AUTHENTICATION =====
function checkAuth() {
    const isAuthenticated = localStorage.getItem('auth') === 'true';
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');

    if (isAuthenticated) {
        loginScreen.style.display = 'none';
        dashboard.style.display = 'block';
        initializeDashboard();
    } else {
        loginScreen.style.display = 'flex';
        dashboard.style.display = 'none';
    }
}

function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');

    if (email.toLowerCase() === VALID_EMAIL.toLowerCase() && password === VALID_PASSWORD) {
        localStorage.setItem('auth', 'true');
        errorElement.classList.remove('show');
        checkAuth();
    } else {
        errorElement.textContent = 'Credenciales incorrectas. Verifica tu email y contraseña.';
        errorElement.classList.add('show');
    }
}

function handleLogout() {
    localStorage.removeItem('auth');
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    checkAuth();
}

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

    if (hasActiveFilters) {
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
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
        camposActivos: 0,
        rodeos: 0,
        categorias: 0,
        listaCampos: [],
        listaRodeos: [],
        listaCategorias: []
    };

    const uniqueCampos = [...new Set(data.map(item => item.Campo))].filter(Boolean).sort();
    const uniqueRodeos = [...new Set(data.map(item => item.Rodeo))].filter(Boolean).sort();
    const uniqueCategorias = [...new Set(data.map(item => item.Categoria))].filter(Boolean).sort();

    return {
        stockTotal: data.reduce((sum, item) => sum + (item.Cantidad || 0), 0),
        camposActivos: uniqueCampos.length,
        rodeos: uniqueRodeos.length,
        categorias: uniqueCategorias.length,
        listaCampos: uniqueCampos,
        listaRodeos: uniqueRodeos,
        listaCategorias: uniqueCategorias
    };
}

function updateKPICards(kpis) {
    document.getElementById('kpi-stock').textContent = kpis.stockTotal.toLocaleString('es-AR');
    document.getElementById('kpi-campos').textContent = kpis.camposActivos;
    document.getElementById('kpi-rodeos').textContent = kpis.rodeos;
    document.getElementById('kpi-categorias').textContent = kpis.categorias;

    // Helper to format list
    const formatList = (list) => {
        if (list.length === 0) return '';
        return list.join(', ');
    };

    document.getElementById('kpi-campos-details').textContent = formatList(kpis.listaCampos);
    document.getElementById('kpi-rodeos-details').textContent = formatList(kpis.listaRodeos);
    document.getElementById('kpi-categorias-details').textContent = formatList(kpis.listaCategorias);
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
                borderColor: '#4169FF',
                backgroundColor: 'rgba(65, 105, 255, 0.08)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 6,
                pointBackgroundColor: '#4169FF',
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
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        family: 'Inter'
                    },
                    bodyFont: {
                        size: 13,
                        family: 'Inter'
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
                        color: '#f1f5f9'
                    },
                    ticks: {
                        font: {
                            size: 11,
                            family: 'Inter'
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
                        font: {
                            size: 11,
                            family: 'Inter'
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
