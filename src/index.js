// index.ts  （Cloudflare Worker 入口）
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // -----------------------------
    // 1. 解析 noteId 与基础校验
    // -----------------------------
    let noteId = url.pathname.split('/')[1]; // /abc123 => abc123

    if (noteId) {
      if (noteId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(noteId)) {
        return new Response('Invalid Note ID', { status: 400 });
      }
    } else {
      // 生成随机 ID，并 302 重定向
      const idLength = 5;
      const bytes = new Uint8Array(idLength);
      crypto.getRandomValues(bytes);
      const base64 = btoa(String.fromCharCode(...bytes));
      const safeId = base64.replace(/\+/g, '').replace(/\//g, '').replace(/=/g, '').slice(0, idLength);
      return Response.redirect(url.origin + '/' + safeId, 302);
    }

    // -----------------------------
    // 2. POST：保存 / 删除
    // -----------------------------
    if (request.method === 'POST') {
      const body = await request.text();

      if (body.length === 0) {
        // 空正文：删除
        await env.NOTES.delete(noteId);
        return new Response('Deleted', { status: 200 });
      } else {
        // 非空：保存
        await env.NOTES.put(noteId, body, { expirationTtl: 3600 * 24 * 30 }); // 可选：30 天自动过期
        return new Response('Saved', { status: 200 });
      }
    }

    // -----------------------------
    // 3. GET：返回前端页面或原始文本
    // -----------------------------
    const isRaw = url.searchParams.has('raw') ||
      ((request.headers.get('user-agent') || '').startsWith('curl')) ||
      ((request.headers.get('user-agent') || '').startsWith('Wget'));

    const value = await env.NOTES.get(noteId);

    if (isRaw) {
      if (value === null) {
        return new Response('Note not found.', { status: 404, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
      }
      return new Response(value, { status: 200, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    }

    const content = value ?? '';

    // -----------------------------
    // 4. 返回 HTML 前端（含 Email 按钮）
    // -----------------------------
    const html = renderHtml(content, noteId);
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'no-store, must-revalidate',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
      },
    });
  },
};

// -----------------------------
// HTML 模板（与原 PHP 前端一致，增加 Email 按钮）
// -----------------------------
function renderHtml(content: string, noteId: string) {
  // 转义内容用于嵌入 <textarea>
  const escapedContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Note</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">
    <style>
        :root {
            --bg-color: #ffffff;
            --text-color: #333333;
            --meta-color: #aaaaaa;
            --toolbar-bg: rgba(255, 255, 255, 0.85);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #1a1a1a;
                --text-color: #e0e0e0;
                --meta-color: #666666;
                --toolbar-bg: rgba(30, 30, 30, 0.85);
            }
        }

        body.dark {
            --bg-color: #1a1a1a;
            --text-color: #e0e0e0;
            --meta-color: #666666;
            --toolbar-bg: rgba(30, 30, 30, 0.85);
        }

        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            background: var(--bg-color);
            color: var(--text-color);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
        }

        #content {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            padding: 40px 20px 60px 20px;
            margin: 0;
            border: none;
            outline: none;
            background: transparent;
            color: var(--text-color);
            font-family: "SF Mono", "Consolas", "Roboto Mono", monospace;
            font-size: 16px;
            line-height: 1.8;
            resize: none;
        }

        #word-count {
            position: absolute;
            bottom: 15px;
            right: 25px;
            font-size: 12px;
            color: var(--meta-color);
            pointer-events: none;
            z-index: 10;
            transition: opacity 0.3s;
        }

        #toolbar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 40px;
            background: var(--toolbar-bg);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-top: 1px solid rgba(128, 128, 128, 0.1);
            display: flex;
            align-items: center;
            padding: 0 15px;
            gap: 10px;
            opacity: 0;
            transform: translateY(100%);
            transition: all 0.3s ease;
            z-index: 100;
        }

        #trigger-zone {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 50px;
            z-index: 99;
        }

        #trigger-zone:hover + #toolbar,
        #toolbar:hover {
            opacity: 1;
            transform: translateY(0);
        }

        button {
            background: none;
            border: none;
            color: var(--meta-color);
            cursor: pointer;
            font-size: 13px;
            padding: 5px 10px;
            border-radius: 4px;
            transition: all 0.2s;
        }
        button:hover {
            color: var(--text-color);
            background: rgba(128, 128, 128, 0.1);
        }
        button.primary { color: #007aff; font-weight: 500; }
        button.danger { color: #ff3b30; }

        #status {
            margin-left: auto;
            font-size: 12px;
            color: var(--meta-color);
        }

        @media (max-width: 600px) {
            #content { padding: 20px 15px 70px 15px; font-size: 15px; }
            #toolbar {
                opacity: 1;
                transform: translateY(0);
                height: 45px;
            }
            #trigger-zone { display: none; }
            #word-count { bottom: 55px; right: 15px; }
        }
    </style>
