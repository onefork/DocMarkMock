// router.js — Hash 路由
// 路由表：auth, dashboard, upload, editor, export
// 默认/未知 → dashboard（auth 登录态门控由 main.js 在 render 中处理）

export const ROUTES = ['auth', 'dashboard', 'upload', 'editor', 'export'];

// 从 location.hash 解析当前路由名
export function current() {
  const hash = location.hash || '';
  // 形如 #/dashboard
  const match = hash.match(/^#\/([a-z]+)/i);
  const name = match ? match[1].toLowerCase() : '';
  if (ROUTES.includes(name)) return name;
  // 未知或空 → dashboard（登录态由 main.js 处理）
  return 'dashboard';
}

export function navigate(route) {
  const target = ROUTES.includes(route) ? route : 'dashboard';
  const hash = '#/' + target;
  if (location.hash === hash) return;
  location.hash = hash;
}

export function start(onChange) {
  const handle = () => {
    try { onChange(current()); } catch (e) { console.error('[router] onChange error', e); }
  };
  window.addEventListener('hashchange', handle);
  // 首次 load
  handle();
  return () => window.removeEventListener('hashchange', handle);
}
