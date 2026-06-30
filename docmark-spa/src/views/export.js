// views/export.js — 导出文件视图
// 8 种导出格式 + 直接下载/复制到剪贴板 + 文件名自定义
// 本地交互用闭包局部状态管理，不调用 store notify
import * as store from '../store.js';
import * as router from '../router.js';
import * as shell from '../shell.js';
import * as converters from '../converters.js';

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function mount(root) {
  // 1. 确定内容
  const file = store.getFile(store.state.currentFileId) || store.state.files.find((f) => f.markdown);
  const hasContent = !!(store.state.currentMarkdown || (file && file.markdown));
  const md = store.state.currentMarkdown || (file && file.markdown) || '# 示例文档';

  // 空状态
  if (!hasContent) {
    root.innerHTML = `
      <main class="min-h-full flex items-center justify-center px-6 py-12" style="background:var(--bg-secondary)">
        <div class="text-center">
          <div class="flex items-center justify-center mx-auto mb-4 rounded-full"
               style="width:64px;height:64px;background:var(--bg-tertiary)">
            <i data-lucide="file-off" style="width:32px;height:32px;color:var(--text-tertiary)"></i>
          </div>
          <p class="docmark-h3" style="color:var(--text-secondary);margin-bottom:4px">暂无可导出的文档</p>
          <p class="docmark-caption">请先在编辑器中选择或识别一个文件</p>
          <button type="button" data-go-editor
                  class="mt-6 inline-flex items-center gap-2 cursor-pointer"
                  style="background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-lg);height:40px;padding:0 20px;font-size:14px;font-weight:500">
            <i data-lucide="arrow-left" style="width:16px;height:16px"></i>
            <span>返回编辑器</span>
          </button>
        </div>
      </main>`;
    if (window.lucide) window.lucide.createIcons();
    const btn = root.querySelector('[data-go-editor]');
    if (btn) btn.addEventListener('click', () => router.navigate('editor'));
    return;
  }

  // 2. 闭包局部状态
  let selectedFormat = 'md';
  let exportMethod = 'download';
  let filename = file ? file.name.replace(/\.[^.]+$/, '') : '导出文档';
  let isExporting = false;

  const sizeText = file ? file.sizeText : '';
  const wordCount = md.replace(/\s/g, '').length;
  const isMobile = !shell.isDesktop();

  // ---- 子组件 HTML ----
  function labelHTML(text) {
    return `<div class="mb-3" style="font-size:12px;text-transform:uppercase;color:var(--text-secondary);letter-spacing:var(--letter-spacing-wide)">${text}</div>`;
  }

  function formatCardHTML(f) {
    const selected = selectedFormat === f.id;
    const cardPad = isMobile ? 'padding:12px' : 'padding:16px';
    const minH = isMobile ? 'min-height:44px' : '';
    const cardBorder = selected
      ? 'border:2px solid var(--color-primary)'
      : 'border:1px solid var(--border-default)';
    const cardBg = selected ? 'var(--color-primary-light)' : 'var(--bg-primary)';
    const extBadgeBg = selected ? 'var(--bg-primary)' : 'var(--bg-secondary)';
    const extBadgeColor = selected ? 'var(--color-primary)' : 'var(--text-secondary)';
    const checkHTML = selected
      ? `<div data-check-circle class="rounded-full flex items-center justify-center shrink-0"
            style="width:20px;height:20px;background:var(--color-primary)">
           <i data-lucide="check" style="width:14px;height:14px;color:#fff"></i>
         </div>`
      : `<div data-check-circle class="rounded-full shrink-0"
            style="width:20px;height:20px;border:2px solid var(--border-default);background:transparent"></div>`;
    const mockBadge = f.mock
      ? `<span class="inline-flex items-center"
            style="background:var(--state-warning-light);color:var(--state-warning);border-radius:var(--radius-full);padding:2px 8px;font-size:11px;margin-left:6px;line-height:1.4">模拟</span>`
      : '';
    return `
      <button type="button" data-format="${f.id}" aria-pressed="${selected}"
              class="flex items-center justify-between text-left cursor-pointer"
              style="border-radius:var(--radius-lg);${cardBorder};background:${cardBg};${cardPad};${minH};transition:background .15s,border-color .15s">
        <div class="min-w-0 flex-1" style="margin-right:8px">
          <div class="docmark-h4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(f.label)}</div>
          <div class="mt-1 flex items-center flex-wrap">
            <span data-ext-badge
                  style="background:${extBadgeBg};color:${extBadgeColor};border-radius:var(--radius-full);padding:2px 10px;font-size:12px;line-height:1.4">${f.ext}</span>
            ${mockBadge}
          </div>
        </div>
        ${checkHTML}
      </button>`;
  }

  function methodItemHTML(m) {
    const selected = exportMethod === m.id;
    const radioHTML = selected
      ? `<div class="rounded-full flex items-center justify-center shrink-0"
            style="width:20px;height:20px;border:2px solid var(--color-primary);background:var(--color-primary)">
           <div style="width:8px;height:8px;border-radius:9999px;background:#fff"></div>
         </div>`
      : `<div class="rounded-full shrink-0"
            style="width:20px;height:20px;border:2px solid var(--border-strong);background:transparent"></div>`;
    return `
      <button type="button" data-method="${m.id}" aria-pressed="${selected}"
              class="flex items-center gap-3 w-full text-left cursor-pointer"
              style="padding:12px;border-radius:var(--radius-lg);border:1px solid var(--border-default);background:var(--bg-primary);transition:border-color .15s">
        ${radioHTML}
        <i data-lucide="${m.icon}" style="width:18px;height:18px;color:var(--text-secondary)"></i>
        <span class="docmark-body">${m.label}</span>
      </button>`;
  }

  // ---- 局部重渲染：格式区 ----
  function renderFormatSection() {
    const container = document.getElementById('format-grid');
    if (!container) return;
    container.innerHTML = converters.FORMATS.map(formatCardHTML).join('');
    if (window.lucide) window.lucide.createIcons();
    container.querySelectorAll('[data-format]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedFormat = btn.getAttribute('data-format');
        renderFormatSection();
        updateHint();
      });
    });
  }

  // ---- 局部重渲染：导出方式 ----
  function renderMethodSection() {
    const container = document.getElementById('method-list');
    if (!container) return;
    const items = [
      { id: 'download', label: '直接下载', icon: 'download' },
      { id: 'clipboard', label: '复制到剪贴板', icon: 'clipboard' },
    ];
    container.innerHTML = items.map(methodItemHTML).join('');
    if (window.lucide) window.lucide.createIcons();
    container.querySelectorAll('[data-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        exportMethod = btn.getAttribute('data-method');
        renderMethodSection();
      });
    });
  }

  // ---- 底部提示更新 ----
  function updateHint() {
    const hint = document.getElementById('export-hint');
    if (!hint) return;
    const fmt = converters.FORMATS.find((x) => x.id === selectedFormat);
    hint.textContent = fmt && fmt.mock ? '该格式为模拟产物' : '导出后的文件将保持文档结构';
  }

  // ---- 按钮加载态 ----
  function setExporting(loading) {
    isExporting = loading;
    document.querySelectorAll('[data-confirm-btn]').forEach((btn) => {
      btn.disabled = loading;
      if (loading) {
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">
          <i data-lucide="loader-2" style="width:16px;height:16px;animation:spin 1s linear infinite"></i>
          <span>导出中...</span>
        </span>`;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
      } else {
        btn.innerHTML = `<i data-lucide="download" style="width:16px;height:16px"></i><span>确认导出</span>`;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });
    if (window.lucide) window.lucide.createIcons();
  }

  // ---- Toast ----
  function showToast(msg) {
    // 移除已有 toast 避免堆叠
    document.querySelectorAll('[data-export-toast]').forEach((el) => el.remove());
    const toast = document.createElement('div');
    toast.setAttribute('data-export-toast', '');
    toast.className = 'docmark-body';
    toast.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:24px',
      'transform:translateX(-50%)',
      'background:var(--bg-primary)',
      'border:1px solid var(--border-default)',
      'box-shadow:var(--shadow-modal)',
      'border-radius:var(--radius-lg)',
      'padding:12px 16px',
      'z-index:9999',
      'max-width:90vw',
      'font-size:14px',
      'color:var(--text-primary)',
    ].join(';');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 2500);
  }

  // ---- 确认导出 ----
  async function doExport() {
    if (isExporting) return;
    const safeName = filename && filename.trim() ? filename.trim() : '导出文档';
    setExporting(true);
    try {
      const { blob, ext, isMock } = await converters.convert(selectedFormat, md);

      if (exportMethod === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName + '.' + ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${safeName}.${ext}` + (isMock ? '（模拟产物）' : ''));
      } else {
        // 复制到剪贴板
        try {
          if (selectedFormat === 'md') {
            await navigator.clipboard.writeText(md);
            showToast('已复制到剪贴板');
          } else if (selectedFormat === 'txt') {
            await navigator.clipboard.writeText(converters.stripMarkdown(md));
            showToast('已复制到剪贴板');
          } else if (selectedFormat === 'html') {
            const htmlText = await blob.text();
            await navigator.clipboard.writeText(htmlText);
            showToast('已复制到剪贴板');
          } else {
            // 二进制格式：尝试 ClipboardItem 写 blob，失败回退写 markdown 源码
            let written = false;
            try {
              if (typeof ClipboardItem !== 'undefined') {
                const item = new ClipboardItem({ [blob.type]: blob });
                await navigator.clipboard.write([item]);
                written = true;
              }
            } catch (e) {
              written = false;
            }
            if (written) {
              showToast('已复制到剪贴板');
            } else {
              await navigator.clipboard.writeText(md);
              showToast('已复制 Markdown 源码');
            }
          }
        } catch (e) {
          // 最终回退
          try {
            await navigator.clipboard.writeText(md);
            showToast('已复制 Markdown 源码');
          } catch (e2) {
            showToast('复制失败，请重试');
          }
        }
      }
    } catch (e) {
      console.error('[export] error', e);
      showToast('导出失败：' + (e && e.message ? e.message : '未知错误'));
    } finally {
      setExporting(false);
    }
  }

  // ---- 绑定通用事件 ----
  function bindCommon() {
    const input = document.getElementById('filename-input');
    if (input) {
      input.addEventListener('input', (e) => {
        filename = e.target.value;
      });
    }
    document.querySelectorAll('[data-cancel-btn]').forEach((btn) => {
      btn.addEventListener('click', () => router.navigate('editor'));
    });
    document.querySelectorAll('[data-back-btn]').forEach((btn) => {
      btn.addEventListener('click', () => router.navigate('editor'));
    });
    document.querySelectorAll('[data-confirm-btn]').forEach((btn) => {
      btn.addEventListener('click', doExport);
    });
  }

  // ---- PC 布局 ----
  function renderPC() {
    root.innerHTML = `
      <main class="min-h-full flex items-center justify-center px-6 py-12" style="background:var(--bg-secondary)">
        <div class="w-full rounded-lg p-8" style="max-width:640px;background:var(--bg-primary);border:1px solid var(--border-default)">
          <div class="mb-8">
            <h2 class="docmark-h2">导出文件</h2>
            <p class="docmark-caption">选择导出格式和目标</p>
          </div>

          <div class="flex items-center gap-4 mb-8"
               style="border-radius:var(--radius-lg);padding:16px;border:1px solid var(--border-default)">
            <div class="flex items-center justify-center rounded-full shrink-0"
                 style="width:48px;height:48px;background:var(--color-primary-light)">
              <i data-lucide="file-text" style="width:24px;height:24px;color:var(--color-primary)"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="docmark-h4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(file ? file.name : '导出文档')}</h4>
              <p class="docmark-caption">${sizeText ? sizeText + ' · ' : ''}${wordCount} 字</p>
            </div>
          </div>

          <div class="mb-8">
            ${labelHTML('导出格式')}
            <div id="format-grid" class="grid grid-cols-2 gap-3"></div>
          </div>

          <div class="mb-8">
            ${labelHTML('导出方式')}
            <div id="method-list" class="grid grid-cols-2 gap-3"></div>
          </div>

          <div class="mb-8">
            ${labelHTML('文件名')}
            <input id="filename-input" type="text" value="${escapeAttr(filename)}"
                   class="w-full"
                   style="height:40px;padding:0 16px;border-radius:var(--radius-lg);border:1px solid var(--border-default);outline:none;background:var(--bg-primary);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);transition:border-color .15s,box-shadow .15s"
                   onfocus="this.style.borderColor='var(--color-primary)';this.style.boxShadow='0 0 0 3px var(--color-primary-muted)'"
                   onblur="this.style.borderColor='var(--border-default)';this.style.boxShadow='none'">
          </div>

          <div class="flex justify-end gap-3 mb-4">
            <button type="button" data-cancel-btn
                    class="cursor-pointer"
                    style="color:var(--text-secondary);background:transparent;border:none;border-radius:var(--radius-lg);height:36px;padding:0 16px;font-size:14px;font-family:var(--font-sans)">
              取消
            </button>
            <button type="button" data-confirm-btn
                    class="flex items-center justify-center gap-2 cursor-pointer"
                    style="background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-lg);height:36px;padding:0 20px;min-width:120px;font-size:14px;font-weight:500;font-family:var(--font-sans)">
              <i data-lucide="download" style="width:16px;height:16px"></i><span>确认导出</span>
            </button>
          </div>

          <p id="export-hint" class="docmark-small" style="text-align:right">导出后的文件将保持文档结构</p>
        </div>
      </main>`;
    renderFormatSection();
    renderMethodSection();
    bindCommon();
    updateHint();
  }

  // ---- 移动端布局 ----
  function renderMobile() {
    root.innerHTML = `
      <main class="flex flex-col" style="min-height:100%;background:var(--bg-primary)">
        <div class="flex items-center gap-3 px-4 shrink-0"
             style="height:48px;border-bottom:1px solid var(--border-default);background:var(--bg-primary)">
          <button type="button" data-back-btn
                  class="flex items-center justify-center cursor-pointer"
                  style="width:36px;height:36px;background:transparent;border:none">
            <i data-lucide="arrow-left" style="width:20px;height:20px;color:var(--text-primary)"></i>
          </button>
          <span class="docmark-h3" style="font-weight:600">导出文件</span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 pt-4" style="padding-bottom:120px">
          <div class="flex items-center gap-3 mb-6"
               style="border-radius:var(--radius-lg);padding:12px;border:1px solid var(--border-default)">
            <div class="flex items-center justify-center rounded-full shrink-0"
                 style="width:40px;height:40px;background:var(--color-primary-light)">
              <i data-lucide="file-text" style="width:20px;height:20px;color:var(--color-primary)"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="docmark-h4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(file ? file.name : '导出文档')}</h4>
              <p class="docmark-caption">${sizeText ? sizeText + ' · ' : ''}${wordCount} 字</p>
            </div>
          </div>

          <div class="mb-6">
            ${labelHTML('导出格式')}
            <div id="format-grid" class="grid grid-cols-2 gap-2"></div>
          </div>

          <div class="mb-6">
            ${labelHTML('导出方式')}
            <div id="method-list" class="flex flex-col gap-2"></div>
          </div>

          <div class="mb-6">
            ${labelHTML('文件名')}
            <input id="filename-input" type="text" value="${escapeAttr(filename)}"
                   class="w-full"
                   style="height:44px;padding:0 16px;border-radius:var(--radius-lg);border:1px solid var(--border-default);outline:none;background:var(--bg-primary);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);transition:border-color .15s,box-shadow .15s"
                   onfocus="this.style.borderColor='var(--color-primary)';this.style.boxShadow='0 0 0 3px var(--color-primary-muted)'"
                   onblur="this.style.borderColor='var(--border-default)';this.style.boxShadow='none'">
          </div>

          <p id="export-hint" class="docmark-small">导出后的文件将保持文档结构</p>
        </div>

        <div style="position:fixed;left:0;right:0;bottom:0;border-top:1px solid var(--border-default);background:var(--bg-primary);padding-top:12px;padding-bottom:max(16px,env(safe-area-inset-bottom))">
          <div class="px-4">
            <button type="button" data-confirm-btn
                    class="flex items-center justify-center gap-2 w-full cursor-pointer"
                    style="background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-lg);height:44px;font-size:15px;font-weight:500;font-family:var(--font-sans)">
              <i data-lucide="download" style="width:18px;height:18px"></i><span>确认导出</span>
            </button>
          </div>
        </div>
      </main>`;
    renderFormatSection();
    renderMethodSection();
    bindCommon();
    updateHint();
  }

  // 注入 loader 旋转动画 keyframes（仅一次）
  if (!document.getElementById('export-spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'export-spin-keyframes';
    style.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  // 入口渲染
  if (isMobile) {
    renderMobile();
  } else {
    renderPC();
  }
  if (window.lucide) window.lucide.createIcons();
}
