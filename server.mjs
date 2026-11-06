import express from 'express';
import mysql from 'mysql2/promise';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PROJECT_ID = 'maro-store-4dc09';
const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const dbUrl = new URL(databaseUrl);
const pool = mysql.createPool({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database: dbUrl.pathname.replace(/^\//,''), waitForConnections: true, connectionLimit: 8, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const c = await pool.getConnection();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS nova_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_products (id VARCHAR(80) PRIMARY KEY, name VARCHAR(255) NOT NULL, category VARCHAR(120) NOT NULL, price DECIMAL(10,2) NOT NULL, description TEXT NOT NULL, image TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_inventory_codes (id BIGINT AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(80) NOT NULL, code TEXT NOT NULL, status ENUM('available','sold') NOT NULL DEFAULT 'available', order_id VARCHAR(80) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_orders (id VARCHAR(80) PRIMARY KEY, firebase_uid VARCHAR(160) NOT NULL, customer_name VARCHAR(255), phone VARCHAR(80), total DECIMAL(10,2) NOT NULL, status ENUM('pending','paid','processing','completed','cancelled','returned') NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_order_items (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_id VARCHAR(80) NOT NULL, product_name VARCHAR(255) NOT NULL, qty INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_complaints (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), phone VARCHAR(80), message TEXT, status ENUM('pending','resolved') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value TEXT)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_coupons (code VARCHAR(50) PRIMARY KEY, discount INT NOT NULL, active BOOLEAN DEFAULT TRUE)`);

    for (const name of ['ألعاب','اشتراكات','إنترنت','بطاقات رقمية']) await c.query('INSERT IGNORE INTO nova_categories (name) VALUES (?)',[name]);
  } finally { c.release(); }
}

app.disable('x-powered-by');
app.use(express.json());

async function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'تسجيل الدخول مطلوب.' });
  try {
    const { payload } = await jwtVerify(header.slice(7), firebaseKeys, { issuer: `https://securetoken.google.com/${PROJECT_ID}`, audience: PROJECT_ID });
    req.user = { uid: payload.user_id || payload.sub, email: String(payload.email || '').trim().toLowerCase() };
    next();
  } catch { res.status(401).json({ error: 'جلسة غير صالحة.' }); }
}

function adminUser(req, res, next) {
  authUser(req, res, () => {
    const configured = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!req.user.email || req.user.email !== configured) return res.status(403).json({error:'ليس لديك صلاحية.'});
    next();
  });
}

