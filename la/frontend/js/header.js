function initNavActive() {
    const category = new URLSearchParams(location.search).get('cat');
    document.querySelectorAll('.header-nav a').forEach((link) => {
        link.classList.toggle('active', link.dataset.cat === category);
    });
}

function initSearch() {
    const input = document.querySelector('.search-box input');
    const icon = document.querySelector('.search-icon');
    input.value = new URLSearchParams(location.search).get('search') || '';

    if (document.getElementById('product-grid')) return;

    const goToSearch = () => {
        const query = input.value.trim();
        if (query) location.href = 'category.html?search=' + encodeURIComponent(query);
    };
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') goToSearch();
    });
    icon.addEventListener('click', goToSearch);
}

function openAuthModal() {
    document.getElementById('auth-modal').classList.add('open');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.remove('open');
}

function switchAuthTab(name) {
    document.querySelectorAll('.modal-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.modal-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === name + '-panel');
    });
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
}

function validateLoginForm(form) {
    const emailError = validateEmail(form.email.value.trim());
    if (emailError) return emailError;
    if (!form.password.value) return 'Заполните поле «Пароль»';
    return '';
}

function validateRegisterForm(form) {
    if (!form.name.value.trim()) return 'Заполните поле «Имя»';
    const emailError = validateEmail(form.email.value.trim());
    if (emailError) return emailError;
    if (!form.password.value) return 'Заполните поле «Пароль»';
    if (!form.password_confirm.value) return 'Заполните поле «Повторите пароль»';
    if (form.password.value !== form.password_confirm.value) return 'Пароли не совпадают';
    return '';
}

async function submitAuthForm(form, errorEl, validate, sendRequest) {
    const error = validate(form);
    errorEl.textContent = error;
    if (error) return;

    try {
        const data = await sendRequest();
        saveSession(data.token, data.user);
        location.href = 'account.html';
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function initAuthModal() {
    const modal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    document.getElementById('profile-btn').addEventListener('click', () => {
        if (getToken()) location.href = 'account.html';
        else openAuthModal();
    });
    document.getElementById('modal-close').addEventListener('click', closeAuthModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAuthModal();
    });
    document.querySelectorAll('.modal-tab').forEach((tab) => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitAuthForm(loginForm, document.getElementById('login-error'), validateLoginForm,
            () => api.login(loginForm.email.value.trim(), loginForm.password.value));
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitAuthForm(registerForm, document.getElementById('register-error'), validateRegisterForm,
            () => api.register(registerForm.name.value.trim(), registerForm.email.value.trim(), registerForm.password.value));
    });
}

initNavActive();
initSearch();
initAuthModal();
