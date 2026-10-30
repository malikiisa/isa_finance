/**
 * Konfigurasi API
 * Pastikan URL ini diganti dengan URL Web App dari Google Apps Script yang sudah dideploy.
 */
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbzvnAzK7AgoZdMn4_Q5OoYlfXs54F6HvZV_a_eEAPTLfadf69liiAgWydKEzivQNkyfGw/exec";

// Global State
let state = {
    wallets: [],
    categories: [],
    transactions: [],
    currentPeriod: 'month'
};

let cache = {
    transactions: null,
    wallets: null,
    categories: null,
    dashboard: {}
};
const CACHE_DURATION = 2 * 60 * 1000; // 2 menit

// ==========================================
// UTILS & HELPER
// ==========================================
function logout() {
    sessionStorage.removeItem("authenticated");
    window.location.href = "login.html";
}

function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        html.classList.add('dark');
        localStorage.theme = 'dark';
    }
}

function formatIDR(amount) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr, timeStr = null) {
    if (!dateStr) return '';
    let d = dateStr;
    let t = timeStr;
    if (typeof d === 'string' && d.includes('T')) {
        const parts = d.split('T');
        d = parts[0];
        if (!t && parts[1]) t = parts[1].slice(0, 5);
    }
    const [year, month, day] = d.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dateFormatted = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (t) {
        return `${dateFormatted}, ${t.slice(0, 5)}`;
    }
    return dateFormatted;
}

function getTxTimestamp(tx) {
    if (!tx) return 0;
    if (tx.dateTime) {
        const t = new Date(tx.dateTime).getTime();
        if (!isNaN(t)) return t;
    }
    if (tx.date) {
        const timePart = tx.time ? (tx.time.length === 5 ? `${tx.time}:00` : tx.time) : '00:00:00';
        const t = new Date(`${tx.date}T${timePart}`).getTime();
        if (!isNaN(t)) return t;
        return new Date(tx.date).getTime() || 0;
    }
    return 0;
}

let activeLoadingRequests = 0;
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    if (show) {
        activeLoadingRequests++;
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    } else {
        activeLoadingRequests = Math.max(0, activeLoadingRequests - 1);
        if (activeLoadingRequests === 0) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    }
}

function formatThousandInput(val) {
    if (val === undefined || val === null || val === '') return '';
    const num = String(val).replace(/\D/g, '');
    if (!num) return '';
    return new Intl.NumberFormat('id-ID').format(Number(num));
}

function setupCurrencyInputFormatter(inputId, previewId = null) {
    const el = document.getElementById(inputId);
    if (!el) return;
    const update = () => {
        const raw = el.value.replace(/\D/g, '');
        if (!raw) {
            el.value = '';
            if (previewId) {
                const prev = document.getElementById(previewId);
                if (prev) prev.textContent = '';
            }
            return;
        }
        const formatted = new Intl.NumberFormat('id-ID').format(Number(raw));
        el.value = formatted;
        if (previewId) {
            const prev = document.getElementById(previewId);
            if (prev) prev.textContent = `Rp ${formatted}`;
        }
    };
    el.addEventListener('input', update);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-3 rounded-xl shadow-xl text-sm font-medium text-white flex items-center gap-2 transform transition-all duration-300 translate-x-full opacity-0 pointer-events-auto`;
    toast.style.backgroundColor = type === 'success' ? '#006c49' : '#ba1a1a';
    toast.innerHTML = `<span class="material-symbols-outlined text-base">${type === 'success' ? 'check_circle' : 'error'}</span> ${message}`;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        setTimeout(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        }, 10);
    });

    // Animate out & remove
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function renderTxSkeleton(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl bg-surface-container-lowest dark:bg-slate-800 animate-pulse">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-outline/10"></div>
                <div>
                    <div class="w-24 h-4 bg-outline/10 rounded mb-2"></div>
                    <div class="w-32 h-3 bg-outline/10 rounded"></div>
                </div>
            </div>
            <div class="w-20 h-5 bg-outline/10 rounded"></div>
        </div>`).join('');
}

function renderWalletSkeleton(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="bg-surface-container-lowest dark:bg-slate-800 border border-outline/10 dark:border-slate-700 rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between animate-pulse">
            <div class="flex items-start justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-outline/10"></div>
                    <div>
                        <div class="w-24 h-4 bg-outline/10 rounded mb-2"></div>
                        <div class="w-12 h-3 bg-outline/10 rounded"></div>
                    </div>
                </div>
            </div>
            <div>
                <div class="w-20 h-3 bg-outline/10 rounded mb-2"></div>
                <div class="w-32 h-6 bg-outline/10 rounded"></div>
            </div>
        </div>`).join('');
}

function renderDashboardWalletSkeleton(count = 2) {
    return Array(count).fill(0).map(() => `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl animate-pulse">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-outline/10"></div>
                <div class="w-24 h-4 bg-outline/10 rounded"></div>
            </div>
            <div class="w-20 h-4 bg-outline/10 rounded"></div>
        </div>`).join('');
}

function renderCategorySkeleton(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl animate-pulse">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-outline/10"></div>
                <div class="w-24 h-4 bg-outline/10 rounded"></div>
            </div>
            <div class="w-16 h-4 bg-outline/10 rounded"></div>
        </div>`).join('');
}

// ==========================================
// API CLIENT
// ==========================================
async function apiGet(action, params = {}) {
    showLoading(true);
    try {
        const url = new URL(API_BASE_URL);
        url.searchParams.append('action', action);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        const response = await fetch(url);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error(`Error GET ${action}:`, error);
        showToast(`Gagal memuat data.`, 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

async function apiPost(data) {
    showLoading(true);
    try {
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success === true) {
            const msg = result.data && result.data.message ? result.data.message : (result.message || 'Berhasil disimpan');
            showToast(msg, 'success');
        } else {
            showToast(result.message || 'Terjadi kesalahan', 'error');
        }
        return result;
    } catch (error) {
        console.error('Error POST:', error);
        showToast(`Gagal menyimpan data.`, 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

// ==========================================
// NAVIGATION (SPA Logic)
// ==========================================
function navigateTo(pageId) {
    // Update active section
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Update active nav buttons
    document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => btn.classList.remove('active', 'bg-surface-container', 'dark:bg-slate-600', 'font-semibold', 'text-on-surface', 'dark:text-slate-100'));

    // Desktop Nav
    document.querySelectorAll(`.nav-btn[data-target="${pageId}"]`).forEach(btn => {
        btn.classList.add('active', 'bg-surface-container', 'dark:bg-slate-600', 'font-semibold', 'text-on-surface', 'dark:text-slate-100');
        btn.classList.remove('text-on-surface-variant', 'dark:text-slate-400');
    });

    // Mobile Nav
    document.querySelectorAll(`.mobile-nav-btn[data-target="${pageId}"]`).forEach(btn => {
        btn.classList.add('active', 'text-primary'); // Changed to primary for contrast
        btn.classList.remove('text-on-surface-variant', 'dark:text-slate-400');
    });

    // Update Mobile Title
    const titles = {
        'dashboard': 'Beranda',
        'transactions': 'Transaksi',
        'reports': 'Laporan',
        'wallets': 'Dompet',
        'categories': 'Kategori'
    };
    const titleEl = document.getElementById('mobile-page-title');
    if (titleEl) titleEl.textContent = titles[pageId] || 'FinTrack';

    // Refresh Data if needed
    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'transactions') loadTransactions();
    if (pageId === 'reports') loadReports();
    if (pageId === 'wallets') loadWallets();
    if (pageId === 'categories') loadCategories();

    // Scroll to top
    window.scrollTo(0, 0);
}

// Setup Listeners
document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        navigateTo(target);
    });
});

// ==========================================
// MAPPERS (Backend to Frontend)
// ==========================================
function mapTx(tx) {
    let dateStr = '';
    let timeStr = '';

    if (tx.dateTime) {
        const dtStr = String(tx.dateTime);
        if (dtStr.includes('T')) {
            const parts = dtStr.split('T');
            dateStr = parts[0];
            timeStr = (parts[1] || '').slice(0, 5);
        } else if (dtStr.includes(' ')) {
            const parts = dtStr.split(' ');
            dateStr = parts[0];
            timeStr = (parts[1] || '').slice(0, 5);
        } else {
            dateStr = dtStr;
        }
    } else if (tx.date) {
        dateStr = tx.date;
        timeStr = tx.time || '';
    }

    if (!timeStr && tx.time) timeStr = tx.time;

    return {
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount) || 0,
        date: dateStr,
        time: timeStr,
        dateTime: tx.dateTime || (dateStr ? `${dateStr}T${timeStr || '00:00'}:00` : ''),
        walletId: tx.type === 'income' ? tx.toWallet : tx.fromWallet,
        walletName: tx.type === 'income' ? tx.toWalletName : tx.fromWalletName,
        fromWallet: tx.fromWallet,
        toWallet: tx.toWallet,
        fromWalletName: tx.fromWalletName,
        toWalletName: tx.toWalletName,
        categoryId: tx.category,
        category: tx.categoryName,
        note: tx.note || ''
    };
}

function mapWallet(w) {
    if (w.active !== undefined) return w; // Local dummy
    return {
        id: w.id,
        name: w.name,
        initialBalance: w.initialBalance !== undefined ? w.initialBalance : 0,
        balance: w.balance !== undefined ? w.balance : (w.initialBalance || 0),
        active: w.status === 'Active'
    };
}

function mapCategory(c) {
    if (c.active !== undefined) return c; // Local dummy
    return {
        id: c.id,
        type: c.type,
        name: c.name,
        active: c.status === 'Active'
    };
}

