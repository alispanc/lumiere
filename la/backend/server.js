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
const front = path.join(__dirname, '../frontend');
app.use(express.static(front));
app.get('/', (rq, rs) => rs.sendFile(path.join(front, 'index.html')));
const wrap = handler => (rq, rs, next) => Promise.resolve(handler(rq, rs, next)).catch(next);
const fail = (status, error) => Object.assign(new Error(error), { status });
const id = v => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1)
        throw fail(400, 'Некорректный ID');
    return n;
};
const limit = (v, max = 500) => Math.min(max, Math.max(1, Number.parseInt(v, 10) || max));
const s = (v, max = 500) => String(v ?? '').trim().slice(0, max);
function userDto(u) {
    return { id: u.id_user, name: u.имя, email: u.email, role: u.роль || 'user', created_at: u.дата_и_время_регистрации, address: u.адрес || '', phone: u.телефон || '' };
}
const tokenFor = u => jwt.sign({ sub: String(u.id_user) }, process.env.JWT_SECRET, { expiresIn: '12h', algorithm: 'HS256' });
const auth = wrap(async (rq, rs, next) => {
    const match = /^Bearer (.+)$/i.exec(rq.get('authorization') || '');
    if (!match)
        throw fail(401, 'Требуется авторизация');
    let payload;
    try {
        payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    }
    catch {
        throw fail(401, 'Сессия истекла');
    }
    const p = await db();
    const out = await req(p, { id: id(payload.sub) }).query('SELECT * FROM dbo.Пользователи WHERE id_user=@id');
    if (!out.recordset[0])
        throw fail(401, 'Пользователь не найден');
    rq.user = out.recordset[0];
    next();
});
const authorizeAdmin = [auth, (rq, rs, next) => rq.user.роль === 'admin' ? next() : next(fail(403, 'Требуются права администратора'))];
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
api.use('/auth/login', authLimiter);
api.use('/auth/register', authLimiter);
api.post('/auth/register', wrap(async (rq, rs) => {
    const name = s(rq.body.name, 100), email = s(rq.body.email, 255).toLowerCase(), password = String(rq.body.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128)
        throw fail(400, 'Укажите имя, email и пароль от 8 до 128 символов');
    const p = await db();
    if ((await req(p, { email }).query('SELECT id_user FROM dbo.Пользователи WHERE email=@email')).recordset.length)
        throw fail(409, 'Email уже зарегистрирован');
    const hash = await bcrypt.hash(password, 12);
    let record;
    try {
        record = (await req(p, { name, email, hash }).query(`INSERT INTO dbo.Пользователи (имя,email,пароль,дата_и_время_регистрации,роль)
      OUTPUT INSERTED.* VALUES (@name,@email,@hash,SYSDATETIME(),N'user')`)).recordset[0];
    }
    catch (e) {
        if ([2601, 2627].includes(e.number))
            throw fail(409, 'Email уже зарегистрирован');
        throw e;
    }
    rs.status(201).json({ token: tokenFor(record), user: userDto(record) });
}));
api.post('/auth/login', wrap(async (rq, rs) => {
    const email = s(rq.body.email, 255).toLowerCase(), password = String(rq.body.password || '');
    const p = await db();
    const u = (await req(p, { email }).query('SELECT * FROM dbo.Пользователи WHERE email=@email')).recordset[0];
    if (!u || !u.пароль?.startsWith('$2') || !await bcrypt.compare(password, u.пароль))
        throw fail(401, 'Неверный email или пароль');
    rs.json({ token: tokenFor(u), user: userDto(u) });
}));
api.get('/auth/me', auth, (rq, rs) => rs.json(userDto(rq.user)));
api.put('/auth/me', auth, wrap(async (rq, rs) => {
    const name = rq.user.роль === 'admin' ? rq.user.имя : s(rq.body.name ?? rq.user.имя, 100);
    const address = s(rq.body.address, 300), phone = s(rq.body.phone, 30);
    if (!name)
        throw fail(400, 'Введите имя');
    const p = await db();
    const u = (await req(p, { id: rq.user.id_user, name, address, phone }).query(`UPDATE dbo.Пользователи SET имя=@name,адрес=@address,телефон=@phone OUTPUT INSERTED.* WHERE id_user=@id`)).recordset[0];
    rs.json(userDto(u));
}));
const productFields = `id_product AS id,имя AS name,цена AS price,категория AS category,картинка AS image_url,описание AS description,дата_и_время_добавления AS created_at`;
api.get('/products', wrap(async (rq, rs) => {
    const p = await db(), category = s(rq.query.category, 30), search = s(rq.query.search, 100), take = limit(rq.query.limit, 500);
    const result = await req(p, { category, pattern: '%' + search.replace(/[\[\]%_]/g, '') + '%', take }).query(`SELECT TOP (@take) ${productFields} FROM dbo.Товары WHERE (@category='' OR категория=@category) AND имя LIKE @pattern ORDER BY id_product`);
    rs.json(result.recordset);
}));
api.get('/products/:id', wrap(async (rq, rs) => {
    const p = await db();
    const row = (await req(p, { id: id(rq.params.id) }).query(`SELECT ${productFields} FROM dbo.Товары WHERE id_product=@id`)).recordset[0];
    if (!row)
        throw fail(404, 'Товар не найден');
    rs.json(row);
}));
function productInput(body) {
    const name = s(body.name, 255), category = s(body.category, 30), image = s(body.image_url, 500), description = s(body.description, 4000), price = Number(body.price);
    if (!name || !category || !Number.isFinite(price) || price < 0 || price > 1000000000)
        throw fail(400, 'Проверьте название, категорию и цену');
    return { name, category, image, description, price };
}
api.post('/products', ...authorizeAdmin, wrap(async (rq, rs) => {
    const p = await db(), data = productInput(rq.body);
    const row = (await req(p, data).query(`INSERT dbo.Товары (имя,цена,категория,картинка,описание,дата_и_время_добавления) OUTPUT INSERTED.id_product AS id,INSERTED.имя AS name,INSERTED.цена AS price,INSERTED.категория AS category,INSERTED.картинка AS image_url,INSERTED.описание AS description,INSERTED.дата_и_время_добавления AS created_at VALUES (@name,@price,@category,@image,@description,SYSDATETIME())`)).recordset[0];
    rs.status(201).json(row);
}));
api.put('/products/:id', ...authorizeAdmin, wrap(async (rq, rs) => {
    const p = await db(), data = { ...productInput(rq.body), id: id(rq.params.id) };
    const row = (await req(p, data).query(`UPDATE dbo.Товары SET имя=@name,цена=@price,категория=@category,картинка=@image,описание=@description OUTPUT INSERTED.id_product AS id,INSERTED.имя AS name,INSERTED.цена AS price,INSERTED.категория AS category,INSERTED.картинка AS image_url,INSERTED.описание AS description,INSERTED.дата_и_время_добавления AS created_at WHERE id_product=@id`)).recordset[0];
    if (!row)
        throw fail(404, 'Товар не найден');
    rs.json(row);
}));
api.delete('/products/:id', ...authorizeAdmin, wrap(async (rq, rs) => {
    const p = await db(), product = id(rq.params.id);
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
        await req(tx, { product }).query('DELETE FROM dbo.Отзывы WHERE id_product=@product');
        if ((await req(tx, { product }).query('SELECT 1 FROM dbo.Заказы WHERE id_product=@product')).recordset.length)
            throw fail(409, 'Товар присутствует в истории заказов; удаление запрещено');
        await req(tx, { product }).query('DELETE FROM dbo.Корзины WHERE id_product=@product');
        const result = await req(tx, { product }).query('DELETE FROM dbo.Товары WHERE id_product=@product');
        await tx.commit();
        if (!result.rowsAffected[0])
            throw fail(404, 'Товар не найден');
        rs.json({ ok: true });
    }
    catch (e) {
        await tx.rollback();
        throw e;
    }
}));
const cartSql = `SELECT c.id_cart AS id,c.id_product AS product_id,c.количество_товаров_в_корзине AS quantity,p.имя AS name,p.цена AS price,p.картинка AS image_url FROM dbo.Корзины c JOIN dbo.Товары p ON p.id_product=c.id_product WHERE c.id_user=@user AND c.количество_товаров_в_корзине>0 ORDER BY c.id_cart`;
api.get('/cart', auth, wrap(async (rq, rs) => rs.json((await req(await db(), { user: rq.user.id_user }).query(cartSql)).recordset)));
api.post('/cart', auth, wrap(async (rq, rs) => {
    const user = rq.user.id_user, product = id(rq.body.product_id), qty = id(rq.body.quantity || 1);
    if (qty > 100)
        throw fail(400, 'Максимум 100 шт.');
    const p = await db();
    if (!(await req(p, { product }).query('SELECT 1 FROM dbo.Товары WHERE id_product=@product')).recordset.length)
        throw fail(404, 'Товар не найден');
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
        const rows = (await req(tx, { user, product }).query('SELECT id_cart,количество_товаров_в_корзине AS qty FROM dbo.Корзины WITH (UPDLOCK,HOLDLOCK) WHERE id_user=@user AND id_product=@product')).recordset;
        if (rows.length)
            await req(tx, { cart: rows[0].id_cart, qty: Math.min(100, Math.max(0, rows[0].qty) + qty) }).query('UPDATE dbo.Корзины SET количество_товаров_в_корзине=@qty WHERE id_cart=@cart');
        else
            await req(tx, { user, product, qty }).query('INSERT INTO dbo.Корзины (id_user,id_product,количество_товаров_в_корзине) VALUES (@user,@product,@qty)');
        await tx.commit();
        rs.status(201).json({ ok: true });
    }
    catch (e) {
        await tx.rollback();
        throw e;
    }
}));
api.put('/cart/:product', auth, wrap(async (rq, rs) => {
    const product = id(rq.params.product), qty = Number(rq.body.quantity);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100)
        throw fail(400, 'Количество должно быть от 1 до 100');
    const result = await req(await db(), { user: rq.user.id_user, product, qty }).query('UPDATE dbo.Корзины SET количество_товаров_в_корзине=@qty WHERE id_user=@user AND id_product=@product');
    if (!result.rowsAffected[0])
        throw fail(404, 'Товар не в корзине');
    rs.json({ ok: true });
}));
api.delete('/cart/:product', auth, wrap(async (rq, rs) => {
    const result = await req(await db(), { user: rq.user.id_user, product: id(rq.params.product) }).query('UPDATE dbo.Корзины SET количество_товаров_в_корзине=0 WHERE id_user=@user AND id_product=@product');
    rs.json({ ok: !!result.rowsAffected[0] });
}));
api.post('/orders', auth, wrap(async (rq, rs) => {
    const address = s(rq.body.address, 300), phone = s(rq.body.phone, 30);
    if (!address || !phone || phone.length < 7)
        throw fail(400, 'Укажите адрес и телефон');
    const p = await db(), tx = new sql.Transaction(p);
    await tx.begin();
    try {
        const items = (await req(tx, { user: rq.user.id_user }).query(`SELECT c.id_cart,c.id_product,c.количество_товаров_в_корзине AS qty,p.имя,p.цена FROM dbo.Корзины c WITH (UPDLOCK,HOLDLOCK) JOIN dbo.Товары p ON c.id_product=p.id_product WHERE c.id_user=@user AND c.количество_товаров_в_корзине>0`)).recordset;
        if (!items.length)
            throw fail(400, 'Корзина пуста');
        const orderIds = [];
        for (const item of items) {
            const result = await req(tx, { cart: item.id_cart, user: rq.user.id_user, product: item.id_product, qty: item.qty, price: item.цена, name: item.имя, address, phone }).query(`INSERT INTO dbo.Заказы (id_cart,id_user,id_product,количество,цена_при_заказе,имя_товара_при_заказе,адрес_доставки,номер_телефона,статус,дата_и_время_заказа) OUTPUT INSERTED.id_order AS id VALUES (@cart,@user,@product,@qty,@price,@name,@address,@phone,N'новый',SYSDATETIME())`);
            orderIds.push(result.recordset[0].id);
            await req(tx, { cart: item.id_cart }).query('UPDATE dbo.Корзины SET количество_товаров_в_корзине=0 WHERE id_cart=@cart');
        }
        await tx.commit();
        rs.status(201).json({ ids: orderIds });
    }
    catch (e) {
        await tx.rollback();
        throw e;
    }
}));
const reviewsSql = `SELECT r.id_review AS id,r.id_user AS user_id,r.id_product AS product_id,r.оценка AS rating,r.текст_отзыва AS text,r.дата_и_время_создания AS created_at,u.имя AS user_name,u.email AS user_email,p.имя AS product_name FROM dbo.Отзывы r JOIN dbo.Пользователи u ON u.id_user=r.id_user JOIN dbo.Товары p ON p.id_product=r.id_product`;
api.get('/reviews/my', auth, wrap(async (rq, rs) => rs.json((await req(await db(), { user: rq.user.id_user }).query(`${reviewsSql} WHERE r.id_user=@user ORDER BY r.id_review DESC`)).recordset)));
api.get('/reviews', wrap(async (rq, rs) => rs.json((await req(await db(), { product: id(rq.query.product) }).query(`${reviewsSql} WHERE r.id_product=@product ORDER BY r.id_review DESC`)).recordset)));
api.post('/reviews', auth, wrap(async (rq, rs) => {
    const product = id(rq.body.product_id), rating = Number(rq.body.rating), text = s(rq.body.text, 2000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw fail(400, 'Оценка от 1 до 5');
    const p = await db();
    if (!(await req(p, { product }).query('SELECT 1 FROM dbo.Товары WHERE id_product=@product')).recordset.length)
        throw fail(404, 'Товар не найден');
    const result = await req(p, { product, user: rq.user.id_user, rating, text }).query('INSERT dbo.Отзывы (id_product,id_user,оценка,текст_отзыва,дата_и_время_создания) OUTPUT INSERTED.id_review AS id VALUES (@product,@user,@rating,@text,SYSDATETIME())');
    rs.status(201).json(result.recordset[0]);
}));
api.delete('/reviews/:id', auth, wrap(async (rq, rs) => {
    const p = await db(), review = id(rq.params.id);
    const result = await req(p, { review, user: rq.user.id_user, admin: rq.user.роль === 'admin' ? 1 : 0 }).query('DELETE FROM dbo.Отзывы WHERE id_review=@review AND (id_user=@user OR @admin=1)');
    if (!result.rowsAffected[0])
        throw fail(404, 'Отзыв не найден или нет прав');
    rs.json({ ok: true });
}));
api.get('/admin/stats', ...authorizeAdmin, wrap(async (rq, rs) => {
    const p = await db();
    const result = await p.request().query(`SELECT (SELECT COUNT(*) FROM dbo.Товары) AS products,(SELECT COUNT(*) FROM dbo.Пользователи) AS users,(SELECT COUNT(*) FROM dbo.Заказы) AS orders,(SELECT COUNT(*) FROM dbo.Заказы WHERE статус=N'новый') AS new_orders,(SELECT COUNT(*) FROM dbo.Отзывы) AS reviews`);
    rs.json(result.recordset[0]);
}));
const orderSql = `SELECT o.id_order AS id,o.дата_и_время_заказа AS created_at,COALESCE(u.имя,N'—') AS user_name,COALESCE(u.email,N'') AS user_email,COALESCE(o.имя_товара_при_заказе,p.имя,N'—') AS product_name,COALESCE(o.количество,c.количество_товаров_в_корзине,1) AS quantity,COALESCE(o.цена_при_заказе,p.цена,0) AS price,o.адрес_доставки AS address,o.номер_телефона AS phone,o.статус AS status FROM dbo.Заказы o LEFT JOIN dbo.Корзины c ON c.id_cart=o.id_cart LEFT JOIN dbo.Пользователи u ON u.id_user=COALESCE(o.id_user,c.id_user) LEFT JOIN dbo.Товары p ON p.id_product=COALESCE(o.id_product,c.id_product)`;
api.get('/admin/orders', ...authorizeAdmin, wrap(async (rq, rs) => rs.json((await (await db()).request().query(`${orderSql} ORDER BY o.id_order DESC`)).recordset)));
api.put('/admin/orders/:id', ...authorizeAdmin, wrap(async (rq, rs) => {
    const status = s(rq.body.status, 50);
    if (!['новый', 'в обработке', 'отправлен', 'доставлен', 'отменён'].includes(status))
        throw fail(400, 'Некорректный статус');
    const result = await req(await db(), { id: id(rq.params.id), status }).query('UPDATE dbo.Заказы SET статус=@status WHERE id_order=@id');
    if (!result.rowsAffected[0])
        throw fail(404, 'Заказ не найден');
    rs.json({ ok: true, status });
}));
api.get('/admin/reviews', ...authorizeAdmin, wrap(async (rq, rs) => rs.json((await (await db()).request().query(`${reviewsSql} ORDER BY r.id_review DESC`)).recordset)));
api.get('/admin/users', ...authorizeAdmin, wrap(async (rq, rs) => {
    const rows = (await (await db()).request().query(`SELECT u.*, (SELECT COUNT(*) FROM dbo.Заказы o WHERE o.id_user=u.id_user) AS orders,(SELECT COUNT(*) FROM dbo.Отзывы r WHERE r.id_user=u.id_user) AS reviews FROM dbo.Пользователи u ORDER BY u.id_user DESC`)).recordset;
    rs.json(rows.map(u => ({ ...userDto(u), orders: u.orders, reviews: u.reviews })));
}));
api.put('/admin/users/:id/role', ...authorizeAdmin, wrap(async (rq, rs) => {
    const user = id(rq.params.id), role = s(rq.body.role, 20);
    if (!['admin', 'user'].includes(role))
        throw fail(400, 'Некорректная роль');
    if (user === rq.user.id_user)
        throw fail(400, 'Нельзя менять собственную роль');
    const result = await req(await db(), { user, role }).query('UPDATE dbo.Пользователи SET роль=@role WHERE id_user=@user');
    if (!result.rowsAffected[0])
        throw fail(404, 'Пользователь не найден');
    rs.json({ ok: true, role });
}));
api.get('/health', wrap(async (rq, rs) => {
    await (await db()).request().query('SELECT 1');
    rs.json({ ok: true });
}));
app.use((err, rq, rs, next) => {
    if (err.status)
        return rs.status(err.status).json({ error: err.message });
    console.error(err);
    rs.status(500).json({ error: 'Ошибка сервера или базы данных. Проверьте консоль backend и схему БД.' });
});
const port = Number(process.env.PORT || 3000);
if (require.main === module) {
    app.listen(port, () => console.log(`Lumiere: http://localhost:${port}`));
}
module.exports = app;