app.get('/api/health', async (_req,res)=>{ try { await pool.query('SELECT 1'); res.json({ok:true}); } catch { res.status(503).json({ok:false}); } });
app.get('/api/settings', async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_settings'); const s={}; rows.forEach(r=>s[r.setting_key]=r.setting_value); res.json(s); });
app.get('/api/categories', async (_req,res)=>{ const [rows]=await pool.query('SELECT name FROM nova_categories ORDER BY name'); res.json(rows.map(x=>x.name)); });
app.get('/api/products', async (_req,res)=>{ const [rows]=await pool.query(`SELECT * FROM nova_products WHERE active=1`); res.json(rows); });

// Admin Routes
app.get('/api/admin/products', adminUser, async (_req,res)=>{ const [rows]=await pool.query(`SELECT p.*, (SELECT COUNT(*) FROM nova_inventory_codes c WHERE c.product_id=p.id AND c.status='available') AS available_codes FROM nova_products p`); res.json(rows); });
app.post('/api/admin/products', adminUser, async (req,res)=>{ const {id,name,category,price,description,image}=req.body; const pId=id||`p-${Date.now()}`; await pool.query(`INSERT INTO nova_products (id,name,category,price,description,image) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),price=VALUES(price),description=VALUES(description),image=VALUES(image)`,[pId,name,category,Number(price),description,image]); res.json({ok:true}); });
app.delete('/api/admin/products/:id', adminUser, async (req,res)=>{ await pool.query('DELETE FROM nova_products WHERE id=?',[req.params.id]); res.json({ok:true}); });
app.post('/api/admin/products/:id/codes', adminUser, async (req,res)=>{ const codes=String(req.body.codes).split('\n').filter(Boolean); for(const c of codes) await pool.query('INSERT INTO nova_inventory_codes (product_id,code) VALUES (?,?)',[req.params.id,c]); res.json({ok:true,added:codes.length}); });

app.post('/api/admin/categories', adminUser, async (req,res)=>{ await pool.query('INSERT IGNORE INTO nova_categories (name) VALUES (?)',[req.body.name]); res.json({ok:true}); });
app.delete('/api/admin/categories/:name', adminUser, async (req,res)=>{ await pool.query('DELETE FROM nova_categories WHERE name=?',[req.params.name]); res.json({ok:true}); });

app.get('/api/admin/orders', adminUser, async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_orders ORDER BY created_at DESC'); for(const r of rows){ const [items]=await pool.query('SELECT product_name AS name,qty FROM nova_order_items WHERE order_id=?',[r.id]); r.items=items; } res.json(rows); });
app.patch('/api/admin/orders/:id', adminUser, async (req,res)=>{ await pool.query('UPDATE nova_orders SET status=? WHERE id=?',[req.body.status,req.params.id]); res.json({ok:true}); });
app.delete('/api/admin/orders/:id', adminUser, async (req,res)=>{ await pool.query('DELETE FROM nova_orders WHERE id=?',[req.params.id]); res.json({ok:true}); });

app.get('/api/admin/settings', adminUser, async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_settings'); res.json(rows); });
app.post('/api/admin/settings', adminUser, async (req,res)=>{ await pool.query('INSERT INTO nova_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[req.body.key,req.body.value]); res.json({ok:true}); });
app.get('/api/admin/complaints', adminUser, async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_complaints ORDER BY created_at DESC'); res.json(rows); });
app.patch('/api/admin/complaints/:id', adminUser, async (req,res)=>{ await pool.query('UPDATE nova_complaints SET status=? WHERE id=?',[req.body.status,req.params.id]); res.json({ok:true}); });

app.get('/api/admin/coupons', adminUser, async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_coupons'); res.json(rows); });
app.post('/api/admin/coupons', adminUser, async (req,res)=>{ await pool.query('INSERT INTO nova_coupons (code, discount) VALUES (?,?)',[req.body.code,req.body.discount]); res.json({ok:true}); });
app.delete('/api/admin/coupons/:code', adminUser, async (req,res)=>{ await pool.query('DELETE FROM nova_coupons WHERE code=?',[req.params.code]); res.json({ok:true}); });
app.get('/api/check-coupon/:code', async (req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_coupons WHERE code=? AND active=1',[req.params.code]); if(rows.length) res.json({valid:true,discount:rows[0].discount}); else res.status(404).json({valid:false}); });

app.post('/api/complaints', async (req,res)=>{ const {name,phone,message}=req.body; await pool.query('INSERT INTO nova_complaints (name,phone,message) VALUES (?,?,?)',[name,phone,message]); res.json({ok:true}); });

app.post('/api/orders', authUser, async (req,res)=>{
  const {items, customerName, phone, coupon} = req.body;
  const [products]=await pool.query(`SELECT * FROM nova_products WHERE id IN (?)`,[items.map(x=>x.id)]);
  let total=0; const normalized=[];
  for(const item of items){ const p=products.find(x=>x.id===item.id); if(p){ total+=Number(p.price)*item.qty; normalized.push({p,qty:item.qty}); } }
  
  if(coupon) {
    const [cps]=await pool.query('SELECT discount FROM nova_coupons WHERE code=? AND active=1',[coupon]);
    if(cps.length) total = total - (total * (cps[0].discount / 100));
  }

  const id=`NOVA-${Date.now()}`; const c=await pool.getConnection();
  try { await c.beginTransaction(); await c.query('INSERT INTO nova_orders (id,firebase_uid,customer_name,phone,total) VALUES (?,?,?,?,?)',[id,req.user.uid,customerName,phone,total]); for(const x of normalized) await c.query('INSERT INTO nova_order_items (order_id,product_name,qty,unit_price) VALUES (?,?,?,?)',[id,x.p.name,x.qty,x.p.price]); await c.commit(); res.json({id,total}); } catch(e){ await c.rollback(); throw e; } finally { c.release(); }
});

app.use(express.static(__dirname, { extensions:['html'] }));
await migrate();
app.listen(PORT,'0.0.0.0',()=>console.log(`Server on ${PORT}`));
