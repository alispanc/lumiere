
require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, db, req } = require('./db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('Set JWT_SECRET (>=32 characters) in .env');
    process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));

const api = express.Router();
app.use('/api', api);

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/', (request, response) => {
    response.sendFile(path.join(frontendPath, 'index.html'));
});

function wrap(handler) {
    return function (request, response, next) {
        return Promise.resolve(handler(request, response, next)).catch(next);
    };
}

function fail(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function id(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) {
        throw fail(400, 'Некорректный ID');
    }
    return number;
}

function limit(value, max = 500) {
    const parsed = Number.parseInt(value, 10) || max;
    return Math.min(max, Math.max(1, parsed));
}

function s(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function userDto(user) {
    return {
        id: user.id_user,
        name: user.имя,
        email: user.email,
        role: user.роль || 'user',
        created_at: user.дата_и_время_регистрации,
        address: user.адрес || '',
        phone: user.телефон || ''
    };
}

function tokenFor(user) {
    return jwt.sign(
        { sub: String(user.id_user) },
        process.env.JWT_SECRET,
        { expiresIn: '12h', algorithm: 'HS256' }
    );
}

const auth = wrap(async (request, response, next) => {
    const authorization = request.get('authorization') || '';
    const match = /^Bearer (.+)$/i.exec(authorization);

    if (!match) {
        throw fail(401, 'Требуется авторизация');
    }

    let payload;

    try {
        payload = jwt.verify(
            match[1],
            process.env.JWT_SECRET,
            { algorithms: ['HS256'] }
        );
    } catch {
        throw fail(401, 'Сессия истекла');
    }

    const pool = await db();
    const result = await req(pool, {
        id: id(payload.sub)
    }).query(`
        SELECT *
        FROM dbo.Пользователи
        WHERE id_user = @id
    `);

    const user = result.recordset[0];

    if (!user) {
        throw fail(401, 'Пользователь не найден');
    }

    request.user = user;
    next();
});

function checkAdmin(request, response, next) {
    if (request.user.роль !== 'admin') {
        return next(fail(403, 'Требуются права администратора'));
    }

    next();
}

const authorizeAdmin = [auth, checkAdmin];

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

api.use('/auth/login', authLimiter);
api.use('/auth/register', authLimiter);

api.post('/auth/register', wrap(async (request, response) => {
    const name = s(request.body.name, 100);
    const email = s(request.body.email, 255).toLowerCase();
    const password = String(request.body.password || '');

    if (
        !name ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        password.length < 8 ||
        password.length > 128
    ) {
        throw fail(400, 'Укажите имя, email и пароль от 8 до 128 символов');
    }

    const pool = await db();

    const existing = await req(pool, { email }).query(`
        SELECT id_user
        FROM dbo.Пользователи
        WHERE email = @email
    `);

    if (existing.recordset.length > 0) {
        throw fail(409, 'Email уже зарегистрирован');
    }

    const hash = await bcrypt.hash(password, 12);
    let user;

    try {
        const result = await req(pool, {
            name,
            email,
            hash
        }).query(`
            INSERT INTO dbo.Пользователи
                (имя, email, пароль, дата_и_время_регистрации, роль)
            OUTPUT INSERTED.*
            VALUES (@name, @email, @hash, SYSDATETIME(), N'user')
        `);

        user = result.recordset[0];
    } catch (error) {
        if ([2601, 2627].includes(error.number)) {
            throw fail(409, 'Email уже зарегистрирован');
        }

        throw error;
    }

    response.status(201).json({
        token: tokenFor(user),
        user: userDto(user)
    });
}));

api.post('/auth/login', wrap(async (request, response) => {
    const email = s(request.body.email, 255).toLowerCase();
    const password = String(request.body.password || '');

    const pool = await db();

    const result = await req(pool, { email }).query(`
        SELECT *
        FROM dbo.Пользователи
        WHERE email = @email
    `);

    const user = result.recordset[0];

    const passwordValid =
        user &&
        user.пароль?.startsWith('$2') &&
        await bcrypt.compare(password, user.пароль);

    if (!passwordValid) {
        throw fail(401, 'Неверный email или пароль');
    }

    response.json({
        token: tokenFor(user),
        user: userDto(user)
    });
}));

api.get('/auth/me', auth, (request, response) => {
    response.json(userDto(request.user));
});

api.put('/auth/me', auth, wrap(async (request, response) => {
    const name = request.user.роль === 'admin'
        ? request.user.имя
        : s(request.body.name ?? request.user.имя, 100);

    const address = s(request.body.address, 300);
    const phone = s(request.body.phone, 30);

    if (!name) {
        throw fail(400, 'Введите имя');
    }

    const pool = await db();

    const result = await req(pool, {
        id: request.user.id_user,
        name,
        address,
        phone
    }).query(`
        UPDATE dbo.Пользователи
        SET имя = @name,
            адрес = @address,
            телефон = @phone
        OUTPUT INSERTED.*
        WHERE id_user = @id
    `);

    response.json(userDto(result.recordset[0]));
}));

const productFields = `
    id_product AS id,
    имя AS name,
    цена AS price,
    категория AS category,
    картинка AS image_url,
    описание AS description,
    дата_и_время_добавления AS created_at
`;

api.get('/products', wrap(async (request, response) => {
    const pool = await db();
    const category = s(request.query.category, 30);
    const search = s(request.query.search, 100);
    const take = limit(request.query.limit, 500);
    const pattern = '%' + search.replace(/[\[\]%_]/g, '') + '%';

    const result = await req(pool, {
        category,
        pattern,
        take
    }).query(`
        SELECT TOP (@take) ${productFields}
        FROM dbo.Товары
        WHERE (@category = '' OR категория = @category)
          AND имя LIKE @pattern
        ORDER BY id_product
    `);

    response.json(result.recordset);
}));

api.get('/products/:id', wrap(async (request, response) => {
    const pool = await db();
    const productId = id(request.params.id);

    const result = await req(pool, {
        id: productId
    }).query(`
        SELECT ${productFields}
        FROM dbo.Товары
        WHERE id_product = @id
    `);

    const product = result.recordset[0];

    if (!product) {
        throw fail(404, 'Товар не найден');
    }

    response.json(product);
}));

function productInput(body) {
    const name = s(body.name, 255);
    const category = s(body.category, 30);
    const image = s(body.image_url, 500);
    const description = s(body.description, 4000);
    const price = Number(body.price);

    if (
        !name ||
        !category ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 1000000000
    ) {
        throw fail(400, 'Проверьте название, категорию и цену');
    }

    return { name, category, image, description, price };
}

api.post('/products', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();
    const data = productInput(request.body);

    const result = await req(pool, data).query(`
        INSERT INTO dbo.Товары
            (имя, цена, категория, картинка, описание, дата_и_время_добавления)
        OUTPUT
            INSERTED.id_product AS id,
            INSERTED.имя AS name,
            INSERTED.цена AS price,
            INSERTED.категория AS category,
            INSERTED.картинка AS image_url,
            INSERTED.описание AS description,
            INSERTED.дата_и_время_добавления AS created_at
        VALUES (
            @name, @price, @category,
            @image, @description, SYSDATETIME()
        )
    `);

    response.status(201).json(result.recordset[0]);
}));

