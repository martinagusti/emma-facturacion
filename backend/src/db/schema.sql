CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  role ENUM('admin', 'comercial', 'usuario') NOT NULL DEFAULT 'usuario',
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  pending_activation TINYINT(1) NOT NULL DEFAULT 0,
  display_name VARCHAR(255) NOT NULL,
  commercial_name VARCHAR(255) NULL,
  created_by_email VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commercials (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_commercials_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(64) NULL,
  billing_day INT NULL,
  responsible_name VARCHAR(255) NULL,
  default_payment_method VARCHAR(64) NULL,
  start_date DATE NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_clients_responsible (responsible_name),
  KEY idx_clients_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_services (
  client_id VARCHAR(64) NOT NULL,
  service_key VARCHAR(64) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  billing_period ENUM('unico', 'mensual', 'anual') NOT NULL DEFAULT 'unico',
  service_status ENUM('pendiente', 'facturaEnviada', 'pagado', 'cancelado') NOT NULL DEFAULT 'pendiente',
  payment_method VARCHAR(64) NULL,
  service_date DATE NULL,
  custom_label VARCHAR(255) NULL,
  start_month CHAR(7) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, service_key),
  KEY idx_client_services_key (service_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  client_id VARCHAR(64) NOT NULL,
  month_key CHAR(7) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pendiente', 'facturaEnviada', 'pagado', 'cancelado') NOT NULL DEFAULT 'pendiente',
  payment_method VARCHAR(64) NULL,
  paid_date DATE NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, month_key),
  KEY idx_payments_month (month_key),
  KEY idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_service_statuses (
  client_id VARCHAR(64) NOT NULL,
  month_key CHAR(7) NOT NULL,
  service_key VARCHAR(64) NOT NULL,
  status ENUM('pendiente', 'facturaEnviada', 'pagado', 'cancelado') NOT NULL DEFAULT 'pendiente',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, month_key, service_key),
  KEY idx_payment_service_status_key (service_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  client_id VARCHAR(64) NULL,
  service_key VARCHAR(64) NOT NULL,
  concept VARCHAR(255) NULL,
  description TEXT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pendiente', 'facturaEnviada', 'pagado', 'cancelado') NOT NULL DEFAULT 'pendiente',
  issue_date DATE NULL,
  due_date DATE NULL,
  month_key CHAR(7) NULL,
  payment_day INT NULL,
  billing_period ENUM('unico', 'mensual', 'anual') NOT NULL DEFAULT 'unico',
  billing_duration VARCHAR(32) NULL,
  payment_method VARCHAR(64) NULL,
  responsible_name VARCHAR(255) NULL,
  service_keys_json JSON NULL,
  pack_price_mode VARCHAR(32) NULL,
  pack_items_json JSON NULL,
  split_group_id VARCHAR(64) NULL,
  split_index INT NULL,
  split_total INT NULL,
  project_total DECIMAL(12,2) NULL,
  recurrence_root_id VARCHAR(64) NULL,
  source_invoice_id VARCHAR(64) NULL,
  origin_key VARCHAR(191) NULL,
  cancel_after_month CHAR(7) NULL,
  paid_at DATE NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_invoices_client_id (client_id),
  KEY idx_invoices_month_key (month_key),
  KEY idx_invoices_status (status),
  KEY idx_invoices_origin_key (origin_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deleted_client_snapshots (
  client_id VARCHAR(64) NOT NULL PRIMARY KEY,
  client_json LONGTEXT NOT NULL,
  payments_json LONGTEXT NOT NULL,
  deleted_at DATETIME NOT NULL,
  deleted_by_email VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_deleted_clients_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
