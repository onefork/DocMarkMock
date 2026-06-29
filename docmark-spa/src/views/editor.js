// views/editor.js — 编辑器视图（PC 分屏 + 移动端 Tab + 浮动工具栏）
// 编辑过程中绝不调用会 notify 的 store 方法，避免重 mount 丢失焦点/光标。
import * as store from '../store.js';
import * as shell from '../shell.js';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 预览样式（注入一次，PC 与移动端共用 .editor-preview-content）
function injectPreviewStyle() {
  if (document.getElementById('editor-preview-style')) return;
  const style = document.createElement('style');
  style.id = 'editor-preview-style';
  style.textContent = `
    .editor-preview-content{color:var(--text-primary);font-family:var(--font-sans);font-size:var(--font-size-body);line-height:var(--line-height-normal);word-break:break-word;}
    .editor-preview-content>:first-child{margin-top:0;}
    .editor-preview-content>:last-child{margin-bottom:0;}
    .editor-preview-content h1{font-size:var(--font-size-h1);font-weight:var(--font-weight-bold);line-height:var(--line-height-tight);letter-spacing:var(--letter-spacing-tight);margin:24px 0 12px;}
    .editor-preview-content h2{font-size:var(--font-size-h2);font-weight:var(--font-weight-semibold);line-height:var(--line-height-tight);letter-spacing:var(--letter-spacing-tight);margin:22px 0 10px;}
    .editor-preview-content h3{font-size:var(--font-size-h3);font-weight:var(--font-weight-semibold);line-height:var(--line-height-tight);margin:18px 0 8px;}
    .editor-preview-content h4{font-size:var(--font-size-h4);font-weight:var(--font-weight-semibold);margin:14px 0 6px;}
    .editor-preview-content p{margin:10px 0;}
    .editor-preview-content ul,.editor-preview-content ol{padding-left:24px;margin:10px 0;}
    .editor-preview-content li{margin:4px 0;}
    .editor-preview-content table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px;}
    .editor-preview-content th,.editor-preview-content td{border:1px solid var(--border-default);padding:8px 12px;text-align:left;}
    .editor-preview-content th{background:var(--bg-secondary);font-weight:var(--font-weight-semibold);}
    .editor-preview-content tr:nth-child(even) td{background:var(--bg-secondary);}
    .editor-preview-content code{font-family:var(--font-mono);background:var(--bg-tertiary);padding:2px 6px;border-radius:var(--radius-sm);font-size:13px;}
    .editor-preview-content pre{background:var(--bg-secondary);padding:14px 16px;border-radius:var(--radius-md);overflow-x:auto;margin:14px 0;}
    .editor-preview-content pre code{background:transparent;padding:0;font-size:13px;}
    .editor-preview-content blockquote{border-left:3px solid var(--border-strong);padding:4px 0 4px 14px;color:var(--text-secondary);margin:14px 0;}
    .editor-preview-content a{color:var(--color-primary);text-decoration:none;}
    .editor-preview-content a:hover{text-decoration:underline;}
    .editor-preview-content img{max-width:100%;border-radius:var(--radius-md);}
    .editor-preview-content hr{border:none;border-top:1px solid var(--border-default);margin:18px 0;}
    .editor-preview-content input[type="checkbox"]{margin-right:6px;}
  `;
  document.head.appendChild(style);
}

