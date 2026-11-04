const CATEGORIES = {
    popular:   'Новинки и популярные изделия',
    charms:    'Шармы',
    bracelets: 'Браслеты',
    necklaces: 'Ожерелья',
    rings:     'Кольца',
    earrings:  'Серьги'
};

const CATEGORY_LABELS = { hits: 'Хиты продаж', ...CATEGORIES };

const ORDER_STATUSES = ['новый', 'в обработке', 'отправлен', 'доставлен', 'отменён'];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPrice(price) {
    return Math.round(Number(price) || 0).toLocaleString('ru-RU') + '₽';
}

function formatDate(value, withTime = false) {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return value ? new Date(value).toLocaleString('ru-RU', options) : '';
}

function plural(n, [one, few, many]) {
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastDigit === 1 && lastTwo !== 11) return one;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
    return many;
}

function validateEmail(email) {
    if (!email) return 'Заполните поле Email';
    if (!email.includes('@')) return 'В email должен быть символ @';
    return '';
}

function isValidPhone(phone) {
    return /^\+?[0-9\s()-]{6,20}$/.test(phone);
}

function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<span class="star ${i <= rating ? 'is-on' : ''}">★</span>`;
    }
    return `<span class="stars" aria-label="Оценка ${rating} из 5">${stars}</span>`;
}

function renderSkeletons(count) {
    return '<div class="product-card-skeleton"></div>'.repeat(count);
}

function renderProductCard(product) {
    const name = escapeHtml(product.name);
    const image = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${name}" class="lazy-img" loading="lazy">`
        : '';
    return `
        <a href="product.html?id=${product.id}" class="product-card">
            <div class="product-card-image">${image}</div>
            <p class="product-name serif">${name}</p>
            <p class="product-price">${formatPrice(product.price)}</p>
        </a>`;
}
