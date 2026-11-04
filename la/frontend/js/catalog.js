function debounce(fn, ms) {
    let timer;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

function initCatalogPage() {
    const grid = document.getElementById('product-grid');
    const title = document.getElementById('catalog-title');
    const input = document.querySelector('.search-box input');
    const icon = document.querySelector('.search-icon');

    const urlCategory = new URLSearchParams(location.search).get('cat');
    const category = CATEGORIES[urlCategory] ? urlCategory : 'popular';
    let lastSearch = null;

    async function loadProducts() {
        const search = input.value.trim();
        lastSearch = search;
        title.textContent = search ? `Результаты поиска: «${search}»` : CATEGORIES[category];
        grid.innerHTML = renderSkeletons(12);

        let products;
        try {
            products = await api.getProducts(search ? { search } : { category });
        } catch {
            products = null;
        }

        if (search !== lastSearch) return;

        if (!products) {
            grid.innerHTML = '';
        } else if (products.length === 0) {
            const text = search ? 'Ничего не найдено' : 'В этой категории пока нет товаров';
            grid.innerHTML = `<p class="catalog-empty">${text}</p>`;
        } else {
            grid.innerHTML = products.map(renderProductCard).join('');
            animateIn(grid.querySelectorAll('.product-card'), 'card-enter', 80);
        }
    }

    const loadLater = debounce(loadProducts, 300);

    input.addEventListener('input', () => {
        const search = input.value.trim();
        history.replaceState(null, '', search ? '?search=' + encodeURIComponent(search) : '?cat=' + category);
        loadLater();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadProducts();
    });
    icon.addEventListener('click', loadProducts);

    loadProducts();
}

initCatalogPage();
