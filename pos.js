/**
 * KASIR LANJUT TINGKAT ATAS
 * Point of Sale (POS) Interactive JavaScript Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let products = [];
    let cart = []; // [{ id, name, sku, price, stock, unit, qty, discount, total }]
    let activeCategoryId = '';
    let searchQuery = '';
    let searchDebounceTimer = null;

    // Elements
    const productGrid = document.getElementById('productGrid');
    const searchInput = document.getElementById('posSearchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const categoryTabs = document.getElementById('categoryTabs');
    const cartList = document.getElementById('cartList');
    const cartEmptyMessage = document.getElementById('cartEmptyMessage');
    const cartItemCountBadge = document.getElementById('cartItemCountBadge');
    const btnResetCart = document.getElementById('btnResetCart');

    const summarySubtotal = document.getElementById('summarySubtotal');
    const inputDiscount = document.getElementById('inputDiscount');
    const inputTax = document.getElementById('inputTax');
    const summaryGrandTotal = document.getElementById('summaryGrandTotal');

    const payMethodRadios = document.querySelectorAll('input[name="payment_method"]');
    const cashInputArea = document.getElementById('cashInputArea');
    const inputAmountPaid = document.getElementById('inputAmountPaid');
    const summaryChange = document.getElementById('summaryChange');
    const changeBox = document.getElementById('changeBox');
    const denomButtons = document.querySelectorAll('.denom-btn');
    const btnCheckout = document.getElementById('btnCheckout');
    const customerSelect = document.getElementById('customerSelect');

    const receiptModalEl = document.getElementById('receiptModal');
    const receiptModal = new bootstrap.Modal(receiptModalEl);
    const btnPrintReceipt = document.getElementById('btnPrintReceipt');

    // ----------------------------------------------------
    // 1. Fetch & Render Catalog
    // ----------------------------------------------------
    async function loadProducts() {
        productGrid.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                Memuat katalog produk...
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (activeCategoryId) params.append('category_id', activeCategoryId);
            if (searchQuery) params.append('search', searchQuery);

            const res = await fetch(`${window.APP_CONFIG.baseUrl}/api/pos/products?${params.toString()}`);
            const json = await res.json();

            if (json.status === 'success') {
                products = json.data;
                renderProducts();
            } else {
                productGrid.innerHTML = `<div class="col-12 text-center py-4 text-danger">${json.message || 'Gagal memuat produk.'}</div>`;
            }
        } catch (err) {
            productGrid.innerHTML = `<div class="col-12 text-center py-4 text-danger">Koneksi bermasalah saat memuat katalog produk.</div>`;
        }
    }

    function renderProducts() {
        if (!products.length) {
            productGrid.innerHTML = `
                <div class="col-12 text-center py-5 text-muted">
                    <i class="bi bi-search fs-1 text-secondary opacity-50 d-block mb-2"></i>
                    <span>Produk tidak ditemukan. Coba kata kunci atau kategori lain.</span>
                </div>
            `;
            return;
        }

        productGrid.innerHTML = products.map(prod => {
            const isOutOfStock = prod.stock <= 0;
            let stockBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle">Stok: ${prod.stock} ${prod.unit}</span>`;
            if (isOutOfStock) {
                stockBadge = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Habis</span>`;
            } else if (prod.stock_status === 'low_stock') {
                stockBadge = `<span class="badge bg-warning-subtle text-warning border border-warning-subtle">Sisa ${prod.stock} ${prod.unit}</span>`;
            }

            return `
                <div class="col">
                    <div class="card h-100 product-card shadow-sm rounded-3 ${isOutOfStock ? 'out-of-stock' : ''}" 
                         data-id="${prod.id}">
                        <div class="card-body p-3 d-flex flex-column justify-content-between">
                            <div>
                                <div class="d-flex justify-content-between align-items-start mb-1">
                                    <span class="text-muted" style="font-size: 0.72rem;">${prod.sku}</span>
                                    ${stockBadge}
                                </div>
                                <h6 class="card-title fw-bold text-dark mb-1" style="font-size: 0.92rem; line-height: 1.3;">
                                    ${escapeHtml(prod.name)}
                                </h6>
                                <span class="badge bg-light text-secondary border small" style="font-size: 0.7rem;">
                                    ${escapeHtml(prod.category_name)}
                                </span>
                            </div>
                            <div class="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                                <span class="fw-bold text-primary fs-6">
                                    ${window.formatRupiah(prod.selling_price)}
                                </span>
                                <button type="button" class="btn btn-sm btn-primary rounded-circle p-1 d-flex align-items-center justify-content-center" 
                                        style="width: 28px; height: 28px;" ${isOutOfStock ? 'disabled' : ''} title="Tambah ke keranjang">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners to cards
        productGrid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.getAttribute('data-id'), 10);
                const prod = products.find(p => p.id === id);
                if (prod && prod.stock > 0) {
                    addToCart(prod);
                } else if (prod && prod.stock <= 0) {
                    window.showToast(`Stok untuk produk "${prod.name}" sedang habis.`, 'warning');
                }
            });
        });
    }

    // ----------------------------------------------------
    // 2. Cart Operations
    // ----------------------------------------------------
    function addToCart(product) {
        const existing = cart.find(item => item.id === product.id);

        if (existing) {
            if (existing.qty + 1 > product.stock) {
                window.showToast(`Maksimal stok tercapai (${product.stock} ${product.unit}).`, 'warning');
                return;
            }
            existing.qty += 1;
            existing.total = existing.qty * existing.price;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                sku: product.sku,
                price: product.selling_price,
                stock: product.stock,
                unit: product.unit,
                qty: 1,
                discount: 0,
                total: product.selling_price
            });
        }

        renderCart();
    }

    function updateQty(productId, newQty) {
        const item = cart.find(i => i.id === productId);
        if (!item) return;

        if (newQty <= 0) {
            removeFromCart(productId);
            return;
        }

        if (newQty > item.stock) {
            window.showToast(`Jumlah melebihi stok yang tersedia (${item.stock} ${item.unit}).`, 'warning');
            item.qty = item.stock;
        } else {
            item.qty = newQty;
        }

        item.total = item.qty * item.price;
        renderCart();
    }

    function removeFromCart(productId) {
        cart = cart.filter(i => i.id !== productId);
        renderCart();
    }

    function resetCart() {
        if (!cart.length) return;
        if (confirm('Kosongkan semua item di keranjang?')) {
            cart = [];
            inputDiscount.value = 0;
            inputTax.value = 0;
            inputAmountPaid.value = '';
            renderCart();
        }
    }

    function renderCart() {
        if (!cart.length) {
            cartEmptyMessage.classList.remove('d-none');
            cartList.classList.add('d-none');
            cartList.innerHTML = '';
            cartItemCountBadge.textContent = '0 Item';
            updateTotals();
            return;
        }

        cartEmptyMessage.classList.add('d-none');
        cartList.classList.remove('d-none');

        const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);
        cartItemCountBadge.textContent = `${totalItemsCount} Item (${cart.length} Produk)`;

        cartList.innerHTML = cart.map(item => `
            <li class="list-group-item px-0 py-2 cart-item-row" data-id="${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div class="me-2">
                        <strong class="d-block text-dark small" style="line-height: 1.2;">${escapeHtml(item.name)}</strong>
                        <span class="text-muted" style="font-size: 0.72rem;">${window.formatRupiah(item.price)} / ${item.unit}</span>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm p-0 border-0 btn-remove-item text-danger" 
                            title="Hapus item" data-id="${item.id}" style="width: 22px; height: 22px;">
                        <i class="bi bi-x-circle-fill"></i>
                    </button>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <!-- Stepper -->
                    <div class="d-flex align-items-center gap-1">
                        <button type="button" class="btn btn-sm btn-outline-secondary qty-stepper-btn btn-minus" data-id="${item.id}">-</button>
                        <input type="number" class="qty-stepper-input input-item-qty" value="${item.qty}" min="1" max="${item.stock}" data-id="${item.id}">
                        <button type="button" class="btn btn-sm btn-outline-secondary qty-stepper-btn btn-plus" data-id="${item.id}">+</button>
                    </div>
                    <!-- Subtotal per item -->
                    <span class="fw-bold text-dark small">
                        ${window.formatRupiah(item.total)}
                    </span>
                </div>
            </li>
        `).join('');

        // Attach cart events
        cartList.querySelectorAll('.btn-minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const item = cart.find(i => i.id === id);
                if (item) updateQty(id, item.qty - 1);
            });
        });

        cartList.querySelectorAll('.btn-plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const item = cart.find(i => i.id === id);
                if (item) updateQty(id, item.qty + 1);
            });
        });

        cartList.querySelectorAll('.input-item-qty').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(input.getAttribute('data-id'), 10);
                const val = parseInt(input.value, 10) || 1;
                updateQty(id, val);
            });
        });

        cartList.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-id'), 10);
                removeFromCart(id);
            });
        });

        updateTotals();
    }

    // ----------------------------------------------------
    // 3. Totals & Payment Calculations
    // ----------------------------------------------------
    function getTotals() {
        const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        const discount = Math.max(0, parseFloat(inputDiscount.value) || 0);
        const tax = Math.max(0, parseFloat(inputTax.value) || 0);
        const grandTotal = Math.max(0, (subtotal - discount) + tax);

        return { subtotal, discount, tax, grandTotal };
    }

    function updateTotals() {
        const { subtotal, discount, tax, grandTotal } = getTotals();

        summarySubtotal.textContent = window.formatRupiah(subtotal);
        summaryGrandTotal.textContent = window.formatRupiah(grandTotal);

        updateChange();
    }

    function updateChange() {
        const { grandTotal } = getTotals();
        const activeMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'cash';

        if (activeMethod !== 'cash') {
            summaryChange.textContent = 'Rp 0';
            summaryChange.className = 'fw-bold text-success fs-5';
            return;
        }

        const paid = parseFloat(inputAmountPaid.value) || 0;
        const change = paid - grandTotal;

        if (paid <= 0) {
            summaryChange.textContent = 'Rp 0';
            summaryChange.className = 'fw-bold text-muted fs-5';
        } else if (change >= 0) {
            summaryChange.textContent = window.formatRupiah(change);
            summaryChange.className = 'fw-bold text-success fs-5';
        } else {
            summaryChange.textContent = `Kurang ${window.formatRupiah(Math.abs(change))}`;
            summaryChange.className = 'fw-bold text-danger fs-5';
        }
    }

    // ----------------------------------------------------
    // 4. Denomination Shortcuts & Payment Mode
    // ----------------------------------------------------
    denomButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const denom = btn.getAttribute('data-denom');
            const { grandTotal } = getTotals();

            if (denom === 'exact') {
                inputAmountPaid.value = grandTotal;
            } else {
                inputAmountPaid.value = parseFloat(denom);
            }
            updateChange();
        });
    });

    payMethodRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'cash') {
                cashInputArea.classList.remove('d-none');
            } else {
                cashInputArea.classList.add('d-none');
            }
            updateChange();
        });
    });

    inputDiscount.addEventListener('input', updateTotals);
    inputTax.addEventListener('input', updateTotals);
    inputAmountPaid.addEventListener('input', updateChange);
    btnResetCart.addEventListener('click', resetCart);

    // ----------------------------------------------------
    // 5. Category Tabs & Search
    // ----------------------------------------------------
    categoryTabs.querySelectorAll('.cat-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            categoryTabs.querySelectorAll('.cat-filter-btn').forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-outline-secondary');
            });
            btn.classList.add('btn-primary', 'active');
            btn.classList.remove('btn-outline-secondary');

            activeCategoryId = btn.getAttribute('data-category-id');
            loadProducts();
        });
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchQuery = searchInput.value.trim();
            loadProducts();
        }, 250);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        loadProducts();
        searchInput.focus();
    });

    // F2 Hotkey to jump to search bar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    // ----------------------------------------------------
    // 6. Checkout & Receipt Modal
    // ----------------------------------------------------
    btnCheckout.addEventListener('click', async () => {
        if (!cart.length) {
            window.showToast('Keranjang belanja masih kosong! Silakan pilih produk.', 'warning');
            return;
        }

        const { grandTotal, discount, tax } = getTotals();
        const activeMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'cash';
        let amountPaid = parseFloat(inputAmountPaid.value) || 0;

        if (activeMethod === 'cash') {
            if (amountPaid < grandTotal) {
                window.showToast(`Nominal uang diterima kurang! Total tagihan adalah ${window.formatRupiah(grandTotal)}.`, 'danger');
                inputAmountPaid.focus();
                return;
            }
        } else {
            amountPaid = grandTotal;
        }

        // Disable button & show spinner
        btnCheckout.disabled = true;
        const originalBtnHtml = btnCheckout.innerHTML;
        btnCheckout.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span> Memproses Transaksi...`;

        try {
            const payload = {
                customer_id: customerSelect.value || null,
                items: cart.map(i => ({ id: i.id, quantity: i.qty })),
                discount: discount,
                tax: tax,
                payment_method: activeMethod,
                amount_paid: amountPaid,
                _csrf_token: window.APP_CONFIG.csrfToken
            };

            const res = await fetch(`${window.APP_CONFIG.baseUrl}/api/pos/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();

            if (json.status === 'success') {
                window.showToast('Transaksi berhasil diproses!', 'success');

                // Load and show receipt modal
                await showReceipt(json.data.transaction_id);

                // Clear cart & reset fields
                cart = [];
                inputDiscount.value = 0;
                inputTax.value = 0;
                inputAmountPaid.value = '';
                renderCart();

                // Reload product catalog to reflect updated stocks
                loadProducts();
            } else {
                window.showToast(json.message || 'Gagal memproses transaksi.', 'danger');
            }
        } catch (err) {
            window.showToast('Terjadi kesalahan koneksi saat memproses checkout.', 'danger');
        } finally {
            btnCheckout.disabled = false;
            btnCheckout.innerHTML = originalBtnHtml;
        }
    });

    async function showReceipt(transactionId) {
        try {
            const res = await fetch(`${window.APP_CONFIG.baseUrl}/api/pos/receipt/${transactionId}`);
            const json = await res.json();

            if (json.status === 'success' && json.data) {
                const data = json.data;
                const trx = data.transaction;
                const items = data.items;

                document.getElementById('rcptStoreName').textContent = trx.store_name || 'Toko';
                document.getElementById('rcptStoreAddress').textContent = trx.store_address || '';
                document.getElementById('rcptStorePhone').textContent = trx.store_phone ? `Telp: ${trx.store_phone}` : '';

                document.getElementById('rcptInvoiceNo').textContent = trx.invoice_number;
                document.getElementById('rcptDateTime').textContent = trx.transaction_date;
                document.getElementById('rcptCashierName').textContent = trx.cashier_name || 'Kasir';
                document.getElementById('rcptCustomerName').textContent = trx.customer_name || 'Walk-in';

                const itemsListEl = document.getElementById('rcptItemsList');
                itemsListEl.innerHTML = '';
                items.forEach(it => {
                    const row = document.createElement('div');
                    row.className = 'rcpt-small mb-1';
                    row.innerHTML = `
                        <div class="fw-semibold">${escapeHtml(it.product_name)}</div>
                        <div class="d-flex justify-content-between text-muted">
                            <span>${it.quantity} x ${window.formatRupiah(it.unit_price)}</span>
                            <span class="text-dark">${window.formatRupiah(it.total)}</span>
                        </div>
                    `;
                    itemsListEl.appendChild(row);
                });

                document.getElementById('rcptSubtotal').textContent = window.formatRupiah(trx.subtotal);
                document.getElementById('rcptDiscount').textContent = window.formatRupiah(trx.discount);
                document.getElementById('rcptTax').textContent = window.formatRupiah(trx.tax);
                document.getElementById('rcptTotal').textContent = window.formatRupiah(trx.total);

                document.getElementById('rcptMethod').textContent = trx.payment_method;
                document.getElementById('rcptPaid').textContent = window.formatRupiah(trx.payment_amount || trx.total);
                document.getElementById('rcptChange').textContent = window.formatRupiah(trx.change_amount || 0);

                const openReceiptBtn = document.getElementById('btnOpenFullReceipt');
                if (openReceiptBtn) {
                    openReceiptBtn.href = `${window.APP_CONFIG.baseUrl}/transaksi/${transactionId}/struk`;
                }

                receiptModal.show();
            }
        } catch (err) {
            console.error('Error fetching receipt data:', err);
        }
    }

    btnPrintReceipt.addEventListener('click', () => {
        window.print();
    });

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initialize catalog on load
    loadProducts();
});