export function mount(root) {
  injectPreviewStyle();

  // 1. 确定当前文件
  let file = store.getFile(store.state.currentFileId);
  if (!file) { file = store.state.files.find((f) => f.markdown); }

  // 空状态
  if (!file) {
    root.innerHTML = `
      <main class="flex items-center justify-center" style="min-height:calc(100vh - 56px);height:100%;background:var(--bg-primary);">
        <div class="text-center" style="padding:32px;">
          <div class="flex items-center justify-center mx-auto mb-4" style="width:64px;height:64px;background:var(--bg-tertiary);border-radius:var(--radius-full);">
            <i data-lucide="file-text" style="width:32px;height:32px;color:var(--text-tertiary);"></i>
          </div>
          <p class="docmark-h3" style="color:var(--text-secondary);margin-bottom:6px;">请先上传或选择文件</p>
          <p class="docmark-caption">还没有可编辑的文档</p>
          <a data-nav="upload" class="inline-flex items-center gap-2 cursor-pointer"
             style="margin-top:20px;background:var(--color-primary);color:#fff;border-radius:var(--radius-md);padding:9px 22px;font-size:14px;font-weight:var(--font-weight-medium);">
            <i data-lucide="upload" style="width:16px;height:16px;"></i>
            <span>去上传</span>
          </a>
        </div>
      </main>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. 闭包 md（编辑中只更新局部变量 + 直接赋值 store，不 notify）
  let md = store.state.currentMarkdown || file.markdown || '# 新文档\n\n开始编辑...';
  store.state.currentMarkdown = md;

  // 局部视图状态
  let mode = 'preview';       // PC: preview | compare
  let mobileTab = 'edit';     // 移动端: edit | preview

  // 元素引用（renderPC / renderMobile 中赋值）
  let textarea = null;
  let lineNumbers = null;
  let previewPanel = null;       // PC 右面板
  let mobilePreviewPanel = null; // 移动端预览面板
  let wordCountEl = null;
  let lineInfoEl = null;

  // ---- 直接同步 store（不 notify）----
  function syncToStore() {
    store.state.currentMarkdown = md;
    if (store.state.currentFileId) {
      const f = store.getFile(store.state.currentFileId);
      if (f) f.markdown = md;
    }
  }

  // ---- 局部重渲：行号 ----
  function renderLineNumbers() {
    if (!lineNumbers) return;
    const total = md.split('\n').length;
    let html = '';
    for (let i = 1; i <= total; i++) html += `<div>${i}</div>`;
    lineNumbers.innerHTML = html;
  }

  // ---- 局部重渲：预览 ----
  function parseMd() {
    if (window.marked && typeof window.marked.parse === 'function') {
      try { return window.marked.parse(md); } catch (e) { return escapeHtml(md); }
    }
    return escapeHtml(md);
  }
  function renderPreview() {
    const html = parseMd();
    if (previewPanel) {
      const banner = mode === 'compare'
        ? `<div class="docmark-small" style="display:inline-block;background:var(--color-primary-muted);color:var(--color-primary);padding:4px 12px;border-radius:var(--radius-sm);margin-bottom:14px;font-weight:var(--font-weight-medium);">对照模式</div>`
        : '';
      previewPanel.innerHTML = banner + `<div class="editor-preview-content">${html}</div>`;
    }
    if (mobilePreviewPanel) {
      mobilePreviewPanel.innerHTML = `<div class="editor-preview-content">${html}</div>`;
    }
  }

  // ---- 局部重渲：字数 / 行信息 ----
  function renderWordCount() {
    const count = md.replace(/\s/g, '').length;
    if (wordCountEl) wordCountEl.textContent = count + ' 字';
    if (lineInfoEl) lineInfoEl.textContent = 'Ln ' + md.split('\n').length;
  }

  function refreshAll() {
    renderLineNumbers();
    renderPreview();
    renderWordCount();
  }

  // ---- insert 工具函数 ----
  function wrap(prefix, suffix) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = md.slice(start, end);
    const replacement = prefix + selected + suffix;
    md = md.slice(0, start) + replacement + md.slice(end);
    textarea.value = md;
    if (selected.length === 0) {
      const pos = start + prefix.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    } else {
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
    }
    syncToStore();
    refreshAll();
    textarea.focus();
  }

  function linePrefix(prefix) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = md.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = md.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = md.length;
    const block = md.slice(lineStart, lineEnd);
    const newBlock = block.split('\n').map((line) => prefix + line).join('\n');
    md = md.slice(0, lineStart) + newBlock + md.slice(lineEnd);
    textarea.value = md;
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + newBlock.length;
    syncToStore();
    refreshAll();
    textarea.focus();
  }

  function insertText(text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    md = md.slice(0, start) + text + md.slice(end);
    textarea.value = md;
    const pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    syncToStore();
    refreshAll();
    textarea.focus();
  }

  function applyFmt(action) {
    switch (action) {
      case 'bold': wrap('**', '**'); break;
      case 'italic': wrap('*', '*'); break;
      case 'strike': wrap('~~', '~~'); break;
      case 'heading': linePrefix('# '); break;
      case 'link': wrap('[', '](url)'); break;
      case 'image': insertText('![alt](url)'); break;
      case 'code': wrap('`', '`'); break;
      case 'quote': linePrefix('> '); break;
      case 'list': linePrefix('- '); break;
      case 'list-ordered': linePrefix('1. '); break;
    }
  }

  // ---- PC 格式按钮 HTML ----
  function fmtBtnHTML(action, label, title, isIcon) {
    const inner = isIcon
      ? `<i data-lucide="${label}" style="width:16px;height:16px;"></i>`
      : `<span style="font-size:13px;line-height:1;${action === 'bold' ? 'font-weight:var(--font-weight-bold);' : ''}${action === 'italic' ? 'font-style:italic;' : ''}${action === 'strike' ? 'text-decoration:line-through;' : ''}${action === 'heading' ? 'font-weight:var(--font-weight-semibold);' : ''}">${escapeHtml(label)}</span>`;
    return `<button type="button" data-fmt="${action}" title="${title}" aria-label="${title}"
      class="flex items-center justify-center cursor-pointer"
      style="width:32px;height:32px;border-radius:var(--radius-sm);border:1px solid var(--border-default);background:var(--bg-primary);color:var(--text-secondary);transition:background .15s,border-color .15s;"
      onmouseenter="this.style.background='var(--bg-hover)';this.style.borderColor='var(--border-strong)';"
      onmouseleave="this.style.background='var(--bg-primary)';this.style.borderColor='var(--border-default)';">${inner}</button>`;
  }

  // ---- 移动端浮动工具栏按钮 HTML ----
  function mBtnHTML(action, icon, title) {
    return `<button type="button" data-fmt="${action}" title="${title}" aria-label="${title}"
      class="flex items-center justify-center cursor-pointer shrink-0"
      style="width:44px;height:44px;border-radius:var(--radius-lg);border:1px solid var(--border-default);background:var(--bg-primary);color:var(--text-secondary);flex-shrink:0;">
      <i data-lucide="${icon}" style="width:20px;height:20px;"></i>
    </button>`;
  }

  // ============ PC 布局 ============
  function renderPC() {
    const fileName = file.name.replace(/\.[^.]+$/, '');
    root.innerHTML = `
      <main class="flex flex-col h-full overflow-hidden" style="background:var(--bg-primary);">
        <!-- 顶部工具栏 -->
        <div class="flex items-center justify-between shrink-0" style="height:48px;border-bottom:1px solid var(--border-default);padding:0 24px;">
          <!-- 左组 -->
          <div class="flex items-center gap-3 min-w-0">
            <a data-nav="dashboard" class="flex items-center gap-1 cursor-pointer" style="color:var(--text-secondary);">
              <i data-lucide="arrow-left" style="width:16px;height:16px;"></i>
              <span class="docmark-small">返回</span>
            </a>
            <div style="width:1px;height:16px;background:var(--border-default);"></div>
            <span class="truncate" style="max-width:200px;font-weight:var(--font-weight-medium);color:var(--text-primary);">${escapeHtml(fileName)}</span>
            <div class="flex items-center gap-1.5">
              <span style="width:6px;height:6px;border-radius:var(--radius-full);background:var(--state-success);"></span>
              <span class="docmark-small" style="color:var(--text-tertiary);">已保存</span>
            </div>
          </div>
          <!-- 中组 格式工具栏 -->
          <div class="flex items-center gap-1">
            ${fmtBtnHTML('bold', 'B', '加粗')}
            ${fmtBtnHTML('italic', 'I', '斜体')}
            ${fmtBtnHTML('strike', 'S', '删除线')}
            ${fmtBtnHTML('heading', 'H', '标题')}
            <span style="width:1px;height:16px;background:var(--border-default);margin:0 4px;"></span>
            ${fmtBtnHTML('link', 'link', '链接', true)}
            ${fmtBtnHTML('image', 'image', '图片', true)}
            ${fmtBtnHTML('code', '</>', '代码')}
            ${fmtBtnHTML('quote', '"', '引用')}
            <span style="width:1px;height:16px;background:var(--border-default);margin:0 4px;"></span>
            ${fmtBtnHTML('list', 'list', '无序列表', true)}
            ${fmtBtnHTML('list-ordered', 'list-ordered', '有序列表', true)}
          </div>
          <!-- 右组 -->
          <div class="flex items-center gap-3">
            <div class="flex" style="border:1px solid var(--border-default);border-radius:var(--radius-sm);overflow:hidden;">
              <button type="button" data-mode="compare" class="cursor-pointer" style="padding:5px 14px;font-size:13px;border:none;background:transparent;color:var(--text-secondary);">对照</button>
              <button type="button" data-mode="preview" class="cursor-pointer" style="padding:5px 14px;font-size:13px;border:none;background:transparent;color:var(--text-secondary);">预览</button>
            </div>
            <a data-nav="export" class="flex items-center gap-1.5 cursor-pointer"
               style="padding:6px 16px;border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-size:14px;background:var(--bg-primary);transition:background .15s;"
               onmouseenter="this.style.background='var(--bg-hover)';"
               onmouseleave="this.style.background='var(--bg-primary)';">
              <i data-lucide="download" style="width:15px;height:15px;"></i>
              <span>导出</span>
            </a>
          </div>
        </div>

        <!-- 分屏区 -->
        <div class="flex flex-1 overflow-hidden" style="min-height:0;">
          <!-- 左面板 编辑器 -->
          <div class="flex" style="width:50%;min-width:0;overflow:hidden;">
            <div id="line-numbers" class="no-scrollbar"
                 style="width:48px;flex-shrink:0;text-align:right;color:var(--text-tertiary);font-family:var(--font-mono);font-size:13px;line-height:21px;padding:24px 10px 24px 0;overflow-y:auto;border-right:1px solid var(--border-subtle);background:var(--bg-primary);"></div>
            <textarea id="md-textarea" spellcheck="false"
                      class="flex-1"
                      style="min-width:0;font-family:var(--font-mono);font-size:14px;line-height:21px;color:var(--text-primary);padding:24px;resize:none;outline:none;border:none;white-space:pre;background:var(--bg-primary);"></textarea>
          </div>
          <!-- 分隔线 -->
          <div style="width:2px;flex-shrink:0;background:var(--border-default);"></div>
          <!-- 右面板 预览 -->
          <div id="preview-panel" class="flex-1 overflow-auto" style="min-width:0;padding:24px 32px;background:var(--bg-primary);"></div>
        </div>

        <!-- 底部状态栏 -->
        <div class="flex items-center justify-between shrink-0" style="height:28px;border-top:1px solid var(--border-default);background:var(--bg-secondary);padding:0 24px;">
          <div class="flex items-center gap-3">
            <span class="docmark-small" style="background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:1px 6px;color:var(--text-secondary);">Markdown</span>
            <span class="docmark-small" style="color:var(--text-tertiary);">UTF-8</span>
          </div>
          <span id="word-count" class="docmark-small" style="color:var(--text-tertiary);">0 字</span>
          <span id="line-info" class="docmark-small" style="color:var(--text-tertiary);">Ln 1</span>
        </div>
      </main>`;

    textarea = root.querySelector('#md-textarea');
    lineNumbers = root.querySelector('#line-numbers');
    previewPanel = root.querySelector('#preview-panel');
    mobilePreviewPanel = null;
    wordCountEl = root.querySelector('#word-count');
    lineInfoEl = root.querySelector('#line-info');
    textarea.value = md;

    // 格式按钮
    root.querySelectorAll('[data-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => applyFmt(btn.getAttribute('data-fmt')));
    });

    // 对照/预览 segmented
    function updateSegmented() {
      root.querySelectorAll('[data-mode]').forEach((btn) => {
        const active = btn.getAttribute('data-mode') === mode;
        btn.style.background = active ? 'var(--color-primary-muted)' : 'transparent';
        btn.style.color = active ? 'var(--color-primary)' : 'var(--text-secondary)';
        btn.style.fontWeight = active ? 'var(--font-weight-medium)' : 'var(--font-weight-regular)';
      });
    }
    root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.getAttribute('data-mode');
        updateSegmented();
        renderPreview();
      });
    });
    updateSegmented();

    // textarea input
    textarea.addEventListener('input', (e) => {
      md = e.target.value;
      syncToStore();
      refreshAll();
    });

    // 行号滚动同步
    textarea.addEventListener('scroll', () => {
      if (lineNumbers) lineNumbers.scrollTop = textarea.scrollTop;
    });

    refreshAll();
  }

  // ============ 移动端布局 ============
  function renderMobile() {
    const fileName = file.name.replace(/\.[^.]+$/, '');
    root.innerHTML = `
      <main class="flex flex-col" style="min-height:calc(100vh - 56px);background:var(--bg-primary);position:relative;">
        <!-- 顶栏 -->
        <div class="flex items-center justify-between sticky top-0 z-30" style="height:44px;border-bottom:1px solid var(--border-default);padding:0 12px;background:var(--bg-primary);">
          <a data-nav="dashboard" class="flex items-center justify-center cursor-pointer" style="width:44px;height:44px;color:var(--text-primary);">
            <i data-lucide="chevron-left" style="width:24px;height:24px;"></i>
          </a>
          <span class="truncate" style="flex:1;text-align:center;font-weight:var(--font-weight-semibold);color:var(--text-primary);font-size:15px;">${escapeHtml(fileName)}</span>
          <a data-nav="export" class="cursor-pointer" style="color:var(--color-primary);font-weight:var(--font-weight-medium);font-size:14px;padding:0 8px;white-space:nowrap;">导出</a>
        </div>

        <!-- 编辑/预览 Tab -->
        <div class="flex" style="border-bottom:1px solid var(--border-default);background:var(--bg-primary);">
          <button type="button" data-mtab="edit" class="relative flex items-center justify-center cursor-pointer"
                  style="flex:1;height:44px;border:none;background:transparent;color:var(--text-secondary);font-size:15px;">
            <span>编辑</span>
            <span class="mtab-underline" style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:24px;height:2px;background:var(--color-primary);display:none;"></span>
          </button>
          <button type="button" data-mtab="preview" class="relative flex items-center justify-center cursor-pointer"
                  style="flex:1;height:44px;border:none;background:transparent;color:var(--text-secondary);font-size:15px;">
            <span>预览</span>
            <span class="mtab-underline" style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:24px;height:2px;background:var(--color-primary);display:none;"></span>
          </button>
        </div>

        <!-- 状态行 -->
        <div class="flex items-center gap-2" style="height:28px;padding:0 16px;background:var(--bg-secondary);">
          <span style="width:6px;height:6px;border-radius:var(--radius-full);background:var(--state-success);"></span>
          <span class="docmark-small" style="color:var(--state-success);">已保存</span>
          <span id="m-word-count" class="docmark-small" style="color:var(--text-tertiary);">0 字</span>
        </div>

        <!-- 编辑面板 -->
        <div id="m-edit-panel" class="flex" style="flex:1;min-height:0;overflow:hidden;">
          <div id="line-numbers" class="no-scrollbar"
               style="width:40px;flex-shrink:0;text-align:right;color:var(--text-tertiary);font-family:var(--font-mono);font-size:13px;line-height:21px;padding:16px 8px 16px 0;overflow-y:auto;border-right:1px solid var(--border-subtle);background:var(--bg-primary);"></div>
          <textarea id="md-textarea" spellcheck="false"
                    class="flex-1"
                    style="min-width:0;font-family:var(--font-mono);font-size:14px;line-height:21px;color:var(--text-primary);padding:16px;resize:none;outline:none;border:none;white-space:pre;background:var(--bg-primary);"></textarea>
        </div>

        <!-- 预览面板 -->
        <div id="m-preview-panel" style="display:none;flex:1;min-height:0;overflow-y:auto;padding:16px;background:var(--bg-primary);"></div>

        <!-- 底部间距（给浮动工具栏留位） -->
        <div style="height:64px;flex-shrink:0;"></div>

        <!-- 浮动底部工具栏 -->
        <div style="position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--bg-primary);border-top:1px solid var(--border-default);box-shadow:0 -1px 2px rgba(0,0,0,0.04);padding-bottom:max(8px,env(safe-area-inset-bottom));">
          <div class="flex gap-2 no-scrollbar" style="overflow-x:auto;padding:8px 12px;">
            ${mBtnHTML('bold', 'bold', '加粗')}
            ${mBtnHTML('italic', 'italic', '斜体')}
            ${mBtnHTML('heading', 'heading', '标题')}
            ${mBtnHTML('link', 'link', '链接')}
            ${mBtnHTML('code', 'code', '代码')}
            ${mBtnHTML('quote', 'quote', '引用')}
            ${mBtnHTML('list', 'list', '列表')}
          </div>
        </div>
      </main>`;

    textarea = root.querySelector('#md-textarea');
    lineNumbers = root.querySelector('#line-numbers');
    previewPanel = null;
    mobilePreviewPanel = root.querySelector('#m-preview-panel');
    wordCountEl = root.querySelector('#m-word-count');
    lineInfoEl = null;
    textarea.value = md;

    const editPanel = root.querySelector('#m-edit-panel');
    const previewEl = root.querySelector('#m-preview-panel');

    // 浮动工具栏格式按钮
    root.querySelectorAll('[data-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => applyFmt(btn.getAttribute('data-fmt')));
    });

    // 编辑/预览 Tab 切换
    function updateMobileTabs() {
      root.querySelectorAll('[data-mtab]').forEach((btn) => {
        const active = btn.getAttribute('data-mtab') === mobileTab;
        btn.style.color = active ? 'var(--color-primary)' : 'var(--text-secondary)';
        btn.style.fontWeight = active ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)';
        const ul = btn.querySelector('.mtab-underline');
        if (ul) ul.style.display = active ? 'block' : 'none';
      });
      if (mobileTab === 'edit') {
        if (editPanel) editPanel.style.display = 'flex';
        if (previewEl) previewEl.style.display = 'none';
      } else {
        if (editPanel) editPanel.style.display = 'none';
        if (previewEl) previewEl.style.display = 'block';
        renderPreview();
      }
    }
    root.querySelectorAll('[data-mtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mobileTab = btn.getAttribute('data-mtab');
        updateMobileTabs();
      });
    });
    updateMobileTabs();

    // textarea input
    textarea.addEventListener('input', (e) => {
      md = e.target.value;
      syncToStore();
      refreshAll();
    });

    // 行号滚动同步
    textarea.addEventListener('scroll', () => {
      if (lineNumbers) lineNumbers.scrollTop = textarea.scrollTop;
    });

    refreshAll();
  }

  // 入口渲染
  if (shell.isDesktop()) {
    renderPC();
  } else {
    renderMobile();
  }
  if (window.lucide) window.lucide.createIcons();
}