</head>
<body>

<textarea id="content" placeholder="Start typing..." autofocus>${escapedContent}</textarea>

<div id="word-count">0 chars</div>

<div id="trigger-zone"></div>

<div id="toolbar">
    <button id="copyBtn" class="primary">Copy</button>
    <button id="downloadBtn">Download</button>
    <button id="emailBtn">Email</button>
    <button id="deleteBtn" class="danger">Delete</button>

    <div id="status"></div>

    <button id="toggleThemeBtn" style="margin-left:5px;">Theme</button>
</div>

<script>
const state = {
    content: document.getElementById('content').value,
    noteId: window.location.pathname.split('/').pop(),
    saveTimeout: null
};

const el = {
    textarea: document.getElementById('content'),
    wordCount: document.getElementById('word-count'),
    status: document.getElementById('status'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    emailBtn: document.getElementById('emailBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    toggleThemeBtn: document.getElementById('toggleThemeBtn')
};

// --------------------------------------------------
// 核心功能：防抖保存 & 字数统计
// --------------------------------------------------

const updateWordCount = () => {
    el.wordCount.textContent = el.textarea.value.length + ' chars';
};

const showStatus = (msg) => {
    el.status.textContent = msg;
    setTimeout(() => el.status.textContent = '', 2000);
};

const saveContent = async () => {
    const text = el.textarea.value;

    if (text === state.content) return;

    showStatus('Saving...');

    try {
        const response = await fetch(window.location.href, {
            method: 'POST',
            body: text
        });

        if (response.ok) {
            state.content = text;
            showStatus('Saved');
        } else {
            showStatus('Error');
        }
    } catch (e) {
        showStatus('Connection Error');
    }
};

el.textarea.addEventListener('input', () => {
    updateWordCount();
    clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(saveContent, 800);
});

updateWordCount();

// --------------------------------------------------
// 辅助功能
// --------------------------------------------------

el.copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(el.textarea.value);
        el.copyBtn.textContent = 'Copied!';
        setTimeout(() => el.copyBtn.textContent = 'Copy', 1500);
    } catch (err) {
        alert('Failed to copy');
    }
});

el.downloadBtn.addEventListener('click', () => {
    const blob = new Blob([el.textarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.noteId + '.txt';
    a.click();
    URL.revokeObjectURL(url);
});

el.emailBtn.addEventListener('click', () => {
    const text = el.textarea.value;
    const subject = 'Note: ' + state.noteId;
    const body = text;
    const mailto = 'mailto:?subject=' + encodeURIComponent(subject) +
                   '&body=' + encodeURIComponent(body);
    window.location.href = mailto;
});

el.deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this note permanently?')) return;

    await fetch(window.location.href, { method: 'POST', body: '' });
    window.location.reload();
});

// --------------------------------------------------
// 主题切换
// --------------------------------------------------
const initTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') document.body.classList.add('dark');
};

el.toggleThemeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

window.addEventListener('beforeunload', (e) => {
    if (el.textarea.value !== state.content) {
        e.preventDefault();
        e.returnValue = '';
    }
});

initTheme();
</script>
</body>
</html>`;
}