// ==========================================
// INITIALIZATION & DATA LOADING
// ==========================================
async function init() {
    // Dummy Data if no URL provided (for preview)
    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        console.warn("API URL belum dikonfigurasi. Menggunakan data dummy.");
        setupDummyData();
    } else {
        // Prefetch data in background (doesn't block dashboard rendering)
        Promise.all([
            loadWalletsData(false),
            loadCategoriesData(false),
            loadTransactionsData(false)
        ]).then(() => {
            populateTxFilterOptions();
            renderFinancialReport();
        });
    }

    // Search and Filter Listeners for Transactions
    const searchTxEl = document.getElementById('search-tx');
    if (searchTxEl) {
        let searchTimeout;
        searchTxEl.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(renderTransactions, 250);
        });
    }

    // Setup format ribuan live
    setupCurrencyInputFormatter('tx-amount', 'tx-amount-preview');
    setupCurrencyInputFormatter('wallet-balance', 'wallet-balance-preview');

    const filterPeriodEl = document.getElementById('filter-period');
    if (filterPeriodEl) {
        filterPeriodEl.addEventListener('change', () => {
            toggleTxCustomDate();
            renderTransactions();
        });
    }

    const filterStartDateEl = document.getElementById('filter-start-date');
    if (filterStartDateEl) filterStartDateEl.addEventListener('change', renderTransactions);

    const filterEndDateEl = document.getElementById('filter-end-date');
    if (filterEndDateEl) filterEndDateEl.addEventListener('change', renderTransactions);

    const filterTypeEl = document.getElementById('filter-type');
    if (filterTypeEl) filterTypeEl.addEventListener('change', renderTransactions);

    const filterWalletEl = document.getElementById('filter-wallet');
    if (filterWalletEl) filterWalletEl.addEventListener('change', renderTransactions);

    const filterCatEl = document.getElementById('filter-category');
    if (filterCatEl) filterCatEl.addEventListener('change', renderTransactions);

    // Initial load
    navigateTo('dashboard');
}

function populateTxFilterOptions() {
    const walletSelect = document.getElementById('filter-wallet');
    const catSelect = document.getElementById('filter-category');

    if (walletSelect) {
        const curWallet = walletSelect.value;
        walletSelect.innerHTML = `<option value="">Semua Dompet</option>` +
            state.wallets.filter(w => w.active !== false).map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        walletSelect.value = curWallet;
    }

    if (catSelect) {
        const curCat = catSelect.value;
        catSelect.innerHTML = `<option value="">Semua Kategori</option>` +
            state.categories.map(c => `<option value="${c.id}">${c.name} (${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'})</option>`).join('');
        catSelect.value = curCat;
    }
}

function toggleTxCustomDate() {
    const period = document.getElementById('filter-period')?.value;
    const customDiv = document.getElementById('tx-custom-date-container');
    if (!customDiv) return;
    if (period === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
    }
}

function getTxFilterDateRange() {
    const period = document.getElementById('filter-period')?.value || 'this_month';
    const now = new Date();

    if (period === 'all') return null;

    if (period === 'today') {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        return { startStr: todayStr, endStr: todayStr };
    }

    if (period === '7days') {
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const yPast = past.getFullYear();
        const mPast = String(past.getMonth() + 1).padStart(2, '0');
        const dPast = String(past.getDate()).padStart(2, '0');
        const pastStr = `${yPast}-${mPast}-${dPast}`;

        const yNow = now.getFullYear();
        const mNow = String(now.getMonth() + 1).padStart(2, '0');
        const dNow = String(now.getDate()).padStart(2, '0');
        const nowStr = `${yNow}-${mNow}-${dNow}`;
        return { startStr: pastStr, endStr: nowStr };
    }

    if (period === 'this_month') {
        const y = now.getFullYear();
        const m = now.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);

        const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        return { startStr, endStr };
    }

    if (period === 'last_month') {
        const y = now.getFullYear();
        const m = now.getMonth();
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);

        const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        return { startStr, endStr };
    }

    if (period === 'this_year') {
        const y = now.getFullYear();
        return {
            startStr: `${y}-01-01`,
            endStr: `${y}-12-31`
        };
    }

    if (period === 'custom') {
        const startInput = document.getElementById('filter-start-date')?.value;
        const endInput = document.getElementById('filter-end-date')?.value;
        if (!startInput && !endInput) return null;
        return {
            startStr: startInput || '1970-01-01',
            endStr: endInput || '2099-12-31'
        };
    }

    return null;
}

function resetTxFilters() {
    const searchEl = document.getElementById('search-tx');
    if (searchEl) searchEl.value = '';

    const periodEl = document.getElementById('filter-period');
    if (periodEl) periodEl.value = 'this_month';

    const typeEl = document.getElementById('filter-type');
    if (typeEl) typeEl.value = '';

    const walletEl = document.getElementById('filter-wallet');
    if (walletEl) walletEl.value = '';

    const catEl = document.getElementById('filter-category');
    if (catEl) catEl.value = '';

    const startEl = document.getElementById('filter-start-date');
    if (startEl) startEl.value = '';

    const endEl = document.getElementById('filter-end-date');
    if (endEl) endEl.value = '';

    const customDiv = document.getElementById('tx-custom-date-container');
    if (customDiv) customDiv.classList.add('hidden');

    renderTransactions();
}

async function loadTransactionsData(forceRefresh = false) {
    if (!forceRefresh && cache.transactions && (Date.now() - cache.transactions < CACHE_DURATION)) return;
    const res = await apiGet('getTransactions');
    if (res && res.data) {
        state.transactions = res.data.map(mapTx);
        cache.transactions = Date.now();
    }
}

async function loadWalletsData(forceRefresh = false) {
    if (!forceRefresh && cache.wallets && (Date.now() - cache.wallets < CACHE_DURATION)) return;
    const res = await apiGet('getWallets');
    if (res && res.data) {
        state.wallets = res.data.map(mapWallet);
        cache.wallets = Date.now();
        populateTxFilterOptions();
    }
}

async function loadCategoriesData(forceRefresh = false) {
    if (!forceRefresh && cache.categories && (Date.now() - cache.categories < CACHE_DURATION)) return;
    const res = await apiGet('getCategories');
    if (res && res.data) {
        state.categories = res.data.map(mapCategory);
        cache.categories = Date.now();
        populateTxFilterOptions();
    }
}

async function loadDashboard(forceRefresh = false) {
    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        renderDashboardTransactions(state.transactions.slice(0, 5));
        renderDashboardWallets();
        renderFinancialReport(5000000, 500000);
        return;
    }

    const cacheKey = state.currentPeriod;
    const isStale = !cache.dashboard[cacheKey] || (Date.now() - cache.dashboard[cacheKey].timestamp >= CACHE_DURATION);

    if (!forceRefresh && !isStale) {
        updateDashboardUI(cache.dashboard[cacheKey].data);
        return;
    }

    if (!cache.dashboard[cacheKey]) {
        document.getElementById('dashboard-transactions').innerHTML = renderTxSkeleton(3);
        document.getElementById('dashboard-wallets').innerHTML = renderDashboardWalletSkeleton(2);
    }

    const res = await apiGet('getDashboard', { period: state.currentPeriod });
    if (res && res.data) {
        cache.dashboard[cacheKey] = { timestamp: Date.now(), data: res.data };
        updateDashboardUI(res.data);
    }
}

function updateDashboardUI(data) {
    const totalBalance = data.totalBalance || 0;
    const totalIncome = data.totalIncome || 0;
    const totalExpense = data.totalExpense || 0;

    document.getElementById('metric-balance').textContent = formatIDR(totalBalance);
    document.getElementById('metric-income').textContent = formatIDR(totalIncome);
    document.getElementById('metric-expense').textContent = formatIDR(totalExpense);

    const recentTx = (data.recentTransactions || []).map(mapTx);
    renderDashboardTransactions(recentTx);

    if (data.wallets) {
        state.wallets = data.wallets.map(mapWallet);
        cache.wallets = Date.now();
    }
    renderDashboardWallets();

    renderFinancialReport(totalIncome, totalExpense);
}

