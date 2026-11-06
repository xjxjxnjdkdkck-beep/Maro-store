import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, ChevronDown, CircleHelp, CreditCard, Gamepad2, Menu, MessageCircle, PackageCheck, Search, ShoppingBag, Sparkles, UserRound, Wifi, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type CartLine = { productId: number; name: string; price: number; quantity: number; accent: string };

const iconFor = (name?: string) => {
  if (name === "gamepad2") return Gamepad2;
  if (name === "credit-card") return CreditCard;
  if (name === "wifi") return Wifi;
  return Sparkles;
};

const accentClass: Record<string, string> = {
  blue: "from-blue-700 via-blue-500 to-cyan-300",
  purple: "from-violet-700 via-purple-500 to-fuchsia-300",
  orange: "from-orange-700 via-orange-500 to-yellow-200",
  cyan: "from-cyan-800 via-cyan-500 to-blue-300",
  green: "from-emerald-700 via-green-500 to-lime-200",
  red: "from-rose-800 via-red-500 to-orange-200",
  violet: "from-indigo-800 via-violet-500 to-blue-200",
};

export default function Home() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const categoriesQuery = trpc.catalog.categories.useQuery();
  const productsQuery = trpc.catalog.products.useQuery({ categoryId: activeCategory, search }, { staleTime: 30_000 });
  const createOrder = trpc.orders.create.useMutation({
    onSuccess: result => {
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      setContact("");
      setNotes("");
      toast.success(`تم إنشاء الطلب ${result.orderNo}`, { description: "سيظهر لك بعد تسجيل الدخول ويمكن متابعة حالته من حسابك." });
    },
    onError: error => toast.error(error.message),
  });
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  const addToCart = (product: { id: number; name: string; price: string | number; accent: string | null }) => {
    setCart(current => {
      const existing = current.find(item => item.productId === product.id);
      if (existing) return current.map(item => item.productId === product.id ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item);
      return [...current, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, accent: product.accent ?? "blue" }];
    });
    toast.success("أُضيف المنتج إلى السلة");
  };

  const submitOrder = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setCheckoutOpen(false);
      startLogin();
      return;
    }
    createOrder.mutate({ customerName: customerName.trim() || user.name || "Maro customer", customerContact: contact.trim(), notes: notes.trim() || undefined, items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })) });
  };

  return (
    <div className="maro-site" dir="rtl">
      <header className="site-header">
        <div className="shell header-inner">
          <Link href="/" className="brand" aria-label="Maro home">
            <span className="brand-mark">M</span>
            <span><b>MARO</b><small>DIGITAL GOODS</small></span>
          </Link>
          <nav className={`main-nav ${mobileOpen ? "is-open" : ""}`}>
            <a href="#catalog">المنتجات</a>
            <a href="#how">كيف نعمل؟</a>
            <a href="#support">الدعم</a>
          </nav>
          <div className="header-actions">
            <button className="icon-button only-mobile" onClick={() => setMobileOpen(value => !value)} aria-label="فتح القائمة"><Menu size={20} /></button>
            <Link href="/admin" className="admin-link">لوحة التحكم <ArrowLeft size={15} /></Link>
            {user ? <button className="account-chip" onClick={() => toast.info(`مرحبًا ${user.name || "بك"}`)}><UserRound size={16} /> الحساب</button> : <button className="account-chip" onClick={() => startLogin()}><UserRound size={16} /> دخول</button>}
            <button className="cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={17} /><span>السلة</span><b>{cart.length}</b></button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section shell">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> LIVE DIGITAL INVENTORY <span className="eyebrow-ar">مخزون رقمي مباشر</span></div>
            <h1>كل ما تحتاجه<br /><em>رقميًا،</em> في مسار واحد.</h1>
            <p>اشتراكات، بطاقات وألعاب عالمية بتجربة شراء واضحة، دعم سريع، وتسليم مصمم ليكون بلا مفاجآت.</p>
            <div className="hero-actions"><a className="primary-button" href="#catalog">اكتشف المنتجات <ArrowLeft size={17} /></a><a className="quiet-link" href="#how">كيف نضمن التجربة؟ <CircleHelp size={16} /></a></div>
            <div className="hero-proof"><div><strong>24/7</strong><span>دعم مباشر</span></div><div><strong>100%</strong><span>مسار واضح</span></div><div><strong>USD</strong><span>سعر عالمي</span></div></div>
          </div>
          <div className="hero-visual">
            <div className="orb orb-a" /><div className="orb orb-b" />
            <div className="hero-card main-signal"><div className="signal-top"><span>MARO / CORE</span><span>v1.0</span></div><div className="signal-title">READY TO<br /><span>DELIVER.</span></div><div className="signal-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="signal-bottom"><span>global access</span><span className="signal-live"><span className="pulse-dot" /> online</span></div></div>
            <div className="hero-float float-one"><PackageCheck size={18} /><span><b>Fast fulfilment</b><small>طلبك في المكان الصحيح</small></span></div>
            <div className="hero-float float-two"><Zap size={18} /><span><b>Simple checkout</b><small>خطوات أقل، وضوح أكثر</small></span></div>
          </div>
        </section>

        <section className="category-strip shell" id="catalog">
          <div className="section-kicker"><span>01 / CATALOG</span><strong>ابدأ من الفئة المناسبة</strong></div>
          <div className="category-list">
            <button className={!activeCategory ? "category-pill active" : "category-pill"} onClick={() => setActiveCategory(undefined)}><Sparkles size={16} /> الكل</button>
            {categoriesQuery.data?.map(category => { const Icon = iconFor(category.icon ?? undefined); return <button key={category.id} className={activeCategory === category.id ? "category-pill active" : "category-pill"} onClick={() => setActiveCategory(category.id)}><Icon size={16} /> {category.name}</button>; })}
          </div>
        </section>

        <section className="products-section shell">
          <div className="products-heading"><div><span className="overline">CURATED FOR YOU</span><h2>منتجات جاهزة<br /><em>للحظة الآن.</em></h2></div><div className="search-field"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن منتج" /></div></div>
          <div className="product-grid">
            {productsQuery.isLoading ? <div className="empty-state">جاري تجهيز الكتالوج...</div> : productsQuery.data?.map(product => <article key={product.id} className="product-card">
              <div className={`product-art bg-gradient-to-br ${accentClass[product.accent ?? "blue"]}`} style={product.imageUrl ? { backgroundImage: `linear-gradient(180deg, rgba(4,18,47,.02), rgba(4,18,47,.52)), url(${product.imageUrl})` } : undefined}><div className="art-grid" /><span className="art-code">{product.categoryName?.toUpperCase()}</span><div className="art-icon"><Sparkles size={32} /></div><span className="stock-tag"><span className="pulse-dot" /> {Number(product.stock) > 0 ? `${product.stock} متاح` : "اطلب الآن"}</span></div>
              <div className="product-info"><div className="product-meta"><span>{product.badge ?? "DIGITAL"}</span><span>{product.currency}</span></div><h3>{product.name}</h3><p>{product.description}</p><div className="product-buy"><strong>${Number(product.price).toFixed(2)}</strong><button className="small-buy" onClick={() => addToCart(product)}>أضف للسلة <ArrowLeft size={15} /></button></div></div>
            </article>)}
          </div>
        </section>

        <section className="workflow-section shell" id="how"><div className="workflow-intro"><span className="overline">02 / THE FLOW</span><h2>واضح من أول<br /><em>نقرة.</em></h2><p>من اختيار المنتج إلى متابعة الطلب، صممنا المسار ليكون مفهومًا حتى قبل الدفع.</p></div><div className="workflow-steps"><div><span>01</span><ShoppingBag size={22} /><h3>اختر</h3><p>تصفح كتالوجًا مرتبًا حسب احتياجك.</p></div><div><span>02</span><CreditCard size={22} /><h3>أكد</h3><p>راجع السعر والكمية وبيانات التواصل.</p></div><div><span>03</span><PackageCheck size={22} /><h3>استلم</h3><p>تابع الحالة من حسابك وتواصل مع الدعم عند الحاجة.</p></div></div></section>
      </main>

      <footer className="site-footer" id="support"><div className="shell footer-grid"><div><Link href="/" className="brand footer-brand"><span className="brand-mark">M</span><span><b>MARO</b><small>DIGITAL GOODS</small></span></Link><p>تجارة رقمية أوضح. خيارات عالمية. دعم إنساني.</p></div><div><span className="footer-label">EXPLORE</span><a href="#catalog">المنتجات</a><a href="#how">كيف نعمل؟</a><Link href="/admin">لوحة التحكم</Link></div><div><span className="footer-label">SUPPORT</span><a href="https://wa.me/962795230369" target="_blank" rel="noreferrer"><MessageCircle size={15} /> واتساب</a><a href="https://t.me/marostore" target="_blank" rel="noreferrer">قناة تيليجرام</a><a href="mailto:hello@maro.store">hello@maro.store</a></div></div><div className="shell footer-bottom"><span>© 2026 MARO. جميع الحقوق محفوظة.</span><span>PRIVACY · TERMS · TRUST</span></div></footer>

      {cartOpen && <div className="overlay" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={event => event.stopPropagation()}><div className="drawer-head"><div><span className="overline">YOUR BAG</span><h2>سلة المنتجات</h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X size={20} /></button></div>{cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={34} /><p>السلة فارغة حاليًا.</p><span>أضف منتجًا من الكتالوج للبدء.</span></div> : <><div className="cart-lines">{cart.map(item => <div className="cart-line" key={item.productId}><div className={`mini-art bg-gradient-to-br ${accentClass[item.accent]}`}><Sparkles size={16} /></div><div className="cart-line-copy"><b>{item.name}</b><span>${item.price.toFixed(2)} · الكمية {item.quantity}</span></div><button className="line-remove" onClick={() => setCart(lines => lines.filter(line => line.productId !== item.productId))}><X size={14} /></button></div>)}</div><div className="cart-total"><span>الإجمالي</span><strong>${total.toFixed(2)}</strong></div><Button className="full-button" onClick={() => { if (!user) { startLogin(); return; } setCheckoutOpen(true); }}>إتمام الطلب <ArrowLeft size={16} /></Button></>}</aside></div>}
      {checkoutOpen && <div className="overlay" onClick={() => setCheckoutOpen(false)}><form className="checkout-modal" onSubmit={submitOrder} onClick={event => event.stopPropagation()}><div className="drawer-head"><div><span className="overline">CHECKOUT</span><h2>تأكيد الطلب</h2></div><button type="button" className="icon-button" onClick={() => setCheckoutOpen(false)}><X size={20} /></button></div><p className="form-note">هذه نسخة جاهزة لمسار الطلب. ربط مزود الدفع الخارجي يضاف بعد تحديد الحساب التجاري.</p><label>الاسم الكامل<input required value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="محمد أحمد" /></label><label>رقم الهاتف أو واتساب<input required value={contact} onChange={event => setContact(event.target.value)} placeholder="07xxxxxxxx" /></label><label>ملاحظات اختيارية<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="أي تفاصيل إضافية للطلب" /></label><div className="checkout-summary"><span>الإجمالي</span><strong>${total.toFixed(2)}</strong></div><Button className="full-button" type="submit" disabled={createOrder.isPending}>{createOrder.isPending ? "جارٍ إنشاء الطلب..." : "إنشاء الطلب"}</Button></form></div>}
    </div>
  );
}
