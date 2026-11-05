const SHIPPING_PRICE = 500;
const cartContent = document.getElementById('cart-content');
let cartTotals = { count: 0, sum: 0 };
function showCartMessage(text) {
    cartContent.innerHTML = `<p class="cart-empty page-enter-item">${text}</p>`;
    triggerPageEnter(cartContent);
}
function cartItemHtml(item) {
    const name = escapeHtml(item.name);
    const image = item.image_url
        ? `<img src="${escapeHtml(item.image_url)}" alt="${name}" class="lazy-img" loading="lazy">`
        : '';
    return `
        <div class="cart-item" data-product-id="${item.product_id}" data-quantity="${item.quantity}">
            <button type="button" class="cart-remove" data-action="remove" aria-label="Удалить">&times;</button>
            <div class="cart-item-image">${image}</div>
            <div>
                <a href="product.html?id=${item.product_id}" class="cart-item-name serif">${name}</a>
                <p class="cart-item-price">${formatPrice(item.price)}</p>
            </div>
            <div class="cart-quantity">
                <span class="qty-value">${item.quantity}</span>
                <div class="qty-arrows">
                    <button type="button" class="qty-btn" data-action="increase" aria-label="Увеличить">&#9650;</button>
                    <button type="button" class="qty-btn" data-action="decrease" aria-label="Уменьшить">&#9660;</button>
                </div>
            </div>
            <div class="cart-item-total">${formatPrice(item.price * item.quantity)}</div>
        </div>`;
}
async function renderCart() {
    if (!getToken()) {
        showCartMessage('Войдите в аккаунт, чтобы увидеть корзину');
        return;
    }
    let cart;
    try {
        cart = await api.getCart();
    }
    catch (err) {
        showCartMessage(err.status === 401
            ? 'Сессия истекла. <a href="index.html">Войдите снова</a>'
            : 'Ошибка загрузки корзины');
        return;
    }
    if (cart.length === 0) {
        showCartMessage('Ваша корзина пуста');
        return;
    }
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartTotals = {
        count: cart.reduce((sum, item) => sum + item.quantity, 0),
        sum: subtotal + SHIPPING_PRICE
    };
    cartContent.innerHTML = `
        <div class="cart-body">
            <div class="cart-items-wrap">
                <div class="cart-line">${cart.map(cartItemHtml).join('')}</div>
            </div>
            <div class="cart-summary">
                <div class="cart-summary-row"><span>Подытог</span><span>${formatPrice(subtotal)}</span></div>
                <div class="cart-summary-row"><span>Доставка</span><span>${formatPrice(SHIPPING_PRICE)}</span></div>
                <div class="cart-summary-row cart-summary-total"><span></span><span>${formatPrice(cartTotals.sum)}</span></div>
                <button type="button" class="btn-dark" id="checkout-btn">Оформить заказ</button>
            </div>
        </div>`;
    animateIn(cartContent.querySelectorAll('.cart-item'), 'cart-item-enter', 90);
    const summary = cartContent.querySelector('.cart-summary');
    summary.classList.add('cart-summary-enter');
    summary.style.animationDelay = cart.length * 90 + 80 + 'ms';
}
async function changeCartItem(button) {
    const row = button.closest('.cart-item');
    const id = Number(row.dataset.productId);
    const quantity = Number(row.dataset.quantity);
    const action = button.dataset.action;
    try {
        if (action === 'increase') {
            await api.updateCartItem(id, quantity + 1);
        }
        else if (action === 'decrease' && quantity > 1) {
            await api.updateCartItem(id, quantity - 1);
        }
        else {
            await api.removeFromCart(id);
        }
    }
    catch {
    }
    renderCart();
}
cartContent.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton)
        changeCartItem(actionButton);
    if (event.target.id === 'checkout-btn')
        openCheckout();
});
const checkoutModal = document.getElementById('checkout-modal');
const checkoutForm = document.getElementById('checkout-form');
const checkoutError = document.getElementById('checkout-error');
async function openCheckout() {
    let user = getCurrentUser() || {};
    try {
        user = await api.me();
        saveSession(null, user);
    }
    catch (err) {
        if (err.status === 401) {
            openAuthModal();
            return;
        }
    }
    checkoutForm.name.value = user.name || '';
    checkoutForm.email.value = user.email || '';
    checkoutForm.address.value = user.address || '';
    checkoutForm.phone.value = user.phone || '';
    checkoutError.textContent = '';
    document.getElementById('checkout-summary').textContent =
        `${cartTotals.count} ${plural(cartTotals.count, ['товар', 'товара', 'товаров'])} на сумму ${formatPrice(cartTotals.sum)}`;
    checkoutModal.classList.add('open');
    const firstEmpty = ['name', 'email', 'address', 'phone'].find((field) => !checkoutForm[field].value);
    if (firstEmpty)
        checkoutForm[firstEmpty].focus();
}
function closeCheckout() {
    checkoutModal.classList.remove('open');
}
function validateCheckout(data) {
    if (!data.name)
        return 'Заполните поле «Имя»';
    const emailError = validateEmail(data.email);
    if (emailError)
        return emailError;
    if (!data.address)
        return 'Заполните поле «Адрес доставки»';
    if (!isValidPhone(data.phone))
        return 'Проверьте номер телефона';
    return '';
}

checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {
        name: checkoutForm.name.value.trim(),
        email: checkoutForm.email.value.trim(),
        address: checkoutForm.address.value.trim(),
        phone: checkoutForm.phone.value.trim()
    };
    checkoutError.textContent = validateCheckout(data);
    if (checkoutError.textContent)
        return;
    const button = checkoutForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Оформляем…';
    try {
        await api.createOrder(data);
        closeCheckout();
        await renderCart();
    }
    catch (err) {
        checkoutError.textContent = err.message;
    }
    finally {
        button.disabled = false;
        button.textContent = 'Подтвердить заказ';
    }
});
checkoutModal.querySelector('[data-close]').addEventListener('click', closeCheckout);
checkoutModal.addEventListener('click', (event) => {
    if (event.target === checkoutModal)
        closeCheckout();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape')
        closeCheckout();
});
renderCart();
