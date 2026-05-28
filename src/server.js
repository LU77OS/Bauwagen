const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function uid() {
  return 'id_' + Math.random().toString(36).substr(2, 12);
}

function getMonthKey(date) {
  const d = date ? new Date(date) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---- AUTH ----

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password'").get();
  if (row && row.value === password) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Falsches Passwort' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password'").get();
  if (!row || row.value !== oldPassword) {
    return res.status(401).json({ error: 'Altes Passwort falsch' });
  }
  db.prepare("UPDATE settings SET value = ? WHERE key = 'password'").run(newPassword);
  res.json({ ok: true });
});

// ---- PERSONS ----

app.get('/api/persons', (req, res) => {
  const persons = db.prepare('SELECT * FROM persons WHERE active = 1 ORDER BY name').all();
  res.json(persons);
});

app.post('/api/persons', (req, res) => {
  const { name, paypal } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = uid();
  db.prepare('INSERT INTO persons (id, name, paypal) VALUES (?, ?, ?)').run(id, name, paypal || '');
  res.json(db.prepare('SELECT * FROM persons WHERE id = ?').get(id));
});

app.put('/api/persons/:id', (req, res) => {
  const { name, paypal } = req.body;
  db.prepare('UPDATE persons SET name = ?, paypal = ? WHERE id = ?').run(name, paypal || '', req.params.id);
  res.json(db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id));
});

