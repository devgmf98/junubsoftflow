# SoftFlow

Buy Software Online — Fast, Secure, and Easy.

A software storefront with a React (JSX) frontend and an Express + MySQL backend,
built to the reference designs: browse → product detail → cart → checkout → instant
licence delivery → customer account, plus a full admin console.

```
JunubSoftflow/
├── backend/            Express JSON API + MySQL
│   ├── server.js
│   ├── db/             schema.sql, migrate.js, seed.js
│   ├── src/
│   │   ├── db.js       mysql2 pool
│   │   ├── store.js    settings, licence keys, order numbers
│   │   ├── upload.js   APK + installer uploads (multer)
│   │   ├── middleware/auth.js
│   │   └── routes/     auth, shop, account, admin
│   └── storage/        apk/ and files/ (never served statically)
└── frontend/           React 18 + Vite + React Router
    └── src/
        ├── api/client.js
        ├── context/    AuthContext, CartContext
        ├── components/ layouts, icons, shared UI
        └── pages/      storefront, account/, admin/
```

## Requirements

- Node.js 18+
- MySQL 8 running locally, with a database named `junubsoftflow`

## Setup

```bash
npm --prefix backend install && npm --prefix frontend install
npm --prefix backend run setup     # create the schema and seed demo data
```

Database credentials live in `backend/.env`:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=junubsoftflow
```

## Running

Two processes, in separate terminals:

```bash
npm --prefix backend run dev       # http://localhost:4000  (API)
npm --prefix frontend run dev      # http://localhost:5173  (app)
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend, so the session
cookie stays same-origin in development.

### Demo accounts

| Role     | Email                | Password   |
| -------- | -------------------- | ---------- |
| Admin    | `admin@softflow.com` | `admin123` |
| Customer | `john@example.com`   | `user123`  |

## The customer flow

1. **Home** — hero search plus category tiles
2. **Products** — category sidebar, search, sort, pagination
3. **Product detail** — price with Save %, feature list, Description / Features / Reviews tabs
4. **Cart** — slide-over drawer and a full cart page
5. **Checkout** — payment method (card, PayPal, mobile money, bank transfer) and order summary
6. **Payment successful** — order number, receipt, licence keys
7. **My Account** — dashboard, orders, licences, downloads, support, settings
8. **Downloads** — installers for what you own, plus demo builds

Prices are never trusted from the browser: the cart lives in `localStorage` but
`POST /api/shop/cart/price` re-prices every line from the database, and checkout
re-prices again before writing the order.

Bank-transfer orders stay `pending` and issue no keys until an admin marks them
completed. Cancelling an order returns stock and revokes its keys.

## The admin console

| Page               | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| Dashboard          | Revenue, orders, customers, 12-month chart, top products, activity   |
| Products           | Full CRUD, stock, pricing, feature bullets, featured flag            |
| Product downloads  | Upload installers per product, or link an external download          |
| Orders             | Status tabs, search, detail modal, status changes, licence view      |
| Customers          | CRUD, order counts and lifetime spend                                |
| Categories         | CRUD with icon and colour picker                                     |
| **Demos & APK**    | Publish web demo/review links and upload Android APK builds          |
| Reports            | Date range, sales chart, top products, category and method breakdown, CSV export |
| Messages           | Contact-form enquiries and customer support tickets                  |
| Roles              | Roles and view/edit/delete permissions                               |
| Settings           | General, Payment, Email, Users and API tabs                          |

### Demos & APK

Admins add a demo with a **web demo link**, a **review link**, and/or an **Android
APK**. Uploads are validated by extension and MIME type, capped at 200 MB, and
stored in `backend/storage/apk/` under a randomised filename — never inside a
statically served directory. Downloads go through routes that check entitlement and
record who pulled each build (`download_log`), which the admin page shows.

Product installers work the same way via `backend/storage/files/`, capped at 500 MB,
and are restricted to customers who actually bought the product.

## Database

17 tables in `junubsoftflow`, created by `backend/db/schema.sql`:

`roles`, `users`, `categories`, `products`, `product_features`, `reviews`, `orders`,
`order_items`, `licenses`, `product_files`, `download_log`, `demos`,
`support_tickets`, `contact_messages`, `newsletter_subscribers`, `activity_log`,
`settings` — plus a `sessions` table created automatically by the session store.

Re-run `npm --prefix backend run setup` at any time to reset to the seeded demo
dataset. Note the migration refuses to run against a database that already holds
data unless you pass `--force`, because it drops every table first.

## Production build

```bash
npm --prefix frontend run build    # builds frontend/dist
```

Set `SERVE_CLIENT=true` in `backend/.env` and the API will serve the built app,
so a single process handles both.

## Why there is no root package.json

The two halves are built by different hosts - Netlify builds `frontend/` from
`netlify.toml`, Railway builds the API from the root `Dockerfile` - so a root
manifest served only local convenience. It also made Railway's builder treat the
repository as a JavaScript workspace and try to install the front end into the API
image, which failed the deploy. Run the commands above against each package
directly instead.
