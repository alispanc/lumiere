document.addEventListener('DOMContentLoaded', async function () {
    syncAuthState();
    initNavActive();
    initSearch();
    initAuthModal();
    initParallax();
    initLazyImages();
    initScrollReveal();
    await Promise.all([
        initCategoryPage(),
        initProductPage(),
        initCartPage(),
        initAccountPage(),
        renderHits()
    ]);
    observeLazyImages(document);
});

function syncAuthState() {
    if (localStorage.getItem('lumiere_token')) {
        document.body.dataset.loggedIn = 'true';
    }
}

function initNavActive() {
    var params = new URLSearchParams(window.location.search);
    var cat = params.get('cat') || document.body.dataset.activeCat || '';
    if (!cat) return;
    document.querySelectorAll('.header-nav a').forEach(function (link) {
        if (link.dataset.cat === cat) link.classList.add('active');
    });
}

function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

function initSearch() {
    var input = document.querySelector('.search-box input');
    var icon  = document.querySelector('.search-box .search-icon');
    if (!input) return;

    var q = new URLSearchParams(window.location.search).get('search') || '';
    if (q) input.value = q;

    if (document.getElementById('product-grid')) return;

    function goSearch() {
        var query = input.value.trim();
        if (!query) return;
        window.location.href = 'category.html?search=' + encodeURIComponent(query);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') goSearch(); });
    if (icon) { icon.style.cursor = 'pointer'; icon.addEventListener('click', goSearch); }
}

function validateEmail(email) {
    if (!email) return 'Заполните поле Email';
    if (email.indexOf('@') === -1) return 'В email должен быть символ @';
    return '';
}

function validateLoginForm(form) {
    var emailErr = validateEmail(form.email.value.trim());
    if (emailErr) return emailErr;
    if (!form.password.value) return 'Заполните поле «Пароль»';
    return '';
}

function validateRegisterForm(form) {
    if (!form.name.value.trim()) return 'Заполните поле «Имя»';
    var emailErr = validateEmail(form.email.value.trim());
    if (emailErr) return emailErr;
    if (!form.password.value) return 'Заполните поле «Пароль»';
    if (!form.password_confirm.value) return 'Заполните поле «Повторите пароль»';
    if (form.password.value !== form.password_confirm.value) return 'Пароли не совпадают';
    return '';
}

function initAuthModal() {
    var modal      = document.getElementById('auth-modal');
    var profileBtn = document.getElementById('profile-btn');
    var closeBtn   = document.getElementById('modal-close');
    var tabs       = document.querySelectorAll('.modal-tab');
    var loginForm    = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');

    if (!modal || !profileBtn) return;

    profileBtn.addEventListener('click', function () {
        if (localStorage.getItem('lumiere_token')) {
            window.location.href = 'account.html';
            return;
        }
        modal.classList.add('open');
    });

    closeBtn.addEventListener('click', function () { modal.classList.remove('open'); });
    modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('open');
    });

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.dataset.tab;
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.modal-panel').forEach(function (p) { p.classList.remove('active'); });
            document.getElementById(target + '-panel').classList.add('active');
            var loginErr = document.getElementById('login-error');
            var regErr = document.getElementById('register-error');
            if (loginErr) loginErr.textContent = '';
            if (regErr) regErr.textContent = '';
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var errorEl = document.getElementById('login-error');
            var validationError = validateLoginForm(loginForm);
            if (validationError) {
                errorEl.textContent = validationError;
                return;
            }
            errorEl.textContent = '';
            var email    = loginForm.email.value.trim();
            var password = loginForm.password.value;
            try {
                var data = await api.login(email, password);
                localStorage.setItem('lumiere_token', data.token);
                localStorage.setItem('lumiere_user', JSON.stringify(data.user));
                window.location.href = 'account.html';
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var errorEl = document.getElementById('register-error');
            var validationError = validateRegisterForm(registerForm);
            if (validationError) {
                errorEl.textContent = validationError;
                return;
            }
            errorEl.textContent = '';
            var name     = registerForm.name.value.trim();
            var email    = registerForm.email.value.trim();
            var password = registerForm.password.value;
            try {
                var data = await api.register(name, email, password);
                localStorage.setItem('lumiere_token', data.token);
                localStorage.setItem('lumiere_user', JSON.stringify(data.user));
                window.location.href = 'account.html';
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    }
}

