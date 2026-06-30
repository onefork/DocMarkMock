// views/dashboard.js — 文件管理仪表盘
import { state, setState, removeFile, updateFile, getFile, setCurrent, getKPI } from '../store.js';
import { navigate } from '../router.js';
import * as shell from '../shell.js';
import * as ocrService from '../ocrService.js';

// 搜索框焦点/光标位置（跨重渲染保持可用）
let _searchFocused = false;
let _searchCursor = null;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TYPE_META = {
  pdf:   { icon: 'file-text',        label: 'PDF',   bg: 'var(--state-error-light)',   color: 'var(--state-error)' },
  image: { icon: 'image',            label: '图片',  bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  docx:  { icon: 'file-text',        label: 'Word',  bg: 'var(--state-warning-light)', color: 'var(--state-warning)' },
  excel: { icon: 'file-spreadsheet', label: 'Excel', bg: 'var(--state-success-light)', color: 'var(--state-success)' },
};

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.pdf;
}

function statusBadge(status) {
  switch (status) {
    case 'completed':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style="background:var(--state-success-light);color:var(--state-success);">已完成</span>`;
    case 'processing':
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style="background:var(--state-info-light);color:var(--state-info);"><i data-lucide="loader-2" class="animate-spin" style="width:12px;height:12px;"></i>转换中</span>`;
    case 'failed':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style="background:var(--state-error-light);color:var(--state-error);">失败</span>`;
    case 'pending':
    default:
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style="background:var(--bg-tertiary);color:var(--text-tertiary);">待处理</span>`;
  }
}

function fileIconBox(file, size) {
  const m = typeMeta(file.type);
  const iconSize = Math.round(size * 0.5);
  return `
    <div class="flex items-center justify-center rounded-lg shrink-0"
         style="width:${size}px;height:${size}px;background:${m.bg};">
      <i data-lucide="${m.icon}" style="width:${iconSize}px;height:${iconSize}px;color:${m.color};"></i>
    </div>`;
}

