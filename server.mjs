import express from 'express';
import mysql from 'mysql2/promise';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PROJECT_ID = 'maro-store-4dc09';
const PAYPAL_API = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add the Aiven MySQL connection URL to Render Environment Variables.');
const dbUrl = new URL(databaseUrl);
const pool = mysql.createPool({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database: dbUrl.pathname.replace(/^\//,''), waitForConnections: true, connectionLimit: 8, ssl: { rejectUnauthorized: false} });
const adminRate = new Map();

const seedProducts = [
  ['p1','اشتراك Netflix Premium','اشتراكات',4.50,'شهر كامل بجودة 4K','عرض خاص','https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=900&q=80'],
  ['p2','شحن PUBG Mobile','ألعاب',2.99,'شحن شدات سريع وآمن','الأكثر طلباً','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80'],
  ['p3','باقة ADSL شهرية','إنترنت',8.00,'إنترنت سريع بدون تعقيد','قيمة ممتازة','https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=80'],
  ['p4','بطاقة Steam Wallet','ألعاب',5.00,'اختر القيمة التي تناسبك','جديد','https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80'],
  ['p5','بطاقة iTunes','بطاقات رقمية',10.00,'للتطبيقات والألعاب والمحتوى','الأكثر مبيعاً','https://images.unsplash.com/photo-1607260554167-5f6b5e49f5f3?auto=format&fit=crop&w=900&q=80'],
  ['p6','اشتراك Spotify Premium','اشتراكات',3.50,'موسيقى بلا إعلانات','مميز','https://images.unsplash.com/photo-1611339555312-e607c8352fd7?auto=format&fit=crop&w=900&q=80']
];

async function migrate() {
  const c = await pool.getConnection();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS nova_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_products (id VARCHAR(80) PRIMARY KEY, name VARCHAR(255) NOT NULL, category VARCHAR(120) NOT NULL, price DECIMAL(10,2) NOT NULL, description TEXT NOT NULL, tag VARCHAR(80), image TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(category), INDEX(active))`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_inventory_codes (id BIGINT AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(80) NOT NULL, code TEXT NOT NULL, status ENUM('available','reserved','sold') NOT NULL DEFAULT 'available', order_id VARCHAR(80) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, sold_at TIMESTAMP NULL, INDEX(product_id,status), CONSTRAINT fk_code_product FOREIGN KEY(product_id) REFERENCES nova_products(id) ON DELETE CASCADE)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_orders (id VARCHAR(80) PRIMARY KEY, firebase_uid VARCHAR(160) NOT NULL, customer_email VARCHAR(255), customer_name VARCHAR(255), phone VARCHAR(80), note TEXT, total DECIMAL(10,2) NOT NULL, currency VARCHAR(8) NOT NULL DEFAULT 'USD', status ENUM('pending','paid','processing','completed','cancelled','failed') NOT NULL DEFAULT 'pending', payment_status VARCHAR(40) NOT NULL DEFAULT 'unpaid', paypal_order_id VARCHAR(120) NULL UNIQUE, paypal_capture_id VARCHAR(120) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(firebase_uid), INDEX(status))`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_order_items (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_id VARCHAR(80) NOT NULL, product_id VARCHAR(80) NOT NULL, product_name VARCHAR(255) NOT NULL, qty INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL, CONSTRAINT fk_item_order FOREIGN KEY(order_id) REFERENCES nova_orders(id) ON DELETE CASCADE)`);
    await c.query(`CREATE TABLE IF NOT EXISTS nova_order_codes (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_id VARCHAR(80) NOT NULL, product_id VARCHAR(80) NOT NULL, code TEXT NOT NULL, CONSTRAINT fk_order_code_order FOREIGN KEY(order_id) REFERENCES nova_orders(id) ON DELETE CASCADE)`);
    for (const name of ['ألعاب','اشتراكات','إنترنت','بطاقات رقمية']) await c.query('INSERT IGNORE INTO nova_categories (name) VALUES (?)',[name]);
    const [count] = await c.query('SELECT COUNT(*) n FROM nova_products');
    if (!Number(count[0].n)) for (const p of seedProducts) await c.query('INSERT INTO nova_products (id,name,category,price,description,tag,image) VALUES (?,?,?,?,?,?,?)',p);
  } finally { c.release(); }
}

function origin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim().toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try {
    const value = new URL(`${proto === 'https' || req.secure ? 'https' : 'http'}://${host}`);
    if (!value.hostname || value.username || value.password) throw new Error('invalid origin');
    return value.origin;
  } catch {
    return String(process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  }
}

app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next()});

async function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'تسجيل الدخول مطلوب.' });
  try {
    const { payload } = await jwtVerify(header.slice(7), firebaseKeys, { issuer: `https://securetoken.google.com/${PROJECT_ID}`, audience: PROJECT_ID });
    req.user = { uid: payload.user_id || payload.sub, email: String(payload.email || '').trim().toLowerCase(), emailVerified: payload.email_verified === true };
    next();
  } catch { res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية.' }); }
}

