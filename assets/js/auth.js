(function (SF) {
  'use strict';

  const ACCOUNTS_KEY = 'studyflow-accounts-v1';
  const SESSION_KEY = 'studyflow-session-v1';
  let currentUser = null;

  function readAccounts() {
    try {
      const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function bytesToHex(bytes) {
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function fallbackHash(value) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`.repeat(4);
  }

  async function hashPassword(password, salt, algorithm = 'sha256-subtle') {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    if (algorithm === 'sha256-subtle' && crypto.subtle) return bytesToHex(await crypto.subtle.digest('SHA-256', data));
    return fallbackHash(`${salt}:${password}`);
  }

  function createSalt() {
    return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  }

  function publicUser(account) {
    return { id: account.id, name: account.name, email: account.email };
  }

  function restoreSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY));
      const account = readAccounts().find((item) => item.id === session?.userId);
      currentUser = account ? publicUser(account) : null;
    } catch {
      currentUser = null;
    }
    return currentUser;
  }

  function showError(id, message) {
    SF.utils.select(id).textContent = message;
  }

  function switchPanel(panel) {
    SF.utils.selectAll('.auth-tab').forEach((tab) => {
      const active = tab.dataset.authTab === panel;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    SF.utils.selectAll('[data-auth-panel]').forEach((form) => { form.hidden = form.dataset.authPanel !== panel; });
    showError('#login-error', '');
    showError('#register-error', '');
    requestAnimationFrame(() => SF.utils.select(panel === 'login' ? '#login-email' : '#register-name').focus());
  }

  function enterApp(user) {
    currentUser = user;
    SF.store.useAccount(user.id);
    SF.utils.select('#auth-screen').hidden = true;
    SF.utils.select('#app-shell').hidden = false;
    SF.utils.select('#user-greeting').textContent = user.name;
    SF.utils.select('#user-avatar').textContent = user.name.trim().charAt(0).toUpperCase() || 'S';
    SF.app.render();
    SF.app.notifyUrgentTasks();
  }

  async function login(event) {
    event.preventDefault();
    const email = SF.utils.select('#login-email').value.trim().toLowerCase();
    const password = SF.utils.select('#login-password').value;
    const account = readAccounts().find((item) => item.email === email);
    if (!account || await hashPassword(password, account.salt, account.algorithm) !== account.passwordHash) {
      showError('#login-error', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id }));
    event.target.reset();
    enterApp(publicUser(account));
  }

  async function register(event) {
    event.preventDefault();
    const name = SF.utils.select('#register-name').value.trim();
    const email = SF.utils.select('#register-email').value.trim().toLowerCase();
    const password = SF.utils.select('#register-password').value;
    const confirmation = SF.utils.select('#register-confirm').value;
    if (password !== confirmation) {
      showError('#register-error', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    const accounts = readAccounts();
    if (accounts.some((item) => item.email === email)) {
      showError('#register-error', 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน');
      return;
    }
    const salt = createSalt();
    const algorithm = crypto.subtle ? 'sha256-subtle' : 'local-fallback';
    const account = {
      id: crypto.randomUUID ? crypto.randomUUID() : SF.utils.uid(),
      name,
      email,
      salt,
      algorithm,
      passwordHash: await hashPassword(password, salt, algorithm),
      createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    saveAccounts(accounts);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id }));
    event.target.reset();
    enterApp(publicUser(account));
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    SF.utils.select('#app-shell').hidden = true;
    SF.utils.select('#auth-screen').hidden = false;
    switchPanel('login');
  }

  function init() {
    SF.utils.selectAll('.auth-tab').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.authTab)));
    SF.utils.selectAll('[data-switch-auth]').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.switchAuth)));
    SF.utils.select('#login-form').addEventListener('submit', login);
    SF.utils.select('#register-form').addEventListener('submit', register);
    SF.utils.select('#logout-btn').addEventListener('click', logout);
    const user = restoreSession();
    if (user) enterApp(user);
    else switchPanel('login');
  }

  SF.auth = { init, currentUser: () => currentUser };
})(window.StudyFlow);
