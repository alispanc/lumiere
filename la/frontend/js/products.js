const CATEGORIES = {
    popular:   'Новинки и популярные изделия',
    charms:    'Шармы',
    bracelets: 'Браслеты',
    necklaces: 'Ожерелья',
    rings:     'Кольца',
    earrings:  'Серьги'
};

function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '₽';
}

function renderSkeletons(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
        html += '<div class="product-card-skeleton"></div>';
    }
    return html;
}

function renderProductCard(product) {
    var imgSrc = product.image_url || '';
    return '<a href="product.html?id=' + product.id + '" class="product-card">' +
        '<div class="product-card-image">' +
        (imgSrc
            ? '<img data-src="' + imgSrc + '" alt="' + product.name + '" class="lazy-img" loading="lazy" decoding="async">'
            : '<div class="product-card-placeholder"></div>') +
        '</div>' +
        '<p class="product-name serif">' + product.name + '</p>' +
        '<p class="product-price">' + formatPrice(product.price) + '</p>' +
        '</a>';
}
