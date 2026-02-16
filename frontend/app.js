// ============================================
// Chatooli — Frontend Application
// ============================================

const API_BASE = '';
let sessionId = null;
let isLoading = false;
let lastWorkspaceEntry = null;
let lastCodeBlocks = [];

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const themeBtn = document.getElementById('themeBtn');
const sandboxContent = document.getElementById('sandboxContent');
const sandboxPreview = document.getElementById('sandboxPreview');
const previewFrame = document.getElementById('previewFrame');
const sandboxTabs = document.getElementById('sandboxTabs');
const tabPreview = document.getElementById('tabPreview');
const tabCode = document.getElementById('tabCode');
const tabFiles = document.getElementById('tabFiles');
const sandboxFiles = document.getElementById('sandboxFiles');
const filesTree = document.getElementById('filesTree');
const refreshFilesBtn = document.getElementById('refreshFilesBtn');
const modelSelect = document.getElementById('modelSelect');
const copyCodeBtn = document.getElementById('copyCodeBtn');

// ---- Theme Toggle ----
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

function loadTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
}

themeBtn.addEventListener('click', toggleTheme);
loadTheme();

// ---- Auto-resize textarea ----
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// ---- Suggestion buttons ----
function useSuggestion(btn) {
    chatInput.value = btn.textContent;
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input'));
}

// ---- Send Message ----
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isLoading) return;

    isLoading = true;
    sendBtn.disabled = true;

    // Remove welcome message
    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Add user message
    appendMessage('user', message);

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Create collapsible thinking block
    createThinkingBlock();

    try {
        // Use SSE streaming endpoint
        const response = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                session_id: sessionId,
                engine: 'mastra',
                model: modelSelect.value || undefined,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResponse = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('event:')) {
                    var eventType = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const data = JSON.parse(line.slice(5).trim());
                    handleSSEEvent(eventType, data);
                    if (eventType === 'response') {
                        finalResponse = data;
                    }
                }
            }
        }

        // Capture streaming element before finishThinkingBlock resets it
        const streamedEl = streamingResponseEl;
        finishThinkingBlock();

        if (finalResponse) {
            sessionId = finalResponse.session_id;
            const responseText = finalResponse.text || finalResponse.response || '';
            if (streamedEl) {
                streamedEl.classList.remove('streaming');
                streamedEl.innerHTML = formatMessage(responseText);
            } else {
                appendMessage('agent', responseText);
            }
            updateSandbox(responseText, finalResponse.code_blocks, finalResponse.files_changed);
        }

    } catch (err) {
        finishThinkingBlock();

        // Fallback to non-streaming endpoint
        try {
            createThinkingBlock();
            const resp = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    session_id: sessionId,
                    engine: 'mastra',
                    model: modelSelect.value || undefined,
                }),
            });
            const data = await resp.json();
            sessionId = data.session_id;
            if (data.skills_used && data.skills_used.length > 0) {
                appendSkillsBadges(data.skills_used);
            }
            finishThinkingBlock();
            appendMessage('agent', data.response);
            updateSandbox(data.response, data.code_blocks, data.files_changed);
        } catch (fallbackErr) {
            finishThinkingBlock();
            appendMessage('agent', `Error: ${fallbackErr.message}. Make sure the server is running and your API key is set.`);
        }
    }

    isLoading = false;
    sendBtn.disabled = false;
    chatInput.focus();
}

function handleSSEEvent(type, data) {
    if (type === 'art_director_start') {
        appendArtDirectorStart();
    } else if (type === 'design_brief') {
        appendDesignBrief(data.brief);
    } else if (type === 'skills') {
        appendSkillsBadges(data.skills);
    } else if (type === 'reasoning_start') {
        onReasoningStart();
    } else if (type === 'reasoning') {
        appendReasoningDelta(data.text);
    } else if (type === 'tool_call') {
        appendToolCall(data);
    } else if (type === 'tool_result') {
        appendToolResult(data);
    } else if (type === 'text_delta') {
        appendTextDelta(data.text);
    }
}

