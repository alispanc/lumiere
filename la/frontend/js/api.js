const API_BASE = (location.protocol === 'file:' ? 'http://localhost:3000' : '') + '/api';
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function getToken() {
    return localStorage.getItem('lumiere_token');
}
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('lumiere_user'));
    }
    catch {
        return null;
    }
}
function saveSession(token, user) {
    if (token)
        localStorage.setItem('lumiere_token', token);
    if (user)
        localStorage.setItem('lumiere_user', JSON.stringify(user));
}
function clearSession() {
    localStorage.removeItem('lumiere_token');
    localStorage.removeItem('lumiere_user');
}
async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token)
        headers.Authorization = 'Bearer ' + token;
    let response;
    try {
        response = await fetch(API_BASE + path, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
    }
    catch {
        throw new ApiError(0, 'Сервер недоступен');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401)
            clearSession();
        const message = data ? data.error || 'Ошибка запроса' : 'Сервер недоступен';
        throw new ApiError(response.status, message);
    }
    return data;
}
const api = {
    register: (name, email, password) => request('POST', '/auth/register', { name, email, password }),
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    me: () => request('GET', '/auth/me'),
    updateProfile: (data) => request('PUT', '/auth/me', data),
    getProducts: ({ category, search, limit } = {}) => {
        const params = new URLSearchParams();
        if (category)
            params.set('category', category);
        if (search)
            params.set('search', search);
        if (limit)
            params.set('limit', limit);
        return request('GET', '/products?' + params);
    },
    getProduct: (id) => request('GET', `/products/${id}`),
    createProduct: (data) => request('POST', '/products', data),
    updateProduct: (id, data) => request('PUT', `/products/${id}`, data),
    deleteProduct: (id) => request('DELETE', `/products/${id}`),
    getCart: () => request('GET', '/cart'),
    addToCart: (productId, quantity = 1) => request('POST', '/cart', { product_id: productId, quantity }),
    updateCartItem: (productId, quantity) => request('PUT', `/cart/${productId}`, { quantity }),
    removeFromCart: (productId) => request('DELETE', `/cart/${productId}`),
    createOrder: (data) => request('POST', '/orders', data),
    getReviews: (productId) => request('GET', `/reviews?product=${productId}`),
    getMyReviews: () => request('GET', '/reviews/my'),
    addReview: (productId, rating, text) => request('POST', '/reviews', { product_id: productId, rating, text }),
    deleteReview: (id) => request('DELETE', `/reviews/${id}`),
    admin: {
        stats: () => request('GET', '/admin/stats'),
        orders: () => request('GET', '/admin/orders'),
        setOrderStatus: (id, status) => request('PUT', `/admin/orders/${id}`, { status }),
        reviews: () => request('GET', '/admin/reviews'),
        users: () => request('GET', '/admin/users'),
        setUserRole: (id, role) => request('PUT', `/admin/users/${id}/role`, { role })
    }
};
