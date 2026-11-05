async function loadUser() {
    try {
        const user = await api.me();
        saveSession(null, user);
        return user;
    }
    catch (err) {
        if (err.status === 401 || err.status === 404)
            return null;
        return getCurrentUser();
    }
}
async function loadCounts() {
    const [cart, reviews] = await Promise.allSettled([api.getCart(), api.getMyReviews()]);
    return {
        cart: cart.status === 'fulfilled' ? cart.value.reduce((sum, item) => sum + item.quantity, 0) : 0,
        reviews: reviews.status === 'fulfilled' ? reviews.value.length : 0
    };
}
function profileHtml(user, counts) {
    const isAdmin = user.role === 'admin';
    const nameField = isAdmin
        ? `<div class="profile-field">
               <span class="profile-label">Имя</span>
               <span class="profile-value">${escapeHtml(user.name)}</span>
           </div>`
        : `<label class="profile-field">
               <span class="profile-label">Имя</span>
               <input class="profile-input" type="text" name="name" maxlength="100" autocomplete="name" value="${escapeHtml(user.name)}">
           </label>`;
    return `
        <div class="account-banner">
            <img src="img/account.jpg" alt="" class="lazy-img">
            <div class="account-banner-overlay">
                <div class="account-banner-top">
                    <button type="button" class="account-exit-btn" id="logout-btn" aria-label="Выйти" title="Выйти">→</button>
                </div>
                <h1 class="account-welcome serif">Добро пожаловать!</h1>
            </div>
        </div>
        <div class="profile">
            ${isAdmin ? '<span class="profile-role profile-enter">Администратор</span>' : ''}
            <form id="profile-form" novalidate>
                <div class="profile-main profile-enter">
                    <div class="profile-fields">
                        ${nameField}
                        <div class="profile-field">
                            <span class="profile-label">Почта</span>
                            <span class="profile-value">${escapeHtml(user.email)}</span>
                        </div>
                    </div>
                    <div class="profile-stats">
                        <a href="cart.html" class="profile-stat">
                            <span class="profile-stat-value serif">${counts.cart}</span>
                            <span class="profile-stat-label">${plural(counts.cart, ['товар', 'товара', 'товаров'])} в корзине</span>
                        </a>
                        <div class="profile-stat">
                            <span class="profile-stat-value serif">${counts.reviews}</span>
                            <span class="profile-stat-label">${plural(counts.reviews, ['отзыв написан', 'отзыва написано', 'отзывов написано'])}</span>
                        </div>
                    </div>
                </div>
                <div class="profile-contacts profile-enter">
                    <label class="profile-field">
                        <span class="profile-label">Адрес доставки</span>
                        <input class="profile-input" type="text" name="address" maxlength="300" placeholder="Город, улица, дом, квартира" autocomplete="street-address" value="${escapeHtml(user.address || '')}">
                    </label>
                    <label class="profile-field">
                        <span class="profile-label">Номер телефона</span>
                        <input class="profile-input" type="tel" name="phone" maxlength="20" placeholder="+7 900 000-00-00" autocomplete="tel" value="${escapeHtml(user.phone || '')}">
                    </label>
                    <button type="submit" class="btn-dark btn-small">Сохранить</button>
                    <p class="profile-message" id="profile-message"></p>
                </div>
            </form>
            <div class="profile-actions profile-enter">
                <a href="cart.html" class="btn-dark">Перейти в корзину</a>
                ${isAdmin ? '<a href="admin.html" class="btn-outline">Админ-панель</a>' : ''}
            </div>
        </div>`;
}
let messageTimer;
function showProfileMessage(text, isError = false) {
    const message = document.getElementById('profile-message');
    clearTimeout(messageTimer);
    message.textContent = text;
    message.classList.toggle('is-error', isError);
    if (!isError)
        messageTimer = setTimeout(() => {
            message.textContent = '';
        }, 2500);
}
async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = {
        address: form.address.value.trim(),
        phone: form.phone.value.trim()
    };
    if (form.elements.name)
        data.name = form.elements.name.value.trim();
    if (data.name === '') {
        showProfileMessage('Заполните поле «Имя»', true);
        return;
    }
    if (data.phone && !isValidPhone(data.phone)) {
        showProfileMessage('Проверьте номер телефона', true);
        return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        saveSession(null, await api.updateProfile(data));
        showProfileMessage('Сохранено');
    }
    catch (err) {
        showProfileMessage(err.message, true);
    }
    finally {
        button.disabled = false;
    }
}
async function initAccountPage() {
    if (!getToken()) {
        location.href = 'index.html';
        return;
    }
    const user = await loadUser();
    if (!user) {
        clearSession();
        location.href = 'index.html';
        return;
    }
    const container = document.getElementById('account-content');
    container.innerHTML = profileHtml(user, await loadCounts());
    animateIn(container.querySelectorAll('.profile-enter'), 'profile-enter', 90);
    document.getElementById('profile-form').addEventListener('submit', saveProfile);
    document.getElementById('logout-btn').addEventListener('click', () => {
        clearSession();
        location.href = 'index.html';
    });
}
initAccountPage();
