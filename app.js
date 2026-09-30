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
    currentPeriod: 'today'
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

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    } else {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
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
        'wallets': 'Dompet',
        'categories': 'Kategori'
    };
    const titleEl = document.getElementById('mobile-page-title');
    if (titleEl) titleEl.textContent = titles[pageId] || 'FinTrack';

    // Refresh Data if needed
    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'transactions') loadTransactions();
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
    if (tx.date && !tx.dateTime) return tx; // Local dummy
    
    let dateStr = '';
    if (tx.dateTime) {
        dateStr = String(tx.dateTime).split('T')[0];
    }
    
    return {
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount) || 0,
        date: dateStr,
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
        ]);
    }

    // Select dashboard periods
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.period-btn').forEach(b => {
                b.classList.remove('bg-primary', 'text-white');
                b.classList.add('bg-surface-container-low', 'dark:bg-slate-700', 'text-on-surface-variant', 'dark:text-slate-400');
            });
            e.currentTarget.classList.remove('bg-surface-container-low', 'dark:bg-slate-700', 'text-on-surface-variant', 'dark:text-slate-400');
            e.currentTarget.classList.add('bg-primary', 'text-white');
            state.currentPeriod = e.currentTarget.getAttribute('data-period');
            loadDashboard();
        });
    });

    // Search and Filter Listeners for Transactions
    document.getElementById('search-tx').addEventListener('input', renderTransactions);
    document.getElementById('filter-type').addEventListener('change', renderTransactions);

    // Initial load
    navigateTo('dashboard');
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
    }
}

async function loadCategoriesData(forceRefresh = false) {
    if (!forceRefresh && cache.categories && (Date.now() - cache.categories < CACHE_DURATION)) return;
    const res = await apiGet('getCategories');
    if (res && res.data) {
        state.categories = res.data.map(mapCategory);
        cache.categories = Date.now();
    }
}