function appendSkillsBadges(skills) {
    if (!skills || skills.length === 0) return;
    const div = document.createElement('div');
    div.className = 'message message-skills';

    const skillIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>';

    const badges = skills.map(name =>
        `<span class="skill-badge">${skillIcon} ${escapeHtml(name)}</span>`
    ).join('');

    div.innerHTML = `
        <div class="skills-content">
            <span class="skills-label">Skills</span>
            ${badges}
        </div>
    `;

    const target = activeThinkingBlock
        ? activeThinkingBlock.querySelector('.thinking-body')
        : chatMessages;
    target.appendChild(div);
    scrollToBottom();
}

let artDirectorDiv = null;

function appendArtDirectorStart() {
    const div = document.createElement('div');
    div.className = 'message message-art-director';

    const paintIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

    div.innerHTML = `
        <div class="art-director-header">
            ${paintIcon}
            <span class="art-director-label">Art Director is reviewing...</span>
            <span class="art-director-spinner"></span>
        </div>
        <div class="art-director-body"></div>
    `;

    const target = activeThinkingBlock
        ? activeThinkingBlock.querySelector('.thinking-body')
        : chatMessages;
    target.appendChild(div);
    artDirectorDiv = div;
    scrollToBottom();
}

function appendDesignBrief(brief) {
    if (!brief) return;

    if (artDirectorDiv) {
        artDirectorDiv.querySelector('.art-director-label').textContent = 'Art Director';
        const spinner = artDirectorDiv.querySelector('.art-director-spinner');
        if (spinner) spinner.remove();

        const body = artDirectorDiv.querySelector('.art-director-body');
        body.innerHTML = formatMessage(brief);
        artDirectorDiv.classList.add('has-brief');

        const header = artDirectorDiv.querySelector('.art-director-header');
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
            artDirectorDiv.classList.toggle('collapsed');
        });

        artDirectorDiv = null;
    } else {
        const div = document.createElement('div');
        div.className = 'message message-art-director has-brief';

        const paintIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

        div.innerHTML = `
            <div class="art-director-header" style="cursor:pointer">
                ${paintIcon}
                <span class="art-director-label">Art Director</span>
            </div>
            <div class="art-director-body">${formatMessage(brief)}</div>
        `;

        div.querySelector('.art-director-header').addEventListener('click', () => {
            div.classList.toggle('collapsed');
        });

        const target = activeThinkingBlock
            ? activeThinkingBlock.querySelector('.thinking-body')
            : chatMessages;
        target.appendChild(div);
    }

    scrollToBottom();
}

function toolArgsLabel(name, args) {
    if (!args) return '';
    if (['write_file', 'read_file', 'edit_file'].includes(name)) return args.path || '';
    if (name === 'list_files') return args.path || '.';
    if (name === 'glob_files') return args.pattern || '';
    if (name === 'grep_files') return args.pattern || '';
    if (name === 'execute_python_code') return '(code)';
    if (name === 'consult_art_director') return args.request ? args.request.slice(0, 60) + (args.request.length > 60 ? '...' : '') : '';
    return JSON.stringify(args);
}

let lastToolCallDiv = null;

function appendToolCall(tc) {
    const div = document.createElement('div');
    div.className = 'message message-tool-call';
    div.dataset.toolName = tc.name;
    const icon = getToolIcon(tc.name);
    const argsStr = toolArgsLabel(tc.name, tc.args);

    const resultPreview = tc.result
        ? `<div class="tool-result">${escapeHtml(tc.result.slice(0, 200))}${tc.result.length > 200 ? '...' : ''}</div>`
        : '';

    div.innerHTML = `
        <div class="tool-call-content">
            <span class="tool-call-icon">${icon}</span>
            <span class="tool-call-name">${escapeHtml(tc.name)}</span>
            <span class="tool-call-args">${escapeHtml(String(argsStr))}</span>
            ${resultPreview}
        </div>
    `;

    const target = activeThinkingBlock
        ? activeThinkingBlock.querySelector('.thinking-body')
        : chatMessages;
    target.appendChild(div);
    lastToolCallDiv = div;
    scrollToBottom();
}

