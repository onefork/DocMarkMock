// main.js — 入口：初始化路由、监听 hashchange 与 resize、协调 shell+view 渲染
import * as store from './store.js';
import * as router from './router.js';
import * as shell from './shell.js';
import { mount as authView } from './views/auth.js';
import { mount as dashboardView } from './views/dashboard.js';
import { mount as uploadView } from './views/upload.js';
import { mount as editorView } from './views/editor.js';
import { mount as exportView } from './views/export.js';

const views = {
  auth: authView,
  dashboard: dashboardView,
  upload: uploadView,
  editor: editorView,
  export: exportView,
};

const app = document.getElementById('app');

function createIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) { /* noop */ }
  }
}

function scrollTop() {
  window.scrollTo(0, 0);
  const main = document.getElementById('main-content');
  if (main) main.scrollTop = 0;
}

function render() {
  const route = router.current();
  const isLoggedIn = store.state.isLoggedIn;

  // auth 路由或未登录（且非 auth 路由）→ 渲染 auth（无外壳）
  const showAuth = route === 'auth' || (!isLoggedIn && route !== 'auth');

  if (showAuth) {
    // 无外壳，直接把 auth view 放进 #app
    views.auth.mount(app);
    createIcons();
    scrollTop();
    return;
  }

  // 渲染外壳（contentHTML 传空字符串，view mount 自己设 innerHTML）
  app.innerHTML = shell.renderShell(route, '');
  const mainContent = document.getElementById('main-content');
  const view = views[route] || views.dashboard;
  view.mount(mainContent);
  createIcons();
  scrollTop();
}

// 委托：在 #app 上监听点击
app.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    const dest = navEl.getAttribute('data-nav');
    router.navigate(dest);
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.getAttribute('data-action');
    if (action === 'logout') {
      e.preventDefault();
      store.logout();
      router.navigate('auth');
    }
  }
});

// 启动
store.subscribe(render);
router.start(render);
shell.onBreakpoint(render);
