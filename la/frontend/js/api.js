const API_BASE = (location.protocol === 'file:' ? 'http://localhost:3000' : '') + '/api';

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function apiFetch(url, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('lumiere_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(url, Object.assign({}, options, { headers: headers }));
    var data = await res.json();

    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem('lumiere_token');
            localStorage.removeItem('lumiere_user');
            document.body.dataset.loggedIn = '';
        }
        throw new ApiError(res.status, data.error || 'Ошибка запроса');
    }
    return data;
}

var api = {
    register: function (name, email, password) {
        return apiFetch(API_BASE + '/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name: name, email: email, password: password })
        });
    },

    login: function (email, password) {
        return apiFetch(API_BASE + '/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: email, password: password })
        });
    },

    me: function () {
        return apiFetch(API_BASE + '/auth/me');
    },

    getProducts: function (category, limit, search, offset) {
        var params = new URLSearchParams();
        if (category) params.set('category', category);
        if (limit)    params.set('limit', limit);
        if (search)   params.set('search', search);
        if (offset)   params.set('offset', offset);
        var qs = params.toString() ? '?' + params.toString() : '';
        return apiFetch(API_BASE + '/products' + qs);
    },

    getProduct: function (id) {
        return apiFetch(API_BASE + '/products/' + id);
    },

    createProduct: function (data) {
        return apiFetch(API_BASE + '/products', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updateProduct: function (id, data) {
        return apiFetch(API_BASE + '/products/' + id, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    deleteProduct: function (id) {
        return apiFetch(API_BASE + '/products/' + id, { method: 'DELETE' });
    },

    getCart: function () {
        return apiFetch(API_BASE + '/cart');
    },

    addToCart: function (productId, quantity) {
        return apiFetch(API_BASE + '/cart', {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity: quantity || 1 })
        });
    },

    updateCartItem: function (productId, quantity) {
        return apiFetch(API_BASE + '/cart/' + productId, {
            method: 'PUT',
            body: JSON.stringify({ quantity: quantity })
        });
    },

    removeFromCart: function (productId) {
        return apiFetch(API_BASE + '/cart/' + productId, { method: 'DELETE' });
    },

    clearCart: function () {
        return apiFetch(API_BASE + '/cart', { method: 'DELETE' });
    }
};
