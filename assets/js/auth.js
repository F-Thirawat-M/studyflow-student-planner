(function (SF) {
  'use strict';

  let client = null;
  let currentUser = null;

  function setLoading(loading) {
    SF.utils.select('#app-loading').hidden = !loading;
  }

  async function toUser(authUser) {
    const { data } = await client.from('profiles').select('name').eq('id', authUser.id).maybeSingle();
    const name = data?.name || authUser.user_metadata?.name || authUser.email;
    return { id: authUser.id, name, email: authUser.email };
  }

  async function restoreSession() {
    try {
      const { data } = await client.auth.getSession();
      currentUser = data.session ? await toUser(data.session.user) : null;
    } catch {
      currentUser = null;
    }
    return currentUser;
  }

  function showError(id, message) {
    SF.utils.select(id).textContent = message;
  }

  function loginErrorMessage(error) {
    if (error.code === 'email_not_confirmed') return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
    if (error.code === 'invalid_credentials') return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }

  function registerErrorMessage(error) {
    if (error.code === 'user_already_exists') return 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน';
    if (error.code === 'weak_password') return 'รหัสผ่านง่ายเกินไป ลองใช้รหัสผ่านที่คาดเดายากขึ้น';
    return 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
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

  function showAuthScreen() {
    currentUser = null;
    SF.store.clear();
    SF.utils.select('#app-shell').hidden = true;
    SF.utils.select('#auth-screen').hidden = false;
    switchPanel('login');
  }

  async function enterApp(user) {
    currentUser = user;
    setLoading(true);
    try {
      await SF.store.useAccount(user.id);
    } catch {
      SF.app.toast('โหลดงานไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่อีกครั้ง', true);
      await logout();
      return;
    } finally {
      setLoading(false);
    }
    SF.utils.select('#auth-screen').hidden = true;
    SF.utils.select('#app-shell').hidden = false;
    SF.utils.select('#user-greeting').textContent = user.name;
    SF.utils.select('#user-avatar').textContent = user.name.trim().charAt(0).toUpperCase() || 'S';
    SF.app.render();
    SF.app.notifyUrgentTasks();
  }

  async function withSubmitLock(event, task) {
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await task();
    } catch {
      showError(`#${event.target.dataset.authPanel}-error`, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function login(event) {
    event.preventDefault();
    return withSubmitLock(event, async () => {
      const email = SF.utils.select('#login-email').value.trim().toLowerCase();
      const password = SF.utils.select('#login-password').value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        showError('#login-error', loginErrorMessage(error));
        return;
      }
      event.target.reset();
      await enterApp(await toUser(data.user));
    });
  }

  function register(event) {
    event.preventDefault();
    return withSubmitLock(event, async () => {
      const name = SF.utils.select('#register-name').value.trim();
      const email = SF.utils.select('#register-email').value.trim().toLowerCase();
      const password = SF.utils.select('#register-password').value;
      const confirmation = SF.utils.select('#register-confirm').value;
      if (password !== confirmation) {
        showError('#register-error', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        return;
      }
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } });
      if (error) {
        showError('#register-error', registerErrorMessage(error));
        return;
      }
      // เปิด email confirmation อยู่: อีเมลซ้ำจะได้ user ที่ไม่มี identities กลับมา
      if (!data.user?.identities?.length) {
        showError('#register-error', registerErrorMessage({ code: 'user_already_exists' }));
        return;
      }
      event.target.reset();
      if (data.session) {
        await enterApp(await toUser(data.user));
        return;
      }
      switchPanel('login');
      SF.app.toast('สมัครสำเร็จ กรุณายืนยันอีเมลแล้วเข้าสู่ระบบ');
    });
  }

  async function logout() {
    await SF.store.flush();   // รอให้งานที่ค้างเขียนอยู่ขึ้นเซิร์ฟเวอร์ก่อน ไม่งั้นจะหาย
    await client.auth.signOut();
    showAuthScreen();
  }

  // session ใช้ไม่ได้แล้ว (เช่น เปลี่ยนรหัสผ่านจากเครื่องอื่น) — เรียกจาก store เมื่อเขียนได้ 401
  async function expire() {
    if (!currentUser) return;
    showAuthScreen();
    SF.app.toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', true);
    await client.auth.signOut({ scope: 'local' });
  }

  async function init() {
    SF.utils.selectAll('.auth-tab').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.authTab)));
    SF.utils.selectAll('[data-switch-auth]').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.switchAuth)));
    SF.utils.select('#login-form').addEventListener('submit', login);
    SF.utils.select('#register-form').addEventListener('submit', register);
    SF.utils.select('#logout-btn').addEventListener('click', logout);

    client = SF.db;
    if (!client) {
      switchPanel('login');
      showError('#login-error', 'ตั้งค่า Supabase ไม่ครบ ไม่สามารถเข้าสู่ระบบได้');
      return;
    }
    // ออกจากระบบจากแท็บอื่น หรือ session หมดอายุ
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && currentUser) showAuthScreen();
    });

    // ซ่อนหน้าล็อกอินระหว่างตรวจ session กันจอกะพริบ
    SF.utils.select('#auth-screen').hidden = true;
    setLoading(true);
    const user = await restoreSession();
    setLoading(false);
    if (user) await enterApp(user);
    else showAuthScreen();
  }

  SF.auth = { init, expire, currentUser: () => currentUser };
})(window.StudyFlow);
