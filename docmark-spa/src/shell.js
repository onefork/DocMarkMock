// shell.js — 应用外壳（PC 侧边栏 / 移动端底部 Tab）
// auth 路由不渲染外壳（由 main.js 判断，直接把 view 放进 #app）

export const DESKTOP_BREAKPOINT = 1024;

export function isDesktop() {
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

// 监听 resize（防抖），仅在跨越 1024 断点时调用 cb
export function onBreakpoint(cb) {
  let prevDesktop = isDesktop();
  let timer = null;
  const handler = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const nowDesktop = isDesktop();
      if (nowDesktop !== prevDesktop) {
        prevDesktop = nowDesktop;
        try { cb(); } catch (e) { console.error('[shell] onBreakpoint cb error', e); }
      }
    }, 150);
  };
  window.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('resize', handler);
    if (timer) clearTimeout(timer);
  };
}

// PC 侧边栏导航项（data-nav 即点击导航目标；active 当 nav===route）
const SIDEBAR_NAV = [
  { label: '全部文件', icon: 'folder', nav: 'dashboard' },
  { label: '最近转换', icon: 'clock', nav: 'recent' },
  { label: '收藏', icon: 'star', nav: 'favorites' },
  { label: '模板库', icon: 'layout-grid', nav: 'templates' },
  { label: '回收站', icon: 'trash-2', nav: 'trash' },
];

// 移动端底部 Tab
const MOBILE_TABS = [
  { label: '全部文件', icon: 'folder', nav: 'dashboard' },
  { label: '最近', icon: 'clock', nav: 'dashboard' },
  { label: '上传', icon: 'upload', nav: 'upload' },
  { label: '编辑', icon: 'pencil', nav: 'editor' },
  { label: '我的', icon: 'user', nav: 'dashboard' },
];

function navItemHTML(item, route, activeUsedRef) {
  const isActive = item.nav === route && !activeUsedRef.value;
  if (isActive) activeUsedRef.value = true;
  const bg = isActive ? 'var(--color-primary-muted)' : 'transparent';
  const color = isActive ? 'var(--color-primary)' : 'var(--text-secondary)';
  const iconColor = isActive ? 'var(--color-primary)' : 'var(--text-tertiary)';
  return `
    <a href="#/${item.nav}" data-nav="${item.nav}"
       class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors"
       style="background:${bg};color:${color};">
      <i data-lucide="${item.icon}" style="width:18px;height:18px;color:${iconColor};"></i>
      <span class="docmark-body" style="font-size:14px;color:${color};">${item.label}</span>
    </a>`;
}

function renderSidebar(route) {
  const used = { value: false };
  const navHTML = SIDEBAR_NAV.map((it) => navItemHTML(it, route, used)).join('');
  return `
    <aside class="flex flex-col shrink-0 h-screen border-r"
           style="width:240px;border-color:var(--border-default);background:var(--bg-primary);">
      <!-- Logo -->
      <div class="flex items-center gap-2 px-5" style="height:60px;">
        <div class="flex items-center justify-center rounded-md"
             style="width:32px;height:32px;background:var(--color-primary);">
          <i data-lucide="file-text" style="width:18px;height:18px;color:var(--text-inverse);"></i>
        </div>
        <span class="docmark-h3" style="font-weight:700;letter-spacing:var(--letter-spacing-tight);">DocMark</span>
      </div>
      <!-- 导航 -->
      <nav class="flex flex-col gap-1 px-3 py-3 flex-1 overflow-y-auto no-scrollbar">
        ${navHTML}
      </nav>
      <!-- 用户区 -->
      <div class="px-3 py-3 border-t flex items-center gap-2" style="border-color:var(--border-default);">
        <div class="flex items-center justify-center rounded-full shrink-0"
             style="width:32px;height:32px;background:var(--color-primary-light);color:var(--color-primary);font-weight:600;font-size:13px;">
          张
        </div>
        <span class="docmark-body flex-1 truncate" style="font-size:14px;">张明</span>
        <button class="flex items-center justify-center rounded-md cursor-pointer"
                style="width:32px;height:32px;color:var(--text-secondary);"
                title="设置">
          <i data-lucide="settings" style="width:18px;height:18px;"></i>
        </button>
        <button data-action="logout"
                class="flex items-center justify-center rounded-md cursor-pointer"
                style="width:32px;height:32px;color:var(--text-secondary);"
                title="登出">
          <i data-lucide="log-out" style="width:18px;height:18px;"></i>
        </button>
      </div>
    </aside>`;
}

function renderMobileTabBar(route) {
  const used = { value: false };
  const tabsHTML = MOBILE_TABS.map((it) => {
    const isActive = it.nav === route && !used.value;
    if (isActive) used.value = true;
    const color = isActive ? 'var(--color-primary)' : 'var(--text-tertiary)';
    return `
      <a href="#/${it.nav}" data-nav="${it.nav}"
         class="flex flex-col items-center justify-center gap-1 cursor-pointer"
         style="flex:1;min-height:44px;min-width:44px;color:${color};">
        <i data-lucide="${it.icon}" style="width:22px;height:22px;color:${color};"></i>
        <span style="font-size:11px;color:${color};">${it.label}</span>
      </a>`;
  }).join('');

  return `
    <nav class="flex items-stretch border-t shrink-0"
         style="border-color:var(--border-default);background:var(--bg-primary);
                padding-bottom:env(safe-area-inset-bottom);">
      ${tabsHTML}
    </nav>`;
}

// 返回完整外壳 HTML 字符串
export function renderShell(route, contentHTML) {
  if (isDesktop()) {
    return `
      <div class="flex h-screen" style="background:var(--bg-secondary);">
        ${renderSidebar(route)}
        <main class="flex-1 flex flex-col h-screen overflow-hidden">
          <div id="main-content" class="flex-1 overflow-y-auto">${contentHTML}</div>
        </main>
      </div>`;
  }
  // 移动端
  return `
    <div class="flex flex-col h-screen" style="background:var(--bg-secondary);">
      <main class="flex-1 overflow-y-auto">
        <div id="main-content">${contentHTML}</div>
      </main>
      ${renderMobileTabBar(route)}
    </div>`;
}
