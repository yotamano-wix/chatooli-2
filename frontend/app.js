// ============================================
// Chatooli — Frontend Application
// ============================================

const API_BASE = '';
let sessionId = null;
let isLoading = false;
let lastWorkspaceEntry = null; // The HTML file to preview (from workspace)
let lastCodeBlocks = [];    // Store latest code blocks for code tab

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
const engineSelect = document.getElementById('engineSelect');
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

// ---- Load engines ----
async function loadEngines() {
    try {
        const r = await fetch(`${API_BASE}/api/engines`);
        const list = await r.json();
        engineSelect.innerHTML = list.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    } catch (e) {
        console.warn('Could not load engines', e);
    }
}
loadEngines();

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

    // Show thinking indicator
    const thinkingEl = showThinking();

    try {
        // Use SSE streaming endpoint
        const response = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                session_id: sessionId,
                engine: engineSelect.value,
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

        thinkingEl.remove();

        if (finalResponse) {
            sessionId = finalResponse.session_id;
            appendMessage('agent', finalResponse.response);
            updateSandbox(finalResponse.response, finalResponse.code_blocks, finalResponse.files_changed);
        }

    } catch (err) {
        thinkingEl.remove();

        // Fallback to non-streaming endpoint
        try {
            const resp = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    session_id: sessionId,
                    engine: engineSelect.value,
                    model: modelSelect.value || undefined,
                }),
            });
            const data = await resp.json();
            sessionId = data.session_id;
            appendMessage('agent', data.response);
            updateSandbox(data.response, data.code_blocks, data.files_changed);
        } catch (fallbackErr) {
            appendMessage('agent', `Error: ${fallbackErr.message}. Make sure the server is running and your OPENAI_API_KEY is set.`);
        }
    }

    isLoading = false;
    sendBtn.disabled = false;
    chatInput.focus();
}

function handleSSEEvent(type, data) {
    if (type === 'thinking') {
        // Already showing thinking indicator
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
    // Escape HTML first
    let html = escapeHtml(text);

    // Format code blocks (```...```) — protect content inside
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Format inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Format bold (**...**) — but not inside <pre> tags
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Format line breaks (but not inside pre)
    html = html.replace(/\n/g, '<br>');

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showThinking() {
    const div = document.createElement('div');
    div.className = 'message message-agent';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="thinking">
                <div class="thinking-dots">
                    <span></span><span></span><span></span>
                </div>
                <span>Thinking...</span>
            </div>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---- Sandbox ----

function updateSandbox(rawResponse, codeBlocks, filesChanged) {
    lastCodeBlocks = codeBlocks || [];
    filesChanged = filesChanged || [];

    // Clear empty state
    const empty = sandboxContent.querySelector('.sandbox-empty');
    if (empty) empty.remove();

    // Show controls if we have content
    if (lastCodeBlocks.length > 0 || filesChanged.length > 0) {
        copyCodeBtn.style.display = 'inline-flex';
        sandboxTabs.style.display = 'flex';
    }

    // The agent writes files via tool calls. Find the HTML entry point.
    if (filesChanged.length > 0) {
        const htmlFile = filesChanged.find(f =>
            f.endsWith('.html') || f.endsWith('.htm')
        );
        if (htmlFile) {
            lastWorkspaceEntry = htmlFile;
        }
    }

    // Decide what to show
    if (lastWorkspaceEntry) {
        showPreview();
    } else if (lastCodeBlocks.length > 0) {
        // Fallback: show code tab if no workspace file yet
        showCode();
    }

    // Populate the code tab with any code blocks from the response
    if (lastCodeBlocks.length > 0) {
        populateCodeView(lastCodeBlocks);
    }

    // Always refresh files tab after agent turn
    loadWorkspaceFiles();
}

function showPreview() {
    tabPreview.classList.add('active');
    tabCode.classList.remove('active');
    tabFiles.classList.remove('active');
    sandboxPreview.style.display = 'flex';
    sandboxContent.style.display = 'none';
    sandboxFiles.style.display = 'none';

    if (lastWorkspaceEntry) {
        // Load HTML from workspace file server
        // Relative imports (sketch.js, style.css) resolve against the same base URL
        previewFrame.removeAttribute('srcdoc');
        const url = `${API_BASE}/api/workspace/files/${lastWorkspaceEntry}`;
        // Cache-bust to force reload after edits
        previewFrame.src = url + '?t=' + Date.now();
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
    // Remove empty state if present
    const empty = sandboxContent.querySelector('.sandbox-empty');
    if (empty) empty.remove();

    // Clear previous code blocks
    sandboxContent.querySelectorAll('.sandbox-code-block').forEach(el => el.remove());

    for (const block of codeBlocks) {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'sandbox-code-block';
        blockDiv.innerHTML = `
            <div class="code-block-header">
                <span>${block.language || 'python'}</span>
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
                    // HTML files are clickable — load in preview
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

            // Attach click handlers for preview buttons
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
    // Copy the last code block content
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

    // Reset sandbox
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
