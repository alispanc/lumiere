const DEFAULT_DESCRIPTION = 'Изысканное украшение из коллекции Lumière. Создано с вниманием к каждой детали, чтобы стать вашим любимым аксессуаром на каждый день.';

const productId = Number(new URLSearchParams(location.search).get('id'));

async function initProductPage() {
    const container = document.getElementById('product-detail');
    if (!productId) {
        location.href = 'index.html';
        return;
    }

    let product;
    try {
        product = await api.getProduct(productId);
    } catch {
        location.href = 'index.html';
        return;
    }

    const name = escapeHtml(product.name);
    const image = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${name}" class="lazy-img">`
        : '<div class="product-detail-placeholder"></div>';

    container.innerHTML = `
        <div class="product-detail-image page-enter-item">${image}</div>
        <div class="product-detail-info page-enter-item">
            <h1 class="serif">${name}</h1>
            <p class="product-price product-detail-price">${formatPrice(product.price)}</p>
            <button type="button" class="btn-dark" id="add-to-cart">Добавить в корзину</button>
            <p class="product-description">${escapeHtml(product.description || DEFAULT_DESCRIPTION)}</p>
        </div>`;
    triggerPageEnter(container);

    document.getElementById('add-to-cart').addEventListener('click', addToCart);
    renderReviews();
}

async function addToCart(event) {
    const button = event.currentTarget;
    if (!getToken()) {
        openAuthModal();
        return;
    }

    button.disabled = true;
    button.textContent = 'Добавляется…';
    try {
        await api.addToCart(productId);
        location.href = 'cart.html';
    } catch (err) {
        button.disabled = false;
        button.textContent = 'Добавить в корзину';
        if (err.status === 401) openAuthModal();
        else alert('Ошибка при добавлении в корзину: ' + err.message);
    }
}

function reviewHtml(review, user) {
    const canDelete = user && (user.id === review.user_id || user.role === 'admin');
    return `
        <article class="review">
            <div class="review-head">
                <span class="review-author">${escapeHtml(review.user_name)}</span>
                <span class="review-date">${formatDate(review.created_at)}</span>
            </div>
            ${renderStars(review.rating)}
            ${review.text ? `<p class="review-text">${escapeHtml(review.text)}</p>` : ''}
            ${canDelete ? `<button type="button" class="review-delete" data-id="${review.id}">Удалить</button>` : ''}
        </article>`;
}

function reviewFormHtml() {
    if (!getToken()) {
        return `
            <div class="review-form review-form-guest">
                <p class="review-form-title serif">Ваш отзыв</p>
                <p>Чтобы оставить отзыв, войдите в аккаунт</p>
                <button type="button" class="btn-dark" id="review-login">Войти</button>
            </div>`;
    }

    const stars = [5, 4, 3, 2, 1].map((n) => `
        <input type="radio" name="rating" id="rate-${n}" value="${n}">
        <label for="rate-${n}" title="${n} из 5">★</label>`).join('');

    return `
        <form class="review-form" id="review-form" novalidate>
            <p class="review-form-title serif">Ваш отзыв</p>
            <div class="rating-input" role="radiogroup" aria-label="Оценка">${stars}</div>
            <textarea name="text" rows="4" maxlength="2000" placeholder="Расскажите, понравилось ли вам украшение"></textarea>
            <button type="submit" class="btn-dark">Отправить</button>
            <p class="form-error" id="review-error"></p>
        </form>`;
}

async function renderReviews() {
    const section = document.getElementById('reviews');

    let reviews;
    try {
        reviews = await api.getReviews(productId);
    } catch {
        section.innerHTML = '';
        return;
    }

    const user = getCurrentUser();
    const count = reviews.length;
    const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

    const summary = count ? `
        <div class="reviews-summary">
            <span class="reviews-avg serif">${average.toFixed(1).replace('.', ',')}</span>
            ${renderStars(Math.round(average))}
            <span class="reviews-count">${count} ${plural(count, ['отзыв', 'отзыва', 'отзывов'])}</span>
        </div>` : '';

    const list = count
        ? reviews.map((review) => reviewHtml(review, user)).join('')
        : '<p class="reviews-empty">Отзывов пока нет</p>';

    section.innerHTML = `
        <div class="reviews-header">
            <h2 class="reviews-title serif">Отзывы</h2>
            ${summary}
        </div>
        <div class="reviews-body">
            <div class="reviews-list ${count ? '' : 'is-empty'}">${list}</div>
            ${reviewFormHtml()}
        </div>`;

    animateIn(section.querySelectorAll('.review'), 'card-enter', 70);

    const loginButton = document.getElementById('review-login');
    if (loginButton) loginButton.addEventListener('click', openAuthModal);

    const form = document.getElementById('review-form');
    if (form) form.addEventListener('submit', submitReview);
}

async function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorEl = document.getElementById('review-error');
    const checked = form.querySelector('input[name="rating"]:checked');
    if (!checked) {
        errorEl.textContent = 'Поставьте оценку от 1 до 5';
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Отправляем…';
    try {
        await api.addReview(productId, Number(checked.value), form.text.value.trim());
        renderReviews();
    } catch (err) {
        button.disabled = false;
        button.textContent = 'Отправить';
        if (err.status === 401) openAuthModal();
        else errorEl.textContent = err.message;
    }
}

document.getElementById('reviews').addEventListener('click', async (event) => {
    const button = event.target.closest('.review-delete');
    if (!button) return;
    button.disabled = true;
    await api.deleteReview(button.dataset.id).catch(() => {});
    renderReviews();
});

initProductPage();
