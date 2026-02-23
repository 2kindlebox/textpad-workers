export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    let noteId = pathParts[0];

    // 生成随机 ID
    if (!noteId) {
      const newId = generateId();
      return Response.redirect(`${url.origin}/${newId}`, 302);
    }

    // 验证 ID 格式
    if (!/^[a-zA-Z0-9_-]+$/.test(noteId) || noteId.length > 64) {
      return new Response('Invalid note ID', { status: 400 });
    }

    const kvKey = `note:${noteId}`;

    // POST 请求：保存或删除
    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      let text = '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        text = formData.get('text') || '';
      } else {
        text = await request.text();
      }

      if (text.length === 0) {
        await env.NOTES.delete(kvKey);
      } else {
        await env.NOTES.put(kvKey, text);
      }

      return new Response('OK', {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    // GET 请求：读取
    const userAgent = request.headers.get('user-agent') || '';
    const isRaw = url.searchParams.has('raw') || 
                  userAgent.startsWith('curl') || 
                  userAgent.startsWith('Wget');

    const content = await env.NOTES.get(kvKey);

    // Raw 模式返回纯文本
    if (isRaw) {
      if (content === null) {
        return new Response('Not Found', { 
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      return new Response(content, {
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store'
        }
      });
    }

    // 返回 HTML 页面
    const html = renderHTML(noteId, content || '');
    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
};

function generateId() {
  const chars = '234579abcdefghjkmnpqrstwxyz';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHTML(noteId, content) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(noteId)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📝%3C/text%3E%3C/svg%3E">
<style>
body{margin:0;background:#ebeef1;color:#000;font-family:"Roboto Mono",monospace;}
.container{position:absolute;top:20px;right:20px;bottom:50px;left:20px;}
#content{margin:0;padding:20px;overflow-y:auto;resize:none;width:100%;height:100%;
        box-sizing:border-box;border:1px solid #ddd;outline:none;
        font-family:"Roboto Mono",monospace;font-size:1em;line-height:1.7;}
.controls{position:fixed;bottom:10px;left:20px;}
.controls a,.controls button{
        margin-right:10px;padding:4px 10px;background:#ebeef1;border:1px solid #999;
        border-radius:3px;text-decoration:none;color:#000;font-size:0.8em;cursor:pointer;}
.controls a:hover,.controls button:hover{background:#ddd;}
body.dark{background:#333b4d;color:#fff;}
body.dark #content{background:#24262b;border-color:#495265;color:#fff;}
body.dark .controls a,body.dark .controls button{background:#383838;color:#ccc;border-color:#555;}
body.dark .controls a:hover,body.dark .controls button:hover{background:#555;}
body.dark ::selection {background: rgba(255,255,255,.25);color: inherit;}
body.dark textarea::selection {background: rgba(255,255,255,.25);}
</style>
</head>
<body>
<div class="container">
<textarea id="content">${escapeHtml(content)}</textarea>
</div>
<div class="controls">
    <a href="#" id="downloadLink">Download TXT</a>
    <a href="#" id="copyLink">Copy</a>
    <a href="#" id="deleteLink">Delete</a>
    <a href="#" id="emailLink">Send by E-mail</a>
    <button id="toggleDarkBtn" type="button">Toggle Dark</button>
    <button id="refreshBtn" type="button" onclick="location.reload(true)">Refresh</button>
</div>
<script>
var textarea = document.getElementById('content');
var content = textarea.value;
function uploadContent() {
    if (content !== textarea.value) {
        var temp = textarea.value;
        fetch(window.location.href, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
            body: 'text=' + encodeURIComponent(temp)
        }).then(() => {
            content = temp;
            setTimeout(uploadContent, 1000);
        }).catch(() => setTimeout(uploadContent, 1000));
    } else {
        setTimeout(uploadContent, 1000);
    }
}
function updateLinks() {
    var text = textarea.value;
    var fileName = window.location.pathname.split('/').pop() + '.txt';
    try {
        var blob = new Blob([text], {type: 'text/plain'});
        var url = URL.createObjectURL(blob);
        document.getElementById('downloadLink').href = url;
        document.getElementById('downloadLink').download = fileName;
    } catch (e) {}
    document.getElementById('emailLink').href = 'mailto:?subject=' + encodeURIComponent(fileName) + '&body=' + encodeURIComponent(text);
}
document.getElementById('copyLink').onclick = function () {
    textarea.select();
    try {
        if (document.execCommand('copy')) {
            this.textContent = 'Copied!';
            setTimeout(() => this.textContent = 'Copy', 1500);
            return false;
        }
    } catch (e) {}
    location.href = 'mailto:?body=' + encodeURIComponent(textarea.value);
    return false;
};
document.getElementById('deleteLink').onclick = function () {
    if (!confirm('Delete this note permanently?')) return false;
    fetch(window.location.href, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
        body: 'text='
    }).then(() => {
        textarea.value = '';
        location.reload();
    });
    return false;
};
document.getElementById('toggleDarkBtn').onclick = function () {
    document.body.classList.toggle('dark');
};
textarea.oninput = updateLinks;
updateLinks();
textarea.focus();
uploadContent();
</script>
</body>
</html>`;
}