function appendToolResult(data) {
    if (lastToolCallDiv && lastToolCallDiv.dataset.toolName === data.name) {
        const content = lastToolCallDiv.querySelector('.tool-call-content');
        if (content && !content.querySelector('.tool-result') && data.result) {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'tool-result';
            resultDiv.textContent = data.result.slice(0, 200) + (data.result.length > 200 ? '...' : '');
            content.appendChild(resultDiv);
        }
    }
}

function appendTextDelta(text) {
    if (!streamingResponseEl) {
        const div = document.createElement('div');
        div.className = 'message message-agent';
        div.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <div class="message-role">Chatooli</div>
                <div class="message-text streaming"></div>
            </div>
        `;
        chatMessages.appendChild(div);
        streamingResponseEl = div.querySelector('.message-text');
    }
    streamingResponseEl.textContent += text;
    scrollToBottom();
}

function getToolIcon(name) {
    switch (name) {
        case 'write_file': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        case 'read_file': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        case 'edit_file': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        case 'list_files': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
        case 'consult_art_director': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';
        default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>';
    }
}

// ---- Message Rendering ----
function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message message-${role}`;

    const avatarText = role === 'user' ? 'U' : 'AI';
    const roleText = role === 'user' ? 'You' : 'Chatooli';

    div.innerHTML = `
        <div class="message-avatar">${avatarText}</div>
        <div class="message-content">
            <div class="message-role">${roleText}</div>
            <div class="message-text">${formatMessage(content)}</div>
        </div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();
}

function formatMessage(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let activeThinkingBlock = null;
let thinkingStartTime = null;
let thinkingTimerInterval = null;
let reasoningTextEl = null;
let hasReasoning = false;
let streamingResponseEl = null;

function createThinkingBlock() {
    const chevronSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

    const block = document.createElement('div');
    block.className = 'thinking-block active';
    block.innerHTML = `
        <div class="thinking-header">
            <span class="thinking-chevron">${chevronSvg}</span>
            <span class="thinking-spinner"></span>
            <span class="thinking-done-icon">${checkSvg}</span>
            <span class="thinking-label">Thinking...</span>
            <span class="thinking-timer">0s</span>
        </div>
        <div class="thinking-body"></div>
    `;

    block.querySelector('.thinking-header').addEventListener('click', () => {
        block.classList.toggle('collapsed');
    });

    chatMessages.appendChild(block);
    scrollToBottom();

    thinkingStartTime = Date.now();
    activeThinkingBlock = block;
    reasoningTextEl = null;
    hasReasoning = false;
    streamingResponseEl = null;

    thinkingTimerInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - thinkingStartTime) / 1000);
        const timerEl = block.querySelector('.thinking-timer');
        if (timerEl) timerEl.textContent = `${elapsed}s`;
    }, 1000);

    return block;
}

function onReasoningStart() {
    if (!activeThinkingBlock) return;
    hasReasoning = true;
    const label = activeThinkingBlock.querySelector('.thinking-label');
    if (label) label.textContent = 'Reasoning...';
}

function appendReasoningDelta(text) {
    if (!activeThinkingBlock) return;

    if (!reasoningTextEl) {
        const container = document.createElement('div');
        container.className = 'reasoning-stream';
        const pre = document.createElement('pre');
        pre.className = 'reasoning-text';
        container.appendChild(pre);
        activeThinkingBlock.querySelector('.thinking-body').appendChild(container);
        reasoningTextEl = pre;
        hasReasoning = true;
    }

    reasoningTextEl.textContent += text;
    scrollToBottom();
}

function finishThinkingBlock() {
    if (!activeThinkingBlock) return;

    clearInterval(thinkingTimerInterval);
    const elapsed = Math.round((Date.now() - thinkingStartTime) / 1000);

    activeThinkingBlock.classList.remove('active');
    activeThinkingBlock.classList.add('done', 'collapsed');
    const label = hasReasoning ? `Reasoned for ${elapsed}s` : `Thought for ${elapsed}s`;
    activeThinkingBlock.querySelector('.thinking-label').textContent = label;
    activeThinkingBlock.querySelector('.thinking-timer').textContent = '';

    activeThinkingBlock = null;
    thinkingStartTime = null;
    thinkingTimerInterval = null;
    reasoningTextEl = null;
    hasReasoning = false;
    streamingResponseEl = null;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---- Sandbox ----

function updateSandbox(rawResponse, codeBlocks, filesChanged) {
    lastCodeBlocks = codeBlocks || [];
    filesChanged = filesChanged || [];

    const empty = sandboxContent.querySelector('.sandbox-empty');
    if (empty) empty.remove();

    if (lastCodeBlocks.length > 0 || filesChanged.length > 0) {
        copyCodeBtn.style.display = 'inline-flex';
        sandboxTabs.style.display = 'flex';
    }

    if (filesChanged.length > 0) {
        const htmlFile = filesChanged.find(f =>
            f.endsWith('.html') || f.endsWith('.htm')
        );
        if (htmlFile) {
            lastWorkspaceEntry = htmlFile;
        }
    }

    if (lastWorkspaceEntry) {
        showPreview(true);
    } else if (lastCodeBlocks.length > 0) {
        showCode();
    }

    if (lastCodeBlocks.length > 0) {
        populateCodeView(lastCodeBlocks);
    } else if (filesChanged.length > 0) {
        fetchAndShowWrittenFiles(filesChanged);
    }

    loadWorkspaceFiles();
}

async function fetchAndShowWrittenFiles(filesChanged) {
    const blocks = [];
    for (const f of filesChanged) {
        try {
            const resp = await fetch(`${API_BASE}/api/workspace/files/${f}`);
            if (resp.ok) {
                const text = await resp.text();
                const ext = f.split('.').pop() || 'text';
                blocks.push({ language: ext, code: text, filename: f });
            }
        } catch (e) { /* skip */ }
    }
    if (blocks.length > 0) {
        lastCodeBlocks = blocks;
        populateCodeView(blocks);
    }
}

let currentPreviewFile = null;

function showPreview(forceReload = false) {
    tabPreview.classList.add('active');
    tabCode.classList.remove('active');
    tabFiles.classList.remove('active');
    sandboxPreview.style.display = 'flex';
    sandboxContent.style.display = 'none';
    sandboxFiles.style.display = 'none';

    if (lastWorkspaceEntry) {
        if (forceReload || currentPreviewFile !== lastWorkspaceEntry) {
            previewFrame.removeAttribute('srcdoc');
            const url = `${API_BASE}/api/workspace/files/${lastWorkspaceEntry}`;
            previewFrame.src = url + '?t=' + Date.now();
            currentPreviewFile = lastWorkspaceEntry;
        }
    }
}

function showCode() {
    tabCode.classList.add('active');
    tabPreview.classList.remove('active');
    tabFiles.classList.remove('active');
    sandboxPreview.style.display = 'none';
    sandboxContent.style.display = 'flex';
    sandboxFiles.style.display = 'none';
}

function populateCodeView(codeBlocks) {
    const empty = sandboxContent.querySelector('.sandbox-empty');
    if (empty) empty.remove();

    sandboxContent.querySelectorAll('.sandbox-code-block').forEach(el => el.remove());

    for (const block of codeBlocks) {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'sandbox-code-block';
        const label = block.filename || block.language || 'text';
        blockDiv.innerHTML = `
            <div class="code-block-header">
                <span>${escapeHtml(label)}</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="code-block-content">
                <pre>${escapeHtml(block.code)}</pre>
            </div>
        `;
        sandboxContent.appendChild(blockDiv);
    }

    sandboxContent.scrollTop = sandboxContent.scrollHeight;
}

// ---- Tab switching ----
tabPreview.addEventListener('click', () => { showPreview(); });
tabCode.addEventListener('click', () => { showCode(); });
tabFiles.addEventListener('click', () => { showFiles(); });

function showFiles() {
    tabPreview.classList.remove('active');
    tabCode.classList.remove('active');
    tabFiles.classList.add('active');
    sandboxPreview.style.display = 'none';
    sandboxContent.style.display = 'none';
    sandboxFiles.style.display = 'flex';
    loadWorkspaceFiles();
}

async function loadWorkspaceFiles(basePath = '.') {
    try {
        const r = await fetch(`${API_BASE}/api/workspace/entries?path=${encodeURIComponent(basePath)}`);
        const data = await r.json();
        if (data.entries && data.entries.length) {
            filesTree.innerHTML = '<ul class="tree-list">' + data.entries.map(e => {
                const isHtml = e.name.endsWith('.html') || e.name.endsWith('.htm');
                const isDir = e.type === 'directory';
                const icon = isDir ? '📁 ' : '📄 ';
                const fullPath = basePath === '.' ? e.name : `${basePath}/${e.name}`;

                if (isHtml) {
                    return `<li class="tree-item file html-file" data-path="${escapeHtml(fullPath)}">
                        <span>${icon}${escapeHtml(e.name)}</span>
                        <button class="btn btn-ghost btn-xs preview-file-btn" title="Preview in iframe">▶</button>
                    </li>`;
                } else if (isDir) {
                    return `<li class="tree-item directory" data-path="${escapeHtml(fullPath)}">
                        <span>${icon}${escapeHtml(e.name)}</span>
                    </li>`;
                } else {
                    return `<li class="tree-item file"><span>${icon}${escapeHtml(e.name)}</span></li>`;
                }
            }).join('') + '</ul>';

            filesTree.querySelectorAll('.preview-file-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const li = btn.closest('li');
                    const path = li.dataset.path;
                    previewWorkspaceFile(path);
                });
            });
        } else {
            filesTree.innerHTML = '<p class="files-empty">Workspace is empty or path not found.</p>';
        }
    } catch (e) {
        filesTree.innerHTML = '<p class="files-empty">Could not load workspace: ' + escapeHtml(String(e)) + '</p>';
    }
}

function previewWorkspaceFile(path) {
    lastWorkspaceEntry = path;
    sandboxTabs.style.display = 'flex';
    showPreview();
}
refreshFilesBtn.addEventListener('click', loadWorkspaceFiles);

// ---- Copy Code ----
copyCodeBtn.addEventListener('click', () => {
    const blocks = sandboxContent.querySelectorAll('.code-block-content pre');
    const textToCopy = blocks.length > 0 ? blocks[blocks.length - 1].textContent : '';

    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyCodeBtn.innerHTML;
        copyCodeBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied!
        `;
        setTimeout(() => {
            copyCodeBtn.innerHTML = originalText;
        }, 2000);
    });
});