var _pg = { offset: 0, cat: 'popular', search: '', loading: false, done: false, gen: 0, LIMIT: 12 };

async function initCategoryPage() {
    var grid    = document.getElementById('product-grid');
    if (!grid) return;
    var titleEl = document.getElementById('catalog-title');
    var spinner = document.getElementById('load-spinner');
    var input   = document.querySelector('.search-box input');
    var icon    = document.querySelector('.search-box .search-icon');

    var urlParams = new URLSearchParams(window.location.search);
    _pg.search = urlParams.get('search') || '';
    _pg.cat    = urlParams.get('cat')    || 'popular';
    if (!CATEGORIES[_pg.cat] && !_pg.search) _pg.cat = 'popular';

    function setTitle() {
        if (!titleEl) return;
        titleEl.textContent = _pg.search
            ? 'Результаты поиска: «' + _pg.search + '»'
            : (CATEGORIES[_pg.cat] || '');
    }

    function resetLoad() {
        _pg.gen++;
        _pg.offset  = 0;
        _pg.done    = false;
        _pg.loading = false;
        grid.innerHTML = renderSkeletons(_pg.LIMIT);
        setTitle();
        loadMore();
    }

    var debouncedReset = debounce(resetLoad, 300);

    if (input) {
        input.addEventListener('input', function () {
            _pg.search = input.value.trim();
            history.replaceState(null, '',
                _pg.search ? '?search=' + encodeURIComponent(_pg.search) : '?cat=' + _pg.cat
            );
            setTitle();
            grid.innerHTML = renderSkeletons(_pg.LIMIT);
            debouncedReset();
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') resetLoad(); });
    }
    if (icon) { icon.style.cursor = 'pointer'; icon.addEventListener('click', resetLoad); }

    var sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) {
        new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: '300px' }).observe(sentinel);
    }

    async function loadMore() {
        if (_pg.loading || _pg.done) return;
        _pg.loading = true;
        var gen = _pg.gen;
        if (spinner) spinner.style.display = 'flex';

        try {
            var items = await api.getProducts(
                _pg.search ? null : _pg.cat,
                _pg.LIMIT,
                _pg.search || null,
                _pg.offset
            );

            if (gen !== _pg.gen) return; 

            if (_pg.offset === 0) grid.innerHTML = '';

            if (items.length === 0 && _pg.offset === 0) {
                grid.innerHTML = '<p class="catalog-empty">' +
                    (_pg.search ? 'Ничего не найдено' : 'В этой категории пока нет товаров') + '</p>';
            } else {
                items.forEach(function (p, i) {
                    var tmp  = document.createElement('div');
                    tmp.innerHTML = renderProductCard(p);
                    var card = tmp.firstElementChild;
                    card.classList.add('card-enter');
                    card.style.animationDelay = (i * 80) + 'ms';
                    grid.appendChild(card);
                    observeLazyImages(card);
                });
                _pg.offset += items.length;
                if (items.length < _pg.LIMIT) _pg.done = true;
            }
        } catch (e) {
            if (gen !== _pg.gen) return;
            if (_pg.offset === 0) grid.innerHTML = '<p class="catalog-empty">Ошибка загрузки</p>';
        }

        if (gen === _pg.gen) {
            _pg.loading = false;
            if (spinner) spinner.style.display = 'none';
        }
    }

    setTitle();
    await loadMore();
}

