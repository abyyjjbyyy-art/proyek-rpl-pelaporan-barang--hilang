/**
 * KASIR LANJUT TINGKAT ATAS
 * Floating AI Chatbot Widget — Chatbot+ Controller v3.0
 *
 * Features:
 *  - Multi-turn conversation context (session_id)
 *  - Typewriter animation for bot responses
 *  - Follow-up suggestion chips after each AI answer
 *  - Message actions: copy text + thumbs up/down feedback
 *  - New session grouping with visual separator
 *  - Relative timestamps ("2 min lalu", "Baru saja")
 *  - Graceful error handling + retry UX
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const widget      = document.getElementById('aiChatbotWidget');
        if (!widget) return;

        const btnToggle        = document.getElementById('btnToggleChatbot');
        const chatWindow       = document.getElementById('aiChatbotWindow');
        const btnClose         = document.getElementById('btnChatbotClose');
        const btnClear         = document.getElementById('btnChatbotClear');
        const btnNewSession    = document.getElementById('btnChatbotNewSession');
        const feed             = document.getElementById('chatbotMessageFeed');
        const typingWrap       = document.getElementById('chatbotTyping');
        const form             = document.getElementById('chatbotInputForm');
        const input            = document.getElementById('chatbotInputText');
        const btnSend          = document.getElementById('btnChatbotSend');
        const charCount        = document.getElementById('chatbotCharCount');

        const baseUrl    = window.APP_CONFIG ? window.APP_CONFIG.baseUrl : '';
        const csrfToken  = window.APP_CONFIG ? window.APP_CONFIG.csrfToken : '';

        let historyLoaded  = false;
        let isSending      = false;
        let isOpen         = false;
        let currentSession = generateSessionId();
        let messageCount   = 0;

        /* ───────────────────────── session helpers ──────────────────────── */

        function generateSessionId() {
            return 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        }

        function startNewSession() {
            currentSession = generateSessionId();
            messageCount   = 0;
        }

        /* ─────────────────────────── utilities ─────────────────────────── */

        function scrollToBottom(smooth) {
            if (!feed) return;
            feed.scrollTo({ top: feed.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
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

        function getRelativeTime(dateStr) {
            if (!dateStr) return '';
            const n   = new Date();
            const hh  = String(n.getHours()).padStart(2, '0');
            const mm  = String(n.getMinutes()).padStart(2, '0');
            return hh + ':' + mm;
        }

        function getCurrentTime() {
            const n = new Date();
            return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
        }

        /* ──────────────────────── markdown parser ───────────────────────── */

        function parseMarkdown(raw) {
            if (!raw) return '';

            // Strip fenced code blocks
            let text = raw.replace(/```[\w]*\n?[\s\S]*?```/g, '');

            // Escape HTML
            let html = escapeHtml(text);

            // Bold **text**
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Italic *text*
            html = html.replace(/(?<![*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*])/g, '<em>$1</em>');
            // Inline code `code`
            html = html.replace(/`([^`\n]+?)`/g, '<code class="ai-code">$1</code>');
            // Horizontal rule ---
            html = html.replace(/^---+$/gm, '<hr class="ai-hr">');

            const lines = html.split('\n');
            const out   = [];
            let inUl    = false;

            lines.forEach(function (rawLine) {
                const line = rawLine.trim();

                if (/^#{1,3}\s/.test(line)) {
                    if (inUl) { out.push('</ul>'); inUl = false; }
                    const level   = line.match(/^(#+)/)[1].length;
                    const content = line.replace(/^#+\s/, '');
                    const tag     = level === 1 ? 'h6' : 'strong';
                    out.push(`<div class="ai-heading ai-h${level}"><${tag}>${content}</${tag}></div>`);
                } else if (/^[-*]\s/.test(line)) {
                    if (!inUl) { out.push('<ul class="ai-list">'); inUl = true; }
                    out.push(`<li>${line.substring(2)}</li>`);
                } else if (/^\d+\.\s/.test(line)) {
                    if (inUl) { out.push('</ul>'); inUl = false; }
                    out.push(`<div class="ai-numbered">${line}</div>`);
                } else {
                    if (inUl) { out.push('</ul>'); inUl = false; }
                    if (line === '' || line === '<hr class="ai-hr">') {
                        out.push(line === '' ? '<div class="ai-spacer"></div>' : line);
                    } else {
                        out.push(`<p class="ai-p">${line}</p>`);
                    }
                }
            });

            if (inUl) out.push('</ul>');
            return out.join('');
        }

        /* ────────────────────── typewriter animation ────────────────────── */

        function typewriterEffect(container, htmlContent, onDone) {
            // We render character-by-character on a temporary text but
            // reveal pre-parsed HTML chunks progressively for safety
            container.innerHTML = '';
            const temp = document.createElement('div');
            temp.innerHTML = htmlContent;

            const childNodes = Array.from(temp.childNodes);
            let nodeIndex    = 0;

            function appendNextNode() {
                if (nodeIndex >= childNodes.length) {
                    if (typeof onDone === 'function') onDone();
                    return;
                }
                const node = childNodes[nodeIndex].cloneNode(true);
                container.appendChild(node);
                nodeIndex++;
                scrollToBottom(false);
                // Variable speed: faster for short nodes
                const delay = node.textContent && node.textContent.length > 60 ? 18 : 10;
                setTimeout(appendNextNode, delay);
            }

            appendNextNode();
        }

        /* ────────────────────── welcome screen ─────────────────────────── */

        function getWelcomeEl()  { return feed ? feed.querySelector('#chatbotWelcome') : null; }
        function removeWelcome() { const el = getWelcomeEl(); if (el) el.remove(); }

        function renderWelcome() {
            const isKasir = window.APP_CONFIG && Number(window.APP_CONFIG.roleId) === 2;
            let chipsHtml = '';

            if (isKasir) {
                chipsHtml = `
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Berapa penjualan kasir saya hari ini?">
                        <i class="bi bi-person-check text-primary me-1"></i>Penjualan saya hari ini
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Produk apa yang stoknya menipis?">
                        <i class="bi bi-exclamation-triangle text-warning me-1"></i>Stok menipis
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Produk apa saja yang stoknya sudah habis?">
                        <i class="bi bi-x-octagon text-danger me-1"></i>Stok habis
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Siapa saya?">
                        <i class="bi bi-person-badge text-success me-1"></i>Identitas saya
                    </button>
                `;
            } else {
                chipsHtml = `
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Bagaimana performa penjualan hari ini?">
                        <i class="bi bi-graph-up-arrow text-primary me-1"></i>Penjualan hari ini
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Apa produk terlaris bulan ini?">
                        <i class="bi bi-trophy text-warning me-1"></i>Produk terlaris
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Produk apa yang stoknya menipis?">
                        <i class="bi bi-exclamation-circle text-danger me-1"></i>Stok menipis
                    </button>
                    <button type="button" class="ai-chip widget-quick-btn"
                        data-question="Tampilkan ringkasan kondisi bisnis saya.">
                        <i class="bi bi-bar-chart text-success me-1"></i>Ringkasan bisnis
                    </button>
                `;
            }

            feed.innerHTML = `
                <div class="ai-welcome" id="chatbotWelcome">
                    <div class="ai-welcome-icon"><i class="bi bi-stars"></i></div>
                    <h6 class="fw-bold mb-1 text-dark">Halo! Ada yang bisa saya bantu?</h6>
                    <p class="small text-secondary mb-3">
                        Saya <strong>AI Kasir Assistant</strong>, terhubung langsung dengan<br>
                        data transaksi dan inventaris toko Anda secara real-time.
                    </p>
                    <div class="ai-welcome-chips">
                        ${chipsHtml}
                    </div>
                </div>
            `;
        }

        /* ──────────────────── session separator ─────────────────────────── */

        function appendSessionSeparator(label) {
            const div = document.createElement('div');
            div.className = 'ai-session-sep';
            div.innerHTML = `<span>${escapeHtml(label || 'Sesi Baru')}</span>`;
            feed.appendChild(div);
        }

        /* ──────────────────────── DOM builders ──────────────────────────── */

        function appendUserMessage(text, timeStr) {
            removeWelcome();
            const time = timeStr || getCurrentTime();
            const div  = document.createElement('div');
            div.className = 'ai-msg-row ai-msg-row--user';
            div.innerHTML = `
                <div class="ai-bubble ai-bubble--user">
                    <div class="ai-bubble-text">${escapeHtml(text)}</div>
                    <div class="ai-bubble-time">${time}</div>
                </div>
                <div class="ai-avatar ai-avatar--user" title="Anda">
                    <i class="bi bi-person-fill"></i>
                </div>
            `;
            feed.appendChild(div);
            scrollToBottom(true);
        }

        function appendBotMessage(text, engine, timeStr, convId, suggestions, useTypewriter) {
            removeWelcome();
            const time     = timeStr || getCurrentTime();
            const label    = escapeHtml(engine || 'Google Gemini AI');
            const isGemini = (label.toLowerCase().includes('gemini'));
            const parsed   = parseMarkdown(text);
            const cidAttr  = convId ? `data-conv-id="${convId}"` : '';

            const div = document.createElement('div');
            div.className = 'ai-msg-row ai-msg-row--bot';
            div.innerHTML = `
                <div class="ai-avatar ai-avatar--bot" title="AI Assistant">
                    <i class="bi bi-stars"></i>
                </div>
                <div class="ai-bubble ai-bubble--bot" ${cidAttr}>
                    <div class="ai-bubble-meta">
                        <span class="ai-bubble-label">
                            <i class="bi bi-stars me-1 text-primary"></i>AI Kasir
                        </span>
                        <span class="ai-engine-badge ${isGemini ? 'ai-engine--gemini' : 'ai-engine--local'}">
                            ${label}
                        </span>
                    </div>
                    <div class="ai-bubble-text ai-rendered" id="ai-render-${Date.now()}"></div>
                    <div class="ai-bubble-footer">
                        <div class="ai-bubble-time">${time}</div>
                        <div class="ai-msg-actions">
                            <button type="button" class="ai-action-btn ai-copy-btn" title="Salin jawaban" data-text="${escapeHtml(text)}">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            ${convId ? `
                            <button type="button" class="ai-action-btn ai-thumb-btn ai-thumb-up" title="Jawaban membantu" data-conv="${convId}" data-val="1">
                                <i class="bi bi-hand-thumbs-up"></i>
                            </button>
                            <button type="button" class="ai-action-btn ai-thumb-btn ai-thumb-down" title="Jawaban kurang membantu" data-conv="${convId}" data-val="-1">
                                <i class="bi bi-hand-thumbs-down"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            feed.appendChild(div);

            // Fill rendered content
            const renderEl = div.querySelector('.ai-rendered');
            if (useTypewriter && renderEl) {
                typewriterEffect(renderEl, parsed, function () {
                    // Append suggestions AFTER typewriter finishes
                    if (suggestions && suggestions.length > 0) {
                        appendSuggestionChips(suggestions, div);
                    }
                    scrollToBottom(true);
                });
            } else if (renderEl) {
                renderEl.innerHTML = parsed;
                if (suggestions && suggestions.length > 0) {
                    appendSuggestionChips(suggestions, div);
                }
            }

            scrollToBottom(true);
        }

        function appendSuggestionChips(suggestions, afterEl) {
            if (!suggestions || suggestions.length === 0) return;

            const wrap = document.createElement('div');
            wrap.className = 'ai-suggestions-wrap';

            const label = document.createElement('div');
            label.className = 'ai-suggestions-label';
            label.innerHTML = '<i class="bi bi-lightbulb-fill me-1"></i>Lanjutkan dengan:';
            wrap.appendChild(label);

            const chipsRow = document.createElement('div');
            chipsRow.className = 'ai-suggestions-chips';

            suggestions.forEach(function (q) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-suggestion-chip widget-quick-btn';
                btn.setAttribute('data-question', q);
                btn.textContent = q;
                chipsRow.appendChild(btn);
            });

            wrap.appendChild(chipsRow);

            // Insert after the bot message bubble
            if (afterEl && afterEl.parentNode) {
                afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling);
            } else {
                feed.appendChild(wrap);
            }
        }

        function appendErrorMessage(msg) {
            const div = document.createElement('div');
            div.className = 'ai-msg-row ai-msg-row--bot';
            div.innerHTML = `
                <div class="ai-avatar ai-avatar--bot">
                    <i class="bi bi-exclamation-triangle-fill text-danger"></i>
                </div>
                <div class="ai-bubble ai-bubble--error">
                    <div class="ai-bubble-meta">
                        <span class="ai-bubble-label text-danger">
                            <i class="bi bi-exclamation-triangle-fill me-1"></i>Sistem
                        </span>
                    </div>
                    <div class="ai-bubble-text">${escapeHtml(msg)}</div>
                </div>
            `;
            feed.appendChild(div);
            scrollToBottom(true);
        }

        /* ───────────────────────── auto-resize ─────────────────────────── */

        function resizeTextarea() {
            if (!input) return;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        }

        if (input) {
            input.addEventListener('input', function () {
                resizeTextarea();
                if (charCount) {
                    const len = input.value.length;
                    charCount.textContent = len + '/500';
                    charCount.classList.toggle('text-danger', len > 450);
                }
            });
        }

        /* ─────────────────────── chat window toggle ─────────────────────── */

        function openChatWindow() {
            if (isOpen) return;
            isOpen = true;

            chatWindow.style.animation = 'none';
            chatWindow.classList.remove('d-none');
            void chatWindow.offsetWidth;
            chatWindow.style.animation = '';

            if (!historyLoaded) {
                loadHistory();
            }

            setTimeout(function () {
                if (input) input.focus();
                scrollToBottom(false);
            }, 150);
        }

        function closeChatWindow() {
            if (!isOpen) return;
            isOpen = false;
            chatWindow.classList.add('d-none');
        }

        /* ─────────────────────── history load ──────────────────────────── */

        function loadHistory() {
            fetch(baseUrl + '/api/ai/history', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                historyLoaded = true;
                if (res.status === 'success' && res.data) {
                    if (res.data.engine) {
                        const subEl = document.getElementById('chatbotEngineSubtitle');
                        if (subEl) {
                            subEl.innerHTML = '<i class="bi bi-cpu-fill me-1"></i>' + escapeHtml(res.data.engine);
                        }
                    }
                    if (res.data.history && res.data.history.length > 0) {
                        removeWelcome();
                        let lastSession = null;

                        res.data.history.forEach(function (item) {
                            // Session separator when session changes
                            const itemSession = item.session_id || 'default';
                            if (itemSession !== lastSession) {
                                if (lastSession !== null) {
                                    appendSessionSeparator('Sesi Sebelumnya');
                                }
                                lastSession = itemSession;
                            }

                            const t = item.created_at ? item.created_at.substring(11, 16) : '';
                            appendUserMessage(item.question, t);

                            // Parse suggestions if stored
                            let suggestions = [];
                            if (item.suggestions) {
                                try { suggestions = JSON.parse(item.suggestions); } catch(e) {}
                            }

                            appendBotMessage(item.answer, item.engine_used, t, item.id, suggestions, false);

                            // Restore current session from last item
                            if (item.session_id) {
                                currentSession = item.session_id;
                            }
                        });

                        scrollToBottom(false);
                    }
                }
            })
            .catch(function () {
                historyLoaded = true;
            });
        }

        /* ──────────────────────── send message ──────────────────────────── */

        function sendMessage(questionText) {
            const text = (questionText || (input ? input.value : '') || '').trim();
            if (!text || isSending) return;

            isSending = true;
            if (input)   { input.value = ''; input.style.height = 'auto'; input.disabled = true; }
            if (btnSend) { btnSend.disabled = true; btnSend.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }
            if (charCount) charCount.textContent = '0/500';

            // Session separator on first message of a new session
            if (messageCount === 0 && historyLoaded) {
                const now = new Date();
                const timeLabel = 'Sesi ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                appendSessionSeparator(timeLabel);
            }

            appendUserMessage(text);
            messageCount++;

            // Show typing indicator
            if (typingWrap) typingWrap.classList.remove('d-none');
            scrollToBottom(true);

            const fd = new FormData();
            fd.append('question', text);
            fd.append('session_id', currentSession);
            fd.append('csrf_token', csrfToken);

            fetch(baseUrl + '/api/ai/ask', {
                method: 'POST',
                body: fd,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (typingWrap) typingWrap.classList.add('d-none');
                if (data.status === 'success' && data.data) {
                    const d = data.data;
                    // Update session id from server (server may have generated one)
                    if (d.session_id) currentSession = d.session_id;

                    appendBotMessage(
                        d.answer,
                        d.engine_used,
                        getCurrentTime(),
                        d.conversation_id || null,
                        d.suggestions || [],
                        true   // use typewriter
                    );
                } else {
                    appendErrorMessage(data.message || 'Gagal mendapatkan respons dari AI. Coba ulangi pertanyaan.');
                }
            })
            .catch(function () {
                if (typingWrap) typingWrap.classList.add('d-none');
                appendErrorMessage('Gangguan koneksi jaringan. Periksa internet Anda dan coba lagi.');
            })
            .finally(function () {
                isSending = false;
                if (input)   { input.disabled = false; if (isOpen) input.focus(); }
                if (btnSend) { btnSend.disabled = false; btnSend.innerHTML = '<i class="bi bi-send-fill"></i>'; }
            });
        }

        /* ─────────────────────── clear history ─────────────────────────── */

        function clearHistory() {
            if (!confirm('Kosongkan seluruh riwayat percakapan chatbot?')) return;

            const fd = new FormData();
            fd.append('csrf_token', csrfToken);

            fetch(baseUrl + '/api/ai/clear', {
                method: 'POST',
                body: fd,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === 'success') {
                    historyLoaded = false;
                    startNewSession();
                    renderWelcome();
                } else {
                    alert('Gagal membersihkan riwayat: ' + (data.message || 'Error tidak diketahui.'));
                }
            })
            .catch(function () {
                alert('Terjadi kesalahan jaringan saat membersihkan riwayat.');
            });
        }

        /* ─────────────────────── submit feedback ────────────────────────── */

        function submitFeedback(convId, feedbackVal, thumbUpBtn, thumbDownBtn) {
            const fd = new FormData();
            fd.append('conversation_id', convId);
            fd.append('feedback', feedbackVal);
            fd.append('csrf_token', csrfToken);

            // Immediate UI feedback
            [thumbUpBtn, thumbDownBtn].forEach(function(b) {
                if (b) b.classList.remove('ai-thumb-active');
            });
            const activeBtn = feedbackVal === 1 ? thumbUpBtn : thumbDownBtn;
            if (activeBtn) activeBtn.classList.add('ai-thumb-active');

            fetch(baseUrl + '/api/ai/feedback', {
                method: 'POST',
                body: fd,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.status !== 'success') {
                    if (activeBtn) activeBtn.classList.remove('ai-thumb-active');
                }
            })
            .catch(function() {
                if (activeBtn) activeBtn.classList.remove('ai-thumb-active');
            });
        }

        /* ─────────────────────── copy message ──────────────────────────── */

        function copyToClipboard(text, btn) {
            navigator.clipboard.writeText(text).then(function () {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="bi bi-clipboard-check text-success"></i>';
                setTimeout(function () { btn.innerHTML = originalHTML; }, 1800);
            }).catch(function () {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        }

        /* ─────────────────────── event listeners ────────────────────────── */

        if (btnToggle) {
            btnToggle.addEventListener('click', function () {
                isOpen ? closeChatWindow() : openChatWindow();
            });
        }

        if (btnClose)      { btnClose.addEventListener('click', closeChatWindow); }
        if (btnClear)      { btnClear.addEventListener('click', clearHistory); }
        if (btnNewSession) {
            btnNewSession.addEventListener('click', function () {
                startNewSession();
                historyLoaded = true;
                renderWelcome();
                const now = new Date();
                const lbl = 'Sesi Baru — ' +
                    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                // Re-append separator on next message
                messageCount = 0;
            });
        }

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                sendMessage();
            });
        }

        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        // Delegated click for quick-btn + suggestion chips + feedback + copy
        document.addEventListener('click', function (e) {
            // Quick-ask buttons
            const quickBtn = e.target.closest('.widget-quick-btn');
            if (quickBtn) {
                const q = quickBtn.getAttribute('data-question');
                if (q) {
                    openChatWindow();
                    setTimeout(function () { sendMessage(q); }, 80);
                }
                return;
            }

            // Copy button
            const copyBtn = e.target.closest('.ai-copy-btn');
            if (copyBtn) {
                const rawText = copyBtn.getAttribute('data-text') || '';
                copyToClipboard(rawText, copyBtn);
                return;
            }

            // Thumbs feedback
            const thumbBtn = e.target.closest('.ai-thumb-btn');
            if (thumbBtn) {
                const convId     = parseInt(thumbBtn.getAttribute('data-conv') || '0', 10);
                const feedbackV  = parseInt(thumbBtn.getAttribute('data-val') || '0', 10);
                if (!convId || !feedbackV) return;

                const bubble   = thumbBtn.closest('.ai-bubble');
                const upBtn    = bubble ? bubble.querySelector('.ai-thumb-up')   : null;
                const downBtn  = bubble ? bubble.querySelector('.ai-thumb-down') : null;
                submitFeedback(convId, feedbackV, upBtn, downBtn);
                return;
            }
        });

        // Close chatbot when clicking outside
        document.addEventListener('click', function (e) {
            if (!isOpen) return;
            if (widget.contains(e.target)) return;
            closeChatWindow();
        });

        // ESC key closes chatbot
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) closeChatWindow();
        });
    });
})();