api.put('/products/:id', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();
    const data = productInput(request.body);
    data.id = id(request.params.id);

    const result = await req(pool, data).query(`
        UPDATE dbo.Товары
        SET имя = @name,
            цена = @price,
            категория = @category,
            картинка = @image,
            описание = @description
        OUTPUT
            INSERTED.id_product AS id,
            INSERTED.имя AS name,
            INSERTED.цена AS price,
            INSERTED.категория AS category,
            INSERTED.картинка AS image_url,
            INSERTED.описание AS description,
            INSERTED.дата_и_время_добавления AS created_at
        WHERE id_product = @id
    `);

    const product = result.recordset[0];

    if (!product) {
        throw fail(404, 'Товар не найден');
    }

    response.json(product);
}));

api.delete('/products/:id', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();
    const product = id(request.params.id);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        await req(transaction, { product }).query(`
            DELETE FROM dbo.Отзывы
            WHERE id_product = @product
        `);

        const orders = await req(transaction, { product }).query(`
            SELECT 1
            FROM dbo.Заказы
            WHERE id_product = @product
        `);

        if (orders.recordset.length > 0) {
            throw fail(409, 'Товар присутствует в истории заказов; удаление запрещено');
        }

        await req(transaction, { product }).query(`
            DELETE FROM dbo.Корзины
            WHERE id_product = @product
        `);

        const result = await req(transaction, { product }).query(`
            DELETE FROM dbo.Товары
            WHERE id_product = @product
        `);

        await transaction.commit();

        if (!result.rowsAffected[0]) {
            throw fail(404, 'Товар не найден');
        }

        response.json({ ok: true });
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}));

