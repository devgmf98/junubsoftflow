# SoftFlow API Reference

REST/JSON API for the SoftFlow storefront and admin console.
**89 endpoints** across four routers.

| Router | Mount | Access | Endpoints |
|---|---|---|---|
| `auth` | `/api/auth` | mixed | 6 |
| `shop` | `/api/shop` | public | 13 |
| `account` | `/api/account` | signed-in customer | 9 |
| `admin` | `/api/admin` | admin only | 61 |

### Looking for something specific?

| I want to... | Section |
|---|---|
| **Create an admin user** | [Users - create an admin or a customer](#users---create-an-admin-or-a-customer) |
| Authenticate from Postman | [HTTP Basic auth](#http-basic-auth-postman-curl) |
| Sign in, register, change a password | [3. Auth](#3-auth) |
| List or search products | [GET /api/shop/products](#get-apishopproducts) |
| Price a cart, place an order | [POST /api/shop/checkout](#post-apishopcheckout) |
| See what a customer can download | [GET /api/account/downloads](#get-apiaccountdownloads) |
| Understand download permissions | [GET /api/account/downloads/file/:id](#get-apiaccountdownloadsfileid) |
| Upload source code or an APK | [Uploads (multipart)](#uploads-multipart) |
| Set up tiered pricing | [Packages, licence matrix and add-ons](#packages-licence-matrix-and-add-ons) |
| Reply to a support ticket | [Messages and support tickets](#messages-and-support-tickets) |
| Discount one product | [Per-product discounts](#per-product-discounts) |
| Send email or a newsletter | [Email, newsletter and subscribers](#email-newsletter-and-subscribers) |
| Find out why an email did not arrive | [Email, newsletter and subscribers](#email-newsletter-and-subscribers) |
| Change store settings | [Settings, roles, reports](#settings-roles-reports) |
| Test the API | [8. Testing](#8-testing) |

### Contents

1. [Authentication](#1-authentication) - cookies, Basic auth, access levels, test accounts
2. [Conventions](#2-conventions) - errors, pagination, enums, upload limits
3. [Auth](#3-auth) - 6 endpoints
4. [Shop](#4-shop-public) - 13 public endpoints
5. [Account](#5-account-customer) - 9 customer endpoints
6. [Admin](#6-admin) - 69 admin endpoints
7. [Static and binary](#7-static-and-binary)
8. [Testing](#8-testing)

---

- **Base URL** — `http://localhost:4000/api` (set by `PORT` in `backend/.env`)
- **Through the dev server** — the Vite proxy forwards `/api` to port 4000, so the browser calls same-origin `/api/...` and the session cookie is first-party.

---

## 1. Authentication

Session cookies, not tokens. `POST /api/auth/login` sets an HTTP-only `connect.sid` cookie backed by a MySQL session store; every later request must send it.

```bash
# log in, keep the cookie
curl -c jar.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@softflow.com","password":"admin123"}' \
  http://localhost:4000/api/auth/login

# use it
curl -b jar.txt http://localhost:4000/api/admin/dashboard
```

From a browser every request needs `credentials: 'include'`. CORS is locked to `CLIENT_ORIGIN` (default `http://localhost:5173`) with credentials enabled — a wildcard origin will not work.

### HTTP Basic auth (Postman, curl)

An API client can skip the login flow entirely and send credentials on the request itself:

```
Authorization: Basic base64(email:password)
```

**Postman** — set it on the *collection* so every request inherits it:
*Authorization → Type: **Basic Auth** → Username `admin@softflow.com` → Password `admin123`*

```bash
curl -u 'admin@softflow.com:admin123' http://localhost:4000/api/admin/dashboard
```

That is the whole setup — no `/auth/login` call, no cookie jar. It works on every route, and the same role rules apply: a customer's credentials still get `403` on `/api/admin/*`.

| Case | Result |
|---|---|
| Suspended account | `401` — status must be `active` |
| Wrong password / unknown email | `401` |
| Customer credentials on an admin route | `403` |
| Malformed header | `401` |
| Both a cookie **and** a Basic header | the cookie wins |

> **Credentials travel on every request**, base64-encoded but not encrypted. So it is **on by default in development and off in production** unless the deployment sets `ALLOW_BASIC_AUTH=true` — do that only behind HTTPS. `GET /api/health` reports whether it is enabled.

```json
{ "ok": true, "service": "softflow-api", "database": "junubsoftflow", "basicAuth": true }
```

### Access levels

| Level | Requirement | Failure |
|---|---|---|
| Public | none | — |
| Customer | signed in | `401 {"error":"Please sign in to continue."}` |
| Admin | signed in **and** `role = 'admin'` | `403 {"error":"You do not have permission to do that."}` |

### Seeded test accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@softflow.com` | `admin123` |
| Customer | `john@example.com` | `user123` |

All seeded customers use `user123`.

---

## 2. Conventions

**Errors** are always `{"error": "message"}` with a matching status.

| Status | Meaning |
|---|---|
| `400` | Validation failed |
| `401` | Not signed in, or bad credentials |
| `403` | Signed in but not allowed (wrong role, or content you have not bought) |
| `404` | No such record |
| `409` | Conflict — e.g. not enough stock |
| `410` | Row exists but its file is missing from disk |
| `413` | Upload above the size limit |
| `500` | Server error (message hidden when `NODE_ENV=production`) |

**Pagination** — list endpoints take `?page=` and return the page alongside the data:

```json
{ "page": 1, "pages": 8, "total": 72, "perPage": 10 }
```

Page sizes: shop products **9**, account orders **10**, admin lists **10**.

**Money** is a JSON number with 2 decimals (`99`, `234.5`). **Dates** are MySQL datetimes (`"2026-09-10T00:56:21.000Z"`); a `null` expiry means *never expires*. **Casing** — requests and responses use `camelCase`; the database uses `snake_case` and the API translates.

### Enumerations

| Concept | Values |
|---|---|
| Payment method | `card`, `paypal`, `mobile_money`, `bank_transfer`, `cash` |
| Deferred (stay pending) | `bank_transfer`, `cash` |
| Payment status | `paid`, `pending`, `failed`, `refunded` |
| Order status | `pending`, `processing`, `completed`, `cancelled` |
| Licence type | `regular`, `extended`, `agency` |
| Licence status | `active`, `expired`, `revoked` |
| Pricing mode | `simple`, `packages` |
| Product status | `active`, `draft`, `archived` |
| File kind | `installer`, `source`, `apk`, `document` |
| File platform | `windows`, `mac`, `linux`, `android`, `ios`, `web` |
| Demo platform | `web`, `desktop`, `windows`, `mac`, `linux`, `android`, `ios`, `mobile`, `both` |
| Demo status | `published`, `draft` |
| Customer status | `active`, `suspended`, `pending` |
| Ticket status | `open`, `pending`, `closed` |
| Message status | `new`, `read`, `replied` |

### Upload limits

Set in `backend/.env`; the API reports them as `maxFileMb`, `maxApkMb`, `maxBundleTotalMb`.

| Limit | Default | Notes |
|---|---|---|
| `MAX_FILE_MB` | 4096 (4 GB) | single file, streamed to disk |
| `MAX_APK_MB` | 2048 (2 GB) | one mobile build - `.apk` (Android) or `.ipa` (iOS) |
| `MAX_BUNDLE_TOTAL_MB` | 1024 (1 GB) | **folder** uploads only — they are zipped in one pass, so the parts are read into memory. A pre-made `.zip` is moved, not read, and only hits `MAX_FILE_MB`. |
| images | 5 MB | 6 review images, 8 product images |
| folder parts | 300 files | per upload |

---

## 3. Auth

| Method | Path | Access |
|---|---|---|
| GET | `/me` | public |
| POST | `/login` | public |
| POST | `/register` | public |
| POST | `/logout` | public |
| PUT | `/profile` | customer |
| PUT | `/password` | customer |

### GET /api/auth/me
Signed out returns `{"user":null}`. Signed in:

```json
{
  "user": {
    "id": 2, "name": "John Doe", "email": "john@example.com", "role": "customer",
    "phone": "+211 921 000 201", "company": "Nile Traders",
    "country": "South Sudan", "city": "Juba",
    "status": "active", "createdAt": "2025-11-05T21:00:00.000Z"
  }
}
```

### POST /api/auth/login
```json
{ "email": "admin@softflow.com", "password": "admin123" }
```
`200` returns the same `user` object. `401` on bad credentials:
```json
{ "error": "That email and password do not match." }
```

### POST /api/auth/register
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secret123",
  "phone": "+211 920 000 999",
  "company": "Acme Ltd",
  "country": "South Sudan",
  "city": "Juba"
}
```
`name`, `email`, `password` required; password at least 6 characters. Signs the new user in and returns `{ "user": {...} }`. `409` if the email is taken.

### PUT /api/auth/profile
```json
{ "name": "John Doe", "phone": "+211 921 000 201", "company": "Nile Traders", "country": "South Sudan", "city": "Juba" }
```
Email cannot be changed here.

### PUT /api/auth/password
```json
{ "currentPassword": "user123", "newPassword": "newpass123", "confirmPassword": "newpass123" }
```
`400 {"error":"Your current password is not correct."}` when it does not match.

---

## 4. Shop (public)

| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | public store settings |
| GET | `/categories` | with product counts |
| GET | `/home` | homepage payload |
| GET | `/products` | search + filter + paginate |
| GET | `/products/:slug` | full detail |
| GET | `/review-images/:file` | image bytes |
| POST | `/cart/price` | server-side re-pricing |
| POST | `/checkout` | place an order |
| GET | `/orders/:number` | order confirmation |
| GET | `/demos` | published demos |
| GET | `/demos/:id/apk` | mobile build download (`.apk` or `.ipa`) |
| POST | `/contact` | contact form |
| POST | `/subscribe` | newsletter |

### GET /api/shop/products
`?search=` `?category=<slug>` `?sort=` `?page=`
Sorts: `newest` (default), `price-asc`, `price-desc`, `rating`, `name`.

```json
{
  "products": [
    {
      "id": 1, "name": "Microsoft Office 365", "slug": "microsoft-office-365",
      "sku": "SF-MS365", "vendor": "Microsoft",
      "shortDesc": "Productivity Suite for Business",
      "price": 99, "pricingMode": "simple", "comparePrice": 149,
      "stock": 97, "licenceTerm": "1 Year Subscription", "platforms": "Windows & Mac",
      "badge": "Best Seller", "icon": "file", "accent": "blue", "imageUrl": null,
      "rating": 4.8, "reviewCount": 128, "isFeatured": true,
      "categoryName": "Productivity", "categorySlug": "productivity"
    }
  ],
  "page": 1, "pages": 1, "total": 9, "perPage": 9
}
```

### GET /api/shop/products/:slug
The largest response in the API. Top-level keys:

| Key | Shape |
|---|---|
| `product` | the product, plus `categoryId/Name/Slug` |
| `pricing` | `{ licenseTypes, packages, matrix, addons }` — populated when `pricingMode === "packages"` |
| `previewImages` | `[{ id, caption, url }]` for the Preview slider |
| `deliverables` | what a buyer receives; **no download URLs** — these are behind the paywall |
| `features` | `[string]` |
| `reviews` | `[{ id, author, rating, title, body, images[], createdAt }]` |
| `related` | up to 4 products in the same category |
| `demos` | published demos for this product |

```json
{
  "product": {
    "id": 12, "name": "MoneyPay", "slug": "moneypay", "sku": "SF-MONPAY",
    "vendor": "JunubSoft", "price": 99, "pricingMode": "packages",
    "comparePrice": 149, "stock": 100, "licenceTerm": "Life time",
    "platforms": "Web, Android and IOS", "badge": "New",
    "imageUrl": "/api/shop/review-images/moneypay-logo-1788983189239-aebc50c0.svg",
    "rating": 5, "reviewCount": 0, "categoryName": "Business"
  },
  "pricing": {
    "licenseTypes": ["regular", "extended", "agency"],
    "packages": [
      {
        "id": 1, "licenseType": "regular", "name": "Starter", "tagline": null,
        "price": 99, "comparePrice": null, "savePercent": 0,
        "licenseCount": 1, "perLicense": null, "isPopular": false,
        "ctaLabel": "Buy Now",
        "included": ["Full source code", "1 domain licence"],
        "addons": [], "benefits": []
      }
    ],
    "matrix": [
      { "licenseType": "regular", "rows": [{ "label": "Commercial use", "included": true }] }
    ],
    "addons": [
      { "id": 1, "name": "MoneyPay - Vendor App", "description": null, "regularPrice": 39, "extendedPrice": 99 }
    ]
  },
  "previewImages": [
    { "id": 4, "caption": "Dashboard overview", "url": "/api/shop/review-images/preview-1-dashboard-...svg" }
  ],
  "deliverables": [
    { "label": "MoneyPay source code", "kind": "source", "packageId": null, "packageName": null,
      "platform": "web", "version": "1.0.0", "size": 863, "isExternal": false },
    { "label": "Starter source folder", "kind": "source", "packageId": 1, "packageName": "Starter",
      "platform": "web", "version": null, "size": 355, "isExternal": false }
  ],
  "features": [], "reviews": [], "related": [], "demos": []
}
```

> `packageId: null` means every buyer of the product gets it. A non-null `packageId` ships with that tier only.

### POST /api/shop/cart/price
The browser stores **IDs only**; the server decides every price. Send whatever the cart holds and use what comes back.

```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 12, "packageId": 3, "licenseType": "regular", "quantity": 1 },
    { "addonId": 1, "licenseType": "extended", "quantity": 1 }
  ]
}
```

```json
{
  "items": [
    { "key": "product-1", "productId": 1, "name": "Microsoft Office 365", "kind": "product",
      "slug": "microsoft-office-365", "licenceTerm": "1 Year Subscription",
      "price": 99, "stock": 97, "quantity": 2, "lineTotal": 198 },
    { "key": "pkg-3", "productId": 12, "packageId": 3, "name": "MoneyPay",
      "packageName": "Super Combo", "licenseType": "regular", "licenseCount": 1,
      "kind": "package", "price": 289, "quantity": 1, "lineTotal": 289 }
  ],
  "removed": [],
  "subtotal": 487, "discountPercent": 10, "discount": 48.7, "total": 438.3
}
```

`removed` lists lines dropped because the product, package or add-on no longer exists — show the customer what disappeared. Quantity is clamped to **1–20**.

**The discount depends on the payment method.** Send `paymentMethod` to price for a specific one; omit it for the store default. The response carries every method's rate so a checkout page can show what each saves and re-price the moment one is picked:

```json
{
  "discountPercent": 20,
  "paymentMethod": "cash",
  "discountRates": { "default": 10, "card": 0, "paypal": 10, "mobile_money": 15, "bank_transfer": 5, "cash": 20 }
}
```

| Setting | Effect |
|---|---|
| `checkout_discount` | store-wide default |
| `discount_<method>` | that method's own rate, e.g. `discount_cash` |
| `discount_<method>` blank / absent | falls back to `checkout_discount` |
| `discount_<method>` = `0` | **no** discount on that method — not a fallback |

Card and PayPal carry processing fees that cash and mobile money do not, so the rates can differ per rail rather than discounting everything equally.

### POST /api/shop/checkout
Works signed in or as a guest. Prices are recomputed server-side; anything sent in the request body other than IDs and quantities is ignored.

```json
{
  "items": [
    { "productId": 1, "quantity": 1 },
    { "productId": 12, "packageId": 3, "licenseType": "regular", "quantity": 1 },
    { "addonId": 1, "licenseType": "regular", "quantity": 1 }
  ],
  "name": "John Deng",
  "email": "john@example.com",
  "phone": "+211920000222",
  "paymentMethod": "card"
}
```

```json
{ "orderNumber": "SOF123460", "total": 349.2 }
```

- The **method decides the discount** — checkout re-prices server-side with that method's rate, so a client cannot pick a cheap rate and pay on another.
- `card`, `paypal`, `mobile_money` → `payment_status: "paid"`, licences issued immediately.
- `bank_transfer`, `cash` → `payment_status: "pending"`, no keys until an admin marks it paid.
- Licence keys issued = `quantity × licenseCount`, so an agency package with 10 licences issues 10 keys.
- **Expiry follows the product's licence term** — `"Lifetime"` stores `null` (never expires), `"1 Year Subscription"` stores today + 1 year.
- `409` when stock is short: `{"error":"Only 3 licence(s) of Adobe Photoshop are left."}`

### GET /api/shop/demos
`?product=<slug>` narrows to one product.

```json
{
  "product": { "id": 12, "name": "MoneyPay", "slug": "moneypay" },
  "total": 4,
  "demos": [
    {
      "id": 4, "title": "MoneyPay", "slug": "moneypay-demo",
      "description": "Try the MoneyPay wallet, vendor and rider apps.",
      "platform": "both",
      "webUrl": "https://moneypay.example.com",
      "reviewUrl": "https://moneypay.example.com/review",
      "hasApk": true, "apkName": "app-release.apk", "apkSize": 70205272,
      "apkVersion": "1.0.0", "apkUploadedAt": "2026-09-10T00:12:00.000Z",
      "downloadCount": 5,
      "productName": "MoneyPay", "productSlug": "moneypay",
      "previewImages": [{ "id": 4, "caption": "Dashboard overview", "url": "/api/shop/review-images/..." }]
    }
  ]
}
```

### POST /api/shop/contact
```json
{ "name": "Jane Doe", "email": "jane@example.com", "subject": "An existing order", "message": "Where is my key?" }
```
`name`, `email`, `message` required → `400 {"error":"Please fill in your name, email and message."}`

### POST /api/shop/subscribe
```json
{ "email": "jane@example.com" }
```

Sends a welcome message when SMTP is configured; silently records the address when it is
not. Re-subscribing an address that already exists resumes it rather than failing.

---

### GET /api/shop/unsubscribe · POST /api/shop/unsubscribe

Public - a subscriber has no account and must not need one to leave. `?e=<email>&t=<token>`,
where the token is an HMAC of the address signed with `SESSION_SECRET`, so a link only works
for the address it was mailed to and nobody can unsubscribe a stranger.

- `GET` - a person clicked the footer link; replies with a small HTML page.
- `POST` - the mail client acted on their behalf (RFC 8058 one-click); replies `{ "ok": true }`.

An invalid or altered token returns `400` either way, and never reveals whether the address
is on the list.

---

## 5. Account (customer)

Every endpoint requires a signed-in customer.

| Method | Path |
|---|---|
| GET | `/summary` |
| GET | `/orders` · `/orders/:number` |
| GET | `/licenses` |
| GET | `/downloads` |
| GET | `/downloads/file/:id` |
| GET | `/downloads/demo/:id/apk` |
| GET | `/support` · POST `/support` |

### GET /api/account/downloads
Lists **every paid product**, whether or not a file has been attached, so a purchase is never invisible.

```json
{
  "products": [
    {
      "id": 12, "name": "MoneyPay", "slug": "moneypay",
      "icon": "money", "accent": "green", "imageUrl": "/api/shop/review-images/...",
      "licenceTerm": "Life time",
      "quantity": 1, "licences": 1,
      "licenceExpiresAt": null,
      "licenceExpired": false,
      "purchasedAt": "2026-09-10T00:41:00.000Z",
      "packages": [{ "id": 3, "name": "Super Combo" }],
      "files": [
        { "id": 7, "label": "MoneyPay source code", "kind": "source",
          "packageId": null, "packageName": null,
          "platform": "web", "version": "1.0.0", "size": 863,
          "isExternal": false, "downloadCount": 2, "available": true },
        { "id": 9, "label": "Super Combo source folder", "kind": "source",
          "packageId": 3, "packageName": "Super Combo",
          "platform": "web", "version": null, "size": 753,
          "isExternal": false, "downloadCount": 0, "available": true }
      ]
    }
  ],
  "addons": [],
  "files": [],
  "demos": []
}
```

| Field | Meaning |
|---|---|
| `available` | the row still has its file on disk — `false` means do not offer the link |
| `packageName` | `null` = every buyer gets it; otherwise it ships with that tier only |
| `licenceExpiresAt` | `null` = perpetual |
| `licenceExpired` | downloads are paused until renewal |

`files` is a flat convenience copy of every product file; `addons` lists add-ons bought on their own with their own deliverables.

### GET /api/account/downloads/file/:id
Returns the file, or redirects to `externalUrl`. Three gates, in order:

1. **Purchased?** — the product, or the add-on for an add-on file.
2. **Right package?** — a file pinned to a package needs *that* package. Owning the product on a cheaper tier is not enough.
3. **Licence live?** — an expired licence stops further downloads.

```json
403 { "error": "This download ships with the Starter package. Upgrade to it to get this file." }
403 { "error": "Your licence for Microsoft Office 365 expired on 2026-08-11. Renew it to download updated source code and builds." }
410 { "error": "That file is missing from the server." }
```

A lifetime licence (`expires_at IS NULL`) is never blocked by gate 3.

### GET /api/account/support · POST /api/account/support
```json
{ "subject": "Activation code not working", "message": "I entered the key and it says already in use.", "orderId": 83 }
```
`orderId` is optional. Reading returns your tickets **with the admin reply**:

```json
{
  "tickets": [
    {
      "id": 1, "subject": "Activation code not working",
      "message": "I entered the key for Office 365 and it says already in use.",
      "status": "pending",
      "reply": "We reissued the key on your order and emailed a fresh copy.",
      "repliedAt": "2026-09-10T03:47:00.000Z",
      "repliedBy": "Admin",
      "orderNumber": "SOF123456",
      "createdAt": "2026-09-10T02:02:00.000Z"
    }
  ],
  "orders": [{ "id": 83, "orderNumber": "SOF123456" }]
}
```

---

## 6. Admin

All 69 require `role = 'admin'`. Every path below is prefixed `/api/admin`.

| Group | Endpoints | Jump to |
|---|---|---|
| Catalogue | `/products` · `/products/:id` · `/products/:id/files` · `/products/:id/bundle` · `/products/:id/image` · `/products/:id/images` | [Catalogue](#catalogue) |
| Pricing | `/products/:id/packages` · `/products/:id/license-matrix` · `/products/:id/addons` · `/packages/:packageId/files` · `/addons/:addonId/files` | [Packages, licence matrix and add-ons](#packages-licence-matrix-and-add-ons) |
| Uploads | `/products/:id/bundle` · `/packages/:packageId/bundle` · `/addons/:addonId/bundle` | [Uploads (multipart)](#uploads-multipart) |
| **Users** | **`GET /users`** · **`POST /users`** — the only way to create an admin | [**Users - create an admin or a customer**](#users---create-an-admin-or-a-customer) |
| Orders | `/orders` · `/orders/:id` · `/orders/:id/status` | [Orders, customers, categories](#orders-customers-categories) |
| Customers | `/customers` · `/customers/:id` — **customers only**, never admins | [Orders, customers, categories](#orders-customers-categories) |
| Categories | `/categories` · `/categories/:id` | [Orders, customers, categories](#orders-customers-categories) |
| Demos | `/demos` · `/demos/:id` · `/demos/:id/apk` | [Demos](#demos) |
| Support | `/messages` · `/messages/:id/status` · `/tickets/:id/reply` · `/tickets/:id/status` | [Messages and support tickets](#messages-and-support-tickets) |
| Email | `/email` · `/email/test` · `/newsletter` · `/newsletter/deals` · `/subscribers` · `/subscribers/:id` · `/subscribers/export` | [Email, newsletter and subscribers](#email-newsletter-and-subscribers) |
| Settings | `/settings` · `/settings/:group` · `/roles` · `/reports` · `/dashboard` | [Settings, roles, reports](#settings-roles-reports) |

### Catalogue

| Method | Path | Notes |
|---|---|---|
| GET | `/products` | `?search= &category= &status= &page=`; also returns `licenceTerms` for the dropdown |
| GET/POST | `/products` · `/products/:id` | SKU is generated server-side and cannot be set |
| PUT | `/products/:id` | **partial** — only the fields you send are written |
| DELETE | `/products/:id` | |
| GET/POST/DELETE | `/products/:id/files` · `/files/:fileId` | single deliverable |
| POST | `/products/:id/bundle` | multipart folder/file upload |
| POST/DELETE | `/products/:id/image` | main product image |
| POST/DELETE | `/products/:id/images` · `/images/:imageId` | preview screenshots |

`POST /api/admin/products`:
```json
{
  "name": "Corel Painter 2025",
  "categoryId": 3,
  "vendor": "Corel",
  "shortDesc": "Digital painting studio",
  "description": "Full description shown on the product page.",
  "price": 199,
  "comparePrice": 279,
  "stock": 50,
  "pricingMode": "simple",
  "licenceTerm": "Lifetime",
  "platforms": "Windows & Mac",
  "badge": "New",
  "icon": "edit",
  "accent": "purple",
  "isFeatured": false,
  "status": "active",
  "features": ["Natural media brushes", "4K canvas support"]
}
```
→ `201 { "id": 13, "sku": "SF-CORPAI2025" }`

> `PUT` is partial by design. Sending only `{"price": 149}` changes the price and leaves everything else alone.

### Packages, licence matrix and add-ons

| Method | Path |
|---|---|
| GET | `/products/:id/packages` |
| POST | `/products/:id/packages` |
| PUT/DELETE | `/products/:id/packages/:packageId` |
| PUT | `/products/:id/license-matrix` |
| POST | `/products/:id/addons` |
| PUT/DELETE | `/products/:id/addons/:addonId` |
| GET/POST/DELETE | `/packages/:packageId/files` · `/bundle` · `/files/:fileId` |
| GET/POST/DELETE | `/addons/:addonId/files` · `/bundle` · `/files/:fileId` |

`GET /api/admin/products/12/packages`:
```json
{
  "product": { "id": 12, "name": "MoneyPay", "pricingMode": "packages" },
  "licenseTypes": ["regular", "extended", "agency"],
  "packages": [
    { "id": 1, "licenseType": "regular", "name": "Starter", "tagline": null,
      "price": 99, "comparePrice": null, "licenseCount": 1, "isPopular": false,
      "ctaLabel": "Buy Now", "status": "active",
      "included": ["Full source code"], "addons": [], "benefits": [],
      "fileCount": 1 }
  ],
  "matrix": [{ "id": 1, "licenseType": "regular", "label": "Commercial use", "included": true }],
  "addons": [
    { "id": 1, "name": "MoneyPay - Vendor App", "description": null,
      "regularPrice": 39, "extendedPrice": 99, "status": "active", "fileCount": 1 }
  ]
}
```

`POST /api/admin/products/:id/packages`:
```json
{
  "licenseType": "regular",
  "name": "Super Combo",
  "tagline": "Everything, one price",
  "price": 289,
  "comparePrice": 413,
  "licenseCount": 1,
  "isPopular": true,
  "ctaLabel": "Buy Now",
  "status": "active",
  "included": ["Full source code", "Vendor app", "Rider app"],
  "addons": ["White-label theming"],
  "benefits": ["12 months of updates"]
}
```

`PUT /api/admin/products/:id/license-matrix` replaces the whole table:
```json
{ "rows": [
  { "licenseType": "regular",  "label": "Commercial use", "included": true },
  { "licenseType": "extended", "label": "Resale rights",  "included": true }
] }
```

`GET /api/admin/packages/:packageId/files`:
```json
{
  "package": { "id": 1, "name": "Starter", "licenseType": "regular", "price": 99,
               "licenseCount": 1, "isPopular": false, "status": "active",
               "productId": 12, "productName": "MoneyPay", "buyers": 0 },
  "maxFileMb": 4096,
  "maxBundleTotalMb": 1024,
  "sharedFiles": [{ "id": 7, "label": "MoneyPay source code", "kind": "source" }],
  "siblings": [{ "id": 1, "name": "Starter", "licenseType": "regular", "fileCount": 1 }],
  "files": [
    { "id": 8, "label": "Starter source folder", "kind": "source", "platform": "web",
      "version": null, "originalName": "starter-source-folder.zip", "size": 355,
      "externalUrl": null, "requiresPurchase": true, "downloadCount": 0, "missing": false }
  ]
}
```

### Uploads (multipart)

`POST /products/:id/bundle` · `/packages/:packageId/bundle` · `/addons/:addonId/bundle`

| Field | Notes |
|---|---|
| `files` | one or many; a folder sends every file |
| `paths` | **one per file, same order** — carries `webkitRelativePath` so the folder tree survives |
| `kind` | `source` \| `apk` \| `installer` \| `document` |
| `label` | shown to the buyer |
| `platform` | ignored for `kind=source` (source is not platform-specific) |
| `version` | optional |

```bash
curl -b jar.txt -X POST \
  -F kind=source -F label="Starter source folder" -F platform=web -F version=1.0.0 \
  -F "paths=starter-kit/README.md"    -F "files=@starter-kit/README.md" \
  -F "paths=starter-kit/src/index.js" -F "files=@starter-kit/src/index.js" \
  http://localhost:4000/api/admin/packages/1/bundle
```

```json
{ "id": 8, "originalName": "starter-source-folder.zip", "size": 355, "bundled": true, "entryCount": 2 }
```

`bundled: false` means a single archive was stored untouched. One `.zip` is **moved**, never read into memory, so it is limited only by `MAX_FILE_MB`.

### Users - create an admin or a customer

`POST /api/admin/customers` can only ever make a **customer**; the role is hardcoded there. `POST /api/admin/users` is the one way to grant admin access, so it validates harder and writes an entry to `activity_log`.

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | `?role=admin` or `?role=customer`; omit for everyone |
| POST | `/users` | creates a `customer` **or** an `admin` |

```json
{
  "name": "Neon Lado",
  "email": "grace@softflow.com",
  "password": "grace-admin-2026",
  "role": "admin",
  "roleId": 1,
  "phone": "+211 920 000 777",
  "company": "SoftFlow",
  "country": "South Sudan",
  "city": "Juba",
  "status": "active"
}
```

```json
{
  "user": {
    "id": 10, "name": "Neon Lado", "email": "grace@softflow.com",
    "role": "admin", "roleId": 1, "roleName": "Administrator",
    "phone": "+211 920 000 777", "company": "SoftFlow",
    "country": "South Sudan", "city": "Juba",
    "status": "active", "createdAt": "2026-09-10T09:14:22.000Z"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | |
| `email` | yes | must be unique -> `409` |
| `password` | yes | **6+** for a customer, **8+** for an admin |
| `role` | no | `customer` (default) or `admin`; anything else falls back to `customer` |
| `roleId` | no | permission role from `/admin/roles` (Administrator, Manager, Support, Editor); `400` if it does not exist |
| `phone` `company` `country` `city` | no | |
| `status` | no | `active` (default), `pending`, `suspended` |

```json
400 { "error": "An admin password must be at least 8 characters." }
400 { "error": "Enter a valid email address." }
400 { "error": "That permission role does not exist." }
409 { "error": "An account with that email already exists." }
```

The new account can sign in immediately and, when `role: "admin"`, reach the whole console. In the UI this is **Settings -> Users -> Add user**.

> **`roleId` is descriptive, not enforced.** `requireAdmin` gates on `role === 'admin'` alone, so a Support or Editor account currently reaches every admin endpoint. The role is stored, returned by `GET /admin/users` and `GET /admin/settings`, and shown in listings - but the `permissions` array on `/admin/roles` is not yet checked anywhere.

### Orders, customers, categories

| Method | Path | Body |
|---|---|---|
| GET | `/orders` | `?search= &status= &payment= &page=` |
| GET | `/orders/:id` | |
| PUT | `/orders/:id/status` | `{"status":"completed","paymentStatus":"paid"}` |
| DELETE | `/orders/:id` | |
| GET/POST | `/customers` | `?search= &status= &page=` |
| PUT/DELETE | `/customers/:id` | |
| GET/POST | `/categories` | |
| PUT/DELETE | `/categories/:id` | |

> Marking a deferred order `paid` is what releases its licence keys and downloads.

### Demos

| Method | Path |
|---|---|
| GET | `/demos` — `?search= &platform= &status= &hasApk=` |
| POST | `/demos` (multipart, optional `apk`) |
| PUT | `/demos/:id` |
| POST/DELETE/GET | `/demos/:id/apk` |
| DELETE | `/demos/:id` |

A demo's build is `.apk` or `.ipa`; the route keeps its `apk` name, as do the
`apk_*` columns, because renaming a live column is a retype the boot-time schema
sync will not do. The stored file keeps the extension it arrived with, and the
download is typed from it - `application/vnd.android.package-archive` for an
`.apk`, `application/octet-stream` for an `.ipa`. Note that an `.ipa` served this
way does not install from a browser: iOS needs TestFlight, or an ad-hoc build and
a device on its provisioning profile.

```json
{
  "title": "MoneyPay", "productId": 12,
  "description": "Try the wallet, vendor and rider apps.",
  "platform": "both",
  "webUrl": "https://moneypay.example.com",
  "reviewUrl": "https://moneypay.example.com/review",
  "apkVersion": "1.0.0",
  "visibility": "public",
  "status": "published"
}
```
A demo needs at least one of a web link, a review link or an APK.

### Messages and support tickets

| Method | Path | Body |
|---|---|---|
| GET | `/messages` | `?search= &status= &page=` — returns `messages` **and** `tickets` |
| PUT | `/messages/:id/status` | `{"status":"replied"}` |
| DELETE | `/messages/:id` | |
| **POST** | `/tickets/:id/reply` | `{"message":"..."}` |
| PUT | `/tickets/:id/status` | `{"status":"pending"}` |

`POST /api/admin/tickets/:id/reply` stores the reply, stamps who wrote it, and moves an **open** ticket to **pending** — it is now waiting on the customer:

```json
{ "message": "We reissued the key on your order. It is on your Downloads page now." }
```
```json
{ "ok": true, "status": "pending" }
```
`400 {"error":"Write a reply first."}` · max 4000 characters.

### Email, newsletter and subscribers

| Method | Path | Does |
|---|---|---|
| GET | `/email` | SMTP status, subscribers, delivery log, tallies |
| POST | `/email/test` | Verifies the credentials, then sends one real message |
| POST | `/newsletter` | Sends one newsletter to every **active** subscriber |
| PUT | `/subscribers/:id` | Pause or resume one address |
| DELETE | `/subscribers/:id` | Remove one address permanently |
| GET | `/subscribers/export` | CSV of the whole list |

**Where the credentials live.** Host, port and password are read from `backend/.env` and are
never returned by the API or stored in the database - they are secrets. Only the visible
from-name and from-address are settings (`PUT /api/admin/settings/email`).

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@yourdomain.com
SMTP_PASS=your-app-password
PUBLIC_URL=https://your-store.example
```

With Gmail, `SMTP_PASS` must be an **App Password**, not the account password, and Gmail
rewrites the From header to `SMTP_USER` - so set `email_from_address` to the same mailbox
or recipients will see a mismatch.

**When SMTP is absent nothing is faked.** Every send returns `{ "sent": false, "reason":
"not-configured" }`, is logged with status `skipped`, and the order or subscription it
belonged to still succeeds. A receipt that cannot be sent must never fail a paid order.

`GET /api/admin/email`:
```json
{
  "smtp": { "configured": true, "host": "smtp.gmail.com", "port": 587, "secure": false, "user": "you@yourdomain.com" },
  "subscribers": [
    { "id": 7, "email": "jane@example.com", "isActive": true, "createdAt": "2026-09-10T09:31:00.000Z" }
  ],
  "activeCount": 2,
  "log": [
    { "id": 12, "recipient": "jane@example.com", "subject": "Your SoftFlow licence keys - order SOF123465",
      "kind": "order", "status": "sent", "error": null, "createdAt": "2026-09-10T09:32:10.000Z" }
  ],
  "tally": { "sent": 7, "failed": 0, "skipped": 0 }
}
```

`smtp` is `{ "configured": false }` and nothing else when `SMTP_HOST` is unset.
`kind` is one of `order` · `newsletter` · `test` · `other`; `status` is `sent` · `failed` · `skipped`.

`POST /api/admin/email/test`:
```json
{ "to": "you@yourdomain.com" }
```
Defaults to the signed-in admin's own address when `to` is omitted. Returns `400` with the
SMTP error if the credentials are wrong, `502` if they are right but the message was
rejected, and `{ "ok": true, "to": "..." }` on success.

`POST /api/admin/newsletter`:
```json
{
  "subject": "New release: MoneyPay 2.1 is out",
  "heading": "Email is live",
  "message": "Plain text. Line breaks are kept.\n\nA second paragraph."
}
```
`heading` is optional and falls back to `subject`. Messages go out **one at a time** - a
shared mailbox provider throttles or blocks a burst - so a long list takes a while. The
response counts what happened rather than pretending it all worked:
```json
{ "total": 2, "sent": 2, "failed": 0 }
```
`400` if the subject or message is blank, if SMTP is not configured, or if no subscriber is
active.

**Who receives an announcement.** Both `/newsletter` and `/newsletter/deals` go to active
newsletter subscribers **and** registered customers, deduplicated. An opt-out always wins: a
customer who unsubscribed has a `newsletter_subscribers` row with `is_active = 0`, and that
keeps them out even though they still hold an account. `GET /api/admin/email` returns
`audience: { total, subscribers, customers }` so the console can say who it is about to mail.

Because a customer may never have joined the list, `GET/POST /api/shop/unsubscribe` *inserts*
an opt-out row rather than only updating one - otherwise the update would match nothing and
they would keep receiving mail.

`POST /api/admin/newsletter/deals` announces whatever is discounted right now. Only
products with `announceDiscount` set are included; `GET /api/admin/email` returns the whole
discounted set with an `announce` flag on each, so the console can show which ones the email
will skip. `400` if every discounted product is set not to be announced. It takes
an optional `subject` and `message`; the product list, prices and percentages are read
from the catalogue at send time, so the email cannot advertise a discount that is not
actually loaded. When every discounted product shares one `discountLabel`, that campaign
name becomes the subject - "Black Friday: up to 25% off".

```json
{ "total": 3, "sent": 3, "failed": 0, "deals": 2 }
```

`400` when SMTP is unset, no product is discounted, or no subscriber is active.

`GET /api/admin/subscribers` pages and searches the list: `?page=`, `?q=` (matches the
address), `?status=active|paused`. Eight per page, returning the usual
`{ subscribers, page, pages, total, perPage }`.

This exists so the console never pulls the whole list to draw a panel. `GET /api/admin/email`
returns only the **first page** of subscribers plus `subscriberTotal` and `activeCount`, so
its payload stays flat as the list grows - measured at ~6 KB with 212 subscribers.

`PUT /api/admin/subscribers/:id`:
```json
{ "isActive": false }
```
Pausing is the safe way to stop emailing an address - the row survives, so the history and
the export stay honest. Anything other than `false` resumes.

`GET /api/admin/subscribers/export` returns `text/csv`:
```
Email,Active,Subscribed
"jane@example.com",yes,2026-09-10
```

#### Per-product discounts

A product can carry its own discount, set in the admin product form:

| Field | Meaning |
|---|---|
| `discountPercent` | 0-95. Clamped on write **and** on read, so a stray `500` cannot give the product away. |
| `discountLabel` | Why it is discounted - "Black Friday", "Launch offer". Shown on the card, in the cart and in the deals email. |
| `announceDiscount` | Whether this discount goes out in the deals email. Default `true`. Unticking it keeps the price live on the storefront and leaves the product out of the announcement - a quiet price cut is a normal thing to want. |

This is not the same thing as `comparePrice`, which is a marketing "was" price that
never changed what anyone was charged. A `discountPercent` **does**: `salePrice = price
x (1 - pct/100)`, computed in `store.salePrice()` so the card, the detail page, the cart
and the order row cannot disagree.

Storefront responses therefore return the discounted figure as `price` - what the
customer pays - alongside `listPrice` (the struck-out original, `null` when there is no
discount), `discountPercent` and `discountLabel`.

**The two discounts never stack.** A line whose product carries a discount is excluded
from the cart-level checkout discount, so a payment-method rate cannot be applied on top
of a sale price. `POST /api/shop/cart/price` shows the split:

```json
{
  "subtotal": 135.75,
  "alreadyDiscounted": 36.75,
  "discountableSubtotal": 99.00,
  "discountPercent": 10,
  "discount": 9.90,
  "total": 125.85
}
```

The 10% is charged against `discountableSubtotal`, not `subtotal` - 9.90, not 13.58.
The cart and checkout summaries print both numbers so the figure explains itself.

`GET /api/shop/home` returns discounted products separately as `deals`, rendered as a
**Big Deal Offers** row above Popular Software and ordered best-discount-first. `featured`
is unchanged - a best-seller does not stop being one because it is on offer - so a product
can appear in both.

It appears at the *same price* in both, but only Big Deal Offers shows the offer itself.
Popular Software passes `hideOffer` to `ProductCard`, which drops the badge and the
struck-through original while keeping the price the cart charges - an offer is worth
shouting once, not twice on one screen. `hideOffer` also suppresses the compare-at price
on a discounted card, otherwise it would shout the same saving with different numbers.

---
#### Staying out of the spam folder

Four things decide this, and three of them are handled in code:

| | Handled by |
|---|---|
| **No unreachable links.** A URL pointing at `localhost`, a private IP or a domain that does not resolve is the shape of phishing. With no usable `PUBLIC_URL` the message is sent **without links** rather than with broken ones. | `publicUrl()` in `mailer.js` |
| **`List-Unsubscribe` on bulk mail.** Gmail expects it; a newsletter without one is filed as spam whatever it says. `mailto:` is always sent, and RFC 8058 one-click is added once there is an https address. | `bulkHeaders()` |
| **A `Reply-To` that reaches a person.** Taken from `support_email`. | `send()` |
| **Sender reputation.** A brand-new mailbox has none. It builds as recipients open and reply, and collapses on bounces - which is why fake addresses should be paused, not mailed. | You |

The single highest-value change is setting `PUBLIC_URL` to the live `https://` address:
it restores every link, turns on one-click unsubscribe, and removes the strongest spam
signal in the message. The admin console warns while it is unset.

A plain-text alternative is built per message rather than stripped from the HTML, so the
two parts agree and a plain-text reader still gets every licence key.

---
#### What the store sends on its own

| Trigger | Kind | Goes to |
|---|---|---|
| `POST /api/shop/checkout` settles as `paid` | `order` | The buyer - itemised total plus every licence key and its expiry |
| `PUT /api/admin/orders/:id/status` moves a pending order to paid | `order` | The buyer - same message, once the transfer or cash is confirmed |
| `POST /api/shop/subscribe` | `newsletter` | The new subscriber - a short welcome |

Setting `email_order_confirmation` to `"0"` (Settings → Email) stops the receipt without
touching anything else - the order is still paid, the keys are still issued, and the skip
is returned as `{ "sent": false, "reason": "disabled-in-settings" }`.

Sends are fired **after** the response and their outcome is only logged, so a mail failure
can never roll back an order or a sign-up.

---

### Settings, roles, reports

| Method | Path |
|---|---|
| GET | `/settings` |
| PUT | `/settings/:group` — `general` \| `payment` \| `email` |
| GET/POST | `/roles` · PUT/DELETE `/roles/:id` |
| GET | `/reports` — `?range=30` days |
| GET | `/dashboard` |

`PUT /api/admin/settings/general` writes **only the keys present in the body**, so one panel cannot clobber another:

```json
{ "site_name": "SoftFlow", "site_tagline": "Software for a smarter tomorrow" }
```

Licence terms for the product dropdown are one setting, newline-separated:
```json
{ "licence_terms": "Lifetime\n1 Year Subscription\n2 Year Subscription\nMonthly Subscription" }
```

`GET /api/admin/dashboard`:
```json
{
  "kpis": {
    "revenue": 7230, "revenueDelta": 254,
    "orders": 72, "ordersDelta": 118,
    "customers": 8, "customersDelta": 14,
    "products": 9
  },
  "revenueSeries": [{ "month": "Oct", "value": 430 }],
  "recentOrders": [], "topProducts": [], "activity": [],
  "badges": { "pendingOrders": 22, "newMessages": 2 }
}
```

---

## 7. Static and binary

| Path | Returns |
|---|---|
| `GET /api/shop/review-images/:file` | image bytes — `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox` |
| `GET /api/shop/demos/:id/apk` | public mobile build, increments `downloadCount` |
| `GET /api/account/downloads/file/:id` | entitlement-gated file, or a redirect to `externalUrl` |
| `GET /api/account/downloads/demo/:id/apk` | mobile build for signed-in customers |
| `GET /api/admin/demos/:id/apk` | admin copy, no download counted |

Uploaded images are served with a sandbox CSP so an SVG cannot execute script in the site's origin.

---

## 8. Testing

`api-samples.json` beside this file holds a **real captured response for every readable endpoint** — not hand-written examples. Regenerate it any time:

```bash
node backend/tools/capture-api.js          # writes api-samples.json
```

A five-minute smoke test:

```bash
BASE=http://localhost:4000/api

# public
curl -s $BASE/shop/products?page=1 | head -c 300
curl -s $BASE/shop/products/moneypay | head -c 300

# customer
curl -s -c u.txt -H 'Content-Type: application/json' \
  -d '{"email":"john@example.com","password":"user123"}' $BASE/auth/login
curl -s -b u.txt $BASE/account/downloads | head -c 300

# entitlement: expect 200, 403, 403
for id in 7 8 9; do
  curl -s -o /dev/null -w "file $id -> %{http_code}\n" -b u.txt $BASE/account/downloads/file/$id
done

# admin, the short way - Basic auth, no login call
curl -s -u 'admin@softflow.com:admin123' $BASE/admin/dashboard | head -c 300

# create another admin
curl -s -u 'admin@softflow.com:admin123' -H 'Content-Type: application/json' \
  -d '{"name":"Grace Lado","email":"grace@softflow.com","password":"grace-admin-2026","role":"admin"}' \
  $BASE/admin/users
```

### Things worth asserting

| Check | Expected |
|---|---|
| Guest hits `/account/*` | `401` |
| Customer hits `/admin/*` | `403` |
| Cart price is trusted from the client | it is not — the server re-prices every line |
| Package file, wrong tier | `403` |
| File for an expired licence | `403` |
| Lifetime licence | never expiry-blocked |
| Deferred payment (`cash`, `bank_transfer`) | order `pending`, **no** licence keys until marked paid |
| Agency package, `licenseCount: 10` | 10 licence keys issued |
| `PUT /admin/products/:id` with one field | only that field changes |
| Basic auth, suspended account | `401` |
| Basic auth, customer on `/admin/*` | `403` |
| `POST /admin/users`, admin with a 6-char password | `400` |
| `POST /admin/users`, duplicate email | `409` |
| Same cart, `paymentMethod: "cash"` vs `"card"` | different totals when their rates differ |
| Checkout with a spoofed `total` in the body | ignored; server re-prices |
