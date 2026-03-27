/**
 * I.R.I.S — Login Page Logic
 * Handles role toggle, sign-in, sign-up, and Firebase auth.
 */

'use strict';

(() => {
    /* ═══════════════════════════════════════════
       SIGN IN
    ═══════════════════════════════════════════ */
    const form = document.getElementById('login-form');
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const togglePw = document.getElementById('toggle-pw');
    const roleBtns = document.querySelectorAll('#view-signin .role-btn');

    let selectedRole = 'admin';

    // ── Role Toggle (sign-in) ──
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            selectedRole = btn.dataset.role;
            hideError();
        });
    });

    // ── Password visibility toggle (sign-in) ──
    togglePw.addEventListener('click', () => {
        const hidden = passwordEl.type === 'password';
        passwordEl.type = hidden ? 'text' : 'password';
        togglePw.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
        togglePw.querySelector('svg').innerHTML = hidden
            ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });

    function showError(msg) {
        errorMsg.textContent = msg;
        errorBox.classList.add('visible');
        const card = document.querySelector('.auth-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 600);
    }
    function hideError() { errorBox.classList.remove('visible'); }
    function setLoading(on) { loginBtn.disabled = on; loginBtn.classList.toggle('loading', on); }

    // ── Ripple ──
    loginBtn.addEventListener('click', e => {
        const rect = loginBtn.getBoundingClientRect();
        const r = document.createElement('span');
        r.classList.add('ripple-el');
        r.style.left = (e.clientX - rect.left - 6) + 'px';
        r.style.top = (e.clientY - rect.top - 6) + 'px';
        loginBtn.appendChild(r);
        setTimeout(() => r.remove(), 600);
    });

    // ── Sign In Submit ──
    form.addEventListener('submit', async e => {
        e.preventDefault();
        hideError();
        const email = emailEl.value.trim();
        const password = passwordEl.value;
        if (!email) { showError('Email is required.'); emailEl.focus(); return; }
        if (!password) { showError('Password is required.'); passwordEl.focus(); return; }

        setLoading(true);
        const result = await Auth.login(email, password, selectedRole);

        if (!result.success) {
            setLoading(false);
            showError(result.error);
            return;
        }

        loginBtn.querySelector('.btn-text').textContent = '✓ Authenticated';
        loginBtn.style.backgroundColor = 'var(--clr-success, #10b981)';
        await new Promise(r => setTimeout(r, 600));
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity .4s ease';
        setTimeout(() => Auth.redirectByRole(), 400);
    });

    [emailEl, passwordEl].forEach(el => el.addEventListener('input', hideError));


})();