const cartSql = `
    SELECT
        c.id_cart AS id,
        c.id_product AS product_id,
        c.количество_товаров_в_корзине AS quantity,
        p.имя AS name,
        p.цена AS price,
        p.картинка AS image_url
    FROM dbo.Корзины c
    JOIN dbo.Товары p ON p.id_product = c.id_product
    WHERE c.id_user = @user
      AND c.количество_товаров_в_корзине > 0
    ORDER BY c.id_cart
`;

api.get('/cart', auth, wrap(async (request, response) => {
    const pool = await db();

    const result = await req(pool, {
        user: request.user.id_user
    }).query(cartSql);

    response.json(result.recordset);
}));

api.post('/cart', auth, wrap(async (request, response) => {
    const user = request.user.id_user;
    const product = id(request.body.product_id);
    const qty = id(request.body.quantity || 1);

    if (qty > 100) {
        throw fail(400, 'Максимум 100 шт.');
    }

    const pool = await db();

    const existingProduct = await req(pool, { product }).query(`
        SELECT 1
        FROM dbo.Товары
        WHERE id_product = @product
    `);

    if (existingProduct.recordset.length === 0) {
        throw fail(404, 'Товар не найден');
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const result = await req(transaction, {
            user,
            product
        }).query(`
            SELECT id_cart,
                   количество_товаров_в_корзине AS qty
            FROM dbo.Корзины WITH (UPDLOCK, HOLDLOCK)
            WHERE id_user = @user
              AND id_product = @product
        `);

        const rows = result.recordset;

        if (rows.length > 0) {
            const cart = rows[0].id_cart;
            const newQuantity = Math.min(
                100,
                Math.max(0, rows[0].qty) + qty
            );

            await req(transaction, {
                cart,
                qty: newQuantity
            }).query(`
                UPDATE dbo.Корзины
                SET количество_товаров_в_корзине = @qty
                WHERE id_cart = @cart
            `);
        } else {
            await req(transaction, {
                user,
                product,
                qty
            }).query(`
                INSERT INTO dbo.Корзины
                    (id_user, id_product, количество_товаров_в_корзине)
                VALUES (@user, @product, @qty)
            `);
        }

        await transaction.commit();
        response.status(201).json({ ok: true });
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}));

api.put('/cart/:product', auth, wrap(async (request, response) => {
    const product = id(request.params.product);
    const qty = Number(request.body.quantity);

    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100) {
        throw fail(400, 'Количество должно быть от 1 до 100');
    }

    const pool = await db();

    const result = await req(pool, {
        user: request.user.id_user,
        product,
        qty
    }).query(`
        UPDATE dbo.Корзины
        SET количество_товаров_в_корзине = @qty
        WHERE id_user = @user
          AND id_product = @product
    `);

    if (!result.rowsAffected[0]) {
        throw fail(404, 'Товар не в корзине');
    }

    response.json({ ok: true });
}));

api.delete('/cart/:product', auth, wrap(async (request, response) => {
    const pool = await db();
    const product = id(request.params.product);

    const result = await req(pool, {
        user: request.user.id_user,
        product
    }).query(`
        UPDATE dbo.Корзины
        SET количество_товаров_в_корзине = 0
        WHERE id_user = @user
          AND id_product = @product
    `);

    response.json({
        ok: Boolean(result.rowsAffected[0])
    });
}));