function adminUser(req, res, next) {
  authUser(req, res, () => {
    const configured = String(process.env.ADMIN_EMAIL || '').trim().replace(/^['"]|['"]$/g,'').toLowerCase();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now(), recent = (adminRate.get(ip) || []).filter(t=>now-t<60000);
    if (recent.length >= 60) return res.status(429).json({error:'محاولات كثيرة، حاول بعد دقيقة.'});
    recent.push(now); adminRate.set(ip,recent);
    if (!configured) return res.status(503).json({error:'لم يتم إعداد بريد مدير المتجر بعد.'});
    if (!req.user.emailVerified) return res.status(403).json({error:'يجب تأكيد بريد المدير أولاً.'});
    if (!req.user.email || req.user.email !== configured) return res.status(403).json({error:'هذا الحساب ليس لديه صلاحية الإدارة.'});
    next();
  });
}

async function paypalToken() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim().replace(/^['"]|['"]$/g,'');
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim().replace(/^['"]|['"]$/g,'');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, { method:'POST', headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:'grant_type=client_credentials' });
  if (!r.ok) throw new Error(`PayPal token failed ${r.status}`);
  return (await r.json()).access_token;
}
async function paypal(pathname, options={}) {
  const token = await paypalToken();
  const r = await fetch(`${PAYPAL_API}${pathname}`, { ...options, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
  const text = await r.text(); let data; try { data=JSON.parse(text); } catch { data={raw:text}; }
  if (!r.ok) { const e=new Error(data.message || 'PayPal request failed'); e.details=data; throw e; }
  return data;
}
function orderId(){ return `NOVA-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

app.use(express.json({ limit:'1mb' }));
app.get('/api/health', async (_req,res)=>{ try { await pool.query('SELECT 1'); res.json({ok:true,database:true,paypal:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET)}); } catch { res.status(503).json({ok:false,database:false}); } });
app.get('/api/categories', async (_req,res)=>{ const [rows]=await pool.query('SELECT name FROM nova_categories ORDER BY name'); res.json(rows.map(x=>x.name)); });
app.get('/api/products', async (_req,res)=>{ const [rows]=await pool.query(`SELECT p.*, (SELECT COUNT(*) FROM nova_inventory_codes c WHERE c.product_id=p.id AND c.status='available') AS available_codes FROM nova_products p WHERE p.active=1 ORDER BY p.created_at DESC`); res.json(rows); });
app.get('/api/admin/products', adminUser, async (_req,res)=>{ const [rows]=await pool.query(`SELECT p.*, (SELECT COUNT(*) FROM nova_inventory_codes c WHERE c.product_id=p.id AND c.status='available') AS available_codes FROM nova_products p ORDER BY p.created_at DESC`); res.json(rows); });
app.post('/api/admin/products', adminUser, async (req,res)=>{ const {id,name,category,price,description,tag,image}=req.body||{}; if(!name||!category||!Number.isFinite(Number(price))) return res.status(400).json({error:'بيانات المنتج ناقصة.'}); const productId=id||`p-${Date.now()}`; await pool.query(`INSERT INTO nova_products (id,name,category,price,description,tag,image) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),price=VALUES(price),description=VALUES(description),tag=VALUES(tag),image=VALUES(image)`,[productId,name,category,Number(price),description||'',tag||'جديد',image||'']); res.json({ok:true,id:productId}); });
app.post('/api/admin/import-product', adminUser, async (req,res)=>{ try { const raw=String(req.body?.url||'').trim(); const u=new URL(raw); if(!['http:','https:'].includes(u.protocol)) return res.status(400).json({error:'استخدم رابط HTTPS أو HTTP صحيح.'}); if(['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname)||/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(u.hostname)) return res.status(400).json({error:'هذا الرابط غير مسموح لأسباب أمنية.'}); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000); const r=await fetch(u,{headers:{'User-Agent':'MaroStoreProductImporter/1.0'},signal:controller.signal,redirect:'follow'}); clearTimeout(timer); if(!r.ok)return res.status(400).json({error:'تعذر قراءة صفحة المنتج.'}); const html=(await r.text()).slice(0,1200000); const meta=(name)=>{const re=new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`,'i');const m=html.match(re);return m?.[1]||m?.[2]||''}; const clean=x=>String(x||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,'').trim(); const title=clean(meta('og:title')||meta('twitter:title')||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]); const description=clean(meta('og:description')||meta('description')); const image=meta('og:image')||meta('twitter:image'); const priceMatch=html.match(/(?:"price"|itemprop=["']price["'])\s*[:=]\s*["']?([0-9]+(?:[.,][0-9]{1,2})?)/i); res.json({ok:true,data:{name:title.slice(0,255),description:description.slice(0,500),image:image.slice(0,1000),price:priceMatch?Number(priceMatch[1].replace(',','.')):0,tag:'مستورد'}}); } catch(e){res.status(400).json({error:e.name==='AbortError'?'انتهت مهلة قراءة الرابط.':'الرابط غير صالح أو لا يمكن قراءته.'});} });
app.patch('/api/admin/products/:id', adminUser, async (req,res)=>{ const active=Boolean(req.body?.active); await pool.query('UPDATE nova_products SET active=? WHERE id=?',[active,req.params.id]); res.json({ok:true}); });
app.delete('/api/admin/products/:id', adminUser, async (req,res)=>{ await pool.query('DELETE FROM nova_products WHERE id=?',[req.params.id]); res.json({ok:true}); });
app.post('/api/admin/categories', adminUser, async (req,res)=>{ const name=String(req.body?.name||'').trim(); if(!name) return res.status(400).json({error:'اسم التصنيف مطلوب.'}); await pool.query('INSERT IGNORE INTO nova_categories (name) VALUES (?)',[name]); res.json({ok:true}); });
app.post('/api/admin/products/:id/codes', adminUser, async (req,res)=>{ const raw=String(req.body?.codes||''); const codes=[...new Set(raw.split(/\r?\n|,|;/).map(x=>x.trim()).filter(Boolean))]; if(!codes.length) return res.status(400).json({error:'لم يتم العثور على أكواد.'}); const [p]=await pool.query('SELECT id FROM nova_products WHERE id=?',[req.params.id]); if(!p.length) return res.status(404).json({error:'المنتج غير موجود.'}); const c=await pool.getConnection(); try { await c.beginTransaction(); for(const code of codes) await c.query('INSERT INTO nova_inventory_codes (product_id,code) VALUES (?,?)',[req.params.id,code]); await c.commit(); res.json({ok:true,added:codes.length}); } catch(e){ await c.rollback(); throw e; } finally { c.release(); } });
app.get('/api/admin/orders', adminUser, async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM nova_orders ORDER BY created_at DESC'); for(const row of rows){ const [items]=await pool.query('SELECT product_id AS id,product_name AS name,qty,unit_price AS price FROM nova_order_items WHERE order_id=?',[row.id]); const [codes]=await pool.query('SELECT product_id,code FROM nova_order_codes WHERE order_id=?',[row.id]); row.items=items; row.codes=codes; } res.json(rows); });
app.patch('/api/admin/orders/:id', adminUser, async (req,res)=>{ const allowed=new Set(['pending','paid','processing','completed','cancelled','failed']); const status=String(req.body?.status||''); if(!allowed.has(status)) return res.status(400).json({error:'حالة الطلب غير صحيحة.'}); await pool.query('UPDATE nova_orders SET status=? WHERE id=?',[status,req.params.id]); res.json({ok:true}); });

app.post('/api/orders', authUser, async (req,res)=>{
  const {items,customerName,phone,note}=req.body||{}; if(!Array.isArray(items)||!items.length) return res.status(400).json({error:'السلة فارغة.'});
  const ids=items.map(x=>x.id); const [products]=await pool.query(`SELECT * FROM nova_products WHERE active=1 AND id IN (${ids.map(()=>'?').join(',')})`,ids); const byId=new Map(products.map(p=>[p.id,p]));
  let total=0; const normalized=[]; for(const item of items){ const p=byId.get(item.id),qty=Math.max(1,Math.min(99,Number(item.qty)||1)); if(!p) return res.status(400).json({error:'أحد المنتجات لم يعد متاحاً.'}); total+=Number(p.price)*qty; normalized.push({p,qty}); }
  const id=orderId(); const c=await pool.getConnection(); try { await c.beginTransaction(); await c.query('INSERT INTO nova_orders (id,firebase_uid,customer_email,customer_name,phone,note,total) VALUES (?,?,?,?,?,?,?)',[id,req.user.uid,req.user.email,customerName||'',phone||'',note||'',total]); for(const x of normalized) await c.query('INSERT INTO nova_order_items (order_id,product_id,product_name,qty,unit_price) VALUES (?,?,?,?,?)',[id,x.p.id,x.p.name,x.qty,x.p.price]); await c.commit(); res.json({id,total,currency:'USD'}); } catch(e){ await c.rollback(); throw e; } finally { c.release(); }
});
app.post('/api/paypal/create-order', authUser, async (req,res)=>{ try { const id=String(req.body?.orderId||''); const [rows]=await pool.query('SELECT * FROM nova_orders WHERE id=? AND firebase_uid=? AND status="pending"',[id,req.user.uid]); if(!rows.length) return res.status(404).json({error:'الطلب غير موجود.'}); const o=rows[0]; const pp=await paypal('/v2/checkout/orders',{method:'POST',body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:o.id,custom_id:o.id,amount:{currency_code:o.currency,value:Number(o.total).toFixed(2)},description:'NOVA Digital Store order'}],application_context:{brand_name:'NOVA Digital Store',user_action:'PAY_NOW',return_url:`${origin(req)}/?paypal=success&order=${encodeURIComponent(o.id)}`,cancel_url:`${origin(req)}/?paypal=cancel&order=${encodeURIComponent(o.id)}`}})}); const approve=pp.links?.find(x=>x.rel==='approve')?.href; await pool.query('UPDATE nova_orders SET paypal_order_id=? WHERE id=?',[pp.id,o.id]); res.json({paypalOrderId:pp.id,approvalUrl:approve}); } catch(e){ console.error(e); res.status(502).json({error:e.message.includes('PayPal token failed')?'بيانات PayPal غير صحيحة أو غير متطابقة. استخدم Client ID وClient Secret من نفس تطبيق Sandbox.':'تعذر إنشاء عملية PayPal.',details:e.details?.message||e.message}); } });
async function fulfill(orderIdValue,paypalOrderId,captureId){ const c=await pool.getConnection(); try { await c.beginTransaction(); const [orders]=await c.query('SELECT * FROM nova_orders WHERE id=? FOR UPDATE',[orderIdValue]); if(!orders.length) throw new Error('order missing'); const o=orders[0]; if(o.status==='paid'||o.status==='completed') { await c.commit(); return; } const [items]=await c.query('SELECT * FROM nova_order_items WHERE order_id=?',[orderIdValue]); for(const item of items){ for(let n=0;n<item.qty;n++){ const [codes]=await c.query(`SELECT id,code FROM nova_inventory_codes WHERE product_id=? AND status='available' ORDER BY id LIMIT 1 FOR UPDATE`,[item.product_id]); if(!codes.length) throw new Error(`No inventory for ${item.product_id}`); await c.query(`UPDATE nova_inventory_codes SET status='sold',order_id=?,sold_at=NOW() WHERE id=?`,[orderIdValue,codes[0].id]); await c.query('INSERT INTO nova_order_codes (order_id,product_id,code) VALUES (?,?,?)',[orderIdValue,item.product_id,codes[0].code]); } } await c.query('UPDATE nova_orders SET status="paid",payment_status="paid",paypal_capture_id=?,paypal_order_id=? WHERE id=?',[captureId,paypalOrderId,orderIdValue]); await c.commit(); } catch(e){ await c.rollback(); throw e; } finally { c.release(); } }
app.post('/api/paypal/capture-order', authUser, async (req,res)=>{ try { const id=String(req.body?.orderId||''), ppId=String(req.body?.paypalOrderId||''); const [rows]=await pool.query('SELECT * FROM nova_orders WHERE id=? AND firebase_uid=?',[id,req.user.uid]); if(!rows.length) return res.status(404).json({error:'الطلب غير موجود.'}); const result=await paypal(`/v2/checkout/orders/${encodeURIComponent(ppId)}/capture`,{method:'POST',body:'{}'}); const capture=result.purchase_units?.[0]?.payments?.captures?.[0]; await fulfill(id,ppId,capture?.id||''); const [codes]=await pool.query('SELECT product_id,code FROM nova_order_codes WHERE order_id=?',[id]); res.json({ok:true,status:result.status,codes}); } catch(e){ console.error(e); res.status(502).json({error:'تعذر تأكيد الدفع أو تسليم الكود.',details:e.details?.message||e.message}); } });
app.get('/api/my-orders', authUser, async (req,res)=>{ const [orders]=await pool.query('SELECT * FROM nova_orders WHERE firebase_uid=? ORDER BY created_at DESC',[req.user.uid]); for(const o of orders){ const [codes]=await pool.query('SELECT product_id,code FROM nova_order_codes WHERE order_id=?',[o.id]); o.codes=codes; } res.json(orders); });

app.use(express.static(__dirname, { extensions:['html'] }));
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:'حدث خطأ داخلي.'}); });
await migrate();
app.listen(PORT,'0.0.0.0',()=>console.log(`NOVA server listening on ${PORT}`));
