import Chart from 'chart.js/auto';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseClient } from './src/lib/supabase.js';
import { setAuthUiHandler } from './src/lib/authBridge.js';

// ===== GLOBAL STATE =====
let chartInstance = null;
let isInitialized = false;
let sessionTimeout = null; // Temporizador para el cierre automático
const SESSION_DURATION = 60 * 60 * 1000; // 1 hora en milisegundos
let activeFetchRequestId = 0;
// Filas del último snapshot con Cantidad > 0 (base para los desplegables dependientes).
let snapshotPositiveData = [];
const RELATION_FILTER_CONFIG = [
    { key: 'Campo', selectId: 'filter-campo', allLabel: 'Todos los campos' },
    { key: 'Rodeo', selectId: 'filter-rodeo', allLabel: 'Todos los rodeos' },
    { key: 'Supracategoria', selectId: 'filter-supracategoria', allLabel: 'Todas las supracategorías' },
    { key: 'Categoria', selectId: 'filter-categoria', allLabel: 'Todas las categorías' },
];

// MATRIX CONFIGURATION
const MATRIX_STRUCTURE = {
    "RECRIA": ['Tro Indif', 'Tro', 'Tra', 'Tro Pie'],
    "VIENTRES": ['Vaq repo', 'Vaq 1er 15', 'Vaq 1er 20', 'Vaq 2do 15', 'Vaq 2do 20', 'Vaca 3er', 'Vaca Gen', 'CUT'],
    "TOROS": ['Toro', 'Torito'],
    "INVERNADA": ['Vaca Venta', 'MEJ', 'Novillo', 'Novillito', 'Vaq Venta']
};

// Categorias que se muestran como columna pero NO suman en ninguna supracategoria ni total general
const CATS_EXCLUDED_FROM_SUPRA_TOTAL = ['Tro Indif'];

// ===== AUTHENTICATION (Supabase Auth) =====
function updateUIForAuth(session) {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');

    if (session) {
        if (loginScreen) loginScreen.style.display = 'none';
        dashboard.style.display = 'block';

        // --- Lógica de tiempo de expiración ---
        manejarExpiracionSesion();

        if (!isInitialized) {
            initializeDashboard();
            isInitialized = true;
        }
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
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

setAuthUiHandler(updateUIForAuth);

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

// Auth state: React (src/App.jsx) suscribe a Supabase y notifica vía authBridge.

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
    const campoValues = getSelectedValues('filter-campo');
    const rodeoValues = getSelectedValues('filter-rodeo');
    const supracategoriaValues = getSelectedValues('filter-supracategoria');
    const categoriaValues = getSelectedValues('filter-categoria');
    const dateFilter = document.getElementById('filter-date').value;
    const singleDate = document.getElementById('filter-date-single').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;

    const hasDateFilter = (activeDateMode === 'preset' && dateFilter !== 'all')
        || (activeDateMode === 'single' && singleDate)
        || (activeDateMode === 'range' && (dateFrom || dateTo));

    const totalSelections = campoValues.length + rodeoValues.length
        + supracategoriaValues.length + categoriaValues.length;
    const hasActiveFilters = totalSelections > 0 || hasDateFilter;

    const indicator = document.getElementById('active-filters-indicator');
    const clearBtn = document.getElementById('clear-filters-btn');

    if (hasActiveFilters) {
        indicator.style.display = 'flex';
        const countText = totalSelections ? ` (${totalSelections})` : '';
        indicator.innerHTML = `<span class="pulse-dot"></span>Filtros activos${countText}`;
        clearBtn.disabled = false;
    } else {
        indicator.style.display = 'none';
        indicator.innerHTML = '<span class="pulse-dot"></span>Filtros activos';
        clearBtn.disabled = true;
    }

    renderActiveFilterChips();
}

function renderActiveFilterChips() {
    const container = document.getElementById('active-filter-chips');
    if (!container) return;

    const chips = [];
    RELATION_FILTER_CONFIG.forEach(({ key, selectId }) => {
        const labels = {
            'filter-campo': 'Campo',
            'filter-rodeo': 'Rodeo',
            'filter-supracategoria': 'Supra',
            'filter-categoria': 'Categoría',
        };
        getSelectedValues(selectId).forEach(value => {
            chips.push({ filterId: selectId, type: labels[selectId] || key, value });
        });
    });

    if (chips.length === 0) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    container.hidden = false;
    container.innerHTML = chips.map(chip => `
        <span class="filter-chip" data-filter-id="${chip.filterId}" data-value="${escapeHtml(chip.value)}">
            <span class="filter-chip__type">${escapeHtml(chip.type)}</span>
            <span class="filter-chip__name">${escapeHtml(chip.value)}</span>
            <button type="button" class="filter-chip__remove" aria-label="Quitar ${escapeHtml(chip.type)}: ${escapeHtml(chip.value)}">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </span>
    `).join('') + (chips.length >= 2
        ? `<button type="button" class="filter-chip__clear-all" id="filter-chip-clear-all">Quitar todos</button>`
        : '');

    container.querySelectorAll('.filter-chip__remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chip = e.currentTarget.closest('.filter-chip');
            if (!chip) return;
            const filterId = chip.dataset.filterId;
            const value = chip.dataset.value;
            const state = multiFilterState[filterId];
            if (!state) return;
            state.values.delete(value);
            renderMultiFilterTrigger(filterId);
            handleRelationFilterChange();
        });
    });

    const clearAllBtn = container.querySelector('#filter-chip-clear-all');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => clearFilters());
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

function setDisplayById(id, displayValue) {
    const el = document.getElementById(id);
    if (el) el.style.display = displayValue;
}

