-- ============================================================
--  SoftFlow  (database: junubsoftflow)
--  Buy Software Online - Fast, Secure, and Easy
-- ============================================================

CREATE DATABASE IF NOT EXISTS junubsoftflow
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE junubsoftflow;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS demo_downloads;
DROP TABLE IF EXISTS demos;
DROP TABLE IF EXISTS email_log;
DROP TABLE IF EXISTS download_log;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS product_files;
DROP TABLE IF EXISTS package_features;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS license_features;
DROP TABLE IF EXISTS addons;
DROP TABLE IF EXISTS licenses;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS product_features;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS newsletter_subscribers;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS settings;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- roles & permissions -----------------------------------
CREATE TABLE roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL UNIQUE,
  slug        VARCHAR(60)  NOT NULL UNIQUE,
  description VARCHAR(200) NULL,
  permissions JSON NULL COMMENT 'e.g. ["view","edit","delete"]',
  is_system   TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- users ---------------------------------------------------
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','staff','admin') NOT NULL DEFAULT 'customer',
  role_id       INT NULL,
  phone         VARCHAR(40)  NULL,
  company       VARCHAR(120) NULL,
  country       VARCHAR(80)  NULL,
  city          VARCHAR(80)  NULL,
  status        ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- categories ----------------------------------------------
