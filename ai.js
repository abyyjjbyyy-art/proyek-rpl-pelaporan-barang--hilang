/**
 * KASIR LANJUT TINGKAT ATAS
 * AI Business Assistant Client-side Script
 */

document.addEventListener('DOMContentLoaded', function () {
    const askForm = document.getElementById('aiAskForm');
    const questionInput = document.getElementById('aiQuestionInput');
    const btnSubmit = document.getElementById('btnAskSubmit');
    const spinner = document.getElementById('askSpinner');
    const btnText = document.getElementById('askBtnText');
    const chatFeed = document.getElementById('aiChatFeed');
    const emptyFeed = document.getElementById('aiEmptyFeed');
    const btnClearHistory = document.getElementById('btnClearAiHistory');
    const quickButtons = document.querySelectorAll('.quick-ask-btn');

    const baseUrl = window.APP_CONFIG ? window.APP_CONFIG.baseUrl : '';
    const csrfToken = window.APP_CONFIG ? window.APP_CONFIG.csrfToken : '';

    function scrollToBottom() {
        if (chatFeed) {
            chatFeed.scrollTop = chatFeed.scrollHeight;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatMarkdown(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        // Bold: **text**
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text* (excluding list items)
        html = html.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

        // Inline code: `code`
        html = html.replace(/`([^`]+)`/g, '<code class="bg-light px-1 rounded text-danger">$1</code>');

        // Horizontal dividers: ---
        html = html.replace(/---+/g, '<hr class="my-2 border-secondary-subtle">');

        // Process lists
        const lines = html.split('\n');
        let formattedLines = [];
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('* ') || line.startsWith('- ')) {
                if (!inList) {
                    formattedLines.push('<ul class="ps-3 mb-2 small">');
                    inList = true;
                }
                formattedLines.push(`<li>${line.substring(2)}</li>`);
            } else if (/^\d+\.\s/.test(line)) {
                if (inList) {
                    formattedLines.push('</ul>');
                    inList = false;
                }
                formattedLines.push(`<div class="mb-1 fw-medium">${line}</div>`);
            } else {
                if (inList) {
                    formattedLines.push('</ul>');
                    inList = false;
                }
                if (line === '') {
                    formattedLines.push('<div class="my-1"></div>');
                } else {
                    formattedLines.push(`<div>${line}</div>`);
                }
            }
        }

        if (inList) {
            formattedLines.push('</ul>');
        }

        return formattedLines.join('');
    }

    function appendUserMessage(question) {
        if (emptyFeed) {
            emptyFeed.remove();
        }

        const now = new Date();
        const timeStr = String(now.getDate()).padStart(2, '0') + '/' +
                        String(now.getMonth() + 1).padStart(2, '0') + '/' +
                        now.getFullYear() + ' ' +
                        String(now.getHours()).padStart(2, '0') + ':' +
                        String(now.getMinutes()).padStart(2, '0');

        const html = `
            <div class="d-flex justify-content-end mb-3">
                <div class="card bg-primary text-white border-0 shadow-sm rounded-3" style="max-width: 80%;">
                    <div class="card-body p-3 small">
                        <div class="fw-semibold mb-1 d-flex align-items-center justify-content-end gap-1">
                            <span>Anda</span>
                            <i class="bi bi-person-circle"></i>
                        </div>
                        <div class="text-break">${escapeHtml(question)}</div>
                        <div class="text-end text-white-50 mt-1" style="font-size: 0.7rem;">${timeStr}</div>
                    </div>
                </div>
            </div>
        `;

        chatFeed.insertAdjacentHTML('beforeend', html);
        scrollToBottom();
    }

    let currentSessionId = '';

    function appendAssistantMessage(answer, engineUsed, timeStr, conversationId, suggestions) {
        const engineLabel = escapeHtml(engineUsed || 'Rule-Based Engine');
        const formattedAnswer = formatMarkdown(answer);
        const convId = conversationId || 0;

        let suggestionsHtml = '';
        if (Array.isArray(suggestions) && suggestions.length > 0) {
            suggestionsHtml = `
                <div class="mt-3 pt-2 border-top">
                    <div class="text-secondary small fw-semibold mb-1" style="font-size: 0.72rem;">
                        <i class="bi bi-lightbulb text-warning me-1"></i> Pertanyaan Lanjutan yang Disarankan:
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                        ${suggestions.map(s => `
                            <button type="button" class="btn btn-outline-primary btn-sm rounded-pill dynamic-suggestion-btn py-0 px-2" style="font-size: 0.75rem;" data-question="${escapeHtml(s)}">
                                ${escapeHtml(s)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let feedbackHtml = '';
        if (convId > 0) {
            feedbackHtml = `
                <div class="d-flex align-items-center justify-content-between mt-2 pt-1 text-muted" style="font-size: 0.7rem;">
                    <div class="d-flex align-items-center gap-2 feedback-actions" data-conv-id="${convId}">
                        <span class="text-secondary">Apakah jawaban ini membantu?</span>
                        <button type="button" class="btn btn-link btn-sm p-0 text-secondary text-decoration-none btn-feedback" data-val="1" title="Jawaban sangat membantu">
                            <i class="bi bi-hand-thumbs-up"></i>
                        </button>
                        <button type="button" class="btn btn-link btn-sm p-0 text-secondary text-decoration-none btn-feedback" data-val="-1" title="Jawaban kurang memuaskan">
                            <i class="bi bi-hand-thumbs-down"></i>
                        </button>
                    </div>
                    <div>${escapeHtml(timeStr)}</div>
                </div>
            `;
        } else {
            feedbackHtml = `<div class="text-end text-muted mt-2" style="font-size: 0.7rem;">${escapeHtml(timeStr)}</div>`;
        }

        const html = `
            <div class="d-flex justify-content-start mb-3">
                <div class="card bg-white border shadow-sm rounded-3" style="max-width: 85%;">
                    <div class="card-body p-3 small">
                        <div class="fw-bold text-primary mb-2 d-flex align-items-center gap-1">
                            <i class="bi bi-robot"></i>
                            <span>AI Business Assistant</span>
                            <span class="badge bg-light text-muted border ms-2" style="font-size: 0.65rem;">${engineLabel}</span>
                        </div>
                        <div class="text-dark whitespace-pre-line">${formattedAnswer}</div>
                        ${suggestionsHtml}
                        ${feedbackHtml}
                    </div>
                </div>
            </div>
        `;

        chatFeed.insertAdjacentHTML('beforeend', html);
        scrollToBottom();

        // Attach dynamic suggestion button listeners
        const newButtons = chatFeed.querySelectorAll('.dynamic-suggestion-btn');
        newButtons.forEach(btn => {
            btn.onclick = function() {
                const q = this.getAttribute('data-question');
                if (q) handleAsk(q);
            };
        });

        // Attach feedback click listeners
        const feedbackContainers = chatFeed.querySelectorAll('.feedback-actions[data-conv-id="' + convId + '"]');
        feedbackContainers.forEach(container => {
            const btns = container.querySelectorAll('.btn-feedback');
            btns.forEach(b => {
                b.onclick = function() {
                    const fbVal = parseInt(this.getAttribute('data-val'), 10);
                    submitFeedback(convId, fbVal, container);
                };
            });
        });
    }

    function submitFeedback(convId, feedbackVal, containerEl) {
        const formData = new FormData();
        formData.append('conversation_id', convId);
        formData.append('feedback', feedbackVal);
        formData.append('csrf_token', csrfToken);

        fetch(`${baseUrl}/api/ai/feedback`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                containerEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle me-1"></i> ${escapeHtml(data.message)}</span>`;
            }
        })
        .catch(() => {});
    }

    function appendErrorMessage(errorMsg) {
        const html = `
            <div class="d-flex justify-content-start mb-3">
                <div class="card bg-danger-subtle border border-danger-subtle shadow-sm rounded-3" style="max-width: 85%;">
                    <div class="card-body p-3 small text-danger">
                        <div class="fw-bold mb-1 d-flex align-items-center gap-1">
                            <i class="bi bi-exclamation-octagon-fill"></i>
                            <span>Pemberitahuan Sistem</span>
                        </div>
                        <div>${escapeHtml(errorMsg)}</div>
                    </div>
                </div>
            </div>
        `;

        chatFeed.insertAdjacentHTML('beforeend', html);
        scrollToBottom();
    }

    function handleAsk(questionText) {
        const trimmed = (questionText || '').trim();
        if (!trimmed) {
            questionInput.focus();
            return;
        }

        // Set loading state
        btnSubmit.disabled = true;
        questionInput.disabled = true;
        spinner.classList.remove('d-none');
        btnText.classList.add('d-none');

        // Display user bubble
        appendUserMessage(trimmed);
        questionInput.value = '';

        const formData = new FormData();
        formData.append('question', trimmed);
        formData.append('csrf_token', csrfToken);
        if (currentSessionId) {
            formData.append('session_id', currentSessionId);
        }

        fetch(`${baseUrl}/api/ai/ask`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success' && data.data) {
                if (data.data.session_id) {
                    currentSessionId = data.data.session_id;
                }
                appendAssistantMessage(
                    data.data.answer,
                    data.data.engine_used,
                    data.data.timestamp,
                    data.data.conversation_id,
                    data.data.suggestions
                );
            } else {
                appendErrorMessage(data.message || 'Gagal memproses pertanyaan bisnis.');
            }
        })
        .catch(err => {
            appendErrorMessage('Terjadi gangguan jaringan atau server saat memproses jawaban. Silakan coba lagi.');
        })
        .finally(() => {
            btnSubmit.disabled = false;
            questionInput.disabled = false;
            spinner.classList.add('d-none');
            btnText.classList.remove('d-none');
            questionInput.focus();
        });
    }

    // Submit handler
    if (askForm) {
        askForm.addEventListener('submit', function (e) {
            e.preventDefault();
            handleAsk(questionInput.value);
        });
    }

    // Quick Ask buttons
    quickButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const q = this.getAttribute('data-question');
            if (q) {
                handleAsk(q);
            }
        });
    });

    // Clear history handler
    if (btnClearAiHistory) {
        btnClearAiHistory.addEventListener('click', function () {
            if (!confirm('Apakah Anda yakin ingin menghapus seluruh riwayat percakapan bisnis Anda?')) {
                return;
            }

            const formData = new FormData();
            formData.append('csrf_token', csrfToken);

            fetch(`${baseUrl}/api/ai/clear`, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    chatFeed.innerHTML = `
                        <div class="text-center py-5 text-muted" id="aiEmptyFeed">
                            <i class="bi bi-robot fs-1 text-secondary opacity-50 mb-2 d-block"></i>
                            <p class="mb-1 fw-semibold">Riwayat percakapan telah dibersihkan.</p>
                            <small>Pilih salah satu tombol pertanyaan cepat di atas atau ketik pertanyaan baru Anda.</small>
                        </div>
                    `;
                } else {
                    alert('Gagal membersihkan riwayat: ' + (data.message || 'Error'));
                }
            })
            .catch(err => {
                alert('Terjadi kesalahan jaringan.');
            });
        });
    }

    // Scroll chat to bottom on initial load
    scrollToBottom();
});
