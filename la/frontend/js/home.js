async function renderHits() {
    const grid = document.getElementById('hits-grid');
    try {
        const hits = await api.getProducts({ category: 'hits', limit: 3 });
        grid.innerHTML = hits.map(renderProductCard).join('');
        animateIn(grid.querySelectorAll('.product-card'), 'card-enter', 140);
    }
    catch {
        grid.innerHTML = '';
    }
}
function isOnScreen(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
}
function initParallax() {
    const hero = document.querySelector('.hero-parallax');
    const heroInner = document.querySelector('.hero-parallax-inner');
    const clients = document.querySelector('.clients-section');
    const clientImages = document.querySelectorAll('.client-parallax-inner');
    window.addEventListener('scroll', () => {
        if (isOnScreen(hero)) {
            heroInner.style.transform = `translateY(${window.scrollY * 0.35}px)`;
        }
        if (isOnScreen(clients)) {
            const offset = Math.max(0, (window.innerHeight - clients.getBoundingClientRect().top) * 0.05);
            clientImages.forEach((img) => {
                img.style.transform = `translate3d(0, ${offset}px, 0)`;
            });
        }
    }, { passive: true });
}
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));
}
renderHits();
initParallax();
initScrollReveal();
