/**
 * KASIR LANJUT TINGKAT ATAS
 * General Client Application Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
    // Global Toast Notification Helper
    window.showToast = function(message, type = 'success') {
        const toastEl = document.getElementById('appToast');
        const toastMsg = document.getElementById('toastMessage');
        if (!toastEl || !toastMsg) return;

        // Reset classes
        toastEl.className = 'toast align-items-center text-white border-0 shadow-lg';

        let icon = 'bi-check-circle-fill';
        if (type === 'success') {
            toastEl.classList.add('bg-success');
            icon = 'bi-check-circle-fill';
        } else if (type === 'error' || type === 'danger') {
            toastEl.classList.add('bg-danger');
            icon = 'bi-exclamation-triangle-fill';
        } else if (type === 'warning') {
            toastEl.classList.add('bg-warning', 'text-dark');
            icon = 'bi-exclamation-circle-fill';
        } else {
            toastEl.classList.add('bg-info', 'text-dark');
            icon = 'bi-info-circle-fill';
        }

        toastMsg.innerHTML = `<i class="bi ${icon} me-2 fs-5"></i><span>${message}</span>`;
        const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
        toast.show();
    };

    // Format currency to IDR
    window.formatRupiah = function(number) {
        return 'Rp ' + Number(number || 0).toLocaleString('id-ID');
    };
});