app.delete('/api/persons/:id', (req, res) => {
  db.prepare('UPDATE persons SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- PRODUCTS ----

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { name, emoji, price, category, stock } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name und Preis fehlen' });
  const id = uid();
  db.prepare('INSERT INTO products (id, name, emoji, price, category, stock) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name, emoji || '📦', parseFloat(price), category || 'Sonstiges', parseInt(stock) || 0
  );
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

app.put('/api/products/:id', (req, res) => {
  const { name, emoji, price, category, active } = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('UPDATE products SET name = ?, emoji = ?, price = ?, category = ?, active = ? WHERE id = ?').run(
    name ?? p.name,
    emoji ?? p.emoji,
    price != null ? parseFloat(price) : p.price,
    category ?? p.category,
    active != null ? (active ? 1 : 0) : p.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

// ---- BOOKINGS ----

app.get('/api/bookings', (req, res) => {
  const { month, personId } = req.query;
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (month) { query += ' AND month = ?'; params.push(month); }
  if (personId) { query += ' AND person_id = ?'; params.push(personId); }
  query += ' ORDER BY created_at DESC';
  const bookings = db.prepare(query).all(...params);
  const items = db.prepare('SELECT * FROM booking_items WHERE booking_id IN (' + (bookings.map(() => '?').join(',') || "'none'") + ')').all(...bookings.map(b => b.id));
  bookings.forEach(b => { b.items = items.filter(i => i.booking_id === b.id); });
  res.json(bookings);
});

app.post('/api/bookings', (req, res) => {
  const { personId, items } = req.body;
  if (!personId || !items || items.length === 0) return res.status(400).json({ error: 'Ungültige Buchung' });

  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(personId);
  if (!person) return res.status(404).json({ error: 'Person nicht gefunden' });

  const bookingId = uid();
  const month = getMonthKey();
  let total = 0;
  const lineItems = [];

  const createBooking = db.transaction(() => {
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
      if (!product) throw new Error('Produkt nicht gefunden: ' + item.productId);
      if (product.stock < item.qty) throw new Error('Nicht genug Bestand: ' + product.name);
      const lineTotal = product.price * item.qty;
      total += lineTotal;
      lineItems.push({
        id: uid(),
        booking_id: bookingId,
        product_id: product.id,
        product_name: product.name,
        qty: item.qty,
        price_at_time: product.price,
        line_total: lineTotal
      });
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, product.id);
    }

    db.prepare('INSERT INTO bookings (id, person_id, person_name, month, total) VALUES (?, ?, ?, ?, ?)').run(
      bookingId, personId, person.name, month, total
    );

    const insertItem = db.prepare('INSERT INTO booking_items (id, booking_id, product_id, product_name, qty, price_at_time, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)');
    lineItems.forEach(li => insertItem.run(li.id, li.booking_id, li.product_id, li.product_name, li.qty, li.price_at_time, li.line_total));
  });

  try {
    createBooking();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    booking.items = lineItems;
    res.json(booking);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/bookings/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Nicht gefunden' });
  const items = db.prepare('SELECT * FROM booking_items WHERE booking_id = ?').all(req.params.id);
  const undo = db.transaction(() => {
    items.forEach(i => db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id));
    db.prepare('DELETE FROM booking_items WHERE booking_id = ?').run(req.params.id);
    db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  });
  undo();
  res.json({ ok: true });
});

// ---- PURCHASES ----

app.get('/api/purchases', (req, res) => {
  const purchases = db.prepare(
    'SELECT * FROM purchases ORDER BY COALESCE(purchase_date, date(created_at)) DESC, created_at DESC LIMIT 100'
  ).all();
  res.json(purchases);
});

app.post('/api/purchases', (req, res) => {
  const { items, date } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Keine Artikel' });
  const purchaseDate = date || new Date().toISOString().slice(0, 10);
  const savePurchase = db.transaction(() => {
    items.forEach(item => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
      if (!product) return;
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.productId);
      db.prepare('INSERT INTO purchases (id, product_id, product_name, qty, purchase_date) VALUES (?, ?, ?, ?, ?)').run(uid(), item.productId, product.name, item.qty, purchaseDate);
    });
  });
  savePurchase();
  res.json({ ok: true });
});

// ---- INVENTORY ----

app.post('/api/inventory', (req, res) => {
  const { items } = req.body;
  const diffs = [];
  const saveInventory = db.transaction(() => {
    items.forEach(item => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
      if (!product) return;
      const diff = item.actual - product.stock;
      diffs.push({ name: product.name, expected: product.stock, actual: item.actual, diff });
      db.prepare('INSERT INTO inventory_logs (id, product_id, product_name, expected, actual, diff) VALUES (?, ?, ?, ?, ?, ?)').run(uid(), product.id, product.name, product.stock, item.actual, diff);
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(item.actual, product.id);
    });
  });
  saveInventory();
  res.json({ ok: true, diffs });
});

// ---- BILLING ----

app.get('/api/billing/:month', (req, res) => {
  const { month } = req.params;
  const persons = db.prepare('SELECT * FROM persons WHERE active = 1').all();
  const bookings = db.prepare('SELECT * FROM bookings WHERE month = ?').all(month);
  const items = db.prepare(
    'SELECT bi.* FROM booking_items bi JOIN bookings b ON bi.booking_id = b.id WHERE b.month = ?'
  ).all(month);

  const result = persons.map(p => {
    const personBookings = bookings.filter(b => b.person_id === p.id);
    const total = personBookings.reduce((s, b) => s + b.total, 0);
    const itemCounts = {};
    personBookings.forEach(b => {
      items.filter(i => i.booking_id === b.id).forEach(i => {
        itemCounts[i.product_name] = (itemCounts[i.product_name] || 0) + i.qty;
      });
    });
    return { person: p, total, bookingCount: personBookings.length, items: itemCounts };
  });

  const totalRevenue = bookings.reduce((s, b) => s + b.total, 0);
  const months = db.prepare("SELECT DISTINCT month FROM bookings ORDER BY month DESC").all().map(r => r.month);

  res.json({ month, persons: result, totalRevenue, totalBookings: bookings.length, months });
});

// ---- STATS ----

app.get('/api/stats', (req, res) => {
  const month = getMonthKey();
  const monthRevenue = db.prepare('SELECT SUM(total) as t FROM bookings WHERE month = ?').get(month);
  const monthBookings = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE month = ?').get(month);
  const topProducts = db.prepare(`
    SELECT bi.product_name, SUM(bi.qty) as total_qty
    FROM booking_items bi
    JOIN bookings b ON bi.booking_id = b.id
    WHERE b.month = ?
    GROUP BY bi.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  `).all(month);
  const lowStock = db.prepare('SELECT * FROM products WHERE stock <= 5 AND active = 1').all();
  res.json({ monthRevenue: monthRevenue.t || 0, monthBookings: monthBookings.c, topProducts, lowStock });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bauwagen läuft auf Port ${PORT}`);
});