function setDisplayBySelector(selector, displayValue) {
    const el = document.querySelector(selector);
    if (el) el.style.display = displayValue;
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
        const selected = new Set(getSelectedValues(filterId));
        selected.add(value);
        const filterConfig = RELATION_FILTER_CONFIG.find(f => f.selectId === filterId);
        setSelectedValues(filterId, [...selected]);
        syncMultiFilterUi(filterId, filterConfig ? filterConfig.allLabel : 'Todos');
        // Trigger data refresh
        handleRelationFilterChange();
        // Visual feedback en el wrapper del filtro
        filterEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        filterEl.style.boxShadow = '0 0 0 4px rgba(65, 105, 255, 0.2)';
        setTimeout(() => { filterEl.style.boxShadow = ''; }, 2000);
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
// Estado interno por filtro. Reemplaza al <select multiple> nativo por un dropdown propio
// con búsqueda + checkboxes. La fuente de verdad es `multiFilterState`.
const multiFilterState = {};
let openMultiFilterId = null;

function ensureMultiFilterState(filterId, allLabel) {
    if (!multiFilterState[filterId]) {
        multiFilterState[filterId] = {
            values: new Set(),
            options: [],
            allLabel: allLabel || 'Todos',
            search: '',
            dirty: false,
        };
    } else if (allLabel) {
        multiFilterState[filterId].allLabel = allLabel;
    }
    return multiFilterState[filterId];
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function getSelectedValues(filterId) {
    const state = multiFilterState[filterId];
    if (!state) return [];
    return [...state.values];
}

function setSelectedValues(filterId, values) {
    const state = ensureMultiFilterState(filterId);
    state.values = new Set((values || []).filter(v => state.options.length === 0 || state.options.includes(v)));
    renderMultiFilterTrigger(filterId);
    if (openMultiFilterId === filterId) renderMultiFilterPanel(filterId);
}

function getMultiSelectionLabel(values, allLabel) {
    if (!values || values.length === 0) return allLabel;
    if (values.length === 1) return values[0];
    return `${values.length} seleccionados`;
}

function renderMultiFilterTrigger(filterId) {
    const state = multiFilterState[filterId];
    if (!state) return;
    const wrapper = document.getElementById(filterId);
    if (!wrapper) return;

    const labelEl = wrapper.querySelector('.multi-filter-label');
    const countEl = wrapper.querySelector('.multi-filter-count');
    const triggerEl = wrapper.querySelector('.multi-filter-trigger');
    const values = [...state.values];

    if (labelEl) labelEl.textContent = getMultiSelectionLabel(values, state.allLabel);
    if (countEl) {
        if (values.length > 1) {
            countEl.hidden = false;
            countEl.textContent = values.length;
        } else {
            countEl.hidden = true;
        }
    }
    wrapper.classList.toggle('is-active', values.length > 0);
    if (triggerEl) {
        const summary = values.length > 0
            ? `${state.allLabel}: ${values.length} seleccionado${values.length > 1 ? 's' : ''}`
            : state.allLabel;
        triggerEl.setAttribute('aria-label', summary);
    }
}

function renderMultiFilterPanel(filterId) {
    const state = multiFilterState[filterId];
    if (!state) return;
    const wrapper = document.getElementById(filterId);
    if (!wrapper) return;

    const list = wrapper.querySelector('.multi-filter-list');
    const empty = wrapper.querySelector('.multi-filter-empty');
    if (!list) return;

    const term = (state.search || '').toLowerCase();
    const filtered = state.options.filter(opt => !term || opt.toLowerCase().includes(term));

    list.innerHTML = filtered.map(opt => {
        const checked = state.values.has(opt) ? 'checked' : '';
        const safe = escapeHtml(opt);
        return `
            <li class="multi-filter-option" role="option" aria-selected="${state.values.has(opt) ? 'true' : 'false'}">
                <input type="checkbox" data-value="${safe}" ${checked} aria-label="${safe}">
                <span class="multi-filter-option-name">${safe}</span>
            </li>
        `;
    }).join('');

    if (empty) {
        empty.hidden = filtered.length > 0;
    }

    list.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const value = e.target.dataset.value;
            if (e.target.checked) state.values.add(value);
            else state.values.delete(value);
            state.dirty = true;
            renderMultiFilterTrigger(filterId);
            const li = e.target.closest('.multi-filter-option');
            if (li) li.setAttribute('aria-selected', e.target.checked ? 'true' : 'false');
        });
    });

    // Permite seleccionar tocando cualquier parte de la fila, no solo el checkbox.
    list.querySelectorAll('.multi-filter-option').forEach(optionEl => {
        optionEl.addEventListener('click', (e) => {
            if (e.target.closest('input[type="checkbox"]')) return;
            const input = optionEl.querySelector('input[type="checkbox"]');
            if (!input) return;
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
}

function openMultiFilter(filterId) {
    if (openMultiFilterId && openMultiFilterId !== filterId) {
        closeMultiFilter(openMultiFilterId);
    }
    const wrapper = document.getElementById(filterId);
    const state = multiFilterState[filterId];
    if (!wrapper || !state) return;

    openMultiFilterId = filterId;
    state.dirty = false;
    state.search = '';
    const searchEl = wrapper.querySelector('.multi-filter-search');
    if (searchEl) searchEl.value = '';

    wrapper.classList.add('open');
    const panel = wrapper.querySelector('.multi-filter-panel');
    if (panel) panel.hidden = false;
    const trigger = wrapper.querySelector('.multi-filter-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    renderMultiFilterPanel(filterId);

    // Focus search input for keyboard usability
    setTimeout(() => { if (searchEl) searchEl.focus(); }, 30);
}

function closeMultiFilter(filterId) {
    const wrapper = document.getElementById(filterId);
    const state = multiFilterState[filterId];
    if (!wrapper || !state) return;

    wrapper.classList.remove('open');
    const panel = wrapper.querySelector('.multi-filter-panel');
    if (panel) panel.hidden = true;
    const trigger = wrapper.querySelector('.multi-filter-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    if (openMultiFilterId === filterId) openMultiFilterId = null;

    if (state.dirty) {
        state.dirty = false;
        handleRelationFilterChange();
    }
}

function setupMultiFilters() {
    RELATION_FILTER_CONFIG.forEach(({ selectId, allLabel }) => {
        const wrapper = document.getElementById(selectId);
        if (!wrapper) return;
        ensureMultiFilterState(selectId, allLabel);

        // Estado inicial: panel cerrado siempre, sin importar el cache del browser.
        wrapper.classList.remove('open');
        const initialPanel = wrapper.querySelector('.multi-filter-panel');
        if (initialPanel) initialPanel.hidden = true;
        const initialTrigger = wrapper.querySelector('.multi-filter-trigger');
        if (initialTrigger) initialTrigger.setAttribute('aria-expanded', 'false');

        const trigger = wrapper.querySelector('.multi-filter-trigger');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (wrapper.classList.contains('open')) {
                    closeMultiFilter(selectId);
                } else {
                    openMultiFilter(selectId);
                }
            });
        }

        const search = wrapper.querySelector('.multi-filter-search');
        if (search) {
            search.addEventListener('click', (e) => e.stopPropagation());
            search.addEventListener('input', (e) => {
                const state = multiFilterState[selectId];
                if (!state) return;
                state.search = e.target.value || '';
                renderMultiFilterPanel(selectId);
            });
        }

        wrapper.querySelectorAll('.multi-filter-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const state = multiFilterState[selectId];
                if (!state) return;
                if (action === 'all') {
                    const term = (state.search || '').toLowerCase();
                    state.options.forEach(opt => {
                        if (!term || opt.toLowerCase().includes(term)) state.values.add(opt);
                    });
                } else if (action === 'clear') {
                    state.values.clear();
                }
                state.dirty = true;
                renderMultiFilterTrigger(selectId);
                renderMultiFilterPanel(selectId);
            });
        });

        const panel = wrapper.querySelector('.multi-filter-panel');
        if (panel) panel.addEventListener('click', (e) => e.stopPropagation());
    });

    // Click outside cierra el dropdown abierto y dispara la actualización
    document.addEventListener('click', () => {
        if (openMultiFilterId) closeMultiFilter(openMultiFilterId);
    });

    // Escape cierra sin descartar selección (igual aplica los cambios)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && openMultiFilterId) {
            closeMultiFilter(openMultiFilterId);
        }
    });
}

function syncMultiFilterUi(filterId, allLabel = 'Todos') {
    ensureMultiFilterState(filterId, allLabel);
    renderMultiFilterTrigger(filterId);
    if (openMultiFilterId === filterId) renderMultiFilterPanel(filterId);
}

function syncAllMultiFilterUi() {
    RELATION_FILTER_CONFIG.forEach(({ selectId, allLabel }) => {
        syncMultiFilterUi(selectId, allLabel);
    });
}

async function initializeFilters() {
    try {
        showLoading(true);
        hideError();


        // Fetch unique values for all filters from Historial_Stock table.
        // Cantidad is required to filter out rows with 0 (no stock) so they don't show in dropdowns.
        const { data, error } = await supabaseClient.from('Historial_Stock').select('Campo, Rodeo, Supracategoria, Categoria, Fecha, Cantidad');
        if (error) throw error;

        // Fechas únicas y ordenadas
        const fechasRaw = [...new Set(data.map(item => item.Fecha))].filter(Boolean);
        const fechasDesc = fechasRaw.sort((a, b) => new Date(b) - new Date(a));
        const fechaSelect = document.getElementById('filter-date-single');
        if (fechaSelect && fechaSelect.tagName === 'SELECT') {
            fechaSelect.innerHTML = '<option value="">Seleccione una fecha...</option>';
            fechasDesc.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                const parts = value.split('-');
                option.textContent = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
                fechaSelect.appendChild(option);
            });
            // Try to set to latest date automatically
            if (fechasDesc.length > 0) {
                fechaSelect.value = fechasDesc[0];
            }
        }

        // Tomar la última foto (snapshot) y guardar solo filas con stock > 0.
        const latestDate = fechasDesc[0];
        const snapshotData = latestDate
            ? data.filter(item => item.Fecha === latestDate)
            : data;
        snapshotPositiveData = snapshotData.filter(item => (Number(item.Cantidad) || 0) > 0);

        // Poblar los 4 desplegables dependientes a partir del snapshot.
        refreshAllFilterDropdowns();

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error inicializando filtros:', error);
        showError('Error al cargar filtros del servidor.');
    }
}

