const state = {
    me: null,
    products: [],
    orders: [],
    reviews: [],
    users: [],
    loaded: {},
    editingId: null
};
const byId = (id) => document.getElementById(id);
const findById = (list, id) => list.find((item) => item.id === Number(id));
function showLocked(text) {
    byId('admin-locked-text').textContent = text;
    byId('admin-locked').hidden = false;
}
function showAdminError(message) {
    const feedback = byId('admin-feedback');
    feedback.textContent = message;
    feedback.hidden = false;
}

function clearAdminError() {
    const feedback = byId('admin-feedback');
    feedback.textContent = '';
    feedback.hidden = true;
}
function fillSelect(select, options) {
    for (const [value, label] of Object.entries(options)) {
        select.add(new Option(label, value));
    }
}
function optionsHtml(options, selected) {
    return Object.entries(options)
        .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
        .join('');
}
function renderTable(containerId, headers, rows, emptyText) {
    const box = byId(containerId);
    if (rows.length === 0) {
        box.innerHTML = `<p class="admin-empty">${emptyText}</p>`;
        return;
    }
    box.innerHTML = `
        <table class="data-table">
            <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>`;
}
async function loadStats() {
    try {
        const s = await api.admin.stats();
        const cards = [
            ['Товаров', s.products],
            ['Пользователей', s.users],
            ['Заказов', s.orders],
            ['Новых заказов', s.new_orders],
            ['Отзывов', s.reviews]
        ];
        const box = byId('admin-stats');
        const firstTime = box.children.length === 0;
        box.innerHTML = cards.map(([label, value]) => `
            <div class="admin-stat">
                <span class="admin-stat-value serif">${value}</span>
                <span class="admin-stat-label">${label}</span>
            </div>`).join('');
        if (firstTime)
            animateIn(box.querySelectorAll('.admin-stat'), 'card-enter', 70);
    }
    catch {
        byId('admin-stats').innerHTML = '';
    }
}
const tabs = {
    products: { table: 'products-table', load: () => api.getProducts(), render: renderProducts },
    orders: { table: 'orders-table', load: api.admin.orders, render: renderOrders },
    reviews: { table: 'reviews-table', load: api.admin.reviews, render: renderReviews },
    users: { table: 'users-table', load: api.admin.users, render: renderUsers }
};
async function loadTab(name) {
    const tab = tabs[name];
    byId(tab.table).innerHTML = '<p class="admin-empty">Загрузка…</p>';
    try {
        state[name] = await tab.load();
        tab.render();
    }
    catch (err) {
        byId(tab.table).innerHTML = `<p class="admin-empty form-error">${escapeHtml(err.message)}</p>`;
    }
}
function openTab(name) {
    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.admin-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === 'panel-' + name);
    });
    if (!state.loaded[name]) {
        state.loaded[name] = true;
        loadTab(name);
    }
}
function renderProducts() {
    const search = byId('products-search').value.trim().toLowerCase();
    const category = byId('products-category').value;
    const list = state.products.filter((p) => (!category || p.category === category) && p.name.toLowerCase().includes(search));
    const rows = list.map((p) => `
        <tr>
            <td class="muted">${p.id}</td>
            <td><div class="admin-thumb">${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy">` : ''}</div></td>
            <td><a href="product.html?id=${p.id}" target="_blank" class="serif">${escapeHtml(p.name)}</a></td>
            <td>${escapeHtml(CATEGORY_LABELS[p.category] || p.category)}</td>
            <td class="nowrap">${formatPrice(p.price)}</td>
            <td class="muted nowrap">${formatDate(p.created_at)}</td>
            <td class="row-actions">
                <button type="button" class="link-btn" data-edit="${p.id}">Изменить</button><button type="button" class="link-btn danger" data-delete="${p.id}">Удалить</button>
            </td>
        </tr>`);
    renderTable('products-table', ['ID', '', 'Название', 'Категория', 'Цена', 'Добавлен', ''], rows, 'Товары не найдены');
}
async function deleteProduct(id, button) {
    clearAdminError();
    const product = findById(state.products, id);
    if (!product) {
        return;
    }

    if (button.dataset.confirmDelete !== 'yes') {
        document.querySelectorAll('[data-confirm-delete]').forEach((other) => {
            other.textContent = 'Удалить';
            delete other.dataset.confirmDelete;
        });

        button.dataset.confirmDelete = 'yes';
        button.textContent = 'Подтвердить удаление';
        return;
    }
    try {
        await api.deleteProduct(id);
        state.products = state.products.filter((p) => p !== product);
        state.loaded.reviews = false;
        renderProducts();
        loadStats();
    }
    catch (err) {
        button.textContent = 'Удалить';
        delete button.dataset.confirmDelete;
        showAdminError(err.message);
    }
}
function updatePreview() {
    const src = byId('product-form').image_url.value.trim();
    byId('product-preview').innerHTML = src
        ? `<img src="${escapeHtml(src)}" alt="">`
        : '<span class="muted">Нет картинки</span>';
}
function openProductModal(product) {
    const form = byId('product-form');
    state.editingId = product ? product.id : null;
    byId('product-modal-title').textContent = product ? 'Редактирование товара' : 'Новый товар';
    byId('product-error').textContent = '';
    form.name.value = product ? product.name : '';
    form.price.value = product ? product.price : '';
    form.category.value = product ? product.category : 'rings';
    form.image_url.value = product ? product.image_url || '' : '';
    form.description.value = product ? product.description || '' : '';
    updatePreview();
    byId('product-modal').classList.add('open');
    form.name.focus();
}
function closeProductModal() {
    byId('product-modal').classList.remove('open');
}
async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearAdminError();
    const errorEl = byId('product-error');
    const data = {
        name: form.name.value.trim(),
        price: form.price.value === '' ? NaN : Number(form.price.value),
        category: form.category.value,
        image_url: form.image_url.value.trim(),
        description: form.description.value.trim()
    };
    if (!data.name) {
        errorEl.textContent = 'Укажите название';
        return;
    }
    if (!(data.price >= 0)) {
        errorEl.textContent = 'Укажите цену';
        return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        if (state.editingId) {
            const updated = await api.updateProduct(state.editingId, data);
            state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
            }
        else {
            state.products.push(await api.createProduct(data));
            loadStats();
            }
        closeProductModal();
        renderProducts();
    }
    catch (err) {
        errorEl.textContent = err.message;
    }
    finally {
        button.disabled = false;
    }
}
function renderOrders() {
    const status = byId('orders-status').value;
    const statusOptions = Object.fromEntries(ORDER_STATUSES.map((s) => [s, s]));
    const rows = state.orders
        .filter((o) => !status || o.status === status)
        .map((o) => `
            <tr>
                <td class="muted">${o.id}</td>
                <td class="nowrap">${formatDate(o.created_at, true)}</td>
                <td>${escapeHtml(o.user_name)}<span class="cell-sub">${escapeHtml(o.user_email)}</span></td>
                <td>${escapeHtml(o.product_name)}<span class="cell-sub">${o.quantity} шт. × ${formatPrice(o.price)}</span></td>
                <td class="nowrap">${formatPrice(o.price * o.quantity)}</td>
                <td>${escapeHtml(o.address)}<span class="cell-sub">${escapeHtml(o.phone)}</span></td>
                <td><select class="admin-input admin-select-sm" data-order="${o.id}">${optionsHtml(statusOptions, o.status)}</select></td>
            </tr>`);
    renderTable('orders-table', ['№', 'Дата', 'Покупатель', 'Товар', 'Сумма', 'Доставка', 'Статус'], rows, 'Заказов нет');
}
async function changeOrderStatus(select) {
    clearAdminError();
    const order = findById(state.orders, select.dataset.order);
    select.disabled = true;
    try {
        await api.admin.setOrderStatus(order.id, select.value);
        order.status = select.value;
        loadStats();
    }
    catch (err) {
        select.value = order.status;
        showAdminError(err.message);
    }
    finally {
        select.disabled = false;
    }
}
function renderReviews() {
    const rating = Number(byId('reviews-rating').value);
    const rows = state.reviews
        .filter((r) => !rating || r.rating === rating)
        .map((r) => `
            <tr>
                <td class="nowrap">${formatDate(r.created_at, true)}</td>
                <td><a href="product.html?id=${r.product_id}" target="_blank">${escapeHtml(r.product_name)}</a></td>
                <td>${escapeHtml(r.user_name)}<span class="cell-sub">${escapeHtml(r.user_email)}</span></td>
                <td class="nowrap">${renderStars(r.rating)}</td>
                <td class="cell-text">${r.text ? escapeHtml(r.text) : '<span class="muted">—</span>'}</td>
                <td><button type="button" class="link-btn danger" data-review="${r.id}">Удалить</button></td>
            </tr>`);
    renderTable('reviews-table', ['Дата', 'Товар', 'Автор', 'Оценка', 'Текст', ''], rows, 'Отзывов нет');
}
async function deleteReview(button) {
    clearAdminError();
    const id = Number(button.dataset.review);
    button.disabled = true;
    try {
        await api.deleteReview(id);
        state.reviews = state.reviews.filter((r) => r.id !== id);
        renderReviews();
        loadStats();
    }
    catch (err) {
        button.disabled = false;
        showAdminError(err.message);
    }
}
function renderUsers() {
    const roles = { user: 'Покупатель', admin: 'Администратор' };
    const rows = state.users.map((u) => {
        const isMe = u.id === state.me.id;
        return `
            <tr>
                <td class="muted">${u.id}</td>
                <td>${escapeHtml(u.name)}${isMe ? ' <span class="muted">(вы)</span>' : ''}</td>
                <td>${escapeHtml(u.email)}</td>
                <td class="nowrap">${formatDate(u.created_at)}</td>
                <td>${u.orders}</td>
                <td>${u.reviews || 0}</td>
                <td><select class="admin-input admin-select-sm" data-user="${u.id}" ${isMe ? 'disabled' : ''}>${optionsHtml(roles, u.role)}</select></td>
            </tr>`;
    });
    renderTable('users-table', ['ID', 'Имя', 'Email', 'Регистрация', 'Заказов', 'Отзывов', 'Роль'], rows, 'Пользователей нет');
}
async function changeUserRole(select) {
    clearAdminError();
    const user = findById(state.users, select.dataset.user);
    select.disabled = true;
    try {
        await api.admin.setUserRole(user.id, select.value);
        user.role = select.value;
    }
    catch (err) {
        select.value = user.role;
        showAdminError(err.message);
    }
    finally {
        select.disabled = false;
    }
}
function initEvents() {
    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.addEventListener('click', () => openTab(tab.dataset.tab));
    });
    byId('products-search').addEventListener('input', renderProducts);
    byId('products-category').addEventListener('change', renderProducts);
    byId('orders-status').addEventListener('change', renderOrders);
    byId('reviews-rating').addEventListener('change', renderReviews);
    byId('product-add').addEventListener('click', () => openProductModal(null));
    byId('products-table').addEventListener('click', (event) => {
        const editId = event.target.dataset.edit;
        const deleteId = event.target.dataset.delete;
        if (editId)
            openProductModal(findById(state.products, editId));
        if (deleteId)
            deleteProduct(Number(deleteId), event.target);
    });
    byId('orders-table').addEventListener('change', (event) => {
        if (event.target.dataset.order)
            changeOrderStatus(event.target);
    });
    byId('reviews-table').addEventListener('click', (event) => {
        if (event.target.dataset.review)
            deleteReview(event.target);
    });
    byId('users-table').addEventListener('change', (event) => {
        if (event.target.dataset.user)
            changeUserRole(event.target);
    });
    const modal = byId('product-modal');
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeProductModal));
    modal.addEventListener('click', (event) => {
        if (event.target === modal)
            closeProductModal();
    });
    byId('product-form').image_url.addEventListener('input', updatePreview);
    byId('product-form').addEventListener('submit', saveProduct);
}
async function initAdmin() {
    if (!getToken()) {
        showLocked('Войдите в аккаунт администратора на сайте.');
        return;
    }
    try {
        state.me = await api.me();
        saveSession(null, state.me);
    }
    catch (err) {
        showLocked(err.status === 401 ? 'Сессия истекла, войдите снова.' : err.message);
        return;
    }
    if (state.me.role !== 'admin') {
        showLocked('У вашего аккаунта нет прав администратора.');
        return;
    }
    byId('admin-app').hidden = false;
    fillSelect(byId('products-category'), CATEGORY_LABELS);
    fillSelect(byId('product-category'), CATEGORY_LABELS);
    fillSelect(byId('orders-status'), Object.fromEntries(ORDER_STATUSES.map((s) => [s, s])));
    initEvents();
    loadStats();
    openTab('products');
}
initAdmin();