async function initProductPage() {
    var container = document.getElementById('product-detail');
    if (!container) return;
    var params = new URLSearchParams(window.location.search);
    var id = parseInt(params.get('id'), 10);
    if (!id) { window.location.href = 'index.html'; return; }
    try {
        var product = await api.getProduct(id);
        var desc = product.description || 'Изысканное украшение из коллекции Lumière. Создано с вниманием к каждой детали, чтобы стать вашим любимым аксессуаром на каждый день.';
        var imgHtml = product.image_url
            ? '<img data-src="' + product.image_url + '" alt="' + product.name + '" class="lazy-img" loading="lazy" decoding="async">'
            : '<div class="product-card-placeholder product-detail-placeholder"></div>';
        container.className = 'product-detail';
        container.innerHTML =
            '<div class="product-detail-image page-enter-item">' + imgHtml + '</div>' +
            '<div class="product-detail-info page-enter-item">' +
            '<h1 class="serif">' + product.name + '</h1>' +
            '<p class="product-price product-detail-price">' + formatPrice(product.price) + '</p>' +
            '<button type="button" class="btn-dark" id="add-to-cart" data-product-id="' + product.id + '">Добавить в корзину</button>' +
            '<p class="product-description">' + desc + '</p>' +
            '</div>';
        triggerPageEnter(container);
        observeLazyImages(container);
        initAddToCart();
    } catch (err) {
        window.location.href = 'index.html';
    }
}

function initAddToCart() {
    var addBtn = document.getElementById('add-to-cart');
    if (!addBtn) return;
    addBtn.addEventListener('click', async function () {
        var productId = parseInt(addBtn.dataset.productId, 10);
        if (!localStorage.getItem('lumiere_token')) {
            document.getElementById('auth-modal').classList.add('open');
            return;
        }
        addBtn.disabled = true;
        addBtn.textContent = 'Добавляется…';
        try {
            await api.addToCart(productId, 1);
            window.location.href = 'cart.html';
        } catch (err) {
            addBtn.disabled = false;
            addBtn.textContent = 'Добавить в корзину';
            alert('Ошибка при добавлении в корзину: ' + err.message);
        }
    });
}