// ==== Filtros dependientes (cascada en 4 dimensiones) ====
// Devuelve los valores únicos disponibles para `targetField` aplicando todos los
// otros filtros activos sobre el snapshot con stock > 0.
function getAvailableFilterValues(targetField, filters) {
    const set = new Set();
    snapshotPositiveData.forEach(item => {
        for (const key of Object.keys(filters)) {
            if (key === targetField) continue;
            const values = filters[key];
            if (values.length > 0 && !values.includes(item[key])) return;
        }
        const v = item[targetField];
        if (v) set.add(v);
    });
    return [...set].sort();
}

function repopulateFilterSelect(selectId, allLabel, options) {
    const state = ensureMultiFilterState(selectId, allLabel);
    state.options = [...options];
    const kept = [...state.values].filter(value => options.includes(value));
    state.values = new Set(kept);
    renderMultiFilterTrigger(selectId);
    if (openMultiFilterId === selectId) renderMultiFilterPanel(selectId);
}

function getCurrentFilterRelations() {
    return {
        Campo: getSelectedValues('filter-campo'),
        Rodeo: getSelectedValues('filter-rodeo'),
        Supracategoria: getSelectedValues('filter-supracategoria'),
        Categoria: getSelectedValues('filter-categoria'),
    };
}

function refreshAllFilterDropdowns() {
    RELATION_FILTER_CONFIG.forEach(({ key, selectId, allLabel }) => {
        const filters = getCurrentFilterRelations();
        repopulateFilterSelect(selectId, allLabel, getAvailableFilterValues(key, filters));
    });
    syncAllMultiFilterUi();
}

function handleRelationFilterChange() {
    refreshAllFilterDropdowns();
    fetchFilteredData();
}

function getCurrentFilterValues() {
    return {
        campoValues: getSelectedValues('filter-campo'),
        rodeoValues: getSelectedValues('filter-rodeo'),
        supracategoriaValues: getSelectedValues('filter-supracategoria'),
        categoriaValues: getSelectedValues('filter-categoria'),
        datePresetValue: document.getElementById('filter-date').value,
        singleDateValue: document.getElementById('filter-date-single').value,
        dateFromValue: document.getElementById('filter-date-from').value,
        dateToValue: document.getElementById('filter-date-to').value
    };
}

function hasEntityFilterSelection(filters) {
    return (filters.campoValues.length + filters.rodeoValues.length
        + filters.supracategoriaValues.length + filters.categoriaValues.length) > 0;
}

function applyBasicFiltersToQuery(query, filters) {
    let nextQuery = query;
    if (filters.campoValues.length > 0) nextQuery = nextQuery.in('Campo', filters.campoValues);
    if (filters.rodeoValues.length > 0) nextQuery = nextQuery.in('Rodeo', filters.rodeoValues);
    if (filters.supracategoriaValues.length > 0) nextQuery = nextQuery.in('Supracategoria', filters.supracategoriaValues);
    if (filters.categoriaValues.length > 0) nextQuery = nextQuery.in('Categoria', filters.categoriaValues);
    return nextQuery;
}

function applyDateFiltersToQuery(query, filters) {
    let nextQuery = query;

    if (activeDateMode === 'preset') {
        if (filters.datePresetValue !== 'all') {
            const today = new Date();
            let dateFrom = new Date(today);

            if (filters.datePresetValue === '7days') {
                dateFrom.setDate(today.getDate() - 7);
            } else if (filters.datePresetValue === '30days') {
                dateFrom.setDate(today.getDate() - 30);
            } else if (filters.datePresetValue === 'thismonth') {
                dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
            } else if (filters.datePresetValue === 'lastmonth') {
                dateFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const dateTo = new Date(today.getFullYear(), today.getMonth(), 0);
                return nextQuery
                    .gte('Fecha', dateFrom.toISOString().split('T')[0])
                    .lte('Fecha', dateTo.toISOString().split('T')[0]);
            } else if (filters.datePresetValue === 'thisyear') {
                dateFrom = new Date(today.getFullYear(), 0, 1);
            }

            nextQuery = nextQuery.gte('Fecha', dateFrom.toISOString().split('T')[0]);
        }
    } else if (activeDateMode === 'single') {
        if (filters.singleDateValue) {
            nextQuery = nextQuery.eq('Fecha', filters.singleDateValue);
        }
    } else if (activeDateMode === 'range') {
        if (filters.dateFromValue && filters.dateToValue && filters.dateFromValue > filters.dateToValue) {
            throw new Error('Rango de fecha inválido: "Desde" no puede ser mayor que "Hasta".');
        }
        if (filters.dateFromValue) nextQuery = nextQuery.gte('Fecha', filters.dateFromValue);
        if (filters.dateToValue) nextQuery = nextQuery.lte('Fecha', filters.dateToValue);
    }

    return nextQuery;
}

