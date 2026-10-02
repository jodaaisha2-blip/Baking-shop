import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

const CART_KEY = "baking-shop-cart";
// Deployed backend URL, set at build time (frontend/.env -> VITE_API_URL).
// Empty locally, so requests use Vite's dev proxy to localhost:8000 instead.
const API_BASE = import.meta.env.VITE_API_URL || "";

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function money(n) {
  return "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState(loadCart);
  const [view, setView] = useState("shop"); // shop | cart | checkout | confirmation
  const [form, setForm] = useState({ full_name: "", address: "", phone: "" });
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [lastOrder, setLastOrder] = useState(null);

  // Auth: track the current session, and react to sign-in/out.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Products: fetched once from Supabase.
  useEffect(() => {
    supabase
      .from("products")
      .select("*")
      .order("category")
      .order("name")
      .then(({ data, error }) => {
        if (error) setLoadError("Couldn't load products. Check your Supabase setup.");
        else setProducts(data || []);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const visibleProducts = useMemo(
    () => (category === "all" ? products : products.filter((p) => p.category === category)),
    [products, category]
  );

  const cartItems = useMemo(
    () => Object.values(cart).filter((line) => line.qty > 0),
    [cart]
  );
  const cartCount = cartItems.reduce((sum, line) => sum + line.qty, 0);
  const cartTotal = cartItems.reduce((sum, line) => sum + line.qty * line.product.price, 0);

  function addToCart(product) {
    setCart((c) => {
      const existing = c[product.id];
      return { ...c, [product.id]: { product, qty: (existing?.qty || 0) + 1 } };
    });
  }

  function setQty(productId, qty) {
    setCart((c) => {
      if (qty <= 0) {
        const { [productId]: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, [productId]: { ...c[productId], qty } };
    });
  }

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function goToCheckout() {
    if (!session) {
      signIn();
      return;
    }
    setForm((f) => ({ ...f, full_name: f.full_name, phone: f.phone }));
    setView("checkout");
  }

  async function placeOrder(e) {
    e.preventDefault();
    if (cartItems.length === 0) return;
    setPlacing(true);
    setPlaceError("");
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: session.user.id,
          email: session.user.email,
          full_name: form.full_name,
          address: form.address,
          phone: form.phone,
          total: cartTotal,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const itemRows = cartItems.map((line) => ({
        order_id: order.id,
        product_name: line.product.name,
        quantity: line.qty,
        unit_price: line.product.price,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;

      // Best-effort: send the confirmation email. A failure here shouldn't
      // undo the order, which is already safely stored in Supabase.
      try {
        await fetch(API_BASE + "/api/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to_email: session.user.email,
            customer_name: form.full_name,
            order_id: order.id,
            items: cartItems.map((l) => ({ name: l.product.name, quantity: l.qty, unit_price: l.product.price })),
            total: cartTotal,
          }),
        });
      } catch {
        /* email is non-critical; order already succeeded */
      }

      setLastOrder(order);
      setCart({});
      setView("confirmation");
    } catch (err) {
      setPlaceError(err.message || "Couldn't place the order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="shop">
      <header className="topbar">
        <button className="brand" onClick={() => setView("shop")}>
          The Proving Drawer
        </button>
        <nav className="topnav">
          <button className="link" onClick={() => setView("cart")}>
            Cart{cartCount > 0 ? ` (${cartCount})` : ""}
          </button>
          {session ? (
            <button className="link" onClick={signOut}>Sign out</button>
          ) : (
            <button className="link" onClick={signIn}>Sign in with GitHub</button>
          )}
        </nav>
      </header>

      <main className="content">
        {view === "shop" && (
          <ShopView
            products={visibleProducts}
            category={category}
            setCategory={setCategory}
            loadError={loadError}
            onAdd={addToCart}
          />
        )}
        {view === "cart" && (
          <CartView
            items={cartItems}
            total={cartTotal}
            setQty={setQty}
            onBack={() => setView("shop")}
            onCheckout={goToCheckout}
          />
        )}
        {view === "checkout" && session && (
          <CheckoutView
            form={form}
            setForm={setForm}
            items={cartItems}
            total={cartTotal}
            placing={placing}
            error={placeError}
            onSubmit={placeOrder}
            onBack={() => setView("cart")}
          />
        )}
        {view === "confirmation" && lastOrder && (
          <ConfirmationView order={lastOrder} onContinue={() => setView("shop")} />
        )}
      </main>
    </div>
  );
}

function ShopView({ products, category, setCategory, loadError, onAdd }) {
  return (
    <section>
      <div className="intro">
        <h1>Ingredients &amp; equipment for the home baker</h1>
        <p>Flour, butter, and the tools to put them to use — sourced for consistent results.</p>
      </div>

      <div className="tabs">
        {[
          ["all", "All"],
          ["ingredient", "Ingredients"],
          ["equipment", "Equipment"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={"tab" + (category === value ? " active" : "")}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && <p className="error">{loadError}</p>}
      {!loadError && products.length === 0 && <p className="empty">No products yet — run the seed data in supabase/schema.sql.</p>}

      <ul className="grid">
        {products.map((p) => (
          <li key={p.id} className="product">
            <div className="product-top">
              <span className={"tag tag-" + p.category}>{p.category === "ingredient" ? "Ingredient" : "Equipment"}</span>
              <span className="stock">{p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</span>
            </div>
            <h3>{p.name}</h3>
            <p className="desc">{p.description}</p>
            <div className="product-bottom">
              <span className="price">{money(p.price)} <span className="unit">/ {p.unit}</span></span>
              <button disabled={p.stock <= 0} onClick={() => onAdd(p)}>Add to cart</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartView({ items, total, setQty, onBack, onCheckout }) {
  return (
    <section className="narrow">
      <h1>Your cart</h1>
      {items.length === 0 ? (
        <p className="empty">Your cart is empty. <button className="link" onClick={onBack}>Browse products</button></p>
      ) : (
        <>
          <ul className="cart-list">
            {items.map((line) => (
              <li key={line.product.id} className="cart-row">
                <div>
                  <strong>{line.product.name}</strong>
                  <span className="muted"> — {money(line.product.price)} / {line.product.unit}</span>
                </div>
                <div className="qty">
                  <button onClick={() => setQty(line.product.id, line.qty - 1)} aria-label="Decrease quantity">−</button>
                  <span>{line.qty}</span>
                  <button onClick={() => setQty(line.product.id, line.qty + 1)} aria-label="Increase quantity">+</button>
                  <button className="remove" onClick={() => setQty(line.product.id, 0)} aria-label="Remove">✕</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="actions">
            <button className="ghost" onClick={onBack}>Keep shopping</button>
            <button className="primary" onClick={onCheckout}>Checkout</button>
          </div>
        </>
      )}
    </section>
  );
}

function CheckoutView({ form, setForm, items, total, placing, error, onSubmit, onBack }) {
  return (
    <section className="narrow">
      <h1>Checkout</h1>
      <form onSubmit={onSubmit} className="form">
        <label>
          Full name
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </label>
        <label>
          Delivery address
          <textarea required rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label>
          Phone number
          <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>

        <div className="summary">
          {items.map((line) => (
            <div key={line.product.id} className="summary-row">
              <span>{line.product.name} × {line.qty}</span>
              <span>{money(line.product.price * line.qty)}</span>
            </div>
          ))}
          <div className="summary-row total">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" className="ghost" onClick={onBack} disabled={placing}>Back to cart</button>
          <button type="submit" className="primary" disabled={placing}>
            {placing ? "Placing order…" : "Place order"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ConfirmationView({ order, onContinue }) {
  return (
    <section className="narrow confirmation">
      <h1>Order placed</h1>
      <p>Thanks — your order has been received. A confirmation email is on its way to you.</p>
      <p className="muted">Order reference: {order.id}</p>
      <button className="primary" onClick={onContinue}>Continue shopping</button>
    </section>
  );
}