async function renderCartPage() {
    var container = document.getElementById('cart-content');
    if (!container) return;

    if (!localStorage.getItem('lumiere_token')) {
        container.innerHTML = '<p class="cart-empty page-enter-item">Войдите в аккаунт, чтобы увидеть корзину</p>';
        triggerPageEnter(container);
        return;
    }

    var cart;
    try {
        cart = await api.getCart();
    } catch (err) {
        if (err.status === 401) {
            container.innerHTML = '<p class="cart-empty page-enter-item">Сессия истекла. <a href="index.html">Войдите снова</a></p>';
        } else {
            container.innerHTML = '<p class="cart-empty page-enter-item">Ошибка загрузки корзины</p>';
        }
        triggerPageEnter(container);
        return;
    }

    if (cart.length === 0) {
        container.innerHTML = '<p class="cart-empty page-enter-item">Ваша корзина пуста</p>';
        triggerPageEnter(container);
        return;
    }

    var subtotal = 0;
    var itemsHtml = '';
    cart.forEach(function (item) {
        var lineTotal = item.price * item.quantity;
        subtotal += lineTotal;
        var imgHtml = item.image_url
            ? '<img data-src="' + item.image_url + '" alt="' + item.name + '" class="lazy-img" loading="lazy" decoding="async">'
            : '<div class="product-card-placeholder" style="width:80px;height:80px"></div>';
        itemsHtml +=
            '<div class="cart-item" data-product-id="' + item.product_id + '">' +
            '<button type="button" class="cart-remove" data-action="remove" aria-label="Удалить">&times;</button>' +
            '<div class="cart-item-image">' + imgHtml + '</div>' +
            '<div>' +
            '<a href="product.html?id=' + item.product_id + '" class="cart-item-name serif">' + item.name + '</a>' +
            '<p class="cart-item-price">' + formatPrice(item.price) + '</p>' +
            '</div>' +
            '<div class="cart-quantity">' +
            '<span class="qty-value">' + item.quantity + '</span>' +
            '<div class="qty-arrows">' +
            '<button type="button" class="qty-btn" data-action="increase" aria-label="Увеличить">&#9650;</button>' +
            '<button type="button" class="qty-btn" data-action="decrease" aria-label="Уменьшить">&#9660;</button>' +
            '</div></div>' +
            '<div class="cart-item-total">' + formatPrice(lineTotal) + '</div>' +
            '</div>';
    });

    var shipping = 500;
    var total    = subtotal + shipping;
    container.innerHTML =
        '<div class="cart-body">' +
        '<div class="cart-items-wrap"><div class="cart-line">' + itemsHtml + '</div></div>' +
        '<div class="cart-summary">' +
        '<div class="cart-summary-row"><span>Подытог</span><span>' + formatPrice(subtotal) + '</span></div>' +
        '<div class="cart-summary-row"><span>Доставка</span><span>' + formatPrice(shipping) + '</span></div>' +
        '<div class="cart-summary-row cart-summary-total"><span></span><span>' + formatPrice(total) + '</span></div>' +
        '<button type="button" class="btn-dark" id="checkout-btn">Оформить заказ</button>' +
        '</div></div>';

    animateCartItems(container);
    observeLazyImages(container);

    container.querySelectorAll('.cart-item').forEach(function (row) {
        var productId = parseInt(row.dataset.productId, 10);
        row.querySelector('[data-action="remove"]').addEventListener('click', async function () {
            await api.removeFromCart(productId);
            await renderCartPage();
        });
        row.querySelector('[data-action="increase"]').addEventListener('click', async function () {
            var qty = parseInt(row.querySelector('.qty-value').textContent, 10);
            await api.updateCartItem(productId, qty + 1);
            await renderCartPage();
        });
        row.querySelector('[data-action="decrease"]').addEventListener('click', async function () {
            var qty = parseInt(row.querySelector('.qty-value').textContent, 10);
            if (qty <= 1) {
                await api.removeFromCart(productId);
            } else {
                await api.updateCartItem(productId, qty - 1);
            }
            await renderCartPage();
        });
    });

    var checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async function () {
            await api.clearCart();
            await renderCartPage();
            showOrderToast();
        });
    }
}

async function initCartPage() {
    await renderCartPage();
}

async function initAccountPage() {
    var container = document.getElementById('account-content');
    if (!container) return;

    var token = localStorage.getItem('lumiere_token');
    var user  = JSON.parse(localStorage.getItem('lumiere_user') || 'null');
    if (!token || !user) { window.location.href = 'index.html'; return; }

    var cartCount = 0;
    try {
        var cart = await api.getCart();
        cartCount = cart.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    } catch (err) {
        if (err.status === 401) { window.location.href = 'index.html'; return; }
    }

    container.innerHTML =
        '<div class="account-banner">' +
        '<img data-src="img/account.jpg" alt="" class="lazy-img" loading="lazy" decoding="async">' +
        '<div class="account-banner-overlay">' +
        '<div class="account-banner-top">' +
        '<button type="button" class="account-exit-btn" id="logout-btn" aria-label="Выйти" title="Выйти">→</button>' +
        '</div>' +
        '<h1 class="account-welcome serif">Добро пожаловать!</h1>' +
        '</div></div>' +
        '<div class="account-details">' +
        '<div class="account-info">' +
        '<p><span>Имя:</span> ' + user.name + '</p>' +
        '<p><span>Email:</span> ' + user.email + '</p>' +
        '<p><span>Товаров в корзине:</span> ' + cartCount + '</p>' +
        '</div>' +
        '<a href="cart.html" class="btn-dark account-cart-btn">Перейти в корзину</a>' +
        '</div>';

    observeLazyImages(container);

    document.getElementById('logout-btn').addEventListener('click', function () {
        localStorage.removeItem('lumiere_token');
        localStorage.removeItem('lumiere_user');
        window.location.href = 'index.html';
    });
}

