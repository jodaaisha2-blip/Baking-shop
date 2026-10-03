import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// A database-backed cart, linked to the signed-in user, kept in sync in
// real time with any other device/app viewing the same cart (the website
// and the mobile app both use this exact table structure).
export function useCart(session) {
  const [cartId, setCartId] = useState(null);
  const [items, setItems] = useState([]); // [{ id, quantity, product }]
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async (id) => {
    const { data, error } = await supabase
      .from("cart_items")
      .select("id, quantity, product:products(*)")
      .eq("cart_id", id)
      .order("created_at");
    if (!error) setItems(data || []);
  }, []);

  // When the user signs in, find (or create) their one cart row, then load
  // its items.
  useEffect(() => {
    if (!session) {
      setCartId(null);
      setItems([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    (async () => {
      const userId = session.user.id;
      const { data: existing } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      let id = existing?.id;
      if (!id) {
        const { data: created, error } = await supabase
          .from("carts")
          .insert({ user_id: userId })
          .select("id")
          .single();
        if (error || cancelled) return;
        id = created.id;
      }
      if (cancelled) return;
      setCartId(id);
      await refetch(id);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refetch]);

  // Real-time sync: any INSERT/UPDATE/DELETE on this cart's items — from
  // the website, the mobile app, or another browser tab — refetches so
  // every connected client shows the same cart within a moment.
  useEffect(() => {
    if (!cartId) return;
    const channel = supabase
      .channel("cart-items-" + cartId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_items", filter: `cart_id=eq.${cartId}` },
        () => refetch(cartId)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartId, refetch]);

  async function addItem(product) {
    if (!cartId) return;
    const existing = items.find((i) => i.product.id === product.id);
    if (existing) {
      await supabase.from("cart_items").update({ quantity: existing.quantity + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({ cart_id: cartId, product_id: product.id, quantity: 1 });
    }
    // Refetch right away so this tab feels instant; the realtime event
    // (which also triggers a refetch) keeps every OTHER tab/device in sync.
    await refetch(cartId);
  }

  async function setQty(productId, qty) {
    if (!cartId) return;
    const existing = items.find((i) => i.product.id === productId);
    if (!existing) return;
    if (qty <= 0) {
      await supabase.from("cart_items").delete().eq("id", existing.id);
    } else {
      await supabase.from("cart_items").update({ quantity: qty }).eq("id", existing.id);
    }
    await refetch(cartId);
  }

  async function clearCart() {
    if (!cartId) return;
    await supabase.from("cart_items").delete().eq("cart_id", cartId);
    setItems([]);
  }

  return { cartId, items, ready, addItem, setQty, clearCart };
}
