// views/upload.js — 上传文件
// 队列/进度/状态全部用闭包局部变量管理 + 直接操作 DOM 更新进度；
// 转换过程中绝不调用 store 的 notify 方法，仅在全部完成后批量写入 store.state.files。
import * as store from '../store.js';
import * as router from '../router.js';
import * as shell from '../shell.js';
import * as ocrService from '../ocrService.js';

const MAX_FILES = 10;
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

// ---- 本文件内小工具 ----
let _idSeq = 0;
function genId() {
  _idSeq += 1;
  return 'up_' + Date.now().toString(36) + '_' + _idSeq;
}

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function inferType(name, mime) {
  const n = (name || '').toLowerCase();
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.(jpe?g|png|bmp|tiff?|gif)$/.test(n) || (mime && mime.indexOf('image/') === 0)) return 'image';
  if (/\.docx$/.test(n)) return 'docx';
  if (/\.xlsx$/.test(n)) return 'excel';
  return 'pdf';
}

const TYPE_META = {
  pdf:   { icon: 'file-text',        bg: 'var(--state-error-light)',   color: 'var(--state-error)' },
  image: { icon: 'image',            bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  docx:  { icon: 'file-text',        bg: 'var(--state-warning-light)', color: 'var(--state-warning)' },
  excel: { icon: 'file-spreadsheet', bg: 'var(--state-success-light)', color: 'var(--state-success)' },
};
const DEFAULT_META = { icon: 'file-text', bg: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' };

function typeMeta(type) {
  return TYPE_META[type] || DEFAULT_META;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) { /* noop */ }
  }
}