// ---- Clear Chat ----
clearBtn.addEventListener('click', async () => {
    if (sessionId) {
        try {
            await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: 'DELETE' });
        } catch (e) { /* ignore */ }
    }

    sessionId = null;
    lastWorkspaceEntry = null;
    lastCodeBlocks = [];
    currentPreviewFile = null;
    activeThinkingBlock = null;
    reasoningTextEl = null;
    hasReasoning = false;
    streamingResponseEl = null;
    lastToolCallDiv = null;
    if (thinkingTimerInterval) clearInterval(thinkingTimerInterval);
    thinkingTimerInterval = null;

    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
            </div>
            <h2>Welcome to Chatooli</h2>
            <p>Describe a visual idea and I'll generate it as a live, interactive sketch. Try:</p>
            <div class="suggestions">
                <button class="suggestion" onclick="useSuggestion(this)">Create a particle system that follows the mouse with rainbow trails</button>
                <button class="suggestion" onclick="useSuggestion(this)">Build a rotating 3D wireframe icosahedron with Three.js</button>
                <button class="suggestion" onclick="useSuggestion(this)">Make a fullscreen GLSL shader with animated plasma waves</button>
                <button class="suggestion" onclick="useSuggestion(this)">Generate an SVG animation with text orbiting along a curved path</button>
            </div>
        </div>
    `;

    sandboxContent.innerHTML = `
        <div class="sandbox-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
            </svg>
            <p>Output will appear here when the agent generates code.</p>
        </div>
    `;
    sandboxPreview.style.display = 'none';
    sandboxContent.style.display = 'flex';
    sandboxFiles.style.display = 'none';
    sandboxTabs.style.display = 'none';
    previewFrame.srcdoc = '';
    copyCodeBtn.style.display = 'none';
});

// ---- Key Bindings ----
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// ---- Focus input on load ----
chatInput.focus();