function showOrderToast() {
    var toast = document.getElementById('order-toast');
    if (!toast) return;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 3000);
}

async function renderHits() {
    var grid = document.getElementById('hits-grid');
    if (!grid) return;
    try {
        var hits = await api.getProducts('hits', 3);
        grid.innerHTML = '';
        hits.forEach(function (p, i) {
            var tmp = document.createElement('div');
            tmp.innerHTML = renderProductCard(p);
            var card = tmp.firstElementChild;
            card.classList.add('card-enter');
            card.style.animationDelay = (i * 140) + 'ms';
            grid.appendChild(card);
            observeLazyImages(card);
        });
        observeLazyImages(grid);
    } catch (err) {
        grid.innerHTML = '';
    }
}

function initParallax() {
    var heroInner = document.querySelector('.hero-parallax-inner');
    var clientInners = document.querySelectorAll('.client-parallax-inner');
    if (!heroInner && !clientInners.length) return;

    window.addEventListener('scroll', function () {
        var scrollY = window.pageYOffset;

        if (heroInner) {
            var heroSection = document.querySelector('.hero-parallax');
            if (heroSection) {
                var rect = heroSection.getBoundingClientRect();
                if (rect.bottom > 0 && rect.top < window.innerHeight) {
                    heroInner.style.transform = 'translateY(' + (scrollY * 0.35) + 'px)';
                }
            }
        }

        var clientsSection = document.querySelector('.clients-section');
        if (clientsSection && clientInners.length) {
            var sRect = clientsSection.getBoundingClientRect();
            if (sRect.bottom > 0 && sRect.top < window.innerHeight) {
                var offset = Math.max(0, (window.innerHeight - sRect.top) * 0.05);
                clientInners.forEach(function (inner) {
                    inner.style.transform = 'translate3d(0, ' + offset + 'px, 0)';
                });
            }
        }
    }, { passive: true });
}

function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach(function (el) {
        observer.observe(el);
    });
}

function triggerPageEnter(root) {
    if (!root) return;
    root.classList.remove('page-loaded');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            root.classList.add('page-loaded');
        });
    });
}

function animateCartItems(container) {
    if (!container) return;
    requestAnimationFrame(function () {
        var items = container.querySelectorAll('.cart-item');
        var summary = container.querySelector('.cart-summary');
        items.forEach(function (row, i) {
            row.classList.add('cart-item-enter');
            row.style.animationDelay = (i * 90) + 'ms';
        });
        if (summary) {
            summary.classList.add('cart-summary-enter');
            summary.style.animationDelay = (items.length * 90 + 80) + 'ms';
        }
    });
}

var _lazySrcObserver = null;

function initLazyImages() {
    if ('IntersectionObserver' in window) {
        _lazySrcObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var img = entry.target;
                _lazySrcObserver.unobserve(img);
                var src = img.getAttribute('data-src');
                if (src && !img.getAttribute('src')) {
                    img.src = src;
                    img.removeAttribute('data-src');
                }
            });
        }, { rootMargin: '160px' });
    }
    observeLazyImages(document);
}

function observeLazyImages(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img.lazy-img, img[data-src]').forEach(function (img) {
        if (img.dataset.lazyBound) return;
        img.dataset.lazyBound = '1';
        img.classList.add('lazy-img');

        function markLoaded() {
            img.classList.add('is-loaded');
        }

        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', markLoaded, { once: true });

        var deferredSrc = img.getAttribute('data-src');
        if (deferredSrc) {
            if (_lazySrcObserver) {
                _lazySrcObserver.observe(img);
            } else {
                img.src = deferredSrc;
                img.removeAttribute('data-src');
            }
            return;
        }

        if (img.complete && img.naturalWidth > 0) markLoaded();
    });
}