api.post('/orders', auth, wrap(async (request, response) => {
    const address = s(request.body.address, 300);
    const phone = s(request.body.phone, 30);

    if (!address || !phone || phone.length < 7) {
        throw fail(400, 'Укажите адрес и телефон');
    }

    const pool = await db();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const result = await req(transaction, {
            user: request.user.id_user
        }).query(`
            SELECT
                c.id_cart,
                c.id_product,
                c.количество_товаров_в_корзине AS qty,
                p.имя,
                p.цена
            FROM dbo.Корзины c WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.Товары p ON c.id_product = p.id_product
            WHERE c.id_user = @user
              AND c.количество_товаров_в_корзине > 0
        `);

        const items = result.recordset;

        if (items.length === 0) {
            throw fail(400, 'Корзина пуста');
        }

        const orderIds = [];

        for (const item of items) {
            const order = await req(transaction, {
                cart: item.id_cart,
                user: request.user.id_user,
                product: item.id_product,
                qty: item.qty,
                price: item.цена,
                name: item.имя,
                address,
                phone
            }).query(`
                INSERT INTO dbo.Заказы
                    (
                        id_cart,
                        id_user,
                        id_product,
                        количество,
                        цена_при_заказе,
                        имя_товара_при_заказе,
                        адрес_доставки,
                        номер_телефона,
                        статус,
                        дата_и_время_заказа
                    )
                OUTPUT INSERTED.id_order AS id
                VALUES (
                    @cart, @user, @product,
                    @qty, @price, @name,
                    @address, @phone,
                    N'новый', SYSDATETIME()
                )
            `);

            orderIds.push(order.recordset[0].id);

            await req(transaction, {
                cart: item.id_cart
            }).query(`
                UPDATE dbo.Корзины
                SET количество_товаров_в_корзине = 0
                WHERE id_cart = @cart
            `);
        }

        await transaction.commit();

        response.status(201).json({
            ids: orderIds
        });
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}));

const reviewsSql = `
    SELECT
        r.id_review AS id,
        r.id_user AS user_id,
        r.id_product AS product_id,
        r.оценка AS rating,
        r.текст_отзыва AS text,
        r.дата_и_время_создания AS created_at,
        u.имя AS user_name,
        u.email AS user_email,
        p.имя AS product_name
    FROM dbo.Отзывы r
    JOIN dbo.Пользователи u ON u.id_user = r.id_user
    JOIN dbo.Товары p ON p.id_product = r.id_product
`;

api.get('/reviews/my', auth, wrap(async (request, response) => {
    const pool = await db();

    const result = await req(pool, {
        user: request.user.id_user
    }).query(`
        ${reviewsSql}
        WHERE r.id_user = @user
        ORDER BY r.id_review DESC
    `);

    response.json(result.recordset);
}));

api.get('/reviews', wrap(async (request, response) => {
    const pool = await db();
    const product = id(request.query.product);

    const result = await req(pool, { product }).query(`
        ${reviewsSql}
        WHERE r.id_product = @product
        ORDER BY r.id_review DESC
    `);

    response.json(result.recordset);
}));

api.post('/reviews', auth, wrap(async (request, response) => {
    const product = id(request.body.product_id);
    const rating = Number(request.body.rating);
    const text = s(request.body.text, 2000);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw fail(400, 'Оценка от 1 до 5');
    }

    const pool = await db();

    const existingProduct = await req(pool, {
        product
    }).query(`
        SELECT 1
        FROM dbo.Товары
        WHERE id_product = @product
    `);

    if (existingProduct.recordset.length === 0) {
        throw fail(404, 'Товар не найден');
    }

    const result = await req(pool, {
        product,
        user: request.user.id_user,
        rating,
        text
    }).query(`
        INSERT INTO dbo.Отзывы
            (
                id_product,
                id_user,
                оценка,
                текст_отзыва,
                дата_и_время_создания
            )
        OUTPUT INSERTED.id_review AS id
        VALUES (
            @product, @user, @rating,
            @text, SYSDATETIME()
        )
    `);

    response.status(201).json(result.recordset[0]);
}));

api.delete('/reviews/:id', auth, wrap(async (request, response) => {
    const pool = await db();
    const review = id(request.params.id);
    const admin = request.user.роль === 'admin' ? 1 : 0;

    const result = await req(pool, {
        review,
        user: request.user.id_user,
        admin
    }).query(`
        DELETE FROM dbo.Отзывы
        WHERE id_review = @review
          AND (id_user = @user OR @admin = 1)
    `);

    if (!result.rowsAffected[0]) {
        throw fail(404, 'Отзыв не найден или нет прав');
    }

    response.json({ ok: true });
}));