export function mount(root) {
  const isDesktop = shell.isDesktop();
  const dropzoneMaxW = isDesktop ? '60%' : '100%';
  const dropzonePad = isDesktop ? 48 : 32;

  // 闭包局部队列与状态（store notify 重 mount 时会丢失，故不依赖 store）
  const queue = [];
  let isConverting = false;

  root.innerHTML = `
    <style>
      .um-dropzone {
        border: 2px dashed var(--border-strong);
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        transition: border-color .15s, background .15s;
        outline: none;
      }
      .um-dropzone:hover,
      .um-dropzone:focus-visible,
      .um-dropzone.um-active {
        border-color: var(--color-primary);
        background: var(--color-primary-light);
      }
      .um-link {
        display: inline-flex; align-items: center; gap: 6px;
        color: var(--text-secondary); font-size: 14px;
        text-decoration: none; cursor: pointer;
        transition: opacity .12s;
      }
      .um-link:hover { opacity: 0.7; }
      .um-btn-secondary {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 0 16px; border-radius: var(--radius-md);
        border: 1px solid var(--border-default);
        background: var(--bg-primary); color: var(--text-primary);
        font-size: 14px; cursor: pointer;
        transition: background .12s, border-color .12s;
      }
      .um-btn-secondary:hover { background: var(--bg-hover); }
      .um-btn-primary {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 0 16px; border-radius: var(--radius-lg);
        border: none; background: var(--color-primary); color: var(--text-inverse);
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: opacity .12s, background .12s;
      }
      .um-btn-primary:not(:disabled):hover { background: var(--color-primary-hover); }
      .um-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .um-icon-box {
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; border-radius: var(--radius-md);
      }
      .um-remove-btn {
        display: flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: var(--radius-sm);
        border: none; background: transparent; color: var(--text-tertiary);
        cursor: pointer; padding: 0;
        transition: background .12s, color .12s;
      }
      .um-remove-btn:not(:disabled):hover { background: var(--bg-hover); color: var(--text-secondary); }
      .um-remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .um-clear-btn {
        background: none; border: none; cursor: pointer;
        color: var(--text-tertiary); font-size: 13px;
        padding: 4px 8px; min-height: 32px; border-radius: var(--radius-sm);
        transition: color .12s;
      }
      .um-clear-btn:not(:disabled):hover { color: var(--text-secondary); }
      .um-clear-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
    <div class="flex flex-col h-full" style="background:var(--bg-primary);">
      <!-- 顶部栏 -->
      <div class="flex items-center justify-between ${isDesktop ? 'px-6' : 'px-4'} py-4 border-b shrink-0"
           style="border-color:var(--border-default);background:var(--bg-primary);">
        <a href="#/dashboard" data-nav="dashboard" class="um-link"
           style="min-height:${isDesktop ? '36px' : '44px'};">
          <i data-lucide="arrow-left" style="width:16px;height:16px;"></i>
          <span>返回文件列表</span>
        </a>
        <h1 class="docmark-h3">上传文件</h1>
        <button id="um-continue" type="button" class="um-btn-secondary"
                style="height:${isDesktop ? '36px' : '44px'};">
          <i data-lucide="plus" style="width:16px;height:16px;"></i>
          <span>继续添加</span>
        </button>
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 overflow-y-auto">
        <div class="flex flex-col items-center mx-auto px-6 py-8" style="max-width:860px;width:100%;">
          <!-- 拖放区 -->
          <div id="um-dropzone" role="button" tabindex="0"
               class="um-dropzone flex flex-col items-center justify-center text-center cursor-pointer"
               style="width:100%;max-width:${dropzoneMaxW};padding:${dropzonePad}px;">
            <i data-lucide="upload-cloud" style="width:48px;height:48px;color:var(--text-tertiary);"></i>
            <p class="docmark-h3" style="margin-top:12px;">拖拽文件到此处</p>
            <p style="color:var(--text-secondary);margin-top:4px;font-size:14px;">或点击选择文件</p>
            <p class="docmark-caption" style="margin-top:8px;">支持 PDF、JPG、PNG、BMP、TIFF、GIF 格式，单个文件最大 25MB</p>
          </div>

          <!-- 文件队列区 -->
          <div id="um-queue-section"
               style="width:100%;max-width:${dropzoneMaxW};margin-top:32px;display:none;"></div>

          <!-- 底部操作区 -->
          <div class="flex flex-col items-center gap-3" style="width:100%;margin-top:32px;padding-bottom:32px;">
            <button id="um-start" type="button" class="um-btn-primary"
                    style="width:100%;max-width:${isDesktop ? '280px' : 'none'};height:44px;" disabled>
              <span>开始转换</span>
            </button>
            <p class="docmark-caption">支持批量转换，一次最多 10 个文件</p>
          </div>
        </div>
      </div>

      <input id="um-file-input" type="file" multiple
             accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.gif,image/*,application/pdf"
             style="display:none;" />
    </div>
  `;

  // ---- DOM 引用 ----
  const dropzone = root.querySelector('#um-dropzone');
  const fileInput = root.querySelector('#um-file-input');
  const continueBtn = root.querySelector('#um-continue');
  const queueSection = root.querySelector('#um-queue-section');
  const startBtn = root.querySelector('#um-start');

  // ---- 状态徽标 HTML ----
  function statusHTML(item) {
    if (item.status === 'completed') {
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
        style="background:var(--state-success-light);color:var(--state-success);">
        <i data-lucide="check" style="width:12px;height:12px;"></i>已完成</span>`;
    }
    if (item.status === 'processing') {
      return `<span class="text-xs font-medium tabular-nums" style="color:var(--color-primary);">${item.progress}%</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
      style="background:var(--bg-tertiary);color:var(--text-tertiary);">待处理</span>`;
  }

  // ---- 单个队列项 HTML ----
  function itemHTML(item) {
    const m = typeMeta(item.type);
    const showProgress = item.status === 'processing';
    return `
      <div class="um-item flex items-center gap-3 px-4 py-3" data-uid="${item.id}"
           style="border-radius:var(--radius-md);border:1px solid var(--border-default);background:var(--bg-primary);">
        <div class="um-icon-box" style="width:36px;height:36px;background:${m.bg};">
          <i data-lucide="${m.icon}" style="width:18px;height:18px;color:${m.color};"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="truncate" style="font-weight:500;color:var(--text-primary);font-size:14px;line-height:1.4;">${escapeHtml(item.name)}</div>
          <div class="text-xs" style="color:var(--text-tertiary);margin-top:2px;">${escapeHtml(item.sizeText)}</div>
          <div class="um-progress-wrap" style="display:${showProgress ? 'block' : 'none'};margin-top:6px;">
            <div style="height:4px;border-radius:var(--radius-full);background:var(--bg-tertiary);overflow:hidden;">
              <div class="um-progress-bar" style="height:100%;width:${item.progress}%;background:var(--color-primary);transition:width .15s;"></div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="um-status">${statusHTML(item)}</span>
          <button type="button" class="um-remove-btn" data-uid="${item.id}" title="移除" ${isConverting ? 'disabled' : ''}>
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </div>`;
  }

  // ---- 全量重绘队列区 ----
  function renderQueue() {
    if (queue.length === 0) {
      queueSection.style.display = 'none';
      queueSection.innerHTML = '';
      updateStartButton();
      return;
    }
    queueSection.style.display = 'block';
    queueSection.innerHTML = `
      <div class="flex items-center justify-between" style="margin-bottom:12px;">
        <span style="font-weight:500;color:var(--text-primary);font-size:14px;">已选择 ${queue.length} 个文件</span>
        <button type="button" id="um-clear" class="um-clear-btn" ${isConverting ? 'disabled' : ''}>清空</button>
      </div>
      <div class="flex flex-col gap-2">
        ${queue.map(itemHTML).join('')}
      </div>`;
    updateStartButton();
    refreshIcons();
  }

  // ---- 单项 DOM 更新（进度/状态变化时直接操作 DOM，不重绘整列）----
  function updateItemDOM(id) {
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const el = queueSection.querySelector(`.um-item[data-uid="${id}"]`);
    if (!el) return;
    const statusEl = el.querySelector('.um-status');
    const progressWrap = el.querySelector('.um-progress-wrap');
    const progressBar = el.querySelector('.um-progress-bar');
    if (statusEl) statusEl.innerHTML = statusHTML(item);
    if (progressWrap) progressWrap.style.display = item.status === 'processing' ? 'block' : 'none';
    if (progressBar) progressBar.style.width = item.progress + '%';
    refreshIcons();
  }

  // ---- 开始按钮可用性 ----
  function updateStartButton() {
    const hasPending = queue.some((q) => q.status === 'pending');
    startBtn.disabled = isConverting || !hasPending;
  }

  // ---- 加入文件到队列 ----
  function addFiles(fileList) {
    if (isConverting) return;
    const files = Array.from(fileList || []);
    for (const f of files) {
      if (queue.length >= MAX_FILES) {
        alert(`一次最多上传 ${MAX_FILES} 个文件`);
        break;
      }
      if (f.size > MAX_SIZE) {
        alert(`文件「${f.name}」超过 25MB 限制，已跳过`);
        continue;
      }
      queue.push({
        id: genId(),
        name: f.name,
        type: inferType(f.name, f.type),
        size: f.size,
        sizeText: formatSize(f.size),
        status: 'pending',
        progress: 0,
        result: null,
      });
    }
    renderQueue();
  }

  function triggerPick() {
    if (isConverting) return;
    fileInput.value = '';
    fileInput.click();
  }

  // ---- 拖放区事件 ----
  dropzone.addEventListener('click', triggerPick);
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerPick();
    }
  });
  continueBtn.addEventListener('click', triggerPick);

  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('um-active');
    });
  });
  ['dragleave', 'dragend'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('um-active');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('um-active');
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  });

  // ---- 队列区事件委托（清空 + 移除）----
  queueSection.addEventListener('click', (e) => {
    if (e.target.closest('#um-clear')) {
      if (isConverting) return;
      queue.length = 0;
      renderQueue();
      return;
    }
    const removeBtn = e.target.closest('.um-remove-btn');
    if (removeBtn) {
      if (isConverting) return;
      const uid = removeBtn.getAttribute('data-uid');
      const idx = queue.findIndex((q) => q.id === uid);
      if (idx >= 0) {
        queue.splice(idx, 1);
        renderQueue();
      }
    }
  });

  // ---- 开始转换 ----
  startBtn.addEventListener('click', startConversion);

  async function startConversion() {
    if (isConverting) return;
    const pending = queue.filter((q) => q.status === 'pending');
    if (pending.length === 0) return;

    isConverting = true;
    pending.forEach((it) => { it.status = 'processing'; it.progress = 0; });
    renderQueue();

    const tasks = pending.map((item) =>
      ocrService.recognize(
        { name: item.name, type: item.type, size: item.size },
        (p) => {
          item.progress = p;
          updateItemDOM(item.id);
        }
      ).then((r) => {
        item.status = 'completed';
        item.result = r;
        item.progress = 100;
        updateItemDOM(item.id);
        return { item, r };
      })
    );

    let results = [];
    try {
      results = await Promise.all(tasks);
    } catch (err) {
      console.error('[upload] conversion error', err);
    }

    // 批量写入 store（不 notify）
    const newFiles = results
      .filter(Boolean)
      .map(({ item, r }) => ({
        id: genId(),
        name: item.name,
        type: item.type,
        size: item.size,
        sizeText: item.sizeText,
        status: 'completed',
        modified: today(),
        markdown: r.markdown,
        pageCount: r.pageCount,
      }));

    if (newFiles.length > 0) {
      store.state.files.unshift(...newFiles);
      isConverting = false;
      const firstId = newFiles[0].id;
      store.setCurrent(firstId); // notify → 重 mount（可接受）
      router.navigate('editor');
    } else {
      isConverting = false;
      updateStartButton();
    }
  }
}
