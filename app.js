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

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
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
function showLoading() {
    document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('show');
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
        showLoading();
        hideError();
        // Fetch unique values for all filters from Historial_Stock table
        const { data, error } = await supabaseClient.from('Historial_Stock').select('Campo, Rodeo, Supracategoria, Categoria');
        if (error) throw error;

        // Use capitalized column names
        const campos = [...new Set(data.map(item => item.Campo))].sort();
        const rodeos = [...new Set(data.map(item => item.Rodeo))].sort();
        const supracategorias = [...new Set(data.map(item => item.Supracategoria))].sort();
        const categorias = [...new Set(data.map(item => item.Categoria))].sort();

        // Populate Campo filter
        const campoSelect = document.getElementById('filter-campo');
        campoSelect.innerHTML = '<option value="">Todos</option>';
        campos.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                campoSelect.appendChild(option);
            }
        });

        // Populate Rodeo filter
        const rodeoSelect = document.getElementById('filter-rodeo');
        rodeoSelect.innerHTML = '<option value="">Todos</option>';
        rodeos.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                rodeoSelect.appendChild(option);
            }
        });

        // Populate Supracategoria filter
        const supracategoriaSelect = document.getElementById('filter-supracategoria');
        supracategoriaSelect.innerHTML = '<option value="">Todas</option>';
        supracategorias.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                supracategoriaSelect.appendChild(option);
            }
        });

        // Populate Categoria filter
        const categoriaSelect = document.getElementById('filter-categoria');
        categoriaSelect.innerHTML = '<option value="">Todas</option>';
        categorias.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                categoriaSelect.appendChild(option);
            }
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
        showLoading();
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
            const today = new Date(); // Use actual current date
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

        updateDashboard(data);
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
    if (!data) return { stockTotal: 0, camposActivos: 0, rodeos: 0, categorias: 0 };

    return {
        stockTotal: data.reduce((sum, item) => sum + (item.Cantidad || 0), 0),
        camposActivos: new Set(data.map(item => item.Campo)).size,
        rodeos: new Set(data.map(item => item.Rodeo)).size,
        categorias: new Set(data.map(item => item.Categoria)).size
    };
}

function updateKPICards(kpis) {
    document.getElementById('kpi-stock').textContent = kpis.stockTotal.toLocaleString();
    document.getElementById('kpi-campos').textContent = kpis.camposActivos;
    document.getElementById('kpi-rodeos').textContent = kpis.rodeos;
    document.getElementById('kpi-categorias').textContent = kpis.categorias;
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
                backgroundColor: 'rgba(65, 105, 255, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#4169FF',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function (context) {
                            return 'Stock: ' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

function updateChart(data) {
    if (!data) return;

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

    // Update chart
    if (chartInstance) {
        chartInstance.data.labels = sortedDates;
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
