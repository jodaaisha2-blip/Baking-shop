# The Proving Drawer — a baking ingredients & equipment shop

React (Vite) frontend + Supabase (database + auth) + a small FastAPI
backend whose only job is sending order confirmation emails via Mailgun.

## 1. Set up the database
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste in everything from `supabase/schema.sql` and click **Run**.
   This creates the `products`, `orders`, and `order_items` tables,
   locks them down with row-level security, and seeds some sample
   baking products so the shop isn't empty.

## 2. Get your Supabase keys
In your Supabase project → **Project Settings** → **API**, copy:
- **Project URL**
- **anon public** key

## 3. Allow local sign-in redirects
In Supabase → **Authentication** → **URL Configuration**, add
`http://localhost:5173` to the **Redirect URLs** list. Without this,
GitHub sign-in will succeed but bounce you to an error page instead of
back into the app.

## 4. Configure the frontend
    cd frontend
    copy .env.example .env      (Mac/Linux: cp .env.example .env)
Open `.env` and paste in your Supabase URL and anon key.

## 5. Configure the backend (Mailgun)
    cd backend
    copy .env.example .env      (Mac/Linux: cp .env.example .env)
Fill in your `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` from mailgun.com
→ Sending → Domains. On Mailgun's free sandbox domain, you can only
send to email addresses you've added as "Authorized Recipients" in
the Mailgun dashboard — add your own email there for testing.

## 6. Run it
Backend (terminal 1):
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload

Frontend (terminal 2):
    cd frontend
    npm install
    npm run dev

Open http://localhost:5173.

## How it fits together
- **Products, cart, orders, sign-in** — all handled directly between
  the React app and Supabase (`frontend/src/App.jsx`,
  `supabaseClient.js`). The cart lives in the browser until checkout.
- **Sign-in** uses GitHub OAuth through Supabase Auth (set up earlier
  in this project's conversation).
- **Checkout** requires sign-in, then writes an `orders` row and matching
  `order_items` rows to Supabase.
- **Confirmation email** — after the order is saved, the frontend calls
  the FastAPI backend (`/api/send-confirmation`), which sends the email
  through Mailgun. If the email fails, the order itself is still safe
  in the database — email sending is treated as best-effort, not
  something that can undo a successful order.

## Adding more products
Insert rows into the `products` table via Supabase's **Table Editor**,
or add more `insert into products (...)` lines to `supabase/schema.sql`
and re-run just those lines.