function renderFinancialReport(passedIncome = null, passedExpense = null) {
    const netEl = document.getElementById('report-net-cashflow');
    if (!netEl) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // Saring transaksi bulan berjalan
    const monthTx = state.transactions.filter(tx => {
        if (!tx.date) return false;
        const [y, m] = tx.date.split('-').map(Number);
        return y === currentYear && (m - 1) === currentMonth;
    });

    let income = passedIncome !== null ? passedIncome : 0;
    let expense = passedExpense !== null ? passedExpense : 0;

    if (passedIncome === null || passedExpense === null) {
        income = 0;
        expense = 0;
        monthTx.forEach(tx => {
            if (tx.type === 'income') income += (Number(tx.amount) || 0);
            if (tx.type === 'expense') expense += (Number(tx.amount) || 0);
        });
    }

    const net = income - expense;
    let savingsRate = 0;
    if (income > 0) {
        savingsRate = Math.max(0, Math.min(100, Math.round((net / income) * 100)));
    }

    // 1. Arus Kas Bersih & Badge Evaluasi
    netEl.textContent = (net >= 0 ? '+' : '') + formatIDR(net);
    const healthBadge = document.getElementById('health-badge');

    if (net > 0 && savingsRate >= 20) {
        netEl.className = 'text-3xl font-bold font-heading text-secondary';
        if (healthBadge) {
            healthBadge.textContent = 'Surplus Sehat';
            healthBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-secondary/10 text-secondary';
        }
    } else if (net > 0 && savingsRate < 20) {
        netEl.className = 'text-3xl font-bold font-heading text-amber-600 dark:text-amber-400';
        if (healthBadge) {
            healthBadge.textContent = 'Surplus Tipis';
            healthBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400';
        }
    } else if (net === 0) {
        netEl.className = 'text-3xl font-bold font-heading text-on-surface dark:text-slate-200';
        if (healthBadge) {
            healthBadge.textContent = 'Seimbang';
            healthBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant dark:text-slate-300';
        }
    } else {
        netEl.className = 'text-3xl font-bold font-heading text-error';
        if (healthBadge) {
            healthBadge.textContent = 'Defisit';
            healthBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error/10 text-error';
        }
    }

    // 2. Tingkat Tabungan (Savings Rate)
    const savingsRateEl = document.getElementById('report-savings-rate');
    const savingsTextEl = document.getElementById('report-savings-text');
    const savingsBarEl = document.getElementById('report-savings-bar');

    if (savingsRateEl) savingsRateEl.textContent = `${savingsRate}%`;
    if (savingsTextEl) savingsTextEl.textContent = `${savingsRate}% tersimpan`;
    if (savingsBarEl) {
        savingsBarEl.style.width = `${savingsRate}%`;
        savingsBarEl.className = `h-full rounded-full transition-all duration-500 ${net >= 0 ? 'bg-secondary' : 'bg-error'}`;
    }

    // 3. Rata-Rata Belanja Harian (Daily Burn Rate)
    const dailyBurn = Math.round(expense / currentDay);
    const dailyBurnEl = document.getElementById('report-daily-burn');
    const daysCountEl = document.getElementById('report-days-count');

    if (dailyBurnEl) dailyBurnEl.textContent = `${formatIDR(dailyBurn)} / hari`;
    if (daysCountEl) daysCountEl.textContent = `${currentDay} Hari`;

    // 4. Pos Pengeluaran Terbesar (Top Spending Categories)
    const breakdownContainer = document.getElementById('report-spending-breakdown');
    if (!breakdownContainer) return;

    const catMap = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
        const catName = t.category || 'Lain-lain';
        catMap[catName] = (catMap[catName] || 0) + (Number(t.amount) || 0);
    });

    const sortedCats = Object.entries(catMap)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

    if (sortedCats.length === 0) {
        breakdownContainer.innerHTML = `
            <div class="p-6 text-center text-xs text-on-surface-variant dark:text-slate-400 bg-surface-container-low dark:bg-slate-700/30 rounded-xl">
                Belum ada data pengeluaran tercatat di bulan ini.
            </div>`;
        return;
    }

    const colorPalette = [
        'bg-error',
        'bg-amber-500',
        'bg-blue-500',
        'bg-purple-500',
        'bg-emerald-500'
    ];

    const totalMonthExp = expense > 0 ? expense : sortedCats.reduce((acc, c) => acc + c.amount, 0);

    breakdownContainer.innerHTML = sortedCats.slice(0, 4).map((cat, index) => {
        const pct = totalMonthExp > 0 ? Math.round((cat.amount / totalMonthExp) * 100) : 0;
        const color = colorPalette[index % colorPalette.length];

        return `
        <div class="space-y-1.5">
            <div class="flex justify-between items-center text-xs">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full ${color}"></span>
                    <span class="font-medium text-on-surface dark:text-slate-200">${cat.name}</span>
                </div>
                <div class="text-right font-heading">
                    <span class="font-semibold text-on-surface dark:text-slate-100">${formatIDR(cat.amount)}</span>
                    <span class="text-on-surface-variant dark:text-slate-400 text-[11px] ml-1">(${pct}%)</span>
                </div>
            </div>
            <div class="w-full h-2 rounded-full bg-surface-container-low dark:bg-slate-700/80 overflow-hidden">
                <div class="h-full ${color} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// REPORTS & ANALYTICS MODULE
// ==========================================
let reportsState = {
    period: 'this_month',
    catType: 'expense',
    cachedTxList: []
};

async function loadReports(forceRefresh = false) {
    if (!API_BASE_URL.includes("MASUKKAN_URL")) {
        const isStale = !cache.transactions || (Date.now() - cache.transactions >= CACHE_DURATION);
        if (state.transactions.length === 0 && (forceRefresh || isStale)) {
            await loadTransactionsData(forceRefresh);
        }
        if (state.wallets.length === 0) {
            await loadWalletsData(forceRefresh);
        }
    }
    renderReportsTab();
}

function handleReportsPeriodChange() {
    const val = document.getElementById('reports-period-select')?.value || 'this_month';
    reportsState.period = val;
    const customDiv = document.getElementById('reports-custom-dates');
    if (customDiv) {
        if (val === 'custom') {
            customDiv.classList.remove('hidden');
        } else {
            customDiv.classList.add('hidden');
        }
    }
    renderReportsTab();
}

function switchReportsCatType(type) {
    reportsState.catType = type;
    const btnExp = document.getElementById('reports-cat-btn-expense');
    const btnInc = document.getElementById('reports-cat-btn-income');

    if (btnExp && btnInc) {
        if (type === 'expense') {
            btnExp.className = 'px-3 py-1 text-xs font-semibold rounded-md bg-surface-container-lowest dark:bg-slate-800 text-error shadow-sm transition-all';
            btnInc.className = 'px-3 py-1 text-xs font-medium rounded-md text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-slate-100 transition-all';
        } else {
            btnInc.className = 'px-3 py-1 text-xs font-semibold rounded-md bg-surface-container-lowest dark:bg-slate-800 text-secondary shadow-sm transition-all';
            btnExp.className = 'px-3 py-1 text-xs font-medium rounded-md text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-slate-100 transition-all';
        }
    }
    renderReportsCategoryBreakdown();
}

function getReportsDateRange() {
    const period = reportsState.period;
    const now = new Date();

    if (period === 'all') return null;

    if (period === 'this_month') {
        const y = now.getFullYear();
        const m = now.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        return {
            startStr: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
            endStr: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
            days: now.getDate()
        };
    }

    if (period === 'last_month') {
        const y = now.getFullYear();
        const m = now.getMonth();
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        return {
            startStr: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
            endStr: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
            days: end.getDate()
        };
    }

    if (period === 'quarter') {
        const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const yPast = past.getFullYear();
        const mPast = String(past.getMonth() + 1).padStart(2, '0');
        const dPast = String(past.getDate()).padStart(2, '0');

        const yNow = now.getFullYear();
        const mNow = String(now.getMonth() + 1).padStart(2, '0');
        const dNow = String(now.getDate()).padStart(2, '0');
        return {
            startStr: `${yPast}-${mPast}-${dPast}`,
            endStr: `${yNow}-${mNow}-${dNow}`,
            days: 90
        };
    }

    if (period === 'this_year') {
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        return {
            startStr: `${now.getFullYear()}-01-01`,
            endStr: `${now.getFullYear()}-12-31`,
            days: Math.max(1, dayOfYear)
        };
    }

    if (period === 'custom') {
        const startInput = document.getElementById('reports-start-date')?.value;
        const endInput = document.getElementById('reports-end-date')?.value;
        if (!startInput && !endInput) return null;
        const s = startInput ? new Date(startInput) : new Date('1970-01-01');
        const e = endInput ? new Date(endInput) : new Date();
        const diffDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        return {
            startStr: startInput || '1970-01-01',
            endStr: endInput || '2099-12-31',
            days: diffDays
        };
    }

    return null;
}

function renderReportsTab() {
    const range = getReportsDateRange();

    const filteredTx = state.transactions.filter(tx => {
        if (!tx.date) return false;
        if (range) {
            if (tx.date < range.startStr || tx.date > range.endStr) return false;
        }
        return true;
    }).sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

    reportsState.cachedTxList = filteredTx;

    let totalIncome = 0;
    let countIncome = 0;
    let totalExpense = 0;
    let countExpense = 0;

    filteredTx.forEach(tx => {
        if (tx.type === 'income') {
            totalIncome += (Number(tx.amount) || 0);
            countIncome++;
        } else if (tx.type === 'expense') {
            totalExpense += (Number(tx.amount) || 0);
            countExpense++;
        }
    });

    const net = totalIncome - totalExpense;
    let savingsRate = 0;
    if (totalIncome > 0) {
        savingsRate = Math.max(0, Math.min(100, Math.round((net / totalIncome) * 100)));
    }

    const days = (range && range.days) ? range.days : Math.max(1, new Date().getDate());
    const burnRate = Math.round(totalExpense / days);

    // 1. Update Executive Metrics
    const incEl = document.getElementById('reports-total-income');
    const incCntEl = document.getElementById('reports-income-count');
    const expEl = document.getElementById('reports-total-expense');
    const expCntEl = document.getElementById('reports-expense-count');
    const netEl = document.getElementById('reports-net-cashflow');
    const rateEl = document.getElementById('reports-savings-rate');
    const burnEl = document.getElementById('reports-burn-rate');
    const badgeEl = document.getElementById('reports-health-badge');

    if (incEl) incEl.textContent = formatIDR(totalIncome);
    if (incCntEl) incCntEl.textContent = `${countIncome} transaksi masuk`;
    if (expEl) expEl.textContent = formatIDR(totalExpense);
    if (expCntEl) expCntEl.textContent = `${countExpense} transaksi keluar`;

    if (netEl) {
        netEl.textContent = (net >= 0 ? '+' : '') + formatIDR(net);
        if (net > 0 && savingsRate >= 20) {
            netEl.className = 'text-xl font-bold font-heading text-secondary mt-1';
            if (badgeEl) {
                badgeEl.textContent = 'Surplus Sehat';
                badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-secondary/10 text-secondary';
            }
        } else if (net > 0 && savingsRate < 20) {
            netEl.className = 'text-xl font-bold font-heading text-amber-600 dark:text-amber-400 mt-1';
            if (badgeEl) {
                badgeEl.textContent = 'Surplus Tipis';
                badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400';
            }
        } else if (net === 0) {
            netEl.className = 'text-xl font-bold font-heading text-on-surface dark:text-slate-200 mt-1';
            if (badgeEl) {
                badgeEl.textContent = 'Seimbang';
                badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-container text-on-surface-variant dark:text-slate-300';
            }
        } else {
            netEl.className = 'text-xl font-bold font-heading text-error mt-1';
            if (badgeEl) {
                badgeEl.textContent = 'Defisit';
                badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-error/10 text-error';
            }
        }
    }

    if (rateEl) rateEl.textContent = `${savingsRate}% rasio tabungan`;
    if (burnEl) burnEl.textContent = formatIDR(burnRate);

    // 2. Render Categories & Wallets
    renderReportsCategoryBreakdown();
    renderReportsWalletReconciliation();
}

function renderReportsCategoryBreakdown() {
    const container = document.getElementById('reports-category-list');
    if (!container) return;

    const currentType = reportsState.catType;
    const txList = reportsState.cachedTxList.filter(t => t.type === currentType);

    if (txList.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-xs text-on-surface-variant dark:text-slate-400 bg-surface-container-low dark:bg-slate-700/30 rounded-xl">
                Tidak ada data ${currentType === 'expense' ? 'pengeluaran' : 'pemasukan'} pada periode ini.
            </div>`;
        return;
    }

    const catMap = {};
    let totalAmount = 0;

    txList.forEach(t => {
        const name = t.category || 'Lain-lain';
        const amt = Number(t.amount) || 0;
        totalAmount += amt;

        if (!catMap[name]) {
            catMap[name] = { name, amount: 0, count: 0 };
        }
        catMap[name].amount += amt;
        catMap[name].count += 1;
    });

    const sorted = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    const colorPalette = currentType === 'expense'
        ? ['bg-error', 'bg-amber-500', 'bg-blue-500', 'bg-purple-500', 'bg-rose-500', 'bg-indigo-500']
        : ['bg-secondary', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500'];

    container.innerHTML = sorted.map((cat, idx) => {
        const pct = totalAmount > 0 ? Math.round((cat.amount / totalAmount) * 100) : 0;
        const color = colorPalette[idx % colorPalette.length];

        return `
        <div class="p-3 border border-outline/10 dark:border-slate-700 rounded-xl bg-surface-container-low/40 dark:bg-slate-700/20 hover:bg-surface-container-low dark:hover:bg-slate-700 transition-colors">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-3 h-3 rounded-full flex-shrink-0 ${color}"></span>
                    <span class="font-medium text-sm text-on-surface dark:text-slate-100 truncate">${cat.name}</span>
                    <span class="text-[11px] font-medium text-on-surface-variant dark:text-slate-400 bg-surface-container dark:bg-slate-600 px-2 py-0.5 rounded-full">${cat.count}x</span>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="font-semibold text-sm font-heading ${currentType === 'expense' ? 'text-error' : 'text-secondary'}">${formatIDR(cat.amount)}</span>
                    <span class="text-xs text-on-surface-variant dark:text-slate-400 font-medium ml-1">(${pct}%)</span>
                </div>
            </div>
            <div class="w-full h-2 rounded-full bg-surface-container dark:bg-slate-700 overflow-hidden">
                <div class="h-full ${color} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsWalletReconciliation() {
    const container = document.getElementById('reports-wallet-reconciliation');
    if (!container) return;

    if (state.wallets.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-xs text-on-surface-variant dark:text-slate-400 bg-surface-container-low dark:bg-slate-700/30 rounded-xl">
                Belum ada dompet terdaftar.
            </div>`;
        return;
    }

    const txList = reportsState.cachedTxList;

    container.innerHTML = state.wallets.filter(w => w.active !== false).map(w => {
        let inflow = 0;
        let outflow = 0;

        txList.forEach(t => {
            const amt = Number(t.amount) || 0;
            if (t.type === 'income' && (t.walletId == w.id || t.toWallet == w.id)) {
                inflow += amt;
            } else if (t.type === 'expense' && (t.walletId == w.id || t.fromWallet == w.id)) {
                outflow += amt;
            } else if (t.type === 'transfer') {
                if (t.toWallet == w.id) inflow += amt;
                if (t.fromWallet == w.id) outflow += amt;
            }
        });

        const net = inflow - outflow;
        const netColor = net > 0 ? 'text-secondary' : (net < 0 ? 'text-error' : 'text-on-surface-variant dark:text-slate-400');

        return `
        <div class="p-3 border border-outline/10 dark:border-slate-700 rounded-xl bg-surface-container-low/40 dark:bg-slate-700/20 hover:bg-surface-container-low dark:hover:bg-slate-700 transition-colors">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-base text-secondary">account_balance_wallet</span>
                    <span class="font-medium text-sm text-on-surface dark:text-slate-100">${w.name}</span>
                </div>
                <div class="text-right">
                    <span class="text-xs text-on-surface-variant dark:text-slate-400">Saldo Riil: </span>
                    <span class="font-semibold text-sm font-heading">${formatIDR(w.balance)}</span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 pt-2 border-t border-outline/5 dark:border-slate-700 text-xs">
                <div>
                    <span class="text-[10px] text-on-surface-variant dark:text-slate-400 uppercase block">Masuk</span>
                    <strong class="text-secondary font-heading font-medium">+${formatIDR(inflow)}</strong>
                </div>
                <div>
                    <span class="text-[10px] text-on-surface-variant dark:text-slate-400 uppercase block">Keluar</span>
                    <strong class="text-error font-heading font-medium">-${formatIDR(outflow)}</strong>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-on-surface-variant dark:text-slate-400 uppercase block">Perubahan Net</span>
                    <strong class="${netColor} font-heading font-semibold">${(net > 0 ? '+' : '') + formatIDR(net)}</strong>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function loadTransactions(forceRefresh = false) {
    if (!API_BASE_URL.includes("MASUKKAN_URL")) {
        const isStale = !cache.transactions || (Date.now() - cache.transactions >= CACHE_DURATION);
        if (state.transactions.length === 0 && (forceRefresh || isStale)) {
            document.getElementById('tx-list').innerHTML = renderTxSkeleton(5);
        }
        await loadTransactionsData(forceRefresh);
    }
    renderTransactions();
}

async function loadWallets(forceRefresh = false) {
    if (!API_BASE_URL.includes("MASUKKAN_URL")) {
        const isStale = !cache.wallets || (Date.now() - cache.wallets >= CACHE_DURATION);
        if (state.wallets.length === 0 && (forceRefresh || isStale)) {
            document.getElementById('wallets-grid').innerHTML = renderWalletSkeleton(3);
        }
        await loadWalletsData(forceRefresh);
    }
    renderWalletsGrid();
}

async function loadCategories(forceRefresh = false) {
    if (!API_BASE_URL.includes("MASUKKAN_URL")) {
        const isStale = !cache.categories || (Date.now() - cache.categories >= CACHE_DURATION);
        if (state.categories.length === 0 && (forceRefresh || isStale)) {
            const skeleton = `<div class="flex flex-col gap-3">${renderCategorySkeleton(3)}</div>`;
            document.getElementById('cat-income-list').innerHTML = skeleton;
            document.getElementById('cat-expense-list').innerHTML = skeleton;
        }
        await loadCategoriesData(forceRefresh);
    }
    renderCategories();
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================
function renderDashboardTransactions(txList) {
    const container = document.getElementById('dashboard-transactions');
    if (txList.length === 0) {
        container.innerHTML = `<div class="p-4 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl"><p class="text-sm text-on-surface-variant dark:text-slate-400">Belum ada transaksi.</p></div>`;
        return;
    }
    container.innerHTML = txList.map(tx => {
        const isIncome = tx.type === 'income';
        const isTransfer = tx.type === 'transfer';
        let color = isIncome ? 'text-secondary' : 'text-error';
        let icon = isIncome ? 'arrow_downward' : 'arrow_upward';
        let bgIcon = isIncome ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error';

        if (isTransfer) {
            color = 'text-primary';
            icon = 'sync_alt';
            bgIcon = 'bg-primary/10 text-primary';
        }

        const title = tx.note ? tx.note : (isTransfer ? 'Transfer Saldo' : tx.category);
        const subtitle = isTransfer
            ? `${formatDateTime(tx.date, tx.time)} &bull; ${tx.fromWalletName} &rarr; ${tx.toWalletName}`
            : `${formatDateTime(tx.date, tx.time)} &bull; ${tx.walletName || 'Dompet'}`;

        const sign = isTransfer ? '' : (isIncome ? '+' : '-');

        return `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl bg-surface-container-low dark:bg-slate-700/30 hover:bg-surface-container-low dark:bg-slate-700 transition-colors cursor-pointer" onclick="navigateTo('transactions')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${bgIcon}">
                    <span class="material-symbols-outlined text-lg">${icon}</span>
                </div>
                <div>
                    <p class="font-medium text-sm line-clamp-1">${title}</p>
                    <p class="text-xs text-on-surface-variant dark:text-slate-400">${subtitle}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-semibold text-sm font-heading tracking-wide ${color}">${sign}${formatIDR(tx.amount)}</p>
            </div>
        </div>`;
    }).join('');
}

function renderDashboardWallets() {
    const container = document.getElementById('dashboard-wallets');
    if (state.wallets.length === 0) {
        container.innerHTML = `<div class="p-4 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl"><p class="text-sm text-on-surface-variant dark:text-slate-400">Belum ada dompet.</p></div>`;
        return;
    }
    container.innerHTML = state.wallets.map(w => `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-surface-container-low dark:bg-slate-700 transition-colors group" onclick="navigateTo('wallets'); setTimeout(()=>showWalletDetail('${w.id}'), 100)">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-surface-container dark:bg-slate-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <span class="material-symbols-outlined text-sm text-on-surface-variant dark:text-slate-400">account_balance_wallet</span>
                </div>
                <p class="font-medium text-sm">${w.name}</p>
            </div>
            <p class="font-medium text-sm font-heading">${formatIDR(w.balance)}</p>
        </div>
    `).join('');
}

function renderTransactions() {
    const container = document.getElementById('tx-list');
    if (!container) return;

    populateTxFilterOptions();

    const search = (document.getElementById('search-tx')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('filter-type')?.value || '';
    const walletFilter = document.getElementById('filter-wallet')?.value || '';
    const catFilter = document.getElementById('filter-category')?.value || '';
    const dateRange = getTxFilterDateRange();

    let filtered = state.transactions.filter(tx => {
        // 1. Search (note, category, wallet name)
        if (search) {
            const matchNote = (tx.note || '').toLowerCase().includes(search);
            const matchCat = (tx.category || '').toLowerCase().includes(search);
            const matchWallet = (tx.walletName || '').toLowerCase().includes(search) ||
                (tx.fromWalletName || '').toLowerCase().includes(search) ||
                (tx.toWalletName || '').toLowerCase().includes(search);
            if (!matchNote && !matchCat && !matchWallet) return false;
        }

        // 2. Type filter
        if (typeFilter && tx.type !== typeFilter) return false;

        // 3. Wallet filter
        if (walletFilter) {
            const matchWallet = String(tx.walletId) === walletFilter ||
                String(tx.fromWallet) === walletFilter ||
                String(tx.toWallet) === walletFilter;
            if (!matchWallet) return false;
        }

        // 4. Category filter
        if (catFilter) {
            if (String(tx.categoryId) !== catFilter) return false;
        }

        // 5. Date Range
        if (dateRange && tx.date) {
            if (tx.date < dateRange.startStr || tx.date > dateRange.endStr) {
                return false;
            }
        }

        return true;
    }).sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

    // Update Mini Summary Bar
    let sumIncome = 0;
    let sumExpense = 0;
    filtered.forEach(tx => {
        if (tx.type === 'income') sumIncome += (Number(tx.amount) || 0);
        if (tx.type === 'expense') sumExpense += (Number(tx.amount) || 0);
    });
    const net = sumIncome - sumExpense;

    const countEl = document.getElementById('tx-summary-count');
    if (countEl) countEl.textContent = `${filtered.length} Transaksi`;

    const incomeEl = document.getElementById('tx-summary-income');
    if (incomeEl) incomeEl.textContent = `+${formatIDR(sumIncome)}`;

    const expenseEl = document.getElementById('tx-summary-expense');
    if (expenseEl) expenseEl.textContent = `-${formatIDR(sumExpense)}`;

    const netEl = document.getElementById('tx-summary-net');
    if (netEl) {
        netEl.textContent = (net > 0 ? '+' : '') + formatIDR(net);
        if (net > 0) {
            netEl.className = 'font-heading font-semibold text-secondary';
        } else if (net < 0) {
            netEl.className = 'font-heading font-semibold text-error';
        } else {
            netEl.className = 'font-heading font-semibold text-on-surface dark:text-slate-100';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-sm text-on-surface-variant dark:text-slate-400 bg-surface-container-lowest dark:bg-slate-800 rounded-xl border border-outline/5 dark:border-slate-700">Tidak ada data transaksi yang sesuai dengan filter.</div>`;
        return;
    }

    container.innerHTML = filtered.map(tx => {
        const isIncome = tx.type === 'income';
        const isTransfer = tx.type === 'transfer';
        let color = isIncome ? 'text-secondary' : 'text-error';
        let icon = isIncome ? 'arrow_downward' : 'arrow_upward';
        let bgIcon = isIncome ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error';

        if (isTransfer) {
            color = 'text-primary dark:text-slate-200';
            icon = 'sync_alt';
            bgIcon = 'bg-primary/10 text-primary dark:bg-slate-700 dark:text-slate-200';
        }

        const title = tx.note ? tx.note : (isTransfer ? 'Transfer Saldo' : tx.category);
        const subtitle = isTransfer
            ? `${formatDateTime(tx.date, tx.time)} &bull; ${tx.fromWalletName} &rarr; ${tx.toWalletName}`
            : `${formatDateTime(tx.date, tx.time)} &bull; ${tx.walletName || 'Dompet'} &bull; ${tx.category || '-'}`;

        const sign = isTransfer ? '' : (isIncome ? '+' : '-');

        return `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl bg-surface-container-lowest dark:bg-slate-800 hover:bg-surface-container-low dark:bg-slate-700 transition-colors group">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${bgIcon}">
                    <span class="material-symbols-outlined text-lg">${icon}</span>
                </div>
                <div class="min-w-0">
                    <p class="font-medium text-sm line-clamp-1 text-on-surface dark:text-slate-100">${title}</p>
                    <p class="text-[11px] text-on-surface-variant dark:text-slate-400 truncate mt-0.5">${subtitle}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                <div class="text-right">
                    <p class="font-semibold text-sm font-heading tracking-wide ${color}">${sign}${formatIDR(tx.amount)}</p>
                </div>
                <div class="flex flex-col gap-1 md:flex-row md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editTransaction('${tx.id}')" class="p-1 text-on-surface-variant dark:text-slate-400 hover:text-secondary rounded"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onclick="deleteTransaction('${tx.id}')" class="p-1 text-on-surface-variant dark:text-slate-400 hover:text-error rounded"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function renderWalletsGrid() {
    const container = document.getElementById('wallets-grid');
    if (state.wallets.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 text-center bg-surface-container-lowest dark:bg-slate-800 rounded-xl border border-outline/10 dark:border-slate-700"><p class="text-sm text-on-surface-variant dark:text-slate-400">Belum ada dompet terdaftar.</p></div>`;
        return;
    }

    container.innerHTML = state.wallets.map(w => `
        <div class="bg-surface-container-lowest dark:bg-slate-800 border border-outline/10 dark:border-slate-700 rounded-xl p-5 shadow-sm relative group overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer" onclick="showWalletDetail('${w.id}')">
            <div class="absolute -right-4 -top-4 w-20 h-20 bg-primary/5 rounded-full pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
            <div class="flex items-start justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-surface-container dark:bg-slate-600 flex items-center justify-center text-on-surface dark:text-slate-100">
                        <span class="material-symbols-outlined">account_balance_wallet</span>
                    </div>
                    <div>
                        <h3 class="font-heading font-semibold text-base">${w.name}</h3>
                        <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${w.active !== false ? 'bg-secondary/10 text-secondary' : 'bg-outline/10 text-on-surface-variant dark:text-slate-400'} font-bold">
                            ${w.active !== false ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </div>
                </div>
                <div class="flex gap-1 relative z-10" onclick="event.stopPropagation()">
                    <button onclick="editWallet('${w.id}')" class="p-1.5 text-on-surface-variant dark:text-slate-400 hover:text-secondary rounded-lg hover:bg-surface-container dark:bg-slate-600 transition-colors"><span class="material-symbols-outlined text-sm">edit</span></button>
                </div>
            </div>
            <div>
                <p class="text-sm text-on-surface-variant dark:text-slate-400 mb-1">Total Saldo</p>
                <p class="text-2xl font-bold font-heading">${formatIDR(w.balance)}</p>
            </div>
        </div>
    `).join('');
}

function showWalletDetail(walletId) {
    const wallet = state.wallets.find(w => w.id == walletId);
    if (!wallet) return;

    document.getElementById('detail-wallet-name').textContent = `Riwayat: ${wallet.name} (${formatIDR(wallet.balance)})`;
    const detailContainer = document.getElementById('wallet-detail');
    detailContainer.classList.remove('hidden');

    const txContainer = document.getElementById('wallet-detail-tx');
    const filteredTx = state.transactions
        .filter(tx => tx.fromWallet == walletId || tx.toWallet == walletId)
        .sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

    if (filteredTx.length === 0) {
        txContainer.innerHTML = `<p class="text-sm text-on-surface-variant dark:text-slate-400 py-8 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl">Belum ada transaksi di dompet ini.</p>`;
    } else {
        txContainer.innerHTML = filteredTx.map(tx => {
            let isIncome = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';

            let color = isIncome ? 'text-secondary' : 'text-error';
            let sign = isIncome ? '+' : '-';
            let title = tx.note ? tx.note : tx.category;
            let subtitle = `${formatDateTime(tx.date, tx.time)} &bull; ${tx.category}`;

            if (isTransfer) {
                if (tx.toWallet == walletId) {
                    // Masuk dari transfer
                    color = 'text-primary';
                    sign = '+';
                    title = tx.note || 'Terima Transfer';
                    subtitle = `${formatDateTime(tx.date, tx.time)} &bull; Dari ${tx.fromWalletName}`;
                } else {
                    // Keluar karena transfer
                    color = 'text-on-surface-variant dark:text-slate-400';
                    sign = '-';
                    title = tx.note || 'Kirim Transfer';
                    subtitle = `${formatDateTime(tx.date, tx.time)} &bull; Ke ${tx.toWalletName}`;
                }
            }

            return `
            <div class="flex items-center justify-between py-3 px-2 hover:bg-surface-container-low dark:bg-slate-700 transition-colors rounded-lg">
                <div>
                    <p class="font-medium text-sm">${title}</p>
                    <p class="text-xs text-on-surface-variant dark:text-slate-400">${subtitle}</p>
                </div>
                <p class="font-semibold text-sm font-heading ${color}">${sign}${formatIDR(tx.amount)}</p>
            </div>`;
        }).join('');
    }

    // Scroll to detail smoothly
    setTimeout(() => {
        detailContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

function closeWalletDetail() {
    document.getElementById('wallet-detail').classList.add('hidden');
}

function renderCategories() {
    const incContainer = document.getElementById('cat-income-list');
    const expContainer = document.getElementById('cat-expense-list');

    const incomeCats = state.categories.filter(c => c.type === 'income');
    const expenseCats = state.categories.filter(c => c.type === 'expense');

    const renderItem = (cat) => `
        <div class="flex items-center justify-between p-3 border border-outline/10 dark:border-slate-700 rounded-xl hover:bg-surface-container-low dark:bg-slate-700 transition-colors group">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${cat.type === 'income' ? 'bg-secondary' : 'bg-error'}"></span>
                <span class="font-medium text-sm">${cat.name}</span>
            </div>
            <div class="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="editCategory('${cat.id}')" class="p-1.5 text-on-surface-variant dark:text-slate-400 hover:text-secondary rounded-lg hover:bg-surface-container dark:bg-slate-600"><span class="material-symbols-outlined text-sm">edit</span></button>
                <button onclick="deleteCategory('${cat.id}')" class="p-1.5 text-on-surface-variant dark:text-slate-400 hover:text-error rounded-lg hover:bg-error/10"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>
    `;

    incContainer.innerHTML = incomeCats.length ? incomeCats.map(renderItem).join('') : `<p class="text-sm text-on-surface-variant dark:text-slate-400 p-4 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl">Belum ada kategori pemasukan.</p>`;
    expContainer.innerHTML = expenseCats.length ? expenseCats.map(renderItem).join('') : `<p class="text-sm text-on-surface-variant dark:text-slate-400 p-4 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl">Belum ada kategori pengeluaran.</p>`;
}

// ==========================================
// MODAL & FORMS LOGIC
// ==========================================
function closeModals() {
    ['modal-transaction', 'modal-wallet', 'modal-category', 'modal-export', 'modal-clock-picker'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    });
}

function openExportModal() {
    const modal = document.getElementById('modal-export');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('export-period').value = 'this_month';
        toggleCustomDateExport();
    }
}

function toggleCustomDateExport() {
    const period = document.getElementById('export-period').value;
    const customDiv = document.getElementById('export-custom-date');
    if (period === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
    }
}

function getExportDateRange() {
    const period = document.getElementById('export-period').value;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = new Date(today);
    let end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (period === 'this_week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
    } else if (period === 'this_month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === 'this_year') {
        start = new Date(today.getFullYear(), 0, 1);
    } else if (period === 'custom') {
        const customStart = document.getElementById('export-start').value;
        const customEnd = document.getElementById('export-end').value;
        if (!customStart || !customEnd) return null;
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
    }

    return { start, end };
}

function exportData(format) {
    let filteredTx = [];
    let start = null;
    let end = null;

    const isModalOpen = !document.getElementById('modal-export')?.classList.contains('hidden');
    const modalRange = getExportDateRange();

    if (isModalOpen && modalRange) {
        start = modalRange.start;
        end = modalRange.end;
        filteredTx = state.transactions.filter(tx => {
            if (!tx.date) return false;
            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        }).sort((a, b) => getTxTimestamp(a) - getTxTimestamp(b));
    } else if (reportsState.cachedTxList && reportsState.cachedTxList.length > 0) {
        filteredTx = reportsState.cachedTxList.slice().sort((a, b) => getTxTimestamp(a) - getTxTimestamp(b));
        const reportRange = getReportsDateRange();
        start = reportRange ? new Date(reportRange.startStr) : new Date(filteredTx[0]?.date || Date.now());
        end = reportRange ? new Date(reportRange.endStr) : new Date();
    } else {
        const reportRange = getReportsDateRange();
        filteredTx = state.transactions.filter(tx => {
            if (!tx.date) return false;
            if (reportRange) {
                if (tx.date < reportRange.startStr || tx.date > reportRange.endStr) return false;
            }
            return true;
        }).sort((a, b) => getTxTimestamp(a) - getTxTimestamp(b));
        start = reportRange ? new Date(reportRange.startStr) : new Date(filteredTx[0]?.date || Date.now());
        end = reportRange ? new Date(reportRange.endStr) : new Date();
    }

    if (filteredTx.length === 0) {
        showToast('Tidak ada transaksi pada periode yang dipilih.', 'error');
        return;
    }

    let totalIncome = 0;
    let totalExpense = 0;
    filteredTx.forEach(tx => {
        if (tx.type === 'income') totalIncome += (Number(tx.amount) || 0);
        if (tx.type === 'expense') totalExpense += (Number(tx.amount) || 0);
    });

    const startFormatted = start ? start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const endFormatted = end ? end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const periodStr = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`;

    if (format === 'csv') {
        let csv = 'Tanggal & Waktu,Tipe,Kategori,Dompet,Jumlah,Catatan\n';
        filteredTx.forEach(tx => {
            const dateStr = formatDateTime(tx.date, tx.time);
            const typeStr = tx.type === 'income' ? 'Pemasukan' : (tx.type === 'expense' ? 'Pengeluaran' : 'Transfer');
            const catStr = tx.category || '';
            const walletStr = tx.type === 'transfer' ? `${tx.fromWalletName} -> ${tx.toWalletName}` : tx.walletName;
            const amountStr = tx.amount;
            const noteStr = (tx.note || '').replace(/,/g, ' ');
            csv += `"${dateStr}","${typeStr}","${catStr}","${walletStr}","${amountStr}","${noteStr}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Laporan_Keuangan_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        closeModals();
        showToast('Laporan CSV berhasil diunduh.', 'success');
    } else if (format === 'pdf') {
        const jsPDFClass = window.jspdf ? (window.jspdf.jsPDF || window.jspdf) : window.jsPDF;
        if (!jsPDFClass) {
            showToast('Library PDF belum termuat. Periksa koneksi internet Anda.', 'error');
            return;
        }

        const doc = new jsPDFClass();

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("Laporan Keuangan", 14, 20);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Periode: ${periodStr}`, 14, 28);

        doc.text(`Total Pemasukan: ${formatIDR(totalIncome)}`, 14, 35);
        doc.text(`Total Pengeluaran: ${formatIDR(totalExpense)}`, 14, 41);
        doc.text(`Surplus/Defisit: ${formatIDR(totalIncome - totalExpense)}`, 14, 47);

        const tableColumn = ["Tanggal & Waktu", "Tipe", "Kategori", "Dompet", "Jumlah", "Catatan"];
        const tableRows = [];

        filteredTx.forEach(tx => {
            const dateStr = formatDateTime(tx.date, tx.time);
            const typeStr = tx.type === 'income' ? 'Pemasukan' : (tx.type === 'expense' ? 'Pengeluaran' : 'Transfer');
            const catStr = tx.category || '-';
            const walletStr = tx.type === 'transfer' ? `${tx.fromWalletName} -> ${tx.toWalletName}` : (tx.walletName || '-');
            const amountStr = formatIDR(tx.amount);
            const noteStr = tx.note || '-';

            tableRows.push([dateStr, typeStr, catStr, walletStr, amountStr, noteStr]);
        });

        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                startY: 55,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [0, 108, 73] },
                styles: { fontSize: 8 }
            });
        }

        doc.save(`Laporan_Keuangan_${Date.now()}.pdf`);
        closeModals();
        showToast('Laporan PDF berhasil diunduh.', 'success');
    }
}

// Close modal on click outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('fixed') && e.target.classList.contains('bg-black/50')) {
        closeModals();
    }
});

function updateCategoryOptions() {
    const type = document.querySelector('input[name="tx-type"]:checked').value;

    // Toggle UI fields based on type
    const toWalletContainer = document.getElementById('container-tx-to-wallet');
    const categoryContainer = document.getElementById('container-tx-category');
    const labelTxWallet = document.getElementById('label-tx-wallet');

    if (type === 'transfer') {
        toWalletContainer.classList.remove('hidden');
        categoryContainer.classList.add('hidden');
        if (labelTxWallet) labelTxWallet.textContent = 'Dompet Sumber';

        // Populate to-wallet if not populated
        const toWalletSelect = document.getElementById('tx-to-wallet');
        toWalletSelect.innerHTML = state.wallets.filter(w => w.active !== false).map(w => `<option value="${w.id}">${w.name}</option>`).join('');

        // Remove 'required' from category so HTML5 form validation doesn't block submission
        document.getElementById('tx-category').removeAttribute('required');
    } else {
        toWalletContainer.classList.add('hidden');
        categoryContainer.classList.remove('hidden');
        if (labelTxWallet) labelTxWallet.textContent = 'Dompet';
        document.getElementById('tx-category').setAttribute('required', 'true');

        // Update categories
        const catSelect = document.getElementById('tx-category');
        const filteredCats = state.categories.filter(c => c.type === type);

        catSelect.innerHTML = filteredCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        if (filteredCats.length === 0) {
            catSelect.innerHTML = `<option value="">-- Tambah Kategori Dulu --</option>`;
        }
    }
}

function openTransactionModal(txId = null) {
    const modal = document.getElementById('modal-transaction');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Populate Wallet Options
    const walletSelect = document.getElementById('tx-wallet');
    walletSelect.innerHTML = state.wallets.filter(w => w.active !== false).map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    if (state.wallets.length === 0) {
        walletSelect.innerHTML = `<option value="">-- Tambah Dompet Dulu --</option>`;
    }

    const title = document.getElementById('tx-modal-title');
    const form = document.getElementById('form-transaction');
    form.reset();
    document.getElementById('tx-id').value = '';
    const txPrevReset = document.getElementById('tx-amount-preview');
    if (txPrevReset) txPrevReset.textContent = '';

    // Set default date to today and current time
    const now = new Date();
    const curHours = String(now.getHours()).padStart(2, '0');
    const curMinutes = String(now.getMinutes()).padStart(2, '0');
    const curTime = `${curHours}:${curMinutes}`;

    document.getElementById('tx-date').valueAsDate = now;
    const timeInput = document.getElementById('tx-time');
    if (timeInput) timeInput.value = curTime;

    if (txId) {
        title.textContent = 'Edit Transaksi';
        const tx = state.transactions.find(t => t.id == txId);
        if (tx) {
            document.getElementById('tx-id').value = tx.id;
            document.querySelector(`input[name="tx-type"][value="${tx.type}"]`).checked = true;
            document.getElementById('tx-amount').value = tx.amount ? formatThousandInput(tx.amount) : '';
            const txPrev = document.getElementById('tx-amount-preview');
            if (txPrev) txPrev.textContent = tx.amount ? `Rp ${formatThousandInput(tx.amount)}` : '';
            document.getElementById('tx-date').value = tx.date;
            if (timeInput) timeInput.value = tx.time || curTime;
            updateCategoryOptions();

            if (tx.type === 'transfer') {
                document.getElementById('tx-wallet').value = tx.fromWallet;
                document.getElementById('tx-to-wallet').value = tx.toWallet;
            } else {
                document.getElementById('tx-wallet').value = tx.walletId;
                document.getElementById('tx-category').value = tx.categoryId;
            }

            document.getElementById('tx-note').value = tx.note || '';
        }
    } else {
        title.textContent = 'Catat Transaksi';
        const lastWallet = localStorage.getItem('lastUsedWallet');
        if (lastWallet && state.wallets.some(w => w.id == lastWallet && w.active !== false)) {
            walletSelect.value = lastWallet;
        }
        updateCategoryOptions();
    }
}

async function saveTransaction() {
    const id = document.getElementById('tx-id').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const rawAmount = document.getElementById('tx-amount').value.replace(/\D/g, '');
    const amount = rawAmount ? Number(rawAmount) : 0;
    const date = document.getElementById('tx-date').value;
    const time = document.getElementById('tx-time')?.value || '00:00';
    const walletId = document.getElementById('tx-wallet').value;
    const toWalletId = document.getElementById('tx-to-wallet').value;
    const categoryId = type === 'transfer' ? '' : document.getElementById('tx-category').value;
    const note = document.getElementById('tx-note').value;

    if (!amount || !date || !walletId || (type !== 'transfer' && !categoryId) || (type === 'transfer' && !toWalletId)) {
        showToast('Mohon lengkapi semua field wajib.', 'error');
        return;
    }

    if (type === 'transfer' && walletId === toWalletId) {
        showToast('Dompet sumber dan tujuan tidak boleh sama.', 'error');
        return;
    }

    const fullDateTime = `${date}T${time}:00`;

    const data = {
        type,
        amount: Number(amount),
        dateTime: fullDateTime,
        category: categoryId,
        note
    };

    if (type === 'income') {
        data.toWallet = walletId;
    } else if (type === 'expense') {
        data.fromWallet = walletId;
    } else if (type === 'transfer') {
        data.fromWallet = walletId;
        data.toWallet = toWalletId;
    }

    // For local dummy mode
    const localData = {
        type, amount: Number(amount), date, time, dateTime: fullDateTime, walletId, categoryId, note,
        fromWallet: type === 'transfer' ? walletId : '',
        toWallet: type === 'transfer' ? toWalletId : '',
        walletName: state.wallets.find(w => w.id == walletId)?.name,
        fromWalletName: state.wallets.find(w => w.id == walletId)?.name,
        toWalletName: state.wallets.find(w => w.id == toWalletId)?.name,
        category: type === 'transfer' ? 'Transfer' : state.categories.find(c => c.id == categoryId)?.name
    };

    const action = id ? 'updateTransaction' : 'addTransaction';
    const payload = { action, data };
    if (id) payload.id = id;

    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        // Dummy save
        if (id) {
            const idx = state.transactions.findIndex(t => t.id == id);
            state.transactions[idx] = { id, ...localData };
        } else {
            state.transactions.unshift({ id: Date.now().toString(), ...localData });
        }

        // Update wallet balance locally for dummy
        const wIdx = state.wallets.findIndex(w => w.id == walletId);
        if (wIdx >= 0) {
            state.wallets[wIdx].balance += (type === 'income' ? Number(amount) : -Number(amount));
        }

        localStorage.setItem('lastUsedWallet', walletId);
        showToast('Berhasil disimpan (Mode Preview Lokal)', 'success');
        closeModals();

        // Simulasikan ulang metrics
        document.getElementById('metric-balance').textContent = formatIDR(state.wallets.reduce((acc, w) => acc + w.balance, 0));

        loadDashboard();
        renderTransactions();
        return;
    }

    const res = await apiPost(payload);
    if (res) {
        localStorage.setItem('lastUsedWallet', walletId);
        cache.dashboard = {}; // Invalidasi cache dashboard
        closeModals();

        // Optimistic update local state
        if (id) {
            const idx = state.transactions.findIndex(t => t.id == id);
            if (idx >= 0) state.transactions[idx] = { ...state.transactions[idx], ...localData };
        } else {
            state.transactions.unshift({ id: Date.now().toString(), ...localData });
        }

        const wIdx = state.wallets.findIndex(w => w.id == walletId);
        if (wIdx >= 0) {
            state.wallets[wIdx].balance += (type === 'income' ? Number(amount) : -Number(amount));
        }

        renderTransactions();

        // Fetch background
        loadTransactions(true);
        loadDashboard(true);
    }
}

function editTransaction(id) { openTransactionModal(id); }

async function deleteTransaction(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;

    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        state.transactions = state.transactions.filter(t => t.id != id);
        showToast('Berhasil dihapus (Mode Preview Lokal)', 'success');
        loadDashboard();
        renderTransactions();
        return;
    }

    const res = await apiPost({ action: 'deleteTransaction', id });
    if (res) {
        cache.dashboard = {}; // Invalidasi
        state.transactions = state.transactions.filter(t => t.id != id);
        renderTransactions();

        loadTransactions(true);
        loadDashboard(true);
    }
}

// Wallet Modal
function openWalletModal(id = null) {
    const modal = document.getElementById('modal-wallet');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const title = document.getElementById('wallet-modal-title');
    const form = document.getElementById('form-wallet');
    form.reset();
    document.getElementById('wallet-id').value = '';
    const wPrevReset = document.getElementById('wallet-balance-preview');
    if (wPrevReset) wPrevReset.textContent = '';

    if (id) {
        title.textContent = 'Edit Dompet';
        const w = state.wallets.find(w => w.id == id);
        if (w) {
            document.getElementById('wallet-id').value = w.id;
            document.getElementById('wallet-name').value = w.name;
            const currentBal = w.initialBalance !== undefined ? w.initialBalance : w.balance;
            document.getElementById('wallet-balance').value = formatThousandInput(currentBal);
            const wPrev = document.getElementById('wallet-balance-preview');
            if (wPrev) wPrev.textContent = currentBal !== undefined && currentBal !== '' ? `Rp ${formatThousandInput(currentBal)}` : '';
        }
    } else {
        title.textContent = 'Tambah Dompet';
    }
}

async function saveWallet() {
    const id = document.getElementById('wallet-id').value;
    const name = document.getElementById('wallet-name').value;
    const rawBalance = document.getElementById('wallet-balance').value.replace(/\D/g, '');
    const balance = rawBalance !== '' ? Number(rawBalance) : '';

    if (!name || balance === '') {
        showToast('Mohon lengkapi semua field wajib.', 'error');
        return;
    }

    const data = { name, initialBalance: Number(balance) };
    const localData = { name, initialBalance: Number(balance), balance: Number(balance) };
    const action = id ? 'updateWallet' : 'addWallet';
    const payload = { action, data };
    if (id) payload.id = id;

    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        if (id) {
            const idx = state.wallets.findIndex(t => t.id == id);
            state.wallets[idx] = { ...state.wallets[idx], ...localData };
        } else {
            state.wallets.push({ id: Date.now().toString(), active: true, ...localData });
        }
        showToast('Berhasil disimpan (Mode Preview Lokal)', 'success');
        closeModals();
        renderWalletsGrid();
        return;
    }

    const res = await apiPost(payload);
    if (res) {
        cache.dashboard = {};
        closeModals();

        if (id) {
            const idx = state.wallets.findIndex(t => t.id == id);
            if (idx >= 0) state.wallets[idx] = { ...state.wallets[idx], ...localData };
        } else {
            state.wallets.push({ id: Date.now().toString(), active: true, ...localData });
        }
        renderWalletsGrid();

        loadWallets(true);
    }
}
function editWallet(id) { openWalletModal(id); }

// Category Modal
function openCategoryModal(id = null) {
    const modal = document.getElementById('modal-category');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const title = document.getElementById('cat-modal-title');
    const form = document.getElementById('form-category');
    form.reset();
    document.getElementById('cat-id').value = '';

    if (id) {
        title.textContent = 'Edit Kategori';
        const c = state.categories.find(c => c.id == id);
        if (c) {
            document.getElementById('cat-id').value = c.id;
            document.getElementById('cat-name').value = c.name;
            document.getElementById('cat-type').value = c.type;
        }
    } else {
        title.textContent = 'Tambah Kategori';
    }
}

async function saveCategory() {
    const id = document.getElementById('cat-id').value;
    const name = document.getElementById('cat-name').value;
    const type = document.getElementById('cat-type').value;

    if (!name || !type) {
        showToast('Mohon lengkapi semua field wajib.', 'error');
        return;
    }

    const data = { name, type };
    const action = id ? 'updateCategory' : 'addCategory';
    const payload = { action, data };
    if (id) payload.id = id;

    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        if (id) {
            const idx = state.categories.findIndex(t => t.id == id);
            state.categories[idx] = { id, ...data };
        } else {
            state.categories.push({ id: Date.now().toString(), ...data });
        }
        showToast('Berhasil disimpan (Mode Preview Lokal)', 'success');
        closeModals();
        renderCategories();
        return;
    }

    const res = await apiPost(payload);
    if (res) {
        closeModals();

        if (id) {
            const idx = state.categories.findIndex(t => t.id == id);
            if (idx >= 0) state.categories[idx] = { id, ...data };
        } else {
            state.categories.push({ id: Date.now().toString(), ...data });
        }
        renderCategories();

        loadCategories(true);
    }
}
function editCategory(id) { openCategoryModal(id); }

async function deleteCategory(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus kategori ini?')) return;

    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        state.categories = state.categories.filter(t => t.id != id);
        showToast('Berhasil dihapus (Mode Preview Lokal)', 'success');
        renderCategories();
        return;
    }

    const res = await apiPost({ action: 'deleteCategory', id });
    if (res) {
        state.categories = state.categories.filter(t => t.id != id);
        renderCategories();

        loadCategories(true);
    }
}

// ==========================================
// MOCK DATA FOR PREVIEW
// ==========================================
function setupDummyData() {
    state.wallets = [
        { id: '1', name: 'BCA Utama', initialBalance: 15700000, balance: 15700000, active: true },
        { id: '2', name: 'Gopay', initialBalance: 250000, balance: 250000, active: true },
        { id: '3', name: 'Tunai', initialBalance: 500000, balance: 500000, active: true }
    ];
    state.categories = [
        { id: '1', name: 'Gaji', type: 'income' },
        { id: '2', name: 'Bonus', type: 'income' },
        { id: '3', name: 'Makan', type: 'expense' },
        { id: '4', name: 'Transportasi', type: 'expense' },
        { id: '5', name: 'Hiburan', type: 'expense' }
    ];
    state.transactions = [
        { id: '1', type: 'expense', amount: 50000, date: new Date().toISOString().split('T')[0], time: '12:30', dateTime: `${new Date().toISOString().split('T')[0]}T12:30:00`, walletId: '2', walletName: 'Gopay', categoryId: '3', category: 'Makan', note: 'Makan Siang' },
        { id: '2', type: 'expense', amount: 150000, date: new Date().toISOString().split('T')[0], time: '08:15', dateTime: `${new Date().toISOString().split('T')[0]}T08:15:00`, walletId: '1', walletName: 'BCA Utama', categoryId: '4', category: 'Transportasi', note: 'Isi Bensin' },
        { id: '3', type: 'income', amount: 5000000, date: new Date(Date.now() - 86400000).toISOString().split('T')[0], time: '09:00', dateTime: `${new Date(Date.now() - 86400000).toISOString().split('T')[0]}T09:00:00`, walletId: '1', walletName: 'BCA Utama', categoryId: '1', category: 'Gaji', note: 'Gaji Bulan Ini' },
        { id: '4', type: 'expense', amount: 300000, date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], time: '19:45', dateTime: `${new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0]}T19:45:00`, walletId: '1', walletName: 'BCA Utama', categoryId: '5', category: 'Hiburan', note: 'Nonton Bioskop' }
    ];

    // Populate filter dropdowns
    populateTxFilterOptions();

    // Simulate dashboard values
    document.getElementById('metric-balance').textContent = formatIDR(16450000);
    document.getElementById('metric-income').textContent = formatIDR(5000000);
    document.getElementById('metric-expense').textContent = formatIDR(500000);
    renderFinancialReport(5000000, 500000);
}

// Start app
document.addEventListener('DOMContentLoaded', init);


// ==========================================
// MATERIAL ANALOG CLOCK PICKER LOGIC
// ==========================================
let clockState = {
    mode: 'hour',
    hour: 12,
    minute: 0,
    period: 'AM'
};

function openClockPicker() {
    const timeVal = document.getElementById('tx-time')?.value || '';
    if (timeVal && timeVal.includes(':')) {
        const [h, m] = timeVal.split(':').map(Number);
        clockState.period = h >= 12 ? 'PM' : 'AM';
        clockState.hour = h % 12 || 12;
        clockState.minute = m || 0;
    } else {
        const now = new Date();
        const curH = now.getHours();
        clockState.period = curH >= 12 ? 'PM' : 'AM';
        clockState.hour = curH % 12 || 12;
        clockState.minute = now.getMinutes();
    }

    clockState.mode = 'hour';
    const modal = document.getElementById('modal-clock-picker');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    renderClockPicker();
    setupClockFaceEvents();
}

function closeClockPicker() {
    const modal = document.getElementById('modal-clock-picker');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function confirmClockPicker() {
    let h = clockState.hour;
    if (clockState.period === 'PM' && h < 12) h += 12;
    if (clockState.period === 'AM' && h === 12) h = 0;
    const timeStr = `${String(h).padStart(2, '0')}:${String(clockState.minute).padStart(2, '0')}`;
    
    const timeInput = document.getElementById('tx-time');
    if (timeInput) timeInput.value = timeStr;
    closeClockPicker();
}

function setClockMode(mode) {
    clockState.mode = mode;
    renderClockPicker();
}

function setClockPeriod(period) {
    clockState.period = period;
    renderClockHeader();
}

function setClockToNow() {
    const now = new Date();
    const curH = now.getHours();
    clockState.period = curH >= 12 ? 'PM' : 'AM';
    clockState.hour = curH % 12 || 12;
    clockState.minute = now.getMinutes();
    renderClockPicker();
}

function renderClockHeader() {
    const hourBtn = document.getElementById('clock-btn-hour');
    const minBtn = document.getElementById('clock-btn-minute');
    const amBtn = document.getElementById('clock-btn-am');
    const pmBtn = document.getElementById('clock-btn-pm');

    if (hourBtn) {
        hourBtn.textContent = String(clockState.hour).padStart(2, '0');
        if (clockState.mode === 'hour') {
            hourBtn.className = 'px-2.5 py-1 rounded-xl bg-secondary/15 text-secondary font-bold transition-all';
        } else {
            hourBtn.className = 'px-2.5 py-1 rounded-xl text-on-surface-variant dark:text-slate-400 hover:bg-surface-container-low dark:hover:bg-slate-700 transition-all';
        }
    }

    if (minBtn) {
        minBtn.textContent = String(clockState.minute).padStart(2, '0');
        if (clockState.mode === 'minute') {
            minBtn.className = 'px-2.5 py-1 rounded-xl bg-secondary/15 text-secondary font-bold transition-all';
        } else {
            minBtn.className = 'px-2.5 py-1 rounded-xl text-on-surface-variant dark:text-slate-400 hover:bg-surface-container-low dark:hover:bg-slate-700 transition-all';
        }
    }

    if (amBtn && pmBtn) {
        if (clockState.period === 'AM') {
            amBtn.className = 'px-3 py-1 bg-secondary text-white font-bold transition-colors';
            pmBtn.className = 'px-3 py-1 bg-surface-container-low dark:bg-slate-700 text-on-surface-variant dark:text-slate-400 font-semibold transition-colors';
        } else {
            pmBtn.className = 'px-3 py-1 bg-secondary text-white font-bold transition-colors';
            amBtn.className = 'px-3 py-1 bg-surface-container-low dark:bg-slate-700 text-on-surface-variant dark:text-slate-400 font-semibold transition-colors';
        }
    }
}

function renderClockPicker() {
    renderClockHeader();

    const numbersContainer = document.getElementById('clock-numbers');
    const hand = document.getElementById('clock-hand');
    if (!numbersContainer || !hand) return;

    numbersContainer.innerHTML = '';
    const radius = 80;
    const center = 110;

    if (clockState.mode === 'hour') {
        const angle = (clockState.hour % 12) * 30;
        hand.style.transform = `translateX(-50%) rotate(${angle + 180}deg)`;

        for (let h = 1; h <= 12; h++) {
            const rad = (h * 30 - 90) * (Math.PI / 180);
            const x = center + radius * Math.cos(rad);
            const y = center + radius * Math.sin(rad);
            const isSelected = h === clockState.hour;

            const el = document.createElement('div');
            el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${isSelected ? 'text-secondary font-bold' : 'text-on-surface dark:text-slate-200'}`;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.textContent = h;
            numbersContainer.appendChild(el);
        }
    } else {
        const angle = clockState.minute * 6;
        hand.style.transform = `translateX(-50%) rotate(${angle + 180}deg)`;

        for (let m = 0; m < 60; m += 5) {
            const rad = (m * 6 - 90) * (Math.PI / 180);
            const x = center + radius * Math.cos(rad);
            const y = center + radius * Math.sin(rad);
            const isSelected = Math.abs(m - clockState.minute) <= 2;

            const el = document.createElement('div');
            el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${isSelected ? 'text-secondary font-bold' : 'text-on-surface dark:text-slate-200'}`;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.textContent = String(m).padStart(2, '0');
            numbersContainer.appendChild(el);
        }
    }
}

let clockEventsBound = false;
function setupClockFaceEvents() {
    if (clockEventsBound) return;
    const face = document.getElementById('clock-face');
    if (!face) return;
    clockEventsBound = true;

    const handlePointer = (e) => {
        const rect = face.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;

        let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (deg < 0) deg += 360;

        if (clockState.mode === 'hour') {
            let h = Math.round(deg / 30);
            if (h === 0) h = 12;
            clockState.hour = h;
            renderClockPicker();

            // Auto-switch to minutes mode after selecting hour
            setTimeout(() => {
                if (clockState.mode === 'hour') {
                    clockState.mode = 'minute';
                    renderClockPicker();
                }
            }, 250);
        } else {
            let m = Math.round(deg / 6);
            if (m === 60) m = 0;
            clockState.minute = m;
            renderClockPicker();
        }
    };

    face.addEventListener('click', handlePointer);
    face.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handlePointer(e);
    }, { passive: false });
}