function downloadMarkdown(file) {
  if (!file.markdown) return;
  const blob = new Blob([file.markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name.replace(/\.[^.]+$/, '') + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function retryFile(file) {
  updateFile(file.id, { status: 'processing' });
  ocrService.recognize({ name: file.name, type: file.type, size: file.size })
    .then((r) => {
      updateFile(file.id, { status: 'completed', markdown: r.markdown, pageCount: r.pageCount });
    })
    .catch(() => {
      updateFile(file.id, { status: 'failed' });
    });
}

// ---- KPI 指标条 ----
function kpiCardHTML(icon, iconBg, iconColor, value, labelHTML) {
  return `
    <div class="flex items-center gap-4 p-4 rounded-lg border"
         style="border-color:var(--border-default);background:var(--bg-primary);min-width:140px;">
      <div class="flex items-center justify-center rounded-lg shrink-0"
           style="width:40px;height:40px;background:${iconBg};">
        <i data-lucide="${icon}" style="width:20px;height:20px;color:${iconColor};"></i>
      </div>
      <div class="flex flex-col min-w-0">
        <span class="text-2xl font-bold tabular-nums" style="color:var(--text-primary);line-height:1.2;">${value}</span>
        <span class="text-xs" style="color:var(--text-secondary);">${labelHTML}</span>
      </div>
    </div>`;
}

function renderKPI(kpi, isDesktop) {
  const cls = isDesktop
    ? 'grid grid-cols-3 gap-4 mb-6'
    : 'flex gap-3 overflow-x-auto no-scrollbar mb-4';
  return `
    <div class="${cls}">
      ${kpiCardHTML('files', 'var(--color-primary-muted)', 'var(--color-primary)', kpi.total, '总文件数')}
      ${kpiCardHTML('refresh-cw', 'var(--state-success-light)', 'var(--state-success)', kpi.monthly,
        '本月转换&nbsp;<span class="inline-flex items-center gap-0.5" style="color:var(--state-success);"><i data-lucide="trending-up" style="width:12px;height:12px;"></i>12%</span>')}
      ${kpiCardHTML('hard-drive', 'var(--color-primary-muted)', 'var(--color-primary)', kpi.storageText, '存储用量')}
    </div>`;
}

// ---- 视图切换条 ----
function renderViewToggle(isDesktop, count) {
  const tableActive = state.viewMode === 'table';
  const cardActive = state.viewMode === 'card';
  const toggleHTML = isDesktop ? `
    <div class="flex items-center gap-1 p-1 rounded-lg" style="background:var(--bg-secondary);">
      <button type="button" data-view="table"
              class="flex items-center justify-center rounded-md cursor-pointer transition-all"
              style="width:32px;height:32px;background:${tableActive ? 'var(--bg-primary)' : 'transparent'};color:${tableActive ? 'var(--color-primary)' : 'var(--text-tertiary)'};box-shadow:${tableActive ? 'var(--shadow-static)' : 'none'};border:none;">
        <i data-lucide="table-2" style="width:16px;height:16px;"></i>
      </button>
      <button type="button" data-view="card"
              class="flex items-center justify-center rounded-md cursor-pointer transition-all"
              style="width:32px;height:32px;background:${cardActive ? 'var(--bg-primary)' : 'transparent'};color:${cardActive ? 'var(--color-primary)' : 'var(--text-tertiary)'};box-shadow:${cardActive ? 'var(--shadow-static)' : 'none'};border:none;">
        <i data-lucide="layout-grid" style="width:16px;height:16px;"></i>
      </button>
    </div>` : '<div></div>';
  return `
    <div class="flex items-center justify-between mb-4">
      ${toggleHTML}
      <span class="text-xs" style="color:var(--text-tertiary);">共 ${count} 个文件</span>
    </div>`;
}

// ---- 表格视图 ----
function tableActionBtn(act, icon, title, disabled, isDelete, id) {
  const cls = isDelete ? 'dm-act-btn dm-delete' : 'dm-act-btn';
  const attrs = disabled ? 'disabled' : `data-act="${act}" data-id="${id}"`;
  return `<button type="button" class="${cls}" title="${title}" ${attrs}>
    <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
  </button>`;
}

function tableActionsHTML(file) {
  const isProcessing = file.status === 'processing';
  const noMd = isProcessing || !file.markdown;
  return `
    <div class="flex items-center justify-end gap-1">
      ${tableActionBtn('edit', 'pencil', '编辑', isProcessing, false, file.id)}
      ${tableActionBtn('download', 'download', '下载', noMd, false, file.id)}
      ${file.status === 'failed' ? tableActionBtn('retry', 'rotate-cw', '重试', false, false, file.id) : ''}
      ${tableActionBtn('delete', 'trash-2', '删除', false, true, file.id)}
    </div>`;
}

function renderTable(files) {
  const rows = files.map((f) => `
    <tr class="dm-row">
      <td class="dm-td dm-td-check">
        <input type="checkbox" style="accent-color:var(--color-primary);cursor:pointer;" />
      </td>
      <td class="dm-td dm-td-name">
        <div class="flex items-center gap-3 overflow-hidden">
          ${fileIconBox(f, 32)}
          <span class="truncate min-w-0 dm-name">${escapeHtml(f.name)}</span>
        </div>
      </td>
      <td class="dm-td dm-td-meta">${typeMeta(f.type).label}</td>
      <td class="dm-td dm-td-meta">${escapeHtml(f.sizeText || '')}</td>
      <td class="dm-td dm-td-meta">${statusBadge(f.status)}</td>
      <td class="dm-td dm-td-meta">${escapeHtml(f.modified || '')}</td>
      <td class="dm-td dm-td-actions">${tableActionsHTML(f)}</td>
    </tr>`).join('');

  return `
    <div class="rounded-lg border overflow-hidden" style="border-color:var(--border-default);background:var(--bg-primary);">
      <table class="w-full dm-table">
        <colgroup>
          <col style="width:44px;">
          <col>
          <col style="width:72px;">
          <col style="width:80px;">
          <col style="width:96px;">
          <col style="width:104px;">
          <col style="width:176px;">
        </colgroup>
        <thead>
          <tr class="dm-thead-row">
            <th class="dm-th dm-th-check">
              <input type="checkbox" style="accent-color:var(--color-primary);cursor:pointer;" />
            </th>
            <th class="dm-th">文件名</th>
            <th class="dm-th">类型</th>
            <th class="dm-th">大小</th>
            <th class="dm-th">状态</th>
            <th class="dm-th">修改时间</th>
            <th class="dm-th dm-th-actions">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ---- 卡片视图 ----
function cardActionsHTML(file) {
  const isProcessing = file.status === 'processing';
  const noMd = isProcessing || !file.markdown;
  const btn = (act, icon, title, disabled, isDelete) => {
    const cls = isDelete ? 'dm-card-btn dm-delete' : 'dm-card-btn';
    const attrs = disabled ? 'disabled' : `data-act="${act}" data-id="${file.id}"`;
    return `<button type="button" class="${cls}" title="${title}" ${attrs}>
      <i data-lucide="${icon}" style="width:18px;height:18px;"></i>
    </button>`;
  };
  return `
    <div class="flex items-center gap-0.5">
      ${btn('edit', 'pencil', '编辑', isProcessing, false)}
      ${btn('download', 'download', '下载', noMd, false)}
      ${file.status === 'failed' ? btn('retry', 'rotate-cw', '重试', false, false) : ''}
      ${btn('delete', 'trash-2', '删除', false, true)}
    </div>`;
}

function renderCards(files) {
  const cards = files.map((f) => `
    <div class="flex items-center gap-3 p-3 rounded-lg border" style="border-color:var(--border-default);background:var(--bg-primary);">
      ${fileIconBox(f, 40)}
      <div class="flex-1 min-w-0">
        <div class="truncate" style="color:var(--text-primary);font-weight:500;font-size:14px;line-height:1.4;">${escapeHtml(f.name)}</div>
        <div class="text-xs truncate" style="color:var(--text-tertiary);margin-top:2px;">
          ${typeMeta(f.type).label} · ${escapeHtml(f.sizeText || '')} · ${escapeHtml(f.modified || '')}
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        ${statusBadge(f.status)}
        ${cardActionsHTML(f)}
      </div>
    </div>`).join('');
  return `<div class="flex flex-col gap-2">${cards}</div>`;
}

// ---- 空状态 ----
function renderEmpty(hasQuery) {
  const icon = hasQuery ? 'search-x' : 'inbox';
  const hint = hasQuery ? '尝试使用其他关键词搜索' : '点击「新建转换」上传你的第一个文件';
  return `
    <div class="flex flex-col items-center justify-center text-center" style="min-height:50vh;padding:48px 24px;">
      <div class="flex items-center justify-center rounded-full mb-4" style="width:64px;height:64px;background:var(--bg-tertiary);">
        <i data-lucide="${icon}" style="width:28px;height:28px;color:var(--text-tertiary);"></i>
      </div>
      <p class="docmark-h4" style="margin-bottom:4px;">没有找到文件</p>
      <p class="text-sm" style="color:var(--text-tertiary);">${hint}</p>
    </div>`;
}

// ---- 主入口 ----
export function mount(root) {
  const isDesktop = shell.isDesktop();
  const kpi = getKPI();
  const q = state.searchQuery.trim().toLowerCase();
  const files = state.files.filter((f) => !q || f.name.toLowerCase().includes(q));
  const useTable = state.viewMode === 'table' && isDesktop;
  const hasQuery = !!q;

  root.innerHTML = `
    <style>
      .dm-table { table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 14px; }
      .dm-thead-row { background: var(--bg-secondary); }
      .dm-th { text-align: left; padding: 10px 12px; font-weight: 500; color: var(--text-secondary); font-size: 13px; white-space: nowrap; }
      .dm-th-check { width: 44px; }
      .dm-th-actions { text-align: right; }
      .dm-td { padding: 10px 12px; border-top: 1px solid var(--border-default); vertical-align: middle; }
      .dm-td-check { width: 44px; }
      .dm-td-name { color: var(--text-primary); }
      .dm-td-meta { color: var(--text-secondary); white-space: nowrap; }
      .dm-td-actions { text-align: right; }
      .dm-name { color: var(--text-primary); font-weight: 500; }
      .dm-row { transition: background-color .12s; }
      .dm-row:hover { background: var(--bg-hover); }
      .dm-act-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; border: none; background: transparent; color: var(--text-secondary); transition: background-color .12s, color .12s; padding: 0; }
      .dm-act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .dm-act-btn:not(:disabled):hover { background: var(--bg-hover); }
      .dm-act-btn.dm-delete:not(:disabled):hover { background: var(--state-error-light); color: var(--state-error); }
      .dm-card-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; min-height: 40px; border-radius: 8px; cursor: pointer; border: none; background: transparent; color: var(--text-secondary); transition: background-color .12s, color .12s; padding: 0; }
      .dm-card-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .dm-card-btn:not(:disabled):hover { background: var(--bg-hover); }
      .dm-card-btn.dm-delete:not(:disabled):hover { background: var(--state-error-light); color: var(--state-error); }
    </style>
    <div class="flex flex-col h-full" style="background:var(--bg-primary);">
      <!-- 顶部栏 -->
      <div class="flex items-center justify-between ${isDesktop ? 'px-6' : 'px-4'} h-16 border-b shrink-0" style="border-color:var(--border-default);">
        <h1 class="${isDesktop ? 'docmark-h2' : 'docmark-h3'}">全部文件</h1>
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- 搜索框 -->
          <div class="relative ${isDesktop ? '' : 'flex-1'}" style="${isDesktop ? 'width:240px;' : ''}">
            <i data-lucide="search" class="absolute" style="left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-tertiary);pointer-events:none;"></i>
            <input id="dashboard-search" type="text" placeholder="搜索文件..." value="${escapeHtml(state.searchQuery)}"
                   class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none"
                   style="border-color:var(--border-default);background:var(--bg-primary);color:var(--text-primary);" />
          </div>
          <!-- 新建转换按钮 -->
          <a href="#/upload" data-nav="upload"
             class="flex items-center gap-2 px-4 rounded-lg cursor-pointer shrink-0"
             style="height:${isDesktop ? '36px' : '44px'};background:var(--color-primary);color:var(--text-inverse);font-size:14px;font-weight:500;text-decoration:none;">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>新建转换</span>
          </a>
        </div>
      </div>
      <!-- 内容区 -->
      <div class="flex-1 overflow-y-auto ${isDesktop ? 'p-6' : 'p-4'}">
        ${renderKPI(kpi, isDesktop)}
        ${renderViewToggle(isDesktop, files.length)}
        ${files.length === 0 ? renderEmpty(hasQuery) : (useTable ? renderTable(files) : renderCards(files))}
      </div>
    </div>`;

  // ---- 搜索框：跨重渲染保持焦点/光标 ----
  const searchInput = root.querySelector('#dashboard-search');
  if (searchInput) {
    if (_searchFocused) {
      searchInput.focus();
      if (_searchCursor != null) {
        try { searchInput.setSelectionRange(_searchCursor, _searchCursor); } catch (_) { /* noop */ }
      }
    }
    searchInput.addEventListener('focus', () => { _searchFocused = true; });
    searchInput.addEventListener('input', (e) => {
      _searchCursor = e.target.selectionStart;
      _searchFocused = true;
      setState({ searchQuery: e.target.value });
    });
    searchInput.addEventListener('blur', () => { _searchFocused = false; });
  }

  // ---- 事件委托：视图切换 + 操作按钮 ----
  root.addEventListener('click', (e) => {
    // 视图切换
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      const v = viewBtn.getAttribute('data-view');
      if (v === 'table' || v === 'card') setState({ viewMode: v });
      return;
    }
    // 操作按钮
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-act');
      const id = actBtn.getAttribute('data-id');
      const file = getFile(id);
      if (!file) return;
      switch (act) {
        case 'edit':
          setCurrent(id);
          navigate('editor');
          break;
        case 'download':
          downloadMarkdown(file);
          break;
        case 'delete':
          removeFile(id);
          break;
        case 'retry':
          retryFile(file);
          break;
        default:
          break;
      }
    }
  });

  // 渲染 lucide 图标
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (_) { /* noop */ }
  }
}
