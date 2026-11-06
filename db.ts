import { and, desc, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  InsertUser,
  categories,
  orderItems,
  orders,
  productCodes,
  products,
  storeSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let seeded = false;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const seedCategories = [
  { name: "ألعاب", slug: "games", description: "شحن وأكواد الألعاب الأكثر طلبًا", icon: "gamepad2", accent: "blue" },
  { name: "اشتراكات", slug: "subscriptions", description: "ترفيه وموسيقى وإنتاجية", icon: "crown", accent: "purple" },
  { name: "بطاقات رقمية", slug: "gift-cards", description: "بطاقات عالمية للاستخدام السريع", icon: "credit-card", accent: "orange" },
  { name: "إنترنت", slug: "internet", description: "باقات وخدمات اتصال رقمية", icon: "wifi", accent: "cyan" },
];

const seedProducts = [
  { categorySlug: "games", name: "شحن PUBG Mobile", slug: "pubg-mobile", description: "شحن شدات سريع وآمن لحسابك.", price: "2.99", badge: "الأكثر طلبًا", accent: "blue", featured: true, imageUrl: "/manus-storage/async-images/TmzDyRMHkJ5ZWDQ4jq8fDs/image-1.webp" },
  { categorySlug: "subscriptions", name: "Spotify Premium", slug: "spotify-premium", description: "موسيقى بلا إعلانات مع تجربة استماع كاملة.", price: "3.50", badge: "قيمة ممتازة", accent: "green", featured: true, imageUrl: "/manus-storage/async-images/TmzDyRMHkJ5ZWDQ4jq8fDs/image-2.webp" },
  { categorySlug: "subscriptions", name: "Netflix Premium", slug: "netflix-premium", description: "ترفيه عالمي وجودة تصل إلى 4K.", price: "4.50", badge: "عرض خاص", accent: "red", featured: true, imageUrl: "/manus-storage/async-images/TmzDyRMHkJ5ZWDQ4jq8fDs/image-3.webp" },
  { categorySlug: "gift-cards", name: "Steam Wallet", slug: "steam-wallet", description: "اختر القيمة المناسبة لألعابك ومحتواك.", price: "5.00", badge: "جديد", accent: "cyan", featured: true, imageUrl: "/manus-storage/async-images/TmzDyRMHkJ5ZWDQ4jq8fDs/image-4.webp" },
  { categorySlug: "gift-cards", name: "iTunes Gift Card", slug: "itunes-gift-card", description: "للتطبيقات والألعاب والمحتوى الرقمي.", price: "10.00", badge: "عالمي", accent: "orange", featured: false, imageUrl: "/manus-storage/async-images/TmzDyRMHkJ5ZWDQ4jq8fDs/image-5.webp" },
  { categorySlug: "internet", name: "باقة ADSL شهرية", slug: "adsl-monthly", description: "إنترنت سريع بدون تعقيد.", price: "8.00", badge: "متاح الآن", accent: "violet", featured: false, imageUrl: "/manus-storage/async-images/jEIck4C32BjDanNy7khIKk/image-1.webp" },
];

export async function ensureSeeded() {
  if (seeded) return;
  const db = await getDb();
  if (!db) return;
  const existingCategories = await db.select().from(categories).limit(1);
  if (existingCategories.length === 0) {
    await db.insert(categories).values(seedCategories);
  }
  const allCategories = await db.select().from(categories);
  const categoryBySlug = new Map(allCategories.map(c => [c.slug, c]));
  const existingProducts = await db.select().from(products).limit(1);
  if (existingProducts.length === 0) {
    await db.insert(products).values(seedProducts.map(p => ({
      categoryId: categoryBySlug.get(p.categorySlug)!.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      currency: "USD",
      badge: p.badge,
      accent: p.accent,
      featured: p.featured,
      active: true,
    })));
  } else {
    const existing = await db.select().from(products);
    for (const seed of seedProducts) {
      const current = existing.find(product => product.slug === seed.slug);
      if (current && !current.imageUrl && seed.imageUrl) {
        await db.update(products).set({ imageUrl: seed.imageUrl, updatedAt: new Date() }).where(eq(products.id, current.id));
      }
    }
  }
  const settingRows = await db.select().from(storeSettings).limit(1);
  if (settingRows.length === 0) {
    await db.insert(storeSettings).values([
      { key: "storeName", value: "MARO / DIGITAL GOODS" },
      { key: "supportWhatsapp", value: "+962 79 523 0369" },
      { key: "supportTelegram", value: "@marostore" },
      { key: "defaultCurrency", value: "USD" },
    ]);
  }
  seeded = true;
}

export async function listCatalog(categoryId?: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureSeeded();
  const filters = [eq(products.active, true)];
  if (categoryId) filters.push(eq(products.categoryId, categoryId));
  if (search?.trim()) filters.push(like(products.name, `%${search.trim()}%`));
  const rows = await db.select({
    id: products.id,
    categoryId: products.categoryId,
    name: products.name,
    slug: products.slug,
    description: products.description,
    price: products.price,
    currency: products.currency,
    imageUrl: products.imageUrl,
    badge: products.badge,
    accent: products.accent,
    featured: products.featured,
    categoryName: categories.name,
    stock: sql<number>`(select count(*) from product_codes pc where pc.productId = ${products.id} and pc.status = 'available')`,
  }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).where(and(...filters)).orderBy(desc(products.featured), desc(products.createdAt));
  return rows;
}

export async function listAdminProducts() {
  const db = await getDb();
  if (!db) return [];
  await ensureSeeded();
  return db.select({
    id: products.id,
    categoryId: products.categoryId,
    name: products.name,
    slug: products.slug,
    description: products.description,
    price: products.price,
    currency: products.currency,
    badge: products.badge,
    accent: products.accent,
    active: products.active,
    featured: products.featured,
    categoryName: categories.name,
    stock: sql<number>`(select count(*) from product_codes pc where pc.productId = ${products.id} and pc.status = 'available')`,
  }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(desc(products.createdAt));
}

export async function getDashboardData() {
  const db = await getDb();
  if (!db) return { revenue: "0.00", orders: 0, products: 0, categories: 0, pending: 0 };
  await ensureSeeded();
  const [revenue, orderCount, productCount, categoryCount, pending] = await Promise.all([
    db.select({ value: sql<string>`coalesce(sum(${orders.total}), 0)` }).from(orders).where(sql`${orders.status} <> 'cancelled'`),
    db.select({ value: sql<number>`count(*)` }).from(orders),
    db.select({ value: sql<number>`count(*)` }).from(products).where(eq(products.active, true)),
    db.select({ value: sql<number>`count(*)` }).from(categories).where(eq(categories.active, true)),
    db.select({ value: sql<number>`count(*)` }).from(orders).where(eq(orders.status, "pending")),
  ]);
  return {
    revenue: String(revenue[0]?.value ?? "0.00"),
    orders: Number(orderCount[0]?.value ?? 0),
    products: Number(productCount[0]?.value ?? 0),
    categories: Number(categoryCount[0]?.value ?? 0),
    pending: Number(pending[0]?.value ?? 0),
  };
}

export async function createOrder(input: { userId?: number; customerName: string; customerContact: string; notes?: string; items: { productId: number; quantity: number }[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureSeeded();
  const ids = input.items.map(item => item.productId);
  const catalog = await db.select().from(products).where(and(eq(products.active, true), sql`${products.id} in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`));
  const byId = new Map(catalog.map(product => [product.id, product]));
  const normalized = input.items.map(item => {
    const product = byId.get(item.productId);
    if (!product) throw new Error("منتج غير متاح");
    const quantity = Math.max(1, Math.min(20, Math.floor(item.quantity)));
    return { product, quantity };
  });
  const total = normalized.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0).toFixed(2);
  const orderNo = `MARO-${Date.now()}-${nanoid(5).toUpperCase()}`;
  await db.insert(orders).values({ orderNo, userId: input.userId ?? null, customerName: input.customerName, customerContact: input.customerContact, notes: input.notes ?? null, total, currency: "USD", status: "pending" });
  const inserted = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
  const orderId = inserted[0]!.id;
  await db.insert(orderItems).values(normalized.map(item => ({ orderId, productId: item.product.id, productName: item.product.name, unitPrice: item.product.price, quantity: item.quantity })));
  return { id: orderId, orderNo, total, currency: "USD" };
}

export async function listOrders(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const where = userId ? eq(orders.userId, userId) : undefined;
  return db.select().from(orders).where(where).orderBy(desc(orders.createdAt));
}

export async function listOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function updateOrderStatus(id: number, status: "pending" | "paid" | "processing" | "delivered" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, id));
  return { success: true };
}

export async function addProduct(input: { categoryId: number; name: string; description: string; price: string; badge?: string; accent?: string; featured?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "")}-${nanoid(4).toLowerCase()}`;
  await db.insert(products).values({ ...input, slug, price: input.price, currency: "USD", active: true, accent: input.accent ?? "blue", featured: input.featured ?? false, badge: input.badge ?? null });
  return { success: true };
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(products).set({ active: false, updatedAt: new Date() }).where(eq(products.id, id));
  return { success: true };
}

export async function addCodes(productId: number, codes: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const cleanCodes = codes.map(code => code.trim()).filter(Boolean).slice(0, 500);
  if (!cleanCodes.length) return { added: 0 };
  await db.insert(productCodes).values(cleanCodes.map(code => ({ productId, code, status: "available" as const })));
  return { added: cleanCodes.length };
}

export async function listSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(storeSettings).orderBy(storeSettings.key);
}

export async function updateSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(storeSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  return { success: true };
}