CREATE TABLE categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  description VARCHAR(200) NULL,
  icon        VARCHAR(40)  NOT NULL DEFAULT 'box',
  accent      VARCHAR(20)  NOT NULL DEFAULT 'blue',
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- products (the software being sold) ------------------------
CREATE TABLE products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(140) NOT NULL,
  slug          VARCHAR(140) NOT NULL UNIQUE,
  category_id   INT NULL,
  sku           VARCHAR(40)  NULL UNIQUE,
  vendor        VARCHAR(80)  NULL,
  short_desc    VARCHAR(220) NULL,
  description   TEXT NULL,
  price         DECIMAL(10,2) NOT NULL DEFAULT 0,
  pricing_mode  ENUM('simple','packages') NOT NULL DEFAULT 'simple'
                COMMENT 'simple = one price; packages = tiered licence packages',
  compare_price DECIMAL(10,2) NULL COMMENT 'original price, for the Save % badge',
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0
                COMMENT 'active per-product discount; such a line is excluded from the cart-level checkout discount',
  discount_label VARCHAR(60) NULL COMMENT 'why it is discounted, shown on the card and in the deals email',
  announce_discount TINYINT(1) NOT NULL DEFAULT 1
                COMMENT 'whether this discount goes out in the deals announcement email',
  stock         INT NOT NULL DEFAULT 0,
  licence_term  VARCHAR(60) NULL COMMENT 'e.g. 1 Year Subscription',
  platforms     VARCHAR(120) NULL COMMENT 'e.g. Windows & Mac',
  badge         VARCHAR(30)  NULL,
  icon          VARCHAR(40)  NOT NULL DEFAULT 'box' COMMENT 'fallback when no image is uploaded',
  accent        VARCHAR(20)  NOT NULL DEFAULT 'blue' COMMENT 'tint behind the fallback icon',
  image         VARCHAR(255) NULL COMMENT 'stored product image filename',
  rating        DECIMAL(2,1) NOT NULL DEFAULT 0,
  review_count  INT NOT NULL DEFAULT 0,
  is_featured   TINYINT(1) NOT NULL DEFAULT 0,
  status        ENUM('active','draft','archived') NOT NULL DEFAULT 'active',
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_prod_status (status),
  INDEX idx_prod_cat (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- product feature bullets ------------------------------------
CREATE TABLE product_features (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  label      VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_pf_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_pf_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- reviews -----------------------------------------------------
CREATE TABLE reviews (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id    INT NULL,
  author     VARCHAR(120) NOT NULL,
  rating     TINYINT NOT NULL DEFAULT 5,
  title      VARCHAR(160) NULL,
  body       TEXT NULL,
  images     JSON NULL COMMENT 'array of stored image filenames, shown in the review slider',
  status     ENUM('published','pending','hidden') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rev_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_rev_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- orders --------------------------------------------------------
CREATE TABLE orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_number   VARCHAR(24) NOT NULL UNIQUE COMMENT 'e.g. SOF123456',
  user_id        INT NULL,
  customer_name  VARCHAR(120) NOT NULL,
  customer_email VARCHAR(160) NOT NULL,
  customer_phone VARCHAR(40)  NULL,
  subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method ENUM('card','paypal','mobile_money','bank_transfer','cash') NOT NULL DEFAULT 'card',
  payment_status ENUM('paid','pending','failed','refunded') NOT NULL DEFAULT 'paid',
  status         ENUM('pending','processing','completed','cancelled') NOT NULL DEFAULT 'completed',
  notes          VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_status (status),
  INDEX idx_order_created (created_at),
  INDEX idx_order_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  product_id   INT NULL,
  package_id   INT NULL COMMENT 'set when a tiered package was bought',
  addon_id     INT NULL COMMENT 'set when a premium add-on was bought',
  license_type VARCHAR(20) NULL,
  product_name VARCHAR(140) NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  quantity     INT NOT NULL DEFAULT 1,
  line_total   DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_oi_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- licence keys issued on purchase --------------------------------
CREATE TABLE licenses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT NULL,
  order_id      INT NOT NULL,
  product_id    INT NULL,
  user_id       INT NULL,
  license_key   VARCHAR(60) NOT NULL UNIQUE,
  status        ENUM('active','expired','revoked') NOT NULL DEFAULT 'active',
  issued_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATE NULL,
  CONSTRAINT fk_lic_item  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_lic_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_lic_prod  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_lic_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_lic_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- tiered pricing packages -----------------------------------------
CREATE TABLE packages (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  product_id    INT NOT NULL,
  license_type  ENUM('regular','extended','agency') NOT NULL DEFAULT 'regular',
  name          VARCHAR(80) NOT NULL,
  tagline       VARCHAR(180) NULL,
  price         DECIMAL(10,2) NOT NULL DEFAULT 0,
  compare_price DECIMAL(10,2) NULL,
  license_count INT NOT NULL DEFAULT 1,
  is_popular    TINYINT(1) NOT NULL DEFAULT 0,
  cta_label     VARCHAR(40) NOT NULL DEFAULT 'Buy Now',
  status        ENUM('active','draft') NOT NULL DEFAULT 'active',
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pkg_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_pkg_product (product_id, license_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- the tick-lists inside a package card
CREATE TABLE package_features (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  section    ENUM('included','addons','benefits') NOT NULL DEFAULT 'included',
  label      VARCHAR(160) NOT NULL,
  included   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_pkgf_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX idx_pkgf_package (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- the "Which License to Purchase?" comparison matrix
CREATE TABLE license_features (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_id   INT NOT NULL,
  license_type ENUM('regular','extended','agency') NOT NULL DEFAULT 'regular',
  label        VARCHAR(160) NOT NULL,
  included     TINYINT(1) NOT NULL DEFAULT 1,
  sort_order   INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_lf_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_lf_product (product_id, license_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- premium add-ons, priced per licence type -------------------------
CREATE TABLE addons (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     INT NOT NULL,
  name           VARCHAR(140) NOT NULL,
  description    VARCHAR(220) NULL,
  regular_price  DECIMAL(10,2) NULL,
  extended_price DECIMAL(10,2) NULL,
  status         ENUM('active','draft') NOT NULL DEFAULT 'active',
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addon_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_addon_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- downloadable builds attached to a product ----------------------
-- Admin uploads installers / APK builds here; buyers get them under Downloads.
CREATE TABLE product_files (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_id   INT NULL COMMENT 'set when the file belongs to a product',
  package_id   INT NULL COMMENT 'set when the file ships only with one pricing package',
  addon_id     INT NULL COMMENT 'set when the file belongs to a premium add-on',
  label        VARCHAR(120) NOT NULL,
  kind         ENUM('installer','source','apk','document') NOT NULL DEFAULT 'installer',
  platform     ENUM('windows','mac','linux','android','ios','web') NOT NULL DEFAULT 'windows',
  version      VARCHAR(40) NULL,
  file_name    VARCHAR(255) NULL COMMENT 'stored filename under storage/',
  original_name VARCHAR(255) NULL,
  file_size    BIGINT NULL,
  external_url VARCHAR(500) NULL COMMENT 'used when the build is hosted elsewhere',
  download_count INT NOT NULL DEFAULT 0,
  requires_purchase TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pfile_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfile_addon FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfile_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX idx_pfile_product (product_id),
  INDEX idx_pfile_package (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- product preview screenshots (the storefront "Preview" slider) -----
CREATE TABLE product_images (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  product_id    INT NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NULL,
  caption       VARCHAR(180) NULL,
  file_size     BIGINT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pimg_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_pimg_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE download_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  file_id    INT NULL,
  demo_id    INT NULL,
  user_id    INT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- demos: admin-published review links + APK builds ---------------
CREATE TABLE demos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(140) NOT NULL,
  slug          VARCHAR(140) NOT NULL UNIQUE,
  product_id    INT NULL,
  description   TEXT NULL,
  platform      ENUM('web','desktop','windows','mac','linux','android','ios','mobile','both')
                NOT NULL DEFAULT 'web',
  web_url       VARCHAR(500) NULL COMMENT 'live demo link',
  review_url    VARCHAR(500) NULL COMMENT 'review / walkthrough link',
  apk_file      VARCHAR(255) NULL COMMENT 'the Android build; named apk_* since before iOS was supported',
  apk_name      VARCHAR(255) NULL,
  apk_size      BIGINT NULL,
  apk_version   VARCHAR(40)  NULL,
  apk_uploaded_at DATETIME NULL,
  ios_file      VARCHAR(255) NULL COMMENT 'the iOS build (.ipa); a demo can carry both at once',
  ios_name      VARCHAR(255) NULL,
  ios_size      BIGINT NULL,
  ios_version   VARCHAR(40)  NULL,
  ios_uploaded_at DATETIME NULL,
  visibility    ENUM('public','users') NOT NULL DEFAULT 'public',
  status        ENUM('published','draft') NOT NULL DEFAULT 'published',
  download_count INT NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  created_by    INT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_demo_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_demo_author  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_demo_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- support tickets -------------------------------------------------
CREATE TABLE support_tickets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  order_id   INT NULL,
  subject    VARCHAR(180) NOT NULL,
  message    TEXT NOT NULL,
  admin_reply TEXT NULL COMMENT 'reply written by an admin, shown to the customer',
  replied_at DATETIME NULL,
  replied_by INT NULL,
  status     ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tick_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tick_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_tick_replier FOREIGN KEY (replied_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tick_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- contact messages -------------------------------------------------
CREATE TABLE contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(160) NOT NULL,
  subject    VARCHAR(180) NULL,
  message    TEXT NOT NULL,
  status     ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- newsletter --------------------------------------------------------
CREATE TABLE newsletter_subscribers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(160) NOT NULL UNIQUE,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- outgoing email, so an admin can see what actually went out ----------
CREATE TABLE email_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  recipient  VARCHAR(160) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  kind       ENUM('order','newsletter','test','support','other') NOT NULL DEFAULT 'other',
  status     ENUM('sent','failed','skipped') NOT NULL,
  error      VARCHAR(300) NULL COMMENT 'why it did not go, when it did not',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_log_kind (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- activity log --------------------------------------------------------
CREATE TABLE activity_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  type       VARCHAR(40) NOT NULL,
  message    VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- settings ------------------------------------------------------------
CREATE TABLE settings (
  setting_key   VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  setting_group VARCHAR(40) NOT NULL DEFAULT 'general',
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
