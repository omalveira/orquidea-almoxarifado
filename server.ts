import express from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Conecta ao PostgreSQL via DATABASE_URL (injetado automaticamente pelo Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Inicializa as tabelas
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT,
      code TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      unit TEXT NOT NULL,
      description TEXT,
      dimensions TEXT,
      photo TEXT,
      min_stock INTEGER DEFAULT 3,
      max_stock INTEGER DEFAULT 10,
      purchase_requested INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      type TEXT CHECK(type IN ('IN', 'OUT')) NOT NULL,
      quantity INTEGER NOT NULL,
      responsible TEXT NOT NULL,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Banco de dados inicializado!');
}

async function startServer() {
  await initDb();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ── PRODUTOS ──────────────────────────────────────────────

  app.get('/api/products', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY name ASC');
    res.json(rows);
  });

  app.get('/api/products/next-code', async (req, res) => {
    const { rows } = await pool.query(
      "SELECT code FROM products WHERE code ~ '^[0-9]{6}$' ORDER BY code DESC LIMIT 1"
    );
    const nextNum = rows.length ? parseInt(rows[0].code) + 1 : 1;
    res.json({ nextCode: nextNum.toString().padStart(6, '0') });
  });

  app.get('/api/products/check-code/:code', async (req, res) => {
    const { rows } = await pool.query('SELECT id FROM products WHERE code = $1', [req.params.code]);
    res.json({ exists: rows.length > 0 });
  });

  app.get('/api/products/check-duplicate', async (req, res) => {
    const { name, model, excludeId } = req.query;
    let query = 'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND LOWER(model) = LOWER($2)';
    const params: any[] = [name, model];
    if (excludeId) { query += ' AND id != $3'; params.push(excludeId); }
    const { rows } = await pool.query(query, params);
    res.json({ exists: rows.length > 0 });
  });

  app.post('/api/products', async (req, res) => {
    const { name, model, code, category, location, quantity, unit, description, dimensions, photo, min_stock, max_stock } = req.body;
    const qty = parseInt(quantity) || 0;
    const min = parseInt(min_stock) || 3;
    const max = parseInt(max_stock) || 10;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO products (name, model, code, category, location, quantity, unit, description, dimensions, photo, min_stock, max_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [name, model, code, category, location, qty, unit, description, dimensions, photo, min, max]
      );
      if (qty > 0) {
        await client.query(
          'INSERT INTO movements (product_id, type, quantity, responsible) VALUES ($1,$2,$3,$4)',
          [rows[0].id, 'IN', qty, 'Sistema (Cadastro)']
        );
      }
      await client.query('COMMIT');
      res.json({ id: rows[0].id });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        return res.status(400).json({ error: 'Este código de produto já está cadastrado.' });
      }
      res.status(400).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    const { name, model, dimensions, category, location, unit, description, photo, min_stock, max_stock } = req.body;
    try {
      await pool.query(
        `UPDATE products SET name=$1, model=$2, dimensions=$3, category=$4, location=$5, unit=$6, description=$7, photo=$8, min_stock=$9, max_stock=$10 WHERE id=$11`,
        [name, model, dimensions, category, location, unit, description, photo, parseInt(min_stock)||3, parseInt(max_stock)||10, req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });

  app.delete('/api/products/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM movements WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM products WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: error.message });
    } finally { client.release(); }
  });

  app.post('/api/products/:id/toggle-purchase', async (req, res) => {
    try {
      await pool.query(
        `UPDATE products SET purchase_requested = CASE WHEN purchase_requested=1 THEN 0 ELSE 1 END WHERE id=$1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ── MOVIMENTAÇÕES ─────────────────────────────────────────

  app.post('/api/movements', async (req, res) => {
    const { product_id, type, quantity, responsible, date } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT quantity FROM products WHERE id = $1', [product_id]);
      if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
      if (type === 'OUT' && rows[0].quantity < quantity) return res.status(400).json({ error: 'Saldo insuficiente' });
      const newQty = type === 'IN' ? rows[0].quantity + quantity : rows[0].quantity - quantity;
      await client.query('UPDATE products SET quantity=$1 WHERE id=$2', [newQty, product_id]);
      if (date) {
        await client.query('INSERT INTO movements (product_id, type, quantity, responsible, date) VALUES ($1,$2,$3,$4,$5)', [product_id, type, quantity, responsible, date]);
      } else {
        await client.query('INSERT INTO movements (product_id, type, quantity, responsible) VALUES ($1,$2,$3,$4)', [product_id, type, quantity, responsible]);
      }
      await client.query('COMMIT');
      res.json({ success: true, newQuantity: newQty });
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: error.message });
    } finally { client.release(); }
  });

  app.get('/api/movements', async (req, res) => {
    const { rows } = await pool.query(`
      SELECT m.*, p.name as product_name, p.code as product_code
      FROM movements m JOIN products p ON m.product_id = p.id
      ORDER BY m.date DESC LIMIT 100
    `);
    res.json(rows);
  });

  // ── DASHBOARD ─────────────────────────────────────────────

  app.get('/api/dashboard', async (req, res) => {
    const [total, low, out, purchase, recent, cats, freq, catDay] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE quantity <= 3 AND quantity > 0'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE quantity = 0'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE purchase_requested = 1'),
      pool.query(`SELECT m.*, p.name as product_name FROM movements m JOIN products p ON m.product_id = p.id ORDER BY m.date DESC LIMIT 5`),
      pool.query('SELECT category, COUNT(*) as count FROM products GROUP BY category'),
      pool.query(`SELECT DATE(date) as day, COUNT(*) as count FROM movements WHERE type='OUT' AND date >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day ASC`),
      pool.query(`SELECT DATE(m.date) as day, p.category, SUM(m.quantity) as quantity FROM movements m JOIN products p ON m.product_id = p.id WHERE m.type='OUT' AND m.date >= NOW() - INTERVAL '7 days' GROUP BY day, p.category ORDER BY day ASC`),
    ]);
    res.json({
      totalProducts: parseInt(total.rows[0].count),
      lowStock: parseInt(low.rows[0].count),
      outOfStock: parseInt(out.rows[0].count),
      purchaseRequests: parseInt(purchase.rows[0].count),
      recentMovements: recent.rows,
      categoryStats: cats.rows,
      withdrawalFrequency: freq.rows,
      withdrawalsByCategoryPerDay: catDay.rows,
    });
  });

  // ── TAREFAS ───────────────────────────────────────────────

  app.get('/api/tasks', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(rows);
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const { rows } = await pool.query('INSERT INTO tasks (text) VALUES ($1) RETURNING id', [req.body.text]);
      res.json({ id: rows[0].id });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });

  app.put('/api/tasks/:id/toggle', async (req, res) => {
    try {
      await pool.query(
        `UPDATE tasks SET completed=CASE WHEN completed=1 THEN 0 ELSE 1 END, completed_at=CASE WHEN completed=0 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });

  // ── FRONTEND ──────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, '..', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
    });
  }

  const PORT = parseInt(process.env.PORT || '8080');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Orquidea rodando na porta ${PORT}`);
  });
}

startServer().catch(console.error);