function deduplicateStockRows(rows) {
    if (!rows || rows.length === 0) return [];

    const seen = new Set();
    const deduplicated = [];

    // Recorremos de atrás hacia adelante para conservar el último registro de cada clave.
    for (let i = rows.length - 1; i >= 0; i--) {
        const item = rows[i];
        const key = `${item.Fecha}|${item.Campo}|${item.Rodeo}|${item.Supracategoria}|${item.Categoria}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.unshift(item);
        }
    }

    return deduplicated;
}

function updateDataViewVisibility(hasData) {
    if (!hasData) {
        setDisplayById('no-data-message', 'flex');
        setDisplayById('informe-empty-state', 'flex');
        setDisplayById('matrix-empty-state', 'flex');
        setDisplayBySelector('.table-responsive:not(.matrix-responsive)', 'none');
        setDisplayBySelector('.matrix-responsive', 'none');
        return;
    }

    setDisplayById('no-data-message', 'none');
    setDisplayById('informe-empty-state', 'none');
    setDisplayById('matrix-empty-state', 'none');
    setDisplayBySelector('.table-responsive:not(.matrix-responsive)', 'block');
    setDisplayBySelector('.matrix-responsive', 'block');
}

async function fetchFilteredData() {
    const requestId = ++activeFetchRequestId;

    try {
        updateActiveFiltersIndicator();
        showLoading(false);
        hideError();

        const filters = getCurrentFilterValues();

        // Query con filtros de entidad + fechas; si aplica, segunda query: mismo rango de fechas pero sin Campo/Rodeo/Supra/Categoría (línea de "total" en el gráfico).
        let qFiltered = supabaseClient.from('Historial_Stock').select('*');
        qFiltered = applyBasicFiltersToQuery(qFiltered, filters);
        qFiltered = applyDateFiltersToQuery(qFiltered, filters);

        let data;
        let dataBaseline = null;
        if (hasEntityFilterSelection(filters)) {
            const baseOnlyFilters = {
                ...filters,
                campoValues: [],
                rodeoValues: [],
                supracategoriaValues: [],
                categoriaValues: [],
            };
            let qBase = supabaseClient.from('Historial_Stock').select('*');
            qBase = applyBasicFiltersToQuery(qBase, baseOnlyFilters);
            qBase = applyDateFiltersToQuery(qBase, baseOnlyFilters);
            const [rFiltered, rBase] = await Promise.all([qFiltered, qBase]);
            if (rFiltered.error) throw rFiltered.error;
            if (rBase.error) throw rBase.error;
            data = rFiltered.data;
            dataBaseline = rBase.data;
        } else {
            const { data: d, error } = await qFiltered;
            if (error) throw error;
            data = d;
        }

        // If a newer filter request was triggered, ignore this stale response.
        if (requestId !== activeFetchRequestId) return;

        const processedData = deduplicateStockRows(data || []);
        const baselineData = dataBaseline
            ? deduplicateStockRows(dataBaseline)
            : null;

        if (processedData.length === 0) {
            updateDataViewVisibility(false);
            updateDashboard([]);
        } else {
            updateDataViewVisibility(true);
            updateDashboard(processedData, baselineData);
        }

    } catch (error) {
        // Ignore errors from stale requests to avoid flicker/noise in UI.
        if (requestId !== activeFetchRequestId) return;
        console.error('Error filtrando datos:', error);
        showError('Error al cargar datos filtrados.');
    } finally {
        if (requestId === activeFetchRequestId) {
            hideLoading();
        }
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
    RELATION_FILTER_CONFIG.forEach(({ selectId, allLabel }) => {
        setSelectedValues(selectId, []);
        syncMultiFilterUi(selectId, allLabel);
    });
    refreshAllFilterDropdowns();

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

    const isExcluded = (cat) => CATS_EXCLUDED_FROM_SUPRA_TOTAL.some(c => c.toLowerCase() === (cat || '').toLowerCase());

    return {
        stockTotal: currentData.reduce((sum, item) => {
            if (isExcluded(item.Categoria)) return sum;
            return sum + (item.Cantidad || 0);
        }, 0),
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
                if (e.target.closest('.kpi-view-all')) return;

                const filterEl = document.getElementById(card.filter);
                if (filterEl) {
                    const trigger = filterEl.querySelector('.multi-filter-trigger');
                    if (trigger) trigger.focus();
                    filterEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    filterEl.style.boxShadow = '0 0 0 4px rgba(30, 64, 175, 0.18)';
                    setTimeout(() => { filterEl.style.boxShadow = ''; }, 2000);
                }
            });
        }
    });
}

// ===== CHART LOGIC =====
function buildDailyStockTotalsByFecha(data) {
    const isExcluded = (cat) => CATS_EXCLUDED_FROM_SUPRA_TOTAL.some(c => c.toLowerCase() === (cat || '').toLowerCase());
    return (data || []).reduce((acc, item) => {
        if (isExcluded(item.Categoria)) return acc;
        const fecha = item.Fecha;
        if (!fecha) return acc;
        acc[fecha] = (acc[fecha] || 0) + (Number(item.Cantidad) || 0);
        return acc;
    }, {});
}

function buildDailyStockByFechaAndCampo(data, allowedCampos = []) {
    const allowedSet = new Set((allowedCampos || []).filter(Boolean));
    const fields = {};
    const isExcluded = (cat) => CATS_EXCLUDED_FROM_SUPRA_TOTAL.some(c => c.toLowerCase() === (cat || '').toLowerCase());

    (data || []).forEach(item => {
        if (isExcluded(item.Categoria)) return;
        const fecha = item.Fecha;
        const campo = item.Campo;
        if (!fecha || !campo) return;
        if (allowedSet.size > 0 && !allowedSet.has(campo)) return;
        if (!fields[campo]) fields[campo] = {};
        fields[campo][fecha] = (fields[campo][fecha] || 0) + (Number(item.Cantidad) || 0);
    });

    return fields;
}

function getChartColorByIndex(index) {
    const palette = [
        '#1E40AF', '#059669', '#D97706', '#7C3AED',
        '#0EA5E9', '#EF4444', '#0891B2', '#9333EA',
        '#65A30D', '#F59E0B', '#2563EB', '#DB2777'
    ];
    return palette[index % palette.length];
}

function formatNumberAR(n) {
    return Number(n || 0).toLocaleString('es-AR');
}

// Plugin: dibuja un badge con el valor exacto en el último punto visible de cada serie.
const lastValueBadgePlugin = {
    id: 'lastValueBadge',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden || !meta.data || meta.data.length === 0) return;

            let lastIdx = -1;
            for (let i = dataset.data.length - 1; i >= 0; i--) {
                if (dataset.data[i] != null) { lastIdx = i; break; }
            }
            if (lastIdx < 0) return;

            const point = meta.data[lastIdx];
            if (!point) return;
            const value = dataset.data[lastIdx];
            const text = formatNumberAR(value);

            ctx.save();
            ctx.font = '600 11px "Fira Sans", system-ui, sans-serif';
            const padX = 8;
            const padY = 4;
            const textWidth = ctx.measureText(text).width;
            const boxW = textWidth + padX * 2;
            const boxH = 20;
            const x = point.x + 10;
            const y = point.y - boxH / 2;

            const fill = dataset.borderColor;
            ctx.fillStyle = fill;
            const r = 4;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + boxW - r, y);
            ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
            ctx.lineTo(x + boxW, y + boxH - r);
            ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
            ctx.lineTo(x + r, y + boxH);
            ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, x + padX, y + boxH / 2 + 0.5);
            ctx.restore();
        });
    }
};

function initChart() {
    const ctx = document.getElementById('stock-chart').getContext('2d');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Total (mismo periodo)',
                    data: [],
                    borderColor: '#94A3B8',
                    backgroundColor: 'rgba(148, 163, 184, 0.10)',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#94A3B8',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                },
                {
                    label: 'Con filtros (selección)',
                    data: [],
                    borderColor: '#1E40AF',
                    backgroundColor: 'rgba(30, 64, 175, 0.08)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#1E40AF',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 90, top: 16, bottom: 4, left: 4 } },
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: {
                    display: false,
                    position: 'bottom',
                    labels: {
                        boxWidth: 14,
                        padding: 12,
                        font: { size: 11, family: 'Fira Sans' },
                        color: '#475569',
                    },
                },
                tooltip: {
                    backgroundColor: '#0F172A',
                    borderColor: 'rgba(245, 158, 11, 0.35)',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 4,
                    titleColor: '#F8FAFC',
                    bodyColor: '#F1F5F9',
                    footerColor: '#FCD34D',
                    titleFont: {
                        size: 12,
                        family: 'Fira Code',
                        weight: '600'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Fira Sans'
                    },
                    footerFont: {
                        size: 11,
                        family: 'Fira Sans',
                        weight: '600'
                    },
                    filter: (item) => item.parsed && item.parsed.y != null,
                    callbacks: {
                        title: function (items) {
                            if (!items || items.length === 0) return '';
                            const idx = items[0].dataIndex;
                            const isoDates = chartInstance && chartInstance._isoDates;
                            const iso = isoDates ? isoDates[idx] : null;
                            if (iso) {
                                const p = iso.split('-');
                                if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
                            }
                            return items[0].label || '';
                        },
                        label: function (context) {
                            if (context.parsed.y == null) return '';
                            const name = context.dataset.label || 'Stock';
                            return `${name}: ${formatNumberAR(context.parsed.y)} animales`;
                        },
                        footer: function (items) {
                            if (!chartInstance || chartInstance._tooltipMode !== 'dual') return '';
                            if (!items || items.length < 2) return '';
                            const byLabel = {};
                            items.forEach(it => { byLabel[it.datasetIndex] = it.parsed.y; });
                            const total = byLabel[0];
                            const sel = byLabel[1];
                            if (total == null || sel == null || total <= 0) return '';
                            const pct = (sel / total) * 100;
                            const diff = total - sel;
                            return `Selección = ${pct.toFixed(1)}% del total · Resto = ${formatNumberAR(diff)}`;
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
                        padding: 8,
                        font: {
                            size: 11,
                            family: 'Fira Sans'
                        },
                        callback: function (value) {
                            return formatNumberAR(value);
                        }
                    },
                    title: {
                        display: true,
                        text: 'Animales',
                        color: '#64748B',
                        font: { size: 11, family: 'Fira Sans', weight: '600' }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10,
                        color: '#475569',
                        font: {
                            size: 11,
                            family: 'Fira Sans'
                        }
                    }
                }
            }
        },
        plugins: [lastValueBadgePlugin]
    });
}

/**
 * @param {object[]} data Filas filtradas (actuales).
 * @param {object[]|null} comparisonData Mismo rango de fechas sin Campo/Rodeo/Supra/Categoría; null si no aplica o sin filtros de entidad.
 */
function updateChart(data, comparisonData = null) {
    if (!chartInstance) return;

    if (!data || data.length === 0) {
        chartInstance._tooltipMode = 'single';
        chartInstance._isoDates = [];
        chartInstance.data.labels = [];
        chartInstance.data.datasets = [];
        chartInstance.options.plugins.legend.display = false;
        chartInstance.update();
        renderChartSummary(null, null);
        return;
    }

    const tFiltered = buildDailyStockTotalsByFecha(data);
    const filters = getCurrentFilterValues();
    const hasMultiCampo = filters.campoValues.length > 1;
    const dual = !!(comparisonData && comparisonData.length && hasEntityFilterSelection(filters));
    const tBase = dual ? buildDailyStockTotalsByFecha(comparisonData) : tFiltered;

    const fmtShort = (iso) => {
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
    };

    if (hasMultiCampo) {
        chartInstance._tooltipMode = 'multi';
        const campoSeries = buildDailyStockByFechaAndCampo(data, filters.campoValues);
        const allFechas = [...new Set(Object.values(campoSeries).flatMap(series => Object.keys(series)))].sort();

        chartInstance._isoDates = allFechas;
        chartInstance.data.labels = allFechas.map(fmtShort);
        chartInstance.data.datasets = Object.keys(campoSeries).sort().map((campo, idx) => {
            const color = getChartColorByIndex(idx);
            return {
                label: campo,
                data: allFechas.map(fecha => (fecha in campoSeries[campo] ? campoSeries[campo][fecha] : null)),
                borderColor: color,
                backgroundColor: `${color}1A`,
                borderWidth: 2.5,
                fill: false,
                tension: 0.35,
                pointRadius: 2.5,
                pointHoverRadius: 6,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            };
        });

        chartInstance.options.plugins.legend.display = true;
        chartInstance.update();
        renderChartSummary(null, null);
        return;
    } else if (dual) {
        chartInstance._tooltipMode = 'dual';
        chartInstance.data.datasets = [
            {
                label: 'Total (mismo periodo)',
                data: [],
                borderColor: '#94A3B8',
                backgroundColor: 'rgba(148, 163, 184, 0.10)',
                borderWidth: 2,
                borderDash: [6, 6],
                fill: true,
                tension: 0.35,
                pointRadius: 2.5,
                pointHoverRadius: 6,
                pointBackgroundColor: '#94A3B8',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
            {
                label: 'Con filtros (selección)',
                data: [],
                borderColor: '#1E40AF',
                backgroundColor: 'rgba(30, 64, 175, 0.08)',
                borderWidth: 3,
                fill: false,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBackgroundColor: '#1E40AF',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            }
        ];
        const allFechas = [...new Set([...Object.keys(tBase), ...Object.keys(tFiltered)])].sort();
        const sBase = allFechas.map(f => (f in tBase ? tBase[f] : null));
        const sFil = allFechas.map(f => (f in tFiltered ? tFiltered[f] : null));

        chartInstance._isoDates = allFechas;
        chartInstance.data.labels = allFechas.map(fmtShort);

        const ds0 = chartInstance.data.datasets[0];
        ds0.data = sBase;
        ds0.label = 'Total (mismo periodo)';
        ds0.borderColor = '#94A3B8';
        ds0.backgroundColor = 'rgba(148, 163, 184, 0.10)';
        ds0.borderDash = [6, 6];
        ds0.borderWidth = 2;
        ds0.fill = true;
        ds0.pointBackgroundColor = '#94A3B8';

        const ds1 = chartInstance.data.datasets[1];
        ds1.data = sFil;
        ds1.label = 'Con filtros (selección)';
        ds1.borderColor = '#1E40AF';
        ds1.backgroundColor = 'rgba(30, 64, 175, 0.08)';
        ds1.borderDash = [];
        ds1.borderWidth = 3;
        ds1.fill = false;
        ds1.pointBackgroundColor = '#1E40AF';

        chartInstance.setDatasetVisibility(0, true);
        chartInstance.setDatasetVisibility(1, true);
        chartInstance.options.plugins.legend.display = false;
        renderChartSummary(sBase, sFil, allFechas);
    } else {
        chartInstance._tooltipMode = 'single';
        chartInstance.data.datasets = [
            {
                label: 'Evolución de stock',
                data: [],
                borderColor: '#1E40AF',
                backgroundColor: 'rgba(30, 64, 175, 0.08)',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBackgroundColor: '#1E40AF',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
            {
                label: '',
                data: []
            }
        ];
        const sortedDates = Object.keys(tFiltered).sort();
        const quantities = sortedDates.map(date => tFiltered[date]);

        chartInstance._isoDates = sortedDates;
        chartInstance.data.labels = sortedDates.map(fmtShort);

        const ds0 = chartInstance.data.datasets[0];
        ds0.data = quantities;
        ds0.label = 'Evolución de stock';
        ds0.borderColor = '#1E40AF';
        ds0.backgroundColor = 'rgba(30, 64, 175, 0.08)';
        ds0.borderDash = [];
        ds0.borderWidth = 3;
        ds0.fill = true;
        ds0.pointBackgroundColor = '#1E40AF';

        chartInstance.data.datasets[1].data = [];
        chartInstance.setDatasetVisibility(0, true);
        chartInstance.setDatasetVisibility(1, false);
        chartInstance.options.plugins.legend.display = false;
        renderChartSummary(null, quantities, sortedDates);
    }

    chartInstance.update();
}

function renderChartSummary(baseSeries, selSeries, isoDates) {
    const el = document.getElementById('chart-summary');
    if (!el) return;

    if (!selSeries || selSeries.length === 0) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }

    let lastIdx = -1;
    for (let i = selSeries.length - 1; i >= 0; i--) {
        if (selSeries[i] != null) { lastIdx = i; break; }
    }
    if (lastIdx < 0) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }

    const lastSel = selSeries[lastIdx] || 0;
    const lastBase = baseSeries ? (baseSeries[lastIdx] || 0) : null;
    const isoLast = isoDates ? isoDates[lastIdx] : null;
    const dateLabel = isoLast
        ? (() => { const p = isoLast.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : isoLast; })()
        : '';

    let firstSelIdx = -1;
    for (let i = 0; i < selSeries.length; i++) {
        if (selSeries[i] != null) { firstSelIdx = i; break; }
    }
    let trendHtml = '';
    if (firstSelIdx >= 0 && firstSelIdx !== lastIdx) {
        const first = selSeries[firstSelIdx] || 0;
        const delta = lastSel - first;
        const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
        const trendClass = delta > 0 ? 'is-up' : (delta < 0 ? 'is-down' : 'is-flat');
        const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '■');
        const pct = first > 0 ? Math.abs((delta / first) * 100) : 0;
        trendHtml = `
            <span class="chart-summary__trend ${trendClass}">
                <span aria-hidden="true">${arrow}</span>
                ${sign}${formatNumberAR(Math.abs(delta))} (${pct.toFixed(1)}%) vs inicio
            </span>
        `;
    }

    if (lastBase == null) {
        el.innerHTML = `
            <div class="chart-summary__metrics">
                <div class="chart-summary__metric">
                    <div class="chart-summary__label">Stock al ${dateLabel}</div>
                    <div class="chart-summary__value">${formatNumberAR(lastSel)} <span class="chart-summary__unit">animales</span></div>
                    ${trendHtml}
                </div>
            </div>
        `;
        el.style.display = 'block';
        return;
    }

    const pct = lastBase > 0 ? (lastSel / lastBase) * 100 : 0;
    const rest = Math.max(lastBase - lastSel, 0);

    el.innerHTML = `
        <div class="chart-summary__metrics">
            <div class="chart-summary__metric chart-summary__metric--filtered">
                <div class="chart-summary__label"><span class="chart-summary__dot"></span>Selección al ${dateLabel}</div>
                <div class="chart-summary__value">${formatNumberAR(lastSel)} <span class="chart-summary__unit">animales</span></div>
                ${trendHtml}
            </div>
            <div class="chart-summary__divider" aria-hidden="true"></div>
            <div class="chart-summary__metric chart-summary__metric--total">
                <div class="chart-summary__label"><span class="chart-summary__dot"></span>Total del periodo</div>
                <div class="chart-summary__value">${formatNumberAR(lastBase)} <span class="chart-summary__unit">animales</span></div>
                <div class="chart-summary__sub">resto: ${formatNumberAR(rest)} animales</div>
            </div>
            <div class="chart-summary__divider" aria-hidden="true"></div>
            <div class="chart-summary__metric chart-summary__metric--share">
                <div class="chart-summary__label">Participación</div>
                <div class="chart-summary__value">${pct.toFixed(1)}<span class="chart-summary__unit">%</span></div>
                <div class="chart-summary__bar" role="img" aria-label="${pct.toFixed(1)}% de la selección sobre el total">
                    <span class="chart-summary__bar-fill" style="width:${Math.min(pct, 100)}%"></span>
                </div>
            </div>
        </div>
    `;
    el.style.display = 'block';
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

    // Sort by Date descending (most recent first), then Campo, then Rodeo
    const sortedData = [...data].sort((a, b) => {
        if (a.Fecha !== b.Fecha) return (b.Fecha || '').localeCompare(a.Fecha || '');
        if (a.Campo !== b.Campo) return (a.Campo || '').localeCompare(b.Campo || '');
        return (a.Rodeo || '').localeCompare(b.Rodeo || '');
    });

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

// Columnas vacias siempre ocultas
const hideEmptyCategories = true;

// Global variables for PDF export
let windowMatrixData = null;
let windowVisibleStructure = null;
let windowInitialStructure = null;

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
    const filterSupraValues = getSelectedValues('filter-supracategoria');
    const filterCatValues = getSelectedValues('filter-categoria');

    // 1. Identify initial columns (respecting filters, before empty-column hiding)
    let initialStructure = {};
    Object.keys(MATRIX_STRUCTURE).forEach(supra => {
        if (filterSupraValues.length === 0 || filterSupraValues.includes(supra)) {
            const cats = MATRIX_STRUCTURE[supra].filter(c => filterCatValues.length === 0 || filterCatValues.includes(c));
            if (cats.length > 0) {
                initialStructure[supra] = cats;
            }
        }
    });

    const ALL_INITIAL_CATS = Object.values(initialStructure).flat();

    // 2. Find Latest Snapshot Date
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

    // Store snapshot date globally for PDF export
    window.matrixSnapshotDate = maxDateStr;

    // 3. Transform Data to Matrix (using ALL initial categories)
    const matrix = {};
    const generalTotals = { Total: 0 };
    ALL_INITIAL_CATS.forEach(c => generalTotals[c] = 0);

    latestData.forEach(row => {
        const campo = (row.Campo || 'Sin Campo').trim();
        const rodeo = (row.Rodeo || 'Sin Rodeo').trim();
        const cat = (row.Categoria || '').trim();
        const cant = Number(row.Cantidad) || 0;

        if (!matrix[campo]) {
            matrix[campo] = { totalCampo: 0, rodeos: {}, campoTotals: {} };
            ALL_INITIAL_CATS.forEach(c => matrix[campo].campoTotals[c] = 0);
        }
        if (!matrix[campo].rodeos[rodeo]) {
            matrix[campo].rodeos[rodeo] = { Total: 0 };
            ALL_INITIAL_CATS.forEach(c => matrix[campo].rodeos[rodeo][c] = 0);
        }

        // Match category ignoring case
        const matchedColumn = ALL_INITIAL_CATS.find(c => c.toLowerCase() === cat.toLowerCase());

        if (matchedColumn) {
            matrix[campo].rodeos[rodeo][matchedColumn] += cant;
            matrix[campo].campoTotals[matchedColumn] += cant;
            generalTotals[matchedColumn] += cant;

            const isExcluded = CATS_EXCLUDED_FROM_SUPRA_TOTAL.some(c => c.toLowerCase() === matchedColumn.toLowerCase());
            if (!isExcluded) {
                matrix[campo].rodeos[rodeo].Total += cant;
                matrix[campo].totalCampo += cant;
                generalTotals.Total += cant;
            }
        }
    });

    // 4. Apply empty-column hiding if toggle is enabled
    let visibleStructure = {};
    Object.keys(initialStructure).forEach(supra => {
        let cats;
        if (hideEmptyCategories) {
            cats = initialStructure[supra].filter(cat => generalTotals[cat] > 0);
        } else {
            cats = [...initialStructure[supra]];
        }
        if (cats.length > 0) {
            visibleStructure[supra] = cats;
        }
    });

    const ALL_VISIBLE_CATS = Object.values(visibleStructure).flat();
    const firstCatInSupra = new Set();
    Object.keys(visibleStructure).forEach(supra => {
        const cats = visibleStructure[supra];
        if (cats.length) firstCatInSupra.add(cats[0]);
    });

    // 5. Calculate supra subtotals (excluye cats sin suma en supra)
    const supraSubtotals = {};
    Object.keys(visibleStructure).forEach(supra => {
        supraSubtotals[supra] = (initialStructure[supra] || []).reduce(
            (sum, cat) => CATS_EXCLUDED_FROM_SUPRA_TOTAL.includes(cat) ? sum : sum + (generalTotals[cat] || 0), 0
        );
    });

    // 6. Build Dynamic THEAD with supra subtotals (sin rowspan="2" para evitar bugs de Safari Mobile con position: sticky)
    let theadHtml = `
        <tr class="header-supra">
            <th class="col-sticky col-campo">Campo</th>
            <th class="col-sticky col-rodeo">Rodeo</th>
            <th class="col-sticky col-totales" style="z-index: 50;">TOTALES</th>
            ${Object.keys(visibleStructure).map(supra => `
                <th colspan="${visibleStructure[supra].length}" class="group-${supra.toLowerCase()} col-supra-boundary">${supra}<br><span class="supra-subtotal">${supraSubtotals[supra].toLocaleString('es-AR')}</span></th>
            `).join('')}
        </tr>
        <tr class="header-cat">
            <th class="col-sticky col-campo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-rodeo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-totales header-filler" style="border-top: none; z-index: 49;"></th>
            ${Object.keys(visibleStructure).flatMap(supra =>
        visibleStructure[supra].map((cat, idx) =>
            `<th class="sub-cat group-${supra.toLowerCase()}${idx === 0 ? ' col-supra-boundary' : ''}">${cat}</th>`
        )
    ).join('')}
        </tr>
    `;

    // Replace actual thead content
    let existingThead = matrixTable.querySelector('thead');
    if (existingThead) existingThead.innerHTML = theadHtml;

    // Header Totals Injection (redundante tras el cambio, pero lo dejamos seguro)
    const totalsHeader = document.querySelector('.header-supra .col-totales');
    if (totalsHeader) totalsHeader.innerHTML = `TOTALES`;

    // 7. Build Dynamic TBODY
    let html = '';

    // Row: General
    html += `<tr class="row-total-general">`;
    html += `<th colspan="2" class="col-sticky col-campo" style="text-align: right; padding-right: 12px;">General</th>`;
    html += `<td class="col-totales">${generalTotals.Total.toLocaleString('es-AR')}</td>`;
    ALL_VISIBLE_CATS.forEach(col => {
        const val = generalTotals[col];
        const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
        html += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
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
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                html += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
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
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                html += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
            });
            html += `</tr>`;
        }
    });

    tbody.innerHTML = html;

    // Store data globally for PDF export
    windowMatrixData = { matrix, generalTotals };
    windowVisibleStructure = visibleStructure;
    windowInitialStructure = initialStructure;
}

// ===== PDF EXPORT =====
function exportMatrixToPDF() {
    if (!windowMatrixData || !windowMatrixData.matrix || !windowVisibleStructure) {
        alert('No hay datos en la tabla para exportar.');
        return;
    }

    const { matrix, generalTotals } = windowMatrixData;
    const visibleStructure = windowVisibleStructure;

    // Calculate supra subtotals (excluye cats sin suma en supra)
    const supraSubtotals = {};
    Object.keys(visibleStructure).forEach(supra => {
        supraSubtotals[supra] = (windowInitialStructure[supra] || []).reduce(
            (sum, cat) => CATS_EXCLUDED_FROM_SUPRA_TOTAL.includes(cat) ? sum : sum + (generalTotals[cat] || 0), 0
        );
    });

    // Snapshot date
    const snapshotDate = window.matrixSnapshotDate;
    let fechaTabla = 'Sin datos';
    if (snapshotDate) {
        const parts = snapshotDate.split('-');
        if (parts.length === 3) fechaTabla = parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    // Fecha de impresión
    let fechaImpresion = fechaTabla;
    if (activeDateMode === 'single') {
        const v = document.getElementById('filter-date-single').value;
        if (v) { const p = v.split('-'); fechaImpresion = p[2] + '/' + p[1] + '/' + p[0]; }
    } else if (activeDateMode === 'range') {
        const f = document.getElementById('filter-date-from').value;
        const t = document.getElementById('filter-date-to').value;
        if (f && t) {
            const pf = f.split('-'); const pt = t.split('-');
            fechaImpresion = pf[2] + '/' + pf[1] + '/' + pf[0] + ' - ' + pt[2] + '/' + pt[1] + '/' + pt[0];
        }
    }

    // Active filters summary
    const filterCampo = getSelectedValues('filter-campo');
    const filterRodeo = getSelectedValues('filter-rodeo');
    const filterSupra = getSelectedValues('filter-supracategoria');
    const filterCateg = getSelectedValues('filter-categoria');
    const filtrosActivos = [];
    if (filterCampo.length) filtrosActivos.push('Campo: ' + filterCampo.join(' | '));
    if (filterRodeo.length) filtrosActivos.push('Rodeo: ' + filterRodeo.join(' | '));
    if (filterSupra.length) filtrosActivos.push('Supra: ' + filterSupra.join(' | '));
    if (filterCateg.length) filtrosActivos.push('Cat: ' + filterCateg.join(' | '));

    // Button loading state
    const pdfBtn = document.getElementById('btn-export-matrix-pdf');
    const originalBtnHtml = pdfBtn ? pdfBtn.innerHTML : '';
    if (pdfBtn) {
        pdfBtn.disabled = true;
        pdfBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generando...';
    }

    try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 3;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        // 1. Filtrar solo categorías con datos
        const activeCatsStructure = {};
        Object.keys(visibleStructure).forEach(supra => {
            const activeCats = visibleStructure[supra].filter(cat => (generalTotals[cat] || 0) > 0);
            if (activeCats.length > 0) activeCatsStructure[supra] = activeCats;
        });
        const ALL_ACTIVE_CATS = Object.values(activeCatsStructure).flat();
        const suprasWithData = Object.keys(activeCatsStructure);
        const numCatCols = ALL_ACTIVE_CATS.length;

        // 2. Sin encabezado: la tabla arranca desde el borde superior.
        const tableStartY = margin;

        // 3. Colores
        const C_SUPRA_BG = [169, 209, 142];
        const C_SUPRA_TXT = [26, 66, 20];
        const C_CAT_BG = [226, 240, 217];
        const C_TOT_BG = [255, 242, 204];
        const C_GEN_BG = [242, 154, 89];
        const C_GEN_TXT = [0, 0, 0];
        const C_CAMPO_BG = [252, 228, 214];
        const C_STICK_BG = [248, 250, 252];
        const C_WHITE = [255, 255, 255];
        const C_DARK = [30, 41, 59];

        // 4. BODY (lo construimos antes para conocer el contenido real y dimensionar columnas)
        const body = [];

        // Fila GENERAL
        const generalRow = [
            { content: 'GENERAL', styles: { fontStyle: 'bold', fillColor: C_GEN_BG, textColor: C_GEN_TXT, halign: 'left' } },
            { content: '', styles: { fontStyle: 'bold', fillColor: C_GEN_BG, textColor: C_GEN_TXT } },
            { content: generalTotals.Total.toLocaleString('es-AR'), styles: { fontStyle: 'bold', fillColor: C_GEN_BG, textColor: C_GEN_TXT, halign: 'center' } }
        ];
        ALL_ACTIVE_CATS.forEach(cat => {
            const v = generalTotals[cat] || 0;
            generalRow.push({ content: v > 0 ? v.toLocaleString('es-AR') : '', styles: { fontStyle: 'bold', fillColor: C_GEN_BG, textColor: C_GEN_TXT, halign: 'center' } });
        });
        body.push(generalRow);

        const sortedCampos = Object.keys(matrix).sort();
        sortedCampos.forEach(campoName => {
            const campoData = matrix[campoName];
            const sortedRodeos = Object.keys(campoData.rodeos).sort();
            let firstRodeo = true;

            sortedRodeos.forEach(rodeoName => {
                const rd = campoData.rodeos[rodeoName];
                const row = [
                    { content: firstRodeo ? campoName : '', styles: { fontStyle: firstRodeo ? 'bold' : 'normal', halign: 'left', fillColor: C_WHITE } },
                    { content: rodeoName, styles: { halign: 'left', fillColor: C_WHITE } },
                    { content: rd.Total > 0 ? rd.Total.toLocaleString('es-AR') : '', styles: { fontStyle: 'bold', fillColor: C_TOT_BG, halign: 'center' } }
                ];
                ALL_ACTIVE_CATS.forEach(cat => {
                    const v = rd[cat] || 0;
                    row.push({ content: v > 0 ? v.toLocaleString('es-AR') : '', styles: { halign: 'center', fillColor: C_WHITE } });
                });
                body.push(row);
                firstRodeo = false;
            });

            // Total campo
            const ctRow = [
                { content: '', styles: { fontStyle: 'bold', fillColor: C_CAMPO_BG, textColor: C_DARK } },
                { content: 'Total', styles: { fontStyle: 'bold', halign: 'right', fillColor: C_CAMPO_BG, textColor: C_DARK } },
                { content: campoData.totalCampo > 0 ? campoData.totalCampo.toLocaleString('es-AR') : '', styles: { fontStyle: 'bold', fillColor: C_CAMPO_BG, textColor: C_DARK, halign: 'center' } }
            ];
            ALL_ACTIVE_CATS.forEach(cat => {
                const v = campoData.campoTotals[cat] || 0;
                ctRow.push({ content: v > 0 ? v.toLocaleString('es-AR') : '', styles: { fontStyle: 'bold', fillColor: C_CAMPO_BG, textColor: C_DARK, halign: 'center' } });
            });
            body.push(ctRow);
        });

        // 5. Layout óptimo: anchos dinámicos + fontSize máximo que entre en una hoja.
        // ---------------------------------------------------------------------------
        // Medimos el contenido más largo de Campo y Rodeo para dimensionar esas columnas
        // y EVITAR que el texto se corte en 2 líneas (cada salto duplica la altura de fila).
        const allRodeos = sortedCampos.flatMap(c => Object.keys(matrix[c].rodeos));
        const longestCampoChars = Math.max(7, ...sortedCampos.map(s => s.length)); // 'GENERAL' (7 chars)
        const longestRodeoChars = Math.max(5, ...allRodeos.map(s => s.length));
        // El número más grande del cuerpo (TOT y categorías) determina el ancho mínimo numérico.
        let longestNumChars = 4; // mínimo 4 chars
        body.forEach(row => row.forEach((cell, idx) => {
            if (idx >= 2 && cell && typeof cell.content === 'string') {
                longestNumChars = Math.max(longestNumChars, cell.content.length);
            }
        }));

        const PAD_V = 0.5;
        const PAD_H = 1.2;
        const LINE_F = 0.65;          // mm por pt (incluye interlineado real de jsPDF/helvetica)
        const CHAR_W = 0.19;          // mm por pt por carácter (helvetica, conservador)
        const SAFETY = 1.5;           // colchón para evitar saltar a una 2ª página por redondeos
        const usableHeight = availableHeight - SAFETY;

        // Buscamos el fontSize más grande (1..14 pt para el header) que cumpla:
        //  a) Campo y Rodeo entran sin envolver
        //  b) las columnas de categoría tienen ancho razonable para los números
        //  c) la altura total ≤ una hoja A4
        let fontSize = 5;
        let campoColW = 22, rodeoColW = 22, totColW = 13;
        for (let f = 14; f >= 5; f -= 0.5) {
            const charMmBody = (f + 1) * CHAR_W; // body usa fontSize + 1
            const cW = Math.min(34, Math.max(18, longestCampoChars * charMmBody + 2 * PAD_H + 0.6));
            const rW = Math.min(42, Math.max(20, longestRodeoChars * charMmBody + 2 * PAD_H + 0.6));
            const tW = Math.max(11, Math.min(16, longestNumChars * charMmBody + 2 * PAD_H + 0.6));
            const remaining = availableWidth - cW - rW - tW;
            const ccW = remaining / Math.max(numCatCols, 1);
            // Verifica que los números más grandes entren sin saltos en categorías.
            const numFitsCat = ccW >= longestNumChars * charMmBody + 2 * PAD_H - 0.4;
            if (!numFitsCat) continue;
            // Verifica que la altura total entre en una sola hoja A4.
            const trialBodyH = 2 * PAD_V + (f + 1) * LINE_F;
            const trialHeadH = 2 * PAD_V + f * LINE_F;
            const totalH = 2 * trialHeadH + body.length * trialBodyH;
            if (totalH <= usableHeight) {
                fontSize = f;
                campoColW = cW; rodeoColW = rW; totColW = tW;
                break;
            }
        }

        // 6. HEAD de 2 niveles (anchos calculados arriba).
        const headRow1 = [
            { content: 'Campo', rowSpan: 2, styles: { fillColor: C_STICK_BG, fontStyle: 'bold', halign: 'left', cellWidth: campoColW, textColor: C_DARK } },
            { content: 'Rodeo', rowSpan: 2, styles: { fillColor: C_STICK_BG, fontStyle: 'bold', halign: 'left', cellWidth: rodeoColW, textColor: C_DARK } },
            { content: 'TOT.', rowSpan: 2, styles: { fillColor: C_TOT_BG, fontStyle: 'bold', halign: 'center', cellWidth: totColW, textColor: C_DARK } }
        ];
        suprasWithData.forEach(supra => {
            const cats = activeCatsStructure[supra];
            const sub = supraSubtotals[supra] || 0;
            headRow1.push({
                content: supra + '  (' + sub.toLocaleString('es-AR') + ')',
                colSpan: cats.length,
                styles: { fillColor: C_SUPRA_BG, textColor: C_SUPRA_TXT, fontStyle: 'bold', halign: 'center', overflow: 'linebreak' }
            });
        });

        const headRow2 = [];
        suprasWithData.forEach(supra => {
            activeCatsStructure[supra].forEach(cat => {
                headRow2.push({
                    content: cat,
                    styles: { fillColor: C_CAT_BG, textColor: [0, 0, 0], fontStyle: 'normal', halign: 'center' }
                });
            });
        });

        // 7. Altura uniforme del body. Distribuimos parte del sobrante para que la tabla
        // llene la hoja con muchas filas, pero limitamos fuertemente el crecimiento para
        // que con pocas filas (filtros) NO se desborde a una segunda página.
        const bodyRowH = 2 * PAD_V + (fontSize + 1) * LINE_F;
        const headerRowH = 2 * PAD_V + fontSize * LINE_F;
        const bodyRowsCount = Math.max(body.length, 1);

        // Reserva generosa para la cabecera (rowspan, saltos de línea en títulos de supra,
        // bordes). Si el header rendizado fuera más alto que el estimado, este colchón evita
        // que las filas inflen y desplacen la última a la página 2.
        const HEADER_RESERVE = 4 * headerRowH + 10;
        // Cap absoluto: una fila del body no puede crecer más que ~3x la altura natural;
        // así, con pocas filas, sobra espacio en blanco al final pero todo cabe en una hoja.
        const MAX_BODY_GROWTH = 3;

        const slack = Math.max(0, usableHeight - 2 * headerRowH - bodyRowsCount * bodyRowH);
        const bodyMinHByPage = Math.max(bodyRowH, (usableHeight - HEADER_RESERVE) / bodyRowsCount);
        const bodyMinHByCap = bodyRowH * MAX_BODY_GROWTH;
        const bodyMinH = Math.min(bodyRowH + slack / bodyRowsCount, bodyMinHByPage, bodyMinHByCap);

        // Índices de columna (0=Campo, 1=Rodeo, 2=TOT.) donde empieza cada supracategoría — borde izquierdo más grueso en el PDF
        const supraLeftBorderCols = [];
        let catCol = 3;
        suprasWithData.forEach(supra => {
            supraLeftBorderCols.push(catCol);
            catCol += activeCatsStructure[supra].length;
        });
        autoTable(doc, {
            head: [headRow1, headRow2],
            body: body,
            startY: tableStartY,
            theme: 'grid',
            styles: {
                fontSize: fontSize,
                cellPadding: { top: PAD_V, right: PAD_H, bottom: PAD_V, left: PAD_H },
                valign: 'middle',
                textColor: C_DARK,
                lineColor: [203, 213, 225],
                lineWidth: 0.2,
                overflow: 'linebreak'
            },
            bodyStyles: {
                minCellHeight: bodyMinH
            },
            headStyles: {
                fontSize: fontSize,
                fillColor: C_SUPRA_BG,
                textColor: C_SUPRA_TXT,
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
                minCellHeight: headerRowH
            },
            columnStyles: {
                0: { cellWidth: campoColW, halign: 'left' },
                1: { cellWidth: rodeoColW, halign: 'left' },
                2: { cellWidth: totColW, halign: 'center', fontStyle: 'bold', fillColor: C_TOT_BG }
            },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
            tableWidth: 'auto',
            rowPageBreak: 'avoid',
            didParseCell: function (hookData) {
                if (hookData.section === 'body' && hookData.column.index >= 2) {
                    hookData.cell.styles.fontSize = fontSize + 1;
                }
                if (hookData.section === 'head' && hookData.row.index === 1) {
                    hookData.cell.styles.textColor = [0, 0, 0];
                }
                if (hookData.section === 'head') {
                    hookData.cell.styles.minCellHeight = headerRowH;
                }
            },
            didDrawCell: function (hookData) {
                const sec = hookData.section;
                if ((sec === 'head' || sec === 'body') && supraLeftBorderCols.includes(hookData.column.index)) {
                    const doc = hookData.doc;
                    const cell = hookData.cell;
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.55);
                    doc.line(cell.x, cell.y, cell.x, cell.y + cell.height);
                    doc.setDrawColor(203, 213, 225);
                    doc.setLineWidth(0.2);
                }
            }
        });

        // Generate the PDF as an array buffer first
        const pdfArrayBuffer = doc.output('arraybuffer');

        // Create a blob with a generic binary MIME type to force download on iOS/Safari
        const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/octet-stream' });
        const pdfUrl = URL.createObjectURL(pdfBlob);

        const downloadLink = document.createElement('a');
        const fileName = 'Stock_' + (snapshotDate || 'export') + '.pdf';

        downloadLink.href = pdfUrl;
        downloadLink.download = fileName;

        // Append to body, click, and cleanup
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Free up memory
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);

    } catch (err) {
        console.error('Error generating PDF:', err);
        alert('Error al generar el PDF. Intente nuevamente.');
    } finally {
        if (pdfBtn) {
            pdfBtn.disabled = false;
            pdfBtn.innerHTML = originalBtnHtml;
        }
    }
}

function initExportMatrixPDFButton() {
    const btn = document.getElementById('btn-export-matrix-pdf');
    if (!btn) return;
    btn.addEventListener('click', exportMatrixToPDF);
}

// ===== DASHBOARD INITIALIZATION =====
function updateDashboard(data, chartComparisonData) {
    // Store data globally for CSV export
    window.currentFilteredData = data;

    const kpis = calculateKPIs(data);
    updateKPICards(kpis);
    updateChart(data, chartComparisonData);
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
    initExportMatrixPDFButton();
    initFullscreenMatrixButton();

    // Initialize chart if not exists
    if (!chartInstance) {
        initChart();
    }

    // Wire multi-filter dropdowns BEFORE loading options so triggers/state exist
    setupMultiFilters();

    // Populate filters from Supabase
    await initializeFilters();
    syncAllMultiFilterUi();

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
    // Los filtros multi-select (Campo/Rodeo/Supra/Categoría) ya quedaron cableados en setupMultiFilters().
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

    // Setup KPI card clicks
    setupCardClicks();

    // Setup Side Panel listeners
    setupPanelListeners();
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Login: manejado por React (src/components/Login.jsx)

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Sesión inicial: src/App.jsx llama notifyAuthSession tras getSession()
});