api.get('/admin/stats', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();

    const result = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM dbo.Товары) AS products,
            (SELECT COUNT(*) FROM dbo.Пользователи) AS users,
            (SELECT COUNT(*) FROM dbo.Заказы) AS orders,
            (SELECT COUNT(*) FROM dbo.Заказы
             WHERE статус = N'новый') AS new_orders,
            (SELECT COUNT(*) FROM dbo.Отзывы) AS reviews
    `);

    response.json(result.recordset[0]);
}));

const orderSql = `
    SELECT
        o.id_order AS id,
        o.дата_и_время_заказа AS created_at,
        COALESCE(u.имя, N'—') AS user_name,
        COALESCE(u.email, N'') AS user_email,
        COALESCE(
            o.имя_товара_при_заказе,
            p.имя,
            N'—'
        ) AS product_name,
        COALESCE(
            o.количество,
            c.количество_товаров_в_корзине,
            1
        ) AS quantity,
        COALESCE(
            o.цена_при_заказе,
            p.цена,
            0
        ) AS price,
        o.адрес_доставки AS address,
        o.номер_телефона AS phone,
        o.статус AS status
    FROM dbo.Заказы o
    LEFT JOIN dbo.Корзины c
        ON c.id_cart = o.id_cart
    LEFT JOIN dbo.Пользователи u
        ON u.id_user = COALESCE(o.id_user, c.id_user)
    LEFT JOIN dbo.Товары p
        ON p.id_product = COALESCE(o.id_product, c.id_product)
`;

api.get('/admin/orders', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();

    const result = await pool.request().query(`
        ${orderSql}
        ORDER BY o.id_order DESC
    `);

    response.json(result.recordset);
}));

api.put('/admin/orders/:id', ...authorizeAdmin, wrap(async (request, response) => {
    const status = s(request.body.status, 50);

    const allowedStatuses = [
        'новый',
        'в обработке',
        'отправлен',
        'доставлен',
        'отменён'
    ];

    if (!allowedStatuses.includes(status)) {
        throw fail(400, 'Некорректный статус');
    }

    const pool = await db();
    const orderId = id(request.params.id);

    const result = await req(pool, {
        id: orderId,
        status
    }).query(`
        UPDATE dbo.Заказы
        SET статус = @status
        WHERE id_order = @id
    `);

    if (!result.rowsAffected[0]) {
        throw fail(404, 'Заказ не найден');
    }

    response.json({ ok: true, status });
}));

api.get('/admin/reviews', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();

    const result = await pool.request().query(`
        ${reviewsSql}
        ORDER BY r.id_review DESC
    `);

    response.json(result.recordset);
}));

api.get('/admin/users', ...authorizeAdmin, wrap(async (request, response) => {
    const pool = await db();

    const result = await pool.request().query(`
        SELECT
            u.*,
            (
                SELECT COUNT(*)
                FROM dbo.Заказы o
                WHERE o.id_user = u.id_user
            ) AS orders,
            (
                SELECT COUNT(*)
                FROM dbo.Отзывы r
                WHERE r.id_user = u.id_user
            ) AS reviews
        FROM dbo.Пользователи u
        ORDER BY u.id_user DESC
    `);

    const users = result.recordset.map(user => {
        return {
            ...userDto(user),
            orders: user.orders,
            reviews: user.reviews
        };
    });

    response.json(users);
}));

api.put('/admin/users/:id/role', ...authorizeAdmin, wrap(async (request, response) => {
    const user = id(request.params.id);
    const role = s(request.body.role, 20);

    if (!['admin', 'user'].includes(role)) {
        throw fail(400, 'Некорректная роль');
    }

    if (user === request.user.id_user) {
        throw fail(400, 'Нельзя менять собственную роль');
    }

    const pool = await db();

    const result = await req(pool, {
        user,
        role
    }).query(`
        UPDATE dbo.Пользователи
        SET роль = @role
        WHERE id_user = @user
    `);

    if (!result.rowsAffected[0]) {
        throw fail(404, 'Пользователь не найден');
    }

    response.json({ ok: true, role });
}));

api.get('/health', wrap(async (request, response) => {
    const pool = await db();

    await pool.request().query('SELECT 1');

    response.json({ ok: true });
}));

app.use((error, request, response, next) => {
    if (error.status) {
        return response.status(error.status).json({
            error: error.message
        });
    }

    console.error(error);

    response.status(500).json({
        error: 'Ошибка сервера или базы данных. Проверьте консоль backend и схему БД.'
    });
});

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Lumiere: http://localhost:${port}`);
    });
}

module.exports = app;