async function loadDashboard(forceRefresh = false) {
    if (API_BASE_URL.includes("MASUKKAN_URL")) {
        renderDashboardTransactions(state.transactions.slice(0, 5));
        renderDashboardWallets();
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
    document.getElementById('metric-balance').textContent = formatIDR(data.totalBalance || 0);
    document.getElementById('metric-income').textContent = formatIDR(data.totalIncome || 0);
    document.getElementById('metric-expense').textContent = formatIDR(data.totalExpense || 0);

    const recentTx = (data.recentTransactions || []).map(mapTx);
    renderDashboardTransactions(recentTx);
    
    if (data.wallets) {
        state.wallets = data.wallets.map(mapWallet);
        cache.wallets = Date.now();
    }
    renderDashboardWallets();
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
            ? `${formatDate(tx.date)} &bull; ${tx.fromWalletName} &rarr; ${tx.toWalletName}`
            : `${formatDate(tx.date)} &bull; ${tx.walletName || 'Dompet'}`;
            
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
    const search = document.getElementById('search-tx').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;

    let filtered = state.transactions.filter(tx => {
        const matchSearch = (tx.note || '').toLowerCase().includes(search) || (tx.category || '').toLowerCase().includes(search);
        const matchType = typeFilter ? tx.type === typeFilter : true;
        return matchSearch && matchType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-sm text-on-surface-variant dark:text-slate-400 bg-surface-container-lowest dark:bg-slate-800 rounded-xl border border-outline/5 dark:border-slate-700">Tidak ada data transaksi yang sesuai.</div>`;
        return;
    }

    container.innerHTML = filtered.map(tx => {
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
        
        // Gunakan kategori sebagai judul jika deskripsi/note kosong
        const title = tx.note ? tx.note : (isTransfer ? 'Transfer Saldo' : tx.category);
        const subtitle = isTransfer 
            ? `${formatDate(tx.date)} &bull; ${tx.fromWalletName} &rarr; ${tx.toWalletName}`
            : `${formatDate(tx.date)} &bull; ${tx.walletName || 'Dompet'} &bull; ${tx.category}`;
            
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
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (filteredTx.length === 0) {
        txContainer.innerHTML = `<p class="text-sm text-on-surface-variant dark:text-slate-400 py-8 text-center bg-surface-container-low dark:bg-slate-700/50 rounded-xl">Belum ada transaksi di dompet ini.</p>`;
    } else {
        txContainer.innerHTML = filteredTx.map(tx => {
            let isIncome = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';
            
            let color = isIncome ? 'text-secondary' : 'text-error';
            let sign = isIncome ? '+' : '-';
            let title = tx.note ? tx.note : tx.category;
            let subtitle = `${formatDate(tx.date)} &bull; ${tx.category}`;

            if (isTransfer) {
                if (tx.toWallet == walletId) {
                    // Masuk dari transfer
                    color = 'text-primary';
                    sign = '+';
                    title = tx.note || 'Terima Transfer';
                    subtitle = `${formatDate(tx.date)} &bull; Dari ${tx.fromWalletName}`;
                } else {
                    // Keluar karena transfer
                    color = 'text-on-surface-variant dark:text-slate-400';
                    sign = '-';
                    title = tx.note || 'Kirim Transfer';
                    subtitle = `${formatDate(tx.date)} &bull; Ke ${tx.toWalletName}`;
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
    ['modal-transaction', 'modal-wallet', 'modal-category', 'modal-export'].forEach(id => {
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
    today.setHours(0,0,0,0);
    
    let start = new Date(today);
    let end = new Date(today);
    end.setHours(23,59,59,999);

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
        start.setHours(0,0,0,0);
        end = new Date(customEnd);
        end.setHours(23,59,59,999);
    }
    
    return { start, end };
}

function exportData(format) {
    const range = getExportDateRange();
    if (!range) {
        showToast('Mohon pilih tanggal mulai dan selesai.', 'error');
        return;
    }

    const { start, end } = range;
    
    const filteredTx = state.transactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= start && txDate <= end;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (filteredTx.length === 0) {
        showToast('Tidak ada transaksi pada rentang waktu tersebut.', 'error');
        return;
    }

    let totalIncome = 0;
    let totalExpense = 0;
    filteredTx.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        if (tx.type === 'expense') totalExpense += tx.amount;
    });

    const periodStr = `${start.toLocaleDateString('id-ID')} - ${end.toLocaleDateString('id-ID')}`;

    if (format === 'csv') {
        let csv = 'Tanggal,Tipe,Kategori,Dompet,Jumlah,Catatan\n';
        filteredTx.forEach(tx => {
            const dateStr = formatDate(tx.date);
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
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("Laporan Keuangan", 14, 20);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Periode: ${periodStr}`, 14, 28);
        
        doc.text(`Total Pemasukan: ${formatIDR(totalIncome)}`, 14, 35);
        doc.text(`Total Pengeluaran: ${formatIDR(totalExpense)}`, 14, 41);
        doc.text(`Surplus/Defisit: ${formatIDR(totalIncome - totalExpense)}`, 14, 47);

        const tableColumn = ["Tanggal", "Tipe", "Kategori", "Dompet", "Jumlah", "Catatan"];
        const tableRows = [];

        filteredTx.forEach(tx => {
            const dateStr = formatDate(tx.date);
            const typeStr = tx.type === 'income' ? 'Pemasukan' : (tx.type === 'expense' ? 'Pengeluaran' : 'Transfer');
            const catStr = tx.category || '-';
            const walletStr = tx.type === 'transfer' ? `${tx.fromWalletName} -> ${tx.toWalletName}` : (tx.walletName || '-');
            const amountStr = formatIDR(tx.amount);
            const noteStr = tx.note || '-';
            
            tableRows.push([dateStr, typeStr, catStr, walletStr, amountStr, noteStr]);
        });

        doc.autoTable({
            startY: 55,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [0, 108, 73] },
            styles: { fontSize: 8 }
        });

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
        if(labelTxWallet) labelTxWallet.textContent = 'Dompet Sumber';
        
        // Populate to-wallet if not populated
        const toWalletSelect = document.getElementById('tx-to-wallet');
        toWalletSelect.innerHTML = state.wallets.filter(w => w.active !== false).map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        
        // Remove 'required' from category so HTML5 form validation doesn't block submission
        document.getElementById('tx-category').removeAttribute('required');
    } else {
        toWalletContainer.classList.add('hidden');
        categoryContainer.classList.remove('hidden');
        if(labelTxWallet) labelTxWallet.textContent = 'Dompet';
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

    // Set default date to today
    document.getElementById('tx-date').valueAsDate = new Date();

    if (txId) {
        title.textContent = 'Edit Transaksi';
        const tx = state.transactions.find(t => t.id == txId);
        if (tx) {
            document.getElementById('tx-id').value = tx.id;
            document.querySelector(`input[name="tx-type"][value="${tx.type}"]`).checked = true;
            document.getElementById('tx-amount').value = tx.amount;
            document.getElementById('tx-date').value = tx.date;
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
        updateCategoryOptions();
    }
}

async function saveTransaction() {
    const id = document.getElementById('tx-id').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const amount = document.getElementById('tx-amount').value;
    const date = document.getElementById('tx-date').value;
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

    const data = {
        type, 
        amount: Number(amount), 
        dateTime: date, 
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
        type, amount: Number(amount), date, walletId, categoryId, note,
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

    if (id) {
        title.textContent = 'Edit Dompet';
        const w = state.wallets.find(w => w.id == id);
        if (w) {
            document.getElementById('wallet-id').value = w.id;
            document.getElementById('wallet-name').value = w.name;
            document.getElementById('wallet-balance').value = w.initialBalance !== undefined ? w.initialBalance : w.balance;
        }
    } else {
        title.textContent = 'Tambah Dompet';
    }
}

async function saveWallet() {
    const id = document.getElementById('wallet-id').value;
    const name = document.getElementById('wallet-name').value;
    const balance = document.getElementById('wallet-balance').value;

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
        { id: '1', type: 'expense', amount: 50000, date: new Date().toISOString().split('T')[0], walletId: '2', walletName: 'Gopay', categoryId: '3', category: 'Makan', note: 'Makan Siang' },
        { id: '2', type: 'expense', amount: 150000, date: new Date().toISOString().split('T')[0], walletId: '1', walletName: 'BCA Utama', categoryId: '4', category: 'Transportasi', note: 'Isi Bensin' },
        { id: '3', type: 'income', amount: 5000000, date: new Date(Date.now() - 86400000).toISOString().split('T')[0], walletId: '1', walletName: 'BCA Utama', categoryId: '1', category: 'Gaji', note: 'Gaji Bulan Ini' },
        { id: '4', type: 'expense', amount: 300000, date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], walletId: '1', walletName: 'BCA Utama', categoryId: '5', category: 'Hiburan', note: 'Nonton Bioskop' }
    ];

    // Simulate dashboard values
    document.getElementById('metric-balance').textContent = formatIDR(16450000);
    document.getElementById('metric-income').textContent = formatIDR(5000000);
    document.getElementById('metric-expense').textContent = formatIDR(500000);
}

// Start app
document.addEventListener('DOMContentLoaded', init);
