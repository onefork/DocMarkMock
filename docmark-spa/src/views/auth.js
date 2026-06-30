// views/auth.js — 登录/注册视图
import * as store from '../store.js';
import * as router from '../router.js';
import * as shell from '../shell.js';

// 内联社交登录图标（直接复用设计稿 SVG path）
const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.59.102-1.166.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
</svg>`;

const MICROSOFT_SVG = `<svg width="18" height="18" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#F25022" d="M1 1h10v10H1z"/>
  <path fill="#7FBA00" d="M12 1h10v10H12z"/>
  <path fill="#00A4EF" d="M1 12h10v10H1z"/>
  <path fill="#FFB900" d="M12 12h10v10H12z"/>
</svg>`;

const STRENGTH_COLORS = {
  0: 'var(--text-tertiary)',
  1: 'var(--state-error)',
  2: 'var(--state-warning)',
  3: 'var(--state-info)',
  4: 'var(--state-success)',
};
const STRENGTH_LABELS = {
  0: '密码强度',
  1: '弱',
  2: '一般',
  3: '较强',
  4: '强',
};

function calcStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/[A-Z]/.test(pw)) s += 1;
  if (/[0-9]/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}

export function mount(root) {
  const isDesktop = shell.isDesktop();
  const ctrlH = isDesktop ? 'h-9' : 'h-11';      // 主 CTA / 社交按钮
  const inputH = isDesktop ? 'h-10' : 'h-11';    // 输入框
  const toggleSize = isDesktop ? 'w-9 h-9' : 'w-11 h-11';

  root.innerHTML = `
    <style>
      .auth-input{
        background:var(--bg-primary);
        color:var(--text-primary);
        border:1px solid var(--border-default);
        border-radius:var(--radius-md);
        outline:none;
        transition:border-color .15s, box-shadow .15s;
      }
      .auth-input::placeholder{ color:var(--text-placeholder); }
      .auth-input:focus{
        border-color:var(--color-primary);
        box-shadow:0 0 0 3px var(--color-primary-muted);
      }
      .auth-input.invalid{ border-color:var(--state-error); }
      .auth-tab{
        background:transparent;border:0;cursor:pointer;padding-bottom:12px;
        font-family:var(--font-sans);
      }
      .auth-cta{ transition:background-color .15s; border:0; }
      .auth-cta:hover{ background:var(--color-primary-hover); }
      .auth-social{ transition:background-color .15s; }
      .auth-social:hover{ background:var(--bg-hover); }
      .auth-link{ transition:opacity .15s; }
      .auth-link:hover{ opacity:.8; }
    </style>

    <main class="min-h-screen flex items-center justify-center px-6 py-12" style="background:var(--bg-primary)">
      <div class="w-full max-w-[420px]">

        <!-- Logo 区 -->
        <div class="flex flex-col items-center mb-10">
          <div class="flex items-center justify-center rounded-lg"
               style="width:32px;height:32px;background:var(--color-primary-muted);">
            <i data-lucide="file-text" style="width:18px;height:18px;color:var(--color-primary);"></i>
          </div>
          <h1 class="docmark-h2 mt-3">DocMark</h1>
          <p class="docmark-caption mt-1" style="color:var(--text-tertiary);">智能文档转换</p>
        </div>

        <!-- Tab 切换 -->
        <div class="flex gap-6 mb-8" style="border-bottom:1px solid var(--border-default);">
          <button type="button" data-tab="login" class="auth-tab text-sm font-medium"
            style="color:var(--color-primary);border-bottom:2px solid var(--color-primary);margin-bottom:-1px;">登录</button>
          <button type="button" data-tab="register" class="auth-tab text-sm font-medium"
            style="color:var(--text-tertiary);border-bottom:2px solid transparent;margin-bottom:-1px;">注册</button>
        </div>

        <!-- 登录表单 -->
        <form id="auth-login-form" class="space-y-4" novalidate>
          <div>
            <label class="block text-sm font-medium mb-2" style="color:var(--text-secondary);">邮箱地址</label>
            <input type="email" name="email" placeholder="name@example.com" autocomplete="email"
              class="auth-input w-full ${inputH} px-3 text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2" style="color:var(--text-secondary);">密码</label>
            <div class="relative">
              <input type="password" name="password" placeholder="请输入密码" autocomplete="current-password"
                class="auth-input w-full ${inputH} px-3 pr-12 text-sm" />
              <button type="button" data-toggle
                class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${toggleSize}"
                style="color:var(--text-tertiary);">
                <i data-lucide="eye" style="width:18px;height:18px;"></i>
              </button>
            </div>
          </div>
          <div class="text-right">
            <a href="#" class="auth-link text-sm" style="color:var(--color-primary);">忘记密码?</a>
          </div>
          <button type="submit" data-action="login-submit"
            class="auth-cta w-full ${ctrlH} text-sm font-medium cursor-pointer"
            style="background:var(--color-primary);color:#fff;border-radius:var(--radius-lg);">
            登录
          </button>
        </form>

        <!-- 注册表单 -->
        <form id="auth-register-form" class="space-y-4 hidden" novalidate>
          <div>
            <label class="block text-sm font-medium mb-2" style="color:var(--text-secondary);">邮箱地址</label>
            <input type="email" name="email" placeholder="name@example.com" autocomplete="email"
              class="auth-input w-full ${inputH} px-3 text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2" style="color:var(--text-secondary);">密码</label>
            <div class="relative">
              <input type="password" name="password" id="reg-password" placeholder="请输入密码" autocomplete="new-password"
                class="auth-input w-full ${inputH} px-3 pr-12 text-sm" />
              <button type="button" data-toggle
                class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${toggleSize}"
                style="color:var(--text-tertiary);">
                <i data-lucide="eye" style="width:18px;height:18px;"></i>
              </button>
            </div>
            <div class="flex gap-1 mt-2" id="reg-strength-bars">
              <div class="flex-1 rounded-full" style="height:4px;background:var(--bg-active);" data-bar="1"></div>
              <div class="flex-1 rounded-full" style="height:4px;background:var(--bg-active);" data-bar="2"></div>
              <div class="flex-1 rounded-full" style="height:4px;background:var(--bg-active);" data-bar="3"></div>
              <div class="flex-1 rounded-full" style="height:4px;background:var(--bg-active);" data-bar="4"></div>
            </div>
            <div class="text-xs mt-1" id="reg-strength-label" style="color:var(--text-tertiary);">密码强度</div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2" style="color:var(--text-secondary);">确认密码</label>
            <div class="relative">
              <input type="password" name="confirm" placeholder="请再次输入密码" autocomplete="new-password"
                class="auth-input w-full ${inputH} px-3 pr-12 text-sm" />
              <button type="button" data-toggle
                class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${toggleSize}"
                style="color:var(--text-tertiary);">
                <i data-lucide="eye" style="width:18px;height:18px;"></i>
              </button>
            </div>
          </div>
          <button type="submit" data-action="register-submit"
            class="auth-cta w-full ${ctrlH} text-sm font-medium cursor-pointer"
            style="background:var(--color-primary);color:#fff;border-radius:var(--radius-lg);">
            注册
          </button>
        </form>

        <!-- 分隔线 -->
        <div class="flex items-center gap-4 my-8">
          <div class="flex-1" style="height:1px;background:var(--border-default);"></div>
          <span class="text-xs" style="color:var(--text-tertiary);">或</span>
          <div class="flex-1" style="height:1px;background:var(--border-default);"></div>
        </div>

        <!-- 社交登录 -->
        <div class="space-y-3">
          <button type="button" data-social="google"
            class="auth-social w-full ${ctrlH} flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
            style="background:var(--bg-primary);border:1px solid var(--border-default);border-radius:var(--radius-lg);color:var(--text-primary);">
            ${GOOGLE_SVG}<span>使用 Google 登录</span>
          </button>
          <button type="button" data-social="microsoft"
            class="auth-social w-full ${ctrlH} flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
            style="background:var(--bg-primary);border:1px solid var(--border-default);border-radius:var(--radius-lg);color:var(--text-primary);">
            ${MICROSOFT_SVG}<span>使用 Microsoft 登录</span>
          </button>
        </div>

        <!-- 底部 -->
        <div class="mt-8 text-center text-xs" style="color:var(--text-tertiary);">
          注册即表示同意<a href="#" class="auth-link" style="color:var(--color-primary);">《服务条款》</a>和<a href="#" class="auth-link" style="color:var(--color-primary);">《隐私政策》</a>
        </div>
      </div>
    </main>
  `;

  // --- 引用关键节点 ---
  const loginForm = root.querySelector('#auth-login-form');
  const registerForm = root.querySelector('#auth-register-form');
  const tabBtns = root.querySelectorAll('.auth-tab');

  // --- Tab 切换（本地 DOM 操作，避免触发 store notify）---
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      tabBtns.forEach((b) => {
        const isActive = b.getAttribute('data-tab') === tab;
        b.style.color = isActive ? 'var(--color-primary)' : 'var(--text-tertiary)';
        b.style.borderBottom = isActive
          ? '2px solid var(--color-primary)'
          : '2px solid transparent';
      });
      const showLogin = tab === 'login';
      loginForm.classList.toggle('hidden', !showLogin);
      registerForm.classList.toggle('hidden', showLogin);
    });
  });

  // --- 密码可见性切换（直接操作 DOM + 重建图标）---
  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inputEl = btn.parentElement.querySelector('input');
      if (!inputEl) return;
      const isPw = inputEl.type === 'password';
      inputEl.type = isPw ? 'text' : 'password';
      btn.innerHTML = `<i data-lucide="${isPw ? 'eye-off' : 'eye'}" style="width:18px;height:18px;"></i>`;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) { /* noop */ }
      }
    });
  });

  // --- 注册表单密码强度 ---
  const regPwInput = root.querySelector('#reg-password');
  const strengthBars = root.querySelectorAll('#reg-strength-bars [data-bar]');
  const strengthLabel = root.querySelector('#reg-strength-label');

  function renderStrength(pw) {
    const score = calcStrength(pw);
    const color = STRENGTH_COLORS[score];
    strengthBars.forEach((bar) => {
      const i = parseInt(bar.getAttribute('data-bar'), 10);
      bar.style.background = i <= score ? color : 'var(--bg-active)';
    });
    strengthLabel.textContent = STRENGTH_LABELS[score];
    strengthLabel.style.color = color;
  }
  regPwInput.addEventListener('input', () => renderStrength(regPwInput.value));

  // --- 输入时清除错误态 ---
  root.querySelectorAll('.auth-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      if (inp.value.trim()) inp.classList.remove('invalid');
    });
  });

  // --- 表单提交校验 ---
  function validateAndSubmit(form) {
    const inputs = form.querySelectorAll('input');
    let valid = true;
    inputs.forEach((inp) => {
      if (!inp.value.trim()) {
        inp.classList.add('invalid');
        valid = false;
      } else {
        inp.classList.remove('invalid');
      }
    });
    if (!valid) return;
    store.login();
    router.navigate('dashboard');
  }
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    validateAndSubmit(loginForm);
  });
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    validateAndSubmit(registerForm);
  });

  // --- 社交登录（直接登录，无需校验）---
  root.querySelectorAll('[data-social]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.login();
      router.navigate('dashboard');
    });
  });
}
