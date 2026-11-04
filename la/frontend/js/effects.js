const ENTER_CLASSES = ['card-enter', 'cart-item-enter', 'cart-summary-enter', 'profile-enter', 'page-enter-item', 'reveal-on-scroll', 'is-visible'];

function showImage(event) {
    if (event.target.tagName === 'IMG') event.target.classList.add('is-loaded');
}

document.addEventListener('load', showImage, true);
document.addEventListener('error', showImage, true);
document.querySelectorAll('img.lazy-img').forEach((img) => {
    if (img.complete) img.classList.add('is-loaded');
});

document.addEventListener('animationend', (event) => {
    const el = event.target;
    if (!ENTER_CLASSES.some((name) => el.classList.contains(name))) return;
    el.classList.remove(...ENTER_CLASSES);
    el.style.animationDelay = '';
});

function animateIn(elements, className, step) {
    elements.forEach((el, i) => {
        el.classList.add(className);
        el.style.animationDelay = Math.min(i, 12) * step + 'ms';
    });
}

function triggerPageEnter(root) {
    root.classList.remove('page-loaded');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.add('page-loaded'));
    });
}
